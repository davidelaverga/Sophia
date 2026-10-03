import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { answerKey, answerOf, setAnswer } from './answers.ts'

describe('answers', () => {
  it('keeps an answer by its decision and revision, beyond any one view of it', () => {
    const key = answerKey('d1', 4, 'davide')
    assert.equal(answerOf(key), null)
    setAnswer(key, { state: 'sending', chosen: 'ship' })
    setAnswer(key, { state: 'unknown', chosen: 'ship' })
    assert.deepEqual(answerOf(answerKey('d1', 4, 'davide')), { state: 'unknown', chosen: 'ship' })
    assert.equal(answerOf(answerKey('d1', 4, 'luis')), null)
  })

  it('starts a revised decision afresh', () => {
    setAnswer(answerKey('d2', 1, 'davide'), { state: 'unknown', chosen: 'wait' })
    assert.equal(answerOf(answerKey('d2', 2, 'davide')), null)
  })
})
