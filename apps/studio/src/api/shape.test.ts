import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { instant, isDateTime, problemsOf } from './shape.ts'

describe('a date-time, as the wire declares it (GitHub review on PR #76)', () => {
  it('takes RFC 3339: a full date, a time, its fraction, and an offset', () => {
    for (const s of [
      '2026-10-03T15:01:04Z',
      '2026-10-03T15:01:04.250Z',
      '2026-10-03t15:01:04z',
      '2026-10-03T17:01:04+02:00',
      '2028-02-29T00:00:00Z', // a leap year's
    ]) {
      assert.equal(isDateTime(s), true, s)
    }
  })

  it('refuses one without its offset, which each browser reads in its own timezone', () => {
    assert.equal(isDateTime('2026-01-01T12:00'), false)
    assert.equal(isDateTime('2026-01-01T12:00:00'), false)
    assert.equal(isDateTime('2026-01-01'), false)
  })

  it('refuses a date or time the calendar doesn’t have, which Date.parse would roll over', () => {
    for (const s of [
      '2026-02-30T12:00:00Z',
      '2026-02-29T12:00:00Z', // not a leap year
      '2100-02-29T12:00:00Z', // nor a century that isn't one
      '2026-04-31T12:00:00Z',
      '2026-13-01T12:00:00Z',
      '2026-00-10T12:00:00Z',
      '2026-10-00T12:00:00Z',
      '2026-10-03T24:00:00Z',
      '2026-10-03T23:60:00Z',
      '2026-10-03T23:59:60Z', // a leap second, which the browser can't read
      '2026-10-03T12:00:00+24:00',
      '2026-10-03T12:00:00+02:60',
    ]) {
      assert.equal(isDateTime(s), false, s)
    }
  })

  it('names where a value fails, as the reader does', () => {
    const problems: string[] = []
    instant('2026-02-30T12:00:00Z', 'expires_at', problems)
    assert.deepEqual(problems, ['expires_at: an RFC 3339 date-time with its offset'])
    assert.deepEqual(problemsOf(instant, '2026-10-03T15:01:04Z'), [])
  })
})
