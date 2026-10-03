'use strict'

const crypto = require('crypto')
const Y = require('yjs')

// Each file in a room is one Yjs document holding a single Y.Text. Yjs is a CRDT:
// concurrent edits from many users merge deterministically on every replica, so two
// people typing at the same position never overwrite each other. The server keeps an
// authoritative copy (so late joiners can be sent the full state) and relays updates.
const TEXT_KEY = 'code'

// The default file's initial insert is made with a FIXED Yjs client id, so every
// server process produces byte-identical history for it. After a restart the fresh
// default file merges idempotently with the copy clients still hold, instead of
// duplicating its text.
const DEFAULT_DOC_CLIENT_ID = 1
const DEFAULT_CODE = '# Start coding here...\nprint("Your next big idea starts right here.")'

function randomClientId() {
  return crypto.randomInt(2, 2 ** 31)
}

function newDocWithText(text, fixedClientId) {
  const doc = new Y.Doc()
  if (fixedClientId !== undefined) doc.clientID = fixedClientId
  if (text) doc.getText(TEXT_KEY).insert(0, text)
  doc.clientID = randomClientId() // later server-side edits (e.g. truncation) must not reuse the fixed id
  return doc
}

function defaultFile() {
  return { id: '1', name: 'main.py', language: 'python', doc: newDocWithText(DEFAULT_CODE, DEFAULT_DOC_CLIENT_ID) }
}

const textOf = (doc) => doc.getText(TEXT_KEY).toString()

class Room {
  constructor(id) {
    this.id = id
    // Changes whenever the server (re)creates this room from scratch. Clients that notice
    // a different epoch know the server lost its state and re-upload what they hold.
    this.epoch = crypto.randomBytes(6).toString('hex')
    this.clients = new Set() // every open socket in the room
    this.users = new Map() // socket -> { name, color } (only sockets that sent a valid join)
    this.files = [defaultFile()] // [{ id, name, language, doc }]
    this.cleanupTimer = null
  }
}

// All room state lives in process memory. Rooms are removed `emptyRoomTtlMs` after the
// last client leaves, so abandoned rooms do not leak memory but a brief disconnect
// (refresh, network blip) does not wipe the workspace.
class RoomStore {
  constructor({
    emptyRoomTtlMs = 10 * 60 * 1000,
    maxClientsPerRoom = 50,
    maxFilesPerRoom = 50,
    maxCodeChars = 200_000,
  } = {}) {
    this.emptyRoomTtlMs = emptyRoomTtlMs
    this.maxClientsPerRoom = maxClientsPerRoom
    this.maxFilesPerRoom = maxFilesPerRoom
    this.maxCodeChars = maxCodeChars
    this.rooms = new Map()
  }

  get size() {
    return this.rooms.size
  }

  get(id) {
    return this.rooms.get(id)
  }

  _destroyRoom(room) {
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer)
    for (const f of room.files) f.doc.destroy()
    this.rooms.delete(room.id)
  }

  addClient(id, ws) {
    let room = this.rooms.get(id)
    if (!room) {
      room = new Room(id)
      this.rooms.set(id, room)
    }
    if (room.clients.size >= this.maxClientsPerRoom) return { ok: false, reason: 'room-full' }
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer)
      room.cleanupTimer = null
    }
    room.clients.add(ws)
    return { ok: true, room }
  }

  removeClient(id, ws) {
    const room = this.rooms.get(id)
    if (!room) return
    room.clients.delete(ws)
    room.users.delete(ws)
    if (room.clients.size === 0 && !room.cleanupTimer) {
      room.cleanupTimer = setTimeout(() => {
        if (room.clients.size === 0) this._destroyRoom(room)
      }, this.emptyRoomTtlMs)
      room.cleanupTimer.unref?.()
    }
  }

  // Returns the socket currently registered under `name`, or null.
  findByName(room, name) {
    for (const [ws, u] of room.users) if (u.name === name) return ws
    return null
  }

  // Snapshot sent to every connecting client: metadata plus the full Yjs state of each file.
  snapshot(room) {
    return room.files.map((f) => ({
      id: f.id,
      name: f.name,
      language: f.language,
      code: textOf(f.doc), // plain text, for display only; ystate is authoritative
      ystate: Buffer.from(Y.encodeStateAsUpdate(f.doc)).toString('base64'),
    }))
  }

  // Applies a client's Yjs update. Returns { ok, reason } or { ok: true, broadcastAll, update }.
  // A malformed update is rejected without touching the document.
  applyUpdate(room, fileId, update) {
    const f = room.files.find((x) => x.id === fileId)
    if (!f) return { ok: false, reason: 'unknown-file' }
    const before = Y.encodeStateVector(f.doc)
    try {
      Y.applyUpdate(f.doc, update, 'client')
    } catch {
      return { ok: false, reason: 'invalid-update' }
    }
    const text = f.doc.getText(TEXT_KEY)
    if (text.length > this.maxCodeChars) {
      // Enforce the per-file size cap: trim the excess, and tell EVERYONE (sender included)
      // about the combined result so all replicas stay identical.
      f.doc.transact(() => text.delete(this.maxCodeChars, text.length - this.maxCodeChars), 'server')
      return { ok: true, broadcastAll: true, update: Y.encodeStateAsUpdate(f.doc, before) }
    }
    return { ok: true, broadcastAll: false, update }
  }

  // file: { id, name, language, ystate?: Uint8Array, code?: string }
  // returns 'added' | 'exists' | 'limit' | 'invalid' | 'too-large'
  addFile(room, file) {
    if (room.files.some((f) => f.id === file.id)) return 'exists'
    if (room.files.length >= this.maxFilesPerRoom) return 'limit'
    const doc = new Y.Doc()
    if (file.ystate) {
      try {
        Y.applyUpdate(doc, file.ystate, 'client')
      } catch {
        doc.destroy()
        return 'invalid'
      }
    } else if (file.code) {
      doc.getText(TEXT_KEY).insert(0, file.code)
    }
    if (doc.getText(TEXT_KEY).length > this.maxCodeChars) {
      doc.destroy()
      return 'too-large'
    }
    room.files.push({ id: file.id, name: file.name, language: file.language, doc })
    return 'added'
  }

  // A room always keeps at least one file.
  removeFile(room, fileId) {
    if (room.files.length <= 1) return false
    const idx = room.files.findIndex((f) => f.id === fileId)
    if (idx === -1) return false
    const [removed] = room.files.splice(idx, 1)
    removed.doc.destroy()
    return true
  }

  setLanguage(room, fileId, language, name) {
    const f = room.files.find((x) => x.id === fileId)
    if (!f) return false
    f.language = language
    if (name) f.name = name
    return true
  }

  close() {
    for (const room of [...this.rooms.values()]) this._destroyRoom(room)
  }
}

module.exports = { RoomStore, TEXT_KEY, textOf }
