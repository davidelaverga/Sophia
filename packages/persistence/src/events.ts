import type pg from 'pg'
import type { CursorAdvance, Event } from '@sophia/contracts'
import { safeInt } from './bigint.ts'

export type EventFrame = Event | CursorAdvance

export interface EventPage {
  frames: EventFrame[]
  /** Cursor after applying every frame (equals `after` when nothing new). */
  cursor: string
  /** False when the actor can no longer read the project (membership revoked or never granted). */
  visible: boolean
}

/**
 * Authorized events after `after`, in order. RLS hides events owned by another viewer; each hidden
 * range becomes a `cursor.advanced` frame so the client never mistakes filtering for a gap
 * (architecture 12 §7). Call inside withActor(..., "read").
 */
export async function readEventFrames(
  c: pg.PoolClient,
  projectId: string,
  after: bigint,
  limit = 200,
): Promise<EventPage> {
  const head = await c.query<{ event_sequence: string }>(`SELECT event_sequence FROM sophia.projects WHERE id = $1`, [
    projectId,
  ])
  const project = head.rows[0]
  if (!project) return { frames: [], cursor: after.toString(), visible: false }
  const latest = BigInt(project.event_sequence)

  const { rows } = await c.query<{
    id: string
    sequence: string
    type: string
    occurred_at: Date
    entity_type: string
    entity_id: string
    entity_revision: string
    references_json: string[]
    summary_code: string
  }>(
    `SELECT id, sequence, type, occurred_at, entity_type, entity_id, entity_revision, references_json, summary_code
       FROM sophia.project_events
      WHERE project_id = $1 AND sequence > $2 AND sequence <= $3
      ORDER BY sequence LIMIT $4`,
    [projectId, after.toString(), project.event_sequence, limit],
  )

  const frames: EventFrame[] = []
  let cursor = after
  for (const e of rows) {
    const seq = BigInt(e.sequence)
    if (seq > cursor + 1n) frames.push({ projectId, type: 'cursor.advanced', sequence: (seq - 1n).toString() })
    frames.push({
      eventId: e.id,
      projectId,
      sequence: e.sequence,
      type: e.type,
      occurredAt: e.occurred_at.toISOString(),
      entityType: e.entity_type,
      entityId: e.entity_id,
      entityRevision: safeInt(e.entity_revision, 'event.entityRevision'),
      references: e.references_json,
      summaryCode: e.summary_code,
    })
    cursor = seq
  }
  // A full page may stop short of `latest`; only advance past hidden tail events when the page is complete.
  if (rows.length < limit && latest > cursor) {
    frames.push({ projectId, type: 'cursor.advanced', sequence: latest.toString() })
    cursor = latest
  }
  return { frames, cursor: cursor.toString(), visible: true }
}
