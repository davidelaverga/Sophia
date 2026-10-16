// A message a search found beyond the chat's window (A38, docs/handoffs/FND-C4-PROJECT-SEARCH-attempt-1.md): one page
// read ends at it (A23, before the message just after it), and stands apart from the window until the messages between
// are read. Pure, so the rules are unit-tested.
import { inOrder } from './message-acts.ts'

interface Placed {
  id: string
  createdAt: string
}

/**
 * Where the gap is after the page that ends at a found message: after the page's newest message, unless nothing lies
 * between the page and what the chat shows (the message after it is shown, or the page reaches into it): then null.
 */
export function gapAfterPage(page: readonly Placed[], shown: readonly Placed[], before: string): string | null {
  const ids = new Set(shown.map((s) => s.id))
  if (ids.has(before) || page.some((p) => ids.has(p.id))) return null
  return page.toSorted(inOrder).at(-1)?.id ?? null
}

/** The message just after the gap, whose earlier page fills it from below; undefined when none is shown after it. */
export function afterGap(shown: readonly Placed[], gap: string): Placed | undefined {
  const sorted = shown.toSorted(inOrder)
  const at = sorted.findIndex((s) => s.id === gap)
  return at < 0 ? undefined : sorted[at + 1]
}

/**
 * Whether a page read below the gap reached the found page: it holds the gap's message or one older, or the chat's
 * first message. Then the gap is closed; otherwise it stays where it was, the page put under it.
 */
export function closesGap(page: readonly Placed[], gapAt: Placed, atStart: boolean): boolean {
  return atStart || page.some((p) => inOrder(p, gapAt) <= 0)
}
