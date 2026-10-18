// A member corrects or withdraws their own message in the room's discussion (contract amendment A36,
// docs/plans/message-acts.md): previewed and confirmed through sophia.preview_contribution_act,
// sophia.correct_contribution and sophia.withdraw_contribution (0068), which check the author, the message's revision
// and the reach shown under the project's and the message's locks. The member is the transaction's actor.
import type pg from 'pg'
import type {
  ContributionActPreview,
  ContributionActReceipt,
  ContributionCorrection,
  ContributionWithdrawal,
} from '@sophia/contracts'
import { onlyRow } from './rows.ts'

/** What correcting or withdrawing the message would do, and the proof the act carries. Inside withActor(..., "read"). */
export async function previewContributionAct(
  c: pg.PoolClient,
  projectId: string,
  contributionId: string,
  action: ContributionActPreview['action'],
): Promise<ContributionActPreview> {
  const { rows } = await c.query<{ preview: ContributionActPreview }>(
    'SELECT sophia.preview_contribution_act($1, $2, $3) AS preview',
    [projectId, contributionId, action],
  )
  const preview = onlyRow(rows, 'preview_contribution_act').preview
  return { ...preview, expiresAt: new Date(preview.expiresAt).toISOString() }
}

/** New words for the author's own written message. Inside withActor(..., "write"). */
export async function correctContribution(
  c: pg.PoolClient,
  projectId: string,
  contributionId: string,
  idempotencyKey: string,
  body: ContributionCorrection,
): Promise<ContributionActReceipt> {
  const { rows } = await c.query<{ receipt: ContributionActReceipt }>(
    'SELECT sophia.correct_contribution($1, $2, $3, $4) AS receipt',
    [projectId, contributionId, idempotencyKey, JSON.stringify(body)],
  )
  return onlyRow(rows, 'correct_contribution').receipt
}

/** The author takes their own message out of the discussion. Inside withActor(..., "write"). */
export async function withdrawContribution(
  c: pg.PoolClient,
  projectId: string,
  contributionId: string,
  idempotencyKey: string,
  body: ContributionWithdrawal,
): Promise<ContributionActReceipt> {
  const { rows } = await c.query<{ receipt: ContributionActReceipt }>(
    'SELECT sophia.withdraw_contribution($1, $2, $3, $4) AS receipt',
    [projectId, contributionId, idempotencyKey, JSON.stringify(body)],
  )
  return onlyRow(rows, 'withdraw_contribution').receipt
}
