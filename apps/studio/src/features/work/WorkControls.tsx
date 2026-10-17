// work.stop / goal controls (frontend bindings: WorkControls → admitGoalCommand).
// A receipt means "sent", never "done": the goal's status changes when Sophia confirms. An unknown outcome
// offers a retry with the same key, so it can never be sent twice.
import { useQueryClient } from '@tanstack/react-query'
import type { Goal, Receipt } from '@sophia/contracts'
import { ConfirmButton, Tag, Tip } from '@sophia/ui'
import { admitGoalCommand, type ApiError } from '../../api/client.ts'
import { useAdmission, type AdmissionState } from '../../api/useAdmission.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import { COMMAND, commandsFor, type CommandKind } from './labels.ts'

interface Props {
  goal: Goal
  projectId: string
  identity: string
  token: string
  /** A project admin: only they are offered Retire remaining sessions (the API refuses anyone else, A41). */
  admin?: boolean
}

export function WorkControls({ goal, projectId, identity, token, admin = false }: Props) {
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
  const available = commandsFor(goal.status, admin)

  return (
    <div className="controls">
      <div className="control-row">
        {available.map((kind) =>
          kind === 'retire_sessions' ? (
            <RetireButton key={kind} disabled={busy} onConfirm={() => void admission.submit('retire_sessions')} />
          ) : kind === 'stop' ? (
            // Stopping is final, so it asks, says so, and waits: no timer takes the question away.
            <ConfirmButton
              key={kind}
              label="Stop"
              warning="Stopped goals can’t be resumed."
              confirm="Stop for good"
              keep="Keep working"
              className="text-button"
              // Its tip as Hold has its own: the destructive press says what it does too (Codex on #253).
              tip={COMMAND.stop.hint}
              // The last control, at the content's edge: its tip aligns to its end (Codex P2 on #253).
              tipAlign="end"
              disabled={busy}
              onConfirm={() => void admission.submit('stop')}
            />
          ) : (
            <button
              key={kind}
              type="button"
              // One filled press per goal (docs/plans/goal-controls-text.md): the rest are text, with their tips.
              className={kind === 'request_review' ? 'pill primary has-tip' : 'text-button has-tip'}
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

/** An owner's explicit fence for a completed goal's sessions (A41): it asks, says what stays, and waits. */
function RetireButton({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  return (
    <ConfirmButton
      label={COMMAND.retire_sessions.verb}
      warning="The goal stays completed and its review stays closed; nothing restarts. Whether a session was still busy, or its memory is freed, isn’t known."
      confirm="Retire the sessions"
      keep="Keep them"
      className="text-button"
      tip={COMMAND.retire_sessions.hint}
      tipAlign="end"
      disabled={disabled}
      onConfirm={onConfirm}
    />
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
  if (state.status === 'done' && state.args === 'retire_sessions') return <RetirementSent receipt={state.result} />
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

/**
 * What a retirement's admission says (A41): how many sessions were sent a stop, never that they stopped. Each one is
 * retired only when its runtime confirms, which this view doesn't read.
 */
function RetirementSent({ receipt }: { receipt: Receipt }) {
  const count = receipt.targets?.length ?? 0
  if (count === 0) {
    return (
      <>
        <Tag tone="teal">Sent</Tag>
        <span>No session was left to retire.</span>
      </>
    )
  }
  return (
    <>
      <Tag tone="teal">Sent</Tag>
      <span>
        Retirement requested for {count === 1 ? 'one session' : `${String(count)} sessions`}. Each is retired only when
        its runtime confirms; that isn’t shown here.
      </span>
    </>
  )
}
