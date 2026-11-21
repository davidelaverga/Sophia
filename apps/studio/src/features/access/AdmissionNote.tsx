// An admission's outcome in words, for the Invite sheet's forms: its refusal, or an unanswered request with its
// retry. The retry reuses the request's key, so it can never make a second one.
import type { AdmissionState } from '../../api/useAdmission.ts'

/** An unanswered request, in words: its retry goes beside it, or (Home's first run) is the form's own press. */
export const NO_REPLY = 'Sophia didn’t answer.'

export function AdmissionNote<A, R>({ state, onRetry }: { state: AdmissionState<A, R>; onRetry: () => void }) {
  if (state.status === 'rejected') return <>{state.error.message}</>
  if (state.status !== 'unknown') return null
  return (
    <>
      {NO_REPLY}{' '}
      <button type="button" className="text-button" onClick={onRetry}>
        Try again
      </button>
    </>
  )
}
