// The notes slide out of the edge, next to the line they may cross (direction C), with a sheet's head (the title and
// Close). Each note can be carried, one at a time, to one of the person's projects, exactly as written; the panel says
// so before it happens.
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { PersonalNote, ProjectSummary } from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
import { focusLater, focusSoon } from './focus.ts'
import { membersLabel } from './places-view.ts'
import type { Read } from './ReadNotes.tsx'

interface Props {
  /** Undefined until the space has loaded: nothing is said of them before (never "No notes yet"). */
  notes: readonly PersonalNote[] | undefined
  /** Undefined until the projects have loaded. */
  projects: readonly ProjectSummary[] | undefined
  /** How their read stands: a failed one is said where they would be, with Try again. */
  projectsRead: Read
  onClose: () => void
  onCarry: (note: PersonalNote, project: ProjectSummary) => void
  onStartProject: () => void
}

/** How long a carried note takes to slide across before it leaves the list. */
const CROSSING_MS = 440

const NOTES_EMPTY = 'No notes yet. Note something from the conversation, or keep what Sophia suggests.'

function Where({
  projects,
  projectsRead,
  onStartProject,
}: Pick<Props, 'projects' | 'projectsRead' | 'onStartProject'>) {
  if (!projects && projectsRead.state === 'failed') {
    return (
      <small role="alert">
        {projectsRead.failed}{' '}
        <button className="text-button" type="button" onClick={projectsRead.retry}>
          Try again
        </button>
      </small>
    )
  }
  if (!projects) return <small>Your projects haven’t loaded yet.</small>
  if (projects.length === 0) {
    return (
      <small>
        No project to carry it to yet.{' '}
        <button className="text-button" type="button" onClick={onStartProject}>
          Start a project
        </button>
      </small>
    )
  }
  return <small>Your team sees it as yours, exactly as written. You can take it back from Work.</small>
}

function CarryTo(props: {
  projects: Props['projects']
  projectsRead: Read
  onPick: (project: ProjectSummary) => void
  onCancel: () => void
  onStartProject: () => void
}) {
  const { projects, projectsRead, onPick, onCancel, onStartProject } = props
  const group = useRef<HTMLDivElement>(null)
  useEffect(() => group.current?.querySelector<HTMLElement>('.c3-carry, .text-button')?.focus(), [])
  return (
    <div ref={group} className="c2-to" role="group" aria-label="Carry to">
      <div className="c2-to-head">
        <span className="field-label">Carry to</span>
        <button className="text-button" type="button" onClick={onCancel}>
          Keep here
        </button>
      </div>
      {projects?.map((p) => (
        <button key={p.projectId} className="c3-carry" type="button" onClick={() => onPick(p)}>
          <b>{p.title}</b>
          <span>{membersLabel(p.members)}</span>
        </button>
      ))}
      <Where projects={projects} projectsRead={projectsRead} onStartProject={onStartProject} />
    </div>
  )
}

/**
 * One carry at a time: a second pick while a note crosses would carry it twice. Once it crossed, the panel takes the
 * focus its buttons had (they leave with the note), unless the person moved on during the slide. The panel going away
 * mid-slide (the notes closed, a lock) carries nothing.
 */
function useCarry(panel: RefObject<HTMLElement | null>, onCarry: Props['onCarry']) {
  const [carrying, setCarrying] = useState<string | null>(null)
  const [crossing, setCrossing] = useState<string | null>(null)
  const busy = useRef(false)
  const here = useRef(true)
  useEffect(() => {
    here.current = true
    return () => {
      here.current = false
    }
  }, [])
  const carry = (note: PersonalNote, project: ProjectSummary) => {
    if (busy.current) return
    busy.current = true
    setCrossing(note.id)
    const land = focusLater()
    setTimeout(() => {
      busy.current = false
      if (!here.current) return
      setCrossing(null)
      setCarrying(null)
      onCarry(note, project)
      land(panel.current)
    }, CROSSING_MS)
  }
  return { carrying, setCarrying, crossing, carry }
}

export function NotesPanel({ notes, projects, projectsRead, onClose, onCarry, onStartProject }: Props) {
  const panel = useRef<HTMLElement>(null)
  const { carrying, setCarrying, crossing, carry } = useCarry(panel, onCarry)
  // Focus the panel itself: a tip should appear when you reach a control, not the moment the notes open.
  useEffect(() => panel.current?.focus({ preventScroll: true }), [])
  return (
    <aside ref={panel} id="c-notes" className="c3-notes" aria-labelledby="c-notes-h" tabIndex={-1}>
      <header className="sheet-head">
        <h2 id="c-notes-h">Notes</h2>
        <button type="button" className="round has-tip" aria-label="Close notes" onClick={onClose}>
          <Icon name="close" />
          <Tip label="Close" keys="Esc" side="bottom" align="end" />
        </button>
      </header>
      {notes?.length === 0 && <p className="ps-empty">{NOTES_EMPTY}</p>}
      {notes?.map((note) => (
        <div key={note.id} className={`c2-t${crossing === note.id ? ' crossing' : ''}`}>
          <p>
            {note.text}
            {note.keptBy === 'sophia' && <span className="by">from Sophia</span>}
          </p>
          <button
            className="ghost"
            type="button"
            data-carry={note.id}
            aria-expanded={carrying === note.id}
            onClick={() => setCarrying(carrying === note.id ? null : note.id)}
          >
            Carry
          </button>
          {carrying === note.id && (
            <CarryTo
              projects={projects}
              projectsRead={projectsRead}
              onPick={(p) => carry(note, p)}
              onCancel={() => {
                // "Keep here" goes with the list it heads: the focus goes back to the note's Carry.
                setCarrying(null)
                focusSoon(`[data-carry="${note.id}"]`)
              }}
              onStartProject={onStartProject}
            />
          )}
        </div>
      ))}
    </aside>
  )
}
