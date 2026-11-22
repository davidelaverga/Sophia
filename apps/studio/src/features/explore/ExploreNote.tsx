import { useQuery } from '@tanstack/react-query'
import { useId, useRef } from 'react'
import type { MissionEntry } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { getExplorePreflight, parseExploreStart, startExplore, type ExploreScope } from '../../api/managed-explore.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { useExploreAdmission } from './useExploreAdmission.ts'
import { ExploreFundingDetails } from './ExploreFundingDetails.tsx'
import './managed-explore.css'

interface Props {
  entry: MissionEntry
  scope: ExploreScope
  account: string
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  onSession: (id: string) => void
}

export function ExploreNote({ open, onConfirm, ...props }: Props) {
  const opener = useRef<HTMLButtonElement>(null)
  const id = useId()
  return (
    <div className="explore-note">
      <button
        ref={opener}
        type="button"
        className="text-button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={open ? props.onCancel : onConfirm}
      >
        Explore with Codex
      </button>
      {open && (
        <ExplorePreflight
          {...props}
          id={id}
          onCancel={() => {
            props.onCancel()
            opener.current?.focus()
          }}
        />
      )}
    </div>
  )
}

type ConfirmationProps = Omit<Props, 'open' | 'onConfirm'> & { id: string }

function usePreflight({ account, scope, entry }: ConfirmationProps) {
  return useQuery({
    queryKey: ['explore-preflight', account, scope.projectId, entry.id, entry.ledgerRevision],
    queryFn: ({ signal }) => getExplorePreflight(scope, entry.id, entry.ledgerRevision, signal),
    retry: false,
    gcTime: 0,
  })
}

type Preflight = Awaited<ReturnType<typeof getExplorePreflight>>

const exactSeed = ({ seed }: Preflight, entry: MissionEntry) =>
  seed.entryId === entry.id &&
  seed.revision === entry.ledgerRevision &&
  seed.text === entry.text &&
  (!entry.sha256 || seed.sha256 === entry.sha256)

function PreflightUnavailable({ error, onBack, onCheck }: { error: unknown; onBack: () => void; onCheck: () => void }) {
  // The typed unavailable response is deliberately opaque, including when its generic API retry class is safe_read.
  const canCheck = error instanceof ApiError && error.retry === 'safe_read' && error.code !== 'unavailable'
  return (
    <>
      <p role="status">Explore is unavailable for this note.</p>
      <div className="control-row">
        {canCheck && (
          <button type="button" className="text-button" onClick={onCheck}>
            Check again
          </button>
        )}
        <button type="button" className="text-button" onClick={onBack}>
          Back to Brief
        </button>
      </div>
    </>
  )
}

function ExplorePreflight(props: ConfirmationProps) {
  const preflight = usePreflight(props)
  const slow = useSlow(preflight.isPending)
  return (
    <section id={props.id} className="explore-confirm" aria-label="Confirm the saved brief">
      {preflight.isPending && <p role="status">{slow ? SLOW_NOTE : 'Checking Explore availability…'}</p>}
      {preflight.isError && (
        <PreflightUnavailable
          error={preflight.error}
          onBack={props.onCancel}
          onCheck={() => void preflight.refetch()}
        />
      )}
      {preflight.isSuccess &&
        (exactSeed(preflight.data, props.entry) ? (
          <ConfirmedNote
            {...props}
            view={preflight.data}
            refresh={async () => {
              await preflight.refetch()
            }}
          />
        ) : (
          <p role="status">The saved brief changed. Reopen it to review the current note.</p>
        ))}
    </section>
  )
}

function ConfirmedNote({
  view,
  account,
  scope,
  entry,
  onSession,
  onCancel,
  refresh,
}: ConfirmationProps & { view: Preflight; refresh: () => Promise<void> }) {
  const { state, send, reset } = useExploreAdmission(
    { account, part: 'managed-explore', project: JSON.stringify([scope.projectId, 'seed', entry.id]) },
    parseExploreStart,
    (key, args) => startExplore(scope, args, key),
  )
  const { status } = state
  const waiting = useSlow(status === 'sending')
  const queueEffect = useId()
  const open = (sessionId: string) => {
    onSession(sessionId)
    onCancel()
  }
  const start = async () => {
    const receipt = await send({
      seedEntryId: view.seed.entryId,
      expectedSeedRevision: view.seed.revision,
      routeId: view.funding.routeId,
    })
    if (receipt) open(receipt.sessionId)
    else void refresh()
  }
  const resumeId = view.sessionId
  if (status === 'rejected')
    return <PreflightUnavailable error={state.error} onBack={onCancel} onCheck={() => void refresh().then(reset)} />
  return (
    <>
      <div className="explore-confirm-detail">
        <strong>{view.funding.label}</strong>
        <span className="muted">Saved note · revision {view.seed.revision}</span>
      </div>
      <blockquote>{view.seed.text}</blockquote>
      <ExploreFundingDetails funding={view.funding} />
      {status === 'unknown' && !resumeId && <p role="status">Checking whether Explore started.</p>}
      {waiting && <p role="status">{SLOW_NOTE}</p>}
      <ConfirmActions
        resumeId={resumeId}
        status={status}
        descriptionId={queueEffect}
        onResume={open}
        onStart={() => void start()}
        onCancel={onCancel}
      />
    </>
  )
}

function ConfirmActions({
  resumeId,
  status,
  descriptionId,
  onResume,
  onStart,
  onCancel,
}: {
  resumeId: string | null
  status: 'idle' | 'sending' | 'done' | 'unknown'
  descriptionId: string
  onResume: (id: string) => void
  onStart: () => void
  onCancel: () => void
}) {
  const sending = status === 'sending'
  return (
    <div className="explore-confirm-actions">
      {!resumeId && (
        <p className="muted" id={descriptionId}>
          Sends this brief to the Explore queue. Codex uses your OpenAI API credits when it runs.
        </p>
      )}
      <div className="control-row">
        {resumeId && !sending ? (
          <button type="button" className="pill primary" onClick={() => onResume(resumeId)}>
            Resume Explore
          </button>
        ) : (
          <button
            type="button"
            className="pill primary"
            disabled={sending}
            aria-describedby={resumeId ? undefined : descriptionId}
            onClick={onStart}
          >
            {sending ? 'Starting…' : status === 'unknown' ? 'Retry same start' : 'Start Explore'}
          </button>
        )}
        <button type="button" className="text-button" disabled={sending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
