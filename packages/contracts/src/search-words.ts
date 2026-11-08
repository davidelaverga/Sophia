// The words a search reads: one rule for the API's queries and the Studio's own search
// (docs/plans/search-words-like-the-api.md).

/**
 * A word: a run of letters and digits. Global, so it keeps `lastIndex` between calls: use it with `match` or
 * `matchAll` (which start afresh), never `test` or `exec`.
 */
export const SEARCH_WORD = /[\p{L}\p{N}]+/gu

/** A text's words, lower case, every one. */
export const textWords = (text: string | null): string[] => (text ?? '').toLowerCase().match(SEARCH_WORD) ?? []

/** The words a search keeps: letters and digits only, lower case, the first 8. */
export const searchWords = (text: string | null): string[] => textWords(text).slice(0, 8)
