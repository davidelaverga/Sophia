// The mission ledger (contract amendment A08): one read, the same MissionContext Sophia reads by voice, and writes
// under the member's own identity. Each write is idempotent per person and key: after no reply, retry with the SAME
// key. A receipt is what happened (committed or proposed), never a promise of more.
import type {
  MissionContext,
  MissionCorrectionRequest,
  MissionDecisionRequest,
  MissionEntryRequest,
  MissionNotePolicy,
  MissionNotePolicyRequest,
  MissionProposalRequest,
  MissionReceipt,
  MissionWithdrawalPreview,
} from '@sophia/contracts'
import {
  parseMissionContext,
  parseMissionNotePolicy,
  parseMissionReceipt,
  parseMissionWithdrawalPreview,
} from '@sophia/contracts/validate'
import { callApi } from './client.ts'

const base = (projectId: string) => `/api/v1/projects/${projectId}/mission` as const

export const getMission = (token: string, projectId: string): Promise<MissionContext> =>
  callApi(base(projectId), { token, method: 'GET' }, parseMissionContext)

/** A note in the member's own words. */
export const recordMissionEntry = (
  token: string,
  projectId: string,
  key: string,
  body: MissionEntryRequest,
): Promise<MissionReceipt> => callApi(`${base(projectId)}/entries`, { token, body, key }, parseMissionReceipt)

/** A correction: a new note supersedes the old one, which stays readable as history. */
export const correctMissionEntry = (
  token: string,
  projectId: string,
  entryId: string,
  key: string,
  body: MissionCorrectionRequest,
): Promise<MissionReceipt> =>
  callApi(`${base(projectId)}/entries/${entryId}/correction`, { token, body, key }, parseMissionReceipt)

/** What forgetting a note would erase: the note's versions and every proposal or decision citing them. */
export const previewMissionWithdrawal = (
  token: string,
  projectId: string,
  entryId: string,
): Promise<MissionWithdrawalPreview> =>
  callApi(`${base(projectId)}/entries/${entryId}/withdrawal`, { token, method: 'GET' }, parseMissionWithdrawalPreview)

/**
 * Forget a note, and exactly what its preview listed: `expectedAffected` is that list, and the server refuses (409)
 * if it would now erase anything else.
 */
export const withdrawMissionEntry = (
  token: string,
  projectId: string,
  entryId: string,
  key: string,
  expectedAffected: readonly string[],
): Promise<MissionReceipt> =>
  callApi(
    `${base(projectId)}/entries/${entryId}/withdrawal`,
    { token, body: { expectedAffected }, key },
    parseMissionReceipt,
  )

export const proposeMissionChange = (
  token: string,
  projectId: string,
  key: string,
  body: MissionProposalRequest,
): Promise<MissionReceipt> => callApi(`${base(projectId)}/proposals`, { token, body, key }, parseMissionReceipt)

/** The member's own decision on one pending proposal, at the revision they saw. */
export const decideMissionChange = (
  token: string,
  projectId: string,
  proposalId: string,
  key: string,
  body: MissionDecisionRequest,
): Promise<MissionReceipt> =>
  callApi(`${base(projectId)}/proposals/${proposalId}/decision`, { token, body, key }, parseMissionReceipt)

/** An admin turns voice note capture on or off. */
export const setNotePolicy = (
  token: string,
  projectId: string,
  body: MissionNotePolicyRequest,
): Promise<MissionNotePolicy> =>
  callApi(`${base(projectId)}/note-policy`, { token, method: 'PUT', body }, parseMissionNotePolicy)

/** The member's own consent to notes kept from their turns. */
export const setNoteConsent = (
  token: string,
  projectId: string,
  state: 'accepted' | 'declined',
): Promise<MissionNotePolicy> =>
  callApi(`${base(projectId)}/note-consent`, { token, method: 'PUT', body: { state } }, parseMissionNotePolicy)
