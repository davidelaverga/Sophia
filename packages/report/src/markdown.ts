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
/** A source or a ref to one, and nothing else: a link label that says only that numbers its citation. */
const CITE_TARGET = new RegExp(`^<?\\s*${REF}\\s*>?$`, 'i')
/** A space in a link target: ASCII only (a no-break space or U+FEFF is not one there). */
const LINK_SPACE = '[ \\t\\n\\v\\f\\r]'
/**
 * A link target that cites, as written (untrimmed): spaces, then a source or a ref to one (`<id>`, `search:<id>#3`, a
 * space after the prefix allowed as in the bracketed form: `source: <id>`), then nothing or a space and anything, a
 * title (`<id> "t"`) say. A submit cites what this numbers: the API parses the draft with it and the service checks
 * each id (0036 research_draft_citations), so the report and its Sources agree.
 */
const CITE_LINK = new RegExp(
  `^${LINK_SPACE}*<?(?:(?:search|link|input|source):${LINK_SPACE}*)?(${UUID})(?:#\\d{1,4})?>?(?:${LINK_SPACE}[\\s\\S]*)?$`,
  'i',
)
/**
 * A trimmed link label that only numbers its citation (`1`, `[2]`, `^3`, or none): the citation's own number replaces
 * it. Matched on the trimmed label: with `\s*` at both ends, the two met when the rest was empty, and a label of spaces
 * was split every way.
 */
const MARKER = /^\[?\^?\d{0,4}\]?$/
/** An autolink-shaped span's opening: `<https:`, `<http:` or `<mailto:`, in any case. */
const AUTOLINK_SCHEME = /^(?:https?|mailto):/i

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)/
/** A heading's opening `#`s and the spaces after them (`headingOf` reads the rest). */
const HEADING = /^ {0,3}(#{1,6})\s+/
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE = /^ {0,3}>\s?(.*)$/
/** A list item's indent, its marker (the number of an ordered one) and the spaces after it (`itemOf` reads the rest). */
const ITEM = /^(\s*)([-*+]|(\d{1,9})[.)])\s+/
/** `| :-- | --: |`, written so that no two `\s*` meet: where two did, a long run of spaces was split every way. */
const TABLE_RULE = /^\s*(?:\|\s*)?:?-+:?\s*(?:\|\s*:?-+:?\s*)*(?:\|\s*)?$/
const BLANK = /^\s*$/

/** At most this deep: a quote in a quote in a quote… is flattened past it. */
const MAX_DEPTH = 4

/**
 * A heading's level and text, as `^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$` reads a line (closing `#`s and the spaces around
 * them dropped), in one pass: that pattern tries every split of a run of spaces at every place the text could end, and
 * a heading with a few thousand spaces in it took seconds. `open` is how it starts (`HEADING`; the sections' own).
 */
function headingOf(line: string, open: RegExp): { level: number; text: string } | null {
  const m = open.exec(line)
  if (!m) return null
  const from = m[0].length
  let end = line.length
  while (end > from && /\s/.test(line[end - 1] ?? '')) end -= 1
  while (end > from && line[end - 1] === '#') end -= 1
  while (end > from && /\s/.test(line[end - 1] ?? '')) end -= 1
  const text = line.slice(from, end)
  // The pattern's text is on one line, as `.` reads it.
  return /[\n\r\u2028\u2029]/.test(text) ? null : { level: (m[1] ?? '#').length, text }
}

interface Item {
  indent: string
  /** An ordered item's number, as written. */
  number: string | undefined
  text: string
}

/**
 * A list item as `^(\s*)([-*+]|(\d{1,9})[.)])\s+(.*)$` reads a line, in one pass: where `.` could not reach the end (a
 * U+2028 in the text), that pattern split the run of spaces after the marker every way before failing.
 */
function itemOf(line: string): Item | null {
  const m = ITEM.exec(line)
  if (!m) return null
  const text = line.slice(m[0].length)
  return /[\n\r\u2028\u2029]/.test(text) ? null : { indent: m[1] ?? '', number: m[3], text }
}

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

/**
 * Where the walk for a closing `delim` goes from `i`: past a code span, an escape or (for a single delimiter) a double
 * one, so `*a **b** c*` closes at the last star; `i` itself when a closer is there; -1 when an unclosed code span ends it.
 */
function closeStep(src: string, i: number, delim: string): number {
  if (src[i] === '`') {
    const end = src.indexOf('`', i + 1)
    return end < 0 ? -1 : end + 1
  }
  if (src[i] === '\\') return i + 2
  if (delim.length === 1 && src[i] === delim && src[i + 1] === delim) return i + 2
  return src.startsWith(delim, i) ? i : i + 1
}

/** Not yet walked from. */
const UNWALKED = -2

/** What each walk for a closing `delim` from each index of a scan's text found, `UNWALKED` until one has. */
function closersOf(s: Scan, delim: string): Int32Array {
  const closers = (s.closers ??= new Map<string, Int32Array>())
  const known = closers.get(delim) ?? new Int32Array(s.src.length).fill(UNWALKED)
  closers.set(delim, known)
  return known
}

/**
 * The closing `delim` for an opening at `from`, not inside a code span; -1 when none. Past its first step, a walk goes
 * the same way from wherever it is, so each index's answer is remembered: openers that never close (`foo__bar`, each
 * `_` after an `_`) cost one pass for all of them, not one to the end of the text each.
 */
function closing(s: Scan, from: number, delim: string): number {
  const first = closeStep(s.src, from, delim)
  if (first < 0) return -1
  const known = closersOf(s, delim)
  const walked: number[] = []
  let found = -1
  for (let i = first === from ? from + 1 : first; i < s.src.length;) {
    if (known[i] !== UNWALKED) {
      found = known[i] ?? -1
      break
    }
    walked.push(i)
    const next = closeStep(s.src, i, delim)
    if (next === i) found = i
    if (next <= i) break
    i = next
  }
  for (const i of walked) known[i] = found
  return found
}

interface Scan {
  src: string
  cites: Citations
  depth: number
  /** Where each label opened in `src` closes (-1: it does not), as `labelEnd` finds them: one pass, however many `[`. */
  ends?: Map<number, number>
  /** Where a link target opened at each index of `src` closes (-1: it does not), as `targetEnds` finds them: one pass. */
  targets?: Int32Array
  /** Where a walk for each closing delimiter from each index of `src` ends, as `closing` finds them: one pass each. */
  closers?: Map<string, Int32Array>
  /** The `>` that `closerAfter` last found (-1: none past where it looked). */
  gt?: number
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
  const end = closing(s, start, delim)
  if (end < 0) return null
  const children = inlines(deeper(s, s.src.slice(start, end)))
  return { inline: [strong ? { kind: 'strong', children } : { kind: 'em', children }], next: end + delim.length }
}

/**
 * The `)` that closes a link target opened at each index of `src`, parentheses inside it balanced and the line its end;
 * -1 when none. One pass for every index at once: an unclosed `[](` per character costs no rescan of the rest of its
 * line. A target waits on a stack at the depth it opened at, and the first `)` back at that depth closes it (depth moves
 * one step at a time, so the waiting depths only rise up the stack); a line break leaves the ones still waiting open.
 */
function targetEnds(src: string): Int32Array {
  const ends = new Int32Array(src.length + 1).fill(-1)
  const waiting: number[] = []
  const depths: number[] = []
  let depth = 0
  for (let i = 0; i < src.length; i += 1) {
    waiting.push(i)
    depths.push(depth)
    const c = src[i]
    if (c === '(') depth += 1
    else if (c === '\n') {
      waiting.length = 0
      depths.length = 0
    } else if (c === ')') {
      for (; depths.at(-1) === depth; depths.pop()) ends[waiting.pop() ?? 0] = i
      depth -= 1
    }
  }
  return ends
}

/** The `)` that closes a link target opened just before `from`; -1 when none. */
const targetEnd = (s: Scan, from: number): number => (s.targets ??= targetEnds(s.src))[from] ?? -1

/** `[1](<id>)`: a link to a source the report may cite is a citation, its label kept if it says more than a number. */
function citeLink(s: Scan, label: string, cited: string | undefined): Inline[] | null {
  const id = cited?.toLowerCase()
  if (id === undefined || !s.cites.links(id)) return null
  if (MARKER.test(label.trim()) || CITE_TARGET.test(label.trim()))
    return [{ kind: 'cite', sourceId: id, n: s.cites.n(id) }]
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
  const end = targetEnd(s, close + 2)
  if (end < 0) return null
  const label = s.src.slice(open + 1, close)
  const raw = s.src.slice(close + 2, end)
  if (image) return { inline: [{ kind: 'text', text: `[image: ${label || 'untitled'}]` }], next: end + 1 }
  const cited = citeLink(s, label, CITE_LINK.exec(raw)?.[1])
  if (cited) return { inline: cited, next: end + 1 }
  return linkTo(s, label, safeHref(raw.trim().split(/\s+/)[0] ?? ''), s.src.slice(close, end + 1), end + 1)
}

/** The first `>` after `i` in a scan's text, -1 when none; one pass for the whole scan, which asks in reading order. */
function closerAfter(s: Scan, i: number): number {
  if (s.gt === undefined || (s.gt !== -1 && s.gt <= i)) s.gt = s.src.indexOf('>', i + 1)
  return s.gt
}

/**
 * `<https://…>`: an autolink, with no `<` inside it (as in CommonMark). Any other `<…>` stays text. Each `<` looks no
 * further than the next one, so a run of them before one `>` is read once, not once per `<` (the address is parsed).
 * A span that opens with a scheme but holds a `<` is text up to its `>`, and cites nothing.
 */
function autolink(s: Scan, i: number): Step {
  const step = linkAt(s, i)
  if (step || !AUTOLINK_SCHEME.test(s.src.slice(i + 1, i + 8))) return step
  const end = closerAfter(s, i)
  return end < 0
    ? null
    : { inline: [{ kind: 'text', text: s.src.slice(i, end + 1).replace(/\n/g, ' ') }], next: end + 1 }
}

/** The autolink at `i`, if it is one. */
function linkAt(s: Scan, i: number): Step {
  const stop = s.src.indexOf('<', i + 1)
  const inside = s.src.slice(i + 1, stop < 0 ? s.src.length : stop).indexOf('>')
  if (inside < 0) return null
  const end = i + 1 + inside
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

/**
 * One line's (or one cell's) inline content. The spaces that end the text so far are counted as it grows: asking the
 * text at every line break reads all of it again, and one paragraph of short lines took seconds at the cap.
 */
function inlines(s: Scan): Inline[] {
  const out: Inline[] = []
  let text = ''
  let spaces = 0
  const add = (piece: string) => {
    text += piece
    spaces = piece === ' ' ? spaces + 1 : 0
  }
  const flush = () => {
    out.push(...citing(text, s.cites))
    text = ''
    spaces = 0
  }
  let i = 0
  while (i < s.src.length) {
    const c = s.src[i] ?? ''
    if (c === '\\' && i + 1 < s.src.length) {
      add(s.src[i + 1] ?? '')
      i += 2
      continue
    }
    if (c === '\n') {
      if (spaces < 2) add(' ')
      else {
        text = text.trimEnd()
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
    add(c)
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
  return (
    FENCE.test(line) ||
    headingOf(line, HEADING) !== null ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    itemOf(line) !== null
  )
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
  const m = itemOf(line)
  if (m) {
    const depth = depthOf(m.indent)
    // A top-level item of the other kind (a number after bullets) starts a new list.
    if (depth === 0 && (m.number !== undefined) !== ordered) return 'end'
    return { item: { depth, text: m.text } }
  }
  if (hasItem && !BLANK.test(line) && /^\s{2,}/.test(line)) return 'continue'
  if (BLANK.test(line) && itemOf(peek(l, 1) ?? '') !== null) return 'skip'
  return 'end'
}

function list(l: Lines, first: Item): Block {
  const ordered = first.number !== undefined
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
    start: ordered ? Number(first.number) : 1,
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
  const heading = headingOf(line, HEADING)
  if (heading && heading.text.trim() !== '') {
    l.at += 1
    const { level, text } = heading
    return {
      kind: 'heading',
      level,
      anchor: anchorOf(text),
      children: inlines({ src: text, cites: l.cites, depth: 0 }),
    }
  }
  if (RULE.test(line)) {
    l.at += 1
    return { kind: 'rule' }
  }
  if (QUOTE.test(line)) return quote(l)
  const item = itemOf(line)
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
  /** 1–6 for a heading, 0 for the text before the first one. */
  depth: number
  body: string
}

/** A section's heading opens as the service's does (0036 markdown_outline): its `#`s and the spaces after them. */
const SECTION_HEADING = /^\s{0,3}(#{1,6})\s+/

/** A Markdown text as sections, the way the service splits it for section facts (0036 markdown_outline). */
export function sectionsOf(text: string): Section[] {
  const out: Section[] = []
  let inFence = false
  let heading: string | null = null
  let depth = 0
  let body = ''
  const push = () => {
    if (heading !== null || body.trim() !== '') {
      out.push({
        heading,
        anchor: heading === null ? '' : anchorOf(heading),
        depth,
        body: body.replace(/\s+/g, ' ').trim(),
      })
    }
  }
  for (const line of text.split(/\r?\n/)) {
    if (/^\s{0,3}(```|~~~)/.test(line)) inFence = !inFence
    const m = inFence ? null : headingOf(line, SECTION_HEADING)
    if (m && m.text.trim() !== '') {
      push()
      heading = m.text.trim()
      depth = m.level
      body = ''
    } else {
      body += `${line}\n`
    }
  }
  push()
  return out
}

interface Placed extends Section {
  ord: number
  /** '' before the first heading, else '/' and the anchors of the headings it sits under (by level) and its own. */
  path: string
  /** Its occurrence on that path, from 1. */
  occ: number
}

/** Each section with its heading path and its occurrence on that path. */
function placed(text: string): Placed[] {
  const stack: Section[] = []
  const seen = new Map<string, number>()
  return sectionsOf(text).map((s, ord) => {
    if (s.heading !== null) {
      while ((stack.at(-1)?.depth ?? 0) >= s.depth) stack.pop()
      stack.push(s)
    }
    const path = s.heading === null ? '' : `/${stack.map((x) => x.anchor).join('/')}`
    const occ = (seen.get(path) ?? 0) + 1
    seen.set(path, occ)
    return { ...s, ord, path, occ }
  })
}

const nameOf = (s: Section) => `${s.heading === null}:${s.anchor}`

/** The path below the outermost heading ('' for that heading and the introduction): what a renamed title keeps. */
const subOf = (s: Placed) => s.path.replace(/^\/[^/]*/, '')

/** Pairs each newer section left unpaired with the first older one left unpaired that has the same key, in order. */
function pairInOrder(
  was: readonly Placed[],
  now: readonly Placed[],
  out: Map<number, Placed>,
  key: (s: Placed) => string,
) {
  const used = new Set([...out.values()].map((o) => o.ord))
  const rest = new Map<string, Placed[]>()
  for (const o of was) {
    const k = key(o)
    if (used.has(o.ord) || k === '') continue
    const queue = rest.get(k)
    if (queue) queue.push(o)
    else rest.set(k, [o])
  }
  for (const n of now) {
    const o = out.has(n.ord) || key(n) === '' ? undefined : rest.get(key(n))?.shift()
    if (o) out.set(n.ord, o)
  }
}

/**
 * Each newer section's pair in the older text: the same path and occurrence; then what is left on the path below the
 * title, in order (a renamed title); then by anchor, in order (a renamed parent).
 */
function pairs(was: readonly Placed[], now: readonly Placed[]): Map<number, Placed> {
  const exact = new Map(was.map((o) => [`${o.path}#${o.occ}`, o]))
  const out = new Map<number, Placed>()
  for (const n of now) {
    const o = exact.get(`${n.path}#${n.occ}`)
    if (o) out.set(n.ord, o)
  }
  pairInOrder(was, now, out, subOf)
  pairInOrder(was, now, out, nameOf)
  return out
}

const CONCLUSION = /(conclusion|recommendation)/

const sectionName = (s: Section) => s.heading ?? '(introduction)'

/**
 * What changed between two versions, by section: the comparison Knowledge shows (computed here, never stored), paired
 * as the service pairs them for a version's facts (0036 section_facts), each section at most once.
 */
export function compareSections(older: string, newer: string): SectionChange {
  const was = placed(older)
  const now = placed(newer)
  const paired = pairs(was, now)
  const kept = new Set([...paired.values()].map((o) => o.ord))
  const change = (s: Placed) => {
    const old = paired.get(s.ord)
    if (!old) return 'added'
    return old.body === s.body ? 'unchanged' : 'revised'
  }
  const pick = (kind: string) => now.filter((s) => change(s) === kind).map(sectionName)
  const gone = was.filter((s) => !kept.has(s.ord))
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
