// Shared E2E harness: in-process backend + built frontend (vite preview) + real Chromium.
//
// Environment variables (all optional):
//   CHROME_PATH      use this Chromium/Chrome binary with puppeteer-core (default: puppeteer's own Chrome)
//   CHROME_ARGS      extra launch flags, space separated
//   MONACO_LOCAL_DIR serve Monaco from this local `monaco-editor/min/vs` directory instead of the
//                    jsDelivr CDN (for machines without internet access)
import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const frontendDir = path.join(root, 'collab-editor-frontend')
const require = createRequire(import.meta.url)
const { createCollabServer } = require(path.join(root, 'collab-backend', 'app.js'))

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT || 4455)
const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT || 4466)

export async function startStack(backendOptions = {}) {
  // The backend URL is baked into the frontend bundle at build time.
  execFileSync(process.execPath, [path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'error'], {
    cwd: frontendDir,
    env: { ...process.env, VITE_BACKEND_URL: `http://localhost:${BACKEND_PORT}` },
    stdio: 'inherit',
  })
  const collab = createCollabServer({ heartbeatMs: 60000, ...backendOptions })
  await collab.listen(BACKEND_PORT)
  const preview = spawn(
    process.execPath,
    [path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(FRONTEND_PORT), '--strictPort', '--host', 'localhost'],
    { cwd: frontendDir, stdio: ['ignore', 'ignore', 'inherit'] },
  )
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${FRONTEND_PORT}/`)).ok) break
    } catch {}
    await sleep(150)
  }
  const puppeteer = process.env.CHROME_PATH ? (await import('puppeteer-core')).default : (await import('puppeteer')).default
  const browser = await puppeteer.launch({
    headless: process.env.CHROME_PATH ? 'shell' : true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ') : [])],
  })
  const stack = {
    collab,
    browser,
    url: (room) => `http://localhost:${FRONTEND_PORT}/room/${room}`,
    // Simulates a server crash/redeploy: all sockets die and ALL room state is lost.
    async restartBackend() {
      await stack.collab.close()
      stack.collab = createCollabServer({ heartbeatMs: 60000, ...backendOptions })
      await stack.collab.listen(BACKEND_PORT)
    },
    async stop() {
      await browser.close().catch(() => {})
      preview.kill('SIGTERM')
      await stack.collab.close()
    },
  }
  return stack
}

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.map': 'application/json' }

export async function newTab(stack, room, name) {
  const page = await stack.browser.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  page.logs = logs

  await page.setViewport({ width: 1280, height: 800 }) // desktop layout (the app switches to a mobile layout below 768px)
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const u = req.url()
    const m = /cdn\.jsdelivr\.net\/npm\/monaco-editor@[^/]+\/min\/vs\/(.*?)(\?.*)?$/.exec(u)
    if (m && process.env.MONACO_LOCAL_DIR) {
      const file = path.join(process.env.MONACO_LOCAL_DIR, m[1])
      if (fs.existsSync(file)) {
        return req.respond({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file), headers: { 'Access-Control-Allow-Origin': '*' } })
      }
      return req.respond({ status: 404, body: '' })
    }
    if (u.startsWith('http://localhost') || u.startsWith('ws://localhost') || u.startsWith('data:') || u.startsWith('blob:') || m) return req.continue()
    return req.abort() // fonts and other third-party assets are not needed
  })

  await page.goto(stack.url(room))
  await page.waitForSelector('input[placeholder="Your display name..."]')
  await page.type('input[placeholder="Your display name..."]', name)
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.monaco && window.monaco.editor.getEditors().length > 0 && window.monaco.editor.getEditors()[0].getModel(), { timeout: 30000 })
  return page
}

export const editorText = (page) => page.evaluate(() => window.monaco.editor.getEditors()[0].getModel().getValue())

export async function waitForText(page, expected, timeout = 8000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    last = await editorText(page)
    if (last === expected) return last
    await sleep(50)
  }
  throw new Error(`editor text did not become ${JSON.stringify(expected)}; last was ${JSON.stringify(last)}`)
}

// Replace the whole document with `text` (focus + select-all + type), as a user would.
export async function typeInEditor(page, text, { replaceAll = false } = {}) {
  await page.evaluate(() => window.monaco.editor.getEditors()[0].focus())
  if (replaceAll) {
    await page.keyboard.down('Control')
    await page.keyboard.press('a')
    await page.keyboard.up('Control')
    await page.keyboard.press('Backspace')
  }
  await page.keyboard.type(text, { delay: 5 })
}

// Rows of the Files side panel (each row is: language icon + name). Scoped to the panel under the
// "FILES" label, because the tab bar above the editor also shows file names.
const PANEL_ROWS = `(() => {
  const label = [...document.querySelectorAll('span')].find((s) => s.textContent === 'FILES')
  const panel = label && label.parentElement && label.parentElement.parentElement
  if (!panel) return []
  return [...panel.querySelectorAll('div')].filter((d) => d.children[0]?.tagName === 'IMG' && d.children[1]?.tagName === 'SPAN')
})()`

export const fileNames = (page) => page.evaluate(`${PANEL_ROWS}.map((d) => d.children[1].textContent)`)

export async function createFileViaUI(page, name) {
  await page.click('button[title="New file"]')
  await page.waitForSelector('input[placeholder="filename.py"]')
  await page.type('input[placeholder="filename.py"]', name)
  await page.keyboard.press('Enter')
  await waitUntil(async () => (await fileNames(page)).includes(name), 8000, `${name} to appear`)
}

export async function deleteFileViaUI(page, name) {
  const rect = await page.evaluate(`(() => {
    const row = ${PANEL_ROWS}.find((d) => d.children[1].textContent === ${JSON.stringify(name)})
    const r = row.getBoundingClientRect()
    return { x: r.x, y: r.y, h: r.height }
  })()`)
  await page.mouse.move(rect.x + 30, rect.y + rect.h / 2) // the delete button only appears on hover
  await page.waitForSelector('button[title="Delete file"]')
  await page.click('button[title="Delete file"]')
  await waitUntil(async () => !(await fileNames(page)).includes(name), 8000, `${name} to disappear`)
}

export async function selectFile(page, name) {
  await page.evaluate(`${PANEL_ROWS}.find((d) => d.children[1].textContent === ${JSON.stringify(name)}).click()`)
  await sleep(300) // the editor remounts for the selected file
  await page.waitForFunction(() => window.monaco.editor.getEditors().length > 0)
}

export const moveCursorToEnd = (page) =>
  page.evaluate(() => {
    const ed = window.monaco.editor.getEditors()[0]
    ed.setPosition(ed.getModel().getFullModelRange().getEndPosition())
    ed.focus()
  })

export async function waitUntil(fn, ms = 20000, label = 'condition') {
  const t = Date.now()
  while (Date.now() - t < ms) {
    if (await fn()) return
    await sleep(100)
  }
  throw new Error(`timed out waiting for ${label}`)
}
