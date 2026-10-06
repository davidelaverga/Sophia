// Carry only what you choose (docs/plans/personal-carry-package.md, Davide's chapter 1): a reviewed package of notes,
// carried from Personal to one project. Nothing is chosen at first; what the team will receive is shown exactly as
// written before anything goes; the conversation stays here. Each note is the existing carry, one write each, in
// order: one that fails stops the package, says how many went (and why), and Try again carries the rest. What goes is
// fixed as Carry is pressed: a carried note leaves the notes, so the package counts from that batch, not the list.
// Under the vision flag.
import { useEffect, useRef, useState } from 'react'
import type { PersonalNote, ProjectSummary } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { useEscape } from './useEscape.ts'
import { membersLabel } from './places-view.ts'
import { personalFailure, unsent } from './write-words.ts'

/** The writes a package uses: the existing carry and take-back, and what the space does with a release. */
export interface PackWrites {
  carry: (noteId: string, projectId: string) => Promise<{ releaseId: string | null }>
  /** `key`: one per release taken back, the same when it is asked again after no answer came back. */
  takeBack: (releaseId: string, key: string) => Promise<unknown>
  onCarried: (releaseId: string | null) => void
}

interface Props {
  notes: readonly PersonalNote[]
  projects: readonly ProjectSummary[]
  writes: PackWrites
  onClose: () => void
  /** A step runs (carrying, taking back): the notes stay open meanwhile. */
  onBusy?: (busy: boolean) => void
}

type Phase = 'choose' | 'carrying' | 'carried' | 'partial' | 'taking' | 'taken' | 'took-part'

interface Gone {
  noteIds: string[]
  releases: string[]
  /** Notes that may have gone with no reply (or left the list some other way): never carried again from here. */
  unsure: string[]
}

const noun = (n: number) => (n === 1 ? '1 note' : `${String(n)} notes`)

/** The notes as they are now (a carried note leaves them). */
function useLive(notes: readonly PersonalNote[]) {
  const live = useRef(notes)
  useEffect(() => {
    live.current = notes
  })
  return live
}

/**
 * Takes back each release, in order: those that didn't come back, and why the last one didn't. A release asked with no
 * answer may have come back: its key is kept, so asking again gets the answer it had, never «not found».
 */
async function takeBackAll(writes: PackWrites, releases: readonly string[], keys: Map<string, string>) {
  const still: string[] = []
  let reason = ''
  for (const releaseId of releases) {
    const key = keys.get(releaseId) ?? crypto.randomUUID()
    keys.set(releaseId, key)
    await writes.takeBack(releaseId, key).then(
      () => keys.delete(releaseId),
      (err: unknown) => {
        // Already taken back (Work, another tab): it came back, whoever asked.
        const gone = err instanceof ApiError && err.code === 'not_found'
        if (!gone) {
          still.push(releaseId)
          reason = personalFailure(err)
        }
        if (gone || unsent(err) !== 'unconfirmed') keys.delete(releaseId)
      },
    )
  }
  return { still, reason }
}

/** The package's state: what is chosen, where to, the batch fixed at Carry, and what has gone. */
function usePackage({ notes, projects, writes }: Omit<Props, 'onClose'>) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set())
  const [projectId, setProjectId] = useState(projects.length === 1 ? (projects[0]?.projectId ?? '') : '')
  const [batch, setBatch] = useState<readonly PersonalNote[] | null>(null)
  const [phase, setPhase] = useState<Phase>('choose')
  const [gone, setGone] = useState<Gone>({ noteIds: [], releases: [], unsure: [] })
  const [why, setWhy] = useState<{ reason: string; sure: boolean } | null>(null)
  const live = useLive(notes)
  const takeKeys = useRef(new Map<string, string>())
  const picked = batch ?? notes.filter((n) => chosen.has(n.id))
  const project = projects.find((p) => p.projectId === projectId)
  const toggle = (id: string) =>
    setChosen((was) => {
      const next = new Set(was)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  /**
   * Carries the batch's notes that haven't gone, in order, stopping at the first that fails. Should the package go
   * meanwhile (the place left), the batch still goes: nothing chosen stops halfway, and Work marks what arrived.
   */
  const carry = async () => {
    if (!project || picked.length === 0 || phase === 'carrying' || phase === 'taking') return
    const fixed = picked
    setBatch(fixed)
    setPhase('carrying')
    setWhy(null)
    const done: Gone = { noteIds: [...gone.noteIds], releases: [...gone.releases], unsure: [...gone.unsure] }
    const left = (id: string) => !live.current.some((n) => n.id === id)
    for (const note of fixed.filter((n) => !done.noteIds.includes(n.id) && !done.unsure.includes(n.id))) {
      // Gone from the list since (carried another way, or a lost reply that landed): never asked for again.
      if (left(note.id)) {
        done.unsure.push(note.id)
        continue
      }
      try {
        const { releaseId } = await writes.carry(note.id, project.projectId)
        writes.onCarried(releaseId)
        done.noteIds.push(note.id)
        if (releaseId) done.releases.push(releaseId)
      } catch (err: unknown) {
        // No reply, or the note left the list meanwhile: it may have gone, so it is never said unsent.
        const sure = unsent(err) !== 'unconfirmed' && !left(note.id)
        if (!sure) done.unsure.push(note.id)
        setGone(done)
        setWhy({ reason: personalFailure(err), sure })
        return setPhase('partial')
      }
    }
    setGone(done)
    setPhase('carried')
  }
  const takeBack = async () => {
    if (phase === 'taking' || phase === 'carrying') return
    setPhase('taking')
    const { still, reason } = await takeBackAll(writes, gone.releases, takeKeys.current)
    setGone({ noteIds: [], releases: still, unsure: gone.unsure })
    setWhy(still.length > 0 ? { reason, sure: true } : null)
    setPhase(still.length > 0 ? 'took-part' : 'taken')
  }
  return { chosen, toggle, picked, project, projectId, setProjectId, phase, gone, why, carry, takeBack }
}

type Pack = ReturnType<typeof usePackage>

/** What the package says once something went: all of it, part of it, or what was taken back. */
function said(pack: Pack): string {
  const to = pack.project?.title ?? 'the project'
  const why = pack.why ? ` ${pack.why.reason}` : ''
  const unsure = pack.gone.unsure.length
  const maybe = unsure > 0 ? ` ${noun(unsure)} may already be there: see Work.` : ''
  if (pack.phase === 'carried')
    return `Carried ${noun(pack.gone.noteIds.length)} to ${to}. Your team sees them as yours, exactly as written.${maybe}`
  if (pack.phase === 'partial') {
    const rest = pack.why?.sure ? ' The rest wasn’t sent.' : ''
    return `Carried ${String(pack.gone.noteIds.length)} of ${String(pack.picked.length)} to ${to}.${maybe}${rest}${why}`
  }
  if (pack.phase === 'taken')
    return `Taken back from ${to}.${unsure > 0 ? ` ${noun(unsure)} may still be there: see Work.` : ''}`
  if (pack.phase === 'took-part') return `Not all taken back: ${noun(pack.gone.releases.length)} still in ${to}.${why}`
  return ''
}

const AFTER: ReadonlySet<Phase> = new Set(['carried', 'partial', 'taking', 'taken', 'took-part'])

export function CarryPackage(props: Props) {
  const pack = usePackage(props)
  const busy = pack.phase === 'carrying' || pack.phase === 'taking'
  const { onBusy } = props
  useEffect(() => {
    onBusy?.(busy)
  }, [busy, onBusy])
  useEffect(() => () => onBusy?.(false), [onBusy])
  // While a step runs, Escape waits with it: the notes stay open, and so does what the package will say.
  useEscape(busy, () => undefined)
  const head = useRef<HTMLHeadingElement>(null)
  const status = useRef<HTMLParagraphElement>(null)
  useEffect(() => head.current?.focus(), [])
  const after = AFTER.has(pack.phase)
  // What happened is where the focus goes: the button pressed may have gone with the step.
  useEffect(() => {
    if (after && pack.phase !== 'taking') status.current?.focus()
    // Try again's button goes as the package carries again: the focus stays in the package, never on the page.
    else if (pack.phase === 'carrying' && (document.activeElement ?? document.body) === document.body) {
      status.current?.focus()
    }
  }, [after, pack.phase])
  return (
    <div className="c3-pack" role="group" aria-labelledby="c3-pack-h">
      <h3 id="c3-pack-h" ref={head} tabIndex={-1}>
        Carry only what you choose
      </h3>
      {!after && <Choose pack={pack} notes={props.notes} projects={props.projects} />}
      <p ref={status} className="c3-pack-said" role="status" tabIndex={-1}>
        {said(pack)}
      </p>
      {after ? <AfterActs pack={pack} onClose={props.onClose} /> : <ChooseActs pack={pack} onClose={props.onClose} />}
    </div>
  )
}

function Choose(props: { pack: Pack; notes: readonly PersonalNote[]; projects: readonly ProjectSummary[] }) {
  const { pack, notes, projects } = props
  const busy = pack.phase === 'carrying'
  return (
    <>
      <label className="c3-pack-to">
        <span className="field-label">Carry to</span>
        <select value={pack.projectId} disabled={busy} onChange={(e) => pack.setProjectId(e.target.value)}>
          {projects.length > 1 && <option value="">Choose a project</option>}
          {projects.map((p) => (
            <option key={p.projectId} value={p.projectId}>
              {`${p.title} · ${membersLabel(p.members)}`}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="c3-pack-notes" disabled={busy}>
        <legend className="field-label">Notes</legend>
        {notes.map((n) => (
          <label key={n.id} className="c3-pack-note">
            <input type="checkbox" checked={pack.chosen.has(n.id)} onChange={() => pack.toggle(n.id)} />
            <span>{n.text}</span>
          </label>
        ))}
      </fieldset>
      <p className="c3-pack-stays">Stays here: this conversation, and every note you leave out.</p>
      <Receive picked={pack.picked} />
    </>
  )
}

/** Exactly what the team will receive: the chosen notes, as written, in order. */
function Receive({ picked }: { picked: readonly PersonalNote[] }) {
  return (
    <section className="c3-pack-receive" aria-labelledby="c3-pack-receive-h">
      <h4 id="c3-pack-receive-h">The team will receive</h4>
      {picked.length === 0 ? (
        <p className="c3-pack-none">Nothing yet. Choose the notes to carry.</p>
      ) : (
        <ul aria-labelledby="c3-pack-receive-h">
          {picked.map((n) => (
            <li key={n.id}>{n.text}</li>
          ))}
        </ul>
      )}
      <p className="c3-pack-copy">A selected copy, as yours. Not access to your space.</p>
    </section>
  )
}

function ChooseActs({ pack, onClose }: { pack: Pack; onClose: () => void }) {
  const ready = pack.project !== undefined && pack.picked.length > 0
  const busy = pack.phase === 'carrying'
  const label =
    pack.project && pack.picked.length > 0 ? `Carry ${noun(pack.picked.length)} to ${pack.project.title}` : 'Carry'
  return (
    <div className="c3-pack-acts">
      <button
        type="button"
        className="pill"
        aria-disabled={!ready || busy || undefined}
        onClick={() => ready && void pack.carry()}
      >
        {busy ? 'Carrying…' : label}
      </button>
      {/* While notes are on their way, the package can't be put away: it says what went first. */}
      <button
        type="button"
        className="text-button"
        aria-disabled={busy || undefined}
        onClick={() => !busy && onClose()}
      >
        Cancel
      </button>
    </div>
  )
}

function AfterActs({ pack, onClose }: { pack: Pack; onClose: () => void }) {
  const taking = pack.phase === 'taking'
  return (
    <div className="c3-pack-acts">
      {pack.phase === 'partial' && (
        <button type="button" className="pill" onClick={() => void pack.carry()}>
          Try again
        </button>
      )}
      {pack.phase === 'took-part' && (
        <button type="button" className="pill" onClick={() => void pack.takeBack()}>
          Try again
        </button>
      )}
      {pack.gone.releases.length > 0 && pack.phase !== 'took-part' && (
        <button
          type="button"
          className="text-button"
          aria-disabled={taking || undefined}
          onClick={() => void pack.takeBack()}
        >
          {taking ? 'Taking back…' : 'Take back'}
        </button>
      )}
      <button
        type="button"
        className="text-button"
        aria-disabled={taking || undefined}
        onClick={() => !taking && onClose()}
      >
        Done
      </button>
    </div>
  )
}
