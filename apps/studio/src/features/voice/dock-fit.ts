// Whether the dock's controls still stand on one line (docs/plans/visual-fit.md): before it would wrap, its words give
// way to their icons, as on a phone; only if the icons don't fit either does it take a second row.

export interface Box {
  top: number
  bottom: number
}

/**
 * Whether boxes laid out in a row stand on more than one line: one starts where another has already ended. Controls
 * of different heights (a 20 px separator beside a 36 px press) centred on one line never do.
 */
export function wraps(boxes: readonly Box[]): boolean {
  if (boxes.length < 2) return false
  const lowestTop = Math.max(...boxes.map((b) => b.top))
  const highestBottom = Math.min(...boxes.map((b) => b.bottom))
  return lowestTop >= highestBottom
}
