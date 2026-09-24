import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Event } from '@sophia/contracts'
import { applyFrame, initialFeed, rebase } from './projection.ts'

const P = '00000000-0000-0000-0000-00000000000p'
const ev = (sequence: string, eventId = `e${sequence}`): Event => ({
  eventId,
  projectId: P,
  sequence,
  type: 'command.admitted',
  occurredAt: '2026-09-24T00:00:00Z',
  entityType: 'command',
  entityId: `c${sequence}`,
  entityRevision: 1,
  references: [],
  summaryCode: 'command.request_review',
})

describe('studio projection', () => {
  it('applies contiguous events newest first', () => {
    const s = [ev('1'), ev('2')].reduce(applyFrame, initialFeed('0'))
    assert.equal(s.cursor, '2')
    assert.deepEqual(
      s.recent.map((f) => f.sequence),
      ['2', '1'],
    )
  })

  it('ignores replays at or below the cursor', () => {
    const s = [ev('1'), ev('2'), ev('1'), ev('2')].reduce(applyFrame, initialFeed('0'))
    assert.equal(s.recent.length, 2)
  })

  it('asks for a snapshot on a gap instead of guessing', () => {
    const s = applyFrame(initialFeed('0'), ev('2'))
    assert.equal(s.needsSnapshot, true)
    assert.equal(s.cursor, '0')
    assert.equal(applyFrame(s, ev('1')), s) // frozen until resnapshot
    assert.partialDeepStrictEqual(rebase(s, '2'), { cursor: '2', needsSnapshot: false })
  })

  it('lets cursor.advanced cover hidden events without reporting a gap', () => {
    const s = [ev('1'), { projectId: P, type: 'cursor.advanced' as const, sequence: '3' }, ev('4')].reduce(
      applyFrame,
      initialFeed('0'),
    )
    assert.equal(s.needsSnapshot, false)
    assert.equal(s.cursor, '4')
  })

  it('keeps sequences beyond 2^53 exact', () => {
    const big = '9007199254740993'
    const s = applyFrame(initialFeed('9007199254740992'), ev(big))
    assert.equal(s.cursor, big)
  })
})
