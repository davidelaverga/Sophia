// The tip that names the index's key, once per browser (docs/plans/keys-tip.md): kept seen once dismissed, once the
// index opened any way, or once it has been let be for SHOWINGS visits. A store that can't be read counts as seen: a
// tip that couldn't be kept closed would come back on every visit. Another tab's end is heard (`storage`). The typing
// tip (type-tip.ts) is kept the same way, under its own key (`onceTip`).

export const KEYS_TIP_KEY = 'sophia.keys-tip'

/** The visits that may show it: let be through these, it ends on its own. */
export const SHOWINGS = 3

type Store = Pick<Storage, 'getItem' | 'setItem'>

/** How many visits have shown a tip (0 to SHOWINGS − 1), or null once seen; anything else kept counts as seen. */
function shownSoFar(store: Pick<Store, 'getItem'> | null, key: string): number | null {
  try {
    if (store === null) return null
    const kept = store.getItem(key)
    if (kept === null) return 0
    const shown = Number(kept)
    return /^\d+$/.test(kept) && shown < SHOWINGS ? shown : null
  } catch {
    return null
  }
}

/** Whether a tip (the keys', unless named) has had its turn in this browser. */
export const readSeen = (store: Pick<Store, 'getItem'> | null, key = KEYS_TIP_KEY): boolean =>
  shownSoFar(store, key) === null

/** Keeps a tip seen in this browser; blocked storage keeps nothing and breaks nothing. */
export function keepSeen(store: Pick<Store, 'setItem'> | null, key = KEYS_TIP_KEY): void {
  keep(store, key, 'seen')
}

function keep(store: Pick<Store, 'setItem'> | null, key: string, value: string) {
  try {
    store?.setItem(key, value)
  } catch {
    // Blocked storage: read as seen next time anyway, and the tip goes for this page all the same.
  }
}

/** One more visit has shown it: kept as a count, or as seen once that was the last. */
export function keepShown(store: Store | null, key = KEYS_TIP_KEY): void {
  const shown = shownSoFar(store, key)
  if (shown === null) return
  keep(store, key, shown + 1 >= SHOWINGS ? 'seen' : String(shown + 1))
}

/** What the page is like now, as the keys' tip reads it. */
export interface KeysTipMoment {
  /** A sheet is up: `?` is the sheet's, not the view's. */
  modal: boolean
  /** A field has the caret: `?` is a letter there. */
  fieldFocused: boolean
  /** A field on screen takes stray typing: `?` would go there. */
  sinkOnScreen: boolean
  /**
   * A guide (Home's first run, `data-guide`) is on screen, or was on this page: one guide at a time, and the tip's turn
   * waits for a later visit (demo-findings-1.md #17).
   */
  guided: boolean
  /** Whether the tip's box meets a control's: a scan of the page, so asked last. */
  coversControl: () => boolean
}

/** Whether the keys' tip may show now: `?` opens the index, no guide has the page, and it covers no control. */
export const keysTipShows = (m: KeysTipMoment): boolean =>
  !m.modal && !m.fieldFocused && !m.sinkOnScreen && !m.guided && !m.coversControl()

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

/** A tip shown once per browser, kept under its own key: the keys' tip and the typing tip (type-anywhere-tip.md). */
export interface OnceTip {
  /** Whether it has had its turn, read once per page and followed as it ends. */
  seenNow: () => boolean
  /** Hears it end, here or in another tab. */
  onSeen: (listener: () => void) => () => void
  /** Ends it for this browser: dismissed, or what it names done. */
  end: () => void
  /** This visit has shown it: counted once per page, however often it comes and goes; the last such visit ends it. */
  countShowing: () => void
}

export function onceTip(key: string, store: () => Store | null = browserStore): OnceTip {
  let seen: boolean | undefined
  let counted = false
  const listeners = new Set<() => void>()
  const tell = () => {
    for (const listener of listeners) listener()
  }
  const seenNow = () => (seen ??= readSeen(store(), key))
  /** Another tab ended it: this one hears it through the store. */
  const heard = (e: StorageEvent) => {
    if (e.key !== key || seenNow() || !readSeen(store(), key)) return
    seen = true
    tell()
  }
  return {
    seenNow,
    onSeen: (listener) => {
      if (listeners.size === 0) window.addEventListener('storage', heard)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) window.removeEventListener('storage', heard)
      }
    },
    end: () => {
      if (seenNow()) return
      seen = true
      keepSeen(store(), key)
      tell()
    },
    countShowing: () => {
      if (counted) return
      counted = true
      keepShown(store(), key)
    },
  }
}

/** The tip that names the index's key. */
export const keysTip = onceTip(KEYS_TIP_KEY)

/** Ends the keys' tip for this browser: dismissed, or the index opened. */
export const endKeysTip = (): void => keysTip.end()
