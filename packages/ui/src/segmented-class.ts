// A segmented control's classes and semantics (Segmented.tsx; docs/plans/segmented-scale.md): one box of presses of
// which one is on. It stands on the field scale: 36 px with 28 px presses, or small (`sm`) 32 with 24, as the report
// viewer's format switch. Its role says what the presses are: tabs (a panel each, the arrows move the choice), radios
// (one of a set, the arrows too) or a group of pressed buttons (a filter, each press its own stop). Pure: no React.

export type SegmentedRole = 'tablist' | 'radiogroup' | 'group'
export type SegmentedSize = 'md' | 'sm'

/** The box's and its presses' heights at each size, in px. */
export const SEGMENTED_HEIGHT: Record<SegmentedSize, { box: number; press: number }> = {
  md: { box: 36, press: 28 },
  sm: { box: 32, press: 24 },
}

/** The class attribute of the box: `segmented`, `sz-sm` off its own size, then its own classes. */
export function segmentedClass({ size = 'md', className }: { size?: SegmentedSize; className?: string }): string {
  const parts = ['segmented']
  if (size === 'sm') parts.push('sz-sm')
  if (className?.trim()) parts.push(className.trim())
  return parts.join(' ')
}

/** The role of a press in a box of this role: a tab, a radio, or none (a plain pressed button). */
export const itemRole = (role: SegmentedRole): 'tab' | 'radio' | undefined =>
  role === 'tablist' ? 'tab' : role === 'radiogroup' ? 'radio' : undefined

/** Whether the arrows move the choice and one press alone is a Tab stop (tabs and radios), or each press is a stop. */
export const roves = (role: SegmentedRole): boolean => role !== 'group'

/** The attribute that says a press is on, by the box's role. */
export function itemState(
  role: SegmentedRole,
  on: boolean,
): { 'aria-selected': boolean } | { 'aria-checked': boolean } | { 'aria-pressed': boolean } {
  if (role === 'tablist') return { 'aria-selected': on }
  if (role === 'radiogroup') return { 'aria-checked': on }
  return { 'aria-pressed': on }
}

/** The press's own classes: `has-tip` when it carries a tip, then its own. */
export function itemClass(tip: boolean, className?: string): string | undefined {
  const parts = [...(tip ? ['has-tip'] : []), ...(className?.trim() ? [className.trim()] : [])]
  return parts.length > 0 ? parts.join(' ') : undefined
}
