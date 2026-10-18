// What finding in the conversation sees (personal-moments.md §3): the turns' words, a match wherever the query stands,
// whatever its case or accents, as the notes' own search (find-accents.md, places-view.ts).
import { foldCharacter as plainOf } from '../../app/search-fold.ts'
import type { Row } from './conversation-view.ts'

/** Where a match stands: its turn's row, and which of that turn's matches it is. */
export interface Found {
  key: string
  n: number
}

/**
 * A text as finding compares it, folded one character at a time, and for each folded unit the span of the character it
 * came from, so a match cuts the words as written. A mark typed on its own folds to nothing and goes with the letter
 * before it.
 */
function folded(text: string): { units: string; starts: number[]; ends: number[] } {
  let units = ''
  const starts: number[] = []
  const ends: number[] = []
  let at = 0
  for (const character of text) {
    const end = at + character.length
    const plain = plainOf(character)
    if (plain === '' && ends.length > 0) ends[ends.length - 1] = end
    for (let i = 0; i < plain.length; i += 1) {
      starts.push(at)
      ends.push(end)
    }
    units += plain
    at = end
  }
  return { units, starts, ends }
}

/** A text cut into what matches the query (counted from 0), whatever its case or accents, and what doesn't. */
export function pieces(text: string, query: string): Array<{ text: string; n: number | null }> {
  // The query as written, never as a pattern: its brackets and dots are its own.
  const wanted = folded(query.trim()).units
  if (!wanted) return [{ text, n: null }]
  const { units, starts, ends } = folded(text)
  const out: Array<{ text: string; n: number | null }> = []
  let from = 0
  let n = 0
  for (let i = units.indexOf(wanted); i !== -1; i = units.indexOf(wanted, i + wanted.length)) {
    const start = starts[i] ?? text.length
    const end = ends[i + wanted.length - 1] ?? text.length
    // A hit inside what is already marked (a character whose decomposition repeats what is sought) is that match.
    if (start < from) continue
    if (start > from) out.push({ text: text.slice(from, start), n: null })
    out.push({ text: text.slice(start, end), n })
    n += 1
    from = end
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
