import { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { e2eTest, startStack, newTab, waitForText, typeInEditor, sleep } from '../harness.mjs'

let stack
before(async () => { stack = await startStack() })
after(async () => { await stack.stop() })

const waitUntil = async (fn, ms = 15000, label = 'condition') => {
  const t = Date.now()
  while (Date.now() - t < ms) { if (await fn()) return; await sleep(100) }
  throw new Error(`timed out waiting for ${label}`)
}

e2eTest('after the server drops every connection, tabs reconnect, re-join under the same name, and keep syncing', async () => {
  const a = await newTab(stack, 'REC01', 'Ana')
  const b = await newTab(stack, 'REC01', 'Bo')
  await typeInEditor(a, 'before', { replaceAll: true })
  await waitForText(b, 'before')

  // simulate a network failure: the server kills every socket without a clean close
  for (const ws of stack.collab.wss.clients) ws.terminate()
  await waitUntil(() => stack.collab.store.get('REC01').users.size === 2, 20000, 'both tabs to re-join')
  assert.deepEqual([...stack.collab.store.get('REC01').users.values()].map((u) => u.name).sort(), ['Ana', 'Bo'])

  await typeInEditor(a, ' + after', {})
  await waitForText(b, 'before + after')
})
