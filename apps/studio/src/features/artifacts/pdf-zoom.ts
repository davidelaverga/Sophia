// The PDF viewer's zoom (plan §2.8.1): fit-width by default, steps from 25 % to 400 %. Kept apart from PdfView so the
// arithmetic is tested without pdf.js.

/** The zoom steps, 25 % to 400 %. */
export const ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
/** Fit width stops here: an A4 page at 150 % is already wider than a comfortable reading measure. */
export const MAX_FIT = 1.5
/** Room left beside a fit-width page. */
export const GUTTER = 32

/** The next zoom step from `scale`, up or down, within 25–400 %. */
export function zoomStep(scale: number, up: boolean): number {
  const next = up ? ZOOMS.find((z) => z > scale + 0.001) : ZOOMS.toReversed().find((z) => z < scale - 0.001)
  return next ?? (up ? MAX_ZOOM : MIN_ZOOM)
}

/** The scale at which the widest page fills `width`, within 25 % and MAX_FIT. */
export const fitScale = (width: number, widest: number): number =>
  Math.min(MAX_FIT, Math.max(MIN_ZOOM, (width - GUTTER) / widest))
