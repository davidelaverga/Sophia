// A long report's «On this page» (docs/plans/report-on-this-page.md): its sections, read from the parsed Markdown. The
// sections are the top headings under the report's title: a top-level heading that comes first and only once is the
// title, and the next level present is the sections; otherwise the top level is. Fewer than four: no index.
import type { Block, Inline } from './markdown.ts'

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

const words = (inline: readonly Inline[]): string =>
  inline
    .map((n) => {
      if (n.kind === 'text' || n.kind === 'code') return n.text
      if (n.kind === 'strong' || n.kind === 'em' || n.kind === 'link') return words(n.children)
      return n.kind === 'break' ? ' ' : ''
    })
    .join('')

/** The level the sections are at: under a lone first title, the next level present; else the top level. */
function sectionLevel(headings: readonly Heading[]): number | null {
  const [first] = headings
  if (!first) return null
  const top = Math.min(...headings.map((h) => h.level))
  const titled = first.level === top && headings.filter((h) => h.level === top).length === 1
  if (!titled) return top
  const under = headings.filter((h) => h.level > top).map((h) => h.level)
  return under.length > 0 ? Math.min(...under) : null
}

export function pageIndex(blocks: readonly Block[]): IndexSection[] {
  const headings = blocks.filter((b): b is Heading => b.kind === 'heading')
  const level = sectionLevel(headings)
  const sections = blocks.flatMap((b, at) =>
    b.kind === 'heading' && b.level === level ? [{ at, text: words(b.children).trim(), anchor: b.anchor }] : [],
  )
  return sections.length >= INDEXED_FROM ? sections : []
}
