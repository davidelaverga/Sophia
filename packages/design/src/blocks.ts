// The frozen content of a research version, as blocks a design must preserve (SDD-01, pack 05 §3). One parse with the
// reader's own parser (`@sophia/report`): every paragraph, list item, table, code block and quoted paragraph is a block
// with its text, the sources it cites and the links it carries; each stored limitation is one more. Headings may be
// reworded, so a heading is a block only when it cites a source. A block's id (`b1`…) is its place in reading order,
// the same for the same Markdown and limitations.

import { parseMarkdown, safeHref, type Block, type Inline } from '@sophia/report/markdown'
import { normalizeText } from './dom.ts'

export type ContentKind = 'heading' | 'paragraph' | 'item' | 'quote' | 'code' | 'table' | 'limitation'

export interface ContentBlock {
  readonly id: string
  readonly kind: ContentKind
  /** The text as compared: citations left out, white space collapsed, see `comparable`. */
  readonly text: string
  /** A table's cells in reading order (head first), each comparable text; empty for other kinds. */
  readonly cells: readonly string[]
  /** Source ids the block cites, sorted. */
  readonly citations: readonly string[]
  /** http, https and mailto links the block carries, sorted. */
  readonly links: readonly string[]
}

export interface ContentPackage {
  readonly blocks: readonly ContentBlock[]
  /** Every cited source id, in the order the report first cites them. */
  readonly citations: readonly string[]
}

/**
 * Text as content is compared: NFC, white space collapsed, no space before closing punctuation or after opening
 * punctuation. A citation removed from "a claim [id]." leaves "a claim ." in the Markdown and "a claim." in a page that
 * sets the citation as a superscript; both compare as "a claim.".
 */
export const comparable = (text: string): string =>
  normalizeText(text)
    .replace(/\s+([.,;:!?%)\]}»”’])/gu, '$1')
    .replace(/([([{«“‘])\s+/gu, '$1')

interface Run {
  text: string
  citations: Set<string>
  links: Set<string>
}

function readInline(inline: readonly Inline[], run: Run): void {
  for (const i of inline) {
    switch (i.kind) {
      case 'text':
      case 'code':
        run.text += i.text
        break
      case 'break':
        run.text += ' '
        break
      case 'cite':
        run.citations.add(i.sourceId.toLowerCase())
        break
      case 'link': {
        const href = safeHref(i.href)
        if (href) run.links.add(href)
        readInline(i.children, run)
        break
      }
      case 'strong':
      case 'em':
        readInline(i.children, run)
        break
    }
  }
}

function runOf(inline: readonly Inline[]): Run {
  const run: Run = { text: '', citations: new Set(), links: new Set() }
  readInline(inline, run)
  return run
}

class Builder {
  readonly blocks: ContentBlock[] = []

  add(kind: ContentKind, run: Run, cells: readonly string[] = []): void {
    this.blocks.push({
      id: `b${this.blocks.length + 1}`,
      kind,
      text: comparable(run.text),
      cells,
      citations: [...run.citations].toSorted(),
      links: [...run.links].toSorted(),
    })
  }

  read(blocks: readonly Block[], inQuote: boolean): void {
    for (const b of blocks) this.readBlock(b, inQuote)
  }

  private readBlock(b: Block, inQuote: boolean): void {
    switch (b.kind) {
      case 'heading': {
        const run = runOf(b.children)
        if (run.citations.size > 0) this.add('heading', run)
        return
      }
      case 'paragraph':
        return this.add(inQuote ? 'quote' : 'paragraph', runOf(b.children))
      case 'list':
        for (const item of b.items) this.add('item', runOf(item.children))
        return
      case 'quote':
        return this.read(b.blocks, true)
      case 'code':
        return this.add('code', { text: b.text, citations: new Set(), links: new Set() })
      case 'table':
        return this.addTable([b.head, ...b.rows].flat())
      case 'rule':
        return
    }
  }

  private addTable(cells: readonly (readonly Inline[])[]): void {
    const runs = cells.map((c) => runOf(c))
    const merged: Run = { text: runs.map((r) => r.text).join(' '), citations: new Set(), links: new Set() }
    for (const r of runs) {
      for (const c of r.citations) merged.citations.add(c)
      for (const l of r.links) merged.links.add(l)
    }
    this.add(
      'table',
      merged,
      runs.map((r) => comparable(r.text)),
    )
  }
}

/**
 * The blocks a design must preserve.
 * @param markdown - the version's Markdown, exactly as published.
 * @param limitations - the version's stored limitations; a line of only white space is no limitation.
 * @param citable - the sources the version may cite (its own), as the reader numbers them.
 */
export function contentPackage(
  markdown: string,
  limitations: readonly string[],
  citable?: Iterable<string>,
): ContentPackage {
  const parsed = parseMarkdown(markdown, citable === undefined ? {} : { citable })
  const builder = new Builder()
  builder.read(parsed.blocks, false)
  for (const line of limitations) {
    if (comparable(line).length > 0) builder.add('limitation', { text: line, citations: new Set(), links: new Set() })
  }
  return { blocks: builder.blocks, citations: parsed.citations.map((c) => c.toLowerCase()) }
}
