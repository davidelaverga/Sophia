import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { answeredHere, answeredKey, NOTHING_NEXT, nextUp, waitingFor, type NextUpInput } from './next-up.ts'

const input = (over: Partial<NextUpInput> = {}): NextUpInput => ({
  answered: [answeredKey('d1', 1)],
  decisions: [{ decision_id: 'd1', revision: 1, question: 'Ship the retry before the review is done?' }],
  waiting: [],
  review: false,
  ...over,
})

describe('what is next after an answer', () => {
  it('is another of the viewer’s decisions first, those answered in this visit left out', () => {
    const decisions = [
      { decision_id: 'd1', revision: 1, question: 'Ship the retry before the review is done?' },
      { decision_id: 'd2', revision: 1, question: 'Keep the old export?' },
      { decision_id: 'd3', revision: 1, question: 'Name the release?' },
    ]
    assert.deepEqual(nextUp(input({ decisions, waiting: [{ id: 't1', name: 'Run the tests' }], review: true })), {
      kind: 'decision',
      id: 'd2',
      words: 'Next: decide “Keep the old export?”',
    })
    assert.equal(nextUp(input({ decisions, answered: [answeredKey('d1', 1), answeredKey('d2', 1)] })).id, 'd3')
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
    const words = nextUp(input({ decisions: [{ decision_id: 'd9', revision: 1, question: long }] })).words
    assert.ok(words.startsWith('Next: decide “Decide whether every report'), words)
    assert.ok(words.endsWith('…”'), words)
    assert.ok(words.length <= 64, words)
  })
})

describe('what is next, a decision revised (Codex on #263)', () => {
  it('a decision answered at one revision and proposed again at the next is the next one to decide', () => {
    const decisions = [{ decision_id: 'd1', revision: 2, question: 'Ship the retry before the review is done?' }]
    assert.equal(nextUp(input({ decisions, answered: [answeredKey('d1', 1)] })).id, 'd1')
    assert.equal(nextUp(input({ decisions, answered: [answeredKey('d1', 2)] })).kind, 'none')
  })
})

/** A decision of the viewer's, by its id. */
const d = (id: string, revision = 1) => ({ decision_id: id, revision, question: id })

/** A board row in a lane, with a request pending for someone, or none. */
const row = (id: string, lane: string, pendingFor: string | null) => ({
  item: { id, purpose: id },
  lane,
  waits: pendingFor === null ? [] : [{ wait: { state: 'pending', respondent_id: pendingFor } }],
})

describe('what is next, as the page knows it (Codex P2s on #263)', () => {
  it('leaves out a decision answered on this page, or on its way, though the board was drawn anew', () => {
    const states: Record<string, string> = { b: 'recorded', c: 'sending', e: 'unknown', f: 'conflict' }
    const here = answeredHere(
      [d('a'), d('b'), d('c'), d('e'), d('f')],
      [answeredKey('a', 1)],
      (x) => states[x.decision_id] ?? null,
    )
    assert.deepEqual(here.toSorted(), [answeredKey('a', 1), answeredKey('b', 1), answeredKey('c', 1)].toSorted())
    // Not confirmed or refused: still the one to answer.
    assert.equal(here.includes(answeredKey('e', 1)), false)
    assert.equal(
      nextUp({ answered: here, decisions: [d('a'), d('b'), d('c'), d('e')], waiting: [], review: false }).id,
      'e',
    )
  })

  it('counts a task with the viewer’s request pending in any lane, closed ones after the board’s', () => {
    const rows = [
      row('closed', 'closed', 'me'),
      row('next', 'next', 'me'),
      row('mine-not', 'now', 'them'),
      row('now', 'now', 'me'),
    ]
    const lanes = ['now', 'next', 'blocked', 'done']
    assert.deepEqual(
      waitingFor(rows, 'me', (r) => r.lane, lanes).map((t) => t.id),
      ['now', 'next', 'closed'],
    )
    assert.deepEqual(
      waitingFor(rows, null, (r) => r.lane, lanes),
      [],
    )
  })
})
