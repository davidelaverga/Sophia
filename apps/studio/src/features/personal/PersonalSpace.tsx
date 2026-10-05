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
import { Conversation, Who, type ConversationActions } from './Conversation.tsx'
import { conversationRows, heard, opensWithIntro, welcomeDue, withReadBack, type Row } from './conversation-view.ts'
import { FIND_KEYS, useFind } from './Find.tsx'
import { focusConversation, focusNotesToggle, focusSoon } from './focus.ts'
import type { PersonalExtras } from './extras.ts'
import { NotesPanel } from './NotesPanel.tsx'
import { NOTICE } from './notice-view.ts'
import { lightOf, notesLabel, readyFor } from './places-view.ts'
import type { Handed } from './handed.ts'
import { PersonalComposer, type SendOutcome } from './PersonalComposer.tsx'
import { usePresses } from './presses.ts'
import { ReadNotes, type Read } from './ReadNotes.tsx'
import { Talk } from './Talk.tsx'
import type { PersonalWrites, ReadBack } from './usePersonal.ts'
import { personalFailure, unsent } from './write-words.ts'

interface Props {
  /** Not on screen (another place is): kept mounted, so a draft and the scroll survive. */
  hidden: boolean
  /** Words said to Sophia from Home, for the composer to send as its own (PersonalComposer, useHanded). */
  handed: Handed | null
  onHanded: () => void
  /** The padlock is shut: the field is not on the page (the device keeps the draft). */
  locked: boolean
  /** The clock the conversation's days are told by: it moves, so "Today" becomes "Yesterday" at midnight. */
  now: Date
  /** Whose draft the composer keeps (accountOf). */
  account: string
  name: string | null
  /** Undefined until it has loaded (`read` says how that goes). */
  space: Space | undefined
  /**
   * The epoch the page knows: the space's once read, else the one the Work list names. An erasure heard of while the
   * space can't be read takes the draft from before it out of the field at once (one written after it stays).
   */
  epoch: number | undefined
  /** A long conversation read back, before what the space lists. */
  readBack: ReadBack
  read: Read
  /** Undefined until the projects have loaded. */
  projects: readonly ProjectSummary[] | undefined
  /** How the projects' read stands: the notes' carry menu says a failed one, with Try again. */
  projectsRead: Read
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
  /** What the API doesn't give yet: memory, the week's look back, a live talk (extras.ts). Places passes none. */
  extras?: PersonalExtras
}

/**
 * On a wide screen the conversation slides left just enough to clear the notes; on a narrow one they overlay. `beside`:
 * the notes clear it entirely, so they can be a see-through column (personal.css); else they cover what they overlap.
 */
function useShift(body: React.RefObject<HTMLDivElement | null>, open: boolean): { shift: number; beside: boolean } {
  const [shift, setShift] = useState({ shift: 0, beside: false })
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return undefined
    const measure = () => {
      const convo = el.querySelector<HTMLElement>('.c3-convo')
      const free = (el.clientWidth - (convo?.offsetWidth ?? el.clientWidth)) / 2
      const need = Math.min(340, el.clientWidth) + 20 - free
      const wide = open && el.clientWidth >= 900
      const next = { shift: wide ? Math.max(0, Math.min(need, free)) : 0, beside: wide && need <= free }
      setShift((was) => (was.shift === next.shift && was.beside === next.beside ? was : next))
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
  /** Where the composer puts its send for a way to start. */
  starter: RefObject<((words: string) => Promise<boolean>) | null>
} {
  const { writes, toast, onCarried } = props
  const starter = useRef<((words: string) => Promise<boolean>) | null>(null)
  const presses = usePresses()
  const attempt = useCallback(
    (work: () => Promise<unknown>) => {
      void work().catch(onFailed)
    },
    [onFailed],
  )
  return {
    starter,
    waits: presses.waits,
    // A way to start goes as the field's words do, through the composer (one at a time, its own key, kept on its way).
    start: (text) => starter.current?.(text) ?? Promise.resolve(false),
    decide: (suggestion: PersonalSuggestion, decision) =>
      presses.press(suggestion.id, () => writes.decide(suggestion.id, decision).catch(onFailed)),
    openNotes: () => props.notes.set(true),
    retry: (turnId) => presses.press(turnId, () => writes.retry(turnId).catch(onFailed)),
    readEarlier: () => props.readBack.readMore().catch(onFailed),
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
    // A note carried stays crossed until its write settles (NotesPanel), and a second carry of it writes nothing.
    carry: (note, project) =>
      presses.press(note.id, () =>
        writes.carry(note.id, project.projectId).then(({ releaseId }) => {
          onCarried(releaseId)
          if (releaseId) toast(NOTICE.carried(project.title), () => attempt(() => writes.takeBack(releaseId)))
        }, onFailed),
      ),
  }
}

/** Her reply landed while you read further up: it waits below, and a press brings you to it. */
function Answered({ onPress }: { onPress: () => void }) {
  return (
    <button className="c3-answered" type="button" onClick={onPress}>
      Sophia answered
      <span aria-hidden>↓</span>
    </button>
  )
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
  const { space, writes, name, readBack, now, projects } = props
  const listed = space?.turns ?? NO_TURNS
  const turns = useMemo(() => withReadBack(readBack.older, listed), [readBack.older, listed])
  const earlier = readBack.more
  const loaded = !!space
  const answers = space?.companion !== 'unavailable'
  const ready = useMemo(() => readyFor(projects ?? [], now), [projects, now])
  // A message on its way from before an erasure isn't shown over the space after it (it will be refused).
  const sending = writes.sending && writes.sending.epoch === space?.epoch ? writes.sending : null
  const rows = useMemo(
    () =>
      loaded
        ? conversationRows({
            turns,
            sending,
            welcoming: writes.welcoming,
            now,
            name,
            fromTheStart: opensWithIntro(turns, earlier, now),
            whole: !earlier,
            answers,
            ready,
          })
        : [],
    [loaded, turns, sending, writes.welcoming, name, earlier, now, answers, ready],
  )
  return { turns, rows }
}

/** The notes' count brightens once when it grows: a note kept has landed. */
function useTicked(count: number | undefined): boolean {
  const [ticked, setTicked] = useState(false)
  const last = useRef(count)
  useEffect(() => {
    const grew = count !== undefined && last.current !== undefined && count > last.current
    last.current = count
    if (!grew) return undefined
    setTicked(true)
    const done = window.setTimeout(() => setTicked(false), 1200)
    return () => {
      window.clearTimeout(done)
      setTicked(false)
    }
  }, [count])
  return ticked
}

/** Find in the head: it opens the find line (useFind), which it controls while open. */
function FindToggle({ find }: { find: ReturnType<typeof useFind> }) {
  return (
    <button
      className="c3-find-toggle has-tip"
      type="button"
      aria-expanded={find.open}
      aria-controls={find.open ? 'c-find' : undefined}
      onClick={find.openFind}
    >
      Find
      <Tip label="Find in your conversation" keys={FIND_KEYS} side="bottom" align="end" />
    </button>
  )
}

/** `count` is undefined until the space has loaded: the toggle shows no number before. */
function Head({
  count,
  notes,
  onTalk,
  find,
  under,
}: {
  count: number | undefined
  notes: Props['notes']
  onTalk: (() => void) | null
  /** Find (useFind): its toggle opens it, and its line sits under the head while open. */
  find: ReturnType<typeof useFind>
  /** A talk runs over everything: the head is out of reach until it ends. */
  under: boolean
}) {
  const ticked = useTicked(count)
  return (
    <header className="c3-head" inert={under}>
      <h2 id="c-p-h" tabIndex={-1}>
        You and Sophia
      </h2>
      <div className="c3-head-acts">
        {count !== undefined && <FindToggle find={find} />}
        {onTalk && (
          <button className="c3-talk-toggle" type="button" onClick={onTalk}>
            <Who who="sophia" />
            Talk with her
          </button>
        )}
        {(count !== undefined || notes.open) && (
          <button
            className={`c3-notes-toggle has-tip${ticked ? ' ticked' : ''}`}
            type="button"
            aria-pressed={notes.open}
            aria-controls="c-notes"
            onClick={() => notes.set(!notes.open)}
          >
            {count === undefined ? 'Notes' : count ? notesLabel(count) : 'No notes'}
            <span className="c3-go" aria-hidden>
              →
            </span>
            <Tip
              label="Your private notes. Carry one to a project only if you want to."
              keys="T"
              side="bottom"
              align="end"
            />
          </button>
        )}
      </div>
      {find.bar}
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

/** How near its end the conversation is read for it to keep the latest turn in sight as it grows, in pixels. */
const AT_END_PX = 48

/**
 * The reader at the conversation's end stays there as it changes size; reading further up, or back with a reply of
 * hers unseen, they are left where they are. Scrolling to the end clears the line that says she answered.
 */
function useEndKept(
  list: RefObject<HTMLDivElement | null>,
  where: { atEnd: { current: boolean }; away: { current: boolean } },
  setBehind: (behind: boolean) => void,
) {
  const { atEnd, away } = where
  useEffect(() => {
    const box = list.current
    if (!box) return undefined
    const read = () => {
      atEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < AT_END_PX
      if (atEnd.current) setBehind(false)
    }
    box.addEventListener('scroll', read, { passive: true })
    // The list made shorter (a rotation, a window resized) or its rows taller (a font loading, a row reflowed):
    // whoever read at its end stays there, also as it starts to overflow, where its end-alignment falls back to the
    // start. Its rows are watched as well as its box, and again as rows come and go.
    const sized = new ResizeObserver(() => {
      // A reply of hers unseen: afterGrowth places the reader, whichever runs first; never past it to the end.
      if (away.current) return
      // At once, not smoothly: a second resize mid-glide must still find the reader at the end.
      if (atEnd.current) box.scrollTo({ top: box.scrollHeight, behavior: 'instant' })
    })
    const watch = () => {
      sized.disconnect()
      sized.observe(box)
      for (const row of box.children) sized.observe(row)
    }
    watch()
    const rows = new MutationObserver(watch)
    rows.observe(box, { childList: true })
    return () => {
      box.removeEventListener('scroll', read)
      sized.disconnect()
      rows.disconnect()
    }
  }, [list, atEnd, away, setBehind])
}

/**
 * The latest turn comes into sight as the conversation grows (a turn, a message settling, Sophia writing) while the
 * person reads at its end, also once they are back from another place, and always as they send. Whoever reads further
 * up stays where they read; a reply of hers that lands meanwhile waits below (`behind`), until they reach the end or
 * press to go there (`toEnd`).
 */
function useLatestInSight(list: RefObject<HTMLDivElement | null>, grows: Grows) {
  const { newest, hers, sending, writing, hidden } = grows
  const atEnd = useRef(true)
  const sent = useRef<unknown>(null)
  const seen = useRef(newest)
  // A reply of hers came while the space was out of sight (another place, the padlock).
  const away = useRef(false)
  const [behind, setBehind] = useState(false)
  useEndKept(list, { atEnd, away }, setBehind)
  useEffect(() => {
    const box = list.current
    const theirs = sending !== null && sending !== sent.current
    const landed = newest !== seen.current
    sent.current = sending
    // A reply that lands while the space is out of sight still counts as unseen once it is back.
    if (!hidden) seen.current = newest
    if (newest === 0) {
      atEnd.current = true // nothing read yet (a lock, an erasure): it opens at its end
      setBehind(false)
    }
    if (hidden) {
      if (landed && hers) away.current = true // her reply, unseen until the reader is back
      return
    }
    const next = afterGrowth(box, { atEnd, away }, theirs, landed && hers)
    if (next === 'end' && box) {
      box.scrollTop = box.scrollHeight
      setBehind(false)
    } else if (next === 'behind') setBehind(true)
  }, [list, newest, hers, sending, writing, hidden])
  // Pressed, the line goes: the focus stays in the conversation (the field, or the list on touch), never the page.
  const toEnd = useCallback(() => {
    const box = list.current
    if (box) box.scrollTop = box.scrollHeight
    setBehind(false)
    focusConversation()
  }, [list])
  return { behind: behind && !hidden, toEnd }
}

/**
 * What the conversation does as it grows, in sight. Back from out of sight with a reply of hers that came meanwhile:
 * where it overflows, the reader stays where they stood and the line says she answered; where it fits, they are at
 * its end again.
 * Else, read at the end or one's own words just sent, it goes to the end; a reply of hers while reading further up
 * waits below, said. Clears `away` either way.
 */
function afterGrowth(
  box: HTMLDivElement | null,
  where: { atEnd: { current: boolean }; away: { current: boolean } },
  theirs: boolean,
  hersLanded: boolean,
): 'end' | 'behind' | 'stay' {
  const unseen = where.away.current
  where.away.current = false
  if (unseen && box) {
    if (box.scrollHeight > box.clientHeight) {
      // Her reply is below the reader now: a resize that comes after this must not carry them past it.
      where.atEnd.current = false
      return 'behind'
    }
    where.atEnd.current = true
  }
  if (where.atEnd.current || theirs) return 'end'
  return hersLanded ? 'behind' : 'stay'
}

/** What makes the conversation grow, from what it holds. */
const grows = (turns: readonly PersonalTurn[], sending: unknown, writing: boolean, hidden: boolean): Grows => ({
  newest: turns.at(-1)?.seq ?? 0,
  hers: turns.at(-1)?.author === 'sophia',
  sending,
  writing,
  hidden,
})

/** What makes the conversation grow, and whether it is out of sight (another place, the padlock). */
interface Grows {
  newest: number
  /** Whether the newest turn is Sophia's. */
  hers: boolean
  sending: unknown
  writing: boolean
  hidden: boolean
}

/** Sending from the composer: how it went (SendOutcome); a failure is said, and the composer decides about the words. */
const sender =
  (writes: PersonalWrites, onFailed: (err: unknown) => void) =>
  async (text: string, key: string): Promise<SendOutcome> => {
    try {
      await writes.send(text, key)
      return 'sent'
    } catch (err: unknown) {
      onFailed(err)
      return unsent(err)
    }
  }

/** The field: an erasure forgets the draft too, so the composer starts afresh. */
function Composer(p: {
  props: Props
  starter: RefObject<((words: string) => Promise<boolean>) | null>
  onFailed: (err: unknown) => void
  onListening: (listening: boolean) => void
  /** A talk runs over the field: like a space out of sight, its dictation stops first (one microphone at a time). */
  talking: boolean
}) {
  const { account, epoch, space, writes } = p.props
  const hidden = p.props.hidden || p.talking
  return (
    <PersonalComposer
      key={writes.erasures}
      {...{ account, epoch, hidden, busy: writes.busy, onBehind: writes.readAgain, starter: p.starter }}
      handed={p.props.handed}
      onHanded={p.props.onHanded}
      night={lightOf(p.props.now) === 'night'}
      state={!space ? 'loading' : space.companion === 'unavailable' ? 'unavailable' : 'ready'}
      onListening={p.onListening}
      onSend={sender(writes, p.onFailed)}
    />
  )
}

/**
 * A live talk with her, where the API gives a voice (extras.ts) and she can answer: how to start it, whether one runs,
 * and the talk itself. It ends at once when the space goes out of sight or locks: no voice goes on behind the padlock.
 * Ended, the focus goes back to what started it.
 */
function useTalking(props: Props) {
  const [talking, setTalking] = useState(false)
  const voice = props.extras?.voice
  const away = props.hidden || props.locked
  useEffect(() => {
    if (away) setTalking(false)
  }, [away])
  const can = !!voice && !away && !!props.space && props.space.companion !== 'unavailable'
  const end = () => {
    setTalking(false)
    focusSoon('.c3-talk-toggle')
  }
  return {
    start: can ? () => setTalking(true) : null,
    talking: talking && can,
    view: talking && can ? <Talk voice={voice} onEnd={end} /> : null,
  }
}

/** The notes beside the conversation, what she remembers at their top (extras.ts); out of reach under a talk. */
function Notes({ props, actions, under }: { props: Props; actions: ReturnType<typeof useActions>; under: boolean }) {
  const { notes, space, projects } = props
  if (!notes.open) return null
  return (
    <NotesPanel
      {...{ projects, projectsRead: props.projectsRead, onStartProject: props.onStartProject }}
      notes={space?.notes}
      onClose={() => {
        notes.set(false)
        focusNotesToggle()
      }}
      onCarry={actions.carry}
      carrying={actions.waits}
      memory={props.extras?.memory}
      under={under}
    />
  )
}

/**
 * Find in the conversation: in reach while Personal is in sight and nothing runs over it (`over`: a talk, or the notes
 * covering it); pressed while the notes cover it, they are put away first.
 */
function useConversationFind(
  props: Props,
  rows: readonly Row[],
  over: boolean,
  readEarlier: () => Promise<void>,
  covered: boolean,
) {
  const uncover = covered ? () => props.notes.set(false) : null
  const { more, reading } = props.readBack
  // Only once the conversation is read: before, a search would say "No match" over one still loading.
  return useFind(rows, !!props.space && !props.hidden && !over, { more, reading, read: readEarlier }, uncover)
}

export function PersonalSpace(props: Props) {
  const { space, writes, notes, earlier, toast } = props
  const body = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [listening, setListening] = useState(false)
  const talk = useTalking(props)
  const { shift, beside } = useShift(body, notes.open)
  const covered = useNotesCover(notes.open)
  const onFailed = useCallback((err: unknown) => toast(personalFailure(err)), [toast])
  const actions = useActions(props, onFailed)
  const { turns, rows } = useRows(props)
  useWelcomeBack(props, turns)
  const waiting = rows.some((r) => r.kind === 'typing')
  const said = useHeard(space, turns, waiting)
  const latest = useLatestInSight(list, grows(turns, writes.sending, waiting, props.hidden))
  const find = useConversationFind(props, rows, talk.talking || covered, actions.readEarlier, covered)
  const composer = props.locked ? null : (
    <Composer
      props={props}
      starter={actions.starter}
      onFailed={onFailed}
      onListening={setListening}
      talking={talk.talking}
    />
  )
  return (
    <section
      className={`c3-space you${waiting ? ' speaking' : ''}${listening ? ' listening' : ''}`}
      data-place-view="personal"
      data-hour={lightOf(props.now)}
      hidden={props.hidden}
      aria-labelledby="c-p-h"
      style={{ '--shift': `${-shift}px` }}
    >
      <div className="c3-ambient" aria-hidden />
      <p className="sr-only" role="status">
        {said}
      </p>
      <Head count={space?.notes.length} {...{ notes, find }} onTalk={talk.start} under={talk.talking} />
      <div className="c3-body" ref={body} data-beside={beside || undefined}>
        <Conversation
          {...{ rows, turns, list, actions, composer, more: props.readBack.more, reading: props.readBack.reading }}
          covered={covered || talk.talking}
          notice={<ReadNotes reads={[props.read]} />}
          earlier={earlier.open}
          setEarlier={earlier.set}
          week={props.extras?.week}
          answered={latest.behind ? <Answered onPress={latest.toEnd} /> : null}
          lens={find.lens}
        />
        {talk.view}
        <Notes props={props} actions={actions} under={talk.talking} />
      </div>
      <Edge edge={props.edge} onCross={props.onCross} />
    </section>
  )
}
