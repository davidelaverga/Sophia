// The compact mission view (M01 §9): the direction the team accepted, the one proposal waiting for a decision, the
// newest notes and whether Sophia keeps notes, on the same MissionContext Sophia reads by voice. It is not a form:
// nothing here must be typed for the conversation to work, and an empty field is one plain line, not an empty card.
// It refreshes with the project's events (the snapshot cursor) and after each write.
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { MissionContext, MissionReceipt } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import { getMission, decideMissionChange, setNoteConsent, setNotePolicy } from '../../api/mission.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { authorLabel } from '../conversation/conversation-view.ts'
import { direction, missionKey, notesLine, pendingFocus, PROPOSAL_KIND } from './mission-view.ts'
import { MissionNotes } from './MissionNotes.tsx'

interface Props {
  projectId: string
  identity: Identity
  /** The snapshot's cursor: a new project event is a new read. */
  cursor: string | undefined
  me: string
  names: ReadonlyMap<string, string>
}

export function MissionPanel({ projectId, identity, cursor, me, names }: Props) {
  const mission = useQuery({
    queryKey: [...missionKey(projectId), identity.name, cursor],
    queryFn: () => getMission(identity.token, projectId),
    placeholderData: keepPreviousData,
  })
  if (mission.isPending) return null
  // Unavailable is said as such: it is never shown as an empty mission.
  if (mission.isError) return <p className="mission muted">The mission couldn’t be read just now.</p>
  const ctx = mission.data
  const aim = direction(ctx)
  return (
    <section className="mission" aria-label="Mission">
      <p className="mission-direction">
        <span className="eyebrow">Direction</span>
        <span className={aim.accepted ? '' : 'muted'}>{aim.statement}</span>
        {aim.purpose && <span className="muted">{aim.purpose}</span>}
      </p>
      <PendingDecision ctx={ctx} projectId={projectId} identity={identity} me={me} names={names} />
      <MissionNotes ctx={ctx} projectId={projectId} identity={identity} me={me} names={names} />
      <NotePolicy ctx={ctx} projectId={projectId} identity={identity} />
    </section>
  )
}

interface PartProps {
  ctx: MissionContext
  projectId: string
  identity: Identity
  me: string
  names: ReadonlyMap<string, string>
}

interface Choice {
  proposalId: string
  revision: number
  decision: 'accept' | 'reject'
}

/** The newest pending proposal, who proposed it, and the member's own Accept or Reject when they may decide. */
function PendingDecision({ ctx, projectId, identity, me, names }: PartProps) {
  const queryClient = useQueryClient()
  const decide = useAdmission<Choice, MissionReceipt>(async (key, c) => {
    try {
      return await decideMissionChange(identity.token, projectId, c.proposalId, key, {
        decision: c.decision,
        expectedRevision: c.revision,
      })
    } finally {
      void queryClient.invalidateQueries({ queryKey: missionKey(projectId) })
    }
  })
  const focus = pendingFocus(ctx)
  if (!focus) return null
  const { proposal, alternatives } = focus
  const busy = decide.state.status === 'sending'
  const choose = (decision: Choice['decision']) =>
    void decide.submit({ proposalId: proposal.id, revision: proposal.revision, decision })
  return (
    <div className="mission-pending">
      <span className="eyebrow">{PROPOSAL_KIND[proposal.kind]}</span>
      <p>{proposal.statement}</p>
      <p className="muted">
        Proposed by {authorLabel(proposal.proposedBy, me, names)}
        {alternatives > 0 ? `; ${String(alternatives)} other proposal${alternatives > 1 ? 's' : ''} pending` : ''}.
        {proposal.stale ? ' The accepted direction changed since; it can’t be accepted as it is.' : ''}
      </p>
      {ctx.capabilities.decide.available && (
        <div className="control-row">
          <button
            type="button"
            className="pill primary"
            disabled={busy || proposal.stale}
            onClick={() => choose('accept')}
          >
            Accept
          </button>
          <button type="button" className="pill" disabled={busy} onClick={() => choose('reject')}>
            Reject
          </button>
        </div>
      )}
      <p className="outcome" role="status" aria-live="polite">
        {decide.state.status === 'unknown' && (
          <>
            <Tag tone="amber">Not confirmed</Tag>
            <button type="button" className="text-button" onClick={() => void decide.retry()}>
              Try again
            </button>
          </>
        )}
        {decide.state.status === 'rejected' && <Tag tone="rose">{decide.state.error.message}</Tag>}
      </p>
    </div>
  )
}

/** Whether Sophia keeps notes for this person, their own choice, and an admin's switch for the project. */
function NotePolicy({ ctx, projectId, identity }: Omit<PartProps, 'me' | 'names'>) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const policy = ctx.notePolicy
  const line = notesLine(policy)
  const change = async (write: () => Promise<unknown>) => {
    setError(null)
    try {
      await write()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Not changed')
    } finally {
      void queryClient.invalidateQueries({ queryKey: missionKey(projectId) })
    }
  }
  const consent = (state: 'accepted' | 'declined') => change(() => setNoteConsent(identity.token, projectId, state))
  const capture = (on: boolean) =>
    change(() =>
      setNotePolicy(identity.token, projectId, {
        capture: on ? 'automatic' : 'off',
        expectedRevision: policy.revision,
      }),
    )
  return (
    <div className="mission-policy">
      <Tag tone={line.tone}>Notes</Tag>
      <span>{line.text}</span>
      <span className="control-row">
        {policy.consent === 'accepted' ? (
          <button type="button" className="text-button" onClick={() => void consent('declined')}>
            Keep no notes from my turns
          </button>
        ) : (
          <button type="button" className="text-button" onClick={() => void consent('accepted')}>
            Agree to notes from my turns
          </button>
        )}
        {ctx.capabilities.setNotePolicy.available && (
          <button type="button" className="text-button" onClick={() => void capture(policy.capture === 'off')}>
            {policy.capture === 'off' ? 'Turn note capture on' : 'Turn note capture off'}
          </button>
        )}
      </span>
      {error && <Tag tone="rose">{error}</Tag>}
    </div>
  )
}
