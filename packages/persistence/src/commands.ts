import type pg from 'pg'
import type { GoalCommand, Receipt } from '@sophia/contracts'
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

/**
 * Whether the acting member already sent a command under this key. A retry is answered by its first receipt
 * (admit_goal_command replays it), so nothing judged before admission may answer it differently. Call inside withActor.
 */
export async function commandKeyUsed(c: pg.PoolClient, projectId: string, idempotencyKey: string): Promise<boolean> {
  const { rows } = await c.query<{ used: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM sophia.commands
                    WHERE project_id = $1 AND actor_id = sophia.actor_id() AND idempotency_key = $2) AS used`,
    [projectId, idempotencyKey],
  )
  return rows[0]?.used ?? false
}
