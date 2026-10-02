// What a research task and its report say on screen (plan §2.8.2, §2.8.3, §2.9), kept out of React so they are
// tested: the card's state in words, its progress and spend, the file a version downloads as, the chips a version's
// change facts give, and how each cited source was retrieved. Every word here comes from a record, never a guess:
// a partial is never called a fallback, and an origin status the extractor did not report stays unknown.
import type {
  ArtifactVersion,
  NativeTask,
  NativeTaskDetail,
  ReportSource,
  ReportSummaryEdit,
  ResearchProgress,
  ResearchRendition,
} from '@sophia/contracts'
import type { Tone } from '@sophia/ui'

export type ResearchState =
  'starting' | 'researching' | 'ready' | 'partial' | 'not_produced' | 'replaced' | 'held' | 'stopped'

export interface StateWords {
  state: ResearchState
  label: string
  tone: Tone
  /** One line under the title, or null. */
  note: string | null
}

type Output = NonNullable<NonNullable<NativeTaskDetail['result']>['outputs']>[number]

const HELD: ReadonlySet<NativeTask['phase']> = new Set(['holding', 'held'])
const STOPPED: ReadonlySet<NativeTask['phase']> = new Set(['stopping', 'stopped'])
const STARTING: ReadonlySet<NativeTask['phase']> = new Set(['queued', 'dispatched'])

/** Why a task ended without a report, in the person's words: the blocker's own reason when there is one. */
function notProducedNote(reason: string | null): string {
  if (!reason) return 'No report was produced.'
  const blocked = /^blocked:\s*(.+)$/s.exec(reason)
  if (blocked?.[1]) return `Not produced: ${blocked[1]}`
  if (reason.startsWith('no_result_submitted')) return 'Not produced: the research ended without submitting a report.'
  return `Not produced (${reason}).`
}

const ENDED_BADLY: ReadonlySet<string> = new Set(['failed', 'outcome_unknown', 'denied'])

/** What the PDF of a partly delivered report is doing: rendering again, or why it is missing. */
type PdfNews = Pick<ResearchProgress, 'pdfReason' | 'pdfRendering'>

function partialNote({ pdfReason, pdfRendering }: PdfNews): string {
  if (pdfRendering) return 'The Markdown report is ready. The PDF is being rendered again.'
  return pdfReason
    ? `The Markdown report is ready. ${pdfReason.replace(/\.?$/, '.')}`
    : 'The Markdown report is ready; the PDF was not produced.'
}

/**
 * A delivered report: ready, or partly delivered when the PDF asked for is not among its outputs, with the reason the
 * service recorded when there is one, or that it is being rendered again.
 */
function delivered(formats: ReadonlySet<string>, asked: readonly ('markdown' | 'pdf')[], pdf: PdfNews): StateWords {
  return asked.includes('pdf') && !formats.has('pdf')
    ? { state: 'partial', label: 'Partly delivered', tone: 'amber', note: partialNote(pdf) }
    : { state: 'ready', label: 'Report ready', tone: 'teal', note: null }
}

/** A task with no report yet: replaced, held, stopped, ended without one, starting or at work. */
function undelivered(task: Pick<NativeTask, 'phase' | 'state' | 'reason'>): StateWords {
  if (task.reason?.startsWith('revoked:')) {
    const note = 'A source it read was withdrawn, so it stopped; the task continues without it.'
    return { state: 'replaced', label: 'Replaced', tone: 'muted', note }
  }
  if (HELD.has(task.phase)) {
    const label = task.phase === 'holding' ? 'Holding' : 'Held'
    return { state: 'held', label, tone: 'amber', note: 'Resume it from its goal above.' }
  }
  if (STOPPED.has(task.phase) || task.state === 'cancelled') {
    return { state: 'stopped', label: 'Stopped', tone: 'muted', note: null }
  }
  if (ENDED_BADLY.has(task.state) || ENDED_BADLY.has(task.phase)) {
    return { state: 'not_produced', label: 'Not produced', tone: 'rose', note: notProducedNote(task.reason) }
  }
  if (STARTING.has(task.phase)) {
    return { state: 'starting', label: 'Starting', tone: 'lav', note: 'Waiting for the research runtime.' }
  }
  return {
    state: 'researching',
    label: 'Researching',
    tone: 'lav',
    note: 'You can keep talking; the report arrives here.',
  }
}

/**
 * A research card's state: what the task's phase and its delivered outputs say. A Markdown report with the PDF asked
 * for and not delivered is "partly delivered", with that reason (or that it is rendering again), never a fallback.
 */
export function researchState(
  task: Pick<NativeTask, 'phase' | 'state' | 'reason'>,
  outputs: readonly Pick<Output, 'format'>[],
  asked: readonly ('markdown' | 'pdf')[],
  pdf: PdfNews = {},
): StateWords {
  const formats = new Set<string>(outputs.map((o) => o.format))
  return formats.has('markdown') ? delivered(formats, asked, pdf) : undelivered(task)
}

/** What "Try PDF again" answered: queued, or the report checks the printed version failed, in their own words. */
export function renditionWords(r: ResearchRendition): string {
  if (r.state === 'rejected') {
    const failed = (r.checks ?? []).filter((c) => c.outcome === 'failed').map((c) => c.detail ?? c.name)
    return `This report can’t be printed as a PDF: ${failed.join('; ') || 'it failed its checks'}.`
  }
  if (r.state === 'succeeded') return 'The PDF is ready.'
  if (r.state === 'failed' || r.state === 'cancelled')
    return `The PDF could not be produced again (${r.reason ?? r.state}).`
  return 'Rendering the PDF again. It appears here when it’s ready.'
}

/** Why "Try PDF again" was refused: no renderer, the attempts used up, a role that can’t ask, or the API's reason. */
export function renditionRefusal(error: { status: number; code: string; message: string }): string {
  if (error.code === 'native_capability_unavailable') return 'No PDF renderer is running right now. Try again later.'
  if (error.code === 'research_limit_reached') return 'The PDF was already tried three times for this version.'
  if (error.code === 'source_ineligible')
    return 'This report draws on a source that was withdrawn, so it isn’t printed again.'
  if (error.status === 403) return 'Your role can’t ask for the PDF.'
  return error.message
}

/** "$0.74": cents, never fractions of one. */
export const money = (usd: number): string => `$${(Math.round(usd * 100) / 100).toFixed(2)}`

/** "$0.74 of $5.00": what the task has drawn (spent, in flight or uncertain) against its allowance. */
export const spendText = (p: Pick<ResearchProgress, 'committedUsd' | 'capUsd'>): string =>
  `${money(p.committedUsd)} of ${money(p.capUsd)}`

/** "3 of 8 reads · 2 of 5 searches". */
export const progressText = (p: Pick<ResearchProgress, 'reads' | 'searches'>): string =>
  `${p.reads.used} of ${p.reads.max} reads · ${p.searches.used} of ${p.searches.max} searches`

/** How far the allowance has gone, 0 to 1, for the progress bar. */
export const progressRatio = (p: Pick<ResearchProgress, 'committedUsd' | 'capUsd'>): number =>
  p.capUsd <= 0 ? 0 : Math.min(1, Math.max(0, p.committedUsd / p.capUsd))

/** "6 min", "1 h 12 min", "under a minute": how long since the task was asked for. */
export function elapsedText(since: string, now: number): string {
  const minutes = Math.floor(Math.max(0, now - Date.parse(since)) / 60_000)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`
}

/** "812 B", "4.2 KB", "1.3 MB". */
export function formatBytes(n: number): string {
  if (n < 1000) return `${n} B`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)} KB`
  return `${(n / 1_000_000).toFixed(1)} MB`
}

const EXTENSION: Record<ArtifactVersion['format'], string> = {
  markdown: 'md',
  pdf: 'pdf',
  html: 'html',
  pptx: 'pptx',
  ui: 'json',
}

/** The file a version downloads as, the way the API names it (routes/sources.ts reportFilename). */
export function reportFilename(title: string, versionNumber: number | null, format: ArtifactVersion['format']): string {
  const slug =
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 80)
      .replace(/^-+|-+$/g, '') || 'report'
  return `${slug}${versionNumber === null ? '' : `-v${versionNumber}`}.${EXTENSION[format]}`
}

/** A short sha256 for a meta line: its first 8 characters. */
export const shortHash = (sha256: string): string => sha256.slice(0, 8)

/**
 * Whether the version a link names is missing from the report's versions. Only a list read again since the link named
 * it says so (`reread`; a link to the current version needs none): a cached list can predate the version (a notice's
 * new version, opened while an older list is still kept), and until it is read again the pane shows the version
 * loading, never "not available". A read paused offline is not a read.
 */
export const versionMissing = (
  versions: { isSuccess: boolean; fetchStatus: 'fetching' | 'paused' | 'idle' },
  found: boolean,
  reread: boolean,
): boolean => versions.isSuccess && versions.fetchStatus === 'idle' && reread && !found

/** The version to read the list again for: one the link names that the list lacks, and not read again for yet. */
export const rereadFor = (absent: boolean, reread: string | null, versionId: string | null): string | null =>
  absent && versionId !== null && reread !== versionId ? versionId : null

/**
 * The version to pin a report opened without one to (Knowledge, a link without `version`): the current version, once a
 * list read since the pane opened names it (a cached list can predate a newer one). Pinned, a version published while
 * the report is read never replaces it on screen (LFE-02.1 ART-02); the head offers the current one (currentOffer).
 */
export const pinTo = (
  versionId: string | null,
  versions: { data?: readonly { id: string }[] | undefined; fetchStatus: 'fetching' | 'paused' | 'idle' },
): string | null => (versionId === null && versions.fetchStatus === 'idle' ? (versions.data?.[0]?.id ?? null) : null)

/**
 * A read that failed with nothing to show. A read again in the background (the window's focus, a reconnect) that fails
 * keeps what was read: a readable report never turns into "not available" because a later read failed.
 */
export const failedOutright = (read: { isError: boolean; data?: unknown }): boolean =>
  read.isError && read.data === undefined

/** The API's refusals of a read this person may not make (their contract codes; `not_found` is a 422). */
const REFUSALS = new Set(['not_found', 'forbidden'])

/**
 * Why the version asked for cannot be shown once the read of the versions has failed: refused to this person, or a
 * read that failed (any other error), which is said with a way to read again, never left "loading" (M03-RF-0021).
 * Nothing is said while the read is under way or paused offline, or for a version the list read earlier holds (it
 * stays on screen); nor, for a version that list lacks, until the list has been read again for it (`settled`).
 */
export function versionReadFailure(
  versions: { isError: boolean; error: unknown; data?: unknown; fetchStatus: 'fetching' | 'paused' | 'idle' },
  found: boolean,
  settled: boolean,
): 'refused' | 'failed' | null {
  if (!versions.isError || versions.fetchStatus !== 'idle' || found) return null
  if (versions.data !== undefined && !settled) return null
  const { error } = versions
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null
  return typeof code === 'string' && REFUSALS.has(code) ? 'refused' : 'failed'
}

/**
 * Whether the focus is nobody's: nothing holds it, the page does, or what held it is gone (a button that went once
 * pressed). Only then is it handed on; a control the person moved to keeps it.
 */
export const focusFree = (at: { isConnected: boolean } | null, body: unknown): boolean =>
  at === null || at === body || !at.isConnected

/**
 * Knowledge's format filter is offered only once a report the reader can see has a PDF. While none has (no renderer
 * runs), "With PDF" could only come back empty. A filter already chosen stays, so it can be cleared.
 */
export const formatsOffered = (format: string, cards: readonly { formats: readonly string[] }[]): boolean =>
  format !== 'any' || cards.some((c) => c.formats.includes('pdf'))

/** The report's current version when another is on screen: the head names it and shows it on request. */
export function currentOffer<T extends { id: string }>(versions: readonly T[] | undefined, shown: T | undefined) {
  const current = versions?.[0]
  return current && shown && current.id !== shown.id ? current : null
}

/**
 * The PDF was asked for (a link with `format=pdf`, a notice's Open) but the version on screen has none: the pane shows
 * its Markdown and says so; its limitations say why the PDF is missing. Unknown until the version is read.
 */
export const pdfMissing = (format: 'markdown' | 'pdf', version: Pick<ArtifactVersion, 'renditions'> | undefined) =>
  format === 'pdf' && version !== undefined && (version.renditions?.length ?? 0) === 0

/**
 * Where the focus goes when the pane closes: back to what opened it while that is on screen, else to `fallback` (the
 * corner toggle of the side panel the opener sat in: opening a report closed that panel, so its button is out of
 * sight). Nowhere when the focus already went somewhere (`free` is false: the side panel opened in the pane's place).
 */
export function focusReturn<T>(
  free: boolean,
  opener: T | null,
  fallback: T | null,
  visible: (el: T) => boolean,
): T | null {
  if (!free) return null
  if (opener !== null && visible(opener)) return opener
  return fallback !== null && visible(fallback) ? fallback : null
}

/** An Esc the viewer may hear: already handled or not, held down, and whether a field or an open dialog keeps it. */
export interface EscapeAt {
  defaultPrevented: boolean
  /** The key held down: one press steps down once (full → side, never on to closed). */
  repeat: boolean
  /** In a field (input, textarea, select, editable text) or an open dialog, which keeps its own Esc. */
  owned: boolean
}

/**
 * Whether Esc steps the viewer down (full → side → closed): only in a project in sight (ShortcutScope: a project kept
 * out of sight for its call takes no keys, Esc included), with no modal sheet on screen, and when nothing else keeps it.
 */
export const escapeStepsDown = (at: EscapeAt, inSight: boolean, modal: boolean): boolean =>
  inSight && !modal && !at.defaultPrevented && !at.repeat && !at.owned

export interface Chip {
  label: string
  tone: Tone
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * The chips of a version's history entry, from the facts the service computed at publication (never from the notes):
 * sources added and dropped, sections added, revised and removed, a changed conclusion, and notes the service wrote.
 */
export function factChips(version: Pick<ArtifactVersion, 'changeFacts' | 'versionNumber'>): Chip[] {
  const f = version.changeFacts
  if (!f) return []
  if (version.versionNumber === 1) return [{ label: plural(f.cited, 'source', 'sources'), tone: 'muted' }]
  if (f.renditionOnly) return [{ label: 'PDF added', tone: 'teal' }]
  const chips: Chip[] = []
  if (f.added.length > 0) chips.push({ label: `+${plural(f.added.length, 'source', 'sources')}`, tone: 'teal' })
  if (f.dropped.length > 0) chips.push({ label: `−${plural(f.dropped.length, 'source', 'sources')}`, tone: 'rose' })
  const s = f.sections
  if (s) {
    if (s.added.length > 0)
      chips.push({ label: `${plural(s.added.length, 'section', 'sections')} added`, tone: 'teal' })
    if (s.revised.length > 0) chips.push({ label: `${s.revised.length} revised`, tone: 'lav' })
    if (s.removed.length > 0) chips.push({ label: `${s.removed.length} removed`, tone: 'rose' })
    if (s.conclusionChanged) chips.push({ label: 'Conclusion changed', tone: 'amber' })
  }
  if (f.notesFromFacts) chips.push({ label: 'Notes written from the facts', tone: 'muted' })
  return chips
}

export interface SourceWords {
  /** How much of it was read: "Read in full", "Read in part", "Snippet only", "Not read", "From the project". */
  coverage: string
  tone: Tone
  /** The retrieval route, or null for the project's own input. */
  route: string | null
  /** The origin's HTTP status in words; "unknown" when the extractor did not report it. */
  origin: string | null
}

/** The provenance of one cited source in words (plan §2.6): what was read, by which route, what is known. */
export function sourceWords(source: Pick<ReportSource, 'kind' | 'coverage' | 'originHttpStatus'>): SourceWords {
  if (source.kind === 'input') return { coverage: 'From the project', tone: 'muted', route: null, origin: null }
  if (source.kind === 'search_results') {
    return { coverage: 'Snippet only', tone: 'amber', route: 'Search results (Tavily)', origin: null }
  }
  const coverage =
    source.coverage === 'complete' ? 'Read in full' : source.coverage === 'partial' ? 'Read in part' : 'Not read'
  return {
    coverage,
    tone: source.coverage === 'complete' ? 'teal' : source.coverage === 'partial' ? 'lav' : 'rose',
    route: 'Page extraction (Jina)',
    origin: source.originHttpStatus === null ? 'Origin status unknown' : `Origin answered ${source.originHttpStatus}`,
  }
}

/** A URL's host, for a source row; the URL itself when it does not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** The project's filter on Knowledge: this project, or every project the reader is in. */
export type ProjectScope = 'this' | 'all'

/** A description being edited: its text, and the revision it began from. */
export interface SummaryDraft {
  text: string
  base: number
}

/**
 * A description edit as the API takes it: against the revision the editor saw when they began, never the one a later
 * read of the cards brought (the window's focus reads them again), which would overwrite a teammate's newer description
 * without a word.
 */
export const summaryEdit = (draft: SummaryDraft): ReportSummaryEdit => ({
  summary: draft.text.trim(),
  expectedRevision: draft.base,
})
