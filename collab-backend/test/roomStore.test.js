'use strict'

const Y = require('yjs')
const { RoomStore, textOf } = require('../roomStore')

const fakeWs = () => ({})

describe('RoomStore', () => {
  test('new room starts with one default file', () => {
    const s = new RoomStore()
    const { room } = s.addClient('A', fakeWs())
    expect(room.files).toHaveLength(1)
    expect(room.files[0].language).toBe('python')
  })

  test('enforces max clients per room', () => {
    const s = new RoomStore({ maxClientsPerRoom: 2 })
    expect(s.addClient('A', fakeWs()).ok).toBe(true)
    expect(s.addClient('A', fakeWs()).ok).toBe(true)
    expect(s.addClient('A', fakeWs()).reason).toBe('room-full')
    expect(s.addClient('B', fakeWs()).ok).toBe(true)
  })

  test('addFile dedupes by id and enforces file limit', () => {
    const s = new RoomStore({ maxFilesPerRoom: 2 })
    const { room } = s.addClient('A', fakeWs())
    expect(s.addFile(room, { id: '2', name: 'b.py', language: 'python', code: '' })).toBe('added')
    expect(s.addFile(room, { id: '2', name: 'b.py', language: 'python', code: '' })).toBe('exists')
    expect(s.addFile(room, { id: '3', name: 'c.py', language: 'python', code: '' })).toBe('limit')
  })

  test('removeFile never deletes the last file', () => {
    const s = new RoomStore()
    const { room } = s.addClient('A', fakeWs())
    expect(s.removeFile(room, '1')).toBe(false)
    s.addFile(room, { id: '2', name: 'b.py', language: 'python', code: '' })
    expect(s.removeFile(room, '1')).toBe(true)
    expect(room.files.map((f) => f.id)).toEqual(['2'])
  })

  test('empty room is removed after the TTL, and kept if someone returns in time', async () => {
    const s = new RoomStore({ emptyRoomTtlMs: 40 })
    const a = fakeWs()
    s.addClient('A', a)
    s.removeClient('A', a)
    s.addClient('A', fakeWs()) // returns before TTL
    await new Promise((r) => setTimeout(r, 80))
    expect(s.get('A')).toBeDefined()

    const b = fakeWs()
    s.addClient('B', b)
    s.removeClient('B', b)
    await new Promise((r) => setTimeout(r, 80))
    expect(s.get('B')).toBeUndefined()
    s.close()
  })

  test('addFile builds a document from plain code, or from a client-supplied Yjs state', () => {
    const s = new RoomStore()
    const { room } = s.addClient('A', fakeWs())
    expect(s.addFile(room, { id: '2', name: 'b.py', language: 'python', code: 'hello' })).toBe('added')
    expect(textOf(room.files.find((f) => f.id === '2').doc)).toBe('hello')

    const d = new Y.Doc()
    d.getText('code').insert(0, 'from client')
    const ystate = Y.encodeStateAsUpdate(d)
    expect(s.addFile(room, { id: '3', name: 'c.py', language: 'python', ystate })).toBe('added')
    expect(textOf(room.files.find((f) => f.id === '3').doc)).toBe('from client')
  })

  test('addFile rejects garbage state and oversized content without adding a file', () => {
    const s = new RoomStore({ maxCodeChars: 10 })
    const { room } = s.addClient('A', fakeWs())
    expect(s.addFile(room, { id: '2', name: 'b.py', language: 'python', ystate: new Uint8Array([255, 255, 255, 9]) })).toBe('invalid')
    expect(s.addFile(room, { id: '3', name: 'c.py', language: 'python', code: 'x'.repeat(11) })).toBe('too-large')
    expect(room.files).toHaveLength(1)
  })

  test('applyUpdate merges a valid update, rejects garbage, and ignores unknown files', () => {
    const s = new RoomStore()
    const { room } = s.addClient('A', fakeWs())
    const replica = new Y.Doc()
    Y.applyUpdate(replica, Y.encodeStateAsUpdate(room.files[0].doc))
    replica.getText('code').insert(0, 'X')
    const update = Y.encodeStateAsUpdate(replica, Y.encodeStateVector(room.files[0].doc))
    expect(s.applyUpdate(room, '1', update).ok).toBe(true)
    expect(textOf(room.files[0].doc).startsWith('X')).toBe(true)
    expect(s.applyUpdate(room, '1', new Uint8Array([255, 255, 255, 255, 255])).reason).toBe('invalid-update')
    expect(s.applyUpdate(room, 'nope', update).reason).toBe('unknown-file')
  })

  test('applyUpdate trims a file that grows past the cap and reports one combined update', () => {
    const s = new RoomStore({ maxCodeChars: 100 })
    const { room } = s.addClient('A', fakeWs())
    const replica = new Y.Doc()
    Y.applyUpdate(replica, Y.encodeStateAsUpdate(room.files[0].doc))
    replica.getText('code').insert(0, 'y'.repeat(500))
    const res = s.applyUpdate(room, '1', Y.encodeStateAsUpdate(replica, Y.encodeStateVector(room.files[0].doc)))
    expect(res.broadcastAll).toBe(true)
    expect(room.files[0].doc.getText('code').length).toBe(100)
    Y.applyUpdate(replica, res.update) // a client applying the combined update ends in the same state
    expect(replica.getText('code').toString()).toBe(textOf(room.files[0].doc))
  })

  test('the default file is byte-identical across independent server instances and merges without duplication', () => {
    const a = new RoomStore().addClient('A', fakeWs()).room.files[0].doc
    const b = new RoomStore().addClient('B', fakeWs()).room.files[0].doc
    expect(Buffer.from(Y.encodeStateAsUpdate(a)).equals(Buffer.from(Y.encodeStateAsUpdate(b)))).toBe(true)
    const merged = new Y.Doc()
    Y.applyUpdate(merged, Y.encodeStateAsUpdate(a))
    Y.applyUpdate(merged, Y.encodeStateAsUpdate(b))
    expect(merged.getText('code').toString()).toBe(textOf(a))
  })

  test('each room gets its own epoch', () => {
    const s = new RoomStore()
    expect(s.addClient('A', fakeWs()).room.epoch).not.toBe(s.addClient('B', fakeWs()).room.epoch)
  })
})
