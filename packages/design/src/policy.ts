// The static research HTML profile (SDD-01, pack 01 "first supported design profile", pack 05 §5), checked with an HTML
// parser (parse5) on the authored source, never with the trusted-template regex passes of html-report-v2. Nothing runs,
// loads or submits: no script or event handler, no form, frame, object, embed, canvas, image, media or SVG, no remote
// resource of any kind; links only to http, https, mailto or an anchor that exists. Every element and attribute is on an
// allowlist; anything else is refused.

import { safeHref } from '@sophia/report/markdown'
import { checkCss } from './css.ts'
import { attr, depthOf, elements, hasAncestor, inHtml, lineAt, type Document, type Element } from './dom.ts'
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
  's',
  'small',
  'sub',
  'sup',
  'mark',
  'abbr',
  'time',
  'data',
  'del',
  'ins',
  'bdi',
  'bdo',
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
const REFUSED: Readonly<Record<string, string>> = {
  ol: ': an ordered list numbers its items by their place on the page, a number no block holds; a list is <ul>',
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
  del: new Set(['datetime']),
  ins: new Set(['datetime']),
  details: new Set(['open']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
}

const DATA_ATTRIBUTE = /^data-[a-z][a-z0-9-]{0,40}$/
const BOOLEAN = new Set(['true', 'false'])
const TRISTATE = new Set(['true', 'false', 'mixed', 'undefined'])
/**
 * The ARIA states a page may declare, each with the tokens it takes: none carries data of its own (#117). Every other
 * ARIA attribute is a text (framing.ts holds it to a shown label), a reference (to a block, a label or a mark), or
 * refused: a value, a count, a position or a level announces a number that no capture shows.
 */
const ARIA_STATES: Readonly<Record<string, ReadonlySet<string>>> = {
  'aria-hidden': new Set(['true', 'false', 'undefined']),
  'aria-current': new Set(['page', 'step', 'location', 'date', 'time', 'true', 'false']),
  'aria-expanded': new Set(['true', 'false', 'undefined']),
  'aria-selected': new Set(['true', 'false', 'undefined']),
  'aria-checked': TRISTATE,
  'aria-pressed': TRISTATE,
  'aria-disabled': BOOLEAN,
  'aria-busy': BOOLEAN,
  'aria-atomic': BOOLEAN,
  'aria-modal': BOOLEAN,
  'aria-multiline': BOOLEAN,
  'aria-multiselectable': BOOLEAN,
  'aria-readonly': BOOLEAN,
  'aria-required': BOOLEAN,
  'aria-live': new Set(['off', 'polite', 'assertive']),
  'aria-relevant': new Set(['additions', 'removals', 'text', 'all']),
  'aria-haspopup': new Set(['true', 'false', 'menu', 'listbox', 'tree', 'grid', 'dialog']),
  'aria-invalid': new Set(['true', 'false', 'grammar', 'spelling']),
  'aria-orientation': new Set(['horizontal', 'vertical', 'undefined']),
  'aria-sort': new Set(['ascending', 'descending', 'none', 'other']),
  'aria-autocomplete': new Set(['inline', 'list', 'both', 'none']),
}
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
  if (!tokens) return `${name} is not allowed: a value, count, position or level is announced but never shown`
  const given = value.trim().toLowerCase().split(/\s+/u)
  return given.every((t) => tokens.has(t)) ? null : `${name} takes ${[...tokens].join(', ')}`
}

function attributeIssue(el: Element, name: string, value: string): string | null {
  if (/^on/i.test(name)) return `event handler ${name} is not allowed`
  if (name.startsWith('aria-')) return ariaIssue(name, value)
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

function styleFindings(html: string, el: Element, line: number): Finding[] {
  if (!hasAncestor(el, (a) => a.tagName === 'head'))
    return [error('style_outside_head', 'index.html', '<style> belongs in <head>', { line })]
  const text = el.childNodes.map((n) => ('value' in n ? n.value : '')).join('')
  return checkCss(text, 'index.html', 'stylesheet', line)
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
export function checkPolicy(doc: Document, html: string, css: string | null): Finding[] {
  if (Buffer.byteLength(html, 'utf8') > HTML_BYTES)
    return [error('html_too_large', 'index.html', `index.html is limited to ${HTML_BYTES} bytes`)]
  const depth = depthOf(doc)
  if (depth > MAX_DEPTH)
    return [error('html_too_deep', 'index.html', `index.html nests elements ${depth} deep; at most ${MAX_DEPTH}`)]
  const all = elements(doc)
  const out: Finding[] = all.flatMap((el) => elementFindings(html, el))
  out.push(...structureFindings(html, all))
  if (!/^\s*<!doctype html>/i.test(html)) out.push(warning('no_doctype', 'index.html', 'start with <!doctype html>'))
  if (!all.some((el) => el.tagName === 'main')) out.push(warning('no_main', 'index.html', 'the report has no <main>'))
  if (!all.some((el) => attr(el, 'data-section') !== null))
    out.push(error('no_sections', 'index.html', 'mark each top-level section with data-section'))
  if (css !== null) out.push(...checkCss(css, 'styles.css', 'stylesheet'))
  return out
}
