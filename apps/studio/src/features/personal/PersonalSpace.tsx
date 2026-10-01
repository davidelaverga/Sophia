// The personal space (direction C): one conversation lit by Sophia's light, the notes beside it, and the edge to Work.
// Everything here is the person's alone; the only way out of it is carrying a note, one at a time. Until the space has
// loaded nothing is offered (no introduction, no ways to start, no field): a first conversation offered over one that
// is still loading would read as the old one gone.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import type {
  PersonalNote,
  PersonalSpace as Space,
  PersonalSuggestion,
  PersonalTurn,
  ProjectSummary,
} from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
import type { ShowToast } from '../../app/Toast.tsx'
import { Conversation, type ConversationActions } from './Conversation.tsx'
import { conversationRows, heard, opensWithIntro, welcomeDue, withReadBack } from './conversation-view.ts'
import { focusNotesToggle } from './focus.ts'
import { NotesPanel } from './NotesPanel.tsx'
import { NOTICE } from './notice-view.ts'
import { PersonalComposer, type SendOutcome } from './PersonalComposer.tsx'
import { ReadNotes, type Read } from './ReadNotes.tsx'
import type { PersonalWrites, ReadBack } from './usePersonal.ts'
import { personalFailure, unsent } from './write-words.ts'

interface Props {
  /** Not on screen (another place is): kept mounted, so a draft and the scroll survive. */
  hidden: boolean
  /** The padlock is shut: the field is not on the page (the device keeps the draft). */
  locked: boolean
  /** The clock the conversation's days are told by: it moves, so "Today" becomes "Yesterday" at midnight. */
  now: Date
  /** Whose draft the composer keeps (accountOf). */
  account: string
  name: string | null
  /** Undefined until it has loaded (`read` says how that goes). */
  space: Space | undefined
  /** A long conversation read back, before what the space lists. */
  readBack: ReadBack
  read: Read
  /** Undefined until the projects have loaded. */
  projects: readonly ProjectSummary[] | undefined
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

/** Where the notes cover the conversation instead of sitting beside it: the same width as personal.css says. */
const NOTES_COVER = '(max-width: 860px)'

/** Whether the notes cover the conversation now, following the window as it is resized. */
function useNotesCover(open: boolean): boolean {
  const subscribe = useCallback((changed: () => void) => {
    const narrow = matchMedia(NOTES_COVER)
    narrow.addEventListener('change', changed)
    return () => narrow.removeEventListener('change', changed)
  }, [])
  const narrow = useSyncExternalStore(subscribe, () => matchMedia(NOTES_COVER).matches)
  return open && narrow
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
    readEarlier: () => attempt(() => props.readBack.readMore()),
    // Whether it was kept: a refused note's words go back into its form.
    keepNote: (text, turnId, suggestion) =>
      writes.keep(text, turnId, suggestion?.id ?? null).then(
        (kept) => {
          const noteId = kept.noteId
          if (noteId) toast(NOTICE.kept, () => attempt(() => writes.forget(noteId)))
          return true
        },
        (err: unknown) => {
          onFailed(err)
          return false
        },
      ),
    carry: (note, project) =>
      attempt(async () => {
        const carried = await writes.carry(note.id, project.projectId)
        const releaseId = carried.releaseId
        onCarried(releaseId)
        if (releaseId) toast(NOTICE.carried(project.title), () => attempt(() => writes.takeBack(releaseId)))
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
        <span className="go">
          <Icon name="forward" />
        </span>
        <span className="shut">
          <Icon name="lock" />
        </span>
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

const NO_TURNS: readonly PersonalTurn[] = []

/**
 * The conversation's rows, none until the space has loaded. A wait that outlasted any answer comes from the server as
 * failed, so it can be asked again (usePersonalSpace).
 */
function useRows(props: Props) {
  const { space, writes, name, readBack, now } = props
  const listed = space?.turns ?? NO_TURNS
  const turns = useMemo(() => withReadBack(readBack.older, listed), [readBack.older, listed])
  const earlier = readBack.more
  const loaded = !!space
  const rows = useMemo(
    () =>
      loaded
        ? conversationRows({
            turns,
            sending: writes.sending,
            welcoming: writes.welcoming,
            now,
            name,
            fromTheStart: opensWithIntro(turns, earlier, now),
          })
        : [],
    [loaded, turns, writes.sending, writes.welcoming, name, earlier, now],
  )
  return { turns, rows }
}

/** `count` is undefined until the space has loaded: the toggle shows no number before. */
function Head({ count, notes }: { count: number | undefined; notes: Props['notes'] }) {
  return (
    <header className="c3-head">
      <h2 id="c-p-h" tabIndex={-1}>
        You and Sophia
      </h2>
      <div className="c3-head-acts">
        {((count ?? 0) > 0 || notes.open) && (
          <button
            className="pill has-tip"
            type="button"
            aria-pressed={notes.open}
            aria-controls="c-notes"
            onClick={() => notes.set(!notes.open)}
          >
            Notes {count !== undefined && <span className="c3-count">{count}</span>}
            <Tip
              label="Your private notes. Carry one to a project only if you want to."
              keys="T"
              side="bottom"
              align="end"
            />
          </button>
        )}
      </div>
    </header>
  )
}

/**
 * What a screen reader is told as the conversation is read again (heard): Sophia writing, then her replies, or a reply
 * that failed. Each load (the first read after opening or unlocking) is the baseline, so nothing already there is read
 * out. The line ends in a no-break space every other time, so the same words twice in a row are said twice.
 */
function useHeard(space: Space | undefined, turns: readonly PersonalTurn[], writing: boolean): string {
  const [said, setSaid] = useState({ text: '', count: 0 })
  const last = useRef<{ turns: readonly PersonalTurn[] | null; writing: boolean }>({ turns: null, writing: false })
  const loaded = space !== undefined
  useEffect(() => {
    if (!loaded) {
      last.current = { turns: null, writing: false }
      setSaid({ text: '', count: 0 }) // nothing said stays in the page while the space is unloaded (a lock)
      return
    }
    const message = heard(last.current.turns, turns, writing, last.current.writing)
    last.current = { turns, writing }
    if (message) setSaid((s) => ({ text: message, count: s.count + 1 }))
  }, [loaded, turns, writing])
  return said.count % 2 === 1 ? `${said.text}\u00a0` : said.text
}

/** The latest turn is in sight whenever the conversation grows: a turn, a message on its way, Sophia writing. */
function useLatestInSight(list: RefObject<HTMLDivElement | null>, newest: number, sending: unknown, writing: boolean) {
  useEffect(() => {
    const box = list.current
    if (box) box.scrollTop = box.scrollHeight
  }, [list, newest, sending, writing])
}

/** Sending from the composer: how it went (SendOutcome); a failure is said, and the composer decides about the words. */
const sender =
  (writes: PersonalWrites, onFailed: (err: unknown) => void) =>
  async (text: string): Promise<SendOutcome> => {
    try {
      await writes.send(text)
      return 'sent'
    } catch (err: unknown) {
      onFailed(err)
      return unsent(err)
    }
  }

export function PersonalSpace(props: Props) {
  const { account, space, projects, writes, notes, earlier, toast } = props
  const body = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [listening, setListening] = useState(false)
  const shift = useShift(body, notes.open)
  const covered = useNotesCover(notes.open)
  const onFailed = useCallback((err: unknown) => toast(personalFailure(err)), [toast])
  const actions = useActions(props, onFailed)
  const { turns, rows } = useRows(props)
  useWelcomeBack(props, turns)
  const waiting = rows.some((r) => r.kind === 'typing')
  const said = useHeard(space, turns, waiting)
  useLatestInSight(list, turns.at(-1)?.seq ?? 0, writes.sending, waiting)
  const composer = props.locked ? null : (
    <PersonalComposer
      // An erasure forgets the draft too: the composer starts afresh.
      key={writes.erasures}
      {...{ account, epoch: space?.epoch, hidden: props.hidden, busy: writes.busy }}
      state={!space ? 'loading' : space.companion === 'unavailable' ? 'unavailable' : 'ready'}
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
      <p className="sr-only" role="status">
        {said}
      </p>
      <Head count={space?.notes.length} notes={notes} />
      <div className="c3-body" ref={body}>
        <Conversation
          {...{ rows, turns, list, actions, composer, covered, more: props.readBack.more }}
          notice={<ReadNotes reads={[props.read]} />}
          earlier={earlier.open}
          setEarlier={earlier.set}
        />
        {notes.open && (
          <NotesPanel
            notes={space?.notes}
            projects={projects}
            onClose={() => {
              notes.set(false)
              focusNotesToggle()
            }}
            onCarry={actions.carry}
            onStartProject={props.onStartProject}
          />
        )}
      </div>
      <Edge edge={props.edge} onCross={props.onCross} />
    </section>
  )
}
