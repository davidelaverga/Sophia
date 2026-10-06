// A passage becomes a task (docs/plans/room-passage-task.md), through the proposed A17 (issue #105): the passage bar's
// «Task» opens a small form in the pane's foot, with the passage quoted, what needs doing and who it is for (me, anyone,
// or a member in the call; never a guest or Sophia). One key per Create (useAdmission); with no reply, only that same
// Create goes again. Created, the foot says for whom, with the way to the Tasks tab. Only under the vision flag.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { ApiError } from '../../api/client.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import { createTask, type ProjectTask, type TaskAsk } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { VISION } from '../../app/vision.ts'
import { canInvite, useMembership } from '../access/useAccess.ts'
import { keptText, type PassageSource } from './passage.ts'
import { ownerWords } from './task-view.ts'
import { taskRecorded } from './TaskList.tsx'

/** The passage a task is made from: its words, where they came from, and their place in that version. */
export interface TaskPassage {
  text: string
  source: PassageSource
  place: { artifactId: string; versionId: string; passage: string }
}

/** A member in the call it may be for: their actor id and the name the room knows. */
export interface TaskPerson {
  actorId: string
  name: string
}

const TEXT_MAX = 500

/** Nothing else has the focus: it fell to the page as the form went, or it is on the form or its line. */
const focusFree = () => {
  const at = document.activeElement
  return !at || at === document.body || !!at.closest('.task-form, .task-added')
}

const focusTitle = () => document.getElementById('report-pane-title')?.focus({ preventScroll: true })

/**
 * The Task press and what it opens: whether it is offered (editors and admins, under the flag, and not while a Create
 * is held), the form while a task is being made, and the line saying what the last Create did. The Create lives here,
 * not in the form: closing the form never drops an intent whose outcome isn't known, and a slow reply never lands in
 * another form.
 */
export function usePassageTask(props: {
  projectId: string
  identity: Identity
  people: readonly TaskPerson[]
  onSeeTasks: () => void
}) {
  const { projectId, identity } = props
  const me = useMembership(projectId, identity.name, identity.token).data
  const queryClient = useQueryClient()
  // The people it may be for are those in the call as the form opens: one who leaves stays the one shown and sent.
  const [asked, setAsked] = useState<{ passage: TaskPassage; n: number; people: readonly TaskPerson[] } | null>(null)
  const [added, setAdded] = useState<ProjectTask | null>(null)
  const line = useRef<HTMLParagraphElement>(null)
  const write = useCreate(
    (key, ask) => createTask(identity.token, projectId, key, ask),
    (task, ask) => {
      setAsked(null)
      setAdded(task)
      taskRecorded(queryClient, ask.from.artifactId, identity.name, task)
      // The press went with what it did, unless the person has gone on elsewhere (a slow reply, the form closed).
      requestAnimationFrame(() => focusFree() && line.current?.focus())
    },
  )
  const start = (passage: TaskPassage) => {
    if (!me || write.held) return
    write.reset()
    setAdded(null)
    const people = props.people.filter((p) => p.actorId !== me.actorId)
    setAsked((was) => ({ passage, n: (was?.n ?? 0) + 1, people }))
  }
  const node = (
    <>
      {asked && me && (
        <TaskForm
          key={asked.n}
          passage={asked.passage}
          me={me.actorId}
          people={asked.people}
          write={write}
          onClose={() => {
            setAsked(null)
            // A refusal goes with its form; only a Create with no reply stays, in the foot, with its Try again.
            if (!write.held) write.reset()
            focusTitle()
          }}
        />
      )}
      {VISION && (
        <TaskLine
          lineRef={line}
          said={added && me ? `Task added for ${ownerWords(added, me.actorId)}.` : null}
          // With the form closed, a Create still unanswered (or refused) says so here, with its one way on.
          write={asked ? null : write}
          onSee={() => {
            setAdded(null)
            props.onSeeTasks()
          }}
        />
      )}
    </>
  )
  return { offered: VISION && canInvite(me) && !write.held, start, node }
}

/** What the last Create did, in the pane's foot: added, with See tasks; or, the form closed, not sent, with Try again. */
function TaskLine(props: {
  lineRef: RefObject<HTMLParagraphElement | null>
  said: string | null
  write: Create | null
  onSee: () => void
}) {
  const { said, write } = props
  return (
    <p ref={props.lineRef} className="task-added" role="status" tabIndex={-1}>
      {said && (
        <>
          {said}
          <button type="button" className="text-button" onClick={props.onSee}>
            See tasks
          </button>
        </>
      )}
      {!said && write?.words && (
        <>
          {write.words}
          {write.lost && <CreatePress write={write} />}
        </>
      )}
    </p>
  )
}

interface FormProps {
  passage: TaskPassage
  /** This person's actor id: a task «for me» is for them. */
  me: string
  people: readonly TaskPerson[]
  write: Create
  onClose: () => void
}

/** Who the choice names: anyone (null), this person, or the member chosen. */
const ownerOf = (choice: string, me: string): string | null =>
  choice === 'anyone' ? null : choice === 'me' ? me : choice

/** The form's line: a Create with no reply says so; a refusal says the API's words. */
function formWords(state: ReturnType<typeof useAdmission<TaskAsk, ProjectTask>>['state']): string | null {
  if (state.status === 'unknown') return 'Not sent. Try again.'
  if (state.status === 'rejected') return state.error instanceof ApiError ? state.error.message : 'Not sent.'
  return null
}

type Create = ReturnType<typeof useCreate>

/**
 * Create, once per key: after no reply, it is the only press (Try again), its words and owner held as they were sent,
 * until it is answered.
 */
function useCreate(
  send: (key: string, ask: TaskAsk) => Promise<ProjectTask>,
  onAdded: (task: ProjectTask, ask: TaskAsk) => void,
) {
  const write = useAdmission<TaskAsk, ProjectTask>(send)
  const lost = useRef(false)
  if (write.state.status === 'unknown') lost.current = true
  else if (write.state.status !== 'sending') lost.current = false
  const sending = write.state.status === 'sending'
  const answered = (done: ProjectTask | undefined, ask: TaskAsk) => done && onAdded(done, ask)
  return {
    // A Try again on its way keeps the words it answers, and its button (aria-disabled), so the focus stays on it.
    words: lost.current && sending ? 'Not sent. Try again.' : formWords(write.state),
    sending,
    lost: lost.current,
    held: sending || lost.current,
    reset: write.reset,
    create: async (ask: TaskAsk) => answered(await write.submit(ask), ask),
    again: async () => {
      if (write.state.status !== 'unknown') return
      const ask = write.state.args
      answered(await write.retry(), ask)
    },
  }
}

/** «New task»: the passage, what needs doing, for whom; Create, or Cancel (and Esc), which give the focus back. */
function TaskForm({ passage, me, people, write, onClose }: FormProps) {
  const [text, setText] = useState('')
  const [owner, setOwner] = useState('me')
  const [empty, setEmpty] = useState(false)
  const create = () => {
    if (write.held) return
    if (text.trim() === '') setEmpty(true)
    else
      void write.create({
        text: text.trim(),
        owner: ownerOf(owner, me),
        from: { ...passage.place, quote: passage.text },
      })
  }
  return (
    <form
      className="task-form"
      aria-label="New task"
      onSubmit={(e) => {
        e.preventDefault()
        create()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.repeat || e.nativeEvent.isComposing) return
        e.preventDefault() // the form's Esc: the pane stays
        onClose()
      }}
    >
      <p className="task-quote">{keptText(passage.text, passage.source)}</p>
      <TaskField
        text={text}
        empty={empty}
        held={write.held}
        onText={(next) => {
          setEmpty(false)
          setText(next)
        }}
      />
      <TaskFoot {...{ owner, setOwner, people }} held={write.held} words={write.words}>
        <button type="button" className="text-button" onClick={onClose}>
          Cancel
        </button>
        <CreatePress write={write} />
      </TaskFoot>
    </form>
  )
}

/** Create, or after no reply only Try again: the same Create, with its key. */
function CreatePress({ write }: { write: ReturnType<typeof useCreate> }) {
  const busy = write.sending || undefined
  return write.lost ? (
    <button type="button" className="pill" aria-disabled={busy} onClick={() => void write.again()}>
      Try again
    </button>
  ) : (
    <button type="submit" className="pill" aria-disabled={busy}>
      Create
    </button>
  )
}

/** What needs doing: focused as the form opens; empty at Create, it says so. */
function TaskField(props: { text: string; empty: boolean; held: boolean; onText: (text: string) => void }) {
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => field.current?.focus(), [])
  return (
    <>
      <textarea
        ref={field}
        className="review-note"
        aria-label="What needs doing?"
        aria-describedby={props.empty ? 'task-empty' : undefined}
        placeholder="What needs doing?"
        rows={2}
        maxLength={TEXT_MAX}
        value={props.text}
        readOnly={props.held}
        onChange={(e) => props.onText(e.target.value)}
      />
      {props.empty && (
        <span id="task-empty" className="review-empty" role="alert">
          Say what needs doing first.
        </span>
      )}
    </>
  )
}

interface FootProps {
  owner: string
  setOwner: (owner: string) => void
  people: readonly TaskPerson[]
  held: boolean
  words: string | null
  children: React.ReactNode
}

/** For whom, the form's line, and its two buttons. */
function TaskFoot({ owner, setOwner, people, held, words, children }: FootProps) {
  return (
    <span className="task-foot">
      <label className="task-for">
        For
        <select value={owner} disabled={held} onChange={(e) => setOwner(e.target.value)}>
          <option value="me">Me</option>
          <option value="anyone">Anyone</option>
          {people.map((p) => (
            <option key={p.actorId} value={p.actorId}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <span className="task-said" role="status">
        {words}
      </span>
      <span className="review-acts">{children}</span>
    </span>
  )
}
