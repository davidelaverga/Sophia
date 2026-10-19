// What changed since you last looked, said once (docs/plans/home-since-you-looked.md): what a window of A34 holds that
// Sophia's sentence on Home, and a project's arrival line (project-arrival-since.md), name, in words, only what someone
// else did, and, per account on this device, the lines already said there, shown in Updates or in front of the person
// when a call ended, by project, and the calls' projects whose window is still to be read. Pure but for the storage,
// which may refuse: the page then remembers for as long as it lives.
import type { Since } from '../../api/vision.ts'
import { tokenSubject } from '../../app/auth-callback.ts'

/** What a window holds that Home names: what was decided, made and kept, and whether events lie after it. */
export interface News {
  decided: number
  made: number
  kept: number
  more: boolean
}

/**
 * The news in a window, or null. A window with no seen mark before it is everything so far, never «since you last
 * looked» (Updates says «You haven’t looked before»). One with nothing decided, made or kept names nothing: proposals
 * still open and tasks that moved stay in Updates.
 */
export function newsOf(window: Since): News | null {
  if (window.fromSequence === null) return null
  const news = {
    decided: window.decided.length,
    made: window.made.length,
    kept: window.noted.length,
    more: window.more,
  }
  return news.decided + news.made + news.kept > 0 ? news : null
}

/** Each kind named, one in words and many in digits: «a decision», «2 decisions». */
const NEWS_WORDS: readonly [Exclude<keyof News, 'more'>, string, string][] = [
  ['decided', 'a decision', 'decisions'],
  ['made', 'a new report', 'new reports'],
  ['kept', 'a note kept', 'notes kept'],
]

/** «2 decisions, a new report and more»: every kind with any, then whether more lies after a window. */
export function newsWords(news: News): string {
  const parts = NEWS_WORDS.filter(([kind]) => news[kind] > 0).map(([kind, one, many]) =>
    news[kind] === 1 ? one : `${String(news[kind])} ${many}`,
  )
  const all = news.more ? [...parts, 'more'] : parts
  return all.length === 1 ? all.join('') : `${all.slice(0, -1).join(', ')} and ${all.at(-1) ?? ''}`
}

/** Who reads, as A34 names people: the API's actor is the token's subject, lowered (apps/api/src/auth.ts); else none. */
export const readerOf = (token: string): string | null => tokenSubject(token)?.toLowerCase() ?? null

/** A window's lines as this device keeps them, by kind and id: «d:<decision>», «m:<report version>», «n:<note>». */
export const linesOf = (window: Since): string[] => [
  ...window.decided.map((d) => `d:${d.decisionId}`),
  ...window.made.map((m) => `m:${m.artifactVersionId}`),
  ...window.noted.map((n) => `n:${n.entryId}`),
]

/**
 * A window trimmed to what is news to `reader`: the lines someone else decided, asked for or kept, and not among
 * `known`. The decision they took, the report they asked for and a note kept in their name (Sophia's in their turn
 * too) were theirs; a decision they proposed and another took happened without them. A line A34 can't name a person for
 * is someone else's.
 */
export function freshIn(window: Since, reader: string | null, known: readonly string[] = []): Since {
  const old = new Set(known)
  const theirs = (by: string | null) => reader !== null && by === reader
  return {
    ...window,
    decided: window.decided.filter((d) => !theirs(d.decidedBy) && !old.has(`d:${d.decisionId}`)),
    made: window.made.filter((m) => !theirs(m.askedBy) && !old.has(`m:${m.artifactVersionId}`)),
    noted: window.noted.filter((n) => !theirs(n.actorId) && !old.has(`n:${n.entryId}`)),
  }
}

/** What this device keeps, by project: the lines of its window last said, shown or seen. */
export type Known = Readonly<Record<string, readonly string[]>>

/**
 * The windows with news for `reader` on this device, each trimmed to that news (`known`: by project). A project whose
 * call's read is `pending` has none: what its window holds may be what the call held.
 */
export function unsaid(
  windows: ReadonlyMap<string, Since>,
  known: Known,
  reader: string | null,
  pending: readonly string[] = [],
): Map<string, Since> {
  return new Map(
    [...windows].flatMap(([id, w]) => {
      const fresh = freshIn(w, reader, known[id])
      return !pending.includes(id) && newsOf(fresh) ? [[id, fresh] as const] : []
    }),
  )
}

/** What a project's arrival weighs its window against: what this device kept, who reads, the calls still pending. */
export interface ArrivalAt {
  said: Known
  reader: string | null
  pending: readonly string[]
}

/** The arrival line's words, and what to keep once it is drawn: the window's lines whole, as Home keeps them. */
export interface Arrival {
  words: string
  lines: Known
}

/**
 * What a project says as the person arrives (project-arrival-since.md): «Since you last looked: 2 decisions and a new
 * report.», from its window by Home's rules (`unsaid`, `newsOf`), or null. The bar names the project, so it doesn't.
 */
export function arrivalOf(projectId: string, window: Since, at: ArrivalAt): Arrival | null {
  const fresh = unsaid(new Map([[projectId, window]]), at.said, at.reader, at.pending).get(projectId)
  const news = fresh ? newsOf(fresh) : null
  return news ? { words: `Since you last looked: ${newsWords(news)}.`, lines: { [projectId]: linesOf(window) } } : null
}

const storeKey = (account: string) => `sophia.since.said.v1.${account}`

/** What the page keeps where the storage refuses: once per line for as long as the page lives. */
const kept = new Map<string, Known>()

const isKnown = (value: unknown): value is Known =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => Array.isArray(v) && v.every((line) => typeof line === 'string'))

/** What the storage holds at `key`, if it is what `valid` says; else, or where it refuses, `none`. */
function storedAt<T>(key: string, valid: (value: unknown) => value is T, none: T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    return valid(value) ? value : none
  } catch {
    return none
  }
}

const stored = (account: string): Known => storedAt(storeKey(account), isKnown, {})

/** What this account was told, or shown, by project, on this device. */
export const readSaid = (account: string): Known => ({ ...stored(account), ...kept.get(account) })

/**
 * Keeps `known` (project → a window's lines) beside what was kept for other projects. A project's window replaces what
 * it kept: it holds every line still in it, so no more than one window per project is ever kept.
 */
export function rememberSaid(account: string, known: Known): void {
  const all = { ...readSaid(account), ...known }
  try {
    localStorage.setItem(storeKey(account), JSON.stringify(all))
  } catch {
    kept.set(account, all)
  }
}

const pendingKey = (account: string) => `sophia.since.pending.v1.${account}`

/** The projects waiting where the storage refuses, by account, for as long as the page lives. */
const waiting = new Map<string, readonly string[]>()

const isIds = (value: unknown): value is string[] => Array.isArray(value) && value.every((id) => typeof id === 'string')

/**
 * The projects whose call ended with no window of theirs read since (Codex P2 on #468): the read as a call ends fails
 * when the call ended because the network or the API went. Per account on this device, so a reload keeps them.
 */
export const readPending = (account: string): readonly string[] =>
  waiting.get(account) ?? storedAt(pendingKey(account), isIds, [])

function keepPending(account: string, ids: readonly string[]): void {
  try {
    localStorage.setItem(pendingKey(account), JSON.stringify(ids))
    waiting.delete(account)
  } catch {
    waiting.set(account, ids)
  }
}

/** A call in `projectId` ended: until a window of it is read, none of it is news (`unsaid`). */
export const markPending = (account: string, projectId: string): void =>
  keepPending(account, [...new Set([...readPending(account), projectId])])

/**
 * A window of `projectId`, just read. If its call's read was pending, this is it: what the call held, kept whole as
 * said, and the project waits no more. Else it keeps nothing.
 */
export function settlePending(account: string, projectId: string, window: Since): void {
  const pending = readPending(account)
  if (!pending.includes(projectId)) return
  rememberSaid(account, { [projectId]: linesOf(window) })
  const rest = pending.filter((id) => id !== projectId)
  keepPending(account, rest)
}
