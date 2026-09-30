// The side panel's rules, kept out of React so they are tested: which panels there are, what counts as new in
// the chat, and whether the brief changed since it was last looked at.
import type { Snapshot } from '@sophia/contracts'

export type Panel = 'chat' | 'brief'
export const PANELS: readonly Panel[] = ['chat', 'brief']
export const PANEL_TITLE: Record<Panel, string> = { chat: 'Chat', brief: 'Brief' }

/** How much the chat holds: each discussion entry, each typed turn, and each reply once it begins. */
export function chatSignature(snapshot: Snapshot | undefined, turns: readonly { reply: string }[]): number {
  const discussion = snapshot?.discussion.length ?? 0
  return turns.reduce((n, t) => n + 1 + (t.reply ? 1 : 0), discussion)
}

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
