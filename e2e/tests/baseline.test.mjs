import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startStack, newTab, waitForText, typeInEditor, editorText, sleep } from '../harness.mjs'

let stack
before(async () => { stack = await startStack() })
after(async () => { await stack.stop() })

test('typing in one tab appears in the other tab (real Monaco, real server)', async () => {
  const a = await newTab(stack, 'BASE01', 'Ana')
  const b = await newTab(stack, 'BASE01', 'Bo')
  await typeInEditor(a, 'hello from Ana', { replaceAll: true })
  await waitForText(b, 'hello from Ana')
})

test('a late joiner sees the current document', async () => {
  const c = await newTab(stack, 'BASE01', 'Cy')
  await waitForText(c, 'hello from Ana')
})
