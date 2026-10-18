import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { callClock, callClockWords } from './call-clock.ts'

// How long the call has run (docs/plans/room-basics.md).
describe('the call’s clock', () => {
  it('reads minutes and seconds, and hours past one', () => {
    assert.deepEqual([0, 65_000, 3_725_000, -5].map(callClock), ['0:00', '1:05', '1:02:05', '0:00'])
  })

  it('says it in words', () => {
    assert.deepEqual([30_000, 60_000, 12 * 60_000, 3_725_000].map(callClockWords), [
      'In the call for less than a minute',
      'In the call for 1 minute',
      'In the call for 12 minutes',
      'In the call for 1 hour 2 minutes',
    ])
  })
})
