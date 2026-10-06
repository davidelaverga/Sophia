// Error classes from architecture 12 §10. The API maps them to HTTP; the retry disposition
// tells the client what is safe after the failure.
import type { Error as ApiError } from '@sophia/contracts'

export type ErrorCode =
  | 'actor_context_required'
  | 'forbidden'
  | 'invalid_request'
  | 'not_found'
  | 'stale_revision'
  | 'request_erased'
  | 'notes_full'
  | 'carried_full'
  | 'invalid_state'
  | 'idempotency_conflict'
  | 'source_ineligible'
  | 'projection_unavailable'
  | 'outcome_unknown'
  | 'unavailable'
  | 'runtime_capability_required'
  | 'media_capability_required'
  | 'native_capability_unavailable'
  | 'note_policy_denied'
  | 'confirmation_required'
  | 'native_task_retired'
  | 'research_gate_closed'
  | 'research_limit_reached'
  | 'html_unavailable'

export type Retry = ApiError['retry']

const DISPOSITION: Record<ErrorCode, { status: number; retry: Retry }> = {
  actor_context_required: { status: 401, retry: 'reauthorize' },
  forbidden: { status: 403, retry: 'never' },
  source_ineligible: { status: 403, retry: 'never' },
  invalid_request: { status: 422, retry: 'never' },
  not_found: { status: 422, retry: 'never' },
  stale_revision: { status: 409, retry: 'never' },
  // A retry of a personal write the person has since erased (PS-01): it must never write again, under any key.
  request_erased: { status: 409, retry: 'never' },
  // A personal space keeps at most 2000 notes, and one person carries at most 2000 (PS-01): forget or take back first.
  notes_full: { status: 409, retry: 'never' },
  carried_full: { status: 409, retry: 'never' },
  invalid_state: { status: 409, retry: 'never' },
  idempotency_conflict: { status: 409, retry: 'never' },
  // A projection this build cannot render yet: fail loudly rather than return a false empty list.
  projection_unavailable: { status: 503, retry: 'never' },
  // The write may or may not have committed: retry with the SAME Idempotency-Key.
  outcome_unknown: { status: 503, retry: 'same_admission_key' },
  unavailable: { status: 503, retry: 'safe_read' },
  // A /v1/runtime/* call without a recognized runtime capability (A04). Never a member identity.
  runtime_capability_required: { status: 401, retry: 'reauthorize' },
  // A /v1/media/* call without the media bridge's capability (A06). Never a member identity.
  media_capability_required: { status: 401, retry: 'reauthorize' },
  // The project has no registered native runtime to run the work on: admitting it would only fail later.
  native_capability_unavailable: { status: 503, retry: 'never' },
  // Voice note capture is off for the project, or the speaker has not agreed to notes from their turns (SMC-M01).
  note_policy_denied: { status: 403, retry: 'never' },
  // A voice decision that cannot be bound to the proposal put to this speaker: put it to them again (SMC-M01).
  confirmation_required: { status: 409, retry: 'never' },
  // New brief admission is retired (SMC-M01); existing briefs stay readable and controllable.
  native_task_retired: { status: 410, retry: 'never' },
  // The project has no research grant, or its gate is closed: no research is admitted and nothing is spent (SMC-M03).
  research_gate_closed: { status: 403, retry: 'never' },
  // A research call would pass its allowance, the grant's total or the source policy's limit (SMC-M03).
  research_limit_reached: { status: 409, retry: 'never' },
  // HTML was asked for while no designer or capture renderer is ready: nothing is admitted; Markdown is offered (SDD-01).
  html_unavailable: { status: 503, retry: 'never' },
}

export class DomainError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly retry: Retry

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DomainError'
    this.code = code
    this.status = DISPOSITION[code].status
    this.retry = DISPOSITION[code].retry
  }
}
