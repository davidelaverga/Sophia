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
}

/**
 * A summary's or question list's coverage as this view may hold it: `newerUncounted` where a confirmed message came
 * after a gap in the row's places, or with no places to tell (`withLastMessage`), so how many eligible messages follow
 * its range isn't known here (PR #199 r4237385090). Its `newer` is then no count, and is never said as one; the next list
 * read answers for itself, and a withdrawal takes the projection back to not assessed.
 */
export type Coverage = ProjectionCoverage & { newerUncounted?: true }

export function contributorsLine(
  c: Pick<ConversationSummary, 'contributors' | 'sophia'> & Unnamed,
  me: string,
): string {
  const named = c.contributors.map((p) => (p.actorId === me ? 'You' : p.name)).join(', ')
  const people = c.contributors.length >= NAMED_AT_MOST || c.othersUnnamed ? `${named} and others` : named
  if (!people) return c.sophia ? 'Sophia' : 'Nobody has written yet'
  return c.sophia ? `${people} · Sophia` : people
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
  if (c.state === 'stale') {
    const since = c.newerUncounted
      ? 'newer messages since'
      : c.newer > 0
        ? `${String(c.newer)} newer since`
        : 'the project’s decisions have changed since'
    return `Covers ${range}; ${since}.`
  }
  return `Covers ${range}.`
}

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

/** What the list is narrowed to: title words, those with an open question, those the reader wrote in. */
export interface Narrowing {
  typed: string
  open: boolean
  mine: boolean
}

/** The conversations that pass every narrowing asked for, in the list's order. */
export function narrowed(all: readonly ConversationSummary[], by: Narrowing, me: string) {
  return matching(all, by.typed).filter(
    (c) => (!by.open || c.openQuestions > 0) && (!by.mine || c.contributors.some((p) => p.actorId === me)),
  )
}

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
 */
export const replyOpen = (r: Pick<ConversationReply, 'state'>): boolean =>
  r.state === 'pending' || r.state === 'running' || r.state === 'outcome_unknown'

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
const NOT_ASSESSED: ProjectionCoverage = {
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
  sophiaStays: boolean
}

/** A message that still says something here. */
const shown = (m: ConversationMessage) => !m.withdrawn && m.text !== null

export function remainsAfter(after: ThreadHeld, gone: ConversationMessage): Remains {
  const now = (after?.pages ?? []).flatMap((p) => p.messages)
  const writer = gone.author === 'member' ? gone.actorId : null
  return {
    writer,
    writerStays: now.some((m) => shown(m) && m.author === 'member' && m.actorId === writer),
    sophiaStays: now.some((m) => shown(m) && m.author === 'sophia'),
  }
}

/**
 * A list as a withdrawal leaves it, at once and before it is read again: that conversation's last message and summary,
 * which may say the words withdrawn, go; so does its writer among those who wrote there, unless the pages read show
 * words of theirs still there, and Sophia's part where the withdrawal took her answers (`remainsAfter`). The next read
 * says what remains.
 */
export function listWithdrawn(list: ConversationList | undefined, conversationId: string, remains: Remains) {
  const left = (c: ConversationSummary & Unnamed) => ({ ...rowWithdrawn(c, remains), lastMessage: null })
  return list && { ...list, conversations: list.conversations.map((c) => (c.id === conversationId ? left(c) : c)) }
}

/**
 * A row as a withdrawal leaves its summary, its questions, its writers and Sophia's part (listWithdrawn's, its opening
 * aside): the summary and the question projection, which may rest on the words withdrawn, go back to not assessed, with
 * no question counted open (as the API says them before any assessment; PR #199 r4237222580); the writer goes from those
 * who wrote there unless the pages read show words of theirs still there; Sophia's part goes unless they show an answer
 * of hers still there.
 */
export function rowWithdrawn<T extends ConversationSummary & Unnamed>(c: T, remains: Remains): T {
  // A list that named as many as it may can't say the rest: one taken out of it never makes it look whole.
  return {
    ...c,
    summary: null,
    summaryCoverage: NOT_ASSESSED,
    openQuestions: 0,
    questionsCoverage: NOT_ASSESSED,
    contributors:
      remains.writer === null || remains.writerStays
        ? c.contributors
        : c.contributors.filter((p) => p.actorId !== remains.writer),
    sophia: c.sophia && remains.sophiaStays,
    ...(c.contributors.length >= NAMED_AT_MOST || c.othersUnnamed ? { othersUnnamed: true as const } : {}),
  }
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
 *   7969d40: receipts 3 then 2 took the row back to 2), while `lastAt` stays as the list read said it. Equal times keep
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
): readonly T[] {
  const known = rows.map((c) => rowKnown(c, heldOf(c.id), (m) => seenSince(c.id, m)))
  return known.some((c, i) => c !== rows[i]) ? known : rows
}

/** One row as its thread leaves it (rowsKnown); the same row when nothing is taken. */
function rowKnown<T extends ConversationSummary & Unnamed>(
  c: T,
  thread: ThreadHeld,
  seenSince: (m: ConversationMessage) => boolean,
): T {
  const held = (thread?.pages ?? []).flatMap((p) => p.messages)
  if (!held.some((m) => m.withdrawn)) return c
  let row = c.lastMessage && saysWithdrawn(c.lastMessage, held) ? { ...c, lastMessage: null } : c
  const since = (m: ConversationMessage) =>
    m.withdrawn !== null && seenSince(m) && Date.parse(m.withdrawn.at) >= Date.parse(c.lastAt)
  for (const m of held.filter(since)) row = rowWithdrawn(row, remainsAfter(thread, m))
  return sameRow(row, c) ? c : row
}

/** Whether rowKnown took nothing (it only takes: an opening, a summary, the questions, a writer, Sophia's part). */
const sameRow = (row: ConversationSummary & Unnamed, c: ConversationSummary & Unnamed) =>
  row.lastMessage === c.lastMessage &&
  row.summary === c.summary &&
  JSON.stringify(row.summaryCoverage) === JSON.stringify(c.summaryCoverage) &&
  row.openQuestions === c.openQuestions &&
  JSON.stringify(row.questionsCoverage) === JSON.stringify(c.questionsCoverage) &&
  row.sophia === c.sophia &&
  row.contributors.length === c.contributors.length &&
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
 * - its writer is among those who wrote there (PR #199 r4237298623): added in the last place kept when the row names as
 *   many as it may (`NAMED_AT_MOST`), the rest then unnamed, as the API keeps a reader who wrote;
 * - its writer's name, where they are already among them, as the receipt says it now (or «A member», where it says
 *   none), in the same place (PR #199 r4237385093: the API names each writer by their newest message);
 * - a summary or question projection with a range is behind, and `current` becomes `stale` (PR #199 r4237298622); one
 *   not assessed stays so. `newer` is one more only where the row's place and the message's are adjacent, so nothing
 *   can lie between; across a gap (another's message, eligible or withdrawn since) or with no places to tell, the count
 *   is unknown here (`Coverage`), and stays so until the list is read again (r4237385090).
 * Nothing else of the row is made up: not its revision, its last activity or a projection's words or count. The rest,
 * and a list that doesn't say them, as they were.
 */
export function withLastMessage<T extends ConversationSummary & Unnamed>(
  list: readonly T[],
  conversationId: string,
  m: Pick<ConversationMessage, 'author' | 'actorId' | 'name' | 'text' | 'at'> & { seq?: number },
): readonly T[] {
  const text = m.text
  if (text === null) return list
  return list.map((c) => {
    if (c.id !== conversationId || !takes(c, m)) return c
    const placed = m.seq === undefined ? {} : { seq: m.seq }
    const watermark = c.messageSeq !== undefined && m.seq !== undefined ? { messageSeq: m.seq } : {}
    const adjacent = c.messageSeq !== undefined && m.seq === c.messageSeq + 1
    return {
      ...c,
      ...watermark,
      ...withWriter(c, m),
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
): Pick<ConversationSummary & Unnamed, 'contributors' | 'othersUnnamed'> {
  const writer = m.author === 'member' ? m.actorId : null
  if (writer === null) return { contributors: c.contributors }
  const name = m.name ?? 'A member'
  if (c.contributors.some((p) => p.actorId === writer)) {
    return { contributors: c.contributors.map((p) => (p.actorId === writer && p.name !== name ? { ...p, name } : p)) }
  }
  const them = { actorId: writer, name }
  if (c.contributors.length < NAMED_AT_MOST) return { contributors: [...c.contributors, them] }
  return { contributors: [...c.contributors.slice(0, NAMED_AT_MOST - 1), them], othersUnnamed: true }
}

/**
 * A projection with a range, behind by a confirmed message: one more newer where the places were adjacent and it was
 * counted, else uncounted (`Coverage`); one not assessed, as it is.
 */
function behind(coverage: Coverage, adjacent: boolean): Coverage {
  if (coverage.throughSeq === null) return coverage
  const state = coverage.state === 'current' ? 'stale' : coverage.state
  return adjacent && !coverage.newerUncounted
    ? { ...coverage, state, newer: coverage.newer + 1 }
    : { ...coverage, state, newerUncounted: true }
}
