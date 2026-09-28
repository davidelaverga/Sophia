// Paging exact source text for read_selected_source (M01 §7, case T13). Pure. A page is a slice of whole Unicode code
// points with its locator; a slice that is not the whole text says `partial` and carries the cursor for the next one,
// so nothing downstream can mistake a prefix for the source.

/** Code points per page: long enough for a note or a proposal, short enough for a spoken turn's context. */
export const PAGE_CODE_POINTS = 3000

export interface SourcePage {
  text: string
  locator: { start: number; end: number; total: number }
  coverage: 'complete' | 'partial'
  nextCursor: string | null
}

const CURSOR = /^cp:(0|[1-9][0-9]{0,8})$/

/** The start offset a cursor names, 0 for none, or null when it is not one this module issued. */
export function cursorOffset(cursor: unknown): number | null {
  if (cursor === undefined || cursor === null) return 0
  if (typeof cursor !== 'string') return null
  const match = CURSOR.exec(cursor)
  return match?.[1] === undefined ? null : Number(match[1])
}

/** One page of `text` from `start`. A start past the end is an empty, complete page at the end. */
export function pageOf(text: string, start: number, size = PAGE_CODE_POINTS): SourcePage {
  const points = Array.from(text)
  const total = points.length
  const from = Math.min(start, total)
  const end = Math.min(from + size, total)
  const whole = from === 0 && end === total
  return {
    text: points.slice(from, end).join(''),
    locator: { start: from, end, total },
    coverage: whole ? 'complete' : 'partial',
    nextCursor: end < total ? `cp:${String(end)}` : null,
  }
}
