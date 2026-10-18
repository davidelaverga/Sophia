import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ProjectionCoverage } from '@sophia/contracts'
import { coverageWords } from './conversation-list.ts'

const coverage: ProjectionCoverage = {
  state: 'current',
  complete: true,
  fromSeq: 1,
  throughSeq: 9,
  newer: 0,
  generatedAt: '2026-10-12T12:00:00Z',
  replyId: '00000000-0000-4000-8000-000000000001',
  eligibilityRevision: 1,
  ledgerRevision: 1,
}

describe('context coverage labels', () => {
  it('names the separate projections without making their different ranges equal', () => {
    assert.equal(coverageWords(coverage, 'summary'), 'The summary covers messages 1–9.')
    assert.equal(
      coverageWords({ ...coverage, fromSeq: 3, throughSeq: 7 }, 'questions'),
      'The questions cover messages 3–7.',
    )
  })
  it('keeps incomplete and stale qualifications attached to each projection', () => {
    assert.equal(
      coverageWords({ ...coverage, state: 'stale', complete: false, since: 'unknown' }, 'questions'),
      'The questions cover messages 1–9, the newest then; it may be out of date.',
    )
    assert.equal(
      coverageWords({ ...coverage, state: 'stale', newer: 2 }, 'summary'),
      'The summary covers messages 1–9; 2 newer since.',
    )
  })
  it('names an unavailable projection while retaining its older range', () => {
    assert.equal(
      coverageWords({ ...coverage, state: 'unavailable' }, 'questions'),
      'The questions couldn’t be updated just now: they cover messages 1–9.',
    )
    assert.equal(
      coverageWords({ ...coverage, state: 'unavailable', fromSeq: null, throughSeq: null }, 'summary'),
      'The summary couldn’t be made just now.',
    )
  })
  it('does not manufacture coverage for a projection not assessed', () => {
    assert.equal(
      coverageWords({ ...coverage, state: 'not_assessed', fromSeq: null, throughSeq: null }, 'questions'),
      null,
    )
    assert.equal(coverageWords(coverage), 'Covers messages 1–9.')
  })
})
