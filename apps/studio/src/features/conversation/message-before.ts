// A message a search found (A38) comes with the message just after it in the chat (`before`), so the chat can read the
// one page that ends at it (A23) instead of looking page by page. Kept for the page's life, by message; a message
// opened any other way (a mention from Home, a link) has none, and is looked for as before.
const hints = new Map<string, string | null>()

/** What a search hit said follows this message: its id, or null when it was the newest. */
export const hintBefore = (id: string, before: string | null): void => {
  hints.set(id, before)
}

/** The message after this one, as a search found it; undefined when no search found it. */
export const beforeOf = (id: string | null): string | null | undefined => (id === null ? undefined : hints.get(id))
