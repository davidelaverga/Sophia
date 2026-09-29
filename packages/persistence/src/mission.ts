// The mission ledger's writes (db/migrations/0018, contract amendment A08). Each call is one sophia.* function that
// re-checks the actor's authority under the project lock, is idempotent per actor and key, and answers a stale revision
// with a conflict. A voice write names its turn; the function re-checks that the input epoch binds the calling actor,
// so the speaker comes from the exchange, never from anything the model said. Nothing here reads a transcript.
import type pg from 'pg'
import type {
  MissionDecisionRequest,
  MissionEntryRequest,
  MissionNotePolicy,
  MissionProposalRequest,
  MissionReceipt,
  MissionWithdrawalPreview,
  MissionWithdrawalRequest,
} from '@sophia/contracts'
import { onlyRow } from './rows.ts'

/**
 * The turn a voice write acts in: the exchange and input epoch that bind the speaker. A decision also names the
 * provider session and the holder utterance it was answered in, so it can be bound to the proposal put to them.
 */
export interface MissionTurn {
  exchangeId: string
  inputEpoch: number
  connectionGeneration?: number
  utterance?: number
}

/** A note, or with `correctsEntryId` a correction that supersedes a current note. */
export interface NoteWrite extends MissionEntryRequest {
  correctsEntryId?: string | null
  turn?: MissionTurn
}

export interface ProposalWrite extends MissionProposalRequest {
  turn?: MissionTurn
}

export interface DecisionWrite extends MissionDecisionRequest {
  turn?: MissionTurn
}

/** What `present_mission_proposal` answers: the proposal now awaiting the speaker's answer. */
export interface Presented {
  decisionId: string
  decisionRevision: number
  expiresAt: string
}

async function receipt(c: pg.PoolClient, statement: string, sql: string, params: unknown[]): Promise<MissionReceipt> {
  const { rows } = await c.query<{ receipt: MissionReceipt }>(sql, params)
  return onlyRow(rows, statement).receipt
}

/** Record a note or a correction. Call inside withActor(..., "write"). */
export function recordMissionEntry(
  c: pg.PoolClient,
  projectId: string,
  idempotencyKey: string,
  write: NoteWrite,
): Promise<MissionReceipt> {
  return receipt(c, 'record_mission_entry', `SELECT sophia.record_mission_entry($1, $2, $3) AS receipt`, [
    projectId,
    idempotencyKey,
    JSON.stringify(write),
  ])
}

/**
 * Forget a note and what was derived from it; eligibility narrows. The request is what its preview listed (the
 * version ids, each decision's id and revision) and the preview's proof: it erases only if that is still exactly what
 * it reaches, else it is a stale conflict, and only with the server's proof that this member was shown it. Call
 * inside withActor(..., "write").
 */
export function withdrawMissionEntry(
  c: pg.PoolClient,
  projectId: string,
  entryId: string,
  idempotencyKey: string,
  request: MissionWithdrawalRequest,
): Promise<MissionReceipt> {
  return receipt(c, 'withdraw_mission_entry', `SELECT sophia.withdraw_mission_entry($1, $2, $3, $4, $5) AS receipt`, [
    projectId,
    entryId,
    idempotencyKey,
    JSON.stringify(request.expectedAffected),
    request.previewToken,
  ])
}

/** The withdrawal of exactly what a preview showed: its list, and its proof. */
export const shownReach = (preview: MissionWithdrawalPreview): MissionWithdrawalRequest => ({
  expectedAffected: {
    entryIds: preview.entries.map((e) => e.id),
    decisions: preview.decisions.map((d) => ({ id: d.id, revision: d.revision })),
  },
  previewToken: preview.previewToken,
})

/**
 * What forgetting a note would erase, by the same rule the withdrawal applies: shown to the member before they confirm.
 * Call inside withActor(..., "read") as the member about to forget it.
 */
export async function previewMissionWithdrawal(
  c: pg.PoolClient,
  projectId: string,
  entryId: string,
): Promise<MissionWithdrawalPreview> {
  const { rows } = await c.query<{ preview: MissionWithdrawalPreview }>(
    `SELECT sophia.preview_mission_withdrawal($1, $2) AS preview`,
    [projectId, entryId],
  )
  return onlyRow(rows, 'preview_mission_withdrawal').preview
}

/** Propose a mission, constraint or lesson; accepts nothing. Call inside withActor(..., "write"). */
export function proposeMissionChange(
  c: pg.PoolClient,
  projectId: string,
  idempotencyKey: string,
  write: ProposalWrite,
): Promise<MissionReceipt> {
  return receipt(c, 'propose_mission_change', `SELECT sophia.propose_mission_change($1, $2, $3) AS receipt`, [
    projectId,
    idempotencyKey,
    JSON.stringify(write),
  ])
}

/** Accept or reject one pending proposal at its revision. Call inside withActor(..., "write"). */
export function decideMissionChange(
  c: pg.PoolClient,
  projectId: string,
  decisionId: string,
  idempotencyKey: string,
  write: DecisionWrite,
): Promise<MissionReceipt> {
  return receipt(c, 'decide_mission_change', `SELECT sophia.decide_mission_change($1, $2, $3, $4) AS receipt`, [
    projectId,
    decisionId,
    idempotencyKey,
    JSON.stringify(write),
  ])
}

/** Sophia read a pending proposal back to the speaker: it becomes the exchange's confirmation target. */
export async function presentMissionProposal(
  c: pg.PoolClient,
  projectId: string,
  decisionId: string,
  turn: MissionTurn,
): Promise<Presented> {
  const { rows } = await c.query<{ presented: Presented }>(
    `SELECT sophia.present_mission_proposal($1, $2, $3) AS presented`,
    [projectId, decisionId, JSON.stringify(turn)],
  )
  return onlyRow(rows, 'present_mission_proposal').presented
}

/** An admin turns voice note capture on or off at the revision they saw. Call inside withActor(..., "write"). */
export async function setMissionNotePolicy(
  c: pg.PoolClient,
  projectId: string,
  capture: MissionNotePolicy['capture'],
  expectedRevision: number,
): Promise<void> {
  await c.query(`SELECT sophia.set_mission_note_policy($1, $2, $3)`, [projectId, capture, expectedRevision])
}

/** A member accepts or declines notes kept from their own turns. Call inside withActor(..., "write"). */
export async function setMissionNoteConsent(
  c: pg.PoolClient,
  projectId: string,
  state: 'accepted' | 'declined',
): Promise<void> {
  await c.query(`SELECT sophia.set_mission_note_consent($1, $2)`, [projectId, state])
}
