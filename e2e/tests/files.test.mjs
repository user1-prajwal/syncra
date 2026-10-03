import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startStack, newTab, waitForText, typeInEditor, fileNames, createFileViaUI, deleteFileViaUI, selectFile, waitUntil, sleep } from '../harness.mjs'

let stack
before(async () => { stack = await startStack() })
after(async () => { await stack.stop() })

test('a deleted file stays deleted for current users AND for people who join later', async () => {
  const a = await newTab(stack, 'FILE01', 'Ana')
  const b = await newTab(stack, 'FILE01', 'Bo')
  assert.deepEqual(await fileNames(a), ['main.py'])

  await createFileViaUI(a, 'notes.py')
  await waitUntil(async () => (await fileNames(b)).includes('notes.py'), 8000, 'Bo to see notes.py')
  await typeInEditor(a, 'x = 1', { replaceAll: true })

  await deleteFileViaUI(a, 'main.py') // Ana deletes the ORIGINAL file
  await waitUntil(async () => !(await fileNames(b)).includes('main.py'), 8000, 'Bo to lose main.py')
  assert.deepEqual(await fileNames(b), ['notes.py'])

  const late = await newTab(stack, 'FILE01', 'Cy') // joins AFTER the delete
  assert.deepEqual(await fileNames(late), ['notes.py'], 'the late joiner must not see the deleted file')
  await waitForText(late, 'x = 1')
})

test('typing in a second file syncs, and switching files keeps each file\'s own text', async () => {
  const a = await newTab(stack, 'FILE02', 'Ana')
  const b = await newTab(stack, 'FILE02', 'Bo')
  await typeInEditor(a, 'first file', { replaceAll: true })
  await createFileViaUI(a, 'two.py')
  await typeInEditor(a, 'second file') // new files start empty and become active
  await waitUntil(async () => (await fileNames(b)).includes('two.py'), 8000, 'Bo to see two.py')
  await selectFile(b, 'two.py')
  await waitForText(b, 'second file')
  await selectFile(b, 'main.py')
  await waitForText(b, 'first file')
})
