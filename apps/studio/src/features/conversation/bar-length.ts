// How long a message in the room's bar may be (docs/plans/room-message-length.md). Pure; the count and Send come later.
import type { Target } from './discussion-view.ts'

export const BAR_MOST: Record<Target, number> = { room: 0, sophia: 0 }

export const barLength = (_target: Target, _draft: string): number => 0

export const barCount = (_target: Target, _draft: string): { length: number; most: number } | null => null

export const barFits = (_target: Target, _draft: string): boolean => true
