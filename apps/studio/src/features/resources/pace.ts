// A window's pace: how much of it had passed when it was read, against how much of it was used. A meter shows the
// first as a mark; when the account runs out before the window resets at that pace, the sheet says how long before.
// Only a percentage window whose length its name gives (5-hour, 7-day, daily) has a pace: none is made up.
import type { QuotaWindow } from './resource.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** The windows whose length is known from their id. */
const LENGTH: Record<string, number> = {
  five_hour: 5 * HOUR,
  seven_day: 7 * DAY,
  seven_day_opus: 7 * DAY,
  seven_day_sonnet: 7 * DAY,
  daily_requests: DAY,
}

/** Too early in a window to project from: the first 5 % of it. */
const EARLY = 0.05
/** Running out this close to the reset is not worth saying. */
const NEAR = 5 * MINUTE

export interface Pace {
  /** How much of the window had passed when it was read, from 0 to 1. */
  passed: number
  /** "used up ~20 min before it resets", when the account runs out first at this pace; null otherwise. */
  early: string | null
}

/** A stretch of time in the fewest words: "~20 min", "~3 h", "~2 d". */
function span(ms: number): string {
  if (ms < HOUR) return `~${Math.round(ms / MINUTE)} min`
  if (ms < 2 * DAY) return `~${Math.round(ms / HOUR)} h`
  return `~${Math.round(ms / DAY)} d`
}

/** When the window fills at the rate it has filled so far, as a time; null when it won't, or it's too early to say. */
function runsOutAt(used: number, passed: number, length: number, readAt: number): number | null {
  if (passed < EARLY || used <= 0 || used >= 100) return null
  const perMs = used / (passed * length)
  return readAt + (100 - used) / perMs
}

/**
 * The pace of an observed percentage window known to apply, read at `observedAt`; null for any other window, a
 * window without a reset, or one whose length isn't known.
 */
export function pace(w: QuotaWindow, observedAt: string, now: Date): Pace | null {
  const length = LENGTH[w.window_id]
  const percent = w.unit === 'percent_used' || w.unit === 'spend_percent_used'
  if (!length || !percent || w.state !== 'observed' || w.applicability !== 'known') return null
  if (w.value === null || w.resets_at === null) return null
  const reset = Date.parse(w.resets_at)
  if (reset <= now.getTime()) return null
  const readAt = Date.parse(observedAt)
  const passed = Math.min(1, Math.max(0, (readAt - (reset - length)) / length))
  const out = runsOutAt(w.value, passed, length, readAt)
  const before = out === null ? 0 : reset - out
  return { passed, early: before >= NEAR ? `At this pace, used up ${span(before)} before it resets` : null }
}
