// The states' pure part (docs/plans/states.md): their classes and their scale, with no React, so a node test can hold
// them. A view reads (a skeleton: shapes in place of what comes, a light passing over them), has nothing (an empty
// state: the sentence where the first row would be, its way forward under it), or says a read is on (a read note).
export type SkeletonKind = 'bars' | 'card' | 'row'

/** The states' scale, in px and ms: a skeleton's bars and light, an empty state's padding and gap. */
export const STATES = {
  skeleton: { bar: 10, title: 14, gap: 12, light: 1600, stagger: 80, card: { pad: [16, 14], height: 150 } },
  empty: { pad: [18, 24], gap: 14, slot: 56 },
} as const

/** `skeleton`, its kind when not loose bars, then the skeleton's own classes (its host's grid). */
export function skeletonClass(kind: SkeletonKind = 'bars', className = ''): string {
  return ['skeleton', kind === 'bars' ? '' : `skeleton-${kind}`, className.trim()].filter(Boolean).join(' ')
}

/** `empty`, `empty-slot` for a box with nothing in it (a board lane), then the state's own classes. */
export function emptyClass(slot = false, className = ''): string {
  return ['empty', slot ? 'empty-slot' : '', className.trim()].filter(Boolean).join(' ')
}
