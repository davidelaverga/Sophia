// How late a person joined a meeting, and the card's words (docs/plans/room-so-far.md). Pure, so they are unit-tested.
import { lasted } from '../../app/time-words.ts'

/** Under this, joining is joining: nothing to catch up on. */
const LATE_MINUTES = 2

/** Whole minutes from the meeting's start to the join; null when the person was not late. */
export function joinedIn(startedAt: string, joinedAt: number): number | null {
  const minutes = Math.floor((joinedAt - Date.parse(startedAt)) / 60_000)
  return minutes >= LATE_MINUTES ? minutes : null
}

/** «You joined 12 min in.», «You joined 1 h 30 min in.» (app/time-words.ts). */
export const joinedWords = (minutes: number): string => `You joined ${lasted(minutes * 60_000)} in.`
