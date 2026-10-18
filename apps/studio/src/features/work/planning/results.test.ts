import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { view } from './board-samples.ts'
import type { Candidate } from './board-view.ts'
import { refOf, resultsOf, reviewOf, reviewSaid, versionNames, versionSaid } from './results.ts'

const candidate = (version: string, state: Candidate['state'], minute = 0): Candidate => ({
  source_id: 'source-retry',
  version_id: version,
  sha256: version.length.toString(16).padEnd(64, 'a'),
  media_type: 'text/markdown',
  created_at: `2026-10-02T12:0${String(minute)}:00Z`,
  state,
})

describe('a task’s results', () => {
  it('has a current version and keeps the newest earlier one usable; a withdrawn one is neither (UI-18)', () => {
    const v = view('w', {
      candidates: [candidate('v1', 'previous', 1), candidate('v0', 'previous', 0), candidate('v2', 'withdrawn', 2)],
    })
    assert.deepEqual([resultsOf(v).current, resultsOf(v).earlier?.version_id], [null, 'v1'])
    assert.deepEqual(resultsOf(null), { current: null, earlier: null, ambiguous: false })
  })

  it('takes no result when two versions claim to be current (review P3)', () => {
    const both = view('w', { candidates: [candidate('v1', 'current', 1), candidate('v2', 'current', 2)] })
    assert.deepEqual([resultsOf(both).current, resultsOf(both).ambiguous], [null, true])
  })

  it('says which version a review speaks of: one passed for v1 says nothing of v2 (UI-05)', () => {
    const passedOld = view('w', {
      candidates: [candidate('v2', 'current', 2), candidate('v1', 'previous', 1)],
      review: { state: 'passed', candidate_version_ref: 'v1', evidence_refs: ['check-v1'] },
    })
    assert.equal(reviewOf(passedOld), 'another')
    assert.equal(reviewSaid(passedOld), 'Review passed for v1, not this version')
    const passedNew = { ...passedOld, review: { ...passedOld.review, candidate_version_ref: 'v2' } }
    assert.equal(reviewOf(passedNew), 'current')
    assert.equal(reviewSaid(passedNew), 'Review passed')
    assert.equal(reviewSaid(view('w')), null)
    assert.equal(reviewOf(view('w')), 'none')
  })

  it('a review bound to a version no single current one matches certifies nothing, and says so (Codex F-009)', () => {
    const review = { state: 'passed' as const, candidate_version_ref: 'v1', evidence_refs: ['check-v1'] }
    const twoCurrent = view('w', { candidates: [candidate('v1', 'current', 1), candidate('v2', 'current', 2)], review })
    const noneCurrent = view('w', { candidates: [candidate('v1', 'previous', 1)], review })
    const withdrawn = view('w', { candidates: [candidate('v1', 'withdrawn', 1)], review })
    const noCandidate = view('w', { review })
    for (const v of [twoCurrent, noneCurrent, withdrawn]) {
      assert.equal(reviewOf(v), 'unmatched')
      assert.equal(reviewSaid(v), 'Review passed for v1, no single current version to match it to')
    }
    // Bound to a version the view no longer lists: said as such, never by its id.
    assert.equal(reviewOf(noCandidate), 'unmatched')
    assert.equal(
      reviewSaid(noCandidate),
      'Review passed for a version not listed, no single current version to match it to',
    )
    // Withdrawn, with another current: of another version, as before.
    const replaced = view('w', { candidates: [candidate('v1', 'withdrawn', 1), candidate('v2', 'current', 2)], review })
    assert.equal(reviewOf(replaced), 'another')
    // Bound to no version, it speaks of none: neither certifies nor denies one.
    assert.equal(reviewOf({ ...twoCurrent, review: { ...review, candidate_version_ref: null } }), 'none')
  })

  it('reaches a version by its exact identity, never a link', () => {
    const c = candidate('v2', 'current')
    assert.deepEqual(Object.keys(refOf('w', c)).toSorted(), [
      'media_type',
      'sha256',
      'source_id',
      'version_id',
      'work_id',
    ])
    // Its name and its kind in words: never its media type or a piece of its hash.
    assert.equal(versionSaid('v2', c), 'v2 · Markdown')
  })
})

describe('a version’s name (docs/plans/version-names.md)', () => {
  const A = '0b8f6a52-1c3e-4d7a-9f10-2a3b4c5d6e7f'
  const B = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b'
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-/

  it('is v1, v2… in the order made, withdrawn ones counted, ties by id: never the id', () => {
    const v = view('w', { candidates: [candidate(B, 'current', 2), candidate(A, 'withdrawn', 1)] })
    assert.deepEqual(
      [...versionNames(v)],
      [
        [A, 'v1'],
        [B, 'v2'],
      ],
    )
    const tied = view('w', { candidates: [candidate(B, 'current', 1), candidate(A, 'previous', 1)] })
    assert.deepEqual(
      [...versionNames(tied)],
      [
        [A, 'v1'],
        [B, 'v2'],
      ],
    )
    assert.deepEqual([...versionNames(null)], [])
  })

  it('names the version a review speaks of: no id in the words', () => {
    const v = view('w', {
      candidates: [candidate(B, 'current', 2), candidate(A, 'previous', 1)],
      review: { state: 'passed', candidate_version_ref: A, evidence_refs: [] },
    })
    assert.equal(reviewSaid(v), 'Review passed for v1, not this version')
    assert.doesNotMatch(reviewSaid(v) ?? '', UUID)
    assert.doesNotMatch(versionSaid('v2', candidate(B, 'current', 2)), UUID)
  })
})
