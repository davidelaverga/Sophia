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
