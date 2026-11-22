import { useQuery } from '@tanstack/react-query'
import { useId, useRef } from 'react'
import type { MissionEntry } from '@sophia/contracts'
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

function ExplorePreflight(props: ConfirmationProps) {
  const preflight = usePreflight(props)
  const slow = useSlow(preflight.isPending)
  return (
    <section id={props.id} className="explore-confirm" aria-label="Confirm the saved brief">
      {preflight.isPending && <p role="status">{slow ? SLOW_NOTE : 'Checking Explore availability…'}</p>}
      {preflight.isError && (
        <p role="status">
          Explore is unavailable for this note.{' '}
          <button type="button" className="text-button" onClick={() => void preflight.refetch()}>
            Check again
          </button>
        </p>
      )}
      {preflight.isSuccess &&
        (exactSeed(preflight.data, props.entry) ? (
          <ConfirmedNote {...props} view={preflight.data} refresh={() => void preflight.refetch()} />
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
}: ConfirmationProps & { view: Preflight; refresh: () => void }) {
  const admission = useExploreAdmission(
    { account, part: 'managed-explore', project: JSON.stringify([scope.projectId, 'seed', entry.id]) },
    parseExploreStart,
    (key, args) => startExplore(scope, args, key),
  )
  const { status } = admission.state
  const waiting = useSlow(status === 'sending')
  const open = (sessionId: string) => {
    onSession(sessionId)
    onCancel()
  }
  const start = async () => {
    const receipt = await admission.send({
      seedEntryId: view.seed.entryId,
      expectedSeedRevision: view.seed.revision,
      routeId: view.funding.routeId,
    })
    if (receipt) open(receipt.sessionId)
    else refresh()
  }
  const resumeId = view.sessionId
  return (
    <>
      <div className="explore-confirm-detail">
        <strong>{view.funding.label}</strong>
        <span className="muted">Saved note · revision {view.seed.revision}</span>
      </div>
      <blockquote>{view.seed.text}</blockquote>
      <ExploreFundingDetails funding={view.funding} />
      {status === 'rejected' && <p role="status">{admission.state.error.message}</p>}
      {status === 'unknown' && !resumeId && <p role="status">Checking whether Explore started.</p>}
      {waiting && <p role="status">{SLOW_NOTE}</p>}
      <div className="control-row">
        {resumeId && status !== 'sending' ? (
          <button type="button" className="pill primary" onClick={() => open(resumeId)}>
            Resume Explore
          </button>
        ) : (
          <button type="button" className="pill primary" disabled={status === 'sending'} onClick={() => void start()}>
            {status === 'sending' ? 'Starting…' : status === 'unknown' ? 'Retry same start' : 'Start Explore'}
          </button>
        )}
        <button type="button" className="text-button" disabled={status === 'sending'} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  )
}
