// Sophia's words lit in the report on the stage (docs/plans/room-voice-trail.md): the block her latest words run in
// is marked, the words themselves are lit through the CSS Custom Highlight API (no text node is split, so React's
// tree stays its own), and the section she is in is named for the stage's section index. Where the API is missing,
// the block's mark is enough.
import { useLayoutEffect, useState, type RefObject } from 'react'
import { sectionAmong, spokenBlock } from './voice-trail.ts'

/** The highlight's name, which theme.css styles as `::highlight(sophia-spoken)`. */
export const SPOKEN = 'sophia-spoken'
/** The blocks her words are looked for in: a paragraph, a list item, a table's cell, a quote's line. */
const BLOCKS = 'p, li, td, th'

/** The page's highlight registry, where the browser has the API (and Highlight with it); null elsewhere. */
const highlighting = (): HighlightRegistry | null =>
  'highlights' in CSS && 'Highlight' in globalThis ? CSS.highlights : null

/** A block's text as a reader sees it: a citation's number is a space, not a word; and where each text node sits in it. */
export interface BlockText {
  text: string
  pieces: readonly { node: Text; at: number }[]
}

export function blockText(block: HTMLElement): BlockText {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  const pieces: { node: Text; at: number }[] = []
  let text = ''
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text)) continue
    if (node.parentElement?.closest('sup.cite')) {
      if (!text.endsWith(' ')) text += ' '
      continue
    }
    pieces.push({ node, at: text.length })
    text += node.data
  }
  return { text, pieces }
}

/** A range over a block's text (blockText) from one offset to another, across its text nodes. */
export function rangeIn(block: BlockText, start: number, end: number): Range | null {
  const from = block.pieces.find((p) => start >= p.at && start < p.at + p.node.length)
  const to = block.pieces.findLast((p) => end > p.at && end <= p.at + p.node.length)
  if (!from || !to) return null
  const range = document.createRange()
  range.setStart(from.node, start - from.at)
  range.setEnd(to.node, end - to.at)
  return range
}

/** The anchors of the headings before a block, in order. */
const headingsBefore = (root: Element, block: Element): string[] =>
  [...root.querySelectorAll('[id^="md-"]')]
    .filter((h) => h.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING)
    .map((h) => h.id.slice('md-'.length))

/**
 * Lights her latest words in the report under `body`, again when they or the text change; returns the section she is
 * in, or null. The light goes when her words run nowhere in it, and when the report leaves the stage.
 */
export function useVoiceTrail(
  body: RefObject<HTMLElement | null>,
  spoken: string | null,
  text: unknown,
  /** The section index's anchors: her mark goes to the section of the index she is in, never a sub-heading. */
  sections: ReadonlySet<string>,
): string | null {
  const [section, setSection] = useState<string | null>(null)
  useLayoutEffect(() => {
    const root = body.current?.querySelector('.md')
    const lights = highlighting()
    if (!root) return undefined
    const blocks = [...root.querySelectorAll<HTMLElement>(BLOCKS)]
    for (const b of blocks) b.removeAttribute('data-spoken')
    const texts = blocks.map(blockText)
    const found = spokenBlock(
      texts.map((t) => t.text),
      spoken,
    )
    const block = found ? blocks[found.index] : undefined
    const shape = found ? texts[found.index] : undefined
    lights?.delete(SPOKEN)
    if (!found || !block || !shape) {
      setSection(null)
      return undefined
    }
    block.setAttribute('data-spoken', '')
    const range = rangeIn(shape, found.start, found.end)
    if (lights && range) lights.set(SPOKEN, new Highlight(range))
    setSection(sectionAmong(headingsBefore(root, block), sections))
    return () => {
      lights?.delete(SPOKEN)
    }
  }, [body, spoken, text, sections])
  return section
}
