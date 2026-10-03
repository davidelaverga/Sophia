// Acting on a task from its sheet, without leaving it (LFE-06.4, WBC-01 G3–G4): the commands actions.ts offers from the
// allows this viewer on this task now, through the shared SessionActs. The view decides, never the browser: no grant
// is read from a role, a logo or whose account it is, and a command the view doesn't mention is unavailable. A builder
// may guide work on someone else's resource within that owner's mandate, and is told so; a native permission answer
// or a reserve change is never a task command (they stay with the account's owner, in their tool and in Resources).
// Hold is offered while a task isn't held; Resume only while it genuinely is, and never on its own. Commands go to the
// exact assignment and generation shown: with no assignment known, nothing is sent.
import { SessionActs, type Acts } from '../../resources/SessionActs.tsx'
import { scopeOf } from '../../resources/receipts.ts'
import { boundaries, COMMANDS, notOffered, offered, targetOf } from './actions.ts'
import { actionOf, type PlanRow } from './plan.ts'

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
      {/* Keyed by its exact scope: a Stop asked on one task or generation is never answered on another. */}
      {commands && <SessionActs key={scopeOf(commands)} target={commands} offer={offer} acts={acts} />}
      <Notes notes={boundaries(row)} className="act-boundary" />
      {unaddressed && <p className="act-note muted">Its assignment isn’t known now, so nothing can be sent to it.</p>}
      <Notes notes={reasons} className="act-note" />
    </section>
  )
}
