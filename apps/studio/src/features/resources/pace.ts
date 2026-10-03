// A window's pace: how much of it had passed when it was read, against how much of it was used. A meter shows the
// first as a mark; when the account runs out before the window resets at that pace, the sheet says how long before.
// Only a window whose length is certain has a pace: none is made up. The observation carries no length, so that is a
// source whose window ids name a fixed one. Claude Code's status line documents `five_hour` and `seven_day`. Codex
// reports each window's own duration, which must be kept rather than assumed (04_OWNER_RESOURCES §7), and the
// observation can't carry it yet: no pace for Codex until it does.
import type { QuotaObservation, QuotaWindow } from './resource.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Per source, the windows whose id names their length. */
const LENGTH: Record<string, Record<string, number> | undefined> = {
  'claude-code-statusline': { five_hour: 5 * HOUR, seven_day: 7 * DAY },
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
  /** When it runs out from now, "~35 min", whenever `early` is said; "now" once it should have. */
  runsOut: string | null
  /** The same, in milliseconds from now (zero or less once it should have), to find the window that runs out first. */
  outIn: number | null
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

/** What a pace says once it knows when the account runs out, if it does: only when that is well before the reset. */
function ahead(passed: number, out: number | null, reset: number, now: Date): Pace {
  const before = out === null ? 0 : reset - out
  if (out === null || before < NEAR) return { passed, early: null, runsOut: null, outIn: null }
  const left = out - now.getTime()
  return {
    passed,
    early: `At this pace, used up ${span(before)} before it resets`,
    runsOut: left < MINUTE ? 'now' : span(left),
    outIn: left,
  }
}

/** The reading a window comes from: when it was read, and which source named its windows. */
export type Reading = Pick<QuotaObservation, 'observed_at' | 'source_channel'>

/**
 * The pace of an observed percentage window known to apply; null for any other window, a window without a reset, or
 * one whose length isn't certain.
 */
export function pace(w: QuotaWindow, reading: Reading, now: Date): Pace | null {
  const length = LENGTH[reading.source_channel]?.[w.window_id]
  const percent = w.unit === 'percent_used' || w.unit === 'spend_percent_used'
  if (!length || !percent || w.state !== 'observed' || w.applicability !== 'known') return null
  if (w.value === null || w.resets_at === null) return null
  const reset = Date.parse(w.resets_at)
  if (reset <= now.getTime()) return null
  const readAt = Date.parse(reading.observed_at)
  const passed = Math.min(1, Math.max(0, (readAt - (reset - length)) / length))
  return ahead(passed, runsOutAt(w.value, passed, length, readAt), reset, now)
}
