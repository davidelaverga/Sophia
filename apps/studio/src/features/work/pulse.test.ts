import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Event as ProjectEvent } from '@sophia/contracts'
import { pulseRows } from './pulse.ts'

let n = 0
const event = (summaryCode: string, occurredAt: string): ProjectEvent => ({
  eventId: `e${String(++n)}`,
  projectId: 'p',
  sequence: String(n),
  type: 'x.changed',
  occurredAt,
  entityType: 'x',
  entityId: 'x',
  entityRevision: 1,
  references: [],
  summaryCode,
})
const t = (minute: number) => `2026-09-30T10:${String(minute).padStart(2, '0')}:00Z`
const view = (events: ProjectEvent[]) =>
  pulseRows(events).map((r) => `${r.label} ×${String(r.count)} @${r.at.slice(14, 16)}`)

describe('the work pulse folds repeats', () => {
  it('folds a run of the same change into one row with a count', () => {
    const rows = view([event('room.session', t(9)), event('room.session', t(9)), event('contribution.discuss', t(8))])
    assert.deepEqual(rows, ['Session scheduled ×2 @09', 'Shared with the project ×1 @08'])
  })

  it('folds repeats that alternate with another change, within five minutes', () => {
    const codes = ['room.invitation_revoked', 'room.invitation', 'room.invitation_revoked', 'room.invitation']
    const rows = view(codes.map((c, i) => event(c, t(9 - i))))
    assert.equal(rows.length, 2)
    assert.match(rows[0] ?? '', /×2 @09$/)
    assert.match(rows[1] ?? '', /×2 @08$/)
  })

  it('keeps repeats further apart than five minutes as their own rows', () => {
    const rows = view([event('contribution.discuss', t(20)), event('contribution.discuss', t(10))])
    assert.deepEqual(rows, ['Shared with the project ×1 @20', 'Shared with the project ×1 @10'])
  })

  it('keeps the newest time on a row, even when an older event arrived first', () => {
    const [row] = pulseRows([event('contribution.discuss', t(10)), event('contribution.discuss', t(12))])
    assert.equal(row?.count, 2)
    assert.equal(row?.at, t(12))
  })
})

describe('a command’s later events are not new requests (R-C75-UI-1)', () => {
  const typed = (type: string, summaryCode: string, occurredAt: string): ProjectEvent => ({
    ...event(summaryCode, occurredAt),
    type,
  })

  it('one retirement is one request; its progress and its unconfirmed or refused stops say what they are', () => {
    const progress = Array.from({ length: 17 }, () =>
      typed('command.retirement_changed', 'command.retire_sessions', t(12)),
    )
    const rows = view([
      typed('command.denied', 'command.stop', t(12)),
      typed('command.outcome_unknown', 'command.stop', t(12)),
      ...progress,
      typed('command.admitted', 'command.retire_sessions', t(11)),
    ])
    assert.deepEqual(rows, [
      'Stop not carried out ×1 @12',
      'Stop not confirmed ×1 @12',
      'Retirement of remaining sessions: session results updated ×17 @12',
      'Retirement of remaining sessions requested ×1 @11',
    ])
  })

  it('keeps every admission’s own words', () => {
    assert.deepEqual(
      view([typed('command.admitted', 'command.stop', t(1)), typed('command.admitted', 'command.hold', t(1))]),
      ['Stop requested ×1 @01', 'Hold requested ×1 @01'],
    )
  })
})
