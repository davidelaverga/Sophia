// Citations as the viewer shows them (html-report-v2's reading grammar, SPEC §4b): how each is named and marked, in the
// report's own language, and how a run of text is cut so that a citation never starts a line. MarkdownView renders what
// this returns. A citation is a button, and a button lays out as one solid box: a line may break before it even with no
// space between, so dropping the space is not enough. The word before a citation and the citation go together in one
// piece the viewer sets without a break (`cite-bound`); citations with only spaces between them are one group, shown
// with commas, also across the end of bold or emphasis. A link or inline code is never split: it goes whole with the
// citation after it (M75: otherwise the citation could start a line). Inside the piece everything but the word's last
// character wraps as text does (`lastGrapheme`, MarkdownView's `cite-wrap`); only that character and the numbers stay
// together, so no bound piece is wider than the column (M75-RF-0005). Not bound: a citation after bold or emphasis
// that ends in a space.
import type { ReportSource } from '@sophia/contracts'
import type { Inline } from './markdown.ts'

export type Cite = Extract<Inline, { kind: 'cite' }>

/** How little of a source was read, when that weakens a citation of it: in part, as a search snippet, or not at all. */
export type Weakness = 'part' | 'snippet' | 'unread'

/**
 * A cited source's weakness, from its provenance (as the Sources tab says it, `sourceWords`): none for a page read in
 * full or the project's own input, and none while the version's sources are not read yet.
 */
export function weaknessOf(source: Pick<ReportSource, 'kind' | 'coverage'> | undefined): Weakness | null {
  if (!source || source.kind === 'input') return null
  if (source.kind === 'search_results') return 'snippet'
  if (source.coverage === 'complete') return null
  return source.coverage === 'partial' ? 'part' : 'unread'
}

/** The page's own words for a citation (html-report-v2 §1.6): English, Italian and Spanish. */
const WORDS = {
  en: { source: 'Source', part: 'read in part', snippet: 'snippet only', unread: 'not read' },
  it: { source: 'Fonte', part: 'letta in parte', snippet: 'solo anteprima', unread: 'non letta' },
  es: { source: 'Fuente', part: 'leída en parte', snippet: 'solo fragmento', unread: 'no leída' },
} as const

/** A citation's name in the report's language, English when it is none of the three: "Source 3, read in part". */
export function citeLabel(n: number, weakness: Weakness | null, language: string): string {
  const w = language === 'it' || language === 'es' ? WORDS[language] : WORDS.en
  return weakness ? `${w.source} ${String(n)}, ${w[weakness]}` : `${w.source} ${String(n)}`
}

/** Citations with nothing but spaces between them, and the end of the text before them, kept on one line. */
export interface Bound {
  kind: 'bound'
  /** The last word before the citations (bold or emphasis kept), or nothing: after a link, code or no text. */
  word: Inline[]
  cites: Cite[]
}

/** A node that is not a citation. */
type Plain = Exclude<Inline, Cite>

/** A run as the viewer sets it: its nodes as parsed, every citation in a bound group. */
export type Piece = Plain | Bound

/**
 * At most this many characters go with a citation onto its line, so a long address before one still wraps. With a
 * group's first numbers (KEPT_WITH_WORD) they measure 241 px in the reading fixture's address (17 px type), inside a
 * 320 px phone's 272 px column. Binding a word adds no break before the piece; it only takes away the one before the
 * citation. Inside the piece all but the word's last character may still wrap (MarkdownView's BoundWord, M75-RF-0005),
 * so neither a long word nor a link or code span bound whole (M75) makes a piece wider than the column.
 */
const MOST_BOUND = 24

/**
 * How many numbers of a group stay on the line of the word before them; past them, a group may wrap after a comma.
 * Kept whole, a group after a 24-character word ran past a 390 px phone's column from 11 numbers (at 320 px, from 7).
 */
export const KEPT_WITH_WORD = 3

/** Letters a line may break between with no space (Chinese, Japanese, Korean): a word there is one letter long. */
const BREAKS_BETWEEN = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u

/** A run with its citations bound to the word before them, and the spaces before each citation dropped. */
export function bindCites(run: readonly Inline[]): Piece[] {
  const out: Piece[] = []
  for (const node of liftCites(run)) {
    if (node.kind !== 'cite') {
      out.push(node)
      continue
    }
    trimEnd(out)
    const last = out.at(-1)
    if (last?.kind === 'bound') last.cites.push(node)
    else out.push({ kind: 'bound', word: takeWord(out), cites: [node] })
  }
  return out
}

type Mark = Extract<Inline, { kind: 'strong' | 'em' }>

/**
 * A run with the citations that end bold or emphasis moved out after it: "**claim [A]** [B]" binds as "**claim** [A]
 * [B]", one group, where the citation inside would have been a group of its own beside the next, with nothing between
 * the numbers. A numeral sets its own weight and style, so nothing else changes on screen.
 */
function liftCites(run: readonly Inline[]): Inline[] {
  return run.flatMap((node) => (node.kind === 'strong' || node.kind === 'em' ? liftFrom(node) : [node]))
}

function liftFrom(mark: Mark): Inline[] {
  const children = liftCites(mark.children)
  const at = trailingCites(children)
  if (at === children.length) return [{ ...mark, children }]
  const kept = children.slice(0, at)
  trimEnd(kept)
  return [...(kept.length > 0 ? [{ ...mark, children: kept }] : []), ...children.slice(at)]
}

/** Where the citations at the end of `children` start (spaces between them included), or its length when none. */
function trailingCites(children: readonly Inline[]): number {
  let at = children.length
  for (let k = children.length - 1; k >= 0; k--) {
    const node = children[k]
    if (node?.kind === 'cite') at = k
    else if (node?.kind !== 'text' || node.text.trim()) break
  }
  return at
}

/** Drops the spaces at the end of the text before a citation, and that text when it held nothing else. */
function trimEnd(out: (Inline | Piece)[]): void {
  for (let last = out.at(-1); last?.kind === 'text'; last = out.at(-1)) {
    const text = last.text.trimEnd()
    if (text) {
      out[out.length - 1] = { kind: 'text', text }
      return
    }
    out.pop()
  }
}

/** Takes the last word off the end of `out`, to go with the citation after it; nothing when it ends in no word. */
function takeWord(out: Piece[]): Inline[] {
  const last = out.at(-1)
  const split = last && last.kind !== 'bound' ? splitWord(last) : null
  if (!split) return []
  out.pop()
  if (split.rest) out.push(split.rest)
  return [split.word]
}

/** A node cut before its last word: what stays where it was, and the word that goes with the citation. */
interface Split {
  rest: Plain | null
  word: Plain
}

/** A node cut before its last word (inside bold or emphasis, the word keeps its mark); null when it ends in none. */
function splitWord(node: Plain): Split | null {
  if (node.kind === 'link' || node.kind === 'code') return { rest: null, word: node }
  if (node.kind === 'text') return splitText(node.text)
  return node.kind === 'strong' || node.kind === 'em' ? splitMarked(node) : null
}

function splitText(text: string): Split | null {
  const tail = /\S+$/u.exec(text)?.[0]
  if (!tail) return null
  const word = boundPart(tail)
  const rest = text.slice(0, text.length - word.length)
  return { rest: rest ? { kind: 'text', text: rest } : null, word: { kind: 'text', text: word } }
}

function splitMarked(node: Mark): Split | null {
  const inner = node.children.at(-1)
  const split = inner && inner.kind !== 'cite' ? splitWord(inner) : null
  if (!split) return null
  const kept = [...node.children.slice(0, -1), ...(split.rest ? [split.rest] : [])]
  return { rest: kept.length > 0 ? { ...node, children: kept } : null, word: { ...node, children: [split.word] } }
}

/**
 * The end of a word that goes with a citation: at most MOST_BOUND characters, and from the last letter a line may break
 * before with no space ("…境内处理" binds "理"). Twenty-four of those would be over 400 px, wider than a phone's column.
 */
function boundPart(tail: string): string {
  const chars = Array.from(tail)
  const from = Math.max(
    chars.findLastIndex((c) => BREAKS_BETWEEN.test(c)),
    chars.length - MOST_BOUND,
    0,
  )
  return chars.slice(from).join('')
}

/** The grapheme segmenter, made on first use; null where the browser has none. Made when the module loaded, it stopped
 * the Studio from loading at all in Firefox before 125, which has no Intl.Segmenter (report-view.ts avoids it too). */
let graphemes: Intl.Segmenter | null | undefined

function segmenter(): Intl.Segmenter | null {
  if (graphemes === undefined) {
    // Firefox before 125 has no Intl.Segmenter, whatever the types say.
    graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
  }
  return graphemes
}

/**
 * A bound word's text cut before its last character as a reader sees one (an emoji with its joiners, a letter with its
 * marks): the lead may wrap, the last stays on the citation's line. Measured in Chromium at every width from 120 to
 * 420 px, a break never fell between that character and the citation, where a word joiner did not hold one. Without a
 * segmenter it cuts before the last code point: a line never breaks before a joiner's partner or a mark anyway.
 */
export function lastGrapheme(text: string, by: Intl.Segmenter | null = segmenter()): [lead: string, last: string] {
  const last = (by ? Array.from(by.segment(text)).at(-1)?.segment : Array.from(text).at(-1)) ?? ''
  return [text.slice(0, text.length - last.length), last]
}

/**
 * Fewer visible characters than these between two targets (citation groups or links) may be narrower than their 4 px
 * reaches need, counted at the narrowest glyph the reading fonts have (an apostrophe, about 0.19em of 17 px): the
 * sides that face each other stop at their numerals (M75-RF-0004). The page keeps its own room by the same count
 * (`roomed` in report-page.ts).
 */
const ROOM = 3

/** What lies between targets, in reading order: a visible character, white space, a target, or a line break. */
export type Between = 1 | 'space' | 'target' | 'break'

/**
 * Characters that count as room, as `roomed` counts them: a letter, digit, punctuation, symbol or no-break space. A
 * combining mark, a format character and a narrow space (thin, hair, zero width) count nothing.
 */
const COUNTED = /[\p{L}\p{N}\p{P}\p{S}\u00a0]/u
/** White space a line box collapses to one space, across the end of one node and the start of the next too. */
const COLLAPSED = /[ \t\n\r]/

function steps(text: string): Between[] {
  return Array.from(text).flatMap((ch): Between[] => (COLLAPSED.test(ch) ? ['space'] : COUNTED.test(ch) ? [1] : []))
}

/** A piece as what it puts between targets: a link and a citation are targets, a word's text is characters. */
function between(node: Piece | Inline): Between[] {
  if (node.kind === 'text' || node.kind === 'code') return steps(node.text)
  if (node.kind === 'strong' || node.kind === 'em') return node.children.flatMap(between)
  if (node.kind === 'bound') return [...node.word.flatMap(between), 'target']
  return node.kind === 'break' ? ['break'] : ['target']
}

/** The visible characters before the first target, a run of white space as one: Infinity at a break, or with none. */
function roomIn(run: Iterable<Between>): number {
  let n = 0
  let blank = false
  for (const step of run) {
    if (step === 'break') return Infinity
    if (step === 'target') return n
    if (step === 1 || !blank) n += 1
    blank = step === 'space'
  }
  return Infinity
}

/**
 * What lies beyond a run on each side, read outwards, for a run inside bold or emphasis: its enclosing run's pieces,
 * and theirs. A run of a whole block has nothing beyond it.
 */
export interface Around {
  before: () => Iterable<Between>
  after: () => Iterable<Between>
}

export const NOTHING_AROUND: Around = { before: () => [], after: () => [] }

/** What follows piece `i` in reading order, then beyond the run, read only as far as it is asked for. */
function* after(pieces: readonly Piece[], i: number, outer: Around): Generator<Between> {
  for (let k = i + 1; k < pieces.length; k++) yield* between(pieces[k] ?? { kind: 'break' })
  yield* outer.after()
}

/** What precedes piece `i` (from `word` backwards, then its siblings), then beyond the run, read only as asked. */
function* before(pieces: readonly Piece[], i: number, word: readonly Inline[], outer: Around): Generator<Between> {
  yield* word.flatMap(between).toReversed()
  for (let k = i - 1; k >= 0; k--) yield* between(pieces[k] ?? { kind: 'break' }).toReversed()
  yield* outer.before()
}

/** The surroundings of the run inside piece `k` (bold or emphasis): `k`'s siblings, then what lies beyond them. */
export const around = (pieces: readonly Piece[], k: number, outer: Around): Around => ({
  before: () => before(pieces, k, [], outer),
  after: () => after(pieces, k, outer),
})

/**
 * Where the touch targets of group `i` must stop at their numerals (M75-RF-0001, RF-0004): before its first number
 * when no word is bound to it, or fewer than ROOM characters lie between it and the target before (its word a link
 * included); after its last when fewer than ROOM lie before the next target (a link, or the next group's number),
 * reading past the end of bold or emphasis (`outer`). Elsewhere a target reaches into the words beside it, which take
 * no press. Each side reads only to its nearest target, so a paragraph's groups cost what its length does.
 */
export function flushSides(
  pieces: readonly Piece[],
  i: number,
  outer: Around = NOTHING_AROUND,
): { start: boolean; end: boolean } {
  const piece = pieces[i]
  if (piece?.kind !== 'bound') return { start: false, end: false }
  return {
    start: piece.word.length === 0 || roomIn(before(pieces, i, piece.word, outer)) < ROOM,
    end: roomIn(after(pieces, i, outer)) < ROOM,
  }
}
