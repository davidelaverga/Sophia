// What a refused or lost personal write says, in words a person can act on. Database wording never reaches the page.
import { ApiError } from '../../api/client.ts'

/** A refusal saying the space moved on since it was read (another tab, a second press): it is read again. */
export const movedOn = (err: unknown): boolean =>
  err instanceof ApiError && (err.code === 'stale_revision' || err.code === 'invalid_state')

export function personalFailure(err: unknown): string {
  if (!(err instanceof ApiError)) return 'That didn’t go through. Try again.'
  if (movedOn(err)) return 'That changed a moment ago. This is how it is now.'
  switch (err.code) {
    case 'outcome_unknown':
      return 'No answer from Sophia. Nothing was lost: try again.'
    case 'unavailable':
      return err.message
    case 'forbidden':
      return 'That isn’t yours to change here.'
    default:
      return 'That didn’t go through. Try again.'
  }
}
