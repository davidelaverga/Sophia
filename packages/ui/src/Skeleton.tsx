// A skeleton (the kit's eighth piece, with EmptyState and ReadNote: docs/plans/states.md): shapes in place of what a
// view reads, a light passing over them, the `.skeleton` theme.css look. It says what it reads (`label`) to a screen
// reader (a status, out of sight) and marks itself busy. Its shapes are loose bars (a list's first row), cards (a grid
// of tiles, in the host's own grid: `className`) or rows (an index's rows); each shape's light runs 80 ms after the
// last. It names no layout of its own: the host's grid places the shapes.
import { skeletonClass, STATES, type SkeletonKind } from './state-class.ts'

export interface SkeletonProps {
  /** What is being read, for a screen reader: «Reading the resources…». */
  label: string
  kind?: SkeletonKind
  /** How many shapes stand in: one list's row, six tiles, three index rows. */
  count?: number
  className?: string
}

/** A row's shape is two words' worth on one line; the others three lines. */
const BARS: Record<SkeletonKind, number> = { bars: 3, card: 3, row: 2 }

export function Skeleton({ label, kind = 'bars', count = 1, className }: SkeletonProps) {
  return (
    <div className={skeletonClass(kind, className)} aria-busy="true">
      <p className="sr-only" role="status">
        {label}
      </p>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="skeleton-shape"
          aria-hidden
          style={{ animationDelay: `${String(i * STATES.skeleton.stagger)}ms` }}
        >
          {Array.from({ length: BARS[kind] }, (_bar, j) => (
            <span key={j} />
          ))}
        </span>
      ))}
    </div>
  )
}
