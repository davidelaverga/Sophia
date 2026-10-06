// The open report in the address bar (plan §2.8.4): `?report=<artifact>&version=<version>&view=full&format=pdf|html`
// deep-links the viewer and lets a member open it in a new tab. Only these parameters are ours; the router keeps them across a
// change of view in the same project (useProjectRoute) and drops them when the project changes.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ViewerTab = 'document' | 'sources' | 'history'
export type ViewerSize = 'side' | 'full'
/** What the Document tab shows: the report's Markdown, the version's PDF, or its designed HTML page (SDD-01). */
export type ViewerFormat = 'markdown' | 'pdf' | 'html'

export interface ReportLink {
  artifactId: string
  /** The version on screen; null for the report's current version. */
  versionId: string | null
  size: ViewerSize
  format: ViewerFormat
}

/** A passage of the version a link names (passage-link.ts): gone with any step of the viewer, as the others are. */
export const PASSAGE_PARAM = 'passage'

export const REPORT_PARAMS = ['report', 'version', 'view', 'format', PASSAGE_PARAM] as const

const formatOf = (value: string | null): ViewerFormat => (value === 'pdf' || value === 'html' ? value : 'markdown')

/** The report the address names, or null when it names none (or a malformed one). */
export function readReportLink(search: string): ReportLink | null {
  const q = new URLSearchParams(search)
  const artifactId = q.get('report')
  if (!artifactId || !UUID.test(artifactId)) return null
  const version = q.get('version')
  return {
    artifactId: artifactId.toLowerCase(),
    versionId: version && UUID.test(version) ? version.toLowerCase() : null,
    size: q.get('view') === 'full' ? 'full' : 'side',
    format: formatOf(q.get('format')),
  }
}

/** The search string with `link` in place of whatever report it named (none: the parameters are removed). */
export function withReportLink(search: string, link: ReportLink | null): string {
  const q = new URLSearchParams(search)
  for (const p of REPORT_PARAMS) q.delete(p)
  if (link) {
    q.set('report', link.artifactId)
    if (link.versionId) q.set('version', link.versionId)
    if (link.size === 'full') q.set('view', 'full')
    if (link.format !== 'markdown') q.set('format', link.format)
  }
  const out = q.toString()
  return out ? `?${out}` : ''
}

/**
 * Only the report's parameters of a search string, for a move to another view of the same project. A passage it names
 * stays with it, so a passage's link survives the route settling as the page opens.
 */
export function reportSearch(search: string): string {
  const out = withReportLink('', readReportLink(search))
  const passage = new URLSearchParams(search).get(PASSAGE_PARAM)
  if (!out || !passage) return out
  const q = new URLSearchParams(out)
  q.set(PASSAGE_PARAM, passage)
  return `?${q.toString()}`
}

/** What a viewer's open asks for: a report, and optionally its version and format. */
export interface OpenAsk {
  artifactId: string
  versionId?: string | null
  format?: ViewerFormat
}

/**
 * The link an open makes: the version asked for (else the current one), the size on screen, and the format asked for,
 * else the one on screen for the same report (a card's "N sources" keeps the PDF being read), else the Markdown.
 */
export function openedLink(on: ReportLink | null, ask: OpenAsk): ReportLink {
  return {
    artifactId: ask.artifactId,
    versionId: ask.versionId ?? null,
    size: on?.size ?? 'side',
    format: ask.format ?? (on?.artifactId === ask.artifactId ? on.format : 'markdown'),
  }
}
