// Notes on a goal, in its sheet (docs/plans/goal-notes.md): a field, its kind as one choice (Note · Difficulty ·
// Expected) and Add (also ⌘/Ctrl+Enter); under it the goal's notes, newest first. Where notes are off for the viewer,
// the ledger's reason instead of the field. A write keeps its key until the server answers; no reply offers the retry
// that reuses it.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type KeyboardEvent } from 'react'
import type { MissionContext, MissionEntry, MissionReceipt } from '@sophia/contracts'
import { Button, Segmented } from '@sophia/ui'
import { getMission, recordMissionEntry } from '../../api/mission.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import { Avatar } from '../../app/Avatar.tsx'
import type { Identity } from '../../app/dev-identity.ts'
import { ago } from '../../app/time-words.ts'
import { missionKey, writeControls } from '../mission/mission-view.ts'
import { goalNotes, NOTE_KINDS, noteAuthor, noteWord, type NoteKind } from './goal-notes.ts'

export interface NotesFor {
  projectId: string
  identity: Identity
  /** The viewer's actor id: their notes read «You». */
  me: string
  /** The names the Studio knows, by actor id. */
  names: ReadonlyMap<string, string>
}

/** The project's ledger, read once for Goals and its sheets: the brief's own query. */
export const useLedger = ({ projectId, identity }: Pick<NotesFor, 'projectId' | 'identity'>) =>
  useQuery({ queryKey: missionKey(projectId), queryFn: () => getMission(identity.token, projectId) })

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

function AddNote(where: Where) {
  const { goalId } = where
  const [text, setText] = useState('')
  const [kind, setKind] = useState<NoteKind>('observation')
  const write = useNoteWrite(where)
  const controls = writeControls(write.state.status)
  // Once kept, the field starts over as a plain note: a difficulty is chosen for each note, never carried to the next.
  const kept = () => {
    setText('')
    setKind('observation')
  }
  const save = async () => {
    if (!text.trim() || !controls.canSubmit) return
    if (await write.submit({ text: text.trim(), kind })) kept()
  }
  const retry = async () => {
    if (await write.retry()) kept()
  }
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
      {ledger.data ? (
        <Notes ctx={ledger.data} goalId={goalId} {...who} />
      ) : (
        <p className="goal-notes-none">{ledger.isError ? 'Notes can’t be read right now.' : 'Reading the notes…'}</p>
      )}
    </section>
  )
}
