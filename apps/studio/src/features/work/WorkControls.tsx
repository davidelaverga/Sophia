// work.stop / goal controls (frontend bindings: WorkControls → admitGoalCommand).
// A receipt means "admitted", never "done"; an unknown outcome offers a retry with the same key.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Goal, Receipt } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import { admitGoalCommand, type ApiError } from '../../api/client.ts'
import { useAdmission, type AdmissionState } from '../../api/useAdmission.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import { COMMAND, type CommandKind } from './labels.ts'

const ORDER: CommandKind[] = ['request_review', 'hold', 'resume', 'stop']
/** A pending Stop confirmation disappears after this, so a stray later click cannot stop work. */
const STOP_CONFIRM_MS = 5000

interface Props {
  goal: Goal
  projectId: string
  identity: string
  token: string
}

export function WorkControls({ goal, projectId, identity, token }: Props) {
  const queryClient = useQueryClient()
  const admission = useAdmission<CommandKind, Receipt>(async (key, kind) => {
    try {
      return await admitGoalCommand(token, projectId, key, {
        kind,
        goalId: goal.id,
        expectedGoalRevision: goal.revision,
        expectedAuthorityEpoch: goal.authorityEpoch,
        bodySourceId: null,
      })
    } finally {
      // Admitted or refused (e.g. stale revision), the goal on screen may be outdated.
      void queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity) })
    }
  })
  const busy = admission.state.status === 'sending'
  const available = ORDER.filter((kind) => COMMAND[kind].allowed.includes(goal.status))

  return (
    <div className="controls">
      <div className="control-row">
        {available.map((kind) =>
          kind === 'stop' ? (
            <StopButton key={kind} disabled={busy} onConfirm={() => void admission.submit('stop')} />
          ) : (
            <button
              key={kind}
              type="button"
              className={kind === 'request_review' ? 'primary' : undefined}
              disabled={busy}
              onClick={() => void admission.submit(kind)}
            >
              {COMMAND[kind].verb}
            </button>
          ),
        )}
      </div>
      <p className="outcome" role="status" aria-live="polite">
        <AdmissionOutcome state={admission.state} onRetry={() => void admission.retry()} />
      </p>
    </div>
  )
}

function StopButton({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return undefined
    const t = setTimeout(() => setConfirming(false), STOP_CONFIRM_MS)
    return () => clearTimeout(t)
  }, [confirming])

  if (!confirming) {
    return (
      <button type="button" className="quiet" disabled={disabled} onClick={() => setConfirming(true)}>
        Stop
      </button>
    )
  }
  return (
    <span className="confirm">
      <button
        type="button"
        className="danger"
        disabled={disabled}
        onClick={() => {
          setConfirming(false)
          onConfirm()
        }}
      >
        Confirm stop
      </button>
      <button type="button" className="quiet" onClick={() => setConfirming(false)}>
        Keep working
      </button>
    </span>
  )
}

function rejectionMessage(error: ApiError): string {
  if (error.code === 'stale_revision' || error.code === 'invalid_state') {
    return 'The goal changed meanwhile. Showing its current state.'
  }
  if (error.status === 403) return 'Your role can’t change this goal.'
  return error.message
}

function AdmissionOutcome({ state, onRetry }: { state: AdmissionState<CommandKind, Receipt>; onRetry: () => void }) {
  if (state.status === 'idle') return null
  if (state.status === 'sending') {
    return <span className="muted">Sending {COMMAND[state.args].noun.toLowerCase()}…</span>
  }
  if (state.status === 'done') {
    return (
      <>
        <Tag tone="teal">Admitted</Tag>
        <span>{COMMAND[state.args].noun} recorded</span>
        <span className="mono muted">#{state.result.cursor}</span>
      </>
    )
  }
  if (state.status === 'unknown') {
    return (
      <>
        <Tag tone="amber">Not confirmed</Tag>
        <span>Sophia didn’t answer. It may already be recorded.</span>
        <button type="button" className="text" onClick={onRetry}>
          Retry same request
        </button>
      </>
    )
  }
  // Narrowed to "rejected": a new status would fail to compile here (no `error` on it).
  return (
    <>
      <Tag tone="rose">Not admitted</Tag>
      <span>{rejectionMessage(state.error)}</span>
    </>
  )
}
