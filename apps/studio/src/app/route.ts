// The address bar holds where a person is: one of the three places outside a project (home, their personal space,
// their work space) or an open project and view (/p/<project>/<view>), so links can be shared and Back works. Only
// navigation lives here: the lens, drafts and panels are per-viewer (viewer-state.ts).

/** Project views (architecture 04 §1). Studio is the shared room; the others inspect the same records. */
export const VIEWS = ['studio', 'goals', 'work', 'knowledge', 'updates', 'resources'] as const
export type View = (typeof VIEWS)[number]

/** Outside a project: the two doors (home), the personal space and the work space (A10, direction C). */
export const PLACES = ['home', 'personal', 'work'] as const
export type Place = (typeof PLACES)[number]

export interface Route {
  projectId: string | null
  view: View
  /** Where the person is outside a project; a project lives in Work. */
  place: Place
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PROJECT_VIEW = new RegExp(`^/p/(${UUID})(?:/([a-z]+))?/?$`, 'i')
/** Links shared before S1-04 (/projects/<id>) keep working. */
const LEGACY_PROJECT = new RegExp(`^/projects/(${UUID})/?$`, 'i')
const PLACE_PATH = /^\/(personal|work)\/?$/

const isView = (value: string | undefined): value is View => VIEWS.some((v) => v === value)
const isPlace = (value: string | undefined): value is Place => PLACES.some((p) => p === value)

export const HOME: Route = { projectId: null, view: 'studio', place: 'home' }

/** Invitation links open `/join#<token>`: outside any project, and never rewritten by the router. */
export const JOIN_PATH = '/join'
export const isJoinPath = (pathname: string) => pathname.replace(/\/+$/, '') === JOIN_PATH

const project = (projectId: string, view: View): Route => ({ projectId: projectId.toLowerCase(), view, place: 'work' })

/** Unknown paths and views fall back to the nearest valid route rather than a blank page. */
export function parseRoute(pathname: string): Route {
  const current = PROJECT_VIEW.exec(pathname)
  if (current?.[1]) return project(current[1], isView(current[2]) ? current[2] : 'studio')
  const legacy = LEGACY_PROJECT.exec(pathname)
  if (legacy?.[1]) return project(legacy[1], 'studio')
  const place = PLACE_PATH.exec(pathname)?.[1]
  return isPlace(place) ? { ...HOME, place } : HOME
}

export function routePath({ projectId, view, place }: { projectId: string | null; view: View; place?: Place }): string {
  if (projectId) return `/p/${projectId}/${view}`
  return !place || place === 'home' ? '/' : `/${place}`
}
