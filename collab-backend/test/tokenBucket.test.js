'use strict'

const { TokenBucket } = require('../tokenBucket')

describe('TokenBucket', () => {
  test('allows a burst up to capacity then rejects', () => {
    let t = 0
    const b = new TokenBucket({ capacity: 5, refillPerSec: 1, now: () => t })
    for (let i = 0; i < 5; i++) expect(b.take()).toBe(true)
    expect(b.take()).toBe(false)
  })

  test('refills at the configured rate and never exceeds capacity', () => {
    let t = 0
    const b = new TokenBucket({ capacity: 5, refillPerSec: 2, now: () => t })
    for (let i = 0; i < 5; i++) b.take()
    t = 1000 // +2 tokens
    expect(b.take()).toBe(true)
    expect(b.take()).toBe(true)
    expect(b.take()).toBe(false)
    t = 1_000_000 // long idle: capped at capacity
    for (let i = 0; i < 5; i++) expect(b.take()).toBe(true)
    expect(b.take()).toBe(false)
  })
})
