import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { endsWithin, orLate, settleWithin } from './deadline.ts'

/**
 * What a promise holds once every pending callback has run: its value if it has settled, else 'still waiting' (nothing
 * is awaited for good). setImmediate isn't among the mocked timers, so it runs after the promise's own steps.
 */
const now = <T>(p: Promise<T>) =>
  Promise.race([p, new Promise<'still waiting'>((resolve) => setImmediate(() => resolve('still waiting')))])

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

describe('a wait that says when it was late', () => {
  it('gives the work’s value in time, and "late" once the time is up', async (t) => {
    assert.equal(await orLate(Promise.resolve('ways'), 20_000), 'ways')
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const waited = orLate(new Promise<string>(() => undefined), 20_000)
    t.mock.timers.tick(19_999)
    assert.equal(await now(waited), 'still waiting')
    t.mock.timers.tick(1)
    assert.equal(await now(waited), 'late')
  })

  it('keeps a failure a failure: nothing is swallowed', async () => {
    await assert.rejects(orLate(Promise.reject(new Error('no user')), 20_000), /no user/)
  })
})

describe('a wait that ends in its own words', () => {
  it('gives the work’s value in time, and keeps its failure as it was', async () => {
    assert.equal(await endsWithin(Promise.resolve('sent'), 90_000, 'Not confirmed'), 'sent')
    await assert.rejects(endsWithin(Promise.reject(new Error('Too many emails')), 90_000, 'Not confirmed'), /Too many/)
  })

  it('fails with its words once the time is up, not a moment before', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const waited = endsWithin(new Promise<void>(() => undefined), 90_000, 'Not confirmed').catch((e: unknown) =>
      e instanceof Error ? e.message : 'not an error',
    )
    t.mock.timers.tick(89_999)
    assert.equal(await now(waited), 'still waiting')
    t.mock.timers.tick(1)
    assert.equal(await now(waited), 'Not confirmed')
  })
})
