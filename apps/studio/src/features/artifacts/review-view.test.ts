import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { VersionReview } from '../../api/vision.ts'
import { byTime, reviewSettled } from './review-view.ts'

const review = (over: Partial<VersionReview> = {}): VersionReview => ({
  reviewId: 'r1',
  verdict: 'approved',
  note: null,
  by: 'me',
  at: '2026-10-06T10:00:00Z',
  ...over,
})

describe('what settles a press', () => {
  it('with no reply, only a new review of mine with its verdict and its words', () => {
    const ask = { verdict: 'changes_requested', note: 'Shorten it' } as const
    const mine = review({ verdict: 'changes_requested', note: 'Shorten it' })
    assert.equal(reviewSettled('unknown', ask, [mine], 'me'), true)
    assert.equal(reviewSettled('unknown', ask, [{ ...mine, note: 'Add a table' }], 'me'), false)
    assert.equal(reviewSettled('unknown', ask, [{ ...mine, by: 'ana' }], 'me'), false)
    assert.equal(reviewSettled('unknown', ask, [{ ...mine, verdict: 'approved', note: null }], 'me'), false)
    assert.equal(reviewSettled('unknown', ask, [], 'me'), false)
  })

  it('an approval has no words: any new approval of mine is it', () => {
    assert.equal(reviewSettled('unknown', { verdict: 'approved' }, [review()], 'me'), true)
  })

  it('a refusal gives way to any new review; a press on its way or answered, to none', () => {
    const theirs = review({ by: 'ana' })
    assert.equal(reviewSettled('rejected', { verdict: 'approved' }, [theirs], 'me'), true)
    assert.equal(reviewSettled('rejected', { verdict: 'approved' }, [], 'me'), false)
    assert.equal(reviewSettled('sending', { verdict: 'approved' }, [review()], 'me'), false)
    assert.equal(reviewSettled('idle', { verdict: 'approved' }, [review()], 'me'), false)
  })
})

const at = (h: number) => `2026-10-06T${String(h).padStart(2, '0')}:00:00Z`
const id = (r: VersionReview) => r.reviewId

describe('a record into a newest-first list', () => {
  it('takes its place by time, once', () => {
    const list = [review({ reviewId: 'b', at: at(12) }), review({ reviewId: 'a0', at: at(9) })]
    const late = review({ reviewId: 'a', at: at(11) })
    assert.deepEqual(byTime(list, late, id).map(id), ['b', 'a', 'a0'])
    assert.deepEqual(byTime(byTime(list, late, id), late, id).map(id), ['b', 'a', 'a0'])
    assert.deepEqual(byTime([], late, id).map(id), ['a'])
  })

  it('a record newer than all goes first', () => {
    assert.deepEqual(
      byTime([review({ reviewId: 'a', at: at(9) })], review({ reviewId: 'n', at: at(13) }), id).map(id),
      ['n', 'a'],
    )
  })
})
