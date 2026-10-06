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
  textWithin,
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
/**
 * The words a name may hold without repeating a label: what a part of the page is, never what it says (#117). A list,
 * in a few languages, because any other word, in any script, can carry a claim ("Cheapest", 三号主机是免费的); a page
 * in another language names a part by repeating its heading, or with aria-labelledby.
 */
const STRUCTURE_WORDS: ReadonlySet<string> = new Set([
  'contents',
  'navigation',
  'section',
  'table',
  'figure',
  'sources',
  'source',
  'references',
  'reference',
  'notes',
  'note',
  'footnotes',
  'footnote',
  'citation',
  'appendix',
  'glossary',
  'index',
  'top',
  'indice',
  'sommario',
  'navigazione',
  'sezione',
  'tabella',
  'figura',
  'fonti',
  'fonte',
  'riferimenti',
  'riferimento',
  'nota',
  'appendice',
  'glossario',
  'contenido',
  'índice',
  'navegación',
  'sección',
  'tabla',
  'fuentes',
  'fuente',
  'referencias',
  'referencia',
  'notas',
  'apéndice',
  'glosario',
  'conteúdo',
  'navegação',
  'seção',
  'secção',
  'tabela',
  'fontes',
  'referências',
  'referência',
  'apêndice',
  'glossário',
  'sommaire',
  'tableau',
  'référence',
  'références',
  'annexe',
  'glossaire',
  'inhalt',
  'abschnitt',
  'tabelle',
  'abbildung',
  'quellen',
  'quelle',
  'anmerkungen',
  'anmerkung',
  'anhang',
  'glossar',
])
/** Whether a word names a part of the page (STRUCTURE_WORDS), whatever its case. */
export const isStructureWord = (word: string): boolean => STRUCTURE_WORDS.has(word.toLocaleLowerCase())
/** A name that says nothing of its own: one of those words, and optionally a number or a short id ("Table b5"). */
const PLAIN_NAME = /^(\p{L}{1,24})(?: [a-z]?\d{1,4})?$/iu
const isPlainName = (text: string): boolean => isStructureWord(PLAIN_NAME.exec(text)?.[1] ?? '')
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

/**
 * What reading every label's text may cost a page, in nodes read and characters taken: four times the largest page.
 * A label nested in another is read again with it, so 250 source entries nested around one long text would read it 250
 * times (#117). Labels past the budget are not indexed: a tooltip or a name that repeats one is refused as text the page
 * does not show. A page whose labels do not nest reads each node once.
 */
const LABEL_BUDGET = 2_097_152

/** The labels a tooltip or a name may repeat, by their text: those their markup does not hide, within LABEL_BUDGET. */
function labelsByText(all: readonly Element[]): Map<string, Element[]> {
  const out = new Map<string, Element[]>()
  const budget = { left: LABEL_BUDGET }
  for (const el of all) {
    if (!isLabel(el) || hiddenByMarkup(el)) continue
    const read = textWithin(el, budget)
    if (read === null) break
    const text = plain(read)
    const same = out.get(text)
    if (same) same.push(el)
    else out.set(text, [el])
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

/**
 * Each text node below `root` that is neither research (in a block) nor marks, with the nearest label that holds it and
 * whether one of `targets` holds it. One walk, top down, so what a reference reads costs the page's size however many
 * references name one target or how deeply targets nest (#117).
 */
function eachReadText(
  root: Document,
  targets: ReadonlySet<Element>,
  visit: (node: TextNode, label: Element | null, inTarget: boolean) => void,
): void {
  const stack: { node: ChildNode; label: Element | null; block: boolean; target: boolean }[] = root.childNodes
    .map((node) => ({ node, label: null, block: false, target: false }))
    .toReversed()
  for (let top = stack.pop(); top; top = stack.pop()) {
    const { node, label, block, target } = top
    if (isText(node) && !block && !isMarks(node.value)) visit(node, label, target)
    if (!isElement(node)) continue
    const inner = {
      label: isLabel(node) ? node : label,
      block: block || isBlock(node),
      target: target || targets.has(node),
    }
    for (const child of node.childNodes.toReversed()) stack.push({ node: child, ...inner })
  }
}

/**
 * The elements that hold text a reference may not read: neither the research (a block), a label's, nor marks. An
 * element holds what its descendants hold, so each is marked once, from the text up to the first already marked.
 */
function looseHolders(doc: Document): Set<Element> {
  const loose = new Set<Element>()
  eachReadText(doc, new Set(), (node, label) => {
    if (label) return
    for (let p = node.parentNode; p && isElement(p) && !loose.has(p); p = p.parentNode) loose.add(p)
  })
  return loose
}

/**
 * Whether an element lies inside a block, or inside a label without being a block: a reference to it reads part of
 * their text apart from the rest. `Not <span id="free">free</span>` would give a name, "free", that the page never
 * says (#117).
 */
const isFragment = (target: Element): boolean =>
  hasAncestor(target, (a) => isBlock(a) || (isLabel(a) && !isBlock(target)))

/**
 * Why an ID reference may not name `target`: it is not on the page, its markup hides it, it holds loose text, or it is
 * part of a block or a label: a reference names a whole one (#117).
 */
function targetIssue(target: Element, loose: ReadonlySet<Element>): string | null {
  if (hiddenByMarkup(target)) return 'names an element its markup hides (hidden, aria-hidden)'
  if (isFragment(target))
    return 'names part of a block or a label, read apart from the rest of it; name the whole block or label'
  return loose.has(target) ? 'names text that is neither the research (a block) nor a label' : null
}

/**
 * Why an ID reference may not name `target`, or null: the target is on the page, not hidden by its markup, and holds
 * only research (blocks), labels or marks. Each target is judged once; a valid one goes to `read`, whose labels the
 * page then shows (readLabels).
 */
function referenceIssue(target: Element | undefined, cx: Context): string | null {
  if (!target) return 'names no element of the page'
  let issue = cx.issues.get(target)
  if (issue === undefined) {
    issue = targetIssue(target, cx.loose)
    cx.issues.set(target, issue)
  }
  if (issue === null) cx.read.add(target)
  return issue
}

/** The labels whose text a valid reference reads go to `shown`, for the render to measure (one walk). */
function readLabels(doc: Document, cx: Context): void {
  if (cx.read.size > 0)
    eachReadText(doc, cx.read, (_node, label, inTarget) => {
      if (inTarget && label) cx.shown.add(label)
    })
}

interface Context {
  readonly labels: ReadonlyMap<string, Element[]>
  readonly ids: ReadonlyMap<string, Element>
  readonly shown: Set<Element>
  readonly html: string
  /** The elements holding text a reference may not read (looseHolders). */
  readonly loose: ReadonlySet<Element>
  /** Each reference target judged so far, and why it may not be named (null: it may). */
  readonly issues: Map<Element, string | null>
  /** The targets valid references name, whose labels go to `shown` once every reference is judged. */
  readonly read: Set<Element>
  /** The label texts and marker targets already taken into `shown`: each is taken once, however often repeated. */
  readonly taken: Set<string | Element>
}

/**
 * Whether a text a reader meets off the page is shown on it: none, a plain name (unless `plainNames` is off), or a
 * label (which goes to `shown`).
 */
function shownText(text: string, cx: Context, plainNames = true): boolean {
  if (text === '' || (plainNames && isPlainName(text))) return true
  const same = cx.labels.get(text)
  if (same && !cx.taken.has(text)) {
    cx.taken.add(text)
    for (const label of same) cx.shown.add(label)
  }
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
  if (shownText(plain(value), cx, false)) return []
  return [
    error(
      'attribute_text',
      'index.html',
      `<${el.tagName}${description ? ' name="description"' : ''}> says ${JSON.stringify(value.slice(0, 80))}, which the page ` +
        'does not show: the title and the description repeat a heading or another label the page shows, or are empty',
      { line: lineOf(cx.html, el) },
    ),
  ]
}

/**
 * A tooltip or name with text the page does not show; the labels a repeated one rests on go to `shown`. A table
 * header's `abbr` is held the same: words taken from its header can say the opposite of it (`abbr="free"` on "Not
 * free"), and a screen reader may read the abbreviation in its place (#117).
 */
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
          'that its markup does not hide, or is a plain name ("Contents", "Table b5": a word for a part of the page, and a ' +
          'number); aria-labelledby can point at a label instead',
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
      const issue = referenceIssue(cx.ids.get(id), cx)
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
      if (!target || cx.taken.has(target)) continue
      cx.taken.add(target)
      if (isLabel(target)) cx.shown.add(target)
    }
}

/** Every tooltip, name or reference that carries what the page does not show, and the labels the others rest on. */
function attributeFraming(doc: Document, html: string): { findings: Finding[]; shown: Set<Element> } {
  const all = elements(doc)
  const cx: Context = {
    labels: labelsByText(all),
    ids: byId(all),
    shown: new Set<Element>(),
    html,
    loose: looseHolders(doc),
    issues: new Map(),
    read: new Set(),
    taken: new Set(),
  }
  const findings: Finding[] = []
  for (const el of all) {
    if (isCite(el) || hasAncestor(el, isCite)) markerShown(el, cx)
    else findings.push(...textAttributeFindings(el, cx), ...referenceFindings(el, cx), ...headFindings(el, cx))
  }
  readLabels(doc, cx)
  return { findings, shown: cx.shown }
}

/** The labels a tooltip, a name or a reference rests on: the render measures each as it measures a block (compile). */
export function shownLabels(doc: Document): Element[] {
  return [...attributeFraming(doc, '').shown]
}

/** The page's own words around the research: its text, and the text its attributes carry. */
export function framingFindings(doc: Document, html: string): Finding[] {
  return [...textFindings(doc, html), ...attributeFraming(doc, html).findings]
}
