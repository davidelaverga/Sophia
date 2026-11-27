// Whether the dock's controls still stand on one line (docs/plans/visual-fit.md): before it would wrap, its words give
// way to their icons, as on a phone; if the icons don't fit either, its extras wait behind More controls
// (docs/plans/dock-fold.md).

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

/** How the dock is laid out: its words, its icons (`data-tight`), or its extras behind More controls (`data-fold`). */
export type DockLayout = 'words' | 'icons' | 'folded'

/**
 * The first layout, in that order, whose row stands on one line: `wrapsAs` lays the dock out so and reads it. Folded is
 * the last resort, taken without a reading of its own.
 */
export function firstFit(wrapsAs: (layout: DockLayout) => boolean): DockLayout {
  return (['words', 'icons'] as const).find((layout) => !wrapsAs(layout)) ?? 'folded'
}

/** Where the corner (Chat, People, Brief) sits: low, level with the dock, or up at the lenses' line. */
export interface DockFit {
  layout: DockLayout
  cornerUp: boolean
}

/**
 * The corner keeps its place beside the dock while the dock fits there in any layout, folded included
 * (docs/plans/corner-stays-low.md): opening the panel moves nothing under the pointer. Only where even folded it would
 * wrap does the corner go up and leave the band to the dock.
 */
export function fitBeside(wrapsAs: (layout: DockLayout, cornerUp: boolean) => boolean): DockFit {
  const low = (['words', 'icons', 'folded'] as const).find((layout) => !wrapsAs(layout, false))
  if (low) return { layout: low, cornerUp: false }
  return { layout: firstFit((layout) => wrapsAs(layout, true)), cornerUp: true }
}
