// The work pulse's rows: repeats of one change close together fold into one row with a count, so a burst
// (links issued and closed, messages sent) reads as one line instead of a column of the same words.
import type { Event as ProjectEvent } from '@sophia/contracts'
import { summaryLabel } from './labels.ts'

/** How close repeats must be to fold: within five minutes of the row's newest one. */
export const FOLD_MS = 5 * 60_000

export interface PulseRow {
  /** The newest event's id, stable while the row grows. */
  key: string
  label: string
  count: number
  /** When the newest of them happened. */
  at: string
}

/** Newest first in, newest first out; a row sits where its newest event did. */
export function pulseRows(events: readonly ProjectEvent[]): PulseRow[] {
  const rows: PulseRow[] = []
  for (const e of events) {
    const label = summaryLabel(e.summaryCode, e.type)
    const when = Date.parse(e.occurredAt)
    const row = rows.find((r) => r.label === label && Math.abs(Date.parse(r.at) - when) <= FOLD_MS)
    if (!row) {
      rows.push({ key: e.eventId, label, count: 1, at: e.occurredAt })
      continue
    }
    row.count += 1
    if (when > Date.parse(row.at)) row.at = e.occurredAt
  }
  return rows
}
