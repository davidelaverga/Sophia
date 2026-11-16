// The tip that names the index's key, once per browser (docs/plans/keys-tip.md): kept seen once dismissed, or once the
// index opened any way. A store that can't be read counts as seen: a tip that couldn't be kept closed would come back
// on every visit.

export const KEYS_TIP_KEY = 'sophia.keys-tip'

type Store = Pick<Storage, 'getItem' | 'setItem'>

/** Whether the tip has had its turn in this browser. */
export function readSeen(store: Pick<Store, 'getItem'> | null): boolean {
  try {
    return store === null || store.getItem(KEYS_TIP_KEY) === 'seen'
  } catch {
    return true
  }
}

/** Keeps the tip seen in this browser; blocked storage keeps nothing and breaks nothing. */
export function keepSeen(store: Pick<Store, 'setItem'> | null): void {
  try {
    store?.setItem(KEYS_TIP_KEY, 'seen')
  } catch {
    // Blocked storage: the tip goes for this page all the same.
  }
}

function browserStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

let seen: boolean | undefined
const listeners = new Set<() => void>()

/** Whether the tip has had its turn, read once per page and followed as it ends. */
export const tipSeenNow = (): boolean => (seen ??= readSeen(browserStore()))

/** Hears the tip end. */
export function onTipSeen(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Ends the tip for this browser: dismissed, or the index opened. */
export function endKeysTip(): void {
  if (tipSeenNow()) return
  seen = true
  keepSeen(browserStore())
  for (const tell of listeners) tell()
}
