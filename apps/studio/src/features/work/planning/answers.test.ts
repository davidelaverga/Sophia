import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WRITE_TIMEOUT_MS } from '../../../api/client.ts'
import { answerKey, answerOf, operationFor, sendAnswer, setAnswer, type Disposition } from './answers.ts'

describe('answers', () => {
  it('keeps an answer by its decision and revision, beyond any one view of it', () => {
    const key = answerKey('d1', 4, 'davide')
    assert.equal(answerOf(key), null)
    setAnswer(key, { state: 'sending', chosen: 'ship', operation_id: 'op-1' })
    setAnswer(key, { state: 'unknown', chosen: 'ship', operation_id: 'op-1' })
    assert.deepEqual(answerOf(answerKey('d1', 4, 'davide')), { state: 'unknown', chosen: 'ship', operation_id: 'op-1' })
    assert.equal(answerOf(answerKey('d1', 4, 'luis')), null)
  })

  it('starts a revised decision afresh', () => {
    setAnswer(answerKey('d2', 1, 'davide'), { state: 'unknown', chosen: 'wait', operation_id: 'op-2' })
    assert.equal(answerOf(answerKey('d2', 2, 'davide')), null)
  })
})

const ids = () => 'op-new'

describe('an answer’s key (Codex F-037)', () => {
  it('keeps each apart, whatever its ids hold, and no viewer apart from one called “anyone”', () => {
    assert.notEqual(answerKey('a:1', 2, 'x'), answerKey('a', 1, '2:x'))
    setAnswer(answerKey('a:1', 2, 'x'), { state: 'unknown', chosen: 'ship', operation_id: 'op-a' })
    assert.equal(answerOf(answerKey('a', 1, '2:x')), null)
    setAnswer(answerKey('n', 1, null), { state: 'unknown', chosen: 'wait', operation_id: 'op-n' })
    assert.equal(answerOf(answerKey('n', 1, 'anyone')), null)
    // The same decision, revision and viewer is the same key: tried again, its operation is the one it went as.
    assert.equal(operationFor(answerOf(answerKey('a:1', 2, 'x')), 'ship', ids), 'op-a')
    assert.equal(operationFor(answerOf(answerKey('n', 1, null)), 'wait', ids), 'op-n')
  })
})

describe('the operation an answer goes as', () => {
  it('is the same one when the same choice is tried after it wasn’t confirmed, never another choice (UI-13)', () => {
    const unknown = { state: 'unknown' as const, chosen: 'ship', operation_id: 'op-1' }
    assert.equal(operationFor(unknown, 'ship', ids), 'op-1')
    assert.equal(operationFor(unknown, 'wait', ids), null)
  })

  it('is new after a refusal or before any answer, and none while one is on its way or recorded', () => {
    assert.equal(operationFor(null, 'ship', ids), 'op-new')
    assert.equal(operationFor({ state: 'conflict', chosen: 'ship', operation_id: 'op-1' }, 'wait', ids), 'op-new')
    assert.equal(operationFor({ state: 'sending', chosen: 'ship', operation_id: 'op-1' }, 'ship', ids), null)
    assert.equal(operationFor({ state: 'recorded', chosen: 'ship', operation_id: 'op-1' }, 'wait', ids), null)
  })
})

/** A reply that comes when the check says: as a disposition, or lost. */
function reply() {
  const said: { with: (d: Disposition) => void; lost: () => void } = { with: () => undefined, lost: () => undefined }
  const promise = new Promise<Disposition>((resolve, reject) => {
    said.with = resolve
    said.lost = () => reject(new Error('lost'))
  })
  return { promise, ...said }
}
/** Lets a reply's handlers run. */
const handled = () => new Promise((done) => setImmediate(done))
const stateOf = (key: string) => answerOf(key)?.state
const ship = { chosen: 'ship', operation_id: 'op-1' }

describe('an answer on its way (Codex F-023)', () => {
  it('is not confirmed once a write’s limit passes with no reply, not a moment before; then only the same goes again', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const key = answerKey('d-silent', 1, 'davide')
    sendAnswer(key, ship, () => new Promise(() => undefined))
    assert.equal(stateOf(key), 'sending')
    t.mock.timers.tick(WRITE_TIMEOUT_MS - 1)
    assert.equal(stateOf(key), 'sending')
    t.mock.timers.tick(1)
    assert.equal(stateOf(key), 'unknown')
    assert.equal(operationFor(answerOf(key), 'ship', ids), 'op-1')
    assert.equal(operationFor(answerOf(key), 'wait', ids), null)
  })

  it('takes its own reply in time, and its limit ends with it', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const key = answerKey('d-in-time', 1, 'davide')
    const r = reply()
    sendAnswer(key, ship, () => r.promise)
    r.with('recorded')
    await handled()
    assert.equal(stateOf(key), 'recorded')
    t.mock.timers.tick(WRITE_TIMEOUT_MS)
    assert.equal(stateOf(key), 'recorded')
  })

  it('takes a lost reply as not confirmed', async () => {
    const key = answerKey('d-lost', 1, 'davide')
    const r = reply()
    sendAnswer(key, ship, () => r.promise)
    r.lost()
    await handled()
    assert.equal(stateOf(key), 'unknown')
  })

  it('lets a reply after its limit change nothing', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const key = answerKey('d-late', 1, 'davide')
    const r = reply()
    sendAnswer(key, ship, () => r.promise)
    t.mock.timers.tick(WRITE_TIMEOUT_MS)
    r.with('recorded')
    await handled()
    assert.equal(stateOf(key), 'unknown')
  })

  it('lets an earlier send’s reply change nothing, while the answer goes again or after it came back', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const key = answerKey('d-again', 1, 'davide')
    const first = reply()
    const again = reply()
    sendAnswer(key, ship, () => first.promise)
    t.mock.timers.tick(WRITE_TIMEOUT_MS)
    sendAnswer(key, ship, () => again.promise) // the same choice, the same operation
    first.with('conflict') // the first send's reply, late, while the second is on its way
    await handled()
    assert.equal(stateOf(key), 'sending')
    again.with('recorded')
    await handled()
    assert.deepEqual({ ...answerOf(key), send: undefined }, { state: 'recorded', ...ship, send: undefined })
    t.mock.timers.tick(WRITE_TIMEOUT_MS) // neither send's limit says anything now
    assert.equal(stateOf(key), 'recorded')
  })

  it('lets a reply from before the answer was sent again change nothing, after the newer one came back', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const key = answerKey('d-after', 1, 'davide')
    const first = reply()
    sendAnswer(key, ship, () => first.promise)
    t.mock.timers.tick(WRITE_TIMEOUT_MS)
    sendAnswer(key, ship, () => Promise.resolve('recorded'))
    await handled()
    assert.equal(stateOf(key), 'recorded')
    first.with('unknown')
    await handled()
    assert.equal(stateOf(key), 'recorded')
  })
})
