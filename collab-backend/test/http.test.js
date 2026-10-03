'use strict'

const { startServer } = require('./helpers')

const post = (srv, body, headers = {}) =>
  fetch(`${srv.http}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('POST /run', () => {
  let srv
  let calls
  beforeEach(async () => {
    calls = []
    srv = await startServer({
      runLimitPerMin: 3,
      runCode: async (language, code) => {
        calls.push({ language, code })
        return { output: 'ok', error: false }
      },
    })
  })
  afterEach(() => srv.stop())

  test('runs supported languages through the executor', async () => {
    const res = await post(srv, { language: 'python', code: 'print(1)' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ output: 'ok', error: false })
    expect(calls).toEqual([{ language: 'python', code: 'print(1)' }])
  })

  test.each([
    [{ language: 'python' }, 'missing code'],
    [{ code: 'x' }, 'missing language'],
    [{ language: 'python', code: '   ' }, 'blank code'],
    [{ language: 'python', code: 42 }, 'non-string code'],
    [{ language: 'brainfuck', code: 'x' }, 'unsupported language'],
    [{ language: '__proto__', code: 'x' }, 'prototype key as language'],
  ])('rejects %j (%s) with 400 and never calls the executor', async (body) => {
    const res = await post(srv, body)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(true)
    expect(calls).toHaveLength(0)
  })

  test('rejects malformed JSON bodies with 400', async () => {
    const res = await post(srv, '{bad json')
    expect(res.status).toBe(400)
  })

  test('rejects oversized bodies', async () => {
    const res = await post(srv, { language: 'python', code: 'x'.repeat(400_000) })
    expect(res.status).toBe(413)
    expect(calls).toHaveLength(0)
  })

  test('rate-limits repeated runs from one client', async () => {
    for (let i = 0; i < 3; i++) expect((await post(srv, { language: 'python', code: 'x' })).status).toBe(200)
    const res = await post(srv, { language: 'python', code: 'x' })
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe(true)
    expect(calls).toHaveLength(3)
  })

  test('executor failures surface as a 500 JSON error', async () => {
    await srv.stop()
    srv = await startServer({ runCode: async () => { throw new Error('boom') } })
    const res = await post(srv, { language: 'python', code: 'x' })
    expect(res.status).toBe(500)
  })
})

describe('CORS', () => {
  test('wildcard in dev, allow-list when configured', async () => {
    let srv = await startServer()
    let res = await fetch(`${srv.http}/`, { headers: { Origin: 'https://anything.example' } })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    await srv.stop()

    srv = await startServer({ allowedOrigins: ['https://syncra-collab.vercel.app'] })
    res = await fetch(`${srv.http}/`, { headers: { Origin: 'https://syncra-collab.vercel.app' } })
    expect(res.headers.get('access-control-allow-origin')).toBe('https://syncra-collab.vercel.app')
    res = await fetch(`${srv.http}/`, { headers: { Origin: 'https://evil.example' } })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    await srv.stop()
  })
})
