// The card's pure part (docs/plans/card-scale.md): its class and its scale, with no React, so a node test can hold
// them. A card is a raised plane with a 1 px edge: the base card at 12 px of radius and 14 of padding (a resource, a
// report, a research card), the board's tile at 8 and 10 × 12. A live card answers the pointer and the keyboard: its
// edge lights, a press sinks it half a pixel, the focus draws the ring.
export type CardKind = 'base' | 'tile'

/** The card's scale, in px: the base card, the tile, the edge, and how far a press sinks a live card. */
export const CARD = { radius: 12, pad: 14, tile: { radius: 8, pad: [10, 12] }, edge: 1, sink: 0.5 } as const

/** `card`, `card-tile` for the board's, `live` when it answers, then the card's own classes. */
export function cardClass(kind: CardKind = 'base', live = false, className = ''): string {
  return ['card', kind === 'tile' ? 'card-tile' : '', live ? 'live' : '', className.trim()].filter(Boolean).join(' ')
}
