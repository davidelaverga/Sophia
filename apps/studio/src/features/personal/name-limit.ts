// A name's limit, said before it is reached (docs/plans/words-whole.md): a project's title holds 180 characters as the
// API counts them (characters.ts). The count shows as it comes near, and a paste cut at the limit says so, instead of
// losing its end in silence.
import { lengthOf } from './characters.ts'

/** How near the limit the count shows: the last 20 characters. */
export const NEAR = 20

/** «172 / 180» once the name is within `NEAR` of the most it holds; null before. */
export function nameCount(text: string, most: number): string | null {
  const length = lengthOf(text)
  return length >= most - NEAR ? `${String(length)} / ${String(most)}` : null
}

/** Said when what was put in didn't all fit: what was kept, and why. */
export const cutWords = (most: number): string => `Only the first ${String(most)} characters fit.`
