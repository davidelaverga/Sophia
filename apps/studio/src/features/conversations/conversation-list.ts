// The words a project's conversations are listed with (docs/plans/project-conversations.md): who wrote there, what is
// open, the filter by title, and the brief's accepted decisions beside them.
import type { MissionDecision } from '@sophia/contracts'
import type { ConversationSummary } from '../../api/vision.ts'

/** Who wrote there, mine as «You», then Sophia when she answered: «Lucía, You · Sophia». */
export function contributorsLine(c: Pick<ConversationSummary, 'contributors' | 'sophia'>, me: string): string {
  const people = c.contributors.map((p) => (p.actorId === me ? 'You' : p.name)).join(', ')
  if (!people) return c.sophia ? 'Sophia' : 'Nobody has written yet'
  return c.sophia ? `${people} · Sophia` : people
}

export const openWords = (n: number): string =>
  n === 0 ? 'No open questions' : n === 1 ? '1 open question' : `${String(n)} open questions`

/** Newest activity first, whatever order they came in. */
export const byActivity = (all: readonly ConversationSummary[]): ConversationSummary[] =>
  all.toSorted((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt))

/** Lower case, without accents: «Lucía» is found by «lucia». */
const folded = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

/** The conversations whose title has every word typed, in any order; all of them for none. */
export function matching(all: readonly ConversationSummary[], typed: string): readonly ConversationSummary[] {
  const words = folded(typed).split(/\s+/u).filter(Boolean)
  return words.length > 0 ? all.filter((c) => words.every((w) => folded(c.title).includes(w))) : all
}

/** How many accepted decisions show before «and N more». */
export const SHOWN_DECISIONS = 3

/** When a decision was decided (or proposed, while it waits). */
const decidedWhen = (d: MissionDecision) => Date.parse(d.decidedAt ?? d.createdAt)

/** The brief's accepted decisions, newest first: the first three, and how many more. */
export function acceptedOf(constraints: readonly MissionDecision[]): { shown: MissionDecision[]; more: number } {
  const accepted = constraints.filter((d) => d.state === 'accepted').toSorted((a, b) => decidedWhen(b) - decidedWhen(a))
  return firstOf(accepted)
}

/** What is proposed and not decided, newest first: the first three, and how many more. */
export const pendingOf = (pending: readonly MissionDecision[]): { shown: MissionDecision[]; more: number } =>
  firstOf(pending.toSorted((a, b) => decidedWhen(b) - decidedWhen(a)))

/** The first three, and how many more. */
function firstOf(all: MissionDecision[]) {
  return { shown: all.slice(0, SHOWN_DECISIONS), more: Math.max(0, all.length - SHOWN_DECISIONS) }
}

const AT = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const
const DAY_TIME = new Intl.DateTimeFormat(undefined, AT)
const YEAR_DAY_TIME = new Intl.DateTimeFormat(undefined, { ...AT, year: 'numeric' })

/** When a message was written: its day and time, with the year when it isn't this one. */
export function messageWhen(at: string, now = new Date()): string {
  const when = new Date(at)
  return (when.getFullYear() === now.getFullYear() ? DAY_TIME : YEAR_DAY_TIME).format(when)
}

/** Who wrote a message: Sophia, «You», or the member's name. */
export const messageBy = (
  m: { author: 'member' | 'sophia'; actorId: string | null; name: string | null },
  me: string,
) => (m.author === 'sophia' ? 'Sophia' : m.actorId === me ? 'You' : (m.name ?? 'A member'))
