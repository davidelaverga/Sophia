// The mission's notes in the compact view: the newest few at rest, and behind one disclosure the older notes, the
// history of corrected and forgotten notes, an optional typed note and whatever else the panel keeps out of the way. A
// correction appends and supersedes; forgetting erases the note's text for everyone, with what was derived from it, so
// it asks first. Each write keeps its Idempotency-Key until the server answers.
import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import type { MissionContext, MissionEntry, MissionReceipt, MissionWithdrawalRequest } from '@sophia/contracts'
import { ConfirmButton, Tag } from '@sophia/ui'
import {
  correctMissionEntry,
  previewMissionWithdrawal,
  recordMissionEntry,
  withdrawMissionEntry,
} from '../../api/mission.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { authorLabel } from '../conversation/conversation-view.ts'
import {
  ENTRY_KIND,
  EPISTEMIC,
  historyText,
  isEntryKind,
  missionKey,
  noteActions,
  omittedLine,
  recentNotes,
  wording,
  forgetControls,
  forgetReach,
  forgetRefusal,
  writeControls,
} from './mission-view.ts'

interface Props {
  ctx: MissionContext
  projectId: string
  identity: Identity
  me: string
  names: ReadonlyMap<string, string>
}

/** The newest notes, shown at rest. */
export function NewestNotes(props: Props) {
  const recent = recentNotes(props.ctx)
  if (recent.length === 0) return null
  return (
    <ol className="mission-notes" aria-label="Newest notes">
      {recent.map((entry) => (
        <Note key={entry.id} entry={entry} {...props} />
      ))}
    </ol>
  )
}

interface MoreProps extends Props {
  /** The decisions' history, after the notes' own. */
  decisions?: ReactNode
  /** The panel's own extras, last. */
  children?: ReactNode
}

/** Behind one disclosure: the older notes, the history, an optional typed note, then the panel's own extras. */
export function MoreNotes({ decisions, children, ...props }: MoreProps) {
  const { ctx } = props
  const older = ctx.entries.slice(0, ctx.entries.length - recentNotes(ctx).length)
  const omitted = omittedLine(ctx)
  return (
    <details className="mission-more">
      <summary>All notes and history{older.length > 0 ? ` (${String(older.length)} more)` : ''}</summary>
      {older.length > 0 && (
        <ol className="mission-notes" aria-label="Older notes">
          {older.map((entry) => (
            <Note key={entry.id} entry={entry} {...props} />
          ))}
        </ol>
      )}
      {ctx.history.length > 0 && (
        <ol className="mission-notes history" aria-label="Corrected and forgotten notes">
          {ctx.history.map((entry) => (
            <li key={entry.id} className="mission-note muted">
              <Tag tone="muted">{entry.state === 'withdrawn' ? 'Forgotten' : 'Corrected'}</Tag> {historyText(entry)}
            </li>
          ))}
        </ol>
      )}
      {omitted && <p className="muted">{omitted}</p>}
      {decisions}
      {ctx.capabilities.recordNote.available && <AddNote {...props} />}
      {children}
    </details>
  )
}

function Note({ entry, ctx, projectId, identity, me, names }: Props & { entry: MissionEntry }) {
  const [editing, setEditing] = useState(false)
  const actions = noteActions(ctx, entry, me)
  return (
    <li className="mission-note">
      <span className="mission-note-meta">
        <Tag tone="lav">{ENTRY_KIND[entry.kind]}</Tag>
        <span className="muted">
          {EPISTEMIC[entry.epistemic]} · {wording(entry)} · {authorLabel(entry.actorId, me, names)}
        </span>
      </span>
      {editing ? (
        <CorrectNote entry={entry} projectId={projectId} identity={identity} onDone={() => setEditing(false)} />
      ) : (
        <span className="mission-note-text">{entry.text}</span>
      )}
      <span className="control-row">
        {actions.correct && !editing && (
          <button type="button" className="text-button" onClick={() => setEditing(true)}>
            Correct
          </button>
        )}
        {actions.withdraw && <Forget entry={entry} projectId={projectId} identity={identity} />}
      </span>
    </li>
  )
}

interface WriteProps {
  entry: MissionEntry
  projectId: string
  identity: Identity
}

function useMissionWrite<A>(projectId: string, send: (key: string, args: A) => Promise<MissionReceipt>) {
  const queryClient = useQueryClient()
  return useAdmission<A, MissionReceipt>(async (key, args) => {
    try {
      return await send(key, args)
    } finally {
      void queryClient.invalidateQueries({ queryKey: missionKey(projectId) })
    }
  })
}

/** After no reply: the write may have landed, so the only way on is the retry that reuses its key. */
function Unconfirmed({ onRetry }: { onRetry: () => void }) {
  return (
    <button type="button" className="text-button" onClick={onRetry}>
      Not confirmed: try again
    </button>
  )
}

function CorrectNote({ entry, projectId, identity, onDone }: WriteProps & { onDone: () => void }) {
  const [text, setText] = useState(entry.text ?? '')
  const write = useMissionWrite<string>(projectId, (key, corrected) =>
    correctMissionEntry(identity.token, projectId, entry.id, key, {
      kind: entry.kind,
      epistemic: entry.epistemic,
      text: corrected,
    }),
  )
  const controls = writeControls(write.state.status)
  const save = async () => {
    if (await write.submit(text.trim())) onDone()
  }
  const retry = async () => {
    if (await write.retry()) onDone()
  }
  return (
    <span className="mission-edit">
      <label className="sr-only" htmlFor={`correct-${entry.id}`}>
        Corrected note
      </label>
      <textarea
        id={`correct-${entry.id}`}
        rows={2}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" className="pill" disabled={!text.trim() || !controls.canSubmit} onClick={() => void save()}>
        Save correction
      </button>
      <button type="button" className="text-button" onClick={onDone}>
        Cancel
      </button>
      {controls.canRetry && <Unconfirmed onRetry={() => void retry()} />}
      {write.state.status === 'rejected' && <Tag tone="rose">{write.state.error.message}</Tag>}
    </span>
  )
}

/** What the Forget confirmation knows: nothing yet, the list the server returned, or that it could not be read. */
type Reach = { status: 'checking' } | { status: 'failed' } | ({ status: 'ready' } & ReturnType<typeof forgetReach>)

/** The confirmation's words: every version and every decision that goes, each with its own words. */
function ReachNote({ reach, onCheck }: { reach: Reach; onCheck: () => void }) {
  if (reach.status === 'checking') return <>Checking what goes with it…</>
  if (reach.status === 'failed') {
    return (
      <>
        Couldn’t check what goes with it, so it can’t be forgotten yet.{' '}
        <button type="button" className="text-button" onClick={onCheck}>
          Check again
        </button>
      </>
    )
  }
  // Every word that goes, unclipped: a long list scrolls inside the confirmation, above its buttons.
  return (
    <span className="forget-reach">
      <span className="forget-item">Forgetting erases, for everyone:</span>
      <span className="forget-list" role="region" aria-label="What forgetting erases" tabIndex={0}>
        {reach.items.map((item) => (
          <span key={item.id} className="forget-item">
            {item.text}
            {item.details.map((detail) => (
              <span key={detail} className="forget-detail">
                {detail}
              </span>
            ))}
          </span>
        ))}
      </span>
      <span className="forget-item">{reach.closing}</span>
    </span>
  )
}

function Forget({ entry, projectId, identity }: WriteProps) {
  const write = useMissionWrite<MissionWithdrawalRequest['expectedAffected']>(projectId, (key, expected) =>
    withdrawMissionEntry(identity.token, projectId, entry.id, key, expected),
  )
  const [reach, setReach] = useState<Reach>({ status: 'checking' })
  const controls = writeControls(write.state.status)
  const confirming = forgetControls(reach.status)
  // Asked when the member clicks Forget: the list is what goes at that moment, and the withdrawal carries it, so the
  // server refuses if anything else would go. Without the list there is nothing to confirm.
  const ask = () => {
    setReach({ status: 'checking' })
    void previewMissionWithdrawal(identity.token, projectId, entry.id).then(
      (preview) => setReach({ status: 'ready', ...forgetReach(preview) }),
      () => setReach({ status: 'failed' }),
    )
  }
  return (
    <>
      <ConfirmButton
        label="Forget"
        warning={<ReachNote reach={reach} onCheck={ask} />}
        confirm="Forget it"
        keep="Keep it"
        className="text-button"
        disabled={!controls.canSubmit}
        onAsk={ask}
        confirmDisabled={!confirming.canConfirm}
        onConfirm={() => {
          if (reach.status === 'ready') void write.submit(reach.expected)
        }}
      />
      {controls.canRetry && <Unconfirmed onRetry={() => void write.retry()} />}
      {write.state.status === 'rejected' && <Tag tone="rose">{forgetRefusal(write.state.error)}</Tag>}
    </>
  )
}

/** An optional typed note in the member's own words; talking is the primary way, this is the manual one. */
function AddNote({ projectId, identity }: Omit<Props, 'ctx' | 'me' | 'names'>) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<MissionEntry['kind']>('observation')
  const write = useMissionWrite<{ text: string; kind: MissionEntry['kind'] }>(projectId, (key, note) =>
    recordMissionEntry(identity.token, projectId, key, { kind: note.kind, epistemic: 'reported', text: note.text }),
  )
  const controls = writeControls(write.state.status)
  const save = async () => {
    if (await write.submit({ text: text.trim(), kind })) setText('')
  }
  const retry = async () => {
    if (await write.retry()) setText('')
  }
  return (
    <div className="mission-add">
      <label className="sr-only" htmlFor="mission-note-kind">
        Kind of note
      </label>
      <select
        id="mission-note-kind"
        className="pill"
        value={kind}
        onChange={(e) => {
          if (isEntryKind(e.target.value)) setKind(e.target.value)
        }}
      >
        {Object.entries(ENTRY_KIND).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="mission-note-text">
        A note in your own words
      </label>
      <textarea
        id="mission-note-text"
        rows={1}
        maxLength={2000}
        value={text}
        placeholder="A note in your own words (optional)"
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" className="pill" disabled={!text.trim() || !controls.canSubmit} onClick={() => void save()}>
        Add note
      </button>
      {controls.canRetry && <Unconfirmed onRetry={() => void retry()} />}
      {write.state.status === 'rejected' && <Tag tone="rose">{write.state.error.message}</Tag>}
    </div>
  )
}
