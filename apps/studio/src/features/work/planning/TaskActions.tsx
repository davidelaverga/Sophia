// Acting on a task from its sheet, without leaving it (LFE-06.4, WBC-01 G3–G4): exactly the commands the board's view
// allows this viewer on this task now, through the shared SessionActs. The view decides, never the browser: no grant
// is read from a role, a logo or whose account it is, and a command the view doesn't mention is unavailable. A builder
// may guide work on someone else's resource within that owner's mandate, and is told so; a native permission answer
// or a reserve change is never a task command (they stay with the account's owner, in their tool and in Resources).
// Hold is offered while a task isn't held; Resume only while it genuinely is, and never on its own. Commands go to the
// exact assignment and generation shown: with no assignment known, nothing is sent.
import { SessionActs, type Acts, type Offer } from '../../resources/SessionActs.tsx'
import { scopeOf, type CommandKind, type CommandTarget } from '../../resources/receipts.ts'
import { actionOf, type PlanRow } from './plan.ts'

const COMMANDS: readonly CommandKind[] = ['guidance', 'hold', 'resume', 'stop']
const NAME: Readonly<Record<CommandKind, string>> = {
  guidance: 'Guidance',
  hold: 'Hold',
  resume: 'Resume',
  stop: 'Stop',
}

/** Exactly what a command from this sheet is for; null while its assignment isn't known. */
export function targetOf(row: PlanRow, project: string): CommandTarget | null {
  const a = row.view?.assignment
  return a
    ? {
        project_id: project,
        work_id: row.item.id,
        assignment_id: a.assignment_id,
        assignment_generation: a.generation,
        attempt_id: a.attempt_id,
        session_id: a.native_session_id,
      }
    : null
}

/** Whether a command fits the task's state: Hold while it isn't held, Resume only while it is. */
const fits = (row: PlanRow, kind: CommandKind) => {
  const held = row.view?.lifecycle === 'held'
  return kind === 'hold' ? !held : kind === 'resume' ? held : true
}

/** The commands offered: what the view allows and the state fits, Hold and Resume with what they do as their tip. */
export function offered(row: PlanRow): Offer[] {
  return COMMANDS.flatMap((kind): Offer[] => {
    const action = actionOf(row, kind)
    if (action?.availability !== 'allowed' || !fits(row, kind)) return []
    return kind === 'hold' || kind === 'resume' ? [{ kind, tip: action.reason }] : [{ kind }]
  })
}

/** Names in a list, as said: "Guidance, Hold and Stop". */
const listed = (names: readonly string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}` : (names[0] ?? '')

/** What isn't offered and the view says why, one line per reason: "Guidance and Stop: viewers ask and read". */
export function notOffered(row: PlanRow): string[] {
  const why = new Map<string, string[]>()
  for (const kind of COMMANDS) {
    const action = actionOf(row, kind)
    if (!action || action.availability === 'allowed' || !fits(row, kind)) continue
    why.set(action.reason, [...(why.get(action.reason) ?? []), NAME[kind]])
  }
  return [...why].map(([reason, names]) => `${listed(names)}: ${reason}`)
}

/** The mandates the offered commands act within, when the view names one. */
export const boundaries = (row: PlanRow) => [
  ...new Set(
    COMMANDS.flatMap((kind) => {
      const action = actionOf(row, kind)
      return action?.availability === 'allowed' && action.boundary && fits(row, kind) ? [action.boundary] : []
    }),
  ),
]

interface Props {
  row: PlanRow
  /** The board's commands, kept by scope; absent, none is offered. */
  acts?: Acts | undefined
}

/** What the sheet has to say about acting on a task: its target, what it offers, why not, and what was sent. */
function actionsOf(row: PlanRow, acts: Acts) {
  const target = targetOf(row, acts.project)
  return {
    target,
    offer: target ? offered(row) : [],
    sent: target ? acts.of(scopeOf(target)).length > 0 : false,
    reasons: notOffered(row),
    unaddressed: !target && COMMANDS.some((k) => actionOf(row, k)?.availability === 'allowed'),
  }
}

/** Lines under the commands: the mandate they act within, and why the rest isn't offered. */
const Notes = ({ notes, className }: { notes: readonly string[]; className: string }) =>
  notes.map((n) => (
    <p key={n} className={`${className} muted`}>
      {n}
    </p>
  ))

export function TaskActions({ row, acts }: Props) {
  if (!acts) return null
  const { target, offer, sent, reasons, unaddressed } = actionsOf(row, acts)
  const commands = target && (offer.length > 0 || sent) ? target : null
  if (!commands && reasons.length === 0 && !unaddressed) return null
  return (
    <section className="sheet-section task-actions">
      <h3>Act on it</h3>
      {commands && <SessionActs target={commands} offer={offer} acts={acts} />}
      <Notes notes={boundaries(row)} className="act-boundary" />
      {unaddressed && <p className="act-note muted">Its assignment isn’t known now, so nothing can be sent to it.</p>}
      <Notes notes={reasons} className="act-note" />
    </section>
  )
}
