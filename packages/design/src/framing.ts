// The page's own words around the research (SDD-01-CX-0019 F2, CX-0022). The research's text lives in its blocks; the
// designer may add only the words that frame it: headings (reworded, of any length: pack 05 §3, E4.3), captions, a
// summary of a disclosure, table headers, in-page navigation links, and the entries of the source list. Each piece of
// text is judged where it sits, by the element that holds it once inline markup is set aside: a paragraph inside a
// caption or a navigation list is a paragraph, not a label. Text of only a few marks (a bullet, a separator) frames
// nothing and is allowed anywhere. Whether a reworded heading or label keeps the research's meaning is not something
// markup can show: that is the reviewer's, against the sources.
// Text a reader meets without seeing it on the page (a tooltip, a screen reader's name) is held tighter, because no
// screenshot shows it: it repeats a visible heading, caption, summary, table header, navigation
// link or source entry, or it is a plain name (one word, or a word and a numbered id: "Contents", "Table b5").
// `aria-labelledby`, which points at visible text, is free. A citation mark's names are citations.ts's.

import {
  attr,
  elements,
  hasAncestor,
  isElement,
  isText,
  lineAt,
  textOf,
  type ChildNode,
  type Document,
  type Element,
} from './dom.ts'
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
function textFindings(doc: Document, html: string): Finding[] {
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

/** Attributes whose text a reader meets: a tooltip, or what assistive technology reads. */
const TEXT_ATTRIBUTES = [
  'title',
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'aria-placeholder',
  'aria-braillelabel',
  'aria-brailleroledescription',
]
/** A name that says nothing of its own: one word, or one word and a numbered id. */
const PLAIN_NAME = /^\p{L}{1,24}(?: \p{L}{0,3}\d[\p{L}\p{N}-]{0,10})?$/u
const plain = (text: string): string => text.normalize('NFC').replace(/\s+/gu, ' ').trim()
const lineOf = (html: string, el: Element): number => lineAt(html, el.sourceCodeLocation?.startOffset ?? 0)

/** What the page shows as labels: its headings, captions, summaries, table headers, navigation links, source entries. */
function visibleLabels(all: readonly Element[]): Set<string> {
  const out = new Set<string>()
  for (const el of all) {
    const label = (LABELS.has(el.tagName) && el.tagName !== 'title') || attr(el, 'data-source') !== null
    const navLink = el.tagName === 'a' && (attr(el, 'href') ?? '').startsWith('#') && inNav(el)
    if (label || navLink) out.add(plain(textOf(el)))
  }
  return out
}

/** Every tooltip or accessible name that carries text the page does not show. */
function attributeFindings(all: readonly Element[], html: string): Finding[] {
  const labels = visibleLabels(all)
  const shown = (value: string) => value === '' || labels.has(value) || PLAIN_NAME.test(value)
  const out: Finding[] = []
  for (const el of all) {
    if (isCite(el) || hasAncestor(el, isCite)) continue
    for (const name of TEXT_ATTRIBUTES) {
      const value = attr(el, name)
      if (value === null || shown(plain(value))) continue
      out.push(
        error(
          'attribute_text',
          'index.html',
          `<${el.tagName} ${name}=${JSON.stringify(value.slice(0, 80))}> carries text the page does not show. A tooltip ` +
            'or an accessible name repeats a visible heading, caption, summary, table header, navigation link or source ' +
            'entry, or is a plain name ("Contents", "Table b5"); aria-labelledby can point at visible text instead',
          { line: lineOf(html, el) },
        ),
      )
    }
  }
  return out
}

/** The page's own words around the research: its text, and the text its attributes carry. */
export function framingFindings(doc: Document, html: string): Finding[] {
  return [...textFindings(doc, html), ...attributeFindings(elements(doc), html)]
}
