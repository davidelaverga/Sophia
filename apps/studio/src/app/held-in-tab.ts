// The writes this tab sent with no reply, kept across a reload (docs/plans/reliability-held-on-reload.md; the
// reliability baseline's gap #8). A message whose reply was lost lived only in the page's memory, so a reload lost it
// without a word, and the next words went under a new key: a message the API had recorded could be recorded twice.
// Here its key and its words are kept in the tab's session storage, as an unanswered review proposal is
// (review-proposal.ts): the tab's own, so another tab never sends it and it ends with the tab; per account (accountOf),
// part and project; until it is answered. Signing out, or another account coming in, forgets every other account's
// (App.tsx); a page load, still finding out who is in, forgets nothing. Storage refused: kept for this page only.

/** Whose held write, where: the account (accountOf), the part that sent it, and the project. */
export interface HeldAt {
  account: string
  part: 'talk' | 'room'
  project: string
}

const PREFIX = 'sophia.held.v1:'

/** Where a held write is kept: its account, part and project, each whole (JSON), so no two scopes share a key. */
export const heldKey = (at: HeldAt) => `${PREFIX}${JSON.stringify([at.account, at.part, at.project])}`

/** What keeping needs of a storage. */
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

const isStore = (value: unknown): value is Store =>
  typeof value === 'object' &&
  value !== null &&
  ['getItem', 'setItem', 'removeItem', 'key'].every((name) => typeof Reflect.get(value, name) === 'function')

/** The tab's session storage, or none where there is none or the browser refuses it. */
function session(): Store | null {
  try {
    const found: unknown = Reflect.get(globalThis, 'sessionStorage')
    return isStore(found) ? found : null
  } catch {
    return null
  }
}

/** What the tab keeps for `at`, as it was kept (its part reads its own shape); null for none or an unreadable one. */
export function readHeld(at: HeldAt, store: Store | null = session()): unknown {
  try {
    const raw = store?.getItem(heldKey(at)) ?? null
    const kept: unknown = raw === null ? null : JSON.parse(raw)
    return kept
  } catch {
    return null
  }
}

/** Keeps `value` for `at` in the tab; null lets it go. */
export function keepHeld(at: HeldAt, value: unknown, store: Store | null = session()): void {
  try {
    if (value === null) store?.removeItem(heldKey(at))
    else store?.setItem(heldKey(at), JSON.stringify(value))
  } catch {
    // Not kept beyond this page.
  }
}

/** Whose a kept write is, by its key: anything under the prefix that names nobody is nobody's, and goes. */
function accountOfKey(key: string): string | undefined {
  try {
    const scope: unknown = JSON.parse(key.slice(PREFIX.length))
    return Array.isArray(scope) && typeof scope[0] === 'string' ? scope[0] : undefined
  } catch {
    return undefined
  }
}

/**
 * Only `account`'s stay, and nobody's where it is null (a sign-out); undefined, while who is in is still found out,
 * forgets nothing (review-proposal.ts's proposalsKeptFor). Nothing else in the tab goes.
 */
export function heldOnlyOf(account: string | null | undefined, store: Store | null = session()): void {
  if (account === undefined) return
  try {
    if (!store) return
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i))
    for (const key of keys) {
      if (key?.startsWith(PREFIX) && accountOfKey(key) !== account) store.removeItem(key)
    }
  } catch {
    // Storage refused: nothing was kept there.
  }
}

/** Signing out: no held write of anyone's stays in the tab. */
export const forgetHeld = () => heldOnlyOf(null)
