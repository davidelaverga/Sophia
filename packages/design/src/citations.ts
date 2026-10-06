// What a citation marker may be (SDD-01-CX-0019 F2). The coverage check compares a block's own text without its
// citations, so a marker is held to a shape that cannot carry a claim or lead elsewhere: the element marked
// `data-cite="<sourceId>"`, or one link inside it, and nothing more; a short mark for text ("1", "[s]", "(a)", "†",
// or none); and when it links, only to the page's own entry for that source (the element marked `data-source` with the
// same id). Every attribute that carries text a reader meets without seeing it (a tooltip, an accessible name or
// description, a braille label: framing.ts's list), on the marker and on its link, is held to the same mark, or a word
// and a number ("Source 3").

import { attr, elements, isElement, lineAt, textOf, type Element } from './dom.ts'
import { error, type Finding } from './findings.ts'
import { TEXT_ATTRIBUTES } from './framing.ts'

/** The elements a marker may be. */
const MARKER_TAGS = new Set(['a', 'sup', 'span'])
/** A marker's text, its white space removed: brackets around up to three digits, one letter or one symbol, or none. */
const MARK = /^[[(]?(?:\d{1,3}|\p{L}|[*†‡§¶#])?[\])]?$/u
/** A marker's accessible name: its mark, or one word and a number. */
const NAME = /^(?:\p{L}{1,16} )?[[(]?\d{1,3}[\])]?$/u

const isCite = (el: Element): boolean => attr(el, 'data-cite') !== null
const childElements = (el: Element): Element[] => el.childNodes.filter(isElement)
const markOf = (el: Element): string => textOf(el).replace(/\s+/gu, '')

/** Where each source's entry is, by its element id: the id a marker's link must name. */
function entryIds(all: readonly Element[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const el of all) {
    const source = attr(el, 'data-source')
    const id = attr(el, 'id')
    if (source !== null && id !== null) out.set(id, source.toLowerCase())
  }
  return out
}

/** The marker's one link, or null; or why its shape is wrong. */
function linkOf(marker: Element): Element | null | string {
  const kids = childElements(marker)
  if (marker.tagName === 'a') return kids.length === 0 ? marker : 'a linked marker holds text only'
  if (kids.length === 0) return null
  const [only] = kids
  if (kids.length > 1 || only?.tagName !== 'a') return 'a marker holds its mark, or one link to its source'
  if (childElements(only).length > 0) return "a marker's link holds text only"
  return only
}

/** The first text-bearing attribute on a marker or its link that is not a citation mark or name. */
function nameIssue(el: Element): string | null {
  for (const name of TEXT_ATTRIBUTES) {
    const value = attr(el, name)
    if (value !== null && !MARK.test(value.replace(/\s+/gu, '')) && !NAME.test(value.trim().replace(/\s+/gu, ' ')))
      return `its ${name} ${JSON.stringify(value.slice(0, 40))} is not a citation mark`
  }
  return null
}

/** Where a marker's link leads, when that is not its source's own entry on the page. */
function destinationIssue(marker: Element, link: Element, entries: ReadonlyMap<string, string>): string | null {
  const href = attr(link, 'href') ?? ''
  const cited = (attr(marker, 'data-cite') ?? '').toLowerCase()
  return href.startsWith('#') && entries.get(href.slice(1)) === cited
    ? null
    : `it links to ${JSON.stringify(href.slice(0, 80))}, not to this source's entry on the page`
}

/** What is wrong with one marker, or null. */
function markerIssue(marker: Element, entries: ReadonlyMap<string, string>): string | null {
  if (!MARKER_TAGS.has(marker.tagName)) return `a marker is <a>, <sup> or <span>, not <${marker.tagName}>`
  if (elements(marker).some(isCite)) return 'a marker holds no other marker'
  const link = linkOf(marker)
  if (typeof link === 'string') return link
  const mark = markOf(marker)
  if (!MARK.test(mark)) return `its text ${JSON.stringify(mark.slice(0, 40))} is not a citation mark`
  const named = nameIssue(marker) ?? (link && link !== marker ? nameIssue(link) : null)
  return named ?? (link === null ? null : destinationIssue(marker, link, entries))
}

/** Every citation marker whose shape could carry a claim or lead away from its source. */
export function citationFindings(all: readonly Element[], html: string): Finding[] {
  const entries = entryIds(all)
  const out: Finding[] = []
  for (const marker of all.filter(isCite)) {
    const issue = markerIssue(marker, entries)
    if (issue)
      out.push(
        error('citation_marker', 'index.html', `data-cite ${attr(marker, 'data-cite') ?? ''}: ${issue}`, {
          line: lineAt(html, marker.sourceCodeLocation?.startOffset ?? 0),
        }),
      )
  }
  return out
}
