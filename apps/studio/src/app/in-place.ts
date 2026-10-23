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

/** What following a link here acts on: the shell's views, the address and the report viewer (InPlaceLinks). */
export interface Here {
  view: View
  show: (view: View) => void
  /** The address's path now: showing another view moves it when the router pushes an entry for it. */
  path: () => string
  /** The report on screen, or null. */
  shown: string | null
  open: (report: ReportLink) => void
  /** The report closes and leaves the address, in a new entry (`push`) or in the one on screen. */
  leave: (push: boolean) => void
  /** Names what the fragment names in the entry on screen. */
  name: (hash: string) => void
}

/**
 * Follows a link here: its view, then a report open that it doesn't name closes (the link says where to go), then its
 * fragment, then its report. Closing comes before the fragment, so the fragment lands in the link's entry and Back
 * finds the report beside what was named then. A view's push (its path moved) is the link's entry; within the view on
 * screen the report leaves in a new one.
 */
export function followHere(at: InProject, here: Here): void {
  const from = here.path()
  if (at.view !== here.view) here.show(at.view)
  if (!at.report && here.shown) here.leave(here.path() === from)
  if (at.hash) here.name(at.hash)
  if (at.report) here.open(at.report)
}

/** How to follow an address here, or null for one that opens in a new tab. */
export type FollowOf = (href: string) => (() => void) | null

/** Given by a project's shell (InPlaceLinks); null elsewhere, where every link opens in a new tab. */
export const InPlace = createContext<FollowOf | null>(null)
