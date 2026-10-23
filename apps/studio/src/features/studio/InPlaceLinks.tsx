// Links of the Studio's own in a message, followed in place (docs/plans/studio-links-in-place.md): within this project a
// link shows its view, names in the address what its fragment names (the view that holds it opens it, useAddressed) and
// opens its report in the viewer, and the call stays. LinkedText reads it; anything else opens in a new tab.
import { useCallback, type ReactNode } from 'react'
import { InPlace, inProject } from '../../app/in-place.ts'
import type { View } from '../../app/route.ts'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { ADDRESS_NAMED } from '../resources/useAddressed.ts'

interface Props {
  projectId: string
  view: View
  onShow: (view: View) => void
  children: ReactNode
}

export function InPlaceLinks({ projectId, view, onShow, children }: Props) {
  const viewer = useDocumentViewer()
  const followOf = useCallback(
    (href: string) => {
      const at = inProject(href, window.location.origin, projectId)
      if (!at) return null
      return () => {
        if (at.view !== view) onShow(at.view)
        // After the view's own push, which carries no fragment, as a link followed (project-go.tsx).
        if (at.hash) {
          const { pathname, search } = window.location
          window.history.replaceState(window.history.state, '', `${pathname}${search}${at.hash}`)
          window.dispatchEvent(new Event(ADDRESS_NAMED))
        }
        const report = at.report
        if (report) viewer?.open({ artifactId: report.artifactId, versionId: report.versionId, format: report.format })
      }
    },
    [projectId, view, onShow, viewer],
  )
  return <InPlace.Provider value={followOf}>{children}</InPlace.Provider>
}
