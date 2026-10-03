'use strict'

const http = require('http')
const express = require('express')
const { rateLimit } = require('express-rate-limit')
const { WebSocketServer } = require('ws')

const { parseMessage, DEFAULT_LIMITS } = require('./validate')
const { TokenBucket } = require('./tokenBucket')
const { RoomStore } = require('./roomStore')
const executor = require('./executor')

const OPEN = 1
const ROOM_ID_RE = /^[A-Za-z0-9_-]{1,32}$/

const DEFAULTS = {
  allowedOrigins: [], // empty = allow any origin (dev). Set ALLOWED_ORIGINS in production.
  trustProxy: 1, // Render sits behind one proxy; needed so /run limits per client IP
  maxPayloadBytes: 2 * 1024 * 1024, // WebSocket frame cap; larger frames close the connection (1009)
  msgBurst: 120, // per-connection token bucket: burst size
  msgRatePerSec: 60, // per-connection token bucket: sustained messages/second
  maxViolationsPer10s: 200, // dropped messages within 10s before the socket is closed (1008)
  heartbeatMs: 30000, // ping interval; sockets that miss a pong are terminated
  emptyRoomTtlMs: 10 * 60 * 1000,
  maxClientsPerRoom: 50,
  maxFilesPerRoom: 50,
  runLimitPerMin: 10, // POST /run per IP per minute
  runBodyLimit: '300kb',
  limits: DEFAULT_LIMITS,
  runCode: executor.runCode,
  isSupportedLanguage: executor.isSupportedLanguage,
}

function parseRoomId(url) {
  try {
    const path = new URL(url, 'http://localhost').pathname
    const id = path.split('/').filter(Boolean).pop()
    return id && ROOM_ID_RE.test(id) ? id : null
  } catch {
    return null
  }
}

function createCollabServer(options = {}) {
  const cfg = { ...DEFAULTS, ...options }
  const store = new RoomStore({
    emptyRoomTtlMs: cfg.emptyRoomTtlMs,
    maxClientsPerRoom: cfg.maxClientsPerRoom,
    maxFilesPerRoom: cfg.maxFilesPerRoom,
    maxCodeChars: cfg.limits.maxCodeChars,
  })

  const originAllowed = (origin) =>
    cfg.allowedOrigins.length === 0 || (origin && cfg.allowedOrigins.includes(origin))

  // ── HTTP ────────────────────────────────────────────────────────────────
  const app = express()
  app.set('trust proxy', cfg.trustProxy)

  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (cfg.allowedOrigins.length === 0) {
      res.header('Access-Control-Allow-Origin', '*')
    } else if (origin && cfg.allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin)
      res.header('Vary', 'Origin')
    }
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(200)
    next()
  })

  app.use(express.json({ limit: cfg.runBodyLimit }))

  app.get('/', (req, res) => {
    res.send('Collab Editor Backend is running! ✅')
  })

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', rooms: store.size, connections: wss.clients.size, rssMB: Math.round(process.memoryUsage().rss / 1048576) })
  })

  const runLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: cfg.runLimitPerMin,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ output: '⏱️ Too many runs. Please wait a minute and try again.', error: true }),
  })

  app.post('/run', runLimiter, async (req, res) => {
    const { language, code } = req.body || {}
    if (typeof language !== 'string' || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ output: '❌ Missing language or code', error: true })
    }
    if (!cfg.isSupportedLanguage(language)) {
      return res.status(400).json({ output: '❌ Language not supported', error: true })
    }
    if (code.length > cfg.limits.maxCodeChars) {
      return res.status(413).json({ output: '❌ Code is too large to run', error: true })
    }
    try {
      res.json(await cfg.runCode(language, code))
    } catch (err) {
      res.status(500).json({ output: '❌ Execution failed', error: true })
    }
  })

  // Malformed JSON bodies / oversized bodies from express.json
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 400
    res.status(status).json({ output: '❌ Invalid request', error: true })
  })

  // ── WebSocket ───────────────────────────────────────────────────────────
  const server = http.createServer(app)
  const wss = new WebSocketServer({ server, maxPayload: cfg.maxPayloadBytes })

  const send = (ws, obj) => {
    if (ws.readyState === OPEN) ws.send(JSON.stringify(obj))
  }

  const broadcast = (room, obj, except) => {
    const text = JSON.stringify(obj)
    for (const client of room.clients) {
      if (client !== except && client.readyState === OPEN) client.send(text)
    }
  }

  const broadcastCount = (room) => broadcast(room, { type: 'users', count: room.clients.size })
  const broadcastUserList = (room) =>
    broadcast(room, { type: 'userlist', users: Array.from(room.users.values()) })

  wss.on('connection', (ws, req) => {
    // A socket-level error (e.g. frame larger than maxPayload) is emitted as an
    // 'error' event; with no listener Node would crash the whole process.
    ws.on('error', () => {})

    const roomId = parseRoomId(req.url)
    if (!roomId) return ws.close(1008, 'invalid-room')
    if (!originAllowed(req.headers.origin) && req.headers.origin) return ws.close(1008, 'origin-not-allowed')

    const joined = store.addClient(roomId, ws)
    if (!joined.ok) {
      send(ws, { type: 'error', code: joined.reason })
      return ws.close(1013, joined.reason)
    }
    const room = joined.room

    ws.isAlive = true
    ws.on('pong', () => {
      ws.isAlive = true
    })
    ws.user = null
    ws.bucket = new TokenBucket({ capacity: cfg.msgBurst, refillPerSec: cfg.msgRatePerSec })
    ws.violations = 0
    ws.violationWindowStart = Date.now()

    // Late joiners get the authoritative workspace (including deletes and language changes).
    send(ws, { type: 'init', epoch: room.epoch, files: store.snapshot(room) })
    if (room.users.size > 0) send(ws, { type: 'userlist', users: Array.from(room.users.values()) })
    broadcastCount(room)

    ws.on('message', (raw, isBinary) => {
      if (isBinary) return

      if (!ws.bucket.take()) {
        const now = Date.now()
        if (now - ws.violationWindowStart > 10000) {
          ws.violationWindowStart = now
          ws.violations = 0
        }
        ws.violations++
        if (ws.violations === 1) send(ws, { type: 'error', code: 'rate-limited' })
        if (ws.violations >= cfg.maxViolationsPer10s) ws.close(1008, 'rate-limit')
        return
      }

      const parsed = parseMessage(raw.toString(), cfg.limits)
      if (!parsed.ok) {
        send(ws, { type: 'error', code: parsed.reason })
        return
      }
      const msg = parsed.msg

      if (msg.type === 'join') {
        if (ws.user) return send(ws, { type: 'error', code: 'already-joined' })
        const holder = store.findByName(room, msg.name)
        if (holder) {
          // Same tab reconnecting (e.g. after a network drop the server has not noticed yet):
          // it may reclaim its own name, replacing the stale socket. Anyone else is rejected.
          if (msg.clientId && holder.clientId === msg.clientId) {
            room.users.delete(holder)
            holder.terminate()
          } else {
            return send(ws, {
              type: 'name-taken',
              message: `"${msg.name}" is already in use in this room. Please choose a different name.`,
            })
          }
        }
        ws.clientId = msg.clientId
        ws.user = { name: msg.name, color: msg.color }
        room.users.set(ws, ws.user)
        broadcastUserList(room)
        broadcast(room, { type: 'join', name: msg.name, color: msg.color }, ws)
        return
      }

      // Everything below mutates or relays room state: require a successful join first.
      if (!ws.user) return send(ws, { type: 'error', code: 'not-joined' })

      switch (msg.type) {
        case 'yupdate': {
          const result = store.applyUpdate(room, msg.fileId, Buffer.from(msg.update, 'base64'))
          if (!result.ok) {
            if (result.reason === 'invalid-update') send(ws, { type: 'error', code: 'invalid-update' })
            break
          }
          if (result.broadcastAll) {
            // size cap was enforced: everyone (sender included) receives the same combined update
            broadcast(room, { type: 'yupdate', fileId: msg.fileId, update: Buffer.from(result.update).toString('base64') })
          } else {
            broadcast(room, msg, ws)
          }
          break
        }
        case 'newfile': {
          const result = store.addFile(room, {
            ...msg.file,
            ystate: msg.file.ystate ? Buffer.from(msg.file.ystate, 'base64') : undefined,
          })
          if (result === 'added') {
            // relay the creator's original message so every replica shares that document history
            broadcast(room, msg, ws)
          } else if (result !== 'exists') {
            // The sender already shows this file locally. Tell it why it was refused and resend the
            // authoritative snapshot so its file list cannot stay out of step with the server's.
            send(ws, { type: 'error', code: result === 'limit' ? 'file-limit' : 'invalid-file' })
            send(ws, { type: 'init', epoch: room.epoch, files: store.snapshot(room) })
          }
          break
        }
        case 'deletefile':
          if (store.removeFile(room, msg.fileId)) broadcast(room, msg, ws)
          break
        case 'language':
          if (store.setLanguage(room, msg.fileId, msg.language, msg.name)) {
            broadcast(room, { ...msg, changedBy: ws.user.name }, ws)
          }
          break
        case 'chat':
          broadcast(
            room,
            {
              type: 'chat',
              name: ws.user.name,
              color: ws.user.color,
              text: msg.text,
              time:
                msg.time ||
                new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            },
            ws,
          )
          break
        case 'cursor':
          broadcast(
            room,
            { type: 'cursor', name: ws.user.name, color: ws.user.color, line: msg.line, column: msg.column },
            ws,
          )
          break
        case 'cursor-stop':
          broadcast(room, { type: 'cursor-stop', name: ws.user.name }, ws)
          break
      }
    })

    ws.on('close', () => {
      if (ws.user) broadcast(room, { type: 'cursor-leave', name: ws.user.name }, ws)
      store.removeClient(roomId, ws)
      broadcastCount(room)
      broadcastUserList(room)
    })
  })

  // Heartbeat: drop connections whose peer vanished without a close frame.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate()
        continue
      }
      ws.isAlive = false
      ws.ping()
    }
  }, cfg.heartbeatMs)
  heartbeat.unref()

  return {
    app,
    server,
    wss,
    store,
    listen(port = 0) {
      return new Promise((resolve) => {
        server.listen(port, () => resolve(server.address().port))
      })
    },
    close() {
      clearInterval(heartbeat)
      store.close()
      for (const ws of wss.clients) ws.terminate()
      return new Promise((resolve) => {
        wss.close(() => server.close(() => resolve()))
        server.closeAllConnections?.()
      })
    },
  }
}

module.exports = { createCollabServer, parseRoomId, DEFAULTS }
