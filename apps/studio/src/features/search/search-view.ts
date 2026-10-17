// Where a search hit is from (docs/plans/room-search.md): its kind and when, a meeting's with its time. Pure, so the
// words are unit-tested; the dates' formats come from the page (Intl).
import type { Goal } from '@sophia/contracts'
import type { MeetingSummary, SearchHit, SearchPage } from '../../api/vision.ts'
import type { DateWords } from '../updates/updates-view.ts'

const KIND: Record<SearchHit['kind'], string> = {
  decision: 'Decision',
  note: 'Kept note',
  report: 'Report',
  report_section: 'Report section',
  recap: 'Meeting recap',
  message: 'Message',
}

/** «Decision · Oct 4»; «Meeting recap · Oct 4, 15:00». */
export function hitSource(hit: Pick<SearchHit, 'kind' | 'at'>, words: DateWords): string {
  const at = new Date(hit.at)
  const when = hit.kind === 'recap' ? `${words.day(at)}, ${words.time(at)}` : words.day(at)
  return `${KIND[hit.kind]} · ${when}`
}

/**
 * Whether a recap hit's meeting runs, as the project's latest meetings say (the running one is the newest): undefined
 * until they are read, or if they can't be, when its recap's own read says.
 */
export function hitRunning(
  meetingId: string,
  latest: readonly Pick<MeetingSummary, 'id' | 'endedAt'>[] | undefined,
): boolean | undefined {
  return latest?.some((m) => m.id === meetingId && m.endedAt === null)
}

/** Fewer characters than this find nothing: one letter matches everything. */
export const MIN_LOCAL = 2

/** A task as the search reads it, from the served board (glancedOf's `tasksFound`). */
export interface TaskFound {
  id: string
  purpose: string
  doer: string
}

/** A goal or a task the search found in what the Studio holds (search-goals.md). */
export interface LocalHit {
  kind: 'goal' | 'task'
  id: string
  title: string
  /** The words that answered, when they aren't the title: a goal's outcome or criterion, a task's goal. */
  words: string | null
  /** «Goal · Needs attention», «Task · Marco's Claude Code»; «Goal» alone while its health isn't known. */
  source: string
  /** A task's doer, marked in its line as its title is (search-honest.md). */
  doer?: string
}

/** What a task's line says before its doer. */
export const TASK_LEAD = 'Task · '

const has = (text: string, q: string) => text.toLowerCase().includes(q)

/** A goal's health in words; null while it isn't known (its notes unread): then none is said (search-honest.md). */
type HealthWords = (goal: Goal) => string | null

function goalHit(goal: Goal, q: string, health: HealthWords): LocalHit | null {
  const answer = [goal.outcome, ...goal.criteria.map((c) => c.description)].find((t) => has(t, q))
  if (!has(goal.title, q) && !answer) return null
  const said = health(goal)
  return {
    kind: 'goal',
    id: goal.id,
    title: goal.title,
    words: answer ?? null,
    source: said ? `Goal · ${said}` : 'Goal',
  }
}

/** At most three goals, then three tasks, found by their words; nothing under two letters. */
export function localHits(
  goals: readonly Goal[],
  plans: Readonly<Record<string, { tasksFound?: readonly TaskFound[] | undefined }>> | undefined,
  query: string,
  health: HealthWords,
): LocalHit[] {
  const q = query.trim().toLowerCase()
  if (q.length < MIN_LOCAL) return []
  const found = goals.flatMap((g) => goalHit(g, q, health) ?? []).slice(0, 3)
  const tasks = goals
    .flatMap((g) => (plans?.[g.id]?.tasksFound ?? []).map((t) => ({ t, goal: g })))
    .filter(({ t }) => has(t.purpose, q) || has(t.doer, q))
    .slice(0, 3)
    .map(({ t, goal }): LocalHit => ({
      kind: 'task',
      id: t.id,
      title: t.purpose,
      words: goal.title,
      source: `${TASK_LEAD}${t.doer}`,
      doer: t.doer,
    }))
  return [...found, ...tasks]
}

/** A text in pieces, the query's every match marked, whatever its case. */
export function marked(text: string, query: string): { text: string; mark: boolean }[] {
  const q = query.trim().toLowerCase()
  if (!q) return [{ text, mark: false }]
  const pieces: { text: string; mark: boolean }[] = []
  const lower = text.toLowerCase()
  let from = 0
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
    if (at > from) pieces.push({ text: text.slice(from, at), mark: false })
    pieces.push({ text: text.slice(at, at + q.length), mark: true })
    from = at + q.length
  }
  if (from < text.length) pieces.push({ text: text.slice(from), mark: false })
  return pieces
}

/** A long text cut to about `size` characters around the query's first match, an ellipsis where it was cut. */
export function around(text: string, query: string, size = 160): string {
  if (text.length <= size) return text
  const at = Math.max(0, text.toLowerCase().indexOf(query.trim().toLowerCase()))
  const start = Math.max(0, Math.min(at - Math.floor(size / 3), text.length - size))
  const end = Math.min(text.length, start + size)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/** A page of hits as it was read, and when that read was set out, in this page's order (`searchOrder`). */
export type SearchRead = SearchPage & { readFrom: number }

let order = 0
/**
 * This page's order of the search's reads and refusals: each call is later than every call before it. Never the clock,
 * which can be set back (R-C4-SEARCH-READ-01): as Updates' (`sinceOrder`) and C1's read fences count, a read set out
 * before a refusal stays before it. A page loaded afresh starts again, with an empty cache.
 */
export const searchOrder = (): number => ++order

/** One page read, with when it was set out: before its answer, however late that comes. */
export async function readSearch(read: () => Promise<SearchPage>): Promise<SearchRead> {
  const readFrom = searchOrder()
  return { ...(await read()), readFrom }
}

/** Where the account's query cache keeps when this person's own search of the project was last refused. */
export const searchRefusedKey = (projectId: string) => ['vision', 'search-refused', projectId]

/** A refusal seen: later than every read set out before it, and never earlier than the one kept. */
export const refusalSeen = (at = 0): number => Math.max(at, searchOrder())

/**
 * The pages the search may show (R-C4-SEARCH-READ-01), as Updates' window (`shownSince`): none while this person's own
 * read is refused (401, 403), and none read before the last refusal (`refusedAt`, in `searchOrder`, 0 when never),
 * whatever comes after it: a later ordinary failure, an older read answering late, the sheet opened again, the query
 * typed again, another query's answer. Only pages all set out since the refusal show again. Without a refusal, an
 * ordinary failure keeps the pages read (and the sheet says the search failed).
 */
export function shownPages(
  pages: readonly SearchRead[] | undefined,
  refusedNow: boolean,
  refusedAt: number,
): readonly SearchRead[] | undefined {
  if (!pages || refusedNow) return undefined
  return pages.every((p) => p.readFrom > refusedAt) ? pages : undefined
}
