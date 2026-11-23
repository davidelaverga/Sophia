// Where the focus goes when the control that held it goes away after a press (docs/plans/focus-kept.md): to the control
// that takes its place, never the page. Pure, so the choice is tested; useFocusKept wires it to a box in the page.

/** What the choice reads of a control: enough to know whether the focus can rest on it. */
export interface Candidate {
  /** Its slot (`data-focus-slot`): Hold and Resume share «pause», so one hands the focus to the other. */
  slot: string | null
  /** Natively disabled or hidden: the focus can't rest there. */
  unusable: boolean
  /** The box's last resort (`data-focus-fallback`): a status line, taken only when no control is left. */
  fallback: boolean
}

/**
 * The index of the control to focus, or -1: the one in the slot the lost control had; else the control at the lost
 * one's place in the row (or the last before it); else the box's fallback. Waiting controls (`aria-disabled`) count:
 * they keep the focus as they wait.
 */
export function nextFocus(candidates: readonly Candidate[], lost: { slot: string | null; index: number }): number {
  const usable = candidates.map((c, i) => ({ c, i })).filter(({ c }) => !c.unusable)
  const controls = usable.filter(({ c }) => !c.fallback)
  if (lost.slot !== null) {
    const same = controls.find(({ c }) => c.slot === lost.slot)
    if (same) return same.i
  }
  const at = controls[Math.min(Math.max(lost.index, 0), controls.length - 1)]
  if (at) return at.i
  return usable.find(({ c }) => c.fallback)?.i ?? -1
}

/** How long after a press inside the box a lost focus is still handed on: a slow server's answer included. */
export const KEPT_MS = 30_000
