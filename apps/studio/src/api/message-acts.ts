// A member corrects or withdraws their own message in the room's chat (A36, docs/plans/message-acts.md): the preview
// says what the act would do and carries the proof the act must send back; the act is idempotent per key, so a reply
// lost on the way is asked again with the same key and body.
import type {
  ContributionActPreview,
  ContributionActReceipt,
  ContributionCorrection,
  ContributionWithdrawal,
} from '@sophia/contracts'
import { parseContributionActPreview, parseContributionActReceipt } from '@sophia/contracts/validate'
import { callApi } from './client.ts'

export type MessageAct = ContributionActPreview['action']

const messagePath = (projectId: string, contributionId: string) =>
  `/api/v1/projects/${projectId}/contributions/${contributionId}` as const

/** What correcting or withdrawing the message would do, and its proof (15 minutes). */
export const previewMessageAct = (
  token: string,
  projectId: string,
  contributionId: string,
  action: MessageAct,
): Promise<ContributionActPreview> =>
  callApi(
    `${messagePath(projectId, contributionId)}/preview?action=${action}`,
    { token, method: 'GET' },
    parseContributionActPreview,
  )

/** What an act sends back of the preview the member was shown: its revision, its reach as listed, its proof. */
export const proofOf = (preview: ContributionActPreview): ContributionWithdrawal => ({
  expectedRevision: preview.revision,
  // The reach exactly as shown, each task with its consequence: the proof binds it (v2, Codex on #396).
  reach: preview.reach.map(({ taskId, kind, restarts }) => ({ taskId, kind, restarts })),
  previewToken: preview.previewToken,
})

/** New words for the member's own written message; retried with the same key after no reply. */
export const correctMessage = (
  token: string,
  projectId: string,
  contributionId: string,
  key: string,
  body: ContributionCorrection,
): Promise<ContributionActReceipt> =>
  callApi(`${messagePath(projectId, contributionId)}/correction`, { token, body, key }, parseContributionActReceipt)

/** The member takes their own message out of the chat; retried with the same key after no reply. */
export const withdrawMessage = (
  token: string,
  projectId: string,
  contributionId: string,
  key: string,
  body: ContributionWithdrawal,
): Promise<ContributionActReceipt> =>
  callApi(`${messagePath(projectId, contributionId)}/withdrawal`, { token, body, key }, parseContributionActReceipt)
