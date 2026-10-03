// Citations as the viewer shows them (html-report-v2's reading grammar, SPEC §4b): how each is named and marked, in the
// report's own language, and how a run of text is cut so that a citation never starts a line. MarkdownView renders what
// this returns. A citation is a button, and a button lays out as one solid box: a line may break before it even with no
// space between, so dropping the space is not enough. The word before a citation and the citation go together in one
// piece the viewer sets without a break (`cite-bound`); citations with only spaces between them are one group, shown
// with commas. Not bound: a citation right after a link or inline code (splitting either would split a link or a code
// span), or after bold or emphasis that ends in a space.
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
 * At most this many characters go with a citation onto its line, so a long address before one still wraps: with them
 * and a group of citations, it stays within the narrowest phone's column (320 px, 17 px type).
 */
const MOST_BOUND = 24

/** A run with its citations bound to the word before them, and the spaces before each citation dropped. */
export function bindCites(run: readonly Inline[]): Piece[] {
  const out: Piece[] = []
  for (const node of run) {
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

/** Drops the spaces at the end of the text before a citation, and that text when it held nothing else. */
function trimEnd(out: Piece[]): void {
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

/** A node cut before its last word (inside bold or emphasis, the word keeps its mark); null when it ends in none. */
function splitWord(node: Plain): { rest: Plain | null; word: Plain } | null {
  if (node.kind === 'text') {
    const tail = /\S+$/u.exec(node.text)?.[0]
    if (!tail) return null
    const word = Array.from(tail).slice(-MOST_BOUND).join('')
    const rest = node.text.slice(0, node.text.length - word.length)
    return { rest: rest ? { kind: 'text', text: rest } : null, word: { kind: 'text', text: word } }
  }
  if (node.kind !== 'strong' && node.kind !== 'em') return null
  const inner = node.children.at(-1)
  const split = inner && inner.kind !== 'cite' ? splitWord(inner) : null
  if (!split) return null
  const kept = [...node.children.slice(0, -1), ...(split.rest ? [split.rest] : [])]
  return { rest: kept.length > 0 ? { ...node, children: kept } : null, word: { ...node, children: [split.word] } }
}
