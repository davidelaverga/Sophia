import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useState } from 'react'
import {
  getExploreHandoff,
  mintExplorePreview,
  type ExploreAction,
  type ExploreApproval,
  type ExploreScope,
  type ExploreSession,
  type ExploreVersion,
} from '../../api/managed-explore.ts'
import { PrototypePreview } from './PrototypePreview.tsx'

interface Props {
  version: ExploreVersion
  session: ExploreSession
  scope: ExploreScope
  account: string
  contentOrigin: string
  disabled: boolean
  revisionBusy: boolean
  completed: ExploreAction | null
  onAction: (action: ExploreAction) => void
  onDiscussion: () => void
}

function ReviewList({ name, items }: { name: string; items: readonly string[] }) {
  if (!items.length) return null
  return (
    <section className="prototype-facts">
      <h4>{name}</h4>
      <ul>
        {items.map((item, i) => (
          <li key={`${String(i)}-${item}`}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

function Handoff({
  scope,
  account,
  sessionId,
  approval,
  version,
}: {
  scope: ExploreScope
  account: string
  sessionId: string
  approval: ExploreApproval
  version: ExploreVersion
}) {
  const read = useQuery({
    queryKey: ['explore-handoff', account, scope.projectId, sessionId, approval.id],
    queryFn: ({ signal }) => getExploreHandoff(scope, sessionId, approval, version, signal),
    retry: false,
    gcTime: 0,
  })
  if (read.isPending) return <p role="status">Opening the Build handoff…</p>
  if (read.isError)
    return (
      <p role="status">
        The Build handoff is unavailable.{' '}
        <button type="button" className="text-button" onClick={() => void read.refetch()}>
          Check again
        </button>
      </p>
    )
  const handoff = read.data
  return (
    <section className="prototype-handoff" aria-label="Build handoff">
      <h3>Build handoff</h3>
      <p>Use your signed-in Codex subscription for Build.</p>
      <blockquote>{handoff.seedText}</blockquote>
      <details>
        <summary>Approved version manifest digest</summary>
        <code>{handoff.manifestSha256}</code>
      </details>
      <details>
        <summary>Retained source file</summary>
        {handoff.files.map((file) => (
          <p key={file.path}>
            {file.path} · {file.byteCount.toLocaleString()} bytes
            <br /> <code>{file.sha256}</code>
          </p>
        ))}
      </details>
      <ReviewList name="Acceptance criteria" items={handoff.acceptanceCriteria} />
      <ReviewList name="Simulated behavior to replace" items={handoff.mockReplacements} />
      <ReviewList name="Open issues" items={handoff.limitations} />
    </section>
  )
}

function FeedbackForm({ version, session, disabled, revisionBusy, onAction, completed }: Props) {
  const [feedback, setFeedback] = useState('')
  const id = useId()
  useEffect(() => {
    if (
      completed?.type !== 'turn' ||
      completed.body.kind !== 'revision' ||
      completed.body.parentVersionId !== version.id
    )
      return
    setFeedback((current) => (current.trim() === completed.body.instruction ? '' : current))
  }, [completed, version.id])
  const requestChange = () => {
    const instruction = feedback.trim()
    if (!instruction || disabled || revisionBusy) return
    onAction({
      type: 'turn',
      body: {
        kind: 'revision',
        instruction,
        expectedSessionRevision: session.revision,
        directionId: version.directionId,
        parentVersionId: version.id,
      },
    })
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        requestChange()
      }}
    >
      <label htmlFor={id}>Feedback on v{version.number}</label>
      <textarea
        id={id}
        rows={2}
        maxLength={2000}
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
      />
      <button className="pill" type="submit" disabled={disabled || revisionBusy || !feedback.trim()}>
        Request a change
      </button>
    </form>
  )
}

function ApproveForm({
  version,
  session,
  disabled,
  onAction,
}: Pick<Props, 'version' | 'session' | 'disabled' | 'onAction'>) {
  const original = version.acceptanceCriteria.join('\n')
  const [criteria, setCriteria] = useState(original)
  const id = useId()
  const acceptanceCriteria =
    criteria === original
      ? version.acceptanceCriteria
      : criteria
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
  const valid =
    acceptanceCriteria.length > 0 &&
    acceptanceCriteria.length <= 40 &&
    acceptanceCriteria.every((line) => Array.from(line).length <= 1000)
  const approve = () => {
    if (disabled || !valid) return
    onAction({
      type: 'approve',
      body: {
        prototypeVersionId: version.id,
        expectedManifestDigest: version.manifestSha256,
        expectedSessionRevision: session.revision,
        acceptanceCriteria,
      },
    })
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        approve()
      }}
    >
      <label htmlFor={id}>Acceptance criteria for v{version.number}</label>
      <textarea
        id={id}
        rows={Math.max(2, Math.min(4, version.acceptanceCriteria.length))}
        maxLength={40_039}
        value={criteria}
        onChange={(event) => setCriteria(event.target.value)}
      />
      {acceptanceCriteria.length > 0 && !valid && (
        <p role="status">Use up to 40 criteria, each no more than 1,000 characters.</p>
      )}
      <button className="pill primary" type="submit" disabled={disabled || !valid}>
        Approve this version
      </button>
    </form>
  )
}

function Approved({
  approval,
  scope,
  account,
  session,
  version,
}: Pick<Props, 'scope' | 'account' | 'session' | 'version'> & { approval: ExploreApproval }) {
  const [showHandoff, setShowHandoff] = useState(false)
  return (
    <>
      <ReviewList name="Approved criteria" items={approval.acceptanceCriteria} />
      <button
        type="button"
        className="pill primary"
        aria-expanded={showHandoff}
        onClick={() => setShowHandoff((shown) => !shown)}
      >
        {showHandoff ? 'Close Build handoff' : 'Open in Build'}
      </button>
      {showHandoff && (
        <Handoff scope={scope} account={account} sessionId={session.id} approval={approval} version={version} />
      )}
    </>
  )
}

export function PrototypeReview(props: Props) {
  const { version, scope, session, contentOrigin, disabled, onDiscussion } = props
  const [ready, setReady] = useState(false)
  const { id: sessionId } = session
  const { projectId, token } = scope
  const mint = useCallback(
    (signal: AbortSignal) => mintExplorePreview({ projectId, token }, sessionId, version, signal),
    [projectId, token, sessionId, version],
  )
  const approval = session.approvals.find(
    ({ versionId, manifestSha256 }) => versionId === version.id && manifestSha256 === version.manifestSha256,
  )
  const parent = session.versions.find(({ id }) => id === version.parentVersionId)
  return (
    <section className="managed-prototype" aria-label={`Prototype version ${String(version.number)}`}>
      <header className="managed-prototype-head">
        <div>
          <button type="button" className="text-button explore-phone-back" onClick={onDiscussion}>
            Back to discussion
          </button>
          <h3>
            Prototype <span>v{version.number}</span>
          </h3>
        </div>
        {approval && <span className="explore-selected">Approved · v{version.number}</span>}
      </header>
      <PrototypePreview version={version} mint={mint} contentOrigin={contentOrigin} onFrame={setReady} />
      <div className="managed-prototype-review">
        <p>{version.changeSummary}</p>
        {parent && <p className="muted">Revised from v{parent.number}</p>}
        <ReviewList name="Simulated behavior to replace" items={version.mockReplacements} />
        <FeedbackForm {...props} />
        {approval ? (
          <Approved {...props} approval={approval} />
        ) : (
          <ApproveForm {...props} disabled={disabled || !ready} />
        )}
      </div>
    </section>
  )
}
