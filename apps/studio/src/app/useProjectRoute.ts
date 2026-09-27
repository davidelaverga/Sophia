// Keeps the open project and view in sync with the address bar (route.ts), including Back and Forward.
import { useEffect, useState } from 'react'
import { isJoinPath, parseRoute, routePath, type Route, type View } from './route.ts'

const current = (): Route => parseRoute(window.location.pathname)

export function useProjectRoute(fallbackProject: string | null) {
  const [route, setRoute] = useState<Route>(() => {
    const parsed = current()
    return parsed.projectId ? parsed : { ...parsed, projectId: fallbackProject }
  })

  useEffect(() => {
    // Normalize legacy and fallback addresses once, without adding a history entry. An invitation link
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
    open: (projectId: string) => go({ projectId, view: 'studio' }),
    show: (view: View) => go({ ...route, view }),
    leave: () => go({ projectId: null, view: 'studio' }),
  }
}
