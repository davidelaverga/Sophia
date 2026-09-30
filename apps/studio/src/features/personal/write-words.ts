// What a refused or lost personal write says, in words a person can act on. Database wording never reaches the page.
import { ApiError } from '../../api/client.ts'

export function personalFailure(err: unknown): string {
  if (!(err instanceof ApiError)) return 'That didn’t go through. Try again.'
  switch (err.code) {
    case 'outcome_unknown':
      return 'No answer from Sophia. Nothing was lost: try again.'
    case 'unavailable':
      return err.message
    case 'stale_revision':
    case 'invalid_state':
      return 'That changed a moment ago. This is how it is now.'
    case 'forbidden':
      return 'That isn’t yours to change here.'
    default:
      return 'That didn’t go through. Try again.'
  }
}
