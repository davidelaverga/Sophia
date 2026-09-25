// Pure SSE projection (architecture 12 §7, 13 §3). Ported from the pack's reference
// implementation/src/projections.ts: sequences stay decimal strings/BigInt, duplicates are
// ignored, a gap asks for a new snapshot, and cursor.advanced accounts for hidden events.
// No network calls; it never accepts or completes work.
import type { Event } from '@sophia/contracts'
import type { Frame } from '@sophia/contracts/sse'

export type { Frame }

export interface Feed {
  cursor: string
  needsSnapshot: boolean
  /** Newest first, bounded. Includes cursor.advanced frames so hidden updates are visible as such. */
  recent: readonly Frame[]
  seen: ReadonlySet<string>
}

export const RECENT_LIMIT = 30

const seq = (s: string): bigint => {
  if (!/^(0|[1-9][0-9]*)$/.test(s)) throw new Error('invalid_cursor')
  return BigInt(s)
}

export function initialFeed(cursor: string): Feed {
  seq(cursor)
  return { cursor, needsSnapshot: false, recent: [], seen: new Set() }
}

export function applyFrame(s: Feed, f: Frame): Feed {
  if (s.needsSnapshot) return s
  const old = seq(s.cursor)
  const next = seq(f.sequence)
  if (next <= old) return s
  if (f.type === 'cursor.advanced') {
    return { ...s, cursor: f.sequence, recent: [f, ...s.recent].slice(0, RECENT_LIMIT) }
  }
  if (next !== old + 1n) return { ...s, needsSnapshot: true }
  const event = f as Event
  if (s.seen.has(event.eventId)) return { ...s, cursor: f.sequence }
  const seen = new Set(s.seen).add(event.eventId)
  return { cursor: f.sequence, needsSnapshot: false, seen, recent: [event, ...s.recent].slice(0, RECENT_LIMIT) }
}

/** After a resnapshot: continue from the snapshot cursor, keep what was already shown. */
export function rebase(s: Feed, snapshotCursor: string): Feed {
  const cursor = seq(snapshotCursor) > seq(s.cursor) ? snapshotCursor : s.cursor
  return { ...s, cursor, needsSnapshot: false }
}
