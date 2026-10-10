// The process's presence counter (presence-sequence.ts; item 7 C): ever higher, never reused, spent at the wire's bound.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PRESENCE_SEQUENCE_MAX, PresenceSequence, processPresenceSequence } from './presence-sequence.ts'

describe('the presence sequence', () => {
  it('gives 1, 2, 3 from a new process, each above the last', () => {
    const s = new PresenceSequence()
    assert.deepEqual([s.next(), s.next(), s.next()], [1, 2, 3])
  })

  it('is bounded at Number.MAX_SAFE_INTEGER, the amendment’s maximum: that number once, then null for good', () => {
    assert.equal(PRESENCE_SEQUENCE_MAX, 9007199254740991)
    const s = new PresenceSequence(PRESENCE_SEQUENCE_MAX - 1)
    assert.deepEqual([s.next(), s.next(), s.next()], [PRESENCE_SEQUENCE_MAX, null, null])
  })

  it('starts only at a safe integer of at least 0', () => {
    for (const bad of [-1, 1.5, PRESENCE_SEQUENCE_MAX + 1, Number.NaN])
      assert.throws(() => new PresenceSequence(bad), RangeError, String(bad))
  })

  it('the process has one counter, a module singleton', async () => {
    const again = await import('./presence-sequence.ts')
    assert.equal(again.processPresenceSequence, processPresenceSequence)
    assert.ok(processPresenceSequence instanceof PresenceSequence)
  })
})
