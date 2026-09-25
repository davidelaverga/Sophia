// The address bar holds the open project and view (/p/<project>/<view>), so links can be shared and Back
// works. Only navigation lives here: the lens, drafts and panels are per-viewer (viewer-state.ts).

/** Project views (architecture 04 §1). Studio is the shared room; the others inspect the same records. */
export const VIEWS = ['studio', 'goals', 'work', 'knowledge', 'updates', 'resources'] as const
export type View = (typeof VIEWS)[number]

export interface Route {
  projectId: string | null
  view: View
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PROJECT_VIEW = new RegExp(`^/p/(${UUID})(?:/([a-z]+))?/?$`, 'i')
/** Links shared before S1-04 (/projects/<id>) keep working. */
const LEGACY_PROJECT = new RegExp(`^/projects/(${UUID})/?$`, 'i')

const isView = (value: string | undefined): value is View => VIEWS.some((v) => v === value)

export const HOME: Route = { projectId: null, view: 'studio' }

/** Invitation links open `/join#<token>`: outside any project, and never rewritten by the router. */
export const JOIN_PATH = '/join'
export const isJoinPath = (pathname: string) => pathname.replace(/\/+$/, '') === JOIN_PATH

/** Unknown paths and views fall back to the nearest valid route rather than a blank page. */
export function parseRoute(pathname: string): Route {
  const current = PROJECT_VIEW.exec(pathname)
  if (current?.[1]) return { projectId: current[1].toLowerCase(), view: isView(current[2]) ? current[2] : 'studio' }
  const legacy = LEGACY_PROJECT.exec(pathname)
  if (legacy?.[1]) return { projectId: legacy[1].toLowerCase(), view: 'studio' }
  return HOME
}

export function routePath({ projectId, view }: Route): string {
  return projectId ? `/p/${projectId}/${view}` : '/'
}
