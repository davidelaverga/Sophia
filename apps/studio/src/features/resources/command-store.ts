// Commands and their drafts, kept while the page lives (WBC-01 G4), per space: one project as one viewer sees it. They
// live here, not in the component showing them, so a board that unmounts (another goal chosen, a search that hides it)
// and comes back finds every command it sent, unresolved or not, every receipt that came meanwhile, and its drafts. A
// receipt lands even while nothing shows it. Another viewer's space is another space: nothing crosses. A reload reads
// the service again and starts from it. Pure apart from the module's own state; tested.
import {
  fold,
  lost,
  retried,
  scopeOf,
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
  /** Each scope's guidance being written. */
  drafts: Readonly<Record<string, string>>
}

const EMPTY: Space = { known: [], drafts: {} }
const spaces = new Map<string, Space>()
const listeners = new Set<() => void>()
/** The guidance operations whose sent words have already left their field once. */
const cleared = new Set<string>()

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

export const drafted = (space: string, scope: string, text: string) =>
  change(space, (s) => ({ ...s, drafts: { ...s.drafts, [scope]: text } }))

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
  const scope = scopeOf(k.command.target)
  if ((spaceOf(space).drafts[scope] ?? '').trim() === k.command.text) drafted(space, scope, '')
}

/** No reply came in time: unknown. */
export const unanswered = (space: string, operationId: string) => updated(space, operationId, lost)

/** On its way again, the same operation. */
export const resent = (space: string, operationId: string) => updated(space, operationId, retried)

/** Whether two targets are the same execution, field for field: a new attempt or session is another target. */
const TARGET_FIELDS = [
  'project_id',
  'work_id',
  'assignment_id',
  'assignment_generation',
  'attempt_id',
  'session_id',
] as const satisfies readonly (keyof CommandTarget)[]
const sameTarget = (a: CommandTarget, b: CommandTarget) => TARGET_FIELDS.every((field) => a[field] === b[field])

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
