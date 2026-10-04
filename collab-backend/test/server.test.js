'use strict'

const { startServer, connect, sleep, yReplica, waitText, waitConverged, b64, Y } = require('./helpers')

let srv
beforeEach(async () => {
  srv = await startServer()
})
afterEach(async () => {
  await srv.stop()
})

const file = (id, name = `${id}.py`, language = 'python', code = '') => ({ id, name, language, code })

describe('rooms and broadcast', () => {
  test('an edit reaches other clients in the room but is not echoed to the sender', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R1')
    await a.join('Ana')
    await b.join('Bo')
    const ra = yReplica(a)
    const rb = yReplica(b)
    await waitConverged([ra, rb], '1')
    const original = ra.text('1')
    ra.insert('1', 0, 'print(1)\n')
    await waitText(rb, '1', 'print(1)\n' + original)
    await sleep(100)
    expect(a.count('yupdate')).toBe(0)
  })

  test('rooms are isolated: nothing leaks to a different room', async () => {
    const a = await connect(srv.port, 'R1')
    const other = await connect(srv.port, 'R2')
    await a.join('Ana')
    await other.join('Zed')
    const ra = yReplica(a)
    ra.insert('1', 0, 'secret')
    a.send({ type: 'chat', text: 'hello room one' })
    await sleep(150)
    expect(other.count('yupdate')).toBe(0)
    expect(other.count('chat')).toBe(0)
  })

  test('user count and user list update on join and leave, and a leaving cursor is cleared', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R1')
    await a.join('Ana')
    await b.join('Bo')
    await a.waitFor((m) => m.type === 'users' && m.count === 2)
    b.close()
    await a.waitFor((m) => m.type === 'cursor-leave' && m.name === 'Bo')
    await a.waitFor((m) => m.type === 'users' && m.count === 1)
    const lists = a.msgs.filter((m) => m.type === 'userlist')
    expect(lists[lists.length - 1].users.map((u) => u.name)).toEqual(['Ana'])
  })

  test('six clients each editing their own file: every replica ends up identical', async () => {
    const N = 6
    const PER = 25
    const clients = []
    for (let i = 0; i < N; i++) clients.push(await connect(srv.port, 'BURST'))
    for (let i = 0; i < N; i++) await clients[i].join(`user${i}`)
    const reps = clients.map((c) => yReplica(c))
    reps.forEach((r, i) => r.createFile(`f${i}`, `f${i}.py`))
    await sleep(150)
    reps.forEach((r, i) => {
      for (let k = 0; k < PER; k++) r.insert(`f${i}`, r.text(`f${i}`).length, `v${k};`)
    })
    const expected = Array.from({ length: PER }, (_, k) => `v${k};`).join('')
    for (let i = 0; i < N; i++) {
      for (const r of reps) await waitText(r, `f${i}`, expected, 5000)
    }
  })
})

describe('concurrent editing (CRDT convergence)', () => {
  test('two users typing at the same position at the same moment both keep their text', async () => {
    const a = await connect(srv.port, 'C1')
    const b = await connect(srv.port, 'C1')
    await a.join('Ana')
    await b.join('Bo')
    const ra = yReplica(a)
    const rb = yReplica(b)
    await waitConverged([ra, rb], '1')
    const base = ra.text('1')
    // both edit position 0 BEFORE either has seen the other's change
    ra.insert('1', 0, 'AAAA')
    rb.insert('1', 0, 'BBBB')
    const final = await waitConverged([ra, rb], '1')
    expect(final).toContain('AAAA')
    expect(final).toContain('BBBB')
    expect(final.endsWith(base)).toBe(true)
    expect(final.length).toBe(base.length + 8)
  })

  test('concurrent delete and insert in the same region converge to the same text everywhere', async () => {
    const a = await connect(srv.port, 'C1')
    const b = await connect(srv.port, 'C1')
    await a.join('Ana')
    await b.join('Bo')
    const ra = yReplica(a)
    const rb = yReplica(b)
    await waitConverged([ra, rb], '1')
    ra.delete('1', 0, 10)
    rb.insert('1', 5, 'XYZ')
    const final = await waitConverged([ra, rb], '1')
    expect(final).toContain('XYZ')
    // the server's authoritative copy agrees with the clients
    const late = await connect(srv.port, 'C1')
    const init = await late.waitFor((m) => m.type === 'init')
    expect(init.files[0].code).toBe(final)
  })

  test('randomised fuzz: 4 clients make 200 interleaved inserts and deletes; all replicas and the server agree', async () => {
    let seed = 12345
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    const clients = []
    for (let i = 0; i < 4; i++) clients.push(await connect(srv.port, 'FUZZ'))
    for (let i = 0; i < 4; i++) await clients[i].join(`u${i}`)
    const reps = clients.map((c) => yReplica(c))
    await waitConverged(reps, '1')
    for (let step = 0; step < 200; step++) {
      const r = reps[Math.floor(rnd() * reps.length)]
      const len = r.text('1').length
      if (len > 20 && rnd() < 0.3) r.delete('1', Math.floor(rnd() * (len - 5)), 1 + Math.floor(rnd() * 4))
      else r.insert('1', Math.floor(rnd() * (len + 1)), String.fromCharCode(97 + Math.floor(rnd() * 26)).repeat(1 + Math.floor(rnd() * 3)))
      if (step % 7 === 0) await sleep(1) // let some updates cross in flight, others stay concurrent
    }
    const final = await waitConverged(reps, '1', 8000)
    const late = await connect(srv.port, 'FUZZ')
    const init = await late.waitFor((m) => m.type === 'init')
    expect(init.files[0].code).toBe(final)
  })

  test('a user who edits while offline merges cleanly on reconnect, and the others keep their edits too', async () => {
    const a = await connect(srv.port, 'OFF1')
    const b = await connect(srv.port, 'OFF1')
    const cid = 'tab-offline-test-0001'
    a.send({ type: 'join', name: 'Ana', color: '#FF6B6B', clientId: cid })
    await a.waitFor((m) => m.type === 'userlist')
    await b.join('Bo')
    const ra = yReplica(a, 'Ana')
    const rb = yReplica(b, 'Bo')
    await waitConverged([ra, rb], '1')
    const base = ra.text('1')

    a.close() // Ana goes offline but keeps her local documents
    await a.closed
    ra.insert('1', 0, 'OFFLINE-A|') // edits made while disconnected are NOT sent
    rb.insert('1', base.length, '|ONLINE-B') // Bo keeps working
    await sleep(100)

    const a2 = await connect(srv.port, 'OFF1') // Ana reconnects; the replica merges the snapshot ...
    ra.use(a2)
    a2.send({ type: 'join', name: 'Ana', color: '#FF6B6B', clientId: cid }) // ... and uploads its diff once the join is confirmed

    const final = await waitConverged([ra, rb], '1')
    expect(final.startsWith('OFFLINE-A|')).toBe(true)
    expect(final.endsWith('|ONLINE-B')).toBe(true)
    expect(final).toContain(base)
  })
})

describe('offline edits and a failed re-join', () => {
  test('offline edits are not lost when the first re-join is refused: they upload after a successful join', async () => {
    const a = await connect(srv.port, 'OFF2')
    const b = await connect(srv.port, 'OFF2')
    await a.join('Ana')
    await b.join('Bo')
    const ra = yReplica(a, 'Ana2')
    const rb = yReplica(b, 'Bo')
    await waitConverged([ra, rb], '1')
    a.close()
    await a.closed
    ra.insert('1', 0, 'KEEP-ME|')
    const a2 = await connect(srv.port, 'OFF2')
    ra.use(a2)
    a2.send({ type: 'join', name: 'Bo', color: '#FF6B6B' }) // name now taken by Bo -> refused
    await a2.waitFor((m) => m.type === 'name-taken')
    await sleep(100)
    expect(rb.text('1').startsWith('KEEP-ME|')).toBe(false) // nothing uploaded while not joined
    a2.send({ type: 'join', name: 'Ana2', color: '#FF6B6B' }) // user picks another name
    const final = await waitConverged([ra, rb], '1')
    expect(final.startsWith('KEEP-ME|')).toBe(true)
  })
})

describe('late joiner state', () => {
  test('receives the latest text, rebuilt from the server snapshot', async () => {
    const a = await connect(srv.port, 'R1')
    await a.join('Ana')
    const ra = yReplica(a)
    await waitConverged([ra], '1')
    ra.insert('1', 0, 'latest\n')
    await sleep(100)
    const late = await connect(srv.port, 'R1')
    const rl = yReplica(late)
    await late.waitFor((m) => m.type === 'init')
    expect(rl.text('1').startsWith('latest\n')).toBe(true)
    expect(rl.text('1')).toBe(ra.text('1'))
  })

  test('reflects deleted files, new files and language changes (regression: stale late-join state)', async () => {
    const a = await connect(srv.port, 'R1')
    await a.join('Ana')
    const ra = yReplica(a)
    ra.createFile('2', 'b.py', 'bee')
    ra.createFile('3', 'c.py', 'sea')
    await sleep(100)
    a.send({ type: 'deletefile', fileId: '2' })
    a.send({ type: 'language', fileId: '3', language: 'java', name: 'c.java' })
    await sleep(150)
    const late = await connect(srv.port, 'R1')
    const init = await late.waitFor((m) => m.type === 'init')
    expect(init.files.map((f) => f.id)).toEqual(['1', '3'])
    expect(init.files.find((f) => f.id === '3')).toMatchObject({ language: 'java', name: 'c.java', code: 'sea' })
  })

  test('late joiner sees users who joined earlier', async () => {
    const a = await connect(srv.port, 'R1')
    await a.join('Ana')
    const late = await connect(srv.port, 'R1')
    const list = await late.waitFor((m) => m.type === 'userlist')
    expect(list.users.map((u) => u.name)).toEqual(['Ana'])
  })

  test('workspace survives everyone disconnecting briefly (empty-room TTL)', async () => {
    await srv.stop()
    srv = await startServer({ emptyRoomTtlMs: 500 })
    const a = await connect(srv.port, 'R1')
    await a.join('Ana')
    const ra = yReplica(a)
    await waitConverged([ra], '1')
    ra.insert('1', 0, 'kept\n')
    await sleep(100)
    a.close()
    await a.closed
    await sleep(100)
    const again = await connect(srv.port, 'R1')
    const init = await again.waitFor((m) => m.type === 'init')
    expect(init.files[0].code.startsWith('kept\n')).toBe(true)
  })

  test('an abandoned room is cleaned up after the TTL and restarts with a new epoch', async () => {
    await srv.stop()
    srv = await startServer({ emptyRoomTtlMs: 100 })
    const a = await connect(srv.port, 'R1')
    const first = await a.waitFor((m) => m.type === 'init')
    a.close()
    await a.closed
    await sleep(300)
    expect(srv.collab.store.size).toBe(0)
    const again = await connect(srv.port, 'R1')
    const init = await again.waitFor((m) => m.type === 'init')
    expect(init.files[0].code).toMatch(/Start coding here/)
    expect(init.epoch).not.toBe(first.epoch)
  })

  test('the default file has identical history in every room, so a restarted server merges without duplicating it', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R2')
    const ia = await a.waitFor((m) => m.type === 'init')
    const ib = await b.waitFor((m) => m.type === 'init')
    expect(ia.files[0].ystate).toBe(ib.files[0].ystate)
    const merged = new Y.Doc()
    Y.applyUpdate(merged, new Uint8Array(Buffer.from(ia.files[0].ystate, 'base64')))
    Y.applyUpdate(merged, new Uint8Array(Buffer.from(ib.files[0].ystate, 'base64')))
    expect(merged.getText('code').toString()).toBe(ia.files[0].code)
  })
})

describe('files', () => {
  test('a new file created with initial content reaches everyone with a shared history', async () => {
    const a = await connect(srv.port, 'F1')
    const b = await connect(srv.port, 'F1')
    await a.join('Ana')
    await b.join('Bo')
    const ra = yReplica(a)
    const rb = yReplica(b)
    ra.createFile('9', 'util.py', 'def f(): pass\n')
    await waitText(rb, '9', 'def f(): pass\n')
    rb.insert('9', 0, '# b\n')
    await waitText(ra, '9', '# b\ndef f(): pass\n')
    const late = await connect(srv.port, 'F1')
    const init = await late.waitFor((m) => m.type === 'init')
    expect(init.files.find((f) => f.id === '9').code).toBe('# b\ndef f(): pass\n')
  })

  test('deleting a file removes it for current and future users', async () => {
    const a = await connect(srv.port, 'F2')
    const b = await connect(srv.port, 'F2')
    await a.join('Ana')
    await b.join('Bo')
    const ra = yReplica(a)
    const rb = yReplica(b)
    ra.createFile('2', 'two.py', 'x')
    await waitText(rb, '2', 'x')
    a.send({ type: 'deletefile', fileId: '1' })
    await b.waitFor((m) => m.type === 'deletefile' && m.fileId === '1')
    const late = await connect(srv.port, 'F2')
    const init = await late.waitFor((m) => m.type === 'init')
    expect(init.files.map((f) => f.id)).toEqual(['2'])
  })

  test('a refused file creation is followed by a snapshot so the creator drops the file', async () => {
    await srv.stop()
    srv = await startServer({ maxFilesPerRoom: 2 })
    const a = await connect(srv.port, 'F3')
    await a.join('Ana')
    const ra = yReplica(a)
    ra.createFile('2', 'ok.py')
    await sleep(100)
    ra.createFile('3', 'one-too-many.py')
    await a.waitFor((m) => m.type === 'error' && m.code === 'file-limit')
    await sleep(100)
    expect([...ra.docs.keys()].sort()).toEqual(['1', '2']) // resync removed the refused file
  })
})

describe('usernames and identity', () => {
  test('duplicate name in the same room is rejected, and the user can retry with another', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R1')
    await a.join('Ana')
    b.send({ type: 'join', name: 'Ana', color: '#FF6B6B' })
    await b.waitFor((m) => m.type === 'name-taken')
    await b.join('Ana2')
    expect(a.msgs.some((m) => m.type === 'join' && m.name === 'Ana2')).toBe(true)
  })

  test('the same name is allowed in a different room', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R2')
    await a.join('Ana')
    await b.join('Ana')
  })

  test('a client that has not joined cannot edit or relay anything', async () => {
    const a = await connect(srv.port, 'R1')
    const lurker = await connect(srv.port, 'R1')
    await a.join('Ana')
    const evil = new Y.Doc()
    evil.getText('code').insert(0, 'hijack')
    lurker.send({ type: 'yupdate', fileId: '1', update: b64(Y.encodeStateAsUpdate(evil)) })
    lurker.send({ type: 'chat', text: 'hi' })
    const err = await lurker.waitFor((m) => m.type === 'error' && m.code === 'not-joined')
    expect(err).toBeDefined()
    await sleep(100)
    expect(a.count('yupdate')).toBe(0)
    expect(a.count('chat')).toBe(0)
    const late = await connect(srv.port, 'R1')
    expect((await late.waitFor((m) => m.type === 'init')).files[0].code).not.toContain('hijack')
  })

  test('chat sender identity comes from the server, not the client', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R1')
    await a.join('Ana', '#FF6B6B')
    await b.join('Bo')
    a.send({ type: 'chat', text: 'hello', name: 'Admin', color: '#000000' })
    const chat = await b.waitFor((m) => m.type === 'chat')
    expect(chat).toMatchObject({ name: 'Ana', color: '#FF6B6B', text: 'hello' })
  })

  test('clients cannot inject server-only message types', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R1')
    await a.join('Ana')
    await b.join('Bo')
    a.send({ type: 'users', count: 999 })
    a.send({ type: 'userlist', users: [{ name: 'Mallory', color: '#000000' }] })
    a.send({ type: 'init', files: [] })
    await sleep(150)
    expect(b.msgs.some((m) => m.type === 'users' && m.count === 999)).toBe(false)
    expect(b.msgs.some((m) => m.type === 'userlist' && m.users.some((u) => u.name === 'Mallory'))).toBe(false)
    expect(b.count('init')).toBe(1) // only the genuine one on connect
  })
})

describe('robustness (regressions for crashes found in the original server)', () => {
  test('a malformed JSON frame does not crash the server or drop the connection', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R1')
    await a.join('Ana')
    await b.join('Bo')
    a.sendRaw('not json{{{')
    await a.waitFor((m) => m.type === 'error' && m.code === 'invalid-json')
    const ra = yReplica(a)
    const rb = yReplica(b)
    await waitConverged([ra, rb], '1')
    ra.insert('1', 0, 'still works|')
    await waitText(rb, '1', ra.text('1'))
    expect(rb.text('1').startsWith('still works|')).toBe(true)
    const health = await (await fetch(`${srv.http}/health`)).json()
    expect(health.status).toBe('ok')
  })

  test.each([['null'], ['123'], ['[]'], ['{"type":null}'], ['{"type":"yupdate"}'], ['{"type":"code","fileId":"1","code":"legacy"}']])(
    'bad payload %s is rejected without crashing',
    async (raw) => {
      const a = await connect(srv.port, 'R1')
      await a.join('Ana')
      a.sendRaw(raw)
      await a.waitFor((m) => m.type === 'error')
      expect((await fetch(`${srv.http}/health`)).status).toBe(200)
    },
  )

  test('an oversized frame closes only that connection; the server and other clients stay up', async () => {
    await srv.stop()
    srv = await startServer({ maxPayloadBytes: 10_000 })
    const attacker = await connect(srv.port, 'R1')
    const victim = await connect(srv.port, 'R1')
    await victim.join('Vic')
    attacker.sendRaw('x'.repeat(50_000))
    expect(await attacker.closed).toBe(1009)
    expect((await fetch(`${srv.http}/health`)).status).toBe(200)
    victim.send({ type: 'chat', text: 'still here' })
    await sleep(50)
    expect(victim.ws.readyState).toBe(1)
  })

  test('a garbage Yjs update is rejected, leaves the document untouched, and is never relayed', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R1')
    await a.join('Ana')
    await b.join('Bo')
    const before = (await b.waitFor((m) => m.type === 'init')).files[0].ystate
    a.send({ type: 'yupdate', fileId: '1', update: Buffer.from([255, 255, 255, 255, 255, 1, 2, 3]).toString('base64') })
    await a.waitFor((m) => m.type === 'error' && m.code === 'invalid-update')
    a.send({ type: 'yupdate', fileId: '1', update: '!!!not base64!!!' })
    await a.waitFor((m) => m.type === 'error' && m.code === 'invalid-update')
    await sleep(100)
    expect(b.count('yupdate')).toBe(0)
    const late = await connect(srv.port, 'R1')
    expect((await late.waitFor((m) => m.type === 'init')).files[0].ystate).toBe(before)
    expect((await fetch(`${srv.http}/health`)).status).toBe(200)
  })

  test('an update for a file that does not exist is ignored', async () => {
    const a = await connect(srv.port, 'R1')
    await a.join('Ana')
    const doc = new Y.Doc()
    doc.getText('code').insert(0, 'x')
    a.send({ type: 'yupdate', fileId: 'nope', update: b64(Y.encodeStateAsUpdate(doc)) })
    await sleep(100)
    expect(a.ws.readyState).toBe(1)
  })

  test('the per-file size cap is enforced on the server and every replica sees the same trimmed text', async () => {
    await srv.stop()
    srv = await startServer({ limits: { ...require('../validate').DEFAULT_LIMITS, maxCodeChars: 1000 } })
    const a = await connect(srv.port, 'CAP')
    const b = await connect(srv.port, 'CAP')
    await a.join('Ana')
    await b.join('Bo')
    const ra = yReplica(a)
    const rb = yReplica(b)
    await waitConverged([ra, rb], '1')
    ra.insert('1', 0, 'x'.repeat(5000))
    await sleep(300)
    const final = await waitConverged([ra, rb], '1')
    expect(final.length).toBe(1000)
    const late = await connect(srv.port, 'CAP')
    expect((await late.waitFor((m) => m.type === 'init')).files[0].code.length).toBe(1000)
  })

  test('invalid room ids are refused', async () => {
    const c = await connect(srv.port, 'bad%20room!')
    expect(await c.closed).toBe(1008)
  })

  test('a room refuses clients beyond its capacity', async () => {
    await srv.stop()
    srv = await startServer({ maxClientsPerRoom: 2 })
    await connect(srv.port, 'R1')
    await connect(srv.port, 'R1')
    const third = await connect(srv.port, 'R1')
    expect(await third.closed).toBe(1013)
  })

  test('file count per room is capped', async () => {
    await srv.stop()
    srv = await startServer({ maxFilesPerRoom: 3 })
    const a = await connect(srv.port, 'R1')
    await a.join('Ana')
    a.send({ type: 'newfile', file: file('2') })
    a.send({ type: 'newfile', file: file('3') })
    a.send({ type: 'newfile', file: file('4') })
    await a.waitFor((m) => m.type === 'error' && m.code === 'file-limit')
  })
})

describe('rate limiting', () => {
  test('a flooding client is throttled and eventually disconnected; other clients are unaffected', async () => {
    await srv.stop()
    srv = await startServer({ msgBurst: 20, msgRatePerSec: 10, maxViolationsPer10s: 50 })
    const flooder = await connect(srv.port, 'R1')
    const bystander = await connect(srv.port, 'R1')
    await flooder.join('Flood')
    await bystander.join('Calm')
    for (let i = 0; i < 300; i++) flooder.send({ type: 'cursor', line: 1, column: i + 1 })
    await flooder.waitFor((m) => m.type === 'error' && m.code === 'rate-limited')
    expect(await flooder.closed).toBe(1008)
    const delivered = bystander.msgs.filter((m) => m.type === 'cursor').length
    expect(delivered).toBeLessThan(60) // far fewer than the 300 sent
    bystander.send({ type: 'chat', text: 'unaffected' })
    await sleep(50)
    expect(bystander.ws.readyState).toBe(1)
  })

  test('normal typing rates are not throttled', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R1')
    await a.join('Ana')
    await b.join('Bo')
    const ra = yReplica(a)
    const rb = yReplica(b)
    await waitConverged([ra, rb], '1')
    const base = ra.text('1')
    for (let i = 0; i < 40; i++) {
      ra.insert('1', base.length + i, 'a') // one Yjs update per keystroke
      a.send({ type: 'cursor', line: 1, column: i + 1 })
      await sleep(25) // ~40 keystrokes/s = 80 msgs/s, within the burst allowance
    }
    await waitConverged([ra, rb], '1')
    expect(a.count('error')).toBe(0)
    expect(b.count('yupdate')).toBe(40)
  })
})

describe('origin allow-list', () => {
  test('rejects WebSocket connections from disallowed browser origins', async () => {
    await srv.stop()
    srv = await startServer({ allowedOrigins: ['https://syncra-collab.vercel.app'] })
    const bad = await connect(srv.port, 'R1', { headers: { Origin: 'https://evil.example' } })
    expect(await bad.closed).toBe(1008)
    const good = await connect(srv.port, 'R1', { headers: { Origin: 'https://syncra-collab.vercel.app' } })
    await good.join('Ana')
  })
})

describe('reconnecting', () => {
  const CID = 'tab-0123456789abcdef'

  test('a returning tab reclaims its own name even while the stale socket is still open', async () => {
    const stale = await connect(srv.port, 'R1')
    const watcher = await connect(srv.port, 'R1')
    stale.send({ type: 'join', name: 'Ana', color: '#FF6B6B', clientId: CID })
    await stale.waitFor((m) => m.type === 'userlist')
    await watcher.join('Bo')

    // network "drops" without a close frame: the server still thinks `stale` is connected
    const fresh = await connect(srv.port, 'R1')
    fresh.send({ type: 'join', name: 'Ana', color: '#FF6B6B', clientId: CID })
    await fresh.waitFor((m) => m.type === 'userlist' && m.users.some((u) => u.name === 'Ana'))
    expect(fresh.count('name-taken')).toBe(0)
    expect(await stale.closed).toBeDefined() // stale socket was terminated by the server
    await sleep(100)
    const last = watcher.msgs.filter((m) => m.type === 'userlist').pop()
    expect(last.users.filter((u) => u.name === 'Ana')).toHaveLength(1)
  })

  test('another client with the same name but a different clientId is still rejected', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R1')
    a.send({ type: 'join', name: 'Ana', color: '#FF6B6B', clientId: CID })
    await a.waitFor((m) => m.type === 'userlist')
    b.send({ type: 'join', name: 'Ana', color: '#FF6B6B', clientId: 'someone-else-12345' })
    await b.waitFor((m) => m.type === 'name-taken')
    expect(a.ws.readyState).toBe(1)
  })

  test('clientId is never broadcast to other users', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R1')
    a.send({ type: 'join', name: 'Ana', color: '#FF6B6B', clientId: CID })
    await a.waitFor((m) => m.type === 'userlist')
    await b.join('Bo')
    expect(JSON.stringify(b.msgs)).not.toContain(CID)
  })

  test('a reconnecting client gets the current workspace, including edits made while it was away', async () => {
    const a = await connect(srv.port, 'R1')
    const b = await connect(srv.port, 'R1')
    a.send({ type: 'join', name: 'Ana', color: '#FF6B6B', clientId: CID })
    await a.waitFor((m) => m.type === 'userlist')
    await b.join('Bo')
    const ra = yReplica(a)
    const rb = yReplica(b)
    await waitConverged([ra, rb], '1')
    a.close()
    await a.closed
    rb.insert('1', 0, 'edited while Ana was offline\n')
    await sleep(100)
    const back = await connect(srv.port, 'R1')
    ra.use(back)
    back.send({ type: 'join', name: 'Ana', color: '#FF6B6B', clientId: CID })
    await back.waitFor((m) => m.type === 'userlist' && m.users.some((u) => u.name === 'Ana'))
    await waitText(ra, '1', rb.text('1'))
    expect(ra.text('1').startsWith('edited while Ana was offline\n')).toBe(true)
  })
})

describe('shutdown', () => {
  test('close() resolves promptly and refuses new connections, even while a client keeps reconnecting', async () => {
    const a = await connect(srv.port, 'SHUT1')
    await a.join('Ana')
    const port = srv.port
    const closing = srv.stop()
    // a client that reconnects in the middle of shutdown (like a browser tab with auto-reconnect)
    const retry = connect(port, 'SHUT1').then(
      (c) => c.closed.then(() => 'connected-then-dropped'),
      () => 'refused',
    )
    const started = Date.now()
    await closing
    expect(Date.now() - started).toBeLessThan(2500)
    expect(['refused', 'connected-then-dropped']).toContain(await retry)
    srv = await startServer() // keep afterEach happy
  })
})
