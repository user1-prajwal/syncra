'use strict'

// Token bucket: allows short bursts up to `capacity`, then a sustained rate of
// `refillPerSec`. One bucket per WebSocket connection.
class TokenBucket {
  constructor({ capacity, refillPerSec, now = Date.now }) {
    this.capacity = capacity
    this.refillPerSec = refillPerSec
    this.now = now
    this.tokens = capacity
    this.last = now()
  }

  take(n = 1) {
    const t = this.now()
    const elapsedSec = Math.max(0, (t - this.last) / 1000)
    this.last = t
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec)
    if (this.tokens >= n) {
      this.tokens -= n
      return true
    }
    return false
  }
}

module.exports = { TokenBucket }
