// How long a message in the room's bar may be (docs/plans/room-message-length.md), by who it goes to: the room's
// discussion takes 4000 characters (A05, Contribution.text); Sophia's typed turn rides a chat packet the bridge refuses
// past 2000 UTF-16 units (room-chat.ts). Pure.
import type { Target } from './discussion-view.ts'
import { lengthOf } from '../personal/characters.ts'

/** The most one message holds, by who it goes to. */
export const BAR_MOST: Record<Target, number> = { room: 4000, sophia: 2000 }

/** A message's length as its target counts it, trimmed as it is sent: the API in characters, a packet in units. */
export const barLength = (target: Target, draft: string): number =>
  target === 'room' ? lengthOf(draft.trim()) : draft.trim().length

/** The count over the bar, from nine tenths of the most on, so the limit is said before it bites; null before. */
export function barCount(target: Target, draft: string): { length: number; most: number } | null {
  const length = barLength(target, draft)
  const most = BAR_MOST[target]
  return length >= most * 0.9 ? { length, most } : null
}

/** Whether the message fits who it goes to. */
export const barFits = (target: Target, draft: string): boolean => barLength(target, draft) <= BAR_MOST[target]
