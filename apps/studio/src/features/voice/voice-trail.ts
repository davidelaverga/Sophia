// Sophia's voice through a report on the stage (docs/plans/room-voice-trail.md): what she is saying, from the captions
// the room already gets, crossed with the report's text, so the words she says light up there and her mark shows the
// section she is in. Captions are pass-through: nothing here keeps them. Pure, so the matching is unit-tested.
import type { Block, Inline } from '../artifacts/markdown.ts'
import { captionText, type CaptionTurn } from '../conversation/captions.ts'

/** The fewest words in a row that make a match: fewer could be any sentence's. */
export const RUN_MIN = 4
/** Only her latest words are matched: where she is now, not where she began. */
const TAIL = 14

/**
 * What Sophia is saying: her words, while hers is the latest turn (captionText); null once someone else speaks, or
 * before she has, so the light never stays on her words under another's.
 */
export function latestSpoken(turns: readonly CaptionTurn[]): string | null {
  const last = turns.reduce<CaptionTurn | null>((latest, t) => (!latest || t.at >= latest.at ? t : latest), null)
  const text = last?.speaker === 'sophia' ? captionText(last) : ''
  return text === '' ? null : text
}

/** A heading the section index names: its anchor and its words. */
export interface IndexEntry {
  anchor: string
  text: string
}

/** An inline run's words as a reader sees them (a citation's number is not one of them). */
export function inlineText(inline: readonly Inline[]): string {
  return inline.map(wordsIn).join('')
}

function wordsIn(node: Inline): string {
  if (node.kind === 'text' || node.kind === 'code') return node.text
  if (node.kind === 'cite') return ''
  if (node.kind === 'break') return ' '
  return inlineText(node.children)
}

/** The section index: the report's top headings (its title and the sections under it), in order. */
export function sectionIndex(blocks: readonly Block[]): IndexEntry[] {
  return blocks.flatMap((b) =>
    b.kind === 'heading' && b.level <= 2 && b.anchor ? [{ anchor: b.anchor, text: inlineText(b.children).trim() }] : [],
  )
}

/** A word in a text: its form for matching, and where it is. */
export interface Word {
  key: string
  start: number
  end: number
}

/** The words of a text, letters and digits, each with its place; case and accents don't matter for matching. */
export function wordsOf(text: string): Word[] {
  const words: Word[] = []
  for (const m of text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)) {
    const key = m[0].toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/’/g, "'")
    words.push({ key, start: m.index, end: m.index + m[0].length })
  }
  return words
}

/** Her latest words, for matching: from the turn's end only, however long the turn has grown. */
export function saidKeys(spoken: string): string[] {
  return wordsOf(spoken.slice(-TAIL * 24))
    .slice(-TAIL)
    .map((w) => w.key)
}

/** A run of her words in a block: its offsets, how many words, and where it ends in what she said. */
export interface Run {
  start: number
  end: number
  words: number
  /** How far into her latest words the run ends: the further, the nearer to where she is now. */
  saidEnd: number
}

/** A run is nearer to where she is now when it ends later in what she said; at the same end, longer. */
const nearer = (a: Run, b: Run | null) => !b || a.saidEnd > b.saidEnd || (a.saidEnd === b.saidEnd && a.words >= b.words)

/** Where in a block's text her latest words run (saidKeys), as offsets; null under RUN_MIN. */
export function spokenRun(block: string, said: readonly string[]): Run | null {
  const text = wordsOf(block)
  let best: Run | null = null
  for (let i = 0; i < text.length; i += 1) {
    for (let j = 0; j < said.length; j += 1) {
      let n = 0
      while (i + n < text.length && j + n < said.length && text[i + n]?.key === said[j + n]) n += 1
      const first = text[i]
      const last = text[i + n - 1]
      if (n < RUN_MIN || !first || !last) continue
      const run = { start: first.start, end: last.end, words: n, saidEnd: j + n }
      if (nearer(run, best)) best = run
    }
  }
  return best
}

/** Where her words are: the block's index in the list, and the run in its text. */
export interface SpokenAt extends Run {
  index: number
}

/**
 * Of the blocks' texts, the one where she is now: the run ending latest in what she said (in one turn she goes from a
 * paragraph to the next), then the longest, then the later block; null when her words run in none.
 */
export function spokenBlock(blocks: readonly string[], spoken: string | null): SpokenAt | null {
  if (!spoken) return null
  const said = saidKeys(spoken)
  let found: SpokenAt | null = null
  for (const [index, text] of blocks.entries()) {
    const run = spokenRun(text, said)
    if (run && nearer(run, found)) found = { index, ...run }
  }
  return found
}

/** The section she is in: of the headings before her words, the last that the index names. */
export function sectionAmong(before: readonly string[], index: ReadonlySet<string>): string | null {
  return before.findLast((anchor) => index.has(anchor)) ?? null
}
