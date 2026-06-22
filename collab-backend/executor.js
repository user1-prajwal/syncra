const https = require('https')

function runCode(language, code) {
  return new Promise((resolve) => {

    const langMap = {
      python: 'python-3.14',
      c: 'gcc-15',
      cpp: 'g++-15',
      java: 'openjdk-25',
      typescript: 'typescript-deno',
      csharp: 'dotnet-csharp-9'
    }

    const compiler = langMap[language]
    if (!compiler) {
      resolve({ output: '❌ Language not supported', error: true })
      return
    }

    const body = JSON.stringify({
      compiler: compiler,
      code: code,
      stdin: ''
    })

    const options = {
      hostname: 'api.onlinecompiler.io',
      path: '/api/run-code-sync/',
      method: 'POST',
      headers: {
        'Authorization': process.env.ONLINECOMPILER_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          console.log('OnlineCompiler response:', JSON.stringify(result))

          if (result.status === 'success') {
            resolve({
              output: result.output || '✅ Ran successfully (no output)',
              error: false
            })
          } else if (result.error) {
            resolve({ output: '❌ Error:\n' + result.error, error: true })
          } else {
            resolve({ output: '❌ Unexpected response: ' + data, error: true })
          }
        } catch {
          console.log('Raw response:', data)
          resolve({ output: '❌ Failed: ' + data, error: true })
        }
      })
    })

    req.on('error', (e) => {
      console.log('Request error:', e.message)
      resolve({ output: '❌ Could not connect to execution server', error: true })
    })

    req.setTimeout(30000, () => {
      req.destroy()
      resolve({ output: '⏱️ Time limit exceeded (30s)', error: true })
    })

    req.write(body)
    req.end()
  })
}

module.exports = { runCode }