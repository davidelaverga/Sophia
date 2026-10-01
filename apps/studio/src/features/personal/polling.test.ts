import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { POLL_MAX_MS, POLL_MS, pollEvery } from './polling.ts'

describe('waiting for Sophia’s reply', () => {
  it('reads the turns again often, and after failures less often, but never stops', () => {
    assert.equal(pollEvery(0), POLL_MS)
    assert.equal(pollEvery(1), POLL_MS * 2)
    assert.equal(pollEvery(3), POLL_MS * 8)
    assert.equal(pollEvery(50), POLL_MAX_MS)
    assert.ok(Number.isFinite(pollEvery(50)) && pollEvery(50) > 0)
  })
})
