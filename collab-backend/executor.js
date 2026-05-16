// const { exec } = require('child_process')
// const fs = require('fs')
// const path = require('path')
// const os = require('os')

// // Map language to docker image and file extension
// const LANGUAGE_CONFIG = {
//   javascript: {
//     image: 'node:18-alpine',
//     filename: 'solution.js',
//     command: 'node solution.js'
//   },
// //   typescript: {
// //     image: 'node:18-alpine',
// //     filename: 'solution.ts',
// //     command: 'npm install -g ts-node typescript 2>/dev/null && ts-node solution.ts'
// //   },
//   python: {
//     image: 'python:3.11-alpine',
//     filename: 'solution.py',
//     command: 'python solution.py'
//   },
//   java: {
//     image: 'openjdk:17-alpine',
//     filename: 'Main.java',
//     command: 'javac Main.java && java Main'
//   },
//   cpp: {
//     image: 'gcc:latest',
//     filename: 'solution.cpp',
//     command: 'g++ solution.cpp -o solution && ./solution'
//   }
// }

// function runCode(language, code) {
//   return new Promise((resolve) => {
//     const config = LANGUAGE_CONFIG[language]

//     if (!config) {
//       resolve({ output: '❌ Language not supported', error: true })
//       return
//     }

//     // Create a temp folder for this execution
//     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-'))
//     const filePath = path.join(tmpDir, config.filename)

//     // Write code to file
//     fs.writeFileSync(filePath, code)

//     // Build docker command
//     const dockerCmd = [
//       'docker run',
//       '--rm',                          // auto delete container after run
//       '--memory=128m',                 // max 128MB memory
//       '--cpus=0.5',                    // max 50% CPU
//       '--network=none',                // no internet access
//       `--volume="${tmpDir}:/code"`,    // mount code folder
//       '--workdir=/code',               // set working directory
//       config.image,                    // which docker image
//       'sh', '-c',                      // run shell command
//       `"${config.command}"`           // the actual run command
//     ].join(' ')

//     console.log(`Running: ${dockerCmd}`)

//     // Execute with 10 second timeout
//     exec(dockerCmd, { timeout: 30000 }, (error, stdout, stderr) => {
//       // Clean up temp folder
//       try { fs.rmSync(tmpDir, { recursive: true }) } catch (e) {}

//       if (error && error.killed) {
//         resolve({ output: '⏱️ Time limit exceeded (10 seconds)', error: true })
//         return
//       }

//       if (stderr && !stdout) {
//         resolve({ output: '❌ Error:\n' + stderr, error: true })
//         return
//       }

//       resolve({ 
//         output: stdout || '✅ Ran successfully (no output)',
//         error: false 
//       })
//     })
//   })
// }

// module.exports = { runCode }



const https = require('https')

function runCode(language, code) {
  return new Promise((resolve) => {

    const langMap = {
      javascript: { language: 'javascript', version: '18.15.0' },
      python:     { language: 'python',     version: '3.10.0' },
      java:       { language: 'java',       version: '15.0.2' },
      cpp:        { language: 'c++',        version: '10.2.0' },
    }

    const lang = langMap[language]
    if (!lang) {
      resolve({ output: '❌ Language not supported', error: true })
      return
    }

    const body = JSON.stringify({
      language: lang.language,
      version: lang.version,
      files: [{ content: code }]
    })

    const options = {
      hostname: 'emkc.org',
      path: '/api/v2/piston/execute',
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
          const output = result.run.stdout || result.run.stderr || '✅ Ran successfully (no output)'
          resolve({ output, error: !!result.run.stderr })
        } catch {
          resolve({ output: '❌ Failed to parse response', error: true })
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