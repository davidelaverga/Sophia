// A card (the kit's seventh piece, docs/plans/card-scale.md): the raised plane a resource, a report, a research card or
// a board tile stands on, in the `.card` theme.css surface: a 1 px edge, 12 px of radius and 14 of padding (the tile 8
// and 10 × 12). It is whatever element the place needs (`as`: a list item, a button when the whole card is pressed) and
// names its own layout; the kit gives it its surface and, when it is live, its answers: the edge lights and the plane
// rises a step under the pointer, a press sinks it half a pixel, the keyboard draws the ring. A button or a link is
// live unless told otherwise. `CardCover` is the deeper plane inside a card (a report's page).
import type { ComponentPropsWithRef, ElementType, ReactNode } from 'react'
import { cardClass, type CardKind } from './card-class.ts'

/** What a card can be: a box, a list item, an article or a section; a button or a link when it is pressed whole. */
export type CardTag = 'div' | 'li' | 'article' | 'section' | 'button' | 'a'

export type CardProps<T extends CardTag> = Omit<ComponentPropsWithRef<T>, 'className' | 'children'> & {
  as?: T | undefined
  kind?: CardKind | undefined
  /** Answers the pointer and the keyboard; a button or a link does unless told otherwise. */
  live?: boolean | undefined
  className?: string | undefined
  children?: ReactNode
}

export function Card<T extends CardTag = 'div'>({ as, kind, live, className, children, ...rest }: CardProps<T>) {
  // The element is chosen at run time: its props are the chosen tag's, which `CardProps<T>` already held to.
  const Tag = (as ?? 'div') as ElementType<Record<string, unknown>>
  const pressed = as === 'button' || as === 'a'
  const props: Record<string, unknown> = { ...rest, className: cardClass(kind, live ?? pressed, className) }
  if (as === 'button') props['type'] ??= 'button'
  return <Tag {...props}>{children}</Tag>
}

/** A cover inside a card (a report's page): the deeper plane behind the card's edge, the smaller radius. */
export function CardCover({ className = '', children, ...rest }: ComponentPropsWithRef<'div'>) {
  return (
    <div {...rest} className={`card-cover ${className}`.trim()}>
      {children}
    </div>
  )
}
