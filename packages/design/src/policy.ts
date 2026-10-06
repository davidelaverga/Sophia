// The static research HTML profile (SDD-01, pack 01 "first supported design profile", pack 05 §5), checked with an HTML
// parser (parse5) on the authored source, never with the trusted-template regex passes of html-report-v2. Nothing runs,
// loads or submits: no script or event handler, no form, frame, object, embed, canvas, image, media or SVG, no remote
// resource of any kind; links only to http, https, mailto or an anchor that exists. Every element and attribute is on an
// allowlist; anything else is refused.

import { safeHref } from '@sophia/report/markdown'
import { checkCss, mediaWidths, SWEEP_WIDTHS } from './css.ts'
import { attr, depthOf, elements, hasAncestor, inHtml, isText, lineAt, type Document, type Element } from './dom.ts'
import { error, warning, type Finding } from './findings.ts'
import { REFERENCE_ATTRIBUTES, TEXT_ATTRIBUTES } from './framing.ts'

const ELEMENTS = new Set([
  'html',
  'head',
  'body',
  'title',
  'meta',
  'style',
  'main',
  'header',
  'footer',
  'nav',
  'section',
  'article',
  'aside',
  'address',
  'hgroup',
  'search',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'wbr',
  'div',
  'span',
  'ul',
  'li',
  'dl',
  'dt',
  'dd',
  'menu',
  'blockquote',
  'q',
  'cite',
  'figure',
  'figcaption',
  'pre',
  'code',
  'kbd',
  'samp',
  'var',
  'table',
  'caption',
  'colgroup',
  'col',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'a',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'small',
  'sub',
  'sup',
  'mark',
  'abbr',
  'time',
  'data',
  'bdi',
  'details',
  'summary',
])

/** Attributes any element may carry. `data-*`, `aria-*` and `role` are checked by pattern below. */
const GLOBAL_ATTRIBUTES = new Set([
  'id',
  'class',
  'lang',
  'dir',
  'title',
  'role',
  'tabindex',
  'style',
  'hidden',
  'translate',
])

/**
 * Why an element left off the list is refused, where that is not plain. An ordered list numbers each item by its place
 * among the items the page writes, a number no block holds: empty or hidden items before one move it, and a list the
 * research left unordered would read as a ranking (#117). A list is `<ul>` or `<menu>`, with bullets (css.ts).
 */
/**
 * Why a page marks no text struck out, deleted or inserted: `<s>` says a text is no longer accurate, `<del>` and `<ins>`
 * that it was taken out of or put into the document, and a screen reader announces them so, whatever CSS draws.
 * Frozen research has no such history for a page to invent: `<del>Not free.</del>` reads as a withdrawn claim (#117).
 */
const STRUCK =
  ': it marks a text as no longer accurate, deleted or inserted, which a screen reader announces whatever CSS draws; ' +
  'the research has no such history'

const REFUSED: Readonly<Record<string, string>> = {
  ol: ': an ordered list numbers its items by their place on the page, a number no block holds; a list is <ul>',
  bdo:
    ': it overrides the order a text is drawn in, so "12.50" is drawn "05.21" while the text read stays "12.50"; ' +
    'set a direction with dir, or isolate a text with <bdi>',
  s: STRUCK,
  del: STRUCK,
  ins: STRUCK,
}

/** Attributes only some elements may carry. */
const ELEMENT_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  html: new Set(['xmlns']),
  meta: new Set(['charset', 'name', 'content']),
  a: new Set(['href', 'rel', 'hreflang']),
  th: new Set(['scope', 'colspan', 'rowspan', 'headers', 'abbr']),
  td: new Set(['colspan', 'rowspan', 'headers']),
  time: new Set(['datetime']),
  data: new Set(['value']),
  details: new Set(['open']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
}

const DATA_ATTRIBUTE = /^data-[a-z][a-z0-9-]{0,40}$/
/**
 * The ARIA states a page may declare, each with the tokens it takes. Every other ARIA attribute is a text (framing.ts
 * holds it to a shown label), a reference (to a block, a label or a mark), or refused: a value, a count, a position or
 * a level announces a number that no capture shows (#117), and a state (checked, pressed, selected, expanded, current,
 * sorted, invalid, required, live…) announces a fact of its own that no capture shows and no block holds, such as a
 * box "checked" beside a heading (#117). `aria-hidden` only takes decoration away (coverage.ts keeps it off research).
 */
const ARIA_STATES: Readonly<Record<string, ReadonlySet<string>>> = {
  'aria-hidden': new Set(['true', 'false', 'undefined']),
}
/**
 * The roles a page may give: the parts of a document and its landmarks, which announce no state and no value. A
 * widget's role carries one with no attribute at all (a `checkbox` is announced "not checked", a `progressbar` or a
 * `meter` a value, a `status` or an `alert` is read out), so it states a fact no capture shows (#117); a heading's level
 * and a separator's value are refused with them, as their ARIA attributes are. A static report has no widget.
 */
const ROLES = new Set([
  'none',
  'presentation',
  'generic',
  'region',
  'navigation',
  'main',
  'banner',
  'contentinfo',
  'complementary',
  'search',
  'article',
  'document',
  'note',
  'figure',
  'group',
  'list',
  'listitem',
  'table',
  'rowgroup',
  'row',
  'cell',
  'columnheader',
  'rowheader',
  'img',
  'term',
  'definition',
  'paragraph',
  'blockquote',
  'caption',
  'code',
  'emphasis',
  'strong',
  'subscript',
  'superscript',
  'time',
  'doc-abstract',
  'doc-appendix',
  'doc-backlink',
  'doc-biblioentry',
  'doc-bibliography',
  'doc-chapter',
  'doc-conclusion',
  'doc-endnote',
  'doc-endnotes',
  'doc-example',
  'doc-footnote',
  'doc-introduction',
  'doc-noteref',
  'doc-part',
  'doc-toc',
])
const HELD_ARIA = new Set([...TEXT_ATTRIBUTES, ...REFERENCE_ATTRIBUTES])
/** A `color-scheme` meta would offer a scheme no capture shows (#117); the page is drawn in the light one. */
const META_NAMES = new Set(['viewport', 'description', 'generator'])
/** A section id: stable, readable, usable as a fragment. */
export const SECTION_ID = /^[a-z][a-z0-9-]{0,63}$/

/** The largest authored page a source may hold. */
export const HTML_BYTES = 524_288
/**
 * The deepest a page may nest its elements. A report needs a few dozen levels; deeper nesting only strains every walk
 * over the page, the compile's serializer among them, so it is refused before any other check (#117).
 */
export const MAX_DEPTH = 256

const lineOf = (html: string, el: Element): number => lineAt(html, el.sourceCodeLocation?.startOffset ?? 0)

const isGlobal = (name: string): boolean => GLOBAL_ATTRIBUTES.has(name) || DATA_ATTRIBUTE.test(name)

/** Why an ARIA attribute is refused, or null: a held text or reference, or a state with its own tokens (#117). */
function ariaIssue(name: string, value: string): string | null {
  if (HELD_ARIA.has(name)) return null
  const tokens = ARIA_STATES[name]
  if (!tokens) return `${name} is not allowed: a value, count, position, level or state is announced but never shown`
  const given = value.trim().toLowerCase().split(/\s+/u)
  return given.every((t) => tokens.has(t)) ? null : `${name} takes ${[...tokens].join(', ')}`
}

/** Why a role is refused, or null: each of its tokens names a part of a document or a landmark (#117). */
function roleIssue(value: string): string | null {
  const given = value.trim().toLowerCase().split(/\s+/u)
  const other = given.find((r) => !ROLES.has(r))
  return other === undefined
    ? null
    : `role ${other} is not allowed: a widget's role announces a state or a value that no capture shows`
}

/**
 * The attributes the compile writes, which a page may not write itself: `data-sophia-shown` marks the labels the render
 * measures, and a page that marks its own could have the render read every element inside them again for each one
 * around it (#117).
 */
const RESERVED = /^data-sophia-/

function attributeIssue(el: Element, name: string, value: string): string | null {
  if (/^on/i.test(name)) return `event handler ${name} is not allowed`
  if (RESERVED.test(name)) return `${name} is written by Sophia's compile, not by the page`
  if (name.startsWith('aria-')) return ariaIssue(name, value)
  if (name === 'role') return roleIssue(value)
  if (isGlobal(name))
    return name === 'tabindex' && value !== '0' && value !== '-1' ? 'tabindex may only be 0 or -1' : null
  if (!ELEMENT_ATTRIBUTES[el.tagName]?.has(name)) return `attribute ${name} is not allowed on <${el.tagName}>`
  return valueIssue(el.tagName, name, value)
}

function valueIssue(tag: string, name: string, value: string): string | null {
  if (tag === 'meta' && name === 'name' && !META_NAMES.has(value)) return `<meta name="${value}"> is not allowed`
  if (tag === 'a' && name === 'href') return hrefIssue(value)
  return null
}

function hrefIssue(href: string): string | null {
  if (href.startsWith('#')) return href.length > 1 ? null : 'an empty fragment link goes nowhere'
  return safeHref(href) === null
    ? `link ${JSON.stringify(href.slice(0, 80))} is not http, https, mailto or an anchor`
    : null
}

function elementFindings(html: string, el: Element): Finding[] {
  const line = lineOf(html, el)
  if (!inHtml(el))
    return [error('unsafe_element', 'index.html', `<${el.tagName}> (SVG or MathML) is not allowed`, { line })]
  if (!ELEMENTS.has(el.tagName))
    return [
      error('unsafe_element', 'index.html', `<${el.tagName}> is not allowed${REFUSED[el.tagName] ?? ''}`, { line }),
    ]
  const out: Finding[] = []
  for (const { name, value } of el.attrs) {
    const problem = attributeIssue(el, name, value)
    if (problem) out.push(error('unsafe_attribute', 'index.html', problem, { line }))
    else if (name === 'style') out.push(...checkCss(value, 'index.html', 'declarationList', line))
  }
  if (el.tagName === 'style') out.push(...styleFindings(html, el, line))
  return out
}

const styleText = (el: Element): string => el.childNodes.map((n) => ('value' in n ? n.value : '')).join('')

function styleFindings(html: string, el: Element, line: number): Finding[] {
  if (!hasAncestor(el, (a) => a.tagName === 'head'))
    return [error('style_outside_head', 'index.html', '<style> belongs in <head>', { line })]
  return checkCss(styleText(el), 'index.html', 'stylesheet', line)
}

/**
 * More width breakpoints, across the page's stylesheets, than the render measures the bands of (css.ts SWEEP_WIDTHS):
 * it measures both ends of each band they make, so a page with more could hide what it shows in one (#117, CX-0039).
 */
function breakpointFindings(all: Element[], css: string | null): Finding[] {
  const sheets = [...all.filter((el) => el.tagName === 'style').map(styleText), ...(css === null ? [] : [css])]
  const widths = new Set(sheets.flatMap(mediaWidths))
  return widths.size > SWEEP_WIDTHS.breakpoints
    ? [
        error(
          'css_unsafe',
          css === null ? 'index.html' : 'styles.css',
          `the stylesheets set ${widths.size} width breakpoints; the render measures every band they make, so at most ` +
            `${SWEEP_WIDTHS.breakpoints}`,
        ),
      ]
    : []
}

function idCounts(all: Element[]): Map<string, number> {
  const ids = new Map<string, number>()
  for (const el of all) {
    const id = attr(el, 'id')
    if (id !== null) ids.set(id, (ids.get(id) ?? 0) + 1)
  }
  return ids
}

function sectionFindings(html: string, all: Element[]): Finding[] {
  const out: Finding[] = []
  const sections = new Set<string>()
  for (const el of all) {
    const section = attr(el, 'data-section')
    if (section === null) continue
    const line = lineOf(html, el)
    if (!SECTION_ID.test(section))
      out.push(
        error('bad_section_id', 'index.html', `data-section ${JSON.stringify(section)} is not a section id`, { line }),
      )
    else if (sections.has(section))
      out.push(error('duplicate_section', 'index.html', `section ${section} appears twice`, { line }))
    if (hasAncestor(el, (a) => attr(a, 'data-section') !== null))
      out.push(error('nested_section', 'index.html', 'a data-section may not sit inside another', { line }))
    sections.add(section)
  }
  return out
}

/** The id a fragment link names, or null when the fragment is not valid percent-encoding. */
function fragmentId(href: string): string | null {
  try {
    return decodeURIComponent(href.slice(1))
  } catch {
    return null
  }
}

/** Section ids, anchors and ids: what scoped edits and in-page links depend on. */
function structureFindings(html: string, all: Element[]): Finding[] {
  const ids = idCounts(all)
  const out: Finding[] = []
  for (const [id, n] of ids)
    if (n > 1) out.push(error('duplicate_id', 'index.html', `id ${JSON.stringify(id)} is used ${n} times`))
  out.push(...sectionFindings(html, all))
  for (const el of all) {
    const href = el.tagName === 'a' ? attr(el, 'href') : null
    if (!href?.startsWith('#') || href.length < 2) continue
    const id = fragmentId(href)
    if (id === null || !ids.has(id))
      out.push(error('anchor_missing', 'index.html', `link to ${href} has no target`, { line: lineOf(html, el) }))
  }
  return out
}

/** Every finding the static profile has about an authored page and its stylesheet. */
/**
 * The characters that override the order a text is drawn in (LEFT-TO-RIGHT and RIGHT-TO-LEFT OVERRIDE): written, or as
 * a character reference, before a text or a block, they draw "12.50" as "05.21" while every check reads "12.50" (#117).
 */
const OVERRIDES = /[\u202D\u202E]/u

/** A text or an attribute value that carries a bidi override character, as a finding, or null. */
function overrideFindings(html: string, all: Element[]): Finding[] {
  const out: Finding[] = []
  for (const el of all) {
    const values = [...el.attrs.map((a) => a.value), ...el.childNodes.filter(isText).map((n) => n.value)]
    if (values.some((v) => OVERRIDES.test(v)))
      out.push(
        error(
          'bidi_override',
          'index.html',
          `<${el.tagName}> carries a bidi override character (U+202D or U+202E): ` +
            'it draws a text in an order other than the one read',
          { line: lineOf(html, el) },
        ),
      )
  }
  return out
}

export function checkPolicy(doc: Document, html: string, css: string | null): Finding[] {
  if (Buffer.byteLength(html, 'utf8') > HTML_BYTES)
    return [error('html_too_large', 'index.html', `index.html is limited to ${HTML_BYTES} bytes`)]
  const depth = depthOf(doc)
  if (depth > MAX_DEPTH)
    return [error('html_too_deep', 'index.html', `index.html nests elements ${depth} deep; at most ${MAX_DEPTH}`)]
  const all = elements(doc)
  const out: Finding[] = all.flatMap((el) => elementFindings(html, el))
  out.push(...structureFindings(html, all), ...overrideFindings(html, all))
  if (!/^\s*<!doctype html>/i.test(html)) out.push(warning('no_doctype', 'index.html', 'start with <!doctype html>'))
  if (!all.some((el) => el.tagName === 'main')) out.push(warning('no_main', 'index.html', 'the report has no <main>'))
  if (!all.some((el) => attr(el, 'data-section') !== null))
    out.push(error('no_sections', 'index.html', 'mark each top-level section with data-section'))
  if (css !== null) out.push(...checkCss(css, 'styles.css', 'stylesheet'))
  out.push(...breakpointFindings(all, css))
  return out
}
