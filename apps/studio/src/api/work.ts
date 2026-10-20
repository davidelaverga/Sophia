// The work board's calls (WBC-02, amendment A13): the project's board as Sophia serves it, the source-review pilot
// entry, a decision's answer, a command on an assignment, an operation's receipt and a work item's result. Every
// reply is checked against its contract here; the board by the board's own reader (board-view.ts), which its caller
// gives.
// Nothing here reaches Paperclip: the Studio talks to Sophia only.
import type {
  SourceReviewAvailability,
  SourceReviewProposal,
  SourceReviewProposalRequest,
  WorkCommand,
  WorkDecisionAnswer,
  WorkReceipt,
  WorkResult,
} from '@sophia/contracts'
import {
  parseSourceReviewAvailability,
  parseSourceReviewProposal,
  parseWorkReceipt,
  parseWorkResult,
} from '@sophia/contracts/validate'
import { callApi } from './client.ts'

const project = (projectId: string) => `/api/v1/projects/${encodeURIComponent(projectId)}` as const

/**
 * The board as served, read by the board’s own reader (board-view.ts), which the caller gives: a reply it refuses fails
 * the read as any reply that breaks its contract does (silent-views.md).
 */
export const readBoard = <T>(token: string, projectId: string, read: (value: unknown) => T, signal?: AbortSignal) =>
  callApi<T>(`${project(projectId)}/plans`, { token, method: 'GET', ...(signal && { signal }) }, read)

export const reviewAvailability = (token: string, projectId: string, signal?: AbortSignal) =>
  callApi<SourceReviewAvailability>(
    `${project(projectId)}/plans/source-review`,
    { token, method: 'GET', ...(signal && { signal }) },
    parseSourceReviewAvailability,
  )

/** Propose one source review: a plan and its decision, nothing started (the proposer decides on the board). */
export const proposeReview = (token: string, projectId: string, key: string, body: SourceReviewProposalRequest) =>
  callApi<SourceReviewProposal>(
    `${project(projectId)}/plans/source-review`,
    { token, body, key },
    parseSourceReviewProposal,
  )

/**
 * The viewer's own proposal under its key, as Sophia recorded it: one whose answer was lost, known without proposing it
 * again. Not found: Sophia holds no proposal of theirs under that key.
 */
export const recordedProposal = (token: string, projectId: string, key: string, signal?: AbortSignal) =>
  callApi<SourceReviewProposal>(
    `${project(projectId)}/plans/source-review/proposals/${encodeURIComponent(key)}`,
    { token, method: 'GET', ...(signal && { signal }) },
    parseSourceReviewProposal,
  )

/** The exact answer to one decision, under its operation: the Idempotency-Key is the operation's id. */
export const answerDecision = (token: string, projectId: string, answer: WorkDecisionAnswer) =>
  callApi<WorkReceipt>(
    `${project(projectId)}/decisions/${encodeURIComponent(answer.decision_id)}/answer`,
    { token, body: answer, key: answer.operation_id },
    parseWorkReceipt,
  )

/** Hold, Resume or Stop of an assignment's work at one generation, under its operation. */
export const commandWork = (token: string, projectId: string, command: WorkCommand) =>
  callApi<WorkReceipt>(
    `${project(projectId)}/assignments/${encodeURIComponent(command.assignment_id)}/commands`,
    { token, body: command, key: command.operation_id },
    parseWorkReceipt,
  )

/** An operation's receipt as its effect stands now (its revision rises with what is known). */
export const operationReceipt = (token: string, projectId: string, operationId: string, signal?: AbortSignal) =>
  callApi<WorkReceipt>(
    `${project(projectId)}/work/operations/${encodeURIComponent(operationId)}`,
    { token, method: 'GET', ...(signal && { signal }) },
    parseWorkReceipt,
  )

/** A work item's result at one exact version. */
export const workResult = (token: string, projectId: string, workId: string, versionId: string) =>
  callApi<WorkResult>(
    `${project(projectId)}/work/${encodeURIComponent(workId)}/result?version=${encodeURIComponent(versionId)}`,
    { token, method: 'GET' },
    parseWorkResult,
  )
