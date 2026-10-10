// A chip (the kit's ninth piece, docs/plans/chips-radii.md): a word or two in a small box on the first radius, the
// `.chip` theme.css look. A state chip (`kind="state"`, the tag) carries a tone and, when asked, a dot: the colour only
// reinforces the word, never says it alone. A data chip (`kind="data"`: a model's name) is the mono label type, tinted
// by its own ink (`--chip-ink`). A key (`kind="key"`) is a `kbd`, as the tips draw them.
import type { ComponentPropsWithRef, ReactNode } from 'react'
import { chipClass, type ChipKind, type Tone } from './chip-class.ts'

export interface ChipProps extends Omit<ComponentPropsWithRef<'span'>, 'children'> {
  kind?: ChipKind
  /** A state chip's tone. */
  tone?: Tone
  /** A dot before the words, in the tone's ink. */
  dot?: boolean
  children: ReactNode
}

export function Chip({ kind = 'state', tone, dot = false, className, children, ...rest }: ChipProps) {
  if (kind === 'key') return <kbd className={className}>{children}</kbd>
  return (
    <span {...rest} className={chipClass(kind, tone, className)}>
      {dot && <span className="dot" aria-hidden />}
      {children}
    </span>
  )
}
