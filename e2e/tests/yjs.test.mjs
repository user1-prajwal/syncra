import { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { e2eTest, focusEditor, startStack, newTab, waitForText, typeInEditor, editorText, moveCursorToEnd, createFileViaUI, selectFile, fileNames, waitUntil, sleep } from '../harness.mjs'

let stack
before(async () => { stack = await startStack() })
after(async () => { await stack.stop() })

const dropAllSockets = () => { for (const ws of stack.collab.wss.clients) ws.terminate() }

e2eTest('three users typing at once in the same spot all keep their text and converge', async () => {
  const [a, b, c] = [await newTab(stack, 'Y3', 'Ana'), await newTab(stack, 'Y3', 'Bo'), await newTab(stack, 'Y3', 'Cy')]
  await typeInEditor(a, '', { replaceAll: true })
  await waitForText(b, '')
  await Promise.all([typeInEditor(a, 'A'.repeat(30)), typeInEditor(b, 'B'.repeat(30)), typeInEditor(c, 'C'.repeat(30))])
  await sleep(1500)
  const [ta, tb, tc] = [await editorText(a), await editorText(b), await editorText(c)]
  assert.equal(ta, tb)
  assert.equal(tb, tc)
  for (const ch of 'ABC') assert.equal((ta.match(new RegExp(ch, 'g')) || []).length, 30, `${ch} characters lost: ${ta}`)
})

e2eTest('edits made while disconnected merge cleanly after reconnecting, on both sides', async () => {
  const a = await newTab(stack, 'YOFF', 'Ana')
  const b = await newTab(stack, 'YOFF', 'Bo')
  await typeInEditor(a, 'base', { replaceAll: true })
  await waitForText(b, 'base')

  dropAllSockets() // both tabs lose their connection; reconnect backoff is >= 1s, so these edits happen offline
  await moveCursorToEnd(a)
  await typeInEditor(a, '-A-offline')
  await moveCursorToEnd(b)
  await typeInEditor(b, '-B-offline')

  await waitUntil(() => stack.collab.store.get('YOFF')?.users.size === 2, 20000, 'both tabs to re-join')
  await waitUntil(async () => (await editorText(a)) === (await editorText(b)), 10000, 'tabs to converge')
  const final = await editorText(a)
  assert.ok(final.startsWith('base'), final)
  assert.ok(final.includes('-A-offline'), `Ana's offline edit was lost: ${final}`)
  assert.ok(final.includes('-B-offline'), `Bo's offline edit was lost: ${final}`)
  assert.equal(final.length, 'base-A-offline-B-offline'.length)
})

e2eTest('after the SERVER restarts and loses all state, the clients repopulate it: no lost text, no duplicated default file', async () => {
  const a = await newTab(stack, 'YRST', 'Ana')
  const b = await newTab(stack, 'YRST', 'Bo')
  await typeInEditor(a, 'MY-WORK\n') // inserted before the default text
  await createFileViaUI(a, 'extra.py')
  await typeInEditor(a, 'extra content')
  await waitUntil(async () => (await fileNames(b)).includes('extra.py'), 8000, 'Bo to see extra.py')
  await sleep(500)

  const epochBefore = stack.collab.store.get('YRST').epoch
  await stack.restartBackend() // every room is gone
  await waitUntil(() => stack.collab.store.get('YRST')?.users.size === 2, 25000, 'both tabs to reconnect to the new server')
  const room = stack.collab.store.get('YRST')
  assert.notEqual(room.epoch, epochBefore, 'the new server must have a new epoch')
  await waitUntil(() => room.files.length === 2, 10000, 'the server to receive extra.py back from the clients')

  const late = await newTab(stack, 'YRST', 'Cy')
  assert.deepEqual((await fileNames(late)).sort(), ['extra.py', 'main.py'])

  const mainText = await editorText(late) // the late joiner opens on the first file in the list
  assert.ok(mainText.startsWith('MY-WORK\n'), `typed text lost: ${mainText}`)
  assert.equal((mainText.match(/Start coding here/g) || []).length, 1, `default text was duplicated: ${mainText}`)
  assert.equal(await editorText(b), mainText, "Bo's main.py differs from the server's")
  await selectFile(late, 'extra.py')
  await waitForText(late, 'extra content')
  assert.equal(await editorText(a), 'extra content') // Ana still has extra.py open
})

e2eTest('undo only undoes MY edits, not what other people typed', async () => {
  const a = await newTab(stack, 'YUND', 'Ana')
  const b = await newTab(stack, 'YUND', 'Bo')
  await typeInEditor(a, '', { replaceAll: true })
  await waitForText(b, '')
  await sleep(700) // edits closer together than 500 ms are grouped into one undo step; keep them separate
  await typeInEditor(a, 'aaa')
  await waitForText(b, 'aaa')
  await sleep(700)
  await moveCursorToEnd(b)
  await typeInEditor(b, 'bbb')
  await waitForText(a, 'aaabbb')

  await focusEditor(a)
  await a.keyboard.down('Control')
  await a.keyboard.press('z')
  await a.keyboard.up('Control')
  await waitForText(a, 'bbb')
  await waitForText(b, 'bbb') // Ana's undo reached Bo, and Bo's own text survived
})
