// The address bar holds where a person is: one of the three places outside a project (home, their personal space,
// their work space) or an open project and view (/p/<project>/<view>), so links can be shared and Back works. Only
// navigation lives here: the lens, drafts and panels are per-viewer (viewer-state.ts).

/** Project views (architecture 04 §1). Studio is the shared room; the others inspect the same records. */
export const VIEWS = ['studio', 'conversations', 'goals', 'work', 'knowledge', 'updates', 'resources'] as const
export type View = (typeof VIEWS)[number]

/** The views a project's nav shows: Conversations only under the vision flag (Davide's chapter 2, A18 proposed). */
export const viewsShown = (vision: boolean): readonly View[] =>
  vision ? VIEWS : VIEWS.filter((v) => v !== 'conversations')

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

/**
 * An invitation's page takes the visit (it handles sign-in on its own), except while a sign-in link waits for the
 * person to accept the session it carries: that question comes first, or the session would wait unused while the
 * page asks them to sign in again.
 */
export const opensJoinPage = (pathname: string, authStatus: string): boolean =>
  isJoinPath(pathname) && authStatus !== 'link_offer'

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

/**
 * "Join the room" asks to join on that opening of the project only. Once the person is anywhere else (home, Back,
 * another project) before the room could join, the request is dropped: a later visit never joins on its own.
 */
export const joinStands = (joining: string | null, onScreen: string | null): string | null =>
  joining !== null && joining === onScreen ? joining : null

/**
 * The project on screen: the one asked for; but while a call runs in another, that one, until the call has left
 * (opening another project leaves it): its controls stay in sight, nothing of it goes on out of sight, and the other
 * opens (and joins, if asked) only after.
 */
export const projectOnScreen = (asked: string | null, calling: string | null): string | null =>
  asked !== null && calling !== null && asked !== calling ? calling : asked
