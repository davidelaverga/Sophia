// Links of the Studio's own in a message, followed in place (docs/plans/studio-links-in-place.md): within this project a
// link shows its view, names in the address what its fragment names (the view that holds it opens it, useAddressed) and
// opens its report in the viewer, and the call stays; a report open that it doesn't name closes. LinkedText reads it;
// anything else opens in a new tab.
import { useCallback, type ReactNode } from 'react'
import { followHere, InPlace, inProject } from '../../app/in-place.ts'
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
      return () =>
        followHere(at, {
          view,
          show: onShow,
          path: () => window.location.pathname,
          shown: viewer?.shown ?? null,
          open: (r) => viewer?.open({ artifactId: r.artifactId, versionId: r.versionId, format: r.format }),
          leave: (push) => viewer?.leave(push),
          // After the view's own push, which carries no fragment, as a link followed (project-go.tsx).
          name: (hash) => {
            const { pathname, search } = window.location
            window.history.replaceState(window.history.state, '', `${pathname}${search}${hash}`)
            window.dispatchEvent(new Event(ADDRESS_NAMED))
          },
        })
    },
    [projectId, view, onShow, viewer],
  )
  return <InPlace.Provider value={followOf}>{children}</InPlace.Provider>
}
