import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Since } from '../../api/vision.ts'
import { digestLead, lengthShares, meetingRow, shownSince, sinceOrder } from './updates-view.ts'

/** A complete A34 window (nothing after it), as the fixture pages answer one too. */
const digest = (over: Partial<Since> = {}): Since => ({
  fromSequence: '12',
  toSequence: '20',
  more: false,
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

describe('the window Updates may show (R-C2-READ-01)', () => {
  const read = (readFrom: number) => ({ window: digest(), readFrom })

  it('shows a read when nothing was refused, and keeps it through an ordinary failure', () => {
    assert.equal(shownSince(read(10), false, 0)?.toSequence, '20')
    assert.equal(shownSince(undefined, false, 0), undefined)
  })

  it('shows nothing while this person’s own read is refused, cached or not', () => {
    assert.equal(shownSince(read(10), true, 0), undefined)
    assert.equal(shownSince(read(30), true, 20), undefined)
  })

  it('after a refusal, shows no read set out before it: a later failure or an older read answering late', () => {
    assert.equal(shownSince(read(10), false, 20), undefined)
    assert.equal(shownSince(read(20), false, 20), undefined)
  })

  it('shows again only a read set out since the refusal', () => {
    assert.equal(shownSince(read(21), false, 20)?.toSequence, '20')
  })
})

const realNow = Date.now

describe('the read and refusal order, with the clock moved back (R-C2-READ-01, exchange 2)', () => {
  it('keeps a read set out before a refusal hidden, though the clock went back between them', () => {
    try {
      Date.now = () => 2000
      const read = { window: digest(), readFrom: sinceOrder() }
      Date.now = () => 1000
      const refusedAt = sinceOrder()
      assert.equal(shownSince(read, true, refusedAt), undefined, 'hidden while refused')
      assert.equal(shownSince(read, false, refusedAt), undefined, 'still hidden through a later ordinary failure')
      const since = { window: digest(), readFrom: sinceOrder() }
      assert.equal(shownSince(since, false, refusedAt)?.toSequence, '20', 'a read set out since shows')
    } finally {
      Date.now = realNow
    }
  })

  it('orders each call after every one before it, whatever the clock says', () => {
    try {
      const first = sinceOrder()
      Date.now = () => 0
      const second = sinceOrder()
      assert.ok(second > first)
    } finally {
      Date.now = realNow
    }
  })
})
