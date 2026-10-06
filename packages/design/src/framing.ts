// The page's own words around the research (SDD-01-CX-0019 F2, CX-0022). The research's text lives in its blocks; the
// designer may add only the words that frame it: headings (reworded, of any length: pack 05 §3, E4.3), captions, a
// summary of a disclosure, table headers, in-page navigation links, and the entries of the source list. Each piece of
// text is judged where it sits, by the element that holds it once inline markup is set aside: a paragraph inside a
// caption or a navigation list is a paragraph, not a label. Text of only a few marks (a bullet, a separator) frames
// nothing and is allowed anywhere. Whether a reworded heading or label keeps the research's meaning is not something
// markup can show: that is the reviewer's, against the sources.

import { attr, elements, isElement, isText, lineAt, type ChildNode, type Document, type Element } from './dom.ts'
import { error, type Finding } from './findings.ts'

/** Inline elements: text inside them belongs to the element that holds them. */
const PHRASING = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'i',
  'ins',
  'kbd',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
])
/** Elements whose own text frames the research. */
const LABELS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'caption',
  'figcaption',
  'summary',
  'th',
  'legend',
  'title',
])
/** A few marks that say nothing: separators, bullets, arrows. */
const MARKS = /^[^\p{L}\p{N}]{0,3}$/u

const isBlock = (el: Element): boolean => attr(el, 'data-block') !== null
const isCite = (el: Element): boolean => attr(el, 'data-cite') !== null

/** The element that holds a text, inline markup set aside, and whether an in-page link is among that markup. */
function holderOf(text: ChildNode): { holder: Element | null; inPageLink: boolean } {
  let inPageLink = false
  for (let p = text.parentNode; p && isElement(p); p = p.parentNode) {
    if (!PHRASING.has(p.tagName)) return { holder: p, inPageLink }
    if (p.tagName === 'a' && (attr(p, 'href') ?? '').startsWith('#')) inPageLink = true
  }
  return { holder: null, inPageLink }
}

/** Whether a text belongs to the research (a block), to a citation mark (citations.ts), or to the document head. */
function checkedElsewhere(text: ChildNode): boolean {
  for (let p = text.parentNode; p && isElement(p); p = p.parentNode)
    if (isBlock(p) || isCite(p) || p.tagName === 'head') return true
  return false
}

const inNav = (el: Element): boolean => {
  for (let p: Element | null = el; p; p = p.parentNode && isElement(p.parentNode) ? p.parentNode : null)
    if (p.tagName === 'nav') return true
  return false
}

/** Whether a text, held by `holder`, may frame the research there. */
function frames(holder: Element, inPageLink: boolean): boolean {
  if (LABELS.has(holder.tagName) || attr(holder, 'data-source') !== null) return true
  return inPageLink && (holder.tagName === 'li' || holder.tagName === 'nav') && inNav(holder)
}

/** Every text outside the research's blocks that is not a heading, a label, a navigation link or a source entry. */
export function framingFindings(doc: Document, html: string): Finding[] {
  const out: Finding[] = []
  const flagged = new Set<Element>()
  for (const el of elements(doc))
    for (const node of el.childNodes) {
      if (!isText(node) || MARKS.test(node.value.trim()) || checkedElsewhere(node)) continue
      const { holder, inPageLink } = holderOf(node)
      if (!holder || frames(holder, inPageLink) || flagged.has(holder)) continue
      flagged.add(holder)
      out.push(
        error(
          'text_outside_blocks',
          'index.html',
          `<${holder.tagName}> holds text that is not the research's: ${JSON.stringify(node.value.trim().slice(0, 80))}. ` +
            'Outside its blocks a page may only add headings, captions, a summary, table headers, in-page navigation ' +
            'links and source entries',
          { line: lineAt(html, holder.sourceCodeLocation?.startOffset ?? 0) },
        ),
      )
    }
  return out
}
