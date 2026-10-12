import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NOTHING_NEXT, nextUp, type NextUpInput } from './next-up.ts'

const input = (over: Partial<NextUpInput> = {}): NextUpInput => ({
  answered: ['d1'],
  decisions: [{ decision_id: 'd1', question: 'Ship the retry before the review is done?' }],
  waiting: [],
  review: false,
  ...over,
})

describe('what is next after an answer', () => {
  it('is another of the viewer’s decisions first, those answered in this visit left out', () => {
    const decisions = [
      { decision_id: 'd1', question: 'Ship the retry before the review is done?' },
      { decision_id: 'd2', question: 'Keep the old export?' },
      { decision_id: 'd3', question: 'Name the release?' },
    ]
    assert.deepEqual(nextUp(input({ decisions, waiting: [{ id: 't1', name: 'Run the tests' }], review: true })), {
      kind: 'decision',
      id: 'd2',
      words: 'Next: decide “Keep the old export?”',
    })
    assert.equal(nextUp(input({ decisions, answered: ['d1', 'd2'] })).id, 'd3')
  })
  it('then a task waiting for the viewer, the first in the board’s order', () => {
    const waiting = [
      { id: 't1', name: 'Implement the PDF retry' },
      { id: 't2', name: 'Run the export tests' },
    ]
    assert.deepEqual(nextUp(input({ waiting, review: true })), {
      kind: 'task',
      id: 't1',
      words: 'Next: “Implement the PDF retry” waits for you',
    })
  })
  it('then a review that proposes a change; then nothing, said so', () => {
    assert.deepEqual(nextUp(input({ review: true })), {
      kind: 'review',
      id: null,
      words: 'Next: the lead’s review proposes a change',
    })
    assert.deepEqual(nextUp(input()), { kind: 'none', id: null, words: NOTHING_NEXT })
    assert.equal(NOTHING_NEXT, 'Nothing else here waits on you.')
  })
  it('cuts long words at a word, with an ellipsis, inside the quotes', () => {
    const long = 'Decide whether every report keeps its sources inline or moves them to the end'
    const words = nextUp(input({ decisions: [{ decision_id: 'd9', question: long }] })).words
    assert.ok(words.startsWith('Next: decide “Decide whether every report'), words)
    assert.ok(words.endsWith('…”'), words)
    assert.ok(words.length <= 64, words)
  })
})
