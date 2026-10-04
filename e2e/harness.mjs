// Shared E2E harness: in-process backend + built frontend (vite preview) + real Chromium.
//
// Environment variables (all optional):
//   CHROME_PATH      use this Chromium/Chrome binary with puppeteer-core (default: puppeteer's own Chrome)
//   CHROME_ARGS      extra launch flags, space separated
//   MONACO_LOCAL_DIR serve Monaco from this local `monaco-editor/min/vs` directory instead of the
//                    jsDelivr CDN (for machines without internet access)
import { test } from 'node:test'
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

// Run `fn` but give up after `ms` (used so diagnostics can never hang the run themselves).
const withTimeout = (promise, ms, label) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms))])

export async function waitUntil(fn, ms = 20000, label = 'condition') {
  const t = Date.now()
  while (Date.now() - t < ms) {
    if (await fn()) return
    await sleep(100)
  }
  throw new Error(`timed out waiting for ${label}`)
}

let currentStack = null
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts')

// Printed (and saved) when a test fails or hangs, so a CI failure explains itself.
async function dumpDiagnostics(testName, pages) {
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  console.log(`\n===== DIAGNOSTICS for: ${testName} =====`)
  let i = 0
  for (const page of pages) {
    i++
    await withTimeout(page.bringToFront(), 1500, 'bringToFront').catch(() => {}) // hidden tabs cannot be screenshotted
    try {
      const info = await withTimeout(
        page.evaluate(() => ({
          url: location.href,
          visibility: document.visibilityState,
          hasFocus: document.hasFocus(),
          editors: window.monaco ? window.monaco.editor.getEditors().length : 'monaco not loaded',
          editorBound: window.monaco ? window.monaco.editor.getEditors().map((e) => e.getContainerDomNode().dataset.collabBound === 'true') : [],
          editorText: window.monaco && window.monaco.editor.getEditors()[0] ? window.monaco.editor.getEditors()[0].getModel().getValue().slice(0, 120) : null,
          page: document.body.innerText.slice(0, 250).replace(/\s+/g, ' '),
        })),
        3000,
        'page.evaluate',
      )
      console.log(`tab ${i}:`, JSON.stringify(info))
    } catch (e) {
      console.log(`tab ${i}: could not inspect page (${e.message})`)
    }
    console.log(`tab ${i} console (last 10):\n  ` + page.logs.slice(-10).join('\n  '))
    try {
      const file = path.join(ARTIFACTS, `${testName.replace(/\W+/g, '_').slice(0, 60)}-tab${i}.png`)
      await withTimeout(page.screenshot({ path: file }), 3000, 'screenshot')
      console.log(`tab ${i} screenshot: ${file}`)
    } catch (e) {
      console.log(`tab ${i}: no screenshot (${e.message})`)
    }
  }
  console.log('===== END DIAGNOSTICS =====\n')
}

// A test with its OWN timeout. If a step hangs, only this test fails (with diagnostics) instead of the
// whole file timing out silently and losing every result in it.
export function e2eTest(name, fn, { timeout = 60000 } = {}) {
  // node's own limit is far larger than ours so that our diagnostics always get to finish
  test(name, { timeout: timeout + 60000 }, async () => {
    const firstPage = currentStack ? currentStack.pages.length : 0
    let timer
    const hung = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error(`test hung: no result after ${timeout}ms (see DIAGNOSTICS above)`)), timeout)
    })
    try {
      await Promise.race([fn(), hung])
    } catch (e) {
      await dumpDiagnostics(name, currentStack ? currentStack.pages.slice(firstPage) : [])
      throw e
    } finally {
      clearTimeout(timer)
      // Close this test's tabs: leftover tabs keep reconnecting to the server and slow every later test down.
      for (const page of currentStack ? currentStack.pages.slice(firstPage) : []) await withTimeout(page.close(), 3000, 'page.close').catch(() => {})
    }
  })
}
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
    pages: [],
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
  currentStack = stack
  return stack
}

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.map': 'application/json' }

export async function newTab(stack, room, name) {
  const page = await stack.browser.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  page.logs = logs
  stack.pages.push(page)

  if (process.env.E2E_SIMULATE_BACKGROUND_TABS) {
    // Test-only switch: reproduces a tab that is not being rendered (e.g. a background tab in new headless Chrome),
    // where IntersectionObserver callbacks never fire.
    await page.evaluateOnNewDocument(() => {
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } }
    })
  }
  if (process.env.E2E_CPU_THROTTLE) {
    // Test-only switch: make the browser N times slower, like a busy CI runner, to expose timing races.
    const cdp = await page.createCDPSession()
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.E2E_CPU_THROTTLE) })
  }
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
  await page.bringToFront()
  const NAME_INPUT = 'input[placeholder="Your display name..."]'
  await waitUntil(() => page.evaluate((s) => !!document.querySelector(s), NAME_INPUT), 30000, 'the name prompt')
  await page.evaluate((s) => document.querySelector(s).focus(), NAME_INPUT)
  await page.keyboard.type(name)
  await page.keyboard.press('Enter')
  await waitUntil(() => page.evaluate(() => !!window.monaco), 30000, 'Monaco to load')
  await waitForBoundEditor(page, 30000)
  return page
}

// The editor that is connected to the shared document (and not one that is about to be replaced).
// `data-collab-bound` is set by the app's Yjs binding; `data-stale` is set by these helpers on editors
// that existed before an action that remounts the editor (new file, file switch).
const PICK_EDITOR = `(() => {
  const eds = window.monaco.editor.getEditors()
  return eds.find((e) => { const d = e.getContainerDomNode(); return d.dataset.collabBound === 'true' && !d.dataset.stale }) || eds[0]
})()`
const HAS_BOUND_EDITOR = `window.monaco.editor.getEditors().some((e) => { const d = e.getContainerDomNode(); return d.dataset.collabBound === 'true' && !d.dataset.stale })`

export const waitForBoundEditor = (page, ms = 15000) =>
  waitUntil(() => page.evaluate(HAS_BOUND_EDITOR), ms, 'the editor to be connected to the shared document')

const markEditorsStale = (page) =>
  page.evaluate(() => window.monaco.editor.getEditors().forEach((e) => e.getContainerDomNode().setAttribute('data-stale', '1')))

// After an action that should remount the editor: wait for the NEW editor to connect. If the editor was
// not remounted (e.g. the file was already open), fall back after a short wait.
async function waitForFreshEditor(page) {
  try {
    await waitForBoundEditor(page, 4000)
  } catch {
    await page.evaluate(() => window.monaco.editor.getEditors().forEach((e) => e.getContainerDomNode().removeAttribute('data-stale')))
    await waitForBoundEditor(page, 15000)
  }
}

export const editorText = (page) => page.evaluate(`${PICK_EDITOR}.getModel().getValue()`)

export const focusEditor = (page) => page.evaluate(`${PICK_EDITOR}.focus()`)

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
  await waitForBoundEditor(page) // never type into an editor that is not yet connected to the document
  await focusEditor(page)
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

// NOTE: these helpers use plain DOM actions and polling on purpose. Puppeteer's page.click() waits for an
// IntersectionObserver callback with no timeout, which never fires for a tab that is not being rendered
// (a background tab in full headless Chrome), so it could hang forever. DOM clicks and keyboard events do not care.
const clickSelector = (page, selector) =>
  page.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error(`no element for ${s}`); el.click() }, selector)

export async function createFileViaUI(page, name) {
  await page.bringToFront()
  await markEditorsStale(page)
  await clickSelector(page, 'button[title="New file"]')
  const INPUT = 'input[placeholder="filename.py"]'
  await waitUntil(() => page.evaluate((s) => !!document.querySelector(s), INPUT), 10000, 'the new-file input')
  await page.evaluate((s) => document.querySelector(s).focus(), INPUT)
  await page.keyboard.type(name)
  await page.keyboard.press('Enter')
  await waitUntil(async () => (await fileNames(page)).includes(name), 8000, `${name} to appear`)
  await waitForFreshEditor(page) // the new file opens in a NEW editor: wait until it is connected
}

export async function deleteFileViaUI(page, name) {
  await page.bringToFront()
  // The delete button only exists while the row is hovered: send the hover event React listens for.
  await page.evaluate(`(() => {
    const row = ${PANEL_ROWS}.find((d) => d.children[1].textContent === ${JSON.stringify(name)})
    if (!row) throw new Error('no row for ' + ${JSON.stringify(name)})
    row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }))
  })()`)
  await waitUntil(() => page.evaluate(() => !!document.querySelector('button[title="Delete file"]')), 8000, 'the delete button')
  await clickSelector(page, 'button[title="Delete file"]')
  await waitUntil(async () => !(await fileNames(page)).includes(name), 8000, `${name} to disappear`)
}

export async function selectFile(page, name) {
  await page.bringToFront()
  await markEditorsStale(page)
  await page.evaluate(`${PANEL_ROWS}.find((d) => d.children[1].textContent === ${JSON.stringify(name)}).click()`)
  await waitForFreshEditor(page)
}

export const moveCursorToEnd = async (page) => {
  await waitForBoundEditor(page)
  await page.evaluate(`(() => { const ed = ${PICK_EDITOR}; ed.setPosition(ed.getModel().getFullModelRange().getEndPosition()); ed.focus() })()`)
}
