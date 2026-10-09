// The bound on one API process's call fences (call-fence.ts CallFences; Codex P1 r4234782537): pure, no database.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CALL_FENCE_SESSIONS, CallFences } from './call-fence.ts'

describe('call fences are bounded per API process (Codex r4234782537)', () => {
  it('takes up to its bound at once; the next waits, and gets the first slot given back', async () => {
    const fences = new CallFences(2)
    assert.equal(await fences.take(0), true)
    assert.equal(await fences.take(0), true)
    assert.equal(fences.held, 2)
    let third: boolean | null = null
    const waiting = fences.take(1000).then((ok) => (third = ok))
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(third, null, 'no slot free: it waits')
    fences.give()
    assert.equal(await waiting, true, 'the slot passed to it')
    assert.equal(fences.held, 2, 'still two taken')
    fences.give()
    fences.give()
    assert.equal(fences.held, 0)
  })

  it('a wait that runs out takes nothing, and leaves the queue: a slot given back later is free', async () => {
    const fences = new CallFences(1)
    assert.equal(await fences.take(0), true)
    const started = Date.now()
    assert.equal(await fences.take(50), false)
    assert.ok(Date.now() - started >= 40, 'it waited its time')
    fences.give()
    assert.equal(fences.held, 0, 'nobody was waiting: the slot is free')
    assert.equal(await fences.take(0), true)
  })

  it('the stated bound, and only a positive whole number is one', () => {
    assert.equal(new CallFences().max, CALL_FENCE_SESSIONS)
    assert.equal(CALL_FENCE_SESSIONS, 8)
    assert.throws(() => new CallFences(0))
    assert.throws(() => new CallFences(1.5))
  })
})
