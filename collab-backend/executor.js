'use strict'

const https = require('https')

// Syncra language id -> onlinecompiler.io compiler id.
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

const EXECUTION_TIMEOUT_MS = 30000

function isSupportedLanguage(language) {
  return typeof language === 'string' && Object.hasOwn(LANG_MAP, language)
}

// Resolves (never rejects) with { output, error }.
function runCode(language, code) {
  return new Promise((resolve) => {
    if (!isSupportedLanguage(language)) {
      resolve({ output: '❌ Language not supported', error: true })
      return
    }
    const apiKey = process.env.ONLINECOMPILER_API_KEY
    if (!apiKey) {
      resolve({ output: '❌ Code execution is not configured on this server', error: true })
      return
    }

    const body = JSON.stringify({ compiler: LANG_MAP[language], code, stdin: '' })
    const options = {
      hostname: 'api.onlinecompiler.io',
      path: '/api/run-code-sync/',
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.status === 'success') {
            resolve({ output: result.output || '✅ Ran successfully (no output)', error: false })
          } else if (result.error) {
            resolve({ output: '❌ Error:\n' + result.error, error: true })
          } else {
            resolve({ output: '❌ Unexpected response from execution service', error: true })
          }
        } catch {
          resolve({ output: '❌ Execution service returned an invalid response', error: true })
        }
      })
    })

    req.on('error', () => {
      resolve({ output: '❌ Could not connect to execution server', error: true })
    })

    req.setTimeout(EXECUTION_TIMEOUT_MS, () => {
      req.destroy()
      resolve({ output: '⏱️ Time limit exceeded (30s)', error: true })
    })

    req.write(body)
    req.end()
  })
}

module.exports = { runCode, isSupportedLanguage, LANG_MAP }
