// Keeps where the person is (a place, or a project and view) in sync with the address bar (route.ts), including
// Back and Forward.
import { useEffect, useState } from 'react'
import { reportSearch, withReportLink, type ReportLink } from '../features/artifacts/report-link.ts'
import { DECISION, MESSAGE, REQUEST, requestAddress, TASK, showInAddress } from '../features/resources/link.ts'
import { lensKept } from '../features/studio/viewer-state.ts'
import { ADDRESS_NAMED } from '../features/resources/useAddressed.ts'
import { ADDRESS_MOVED, HOME, isJoinPath, parseRoute, routePath, type Place, type Route, type View } from './route.ts'
import { legalDoc } from './legal.ts'

const current = (): Route => parseRoute(window.location.pathname)

export function useProjectRoute() {
  const [route, setRoute] = useState<Route>(current)

  useEffect(() => {
    // Normalize legacy and unknown addresses once, without adding a history entry. An invitation link
    // (/join#token) is left exactly as it came, and so are the terms and the privacy notice (Codex P1 on #366).
    const path = window.location.pathname
    if (!isJoinPath(path) && legalDoc(path) === null && path !== routePath(route)) {
      // The report goes along, and the Studio's lens a shared link named (Codex on #242).
      const search = window.location.search
      window.history.replaceState(null, '', routePath(route) + lensKept(search, reportSearch(search)))
      // A viewer mounted first noted whose lens the address carries under the old path: told, it notes the new one
      // (Codex on #284).
      window.dispatchEvent(new Event(ADDRESS_MOVED))
    }
    const onPop = () => setRoute(current())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [route])

  // An open report stays open across the project's views (its parameters go along); another project, or a place,
  // closes it.
  const go = (next: Route, replace = false, search?: string) => {
    const keep = next.projectId !== null && next.projectId === route.projectId
    const path = routePath(next) + (search ?? (keep ? reportSearch(window.location.search) : ''))
    if (replace) window.history.replaceState(null, '', path)
    else window.history.pushState(null, '', path)
    setRoute(next)
    // A view pressed again keeps its shell mounted: what it mirrors in the address (the Studio's lens) writes it again.
    window.dispatchEvent(new Event(ADDRESS_MOVED))
  }
  return {
    route,
    open: (projectId: string) => go({ projectId, view: 'studio', place: 'work' }),
    /**
     * A project at one of its views, at the record a need names when the Studio has an address for it: a task in Tasks'
     * fragment, a report's version in the viewer (api/needs.ts, `atOf`).
     */
    openAt: (
      projectId: string,
      view: View,
      at: {
        taskId?: string
        decisionId?: string
        requestId?: string
        resourceId?: string
        messageId?: string
        report?: ReportLink
      } = {},
    ) => {
      go({ projectId, view, place: 'work' }, false, at.report ? withReportLink('', at.report) : undefined)
      // The request with its resource: two resources may hold one request id (Codex on #245).
      if (at.requestId) showInAddress(requestAddress(at.resourceId ?? null, at.requestId), REQUEST)
      else if (at.decisionId) showInAddress(at.decisionId, DECISION)
      else if (at.taskId) showInAddress(at.taskId, TASK)
      else if (at.messageId) showInAddress(at.messageId, MESSAGE)
      // A shell kept mounted (Home shown during a call) heard the route move before the record was named: it is told
      // again once the fragment is in (useAddressed; Codex on #245).
      if (at.requestId || at.decisionId || at.taskId || at.messageId) window.dispatchEvent(new Event(ADDRESS_NAMED))
    },
    show: (view: View) => go({ ...route, view }),
    /** Out of the project, back to the two doors. */
    leave: () => go(HOME),
    /**
     * One of the three places outside a project. `replace` takes this entry's place instead of adding one: a place that
     * can't be shown (a locked personal space) is never left in the history for Back to land on again.
     */
    goTo: (place: Place, replace = false) => go({ ...HOME, place }, replace),
  }
}
