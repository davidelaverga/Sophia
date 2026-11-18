// The API's word rule for a text (A38): every word of the query begins a word of the text, in any order. Kept apart
// from search-view.ts, which reaches the API's client, so the fixtures can match as the API does without bringing the
// client and its validators into a page that must not load them (signed-in-later.spec.ts).
import { searchWords, textWords } from '@sophia/contracts/search-words'

/** Whether a text has every word: each one begins a word of it, in any order (the API's rule, A38). */
export const hasAll = (text: string, words: readonly string[]) => {
  const own = textWords(text)
  return words.every((w) => own.some((o) => o.startsWith(w)))
}

/** Whether a text has a word that one of the words begins. */
export const hasAny = (text: string, words: readonly string[]) => words.some((w) => hasAll(text, [w]))

/** Whether a text says what the query asks, by the API's rule: its words, each a beginning, all of them (A38). */
export const says = (text: string, query: string): boolean => {
  const words = searchWords(query)
  return words.length > 0 && hasAll(text, words)
}
