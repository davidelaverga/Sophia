// The room's messages that came while the tab was hidden (docs/plans/unread-title.md): typed ones, never the viewer's
// own. The tab shown again, all are seen. Each is counted as it comes, so one that rolls out of the snapshot's latest 50
// still counts, and the number never goes down while the tab is hidden (Codex P2 on #418).
import { useEffect, useState } from 'react'
import type { DiscussionEntry } from '@sophia/contracts'

/**
 * The messages counted while the tab is hidden, each by its id with who wrote it: the membership is read apart from the
 * snapshot, so the viewer can be known only after their own message was counted (Codex P2 on #444).
 */
type Counted = ReadonlyMap<string, string>

/**
 * The messages counted so far, with the typed ones in `entries` not seen and not counted yet, never the viewer's own: a
 * spoken turn has its caption. One of theirs counted before they were known leaves, though it left the snapshot. The
 * same map when nothing changes, so a refresh alone changes nothing.
 */
export function withUnseen(
  counted: Counted,
  entries: readonly DiscussionEntry[],
  seen: ReadonlySet<string>,
  me: string | null,
): Counted {
  const fresh = entries.filter(
    (e) => e.origin === 'composer' && e.actorId !== me && !seen.has(e.id) && !counted.has(e.id),
  )
  const own = me === null ? [] : [...counted].filter(([, actorId]) => actorId === me)
  if (fresh.length === 0 && own.length === 0) return counted
  const next = new Map(counted)
  for (const [id] of own) next.delete(id)
  for (const e of fresh) next.set(e.id, e.actorId)
  return next
}

/** What the discussion held while the tab was shown, and the messages counted since it was hidden. */
interface Unseen {
  seen: ReadonlySet<string>
  counted: Counted
}

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
  const [unseen, setUnseen] = useState<Unseen | null>(null)
  useEffect(() => {
    if (!entries) return // the shell in the background reads no discussion
    setUnseen((was) => {
      if (!hidden || !was) return { seen: new Set(entries.map((e) => e.id)), counted: new Map() }
      const counted = withUnseen(was.counted, entries, was.seen, me)
      return counted === was.counted ? was : { seen: was.seen, counted }
    })
  }, [entries, hidden, me])
  return hidden && entries && unseen ? withUnseen(unseen.counted, entries, unseen.seen, me).size : 0
}
