// A report's language, read from its own words (SMC-M03): the HTML page prints its template's words in it, and Studio's
// viewer names a citation in it. Kept apart from the page (report-page.ts) so the viewer can read it without loading
// the page's template and stylesheet, which load only when a page is printed. It guesses among English, Italian and
// Spanish only; anything else is `und`.

const STOPWORDS: readonly [string, ReadonlySet<string>][] = [
  ['en', new Set(['the', 'and', 'of', 'to', 'is', 'that', 'with', 'are', 'this', 'for', 'from', 'which'])],
  ['it', new Set(['il', 'della', 'che', 'gli', 'delle', 'nel', 'sono', 'anche', 'questo', 'degli', 'alla', 'per'])],
  ['es', new Set(['el', 'los', 'las', 'que', 'para', 'por', 'como', 'más', 'está', 'también', 'este', 'son'])],
]

/**
 * The report's language, from its own words: English, Italian or Spanish when one clearly leads (at least 8 of its
 * common words, twice the next), else `und` (the template's words are then English).
 */
export function reportLanguage(markdown: string): string {
  const counts = new Map(STOPWORDS.map(([lang]) => [lang, 0]))
  for (const word of markdown.toLowerCase().match(/\p{L}+/gu) ?? []) {
    for (const [lang, words] of STOPWORDS) if (words.has(word)) counts.set(lang, (counts.get(lang) ?? 0) + 1)
  }
  const [first, second] = [...counts].toSorted((a, b) => b[1] - a[1])
  return first && first[1] >= 8 && first[1] >= 2 * (second?.[1] ?? 0) ? first[0] : 'und'
}
