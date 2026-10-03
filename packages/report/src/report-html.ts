// The PDF report template (SMC-M03 S5b, plan §2.7 "Report contract"). A report's Markdown, parsed exactly as the
// viewer parses it (markdown.ts), printed into one self-contained HTML document with the pdf-report-v1 stylesheet:
// a title block, contents when there are three sections or more, one <section> per top-level heading, tables as
// identified figures, numbered citations and a sources list the service resolved. The model never writes HTML: every
// string is escaped here, links keep only http, https and mailto, and an image is named, never loaded. The same input
// gives the same bytes, so a render's package is reproducible from its draft.
//
// The report's manifest (report_manifest_v1, the donor's report contract) is derived from the same parse and checked
// before anything renders: a title, at least one section of content, enough words, every citation a resolved source,
// unique ids and contents links that land. A report that fails a check is not rendered; the checks say why.
import { anchorOf, parseMarkdown, safeHref, wordCount, type Block, type Inline } from './markdown.ts'
import { REPORT_CSS } from './report-css.ts'

export const REPORT_MANIFEST_SCHEMA = 'report_manifest_v1'
export const OUTPUT_PROFILE = 'pdf-report-v1'
/** Fewer words than this is a note, not a report. */
export const MIN_REPORT_WORDS = 100
/** Contents are printed from this many sections. */
const TOC_FROM = 3
/** At most this many sections and tables: a report, not an index (the manifest's own bounds are wider). */
export const MAX_REPORT_PARTS = 200
/** How long a section id may be (a heading's anchor, cut on a word). */
const ID_LENGTH = 80

export type ReportLayout = 'standard' | 'compact'
export type SectionRole = 'summary' | 'body' | 'conclusion' | 'references'

/** A source the report may cite, as the service resolved it. */
export interface ReportSource {
  id: string
  title: string | null
  url: string | null
}

export interface ReportInput {
  markdown: string
  /** BCP 47; its primary subtag picks the template's own words (en, it, es). */
  language: string
  /** The title when the report does not open with a level-1 heading. */
  title: string
  sources: readonly ReportSource[]
  layout: ReportLayout
  /** The sources a link may cite (parseMarkdown's option): a published version's own, so its PDF reads it as Studio
   * does. Left out, a link to any source id is a citation, and one the service did not resolve refuses the PDF. */
  citable?: readonly string[]
}

export interface ReportManifest {
  schema: typeof REPORT_MANIFEST_SCHEMA
  profile: typeof OUTPUT_PROFILE
  layout: ReportLayout
  language: string
  title: string
  sections: { id: string; title: string; role: SectionRole; words: number }[]
  visuals: { id: string; kind: 'table'; section: string | null }[]
  toc: boolean
  words: number
  citations: number
}

export interface ReportCheck {
  name: string
  outcome: 'passed' | 'failed'
  detail: string | null
}

export interface ReportDocument {
  html: string
  manifest: ReportManifest
  checks: ReportCheck[]
  /** Every check passed: only then is the document rendered. */
  accepted: boolean
}

interface Words {
  report: string
  contents: string
  sources: string
  unresolved: string
}
const EN: Words = { report: 'Report', contents: 'Contents', sources: 'Sources', unresolved: 'Source not available' }
const WORDS: Record<string, Words> = {
  en: EN,
  it: { report: 'Rapporto', contents: 'Indice', sources: 'Fonti', unresolved: 'Fonte non disponibile' },
  es: { report: 'Informe', contents: 'Índice', sources: 'Fuentes', unresolved: 'Fuente no disponible' },
}

const ROLES: [SectionRole, RegExp][] = [
  ['references', /\b(references|sources|bibliograph|fonti|riferimenti|fuentes|referencias)/],
  ['conclusion', /\b(conclusion|recommendation|conclusioni|raccomandazion|conclusi[oó]n|recomendaci)/],
  ['summary', /\b(summary|overview|executive|sintesi|riepilogo|sommario|resumen)/],
]

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

/** The plain text of inline content (citations as [n]), for titles, anchors and word counts. */
export function plainText(inline: readonly Inline[]): string {
  return inline
    .map((i) => {
      if (i.kind === 'text' || i.kind === 'code') return i.text
      if (i.kind === 'cite') return `[${i.n}]`
      if (i.kind === 'break') return ' '
      return plainText(i.children)
    })
    .join('')
}

function inlineHtml(inline: readonly Inline[]): string {
  return inline
    .map((i) => {
      switch (i.kind) {
        case 'text':
          return esc(i.text)
        case 'code':
          return `<code>${esc(i.text)}</code>`
        case 'strong':
          return `<strong>${inlineHtml(i.children)}</strong>`
        case 'em':
          return `<em>${inlineHtml(i.children)}</em>`
        case 'link': {
          const href = safeHref(i.href)
          return href ? `<a href="${esc(href)}">${inlineHtml(i.children)}</a>` : inlineHtml(i.children)
        }
        case 'cite':
          return `<sup class="cite"><a href="#cite-${i.n}">[${i.n}]</a></sup>`
        case 'break':
          return '<br>'
      }
      return ''
    })
    .join('')
}

/** Renders blocks; `shift` maps a Markdown heading level to the printed one (a section's own heading is h2). */
class Printer {
  tables = 0
  readonly visuals: ReportManifest['visuals'] = []
  private readonly shift: number
  constructor(shift: number) {
    this.shift = shift
  }

  blocks(blocks: readonly Block[], section: string | null): string {
    return blocks.map((b) => this.block(b, section)).join('\n')
  }

  private block(b: Block, section: string | null): string {
    switch (b.kind) {
      case 'heading': {
        const level = Math.min(6, Math.max(3, b.level + this.shift))
        return `<h${level}>${inlineHtml(b.children)}</h${level}>`
      }
      case 'paragraph':
        return `<p>${inlineHtml(b.children)}</p>`
      case 'list':
        return listHtml(b)
      case 'quote':
        return `<blockquote>${this.blocks(b.blocks, section)}</blockquote>`
      case 'code':
        return `<pre><code>${esc(b.text)}</code></pre>`
      case 'table':
        return this.table(b, section)
      case 'rule':
        return '<hr>'
    }
    return ''
  }

  private table(b: Extract<Block, { kind: 'table' }>, section: string | null): string {
    this.tables += 1
    const id = `table-${this.tables}`
    this.visuals.push({ id, kind: 'table', section })
    const cell = (tag: string, k: number, content: readonly Inline[]) => {
      const align = b.align[k]
      return `<${tag}${align ? ` class="al-${align}"` : ''}>${inlineHtml(content)}</${tag}>`
    }
    const head = `<tr>${b.head.map((c, k) => cell('th', k, c)).join('')}</tr>`
    const rows = b.rows.map((r) => `<tr>${r.map((c, k) => cell('td', k, c)).join('')}</tr>`).join('')
    return `<figure class="table" data-visual-id="${id}"><table><thead>${head}</thead><tbody>${rows}</tbody></table></figure>`
  }
}

function listHtml(b: Extract<Block, { kind: 'list' }>): string {
  const items = b.items
    .map((it) => `<li${it.depth > 0 ? ` class="d${Math.min(3, it.depth)}"` : ''}>${inlineHtml(it.children)}</li>`)
    .join('')
  if (!b.ordered) return `<ul>${items}</ul>`
  return `<ol${b.start === 1 ? '' : ` start="${b.start}"`}>${items}</ol>`
}

/** The words of blocks as printed (headings, text, cells and items; never the template's own words). */
function blockWords(blocks: readonly Block[]): number {
  let n = 0
  for (const b of blocks) {
    if (b.kind === 'heading' || b.kind === 'paragraph') n += wordCount(plainText(b.children))
    else if (b.kind === 'list') n += b.items.reduce((s, it) => s + wordCount(plainText(it.children)), 0)
    else if (b.kind === 'quote') n += blockWords(b.blocks)
    else if (b.kind === 'code') n += wordCount(b.text)
    else if (b.kind === 'table') n += [b.head, ...b.rows].flat().reduce((s, c) => s + wordCount(plainText(c)), 0)
  }
  return n
}

interface Split {
  title: string | null
  lead: Block[]
  sections: { heading: Extract<Block, { kind: 'heading' }>; blocks: Block[] }[]
  level: number
}

/** The title (a leading level-1 heading), the blocks before the first section, and the sections. */
function split(blocks: readonly Block[]): Split {
  const first = blocks[0]
  const titled = first?.kind === 'heading' && first.level === 1
  const rest = titled ? blocks.slice(1) : [...blocks]
  const levels = rest.flatMap((b) => (b.kind === 'heading' ? [b.level] : []))
  const level = levels.length > 0 ? Math.min(...levels) : 7
  const out: Split = { title: titled ? plainText(first.children).trim() : null, lead: [], sections: [], level }
  for (const b of rest) {
    if (b.kind === 'heading' && b.level === level) out.sections.push({ heading: b, blocks: [] })
    else (out.sections.at(-1)?.blocks ?? out.lead).push(b)
  }
  return out
}

const RESERVED = new Set(['report-title', 'report-contents', 'report-sources'])

/** Unique section ids from the headings' anchors (as 0027 computes them), never one the template uses itself. */
function sectionIds(titles: readonly string[]): string[] {
  const used = new Set<string>()
  return titles.map((title, i) => {
    const base = anchorOf(title).slice(0, ID_LENGTH).replace(/-+$/, '') || `section-${i + 1}`
    let id = base
    for (let k = 2; used.has(id) || RESERVED.has(id) || /^(cite|table)-\d+$/.test(id); k += 1) id = `${base}-${k}`
    used.add(id)
    return id
  })
}

const roleOf = (title: string): SectionRole => ROLES.find(([, re]) => re.test(title.toLowerCase()))?.[0] ?? 'body'

function sourcesHtml(citations: readonly string[], input: ReportInput, words: Words): string {
  if (citations.length === 0) return ''
  const known = new Map(input.sources.map((s) => [s.id.toLowerCase(), s]))
  const items = citations.map((id, k) => {
    const s = known.get(id)
    const title = esc(s?.title?.trim() || (s ? id : words.unresolved))
    const href = s?.url ? safeHref(s.url) : null
    const url = href ? `<br><a class="url" href="${esc(href)}">${esc(href)}</a>` : ''
    return `<li id="cite-${k + 1}">${title}${url}</li>`
  })
  return `<section class="sources" id="report-sources" data-report-role="references"><h2>${esc(words.sources)}</h2><ol>${items.join('')}</ol></section>`
}

const check = (name: string, ok: boolean, detail: string): ReportCheck => ({
  name,
  outcome: ok ? 'passed' : 'failed',
  detail: ok ? null : detail,
})

function checksOf(doc: {
  manifest: ReportManifest
  ids: string[]
  links: string[]
  unresolved: number
}): ReportCheck[] {
  const { manifest } = doc
  const content = manifest.sections.filter((s) => s.role !== 'references')
  const ids = new Set(doc.ids)
  return [
    check('report_title', manifest.title.length > 0, 'The report has no title'),
    check('report_sections', content.length > 0, 'The report has no section headings: give it sections'),
    check(
      'report_words',
      manifest.words >= MIN_REPORT_WORDS,
      `The report has ${manifest.words} words; a report has at least ${MIN_REPORT_WORDS}`,
    ),
    check(
      'report_size',
      manifest.sections.length <= MAX_REPORT_PARTS && manifest.visuals.length <= MAX_REPORT_PARTS,
      `A report has at most ${MAX_REPORT_PARTS} sections and ${MAX_REPORT_PARTS} tables`,
    ),
    check('citations_resolved', doc.unresolved === 0, `${doc.unresolved} cited sources are not sources this task read`),
    check('ids_unique', ids.size === doc.ids.length, 'Two elements share an id'),
    check(
      'contents_links',
      doc.links.every((l) => ids.has(l)),
      'A contents or citation link has no target',
    ),
  ]
}

interface PrintedSection {
  html: string
  entry: ReportManifest['sections'][number]
}

/** Each section printed under its unique id, with its manifest entry. */
function printSections(parts: Split, printer: Printer): PrintedSection[] {
  const titles = parts.sections.map((s) => plainText(s.heading.children).trim())
  const ids = sectionIds(titles)
  return parts.sections.map((s, i) => {
    const title = titles[i] ?? ''
    const id = ids[i] ?? `section-${i + 1}`
    const role = roleOf(title)
    const body = printer.blocks(s.blocks, id)
    return {
      html: `<section id="${esc(id)}" data-report-role="${role}"><h2>${inlineHtml(s.heading.children)}</h2>\n${body}</section>`,
      entry: { id, title: title.slice(0, 300), role, words: wordCount(title) + blockWords(s.blocks) },
    }
  })
}

function contentsHtml(sections: readonly PrintedSection[], words: Words): string {
  const items = sections.map((s) => `<li><a href="#${esc(s.entry.id)}">${esc(s.entry.title)}</a></li>`).join('')
  return `<nav class="toc" id="report-contents" data-report-role="toc"><h2>${esc(words.contents)}</h2><ol>${items}</ol></nav>`
}

const matches = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[1] ?? '')

/** The report as one HTML document, its manifest and its checks (see the header). */
export function renderReport(input: ReportInput): ReportDocument {
  const parsed = parseMarkdown(input.markdown, input.citable ? { citable: input.citable } : {})
  const parts = split(parsed.blocks)
  const words = WORDS[input.language.toLowerCase().split('-')[0] ?? ''] ?? EN
  const title = (parts.title || input.title).trim().slice(0, 200)
  const printer = new Printer(2 - parts.level)
  const lead = printer.blocks(parts.lead, null)
  const sections = printSections(parts, printer)
  const toc = sections.length >= TOC_FROM
  const manifest: ReportManifest = {
    schema: REPORT_MANIFEST_SCHEMA,
    profile: OUTPUT_PROFILE,
    layout: input.layout,
    language: input.language,
    title,
    sections: sections.map((s) => s.entry),
    visuals: printer.visuals,
    toc,
    words: blockWords(parts.lead) + sections.reduce((n, s) => n + s.entry.words, 0),
    citations: parsed.citations.length,
  }
  const body = [
    `<header class="title-block" id="report-title"><p class="eyebrow">${esc(words.report)}</p><h1>${esc(title)}</h1></header>`,
    lead ? `<div class="lead">${lead}</div>` : '',
    toc ? contentsHtml(sections, words) : '',
    ...sections.map((s) => s.html),
    sourcesHtml(parsed.citations, input, words),
  ].filter((p) => p !== '')
  const html =
    `<!doctype html>\n<html lang="${esc(input.language)}"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>${REPORT_CSS}</style></head>\n<body class="${input.layout}">\n${body.join('\n')}\n</body></html>\n`
  const known = new Set(input.sources.map((s) => s.id.toLowerCase()))
  const checks = checksOf({
    manifest,
    ids: matches(html, /\sid="([^"]+)"/g),
    links: matches(html, /\shref="#([^"]+)"/g),
    unresolved: parsed.citations.filter((id) => !known.has(id)).length,
  })
  return { html, manifest, checks, accepted: checks.every((c) => c.outcome === 'passed') }
}
