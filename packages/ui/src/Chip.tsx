// A chip (the kit's ninth piece, docs/plans/chips-radii.md): a word or two in a small box on the first radius, the
// `.chip` theme.css look. A state chip (`kind="state"`, the tag) carries a tone and, when asked, a dot: the colour only
// reinforces the word, never says it alone. A data chip (`kind="data"`: a model's name) is the mono label type, tinted
// by its own ink (`--chip-ink`). A key (`kind="key"`) is a `kbd`, as the tips draw them, with the same props and ref (a
// `kbd` is an element like a `span`: its ref is typed as one).
import type { ComponentPropsWithRef, ElementType, ReactNode } from 'react'
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
  // The element is chosen at run time (a `kbd` for a key, a `span` otherwise), with the same props on either.
  const Tag = (kind === 'key' ? 'kbd' : 'span') as ElementType<Record<string, unknown>>
  const props: Record<string, unknown> = {
    ...rest,
    className: kind === 'key' ? className : chipClass(kind, tone, className),
  }
  return (
    <Tag {...props}>
      {dot && kind !== 'key' && <span className="dot" aria-hidden />}
      {children}
    </Tag>
  )
}
