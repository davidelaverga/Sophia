import type pg from 'pg'
import type { GoalCommand, Receipt } from '@sophia/contracts'
import { safeInt } from './bigint.ts'
import { onlyRow } from './rows.ts'

/**
 * Admit a goal command through sophia.admit_goal_command (db/migrations/0003). The function
 * rechecks membership, revision, epoch and idempotency under the project lock; the same key and
 * payload return the original receipt, a different payload raises idempotency_conflict.
 * Call inside withActor(..., "write"). No provider I/O happens in this transaction.
 */
export async function admitGoalCommand(
  c: pg.PoolClient,
  projectId: string,
  idempotencyKey: string,
  cmd: GoalCommand,
): Promise<Receipt> {
  const { rows } = await c.query<{ receipt: Receipt }>(
    `SELECT sophia.admit_goal_command($1, $2, $3, $4, $5, $6, $7) AS receipt`,
    [
      projectId,
      cmd.goalId,
      cmd.kind,
      idempotencyKey,
      cmd.expectedGoalRevision,
      cmd.expectedAuthorityEpoch,
      cmd.bodySourceId,
    ],
  )
  return onlyRow(rows, 'admit_goal_command').receipt
}

/** What a command already sent under a key expected of its goal; null where its request names none. */
export interface SentCommand {
  expectedGoalRevision: number | null
  expectedAuthorityEpoch: number | null
}

/**
 * The command the acting member already sent under this key, or null. admit_goal_command answers a retry with the
 * first receipt only when the request is the same, expectations included, and a Hold, Stop or Resume moved the goal's
 * epoch since: so a retry sends what the first call expected, never what it reads now. Call inside withActor.
 */
export async function sentCommand(
  c: pg.PoolClient,
  projectId: string,
  idempotencyKey: string,
): Promise<SentCommand | null> {
  const { rows } = await c.query<{ revision: string | null; epoch: string | null }>(
    `SELECT semantic_request->>'expectedGoalRevision' AS revision, semantic_request->>'expectedAuthorityEpoch' AS epoch
       FROM sophia.commands WHERE project_id = $1 AND actor_id = sophia.actor_id() AND idempotency_key = $2`,
    [projectId, idempotencyKey],
  )
  const row = rows[0]
  if (!row) return null
  return {
    expectedGoalRevision: row.revision === null ? null : safeInt(row.revision, 'expectedGoalRevision'),
    expectedAuthorityEpoch: row.epoch === null ? null : safeInt(row.epoch, 'expectedAuthorityEpoch'),
  }
}

/** Whether the acting member may command work here (an editor or admin): admit_goal_command refuses anyone else first. */
export async function canCommand(c: pg.PoolClient, projectId: string): Promise<boolean> {
  const { rows } = await c.query<{ allowed: boolean }>(`SELECT sophia.can_edit($1) AS allowed`, [projectId])
  return rows[0]?.allowed ?? false
}
