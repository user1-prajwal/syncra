'use strict'

const { parseMessage } = require('../validate')

const j = (o) => JSON.stringify(o)

describe('parseMessage', () => {
  test('rejects invalid JSON', () => {
    expect(parseMessage('not json{{{')).toEqual({ ok: false, reason: 'invalid-json' })
  })

  test.each(['null', '42', '"str"', '[]', '{}', '{"type":5}'])('rejects non-object or typeless payload %s', (raw) => {
    expect(parseMessage(raw).ok).toBe(false)
  })

  test('rejects unknown and prototype-polluting types', () => {
    expect(parseMessage(j({ type: 'userlist', users: [] })).reason).toBe('unknown-type')
    expect(parseMessage(j({ type: '__proto__' })).reason).toBe('unknown-type')
    expect(parseMessage(j({ type: 'constructor' })).reason).toBe('unknown-type')
  })

  test('join: trims name, enforces length and color format', () => {
    expect(parseMessage(j({ type: 'join', name: '  Ana ', color: '#FF6B6B' })).msg).toEqual({
      type: 'join', name: 'Ana', color: '#FF6B6B',
    })
    expect(parseMessage(j({ type: 'join', name: '   ', color: '#FF6B6B' })).ok).toBe(false)
    expect(parseMessage(j({ type: 'join', name: 'x'.repeat(21), color: '#FF6B6B' })).ok).toBe(false)
    expect(parseMessage(j({ type: 'join', name: 'Ana', color: 'red;}</style>' })).ok).toBe(false)
  })

  test('yupdate: requires a file id and a base64 update, strips unknown fields', () => {
    const r = parseMessage(j({ type: 'yupdate', fileId: '1', update: 'AQID', sentAt: 5, evil: 'drop me' }))
    expect(r.msg).toEqual({ type: 'yupdate', fileId: '1', update: 'AQID', sentAt: 5 })
    expect(parseMessage(j({ type: 'yupdate', fileId: '', update: 'AQID' })).ok).toBe(false)
    expect(parseMessage(j({ type: 'yupdate', fileId: '1', update: '' })).ok).toBe(false)
    expect(parseMessage(j({ type: 'yupdate', fileId: '1', update: 'not base64!' })).reason).toBe('invalid-update')
    expect(parseMessage(j({ type: 'yupdate', fileId: '1', update: 123 })).ok).toBe(false)
    expect(parseMessage(j({ type: 'yupdate', fileId: '1', update: 'A'.repeat(700_001) })).reason).toBe('invalid-update')
  })

  test('the retired full-text `code` message is no longer accepted', () => {
    expect(parseMessage(j({ type: 'code', fileId: '1', code: 'x' })).reason).toBe('unknown-type')
  })

  test('newfile: validates nested file object', () => {
    const good = { type: 'newfile', file: { id: 'a', name: 'x.py', language: 'python', code: '' } }
    expect(parseMessage(j(good)).ok).toBe(true)
    expect(parseMessage(j({ type: 'newfile', file: { ...good.file, code: undefined, ystate: 'AQID' } })).msg.file.ystate).toBe('AQID')
    expect(parseMessage(j({ type: 'newfile', file: { ...good.file, code: undefined, ystate: '***' } })).reason).toBe('invalid-update')
    expect(parseMessage(j({ type: 'newfile', file: { ...good.file, code: 'x'.repeat(200_001) } })).reason).toBe('code-too-large')
    expect(parseMessage(j({ type: 'newfile', file: 'nope' })).ok).toBe(false)
    expect(parseMessage(j({ type: 'newfile', file: { ...good.file, language: '<script>' } })).reason).toBe('invalid-language')
  })

  test('cursor: requires positive integers', () => {
    expect(parseMessage(j({ type: 'cursor', line: 3, column: 7 })).ok).toBe(true)
    expect(parseMessage(j({ type: 'cursor', line: 0, column: 1 })).ok).toBe(false)
    expect(parseMessage(j({ type: 'cursor', line: 1.5, column: 1 })).ok).toBe(false)
    expect(parseMessage(j({ type: 'cursor', line: '1', column: 1 })).ok).toBe(false)
  })

  test('chat: trims and enforces length', () => {
    expect(parseMessage(j({ type: 'chat', text: '  hi  ' })).msg.text).toBe('hi')
    expect(parseMessage(j({ type: 'chat', text: '' })).ok).toBe(false)
    expect(parseMessage(j({ type: 'chat', text: 'x'.repeat(1001) })).ok).toBe(false)
  })
})

describe('parseMessage: join clientId', () => {
  test('accepts a well-formed clientId and omits it when absent', () => {
    const id = 'tab-0123456789abcdef'
    expect(parseMessage(j({ type: 'join', name: 'Ana', color: '#FF6B6B', clientId: id })).msg.clientId).toBe(id)
    expect(parseMessage(j({ type: 'join', name: 'Ana', color: '#FF6B6B' })).msg.clientId).toBeUndefined()
  })

  test.each(['short', 'has spaces in it!', 'x'.repeat(65), 12345678, null])('rejects clientId %p', (bad) => {
    expect(parseMessage(j({ type: 'join', name: 'Ana', color: '#FF6B6B', clientId: bad })).ok).toBe(false)
  })
})
