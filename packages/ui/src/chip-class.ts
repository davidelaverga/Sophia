// The chip's pure part (docs/plans/chips-radii.md): its class and its scale, with no React, so a node test can hold
// them. A chip is a word or two in a small box on the first radius: a state chip (the tag) at 20 px in the small type,
// its tone only reinforcing the word; a data chip (a model's name) at 18 px in the mono label type, tinted by its ink;
// a key is a `kbd`.
export type ChipKind = 'state' | 'data' | 'key'
export type Tone = 'teal' | 'amber' | 'lav' | 'rose' | 'muted'

/** The chip's scale, in px, and the four radii everything in the Studio stands on. */
export const CHIP = {
  state: { height: 20, pad: 7 },
  data: { height: 18, pad: 6 },
  key: { height: 18, pad: 4 },
} as const
export const RADII = [4, 6, 8, 12] as const

/** `chip`, its kind (`tag` is the state chip's name, which the specs know), its tone, then the chip's own classes. */
export function chipClass(kind: ChipKind = 'state', tone?: Tone, className = ''): string {
  return ['chip', kind === 'state' ? 'tag' : `chip-${kind}`, tone ?? '', className.trim()].filter(Boolean).join(' ')
}
