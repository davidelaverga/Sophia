// What needs you on Home (docs/plans/home-needs-you.md): one list over the places a person would otherwise visit to
// learn nothing is waiting. No API serves it yet: the Studio shows it behind the vision flag, on fixture data.

export type NeedKind = 'decision' | 'permission' | 'review' | 'guest' | 'reply'

export interface Need {
  id: string
  kind: NeedKind
  /** What it is about: the decision's question, what the agent asks to do, the report, the guest, Sophia's words. */
  title: string
  /** The project it is in; null for Sophia's own reply. */
  project: string | null
  /** When it stops waiting (a decision, a permission), or null. */
  expiresAt: string | null
  /** A word on it when nothing expires: who asks, how long a guest has waited. */
  detail: string | null
}

/** The row's one action, for screen readers and touch. */
export const NEED_WORDS: Readonly<Record<NeedKind, string>> = {
  decision: 'Decide',
  permission: 'Allow or refuse',
  review: 'Review',
  guest: 'Let in',
  reply: 'Read',
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const expiry = (need: Need) => (need.expiresAt ? new Date(need.expiresAt).getTime() : null)

/** The needs in the order of their urgency: the expiring ones first, soonest first; then the rest as given. */
export function needsOrder(needs: readonly Need[]): Need[] {
  const timed = needs.filter((n) => expiry(n) !== null).toSorted((a, b) => (expiry(a) ?? 0) - (expiry(b) ?? 0))
  return [...timed, ...needs.filter((n) => expiry(n) === null)]
}

/** "in 20 min", "in 2 h", "in 3 days": how long until a moment, from now. */
export function untilWords(at: number, now: number): string {
  const left = at - now
  if (left < HOUR) return `in ${String(Math.max(Math.ceil(left / MINUTE), 1))} min`
  if (left < DAY) return `in ${String(Math.round(left / HOUR))} h`
  return `in ${String(Math.round(left / DAY))} days`
}

export type NeedTone = 'soon' | 'late' | 'quiet'

const toneOf = (left: number | null): NeedTone => {
  if (left === null) return 'quiet'
  if (left <= 0) return 'late'
  return left <= HOUR ? 'soon' : 'quiet'
}

/** A need's note under its title: where it is, and when it stops waiting (or its detail); its tone says how urgent. */
export function needNote(need: Need, now: Date): { text: string; tone: NeedTone } {
  const at = expiry(need)
  const left = at === null ? null : at - now.getTime()
  const when =
    at === null || left === null ? need.detail : left <= 0 ? 'expired' : `expires ${untilWords(at, now.getTime())}`
  return { text: [need.project, when].filter((p) => p !== null && p !== '').join(' · '), tone: toneOf(left) }
}

/** "3 things need you"; "Nothing needs you right now" when none. */
export const needsLabel = (count: number) => {
  if (count === 0) return 'Nothing needs you right now'
  return count === 1 ? '1 thing needs you' : `${String(count)} things need you`
}
