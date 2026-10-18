'use strict'

const http = require('http')
const https = require('https')

// ─────────────────────────────────────────────────────────────────────────────
// Code execution is the one part of Syncra that costs money per use, and it is run by someone else. So it
// is isolated behind a small "provider" interface:
//
//   provider = { name, supports(language), run(language, code) -> { output, error } }
//
//   - run() RETURNS for anything the user's program did (including compile errors and crashes).
//   - run() THROWS a ProviderError when the SERVICE failed (network, timeout, quota, auth, 5xx, bad reply).
//
// The executor tries providers in order, skips ones that keep failing (circuit breaker), limits how many
// runs happen at once (queue) and can enforce a daily budget. Switching or adding a service never touches
// app.js or the frontend.
// ─────────────────────────────────────────────────────────────────────────────

// Syncra language id -> onlinecompiler.io compiler id. These 12 are the languages Syncra can run.
const LANG_MAP = {
  python: 'python-3.14',
  c: 'gcc-15',
  cpp: 'g++-15',
  java: 'openjdk-25',
  typescript: 'typescript-deno',
  csharp: 'dotnet-csharp-9',
  fsharp: 'dotnet-fsharp-9',
  php: 'php-8.5',
  ruby: 'ruby-4.0',
  haskell: 'haskell-9.12',
  go: 'go-1.26',
  rust: 'rust-1.93',
}

// Syncra language id -> names a Piston server might use for it. The first one that is installed there wins,
// because Piston installations differ (for example "csharp.net" versus "mono").
const PISTON_NAMES = {
  python: ['python', 'python3'],
  c: ['c', 'gcc'],
  cpp: ['c++', 'cpp', 'g++'],
  java: ['java'],
  typescript: ['typescript', 'ts'],
  csharp: ['csharp.net', 'csharp', 'dotnet', 'mono'],
  fsharp: ['fsharp.net', 'fsharp'],
  php: ['php'],
  ruby: ['ruby'],
  haskell: ['haskell'],
  go: ['go', 'golang'],
  rust: ['rust'],
}

const EXECUTION_TIMEOUT_MS = 30000
const MAX_OUTPUT_CHARS = 100_000
const MAX_RESPONSE_BYTES = 2_000_000
const NO_OUTPUT = '✅ Ran successfully (no output)'

function isSupportedLanguage(language) {
  return typeof language === 'string' && Object.hasOwn(LANG_MAP, language)
}

class ProviderError extends Error {}

const clip = (text) =>
  text.length > MAX_OUTPUT_CHARS ? text.slice(0, MAX_OUTPUT_CHARS) + '\n…(output truncated)' : text

// Minimal JSON-over-HTTP(S) helper. Resolves { status, json } (json is null if the body was not JSON) and
// rejects with a ProviderError on network errors, timeouts or oversized replies.
function request(method, urlString, { body, headers = {}, timeoutMs = EXECUTION_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let url
    try {
      url = new URL(urlString)
    } catch {
      return reject(new ProviderError(`invalid URL: ${urlString}`))
    }
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const lib = url.protocol === 'http:' ? http : https
    const req = lib.request(
      url,
      {
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          data += chunk
          if (data.length > MAX_RESPONSE_BYTES) {
            req.destroy()
            reject(new ProviderError('response too large'))
          }
        })
        res.on('end', () => {
          let json = null
          try {
            json = JSON.parse(data)
          } catch {
            /* not JSON */
          }
          resolve({ status: res.statusCode, json })
        })
      },
    )
    req.on('error', (e) => reject(new ProviderError(`network error: ${e.message}`)))
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new ProviderError('timeout'))
    })
    if (payload) req.write(payload)
    req.end()
  })
}

// Statuses that mean "the service is unwell or refusing us", never "your program is wrong".
const isServiceStatus = (status) => status === 401 || status === 403 || status === 429 || status >= 500

// ── Provider: onlinecompiler.io (hosted, free quota) ─────────────────────────
function onlineCompilerProvider({
  apiKey,
  url = 'https://api.onlinecompiler.io/api/run-code-sync/',
  timeoutMs = EXECUTION_TIMEOUT_MS,
}) {
  return {
    name: 'onlinecompiler',
    supports: isSupportedLanguage,
    async run(language, code) {
      const { status, json } = await request('POST', url, {
        body: { compiler: LANG_MAP[language], code, stdin: '' },
        headers: { Authorization: apiKey },
        timeoutMs,
      })
      if (isServiceStatus(status)) throw new ProviderError(`HTTP ${status}`)
      if (!json) throw new ProviderError(`invalid response (HTTP ${status})`)
      if (json.status === 'success') return { output: clip(json.output || NO_OUTPUT), error: false }
      if (json.error) return { output: clip('❌ Error:\n' + json.error), error: true } // the user's program failed
      throw new ProviderError(`unexpected response (HTTP ${status})`)
    },
  }
}

// ── Provider: Piston (open source; self-hosted) ──────────────────────────────
// The public Piston API became whitelist-only on 2026-02-15, so this is meant for YOUR OWN Piston server
// (Docker, privileged container) or for a hosted one you have a key for.
function pistonProvider({
  baseUrl,
  apiKey,
  timeoutMs = EXECUTION_TIMEOUT_MS,
  runTimeoutMs,
  compileTimeoutMs,
  runtimeCacheMs = 10 * 60 * 1000,
  now = Date.now,
}) {
  const trimmed = baseUrl.replace(/\/+$/, '')
  const apiBase = /\/api\/v2$/.test(trimmed) ? trimmed : `${trimmed}/api/v2`
  const headers = apiKey ? { Authorization: apiKey } : {}
  let cache = null // { at, runtimes }

  async function resolveLanguage(language) {
    if (!cache || now() - cache.at > runtimeCacheMs) {
      const { status, json } = await request('GET', `${apiBase}/runtimes`, { headers, timeoutMs: Math.min(timeoutMs, 10000) })
      if (status !== 200 || !Array.isArray(json)) throw new ProviderError(`runtimes unavailable (HTTP ${status})`)
      cache = { at: now(), runtimes: json }
    }
    for (const name of PISTON_NAMES[language] || []) {
      const runtime = cache.runtimes.find((r) => r.language === name || (r.aliases || []).includes(name))
      if (runtime) return runtime.language
    }
    return null
  }

  return {
    name: 'piston',
    supports: (language) => Object.hasOwn(PISTON_NAMES, language),
    async run(language, code) {
      const pistonLanguage = await resolveLanguage(language)
      if (!pistonLanguage) throw new ProviderError(`no runtime for ${language} on this Piston server`)
      // version "*" = whichever version is installed. Timeouts are only sent if configured, because a
      // server rejects values above its own limits.
      const body = { language: pistonLanguage, version: '*', files: [{ content: code }], stdin: '' }
      if (runTimeoutMs) body.run_timeout = runTimeoutMs
      if (compileTimeoutMs) body.compile_timeout = compileTimeoutMs
      const { status, json } = await request('POST', `${apiBase}/execute`, { body, headers, timeoutMs })
      if (status !== 200 || !json || !json.run) {
        throw new ProviderError(`HTTP ${status}${json && json.message ? `: ${json.message}` : ''}`)
      }
      return mapPistonResult(json)
    },
  }
}

function mapPistonResult({ compile, run }) {
  const text = (stage) => (stage.output ?? `${stage.stdout || ''}${stage.stderr || ''}`).toString()
  if (compile && (compile.code !== 0 || compile.signal)) {
    return { output: clip('❌ Compile error:\n' + text(compile)), error: true }
  }
  const out = text(run)
  if (run.signal) {
    return { output: clip(`⏱️ Stopped (${run.signal}): the program used too much time or memory.\n${out}`), error: true }
  }
  if (run.code !== 0) return { output: clip(`❌ Error (exit code ${run.code}):\n${out}`), error: true }
  return { output: clip(out || NO_OUTPUT), error: false }
}

// ── The executor: providers + protection ─────────────────────────────────────
function createExecutor({
  providers = [],
  maxConcurrent = 4, // runs executing at the same moment
  maxQueue = 20, // runs allowed to wait; beyond this users get a "busy" message
  dailyLimit = 0, // total runs per UTC day across all users; 0 = no limit
  breakerThreshold = 3, // consecutive service failures before a provider is skipped
  breakerCooldownMs = 30_000, // how long it is skipped
  totalBudgetMs = 40_000, // stop trying more providers after this long
  now = Date.now,
} = {}) {
  const health = new Map(providers.map((p) => [p, { failures: 0, openUntil: 0 }]))
  let active = 0
  const waiting = []
  const usage = { day: '', count: 0 }

  const acquire = () =>
    new Promise((resolve) => {
      if (active < maxConcurrent) {
        active++
        resolve()
      } else {
        waiting.push(resolve)
      }
    })
  const release = () => {
    const next = waiting.shift()
    if (next) next() // hand the slot straight to the next waiting run
    else active--
  }

  async function runCode(language, code) {
    if (!isSupportedLanguage(language)) return { output: '❌ Language not supported', error: true }
    if (providers.length === 0) return { output: '❌ Code execution is not configured on this server', error: true }

    const day = new Date(now()).toISOString().slice(0, 10)
    if (usage.day !== day) {
      usage.day = day
      usage.count = 0
    }
    if (dailyLimit > 0 && usage.count >= dailyLimit) {
      return { output: '⏳ The daily limit for running code has been reached. Please try again tomorrow.', error: true }
    }
    if (active >= maxConcurrent && waiting.length >= maxQueue) {
      return { output: '⏳ Too many runs right now. Please try again in a few seconds.', error: true }
    }

    await acquire()
    try {
      usage.count++
      const startedAt = now()
      let tried = 0
      for (const provider of providers) {
        const h = health.get(provider)
        if (!provider.supports(language) || h.openUntil > now()) continue
        if (tried > 0 && now() - startedAt > totalBudgetMs) break
        tried++
        try {
          const result = await provider.run(language, code)
          h.failures = 0 // the service answered, even if the user's program failed
          return { ...result, provider: provider.name }
        } catch (err) {
          h.failures++
          if (h.failures >= breakerThreshold) h.openUntil = now() + breakerCooldownMs
          if (!(err instanceof ProviderError)) console.error(`[executor] ${provider.name} crashed:`, err)
        }
      }
      return { output: '❌ Code execution is temporarily unavailable. Please try again in a moment.', error: true }
    } finally {
      release()
    }
  }

  return {
    runCode,
    isSupportedLanguage,
    stats: () => ({
      providers: providers.map((p) => ({ name: p.name, failures: health.get(p).failures, open: health.get(p).openUntil > now() })),
      runsToday: usage.count,
      active,
      queued: waiting.length,
    }),
  }
}

// Builds providers from environment variables:
//   PISTON_URL (+ optional PISTON_API_KEY)   a Piston server you run, for example http://my-server:2000
//   ONLINECOMPILER_API_KEY                   the hosted service
//   EXEC_PROVIDERS                           order to try them, default "piston,onlinecompiler"
function buildProvidersFromEnv(env = process.env) {
  const available = {}
  if (env.PISTON_URL) {
    available.piston = pistonProvider({
      baseUrl: env.PISTON_URL,
      apiKey: env.PISTON_API_KEY,
      runTimeoutMs: Number(env.PISTON_RUN_TIMEOUT_MS) || undefined,
      compileTimeoutMs: Number(env.PISTON_COMPILE_TIMEOUT_MS) || undefined,
    })
  }
  if (env.ONLINECOMPILER_API_KEY) available.onlinecompiler = onlineCompilerProvider({ apiKey: env.ONLINECOMPILER_API_KEY })
  const order = (env.EXEC_PROVIDERS || 'piston,onlinecompiler').split(',').map((s) => s.trim())
  return order.filter((name) => available[name]).map((name) => available[name])
}

const intFromEnv = (value, fallback) => (Number.isFinite(Number(value)) && value !== undefined && value !== '' ? Number(value) : fallback)

const defaultExecutor = createExecutor({
  providers: buildProvidersFromEnv(process.env),
  maxConcurrent: intFromEnv(process.env.EXEC_MAX_CONCURRENT, 4),
  maxQueue: intFromEnv(process.env.EXEC_MAX_QUEUE, 20),
  dailyLimit: intFromEnv(process.env.EXEC_DAILY_LIMIT, 0),
})

module.exports = {
  runCode: defaultExecutor.runCode,
  isSupportedLanguage,
  stats: defaultExecutor.stats,
  LANG_MAP,
  createExecutor,
  pistonProvider,
  onlineCompilerProvider,
  buildProvidersFromEnv,
  ProviderError,
}
