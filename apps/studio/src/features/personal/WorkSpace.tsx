// Work (direction C): the projects this person belongs to, each with its one action (join the room when someone is in
// it or a session is about to start, else open it), and the notes carried to it: yours marked as coming from your
// personal space and yours to take back, a teammate's marked as theirs. Until the list has loaded it shows neither
// projects nor "No projects yet"; a list that failed says so, with Try again.
import { useEffect, useRef, useState } from 'react'
import type { ProjectCreated, ProjectRelease, ProjectSummary } from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
import { createProject } from '../../api/client.ts'
import { useAdmission, type AdmissionState } from '../../api/useAdmission.ts'
import { useMounted } from '../../app/useMounted.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { AdmissionNote } from '../access/AdmissionNote.tsx'
import { shortName } from '../voice/room-view.ts'
import { CARD_ACTION, carriedFrom, EDGE_TIP, projectCard, workOrder, type LockedBy } from './places-view.ts'
import { ReadNotes, type Read } from './ReadNotes.tsx'
import { useCapped } from './useCapped.ts'

/** The most characters a project's title holds. */
const TITLE_MOST = 180

interface Props {
  hidden: boolean
  token: string
  /** Undefined until the list has loaded (`read` says how that goes). */
  projects: readonly ProjectSummary[] | undefined
  read: Read
  /** Releases carried since Work was last shown: marked, once. */
  fresh: ReadonlySet<string>
  /** The project whose room this person is in, if any. */
  inCallProject: string | null
  personalLock: LockedBy | null
  newProject: { open: boolean; set: (open: boolean) => void }
  actions: {
    open: (projectId: string) => void
    join: (projectId: string) => void
    leaveRoom: () => void
    takeBack: (release: ProjectRelease, project: ProjectSummary) => void
    /** Whether a note's take-back is on its way: its press waits ("Taking back…"). */
    takingBack: (releaseId: string) => boolean
    cross: () => void
  }
}

function Edge({ lock, onCross }: { lock: LockedBy | null; onCross: () => void }) {
  return (
    <button
      className={`c3-edge left has-tip${lock ? ' locked' : ''}`}
      type="button"
      aria-label="Cross to Personal"
      onClick={onCross}
    >
      <span className="c2-lock" aria-hidden>
        <span className="go">
          <Icon name="back" />
        </span>
        <span className="shut">
          <Icon name="lock" />
        </span>
      </span>
      <span className="c3-edge-label">Personal</span>
      <Tip label={EDGE_TIP[lock ?? 'open']} {...(lock ? {} : { keys: 'P' })} side="top" />
    </button>
  )
}

const START_WORDS = { idle: 'Start the project', sending: 'Creating…', unknown: 'Try again' } as const

interface TitleProps {
  title: string
  status: AdmissionState<string, ProjectCreated>['status']
  onTitle: (title: string) => void
  onClose: () => void
}

/** The title and its Start, in one field; Esc lets the form go. After no answer, the title waits as it was sent. */
function TitleField({ title, status, onTitle, onClose }: TitleProps) {
  const capping = useCapped(TITLE_MOST, title, onTitle)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => field.current?.focus(), [])
  const words = status === 'sending' || status === 'unknown' ? START_WORDS[status] : START_WORDS.idle
  return (
    <div className="field">
      <label className="sr-only" htmlFor="c-newproj">
        Project title
      </label>
      <input
        ref={field}
        id="c-newproj"
        required
        // 180 characters, as the API counts (maxLength counts UTF-16 units: an emoji as two).
        placeholder="Name the project"
        value={title}
        readOnly={status === 'unknown'}
        {...capping}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.preventDefault()
          onClose()
        }}
      />
      <button className="pill primary" type="submit" disabled={status === 'sending' || !title.trim()}>
        {words}
      </button>
    </div>
  )
}

function NewProject({
  token,
  shown,
  onCreated,
  onAdded,
  onClose,
}: {
  token: string
  /** Work is the place on screen (it stays mounted, hidden, while the person is elsewhere). */
  shown: boolean
  onCreated: (id: string) => void
  /** A project made after the form was cancelled or Work was left: the Work list reads again, nobody is taken into it. */
  onAdded: () => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const admission = useAdmission<string, ProjectCreated>((key, t) => createProject(token, key, t))
  const { status } = admission.state
  const slow = useSlow(status === 'sending')
  const open = useMounted()
  const inSight = useRef(shown)
  useEffect(() => {
    inSight.current = shown
  })
  const submit = async () => {
    const created = await admission.send(title.trim())
    if (!created) return
    if (open.current && inSight.current) onCreated(created.projectId)
    else onAdded()
  }
  return (
    <form
      className="c3-newproj"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="c3-newproj-row">
        <TitleField title={title} status={status} onTitle={setTitle} onClose={onClose} />
        <button className="ghost" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="outcome" role="status">
        {slow ? SLOW_NOTE : <AdmissionNote state={admission.state} onRetry={() => void submit()} />}
      </div>
    </form>
  )
}

function Carried({
  project,
  fresh,
  onTakeBack,
  takingBack,
}: {
  project: ProjectSummary
  fresh: ReadonlySet<string>
  onTakeBack: Props['actions']['takeBack']
  takingBack: Props['actions']['takingBack']
}) {
  if (project.releases.length === 0) return null
  return (
    <div className="carried">
      {project.releases.map((r) => (
        <div key={r.id} className={`c3-from${fresh.has(r.id) ? ' new' : ''}`}>
          <p>{r.text}</p>
          <span className="prov">{carriedFrom(r.mine, r.ownerName)}</span>
          {r.mine && (
            <button
              className="ghost"
              type="button"
              aria-disabled={takingBack(r.id) || undefined}
              onClick={() => onTakeBack(r, project)}
            >
              {takingBack(r.id) ? 'Taking back…' : 'Take back'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function Card({ project, props }: { project: ProjectSummary; props: Props }) {
  const { actions } = props
  const card = projectCard(project, new Date(), props.inCallProject === project.projectId)
  const run = {
    leave: actions.leaveRoom,
    join: () => actions.join(project.projectId),
    open: () => actions.open(project.projectId),
  }
  return (
    <article className="c3-proj">
      <h3>{project.title}</h3>
      <button className={`pill${card.action === 'join' ? ' primary' : ''}`} type="button" onClick={run[card.action]}>
        {CARD_ACTION[card.action]}
      </button>
      <span className="meta">
        {card.presence && project.room ? (
          <>
            {project.room.people.slice(0, 3).map((name, i) => (
              <span key={`${name}-${i}`} className="pdot" aria-hidden>
                {shortName(name).charAt(0)}
              </span>
            ))}
            {project.room.sophia && <span className="sdot" aria-hidden />} {card.presence}
          </>
        ) : (
          card.meta
        )}
      </span>
      <Carried project={project} fresh={props.fresh} onTakeBack={actions.takeBack} takingBack={actions.takingBack} />
    </article>
  )
}

function Empty({ onStart }: { onStart: () => void }) {
  return (
    <div className="c3-empty">
      <p>No projects yet. A project is where your team and Sophia build something together.</p>
      <button className="pill primary" type="button" onClick={onStart}>
        Start a project
      </button>
    </div>
  )
}

export function WorkSpace(props: Props) {
  const { token, projects, newProject, personalLock, actions } = props
  const list = projects ? workOrder(projects, new Date()) : []
  return (
    <section className="c3-space job" data-place-view="work" hidden={props.hidden} aria-labelledby="c-w-h">
      <Edge lock={personalLock} onCross={actions.cross} />
      <header className="c3-head">
        <h2 id="c-w-h" tabIndex={-1}>
          Your projects
        </h2>
        <div className="c3-head-acts">
          {!newProject.open && list.length > 0 && (
            <button className="ghost" type="button" onClick={() => newProject.set(true)}>
              New project
            </button>
          )}
        </div>
      </header>
      <div className="c3-projects">
        <ReadNotes reads={[props.read]} />
        {newProject.open && (
          <NewProject
            token={token}
            shown={!props.hidden}
            onCreated={actions.open}
            onAdded={props.read.retry}
            onClose={() => newProject.set(false)}
          />
        )}
        {projects && list.length === 0 && !newProject.open && <Empty onStart={() => newProject.set(true)} />}
        {list.map((p) => (
          <Card key={p.projectId} project={p} props={props} />
        ))}
      </div>
    </section>
  )
}
