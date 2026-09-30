// Keeps where the person is (a place, or a project and view) in sync with the address bar (route.ts), including
// Back and Forward.
import { useEffect, useState } from 'react'
import { HOME, isJoinPath, parseRoute, routePath, type Place, type Route, type View } from './route.ts'

const current = (): Route => parseRoute(window.location.pathname)

export function useProjectRoute() {
  const [route, setRoute] = useState<Route>(current)

  useEffect(() => {
    // Normalize legacy and unknown addresses once, without adding a history entry. An invitation link
    // (/join#token) is left exactly as it came.
    const path = window.location.pathname
    if (!isJoinPath(path) && path !== routePath(route)) window.history.replaceState(null, '', routePath(route))
    const onPop = () => setRoute(current())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [route])

  const go = (next: Route) => {
    window.history.pushState(null, '', routePath(next))
    setRoute(next)
  }
  return {
    route,
    open: (projectId: string) => go({ projectId, view: 'studio', place: 'work' }),
    show: (view: View) => go({ ...route, view }),
    /** Out of the project, back to the two doors. */
    leave: () => go(HOME),
    /** One of the three places outside a project. */
    goTo: (place: Place) => go({ ...HOME, place }),
  }
}
