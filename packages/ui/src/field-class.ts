// A field's classes (Field.tsx, Search.tsx): a field stands on two heights (docs/plans/field-scale.md). A field is
// 36 px: an input, a select or a search on its own, or a group (`.field`: an input with its press, its select) whose
// press is then 28. A hero field (`lg`: the sign-in address and code, the door's name) is 44, its press 36. Pure: no
// React.

export type FieldSize = 'md' | 'lg'

/** A field's height at each size, in px. */
export const FIELD_HEIGHT: Record<FieldSize, number> = { md: 36, lg: 44 }

/** The heights a field may stand on. */
export const FIELD_SCALE: readonly number[] = [36, 44]

export interface FieldLook {
  size?: FieldSize
  /** No fill behind it: a filter in a toolbar, a find line. */
  quiet?: boolean
  /** Classes of the field's own (its width in its row), after the kit's. */
  className?: string
}

/** The class attribute of a field group: `field`, `lg` only off the field's own size, `quiet` when asked. */
export function fieldClass({ size = 'md', quiet = false, className }: FieldLook): string {
  const parts = ['field']
  if (size === 'lg') parts.push('lg')
  if (quiet) parts.push('quiet')
  if (className?.trim()) parts.push(className.trim())
  return parts.join(' ')
}

/** The class attribute of a search's box: `search`, `has-tip` when it carries one, then its own. */
export function searchClass(className?: string, tip = false): string {
  const parts = ['search']
  if (tip) parts.push('has-tip')
  if (className?.trim()) parts.push(className.trim())
  return parts.join(' ')
}
