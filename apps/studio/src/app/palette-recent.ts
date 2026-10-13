// What the palette ran last (docs/plans/palette-knows.md): command ids, the newest first, five at most, kept in this
// browser. A per-viewer convenience: blocked or unreadable storage keeps nothing and breaks nothing.

export const RECENT_KEY = 'sophia.palette.recent'
const MOST = 5

/**
 * Whose «Recent» this tab reads and writes: the account signed in here. Kept per account (`RECENT_KEY:<account>`), so
 * another account, in this tab after a switch or in another tab at once (a dev identity is per tab), never sees it
 * (Codex on #264 and #283).
 */
let account: string | null = null

/** Where the account's «Recent» is kept: per account; the bare key before one is known (and as kept before this). */
export const recentKey = (of: string | null): string => (of === null ? RECENT_KEY : `${RECENT_KEY}:${of}`)

/** The ids after `id` was run: it first, once, five at most. */
export const keptAfter = (kept: readonly string[], id: string): string[] =>
  [id, ...kept.filter((k) => k !== id)].slice(0, MOST)

/** What is kept for this tab's account, as ids; none when the storage is blocked or holds something else. */
export function readRecent(store: Pick<Storage, 'getItem'> | null = safeStorage()): string[] {
  try {
    const read: unknown = JSON.parse(store?.getItem(recentKey(account)) ?? '[]')
    return Array.isArray(read) ? read.filter((x): x is string => typeof x === 'string').slice(0, MOST) : []
  } catch {
    return []
  }
}

/** Forgets what this tab's account ran here: signing out leaves no «Recent» behind (Codex P2 on #264). */
export function forgetRecent(store: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  try {
    store?.removeItem(recentKey(account))
  } catch {
    // Blocked storage: nothing was kept.
  }
}

/**
 * The account signed in in this tab: its «Recent» is the one read and written from now on. What was kept under the bare
 * key (before «Recent» was per account) is nobody's known, and goes.
 */
export function recentFor(of: string, store: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  account = of
  try {
    store?.removeItem(RECENT_KEY)
  } catch {
    // Blocked storage: nothing kept, nothing broken.
  }
}

/** Notes a command run from the palette, for this tab's account. */
export function noteRun(id: string, store: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): void {
  try {
    store?.setItem(recentKey(account), JSON.stringify(keptAfter(readRecent(store), id)))
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
