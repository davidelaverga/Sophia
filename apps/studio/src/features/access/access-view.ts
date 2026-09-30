// Room access in the Studio, as plain rules: invitation links, the room calendar and the QR code's shape.
// Pure, so they are unit-tested; the components only render them.
import type { Invitation, LobbyEntry, RoomSession, SessionCreate } from '@sophia/contracts'
import type { AdmissionState } from '../../api/useAdmission.ts'

/** Invitation links are `/join#<token>`: the token rides in the fragment and never reaches a server log. */
const TOKEN = /^[A-Za-z0-9_-]{20,100}$/

export function readJoinToken(hash: string): string | null {
  const token = hash.startsWith('#') ? hash.slice(1) : hash
  return TOKEN.test(token) ? token : null
}

/**
 * A form's button for an admission: what it does, what it says while it works, and Try again once the outcome is
 * unknown (pressing it then sends the same request again: useAdmission's send).
 */
export function admissionLabel(status: AdmissionState<unknown, unknown>['status'], idle: string, busy: string): string {
  if (status === 'sending') return busy
  return status === 'unknown' ? 'Try again' : idle
}

/** How long a declined guest waits before asking again; migration 0011 holds the same minute. */
export const ASK_AGAIN_MS = 60_000

/** Seconds until a declined guest may ask again, 0 once they may. */
export function askAgainIn(decidedAt: string | null, now: number): number {
  if (!decidedAt) return 0
  return Math.max(0, Math.ceil((Date.parse(decidedAt) + ASK_AGAIN_MS - now) / 1000))
}

/** "0:42": a short wait, as a clock. */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** How often a guest has asked, when it is more than once: the room sees who keeps asking. */
export function knockNote(knocks: number): string {
  if (knocks < 2) return ''
  return knocks === 2 ? 'asked again' : `asked ${knocks} times`
}

/**
 * A guest's removal from the call, in words (amendment A07): pending until the room server confirms it, with how
 * often it was tried; empty when there is nothing to say (none, or they were never in the call).
 */
export function removalNote(removal: LobbyEntry['removal']): string {
  if (!removal || removal.state === 'absent') return ''
  if (removal.state === 'removed') return 'out of the call'
  if (removal.attempts === 0) return 'taking them out of the call…'
  return `not out of the call yet · tried ${removal.attempts} ${removal.attempts === 1 ? 'time' : 'times'}`
}

/** How long an opened invitation link waits on this device for its sign-in round trip. */
export const PENDING_JOIN_MS = 60 * 60_000

/** A token saved as `{ token, at }` when its link was opened, while it is still fresh. */
export function freshJoinToken(raw: string | null, now: number): string | null {
  if (!raw) return null
  try {
    const saved: unknown = JSON.parse(raw)
    if (typeof saved !== 'object' || saved === null || !('token' in saved) || !('at' in saved)) return null
    const { token, at } = saved
    if (typeof token !== 'string' || typeof at !== 'number' || now - at > PENDING_JOIN_MS) return null
    return readJoinToken(token)
  } catch {
    return null
  }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** What a link still allows: "Works until Oct 2 · 3 of 50 uses". */
export function linkLimits(i: Pick<Invitation, 'expiresAt' | 'uses' | 'maxUses'>): string {
  const until = new Date(i.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `Works until ${until} · ${i.uses} of ${i.maxUses} ${i.maxUses === 1 ? 'use' : 'uses'}`
}

const EMAIL_WORD: Record<Invitation['emailStatus'], string> = {
  none: 'not emailed',
  sent: 'email sent',
  failed: 'email failed',
  not_configured: 'not emailed',
}

/** An invitation's state in a word or two, first what ended it, then who it is for and whether the email went. */
export function invitationState(
  i: Pick<Invitation, 'role' | 'uses' | 'revokedAt' | 'expiresAt' | 'emailStatus'>,
  now: number,
): string {
  if (i.uses > 0) return 'joined'
  if (i.revokedAt) return 'cancelled'
  if (Date.parse(i.expiresAt) <= now) return 'expired'
  return i.role ? `${i.role} · ${EMAIL_WORD[i.emailStatus]}` : EMAIL_WORD[i.emailStatus]
}

/** How long ago, in the room's short words: "just now", "12 min ago", "3 h ago", "2 days ago". */
export function ago(at: string, now: number): string {
  const elapsed = Math.max(0, now - Date.parse(at))
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`
  if (elapsed < 24 * HOUR) return `${Math.floor(elapsed / HOUR)} h ago`
  const days = Math.floor(elapsed / (24 * HOUR))
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

/**
 * A guest in the Invite sheet's door record (let in, declined or blocked): what still matters about them (a removal
 * under way, asking again), then when it was decided. The list's title already says what was decided.
 */
export function doorNote(e: Pick<LobbyEntry, 'removal' | 'knocks' | 'decidedAt'>, now: number): string {
  const when = e.decidedAt ? ago(e.decidedAt, now) : ''
  return [removalNote(e.removal) || knockNote(e.knocks), when].filter(Boolean).join(' · ')
}

/** The first session that has not ended yet. */
export function nextSession(sessions: readonly RoomSession[], now: number): RoomSession | null {
  return (
    sessions
      .filter((s) => Date.parse(s.endsAt) > now)
      .toSorted((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null
  )
}

/** "starts in 12 min", "starts in 3 h", "under way", in the viewer's own words of time. */
export function countdown(session: Pick<RoomSession, 'startsAt' | 'endsAt'>, now: number): string {
  const start = Date.parse(session.startsAt)
  if (now >= Date.parse(session.endsAt)) return 'ended'
  if (now >= start) return 'under way'
  const left = start - now
  if (left < MINUTE) return 'starts in a moment'
  if (left < HOUR) return `starts in ${Math.round(left / MINUTE)} min`
  if (left < 24 * HOUR) return `starts in ${Math.round(left / HOUR)} h`
  const days = Math.round(left / (24 * HOUR))
  return `starts in ${days} ${days === 1 ? 'day' : 'days'}`
}

/** "Today · 10:00 – 11:00", "Tomorrow · 09:30 – 10:30" or "Thu, Oct 1 · 10:00 – 11:00", in the viewer's zone. */
export function sessionLabel(
  session: Pick<RoomSession, 'startsAt' | 'endsAt'>,
  now: number,
  timeZone?: string,
): string {
  const zone = timeZone ? { timeZone } : {}
  const time = new Intl.DateTimeFormat('en-US', { ...zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const dayKey = new Intl.DateTimeFormat('en-CA', { ...zone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const start = new Date(session.startsAt)
  const day = dayKey.format(start)
  const today = dayKey.format(new Date(now))
  const tomorrow = dayKey.format(new Date(now + 24 * HOUR))
  const name =
    day === today
      ? 'Today'
      : day === tomorrow
        ? 'Tomorrow'
        : new Intl.DateTimeFormat('en-US', { ...zone, weekday: 'short', month: 'short', day: 'numeric' }).format(start)
  return `${name} · ${time.format(start)} – ${time.format(new Date(session.endsAt))}`
}

/** A session from the form's local date and time (the browser's zone), lasting `minutes`. */
export function sessionFromForm(
  form: { title: string; date: string; time: string; minutes: number },
  timeZone: string,
): SessionCreate {
  const start = new Date(`${form.date}T${form.time}`)
  return {
    title: form.title.trim(),
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + form.minutes * MINUTE).toISOString(),
    timeZone,
  }
}

/** The session the form describes, or null while its date or time is incomplete (the form is being edited). */
export function plannedSession(
  form: { title: string; date: string; time: string; minutes: number },
  timeZone: string,
): SessionCreate | null {
  if (!form.date || !form.time || Number.isNaN(Date.parse(`${form.date}T${form.time}`))) return null
  return sessionFromForm(form, timeZone)
}

/** The first session a planned one would overlap (sessions that only touch don't), so the form can say so first. */
export function clashWith(
  sessions: readonly RoomSession[],
  planned: Pick<RoomSession, 'startsAt' | 'endsAt'>,
): RoomSession | null {
  const start = Date.parse(planned.startsAt)
  const end = Date.parse(planned.endsAt)
  return sessions.find((s) => Date.parse(s.startsAt) < end && Date.parse(s.endsAt) > start) ?? null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The form's date and time fields for a moment, in the browser's zone: "2026-09-30" and "04:00". */
export function formSlot(at: Date): { date: string; time: string } {
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  }
}

/** One SVG path for the dark modules of a QR matrix: a square per module, on a grid with a quiet border. */
export function qrPath(cells: readonly (readonly boolean[])[], border: number): string {
  const parts: string[] = []
  cells.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x + border} ${y + border}h1v1h-1z`)
    }),
  )
  return parts.join('')
}
