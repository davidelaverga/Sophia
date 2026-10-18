// How a search compares words (find-accents.md): whatever their case or accents, as Unicode folds them. A character is
// decomposed and its combining marks dropped, so a standalone ^ or ` stays as written; then its case is folded on its
// own, so ς is σ, ſ is s and ß is ss wherever they stand (Codex P2s on #406). Casing can bring a mark back (İ), so the
// marks go again after it.

const unmarked = (text: string) => text.normalize('NFD').replace(/\p{Mn}/gu, '')

/** One character as a search compares it: it may fold to more than one (ß to ss), or to none (a mark on its own). */
export const foldCharacter = (character: string) => unmarked(unmarked(character).toUpperCase().toLowerCase())

/** A text as a search compares it, one character at a time. */
export function foldForSearch(text: string): string {
  let folded = ''
  for (const character of text) folded += foldCharacter(character)
  return folded
}
