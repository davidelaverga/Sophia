// What a refused or lost personal write says, in words a person can act on. Database wording never reaches the page.
import { ApiError } from '../../api/client.ts'

const MOVED_ON = new Set(['stale_revision', 'invalid_state', 'not_found', 'request_erased'])

/**
 * A refusal saying the space moved on since it was read: another tab or a second press got there first, what the write
 * acts on is gone, or the person erased the space since (request_erased: that write is gone for good).
 */
export const movedOn = (err: unknown): boolean => err instanceof ApiError && MOVED_ON.has(err.code)

/** The space is read again after this failure: it moved on, or no answer came back and it may have changed. */
export const readsAgain = (err: unknown): boolean =>
  movedOn(err) || (err instanceof ApiError && err.code === 'outcome_unknown')

export function personalFailure(err: unknown): string {
  if (!(err instanceof ApiError)) return 'That didn’t go through. Try again.'
  if (err.code === 'request_erased') return 'Your personal space was erased. This is how it is now.'
  if (movedOn(err)) return 'That changed a moment ago. This is how it is now.'
  switch (err.code) {
    case 'outcome_unknown':
      return 'No answer came back. This is how it is now.'
    case 'unavailable':
      return err.message
    case 'forbidden':
      return 'That isn’t yours to change here.'
    default:
      return 'That didn’t go through. Try again.'
  }
}

/** How a message that didn't go stands: erased with the space, maybe sent (no answer came back), or not sent. */
export type Unsent = 'erased' | 'unconfirmed' | 'unsent'

export function unsent(err: unknown): Unsent {
  if (err instanceof ApiError && err.code === 'request_erased') return 'erased'
  if (err instanceof ApiError && err.code === 'outcome_unknown') return 'unconfirmed'
  return 'unsent'
}
