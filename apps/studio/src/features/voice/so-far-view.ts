// How late a person joined a meeting, and the card's words (docs/plans/room-so-far.md). Pure, so they are unit-tested.

/** Under this, joining is joining: nothing to catch up on. */
const LATE_MINUTES = 2

/** Whole minutes from the meeting's start to the join; null when the person was not late. */
export function joinedIn(startedAt: string, joinedAt: number): number | null {
  const minutes = Math.floor((joinedAt - Date.parse(startedAt)) / 60_000)
  return minutes >= LATE_MINUTES ? minutes : null
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`

/** «You joined 12 minutes in.», in hours and minutes past the hour. */
export function joinedWords(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const parts = [hours > 0 ? plural(hours, 'hour', 'hours') : '', rest > 0 ? plural(rest, 'minute', 'minutes') : '']
  return `You joined ${parts.filter(Boolean).join(' ')} in.`
}
