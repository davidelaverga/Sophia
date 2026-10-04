import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ItemAction } from './board-view.ts'
import {
  againOf,
  askBlocked,
  askedAgain,
  asking,
  heard,
  heardOn,
  shownOf,
  stalled,
  unanswerable,
  type AskEvent,
  type Question,
} from './ask.ts'

const question = (id: string, work = 'work-1'): Question => ({
  question_id: id,
  work_id: work,
  plan_id: 'plan-1',
  plan_revision: 2,
  candidate_version_ref: null,
  text: 'Why is it waiting?',
})

const event = (id: string, seq: number, kind: AskEvent['kind'], text?: string): AskEvent => ({
  question_id: id,
  seq,
  kind,
  ...(text === undefined ? {} : { text }),
})

const after = (id: string, ...events: AskEvent[]) => events.reduce(heard, asking(question(id)))

/** A wait begun at `seq`, on a send of a question. */
const wait = (id: string, seq: number, send = 1) => ({ question_id: id, send, seq })

const action = (availability: ItemAction['availability']): ItemAction => ({
  kind: 'ask_sophia',
  availability,
  reason: availability === 'allowed' ? 'Asked in the project’s conversation.' : 'No longer allowed for you here.',
  boundary: null,
})

describe('an answer from Sophia', () => {
  it('shows the chunks as they are received, and a completed answer at once (UI-15)', () => {
    const partly = after('q1', event('q1', 1, 'chunk', 'It waits '), event('q1', 2, 'chunk', 'for Davide.'))
    assert.deepEqual([partly.state, shownOf(partly)], ['answering', 'It waits for Davide.'])
    const whole = after('q2', event('q2', 1, 'complete', 'It waits for a permission.'))
    assert.deepEqual([whole.state, shownOf(whole)], ['answered', 'It waits for a permission.'])
  })

  it('takes nothing from another question’s events, a repeat, a late one, or one after the end (UI-15)', () => {
    const q = after('q1', event('q1', 1, 'chunk', 'One. '))
    assert.equal(heard(q, event('q0', 2, 'chunk', 'Old answer')), q) // another question's, late
    assert.equal(heard(q, event('q1', 1, 'chunk', 'One. ')), q) // a repeat, after a reconnect
    assert.equal(heard(q, event('q1', 3, 'chunk', 'Three.')), q) // a gap waits for the whole answer
    const done = heard(q, event('q1', 3, 'complete', 'One. Two. Three.'))
    assert.equal(shownOf(done), 'One. Two. Three.')
    assert.equal(heard(done, event('q1', 4, 'failed')), done)
  })

  it('never shows partial chunks as a whole answer: a bare completion after a gap is no answer (review P3)', () => {
    const gap = after(
      'q1',
      event('q1', 1, 'chunk', 'One. '),
      event('q1', 3, 'chunk', 'Three.'),
      event('q1', 4, 'complete'),
    )
    assert.deepEqual([gap.state, gap.answer], ['failed', null])
    const whole = after(
      'q2',
      event('q2', 1, 'chunk', 'One. '),
      event('q2', 2, 'chunk', 'Two.'),
      event('q2', 3, 'complete'),
    )
    assert.deepEqual([whole.state, whole.answer], ['answered', 'One. Two.'])
  })

  it('fails a question that hears nothing more within the limit, and only that one (PR #76 review, P2)', () => {
    const silent = asking(question('q1'))
    const failed = stalled(silent, wait('q1', 0))
    assert.deepEqual([failed.state, failed.reason], ['failed', 'No answer came in time. Nothing was changed.'])
    const partly = after('q2', event('q2', 1, 'chunk', 'It waits '))
    assert.equal(stalled(partly, wait('q2', 1)).state, 'failed') // it stopped arriving
    assert.equal(stalled(partly, wait('q2', 0)), partly) // an event came since the wait began
    assert.equal(stalled(partly, wait('q1', 1)), partly) // another question's wait
    const done = after('q3', event('q3', 1, 'complete', 'Whole.'))
    assert.equal(stalled(done, wait('q3', 1)), done)
  })

  it('asked again, it is the same question on its next send, and nothing of the last send is kept (Codex F-004)', () => {
    const partly = heard(asking(question('q1')), event('q1', 1, 'chunk', 'It waits '))
    const failed = stalled(partly, { question_id: 'q1', send: 1, seq: 1 })
    const again = askedAgain(failed)
    assert.deepEqual(again.question, failed.question)
    assert.deepEqual(
      [again.send, again.state, again.seq, again.chunks, again.answer, again.reason],
      [2, 'waiting', 0, [], null, null],
    )
    assert.equal(askedAgain(askedAgain(again)).send, 4)
  })

  it('an earlier send’s wait or late event never fails or answers the send now (Codex F-004)', () => {
    const second = askedAgain(stalled(asking(question('q1')), { question_id: 'q1', send: 1, seq: 0 }))
    // The first send's wait began at seq 0 too: it is that send's, not this one's.
    assert.equal(stalled(second, { question_id: 'q1', send: 1, seq: 0 }), second)
    assert.equal(stalled(second, { question_id: 'q1', send: 2, seq: 0 }).state, 'failed')
    // The first send's answer, arriving late, is let go; this send's is taken.
    const first = { question_id: 'q1', send: 1 }
    const now = { question_id: 'q1', send: 2 }
    assert.equal(heardOn(second, first, event('q1', 1, 'complete', 'Too late.')), second)
    assert.equal(heardOn(second, first, event('q1', 1, 'failed')), second)
    assert.equal(heardOn(second, now, event('q1', 1, 'complete', 'On time.')).answer, 'On time.')
    assert.equal(heardOn(second, { question_id: 'q0', send: 2 }, event('q1', 1, 'chunk', 'Other.')), second)
  })

  it('is asked, first or again, only while the view allows it; otherwise why is said (Codex F-005)', () => {
    assert.equal(askBlocked(action('allowed'), true), null)
    assert.equal(askBlocked(action('denied'), true), 'No longer allowed for you here.')
    assert.equal(askBlocked(action('unavailable'), true), 'No longer allowed for you here.')
    assert.equal(askBlocked(null, true), 'Asking about this task isn’t offered here now.')
    // Allowed, with no conversation to send it to (its port gone): blocked too, and said.
    assert.equal(askBlocked(action('allowed'), false), 'The conversation isn’t connected here now.')
    assert.equal(askBlocked(action('denied'), false), 'No longer allowed for you here.') // the view's word first
  })

  it('Ask again sends the failed question’s next send only while nothing blocks it (Codex F-005)', () => {
    const failed = stalled(asking(question('q1')), wait('q1', 0))
    for (const blocked of ['denied', 'unavailable'] as const) {
      assert.equal(againOf(failed, askBlocked(action(blocked), true)), null)
    }
    assert.equal(againOf(failed, askBlocked(null, true)), null)
    assert.equal(againOf(failed, askBlocked(action('allowed'), false)), null) // no conversation: nothing goes
    assert.deepEqual(againOf(failed, askBlocked(action('allowed'), true)), askedAgain(failed)) // restored: the same
    assert.equal(againOf(asking(question('q2')), null), null) // still waiting: nothing to ask again
    assert.equal(againOf(undefined, null), null)
  })

  it('keeps a question that can’t be answered here, with why, and makes no answer up', () => {
    const kept = unanswerable(question('q1'), 'The conversation isn’t connected in this slice.')
    assert.deepEqual(
      [kept.state, kept.reason, shownOf(kept), kept.question.text],
      ['unavailable', 'The conversation isn’t connected in this slice.', '', 'Why is it waiting?'],
    )
    const down = after('q2', event('q2', 1, 'unavailable', 'Sophia isn’t reachable right now.'))
    assert.deepEqual([down.state, down.reason, shownOf(down)], ['unavailable', 'Sophia isn’t reachable right now.', ''])
  })
})
