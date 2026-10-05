// What a task's sheet offers to send (WBC-01 G3): exactly the commands the board's view allows this viewer on this task
// now. The view decides, never the browser: no grant is read from a role, a logo or whose account it is, and a command
// the view doesn't mention is unavailable. Hold is offered while a task isn't held; Resume only while it genuinely is.
// Commands go to the exact assignment and generation shown: with no assignment known, there is no target. Pure: tested.
import type { CommandKind, CommandTarget, Offer } from '../../resources/receipts.ts'
import { actionOf, type PlanRow } from './plan.ts'

export const COMMANDS: readonly CommandKind[] = ['guidance', 'hold', 'resume', 'stop']
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

/**
 * Whether anything can be sent to a task now: not while its state isn't observed (Codex F-002, CC-0001 reading 1).
 * Reading it and asking about it stay as the view allows.
 */
export const writable = (row: PlanRow) => row.status.mark !== 'unknown'

const UNOBSERVED = 'Its state isn’t observed now, so nothing can be sent to it until it is.'

/** The commands offered: what the view allows and the state fits, Hold and Resume with what they do as their tip. */
export function offered(row: PlanRow): Offer[] {
  if (!writable(row)) return []
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
    if (!action || !fits(row, kind)) continue
    const reason = action.availability !== 'allowed' ? action.reason : writable(row) ? null : UNOBSERVED
    if (reason) why.set(reason, [...(why.get(reason) ?? []), NAME[kind]])
  }
  return [...why].map(([reason, names]) => `${listed(names)}: ${reason}`)
}

/** The mandates the offered commands act within, when the view names one. */
export const boundaries = (row: PlanRow) => [
  ...new Set(
    COMMANDS.flatMap((kind) => {
      const action = actionOf(row, kind)
      return action?.availability === 'allowed' && action.boundary && fits(row, kind) && writable(row)
        ? [action.boundary]
        : []
    }),
  ),
]
