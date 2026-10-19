// The room's messages that came while the tab was hidden (docs/plans/unread-title.md): typed ones, never the viewer's
// own. The tab shown again, all are seen. Each is counted as it comes, so one that rolls out of the snapshot's latest 50
// still counts, and the number never goes down while the tab is hidden (Codex P2 on #418). Shown again, what was counted
// is kept as what came while the person was away, for the room's chat to mark (docs/plans/messages-while-away.md).
import { createContext, useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
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

/** What came while the tab was hidden, said once it is shown again (messages-while-away.md). */
export interface Away {
  /** The messages, in the order they came: the first is where the person left off, and names the absence. */
  ids: readonly string[]
  /** Its divider was seen in the chat: the chat's head no longer offers to go there. */
  reached: boolean
}

/**
 * What the discussion held while the tab was shown, the messages counted since it was hidden, whether it was hidden at
 * the last read, and what came while the person was away.
 */
export interface Unseen {
  seen: ReadonlySet<string>
  counted: Counted
  hidden: boolean
  away: Away | null
}

/**
 * Shown again, what was counted came while away: after what an earlier absence brought, while its divider isn't reached
 * (its first stays where the person left off), else on its own. Nothing counted, it is what it was.
 */
function cameWhileAway(was: Away | null, counted: Counted): Away | null {
  if (counted.size === 0) return was
  const ids = [...counted.keys()]
  return { ids: was && !was.reached ? [...was.ids, ...ids] : ids, reached: false }
}

/**
 * What came, less what the viewer answered: a message they typed, here or on another device, puts itself and all
 * before it behind them (one that left the snapshot came before). A turn they spoke reads nothing of the chat.
 */
function unanswered(away: Away | null, entries: readonly DiscussionEntry[], me: string | null): Away | null {
  const last = entries.findLastIndex((e) => e.origin === 'composer' && e.actorId === me)
  if (!away || last < 0) return away
  const after = new Set(entries.slice(last + 1).map((e) => e.id))
  const ids = away.ids.filter((id) => after.has(id))
  if (ids.length === away.ids.length) return away
  return ids.length > 0 ? { ...away, ids } : null
}

/**
 * The next read of the discussion. Hidden, what comes is counted: the same state when nothing changes, so a refresh
 * alone renders nothing. Shown, all is seen, and shown again, what was counted came while away, less what the viewer
 * answered. Seen are those there while it was shown, or when the discussion was first read: a tab opened in the
 * background counts only what comes after.
 */
export function nextUnseen(
  was: Unseen | null,
  entries: readonly DiscussionEntry[],
  hidden: boolean,
  me: string | null,
): Unseen {
  if (hidden && was) {
    const counted = withUnseen(was.counted, entries, was.seen, me)
    return counted === was.counted && was.hidden ? was : { ...was, counted, hidden }
  }
  const came = was?.hidden
    ? cameWhileAway(was.away, withUnseen(was.counted, entries, was.seen, me))
    : (was?.away ?? null)
  return { seen: new Set(entries.map((e) => e.id)), counted: new Map(), hidden, away: unanswered(came, entries, me) }
}

/** The divider of the absence its first message names was seen; another absence's is left as it is. */
export function reachedAway(away: Away | null, first: string): Away | null {
  return away && !away.reached && away.ids[0] === first ? { ...away, reached: true } : away
}

/** «2 messages came while you were away»: counted as the Studio counts, one in the singular. */
export const awayWords = (count: number) =>
  `${String(count)} ${count === 1 ? 'message' : 'messages'} came while you were away`

/** Where the divider goes: above the first drawn of the messages that came (past 50, the first left the snapshot). */
export function dividerAt(away: Away | null, entries: readonly DiscussionEntry[]): string | null {
  if (!away) return null
  const came = new Set(away.ids)
  return entries.find((e) => came.has(e.id))?.id ?? null
}

/** What came while away, as the project's shell keeps it, and the two things that put it behind the person. */
export interface WhileAway {
  away: Away | null
  /** The divider above this first message was seen. */
  reach: (first: string) => void
  /** The person sent something from the chat. */
  sent: () => void
}

/** The project's shell hands what came while away to the room's chat (WhileAway.tsx); outside a project, nothing. */
export const CameWhileAway = createContext<WhileAway | null>(null)

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

/** What came while away, with what ends its line (`reach`) and all of it (`sent`): the same object while it stands. */
function useWhileAway(away: Away | null, setUnseen: Dispatch<SetStateAction<Unseen | null>>): WhileAway {
  const settle = useCallback(
    (next: (away: Away | null) => Away | null) =>
      setUnseen((u) => {
        const after = u && next(u.away)
        return !u || after === u.away ? u : { ...u, away: after }
      }),
    [setUnseen],
  )
  const reach = useCallback((first: string) => settle((a) => reachedAway(a, first)), [settle])
  const sent = useCallback(() => settle(() => null), [settle])
  return useMemo(() => ({ away, reach, sent }), [away, reach, sent])
}

/**
 * How many messages came while the tab is hidden, for its title; and, shown again, what came while away, kept past a
 * visit to another view until its divider is reached or the person sends something. A reload starts with nothing.
 */
export function useUnseenWhileHidden(entries: readonly DiscussionEntry[] | undefined, me: string | null) {
  const hidden = useHidden()
  const [unseen, setUnseen] = useState<Unseen | null>(null)
  useEffect(() => {
    if (!entries) return // the shell in the background reads no discussion
    setUnseen((was) => nextUnseen(was, entries, hidden, me))
  }, [entries, hidden, me])
  const count = hidden && entries && unseen ? withUnseen(unseen.counted, entries, unseen.seen, me).size : 0
  return { count, whileAway: useWhileAway(unseen?.away ?? null, setUnseen) }
}
