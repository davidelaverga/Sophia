import type pg from 'pg'
import type { ExchangeReceipt, FloorRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { safeInt } from './bigint.ts'
import { onlyRow } from './rows.ts'

export type MemberRole = 'admin' | 'editor' | 'viewer'

interface JoinRow {
  audience_revision: string
  role: MemberRole
}

/**
 * Who may join a project's room, for room-token issuance. Call inside withActor(..., "read"): RLS and
 * the join make a non-member, and a room of another project, look the same (null → 403). A changed
 * audience (membership) since the caller's snapshot is stale_revision, so the client resnapshots.
 */
export async function authorizeRoomJoin(
  c: pg.PoolClient,
  projectId: string,
  roomId: string,
  expectedAudienceRevision: number,
): Promise<{ role: MemberRole } | null> {
  const { rows } = await c.query<JoinRow>(
    `SELECT p.audience_revision, m.role
       FROM sophia.room_state r
       JOIN sophia.projects p ON p.id = r.project_id
       JOIN sophia.project_members m ON m.project_id = p.id AND m.actor_id = sophia.actor_id() AND m.active
      WHERE r.project_id = $1 AND r.id = $2`,
    [projectId, roomId],
  )
  const row = rows[0]
  if (!row) return null
  if (safeInt(row.audience_revision, 'audienceRevision') !== expectedAudienceRevision) {
    throw new DomainError('stale_revision', 'Project membership changed; refresh the project and try again')
  }
  return { role: row.role }
}

/**
 * Pass the input floor through sophia.transfer_input_floor (db/migrations/0009): compare-and-set on the
 * room revision, idempotent per actor and key, one `room.input_floor_changed` event. Call inside
 * withActor(..., "write"). It changes who may address Sophia, never goals or work.
 */
export async function transferInputFloor(
  c: pg.PoolClient,
  roomId: string,
  idempotencyKey: string,
  req: FloorRequest,
): Promise<ExchangeReceipt> {
  const { rows } = await c.query<{ receipt: ExchangeReceipt }>(
    `SELECT sophia.transfer_input_floor($1, $2, $3, $4) AS receipt`,
    [roomId, req.nextActorId, req.expectedRoomRevision, idempotencyKey],
  )
  return onlyRow(rows, 'transfer_input_floor').receipt
}
