// Work (direction C): the projects this person belongs to, each with its one action (join the room when someone is in
// it or a session is about to start, else open it), and the notes carried to it: yours marked as coming from your
// personal space and yours to take back, a teammate's marked as theirs. Until the list has loaded it shows neither
// projects nor "No projects yet"; a list that failed says so, with Try again. With only archived ones it says «No active
// projects.», never the first run's sentence.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ProjectCreated, ProjectRelease, ProjectSummary } from '@sophia/contracts'
import { EmptyState, Icon, Search, Segmented, Tip } from '@sophia/ui'
import { createProject } from '../../api/client.ts'
import { useAdmission, type AdmissionState } from '../../api/useAdmission.ts'
import { useMounted } from '../../app/useMounted.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { AdmissionNote } from '../access/AdmissionNote.tsx'
import type { ArchivedWork } from '../studio/Archive.tsx'
import { shortName } from '../voice/room-view.ts'
import {
  CARD_ACTION,
  carriedFrom,
  EDGE_TIP,
  FIND_FROM,
  findProjects,
  orderProjects,
  projectCard,
  type LockedBy,
  type ProjectOrder,
} from './places-view.ts'
import { FailedReads, ReadNotes, type Read } from './ReadNotes.tsx'
import { useCapped } from './useCapped.ts'
import { useNow } from '../../app/use-now.ts'

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
  /** The invitations waiting for the person (InvitedBand, A16): at the head of the list; nothing when none waits. */
  invited?: ReactNode
  /** The person's archived projects (A30), folded after the list, and how an admin brings one back (useArchivedWork). */
  archived?: ArchivedWork
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

function Card({ project, props, now }: { project: ProjectSummary; props: Props; now: number }) {
  const { actions } = props
  const card = projectCard(project, new Date(now), props.inCallProject === project.projectId)
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
    <EmptyState
      className="c3-empty"
      actions={
        <button className="pill primary" type="button" onClick={onStart}>
          Start a project
        </button>
      }
    >
      No projects yet. A project is where your team and Sophia build something together.
    </EmptyState>
  )
}

/**
 * What Work says with no active project (work-none-active.md): the first run's sentence only while nothing is archived
 * either; with archived ones (or a read of them that failed, which can't say none) «No active projects.»; nothing while
 * either list is still coming, so no «none» is claimed before it is known.
 */
function emptyLine(projects: Props['projects'], archived: Props['archived']): 'first' | 'none-active' | null {
  if (!projects || projects.length > 0) return null
  if (!archived) return 'first'
  if (archived.read.state === 'failed') return 'none-active'
  if (!archived.projects) return null
  return archived.projects.length > 0 ? 'none-active' : 'first'
}

const ORDERS: readonly { id: ProjectOrder; label: string }[] = [
  { id: 'next', label: 'Next' },
  { id: 'az', label: 'A–Z' },
]

/** Past five projects, a field finds one by its title and an order sorts them (find-projects.md). */
function useFinder(projects: readonly ProjectSummary[] | undefined, now: number) {
  const [typed, setTyped] = useState('')
  const [order, setOrder] = useState<ProjectOrder>('next')
  const all = projects ?? []
  const offered = all.length >= FIND_FROM
  const list = orderProjects(offered ? findProjects(all, typed) : all, offered ? order : 'next', new Date(now))
  return { offered, typed, setTyped, order, setOrder, list, none: offered && all.length > 0 && list.length === 0 }
}

function Finder({ finder }: { finder: ReturnType<typeof useFinder> }) {
  return (
    <div className="c3-find">
      <Search
        id="find-project"
        className="c3-find-field"
        placeholder="Find a project"
        aria-label="Find a project"
        value={finder.typed}
        maxLength={120}
        onChange={(e) => finder.setTyped(e.target.value)}
      />
      <Segmented role="radiogroup" label="Order" items={ORDERS} value={finder.order} onChange={finder.setOrder} />
    </div>
  )
}

function NoneFound({ typed, onClear }: { typed: string; onClear: () => void }) {
  return (
    <p className="c3-none" role="status">
      {`No project is called «${typed.trim()}». `}
      <button className="text-button" type="button" onClick={onClear}>
        Clear
      </button>
    </p>
  )
}

/**
 * One archived project: it opens, and an admin brings it back. Its Unarchive waits while it goes («Bringing back…»),
 * and a failure is said under the row until the next press, as a removal's is in «In this project».
 */
function ArchivedRow({
  project,
  archived,
  onOpen,
}: {
  project: ProjectSummary
  archived: ArchivedWork
  onOpen: (projectId: string) => void
}) {
  const { sending, failed } = archived.unarchiving(project.projectId)
  return (
    <li>
      <button type="button" className="text-button" onClick={() => onOpen(project.projectId)}>
        {project.title}
      </button>
      {project.role === 'admin' && (
        <button
          type="button"
          className="ghost"
          aria-disabled={sending || undefined}
          onClick={() => archived.onUnarchive(project.projectId)}
        >
          {sending ? 'Bringing back…' : 'Unarchive'}
        </button>
      )}
      {failed && (
        <p className="form-error" role="alert">
          {failed}
        </p>
      )}
    </li>
  )
}

/**
 * «Archived (n)» after the list (archive-project.md): folded, as a finished project should be; each opens, and an admin
 * brings one back. Nothing while none is archived; a read that failed says so in its place, with Try again.
 */
function ArchivedFold({ archived, onOpen }: { archived: Props['archived']; onOpen: (projectId: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!archived) return null
  if (archived.read.state === 'failed') return <FailedReads reads={[archived.read]} />
  const projects = archived.projects ?? []
  if (projects.length === 0) return null
  return (
    <section className="c3-archived" aria-label="Archived projects">
      <button
        type="button"
        className="text-button c3-archived-fold"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {`Archived (${String(projects.length)})`}
      </button>
      {open && (
        <ul className="c3-archived-list">
          {projects.map((p) => (
            <ArchivedRow key={p.projectId} project={p} archived={archived} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  )
}

export function WorkSpace(props: Props) {
  const { token, projects, newProject, personalLock, actions } = props
  const now = useNow(20_000)
  const finder = useFinder(projects, now)
  const list = finder.list
  const empty = newProject.open ? null : emptyLine(projects, props.archived)
  // In the header whenever the first run's Start a project isn't said, the archived list still coming too: making a
  // project is never out of reach while it loads, retries or waits offline.
  const offerNew = !newProject.open && !!projects && empty !== 'first'
  return (
    <section className="c3-space job" data-place-view="work" data-content hidden={props.hidden} aria-labelledby="c-w-h">
      <Edge lock={personalLock} onCross={actions.cross} />
      <header className="c3-head">
        <h2 id="c-w-h" tabIndex={-1}>
          Your projects
        </h2>
        <div className="c3-head-acts">
          {offerNew && (
            <button className="ghost" type="button" onClick={() => newProject.set(true)}>
              New project
            </button>
          )}
        </div>
      </header>
      {finder.offered && <Finder finder={finder} />}
      <div className="c3-projects">
        {props.invited}
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
        {finder.none && (
          <NoneFound
            typed={finder.typed}
            onClear={() => {
              // The Clear pressed goes with the words: the focus goes back to the field (Codex on #347).
              document.getElementById('find-project')?.focus()
              finder.setTyped('')
            }}
          />
        )}
        {empty === 'first' && <Empty onStart={() => newProject.set(true)} />}
        {empty === 'none-active' && <EmptyState className="c3-empty">No active projects.</EmptyState>}
        {list.map((p) => (
          <Card key={p.projectId} project={p} props={props} now={now} />
        ))}
        <ArchivedFold archived={props.archived} onOpen={actions.open} />
      </div>
    </section>
  )
}
