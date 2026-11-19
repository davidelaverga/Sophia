// Undo after Hold (docs/plans/undo-hold.md): a Hold sent from here that its runtime confirmed may be taken back for a
// few seconds, beside it, with the same Resume its press would send. Only the latest control for the execution shown,
// only while Resume is offered, once per Hold: its window is kept while the page lives, so a sheet closed, turned or
// reopened never brings it back. A refusal of the Undo is said as any Resume's (receipts.ts). Pure: unit-tested.
import { sameTarget, unresolved, type CommandTarget, type Known, type Offer } from './receipts.ts'

/** The line and its press. Proposed copy, Luis approves. */
export const UNDO_HOLD = { said: 'Put on hold.', act: 'Undo' } as const

/** How long an Undo is offered, from when its Hold is first offered one. */
export const UNDO_MS = 6000

/**
 * The Hold an Undo may take back now, by its operation: the latest Hold, Resume or Stop sent for exactly this execution
 * is a Hold its runtime confirmed, and Resume is offered. Null otherwise: sending, lost, unconfirmed or refused; a
 * Resume or Stop after it; another attempt or session shown; Resume not the viewer's to press.
 */
export function undoableHold(
  known: readonly Known[],
  target: CommandTarget | null,
  allowed: readonly Offer[],
): string | null {
  if (!target || !allowed.some((o) => o.kind === 'resume')) return null
  const last = known.findLast((k) => k.command.kind !== 'guidance' && sameTarget(k.command.target, target))
  if (last?.command.kind !== 'hold' || unresolved(last) || last.receipt?.effect !== 'held') return null
  return last.command.operation_id
}

/** When each Hold's Undo was first offered, while the page lives. */
const firstOffered = new Map<string, number>()

/** When a Hold's Undo ends: `UNDO_MS` after it was first offered, recorded at `now` the first time it is asked. */
export function undoUntil(operationId: string, now: number): number {
  const since = firstOffered.get(operationId) ?? now
  firstOffered.set(operationId, since)
  return since + UNDO_MS
}

/** A Hold's Undo ended before its time (taken, its sheet closed or turned, another execution shown): never offered again. */
export function endUndo(operationId: string): void {
  firstOffered.set(operationId, Number.NEGATIVE_INFINITY)
}
