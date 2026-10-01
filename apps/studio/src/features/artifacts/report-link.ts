// The open report in the address bar (plan §2.8.4): `?report=<artifact>&version=<version>&view=full` deep-links the
// viewer and lets a member open it in a new tab. Only these parameters are ours; the router keeps them across a
// change of view in the same project (useProjectRoute) and drops them when the project changes.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ViewerTab = 'document' | 'sources' | 'history'
export type ViewerSize = 'side' | 'full'

export interface ReportLink {
  artifactId: string
  /** The version on screen; null for the report's current version. */
  versionId: string | null
  size: ViewerSize
}

export const REPORT_PARAMS = ['report', 'version', 'view'] as const

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
  }
  const out = q.toString()
  return out ? `?${out}` : ''
}

/** Only the report's parameters of a search string, for a move to another view of the same project. */
export const reportSearch = (search: string): string => withReportLink('', readReportLink(search))
