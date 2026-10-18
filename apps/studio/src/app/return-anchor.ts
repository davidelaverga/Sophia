// A link's place through a sign-in (docs/plans/anchor-through-sign-in.md). A magic link and a provider come back to the
// page's path only, and the callback's cleanup drops the fragment, so the conversation, task or resource a link named
// was lost on the way in. It is kept on this device while the sign-in is out (a magic link opens a new tab), and given
// back once, on the same path, after the clean address. A return that didn't sign in (an older link, a provider's
// refusal) puts it back on the address too and keeps it, so the next try, in this tab or another, still finds it.

import type { AuthCallback } from './auth-callback.ts'

export const RETURN_ANCHOR_KEY = 'sophia.return-anchor'
/** How long a sign-in may be out before its place is let go. */
export const RETURN_ANCHOR_MS = 30 * 60_000

/**
 * The anchors the Studio's views answer (resources/link.ts); nothing else in a fragment is kept, tokens least of all.
 * The bound, 7203, is the longest body the link helpers make from ids the contract allows (Codex P2 on #404): a
 * request's resource (Need.ref.resourceId, ≤ 160) and the request (Need.ref.id, ≤ 200), each code point at most 20
 * characters once `requestAddress` and `linkHash` have both encoded it (four UTF-8 bytes as %XX, each % then as %25),
 * with the %2F between: 160 × 20 + 3 + 200 × 20.
 */
const VIEW_ANCHOR = /^#(?:conversation|task|goal|decision|resource|request)-[^\s#&=]{1,7203}$/

interface Store {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/** On leaving for a magic link or a provider: the view's anchor kept with its path; with none, an older one let go. */
export function keepAnchor(store: Store, at: { pathname: string; hash: string }, now: number): void {
  if (!VIEW_ANCHOR.test(at.hash)) {
    store.removeItem(RETURN_ANCHOR_KEY)
    return
  }
  store.setItem(RETURN_ANCHOR_KEY, JSON.stringify({ path: at.pathname, hash: at.hash, at: now }))
}

function parsed(raw: string | null): unknown {
  try {
    return JSON.parse(raw ?? 'null')
  } catch {
    return null
  }
}

/** The anchor kept for this path in the last half hour, if it is one a view answers; null otherwise. */
function anchorBack(kept: unknown, path: string, now: number): string | null {
  if (typeof kept !== 'object' || kept === null) return null
  const keptPath: unknown = Reflect.get(kept, 'path')
  const hash: unknown = Reflect.get(kept, 'hash')
  const at: unknown = Reflect.get(kept, 'at')
  if (keptPath !== path || typeof hash !== 'string' || !VIEW_ANCHOR.test(hash)) return null
  return typeof at === 'number' && now - at >= 0 && now - at <= RETURN_ANCHOR_MS ? hash : null
}

/** Back from that sign-in, signed in: the anchor to put after the clean address, once; null when there is none. */
export function takeAnchor(store: Store, path: string, now: number): string | null {
  const raw = store.getItem(RETURN_ANCHOR_KEY)
  store.removeItem(RETURN_ANCHOR_KEY)
  return anchorBack(parsed(raw), path, now)
}

/**
 * The anchor to put after the clean address, back from a callback. Signed in from a link or a provider, it is taken.
 * Back without a sign-in, it is read and left kept: another tab's link may still sign in (Codex P2 on #404). An
 * invitation, or no callback at all, never left from here: nothing comes back, and nothing is touched.
 */
export function anchorAfter(
  store: Store,
  back: { kind: AuthCallback['kind']; signedIn: boolean; path: string },
  now: number,
): string | null {
  if (back.kind === 'code' && back.signedIn) return takeAnchor(store, back.path, now)
  if (back.kind !== 'code' && back.kind !== 'error') return null
  return anchorBack(parsed(store.getItem(RETURN_ANCHOR_KEY)), back.path, now)
}

/** On leaving, as far as this device's storage allows (it may be blocked): the view opens at its top otherwise. */
export function keepReturnAnchor(): void {
  try {
    keepAnchor(localStorage, window.location, Date.now())
  } catch {
    // No storage here: nothing is kept, and nothing is lost but the place.
  }
}

/** Back from a callback: the anchor to append to the clean address (`anchorAfter`), or nothing. */
export function returnAnchorAfter(kind: AuthCallback['kind'], signedIn: boolean): string {
  try {
    return anchorAfter(localStorage, { kind, signedIn, path: window.location.pathname }, Date.now()) ?? ''
  } catch {
    return ''
  }
}
