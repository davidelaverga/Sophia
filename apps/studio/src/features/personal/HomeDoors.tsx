// Home: a short greeting, two quiet doors, each one clickable as a whole, and a hairline with a lock between them
// (direction C). The first visit explains the line in one sentence above the doors; it never covers either door. A
// read that is slow or failed says so above the doors (ReadNotes), and a door still loading only opens.
import type { ProjectSummary } from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
import { shortName } from '../voice/room-view.ts'
import { INTRO, LOCK_TIP, notesLabel, roomCaption, type LockedBy, type WorkDoor, type YouDoor } from './places-view.ts'
import { ReadNotes, type Read } from './ReadNotes.tsx'

interface Props {
  hello: string
  date: string
  explain: boolean
  reads: readonly Read[]
  you: YouDoor
  work: WorkDoor
  /** The person's own initial, for the empty seats of a first project. */
  initial: string
  lockedBy: LockedBy | null
  actions: {
    personal: () => void
    notes: () => void
    work: () => void
    lock: () => void
    explained: () => void
  }
}

function Intro({ onDone }: { onDone: () => void }) {
  return (
    <p className="c2-intro" role="note">
      <span className="c2-intro-lock" aria-hidden>
        <Icon name="lock" />
      </span>
      <span>
        <strong>{INTRO.lead}</strong> {INTRO.rest}
      </span>
      <button className="text-button" type="button" onClick={onDone}>
        Got it
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

function YouDoorView({ you, locked, actions }: Pick<Props, 'you' | 'actions'> & { locked: boolean }) {
  return (
    <article className={`c2-door you${locked ? ' locked' : ''}`} data-door="personal" aria-labelledby="c-you-h">
      <span className="field-label">Personal</span>
      <h3 id="c-you-h">You and Sophia</h3>
      <div className="c2-visual">
        <div className="c2-orb" aria-hidden />
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

/** Who is in the busiest room: people as warm presences, Sophia as her light. A first project shows empty seats. */
function Room({ shown, initial }: { shown: ProjectSummary | null; initial: string }) {
  if (!shown?.room) {
    return (
      <div className="c2-room" aria-hidden>
        <span className="p">{initial}</span>
        <span className="p seat" />
        <span className="p seat" />
      </div>
    )
  }
  return (
    <div className="c2-room" aria-hidden>
      {shown.room.people.slice(0, 3).map((name, i) => (
        <span key={`${name}-${i}`} className="p">
          {shortName(name).charAt(0)}
        </span>
      ))}
      {shown.room.sophia && <span className="s" />}
    </div>
  )
}

function WorkDoorView({ work, initial, actions }: Pick<Props, 'work' | 'initial' | 'actions'>) {
  const caption = roomCaption(work.shown)
  return (
    <article className={`c2-door job${work.joins ? ' soon' : ''}`} data-door="work" aria-labelledby="c-work-h">
      <span className="field-label">Work</span>
      <h3 id="c-work-h">Your projects</h3>
      <div className="c2-visual">
        {work.known && <Room shown={work.shown} initial={initial} />}
        {caption && <p className="c2-room-cap">{caption}</p>}
      </div>
      <div className="c2-foot">
        <Main verb={work.verb} meta={work.meta} onOpen={actions.work} />
        <div className="c2-acts">{work.count && <span className="c2-count">{work.count}</span>}</div>
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
        aria-pressed={!!lockedBy}
        aria-label={LOCK_TIP.open.label}
        onClick={onLock}
      >
        <span className="open">
          <Icon name="unlock" />
        </span>
        <span className="shut">
          <Icon name="lock" />
        </span>
        <Tip label={tip.label} {...(tip.keys ? { keys: tip.keys } : {})} side="bottom" />
      </button>
    </div>
  )
}

export function HomeDoors({ hello, date, explain, reads, you, work, initial, lockedBy, actions }: Props) {
  return (
    <>
      <header className="c2-hello">
        <h2>{hello}</h2>
        <p className="c2-date">{date}</p>
      </header>
      {explain && <Intro onDone={actions.explained} />}
      <ReadNotes reads={reads} />
      <div className="c2-doors">
        <YouDoorView you={you} locked={!!lockedBy} actions={actions} />
        <Line lockedBy={lockedBy} onLock={actions.lock} />
        <WorkDoorView work={work} initial={initial} actions={actions} />
      </div>
    </>
  )
}
