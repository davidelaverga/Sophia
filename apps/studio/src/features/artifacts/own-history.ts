// The page's own entries in the tab's history, apart from its frames' (B-CLOSE-TARGET-COMPATIBILITY-REPAIR-01). A page
// framed in the report pane adds entries of its own to the tab's history: a designed page's citation moves within its
// frame (HtmlView, in-page-links.ts). `history.go` steps through all of them, so after a citation it undid that move
// and left the report open. The Navigation API lists only the page's own entries. Without it there is no way to step
// past a frame's moves (taking the frame out of the page leaves them in the tab's history), so where the browser lacks
// it, HtmlView frames no page that moves within its frame. Safari 16.4, which the build targets, has none.

/** What of the Navigation API the viewer's steps need: its entries, the current one among them, and a step to one. */
interface OwnNavigation {
  readonly currentEntry: { readonly index: number } | null
  entries: () => readonly { readonly key: string }[]
  traverseTo: (key: string) => { committed?: Promise<unknown>; finished?: Promise<unknown> }
}

/** Where to read the Navigation API from: the window, which may have it, or only part of it, or none. */
interface Scope {
  navigation?: { [K in keyof OwnNavigation]?: OwnNavigation[K] | undefined } | null | undefined
}

const whole = (nav: Scope['navigation']): nav is OwnNavigation =>
  typeof nav?.traverseTo === 'function' && typeof nav.entries === 'function' && Boolean(nav.currentEntry)

/**
 * The browser's Navigation API, where it has the whole of what the viewer's steps need (its entries, the current one
 * among them, and a step straight to one); null where it has none or only part of it.
 */
export function ownHistory(scope: Scope = window): OwnNavigation | null {
  return whole(scope.navigation) ? scope.navigation : null
}

/**
 * The step back over `n` of the page's own history entries: through the Navigation API, straight to the entry `n` back,
 * whatever the page's frames added; `history.go` where the browser has no such API, since no frame then moves (HtmlView).
 * Null where the API can't reach the entry `n` back: the viewer then changes its address in place.
 */
export function stepBack(n: number, scope: Scope = window): (() => void) | null {
  const nav = ownHistory(scope)
  if (!nav) return () => window.history.go(-n)
  const at = nav.currentEntry?.index ?? -1
  const to = at >= n ? nav.entries()[at - n] : undefined
  if (!to) return null
  return () => {
    const { committed, finished } = nav.traverseTo(to.key)
    // A step another navigation overtakes is that navigation's to report, not this one's.
    committed?.catch(() => undefined)
    finished?.catch(() => undefined)
  }
}
