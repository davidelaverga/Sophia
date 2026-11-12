// A query as A38's queryOf refuses it (packages/persistence/src/search.ts), for the fixture search: what the API finds
// nothing for, and what it refuses (422), so the e2e meets the API's answers (search-words-like-the-api.md).
import { searchWords } from '@sophia/contracts/search-words'

/** As the API's LONGEST_WORD: a longer word is refused, never cut. */
const LONGEST_WORD = 64
/** As the API's SHORTEST_QUERY: fewer characters, once trimmed, search nothing. */
const SHORTEST_QUERY = 2

/** 'invalid' when a word is too long, 'nothing' when nothing is searched, null when the query is searched. */
export function queryRefusal(q: string): 'invalid' | 'nothing' | null {
  const typed = q.trim()
  const words = searchWords(typed)
  if (words.some((w) => Array.from(w).length > LONGEST_WORD)) return 'invalid'
  return Array.from(typed).length < SHORTEST_QUERY || words.length === 0 ? 'nothing' : null
}
