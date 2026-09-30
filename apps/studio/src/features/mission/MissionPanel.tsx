// The compact mission view (M01 §9): the direction, constraints and lessons the team accepted, the one proposal waiting
// for a decision, the newest notes and whether Sophia keeps notes; behind one disclosure, the rest of the notes and the
// history of notes and decisions. It reads the same MissionContext Sophia reads by voice. It is not a form: nothing
// here must be typed for the conversation to work, and an empty field is one plain line, not an empty card. It
// refreshes with the project's events (the snapshot cursor) and after each write.
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { MissionContext, MissionReceipt } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import {
  getMission,
  decideMissionChange,
  proposeMissionChange,
  setNoteConsent,
  setNotePolicy,
} from '../../api/mission.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { authorLabel } from '../conversation/conversation-view.ts'
import {
  AGREED_KIND,
  citesLine,
  decidedBy,
  direction,
  missionKey,
  notesLine,
  OUTCOME,
  pendingFocus,
  PROPOSAL_KIND,
  writeControls,
} from './mission-view.ts'
import { AddNote, MoreNotes, NewestNotes } from './MissionNotes.tsx'

interface Props {
  projectId: string
  identity: Identity
  /** The snapshot's cursor: a new project event is a new read. */
  cursor: string | undefined
  me: string
  names: ReadonlyMap<string, string>
  onRevision?: (revision: number) => void
}

export function MissionPanel({ projectId, identity, cursor, me, names, onRevision }: Props) {
  const mission = useQuery({
    queryKey: [...missionKey(projectId), identity.name, cursor],
    queryFn: () => getMission(identity.token, projectId),
    placeholderData: keepPreviousData,
  })
  useEffect(() => {
    if (mission.data) onRevision?.(mission.data.ledgerRevision)
  }, [mission.data, onRevision])
  const [frozen, freeze] = useState<MissionContext | null>(null)
  const [editors, setEditors] = useState<ReadonlySet<string>>(new Set())
  const editing = (id: string, on: boolean) => {
    if (on && editors.size === 0 && mission.data) freeze(mission.data)
    const next = new Set(editors)
    if (on) next.add(id)
    else next.delete(id)
    setEditors(next)
    if (next.size === 0) freeze(null)
  }
  if (mission.isPending) return null
  // Unavailable is said as such: it is never shown as an empty mission.
  if (mission.isError) return <p className="mission muted">The mission couldn’t be read just now.</p>
  const ctx = frozen ?? mission.data
  const aim = direction(ctx)
  const parts = { ctx, projectId, identity, me, names, onEditing: editing }
  return (
    <section className="mission" aria-label="Mission">
      <p className="mission-direction">
        <span className="eyebrow">Direction</span>
        <span className={aim.accepted ? '' : 'muted'}>{aim.statement}</span>
        {aim.purpose && <span className="mission-purpose muted">{aim.purpose}</span>}
      </p>
      {ctx.capabilities.propose.available && (
        <EditDirection ctx={ctx} projectId={projectId} identity={identity} onEditing={editing} />
      )}
      {frozen && mission.data.ledgerRevision > frozen.ledgerRevision && (
        <p className="muted">
          The brief changed. Your edit is kept; review the latest version after saving or cancelling.
        </p>
      )}
      {ctx.constraints.length > 0 && (
        <ul className="mission-agreed" aria-label="Agreed constraints and lessons">
          {ctx.constraints.map((d) => (
            <li key={d.id}>
              <Tag tone="lav">{AGREED_KIND[d.kind]}</Tag> {d.statement}
            </li>
          ))}
        </ul>
      )}
      <PendingDecision {...parts} />
      <NewestNotes {...parts} />
      {ctx.capabilities.recordNote.available && <AddNote {...parts} />}
      <NoteConsent ctx={ctx} projectId={projectId} identity={identity} />
      <MoreNotes {...parts} decisions={<Decided ctx={ctx} me={me} names={names} />}>
        {ctx.capabilities.setNotePolicy.available && (
          <CaptureSwitch ctx={ctx} projectId={projectId} identity={identity} />
        )}
      </MoreNotes>
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

function useDirectionEdit({
  ctx,
  projectId,
  identity,
  onEditing,
}: {
  ctx: MissionContext
  projectId: string
  identity: Identity
  onEditing: (id: string, on: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const queryClient = useQueryClient()
  const write = useAdmission<string, MissionReceipt>(async (key, statement) => {
    const receipt = await proposeMissionChange(identity.token, projectId, key, {
      kind: 'mission',
      statement,
      purpose: ctx.mission?.purpose ?? null,
      destination: ctx.mission?.destination ?? null,
      origin: ctx.mission?.origin ?? null,
      supersedesDecisionId: ctx.mission?.decisionId ?? null,
    })
    await queryClient.invalidateQueries({ queryKey: missionKey(projectId) })
    return receipt
  })
  const controls = writeControls(write.state.status)
  const close = () => {
    setOpen(false)
    onEditing('direction', false)
  }
  const save = async () => {
    if (await write.submit(text.trim())) close()
  }
  const retry = async () => {
    if (await write.retry()) close()
  }
  const begin = () => {
    setText(ctx.mission?.statement ?? '')
    setOpen(true)
    onEditing('direction', true)
  }
  return { open, text, setText, write, controls, close, save, retry, begin }
}

function EditDirection({
  ctx,
  projectId,
  identity,
  onEditing,
}: {
  ctx: MissionContext
  projectId: string
  identity: Identity
  onEditing: (id: string, on: boolean) => void
}) {
  const { open, text, setText, write, controls, close, save, retry, begin } = useDirectionEdit({
    ctx,
    projectId,
    identity,
    onEditing,
  })
  if (!open)
    return (
      <button type="button" className="text-button" onClick={begin}>
        {ctx.mission ? 'Edit direction' : 'Add direction'}
      </button>
    )
  return (
    <div className="mission-edit">
      <label htmlFor="brief-direction">Direction</label>
      <textarea id="brief-direction" value={text} maxLength={2000} rows={3} onChange={(e) => setText(e.target.value)} />
      <p className="muted">Save proposes the direction for the team to accept.</p>
      <div className="control-row">
        <button
          type="button"
          className="pill"
          disabled={!text.trim() || !controls.canSubmit}
          onClick={() => void save()}
        >
          Save direction
        </button>
        <button type="button" className="text-button" disabled={!controls.canSubmit} onClick={close}>
          Cancel
        </button>
        {controls.canRetry && (
          <button type="button" className="text-button" onClick={() => void retry()}>
            Not confirmed: try again
          </button>
        )}
      </div>
      {write.state.status === 'rejected' && <p role="status">{write.state.error.message}</p>}
    </div>
  )
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
  const cites = citesLine(ctx, proposal)
  // After no reply only Try again (the same key) is offered: a fresh Accept could decide twice.
  const controls = writeControls(decide.state.status)
  const choose = (decision: Choice['decision']) =>
    void decide.submit({ proposalId: proposal.id, revision: proposal.revision, decision })
  return (
    <div className="mission-pending">
      <span className="eyebrow">{PROPOSAL_KIND[proposal.kind]}</span>
      <p>{proposal.statement}</p>
      {cites && <p className="muted">{cites}</p>}
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
            disabled={!controls.canSubmit || proposal.stale}
            onClick={() => choose('accept')}
          >
            Accept
          </button>
          <button type="button" className="pill" disabled={!controls.canSubmit} onClick={() => choose('reject')}>
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

/** The newest decided proposals: what each was, what became of it, and who decided it where. */
function Decided({ ctx, me, names }: Pick<PartProps, 'ctx' | 'me' | 'names'>) {
  if (ctx.decided.length === 0) return null
  return (
    <ol className="mission-notes history" aria-label="Decided proposals">
      {ctx.decided.map((d) => {
        const by = decidedBy(d, me, names)
        return (
          <li key={d.id} className="mission-note">
            <Tag tone={d.state === 'accepted' ? 'teal' : 'muted'}>{OUTCOME[d.state]}</Tag>
            <span>
              {AGREED_KIND[d.kind]}: {d.statement}
            </span>
            {by && <span className="muted">{by}</span>}
          </li>
        )
      })}
    </ol>
  )
}

type PolicyProps = Omit<PartProps, 'me' | 'names'>

/** A note-policy write: its refusal is shown beside the control, and the mission is read again either way. */
function usePolicyWrite(projectId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
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
  return { change, error }
}

/** Whether Sophia keeps notes for this person, and their own choice: as easy to take back as to give. */
function NoteConsent({ ctx, projectId, identity }: PolicyProps) {
  const { change, error } = usePolicyWrite(projectId)
  const line = notesLine(ctx.notePolicy)
  const accepted = ctx.notePolicy.consent === 'accepted'
  const choose = () => change(() => setNoteConsent(identity.token, projectId, accepted ? 'declined' : 'accepted'))
  return (
    <div className="mission-policy">
      <Tag tone={line.tone}>Notes</Tag>
      <span>{line.text}</span>
      <button type="button" className="text-button" onClick={() => void choose()}>
        {accepted ? 'Keep no notes from my turns' : 'Agree to notes from my turns'}
      </button>
      {error && <Tag tone="rose">{error}</Tag>}
    </div>
  )
}

/** An admin's switch for the whole project, kept behind the disclosure: whether Sophia keeps notes by voice at all. */
function CaptureSwitch({ ctx, projectId, identity }: PolicyProps) {
  const { change, error } = usePolicyWrite(projectId)
  const off = ctx.notePolicy.capture === 'off'
  const flip = () =>
    change(() =>
      setNotePolicy(identity.token, projectId, {
        capture: off ? 'automatic' : 'off',
        expectedRevision: ctx.notePolicy.revision,
      }),
    )
  return (
    <div className="mission-policy">
      <span>{off ? 'Note capture is off for everyone here.' : 'Note capture is on for members who agree.'}</span>
      <button type="button" className="text-button" onClick={() => void flip()}>
        {off ? 'Turn note capture on' : 'Turn note capture off'}
      </button>
      {error && <Tag tone="rose">{error}</Tag>}
    </div>
  )
}
