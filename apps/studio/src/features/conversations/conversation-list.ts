// The words a project's conversations are listed with (docs/plans/project-conversations.md): who wrote there, what is
// open, the filter by title, and the brief's accepted decisions beside them.
import type { MissionDecision } from '@sophia/contracts'
import type { ProjectionCoverage } from '@sophia/contracts'
import type {
  ConversationList,
  ConversationMessage,
  ConversationReply,
  ConversationSummary,
} from '../../api/conversations.ts'
import { plainOf } from './sophia-text.ts'

/** Every conversation list read, whatever its project or reader: what a write moves. */
export const LISTS = ['conversations', 'list'] as const

/** The project's conversations, as read for this person (their account: the token's subject, #189). */
export const listKey = (projectId: string, name: string) => [...LISTS, projectId, name] as const

/** A conversation's messages, as read for this person. */
export const messagesKey = (conversationId: string, name: string) =>
  ['conversations', 'messages', conversationId, name] as const

/** Who wrote there, mine as «You», then Sophia when she answered: «Lucía, You · Sophia». */
/** The most writers a conversation's summary names (A16's `contributors` `maxItems`): at that many, there may be more. */
export const NAMED_AT_MOST = 200

/**
 * What this view knows beyond a summary as read: that writers it doesn't name may exist. Set only here, when a
 * withdrawal takes a writer out of a list that named as many as A16 lets it (`listWithdrawn`); the next read answers
 * for itself.
 */
export interface Unnamed {
  othersUnnamed?: true
  /**
   * The place the list read said (its `messageSeq`), kept where a confirmed message has moved `messageSeq` on since: up
   * to it, the list read named everyone with a message still shown (below the cap, nobody unnamed; `firstsFor`).
   */
  listSeq?: number
  /**
   * The last activity the list read said (its `lastAt`), kept where a confirmed message has moved `lastAt` on since: a
   * withdrawal no older than it is one that read may not have known (`rowKnown`; PR #199 r4238826987).
   */
  listAt?: string
  /**
   * Writers this view took out of the row on a withdrawal, their words not shown in the pages read (`writersAfter`):
   * the list read named them, so their places are no less theirs for it (`firstsFor`; CX-0043).
   */
  removedHere?: readonly string[]
  /**
   * A row this view put by a start's title only (list-data `titleOnly`: its receipt not current where the feed stands,
   * or held back and landed): who wrote there, when it last moved and what it holds aren't known here, and it says
   * nothing of them, never «Nobody has written yet» (Codex at bfc2635c).
   */
  partial?: true
}

/**
 * A summary's or question list's coverage as this view may hold it, where what came since its range is no longer known
 * as a count (`since`). Its `newer` is then no count, and is never said as one; the next list read answers for itself.
 * - `uncounted`: newer messages are known, not how many. A confirmed message came after a gap in the row's places, or
 *   with no places to tell (`withLastMessage`; PR #199 r4237385090), or a withdrawal took one the count may have held
 *   while a newer one is still shown (`afterWithdrawal`).
 * - `unknown`: nothing newer is known, and whether the project's decisions moved isn't known here either. A withdrawal
 *   took the only newer message known (CX-0036): the projection is kept, as it never read it, and said possibly out
 *   of date; never `current`, which only the API can say.
 */
export type Coverage = ProjectionCoverage & { since?: 'uncounted' | 'unknown' }

export function contributorsLine(
  c: Pick<ConversationSummary, 'contributors' | 'sophia'> & Unnamed,
  me: string,
): string {
  if (c.partial) return 'Who wrote here isn’t known yet'
  const named = c.contributors.map((p) => (p.actorId === me ? 'You' : p.name)).join(', ')
  const people = c.contributors.length >= NAMED_AT_MOST || c.othersUnnamed ? `${named} and others` : named
  if (!people) return c.sophia ? 'Sophia' : 'Nobody has written yet'
  return c.sophia ? `${people} · Sophia` : people
}

/**
 * What a list of the newest only says of itself (A16's `more`): how many it holds as read, and the starts made here
 * that it shows besides, kept reachable though the read leaves them out (list-data `shownList`). That older ones
 * can’t be opened is said only of the others (Codex CX-0067).
 */
export function newestWords(read: number, besides: number): string {
  const newest = `Only the newest ${String(read)} conversations are listed here`
  if (besides <= 0) return `${newest}: older ones can’t be opened from this list yet.`
  const yours = besides === 1 ? 'the one you started here' : `the ${String(besides)} you started here`
  return `${newest}, and ${yours}: other older ones can’t be opened from this list yet.`
}

export const openWords = (n: number): string =>
  n === 0 ? 'No open questions' : n === 1 ? '1 open question' : `${String(n)} open questions`

/**
 * What is open, as far as anyone knows (A16 coverage): never «No open questions» where nobody has looked, only that
 * none is recorded yet.
 */
export const questionWords = (c: Pick<ConversationSummary, 'openQuestions' | 'questionsCoverage'>): string =>
  c.questionsCoverage.state === 'not_assessed' ? 'No recorded questions yet' : openWords(c.openQuestions)

/**
 * What a summary or a question list covers (binding map §3.1): which messages, and what came since; nothing where none
 * exists yet (the words beside it say so). A partial one says it read only the newest.
 */
export function coverageWords(c: Coverage): string | null {
  if (c.state === 'not_assessed' || c.fromSeq === null || c.throughSeq === null) {
    return c.state === 'unavailable' ? 'It couldn’t be made just now.' : null
  }
  const range = `messages ${String(c.fromSeq)}–${String(c.throughSeq)}${c.complete ? '' : ', the newest then'}`
  if (c.state === 'unavailable') return `It couldn’t be updated just now: it covers ${range}.`
  return c.state === 'stale' ? `Covers ${range}; ${sinceWords(c)}.` : `Covers ${range}.`
}

/** What a stale projection says came since its range (`Coverage`). */
function sinceWords(c: Coverage): string {
  if (c.since === 'unknown') return 'it may be out of date'
  if (c.since === 'uncounted') return 'newer messages since'
  return c.newer > 0 ? `${String(c.newer)} newer since` : 'the project’s decisions have changed since'
}

/** Newest activity first, whatever order they came in. */
export const byActivity = (all: readonly ConversationSummary[]): ConversationSummary[] =>
  all.toSorted((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt))

/** Lower case, without accents: «Lucía» is found by «lucia». */
const folded = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

/** The conversations whose title has every word typed, in any order; all of them for none. */
export function matching<T extends ConversationSummary>(all: readonly T[], typed: string): readonly T[] {
  const words = folded(typed).split(/\s+/u).filter(Boolean)
  return words.length > 0 ? all.filter((c) => words.every((w) => folded(c.title).includes(w))) : all
}

/** What the list is narrowed to: title words, those with an open question, those the reader wrote in. */
export interface Narrowing {
  typed: string
  open: boolean
  mine: boolean
}

/**
 * The conversations that pass every narrowing asked for, in the list's order. A row by its title only (`partial`)
 * passes neither «Open» nor «Mine»: what is open there and who wrote there aren't known (`unjudged` counts it).
 */
export function narrowed<T extends ConversationSummary & Unnamed>(all: readonly T[], by: Narrowing, me: string) {
  return matching(all, by.typed).filter(
    (c) =>
      (!by.open && !by.mine) ||
      (!c.partial && (!by.open || c.openQuestions > 0) && (!by.mine || c.contributors.some((p) => p.actorId === me))),
  )
}

/** How many rows by their title only «Open» or «Mine» leaves out, whether they match not known (`narrowed`). */
export const unjudged = (all: readonly (ConversationSummary & Unnamed)[], by: Narrowing): number =>
  by.open || by.mine ? matching(all, by.typed).filter((c) => c.partial).length : 0

/** What is said of the rows `unjudged` counts, beside what the narrowing shows. */
export const unjudgedWords = (n: number): string =>
  n === 1
    ? 'One more may match: it’s known here by its title only.'
    : `${String(n)} more may match: they’re known here by their titles only.`

/** How many accepted decisions show before «and N more». */
export const SHOWN_DECISIONS = 3

/** When a decision was decided (or proposed, while it waits). */
const decidedWhen = (d: MissionDecision) => Date.parse(d.decidedAt ?? d.createdAt)

/** The brief's accepted decisions, newest first: the first three, and how many more. */
export function acceptedOf(
  constraints: readonly MissionDecision[],
  every = false,
): { shown: MissionDecision[]; more: number } {
  const accepted = constraints.filter((d) => d.state === 'accepted').toSorted((a, b) => decidedWhen(b) - decidedWhen(a))
  return firstOf(accepted, every)
}

/** What is proposed and not decided, newest first: the first three (or all), and how many more. */
export const pendingOf = (
  pending: readonly MissionDecision[],
  every = false,
): { shown: MissionDecision[]; more: number } =>
  firstOf(
    pending.toSorted((a, b) => decidedWhen(b) - decidedWhen(a)),
    every,
  )

/** The first three, and how many more; or all of them, when all are asked for (C9: «and 2 more» opens). */
function firstOf(all: MissionDecision[], every: boolean) {
  if (every) return { shown: all, more: 0 }
  return { shown: all.slice(0, SHOWN_DECISIONS), more: Math.max(0, all.length - SHOWN_DECISIONS) }
}

/** Who wrote a message: Sophia, «You», or the member's name. */
export const messageBy = (
  m: { author: 'member' | 'sophia'; actorId: string | null; name: string | null },
  me: string,
) => (m.author === 'sophia' ? 'Sophia' : m.actorId === me ? 'You' : (m.name ?? 'A member'))

/** How close in time two messages by the same author are to read as one run (docs/plans/conversation-thread.md). */
const RUN_MS = 5 * 60_000

type Said = { author: 'member' | 'sophia'; actorId: string | null; at: string; withdrawn?: { at: string } | null }

/**
 * Whether `m` goes on from `before`: the same author (Sophia, or the same person) within five minutes. A withdrawn
 * message names nobody, so it neither speaks for a run nor is spoken for by one: each side keeps its own byline.
 */
export function continuesRun(before: Said | undefined, m: Said): boolean {
  if (!before || before.author !== m.author || before.actorId !== m.actorId) return false
  if (before.withdrawn || m.withdrawn) return false
  // Two members known by no id may be two people: never one run.
  if (m.author === 'member' && m.actorId === null) return false
  const gap = Date.parse(m.at) - Date.parse(before.at)
  return gap >= 0 && gap < RUN_MS
}

/** A face's letter: the name's first character (whole, an emoji too), upper case; no name is «A member». */
const letters = new Intl.Segmenter()

export function initialOf(name: string | null): string {
  const [first] = letters.segment((name ?? '').trim())
  return (first?.segment ?? 'A').toLocaleUpperCase()
}

/**
 * Whether a reply request is still under way: its answer, or its end, is still to come. Only the request itself says
 * so: a message of Sophia's settles only the request it names (`replyTo`), never one asked before it by time (A16).
 * `pending` and `running` only: an uncertain one (`outcome_unknown`) has ended, and nothing is ever published for it
 * (binding map §8.2.1, the state set 0049 binds; G1 never produces it).
 */
export const replyOpen = (r: Pick<ConversationReply, 'state'>): boolean =>
  r.state === 'pending' || r.state === 'running'

/** The request a message asked, as the pages read hold it now; undefined while that message isn't among them. */
export const replyOf = (
  messages: readonly ConversationMessage[],
  messageId: string,
): ConversationReply | null | undefined => messages.find((m) => m.id === messageId)?.ask

/** What a request that ended without an answer says, under the message that asked; null for any other. */
export function replyEndWords(r: Pick<ConversationReply, 'state' | 'reason'>): string | null {
  if (r.state === 'blocked') {
    if (r.reason === 'runtime_unavailable') return 'Sophia couldn’t be reached, so she didn’t answer this.'
    if (r.reason === 'replies_not_enabled')
      return 'Sophia doesn’t answer in conversations yet: this stays with the team.'
    return 'Sophia’s answers aren’t on for this project now, so she didn’t answer this.'
  }
  if (r.state === 'failed') return 'Sophia couldn’t answer this. Asking again tries once more.'
  // The Ask's own end, not the Send's unconfirmed receipt (client.ts): the wait is over, whether her work on it ran and
  // what it used aren't settled, and that use still counts; nothing goes again by itself (§8.2.1, §8.4).
  if (r.state === 'outcome_unknown') {
    return 'No answer came, and none will. What became of Sophia’s work on it isn’t known yet, and what it may have used still counts. Asking again asks anew.'
  }
  if (r.state === 'cancelled') {
    if (r.reason === 'source_withdrawn') return 'Not answered: something it would have read was withdrawn.'
    if (r.reason === 'asker_removed') return 'Not answered: who asked is no longer a member here.'
    return 'Not answered.'
  }
  return null
}

/** A message's first words, for the line that says which one wasn't confirmed. */
export const firstWords = (text: string): string => (text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text)

/** A conversation's pages as read: the first is the newest; each oldest first. */
export interface ReadPages<M> {
  pages: readonly { messages: readonly M[]; before: string | null }[]
  pageParams: readonly (string | null)[]
}

/**
 * The newest message these pages hold with its words (by its place in the conversation, `seq`; withdrawn ones say
 * nothing), if they hold any: what a confirmed message may say on the list's row, only if it is this one.
 */
export function lastSaid<M extends { id: string; seq: number; text: string | null; withdrawn: unknown }>(
  read: ReadPages<M> | undefined,
): M | undefined {
  const said = (read?.pages ?? []).flatMap((p) => p.messages).filter((m) => m.text !== null && !m.withdrawn)
  return said.reduce<M | undefined>((last, m) => (last && last.seq > m.seq ? last : m), undefined)
}

/**
 * The pages with a message the API accepted at the end of the newest one, once (its receipt's): it shows at once, and
 * stays should reading the conversation again fail. Already held (read again before its receipt came, withdrawn
 * since, say), it stays as held: a receipt never brings back what was learned after it was sent.
 */
export function withMessage<M extends { id: string }>(
  read: ReadPages<M> | undefined,
  message: M,
): ReadPages<M> | undefined {
  const [newest, ...rest] = read?.pages ?? []
  if (!read || !newest || read.pages.some((p) => p.messages.some((m) => m.id === message.id))) return read
  return { ...read, pages: [{ ...newest, messages: [...newest.messages, message] }, ...rest] }
}

/**
 * The pages as a withdrawal the API accepted leaves them, at once and before they are read again (should that read
 * fail, they stay so): the message as the API answered it; Sophia's answers that read it (asked at it or after; one
 * whose asking message isn't read here but came after it, too) withdrawn; and a request still open from there
 * cancelled, as 0048 does it. Nothing it said stays on screen meanwhile.
 */
export function withWithdrawn(
  read: ReadPages<ConversationMessage> | undefined,
  gone: ConversationMessage,
): ReadPages<ConversationMessage> | undefined {
  if (!read) return read
  const seqOf = new Map(read.pages.flatMap((p) => p.messages.map((m) => [m.id, m.seq] as const)))
  const readIt = (m: ConversationMessage) => {
    if (m.author !== 'sophia' || m.withdrawn) return false
    const asked = m.replyTo ? seqOf.get(m.replyTo.messageId) : undefined
    return asked === undefined ? m.seq > gone.seq : asked >= gone.seq
  }
  const after = (m: ConversationMessage): ConversationMessage => {
    if (m.id === gone.id) return gone
    if (readIt(m)) return { ...m, text: null, name: null, withdrawn: gone.withdrawn }
    if (m.ask && m.seq >= gone.seq && replyOpen(m.ask)) {
      return {
        ...m,
        ask: { ...m.ask, state: 'cancelled', reason: 'source_withdrawn', settledAt: gone.withdrawn?.at ?? null },
      }
    }
    return m
  }
  return { ...read, pages: read.pages.map((p) => ({ ...p, messages: p.messages.map(after) })) }
}

/** Nothing known yet about what a summary or a question list covers. */
export const NOT_ASSESSED: ProjectionCoverage = {
  state: 'not_assessed',
  complete: false,
  fromSeq: null,
  throughSeq: null,
  newer: 0,
  generatedAt: null,
  replyId: null,
  eligibilityRevision: null,
  ledgerRevision: null,
}

/**
 * Who still has words in a conversation's pages as read, once a withdrawal took its message (and Sophia's answers that
 * read it): whether its writer still does, and whether Sophia does. Only what the pages read show counts: a writer or
 * an answer seen nowhere in them is taken as gone until the conversation is read again, never kept on a guess. The
 * pages read can miss an answer that read the message (read again, they may hold a gap), so Sophia stays only where an
 * answer of hers is still to be seen there, and `withWithdrawn` has already hidden every one that may have read it.
 */
export interface Remains {
  writer: string | null
  writerStays: boolean
  /**
   * Where the writer stays, the name their newest message still shown here carries, «A member» where it carries none:
   * as the API names a writer, by their newest message not withdrawn (PR #199 r4237439145). Never the withdrawn one's;
   * in pages read with a gap, possibly an older message's until the list is read again. Null where they don't stay.
   */
  writerName: string | null
  /** Whether the writer is the one who reads here (whom the API always names, in the last place kept at the cap). */
  writerIsReader: boolean
  /**
   * Each member's first message still shown, by place, where the pages read hold every place before it (places run
   * from 1, a withdrawn message keeping its own), so it is known to be their first; a member whose first isn't known
   * has none here, never a guess (`firstsIn`).
   */
  /** The writer's places still shown within the places held from 1 without a gap, in order (`firstsFor`). */
  writerPlaces: readonly number[]
  firsts: ReadonlyMap<string, number>
  sophiaStays: boolean
  /** The withdrawn message's place. */
  seq: number
  /** The newest place a message still shown holds in the pages read; null where none does. */
  newestShown: number | null
}

/** A message that still says something here. */
const shown = (m: ConversationMessage) => !m.withdrawn && m.text !== null

/** The newest of these by place; null for none. */
const newestOf = (all: readonly ConversationMessage[]) =>
  all.reduce<ConversationMessage | null>((n, m) => (n === null || m.seq > n.seq ? m : n), null)

/** Each member's first place still shown in these pages, where they hold every place before it from 1 (`Remains`). */
export function firstsIn(thread: ThreadHeld): ReadonlyMap<string, number> {
  return new Map([...shownIn(thread)].map(([who, places]) => [who, places[0] ?? 0]))
}

/** Each member's places still shown in these pages, in order, within the places they hold from 1 without a gap. */
function shownIn(thread: ThreadHeld): ReadonlyMap<string, readonly number[]> {
  const all = (thread?.pages ?? []).flatMap((p) => p.messages)
  // How far the places held run from 1 without a gap: from the places held alone, never one per place (r4237627178).
  const through = [...new Set(all.map((m) => m.seq))]
    .toSorted((a, b) => a - b)
    .reduce((run, seq) => (seq === run + 1 ? seq : run), 0)
  const places = new Map<string, number[]>()
  for (const m of all.toSorted((a, b) => a.seq - b.seq)) {
    const who = shown(m) && m.author === 'member' && m.seq <= through ? m.actorId : null
    if (who !== null) places.set(who, [...(places.get(who) ?? []), m.seq])
  }
  return places
}

/**
 * The firsts as `writer`, whom the row doesn't name yet, may take one: only past the place the list read said
 * (`listSeq`), where it named everyone with a message still shown up to it (below the cap, nobody unnamed). One it left
 * out had none there, whatever older pages held here still show, so such a place is never their first (PR #199
 * r4237660062); their first is the next one shown, if proven, else none. One it did name, taken out here only because
 * the pages read didn't show their words (`removedHere`), has no such bound (CX-0043).
 */
function firstsFor(
  c: ConversationSummary & Unnamed,
  writer: string,
  places: readonly number[],
  firsts: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const named = c.othersUnnamed || c.contributors.length >= NAMED_AT_MOST || c.removedHere?.includes(writer)
  const bound = named ? 0 : (c.listSeq ?? c.messageSeq ?? 0)
  const theirs = places.find((place) => place > bound)
  const out = new Map(firsts)
  if (theirs === undefined) out.delete(writer)
  else out.set(writer, theirs)
  return out
}

/** What a withdrawal leaves in the pages read (`Remains`), for the reader `reader` (their actor id; null if unknown). */
export function remainsAfter(after: ThreadHeld, gone: ConversationMessage, reader: string | null = null): Remains {
  const all = (after?.pages ?? []).flatMap((p) => p.messages)
  const now = all.filter(shown)
  const writer = gone.author === 'member' ? gone.actorId : null
  const theirs = newestOf(now.filter((m) => m.author === 'member' && m.actorId === writer))
  return {
    writer,
    writerStays: theirs !== null,
    writerName: theirs === null ? null : (theirs.name ?? 'A member'),
    writerIsReader: writer !== null && writer === reader,
    writerPlaces: writer === null ? [] : (shownIn(after).get(writer) ?? []),
    firsts: firstsIn(after),
    sophiaStays: now.some((m) => m.author === 'sophia'),
    seq: gone.seq,
    newestShown: newestOf(now)?.seq ?? null,
  }
}

/**
 * A list as a withdrawal leaves it, at once and before it is read again: that conversation's last message goes, and
 * its summary where it may rest on the words withdrawn (rowWithdrawn); so does its writer among those who wrote there,
 * unless the pages read show words of theirs still there, and Sophia's part where the withdrawal took her answers
 * (`remainsAfter`). The next read says what remains.
 */
export function listWithdrawn(list: ConversationList | undefined, conversationId: string, remains: Remains) {
  const left = (c: ConversationSummary & Unnamed) => ({ ...rowWithdrawn(c, remains), lastMessage: null })
  return list && { ...list, conversations: list.conversations.map((c) => (c.id === conversationId ? left(c) : c)) }
}

/**
 * A row as a withdrawal leaves its summary, its questions, its writers and Sophia's part (listWithdrawn's, its opening
 * aside):
 * - the summary and the question projection, each by its own range (`afterWithdrawal`): one that may rest on the words
 *   withdrawn goes back to not assessed, with its words, or no question counted open (as the API says them before any
 *   assessment; PR #199 r4237222580); one whose range ends before them stays (r4237439149);
 * - the writer goes from those who wrote there unless the pages read show words of theirs still there, and is then
 *   named by those (r4237439145), and among them where the row, read before they first wrote, doesn't name them
 *   (`writersAfter`, r4237494296);
 * - Sophia's part goes unless they show an answer of hers still there.
 */
export function rowWithdrawn<T extends ConversationSummary & Unnamed>(c: T, remains: Remains): T {
  const summaryCoverage = afterWithdrawal(c.summaryCoverage, remains)
  const questionsCoverage = afterWithdrawal(c.questionsCoverage, remains)
  const writers = writersAfter(c, remains)
  // A list that named as many as it may can't say the rest: one taken out of it never makes it look whole.
  return {
    ...c,
    summary: summaryCoverage === NOT_ASSESSED ? null : c.summary,
    summaryCoverage,
    openQuestions: questionsCoverage === NOT_ASSESSED ? 0 : c.openQuestions,
    questionsCoverage,
    contributors: writers.contributors,
    ...(writers.removedHere ? { removedHere: writers.removedHere } : {}),
    sophia: c.sophia && remains.sophiaStays,
    ...(c.contributors.length >= NAMED_AT_MOST || c.othersUnnamed || writers.othersUnnamed
      ? { othersUnnamed: true as const }
      : {}),
  }
}

/**
 * Those who wrote there after a withdrawal: its writer gone, unless words of theirs are still shown, then named by them.
 * One the row doesn't name (read before they first wrote: PR #199 r4237494296) is named where the row has room, in
 * their place (`placedAmong`). At the cap, as the API names them: the reader takes the last
 * place kept, the rest then unnamed; anyone else is among the others unnamed, and nobody named is taken out for them
 * (the reader among them, CX-0038).
 */
function writersAfter(
  c: ConversationSummary & Unnamed,
  remains: Remains,
): Pick<ConversationSummary & Unnamed, 'contributors' | 'othersUnnamed' | 'removedHere'> {
  const { writer, writerName } = remains
  const { contributors } = c
  if (writer === null || (remains.writerStays && writerName === null)) return { contributors }
  if (!remains.writerStays || writerName === null) return takenOut(c, writer)
  const them = { actorId: writer, name: writerName }
  const first = remains.firsts.get(writer)
  if (contributors.some((p) => p.actorId === writer)) {
    // Named there: in their place, named again; moved only where this withdrawal took their first message, the one the
    // gone place came before (CX-0040, r4237627174). Nobody else moves (`placedAmong`).
    if (first === undefined || remains.seq > first) return { contributors: renamedIn(contributors, writer, writerName) }
    return {
      contributors: placedAmong(
        contributors.filter((p) => p.actorId !== writer),
        them,
        remains.firsts,
      ),
    }
  }
  if (contributors.length < NAMED_AT_MOST) {
    return { contributors: placedAmong(contributors, them, firstsFor(c, writer, remains.writerPlaces, remains.firsts)) }
  }
  if (!remains.writerIsReader) return { contributors, othersUnnamed: true }
  return { contributors: [...contributors.slice(0, NAMED_AT_MOST - 1), them], othersUnnamed: true }
}

/** The row's writers with `writer` taken out, failing closed; one it named kept as named by the list read (`removedHere`). */
function takenOut(
  c: ConversationSummary & Unnamed,
  writer: string,
): Pick<ConversationSummary & Unnamed, 'contributors' | 'removedHere'> {
  const named = c.contributors.some((p) => p.actorId === writer) && !c.removedHere?.includes(writer)
  return {
    contributors: c.contributors.filter((p) => p.actorId !== writer),
    ...(named ? { removedHere: [...(c.removedHere ?? []), writer] } : {}),
  }
}

/** A writer as a row names them. */
type Placed = ConversationSummary['contributors'][number]

/** These writers, `writer` named `name`, each in their place. */
const renamedIn = (all: readonly Placed[], writer: string, name: string) =>
  all.map((p) => (p.actorId === writer && p.name !== name ? { ...p, name } : p))

/**
 * `them` placed among these writers, as the API orders writers, by their first message still shown (PR #199
 * r4237533992, r4237576952, r4237627174), the others left in their order: the pages read may be older than the list
 * read, so they never reorder it (r4237660062). Before the first writer whose first isn't proven to come before
 * theirs: with places held from 1 to K, a first proven is at most K, and one not proven lies past K. Where theirs isn't
 * proven, last, no place invented. Each event places only the writer it is about, from the pages as read then: a first
 * withdrawn since never keeps them ahead (CX-0040), and a receipt's own place is never taken for its sender's first.
 */
function placedAmong(contributors: readonly Placed[], them: Placed, firsts: ReadonlyMap<string, number>): Placed[] {
  const theirs = firsts.get(them.actorId)
  const later = (p: Placed) => {
    const first = firsts.get(p.actorId)
    return first === undefined || (theirs !== undefined && first > theirs)
  }
  const at = theirs === undefined ? -1 : contributors.findIndex(later)
  return at < 0 ? [...contributors, them] : [...contributors.slice(0, at), them, ...contributors.slice(at)]
}

/**
 * A projection as the withdrawal of the message at `remains.seq` leaves it (PR #199 r4237222580, r4237439149):
 * - one with no range, or whose range reaches that place, may rest on the words withdrawn: not assessed;
 * - one whose range ends before it never read it, and stays, words, range and questions. What it says came since is
 *   all that may change. A count that can't have held the message stays: `current`, or `stale` with none counted newer
 *   (the project's decisions moved). One that may have held it is no count any more, whether or not the list read or a
 *   receipt counted it (`Coverage`): `uncounted` where a newer message is still shown here, else `unknown` (CX-0036).
 *   Never made `current`: nothing here knows the project's decisions.
 */
function afterWithdrawal(coverage: Coverage, remains: Remains): Coverage {
  if (coverage.throughSeq === null || coverage.throughSeq >= remains.seq) return NOT_ASSESSED
  if (coverage.state !== 'stale' || (coverage.newer === 0 && coverage.since === undefined)) return coverage
  const newerShown = remains.newestShown !== null && remains.newestShown > coverage.throughSeq
  return { ...coverage, since: newerShown ? 'uncounted' : 'unknown' }
}

/**
 * The row's line: its last message, who said it first («You», «Sophia», a name), where the list says it (A18 proposed);
 * else Sophia's summary.
 */
export function gistOf(c: ConversationSummary, me: string): string | null {
  const last = c.lastMessage
  if (!last) return c.summary
  const who =
    last.author === 'sophia'
      ? 'Sophia'
      : last.actorId === me
        ? 'You'
        : (c.contributors.find((p) => p.actorId === last.actorId)?.name ?? last.name ?? 'Someone')
  // Hers in one line: the row never shows the marks her words are drawn with (sophia-text.ts).
  return `${who}: ${last.author === 'sophia' ? plainOf(last.text) : last.text}`
}

/**
 * Whether a list row may take a confirmed message as its last (CON-01-CC-0023; Codex's review of it: CX-0027,
 * PR #199 r4235629903, r4235862543). The row is what the list read said, or what this view put there since; a
 * receipt is older knowledge than a list read taken after its message was written.
 * - Both ordered (the row's `messageSeq`, the highest place the conversation had taken when it was read, withdrawn
 *   messages included; the message's own `seq`): only if the row's is lower, so the read came before the message. A
 *   cleared preview or an equal place is no permission. On equal times this still orders (two messages in one
 *   millisecond).
 * - Otherwise (an API from before them): only if the row's last activity (`lastAt`, which 0048 stamps with the
 *   message's own time and a withdrawal leaves) is earlier, and so is the opening it says. As read, that opening is
 *   never later than `lastAt`; one this view put there since is its receipt's, and it bounds the next (Codex at
 *   7969d40: receipts 3 then 2 took the row back to 2), and `lastAt` moves up with it, never back. Equal times keep
 *   the row: it lags until the list is read again (a bounded loss), and never goes back.
 * The watermark is an order this view observed, never proof that a message is still eligible: a current list read, or
 * the thread's tombstone (listTombstoned), says that.
 */
function takes(c: ConversationSummary, m: { at: string; seq?: number }): boolean {
  if (c.messageSeq !== undefined && m.seq !== undefined) return c.messageSeq < m.seq
  const at = Date.parse(m.at)
  return Date.parse(c.lastAt) < at && (c.lastMessage === null || Date.parse(c.lastMessage.at) < at)
}

/** A conversation's thread as this view holds it read: its pages, newest first. */
export type ThreadHeld = { pages: readonly { messages: readonly ConversationMessage[] }[] } | undefined

/**
 * The rows as the threads this view holds read leave them (Codex: CX-0027, CX-0028; PR #199 r4235976251, r4236040713),
 * applied to the list reads as cached (withdrawn-purge.ts), whichever answer a row comes from and in whichever order
 * the two arrived.
 * - Its opening, whatever the list read: none where its own thread holds that message withdrawn. Exact where the row
 *   says the message's place (`seq`); otherwise (an older API) matched by writer, actor and time, and kept when a
 *   message the thread holds with words matches it too, words and all (Codex's control: m2 withdrawn, m3 said in the
 *   same millisecond, the row m3's).
 * - Its summary, writers and Sophia's part (rowWithdrawn), only for a withdrawal the list read may not have known:
 *   one this view first saw after that read set out (`seenSince`), and no older than the row's last activity. A
 *   withdrawal older than a message the row knows of was known to the read that knew that message, so a list read
 *   that knew it keeps what it says (a writer whose words are on pages not read here, a summary).
 * A preview, a writer or Sophia's part gone until the list is read again is honest; one a withdrawal took, shown again,
 * is not. The same rows when nothing is taken.
 */
export function rowsKnown<T extends ConversationSummary & Unnamed>(
  rows: readonly T[],
  heldOf: (conversationId: string) => ThreadHeld,
  seenSince: (conversationId: string, m: ConversationMessage) => boolean = () => false,
  reader: string | null = null,
): readonly T[] {
  const known = rows.map((c) => rowKnown(c, heldOf(c.id), (m) => seenSince(c.id, m), reader))
  return known.some((c, i) => c !== rows[i]) ? known : rows
}

/** One row as its thread leaves it (rowsKnown); the same row when nothing is taken. */
function rowKnown<T extends ConversationSummary & Unnamed>(
  c: T,
  thread: ThreadHeld,
  seenSince: (m: ConversationMessage) => boolean,
  reader: string | null,
): T {
  const held = (thread?.pages ?? []).flatMap((p) => p.messages)
  if (!held.some((m) => m.withdrawn)) return c
  let row = c.lastMessage && saysWithdrawn(c.lastMessage, held) ? { ...c, lastMessage: null } : c
  const since = (m: ConversationMessage) =>
    m.withdrawn !== null && seenSince(m) && Date.parse(m.withdrawn.at) >= Date.parse(c.listAt ?? c.lastAt)
  for (const m of held.filter(since)) row = rowWithdrawn(row, remainsAfter(thread, m, reader))
  return sameRow(row, c) ? c : row
}

/** The same writers, in the same places, by the same names: a name corrected alone is a change (PR #199 CX-0036). */
const sameWriters = (a: ConversationSummary['contributors'], b: ConversationSummary['contributors']) =>
  a.length === b.length && a.every((p, i) => p.actorId === b.at(i)?.actorId && p.name === b.at(i)?.name)

/** Whether rowKnown changed nothing: an opening, a projection, the questions, a writer or their name, Sophia's part. */
const sameRow = (row: ConversationSummary & Unnamed, c: ConversationSummary & Unnamed) =>
  row.lastMessage === c.lastMessage &&
  row.summary === c.summary &&
  JSON.stringify(row.summaryCoverage) === JSON.stringify(c.summaryCoverage) &&
  row.openQuestions === c.openQuestions &&
  JSON.stringify(row.questionsCoverage) === JSON.stringify(c.questionsCoverage) &&
  row.sophia === c.sophia &&
  sameWriters(row.contributors, c.contributors) &&
  row.othersUnnamed === c.othersUnnamed

/** Whether the row's last message is one these pages hold withdrawn (by its place, else as rowsKnown says). */
function saysWithdrawn(
  says: NonNullable<ConversationSummary['lastMessage']>,
  held: readonly ConversationMessage[],
): boolean {
  if (says.seq !== undefined) return held.some((m) => m.seq === says.seq && m.withdrawn)
  const by = (m: ConversationMessage) =>
    m.author === says.author && m.actorId === says.actorId && Date.parse(m.at) === Date.parse(says.at)
  const withdrawnOne = held.some((m) => by(m) && m.withdrawn)
  const saidOne = held.some((m) => by(m) && !m.withdrawn && m.text?.slice(0, 140) === says.text)
  return withdrawnOne && !saidOne
}

/**
 * The list as a confirmed message leaves it: that conversation's last message is the message, where the list says last
 * messages at all (A18 proposed), only where the row may take it (`takes`); its watermark moves up to the message's
 * place with it (so an older receipt after it never passes). With it, as the API would say them after this message:
 * - its writer is among those who wrote there (PR #199 r4237298623), placed by their first message as `thread` (the
 *   conversation's pages as read, with this message) proves it, never by this message's place alone, the others in
 *   their order (`placedAmong`, r4237576952, r4237660062); or in the last place kept when the row names as many as it may
 *   (`NAMED_AT_MOST`), the rest then unnamed, as the API keeps a reader who wrote;
 * - its writer's name, where they are already among them, as the receipt says it now (or «A member», where it says
 *   none), in the same place (PR #199 r4237385093: the API names each writer by their newest message);
 * - a summary or question projection with a range is behind, and `current` becomes `stale` (PR #199 r4237298622); one
 *   not assessed stays so. `newer` is one more only where the row's place and the message's are adjacent, so nothing
 *   can lie between; across a gap (another's message, eligible or withdrawn since) or with no places to tell, the count
 *   is unknown here (`Coverage`), and stays so until the list is read again (r4237385090).
 * - its last activity (`lastAt`) moves up to the message's time where that is later: the receipt's own time is when
 *   the conversation last moved at the least, so the row sorts and says «Last moved» by it, and an older receipt
 *   never moves it back. The list read's is kept (`listAt`) for what that read knew (PR #199 r4238826987).
 * Nothing else of the row is made up: not its revision, or a projection's words or count. The rest, and a list that
 * doesn't say them, as they were.
 */
export function withLastMessage<T extends ConversationSummary & Unnamed>(
  list: readonly T[],
  conversationId: string,
  m: Pick<ConversationMessage, 'author' | 'actorId' | 'name' | 'text' | 'at'> & { seq?: number },
  thread?: ThreadHeld,
): readonly T[] {
  const text = m.text
  if (text === null) return list
  return list.map((c) => {
    if (c.id !== conversationId || !takes(c, m)) return c
    const placed = m.seq === undefined ? {} : { seq: m.seq }
    const watermark =
      c.messageSeq !== undefined && m.seq !== undefined ? { messageSeq: m.seq, listSeq: c.listSeq ?? c.messageSeq } : {}
    const adjacent = c.messageSeq !== undefined && m.seq === c.messageSeq + 1
    const moved = Date.parse(m.at) > Date.parse(c.lastAt) ? { lastAt: m.at, listAt: c.listAt ?? c.lastAt } : {}
    return {
      ...c,
      ...watermark,
      ...moved,
      ...withWriter(c, m, thread),
      summaryCoverage: behind(c.summaryCoverage, adjacent),
      questionsCoverage: behind(c.questionsCoverage, adjacent),
      lastMessage: {
        author: m.author,
        actorId: m.actorId,
        name: m.name,
        text: text.slice(0, 140),
        at: m.at,
        ...placed,
      },
    }
  })
}

/**
 * The row's writers with a member's confirmed message: they are among them, the last kept place theirs when full; one
 * already there keeps their place. Either is named as the API names a writer, by their newest message, «A member» where
 * it carries no name (an authenticated subject may have none); matched by who they are, never by a name.
 */
function withWriter(
  c: ConversationSummary & Unnamed,
  m: Pick<ConversationMessage, 'author' | 'actorId' | 'name'>,
  thread: ThreadHeld,
): Pick<ConversationSummary & Unnamed, 'contributors' | 'othersUnnamed'> {
  const writer = m.author === 'member' ? m.actorId : null
  if (writer === null) return { contributors: c.contributors }
  const name = m.name ?? 'A member'
  if (c.contributors.some((p) => p.actorId === writer)) return { contributors: renamedIn(c.contributors, writer, name) }
  const them = { actorId: writer, name }
  if (c.contributors.length < NAMED_AT_MOST) {
    const theirs = shownIn(thread).get(writer) ?? []
    return { contributors: placedAmong(c.contributors, them, firstsFor(c, writer, theirs, firstsIn(thread))) }
  }
  return { contributors: [...c.contributors.slice(0, NAMED_AT_MOST - 1), them], othersUnnamed: true }
}

/**
 * A projection with a range, behind by a confirmed message: one more newer where the places were adjacent and it was
 * counted, else `uncounted` (`Coverage`): the message is newer, so newer messages are known, never how many; one not
 * assessed, as it is.
 */
function behind(coverage: Coverage, adjacent: boolean): Coverage {
  if (coverage.throughSeq === null) return coverage
  const state = coverage.state === 'current' ? 'stale' : coverage.state
  return adjacent && coverage.since === undefined
    ? { ...coverage, state, newer: coverage.newer + 1 }
    : { ...coverage, state, since: 'uncounted' }
}
