// Web addresses in a message (docs/plans/message-links.md): where each is, and the message cut into what is a link and
// what Find marks. Pure, so the rules are unit-tested; LinkedText.tsx renders them.

export interface LinkRange {
  start: number
  end: number
  href: string
}

const ADDRESS = /https?:\/\/[^\s<>"'`]+/gi
/** Punctuation that ends a sentence, not an address. */
const TRAILING = new Set(['.', ',', ';', ':', '!', '?', '"', "'"])
const CLOSES: Record<string, string> = { ')': '(', ']': '[' }

const count = (text: string, ch: string) => text.split(ch).length - 1

/** An address as written, its trailing punctuation left out, and a closing bracket kept only when it opened one. */
function trimmed(candidate: string): string {
  let end = candidate.length
  for (;;) {
    const last = candidate[end - 1] ?? ''
    const opens = CLOSES[last]
    const kept = candidate.slice(0, end)
    if (TRAILING.has(last) || (opens && count(kept, last) > count(kept, opens))) end -= 1
    else return kept
  }
}

/** A web address only: http or https with a host; anything else stays text. */
function webAddress(candidate: string): string | null {
  try {
    const url = new URL(candidate)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.host ? candidate : null
  } catch {
    return null
  }
}

/** Each web address in the text, in order. */
export function linksIn(text: string): LinkRange[] {
  const found: LinkRange[] = []
  for (const match of text.matchAll(ADDRESS)) {
    const address = webAddress(trimmed(match[0]))
    if (address) found.push({ start: match.index, end: match.index + address.length, href: address })
  }
  return found
}

/** A piece of the text as Find marks it: `n` the match's number, null for text between matches. */
export interface MarkPiece {
  text: string
  n: number | null
}

/** A run of the text: inside a link or not, marked by Find or not. */
export interface Span {
  text: string
  href: string | null
  n: number | null
}

/** The text cut at the links' and the marks' boundaries both: Find's numbers kept, an address never cut in two. */
export function spans(text: string, links: readonly LinkRange[], marks: readonly MarkPiece[]): Span[] {
  const out: Span[] = []
  let at = 0
  for (const mark of marks) {
    const end = at + mark.text.length
    let from = at
    while (from < end) {
      const link = links.find((l) => l.end > from && l.start < end)
      const inside = link && link.start <= from
      const to = inside ? Math.min(link.end, end) : Math.min(link ? link.start : end, end)
      out.push({ text: text.slice(from, to), href: inside ? link.href : null, n: mark.n })
      from = to
    }
    at = end
  }
  return out
}

/** Consecutive runs of one link together, so one anchor holds a whole address, marks and all. */
export function byLink(runs: readonly Span[]): { href: string | null; runs: Span[] }[] {
  const groups: { href: string | null; runs: Span[] }[] = []
  for (const run of runs) {
    const last = groups.at(-1)
    if (last && last.href === run.href) last.runs.push(run)
    else groups.push({ href: run.href, runs: [run] })
  }
  return groups
}
