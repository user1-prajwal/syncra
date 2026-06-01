const https = require('https')

function runCode(language, code) {
  return new Promise((resolve) => {

    const langMap = {
      javascript: 'javascript',
      python: 'python',
      java: 'java',
      cpp: 'cpp',
    }

    const lang = langMap[language]
    if (!lang) {
      resolve({ output: '❌ Language not supported', error: true })
      return
    }

    // File name per language
    const fileNames = {
      javascript: 'main.js',
      python: 'main.py',
      java: 'Main.java',
      cpp: 'main.cpp',
    }

    const body = JSON.stringify({
      files: [{ name: fileNames[lang], content: code }]
    })

    const options = {
      hostname: 'glot.io',
      path: `/api/run/${lang}/latest`,
      method: 'POST',
      headers: {
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
          console.log('Glot response:', JSON.stringify(result))
          const output =
                result.stdout ||
                result.stderr ||
                '⚠️ Code Execution Unavailable\n\n' +
                'This public demo focuses on real-time collaboration features.\n\n' +
                '✅ Real-time code synchronization\n' +
                '✅ Multi-user collaboration\n' +
                '✅ Live chat and cursor tracking\n' +
                '✅ File management\n\n' +
                'Code execution requires Docker-based sandboxing.\n' +
                'This feature is available only in the local development environment.'
          resolve({ output, error: !!result.stderr })
        } catch {
          console.log('Raw response:', data)
          resolve({ output: '❌ Raw: ' + data, error: true })
        }
      })
    })

    req.on('error', () => {
      resolve({ output: '❌ Could not connect to execution server', error: true })
    })

    req.setTimeout(15000, () => {
      req.destroy()
      resolve({ output: '⏱️ Time limit exceeded', error: true })
    })

    req.write(body)
    req.end()
  })
}

module.exports = { runCode }