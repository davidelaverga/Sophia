// The tip that names the index's key, once per browser (docs/plans/keys-tip.md): kept seen once dismissed, once the
// index opened any way, or once it has been let be for SHOWINGS visits. A store that can't be read counts as seen: a
// tip that couldn't be kept closed would come back on every visit. Another tab's end is heard (`storage`).

export const KEYS_TIP_KEY = 'sophia.keys-tip'

/** The visits that may show it: let be through these, it ends on its own. */
export const SHOWINGS = 3

type Store = Pick<Storage, 'getItem' | 'setItem'>

/** How many visits have shown it (0 to SHOWINGS − 1), or null once seen; anything else kept counts as seen. */
function shownSoFar(store: Pick<Store, 'getItem'> | null): number | null {
  try {
    if (store === null) return null
    const kept = store.getItem(KEYS_TIP_KEY)
    if (kept === null) return 0
    const shown = Number(kept)
    return /^\d+$/.test(kept) && shown < SHOWINGS ? shown : null
  } catch {
    return null
  }
}

/** Whether the tip has had its turn in this browser. */
export const readSeen = (store: Pick<Store, 'getItem'> | null): boolean => shownSoFar(store) === null

/** Keeps the tip seen in this browser; blocked storage keeps nothing and breaks nothing. */
export function keepSeen(store: Pick<Store, 'setItem'> | null): void {
  keep(store, 'seen')
}

function keep(store: Pick<Store, 'setItem'> | null, value: string) {
  try {
    store?.setItem(KEYS_TIP_KEY, value)
  } catch {
    // Blocked storage: read as seen next time anyway, and the tip goes for this page all the same.
  }
}

/** One more visit has shown it: kept as a count, or as seen once that was the last. */
export function keepShown(store: Store | null): void {
  const shown = shownSoFar(store)
  if (shown === null) return
  keep(store, shown + 1 >= SHOWINGS ? 'seen' : String(shown + 1))
}

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Whether two boxes share any area (edges that only touch don't). */
export const meets = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

function browserStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

let seen: boolean | undefined
let counted = false
const listeners = new Set<() => void>()

const tell = () => {
  for (const listener of listeners) listener()
}

/** Whether the tip has had its turn, read once per page and followed as it ends. */
export const tipSeenNow = (): boolean => (seen ??= readSeen(browserStore()))

/** Another tab ended it: this one hears it through the store. */
function heard(e: StorageEvent) {
  if (e.key !== KEYS_TIP_KEY || tipSeenNow() || !readSeen(browserStore())) return
  seen = true
  tell()
}

/** Hears the tip end, here or in another tab. */
export function onTipSeen(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', heard)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', heard)
  }
}

/** Ends the tip for this browser: dismissed, or the index opened. */
export function endKeysTip(): void {
  if (tipSeenNow()) return
  seen = true
  keepSeen(browserStore())
  tell()
}

/** This visit has shown it: counted once per page, however often it comes and goes; the last such visit ends it. */
export function countShowing(): void {
  if (counted) return
  counted = true
  keepShown(browserStore())
}
