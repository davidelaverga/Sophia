// Notes on a goal, in its sheet (docs/plans/goal-notes.md): a field, its kind as one choice (Note · Difficulty ·
// Expected) and Add (also ⌘/Ctrl+Enter); under it the goal's notes, newest first. Where notes are off for the viewer,
// the ledger's reason instead of the field. A write keeps its key until the server answers; no reply offers the retry
// that reuses it.
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type KeyboardEvent } from 'react'
import type { MissionContext, MissionEntry, MissionReceipt } from '@sophia/contracts'
import { Button, Segmented } from '@sophia/ui'
import { getMission, recordMissionEntry } from '../../api/mission.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import { Avatar } from '../../app/Avatar.tsx'
import type { Identity } from '../../app/dev-identity.ts'
import { ago } from '../../app/time-words.ts'
import { missionKey, writeControls } from '../mission/mission-view.ts'
import { goalNotes, keptAfter, NOTE_KINDS, noteAuthor, notesRead, noteWord, type NoteKind } from './goal-notes.ts'

export interface NotesFor {
  projectId: string
  identity: Identity
  /** The viewer's actor id: their notes read «You». */
  me: string
  /** The names the Studio knows, by actor id. */
  names: ReadonlyMap<string, string>
  /** The snapshot's cursor: a project event (a note written elsewhere) is a new read, as the brief's (Codex P1 on #305). */
  cursor: string | undefined
}

/**
 * The project's ledger, read once for Goals and its sheets: the brief's own query, keyed as the brief keys it (the
 * viewer, the snapshot's cursor), so a note written elsewhere is read as the project moves; the last read stays while
 * the next one comes.
 */
export const useLedger = ({ projectId, identity, cursor }: Pick<NotesFor, 'projectId' | 'identity' | 'cursor'>) =>
  useQuery({
    queryKey: [...missionKey(projectId), identity.name, cursor],
    queryFn: () => getMission(identity.token, projectId),
    placeholderData: keepPreviousData,
  })

type Where = { goalId: string } & Pick<NotesFor, 'projectId' | 'identity'>

/** A note's write on the goal, under its key until answered; the ledger read again whatever the answer. */
function useNoteWrite({ goalId, projectId, identity }: Where) {
  const queryClient = useQueryClient()
  return useAdmission<{ text: string; kind: NoteKind }, MissionReceipt>(async (key, note) => {
    try {
      return await recordMissionEntry(identity.token, projectId, key, {
        kind: note.kind,
        epistemic: 'reported',
        text: note.text,
        goalId,
      })
    } finally {
      void queryClient.invalidateQueries({ queryKey: missionKey(projectId) })
    }
  })
}

/**
 * The field's words and kind, and its write. Once kept, the field starts over as a plain note: a difficulty is chosen
 * for each note, never carried to the next. Only what was sent is cleared: words typed or a kind chosen while it went
 * stay (notes-robust.md).
 */
function useAddNote(where: Where) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<NoteKind>('observation')
  const write = useNoteWrite(where)
  const controls = writeControls(write.state.status)
  const now = useRef({ text, kind })
  now.current = { text, kind }
  const kept = (sent: { text: string; kind: NoteKind }) => {
    const next = keptAfter(now.current, sent)
    setText(next.text)
    setKind(next.kind)
  }
  const save = async () => {
    if (!text.trim() || !controls.canSubmit) return
    const sent = { text: text.trim(), kind }
    if (await write.submit(sent)) kept(sent)
  }
  const retry = async () => {
    const sent = write.state.status === 'unknown' ? write.state.args : null
    if ((await write.retry()) && sent) kept(sent)
  }
  return { text, setText, kind, setKind, write, controls, save, retry }
}

function AddNote(where: Where) {
  const { goalId } = where
  const { text, setText, kind, setKind, write, controls, save, retry } = useAddNote(where)
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
    e.preventDefault()
    void save()
  }
  return (
    <div className="goal-note-field">
      <label className="sr-only" htmlFor={`goal-note-${goalId}`}>
        A note on this goal
      </label>
      <textarea
        id={`goal-note-${goalId}`}
        rows={2}
        maxLength={2000}
        value={text}
        placeholder="Add a note on this goal…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="goal-note-tools">
        <Segmented
          role="radiogroup"
          label="Kind of note"
          size="sm"
          items={NOTE_KINDS}
          value={kind}
          onChange={setKind}
        />
        <span className="goal-note-send">
          {controls.canRetry && (
            <Button kind="text" onClick={() => void retry()}>
              Not confirmed: try again
            </Button>
          )}
          {write.state.status === 'rejected' && <span className="goal-note-refused">{write.state.error.message}</span>}
          <Button kind="primary" size="sm" disabled={!text.trim() || !controls.canSubmit} onClick={() => void save()}>
            Add
          </Button>
        </span>
      </div>
    </div>
  )
}

function Note({
  entry,
  now,
  ...who
}: { entry: MissionEntry; now: number } & Pick<NotesFor, 'me' | 'names' | 'identity'>) {
  const author = noteAuthor(entry, who.me, who.names)
  const word = noteWord(entry.kind)
  const face = author === 'You' ? (who.identity.displayName ?? who.identity.name) : author
  return (
    <li data-kind={entry.kind}>
      <Avatar
        identity={{
          name: face,
          displayName: face,
          avatarUrl: author === 'You' ? (who.identity.avatarUrl ?? null) : null,
        }}
      />
      <div className="goal-note-words">
        <p className="goal-note-head">
          <span className="goal-note-author">{author}</span>
          {word && <span className="goal-note-kind">{word}</span>}
          <span className="goal-note-when">{ago(entry.recordedAt, now)}</span>
        </p>
        <p className="goal-note-text">{entry.text}</p>
      </div>
    </li>
  )
}

function Notes({ ctx, goalId, ...who }: { ctx: MissionContext; goalId: string } & NotesFor) {
  const notes = goalNotes(ctx.entries, goalId)
  const now = Date.now()
  const write = ctx.capabilities.recordNote
  return (
    <>
      {write.available ? (
        <AddNote goalId={goalId} projectId={who.projectId} identity={who.identity} />
      ) : (
        <p className="goal-notes-off">{write.reason ?? 'Notes can’t be added here.'}</p>
      )}
      {notes.length === 0 ? (
        <p className="goal-notes-none">No notes yet.</p>
      ) : (
        <ol className="goal-notes">
          {notes.map((entry) => (
            <Note key={entry.id} entry={entry} now={now} me={who.me} names={who.names} identity={who.identity} />
          ))}
        </ol>
      )}
    </>
  )
}

export function GoalNotes({ goalId, ...who }: { goalId: string } & NotesFor) {
  const ledger = useLedger(who)
  return (
    <section className="goal-sheet-section" aria-label="Notes">
      <h3 className="field-label">Notes</h3>
      {notesRead(ledger) === 'stale' && (
        // A note kept, its list then unread: said, with the way to read it again; the last list stays (notes-robust.md).
        <p className="goal-notes-off" role="alert">
          The notes couldn’t be read again.{' '}
          <button type="button" className="text-button" onClick={() => void ledger.refetch()}>
            Try again
          </button>
        </p>
      )}
      {ledger.data ? (
        <Notes ctx={ledger.data} goalId={goalId} {...who} />
      ) : (
        <p className="goal-notes-none">{ledger.isError ? 'Notes can’t be read right now.' : 'Reading the notes…'}</p>
      )}
    </section>
  )
}
