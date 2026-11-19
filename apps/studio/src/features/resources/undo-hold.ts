// Undo after Hold (docs/plans/undo-hold.md): a Hold sent from here that its runtime confirmed may be taken back for a
// few seconds, beside it, with the same Resume its press would send. Only the latest control for the execution shown,
// only while Resume is offered, and only a Hold the sheet saw on its way: one confirmed while the sheet was closed or
// showed another task is never offered later. Its window is the sheet's own (undoWatch), gone with it. A refusal of the
// Undo is said as any Resume's (receipts.ts). Pure: unit-tested.
import { sameTarget, unresolved, type CommandTarget, type Known, type Offer } from './receipts.ts'

/** The line and its press. Proposed copy, Luis approves. */
export const UNDO_HOLD = { said: 'Put on hold.', act: 'Undo' } as const

/** How long an Undo is offered, from when its Hold is first offered one. */
export const UNDO_MS = 6000

/** The latest Hold, Resume or Stop sent for exactly this execution. */
const lastControl = (known: readonly Known[], target: CommandTarget) =>
  known.findLast((k) => k.command.kind !== 'guidance' && sameTarget(k.command.target, target))

/**
 * The Hold an Undo may take back now, by its operation: the latest control for exactly this execution is a Hold its
 * runtime confirmed, and Resume is offered. Null otherwise: sending, lost, unconfirmed or refused; a Resume or Stop
 * after it; another attempt or session shown; Resume not the viewer's to press.
 */
export function undoableHold(
  known: readonly Known[],
  target: CommandTarget | null,
  allowed: readonly Offer[],
): string | null {
  if (!target || !allowed.some((o) => o.kind === 'resume')) return null
  const last = lastControl(known, target)
  if (last?.command.kind !== 'hold' || unresolved(last) || last.receipt?.effect !== 'held') return null
  return last.command.operation_id
}

/** The Hold on its way for exactly this execution, by its operation: the latest control, neither settled nor refused. */
export function pendingHold(known: readonly Known[], target: CommandTarget | null): string | null {
  const last = target ? lastControl(known, target) : undefined
  if (last?.command.kind !== 'hold' || last.receipt?.admission === 'rejected' || !unresolved(last)) return null
  return last.command.operation_id
}

/**
 * One sheet's Undo windows: `see` the Hold on its way, `offer` the Hold confirmed. Only a Hold seen on its way here is
 * offered, `UNDO_MS` from its first offer, the same end each time it is asked; none after. A window over is forgotten on
 * the next ask, so nothing grows; it belongs to one sheet and one execution, and goes with it.
 */
export function undoWatch() {
  const watched = new Set<string>()
  const until = new Map<string, number>()
  const sweep = (now: number) => {
    for (const [hold, end] of until)
      if (end <= now) {
        until.delete(hold)
        watched.delete(hold)
      }
  }
  return {
    see(hold: string | null): void {
      if (hold) watched.add(hold)
    },
    /** When the Undo for `hold` ends, while it is offered; null when it isn't (not seen on its way, or over). */
    offer(hold: string | null, now: number): number | null {
      sweep(now)
      if (!hold || !watched.has(hold)) return null
      const end = until.get(hold) ?? now + UNDO_MS
      until.set(hold, end)
      return end
    },
    /** How many Holds it keeps now. */
    size: () => watched.size,
  }
}

export type UndoWatch = ReturnType<typeof undoWatch>
