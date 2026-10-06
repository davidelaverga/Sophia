// Whether an authored page keeps its frozen content (SDD-01, pack 05 §3, B-06). Each content block appears exactly once,
// as the element marked `data-block="<id>"`, holding its exact text (citations left out), every source it cites as an
// element marked `data-cite="<sourceId>"` inside it (a bare mark, or a link to that source's entry: citations.ts), and
// its links. Every cited source is listed once, as an element marked `data-source="<sourceId>"`. Outside the blocks a
// page adds only the words that frame them (framing.ts). Whether each block is also visible and readable is the render's measurement (the capture kernel), not this check: markup alone cannot
// prove what a reader sees.

import { safeHref } from '@sophia/report/markdown'
import { comparable, type ContentBlock, type ContentPackage } from './blocks.ts'
import { citationFindings } from './citations.ts'
import { framingFindings } from './framing.ts'
import { attr, elements, hasAncestor, isElement, lineAt, textOf, type Document, type Element } from './dom.ts'
import { error, type Finding } from './findings.ts'

const isCite = (el: Element): boolean => attr(el, 'data-cite') !== null
const isBlock = (el: Element): boolean => attr(el, 'data-block') !== null
/** What a block's own text leaves out: its citations, and any block nested in it (an item's sub-list). */
const notOwnText = (el: Element): boolean => isCite(el) || isBlock(el)

/** The elements inside a block that are its own, not a nested block's. */
function ownElements(block: Element): Element[] {
  return elements(block).filter((el) => !hasAncestorBelow(el, block, isBlock) && !isBlock(el))
}

/** Whether an ancestor of `el` strictly below `root` matches. */
function hasAncestorBelow(el: Element, root: Element, test: (a: Element) => boolean): boolean {
  for (let p = el.parentNode; p && p !== root && 'tagName' in p; p = p.parentNode) if (test(p)) return true
  return false
}

function blockText(el: Element): string {
  return comparable(textOf(el, notOwnText))
}

function cellsOf(el: Element): string[] {
  return ownElements(el)
    .filter((c) => c.tagName === 'th' || c.tagName === 'td')
    .map((c) => comparable(textOf(c, notOwnText)))
}

function citesIn(el: Element): string[] {
  return [
    ...new Set(
      ownElements(el)
        .filter(isCite)
        .map((c) => (attr(c, 'data-cite') ?? '').toLowerCase()),
    ),
  ].toSorted()
}

function linksIn(el: Element): string[] {
  const hrefs = ownElements(el)
    .filter((a) => a.tagName === 'a' && !isCite(a) && !hasAncestorBelow(a, el, isCite))
    .map((a) => attr(a, 'href') ?? '')
    .filter((h) => !h.startsWith('#'))
    .map((h) => safeHref(h) ?? h)
  return [...new Set(hrefs)].toSorted()
}

const same = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i])

function blockFindings(block: ContentBlock, el: Element, line: number): Finding[] {
  const at = { line, block: block.id }
  const out: Finding[] = []
  if (block.kind === 'table') {
    const cells = cellsOf(el)
    if (!same(cells, block.cells))
      out.push(
        error(
          'block_altered',
          'index.html',
          `table ${block.id}'s cells differ from the research (${cells.length} cells, ${block.cells.length} expected)`,
          at,
        ),
      )
  } else if (blockText(el) !== block.text) {
    out.push(
      error(
        'block_altered',
        'index.html',
        `${block.id}'s text differs from the research: expected ${JSON.stringify(block.text.slice(0, 120))}`,
        at,
      ),
    )
  }
  const cites = citesIn(el)
  if (!same(cites, block.citations))
    out.push(
      error(
        'citation_altered',
        'index.html',
        `${block.id} cites ${cites.join(', ') || 'nothing'}; the research cites ${block.citations.join(', ') || 'nothing'}`,
        at,
      ),
    )
  const links = linksIn(el)
  if (!same(links, block.links))
    out.push(error('link_altered', 'index.html', `${block.id}'s links differ from the research`, at))
  return out
}

const lineOf = (html: string, el: Element): number => lineAt(html, el.sourceCodeLocation?.startOffset ?? 0)

/** Where each `data-block` sits, by id; unknown ids are findings. */
function placements(
  all: Element[],
  content: ContentPackage,
  html: string,
): { placed: Map<string, Element[]>; unknown: Finding[] } {
  const known = new Set(content.blocks.map((b) => b.id))
  const placed = new Map<string, Element[]>()
  const unknown: Finding[] = []
  for (const el of all) {
    const id = attr(el, 'data-block')
    if (id === null) continue
    if (!known.has(id))
      unknown.push(
        error('block_unknown', 'index.html', `data-block ${JSON.stringify(id)} is not a block of the research`, {
          line: lineOf(html, el),
        }),
      )
    placed.set(id, [...(placed.get(id) ?? []), el])
  }
  return { placed, unknown }
}

function placeBlocks(all: Element[], content: ContentPackage, html: string): Finding[] {
  const { placed, unknown } = placements(all, content, html)
  const out = unknown
  for (const block of content.blocks) {
    const els = placed.get(block.id) ?? []
    const [el] = els
    if (!el)
      out.push(
        error(
          'block_missing',
          'index.html',
          `${block.id} (${block.kind}) is missing: ${JSON.stringify(block.text.slice(0, 80))}`,
          { block: block.id },
        ),
      )
    else if (els.length > 1)
      out.push(error('block_repeated', 'index.html', `${block.id} appears ${els.length} times`, { block: block.id }))
    else out.push(...blockFindings(block, el, lineOf(html, el)))
  }
  return out
}

function listedSources(all: Element[]): Map<string, number> {
  const listed = new Map<string, number>()
  for (const el of all) {
    const id = attr(el, 'data-source')?.toLowerCase()
    if (id !== undefined) listed.set(id, (listed.get(id) ?? 0) + 1)
  }
  return listed
}

function sourceFindings(all: Element[], content: ContentPackage): Finding[] {
  const out: Finding[] = []
  const cited = new Set(content.citations)
  const listed = listedSources(all)
  for (const id of content.citations) {
    const n = listed.get(id) ?? 0
    if (n !== 1)
      out.push(
        error(
          n === 0 ? 'source_missing' : 'source_repeated',
          'index.html',
          `source ${id} is listed ${n} times; a cited source is listed once`,
        ),
      )
  }
  for (const id of listed.keys())
    if (!cited.has(id))
      out.push(error('source_unknown', 'index.html', `data-source ${id} is not a source the research cites`))
  for (const el of all.filter((c) => isCite(c) && !hasAncestor(c, isBlock))) {
    out.push(
      error(
        'cite_outside_block',
        'index.html',
        `data-cite ${attr(el, 'data-cite') ?? ''} sits outside every content block`,
      ),
    )
  }
  return out
}

/** Research: a content block or a source entry. */
const isResearch = (el: Element): boolean => isBlock(el) || attr(el, 'data-source') !== null

/**
 * Why an element takes what it holds out of what a screen reader is given, or null: `aria-hidden="true"` takes it out
 * of the accessibility tree, and `role="img"` gives it as one image, announced by its name alone, its text
 * presentational (#117). Neither changes a pixel, so no capture shows it.
 */
function concealment(el: Element): string | null {
  if (attr(el, 'aria-hidden')?.trim().toLowerCase() === 'true')
    return `<${el.tagName} aria-hidden="true"> takes research out of what a screen reader is given`
  const roles = (attr(el, 'role') ?? '').trim().toLowerCase().split(/\s+/u)
  return roles.includes('img')
    ? `<${el.tagName} role="img"> gives what it holds as one image, announced by its name alone, not by its text`
    : null
}

/**
 * Research a screen reader would not be given: a block or a source entry, or an element around or inside one, that
 * concealment takes out of what it is given. It changes no pixel, so no capture shows it (#117).
 */
function hiddenResearch(all: Element[], html: string): Finding[] {
  const around = new Set<Element>()
  for (const el of all.filter(isResearch))
    for (
      let a: Element | null = el;
      a && !around.has(a);
      a = a.parentNode && isElement(a.parentNode) ? a.parentNode : null
    )
      around.add(a)
  return all
    .map((el) => ({ el, how: concealment(el) }))
    .filter(({ el, how }) => how !== null && (around.has(el) || hasAncestor(el, isResearch)))
    .map(({ el, how }) =>
      error(
        'research_hidden',
        'index.html',
        `${how ?? ''}, where no capture shows it; ` +
          'a block, a source entry and what holds or is inside one are never aria-hidden and never an image',
        { line: lineOf(html, el) },
      ),
    )
}

/** Every way the page departs from its frozen content. Empty when every block and source is in place. */
export function checkCoverage(doc: Document, html: string, content: ContentPackage): Finding[] {
  const all = elements(doc)
  return [
    ...placeBlocks(all, content, html),
    ...hiddenResearch(all, html),
    ...sourceFindings(all, content),
    ...citationFindings(all, html),
    ...framingFindings(doc, html),
  ]
}
