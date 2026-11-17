// A long report's «On this page» (docs/plans/report-on-this-page.md): its sections, read from the parsed Markdown as
// the stage's Sections read them (voice-trail.ts: the same levels, the same words), the title left out. A heading with
// no words (only a citation) is no link. Fewer than four: no index.
import { indexLevels, inlineText } from '../voice/voice-trail.ts'
import type { Block } from './markdown.ts'

/** Four sections or more make a report long enough to be indexed. */
export const INDEXED_FROM = 4

export interface IndexSection {
  /** Where its heading is among the report's blocks. */
  at: number
  /** The heading in its words, without its formatting or citations. */
  text: string
  /** The heading's anchor (its id is `md-<anchor>`, MarkdownView). */
  anchor: string
}

type Heading = Extract<Block, { kind: 'heading' }>

/** A heading the index can name: one with an anchor (as the stage's), at the sections' level, with words. */
const named = (b: Block, level: number): b is Heading =>
  b.kind === 'heading' && b.anchor !== '' && b.level === level && inlineText(b.children).trim() !== ''

export function pageIndex(blocks: readonly Block[]): IndexSection[] {
  const headings = blocks.filter((b): b is Heading => b.kind === 'heading' && b.anchor !== '')
  if (headings.length === 0) return []
  const { sections: level } = indexLevels(headings.map((h) => h.level))
  const sections = blocks.flatMap((b, at) =>
    named(b, level) ? [{ at, text: inlineText(b.children).trim(), anchor: b.anchor }] : [],
  )
  return sections.length >= INDEXED_FROM ? sections : []
}
