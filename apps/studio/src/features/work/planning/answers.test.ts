import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { answerKey, answerOf, operationFor, setAnswer } from './answers.ts'

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
