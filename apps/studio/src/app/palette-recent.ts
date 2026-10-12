// What the palette ran last (docs/plans/palette-knows.md): command ids, the newest first, five at most, kept in this
// browser. A per-viewer convenience: blocked or unreadable storage keeps nothing and breaks nothing.

export const RECENT_KEY = 'sophia.palette.recent'
const MOST = 5

/** The ids after `id` was run: it first, once, five at most. */
export const keptAfter = (kept: readonly string[], id: string): string[] =>
  [id, ...kept.filter((k) => k !== id)].slice(0, MOST)

/** What is kept, as ids; none when the storage is blocked or holds something else. */
export function readRecent(store: Pick<Storage, 'getItem'> | null = safeStorage()): string[] {
  try {
    const read: unknown = JSON.parse(store?.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(read) ? read.filter((x): x is string => typeof x === 'string').slice(0, MOST) : []
  } catch {
    return []
  }
}

/** Notes a command run from the palette. */
export function noteRun(id: string): void {
  try {
    safeStorage()?.setItem(RECENT_KEY, JSON.stringify(keptAfter(readRecent(), id)))
  } catch {
    // Blocked storage: nothing kept, nothing broken.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
