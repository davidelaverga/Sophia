import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { settleWithin } from './deadline.ts'

/** What a promise holds right now: its value if it has settled, else 'still waiting' (nothing is awaited for good). */
const now = <T>(p: Promise<T>) => Promise.race([p, Promise.resolve('still waiting' as const)])

describe('a wait with an end', () => {
  it('gives the value when the work answers in time', async () => {
    assert.equal(await settleWithin(Promise.resolve('checked'), 30_000, 'unchecked'), 'checked')
  })

  it('gives the fallback once the time is up, or when the work fails', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const waited = settleWithin(new Promise<string>(() => undefined), 30_000, 'unchecked')
    t.mock.timers.tick(29_999)
    assert.equal(await now(waited), 'still waiting')
    t.mock.timers.tick(1)
    assert.equal(await now(waited), 'unchecked')
    assert.equal(await settleWithin(Promise.reject(new Error('no answer')), 30_000, 'unchecked'), 'unchecked')
  })
})
