'use strict'

const http = require('http')
const {
  createExecutor,
  pistonProvider,
  onlineCompilerProvider,
  buildProvidersFromEnv,
  ProviderError,
  isSupportedLanguage,
} = require('../executor')

// A real HTTP server on a random port, standing in for Piston / onlinecompiler.io.
async function mockServer(handler) {
  const calls = []
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const call = { method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : undefined }
      calls.push(call)
      handler(call, res)
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r) }),
  }
}
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const RUNTIMES = [
  { language: 'python', version: '3.12.0', aliases: ['py', 'python3'] },
  { language: 'c++', version: '10.2.0', aliases: ['cpp', 'g++'] },
  { language: 'csharp.net', version: '5.0.201', aliases: ['dotnet', 'c#'] },
  { language: 'go', version: '1.16.2', aliases: ['golang'] },
]
const okRun = (output) => ({ language: 'x', version: '1', run: { stdout: output, stderr: '', output, code: 0, signal: null } })

// A Piston server that answers /runtimes and lets each test decide what /execute does.
const pistonServer = (execute, runtimes = RUNTIMES) =>
  mockServer((call, res) => {
    if (call.url === '/api/v2/runtimes') return json(res, 200, runtimes)
    if (call.url === '/api/v2/execute') return execute(call, res)
    json(res, 404, { message: 'not found' })
  })

let servers = []
const track = (s) => (servers.push(s), s)
afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()))
  servers = []
})

describe('Piston provider', () => {
  test('runs code and sends the right request', async () => {
    const s = track(await pistonServer((c, res) => json(res, 200, okRun('hello\n'))))
    const p = pistonProvider({ baseUrl: s.url })
    expect(await p.run('python', 'print("hello")')).toEqual({ output: 'hello\n', error: false })
    const exec = s.calls.find((c) => c.url === '/api/v2/execute')
    expect(exec.body).toMatchObject({ language: 'python', version: '*', files: [{ content: 'print("hello")' }] })
    expect(exec.body.run_timeout).toBeUndefined() // timeouts are only sent when configured
  })

  test('accepts the base URL with or without /api/v2 and a trailing slash', async () => {
    const s = track(await pistonServer((c, res) => json(res, 200, okRun('ok'))))
    for (const url of [s.url, `${s.url}/`, `${s.url}/api/v2`, `${s.url}/api/v2/`]) {
      expect((await pistonProvider({ baseUrl: url }).run('python', 'x')).output).toBe('ok')
    }
  })

  test('picks whichever name is installed on the server (cpp -> c++, csharp -> csharp.net)', async () => {
    const s = track(await pistonServer((c, res) => json(res, 200, okRun('ok'))))
    const p = pistonProvider({ baseUrl: s.url })
    await p.run('cpp', 'x')
    await p.run('csharp', 'x')
    await p.run('go', 'x')
    const langs = s.calls.filter((c) => c.url === '/api/v2/execute').map((c) => c.body.language)
    expect(langs).toEqual(['c++', 'csharp.net', 'go'])
  })

  test('asks for the runtime list once and reuses it', async () => {
    const s = track(await pistonServer((c, res) => json(res, 200, okRun('ok'))))
    const p = pistonProvider({ baseUrl: s.url })
    await p.run('python', 'x')
    await p.run('python', 'y')
    expect(s.calls.filter((c) => c.url === '/api/v2/runtimes')).toHaveLength(1)
  })

  test('sends the API key when configured, and run/compile timeouts when configured', async () => {
    const s = track(await pistonServer((c, res) => json(res, 200, okRun('ok'))))
    await pistonProvider({ baseUrl: s.url, apiKey: 'secret', runTimeoutMs: 3000, compileTimeoutMs: 8000 }).run('python', 'x')
    const exec = s.calls.find((c) => c.url === '/api/v2/execute')
    expect(exec.headers.authorization).toBe('secret')
    expect(exec.body).toMatchObject({ run_timeout: 3000, compile_timeout: 8000 })
  })

  test('maps a compile error, a crash, a killed program and empty output', async () => {
    const replies = [
      { compile: { stdout: '', stderr: 'main.c:1: error', output: 'main.c:1: error', code: 1, signal: null }, run: { code: null, output: '' } },
      { run: { stdout: '', stderr: 'Traceback...', output: 'Traceback...', code: 1, signal: null } },
      { run: { stdout: '', stderr: '', output: '', code: null, signal: 'SIGKILL' } },
      { run: { stdout: '', stderr: '', output: '', code: 0, signal: null } },
    ]
    let i = 0
    const s = track(await pistonServer((c, res) => json(res, 200, replies[i++])))
    const p = pistonProvider({ baseUrl: s.url })
    expect(await p.run('python', 'x')).toEqual({ output: '❌ Compile error:\nmain.c:1: error', error: true })
    expect(await p.run('python', 'x')).toEqual({ output: '❌ Error (exit code 1):\nTraceback...', error: true })
    const killed = await p.run('python', 'x')
    expect(killed.error).toBe(true)
    expect(killed.output).toMatch(/Stopped \(SIGKILL\)/)
    expect(await p.run('python', 'x')).toEqual({ output: '✅ Ran successfully (no output)', error: false })
  })

  test('treats service problems as ProviderError, not as a user error', async () => {
    const s = track(await pistonServer((c, res) => json(res, 401, { message: 'Public Piston API is now whitelist only' })))
    await expect(pistonProvider({ baseUrl: s.url }).run('python', 'x')).rejects.toThrow(/HTTP 401.*whitelist only/)
    await expect(pistonProvider({ baseUrl: s.url }).run('python', 'x')).rejects.toBeInstanceOf(ProviderError)
  })

  test('a language with no installed runtime is a ProviderError (so the next provider can try)', async () => {
    const s = track(await pistonServer((c, res) => json(res, 200, okRun('ok'))))
    await expect(pistonProvider({ baseUrl: s.url }).run('rust', 'x')).rejects.toThrow(/no runtime for rust/)
  })

  test('a server that never answers times out', async () => {
    const s = track(await pistonServer(() => {})) // never responds to /execute
    await expect(pistonProvider({ baseUrl: s.url, timeoutMs: 150 }).run('python', 'x')).rejects.toThrow(/timeout/)
  })

  test('a server that is not running is a ProviderError', async () => {
    await expect(pistonProvider({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 500 }).run('python', 'x')).rejects.toBeInstanceOf(ProviderError)
  })
})

describe('onlinecompiler provider', () => {
  const make = (handler) => mockServer((call, res) => handler(call, res))

  test('success, user error and empty output', async () => {
    const replies = [{ status: 'success', output: '42\n' }, { status: 'error', error: 'SyntaxError' }, { status: 'success', output: '' }]
    let i = 0
    const s = track(await make((c, res) => json(res, 200, replies[i++])))
    const p = onlineCompilerProvider({ apiKey: 'k', url: `${s.url}/api/run-code-sync/` })
    expect(await p.run('python', 'x')).toEqual({ output: '42\n', error: false })
    expect(await p.run('python', 'x')).toEqual({ output: '❌ Error:\nSyntaxError', error: true })
    expect(await p.run('python', 'x')).toEqual({ output: '✅ Ran successfully (no output)', error: false })
    expect(s.calls[0].headers.authorization).toBe('k')
    expect(s.calls[0].body).toEqual({ compiler: 'python-3.14', code: 'x', stdin: '' })
  })

  test.each([401, 403, 429, 500, 503])('HTTP %i is a service failure even if the body has an "error" field', async (status) => {
    const s = track(await make((c, res) => json(res, status, { error: 'quota exceeded' })))
    await expect(onlineCompilerProvider({ apiKey: 'k', url: s.url }).run('python', 'x')).rejects.toBeInstanceOf(ProviderError)
  })

  test('a reply that is not JSON is a service failure', async () => {
    const s = track(await make((c, res) => { res.writeHead(200); res.end('<html>oops</html>') }))
    await expect(onlineCompilerProvider({ apiKey: 'k', url: s.url }).run('python', 'x')).rejects.toThrow(/invalid response/)
  })
})

describe('executor: fallback, circuit breaker, limits', () => {
  const stub = (name, behaviour) => ({ name, supports: () => true, run: jest.fn(behaviour) })
  const ok = (text = 'ok') => async () => ({ output: text, error: false })
  const down = () => async () => { throw new ProviderError('HTTP 500') }

  test('uses the next provider when the first one fails, and reports which one answered', async () => {
    const a = stub('a', down())
    const b = stub('b', ok('from b'))
    const r = await createExecutor({ providers: [a, b] }).runCode('python', 'x')
    expect(r).toEqual({ output: 'from b', error: false, provider: 'b' })
    expect(a.run).toHaveBeenCalledTimes(1)
  })

  test('a mistake in the USER\'s program does not trigger a fallback or count against the provider', async () => {
    const a = stub('a', async () => ({ output: '❌ Error:\nSyntaxError', error: true }))
    const b = stub('b', ok())
    const ex = createExecutor({ providers: [a, b], breakerThreshold: 2 })
    for (let i = 0; i < 5; i++) expect((await ex.runCode('python', 'x')).provider).toBe('a')
    expect(b.run).not.toHaveBeenCalled()
    expect(ex.stats().providers[0]).toMatchObject({ failures: 0, open: false })
  })

  test('circuit breaker: a failing provider is skipped, then retried after the cooldown', async () => {
    let t = 1_000_000
    const a = stub('a', down())
    const b = stub('b', ok())
    const ex = createExecutor({ providers: [a, b], breakerThreshold: 3, breakerCooldownMs: 30_000, now: () => t })
    for (let i = 0; i < 6; i++) await ex.runCode('python', 'x')
    expect(a.run).toHaveBeenCalledTimes(3) // tried 3 times, then skipped for the other 3 runs
    expect(ex.stats().providers[0].open).toBe(true)
    t += 31_000 // cooldown over
    await ex.runCode('python', 'x')
    expect(a.run).toHaveBeenCalledTimes(4) // one trial run
    await ex.runCode('python', 'x')
    expect(a.run).toHaveBeenCalledTimes(4) // failed again, so it is skipped again straight away
  })

  test('a provider that recovers is used again and its failure count resets', async () => {
    let healthy = false
    const a = stub('a', async () => { if (!healthy) throw new ProviderError('x'); return { output: 'ok', error: false } })
    const ex = createExecutor({ providers: [a], breakerThreshold: 3 })
    await ex.runCode('python', 'x')
    await ex.runCode('python', 'x')
    healthy = true
    expect((await ex.runCode('python', 'x')).provider).toBe('a')
    expect(ex.stats().providers[0].failures).toBe(0)
  })

  test('when every provider is down the user gets a friendly message', async () => {
    const ex = createExecutor({ providers: [stub('a', down()), stub('b', down())] })
    const r = await ex.runCode('python', 'x')
    expect(r.error).toBe(true)
    expect(r.output).toMatch(/temporarily unavailable/)
  })

  test('providers that do not support the language are skipped', async () => {
    const a = { name: 'a', supports: () => false, run: jest.fn() }
    const b = stub('b', ok())
    expect((await createExecutor({ providers: [a, b] }).runCode('python', 'x')).provider).toBe('b')
    expect(a.run).not.toHaveBeenCalled()
  })

  test('unsupported language and no providers configured', async () => {
    expect((await createExecutor({ providers: [stub('a', ok())] }).runCode('brainfuck', 'x')).output).toMatch(/not supported/)
    expect((await createExecutor({ providers: [stub('a', ok())] }).runCode('__proto__', 'x')).output).toMatch(/not supported/)
    expect((await createExecutor({ providers: [] }).runCode('python', 'x')).output).toMatch(/not configured/)
    expect(isSupportedLanguage('python')).toBe(true)
  })

  test('daily budget: stops at the limit and starts again on the next UTC day', async () => {
    let t = Date.parse('2026-10-16T10:00:00Z')
    const a = stub('a', ok())
    const ex = createExecutor({ providers: [a], dailyLimit: 3, now: () => t })
    for (let i = 0; i < 3; i++) expect((await ex.runCode('python', 'x')).error).toBe(false)
    const blocked = await ex.runCode('python', 'x')
    expect(blocked.output).toMatch(/daily limit/)
    expect(a.run).toHaveBeenCalledTimes(3) // the provider was not called, so no quota was used
    t = Date.parse('2026-10-17T00:00:01Z')
    expect((await ex.runCode('python', 'x')).error).toBe(false)
  })

  test('back-pressure: runs beyond the limit wait in a queue, and beyond the queue are turned away', async () => {
    const releases = []
    const slow = stub('slow', () => new Promise((resolve) => releases.push(() => resolve({ output: 'done', error: false }))))
    const ex = createExecutor({ providers: [slow], maxConcurrent: 1, maxQueue: 1 })

    const first = ex.runCode('python', 'a') // running
    await new Promise((r) => setImmediate(r))
    const second = ex.runCode('python', 'b') // waiting in the queue
    await new Promise((r) => setImmediate(r))
    const third = await ex.runCode('python', 'c') // queue full
    expect(third.output).toMatch(/Too many runs/)
    expect(ex.stats()).toMatchObject({ active: 1, queued: 1 })

    releases[0]() // finish the first run -> the queued one starts
    expect((await first).output).toBe('done')
    await new Promise((r) => setImmediate(r))
    expect(releases).toHaveLength(2)
    releases[1]()
    expect((await second).output).toBe('done')
    expect(ex.stats()).toMatchObject({ active: 0, queued: 0 })
  })

  test('a slot is released even when a provider crashes with an unexpected error', async () => {
    const crashing = stub('c', async () => { throw new TypeError('bug') })
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const ex = createExecutor({ providers: [crashing], maxConcurrent: 1, maxQueue: 0 })
    await ex.runCode('python', 'x')
    await ex.runCode('python', 'x') // would be "Too many runs" if the slot had leaked
    expect(crashing.run).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  test('very long output is truncated', async () => {
    const s = track(await pistonServer((c, res) => json(res, 200, okRun('x'.repeat(300_000)))))
    const r = await pistonProvider({ baseUrl: s.url }).run('python', 'x')
    expect(r.output.length).toBeLessThan(101_000)
    expect(r.output).toMatch(/output truncated/)
  })
})

describe('fallback across real HTTP services', () => {
  test('Piston is down (500) -> onlinecompiler answers; user sees the result', async () => {
    const piston = track(await mockServer((c, res) => json(res, 500, { message: 'boom' })))
    const oc = track(await mockServer((c, res) => json(res, 200, { status: 'success', output: 'hi\n' })))
    const ex = createExecutor({
      providers: [pistonProvider({ baseUrl: piston.url }), onlineCompilerProvider({ apiKey: 'k', url: oc.url })],
    })
    expect(await ex.runCode('python', 'print("hi")')).toEqual({ output: 'hi\n', error: false, provider: 'onlinecompiler' })
  })

  test('the public Piston "whitelist only" answer (401) falls back instead of showing an error', async () => {
    const piston = track(await mockServer((c, res) => json(res, 401, { message: 'Public Piston API is now whitelist only as of 2/15/2026.' })))
    const oc = track(await mockServer((c, res) => json(res, 200, { status: 'success', output: 'still works' })))
    const ex = createExecutor({
      providers: [pistonProvider({ baseUrl: piston.url }), onlineCompilerProvider({ apiKey: 'k', url: oc.url })],
    })
    expect((await ex.runCode('python', 'x')).output).toBe('still works')
  })
})

describe('buildProvidersFromEnv', () => {
  const names = (env) => buildProvidersFromEnv(env).map((p) => p.name)
  test('nothing configured -> no providers', () => expect(names({})).toEqual([]))
  test('only the onlinecompiler key -> that one', () => expect(names({ ONLINECOMPILER_API_KEY: 'k' })).toEqual(['onlinecompiler']))
  test('only a Piston URL -> that one', () => expect(names({ PISTON_URL: 'http://x:2000' })).toEqual(['piston']))
  test('both -> piston first by default', () => expect(names({ PISTON_URL: 'http://x:2000', ONLINECOMPILER_API_KEY: 'k' })).toEqual(['piston', 'onlinecompiler']))
  test('EXEC_PROVIDERS sets the order and ignores unknown or unconfigured names', () => {
    const env = { PISTON_URL: 'http://x:2000', ONLINECOMPILER_API_KEY: 'k', EXEC_PROVIDERS: 'onlinecompiler, piston, judge0' }
    expect(names(env)).toEqual(['onlinecompiler', 'piston'])
    expect(names({ ONLINECOMPILER_API_KEY: 'k', EXEC_PROVIDERS: 'piston' })).toEqual([])
  })
})
