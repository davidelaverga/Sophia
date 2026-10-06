// The page's own words around the research (SDD-01-CX-0019 F2, CX-0022). The research's text lives in its blocks; the
// designer may add only the words that frame it: headings (reworded, of any length: pack 05 §3, E4.3), captions, a
// summary of a disclosure, table headers, in-page navigation links, and the entries of the source list. Each piece of
// text is judged where it sits, by the element that holds it once inline markup is set aside: a paragraph inside a
// caption or a navigation list is a paragraph, not a label. Text of only a few marks (a bullet, a separator, from
// css.ts's list, which holds no letter-shaped symbol: #117) frames nothing and is allowed anywhere. Whether a reworded
// heading or label keeps the research's meaning is not something markup can show: that is the reviewer's, against the
// sources.
// Text a reader meets without seeing it on the page (a tooltip, a screen reader's name) is held tighter, because no
// screenshot shows it: it repeats a label (a heading, caption, summary, table header, navigation link or source entry)
// or it is a plain name (one word, or a word and a numbered id: "Contents", "Table b5"). An ID reference
// (aria-labelledby and the rest) names only research, labels or marks. A label that markup hides (hidden, aria-hidden)
// proves nothing; one that a tooltip, a name or a reference rests on is marked at compile (shownLabels,
// data-sophia-shown) and the render measures it as it measures a block, so CSS cannot hide it either (#117, CX-0037).
// A citation marker and its link carry the same attributes, held by citations.ts to a citation mark or name and to
// their own source's entry.

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
  type TextNode,
} from './dom.ts'
import { onlyMarks } from './css.ts'
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
/** A few marks that say nothing (separators, bullets, arrows: css.ts's list), which a row of them cannot change. */
const isMarks = (text: string): boolean => onlyMarks(text, 3)

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
      if (!isText(node) || isMarks(node.value) || checkedElsewhere(node)) continue
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

/**
 * Attributes whose text a reader meets without seeing it on the page: a tooltip, a table header's short form, and every
 * ARIA attribute whose value is a string (WAI-ARIA 1.3), which assistive technology reads or puts on a braille display.
 * The profile allows no other attribute that shows text, and CSS cannot draw one (`attr()` is refused). citations.ts holds
 * a citation marker and its link to the same list.
 */
export const TEXT_ATTRIBUTES: readonly string[] = [
  'title',
  'abbr',
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'aria-placeholder',
  'aria-keyshortcuts',
  'aria-braillelabel',
  'aria-brailleroledescription',
  'aria-colindextext',
  'aria-rowindextext',
]
/**
 * Attributes that name other elements by id, whose text assistive technology then reads there or takes the reader to:
 * every ID reference of WAI-ARIA 1.3, and a table cell's `headers`. citations.ts holds a marker to the same list.
 */
export const REFERENCE_ATTRIBUTES: readonly string[] = [
  'aria-labelledby',
  'aria-describedby',
  'aria-details',
  'aria-errormessage',
  'aria-activedescendant',
  'aria-controls',
  'aria-flowto',
  'aria-owns',
  'headers',
]
/** The ids one reference attribute of an element names. */
export const referencedIds = (el: Element, name: string): string[] =>
  (attr(el, name) ?? '').split(/\s+/u).filter((id) => id !== '')
/** A name that says nothing of its own: one word, or one word and a numbered id. */
const PLAIN_NAME = /^\p{L}{1,24}(?: \p{L}{0,3}\d[\p{L}\p{N}-]{0,10})?$/u
const plain = (text: string): string => text.normalize('NFC').replace(/\s+/gu, ' ').trim()
const lineOf = (html: string, el: Element): number => lineAt(html, el.sourceCodeLocation?.startOffset ?? 0)
const concealing = (el: Element): boolean => attr(el, 'hidden') !== null || attr(el, 'aria-hidden') === 'true'

/** Hidden by its markup: it or an ancestor carries `hidden` or `aria-hidden="true"`. What CSS hides, the render measures. */
export const hiddenByMarkup = (el: Element): boolean => concealing(el) || hasAncestor(el, concealing)

/** Whether an element's own text frames the research: a heading, caption, summary, table header or legend, a source
 * entry, or an in-page navigation link. */
export function isLabel(el: Element): boolean {
  if ((LABELS.has(el.tagName) && el.tagName !== 'title') || attr(el, 'data-source') !== null) return true
  return el.tagName === 'a' && (attr(el, 'href') ?? '').startsWith('#') && inNav(el)
}

/** The labels a tooltip or a name may repeat, by their text: those their markup does not hide. */
function labelsByText(all: readonly Element[]): Map<string, Element[]> {
  const out = new Map<string, Element[]>()
  for (const el of all) {
    if (!isLabel(el) || hiddenByMarkup(el)) continue
    const text = plain(textOf(el))
    out.set(text, [...(out.get(text) ?? []), el])
  }
  return out
}

/** Every element by its id (the first, if the page repeats one: the profile refuses that). */
function byId(all: readonly Element[]): Map<string, Element> {
  const out = new Map<string, Element>()
  for (const el of all) {
    const id = attr(el, 'id')
    if (id !== null && !out.has(id)) out.set(id, el)
  }
  return out
}

/** The text nodes inside an element, in order. */
function textNodesIn(el: Element): TextNode[] {
  return el.childNodes.flatMap((node) => (isText(node) ? [node] : isElement(node) ? textNodesIn(node) : []))
}

/** The nearest label that holds a node, or null. */
function labelOf(node: ChildNode): Element | null {
  for (let p = node.parentNode; p && isElement(p); p = p.parentNode) if (isLabel(p)) return p
  return null
}

const inBlock = (node: ChildNode): boolean => {
  for (let p = node.parentNode; p && isElement(p); p = p.parentNode) if (isBlock(p)) return true
  return false
}

/**
 * Why an ID reference may not name `target`, or null, with the labels whose text it reads added to `shown`: the target
 * is on the page, not hidden by its markup, and holds only research (blocks), labels or marks.
 */
function referenceIssue(target: Element | undefined, shown: Set<Element>): string | null {
  if (!target) return 'names no element of the page'
  if (hiddenByMarkup(target)) return 'names an element its markup hides (hidden, aria-hidden)'
  const labels: Element[] = []
  for (const node of textNodesIn(target)) {
    if (isMarks(node.value) || inBlock(node)) continue
    const label = labelOf(node)
    if (!label) return 'names text that is neither the research (a block) nor a label'
    labels.push(label)
  }
  for (const label of labels) shown.add(label)
  return null
}

interface Context {
  readonly labels: ReadonlyMap<string, Element[]>
  readonly ids: ReadonlyMap<string, Element>
  readonly shown: Set<Element>
  readonly html: string
}

/** Whether a text a reader meets off the page is shown on it: none, a plain name, or a label (which goes to `shown`). */
function shownText(text: string, cx: Context): boolean {
  if (text === '' || PLAIN_NAME.test(text)) return true
  const same = cx.labels.get(text)
  for (const label of same ?? []) cx.shown.add(label)
  return same !== undefined
}

/**
 * The document's title and description (a tab, a bookmark, a search result, a link preview): no capture shows them,
 * so they are held as a tooltip is (#117).
 */
function headFindings(el: Element, cx: Context): Finding[] {
  const description = el.tagName === 'meta' && attr(el, 'name') === 'description'
  if (el.tagName !== 'title' && !description) return []
  const value = description ? (attr(el, 'content') ?? '') : textOf(el)
  if (shownText(plain(value), cx)) return []
  return [
    error(
      'attribute_text',
      'index.html',
      `<${el.tagName}${description ? ' name="description"' : ''}> says ${JSON.stringify(value.slice(0, 80))}, which the page ` +
        'does not show: the title and the description repeat a heading or another label, or are a plain name',
      { line: lineOf(cx.html, el) },
    ),
  ]
}

/** A tooltip or name with text the page does not show; the labels a repeated one rests on go to `shown`. */
function textAttributeFindings(el: Element, cx: Context): Finding[] {
  const out: Finding[] = []
  for (const name of TEXT_ATTRIBUTES) {
    const value = attr(el, name)
    if (shownText(value === null ? '' : plain(value), cx)) continue
    out.push(
      error(
        'attribute_text',
        'index.html',
        `<${el.tagName} ${name}=${JSON.stringify((value ?? '').slice(0, 80))}> carries text the page does not show. A tooltip ` +
          'or an accessible name repeats a heading, caption, summary, table header, navigation link or source entry ' +
          'that its markup does not hide, or is a plain name ("Contents", "Table b5"); aria-labelledby can point at a label instead',
        { line: lineOf(cx.html, el) },
      ),
    )
  }
  return out
}

/** An ID reference to what a reader cannot check; the labels a valid one reads go to `shown`. */
function referenceFindings(el: Element, cx: Context): Finding[] {
  const out: Finding[] = []
  for (const name of REFERENCE_ATTRIBUTES)
    for (const id of referencedIds(el, name)) {
      const issue = referenceIssue(cx.ids.get(id), cx.shown)
      if (issue)
        out.push(
          error('attribute_text', 'index.html', `<${el.tagName} ${name}="${id.slice(0, 64)}"> ${issue}`, {
            line: lineOf(cx.html, el),
          }),
        )
    }
  return out
}

/** The labels a citation marker's references rest on (citations.ts says which it may name). */
function markerShown(el: Element, cx: Context): void {
  for (const name of REFERENCE_ATTRIBUTES)
    for (const id of referencedIds(el, name)) {
      const target = cx.ids.get(id)
      if (target && isLabel(target)) cx.shown.add(target)
    }
}

/** Every tooltip, name or reference that carries what the page does not show, and the labels the others rest on. */
function attributeFraming(all: readonly Element[], html: string): { findings: Finding[]; shown: Set<Element> } {
  const cx: Context = { labels: labelsByText(all), ids: byId(all), shown: new Set<Element>(), html }
  const findings: Finding[] = []
  for (const el of all) {
    if (isCite(el) || hasAncestor(el, isCite)) markerShown(el, cx)
    else findings.push(...textAttributeFindings(el, cx), ...referenceFindings(el, cx), ...headFindings(el, cx))
  }
  return { findings, shown: cx.shown }
}

/** The labels a tooltip, a name or a reference rests on: the render measures each as it measures a block (compile). */
export function shownLabels(doc: Document): Element[] {
  return [...attributeFraming(elements(doc), '').shown]
}

/** The page's own words around the research: its text, and the text its attributes carry. */
export function framingFindings(doc: Document, html: string): Finding[] {
  return [...textFindings(doc, html), ...attributeFraming(elements(doc), html).findings]
}
