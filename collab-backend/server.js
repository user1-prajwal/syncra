'use strict'

const { createCollabServer } = require('./app')

// ALLOWED_ORIGINS="https://syncra-collab.vercel.app,http://localhost:5173"
// Leave unset in local development to allow any origin.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const collab = createCollabServer({ allowedOrigins })
const PORT = Number(process.env.PORT) || 4000

collab.listen(PORT).then((port) => {
  console.log(`Backend running on http://localhost:${port}`)
  if (allowedOrigins.length === 0) {
    console.warn('ALLOWED_ORIGINS is not set: accepting requests from any origin')
  }
})

// Render sends SIGTERM on deploy/restart: close sockets cleanly before exiting.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    collab.close().finally(() => process.exit(0))
  })
}
