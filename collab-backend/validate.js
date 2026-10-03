'use strict'

// Every message from a client is untrusted. parseMessage() either returns a
// cleaned message containing ONLY whitelisted fields, or a rejection reason.
// The server never relays raw client text, so a client cannot spoof server-only
// message types (users, userlist, init, ...) or other users' identities.

const DEFAULT_LIMITS = {
  maxCodeChars: 200_000,
  maxUpdateChars: 700_000, // base64 length of one Yjs update / file state
  maxFileNameChars: 100,
  maxChatChars: 1000,
  maxNameChars: 20,
  maxIdChars: 64,
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/
const LANGUAGE_RE = /^[a-z0-9+#-]{1,32}$/i
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isString = (v) => typeof v === 'string'
const isPosInt = (v) => Number.isInteger(v) && v >= 1 && v <= 10_000_000

const ok = (msg) => ({ ok: true, msg })
const bad = (reason) => ({ ok: false, reason })

function validId(v, limits) {
  return isString(v) && v.length >= 1 && v.length <= limits.maxIdChars
}

function validBase64(v, limits) {
  return isString(v) && v.length >= 1 && v.length <= limits.maxUpdateChars && BASE64_RE.test(v)
}

const VALIDATORS = {
  join(d, limits) {
    if (!isString(d.name)) return bad('invalid-name')
    const name = d.name.trim()
    if (name.length < 1 || name.length > limits.maxNameChars) return bad('invalid-name')
    if (!isString(d.color) || !COLOR_RE.test(d.color)) return bad('invalid-color')
    // clientId is a random per-tab secret that lets a reconnecting tab reclaim its own name.
    // It is stored on the socket only and never broadcast.
    if (d.clientId !== undefined && (!isString(d.clientId) || !CLIENT_ID_RE.test(d.clientId)))
      return bad('invalid-client-id')
    return ok({ type: 'join', name, color: d.color, clientId: d.clientId })
  },

  // A binary Yjs update (base64) for one file's document. This is the only way text changes.
  yupdate(d, limits) {
    if (!validId(d.fileId, limits)) return bad('invalid-file-id')
    if (!validBase64(d.update, limits)) return bad('invalid-update')
    const msg = { type: 'yupdate', fileId: d.fileId, update: d.update }
    if (typeof d.sentAt === 'number' && Number.isFinite(d.sentAt)) msg.sentAt = d.sentAt // latency benchmark only
    return ok(msg)
  },

  newfile(d, limits) {
    const f = d.file
    if (!isObject(f)) return bad('invalid-file')
    if (!validId(f.id, limits)) return bad('invalid-file-id')
    if (!isString(f.name) || f.name.trim().length < 1 || f.name.length > limits.maxFileNameChars)
      return bad('invalid-file-name')
    if (!isString(f.language) || !LANGUAGE_RE.test(f.language)) return bad('invalid-language')
    // The creating client supplies the file's initial content as a Yjs document state, so the
    // whole room shares one history for it. Plain `code` is accepted as a fallback.
    const file = { id: f.id, name: f.name.trim(), language: f.language }
    if (f.ystate !== undefined) {
      if (!validBase64(f.ystate, limits)) return bad('invalid-update')
      file.ystate = f.ystate
    } else if (f.code !== undefined) {
      if (!isString(f.code) || f.code.length > limits.maxCodeChars) return bad('code-too-large')
      file.code = f.code
    }
    return ok({ type: 'newfile', file })
  },

  deletefile(d, limits) {
    if (!validId(d.fileId, limits)) return bad('invalid-file-id')
    return ok({ type: 'deletefile', fileId: d.fileId })
  },

  language(d, limits) {
    if (!validId(d.fileId, limits)) return bad('invalid-file-id')
    if (!isString(d.language) || !LANGUAGE_RE.test(d.language)) return bad('invalid-language')
    const msg = { type: 'language', fileId: d.fileId, language: d.language }
    if (d.name !== undefined) {
      if (!isString(d.name) || d.name.trim().length < 1 || d.name.length > limits.maxFileNameChars)
        return bad('invalid-file-name')
      msg.name = d.name.trim()
    }
    return ok(msg)
  },

  chat(d, limits) {
    if (!isString(d.text)) return bad('invalid-text')
    const text = d.text.trim()
    if (text.length < 1 || text.length > limits.maxChatChars) return bad('invalid-text')
    const msg = { type: 'chat', text }
    if (isString(d.time) && d.time.length <= 16) msg.time = d.time
    return ok(msg)
  },

  cursor(d) {
    if (!isPosInt(d.line) || !isPosInt(d.column)) return bad('invalid-cursor')
    return ok({ type: 'cursor', line: d.line, column: d.column })
  },

  'cursor-stop'() {
    return ok({ type: 'cursor-stop' })
  },
}

function parseMessage(raw, limits = DEFAULT_LIMITS) {
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return bad('invalid-json')
  }
  if (!isObject(data) || !isString(data.type)) return bad('invalid-shape')
  // Object.hasOwn: a message with type "__proto__" or "constructor" must not match.
  if (!Object.hasOwn(VALIDATORS, data.type)) return bad('unknown-type')
  return VALIDATORS[data.type](data, limits)
}

module.exports = { parseMessage, DEFAULT_LIMITS }
