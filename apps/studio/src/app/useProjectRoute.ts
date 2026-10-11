// Keeps where the person is (a place, or a project and view) in sync with the address bar (route.ts), including
// Back and Forward.
import { useEffect, useState } from 'react'
import { reportSearch, withReportLink, type ReportLink } from '../features/artifacts/report-link.ts'
import { showInAddress, TASK } from '../features/resources/link.ts'
import { HOME, isJoinPath, parseRoute, routePath, type Place, type Route, type View } from './route.ts'

const current = (): Route => parseRoute(window.location.pathname)

export function useProjectRoute() {
  const [route, setRoute] = useState<Route>(current)

  useEffect(() => {
    // Normalize legacy and unknown addresses once, without adding a history entry. An invitation link
    // (/join#token) is left exactly as it came.
    const path = window.location.pathname
    if (!isJoinPath(path) && path !== routePath(route)) {
      window.history.replaceState(null, '', routePath(route) + reportSearch(window.location.search))
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
  }
  return {
    route,
    open: (projectId: string) => go({ projectId, view: 'studio', place: 'work' }),
    /**
     * A project at one of its views, at the record a need names when the Studio has an address for it: a task in Tasks'
     * fragment, a report's version in the viewer (api/needs.ts, `atOf`).
     */
    openAt: (projectId: string, view: View, at: { taskId?: string; report?: ReportLink } = {}) => {
      go({ projectId, view, place: 'work' }, false, at.report ? withReportLink('', at.report) : undefined)
      if (at.taskId) showInAddress(at.taskId, TASK)
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
