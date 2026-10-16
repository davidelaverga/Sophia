// Where a link of the Studio's own leads within the project a message is read in (docs/plans/studio-links-in-place.md):
// its view, what its fragment names and the report it opens. Any other address opens in a new tab: another site,
// another project (opening one leaves the call), a place, an invitation, a passage or any other parameter.
import { createContext } from 'react'
import { PASSAGE_PARAM, readReportLink, REPORT_PARAMS, type ReportLink } from '../features/artifacts/report-link.ts'
import { parseRoute, type View } from './route.ts'

export interface InProject {
  view: View
  /** What the fragment names (`#conversation-…`, `#task-…`), as written; empty for none. */
  hash: string
  /** The report its parameters name, or null. */
  report: ReportLink | null
}

const reportParam = (name: string) => name !== PASSAGE_PARAM && REPORT_PARAMS.some((p) => p === name)

export function inProject(href: string, origin: string, projectId: string): InProject | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const route = parseRoute(url.pathname)
  if (url.origin !== origin || route.projectId !== projectId.toLowerCase()) return null
  const names = [...new URLSearchParams(url.search).keys()]
  const report = readReportLink(url.search)
  if (!names.every(reportParam) || (names.length > 0 && !report)) return null
  return { view: route.view, hash: url.hash, report }
}

/** How to follow an address here, or null for one that opens in a new tab. */
export type FollowOf = (href: string) => (() => void) | null

/** Given by a project's shell (InPlaceLinks); null elsewhere, where every link opens in a new tab. */
export const InPlace = createContext<FollowOf | null>(null)
