// Lengths as the API and the database count them: in characters (code points), so an emoji is one, not the two
// UTF-16 units `length` sees, nor the units a field's `maxLength` counts.

/** A text's length in characters. */
export const lengthOf = (text: string) => text.length - (text.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0)

/** The text cut to the most characters a field holds, never splitting one. */
export function clip(text: string, most: number): string {
  let count = 0
  let end = 0
  for (const character of text) {
    if (count === most) return text.slice(0, end)
    count += 1
    end += character.length
  }
  return text
}

const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff

/** Where `previous` and `next` first differ, from the start, never inside a character. */
function sameStart(previous: string, next: string): number {
  let at = 0
  while (at < previous.length && at < next.length && previous[at] === next[at]) at += 1
  return at > 0 && isLow(next.charCodeAt(at)) ? at - 1 : at
}

/** How much `previous` and `next` share at their ends (after `start`), never inside a character. */
function sameEnd(previous: string, next: string, start: number): number {
  let n = 0
  const room = Math.min(previous.length, next.length) - start
  while (n < room && previous[previous.length - 1 - n] === next[next.length - 1 - n]) n += 1
  return n > 0 && isLow(next.charCodeAt(next.length - n)) ? n - 1 : n
}

/**
 * A field's next value, held to its most characters as maxLength held it: what fits is taken; a change that would
 * pass the most keeps what was there and as much of what was put in as fits (nothing already written is lost); and a
 * deletion is always taken (a prefill already past the most can shrink).
 */
export function capped(previous: string, next: string, most: number): string {
  const length = lengthOf(next)
  if (length <= most || length <= lengthOf(previous)) return next
  const start = sameStart(previous, next)
  const end = sameEnd(previous, next, start)
  const head = next.slice(0, start)
  const tail = next.slice(next.length - end)
  const room = most - lengthOf(head) - lengthOf(tail)
  return room > 0 ? head + clip(next.slice(start, next.length - end), room) + tail : previous
}
