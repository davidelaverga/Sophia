import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countdown, nextSession, qrPath, readJoinToken, sessionFromForm, sessionLabel } from './access-view.ts'

const at = (iso: string) => Date.parse(iso)
const session = (id: string, startsAt: string, endsAt: string) => ({ id, title: id, startsAt, endsAt, timeZone: 'UTC' })

describe('room access, as the Studio shows it', () => {
  it('reads the link token from the fragment and nothing that is not one', () => {
    const token = 'a'.repeat(43)
    assert.equal(readJoinToken(`#${token}`), token)
    assert.equal(readJoinToken(token), token)
    assert.equal(readJoinToken('#short'), null)
    assert.equal(readJoinToken(`#${token}<script>`), null)
  })

  it('finds the next session that has not ended', () => {
    const now = at('2026-10-01T12:00:00Z')
    const past = session('past', '2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z')
    const live = session('live', '2026-10-01T11:30:00Z', '2026-10-01T12:30:00Z')
    const later = session('later', '2026-10-02T09:00:00Z', '2026-10-02T10:00:00Z')
    assert.equal(nextSession([later, past, live], now)?.id, 'live')
    assert.equal(nextSession([past], now), null)
  })

  it('counts down in plain words', () => {
    const s = session('s', '2026-10-01T12:00:00Z', '2026-10-01T13:00:00Z')
    assert.equal(countdown(s, at('2026-10-01T11:48:00Z')), 'starts in 12 min')
    assert.equal(countdown(s, at('2026-10-01T09:00:00Z')), 'starts in 3 h')
    assert.equal(countdown(s, at('2026-09-29T12:00:00Z')), 'starts in 2 days')
    assert.equal(countdown(s, at('2026-10-01T11:59:40Z')), 'starts in a moment')
    assert.equal(countdown(s, at('2026-10-01T12:10:00Z')), 'under way')
    assert.equal(countdown(s, at('2026-10-01T13:00:00Z')), 'ended')
  })

  it('names the day relative to today, in the given zone', () => {
    const now = at('2026-10-01T12:00:00Z')
    assert.equal(
      sessionLabel(session('a', '2026-10-01T15:00:00Z', '2026-10-01T16:00:00Z'), now, 'UTC'),
      'Today · 15:00 – 16:00',
    )
    assert.equal(
      sessionLabel(session('b', '2026-10-02T09:30:00Z', '2026-10-02T10:30:00Z'), now, 'UTC'),
      'Tomorrow · 09:30 – 10:30',
    )
    assert.equal(
      sessionLabel(session('c', '2026-10-05T09:00:00Z', '2026-10-05T10:00:00Z'), now, 'UTC'),
      'Mon, Oct 5 · 09:00 – 10:00',
    )
  })

  it('turns the form into a session that lasts the chosen minutes', () => {
    const s = sessionFromForm({ title: '  Weekly  ', date: '2026-10-01', time: '10:00', minutes: 45 }, 'America/Bogota')
    assert.equal(s.title, 'Weekly')
    assert.equal(Date.parse(s.endsAt) - Date.parse(s.startsAt), 45 * 60_000)
    assert.equal(s.timeZone, 'America/Bogota')
  })

  it('draws one square per dark module, inside the quiet border', () => {
    assert.equal(
      qrPath(
        [
          [true, false],
          [false, true],
        ],
        4,
      ),
      'M4 4h1v1h-1zM5 5h1v1h-1z',
    )
  })
})
