// Home, the Welcome (docs/plans/home-welcome.md): a place that knows where you'll go, in the Studio's own anatomy. The
// views' head (the greeting, a summary on the right, a hairline), a line for what wants you now, and two sides with
// the padlock between: Sophia's own light, which turns to you when you point at her door, and the projects Work shows
// first, one press each. The first visit explains the line in one sentence that folds away; nothing jumps.
import type { ProjectSummary } from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { modalOnScreen, onScreen } from '../../app/shortcuts.ts'
import { SophiaLight } from '../light/SophiaLight.tsx'
import type { Point } from '../light/motion.ts'
import { followPointer } from '../resources/motion.ts'
import { shortName } from '../voice/room-view.ts'
import {
  HOME_ACTION,
  homeRows,
  INTRO,
  LOCK_TIP,
  notesLabel,
  type HomeAttention,
  type HomeRow,
  type HomeAction,
  type LockedBy,
  type YouDoor,
} from './places-view.ts'
import { ReadNotes, type Read } from './ReadNotes.tsx'

interface Props {
  hello: string
  date: string
  /** On the right of the head: how many projects, and the soonest session (homeSummary). */
  summary: string
  attention: HomeAttention | null
  explain: boolean
  reads: readonly Read[]
  you: YouDoor
  /** Under the rows, beside All projects: how many, and the notes carried from you (workCount). */
  count: string
  /** Undefined until they have loaded. */
  projects: readonly ProjectSummary[] | undefined
  /** Their read is on its way: placeholders until it lands; a read that failed has its own note (ReadNotes). */
  loadingProjects: boolean
  now: Date
  inCallProject: string | null
  lockedBy: LockedBy | null
  actions: {
    personal: () => void
    notes: () => void
    work: () => void
    newProject: () => void
    lock: () => void
    explained: () => void
    /** A row's one press: open the project, join its room, or back to the call you are in. */
    room: (projectId: string, action: HomeAction) => void
  }
}

/** How long the first-visit note takes to fold away (personal.css, .c2-fold). */
const FOLD_MS = 260

/** The line explained once, in one sentence. "Got it" folds it away; the doors glide up, they never jump. */
function Intro({ onDone }: { onDone: () => void }) {
  const [folding, setFolding] = useState(false)
  const note = useRef<HTMLDivElement>(null)
  const fold = () => {
    setFolding(true)
    setTimeout(onDone, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : FOLD_MS)
  }
  // Esc folds it the same way, while Home is on screen; elsewhere Esc is the place's own (Places.tsx).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      // A sheet open over Home owns its Esc; the note stays explained only once it is read and put away.
      if (e.key !== 'Escape' || e.defaultPrevented || modalOnScreen()) return
      if (note.current && onScreen(note.current)) fold()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <div className="c2-fold" data-folding={folding || undefined} ref={note}>
      <div>
        <p className="c2-intro" role="note">
          <span className="c2-intro-lock" aria-hidden>
            <Icon name="lock" />
          </span>
          <span>
            <strong>{INTRO.lead}</strong> {INTRO.rest}
          </span>
          <button className="text-button" type="button" onClick={fold} disabled={folding}>
            Got it
          </button>
        </p>
      </div>
    </div>
  )
}

function Head({ hello, date, summary }: Pick<Props, 'hello' | 'date' | 'summary'>) {
  return (
    <header className="c2-hello">
      <div>
        <h2>{hello}</h2>
        <p className="c2-date">{date}</p>
      </div>
      {summary && <p className="c2-summary">{summary}</p>}
    </header>
  )
}

/** What wants you now, said once: a session about to start, or people in a room; its one action joins. */
function Attention({ attention, onJoin }: { attention: HomeAttention; onJoin: () => void }) {
  return (
    <p className="c2-attention" data-tone={attention.tone}>
      <span className="c2-attention-dot" aria-hidden />
      <span>{attention.words}</span>
      <button className="pill primary" type="button" onClick={onJoin}>
        Join
      </button>
    </p>
  )
}

/** The door's one action covers the door; the arrow moves when it is hovered or focused. */
function Main({ verb, meta, onOpen }: { verb: string; meta: string; onOpen: () => void }) {
  return (
    <button className="c2-main" type="button" onClick={onOpen}>
      <span className="c2-verb">{verb}</span>
      <span className="c2-meta">{meta}</span>
      <span className="c2-arrow" aria-hidden>
        →
      </span>
    </button>
  )
}

/** Less motion asked for: her light keeps still, it doesn't follow the pointer. */
const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Sophia's own light in her door: at rest, turning and leaning a little towards you while you point at it, as she does
 * towards whoever writes on the sign-in. Locked, she rests, greyed.
 */
function useNotices(locked: boolean) {
  const [at, setAt] = useState<Point | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  // One update a frame, however fast the pointer moves: the light follows, the door doesn't re-render per event.
  const follow = (e: PointerEvent<HTMLElement>) => {
    const b = box.current?.getBoundingClientRect()
    if (!b || locked || e.pointerType === 'touch' || frame.current || still()) return
    const point = { x: Math.round(e.clientX - b.left), y: Math.round(e.clientY - b.top) }
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      setAt(point)
    })
  }
  const leave = () => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
    setAt(null)
  }
  return { at: locked ? null : at, box, follow, leave }
}

function YouDoorView({ you, locked, actions }: Pick<Props, 'you' | 'actions'> & { locked: boolean }) {
  const notices = useNotices(locked)
  return (
    <article
      className={`c2-door you${locked ? ' locked' : ''}`}
      data-door="personal"
      aria-labelledby="c-you-h"
      onPointerMove={notices.follow}
      onPointerLeave={notices.leave}
    >
      <span className="field-label">Personal</span>
      <h3 id="c-you-h">You and Sophia</h3>
      <div className="c2-visual" ref={notices.box}>
        <SophiaLight
          mode={notices.at ? 'listen' : 'rest'}
          target={null}
          attention={notices.at}
          working={false}
          pull={notices.at}
        />
        <span className="c2-locked" aria-hidden>
          <Icon name="lock" size={28} />
        </span>
      </div>
      <div className="c2-foot">
        <Main verb={you.verb} meta={you.meta} onOpen={actions.personal} />
        <div className="c2-acts">
          {you.notes !== null && (
            <button className="ghost has-tip" type="button" onClick={actions.notes}>
              {notesLabel(you.notes)}
              <Tip label="Your private notes. They open inside your space." keys="T" side="bottom" />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

/** Who is in a project's room now: people as warm initials, Sophia as her light. */
function Faces({ room }: { room: ProjectSummary['room'] }) {
  if (!room || (room.people.length === 0 && !room.sophia)) return null
  return (
    <span className="c2-faces" aria-hidden>
      {room.people.slice(0, 3).map((name, i) => (
        <span key={`${name}-${String(i)}`} className="p">
          {shortName(name).charAt(0)}
        </span>
      ))}
      {room.sophia && <span className="s" />}
    </span>
  )
}

/** ↑ and ↓ move between the rows, as on the board; the first and last hold. */
function moveInList(e: KeyboardEvent<HTMLUListElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.c2-row')]
  const at = buttons.findIndex((b) => b === document.activeElement)
  if (at < 0) return
  e.preventDefault()
  buttons[Math.min(Math.max(at + (e.key === 'ArrowDown' ? 1 : -1), 0), buttons.length - 1)]?.focus()
}

/** One project, one press: its room or its people and session, its faces, and its action once pointed at. */
function Row({ row, index, onPress }: { row: HomeRow; index: number; onPress: () => void }) {
  const { project, card } = row
  return (
    <li style={{ '--i': index }}>
      <button
        className="c2-row"
        type="button"
        data-act={row.action}
        data-soon={row.soon || undefined}
        data-live={row.live || undefined}
        onClick={onPress}
        onPointerMove={followPointer}
      >
        <span className="c2-mono" aria-hidden>
          {project.title.trim().charAt(0).toUpperCase()}
        </span>
        <span className="c2-row-body">
          <span className="c2-row-title">{project.title}</span>
          <span className="c2-row-meta">
            {(row.live || row.soon) && <span className="c2-row-dot" aria-hidden />}
            {card.presence ?? card.meta}
          </span>
        </span>
        <Faces room={project.room} />
        <span className="c2-row-go">
          {HOME_ACTION[row.action]}
          <span aria-hidden> →</span>
        </span>
      </button>
    </li>
  )
}

function Projects(props: Pick<Props, 'projects' | 'loadingProjects' | 'now' | 'inCallProject' | 'actions'>) {
  const { projects, now, inCallProject, actions } = props
  // A read that failed says so above the doors (ReadNotes); no rows keep loading beside it.
  if (!projects && !props.loadingProjects) return null
  if (!projects) {
    return (
      <ul className="c2-rows" aria-label="Your projects" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="c2-row placeholder" aria-hidden />
        ))}
      </ul>
    )
  }
  if (projects.length === 0) {
    return (
      <ul className="c2-rows" aria-label="Your projects">
        <li>
          <button className="c2-row empty" type="button" onClick={actions.newProject}>
            <span className="c2-mono" aria-hidden>
              +
            </span>
            <span className="c2-row-body">
              <span className="c2-row-title">Start a project</span>
              <span className="c2-row-meta">Invite your team when you’re ready</span>
            </span>
          </button>
        </li>
      </ul>
    )
  }
  return (
    <ul className="c2-rows" aria-label="Your projects" onKeyDown={moveInList}>
      {homeRows(projects, now, inCallProject).map((row, i) => (
        <Row
          key={row.project.projectId}
          row={row}
          index={i}
          onPress={() => actions.room(row.project.projectId, row.action)}
        />
      ))}
    </ul>
  )
}

function WorkDoorView(
  props: Pick<Props, 'count' | 'projects' | 'loadingProjects' | 'now' | 'inCallProject' | 'actions'>,
) {
  const { count, projects, actions } = props
  return (
    <article className="c2-door job" data-door="work" aria-labelledby="c-work-h">
      <span className="field-label">Work</span>
      <h3 id="c-work-h">Your projects</h3>
      <Projects
        projects={projects}
        loadingProjects={props.loadingProjects}
        now={props.now}
        inCallProject={props.inCallProject}
        actions={actions}
      />
      <div className="c2-foot">
        <Main verb="All projects" meta={count} onOpen={actions.work} />
      </div>
    </article>
  )
}

function Line({ lockedBy, onLock }: { lockedBy: LockedBy | null; onLock: () => void }) {
  const tip = LOCK_TIP[lockedBy ?? 'open']
  return (
    <div className="c2-line">
      <button
        className="c2-lock has-tip"
        type="button"
        data-locked={lockedBy ? 'true' : 'false'}
        aria-label={tip.label}
        onClick={onLock}
      >
        <span className="open">
          <Icon name="unlock" />
        </span>
        <span className="shut">
          <Icon name="lock" />
        </span>
        <Tip label={tip.label} keys={tip.keys} side="bottom" />
      </button>
    </div>
  )
}

export function HomeDoors(props: Props) {
  const { attention, explain, reads, you, lockedBy, actions } = props
  return (
    <div className="c2-page">
      <Head hello={props.hello} date={props.date} summary={props.summary} />
      {attention && <Attention attention={attention} onJoin={() => actions.room(attention.projectId, 'join')} />}
      {explain && <Intro onDone={actions.explained} />}
      <ReadNotes reads={reads} />
      <div className="c2-doors">
        <YouDoorView you={you} locked={!!lockedBy} actions={actions} />
        <Line lockedBy={lockedBy} onLock={actions.lock} />
        <WorkDoorView
          count={props.count}
          projects={props.projects}
          loadingProjects={props.loadingProjects}
          now={props.now}
          inCallProject={props.inCallProject}
          actions={actions}
        />
      </div>
    </div>
  )
}
