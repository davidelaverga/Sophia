import { useQuery } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client.ts'
import {
  getBuildReview,
  gitShaPattern,
  parseVerificationInput,
  sendBuildVerification,
  verificationOutcomes,
  type BuildReviewScope,
  type VerificationInput,
  type VerificationReceipt,
  type VerificationReview,
} from '../../api/explore-build-handoff.ts'
import { Mark } from '../../app/Mark.tsx'
import { HomeLink } from '../../app/SignIn.tsx'
import { VerificationTarget, verificationKindLabel } from './BuildVerificationEvidence.tsx'
import { useExploreAdmission } from './useExploreAdmission.ts'
import './build-review.css'

interface Props {
  scope: BuildReviewScope
  account: string
  onSignOut: () => Promise<boolean>
}

const MAX_OBSERVATION_CHARACTERS = 2000
// HTML limits count UTF-16 units. Check the text itself in Unicode code points to match the API.
const MAX_OBSERVATION_UNITS = 2 * MAX_OBSERVATION_CHARACTERS

const accessRefused = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404)

function evidenceLink(value: string) {
  if (!value) return true
  if (value.length > 500 || !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/[A-Za-z0-9._/%~:+-]*)?$/u.test(value))
    return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function formText(data: FormData, name: string): string {
  const value = data.get(name)
  return typeof value === 'string' ? value.trimEnd() : ''
}

function deploymentObservations(data: FormData, review: VerificationReview, outcome: VerificationInput['outcome']) {
  const mappingSourceSha = formText(data, 'mappingSourceSha').trim().toLowerCase() || undefined
  const observedDeployedSha = formText(data, 'observedDeployedSha').trim().toLowerCase() || undefined
  const observedDeploymentReference = formText(data, 'observedDeploymentReference').trim() || undefined
  if (
    [mappingSourceSha, observedDeployedSha].some((sha) => sha && !gitShaPattern.test(sha)) ||
    !evidenceLink(observedDeploymentReference ?? '')
  )
    return null
  if (
    outcome === 'passed' &&
    (mappingSourceSha !== review.target.mergeSha ||
      observedDeployedSha !== review.target.deployedSha ||
      observedDeploymentReference !== review.target.deploymentReference)
  )
    return null
  return { mappingSourceSha, observedDeployedSha, observedDeploymentReference }
}

function reviewFields(data: FormData, review: VerificationReview): VerificationInput | null {
  const scenario = formText(data, 'scenario')
  const expected = formText(data, 'expected')
  const observed = formText(data, 'observed')
  const result = formText(data, 'outcome')
  const outcome = verificationOutcomes.find((option) => option === result)
  const evidenceReference = formText(data, 'evidenceReference').trim() || undefined
  if (
    !outcome ||
    [scenario, expected, observed].some(
      (text) => !text.trim() || Array.from(text).length > MAX_OBSERVATION_CHARACTERS,
    ) ||
    !evidenceLink(evidenceReference ?? '')
  ) {
    return null
  }
  const deployment = review.kind === 'deployed_app' ? deploymentObservations(data, review, outcome) : {}
  if (deployment === null) return null
  return parseVerificationInput({
    ...deployment,
    expectedRevision: review.revision,
    returnId: review.target.returnId,
    kind: review.kind,
    outcome,
    scenario,
    expected,
    observed,
    evidenceReference,
  })
}

function useBuildReview({ scope, account }: Pick<Props, 'scope' | 'account'>) {
  const read = useQuery({
    queryKey: [
      'explore-build-verification',
      account,
      scope.projectId,
      scope.sessionId,
      scope.approvalId,
      scope.returnId,
    ],
    queryFn: ({ signal }) => getBuildReview(scope, signal),
    retry: false,
    gcTime: 0,
  })
  const controller = useRef<AbortController | null>(null)
  useLayoutEffect(() => () => controller.current?.abort(), [scope.token])
  const write = useExploreAdmission(
    {
      account,
      part: 'managed-explore',
      project: JSON.stringify(['build-review', scope.projectId, scope.sessionId, scope.approvalId, scope.returnId]),
    },
    parseVerificationInput,
    async (key, input) => {
      const pending = new AbortController()
      controller.current = pending
      try {
        return await sendBuildVerification(scope, input, key, pending.signal)
      } finally {
        if (controller.current === pending) controller.current = null
        if (!pending.signal.aborted) void read.refetch()
      }
    },
  )
  return { read, write, cancel: () => controller.current?.abort() }
}
type ReviewState = ReturnType<typeof useBuildReview>

export function BuildReview({ scope, account, onSignOut }: Props) {
  const review = useBuildReview({ scope, account })
  const [signingOut, setSigningOut] = useState(false)
  const [signOutFailed, setSignOutFailed] = useState(false)
  const signOut = async () => {
    setSigningOut(true)
    if (!(await onSignOut())) {
      setSigningOut(false)
      setSignOutFailed(true)
    }
  }
  return (
    <main className="build-review" data-content>
      <header className="build-review-header">
        <div className="build-review-brand">
          <Mark />
          <span>Sophia</span>
        </div>
        <button type="button" className="text-button" disabled={signingOut} onClick={() => void signOut()}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </header>
      {signOutFailed && <p role="status">Sign-out did not finish. Try again.</p>}
      <h1>Build review</h1>
      {!signingOut && <ReviewContent {...review} />}
      <nav aria-label="Leave Build review">
        <HomeLink />
      </nav>
    </main>
  )
}

function ReviewContent({ read, write, cancel }: ReviewState) {
  if (accessRefused(read.error) || (write.state.status === 'rejected' && accessRefused(write.state.error))) {
    return <p role="status">This Build return is unavailable to this account.</p>
  }
  if (read.isPending) return <p role="status">Checking review access…</p>
  if (read.isError) {
    return (
      <p role="status">
        The Build review could not be loaded.{' '}
        <button type="button" className="text-button" onClick={() => void read.refetch()}>
          Check again
        </button>
      </p>
    )
  }
  return (
    <section className="build-review-content" aria-label={verificationKindLabel[read.data.kind]}>
      <h2>{verificationKindLabel[read.data.kind]}</h2>
      <VerificationTarget target={read.data.target} />
      <VerificationForm
        review={read.data}
        disabled={read.isFetching || write.state.status === 'sending' || write.state.status === 'unknown'}
        saved={write.state.status === 'done' ? write.state.result : null}
        onSave={(input) => void write.submit(input)}
      />
      <ReviewNotice write={write} cancel={cancel} disabled={read.isFetching} />
    </section>
  )
}

function ReviewNotice({ write, cancel, disabled }: Pick<ReviewState, 'write' | 'cancel'> & { disabled: boolean }) {
  if (write.state.status === 'sending') {
    return (
      <p role="status">
        Saving verification…{' '}
        <button type="button" className="text-button" onClick={cancel}>
          Stop waiting
        </button>
      </p>
    )
  }
  if (write.state.status === 'unknown') {
    return (
      <p role="status">
        Sophia hasn’t confirmed the save.{' '}
        <button type="button" className="text-button" disabled={disabled} onClick={() => void write.retry()}>
          Retry same request
        </button>
      </p>
    )
  }
  if (write.state.status === 'rejected') {
    return (
      <p role="status">
        {write.state.error.status === 409
          ? 'The Build return changed or this evidence already exists. Check the current return before saving again.'
          : 'The verification could not be saved. Check your observations and try again.'}
      </p>
    )
  }
  return null
}

function VerificationForm({
  review,
  disabled,
  saved,
  onSave,
}: {
  review: VerificationReview
  disabled: boolean
  saved: VerificationReceipt | null
  onSave: (input: VerificationInput) => void
}) {
  const [invalid, setInvalid] = useState(false)
  const [ready, setReady] = useState(false)
  if (saved) return <p role="status">Verification saved · {saved.outcome}</p>
  return (
    <form
      className="build-review-form"
      onInput={(event) => setReady(event.currentTarget.checkValidity())}
      onSubmit={(event) => {
        event.preventDefault()
        if (disabled) return
        const input = reviewFields(new FormData(event.currentTarget), review)
        setInvalid(input === null)
        if (input) onSave(input)
      }}
    >
      <h3>Record verification</h3>
      <OutcomeField />
      <ObservationFields />
      {review.kind === 'deployed_app' && <DeploymentFields />}
      <label>
        Evidence URL (optional)
        <span className="field">
          <input name="evidenceReference" type="url" maxLength={500} />
        </span>
      </label>
      {invalid && (
        <p role="status">
          {review.kind === 'deployed_app' && 'To pass, the measured deployment identities must match the return. '}
          Keep each observation within 2,000 characters. If adding evidence, use an HTTPS URL without credentials, a
          query or a fragment.
        </p>
      )}
      <button type="submit" className="pill primary" disabled={disabled || !ready}>
        Save verification
      </button>
    </form>
  )
}

function DeploymentFields() {
  return (
    <fieldset className="build-review-measurements">
      <legend>Measured deployment identities</legend>
      <p>All three are required for a passing check.</p>
      <label>
        Mapped source commit
        <span className="field">
          <input name="mappingSourceSha" maxLength={64} />
        </span>
      </label>
      <label>
        Observed deployed commit
        <span className="field">
          <input name="observedDeployedSha" maxLength={64} />
        </span>
      </label>
      <label>
        Observed deployment URL
        <span className="field">
          <input name="observedDeploymentReference" type="url" maxLength={500} />
        </span>
      </label>
    </fieldset>
  )
}

function OutcomeField() {
  return (
    <label>
      Outcome
      <span className="field">
        <select name="outcome" defaultValue="" required>
          <option value="" disabled>
            Choose an outcome
          </option>
          {verificationOutcomes.map((outcome) => (
            <option key={outcome} value={outcome}>
              {outcome[0]?.toUpperCase()}
              {outcome.slice(1)}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}

function ObservationFields() {
  return (
    <>
      <label>
        Role and scenario
        <span className="field">
          <input name="scenario" maxLength={MAX_OBSERVATION_UNITS} required />
        </span>
      </label>
      <label>
        Expected behavior
        <span className="field">
          <textarea name="expected" maxLength={MAX_OBSERVATION_UNITS} rows={3} required />
        </span>
      </label>
      <label>
        Observed behavior
        <span className="field">
          <textarea name="observed" maxLength={MAX_OBSERVATION_UNITS} rows={3} required />
        </span>
      </label>
    </>
  )
}
