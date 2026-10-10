// A press's classes (Button.tsx): its kind names the look theme.css already draws (`pill`, `pill primary`, `ghost`,
// `text-button`, `round`…), its size one of the four heights every single-line press stands on (24, 28, 32, 36 px;
// docs/plans/control-heights.md). Each kind has a size of its own, drawn by its class alone; another size adds one
// modifier (`sz-sm`, `sz-md`, `sz-lg`), so what already renders at its kind's size is untouched. Pure: no React.

/** What a press looks like. `icon` is a square for one icon (`.round`); `text` an inline underlined action. */
export type ButtonKind = 'pill' | 'primary' | 'ghost' | 'text' | 'icon' | 'warm' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

/** The classes of each kind, as theme.css names them. */
const KIND_CLASS: Record<ButtonKind, string> = {
  pill: 'pill',
  primary: 'pill primary',
  warm: 'pill warm',
  danger: 'pill danger',
  ghost: 'ghost',
  text: 'text-button',
  icon: 'round',
}

/** The size each kind's class draws on its own (no modifier). */
const OWN_SIZE: Record<ButtonKind, ButtonSize> = {
  pill: 'md',
  primary: 'md',
  warm: 'md',
  danger: 'md',
  ghost: 'md',
  text: 'sm',
  icon: 'lg',
}

/** Each kind's height at each size, in px: the scale is 24 · 28 · 32 · 36, and a kind takes three steps of it. */
export const HEIGHT: Record<ButtonKind, Record<ButtonSize, number>> = {
  pill: { sm: 28, md: 32, lg: 36 },
  primary: { sm: 28, md: 32, lg: 36 },
  warm: { sm: 28, md: 32, lg: 36 },
  danger: { sm: 28, md: 32, lg: 36 },
  ghost: { sm: 24, md: 28, lg: 32 },
  // An inline action is one height: its line (24 px). A size asked of it changes nothing.
  text: { sm: 24, md: 24, lg: 24 },
  icon: { sm: 28, md: 32, lg: 36 },
}

/** The heights a single-line press may stand on. */
export const SCALE: readonly number[] = [24, 28, 32, 36]

export interface ButtonLook {
  kind?: ButtonKind
  size?: ButtonSize
  /** Classes of the press's own (its place, its feature's look), after the kit's. */
  className?: string
  /** It carries a tip (`has-tip`, `Tip`). */
  tip?: boolean
}

/** The class attribute of a press: its kind's classes, a size modifier only when it differs from the kind's own. */
export function buttonClass({ kind = 'pill', size, className, tip = false }: ButtonLook): string {
  const parts = [KIND_CLASS[kind]]
  if (kind !== 'text' && size !== undefined && size !== OWN_SIZE[kind]) parts.push(`sz-${size}`)
  if (tip) parts.push('has-tip')
  if (className) parts.push(className.trim())
  return parts.filter((p) => p !== '').join(' ')
}

/** The height a press of this kind and size stands at. */
export const buttonHeight = (kind: ButtonKind = 'pill', size?: ButtonSize): number =>
  HEIGHT[kind][size ?? OWN_SIZE[kind]]
