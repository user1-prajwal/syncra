
const http = require('http')
const express = require('express')
const { WebSocketServer } = require('ws')
const { runCode } = require('./executor')

const app = express()
const server = http.createServer(app)

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.use(express.json())

app.get('/', (req, res) => {
  res.send('Collab Editor Backend is running! ✅')
})

app.post('/run', async (req, res) => {
  const { language, code } = req.body
  if (!language || !code) {
    return res.json({ output: '❌ Missing language or code', error: true })
  }
  try {
    const result = await runCode(language, code)
    res.json(result)
  } catch (err) {
    res.json({ output: '❌ Execution failed: ' + err.message, error: true })
  }
})

const rooms = new Map()
const roomUsers = new Map()

// Default file every room starts with
function getDefaultFiles() {
  return [
    { id: '1', name: 'index.js', language: 'javascript', code: '// Start coding here...' }
  ]
}

// Each room stores its files
const roomFiles = new Map()

function broadcastUserCount(roomId) {
  const roomClients = rooms.get(roomId)
  if (!roomClients) return
  const count = roomClients.size
  roomClients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'users', count }))
    }
  })
}

function broadcastUserList(roomId) {
  const roomClients = rooms.get(roomId)
  const users = roomUsers.get(roomId)
  if (!roomClients || !users) return
  const userList = Array.from(users.values())
  roomClients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'userlist', users: userList }))
    }
  })
}

const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const roomId = req.url?.split('/').pop() || 'default'
  console.log(`Someone joined room: ${roomId} 🟢`)

  // Setup room if first user
  if (!rooms.has(roomId)) rooms.set(roomId, new Set())
  if (!roomUsers.has(roomId)) roomUsers.set(roomId, new Map())

  // Setup default files if room is new
  if (!roomFiles.has(roomId)) {
    roomFiles.set(roomId, getDefaultFiles())
  }

  rooms.get(roomId).add(ws)

  // Send current files to new user immediately
  const currentFiles = roomFiles.get(roomId)
  ws.send(JSON.stringify({
    type: 'init',
    files: currentFiles
  }))

  broadcastUserCount(roomId)

  ws.on('message', async (message) => {
    const text = message.toString()
    const data = JSON.parse(text)

    // Update file code in memory
    if (data.type === 'code') {
      const files = roomFiles.get(roomId)
      if (files && data.fileId) {
        const idx = files.findIndex(f => f.id === data.fileId)
        if (idx !== -1) files[idx].code = data.code
      }
    }

    // Add new file to room memory
    if (data.type === 'newfile') {
      const files = roomFiles.get(roomId)
      if (files) {
        // Only add if not already there
        const exists = files.find(f => f.id === data.file.id)
        if (!exists) files.push(data.file)
      }
    }

    // Save user info
    if (data.type === 'join') {
      roomUsers.get(roomId)?.set(ws, {
        name: data.name,
        color: data.color
      })
      broadcastUserList(roomId)
    }

    // Broadcast to everyone else in room
    const roomClients = rooms.get(roomId)
    roomClients.forEach((client) => {
      if (client !== ws && client.readyState === 1) {
        client.send(text)
      }
    })
  })

  ws.on('close', () => {
    console.log(`Someone left room: ${roomId} 🔴`)
    rooms.get(roomId)?.delete(ws)
    roomUsers.get(roomId)?.delete(ws)
    broadcastUserCount(roomId)
    broadcastUserList(roomId)
  })
})

// const PORT = 4000
const PORT = process.env.PORT || 4000
server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})