// A link to the exact passage of a version (docs/plans/room-passage-link.md). The link carries nothing of the report's
// text, not even a hash of it: only where the passage is (its block, its first word, how many words). A version's text
// never changes (it is content-addressed), so the place is enough; nothing in the address, the history or a request
// log can be tested against a guess of the words. Pure, so the link, its reading and the finding are unit-tested.
import { wordsOf } from '../voice/voice-trail.ts'
import { PASSAGE_PARAM, withReportLink } from './report-link.ts'

/** The blocks a passage is placed in, in document order: the same list where it is selected and where it is found. */
export const PASSAGE_BLOCKS = 'p, li, td, th, pre, blockquote, h2, h3, h4, h5, h6'

/** Past this many words a passage is placed by its first ones: enough to find it, short enough for any address. */
export const LOCATED_MAX_WORDS = 60

/** The last block a link can name (its number has at most four digits, readLocator). */
const LAST_BLOCK = 9999

/** Where a passage is: its block, its first word in that block, and how many words. */
export interface Locator {
  block: number
  word: number
  count: number
}

/**
 * The locator of a selection inside one block's text, from one offset to another: every word it touches, whole (a
 * selection begun or ended mid-word takes the word), at most LOCATED_MAX_WORDS; null when it touches none.
 */
export function locate(block: number, text: string, start: number, end: number): Locator | null {
  if (block > LAST_BLOCK) return null // past what a link can name: no Link, rather than one that finds nothing
  const words = wordsOf(text)
  const first = words.findIndex((w) => w.end > start)
  if (first < 0 || (words[first]?.start ?? end) >= end) return null
  const touched = words.slice(first).filter((w) => w.start < end)
  return { block, word: first, count: Math.min(touched.length, LOCATED_MAX_WORDS) }
}

export const locatorParam = (l: Locator): string => `${String(l.block)}.${String(l.word)}.${String(l.count)}`

/** The locator an address names, or null (none, or not one). */
export function readLocator(search: string): Locator | null {
  const m = /^(\d{1,4})\.(\d{1,5})\.(\d{1,3})$/.exec(new URLSearchParams(search).get(PASSAGE_PARAM) ?? '')
  if (!m?.[1] || !m[2] || !m[3]) return null
  const count = Number(m[3])
  return count > 0 && count <= LOCATED_MAX_WORDS ? { block: Number(m[1]), word: Number(m[2]), count } : null
}

/** Where the page is, as a link to it needs it. */
export interface Here {
  origin: string
  pathname: string
  search: string
  hash: string
}

/** A link to the passage of that version, on this page: its other parameters and its hash kept. */
export function passageLink(here: Here, report: { artifactId: string; versionId: string }, at: Locator): string {
  const search = withReportLink(here.search, {
    artifactId: report.artifactId,
    versionId: report.versionId,
    size: 'side',
    format: 'markdown',
  })
  const q = new URLSearchParams(search)
  q.set(PASSAGE_PARAM, locatorParam(at))
  return `${here.origin}${here.pathname}?${q.toString()}${here.hash}`
}

/** A located run in a block's text: the block, and its offsets. */
export interface Located {
  block: number
  start: number
  end: number
}

/** The passage in the blocks' texts, at its place; null when the place isn't in this text (its words run out). */
export function findLocated(blocks: readonly string[], l: Locator): Located | null {
  const text = blocks[l.block]
  const run = text === undefined ? [] : wordsOf(text).slice(l.word, l.word + l.count)
  const first = run[0]
  const last = run.at(-1)
  return run.length === l.count && first && last ? { block: l.block, start: first.start, end: last.end } : null
}
