import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lastSaid, reviewLine, type ActiveReview, type LastReview, type Reviewed } from './review.ts'

const NOW = new Date('2026-10-03T12:00:00Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()

/** A goal's review, read with its plan at revision 3. */
const plan = (over: Partial<Reviewed> = {}): Reviewed => ({ revision: 3, ...over })

const active = (over: Partial<ActiveReview> = {}): ActiveReview => ({
  review_id: 'r1',
  plan_revision: 3,
  state: 'running',
  asked_by: 'davide',
  asked_at: at(-3),
  allowance_owner: null,
  ...over,
})

const last = (outcome: LastReview['outcome'], checkpoint: string | null = null): LastReview => ({
  review_id: 'r0',
  plan_revision: 3,
  completed_at: at(-12),
  outcome,
  checkpoint: checkpoint ? { label: checkpoint } : null,
})

const name = (id: string) => ({ luis: 'Luis', davide: 'Davide' })[id] ?? id
const line = (p: Reviewed) => reviewLine(p, 'luis', name, NOW)

describe('reviewLine', () => {
  it('nothing before the first review', () => {
    assert.equal(line(plan()), null)
  })

  it('the one review running: who asked it and when, the viewer as you, or scheduled', () => {
    assert.deepEqual(line(plan({ active_review: active() })), {
      kind: 'running',
      text: 'The lead is reviewing · asked by Davide 3 min ago',
    })
    assert.equal(
      line(plan({ active_review: active({ asked_by: 'luis' }) }))?.text,
      'The lead is reviewing · asked by you 3 min ago',
    )
    assert.equal(line(plan({ active_review: active({ asked_by: null }) }))?.text, 'The lead is reviewing · scheduled')
  })

  it('without a viewer, a scheduled review is still scheduled, never "you"', () => {
    assert.equal(
      reviewLine(plan({ active_review: active({ asked_by: null }) }), null, name, NOW)?.text,
      'The lead is reviewing · scheduled',
    )
  })

  it('the viewer who owns the allowance is told they can extend it', () => {
    const waiting = active({ state: 'awaiting_allowance', allowance_owner: 'luis' })
    assert.equal(
      line(plan({ active_review: waiting }))?.text,
      'Awaiting review: the project’s allowance is spent. You can extend it.',
    )
  })

  it('a review of an older revision says which', () => {
    assert.equal(
      line(plan({ active_review: active({ plan_revision: 2 }) }))?.text,
      'The lead is reviewing · asked by Davide 3 min ago · of r2',
    )
  })

  it('unfunded, it waits and names who can extend the allowance', () => {
    const waiting = active({ state: 'awaiting_allowance', allowance_owner: 'davide' })
    assert.deepEqual(line(plan({ active_review: waiting })), {
      kind: 'awaiting',
      text: 'Awaiting review: the project’s allowance is spent. Davide can extend it.',
    })
  })

  it('a running review is said before the last one; once it ends, the last is said', () => {
    assert.equal(line(plan({ active_review: active(), last_review: last('no_change') }))?.kind, 'running')
    assert.deepEqual(line(plan({ last_review: last('no_change') })), {
      kind: 'ended',
      text: 'Reviewed 12 min ago · no change',
    })
  })
})

describe('lastSaid', () => {
  it('says when and how it ended, quietly', () => {
    assert.equal(lastSaid(null, NOW), null)
    assert.equal(
      lastSaid(last('insufficient_evidence', 'the retry passes'), NOW),
      'Reviewed 12 min ago · not enough to tell until the retry passes',
    )
    assert.equal(lastSaid(last('insufficient_evidence'), NOW), 'Reviewed 12 min ago · not enough to tell yet')
    assert.equal(lastSaid(last('recommendation'), NOW), 'Reviewed 12 min ago · a change proposed')
    assert.equal(lastSaid(last('failed'), NOW), 'The last review didn’t finish')
  })
})
