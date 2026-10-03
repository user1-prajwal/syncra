'use strict'

// Edit-propagation benchmark for the Yjs protocol.
//
//   npm run bench                        # spawns ./server.js on a free port
//   npm run bench -- --quick             # shorter run (does not overwrite results.json)
//   TARGET=https://your-backend.example npm run bench -- --quick   # a deployed server over the real network
//
// What is sent: real Yjs updates. A "typist" holds a document of a given size and inserts one
// character at a random position per edit (a keystroke, ~30 bytes on the wire), or pastes a block.
// Every receiver is a real Yjs replica that applies each update to its own document.
//
// Method: the server runs in its OWN process (unless TARGET is set). All load-generating clients run
// in THIS process, so every timestamp comes from one monotonic clock (performance.now), which avoids
// cross-machine clock skew. A sender stamps `sentAt` immediately before ws.send(); a receiver computes
// performance.now() - sentAt after it has applied the update to its Yjs document. That is end-to-end
// edit propagation: client send -> TCP -> server validate + apply + broadcast -> TCP -> client apply.
// It does NOT include browser/Monaco rendering. Against the default local server the transport is
// loopback and the server and the clients share the machine's CPUs, so the numbers measure the
// server's relay overhead, not real network latency.

const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { performance } = require('perf_hooks')
const WebSocket = require('ws')
const Y = require('yjs')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b64 = (u8) => Buffer.from(u8).toString('base64')
const fromB64 = (s) => new Uint8Array(Buffer.from(s, 'base64'))
const r2 = (n) => Math.round(n * 100) / 100

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

async function startServer() {
  if (process.env.TARGET) {
    const u = new URL(process.env.TARGET)
    const secure = u.protocol === 'https:' || u.protocol === 'wss:'
    const port = Number(u.port) || (secure ? 443 : 80)
    return {
      scheme: secure ? 'wss' : 'ws',
      httpBase: `${secure ? 'https' : 'http'}://${u.hostname}${u.port ? ':' + u.port : ''}`,
      host: u.hostname,
      port,
      stop: async () => {},
    }
  }
  const port = 20000 + Math.floor(Math.random() * 20000)
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break
    } catch {}
    await sleep(100)
  }
  return {
    scheme: 'ws',
    httpBase: `http://127.0.0.1:${port}`,
    host: '127.0.0.1',
    port,
    stop: async () => {
      proc.kill('SIGTERM')
      await sleep(200)
    },
  }
}

async function serverRssMB(srv) {
  try {
    return (await (await fetch(`${srv.httpBase}/health`)).json()).rssMB ?? null
  } catch {
    return null
  }
}

// A client that behaves like the browser: joins, keeps one Y.Doc per file, applies what the server sends.
function openClient(srv, room, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${srv.scheme}://${srv.host}:${srv.port}/${room}`)
    const c = { ws, lat: [], docs: new Map(), joined: false }
    const doc = (id) => {
      let d = c.docs.get(id)
      if (!d) c.docs.set(id, (d = new Y.Doc()))
      return d
    }
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', name, color: '#4ECDC4' })))
    ws.on('error', reject)
    ws.on('message', (m) => {
      const d = JSON.parse(m)
      if (d.type === 'init') for (const f of d.files) Y.applyUpdate(doc(f.id), fromB64(f.ystate))
      else if (d.type === 'newfile') Y.applyUpdate(doc(d.file.id), fromB64(d.file.ystate))
      else if (d.type === 'yupdate') {
        Y.applyUpdate(doc(d.fileId), fromB64(d.update))
        if (typeof d.sentAt === 'number') c.lat.push(performance.now() - d.sentAt)
      } else if (!c.joined && d.type === 'userlist' && d.users.some((u) => u.name === name)) {
        c.joined = true
        resolve(c)
      }
    })
  })
}

const sampleText = (chars) => {
  const line = 'x = compute(value) # sample line of code\n'
  return line.repeat(Math.ceil(chars / line.length)).slice(0, chars)
}

// Creates this typist's file (with `docChars` of text) and returns { insertChar, paste }.
function makeTypist(client, fileId, docChars) {
  const doc = new Y.Doc()
  const text = doc.getText('code')
  text.insert(0, sampleText(docChars))
  client.ws.send(JSON.stringify({ type: 'newfile', file: { id: fileId, name: `${fileId}.py`, language: 'python', ystate: b64(Y.encodeStateAsUpdate(doc)) } }))
  doc.on('update', (u) => client.ws.send(JSON.stringify({ type: 'yupdate', fileId, update: b64(u), sentAt: performance.now() })))
  return {
    doc,
    insertChar: () => text.insert(Math.floor(Math.random() * (text.length + 1)), 'k'),
    paste: (n) => text.insert(Math.floor(Math.random() * (text.length + 1)), sampleText(n)),
  }
}

async function runScenario(srv, s) {
  const clients = []
  const roomsList = []
  for (let r = 0; r < s.rooms; r++) {
    const group = []
    for (let i = 0; i < s.clientsPerRoom; i++) group.push(await openClient(srv, `BENCH${s.id}x${r}`, `u${r}_${i}`))
    roomsList.push(group)
    clients.push(...group)
  }
  const typists = []
  for (const group of roomsList) for (let k = 0; k < s.senders; k++) typists.push(makeTypist(group[k], `b${k}`, s.docKB * 1024))
  await sleep(500) // let file creation propagate before measuring

  const rssBefore = await serverRssMB(srv)
  for (const c of clients) c.lat.length = 0
  const expected = s.rooms * s.senders * s.msgs * (s.clientsPerRoom - 1)
  const t0 = performance.now()

  await Promise.all(
    typists.map(async (typist) => {
      await sleep(Math.random() * 100) // de-synchronise typists
      const start = performance.now()
      for (let i = 0; i < s.msgs; i++) {
        if (s.pasteChars) typist.paste(s.pasteChars)
        else typist.insertChar()
        const next = start + ((i + 1) * 1000) / s.hz
        await sleep(Math.max(0, next - performance.now()))
      }
    }),
  )

  // wait for stragglers: stop when everything arrived or nothing new for 2s
  let last = -1
  let stable = 0
  while (stable < 20) {
    const got = clients.reduce((n, c) => n + c.lat.length, 0)
    if (got >= expected) break
    stable = got === last ? stable + 1 : 0
    last = got
    await sleep(100)
  }
  const elapsedS = (performance.now() - t0) / 1000
  const lat = clients.flatMap((c) => c.lat).sort((a, b) => a - b)
  const rssAfter = await serverRssMB(srv)

  // Correctness check: every replica of every file (the typist's own document AND every other
  // client's copy) must hold exactly the same text once the run has settled.
  let diverged = 0
  roomsList.forEach((group, r) => {
    for (let k = 0; k < s.senders; k++) {
      const typist = typists[r * s.senders + k]
      const texts = [typist.doc.getText('code').toString()]
      group.forEach((c, i) => {
        if (i !== k) texts.push(c.docs.get(`b${k}`)?.getText('code').toString())
      })
      const bad = texts.filter((t) => t !== texts[0]).length
      if (bad && process.env.BENCH_DEBUG) console.log('  DIVERGED room', r, 'file', k, 'lengths', texts.map((t) => t?.length))
      diverged += bad
    }
  })
  clients.forEach((c) => c.ws.close())
  await sleep(300)

  return {
    scenario: s.name,
    rooms: s.rooms,
    clientsPerRoom: s.clientsPerRoom,
    totalClients: s.rooms * s.clientsPerRoom,
    activeTypists: s.rooms * s.senders,
    docKB: s.docKB,
    edit: s.pasteChars ? `paste ${r2(s.pasteChars / 1024)} KB` : '1 char',
    editsPerSecPerTypist: s.hz,
    delivered: lat.length,
    expected,
    lossPct: r2(((expected - lat.length) / expected) * 100),
    divergedReplicas: diverged,
    deliveriesPerSec: Math.round(lat.length / elapsedS),
    p50ms: r2(percentile(lat, 50)),
    p95ms: r2(percentile(lat, 95)),
    p99ms: r2(percentile(lat, 99)),
    maxMs: r2(lat[lat.length - 1]),
    serverRssMB: rssAfter,
    serverRssBeforeMB: rssBefore,
  }
}

async function runLateJoin(srv, trials = 30, files = 20, fileBytes = 10 * 1024) {
  const owner = await openClient(srv, 'LATEJOIN', 'owner')
  for (let i = 0; i < files; i++) makeTypist(owner, `f${i}`, fileBytes)
  await sleep(800)
  const times = []
  let initBytes = 0
  for (let i = 0; i < trials; i++) {
    await new Promise((resolve, reject) => {
      const t = performance.now()
      const ws = new WebSocket(`${srv.scheme}://${srv.host}:${srv.port}/LATEJOIN`)
      ws.on('message', (m) => {
        const d = JSON.parse(m)
        if (d.type === 'init') {
          const docs = d.files.map((f) => {
            const doc = new Y.Doc()
            Y.applyUpdate(doc, fromB64(f.ystate))
            return doc
          })
          times.push(performance.now() - t) // includes connect + download + building every document
          initBytes = m.length
          docs.forEach((x) => x.destroy())
          ws.close()
          resolve()
        }
      })
      ws.on('error', reject)
    })
    await sleep(20)
  }
  owner.ws.close()
  times.sort((a, b) => a - b)
  return {
    scenario: 'late-join',
    files: files + 1, // the default file is also in the room
    fileKB: r2(fileBytes / 1024),
    snapshotKB: Math.round(initBytes / 1024),
    trials,
    p50ms: r2(percentile(times, 50)),
    p95ms: r2(percentile(times, 95)),
    maxMs: r2(times[times.length - 1]),
  }
}

async function main() {
  const quick = process.argv.includes('--quick')
  const msgs = quick ? 30 : 100
  const hz = 10 // ~ a fast typist
  const base = { msgs, hz, docKB: 2 }
  const scenarios = [
    { ...base, name: 'baseline: 1 room, 2 users', rooms: 1, clientsPerRoom: 2, senders: 1 },
    { ...base, name: '10 rooms x 5 users, 1 typist/room', rooms: 10, clientsPerRoom: 5, senders: 1 },
    { ...base, name: '10 rooms x 5 users, ALL typing', rooms: 10, clientsPerRoom: 5, senders: 5 },
    { ...base, name: '20 rooms x 10 users, 1 typist/room', rooms: 20, clientsPerRoom: 10, senders: 1 },
    { ...base, name: '1 room, 20 users, 1 typist', rooms: 1, clientsPerRoom: 20, senders: 1 },
    { ...base, name: '10 rooms x 5 users, 100 KB file', rooms: 10, clientsPerRoom: 5, senders: 1, docKB: 100 },
    { ...base, name: '10 rooms x 5 users, 1 KB pastes', rooms: 10, clientsPerRoom: 5, senders: 1, pasteChars: 1024 },
  ]
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)
  scenarios.forEach((s, i) => (s.id = i)) // unique room names per scenario, so runs never share leftover state
  const run = only ? scenarios.filter((s) => s.name.includes(only)) : scenarios
  const srv = await startServer()
  const env = {
    date: new Date().toISOString(),
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    cpu: `${os.cpus()[0]?.model} x${os.cpus().length}`,
    transport: process.env.TARGET ? `remote: ${process.env.TARGET}` : 'loopback (server and clients on the same machine)',
    editsPerTypist: msgs,
  }
  console.log('Environment:', env)
  const results = []
  for (const s of run) {
    process.stdout.write(`running: ${s.name} ... `)
    const r = await runScenario(srv, s)
    results.push(r)
    console.log(`p50 ${r.p50ms}ms  p95 ${r.p95ms}ms  p99 ${r.p99ms}ms  loss ${r.lossPct}%  diverged replicas ${r.divergedReplicas}`)
  }
  process.stdout.write('running: late-join ... ')
  const lj = await runLateJoin(srv)
  console.log(`p50 ${lj.p50ms}ms  p95 ${lj.p95ms}ms`)

  console.table(
    results.map((r) => ({
      scenario: r.scenario,
      clients: r.totalClients,
      typists: r.activeTypists,
      edit: r.edit,
      'deliv/s': r.deliveriesPerSec,
      loss: r.lossPct + '%',
      diverged: r.divergedReplicas,
      p50: r.p50ms,
      p95: r.p95ms,
      p99: r.p99ms,
      max: r.maxMs,
      'srv MB': r.serverRssMB,
    })),
  )
  console.log('Late join:', lj)
  if (!quick) {
    fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ env, results, lateJoin: lj }, null, 2) + '\n')
    console.log('wrote bench/results.json')
  }
  await srv.stop()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
