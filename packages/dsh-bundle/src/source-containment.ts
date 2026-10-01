/**
 * Prompt-injection containment for retrieved text (SMC-M03 S3, plan §2.6):
 * - `envelope()`: retrieved text reaches the model only inside a delimited data envelope that names its source; the
 *   text cannot close the envelope or open another one.
 * - `guardQuery()`: the facade refuses a search query that would carry private material out (`disclosure_denied`):
 *   a verbatim run of words from a private manifest source, a roster member's email or full name, or a secret-like
 *   string. A page that tells the model to search for private text is stopped here, whatever the model does.
 * - `page()`: a passage is at most 6,000 characters, paging continues past 4,096, and truncation is always declared.
 * @module @sophia/dsh-bundle/source-containment
 */

export const ENVELOPE_TAG = 'sophia-source'
/** The longest passage one read or page returns inline. */
export const PASSAGE_CHARS = 6000

export interface EnvelopeInput {
  /** Sophia's id for the source (a search result, a read capture or an admitted input). */
  readonly sourceId: string
  readonly kind: 'search_result' | 'web_page' | 'admitted_input'
  readonly url?: string | null
  readonly title?: string | null
  readonly coverage?: 'complete' | 'partial' | 'unsupported'
  readonly offset?: number
  readonly nextOffset?: number | null
  readonly limitations?: readonly string[]
  readonly text: string
}

const attribute = (value: string) =>
  value.replace(/[&"<>\n\r]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', '\n': ' ', '\r': ' ' })[c] ?? c)

/** Any opening or closing of the envelope tag inside retrieved text, neutralized. */
const neutralize = (text: string) => text.replace(new RegExp(`<(\\s*/?\\s*${ENVELOPE_TAG})`, 'gi'), '&lt;$1')

/**
 * Wrap retrieved text as data. The opening line names the source and states that the content is untrusted; the
 * metadata comes before the text, so nothing in the text can change it.
 */
export function envelope(input: EnvelopeInput): string {
  const attrs = [
    `id="${attribute(input.sourceId)}"`,
    `kind="${input.kind}"`,
    'trust="untrusted"',
    ...(input.coverage ? [`coverage="${input.coverage}"`] : []),
    ...(input.offset === undefined ? [] : [`offset="${input.offset}"`]),
    ...(input.nextOffset === undefined ? [] : [`next_offset="${input.nextOffset ?? 'none'}"`]),
  ]
  const meta = [
    ...(input.url ? [`url: ${attribute(input.url)}`] : []),
    ...(input.title ? [`title: ${attribute(input.title)}`] : []),
    ...(input.limitations ?? []).map((l) => `limitation: ${attribute(l)}`),
  ]
  return [`<${ENVELOPE_TAG} ${attrs.join(' ')}>`, ...meta, '---', neutralize(input.text), `</${ENVELOPE_TAG}>`].join('\n')
}

// --- query guard ---------------------------------------------------------------------------------------------

export interface RosterMember {
  readonly name: string
  readonly email?: string | null
}

export interface GuardContext {
  /** The text of the manifest's private (owner-scoped) sources. */
  readonly privateTexts: readonly string[]
  readonly roster: readonly RosterMember[]
}

export type GuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'disclosure_denied'; readonly reason: 'private_span' | 'roster' | 'secret' }

/** Words in a query that, run together, count as a verbatim span of a private source. */
export const SPAN_WORDS = 6

const words = (text: string) => text.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? []

const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\btvly-[A-Za-z0-9_-]{16,}/,
  /\bjina_[A-Za-z0-9]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
]

/** A long token mixing letters and digits, as keys and tokens do. */
function highEntropyToken(query: string): boolean {
  for (const token of query.match(/[A-Za-z0-9+/_=-]{32,}/g) ?? []) {
    if (/[A-Za-z]/.test(token) && /[0-9]/.test(token) && new Set(token).size >= 16) return true
  }
  return false
}

/** Build the guard once per attempt: the private spans are indexed, not rescanned per query. */
export function createQueryGuard(context: GuardContext): (query: string) => GuardResult {
  const spans = new Set<string>()
  for (const text of context.privateTexts) {
    const w = words(text)
    for (let i = 0; i + SPAN_WORDS <= w.length; i += 1) spans.add(w.slice(i, i + SPAN_WORDS).join(' '))
  }
  const emails = context.roster.map((m) => m.email?.trim().toLowerCase()).filter((e): e is string => !!e && e.includes('@'))
  // A single given name is too common to refuse on; a full name is not.
  const names = context.roster.map((m) => words(m.name)).filter((w) => w.length >= 2).map((w) => w.join(' '))

  return (query) => {
    if (SECRET_PATTERNS.some((p) => p.test(query)) || highEntropyToken(query)) {
      return { ok: false, code: 'disclosure_denied', reason: 'secret' }
    }
    const lower = query.toLowerCase()
    const joined = ` ${words(query).join(' ')} `
    if (emails.some((e) => lower.includes(e)) || names.some((n) => joined.includes(` ${n} `))) {
      return { ok: false, code: 'disclosure_denied', reason: 'roster' }
    }
    const q = words(query)
    for (let i = 0; i + SPAN_WORDS <= q.length; i += 1) {
      if (spans.has(q.slice(i, i + SPAN_WORDS).join(' '))) return { ok: false, code: 'disclosure_denied', reason: 'private_span' }
    }
    return { ok: true }
  }
}

// --- paging --------------------------------------------------------------------------------------------------

export interface Passage {
  readonly text: string
  readonly offset: number
  /** Where the next page starts, or null at the end. */
  readonly nextOffset: number | null
  readonly totalChars: number
  /** True when this passage does not reach the end of the text. */
  readonly truncated: boolean
}

/** One page of a stored text. It never splits a surrogate pair, so a page is always valid text. */
export function page(text: string, offset = 0, size = PASSAGE_CHARS): Passage {
  const start = Math.max(0, Math.min(Math.floor(offset), text.length))
  let end = Math.min(text.length, start + Math.max(1, Math.min(size, PASSAGE_CHARS)))
  if (end < text.length && /[\uD800-\uDBFF]/.test(text.charAt(end - 1))) end -= 1
  return { text: text.slice(start, end), offset: start, nextOffset: end < text.length ? end : null, totalChars: text.length, truncated: end < text.length }
}
