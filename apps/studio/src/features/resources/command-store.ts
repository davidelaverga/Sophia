// Commands and their drafts, kept while the page lives (WBC-01 G4), per space: one project as one viewer sees it. They
// live here, not in the component showing them, so a board that unmounts (another goal chosen, a search that hides it)
// and comes back finds every command it sent, unresolved or not, every receipt that came meanwhile, and its drafts. A
// receipt lands even while nothing shows it. Another viewer's space is another space: nothing crosses. A reload reads
// the service again and starts from it. Pure apart from the module's own state; tested.
import {
  executionOf,
  fold,
  lost,
  retried,
  sameTarget,
  sending,
  unresolved,
  type Command,
  type CommandKind,
  type CommandTarget,
  type Known,
} from './receipts.ts'

export interface Space {
  /** Every command sent in the space, oldest first. */
  known: readonly Known[]
  /** Each execution's guidance being written (receipts.ts `executionOf`). */
  drafts: Readonly<Record<string, string>>
}

const EMPTY: Space = { known: [], drafts: {} }
const spaces = new Map<string, Space>()
const listeners = new Set<() => void>()
/** The guidance operations whose sent words have already left their field once. */
const cleared = new Set<string>()

/**
 * The one space for a project as one viewer sees it: Resources and Tasks share it, so a command sent from either is
 * known to both, and the same request from the other is the same operation (Codex F-016). Another project or viewer is
 * another space.
 */
export const commandSpace = (project: string, viewer: string | null) => [project, viewer ?? ''].join('|')

export const spaceOf = (space: string): Space => spaces.get(space) ?? EMPTY

function change(space: string, next: (s: Space) => Space): void {
  spaces.set(space, next(spaceOf(space)))
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A command sent: on its way, nothing heard back yet. */
export const added = (space: string, command: Command) =>
  change(space, (s) => ({ ...s, known: [...s.known, sending(command)] }))

/** One operation's state changed. */
export const updated = (space: string, operationId: string, next: (k: Known) => Known) =>
  change(space, (s) => ({ ...s, known: s.known.map((k) => (k.command.operation_id === operationId ? next(k) : k)) }))

export const drafted = (space: string, execution: string, text: string) =>
  change(space, (s) => ({ ...s, drafts: { ...s.drafts, [execution]: text } }))

/** One operation, as it stands. */
export const commandOf = (space: string, operationId: string) =>
  spaceOf(space).known.find((k) => k.command.operation_id === operationId) ?? null

/**
 * A receipt for one operation, folded in (receipts.ts). Guidance it records as accepted leaves its field, once, if the
 * field still holds exactly its words: what was typed since stays, and a refused guidance keeps its words to send again.
 */
export function received(space: string, operationId: string, receipt: unknown): void {
  updated(space, operationId, (k) => fold(k, receipt))
  const k = commandOf(space, operationId)
  if (!k || k.command.kind !== 'guidance' || k.receipt?.admission !== 'recorded' || cleared.has(operationId)) return
  cleared.add(operationId)
  const execution = executionOf(k.command.target)
  if ((spaceOf(space).drafts[execution] ?? '').trim() === k.command.text) drafted(space, execution, '')
}

/** No reply came in time: unknown. */
export const unanswered = (space: string, operationId: string) => updated(space, operationId, lost)

/** On its way again, the same operation. */
export const resent = (space: string, operationId: string) => updated(space, operationId, retried)

/**
 * The same request again, when it is one: a control of the same kind still unresolved for exactly the same target
 * (project, work, assignment, generation, attempt and session), or the same guidance, word for word. It goes again with
 * its own operation, never as a second one. A command for an earlier attempt or session is not the same request:
 * pressing Stop on the attempt shown now stops that attempt, with a new operation (PR #76 review, P1).
 */
export function repeatOf(space: string, kind: CommandKind, target: CommandTarget, text?: string): Known | null {
  return (
    spaceOf(space).known.findLast(
      (k) =>
        sameTarget(k.command.target, target) &&
        k.command.kind === kind &&
        unresolved(k) &&
        (kind !== 'guidance' || k.command.text === text),
    ) ?? null
  )
}
