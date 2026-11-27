// The side panel's rules, kept out of React so they are tested: which panels there are, what counts as new in
// the chat, and whether the brief changed since it was last looked at.
import type { Snapshot } from '@sophia/contracts'

export type Panel = 'chat' | 'people' | 'brief'

export const PANELS: readonly Panel[] = ['chat', 'people', 'brief']
export const PANEL_TITLE: Record<Panel, string> = { chat: 'Chat', people: 'People', brief: 'Brief' }

/** A turn that has its outcome: answered, refused, or left unconfirmed. */
const SETTLED: ReadonlySet<string> = new Set(['complete', 'refused', 'unknown'])

/**
 * What the chat shows, by identity: its newest discussion entry, its newest typed turn, how far the replies have come
 * (every packet of a reply moves its sequence), how many turns have their outcome, and its newest result notice
 * (SMC-M03: a finished result told to someone who reads). A new message changes it even once the kept history is full
 * and the oldest drops out (the discussion keeps its latest 50, the typed chat 100, the notices 20), which a count
 * could not see; so does a reply that goes on, or ends refused or unconfirmed, behind a closed panel. A notice
 * delivered again is the same notice. Null until the project has loaded: a room still loading is no baseline.
 */
export function chatSignature(
  snapshot: Pick<Snapshot, 'discussion'> | undefined,
  turns: readonly { id: string; sequence: number; state: string }[],
  notices: readonly { key: string }[],
): string | null {
  if (!snapshot) return null
  const progress = turns.reduce((n, t) => n + t.sequence + 1, 0)
  const settled = turns.filter((t) => SETTLED.has(t.state)).length
  const notice = notices.at(-1)?.key ?? ''
  return [snapshot.discussion.at(-1)?.id ?? '', turns.at(-1)?.id ?? '', progress, settled, notice].join('|')
}

/** The chat has something unseen when what it shows changed since it was last in view, and it isn't in view now. */
export const changedUnseen = (current: string | null, seen: string | null, inView: boolean): boolean =>
  !inView && current !== null && seen !== null && current !== seen

/** What counts as seen: what the chat shows while in view, and the first chat that loads (the baseline). */
export const seenNow = (seen: string | null, current: string | null, inView: boolean): string | null =>
  inView || seen === null ? current : seen

/** The names seen so far plus the room's people now; the same map when nobody is new, so nothing re-renders. */
export function mergeNames(
  known: ReadonlyMap<string, string>,
  people: readonly { identity: string; name: string }[],
): ReadonlyMap<string, string> {
  // An empty name is none: it never takes the place of a name the visit knew, nor of a message's own.
  const fresh = people.filter((p) => p.name.trim() !== '' && known.get(p.identity) !== p.name)
  if (fresh.length === 0) return known
  const next = new Map(known)
  for (const p of fresh) next.set(p.identity, p.name)
  return next
}

/** Opening a panel that is open closes it; any other opens in its place. */
/**
 * The panel to open as the room comes back on screen (`was` → `now`, focus-kept.md): the one its address names, as the
 * lens is read then (Back to an earlier Studio entry from another view); none named, the panel held stays. A move within
 * the room (a report's Close steps Back) reads nothing: what is on screen stays (addressed-follows-back.md).
 */
export function panelOnReturn(was: boolean, now: boolean, search: string): Panel | null {
  if (was || !now) return null
  const named = new URLSearchParams(search).get('panel')
  return PANELS.find((p) => p === named) ?? null
}

export const toggled = (open: Panel | null, panel: Panel): Panel | null => (open === panel ? null : panel)

/** Something is new when it grew past what was seen, and it isn't in view right now. */
export const isNew = (current: number | null, seen: number | null, inView: boolean): boolean =>
  !inView && current !== null && seen !== null && current > seen

/**
 * Where the focus lands when a panel opens: the chat's message bar where a keyboard is at hand, else the panel's
 * tab. Never Chat with Sophia: focused, a stray Space would start the chat.
 */
export const focusOnOpen = (panel: Panel, finePointer: boolean, entry: 'bar' | 'start' | null): 'bar' | 'tab' =>
  panel === 'chat' && finePointer && entry === 'bar' ? 'bar' : 'tab'

/**
 * One change of the open panel, for the focus: opening moves it in (`in`); closing hands it back to `opener` (`back`),
 * the corner toggle that opened the panel or last swapped it, whatever tab was chosen inside since; switching tabs
 * moves nothing.
 */
export function focusStep(
  was: Panel | null,
  open: Panel | null,
  opener: Panel | null,
): { in: Panel } | { back: Panel } | null {
  if (open && !was) return { in: open }
  if (!open && was) return { back: opener ?? was }
  return null
}

/**
 * What the panel's head says where the panel covers the dock: what stopped a device, else why the call ended or
 * failed, unless the chat is the tab in view (its foot says that itself).
 */
export const panelNote = (open: Panel | null, device: string | null, call: string | null): string | null =>
  device ?? (open === 'chat' ? null : call)

/** A message peeked at beside the Chat toggle (chat-pace.md): who wrote it, and its first line. */
export interface Peek {
  id: string
  author: string
  line: string
}

/** How long a peek stays beside a closed chat. */
export const PEEK_MS = 6_000

/** The first line of a message, cut to a peek's length. */
export function firstLine(text: string, most = 80): string {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  return line.length > most ? `${line.slice(0, most - 1).trimEnd()}…` : line
}

/** The discussion's newest entry as last seen: its id and when it was said. */
export interface Seen {
  id: string
  at: string
}

/**
 * The peek for a discussion's newest entry, once it moved on past the one last seen, to a message said since: someone
 * else's only (your own was sent from the bar), named as the chat names them; nothing for an empty line. The newest
 * withdrawn, the one before it becomes the newest: older, it is no news.
 */
export function peekOf(
  newest: { id: string; actorId: string; text: string; createdAt: string } | undefined,
  seen: Seen | null,
  me: string | null,
  author: (actorId: string) => string,
): Peek | null {
  if (!newest || seen === null || newest.id === seen.id || newest.actorId === me) return null
  // An empty discussion seen has no time: anything after it is news.
  const before = Date.parse(seen.at)
  if (!Number.isNaN(before) && !(Date.parse(newest.createdAt) >= before)) return null
  const line = firstLine(newest.text)
  return line ? { id: newest.id, author: author(newest.actorId), line } : null
}
