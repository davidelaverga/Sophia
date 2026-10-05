// A link to the exact passage of a version (docs/plans/room-passage-link.md). The link carries no words of the report:
// only where the passage is (its block, its first word, how many words) and a short hash of those words, so the
// address, the history and a server's request log hold nothing a reader couldn't see without access. Opened, the
// place is checked against the hash; if the text moved, the same words are looked for elsewhere. Pure, so the link,
// its reading and the finding are unit-tested.
import { wordsOf } from '../voice/voice-trail.ts'
import { PASSAGE_PARAM, withReportLink } from './report-link.ts'

/** The blocks a passage is placed in, in document order: the same list where it is selected and where it is found. */
export const PASSAGE_BLOCKS = 'p, li, td, th, pre, blockquote, h2, h3, h4, h5, h6'

/** Past this many words a passage is placed by its first ones: enough to find it, short enough for any address. */
export const LOCATED_MAX_WORDS = 60

/** The last block a link can name (its number has at most four digits, readLocator). */
const LAST_BLOCK = 9999

/** Where a passage is: its block, its first word in that block, how many words, and their hash. */
export interface Locator {
  block: number
  word: number
  count: number
  hash: string
}

/** A short hash of words as matching sees them (FNV-1a, 32 bits): it checks a place, it can't be read back. */
export function hashWords(keys: readonly string[]): string {
  let h = 0x811c9dc5
  for (const ch of keys.join(' ')) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
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
  const kept = touched.slice(0, LOCATED_MAX_WORDS)
  return { block, word: first, count: kept.length, hash: hashWords(kept.map((w) => w.key)) }
}

export const locatorParam = (l: Locator): string => `${String(l.block)}.${String(l.word)}.${String(l.count)}.${l.hash}`

/** The locator an address names, or null (none, or not one). */
export function readLocator(search: string): Locator | null {
  const m = /^(\d{1,4})\.(\d{1,5})\.(\d{1,3})\.([0-9a-f]{8})$/.exec(
    new URLSearchParams(search).get(PASSAGE_PARAM) ?? '',
  )
  if (!m?.[1] || !m[2] || !m[3] || !m[4]) return null
  const count = Number(m[3])
  return count > 0 ? { block: Number(m[1]), word: Number(m[2]), count, hash: m[4] } : null
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

/** The run of `count` words from `word` in a text, when their hash is the one asked for. */
function runAt(text: string, word: number, l: Locator): Omit<Located, 'block'> | null {
  const run = wordsOf(text).slice(word, word + l.count)
  const first = run[0]
  const last = run.at(-1)
  if (run.length !== l.count || !first || !last || hashWords(run.map((w) => w.key)) !== l.hash) return null
  return { start: first.start, end: last.end }
}

/** The passage in the blocks' texts: at its place when the words there are still its words, else wherever they are. */
export function findLocated(blocks: readonly string[], l: Locator): Located | null {
  const there = blocks[l.block]
  const at = there === undefined ? null : runAt(there, l.word, l)
  if (at) return { block: l.block, ...at }
  for (const [block, text] of blocks.entries()) {
    const words = wordsOf(text).length
    for (let word = 0; word + l.count <= words; word += 1) {
      const run = runAt(text, word, l)
      if (run) return { block, ...run }
    }
  }
  return null
}
