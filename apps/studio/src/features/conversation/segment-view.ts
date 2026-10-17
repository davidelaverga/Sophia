// Messages a search found beyond the chat's window (A38, docs/handoffs/FND-C4-PROJECT-SEARCH-attempt-1.md): each is
// read with one page that ends at it (A23, before the message just after it). What reads show of the discussion's
// order is kept as each message's next one: a page's messages are consecutive, its last one's next is the message it
// was read before, and the window's are consecutive. Wherever the next message shown is not the one a read showed,
// messages between were never read: a gap, said and filled from below, a page at a time. However many pages were read,
// in whatever order, every unread interval stays one (R-C4-01). Pure, so the rules are unit-tested.
import { inOrder } from './message-acts.ts'

interface Placed {
  id: string
  createdAt: string
}

/** Each message's next one, as a page read before `before` shows them: consecutive, the last's being `before`. */
export function pageLinks(page: readonly Placed[], before: string): [string, string][] {
  const sorted = page.toSorted(inOrder)
  return sorted.map((p, i) => [p.id, sorted[i + 1]?.id ?? before])
}

/** Each message's next one in the window (the latest messages, consecutive); the newest has none. */
export function windowLinks(window: readonly Placed[]): [string, string][] {
  const sorted = window.toSorted(inOrder)
  return sorted.flatMap((p, i): [string, string][] => {
    const next = sorted[i + 1]
    return next ? [[p.id, next.id]] : []
  })
}

/** Where unread messages lie: after each message shown whose next one, as read, is not the next one shown. */
export function gapsIn(shown: readonly Placed[], links: ReadonlyMap<string, string>): string[] {
  const sorted = shown.toSorted(inOrder)
  return sorted.flatMap((p, i) => {
    const next = sorted[i + 1]
    return next && links.get(p.id) !== next.id ? [p.id] : []
  })
}

/** The message just after a gap, whose earlier page fills it from below; undefined when none is shown after it. */
export function afterGap(shown: readonly Placed[], gap: string): Placed | undefined {
  const sorted = shown.toSorted(inOrder)
  const at = sorted.findIndex((s) => s.id === gap)
  return at < 0 ? undefined : sorted[at + 1]
}
