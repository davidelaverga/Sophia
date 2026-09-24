// Error classes from architecture 12 §10. The API maps them to HTTP; the retry disposition
// tells the client what is safe after the failure.
import type { Error as ApiError } from '@sophia/contracts'

export type ErrorCode =
  | 'actor_context_required'
  | 'forbidden'
  | 'invalid_request'
  | 'not_found'
  | 'stale_revision'
  | 'invalid_state'
  | 'idempotency_conflict'
  | 'source_ineligible'
  | 'projection_unavailable'
  | 'outcome_unknown'
  | 'unavailable'

export type Retry = ApiError['retry']

const DISPOSITION: Record<ErrorCode, { status: number; retry: Retry }> = {
  actor_context_required: { status: 401, retry: 'reauthorize' },
  forbidden: { status: 403, retry: 'never' },
  source_ineligible: { status: 403, retry: 'never' },
  invalid_request: { status: 422, retry: 'never' },
  not_found: { status: 422, retry: 'never' },
  stale_revision: { status: 409, retry: 'never' },
  invalid_state: { status: 409, retry: 'never' },
  idempotency_conflict: { status: 409, retry: 'never' },
  // A projection this build cannot render yet: fail loudly rather than return a false empty list.
  projection_unavailable: { status: 503, retry: 'never' },
  // The write may or may not have committed: retry with the SAME Idempotency-Key.
  outcome_unknown: { status: 503, retry: 'same_admission_key' },
  unavailable: { status: 503, retry: 'safe_read' },
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
