// The notes slide out of the edge, next to the line they may cross (direction C), with a sheet's head (the title and
// Close). Each note can be carried, one at a time, to one of the person's projects, exactly as written; the panel says
// so before it happens.
import { useEffect, useRef, useState } from 'react'
import type { PersonalNote, ProjectSummary } from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
import { membersLabel } from './places-view.ts'

interface Props {
  notes: readonly PersonalNote[]
  /** Undefined until the projects have loaded. */
  projects: readonly ProjectSummary[] | undefined
  onClose: () => void
  onCarry: (note: PersonalNote, project: ProjectSummary) => void
  onStartProject: () => void
}

/** How long a carried note takes to slide across before it leaves the list. */
const CROSSING_MS = 440

const NOTES_EMPTY = 'No notes yet. Note something from the conversation, or keep what Sophia suggests.'

function Where({ projects, onStartProject }: Pick<Props, 'projects' | 'onStartProject'>) {
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
  onPick: (project: ProjectSummary) => void
  onCancel: () => void
  onStartProject: () => void
}) {
  const { projects, onPick, onCancel, onStartProject } = props
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
      <Where projects={projects} onStartProject={onStartProject} />
    </div>
  )
}

export function NotesPanel({ notes, projects, onClose, onCarry, onStartProject }: Props) {
  const panel = useRef<HTMLElement>(null)
  const [carrying, setCarrying] = useState<string | null>(null)
  const [crossing, setCrossing] = useState<string | null>(null)
  // Focus the panel itself: a tip should appear when you reach a control, not the moment the notes open.
  useEffect(() => panel.current?.focus({ preventScroll: true }), [])
  const carry = (note: PersonalNote, project: ProjectSummary) => {
    setCrossing(note.id)
    setTimeout(() => {
      setCrossing(null)
      setCarrying(null)
      onCarry(note, project)
    }, CROSSING_MS)
  }
  return (
    <aside ref={panel} id="c-notes" className="c3-notes" aria-labelledby="c-notes-h" tabIndex={-1}>
      <header className="sheet-head">
        <h2 id="c-notes-h">Notes</h2>
        <button type="button" className="round has-tip" aria-label="Close notes" onClick={onClose}>
          <Icon name="close" />
          <Tip label="Close" keys="Esc" side="bottom" align="end" />
        </button>
      </header>
      {notes.length === 0 && <p className="ps-empty">{NOTES_EMPTY}</p>}
      {notes.map((note) => (
        <div key={note.id} className={`c2-t${crossing === note.id ? ' crossing' : ''}`}>
          <p>
            {note.text}
            {note.keptBy === 'sophia' && <span className="by">from Sophia</span>}
          </p>
          <button
            className="ghost"
            type="button"
            aria-expanded={carrying === note.id}
            onClick={() => setCarrying(carrying === note.id ? null : note.id)}
          >
            Carry
          </button>
          {carrying === note.id && (
            <CarryTo
              projects={projects}
              onPick={(p) => carry(note, p)}
              onCancel={() => setCarrying(null)}
              onStartProject={onStartProject}
            />
          )}
        </div>
      ))}
    </aside>
  )
}
