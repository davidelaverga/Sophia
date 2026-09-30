// Home: a short greeting, two quiet doors, each one clickable as a whole, and a hairline with a lock between them
// (direction C). The first visit explains the line in one sentence above the doors; it never covers either door.
import type { ProjectSummary } from '@sophia/contracts'
import { Tip } from '@sophia/ui'
import { shortName } from '../voice/room-view.ts'
import { LockOpen, LockShut } from './icons.tsx'
import { notesLabel, roomCaption, type LockedBy, type WorkDoor, type YouDoor } from './places-view.ts'

interface Props {
  hello: string
  date: string
  explain: boolean
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
        <LockShut />
      </span>
      <span>
        <strong>Private on the left, shared on the right.</strong> Nothing crosses unless you carry it, and the padlock
        closes your side.
      </span>
      <button className="link" type="button" onClick={onDone}>
        Got it
      </button>
    </p>
  )
}

function YouDoorView({ you, locked, actions }: Pick<Props, 'you' | 'actions'> & { locked: boolean }) {
  return (
    <article className={`c2-door you${locked ? ' locked' : ''}`} data-door="personal" aria-labelledby="c-you-h">
      <span className="caps">Personal</span>
      <h3 id="c-you-h">You and Sophia</h3>
      <div className="c2-visual">
        <div className="c2-orb" aria-hidden />
        <span className="c2-locked" aria-hidden>
          <LockShut />
        </span>
      </div>
      <div className="c2-foot">
        <button className="c2-main" type="button" onClick={actions.personal}>
          <span className="c2-verb">{you.verb}</span>
          <span className="c2-meta">{you.meta}</span>
          <span className="c2-arrow" aria-hidden>
            →
          </span>
        </button>
        <div className="c2-acts">
          {you.notes !== null && (
            <button className="btn ghost has-tip" type="button" onClick={actions.notes}>
              {notesLabel(you.notes)} <kbd className="kb-only">T</kbd>
              <Tip label="Your private notes. They open inside your space." side="bottom" />
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
      <span className="caps">Work</span>
      <h3 id="c-work-h">Your projects</h3>
      <div className="c2-visual">
        <Room shown={work.shown} initial={initial} />
        {caption && <p className="c2-room-cap">{caption}</p>}
      </div>
      <div className="c2-foot">
        <button className="c2-main" type="button" onClick={actions.work}>
          <span className="c2-verb">{work.verb}</span>
          <span className="c2-meta">{work.meta}</span>
          <span className="c2-arrow" aria-hidden>
            →
          </span>
        </button>
        <div className="c2-acts">{work.count && <span className="c2-count">{work.count}</span>}</div>
      </div>
    </article>
  )
}

const LOCK_TIP = {
  open: { label: 'Lock your personal side', keys: 'L' },
  you: { label: 'Unlock with your passkey', keys: 'L' },
  room: { label: 'Locked while you’re in a room. Leaving opens it.', keys: undefined },
} as const

function Line({ lockedBy, onLock }: { lockedBy: LockedBy | null; onLock: () => void }) {
  const name = lockedBy ? 'Unlock your personal side' : 'Lock your personal side'
  const tip = LOCK_TIP[lockedBy ?? 'open']
  return (
    <div className="c2-line">
      <button className="c2-lock has-tip" type="button" aria-pressed={!!lockedBy} aria-label={name} onClick={onLock}>
        <LockOpen className="open" />
        <LockShut className="shut" />
        <Tip label={tip.label} {...(tip.keys ? { keys: tip.keys } : {})} side="bottom" />
      </button>
    </div>
  )
}

export function HomeDoors({ hello, date, explain, you, work, initial, lockedBy, actions }: Props) {
  return (
    <>
      <header className="c2-hello">
        <h2>{hello}</h2>
        <p className="c2-date">{date}</p>
      </header>
      {explain && <Intro onDone={actions.explained} />}
      <div className="c2-doors">
        <YouDoorView you={you} locked={!!lockedBy} actions={actions} />
        <Line lockedBy={lockedBy} onLock={actions.lock} />
        <WorkDoorView work={work} initial={initial} actions={actions} />
      </div>
    </>
  )
}
