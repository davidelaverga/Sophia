// A report's Markdown as data (SMC-M03 S4, plan §2.8.3): Studio's viewer renders it, and the PDF template (S5b,
// report-html.ts) prints it. The parser is ours and small on purpose (SMC-M03-contract-binding.md §8): nothing it
// returns is HTML. Raw HTML stays literal text, an image is named and never loaded, a link is kept only for http, https
// and mailto, and a source id the report cites becomes a numbered citation: bare, bracketed, or as a link's destination
// (`[1](<id>)`, the form models write), never a link to the id. React renders every string as text, and the template
// escapes every one, so a report cannot run script or load an asset.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] }
  /** A source the report cites, numbered by first appearance. */
  | { kind: 'cite'; sourceId: string; n: number }
  | { kind: 'break' }

export type Align = 'left' | 'center' | 'right' | null

export type Block =
  | { kind: 'heading'; level: number; anchor: string; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: { depth: number; children: Inline[] }[] }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'code'; text: string; lang: string | null }
  | { kind: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { kind: 'rule' }

export interface ParsedReport {
  blocks: Block[]
  /** The cited source ids, in the order the report first cites them: citation n is `citations[n - 1]`. */
  citations: string[]
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
/** A source as the report may name it: its id, or a research ref to it (`search:<id>#2`, `input:<id>`). */
const REF = `(?:(?:search|link|input|source):\\s*)?(${UUID})(?:#\\d{1,4})?`
/** A bracketed group of refs and nothing else: `[id]`, `(id, id)`, `[source: id; id]`. */
const CITE_GROUP = new RegExp(`[\\[(]\\s*${REF}(?:\\s*[,;]\\s*${REF})*\\s*[\\])]`, 'gi')
const CITE_ONE = new RegExp(REF, 'gi')
/** A link whose destination is a source or a ref to one, and nothing else: `[1](<id>)`, `[2](search:<id>#3)`. */
const CITE_TARGET = new RegExp(`^<?\\s*${REF}\\s*>?$`, 'i')
/** A link label that only numbers its citation (`1`, `[2]`, `^3`, or none): the citation's own number replaces it. */
const MARKER = /^\s*\[?\^?\d{0,4}\]?\s*$/

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)/
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE = /^ {0,3}>\s?(.*)$/
const ITEM = /^(\s*)([-*+]|(\d{1,9})[.)])\s+(.*)$/
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/
const BLANK = /^\s*$/

/** At most this deep: a quote in a quote in a quote… is flattened past it. */
const MAX_DEPTH = 4

/** The anchor of a heading, as the service computes it for section facts (0027): lower case, words joined by `-`. */
export function anchorOf(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** A link's target when it is one the viewer opens (http, https, mailto); anything else is shown as text only. */
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' ? url.href : null
  } catch {
    return null
  }
}

/** Numbers cited sources as the parse meets them; `renumber` then numbers them in reading order. */
class Citations {
  readonly order: string[] = []
  private readonly index = new Map<string, number>()
  private readonly citable: ReadonlySet<string> | undefined

  constructor(citable?: ReadonlySet<string>) {
    this.citable = citable
  }

  /** Whether a link to this id is a citation: any source id, unless the caller named the ones the report may cite. */
  links(sourceId: string): boolean {
    return this.citable?.has(sourceId.toLowerCase()) ?? true
  }

  n(sourceId: string): number {
    const id = sourceId.toLowerCase()
    const known = this.index.get(id)
    if (known !== undefined) return known
    this.order.push(id)
    this.index.set(id, this.order.length)
    return this.order.length
  }
}

const textOf = (text: string): Inline[] => (text === '' ? [] : [{ kind: 'text', text }])

/** Plain text with its citations: a bracketed group of refs, or a bare ref, becomes numbered citations. */
function citing(text: string, cites: Citations): Inline[] {
  const out: Inline[] = []
  let last = 0
  const groups = text.matchAll(CITE_GROUP)
  for (const g of groups) {
    out.push(...bareCites(text.slice(last, g.index), cites))
    for (const m of g[0].matchAll(CITE_ONE)) {
      if (m[1]) out.push({ kind: 'cite', sourceId: m[1].toLowerCase(), n: cites.n(m[1]) })
    }
    last = g.index + g[0].length
  }
  out.push(...bareCites(text.slice(last), cites))
  return out
}

function bareCites(text: string, cites: Citations): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(CITE_ONE)) {
    if (!m[1]) continue
    out.push(...textOf(text.slice(last, m.index)))
    out.push({ kind: 'cite', sourceId: m[1].toLowerCase(), n: cites.n(m[1]) })
    last = m.index + m[0].length
  }
  out.push(...textOf(text.slice(last)))
  return out
}

/** The closing `delim` for an opening at `from`, not inside a code span; -1 when none. */
function closing(src: string, from: number, delim: string): number {
  let i = from
  while (i < src.length) {
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1)
      if (end < 0) return -1
      i = end + 1
      continue
    }
    if (src[i] === '\\') {
      i += 2
      continue
    }
    // A single delimiter skips a double one: `*a **b** c*` closes at the last star.
    if (delim.length === 1 && src[i] === delim && src[i + 1] === delim) {
      i += 2
      continue
    }
    if (src.startsWith(delim, i) && i > from) return i
    i += 1
  }
  return -1
}

interface Scan {
  src: string
  cites: Citations
  depth: number
  /** Where each label opened in `src` closes (-1: it does not), as `labelEnd` finds them: one pass, however many `[`. */
  ends?: Map<number, number>
}

/** A part of a scan's text (an emphasis or a label), read one level deeper. */
const deeper = (s: Scan, src: string): Scan => ({ src, cites: s.cites, depth: s.depth + 1 })

type Step = { inline: Inline[]; next: number } | null

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c)

function codeSpan(s: Scan, i: number): Step {
  const end = s.src.indexOf('`', i + 1)
  return end < 0 ? null : { inline: [{ kind: 'code', text: s.src.slice(i + 1, end) }], next: end + 1 }
}

function emphasis(s: Scan, i: number): Step {
  const c = s.src[i] ?? ''
  const strong = s.src[i + 1] === c
  const delim = strong ? c + c : c
  // An underscore inside a word is a letter (snake_case), not emphasis.
  if (c === '_' && isWordChar(s.src[i - 1])) return null
  const start = i + delim.length
  if (s.src[start] === undefined || /\s/.test(s.src[start] ?? '')) return null
  const end = closing(s.src, start, delim)
  if (end < 0) return null
  const children = inlines(deeper(s, s.src.slice(start, end)))
  return { inline: [strong ? { kind: 'strong', children } : { kind: 'em', children }], next: end + delim.length }
}

/** The `)` that closes a link target opened just before `from`, parentheses inside it balanced; -1 when none. */
function targetEnd(src: string, from: number): number {
  let depth = 0
  for (let i = from; i < src.length && src[i] !== '\n'; i += 1) {
    if (src[i] === '(') depth += 1
    else if (src[i] === ')') {
      if (depth === 0) return i
      depth -= 1
    }
  }
  return -1
}

/** `[1](<id>)`: a link to a source the report may cite is a citation, its label kept if it says more than a number. */
function citeLink(s: Scan, label: string, target: string): Inline[] | null {
  const id = CITE_TARGET.exec(target)?.[1]?.toLowerCase()
  if (id === undefined || !s.cites.links(id)) return null
  if (MARKER.test(label) || CITE_TARGET.test(label.trim())) return [{ kind: 'cite', sourceId: id, n: s.cites.n(id) }]
  // The label first, so a citation inside it keeps its place in the numbering.
  const children = inlines(deeper(s, label))
  return [...children, { kind: 'cite', sourceId: id, n: s.cites.n(id) }]
}

/** The last character of an escape or a closed code span at `i`, else `i`: what a label's brackets skip. */
const skipped = (src: string, i: number): number => {
  if (src[i] === '\\') return i + 1
  return src[i] === '`' ? Math.max(i, src.indexOf('`', i + 1)) : i
}

/**
 * The `]` that closes the label opened at `open`, brackets inside it balanced: a backslash escapes the next character,
 * a closed code span hides what it holds, and a blank line ends the search. -1 when none. The labels opened inside it
 * are closed by the same pass and remembered, so a run of `[` costs one pass, not one per bracket.
 */
function labelEnd(s: Scan, open: number): number {
  const ends = (s.ends ??= new Map<number, number>())
  const known = ends.get(open)
  if (known !== undefined) return known
  const src = s.src
  const opens = [open]
  for (let i = open + 1; i < src.length && opens.length > 0; i = skipped(src, i) + 1) {
    const c = src[i]
    if (c === '\n' && src[i + 1] === '\n') break
    if (c === '[') opens.push(i)
    else if (c === ']') ends.set(opens.pop() ?? open, i)
  }
  for (const o of opens) ends.set(o, -1)
  return ends.get(open) ?? -1
}

/** Whether inline content holds a link, at any depth. */
const holdsLink = (inline: readonly Inline[]): boolean =>
  inline.some((i) => i.kind === 'link' || ((i.kind === 'strong' || i.kind === 'em') && holdsLink(i.children)))

/** `inline` without its citations, which are added to `out` in order. */
function withoutCites(inline: readonly Inline[], out: Inline[]): Inline[] {
  return inline.flatMap((i): Inline[] => {
    if (i.kind === 'cite') {
      out.push(i)
      return []
    }
    if (i.kind === 'strong' || i.kind === 'em') return [{ ...i, children: withoutCites(i.children, out) }]
    return [i]
  })
}

/** Whether inline content shows a letter or a digit, at any depth. */
const shows = (inline: readonly Inline[]): boolean =>
  inline.some((i) =>
    i.kind === 'text' || i.kind === 'code'
      ? /[\p{L}\p{N}]/u.test(i.text)
      : (i.kind === 'strong' || i.kind === 'em' || i.kind === 'link') && shows(i.children),
  )

/** What a link says when its label says nothing but citations: its site, or the address it mails. */
function siteOf(href: string): string {
  const url = new URL(href)
  return url.host || url.pathname
}

/** Adjacent text runs as one. */
const joined = (inline: readonly Inline[]): Inline[] =>
  inline.reduce<Inline[]>((out, i) => {
    const last = out.at(-1)
    if (i.kind === 'text' && last?.kind === 'text') out[out.length - 1] = { kind: 'text', text: last.text + i.text }
    else out.push(i)
    return out
  }, [])

/**
 * A link the viewer may open, else its label as text. One anchor is never inside another: a label that holds a link is
 * not a link but text around the inner one, its brackets and target as written (as in CommonMark), and a citation in a
 * label follows the link. A label is read once: read again, a label in a label in a label… doubles the work each level.
 */
function linkTo(s: Scan, label: string, href: string | null, tail: string, next: number): Step {
  const children = inlines(deeper(s, label))
  if (!href) return { inline: children, next }
  if (holdsLink(children)) {
    return { inline: joined([{ kind: 'text', text: '[' }, ...children, ...citing(tail, s.cites)]), next }
  }
  const cites: Inline[] = []
  const kept = withoutCites(children, cites)
  const named: Inline[] = shows(kept) ? kept : [{ kind: 'text', text: siteOf(href) }]
  return { inline: [{ kind: 'link', href, children: named }, ...cites], next }
}

/** `[text](url)` or `![alt](src)`: a link the viewer may open, else its text; an image only by name. */
function linkOrImage(s: Scan, i: number): Step {
  const image = s.src[i] === '!'
  const open = image ? i + 1 : i
  const close = labelEnd(s, open)
  if (close < 0 || s.src[close + 1] !== '(') return null
  const end = targetEnd(s.src, close + 2)
  if (end < 0) return null
  const label = s.src.slice(open + 1, close)
  const target =
    s.src
      .slice(close + 2, end)
      .trim()
      .split(/\s+/)[0] ?? ''
  if (image) return { inline: [{ kind: 'text', text: `[image: ${label || 'untitled'}]` }], next: end + 1 }
  const cited = citeLink(s, label, target)
  if (cited) return { inline: cited, next: end + 1 }
  return linkTo(s, label, safeHref(target), s.src.slice(close, end + 1), end + 1)
}

/** `<https://…>`: an autolink. Any other `<…>` stays text. */
function autolink(s: Scan, i: number): Step {
  const end = s.src.indexOf('>', i + 1)
  if (end < 0) return null
  const href = safeHref(s.src.slice(i + 1, end))
  if (!href) return null
  return {
    inline: [{ kind: 'link', href, children: [{ kind: 'text', text: s.src.slice(i + 1, end) }] }],
    next: end + 1,
  }
}

function special(s: Scan, i: number): Step {
  const c = s.src[i]
  if (c === '`') return codeSpan(s, i)
  if (c === '*' || c === '_') return emphasis(s, i)
  if (c === '[' || (c === '!' && s.src[i + 1] === '[')) return linkOrImage(s, i)
  if (c === '<') return autolink(s, i)
  return null
}

/** One line's (or one cell's) inline content. */
function inlines(s: Scan): Inline[] {
  const out: Inline[] = []
  let text = ''
  const flush = () => {
    out.push(...citing(text, s.cites))
    text = ''
  }
  let i = 0
  while (i < s.src.length) {
    const c = s.src[i] ?? ''
    if (c === '\\' && i + 1 < s.src.length) {
      text += s.src[i + 1] === '\n' ? '\n' : (s.src[i + 1] ?? '')
      i += 2
      continue
    }
    if (c === '\n') {
      const hard = text.endsWith('  ')
      text = hard ? text.trimEnd() : `${text} `
      if (hard) {
        flush()
        out.push({ kind: 'break' })
      }
      i += 1
      continue
    }
    const step = s.depth < MAX_DEPTH * 2 ? special(s, i) : null
    if (step) {
      flush()
      out.push(...step.inline)
      i = step.next
      continue
    }
    text += c
    i += 1
  }
  flush()
  return out
}

/** The cells of a table row: split on `|` outside code spans, the outer pipes dropped. */
function cells(line: string): string[] {
  const row = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const out: string[] = []
  let cell = ''
  let code = false
  for (let i = 0; i < row.length; i += 1) {
    const c = row[i] ?? ''
    if (c === '\\' && row[i + 1] === '|') {
      cell += '|'
      i += 1
    } else if (c === '`') {
      code = !code
      cell += c
    } else if (c === '|' && !code) {
      out.push(cell.trim())
      cell = ''
    } else {
      cell += c
    }
  }
  out.push(cell.trim())
  return out
}

function alignOf(cell: string): Align {
  const t = cell.trim()
  if (t.startsWith(':') && t.endsWith(':')) return 'center'
  if (t.endsWith(':')) return 'right'
  if (t.startsWith(':')) return 'left'
  return null
}

interface Lines {
  lines: string[]
  at: number
  cites: Citations
  depth: number
}

const peek = (l: Lines, k = 0) => l.lines[l.at + k]

/** A table: a row with pipes over a delimiter row with pipes (`| --- | :-: |`). */
const opensTable = (line: string, next: string | undefined) =>
  line.includes('|') && next !== undefined && next.includes('|') && TABLE_RULE.test(next)

/** Whether a line starts a block other than a paragraph (it ends a paragraph above it). */
function startsBlock(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line)
}

function fenced(l: Lines, open: RegExpExecArray): Block {
  const fence = open[1] ?? '```'
  const body: string[] = []
  l.at += 1
  while (l.at < l.lines.length) {
    const line = peek(l) ?? ''
    if (line.trim().startsWith(fence) && line.trim().replace(/[`~]/g, '') === '') {
      l.at += 1
      break
    }
    body.push(line)
    l.at += 1
  }
  return { kind: 'code', text: body.join('\n'), lang: open[2] || null }
}

function quote(l: Lines): Block {
  const inner: string[] = []
  while (l.at < l.lines.length) {
    const m = QUOTE.exec(peek(l) ?? '')
    if (!m) break
    inner.push(m[1] ?? '')
    l.at += 1
  }
  if (l.depth >= MAX_DEPTH)
    return { kind: 'paragraph', children: inlines({ src: inner.join('\n'), cites: l.cites, depth: 0 }) }
  return { kind: 'quote', blocks: parseLines({ lines: inner, at: 0, cites: l.cites, depth: l.depth + 1 }) }
}

/** An item's nesting: two spaces (or a tab) per level, at most three levels. */
const depthOf = (indent: string) => Math.min(Math.floor(indent.replace(/\t/g, '  ').length / 2), 3)

type ListLine = { item: { depth: number; text: string } } | 'continue' | 'skip' | 'end'

/** What a line means inside a list: another item, more of the last one, a blank between items, or its end. */
function listLine(l: Lines, line: string, ordered: boolean, hasItem: boolean): ListLine {
  const m = ITEM.exec(line)
  if (m) {
    const depth = depthOf(m[1] ?? '')
    // A top-level item of the other kind (a number after bullets) starts a new list.
    if (depth === 0 && (m[3] !== undefined) !== ordered) return 'end'
    return { item: { depth, text: m[4] ?? '' } }
  }
  if (hasItem && !BLANK.test(line) && /^\s{2,}/.test(line)) return 'continue'
  if (BLANK.test(line) && ITEM.test(peek(l, 1) ?? '')) return 'skip'
  return 'end'
}

function list(l: Lines, first: RegExpExecArray): Block {
  const ordered = first[3] !== undefined
  const items: { depth: number; text: string }[] = []
  for (;;) {
    const line = peek(l)
    const step = line === undefined ? 'end' : listLine(l, line, ordered, items.length > 0)
    if (step === 'end') break
    const last = items.at(-1)
    if (typeof step === 'object') items.push(step.item)
    else if (step === 'continue' && last) last.text += `\n${(line ?? '').trim()}`
    l.at += 1
  }
  return {
    kind: 'list',
    ordered,
    start: ordered ? Number(first[3]) : 1,
    items: items.map((it) => ({ depth: it.depth, children: inlines({ src: it.text, cites: l.cites, depth: 0 }) })),
  }
}

function table(l: Lines): Block {
  const cell = (text: string) => inlines({ src: text, cites: l.cites, depth: 0 })
  const head = cells(peek(l) ?? '')
  const align = cells(peek(l, 1) ?? '').map(alignOf)
  l.at += 2
  const rows: Inline[][][] = []
  while (l.at < l.lines.length && (peek(l) ?? '').includes('|') && !BLANK.test(peek(l) ?? '')) {
    const row = cells(peek(l) ?? '')
    rows.push(head.map((_, k) => cell(row[k] ?? '')))
    l.at += 1
  }
  return { kind: 'table', align: head.map((_, k) => align[k] ?? null), head: head.map(cell), rows }
}

function paragraph(l: Lines): Block {
  const body: string[] = []
  while (l.at < l.lines.length) {
    const line = peek(l) ?? ''
    if (BLANK.test(line) || (body.length > 0 && startsBlock(line))) break
    if (body.length > 0 && opensTable(line, peek(l, 1))) break
    body.push(line)
    l.at += 1
  }
  return { kind: 'paragraph', children: inlines({ src: body.join('\n'), cites: l.cites, depth: 0 }) }
}

/** The block that starts at the current line (the caller has skipped blank lines). */
function block(l: Lines): Block {
  const line = peek(l) ?? ''
  const fence = FENCE.exec(line)
  if (fence) return fenced(l, fence)
  const heading = HEADING.exec(line)
  if (heading && (heading[2] ?? '').trim() !== '') {
    l.at += 1
    const text = heading[2] ?? ''
    return {
      kind: 'heading',
      level: (heading[1] ?? '#').length,
      anchor: anchorOf(text),
      children: inlines({ src: text, cites: l.cites, depth: 0 }),
    }
  }
  if (RULE.test(line)) {
    l.at += 1
    return { kind: 'rule' }
  }
  if (QUOTE.test(line)) return quote(l)
  const item = ITEM.exec(line)
  if (item) return list(l, item)
  if (opensTable(line, peek(l, 1))) return table(l)
  return paragraph(l)
}

function parseLines(l: Lines): Block[] {
  const blocks: Block[] = []
  while (l.at < l.lines.length) {
    if (BLANK.test(peek(l) ?? '')) {
      l.at += 1
      continue
    }
    blocks.push(block(l))
  }
  return blocks
}

export interface ParseOptions {
  /** The sources a link may cite (Studio: the version's own). Left out, a link to any source id is a citation, as a
   * bracketed or bare one is; a link to any other id reads as its label. */
  citable?: Iterable<string>
}

/** A report's Markdown as blocks, with the sources it cites numbered in order. */
export function parseMarkdown(markdown: string, options: ParseOptions = {}): ParsedReport {
  const citable =
    options.citable === undefined ? undefined : new Set([...options.citable].map((id) => id.toLowerCase()))
  const cites = new Citations(citable)
  const blocks = parseLines({ lines: markdown.replace(/\r\n?/g, '\n').split('\n'), at: 0, cites, depth: 0 })
  return { blocks, citations: renumber(blocks) }
}

/** The inline runs of blocks, in reading order (a heading, a paragraph, each item, each cell). */
function* runsOf(blocks: readonly Block[]): Generator<Inline[]> {
  for (const b of blocks) {
    if (b.kind === 'heading' || b.kind === 'paragraph') yield b.children
    else if (b.kind === 'list') for (const it of b.items) yield it.children
    else if (b.kind === 'quote') yield* runsOf(b.blocks)
    else if (b.kind === 'table') yield* [b.head, ...b.rows].flat()
  }
}

/**
 * Citations numbered by their first appearance in reading order, whatever order the parse met them in (a link's label
 * is read before the text in front of it is). Returns the cited ids, citation n being `[n - 1]`.
 */
function renumber(blocks: readonly Block[]): string[] {
  const index = new Map<string, number>()
  const visit = (run: readonly Inline[]): void => {
    for (const i of run) {
      if (i.kind === 'cite') {
        const n = index.get(i.sourceId) ?? index.size + 1
        index.set(i.sourceId, n)
        i.n = n
      } else if (i.kind === 'strong' || i.kind === 'em' || i.kind === 'link') visit(i.children)
    }
  }
  for (const run of runsOf(blocks)) visit(run)
  return [...index.keys()]
}

/** The words of a text, for a viewer's meta line. */
export const wordCount = (text: string): number => text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0

export interface SectionChange {
  added: string[]
  revised: string[]
  removed: string[]
  unchanged: string[]
  conclusionChanged: boolean
}

interface Section {
  heading: string | null
  anchor: string
  body: string
}

/** A Markdown text as sections, the way the service splits it for section facts (0027 markdown_sections). */
export function sectionsOf(text: string): Section[] {
  const out: Section[] = []
  let inFence = false
  let heading: string | null = null
  let body = ''
  const push = () => {
    if (heading !== null || body.trim() !== '') {
      out.push({ heading, anchor: heading === null ? '' : anchorOf(heading), body: body.replace(/\s+/g, ' ').trim() })
    }
  }
  for (const line of text.split(/\r?\n/)) {
    if (/^\s{0,3}(```|~~~)/.test(line)) inFence = !inFence
    const m = inFence ? null : /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (m && (m[1] ?? '').trim() !== '') {
      push()
      heading = (m[1] ?? '').trim()
      body = ''
    } else {
      body += `${line}\n`
    }
  }
  push()
  return out
}

const CONCLUSION = /(conclusion|recommendation)/

const sectionName = (s: Section) => s.heading ?? '(introduction)'

/** What changed between two versions, by section: the comparison Knowledge shows (computed here, never stored). */
export function compareSections(older: string, newer: string): SectionChange {
  const was = sectionsOf(older)
  const now = sectionsOf(newer)
  const before = new Map(was.map((s) => [s.anchor, s]))
  const kept = new Set(now.map((s) => s.anchor))
  const change = (s: Section) => {
    const old = before.get(s.anchor)
    if (!old) return 'added'
    return old.body === s.body ? 'unchanged' : 'revised'
  }
  const pick = (kind: string) => now.filter((s) => change(s) === kind).map(sectionName)
  const gone = was.filter((s) => !kept.has(s.anchor))
  return {
    added: pick('added'),
    revised: pick('revised'),
    removed: gone.map(sectionName),
    unchanged: pick('unchanged'),
    conclusionChanged:
      now.some((s) => change(s) !== 'unchanged' && CONCLUSION.test(s.anchor)) ||
      gone.some((s) => CONCLUSION.test(s.anchor)),
  }
}
