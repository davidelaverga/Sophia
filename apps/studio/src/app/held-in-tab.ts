// The writes this tab sent with no reply, kept across a reload (docs/plans/reliability-held-on-reload.md; the
// reliability baseline's gap #8). A message whose reply was lost lived only in the page's memory, so a reload lost it
// without a word, and the next words went under a new key: a message the API had recorded could be recorded twice.
// Here its key and its words are kept in the tab's session storage, as an unanswered review proposal is
// (review-proposal.ts): the tab's own, so another tab never sends it and it ends with the tab; per account (accountOf),
// part and project; until it is answered. Signing out, or another account coming in, forgets every other account's
// (App.tsx); a page load, still finding out who is in, forgets nothing. Storage refused: kept for this page only.
// Unsent words are kept the same way, under their own prefix (docs/plans/drafts-survive-reload.md): a reload of the tab
// finds them in their composer; another tab, another account or a sign-out never does.

/** Whose held write, where: the account (accountOf), the part that sent it, and the project. */
export interface HeldAt {
  account: string
  part: 'talk' | 'room'
  project: string
}

const PREFIX = 'sophia.held.v1:'
const DRAFTS = 'sophia.drafts.v1:'

/** The longest draft kept beyond the page (UTF-16 units), past every composer's most; a longer one stays in the page. */
export const DRAFT_MOST = 10_000

const keyIn = (prefix: string, at: HeldAt) => `${prefix}${JSON.stringify([at.account, at.part, at.project])}`

/** Where a held write is kept: its account, part and project, each whole (JSON), so no two scopes share a key. */
export const heldKey = (at: HeldAt) => keyIn(PREFIX, at)

/** Where unsent words are kept: as a held write, under their own prefix. */
export const draftsKey = (at: HeldAt) => keyIn(DRAFTS, at)

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
export const readHeld = (at: HeldAt, store: Store | null = session()): unknown => readAt(heldKey(at), store)

/** Keeps `value` for `at` in the tab; null lets it go. */
export function keepHeld(at: HeldAt, value: unknown, store: Store | null = session()): void {
  keepAt(heldKey(at), value, store)
}

/** The unsent words the tab keeps for `at`, as kept (its part reads its own shape); null for none. */
export const readTabDrafts = (at: HeldAt, store: Store | null = session()): unknown => readAt(draftsKey(at), store)

/**
 * Keeps unsent words for `at` in the tab; null lets them go. Storage full or refused: kept for this page only, and
 * older words kept before go, so a reload never brings back words since changed.
 */
export function keepTabDrafts(at: HeldAt, value: unknown, store: Store | null = session()): void {
  if (!keepAt(draftsKey(at), value, store)) keepAt(draftsKey(at), null, store)
}

function readAt(key: string, store: Store | null): unknown {
  try {
    const raw = store?.getItem(key) ?? null
    const kept: unknown = raw === null ? null : JSON.parse(raw)
    return kept
  } catch {
    return null
  }
}

/** Whether it was kept as asked. */
function keepAt(key: string, value: unknown, store: Store | null): boolean {
  try {
    if (value === null) store?.removeItem(key)
    else store?.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Not kept beyond this page.
    return false
  }
}

/** Whose a kept write is, by its key: anything under the prefix that names nobody is nobody's, and goes. */
function accountOfKey(prefix: string, key: string): string | undefined {
  try {
    const scope: unknown = JSON.parse(key.slice(prefix.length))
    return Array.isArray(scope) && typeof scope[0] === 'string' ? scope[0] : undefined
  } catch {
    return undefined
  }
}

/**
 * Only `account`'s entries under `prefix` stay, and nobody's where it is null (a sign-out); undefined, while who is in
 * is still found out, forgets nothing. Nothing else in the tab goes. True when any went.
 */
function onlyOf(prefix: string, account: string | null | undefined, store: Store | null): boolean {
  if (account === undefined || !store) return false
  try {
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i))
    const out = keys.filter((key): key is string => key?.startsWith(prefix) === true)
    const gone = out.filter((key) => accountOfKey(prefix, key) !== account)
    for (const key of gone) store.removeItem(key)
    return gone.length > 0
  } catch {
    // Storage refused: nothing was kept there.
    return false
  }
}

/**
 * Only `account`'s held writes stay, and nobody's where it is null (a sign-out); undefined, while who is in is still
 * found out, forgets nothing (review-proposal.ts's proposalsKeptFor). Nothing else in the tab goes.
 */
export function heldOnlyOf(account: string | null | undefined, store: Store | null = session()): void {
  onlyOf(PREFIX, account, store)
}

/** Signing out: no held write of anyone's stays in the tab. */
export const forgetHeld = () => heldOnlyOf(null)

/**
 * Only `account`'s unsent words stay in the tab, as heldOnlyOf; true when anyone's went, so the sign-in says they were
 * cleared only when some were (signed-out-elsewhere.md).
 */
export const tabDraftsOnlyOf = (account: string | null | undefined, store: Store | null = session()): boolean =>
  onlyOf(DRAFTS, account, store)

/**
 * Signing out: every account's unsent words leave the tab, handed back as they were (key and kept value), so a sign-out
 * that fails can keep them again (putTabDraftsBack). Storage refused: none were kept, none taken.
 */
export function takeTabDrafts(store: Store | null = session()): Readonly<Record<string, string>> {
  try {
    if (!store) return {}
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i))
    const taken = keys.flatMap((key) => {
      const value = key?.startsWith(DRAFTS) === true ? store.getItem(key) : null
      return key && value !== null ? [[key, value] as const] : []
    })
    for (const [key] of taken) store.removeItem(key)
    return Object.fromEntries(taken)
  } catch {
    return {}
  }
}

/** The words a sign-out took, kept in the tab again: the person is still in. */
export function putTabDraftsBack(taken: Readonly<Record<string, string>>, store: Store | null = session()): void {
  try {
    for (const [key, value] of Object.entries(taken)) if (key.startsWith(DRAFTS)) store?.setItem(key, value)
  } catch {
    // Not kept beyond this page.
  }
}
