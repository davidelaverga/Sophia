// An admission's outcome in words, for the Invite sheet's forms: its refusal, or an unanswered request with its
// retry. The retry reuses the request's key, so it can never make a second one.
import type { AdmissionState } from '../../api/useAdmission.ts'

export function AdmissionNote<A, R>({ state, onRetry }: { state: AdmissionState<A, R>; onRetry: () => void }) {
  if (state.status === 'rejected') return <>{state.error.message}</>
  if (state.status !== 'unknown') return null
  return (
    <>
      Sophia didn’t answer.{' '}
      <button type="button" className="text-button" onClick={onRetry}>
        Try again
      </button>
    </>
  )
}
