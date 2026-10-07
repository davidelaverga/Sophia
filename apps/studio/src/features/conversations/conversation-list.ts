// The words a project's conversations are listed with (docs/plans/project-conversations.md): who wrote there, what is
// open, the filter by title, and the brief's accepted decisions beside them.
import type { MissionDecision } from '@sophia/contracts'
import type { ConversationSummary } from '../../api/vision.ts'

/** The project's conversations, as read for this person. */
export const listKey = (projectId: string, name: string) => ['vision', 'conversations', projectId, name] as const

/** A conversation's messages, as read for this person. */
export const messagesKey = (conversationId: string, name: string) =>
  ['vision', 'conversation', conversationId, name] as const

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

/** Who wrote a message: Sophia, «You», or the member's name. */
export const messageBy = (
  m: { author: 'member' | 'sophia'; actorId: string | null; name: string | null },
  me: string,
) => (m.author === 'sophia' ? 'Sophia' : m.actorId === me ? 'You' : (m.name ?? 'A member'))

/** How close in time two messages by the same author are to read as one run (docs/plans/conversation-thread.md). */
const RUN_MS = 5 * 60_000

type Said = { author: 'member' | 'sophia'; actorId: string | null; at: string }

/** Whether `m` goes on from `before`: the same author (Sophia, or the same person) within five minutes. */
export function continuesRun(before: Said | undefined, m: Said): boolean {
  if (!before || before.author !== m.author || before.actorId !== m.actorId) return false
  const gap = Date.parse(m.at) - Date.parse(before.at)
  return gap >= 0 && gap < RUN_MS
}

/** A face's letter: the name's first, upper case; a member with no name is «A member». */
export const initialOf = (name: string | null) => (name ?? 'A member').trim().charAt(0).toLocaleUpperCase()

/** Whether Sophia answered since she was asked: a message of hers written after then (wherever the page holds it). */
export function answeredAfter(
  messages: readonly { author: 'member' | 'sophia'; at: string }[],
  askedAt: string,
): boolean {
  const asked = Date.parse(askedAt)
  return messages.some((m) => m.author === 'sophia' && Date.parse(m.at) > asked)
}

/** A message's first words, for the line that says which one wasn't confirmed. */
export const firstWords = (text: string): string => (text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text)

/** A conversation's pages as read: the first is the newest; each oldest first. */
export interface ReadPages<M> {
  pages: readonly { messages: readonly M[]; before: string | null }[]
  pageParams: readonly (string | null)[]
}

/**
 * The pages with a message the API accepted at the end of the newest one, once (its receipt's): it shows at once, and
 * stays should reading the conversation again fail.
 */
export function withMessage<M extends { id: string }>(
  read: ReadPages<M> | undefined,
  message: M,
): ReadPages<M> | undefined {
  const [newest, ...rest] = read?.pages ?? []
  if (!read || !newest || read.pages.some((p) => p.messages.some((m) => m.id === message.id))) return read
  return { ...read, pages: [{ ...newest, messages: [...newest.messages, message] }, ...rest] }
}
