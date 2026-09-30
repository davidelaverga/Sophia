// The personal space (direction C): one conversation lit by Sophia's light, the notes beside it, and the edge to Work.
// Everything here is the person's alone; the only way out of it is carrying a note, one at a time.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  PersonalNote,
  PersonalSpace as Space,
  PersonalSuggestion,
  PersonalTurn,
  ProjectSummary,
} from '@sophia/contracts'
import { Tip } from '@sophia/ui'
import { Conversation, type ConversationActions } from './Conversation.tsx'
import { conversationRows, opensWithIntro, welcomeDue } from './conversation-view.ts'
import { Across, LockShut } from './icons.tsx'
import { NotesPanel } from './NotesPanel.tsx'
import { PersonalComposer } from './PersonalComposer.tsx'
import type { ShowToast } from './Toast.tsx'
import { withStaleWaits, type PersonalWrites } from './usePersonal.ts'
import { personalFailure } from './write-words.ts'

interface Props {
  /** Not on screen (another place is): kept mounted, so a draft and the scroll survive. */
  hidden: boolean
  identity: string
  name: string | null
  space: Space | undefined
  projects: readonly ProjectSummary[]
  writes: PersonalWrites
  notes: { open: boolean; set: (open: boolean) => void }
  earlier: { open: boolean; set: (open: boolean) => void }
  /** Notes carried since Work was last open, and a count that moves with each carry (the edge pulses). */
  edge: { badge: number; pulse: number }
  toast: ShowToast
  /** A note crossed to Work: the edge counts it, and Work marks it new. */
  onCarried: (releaseId: string | null) => void
  onCross: () => void
  onStartProject: () => void
}

/** On a wide screen the conversation slides left just enough to clear the notes; on a narrow one they overlay. */
function useShift(body: React.RefObject<HTMLDivElement | null>, open: boolean): number {
  const [shift, setShift] = useState(0)
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return undefined
    const measure = () => {
      const convo = el.querySelector<HTMLElement>('.c3-convo')
      const free = (el.clientWidth - (convo?.offsetWidth ?? el.clientWidth)) / 2
      const need = Math.min(340, el.clientWidth) + 20 - free
      setShift(open && el.clientWidth >= 900 ? Math.max(0, Math.min(need, free)) : 0)
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [body, open])
  return shift
}

/** Writes that say what happened, and offer Undo where it can be undone. */
function useActions(
  props: Props,
  onFailed: (err: unknown) => void,
): ConversationActions & {
  carry: (note: PersonalNote, project: ProjectSummary) => void
} {
  const { writes, toast, onCarried } = props
  const attempt = useCallback(
    (work: () => Promise<unknown>) => {
      void work().catch(onFailed)
    },
    [onFailed],
  )
  return {
    start: (text) => attempt(() => writes.send(text)),
    decide: (suggestion: PersonalSuggestion, decision) => attempt(() => writes.decide(suggestion.id, decision)),
    openNotes: () => props.notes.set(true),
    retry: (turnId) => attempt(() => writes.retry(turnId)),
    keepNote: (text, turnId, suggestion) =>
      attempt(async () => {
        const kept = await writes.keep(text, turnId, suggestion?.id ?? null)
        const noteId = kept.noteId
        if (noteId) toast('Kept', () => attempt(() => writes.forget(noteId)))
      }),
    carry: (note, project) =>
      attempt(async () => {
        const carried = await writes.carry(note.id, project.projectId)
        const releaseId = carried.releaseId
        onCarried(releaseId)
        if (releaseId) toast(`Carried to ${project.title}`, () => attempt(() => writes.takeBack(releaseId)))
      }),
  }
}

function Edge({ edge, onCross }: { edge: Props['edge']; onCross: () => void }) {
  return (
    <button
      key={edge.pulse}
      className={`c3-edge right has-tip${edge.pulse ? ' pulse' : ''}`}
      type="button"
      aria-label="Cross to Work"
      onClick={onCross}
    >
      <span className="c2-lock" aria-hidden>
        <Across className="go" toward="right" />
        <LockShut className="shut" />
      </span>
      <span className="c3-edge-label">Work</span>
      {edge.badge > 0 && <span className="c3-badge">{edge.badge} new</span>}
      <Tip label="Cross to Work. Nothing from here goes with you." keys="W" side="top" align="end" />
    </button>
  )
}

/** Coming back after a quiet spell, the person is welcomed by Sophia: asked once per visit, and only when due. */
function useWelcomeBack(props: Props, turns: readonly PersonalTurn[]) {
  const { hidden, space, writes, name } = props
  const asked = useRef(false)
  const due = !!space && space.companion !== 'unavailable' && welcomeDue(turns, new Date())
  useEffect(() => {
    if (hidden) {
      asked.current = false
      return
    }
    if (!due || asked.current) return
    asked.current = true
    void writes.resume(name).catch(() => undefined) // no welcome is no loss: the conversation goes on
  }, [hidden, due, writes, name])
}

/** The conversation's rows, with a wait that has run past any answer shown as failed (so it can be asked again). */
function useRows(props: Props) {
  const { space, writes, name } = props
  const turns = useMemo(() => withStaleWaits(space?.turns ?? [], Date.now()), [space?.turns])
  const earlier = space?.earlier ?? false
  const rows = useMemo(
    () =>
      conversationRows({
        turns,
        sending: writes.sending,
        welcoming: writes.welcoming,
        now: new Date(),
        name,
        fromTheStart: opensWithIntro(turns, earlier, new Date()),
      }),
    [turns, writes.sending, writes.welcoming, name, earlier],
  )
  return { turns, rows }
}

function Head({ count, notes }: { count: number; notes: Props['notes'] }) {
  return (
    <header className="c3-head">
      <h2 id="c-p-h" tabIndex={-1}>
        You and Sophia
      </h2>
      <div className="c3-head-acts">
        {(count > 0 || notes.open) && (
          <button
            className="btn has-tip"
            type="button"
            aria-pressed={notes.open}
            aria-controls="c-notes"
            onClick={() => notes.set(!notes.open)}
          >
            Notes <span className="c3-count">{count}</span> <kbd>T</kbd>
            <Tip label="Your private notes. Carry one to a project only if you want to." side="bottom" align="end" />
          </button>
        )}
      </div>
    </header>
  )
}

/** Sending from the composer: true once sent; a failure is said, and the words go back into the field. */
const sender = (writes: PersonalWrites, onFailed: (err: unknown) => void) => async (text: string) => {
  try {
    await writes.send(text)
    return true
  } catch (err: unknown) {
    onFailed(err)
    return false
  }
}

export function PersonalSpace(props: Props) {
  const { identity, space, projects, writes, notes, earlier, toast } = props
  const body = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [listening, setListening] = useState(false)
  const shift = useShift(body, notes.open)
  const onFailed = useCallback((err: unknown) => toast(personalFailure(err)), [toast])
  const actions = useActions(props, onFailed)
  const { turns, rows } = useRows(props)
  useWelcomeBack(props, turns)
  const waiting = rows.some((r) => r.kind === 'typing')
  // The latest turn is in sight whenever the conversation grows.
  useEffect(() => {
    const box = list.current
    if (box) box.scrollTop = box.scrollHeight
  }, [turns.length, writes.sending, waiting])
  const composer = (
    <PersonalComposer
      identity={identity}
      canSend={space?.companion !== 'unavailable'}
      onListening={setListening}
      onSend={sender(writes, onFailed)}
    />
  )
  return (
    <section
      className={`c3-space you${waiting ? ' speaking' : ''}${listening ? ' listening' : ''}`}
      data-place-view="personal"
      hidden={props.hidden}
      aria-labelledby="c-p-h"
      style={{ '--shift': `${-shift}px` }}
    >
      <div className="c3-ambient" aria-hidden />
      <Head count={space?.notes.length ?? 0} notes={notes} />
      <div className="c3-body" ref={body}>
        <Conversation {...{ rows, turns, list, actions, composer }} earlier={earlier.open} setEarlier={earlier.set} />
        {notes.open && (
          <NotesPanel
            notes={space?.notes ?? []}
            projects={projects}
            onClose={() => notes.set(false)}
            onCarry={actions.carry}
            onStartProject={props.onStartProject}
          />
        )}
      </div>
      <Edge edge={props.edge} onCross={props.onCross} />
    </section>
  )
}
