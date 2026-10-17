// The room's messages that came while the tab was hidden (docs/plans/unread-title.md): typed ones, never the viewer's
// own. The tab shown again, all are seen.
import { useEffect, useState } from 'react'
import type { DiscussionEntry } from '@sophia/contracts'

/** The typed messages not seen, never the viewer's own: a spoken turn has its caption. */
export const unseenCount = (
  entries: readonly DiscussionEntry[],
  seen: ReadonlySet<string>,
  me: string | null,
): number => entries.filter((e) => e.origin === 'composer' && e.actorId !== me && !seen.has(e.id)).length

/** Whether the page is hidden, followed as it changes. */
function useHidden(): boolean {
  const [hidden, setHidden] = useState(() => document.hidden)
  useEffect(() => {
    const follow = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', follow)
    return () => document.removeEventListener('visibilitychange', follow)
  }, [])
  return hidden
}

/**
 * How many messages came while the tab was hidden. Seen are those there while it was shown, or when the discussion was
 * first read: a tab opened in the background counts only what comes after.
 */
export function useUnseenWhileHidden(entries: readonly DiscussionEntry[] | undefined, me: string | null): number {
  const hidden = useHidden()
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null)
  useEffect(() => {
    if (entries) setSeen((was) => (hidden && was ? was : new Set(entries.map((e) => e.id))))
  }, [entries, hidden])
  return hidden && entries && seen ? unseenCount(entries, seen, me) : 0
}
