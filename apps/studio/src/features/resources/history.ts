// A window's history: the readings of one window, from its earlier observations and the latest, oldest first. One
// window means the same id and the same reset: after a reset the window starts over, and its old readings aren't its
// history. Only values the collector observed for a window known to apply are drawn; nothing is filled in between.
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

export function windowHistory(window: QuotaWindow, readings: readonly QuotaObservation[]): Point[] {
  const points = readings.flatMap((o) => {
    const w = o.windows.find((x) => x.window_id === window.window_id && x.resets_at === window.resets_at)
    return w && drawable(w) && w.value !== null ? [{ at: Date.parse(o.observed_at), value: w.value }] : []
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
