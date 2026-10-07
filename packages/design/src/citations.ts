// What a citation marker may be (SDD-01-CX-0019 F2). The coverage check compares a block's own text without its
// citations, so a marker is held to a shape that cannot carry a claim or lead elsewhere: the element marked
// `data-cite="<sourceId>"`, or one link inside it, and nothing more; a short mark for text: a number in brackets
// ("[1]", "(12)"), a symbol ("†", "[*]"), or none. No letters, so markers side by side cannot spell a word, and no bare
// number, which would read as part of the number beside it (#117); and when it links, only to the page's own entry for
// that source (the element marked `data-source` with the same id). Every attribute that carries text a reader meets
// without seeing it (a tooltip, an accessible name or description, a braille label: framing.ts's list), on the marker
// and on its link, is empty, the marker's own mark as the page shows it, or a word for a source and a number
// ("Source 3"): never a bare number, which a reader would hear as a value no screenshot shows (#117). An ID reference
// on either (framing.ts's list) names only that source's entry, which its markup does not hide (the render measures
// it: framing.ts's shownLabels). A number a marker shows or announces is its source's place in the report's frozen
// citation order (the content package's), never one the page chooses: `[2]` or "Source 3" on the first source would
// attribute a claim to another source, or to none (#117).

import { attr, elements, isElement, lineAt, textOf, type Element } from './dom.ts'
import { error, type Finding } from './findings.ts'
import { hiddenByMarkup, isStructureWord, REFERENCE_ATTRIBUTES, referencedIds, TEXT_ATTRIBUTES } from './framing.ts'

/** The elements a marker may be. */
const MARKER_TAGS = new Set(['a', 'sup', 'span'])
/** A marker's text, its white space removed: brackets around up to three digits or a symbol, a symbol, or none. */
const MARK = /^(?:[[(](?:\d{1,3}|[*†‡§¶#])[\])]|[*†‡§¶#])?$/u
/** A marker's accessible name besides its own mark: a word for a source (framing.ts's list) and a number (#117). */
const NAME = /^(\p{L}{1,16}) [[(]?\d{1,3}[\])]?$/u
const isName = (text: string): boolean => isStructureWord(NAME.exec(text)?.[1] ?? '')

const isCite = (el: Element): boolean => attr(el, 'data-cite') !== null
const childElements = (el: Element): Element[] => el.childNodes.filter(isElement)
const markOf = (el: Element): string => textOf(el).replace(/\s+/gu, '')

/** Where each source's entry is, by its element id: the id a marker's link must name. An entry its markup hides is
 * no destination. */
function entryIds(all: readonly Element[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const el of all) {
    const source = attr(el, 'data-source')
    const id = attr(el, 'id')
    if (source !== null && id !== null && !hiddenByMarkup(el)) out.set(id, source.toLowerCase())
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

/** The first text-bearing attribute on a marker or its link that is neither empty, the marker's mark, nor a name. */
function nameIssue(el: Element, mark: string): string | null {
  for (const name of TEXT_ATTRIBUTES) {
    const value = attr(el, name)
    if (value === null) continue
    const bare = value.replace(/\s+/gu, '')
    if (bare !== '' && bare !== mark && !isName(value.trim().replace(/\s+/gu, ' ')))
      return `its ${name} ${JSON.stringify(value.slice(0, 40))} is neither its mark nor a citation name ("Source 3")`
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

/** An ID reference on a marker or its link that names anything but this source's own entry. */
function referenceIssue(els: readonly Element[], cited: string, entries: ReadonlyMap<string, string>): string | null {
  const named = els.flatMap((el) =>
    REFERENCE_ATTRIBUTES.flatMap((name) => referencedIds(el, name).map((id) => ({ name, id }))),
  )
  const stray = named.find(({ id }) => entries.get(id) !== cited)
  return stray ? `its ${stray.name} names ${JSON.stringify(stray.id.slice(0, 40))}, not this source's entry` : null
}

/** The number a mark or a citation name gives, or null when it gives none. */
const numberIn = (text: string): string | null => /\d+/u.exec(text)?.[0] ?? null

/**
 * A number a marker shows or announces, on it or its link, that is not its source's place in the report's frozen
 * citation order, or null. A mark with no number (a symbol, or none) and a name with no number say no place.
 */
function ordinalIssue(els: readonly Element[], mark: string, place: number | undefined): string | null {
  const said = [mark, ...els.flatMap((el) => TEXT_ATTRIBUTES.map((name) => attr(el, name) ?? ''))]
  const wrong = said.map(numberIn).find((n) => n !== null && n !== String(place))
  if (wrong === undefined || wrong === null) return null
  return place === undefined
    ? `it numbers a source the report does not cite (${wrong})`
    : `it numbers its source ${wrong}, but that source is number ${String(place)} in the report's citation order`
}

/** What is wrong with one marker, or null. */
function markerIssue(
  marker: Element,
  entries: ReadonlyMap<string, string>,
  places: ReadonlyMap<string, number>,
): string | null {
  if (!MARKER_TAGS.has(marker.tagName)) return `a marker is <a>, <sup> or <span>, not <${marker.tagName}>`
  if (elements(marker).some(isCite)) return 'a marker holds no other marker'
  const link = linkOf(marker)
  if (typeof link === 'string') return link
  const mark = markOf(marker)
  if (!MARK.test(mark)) return `its text ${JSON.stringify(mark.slice(0, 40))} is not a citation mark`
  const both = link && link !== marker ? [marker, link] : [marker]
  const cited = (attr(marker, 'data-cite') ?? '').toLowerCase()
  const said = saidIssue(both, mark, places.get(cited))
  return (
    said ?? referenceIssue(both, cited, entries) ?? (link === null ? null : destinationIssue(marker, link, entries))
  )
}

/** What a marker and its link show or announce that is neither its mark, a citation name, nor its source's place. */
function saidIssue(els: readonly Element[], mark: string, place: number | undefined): string | null {
  const named = els.map((el) => nameIssue(el, mark)).find((issue) => issue !== null) ?? null
  return named ?? ordinalIssue(els, mark, place)
}

/**
 * Every citation marker whose shape could carry a claim, lead away from its source, or number it otherwise than the
 * report does. `citations` is the content package's: every cited source id, in the order the report first cites them.
 */
export function citationFindings(all: readonly Element[], html: string, citations: readonly string[]): Finding[] {
  const entries = entryIds(all)
  const places = new Map(citations.map((id, i) => [id.toLowerCase(), i + 1]))
  const out: Finding[] = []
  for (const marker of all.filter(isCite)) {
    const issue = markerIssue(marker, entries, places)
    if (issue)
      out.push(
        error('citation_marker', 'index.html', `data-cite ${attr(marker, 'data-cite') ?? ''}: ${issue}`, {
          line: lineAt(html, marker.sourceCodeLocation?.startOffset ?? 0),
        }),
      )
  }
  return out
}
