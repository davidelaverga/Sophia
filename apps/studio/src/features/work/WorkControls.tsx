// work.stop / goal controls (frontend bindings: WorkControls → admitGoalCommand).
// A receipt means "sent", never "done": the goal's status changes when Sophia confirms. An unknown outcome
// offers a retry with the same key, so it can never be sent twice.
import { useQueryClient } from '@tanstack/react-query'
import type { Goal, Receipt } from '@sophia/contracts'
import { ConfirmButton, Tag, Tip } from '@sophia/ui'
import { admitGoalCommand, type ApiError } from '../../api/client.ts'
import { useAdmission, type AdmissionState } from '../../api/useAdmission.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import { COMMAND, type CommandKind } from './labels.ts'

const ORDER: CommandKind[] = ['request_review', 'hold', 'resume', 'stop']

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
      // Sent or refused (e.g. stale revision), the goal on screen may be outdated.
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
            // Stopping is final, so it asks, says so, and waits: no timer takes the question away.
            <ConfirmButton
              key={kind}
              label="Stop"
              warning="Stopped goals can’t be resumed."
              confirm="Stop for good"
              keep="Keep working"
              className="pill"
              disabled={busy}
              onConfirm={() => void admission.submit('stop')}
            />
          ) : (
            <button
              key={kind}
              type="button"
              className={kind === 'request_review' ? 'pill primary has-tip' : 'pill has-tip'}
              disabled={busy}
              onClick={() => void admission.submit(kind)}
            >
              {COMMAND[kind].verb}
              <Tip label={COMMAND[kind].hint} />
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
        <Tag tone="teal">Sent</Tag>
        <span>{COMMAND[state.args].requested}. The status changes when Sophia confirms.</span>
      </>
    )
  }
  if (state.status === 'unknown') {
    return (
      <>
        <Tag tone="amber">Not confirmed</Tag>
        <span>Sophia didn’t answer. It may already be recorded; trying again can’t send it twice.</span>
        <button type="button" className="text-button" onClick={onRetry}>
          Try again
        </button>
      </>
    )
  }
  // Narrowed to "rejected": a new status would fail to compile here (no `error` on it).
  return (
    <>
      <Tag tone="rose">Not accepted</Tag>
      <span>{rejectionMessage(state.error)}</span>
    </>
  )
}
