// What the guide is told of a research report's versions (CX-0027): computed by the service from the stored versions,
// never taken from the worker's notes (a version's change and kept notes are not read here). Pure. Headings are
// worker- or web-derived text, so they appear only as items of JSON arrays, at most HEADINGS per list and HEADING
// code points each, with a marker that would open a Sophia or Project turn neutralized; the service's own sentence
// carries counts only. Sections are compared as Studio and 0036 compare them (compareSections), recomputed from the
// texts rather than read from stored facts, whose 0027-era sections can show phantom revisions.
import type {
  ReportVersion,
  ReportVersionText,
  ResearchVersions,
  SectionCounts,
  TaskStanding,
} from '@sophia/persistence'
import { compareSections, parseMarkdown, sectionsOf, type Block, type SectionChange } from '@sophia/report/markdown'

/** At most this many headings in one list, each at most HEADING code points; the counts stay exact. */
export const HEADINGS = 12
export const HEADING = 80

/** What `text` is, said before it: the guide reads this first. */
export const WORKER_SUMMARY_ABOUT =
  'text is the research worker’s own summary as it submitted it: its claim, not the report, not checked against it. ' +
  'report is computed by Sophia’s service from the stored versions; where they differ, report is right.'

/** A heading as data: never a turn marker (the bridge's escapeMarkers rule), and cut to HEADING code points. */
export function headingText(heading: string): string {
  const safe = heading.replace(/\[(?=\s*(?:sophia|project)\b)/giu, '(')
  const points = Array.from(safe)
  return points.length <= HEADING ? safe : `${points.slice(0, HEADING - 1).join('')}…`
}

/** A list of headings with its exact count. */
const listOf = (names: readonly string[]) => ({
  count: names.length,
  headings: names.slice(0, HEADINGS).map(headingText),
})

const sectionLists = (change: SectionChange) => ({
  removed: listOf(change.removed),
  added: listOf(change.added),
  revised: listOf(change.revised),
  unchanged: listOf(change.unchanged),
})

/** Tables among blocks, a quoted one included. */
const countTables = (blocks: readonly Block[]): number =>
  blocks.reduce((n, b) => n + (b.kind === 'table' ? 1 : b.kind === 'quote' ? countTables(b.blocks) : 0), 0)

/** Tables in a text as Studio's parser reads it. */
const tablesIn = (text: string): number => countTables(parseMarkdown(text).blocks)

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`

/** The counts one version's facts are told by: sections against the version before, tables, citations. */
interface Counts {
  sections: SectionCounts | null
  tables: { before: number; after: number } | null
}

/** The comparison clause, counts only, or '' when nothing was compared. */
function comparison(previous: number, own: ReportVersion, counts: Counts): string {
  const parts: string[] = []
  const s = counts.sections
  if (s) {
    parts.push(
      `${plural(s.removed, 'section', 'sections')} removed, ${String(s.added)} added, ${String(s.revised)} revised, ${String(s.unchanged)} unchanged`,
    )
  }
  if (counts.tables) parts.push(`tables ${String(counts.tables.before)} → ${String(counts.tables.after)}`)
  if (own.cited !== null) {
    const moved =
      own.added === null || own.dropped === null ? '' : ` (${String(own.added)} added, ${String(own.dropped)} dropped)`
    parts.push(`${plural(own.cited, 'source', 'sources')} cited${moved}`)
  }
  return parts.length === 0 ? '' : ` Compared with version ${String(previous)}: ${parts.join('; ')}.`
}

/** Where the report stands against this task's version. */
function standingClause(own: ReportVersion | null, current: ReportVersion | null): string {
  if (!current) return ' The report has no version yet.'
  const n = String(current.versionNumber)
  const at = current.taskId === null ? `version ${n}` : `version ${n} (task ${current.taskId})`
  if (!own) return ` The report is at ${at}.`
  return own.id === current.id ? ' This is the latest version.' : ` Replaced: the report is now at ${at}.`
}

/** What this task's version is: none, the first, or the one that replaced an earlier version. */
function opening(own: ReportVersion | null, previous: ReportVersion | null): string {
  if (!own) return 'This task has published no version.'
  const n = String(own.versionNumber)
  if (previous) return `Version ${n} replaced version ${String(previous.versionNumber)}.`
  return own.cited === null
    ? `Version ${n} is the first version.`
    : `Version ${n} is the first version. It cites ${plural(own.cited, 'source', 'sources')}.`
}

/** One sentence of counts: what this task's version replaced, what changed, and whether it is the latest. */
export function changesOf(
  own: ReportVersion | null,
  previous: ReportVersion | null,
  current: ReportVersion | null,
  counts: Counts,
): string {
  const compared = own && previous ? comparison(previous.versionNumber, own, counts) : ''
  return `${opening(own, previous)}${compared}${standingClause(own, current)}`
}

const isLatest = (own: ReportVersion | null, current: ReportVersion | null) =>
  own !== null && current !== null && own.id === current.id

const textOf = (v: ReportVersionText | null): string | null => v?.text ?? null

/** Each text's table count, parsed once however many of the versions share it. */
function tableCounter() {
  const seen = new Map<string, number>()
  return (v: ReportVersionText | null): number | null => {
    const text = textOf(v)
    if (text === null) return null
    const known = seen.get(text) ?? tablesIn(text)
    seen.set(text, known)
    return known
  }
}

const headingsOf = (text: string) => sectionsOf(text).flatMap((s) => (s.heading === null ? [] : [s.heading]))

/** Both texts compared by section, or null when either is not there to read. */
const compared = (older: ReportVersionText | null, newer: ReportVersionText | null): SectionChange | null => {
  const [was, now] = [textOf(older), textOf(newer)]
  return was === null || now === null ? null : compareSections(was, now)
}

const countsOf = (change: SectionChange): SectionCounts => ({
  added: change.added.length,
  revised: change.revised.length,
  removed: change.removed.length,
  unchanged: change.unchanged.length,
})

/** Which versions these are, and whether this task's is the report's current one. */
const versionFields = ({ own, previous, current }: ResearchVersions) => ({
  version: own?.versionNumber ?? null,
  previousVersion: previous?.versionNumber ?? null,
  latest: isLatest(own, current),
  currentVersion: current?.versionNumber ?? null,
  currentTaskId: current?.taskId ?? null,
})

/**
 * read_selected_source's facts for a research task: its version, the one it replaced, the report's current content
 * version and how each compares, from the texts and the stored citation counts.
 */
export function reportOf(v: ResearchVersions) {
  const { own, previous, current, first } = v
  const change = compared(previous, own)
  const since = current?.versionNumber === 1 ? null : compared(first, current)
  const tables = tableCounter()
  const [before, after] = [tables(previous), tables(own)]
  const currentText = textOf(current)
  const counts: Counts = {
    sections: change && countsOf(change),
    tables: before === null || after === null ? null : { before, after },
  }
  return {
    computedBy: 'service',
    ...versionFields(v),
    changes: changesOf(own, previous, current, counts),
    sections: change && sectionLists(change),
    currentSections: currentText === null ? null : listOf(headingsOf(currentText)),
    sinceFirstVersion: since && sectionLists(since),
    tables: { thisVersion: after, previousVersion: before, currentVersion: tables(current) },
    citations: own && { cited: own.cited, added: own.added, dropped: own.dropped },
    rendition: { pdf: own?.pdf ?? false },
  }
}

/** project_status's facts for a research task's row: from the stored counts alone, no text is parsed. */
export function statusReportOf(s: TaskStanding) {
  const { published, previous, current } = s
  return {
    version: published?.versionNumber ?? null,
    latest: isLatest(published, current),
    currentVersion: current?.versionNumber ?? null,
    changes: changesOf(published, previous, current, { sections: published?.sections ?? null, tables: null }),
  }
}
