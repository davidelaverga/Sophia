// Where a link of the Studio's own leads within a project (docs/plans/studio-links-in-place.md). Stub: none yet.
import type { ReportLink } from '../features/artifacts/report-link.ts'
import type { View } from './route.ts'

export interface InProject {
  view: View
  hash: string
  report: ReportLink | null
}

export const inProject = (_href: string, _origin: string, _projectId: string): InProject | null => null
