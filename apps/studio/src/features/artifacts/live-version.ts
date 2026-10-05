// A report's next version arriving while it is open (docs/plans/room-live-version.md): what the offer says, which
// headings are marked once it is shown, and which heading keeps its place. Pure, so the rules are unit-tested.
import type { ArtifactVersion } from '@sophia/contracts'
import { anchorOf, type Block, type ParsedReport, type SectionChange } from './markdown.ts'

type Offered = Pick<ArtifactVersion, 'versionNumber' | 'parentId' | 'changeFacts'>

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`

/**
 * The offer's words: how much changed, from the facts the service computed at publication, when the current version
 * replaced the one on screen; otherwise which version is current, as before.
 */
export function offerWords(current: Offered, shownId: string): string {
  const name = current.versionNumber ? `v${String(current.versionNumber)}` : null
  if (!name) return 'This is not the current version.'
  const sections = current.changeFacts?.sections
  if (current.parentId !== shownId || !sections || current.changeFacts?.renditionOnly) {
    return `${name} is the current version.`
  }
  // A section removed has no heading left to mark: it is counted on its own.
  const changed = sections.added.length + sections.revised.length
  const removed = sections.removed.length
  const said = [
    changed > 0 ? `${plural(changed, 'section', 'sections')} changed` : null,
    removed > 0
      ? changed > 0
        ? `${String(removed)} removed`
        : `${plural(removed, 'section', 'sections')} removed`
      : null,
  ].filter((part) => part !== null)
  return said.length === 0 ? `${name} is here · the same sections.` : `${name} is here · ${said.join(', ')}.`
}

export type Mark = 'New' | 'Changed'

/** compareSections' name for the text before the first heading, which has no heading to mark. */
const INTRODUCTION = '(introduction)'

/** How many headings of the report carry each anchor, wherever they are (a quote's too). */
function anchorCounts(blocks: readonly Block[], counts = new Map<string, number>()): Map<string, number> {
  for (const b of blocks) {
    if (b.kind === 'heading') counts.set(b.anchor, (counts.get(b.anchor) ?? 0) + 1)
    if (b.kind === 'quote') anchorCounts(b.blocks, counts)
  }
  return counts
}

/**
 * The headings marked, by anchor: a section added, or revised, since the version that was on screen. A name the
 * report repeats, or one with no letter or digit, can't say which heading it is, so none of them is marked.
 */
export function marksOf(
  change: Pick<SectionChange, 'added' | 'revised'>,
  report: Pick<ParsedReport, 'blocks'>,
): ReadonlyMap<string, Mark> {
  const counts = anchorCounts(report.blocks)
  const headed = (names: readonly string[]) =>
    names
      .filter((name) => name !== INTRODUCTION)
      .map(anchorOf)
      .filter((anchor) => anchor !== '' && counts.get(anchor) === 1)
  const marks = new Map<string, Mark>()
  for (const anchor of headed(change.revised)) marks.set(anchor, 'Changed')
  for (const anchor of headed(change.added)) marks.set(anchor, 'New')
  return marks
}

/** A heading on screen: its anchor with its occurrence (`evidence#1` is the second), and its top against the reading area's. */
export interface Placed {
  anchor: string
  top: number
}

/** The headings in reading order, each anchor keyed by its occurrence, so a repeated name finds its own heading. */
export function placedHeadings(headings: readonly Placed[]): Placed[] {
  const seen = new Map<string, number>()
  return headings.map((h) => {
    const n = seen.get(h.anchor) ?? 0
    seen.set(h.anchor, n + 1)
    return { anchor: `${h.anchor}#${String(n)}`, top: h.top }
  })
}

/** The heading the reader is at: the last one at or above the reading area's top, or the first below it. */
export function headingAt(headings: readonly Placed[]): Placed | null {
  const above = headings.filter((h) => h.top <= 1)
  return above.at(-1) ?? headings[0] ?? null
}
