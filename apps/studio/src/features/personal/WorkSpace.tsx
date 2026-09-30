// Work (direction C): the projects this person belongs to, each with its one action (join the room when someone is in
// it or a session is about to start, else open it), and the notes carried to it: yours marked as coming from your
// personal space and yours to take back, a teammate's marked as theirs.
import { useEffect, useRef, useState } from 'react'
import type { ProjectCreated, ProjectRelease, ProjectSummary } from '@sophia/contracts'
import { Tip } from '@sophia/ui'
import { createProject } from '../../api/client.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { AdmissionNote } from '../access/AdmissionNote.tsx'
import { shortName } from '../voice/room-view.ts'
import { Across, LockShut } from './icons.tsx'
import { projectCard, workOrder, type LockedBy } from './places-view.ts'

interface Props {
  hidden: boolean
  token: string
  projects: readonly ProjectSummary[] | undefined
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
    cross: () => void
  }
}

const EDGE_TIP: Record<LockedBy | 'open', string> = {
  open: 'Cross to Personal',
  you: 'Personal is locked. Opening it asks for your passkey.',
  room: 'Personal is locked while you’re in a room.',
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
        <Across className="go" toward="left" />
        <LockShut className="shut" />
      </span>
      <span className="c3-edge-label">Personal</span>
      <Tip label={EDGE_TIP[lock ?? 'open']} {...(lock ? {} : { keys: 'P' })} side="top" />
    </button>
  )
}

function NewProject({
  token,
  onCreated,
  onClose,
}: {
  token: string
  onCreated: (id: string) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const admission = useAdmission<string, ProjectCreated>((key, t) => createProject(token, key, t))
  const { status } = admission.state
  const slow = useSlow(status === 'sending')
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => field.current?.focus(), [])
  const submit = async () => {
    const created = await (status === 'unknown' ? admission.retry() : admission.submit(title.trim()))
    if (created) onCreated(created.projectId)
  }
  return (
    <form
      className="c3-newproj"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className="sr-only" htmlFor="c-newproj">
        Project title
      </label>
      <input
        ref={field}
        id="c-newproj"
        required
        maxLength={180}
        placeholder="Name the project"
        value={title}
        readOnly={status === 'unknown'}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.preventDefault()
          onClose()
        }}
      />
      <button className="btn primary" type="submit" disabled={status === 'sending' || !title.trim()}>
        {status === 'sending' ? 'Creating…' : status === 'unknown' ? 'Try again' : 'Start the project'}
      </button>
      <button className="btn ghost" type="button" onClick={onClose}>
        Cancel
      </button>
      <span className="outcome" role="status">
        {slow ? SLOW_NOTE : <AdmissionNote state={admission.state} onRetry={() => void submit()} />}
      </span>
    </form>
  )
}

function Carried({
  project,
  fresh,
  onTakeBack,
}: {
  project: ProjectSummary
  fresh: ReadonlySet<string>
  onTakeBack: Props['actions']['takeBack']
}) {
  if (project.releases.length === 0) return null
  return (
    <div className="carried">
      {project.releases.map((r) => (
        <div key={r.id} className={`c3-from${fresh.has(r.id) ? ' new' : ''}`}>
          <p>{r.text}</p>
          <span className="prov">
            {r.mine ? 'from your personal space' : `from ${shortName(r.ownerName)}’s personal space`}
          </span>
          {r.mine && (
            <button className="link" type="button" onClick={() => onTakeBack(r, project)}>
              Take back
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

const ACTION_WORDS = { leave: 'Leave the room', join: 'Join the room', open: 'Open' } as const

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
      <button className={`btn${card.action === 'join' ? ' primary' : ''}`} type="button" onClick={run[card.action]}>
        {ACTION_WORDS[card.action]}
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
      <Carried project={project} fresh={props.fresh} onTakeBack={actions.takeBack} />
    </article>
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
            <button className="btn ghost" type="button" onClick={() => newProject.set(true)}>
              New project
            </button>
          )}
        </div>
      </header>
      <div className="c3-projects">
        {newProject.open && <NewProject token={token} onCreated={actions.open} onClose={() => newProject.set(false)} />}
        {projects && list.length === 0 && !newProject.open && (
          <div className="c3-empty">
            <p style={{ margin: 0 }}>
              No projects yet. A project is where your team and Sophia build something together.
            </p>
            <button className="btn primary" type="button" onClick={() => newProject.set(true)}>
              Start a project
            </button>
          </div>
        )}
        {list.map((p) => (
          <Card key={p.projectId} project={p} props={props} />
        ))}
      </div>
    </section>
  )
}
