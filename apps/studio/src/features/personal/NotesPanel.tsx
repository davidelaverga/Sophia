// The notes slide out of the edge, next to the line they may cross (direction C), with a sheet's head (the title and
// Close). Each note can be carried, one at a time, to one of the person's projects, exactly as written; the panel says
// so before it happens. A note can be written straight in, and from six of them Find narrows them by their words
// (personal-notes-write-find.md).
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { PersonalNote, ProjectSummary } from '@sophia/contracts'
import { ConfirmButton, EmptyState, Field, Icon, Search, Segmented, Tip } from '@sophia/ui'
import { saveBlob } from '../artifacts/download.ts'
import { dayOf } from '../../app/time-words.ts'
import { notesFile, notesFileName, orderNotes, type NotesOrder } from './notes-export.ts'
import type { Memory as Remembered } from './extras.ts'
import { focusSoon } from './focus.ts'
import { Memory } from './Memory.tsx'
import { FIND_FROM, findNotes, membersLabel } from './places-view.ts'
import type { Read } from './ReadNotes.tsx'
import { CarryPackage, type PackWrites } from './CarryPackage.tsx'

interface Props {
  /** Undefined until the space has loaded: nothing is said of them before (never "No notes yet"). */
  notes: readonly PersonalNote[] | undefined
  /** Undefined until the projects have loaded. */
  projects: readonly ProjectSummary[] | undefined
  /** How their read stands: a failed one is said where they would be, with Try again. */
  projectsRead: Read
  onClose: () => void
  onCarry: (note: PersonalNote, project: ProjectSummary) => void
  /** Forget a note for good; resolves once it is gone (personal-forget-note.md). */
  onForget: (noteId: string) => Promise<boolean>
  /** Keep a note written straight in; resolves to whether it was kept. */
  onWrite: (text: string) => Promise<boolean>
  /** Whether a note's carry is on its way: it stays crossed, out of reach, until it settles (back if it failed). */
  carrying: (noteId: string) => boolean
  onStartProject: () => void
  /** What she remembers of you, at the top, once the API gives it (extras.ts). */
  memory?: Remembered | undefined
  /** Under a talk: out of reach until it ends. */
  under?: boolean
  /** Personal is out of sight (another place): the package's hold on Escape is let go meanwhile. */
  away?: boolean
  /** The writes a reviewed package uses (CarryPackage), under the vision flag; absent, only the single Carry. */
  pack?: PackWrites | undefined
}

/** How long a carried note takes to slide across before it leaves the list. */
const CROSSING_MS = 440

const NOTES_EMPTY = 'No notes yet. Write one above, note something from the conversation, or keep what Sophia suggests.'

/** A note's most, as the API keeps one (PersonalNoteRequest). */
const NOTE_MOST = 90

/** One line at the top of the notes: Enter keeps it; refused, its words stay. */
function WriteNote({ onWrite }: { onWrite: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const keep = async () => {
    if (text.trim() === '' || sending) return
    setSending(true)
    const kept = await onWrite(text.trim())
    setSending(false)
    if (kept) setText('')
  }
  return (
    <Field
      as="form"
      className="c3-write-note"
      onSubmit={(e) => {
        e.preventDefault()
        void keep()
      }}
    >
      <input
        aria-label="Write a note"
        placeholder="Write a note…"
        maxLength={NOTE_MOST}
        value={text}
        readOnly={sending}
        onChange={(e) => setText(e.target.value)}
      />
      {/* While it goes, said: the field alone, read-only, doesn't say why (Codex P2 on #363). */}
      {sending && (
        <span className="c3-write-status" role="status">
          Keeping…
        </span>
      )}
    </Field>
  )
}

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
 * One carry at a time: a second pick while a note crosses would carry it twice. The panel takes the focus its buttons
 * had as it starts to cross, before they go out of reach with it, so the focus is never dropped; whoever moves on
 * during the slide keeps it there. The panel going away mid-slide (the notes closed, a lock) carries nothing.
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
    panel.current?.focus({ preventScroll: true })
    setCrossing(note.id)
    setTimeout(() => {
      busy.current = false
      if (!here.current) return
      setCrossing(null)
      setCarrying(null)
      onCarry(note, project)
    }, CROSSING_MS)
  }
  return { carrying, setCarrying, crossing, carry }
}

/**
 * A note forgotten: once it is gone the focus goes on to the next note's Carry (the one before it when it was the
 * last), or to the notes when none is left, never dropped to the page.
 */
function useForget(
  panel: React.RefObject<HTMLElement | null>,
  notes: readonly PersonalNote[] | undefined,
  onForget: Props['onForget'],
) {
  return async (noteId: string) => {
    const at = notes?.findIndex((n) => n.id === noteId) ?? -1
    const next = notes?.[at + 1]?.id ?? notes?.[at - 1]?.id ?? null
    if (!(await onForget(noteId))) return
    requestAnimationFrame(() => {
      const carry = next ? panel.current?.querySelector<HTMLElement>(`[data-carry="${next}"]`) : null
      ;(carry ?? panel.current)?.focus({ preventScroll: true })
    })
  }
}

export function NotesPanel(props: Props) {
  const { notes, projects, projectsRead, onClose, onCarry, onStartProject } = props
  const panel = useRef<HTMLElement>(null)
  const { carrying, setCarrying, crossing, carry } = useCarry(panel, onCarry)
  const crossed = (id: string) => crossing === id || props.carrying(id)
  const find = useFind(notes)
  // The next note is the next one shown, in the order chosen and as Find leaves them (Codex P2 on #394).
  const forget = useForget(panel, find.shown, props.onForget)
  // The package, open: it replaces the notes' own Carry, so one writer carries at a time; while a step of it runs
  // (carrying, taking back), the notes stay open, so what it says stays in sight.
  const [packing, setPacking] = useState(false)
  const [packBusy, setPackBusy] = useState(false)
  // Focus the panel itself: a tip should appear when you reach a control, not the moment the notes open.
  useEffect(() => panel.current?.focus({ preventScroll: true }), [])
  return (
    <aside ref={panel} id="c-notes" className="c3-notes" aria-labelledby="c-notes-h" tabIndex={-1} inert={props.under}>
      <header className="sheet-head">
        <h2 id="c-notes-h">Notes</h2>
        <DownloadNotes notes={notes} />
        <CloseNotes waits={packBusy} onClose={onClose} />
      </header>
      {props.memory && <Memory {...props.memory} />}
      <Package {...props} open={packing} onOpen={setPacking} onBusy={setPackBusy} crossing={crossed} />
      {!packing && props.memory && props.memory.items.length > 0 && notes !== undefined && (
        <h3 className="c3-label">Your notes</h3>
      )}
      <NotesTop packing={packing} notes={notes} onWrite={props.onWrite} find={find} />
      {!packing &&
        find.shown.map((note) => (
          <div key={note.id} className={`c2-t${crossed(note.id) ? ' crossing' : ''}`} inert={crossed(note.id)}>
            {/* The words with their day under them, then Carry and Forget beside them (Codex P2 on #394). */}
            <div className="c2-words">
              <p>
                {note.text}
                {note.keptBy === 'sophia' && <span className="by">from Sophia</span>}
              </p>
              {/* Its day, after the words, not in them: Find and the notes read the words alone. */}
              <time className="c2-day" dateTime={note.createdAt}>
                {dayOf(note.createdAt, Date.now())}
              </time>
            </div>
            <NoteActs
              noteId={note.id}
              open={carrying === note.id}
              onCarry={() => setCarrying(carrying === note.id ? null : note.id)}
              onForget={() => void forget(note.id)}
            />
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

type Find = ReturnType<typeof useFind>

/**
 * What is typed in Find, and the notes it leaves (from six notes only, all of them before), in the order chosen,
 * newest first unless Oldest is (notes-order-export.md).
 */
function useFind(notes: readonly PersonalNote[] | undefined) {
  const [typed, setTyped] = useState('')
  const [order, setOrder] = useState<NotesOrder>('newest')
  const all = notes ?? []
  const offered = all.length >= FIND_FROM
  return { offered, typed, setTyped, order, setOrder, shown: orderNotes(findNotes(all, offered ? typed : ''), order) }
}

const ORDERS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
] as const

/** Newest or Oldest first, from two notes up (notes-order-export.md). */
function OrderNotes({ find }: { find: Find }) {
  return (
    <Segmented
      role="radiogroup"
      label="Order"
      size="sm"
      className="c3-order"
      items={ORDERS}
      value={find.order}
      onChange={find.setOrder}
    />
  )
}

/** «Download notes»: a Markdown file of every note, oldest first, once there is one (notes-order-export.md). */
function DownloadNotes({ notes }: { notes: readonly PersonalNote[] | undefined }) {
  if (!notes || notes.length === 0) return null
  const save = () => {
    const now = new Date()
    saveBlob(new Blob([notesFile(notes, now)], { type: 'text/markdown' }), notesFileName(now))
  }
  return (
    <button type="button" className="round has-tip c3-download" aria-label="Download notes" onClick={save}>
      <Icon name="download" />
      <Tip label="Download notes" side="bottom" align="end" />
    </button>
  )
}

/** Above the notes: the line to write one, none yet said, and Find; out of the way while a package is reviewed. */
function NotesTop(props: {
  packing: boolean
  notes: readonly PersonalNote[] | undefined
  onWrite: (text: string) => Promise<boolean>
  find: Find
}) {
  const { packing, notes, find } = props
  return (
    <>
      {/* Once the notes are read: a note is written against the space they came with (Codex P2 on #363). */}
      {!packing && notes !== undefined && <WriteNote onWrite={props.onWrite} />}
      {notes?.length === 0 && <EmptyState className="ps-empty">{NOTES_EMPTY}</EmptyState>}
      {!packing && notes !== undefined && notes.length >= 2 && <OrderNotes find={find} />}
      {!packing && find.offered && <FindNotes typed={find.typed} onTyped={find.setTyped} found={find.shown.length} />}
    </>
  )
}

/** From six notes, Find narrows them by their words; none holding them is said. */
function FindNotes(props: { typed: string; onTyped: (typed: string) => void; found: number }) {
  return (
    <>
      <Search
        className="c3-find-notes"
        placeholder="Find in notes"
        aria-label="Find in notes"
        maxLength={NOTE_MOST}
        value={props.typed}
        onChange={(e) => props.onTyped(e.target.value)}
      />
      {props.found === 0 && <p className="c3-find-none">{`No notes hold “${props.typed.trim()}”.`}</p>}
    </>
  )
}

/** A note's acts: Carry, and Forget, which asks first since its words go for good (personal-forget-note.md). */
function NoteActs(props: { noteId: string; open: boolean; onCarry: () => void; onForget: () => void }) {
  return (
    <span className="c2-acts">
      <button
        className="ghost"
        type="button"
        data-carry={props.noteId}
        aria-expanded={props.open}
        onClick={props.onCarry}
      >
        Carry
      </button>
      <ConfirmButton
        label="Forget"
        warning="Her copy of this note is erased."
        confirm="Forget it"
        keep="Keep it"
        onConfirm={props.onForget}
      />
    </span>
  )
}

/** Close: unavailable while the package's step runs, so what it says stays in sight. */
function CloseNotes({ waits, onClose }: { waits: boolean; onClose: () => void }) {
  return (
    <button
      type="button"
      className="round has-tip"
      aria-label="Close notes"
      aria-disabled={waits || undefined}
      onClick={() => !waits && onClose()}
    >
      <Icon name="close" />
      <Tip label="Close" keys="Esc" side="bottom" align="end" />
    </button>
  )
}

/**
 * «Review what to carry»: a package of notes to one project, reviewed before it goes (Davide's chapter 1). Offered
 * where there is a note and a project to carry it to; the package replaces the button while it is open.
 */
/** The package's own: open or not, a step running, and a note crossing by its own Carry (not offered meanwhile). */
interface PackageState {
  open: boolean
  onOpen: (open: boolean) => void
  onBusy: (busy: boolean) => void
  crossing: (id: string) => boolean
}

function Package(props: Props & PackageState) {
  const { notes, projects, pack, open, onOpen: setOpen, onBusy } = props
  if (!pack) return null
  // Open, it stays whatever the list holds: carried notes leave it, and the package says what went.
  if (open) {
    return (
      <CarryPackage
        notes={notes ?? []}
        projects={projects ?? []}
        writes={pack}
        onBusy={onBusy}
        away={props.away === true}
        onClose={() => {
          setOpen(false)
          // Back to Review what to carry; with no note left to carry, to the notes themselves, never the page.
          requestAnimationFrame(() =>
            (document.querySelector<HTMLElement>('[data-pack-open]') ?? document.getElementById('c-notes'))?.focus(),
          )
        }}
      />
    )
  }
  // A note on its way by its own Carry: the package waits for it, so the two never carry one note.
  if (!notes?.length || !projects?.length || notes.some((n) => props.crossing(n.id))) return null
  return (
    <button type="button" className="ghost c3-pack-open" data-pack-open onClick={() => setOpen(true)}>
      Review what to carry
    </button>
  )
}
