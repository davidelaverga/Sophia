// Home, the Welcome (docs/plans/home-welcome.md): an editorial page that knows you. On the left, the date, the greeting
// and Sophia's one sentence; then you and Sophia (where you left off, your notes, a line to write or speak to her) and
// your projects (the ones Work shows first); on the right, alone, her own light behind Umbral, whose rays turn to you as
// you move and to the line while you write or speak to her. Given what needs you (needs-you.ts, behind the vision
// flag), the right half is a column: her light at its head (the 96 px emblem in a small box), the needs under it.
import type { ProjectSummary } from '@sophia/contracts'
import { Button, Icon, NextAskHint, nextAskKey, Skeleton } from '@sophia/ui'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { modalOnScreen, onScreen } from '../../app/shortcuts.ts'
import { useMedia } from '../../app/useMedia.ts'
import { defaultTarget, type LightMode, type LightTarget } from '../light/engine.ts'
import type { Point } from '../light/motion.ts'
import { SophiaLight } from '../light/SophiaLight.tsx'
import { roomForMark } from '../light/threshold.ts'
import { followPointer } from '../resources/motion.ts'
import { useDictation } from './dictation.ts'
import { moveInIndex } from './index-keys.ts'
import type { Need } from './needs-you.ts'
import { NeedsYou } from './NeedsYou.tsx'

/** Now on the service's clock: the needs' expiries compare on it (A15's `readAt`), not on the browser's. */
const onService = (now: Date, skew = 0): Date => (skew === 0 ? now : new Date(now.getTime() + skew))
import {
  homeLine,
  homeNextAsk,
  homeRows,
  notesLabel,
  rowNote,
  type HomeAction,
  type HomeLine,
  type HomeRow,
  type Said,
  type YouDoor,
} from './places-view.ts'
import { ReadNotes, type Read } from './ReadNotes.tsx'

interface Props {
  /** "Good evening", or "Welcome" the first time. */
  hello: string
  /** The person's first name, or null when the account gives none: the greeting is then one line. */
  name: string | null
  date: string
  /** The one thing that matters now, in Sophia's words (sophiaSays). */
  says: readonly Said[]
  /** Where you left off with her (youDoor): continue or unlock, and your notes; null on a first visit. */
  you: YouDoor | null
  reads: readonly Read[]
  /** Undefined until they have loaded. */
  projects: readonly ProjectSummary[] | undefined
  /** Their read is on its way: placeholder rows until it lands; a read that failed has its own note (ReadNotes). */
  loadingProjects: boolean
  now: Date
  inCallProject: string | null
  /** "4 projects", ending the index; empty while they load. */
  count: string
  /** The personal space is locked: your row unlocks it, and there is no line. */
  locked: boolean
  /**
   * Sophia answers in the personal space (the API's `companion`): the line to her where she does; where she doesn't,
   * that she can't yet and a note instead; undefined until the space is read, the line's place held
   * (docs/plans/home-no-companion.md).
   */
  answers: boolean | undefined
  /** Home is out of sight (another place is): the microphone stops and her light stops following. */
  hidden: boolean
  /** Home is the place arrived at (not only on screen while a move runs): a visit ends when it is not. */
  here: boolean
  /**
   * What needs you (needs-you.ts) and what opens one: undefined until an API serves it, and the right half is her
   * light alone. The opener comes with the items, so no row is ever offered that leads nowhere.
   */
  needs?: { items: readonly Need[]; open: (need: Need) => void; skew?: number } | undefined
  /** The invitations waiting for the person (InvitedBand, A16): right under the greeting; nothing when none waits. */
  invited?: ReactNode
  actions: {
    /** Into your conversation with her (unlocking it first, when locked). */
    personal: () => void
    notes: () => void
    work: () => void
    newProject: () => void
    unlock: () => void
    /** A row's one press: open the project, join its room, or back to the call you are in. */
    room: (projectId: string, action: HomeAction) => void
    /** Hands the words to Sophia's conversation, which opens and sends them as its own. */
    say: (text: string) => void
    /** Opens a project at Updates: what changed there since you last looked. */
    updates: (projectId: string) => void
  }
}

const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Sophia's mood on Home: listening while you write or speak to her, or move; else at rest. */
const moodOf = (writing: boolean, at: Point | null): LightMode => (writing || at ? 'listen' : 'rest')

/**
 * Where the pointer is, in the light's own box, once a frame: she turns towards it anywhere on the page. Not on touch,
 * not under reduced motion, and not while Home is out of sight (another place is): she doesn't follow what she can't see.
 */
function usePointerIn(box: RefObject<HTMLDivElement | null>, hidden: boolean) {
  const [at, setAt] = useState<Point | null>(null)
  useEffect(() => {
    if (still() || hidden) return undefined
    let frame = 0
    const move = (e: PointerEvent) => {
      const b = box.current?.getBoundingClientRect()
      if (!b || b.width === 0 || e.pointerType === 'touch' || frame) return
      const point = { x: Math.round(e.clientX - b.left), y: Math.round(e.clientY - b.top) }
      frame = requestAnimationFrame(() => {
        frame = 0
        setAt(point)
      })
    }
    const leave = () => {
      cancelAnimationFrame(frame)
      frame = 0
      setAt(null)
    }
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      leave()
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [box, hidden])
  return at
}

/** A piece of her sentence: the project's name strong, Open Updates a press to that project's Updates. */
function Piece({ said, onUpdates }: { said: Said; onUpdates: (projectId: string) => void }) {
  const { updates } = said
  if (updates)
    return (
      <button className="text-button" type="button" onClick={() => onUpdates(updates)}>
        {said.text}
      </button>
    )
  return said.strong ? <strong>{said.text}</strong> : <span>{said.text}</span>
}

function Greeting({ hello, name, date, says, actions }: Pick<Props, 'hello' | 'name' | 'date' | 'says' | 'actions'>) {
  const words = says.map((s, i) => <Piece key={i} said={s} onUpdates={actions.updates} />)
  // What changed since you last looked is news: the others are where things stand, and a countdown said every minute
  // would be noise (docs/plans/home-since-you-looked.md).
  const news = says.some((s) => s.updates !== undefined)
  return (
    <header className="hw-head">
      <p className="hw-date">{date}</p>
      <h2 className="hw-hello">
        {name ? (
          <>
            <span>{hello},</span>
            <span className="hw-name">{name}.</span>
          </>
        ) : (
          <span>{hello}.</span>
        )}
      </h2>
      {says.length > 0 && !news && <p className="hw-says">{words}</p>}
      {/* Mounted all along, so news is announced as it comes, never taking the focus. With nothing to say it holds her
          sentence's place, so nothing below moves when one comes or goes with Home open (home-no-false-claim.md);
          beside another sentence it is empty, 0 px high. */}
      <p className={news ? 'hw-says' : says.length > 0 ? undefined : 'hw-says-held'} role="status">
        {news && words}
      </p>
    </header>
  )
}

const ACTION_WORDS: Record<HomeAction, string> = { open: 'Open', join: 'Join the room', back: 'Back to the room' }

function Row({ row, index, onPress }: { row: HomeRow; index: number; onPress: () => void }) {
  const note = rowNote(row)
  return (
    <li style={{ '--i': index }}>
      <button
        className="hw-row"
        type="button"
        data-tone={note.tone}
        data-act={row.action}
        onClick={onPress}
        onPointerMove={followPointer}
      >
        <span className="hw-n" aria-hidden>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="hw-t">{row.project.title}</span>
        <span className="hw-m">{note.text}</span>
        <span className="hw-go">
          <span className="hw-go-words">{ACTION_WORDS[row.action]}</span>
          <span aria-hidden>→</span>
        </span>
      </button>
    </li>
  )
}

function Index(props: Pick<Props, 'projects' | 'loadingProjects' | 'now' | 'inCallProject' | 'count' | 'actions'>) {
  const { projects, actions } = props
  if (!projects) {
    if (!props.loadingProjects) return null
    return <Skeleton kind="row" count={3} label="Reading your projects…" />
  }
  const rows = homeRows(projects, props.now, props.inCallProject)
  return (
    <ol className="hw-index" aria-label="Your projects" data-door="work" onKeyDown={moveInIndex}>
      {rows.map((row, i) => (
        <Row
          key={row.project.projectId}
          row={row}
          index={i}
          onPress={() => actions.room(row.project.projectId, row.action)}
        />
      ))}
      <li style={{ '--i': rows.length }}>
        {projects.length === 0 ? (
          <button className="hw-row hw-more" type="button" onClick={actions.newProject}>
            <span className="hw-n" aria-hidden>
              +
            </span>
            <span className="hw-t">Start a project</span>
            <span className="hw-m">Invite your team when you’re ready</span>
          </button>
        ) : (
          <button className="hw-row hw-more" type="button" onClick={actions.work}>
            <span className="hw-n" aria-hidden />
            <span className="hw-t">All {props.count}</span>
            <span className="hw-go">
              <span aria-hidden>→</span>
            </span>
          </button>
        )}
      </li>
    </ol>
  )
}

interface Talk {
  /** Writing to her, or speaking: she listens, towards the line. */
  writing: boolean
}

/**
 * "/" reaches the line from anywhere on Home, unless something else is being written in, or a sheet or a menu is open
 * over Home: those keep their keys.
 */
function useSlashReaches(field: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || modalOnScreen()) return
      const t = e.target
      const elsewhere = 'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]'
      if (t instanceof HTMLElement && t.closest(elsewhere)) return
      if (!field.current || !onScreen(field.current)) return
      e.preventDefault()
      field.current.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [field])
}

/**
 * Your words to Sophia: handed to her conversation, which opens and sends them as its own (one at a time, under their
 * own key, back in its field if they don't go). Spoken words land in the line first, to read and send; the microphone
 * stops when Home goes out of sight (dictation.ts; your voice never leaves the device).
 */
function useSay(say: Props['actions']['say'], hidden: boolean) {
  const [text, setText] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const voice = useDictation((heard) => {
    setText((was) => (was ? `${was} ${heard}` : heard))
    field.current?.focus()
  }, hidden)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const words = text.trim()
    if (!words) return
    setText('')
    say(words)
  }
  return { text, setText, field, submit, voice }
}

/** Speak instead: the line listens while you do; pressed again, it stops. Your voice stays on this device. */
function Mic({ voice }: { voice: ReturnType<typeof useDictation> }) {
  if (!voice.available) return null
  return (
    <Button
      kind="icon"
      size="sm"
      className="hw-mic"
      aria-pressed={voice.listening}
      aria-label="Speak instead"
      onClick={voice.listening ? voice.stop : voice.start}
      tip={{ label: 'Speak instead. Your voice stays on this device.', side: 'top', align: 'end' }}
    >
      <Icon name={voice.listening ? 'stop' : 'mic'} />
    </Button>
  )
}

interface LineProps {
  actions: Props['actions']
  onTalk: (t: Talk) => void
  line: RefObject<HTMLElement | null>
  hidden: boolean
  here: boolean
  /** The next ask the line suggests (docs/plans/next-ask-places.md), and what Tab puts in; null with none. */
  next: { words: string; why: string; full: string } | null
}

/**
 * The line's suggestion: shown while it is empty and she is not listening, put away for the visit by Esc; Tab or → puts
 * it in the line. Its key cap stands while the line is focused.
 */
function useLineNext(
  next: LineProps['next'],
  text: string,
  listening: boolean,
  setText: (words: string) => void,
  here: boolean,
) {
  const [away, setAway] = useState(false)
  // Put away for this visit only: Home left (it stays mounted under a hidden place), the next visit offers the ask
  // again (Codex on #268). A visit begins when Home is arrived at again, from the move's first frame: a move reversed
  // before it settles still begins one (Codex P2 on #268), and Home fading out as it is left never shows the ask again
  // (Codex on #276).
  const wasHere = useRef(here)
  useEffect(() => {
    if (here && !wasHere.current) setAway(false)
    wasHere.current = here
  }, [here])
  const [focused, setFocused] = useState(false)
  const id = useId()
  const shown = !away && !listening && text === '' ? next : null
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const { key, shiftKey, altKey, ctrlKey, metaKey } = e
    const press = { key, shiftKey, altKey, ctrlKey, metaKey, isComposing: e.nativeEvent.isComposing }
    const move = nextAskKey(press, text, shown !== null)
    if (!move || !shown) return
    e.preventDefault()
    if (move === 'accept') setText(shown.full)
    else setAway(true)
  }
  return { id, shown, cap: focused ? shown : null, onKey, setFocused }
}

/** One line to write to Sophia, no box, or to speak to her. */
function SayLine({ actions, onTalk, line, hidden, here, next }: LineProps) {
  const s = useSay(actions.say, hidden)
  useSlashReaches(s.field)
  const listening = s.voice.listening
  const ask = useLineNext(next, s.text, listening, s.setText, here)
  // She listens while you speak, and until you leave the line; a dictation that heard nothing lets her rest.
  useEffect(() => {
    onTalk({ writing: listening || document.activeElement === s.field.current })
  }, [listening, onTalk, s.field])
  return (
    <form
      className="hw-say"
      data-listening={listening || undefined}
      onSubmit={s.submit}
      ref={(el) => void (line.current = el)}
    >
      <span className="hw-private" title="Only she hears this" aria-hidden>
        <Icon name="lock" />
      </span>
      <input
        ref={s.field}
        aria-label="Say something to Sophia"
        aria-describedby={ask.cap ? `hw-private-note ${ask.id}` : 'hw-private-note'}
        placeholder={listening ? 'Listening…' : (ask.shown?.words ?? 'Say something to Sophia')}
        value={s.text}
        readOnly={listening}
        onChange={(e) => s.setText(e.target.value)}
        onKeyDown={ask.onKey}
        onFocus={() => {
          ask.setFocused(true)
          onTalk({ writing: true })
        }}
        onBlur={() => {
          ask.setFocused(false)
          onTalk({ writing: listening })
        }}
      />
      <span id="hw-private-note" className="sr-only">
        Only she hears this
      </span>
      <Mic voice={s.voice} />
      {ask.cap ? (
        <NextAskHint
          id={ask.id}
          why={ask.cap.why}
          description={`Suggested: ${ask.cap.words}. ${ask.cap.why}. Tab puts it in the line; Escape puts it away.`}
        />
      ) : (
        <kbd aria-hidden>{s.text ? '↵' : '/'}</kbd>
      )}
    </form>
  )
}

/** The line's place in You (homeLine): the line, that she can't answer yet with a note instead, or the place held. */
function LineSlot({ shows, ...say }: LineProps & { shows: HomeLine | null }) {
  if (shows === 'line') return <SayLine {...say} />
  if (shows === 'cannot')
    return (
      <p className="hw-off">
        <span>Sophia can’t answer here yet</span>
        <span aria-hidden>·</span>
        <button className="text-button" type="button" onClick={say.actions.notes}>
          Write a note
        </button>
      </p>
    )
  return shows === 'held' ? <div className="hw-held" aria-hidden /> : null
}

/** You and Sophia, private: where you left off (or the padlock), your notes, and the line to her: alone on a first visit. */
function You(props: Pick<Props, 'you' | 'locked' | 'answers'> & LineProps) {
  const { you, locked, answers, actions, onTalk, line, hidden, here, next } = props
  return (
    <section className="hw-section hw-you" aria-labelledby="hw-you-h">
      {/* Your notes in the head, as Personal's head carries them (docs/plans/home-first-glance.md). */}
      <div className="hw-label-row">
        <h3 id="hw-you-h" className="hw-label" tabIndex={-1}>
          You and Sophia
        </h3>
        {you && you.notes !== null && (
          <button className="text-button hw-notes" type="button" onClick={actions.notes}>
            {notesLabel(you.notes)} <span aria-hidden>→</span>
          </button>
        )}
      </div>
      {you && (
        <ol className="hw-index" aria-label="You and Sophia">
          <li style={{ '--i': 0 }}>
            <button className="hw-row" type="button" data-tone="you" onClick={actions.personal}>
              <span className={`hw-n hw-her${locked ? ' locked' : ''}`} aria-hidden>
                {locked && <Icon name="lock" />}
              </span>
              <span className="hw-t">{you.verb}</span>
              <span className="hw-m">{you.meta}</span>
              <span className="hw-go">
                <span aria-hidden>→</span>
              </span>
            </button>
          </li>
        </ol>
      )}
      <LineSlot shows={homeLine(locked, answers)} {...{ actions, onTalk, line, hidden, here, next }} />
    </section>
  )
}

/** Her light behind Umbral, formed (docs/plans/home-light-mark.md): your half rises to hers once, on arrival. */
const FORMED = { from: null }

/** The phone's layout (personal.css): her light top right of the page, its mark the 48 px one the greeting keeps clear of. */
const PHONE = '(max-width: 860px)'

/**
 * Where her mark rests in the light's box, measured as the box changes: 96 px wherever there is room (threshold.ts),
 * and at a column's head on a wide screen; on a phone the column is gone and the 48 px rule stands (Codex on #237).
 */
function useMarkRest(box: RefObject<HTMLDivElement | null>, large: boolean): LightTarget | null {
  const [rest, setRest] = useState<LightTarget | null>(null)
  useLayoutEffect(() => {
    const b = box.current
    if (!b) return undefined
    const phone = matchMedia(PHONE)
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = b
      // Out of sight the box has no size: keep where it was, so the mark is never placed at nothing.
      if (width < 1 || height < 1) return
      const at = defaultTarget(width, height)
      // At a column's head the box is small and the mark is still the 96 px emblem: the radius is given, not earned.
      const emblem = large && !phone.matches
      const next = emblem ? { ...at, radius: Math.max(at.radius, 160) } : roomForMark(at, width, height)
      setRest((was) => (was?.x === next.x && was.y === next.y && was.radius === next.radius ? was : next))
    }
    measure()
    const resized = new ResizeObserver(measure)
    resized.observe(b)
    phone.addEventListener('change', measure)
    return () => {
      resized.disconnect()
      phone.removeEventListener('change', measure)
    }
  }, [box, large])
  return rest
}

/**
 * Sophia's own light, alone on the right, standing behind the mark: its rays turn to you as you move, and to the line
 * while you write or speak to her.
 */
function Light({
  talk,
  line,
  hidden,
  large = false,
}: {
  talk: Talk
  line: RefObject<HTMLElement | null>
  hidden: boolean
  /** At a column's head: the 96 px emblem in a small box. */
  large?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const at = usePointerIn(box, hidden)
  // While you write to her, she attends to the line you write on, measured once each time you start.
  const [writingAt, setWritingAt] = useState<Point | null>(null)
  useLayoutEffect(() => {
    const b = box.current?.getBoundingClientRect()
    const f = line.current?.getBoundingClientRect()
    setWritingAt(
      talk.writing && b && f
        ? { x: Math.round(f.left + f.width / 2 - b.left), y: Math.round(f.top + f.height / 2 - b.top) }
        : null,
    )
  }, [talk.writing, line])
  const attention = talk.writing ? writingAt : at
  const rest = useMarkRest(box, large)
  return (
    <div className="hw-light" ref={box} data-door="personal" aria-hidden>
      <SophiaLight
        mode={moodOf(talk.writing, attention)}
        target={rest}
        attention={attention}
        working={false}
        formed={FORMED}
      />
    </div>
  )
}

/** Home's one column (personal.css, ≤ 860 px): there what needs you comes right after the greeting. */
const ONE_COLUMN = '(max-width: 860px)'

/** «What needs you», wherever it is mounted. */
const NEEDS = '[aria-label="What needs you"]'

/** Kept while the list's own heading has the focus: no need's id is empty, so it never names a need. */
const HEADING = ''

/**
 * The focus kept on a need when the list moves across 860 px (home-needs-focus.md; Codex P2 on #289): which need had
 * it is remembered by its id, forgotten once the focus goes elsewhere, and that need takes it again after the move if
 * the focus fell to the page. By the need, not its place: the list is read again every 20 s, and a need may come ahead
 * or leave (Codex P2 on #377). One that left is not stood in for by another need: the list's heading takes the focus
 * instead of the page, and keeps it across the next move as a need would (Codex P2 on #442).
 */
function useNeedsFocus(home: RefObject<HTMLDivElement | null>, oneColumn: boolean) {
  const kept = useRef<string | null>(null)
  useEffect(() => {
    const el = home.current
    const onFocus = (e: FocusEvent) => {
      const target = e.target instanceof Element ? e.target : null
      const need = target?.closest<HTMLElement>('[data-need]')?.dataset.need ?? HEADING
      kept.current = target?.closest(NEEDS) ? need : null
    }
    el?.addEventListener('focusin', onFocus)
    return () => el?.removeEventListener('focusin', onFocus)
  }, [home])
  useLayoutEffect(() => {
    const need = kept.current
    const fell = document.activeElement === null || document.activeElement === document.body
    if (need === null || !fell) return
    const list = home.current?.querySelector(NEEDS)
    const rows = [...(list?.querySelectorAll<HTMLElement>('[data-need]') ?? [])]
    // By the dataset, so an id such as permission:wait-w1 needs no escaping in a selector.
    const row = rows.find((r) => r.dataset.need === need)
    ;(row ?? list?.querySelector<HTMLElement>('#hw-needs-h'))?.focus()
  }, [home, oneColumn])
}

export function Welcome(props: Props) {
  const [talk, setTalk] = useState<Talk>({ writing: false })
  const line = useRef<HTMLElement | null>(null)
  // Mounted where it is read: on one column right after the greeting, in the document as on the screen, so a keyboard
  // and a screen reader meet it where the eye does (docs/plans/home-phone-needs.md); beside the words otherwise.
  const oneColumn = useMedia(ONE_COLUMN)
  const home = useRef<HTMLDivElement>(null)
  useNeedsFocus(home, oneColumn)
  const needs = props.needs && (
    <NeedsYou needs={props.needs.items} now={onService(props.now, props.needs.skew)} onOpen={props.needs.open} />
  )
  return (
    <div className="hw" ref={home}>
      <div className="hw-col">
        <Greeting hello={props.hello} name={props.name} date={props.date} says={props.says} actions={props.actions} />
        {props.invited}
        {needs && oneColumn && (
          <aside className="hw-needs-here" aria-label="What needs you">
            {needs}
          </aside>
        )}
        <ReadNotes reads={props.reads} />
        <You
          you={props.you}
          locked={props.locked}
          answers={props.answers}
          actions={props.actions}
          onTalk={setTalk}
          line={line}
          hidden={props.hidden}
          here={props.here}
          next={homeNextAsk(props.projects, props.now)}
        />
        {(props.projects || props.loadingProjects) && (
          <section className="hw-section" aria-labelledby="hw-work-h">
            <h3 id="hw-work-h" className="hw-label">
              Projects
            </h3>
            <Index
              projects={props.projects}
              loadingProjects={props.loadingProjects}
              now={props.now}
              inCallProject={props.inCallProject}
              count={props.count}
              actions={props.actions}
            />
          </section>
        )}
      </div>
      {needs && !oneColumn ? (
        <aside className="hw-side" aria-label="What needs you">
          <Light talk={talk} line={line} hidden={props.hidden} large />
          {needs}
        </aside>
      ) : (
        <Light talk={talk} line={line} hidden={props.hidden} />
      )}
    </div>
  )
}
