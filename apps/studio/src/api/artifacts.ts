// Reports and their bytes (contract amendment A11, SMC-M03). Every read is authorized by the API per call. Bytes come
// as text (inline) or a URL that expires within minutes: fetch them when they are needed, never keep the URL.
import type { ArtifactVersion, ReportList, SourceContent } from '@sophia/contracts'
import { parseArtifactVersionList, parseReportList, parseSourceContent } from '@sophia/contracts/validate'
import { callApi } from './client.ts'

/** One authorized read of a report's source or rendition; `attachment` makes the URL save the file. */
export const getSourceContent = (
  token: string,
  sourceId: string,
  disposition: SourceContent['disposition'] = 'inline',
): Promise<SourceContent> =>
  callApi(
    `/api/v1/sources/${sourceId}/content?disposition=${disposition}`,
    { token, method: 'GET' },
    parseSourceContent,
  )

export interface ReportFilter {
  /** A project id, or 'all' for every project the reader is in. */
  project: string
  format?: 'any' | 'pdf' | 'markdown_only'
  q?: string
  cursor?: string | null
}

/** Report cards for Knowledge, newest first. */
export function listReports(token: string, filter: ReportFilter): Promise<ReportList> {
  const query = new URLSearchParams({ project: filter.project })
  if (filter.format && filter.format !== 'any') query.set('format', filter.format)
  if (filter.q?.trim()) query.set('q', filter.q.trim())
  if (filter.cursor) query.set('cursor', filter.cursor)
  return callApi(`/api/v1/knowledge/reports?${query.toString()}`, { token, method: 'GET' }, parseReportList)
}

/** Every published version of one report, newest first, with what changed and what was kept. */
export const listArtifactVersions = (token: string, artifactId: string): Promise<readonly ArtifactVersion[]> =>
  callApi(`/api/v1/artifacts/${artifactId}/versions`, { token, method: 'GET' }, parseArtifactVersionList)
