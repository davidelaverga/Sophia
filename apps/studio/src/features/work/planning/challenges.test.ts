import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { challengeKey, challengeOf, editable, keyFor, sendable, setChallenge, type Challenged } from './challenges.ts'

const draw = () => 'fresh'
const said = (over: Partial<Challenged>): Challenged => ({
  text: 'The renderer’s host is shared.',
  key: '',
  state: 'draft',
  ...over,
})

describe('challenges', () => {
  it('kept by review and viewer, beyond any one view of it', () => {
    const key = challengeKey('review-1', 'luis')
    setChallenge(key, said({}))
    assert.equal(challengeOf(challengeKey('review-1', 'luis'))?.text, 'The renderer’s host is shared.')
    assert.equal(challengeOf(challengeKey('review-1', 'davide')), null)
    assert.equal(challengeOf(challengeKey('review-2', 'luis')), null)
  })

  it('sends a draft with words, or one not confirmed; nothing empty, on its way or done', () => {
    assert.equal(sendable(said({})), true)
    assert.equal(sendable(said({ text: '  ' })), false)
    assert.equal(sendable(said({ state: 'unknown', key: 'k1' })), true)
    for (const state of ['sending', 'recorded', 'denied'] as const) assert.equal(sendable(said({ state })), false)
    assert.equal(sendable(null), false)
  })

  it('sends again with the same key while not confirmed, and only then; its words are locked once sent', () => {
    assert.equal(keyFor(said({ state: 'unknown', key: 'k1' }), draw), 'k1')
    assert.equal(keyFor(said({}), draw), 'fresh')
    assert.equal(editable(said({})), true)
    assert.equal(editable(null), true)
    assert.equal(editable(said({ state: 'unknown', key: 'k1' })), false)
  })
})
