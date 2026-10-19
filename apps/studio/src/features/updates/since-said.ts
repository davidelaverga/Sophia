// What changed since you last looked, said once (docs/plans/home-since-you-looked.md): what a window of A34 holds that
// Sophia's sentence on Home names, and, per account on this device, the news already said there or looked at in
// Updates, by project. Pure but for the storage, which may refuse: the page then remembers for as long as it lives.
import type { Since } from '../../api/vision.ts'

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

/**
 * A window as remembered: where it starts and what it counts. Not where it ends: A34's `toSequence` is the project's
 * newest event, which every room event moves too, so the same news is the same key however far the feed moved.
 */
export function newsKey(window: Since): string {
  const counts = [window.decided, window.made, window.noted].map((l) => String(l.length)).join('.')
  return `${window.fromSequence ?? 'never'}:${counts}${window.more ? ':more' : ''}`
}

/** The windows with news not yet said to this account on this device (`said`: a project's last key). */
export function unsaid(
  windows: ReadonlyMap<string, Since>,
  said: Readonly<Record<string, string>>,
): Map<string, Since> {
  return new Map([...windows].filter(([id, w]) => newsOf(w) !== null && said[id] !== newsKey(w)))
}

/** Their keys by project, to keep once said. */
export const newsKeys = (windows: ReadonlyMap<string, Since>): Record<string, string> =>
  Object.fromEntries([...windows].map(([id, w]) => [id, newsKey(w)]))

const storeKey = (account: string) => `sophia.since.said.v1.${account}`

/** What the page keeps where the storage refuses: once per window for as long as the page lives. */
const kept = new Map<string, Record<string, string>>()

const isSaid = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => typeof v === 'string')

function stored(account: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storeKey(account)) ?? '{}')
    return isSaid(value) ? value : {}
  } catch {
    return {}
  }
}

/** What this account was told, or looked at, by project, on this device. */
export const readSaid = (account: string): Record<string, string> => ({ ...stored(account), ...kept.get(account) })

/** Keeps `said` (project → key) beside what was kept before. */
export function rememberSaid(account: string, said: Readonly<Record<string, string>>): void {
  const all = { ...readSaid(account), ...said }
  try {
    localStorage.setItem(storeKey(account), JSON.stringify(all))
  } catch {
    kept.set(account, all)
  }
}
