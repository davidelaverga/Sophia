// What changed since you last looked, said once (docs/plans/home-since-you-looked.md): what a window of A34 holds that
// Sophia's sentence on Home names, only what someone else did, and, per account on this device, the lines already said
// there, shown in Updates or in front of the person when a call ended, by project. Pure but for the storage, which may
// refuse: the page then remembers for as long as it lives.
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

/** The windows with news for `reader` on this device, each trimmed to that news (`known`: by project). */
export function unsaid(windows: ReadonlyMap<string, Since>, known: Known, reader: string | null): Map<string, Since> {
  return new Map(
    [...windows].flatMap(([id, w]) => {
      const fresh = freshIn(w, reader, known[id])
      return newsOf(fresh) ? [[id, fresh] as const] : []
    }),
  )
}

const storeKey = (account: string) => `sophia.since.said.v1.${account}`

/** What the page keeps where the storage refuses: once per line for as long as the page lives. */
const kept = new Map<string, Known>()

const isKnown = (value: unknown): value is Known =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => Array.isArray(v) && v.every((line) => typeof line === 'string'))

function stored(account: string): Known {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storeKey(account)) ?? '{}')
    return isKnown(value) ? value : {}
  } catch {
    return {}
  }
}

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
