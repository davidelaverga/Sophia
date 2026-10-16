// A project's activity for its admins (db/migrations/0057, contract amendment A28): people's acts from the project's
// events, with their actors and the members acted on, named as the room keeps them; and the record of an admin's act on
// someone in the call (A24), which the API writes once the room server has done it.
import type pg from 'pg'
import type { ActivityPage } from '@sophia/contracts'
import { onlyRow } from './rows.ts'

interface ActivityRow {
  sequence: string
  occurred_at: Date
  type: string
  summary_code: string
  actor_id: string
  actor_name: string | null
  target_id: string | null
  target_name: string | null
}

/** How many acts a page holds. */
const PAGE = 50

/** A page of the project's activity, newest first (A28); admins only (42501, so 403). Inside withActor("read"). */
export async function readProjectActivity(
  c: pg.PoolClient,
  projectId: string,
  before: string | null,
): Promise<ActivityPage> {
  // One more than a page says whether older acts remain.
  const { rows } = await c.query<ActivityRow>(`SELECT * FROM sophia.project_activity($1, $2, $3)`, [
    projectId,
    before,
    PAGE + 1,
  ])
  const more = rows.length > PAGE
  const entries = rows.slice(0, PAGE).map((r) => ({
    sequence: r.sequence,
    occurredAt: r.occurred_at.toISOString(),
    type: r.type,
    summaryCode: r.summary_code,
    actor: { id: r.actor_id, name: r.actor_name },
    target: r.target_id ? { id: r.target_id, name: r.target_name } : null,
  }))
  return { entries, before: more ? (entries.at(-1)?.sequence ?? null) : null }
}

/** Record an admin's act on a member in the call (A24, 0057); returns the event's cursor. Inside withActor("write"). */
export async function recordHostAct(
  c: pg.PoolClient,
  projectId: string,
  target: string,
  act: 'mute' | 'remove',
): Promise<string> {
  const { rows } = await c.query<{ cursor: string }>(`SELECT sophia.record_host_act($1, $2, $3)::text AS cursor`, [
    projectId,
    target,
    act,
  ])
  return onlyRow(rows, 'record_host_act').cursor
}
