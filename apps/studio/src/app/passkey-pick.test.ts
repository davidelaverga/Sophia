import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PasskeyOutcome } from './auth.ts'
import { PICK_LIMIT_MS, pickInTime } from './passkey-pick.ts'

/** What a promise holds once every pending callback has run: its value if it has settled, else 'still waiting'. */
const now = <T>(p: Promise<T>) =>
  Promise.race([p, new Promise<'still waiting'>((resolve) => setImmediate(() => resolve('still waiting')))])

const never = <T>() => new Promise<T>(() => undefined)

describe('the passkey picker’s wait', () => {
  it('lasts a challenge’s five minutes and a write’s 90 s', () => {
    assert.equal(PICK_LIMIT_MS, 5 * 60_000 + 90_000)
  })

  it('gives the picker’s outcome when it answers in time', async () => {
    assert.equal(await pickInTime(Promise.resolve(), () => Promise.resolve('signed_in')), 'signed_in')
    assert.equal(await pickInTime(Promise.resolve(), () => Promise.resolve('expired')), 'expired')
  })

  it('ends as late at its limit, not before, and closes the prompt', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    let prompt = null as AbortSignal | null
    const waited = pickInTime(Promise.resolve(), (signal) => {
      prompt = signal
      return never<PasskeyOutcome>()
    })
    t.mock.timers.tick(PICK_LIMIT_MS - 1)
    assert.equal(await now(waited), 'still waiting')
    assert.equal(prompt?.aborted, false)
    t.mock.timers.tick(1)
    assert.equal(await now(waited), 'late')
    assert.equal(prompt?.aborted, true)
  })

  it('asks for the passkey only once the offer has let the browser go', async () => {
    const { promise: released, resolve: release } = Promise.withResolvers<void>()
    let asked = 0
    const waited = pickInTime(released, () => {
      asked += 1
      return Promise.resolve('signed_in')
    })
    assert.equal(await now(waited), 'still waiting')
    assert.equal(asked, 0)
    release()
    assert.equal(await waited, 'signed_in')
    assert.equal(asked, 1)
  })

  it('starts no picker when the offer lets go after the limit: nobody waits for it', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const { promise: released, resolve: release } = Promise.withResolvers<void>()
    let asked = 0
    const waited = pickInTime(released, () => {
      asked += 1
      return Promise.resolve('signed_in')
    })
    t.mock.timers.tick(PICK_LIMIT_MS)
    assert.equal(await now(waited), 'late')
    release()
    await now(new Promise<void>((done) => setImmediate(done)))
    assert.equal(asked, 0)
  })
})
