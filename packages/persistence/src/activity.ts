// A project's activity for its admins (db/migrations/0057, contract amendment A28): people's acts from the project's
// events, with their actors and the members acted on, named as the room keeps them; and the record of an admin's act on
// someone in the call (A24), which the API writes once the room server has done it.
import type pg from 'pg'
import type { ActivityPage, MemberRemoved } from '@sophia/contracts'
import type { RemovalClaim } from './removals.ts'
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
/**
 * An admin's camera stop, screen stop, or everyone muted (A31, 0060), recorded once the room server has done it; the
 * target is the member, or null for everyone. Call inside withActor(..., "write").
 */
export async function recordRoomAct(
  c: pg.PoolClient,
  projectId: string,
  target: string | null,
  act: 'camera' | 'screen' | 'mute_all',
): Promise<string> {
  const { rows } = await c.query<{ cursor: string }>(`SELECT sophia.record_room_act($1, $2, $3)::text AS cursor`, [
    projectId,
    target,
    act,
  ])
  return onlyRow(rows, 'record_room_act').cursor
}

/**
 * Whether this admin took `target` out of the call in the last ten minutes (Codex P2 on #351): a retry of a removal
 * whose answer was lost finds them gone, and is answered as done. Call inside withActor(..., "read").
 */
export async function removedJustNow(c: pg.PoolClient, projectId: string, target: string): Promise<boolean> {
  const { rows } = await c.query<{ done: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM sophia.project_events WHERE project_id = $1 AND type = 'room.host_removed'
       AND entity_id = $2 AND actor_id = sophia.actor_id() AND occurred_at > now() - interval '10 minutes') AS done`,
    [projectId, target],
  )
  return onlyRow(rows, 'removed_just_now').done
}

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

/** Remove a member (A29, 0058): admins only, never oneself, idempotent per actor and key. Inside withActor("write"). */
export async function removeMember(
  c: pg.PoolClient,
  projectId: string,
  target: string,
  idempotencyKey: string,
): Promise<MemberRemoved> {
  const { rows } = await c.query<{ receipt: MemberRemoved }>(`SELECT sophia.remove_member($1, $2, $3) AS receipt`, [
    projectId,
    target,
    idempotencyKey,
  ])
  return onlyRow(rows, 'remove_member').receipt
}

/** The open removal of a member an admin removed, for the API's immediate attempt; admins only. Inside withActor. */
export async function pendingMemberRemoval(
  c: pg.PoolClient,
  projectId: string,
  target: string,
): Promise<RemovalClaim | null> {
  const { rows } = await c.query<RemovalClaim & { room_id: string }>(
    `SELECT id, room_id, identity, state, attempts FROM sophia.pending_member_removal($1, $2)`,
    [projectId, target],
  )
  const r = rows[0]
  return r ? { id: r.id, roomId: r.room_id, identity: r.identity, state: r.state, attempts: r.attempts } : null
}
