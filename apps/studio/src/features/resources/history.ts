// A window's history: the readings of one window, from its earlier observations and the latest, oldest first. One
// window means the same id and the same reset: after a reset the window starts over, and its old readings aren't its
// history. Only values the collector observed for a window known to apply are drawn; nothing is filled in between.
import { roughly } from '../../app/time-words.ts'
import type { QuotaObservation, QuotaWindow } from './resource.ts'

export interface Point {
  at: number
  value: number
}

const drawable = (w: QuotaWindow) =>
  w.state === 'observed' &&
  w.applicability === 'known' &&
  w.value !== null &&
  (w.unit === 'percent_used' || w.unit === 'spend_percent_used')

/** The same window: by its epoch, as the contract identifies it; by its reset time only when a reading has none. */
const sameWindow = (a: QuotaWindow, b: QuotaWindow) =>
  a.window_epoch !== undefined && b.window_epoch !== undefined
    ? a.window_epoch === b.window_epoch
    : a.resets_at === b.resets_at

/**
 * How long a history spans, from its first reading to its last: "3 h". Empty for fewer than two readings, and for ends
 * that aren't finite or run backwards: no span is said from a time that isn't one (r3 repair 6, UI85C4-F09).
 */
export function spanOf(points: readonly Point[]): string {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last || !Number.isFinite(first.at) || !Number.isFinite(last.at) || last.at <= first.at) return ''
  return roughly(last.at - first.at)
}

/**
 * The window's points, oldest first, one per moment. A reading whose time isn't a finite instant gives none: it is kept
 * as read, and no time, zero or count is made up in its place (r3 repair 6, UI85C4-F09).
 */
export function windowHistory(window: QuotaWindow, readings: readonly QuotaObservation[]): Point[] {
  const points = readings.flatMap((o) => {
    const w = o.windows.find((x) => x.window_id === window.window_id && sameWindow(x, window))
    const at = Date.parse(o.observed_at)
    return w && drawable(w) && w.value !== null && Number.isFinite(at) ? [{ at, value: w.value }] : []
  })
  const seen = new Set<number>()
  return points
    .toSorted((a, b) => a.at - b.at)
    .filter((p) => {
      if (seen.has(p.at)) return false
      seen.add(p.at)
      return true
    })
}
