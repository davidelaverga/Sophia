import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { asking, heard, shownOf, stalled, unanswerable, type AskEvent, type Question } from './ask.ts'

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
    const failed = stalled(silent, 'q1', 0)
    assert.deepEqual([failed.state, failed.reason], ['failed', 'No answer came in time. Nothing was changed.'])
    const partly = after('q2', event('q2', 1, 'chunk', 'It waits '))
    assert.equal(stalled(partly, 'q2', 1).state, 'failed') // it stopped arriving
    assert.equal(stalled(partly, 'q2', 0), partly) // an event came since the wait began
    assert.equal(stalled(partly, 'q1', 1), partly) // another question's wait
    const done = after('q3', event('q3', 1, 'complete', 'Whole.'))
    assert.equal(stalled(done, 'q3', 1), done)
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
