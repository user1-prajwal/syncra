'use strict'

const WebSocket = require('ws')
const { createCollabServer } = require('../app')

async function startServer(options = {}) {
  const collab = createCollabServer({ heartbeatMs: 60000, ...options })
  const port = await collab.listen(0)
  return { collab, port, http: `http://127.0.0.1:${port}`, stop: () => collab.close() }
}

// Opens a WebSocket client that records every message it receives.
function connect(port, room = 'ROOM01', wsOptions = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${room}`, wsOptions)
    const msgs = []
    const closed = new Promise((res) => ws.on('close', (code) => res(code)))
    ws.on('message', (m) => msgs.push(JSON.parse(m.toString())))
    ws.on('error', reject)

    const client = {
      ws,
      msgs,
      closed,
      send: (obj) => ws.send(JSON.stringify(obj)),
      sendRaw: (s) => ws.send(s),
      close: () => ws.close(),
      waitFor(pred, timeout = 2000) {
        return new Promise((res, rej) => {
          const hit = msgs.find(pred)
          if (hit) return res(hit)
          const t = setTimeout(() => {
            ws.off('message', on)
            rej(new Error('timeout; received types: ' + JSON.stringify(msgs.map((m) => m.type))))
          }, timeout)
          const on = () => {
            const f = msgs.find(pred)
            if (f) {
              clearTimeout(t)
              ws.off('message', on)
              res(f)
            }
          }
          ws.on('message', on)
        })
      },
      async join(name, color = '#4ECDC4') {
        client.send({ type: 'join', name, color })
        await client.waitFor((m) => m.type === 'userlist' && m.users.some((u) => u.name === name))
        return client
      },
      count: (type) => msgs.filter((m) => m.type === type).length,
    }
    ws.on('open', () => resolve(client))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = { startServer, connect, sleep }

// ── Yjs replica helper ───────────────────────────────────────────────────────
// A small Node replica of what the browser does with Yjs: one Y.Doc per file, apply what the
// server sends, send local edits as `yupdate`, and merge the server snapshot on (re)connect,
// uploading whatever the server is missing.
const Y = require('yjs')
const b64 = (u8) => Buffer.from(u8).toString('base64')
const fromB64 = (s) => new Uint8Array(Buffer.from(s, 'base64'))

function yReplica(initialClient, myName = null) {
  const docs = new Map()
  const pending = new Map() // fileId -> server state we merged; local-only edits are uploaded once our join is confirmed
  const replica = {
    docs,
    pending,
    client: initialClient,
    attach(id, doc) {
      doc.on('update', (u, origin) => {
        if (origin !== 'remote' && replica.client.ws.readyState === 1)
          replica.client.send({ type: 'yupdate', fileId: id, update: b64(u) })
      })
    },
    handle(m) {
      if (m.type === 'init') replica.mergeInit(m.files)
      else if (m.type === 'newfile') replica.applyState(m.file.id, m.file.ystate)
      else if (m.type === 'yupdate') {
        const d = docs.get(m.fileId)
        if (d) Y.applyUpdate(d, fromB64(m.update), 'remote')
      } else if (m.type === 'deletefile') {
        docs.get(m.fileId)?.destroy()
        docs.delete(m.fileId)
      } else if (m.type === 'userlist' && pending.size && (!myName || m.users.some((u) => u.name === myName))) {
        replica.flush()
      }
    },
    applyState(id, ystate) {
      let doc = docs.get(id)
      const isNew = !doc
      if (isNew) {
        doc = new Y.Doc()
        replica.attach(id, doc)
        docs.set(id, doc)
      }
      if (ystate) {
        const state = fromB64(ystate)
        Y.applyUpdate(doc, state, 'remote')
        if (!isNew) pending.set(id, state)
      }
    },
    // Upload to the server whatever it is missing, computed against the snapshot we merged.
    flush() {
      for (const [id, state] of pending) {
        const doc = docs.get(id)
        if (!doc || replica.client.ws.readyState !== 1) continue
        const diff = Y.encodeStateAsUpdate(doc, Y.encodeStateVectorFromUpdate(state))
        if (diff.length > 2) replica.client.send({ type: 'yupdate', fileId: id, update: b64(diff) })
      }
      pending.clear()
    },
    mergeInit(files) {
      const seen = new Set(files.map((f) => f.id))
      for (const f of files) replica.applyState(f.id, f.ystate)
      for (const id of [...docs.keys()]) if (!seen.has(id)) { docs.get(id).destroy(); docs.delete(id); pending.delete(id) }
      if (!myName) replica.flush()
    },
    text: (id) => docs.get(id).getText('code').toString(),
    insert: (id, index, str) => docs.get(id).getText('code').insert(index, str),
    delete: (id, index, len) => docs.get(id).getText('code').delete(index, len),
    // create a file locally (as the UI does) and announce it with its Yjs state
    createFile(id, name, code = '', language = 'python') {
      const doc = new Y.Doc()
      if (code) doc.getText('code').insert(0, code)
      replica.attach(id, doc)
      docs.set(id, doc)
      replica.client.send({ type: 'newfile', file: { id, name, language, ystate: b64(Y.encodeStateAsUpdate(doc)) } })
      return doc
    },
  }
  // Point this replica at a (new) connection: replay what it already received, then follow it.
  replica.use = (c) => {
    replica.client = c
    for (const m of c.msgs) replica.handle(m)
    c.ws.on('message', (raw) => replica.handle(JSON.parse(raw.toString())))
  }
  replica.use(initialClient)
  return replica
}

// resolves once the replica's text for `id` equals `expected` (or throws)
async function waitText(replica, id, expected, timeout = 3000) {
  const t = Date.now()
  while (Date.now() - t < timeout) {
    if (replica.docs.has(id) && replica.text(id) === expected) return
    await sleep(15)
  }
  throw new Error(`replica text for ${id} was ${JSON.stringify(replica.docs.has(id) ? replica.text(id) : '<no doc>')}, expected ${JSON.stringify(expected)}`)
}

// resolves once all replicas hold identical text for `id`; returns it
async function waitConverged(replicas, id, timeout = 5000) {
  const t = Date.now()
  let texts
  while (Date.now() - t < timeout) {
    texts = replicas.map((r) => (r.docs.has(id) ? r.text(id) : null))
    if (texts.every((x) => x !== null && x === texts[0])) return texts[0]
    await sleep(25)
  }
  throw new Error('replicas did not converge: ' + JSON.stringify(texts))
}

Object.assign(module.exports, { yReplica, waitText, waitConverged, b64, fromB64, Y })
