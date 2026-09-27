import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  askAgainIn,
  clock,
  countdown,
  freshJoinToken,
  invitationState,
  knockNote,
  removalNote,
  linkLimits,
  nextSession,
  PENDING_JOIN_MS,
  qrPath,
  readJoinToken,
  sessionFromForm,
  sessionLabel,
} from './access-view.ts'

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

  it('says what a room link still allows', () => {
    assert.equal(
      linkLimits({ expiresAt: '2026-10-02T12:00:00Z', uses: 3, maxUses: 50 }),
      'Works until Oct 2 · 3 of 50 uses',
    )
    assert.equal(
      linkLimits({ expiresAt: '2026-10-02T12:00:00Z', uses: 0, maxUses: 1 }),
      'Works until Oct 2 · 0 of 1 use',
    )
  })

  it('names an invitation’s state: what ended it first, then who it is for and the email', () => {
    const now = at('2026-10-01T12:00:00Z')
    const open = { role: 'editor' as const, uses: 0, revokedAt: null, expiresAt: '2026-10-08T12:00:00Z' }
    assert.equal(invitationState({ ...open, emailStatus: 'sent' }, now), 'editor · email sent')
    assert.equal(invitationState({ ...open, role: null, emailStatus: 'not_configured' }, now), 'not emailed')
    assert.equal(invitationState({ ...open, uses: 1, emailStatus: 'sent' }, now), 'joined')
    assert.equal(invitationState({ ...open, revokedAt: '2026-10-01T10:00:00Z', emailStatus: 'sent' }, now), 'cancelled')
    assert.equal(invitationState({ ...open, expiresAt: '2026-09-30T12:00:00Z', emailStatus: 'failed' }, now), 'expired')
  })

  it('counts down the minute before a declined guest may ask again', () => {
    const decided = '2026-10-01T12:00:00Z'
    assert.equal(askAgainIn(decided, at('2026-10-01T12:00:18Z')), 42)
    assert.equal(askAgainIn(decided, at('2026-10-01T12:01:00Z')), 0)
    assert.equal(askAgainIn(null, 0), 0)
    assert.equal(clock(42), '0:42')
    assert.equal(clock(60), '1:00')
  })

  it('tells a first knock from someone who keeps asking', () => {
    assert.deepEqual([knockNote(1), knockNote(2), knockNote(4)], ['', 'asked again', 'asked 4 times'])
  })

  it('says whether a declined guest is out of the call, and never before the server confirmed it (A07)', () => {
    assert.equal(removalNote(null), '')
    assert.equal(removalNote(undefined), '')
    assert.equal(removalNote({ state: 'pending', attempts: 0, lastError: null }), 'taking them out of the call…')
    assert.equal(
      removalNote({ state: 'pending', attempts: 3, lastError: 'connect ECONNREFUSED' }),
      'not out of the call yet · tried 3 times',
    )
    assert.equal(removalNote({ state: 'removed', attempts: 1, lastError: null }), 'out of the call')
    assert.equal(removalNote({ state: 'absent', attempts: 0, lastError: null }), '', 'they were not in it')
  })

  it('keeps an opened link for the sign-in round trip, then lets it go', () => {
    const token = 'b'.repeat(43)
    const saved = JSON.stringify({ token, at: 1_000 })
    assert.equal(freshJoinToken(saved, 1_000 + PENDING_JOIN_MS - 1), token)
    assert.equal(freshJoinToken(saved, 1_000 + PENDING_JOIN_MS + 1), null)
    assert.equal(freshJoinToken(JSON.stringify({ token: 'short', at: 1_000 }), 1_000), null)
    assert.equal(freshJoinToken('not json', 0), null)
    assert.equal(freshJoinToken(null, 0), null)
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
