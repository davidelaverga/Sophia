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

/**
 * The chip's element and the props React gets, so a node test can hold the forwarding: a key is a `kbd` with the
 * caller's own props and ref passed whole and its class as given (the tips draw it); the rest are a `span` in the
 * chip's class (Codex on #230).
 */
export function chipElement(
  kind: ChipKind,
  tone: Tone | undefined,
  className: string | undefined,
  rest: Readonly<Record<string, unknown>>,
): { tag: 'kbd' | 'span'; props: Record<string, unknown> } {
  return {
    tag: kind === 'key' ? 'kbd' : 'span',
    props: { ...rest, className: kind === 'key' ? className : chipClass(kind, tone, className) },
  }
}
