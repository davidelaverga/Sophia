// Room access in the Studio, as plain rules: invitation links, the room calendar and the QR code's shape.
// Pure, so they are unit-tested; the components only render them.
import type { Invitation, RoomSession, SessionCreate } from '@sophia/contracts'

/** Invitation links are `/join#<token>`: the token rides in the fragment and never reaches a server log. */
const TOKEN = /^[A-Za-z0-9_-]{20,100}$/

export function readJoinToken(hash: string): string | null {
  const token = hash.startsWith('#') ? hash.slice(1) : hash
  return TOKEN.test(token) ? token : null
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
