import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Digest } from '../../api/vision.ts'
import { digestLead, lengthShares, meetingRow } from './updates-view.ts'

const digest = (over: Partial<Digest> = {}): Digest => ({
  fromSequence: '12',
  toSequence: '20',
  decided: [],
  made: [],
  noted: [],
  open: [],
  work: [],
  names: {},
  ...over,
})

describe('the digest’s lead', () => {
  it('says when nothing is new, and when the person never looked; with something new, the sections speak', () => {
    assert.equal(digestLead(digest()), 'Nothing new since you last looked.')
    assert.equal(digestLead(digest({ fromSequence: null })), 'You haven’t looked before: this is everything so far.')
    const one = digest({ open: [{ proposalId: 'p', statement: 'Try the pilot' }] })
    assert.equal(digestLead(one), null)
    assert.equal(digestLead({ ...one, fromSequence: null }), 'You haven’t looked before: this is everything so far.')
  })
})

describe('a meeting’s bar', () => {
  it('is its length against the longest closed one; the running one has none; a very short one still shows', () => {
    const shares = lengthShares([
      { id: 'now', startedAt: '2026-10-05T10:00:00.000Z', endedAt: null },
      { id: 'long', startedAt: '2026-10-04T15:00:00.000Z', endedAt: '2026-10-04T15:40:00.000Z' },
      { id: 'half', startedAt: '2026-10-03T15:00:00.000Z', endedAt: '2026-10-03T15:20:00.000Z' },
      { id: 'blip', startedAt: '2026-10-02T15:00:00.000Z', endedAt: '2026-10-02T15:00:10.000Z' },
    ])
    assert.equal(shares.get('now'), undefined)
    assert.equal(shares.get('long'), 1)
    assert.equal(shares.get('half'), 0.5)
    assert.equal(shares.get('blip'), 0.04)
  })
})

describe('a meeting’s row', () => {
  const fmt = {
    day: () => 'Oct 4',
    time: (d: Date) => `${String(d.getUTCHours())}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
    today: (d: Date) => d.getUTCDate() === 5,
  }

  it('says the running one is now, with when it started', () => {
    assert.equal(meetingRow({ startedAt: '2026-10-05T10:02:00.000Z', endedAt: null }, fmt), 'Now · started 10:02')
    // Begun on an earlier day, it says which.
    assert.equal(
      meetingRow({ startedAt: '2026-10-04T23:50:00.000Z', endedAt: null }, fmt),
      'Now · started Oct 4, 23:50',
    )
  })

  it('says when a closed one was and how long it lasted', () => {
    const at = '2026-10-04T15:00:00.000Z'
    assert.equal(meetingRow({ startedAt: at, endedAt: '2026-10-04T15:38:30.000Z' }, fmt), 'Oct 4, 15:00 · 38 min')
    assert.equal(meetingRow({ startedAt: at, endedAt: '2026-10-04T15:01:10.000Z' }, fmt), 'Oct 4, 15:00 · 1 min')
    assert.equal(
      meetingRow({ startedAt: at, endedAt: '2026-10-04T15:00:20.000Z' }, fmt),
      'Oct 4, 15:00 · under a minute',
    )
  })
})
