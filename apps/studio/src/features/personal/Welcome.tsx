// Home, the Welcome (docs/plans/home-welcome.md): an editorial page that knows you. On the left, the date, the greeting
// and Sophia's one sentence; then you and Sophia (where you left off, your notes, a line to write or speak to her) and
// your projects (the ones Work shows first); on the right, alone, her own light behind Umbral, whose rays turn to you as
// you move and to the line while you write or speak to her. Given what needs you (needs-you.ts, behind the vision
// flag), the right half is a column: her light at its head (the 96 px emblem in a small box), the needs under it.
import type { ProjectSummary } from '@sophia/contracts'
import { Button, Icon, Skeleton } from '@sophia/ui'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { modalOnScreen, onScreen } from '../../app/shortcuts.ts'
import { defaultTarget, type LightMode, type LightTarget } from '../light/engine.ts'
import type { Point } from '../light/motion.ts'
import { SophiaLight } from '../light/SophiaLight.tsx'
import { roomForMark } from '../light/threshold.ts'
import { followPointer } from '../resources/motion.ts'
import { useDictation } from './dictation.ts'
import { moveInIndex } from './index-keys.ts'
import type { Need } from './needs-you.ts'
import { NeedsYou } from './NeedsYou.tsx'
import { homeRows, notesLabel, rowNote, type HomeAction, type HomeRow, type Said, type YouDoor } from './places-view.ts'
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
  /** Home is out of sight (another place is): the microphone stops and her light stops following. */
  hidden: boolean
  /**
   * What needs you (needs-you.ts) and what opens one: undefined until an API serves it, and the right half is her
   * light alone. The opener comes with the items, so no row is ever offered that leads nowhere.
   */
  needs?: { items: readonly Need[]; open: (need: Need) => void } | undefined
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

function Greeting({ hello, name, date, says }: Pick<Props, 'hello' | 'name' | 'date' | 'says'>) {
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
      {says.length > 0 && (
        <p className="hw-says">
          {says.map((s, i) => (s.strong ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))}
        </p>
      )}
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
}

/** One line to write to Sophia, no box, or to speak to her. */
function SayLine({ actions, onTalk, line, hidden }: LineProps) {
  const s = useSay(actions.say, hidden)
  useSlashReaches(s.field)
  const listening = s.voice.listening
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
        aria-describedby="hw-private-note"
        placeholder={listening ? 'Listening…' : 'Say something to Sophia'}
        value={s.text}
        readOnly={listening}
        onChange={(e) => s.setText(e.target.value)}
        onFocus={() => onTalk({ writing: true })}
        onBlur={() => onTalk({ writing: listening })}
      />
      <span id="hw-private-note" className="sr-only">
        Only she hears this
      </span>
      <Mic voice={s.voice} />
      <kbd aria-hidden>{s.text ? '↵' : '/'}</kbd>
    </form>
  )
}

/** You and Sophia, private: where you left off (or the padlock), your notes, and the line to her: alone on a first visit. */
function You({ you, locked, actions, onTalk, line, hidden }: Pick<Props, 'you' | 'locked'> & LineProps) {
  return (
    <section className="hw-section hw-you" aria-labelledby="hw-you-h">
      <h3 id="hw-you-h" className="hw-label" tabIndex={-1}>
        You and Sophia
      </h3>
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
          {you.notes !== null && (
            <li style={{ '--i': 1 }}>
              <button className="hw-row hw-more" type="button" onClick={actions.notes}>
                <span className="hw-n" aria-hidden />
                <span className="hw-t">{notesLabel(you.notes)}</span>
                <span className="hw-go">
                  <span aria-hidden>→</span>
                </span>
              </button>
            </li>
          )}
        </ol>
      )}
      {!locked && <SayLine actions={actions} onTalk={onTalk} line={line} hidden={hidden} />}
    </section>
  )
}

/** Her light behind Umbral, formed (docs/plans/home-light-mark.md): your half rises to hers once, on arrival. */
const FORMED = { from: null }

/** Where her mark rests in the light's box, measured as the box changes: 96 px wherever there is room (threshold.ts). */
function useMarkRest(box: RefObject<HTMLDivElement | null>, large: boolean): LightTarget | null {
  const [rest, setRest] = useState<LightTarget | null>(null)
  useLayoutEffect(() => {
    const b = box.current
    if (!b) return undefined
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = b
      // Out of sight the box has no size: keep where it was, so the mark is never placed at nothing.
      if (width < 1 || height < 1) return
      const at = defaultTarget(width, height)
      // At a column's head the box is small and the mark is still the 96 px emblem: the radius is given, not earned.
      const next = large ? { ...at, radius: Math.max(at.radius, 160) } : roomForMark(at, width, height)
      setRest((was) => (was?.x === next.x && was.y === next.y && was.radius === next.radius ? was : next))
    }
    measure()
    const resized = new ResizeObserver(measure)
    resized.observe(b)
    return () => resized.disconnect()
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

export function Welcome(props: Props) {
  const [talk, setTalk] = useState<Talk>({ writing: false })
  const line = useRef<HTMLElement | null>(null)
  return (
    <div className="hw">
      <div className="hw-col">
        <Greeting hello={props.hello} name={props.name} date={props.date} says={props.says} />
        <ReadNotes reads={props.reads} />
        <You
          you={props.you}
          locked={props.locked}
          actions={props.actions}
          onTalk={setTalk}
          line={line}
          hidden={props.hidden}
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
      {props.needs ? (
        <aside className="hw-side" aria-label="What needs you">
          <Light talk={talk} line={line} hidden={props.hidden} large />
          <NeedsYou needs={props.needs.items} now={props.now} onOpen={props.needs.open} />
        </aside>
      ) : (
        <Light talk={talk} line={line} hidden={props.hidden} />
      )}
    </div>
  )
}
