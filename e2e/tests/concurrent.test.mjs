import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startStack, newTab, waitForText, typeInEditor, editorText, sleep } from '../harness.mjs'

let stack
before(async () => { stack = await startStack() })
after(async () => { await stack.stop() })

test('two users typing at the same position at the same time both keep their text and converge', async () => {
  const a = await newTab(stack, 'CONC01', 'Ana')
  const b = await newTab(stack, 'CONC01', 'Bo')
  await typeInEditor(a, '', { replaceAll: true })
  await waitForText(b, '')

  // both cursors are at the start of the empty document; both type 40 characters simultaneously
  await Promise.all([typeInEditor(a, 'A'.repeat(40)), typeInEditor(b, 'B'.repeat(40))])
  await sleep(1500)

  const [ta, tb] = [await editorText(a), await editorText(b)]
  assert.equal(ta, tb, `tabs diverged:\n  Ana: ${ta}\n  Bo : ${tb}`)
  assert.equal((ta.match(/A/g) || []).length, 40, `Ana's characters were lost: ${ta}`)
  assert.equal((ta.match(/B/g) || []).length, 40, `Bo's characters were lost: ${ta}`)
})
