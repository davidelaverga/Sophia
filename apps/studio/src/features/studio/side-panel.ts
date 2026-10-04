// The side panel's rules, kept out of React so they are tested: which panels there are, what counts as new in
// the chat, and whether the brief changed since it was last looked at.
import type { Snapshot } from '@sophia/contracts'

export type Panel = 'chat' | 'brief'
export const PANELS: readonly Panel[] = ['chat', 'brief']
export const PANEL_TITLE: Record<Panel, string> = { chat: 'Chat', brief: 'Brief' }

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
  const fresh = people.filter((p) => known.get(p.identity) !== p.name)
  if (fresh.length === 0) return known
  const next = new Map(known)
  for (const p of fresh) next.set(p.identity, p.name)
  return next
}

/** Opening a panel that is open closes it; any other opens in its place. */
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
