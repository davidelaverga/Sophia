// The report viewer's way in, for what lives inside or beside it (DocumentViewer owns the state): its own module, so
// the pane's parts (the Sources tab) reach it without a cycle through the viewer.
import { createContext, useContext } from 'react'
import type { ViewerFormat, ViewerTab } from './report-link.ts'

export interface OpenRequest {
  artifactId: string
  /** A version; omitted for the report's current one. */
  versionId?: string | null
  tab?: ViewerTab
  /** The PDF of the version, when it has one; the Markdown otherwise. */
  format?: ViewerFormat
  /** A section to open at, by its heading's anchor (a search hit's). */
  section?: string
}

export interface ViewerApi {
  open: (request: OpenRequest) => void
  /** The report on screen now, or null: what was opened elsewhere needn't be offered again. */
  shown: string | null
  /**
   * Leaves the report for something elsewhere in the project (a source's origin): where the report covers the page (a
   * phone, the full page) it closes first, then `after` runs; beside the page it stays, and `after` runs at once.
   */
  leaveFor: (after: () => void) => void
}

export const ViewerContext = createContext<ViewerApi | null>(null)

/** Opens a report in the viewer; null outside a project (nothing there shows the open action). */
export const useDocumentViewer = (): ViewerApi | null => useContext(ViewerContext)
