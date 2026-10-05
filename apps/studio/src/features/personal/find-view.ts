// What finding in the conversation sees (personal-moments.md §3): the turns' words, a match wherever the query stands,
// whatever its case.
import type { Row } from './conversation-view.ts'

/** Where a match stands: its turn's row, and which of that turn's matches it is. */
export interface Found {
  key: string
  n: number
}

/** A query as written, never as a pattern: its brackets and dots are its own. */
const literal = (query: string) => new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')

/** A text cut into what matches the query (counted from 0), whatever its case, and what doesn't. */
export function pieces(text: string, query: string): Array<{ text: string; n: number | null }> {
  const q = query.trim()
  if (!q) return [{ text, n: null }]
  const out: Array<{ text: string; n: number | null }> = []
  let from = 0
  let n = 0
  for (const match of text.matchAll(literal(q))) {
    if (match.index > from) out.push({ text: text.slice(from, match.index), n: null })
    out.push({ text: match[0], n })
    n += 1
    from = match.index + match[0].length
  }
  if (from < text.length || !out.length) out.push({ text: text.slice(from), n: null })
  return out
}

/** Every match in the conversation's turns, in reading order. */
export function foundIn(rows: readonly Row[], query: string): Found[] {
  return rows.flatMap((r) =>
    r.kind === 'turn' ? pieces(r.text, query).flatMap((p) => (p.n === null ? [] : [{ key: r.key, n: p.n }])) : [],
  )
}
