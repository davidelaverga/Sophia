// The day lines in the room's chat (docs/plans/chat-times.md): the first message of each day, in the viewer's zone,
// opens one, «Today», «Yesterday», a weekday within the week, then the date; never ahead. Pure, so it is unit-tested.
import { dayLabel } from '../../app/time-words.ts'

/** For each message's time, the day line it opens, or null; a time that isn't one opens nothing. */
export function dayBreaks(times: readonly string[], now: number): Array<string | null> {
  let last = ''
  return times.map((at) => {
    const date = new Date(at)
    if (Number.isNaN(date.getTime())) return null
    const day = date.toDateString()
    if (day === last) return null
    last = day
    return dayLabel(date, now, { past: true })
  })
}

/**
 * Whether this session's lines (the turns with Sophia, today's) need «Today» above them: the discussion before them
 * ends on another day. With no discussion, nothing is above them to tell apart.
 */
export function todayAfter(lastAt: string | undefined, now: number): boolean {
  if (lastAt === undefined) return false
  const last = new Date(lastAt)
  return !Number.isNaN(last.getTime()) && last.toDateString() !== new Date(now).toDateString()
}
