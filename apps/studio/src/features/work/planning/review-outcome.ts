// What a source review's proposal says once Sophia answers it, or doesn't (review-proposal.ts keeps the proposal).
// Apart from the keeping, which the Studio's sign-in needs (to forget on sign-out) and which reads no API: this reads
// the API's errors (docs/plans/signed-in-later.md).
import { ApiError } from '../../../api/client.ts'
import type { Asked, Sent } from './review-proposal.ts'

/**
 * Sophia's definite refusal: a 4xx it answered, unless it says to ask again under the same key or to sign in again
 * (a session that ended says nothing of the proposal).
 */
const refusal = (err: unknown): err is ApiError =>
  err instanceof ApiError &&
  err.status >= 400 &&
  err.status < 500 &&
  err.retry !== 'same_admission_key' &&
  err.retry !== 'reauthorize'

/**
 * What a failed proposal says. One whose outcome is unknown keeps its key and the request as it was sent: asking again
 * sends exactly that, so Sophia answers it as the same proposal, never as a different body under its key; only a
 * definite refusal lets the form start afresh (Codex on #107). A conflict under its key means Sophia already holds a
 * proposal sent under it: nothing is kept, and the board shows it.
 */
export function outcomeOf(err: unknown, asked: Asked): Sent {
  if (err instanceof ApiError && err.code === 'idempotency_conflict') {
    return { state: 'refused', said: 'Sophia already holds a proposal sent under this key: find it on the board.' }
  }
  if (refusal(err)) return { state: 'refused', said: err.message }
  const said =
    err instanceof ApiError && err.retry === 'reauthorize'
      ? 'Sign in again.'
      : err instanceof ApiError && err.status === 0
        ? 'No reply from Sophia.'
        : 'Sophia’s reply was unclear.'
  return { state: 'unanswered', said: `${said} Propose again to check; it is the same proposal.`, ...asked }
}
