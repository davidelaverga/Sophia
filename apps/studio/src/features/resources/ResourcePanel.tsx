// The project's Resources view (LFE-06), in the Work view's own language: the enrolled tools as a list under the
// view's head, and what waits on an owner in the column beside it, as Work has its pulse. It goes in a split page
// (ProjectShell's `resources`). It shows; it doesn't steer, hold or stop (LFE-06.4), and nothing here calls a tool.
import { RequiredActions, requestId } from './RequiredActions.tsx'
import { ResourceRow } from './ResourceRow.tsx'
import { summary, type QuotaObservation, type RequiredAction, type Resource } from './resource.ts'
import './resources.css'

interface Props {
  resources: Resource[]
  /** The latest observation per account; an account without one shows its capacity as unknown. */
  observations: QuotaObservation[]
  actions: RequiredAction[]
  /** Who is looking: only an action's owner is told how to answer it, and their own resource says "You". */
  viewerId: string
  now: Date
}

/** Brings the first open request of a resource into view and gives it the focus. */
function showRequest(actions: RequiredAction[], resourceId: string) {
  const first = actions.find((a) => a.resourceId === resourceId && a.state === 'open')
  const el = first ? document.getElementById(requestId(first.id)) : null
  el?.scrollIntoView({ block: 'nearest' })
  el?.focus({ preventScroll: true })
}

function List({ resources, observations, actions, viewerId, now }: Props) {
  if (resources.length === 0) {
    return <p className="empty">No tool is enrolled for this project yet. An owner enrolls one from their own host.</p>
  }
  return (
    <ol className="resource-list">
      {resources.map((r) => (
        <li key={r.id}>
          <ResourceRow
            resource={r}
            observation={observations.find((o) => o.entitlement_id === r.entitlementId)}
            now={now}
            mine={r.owner.id === viewerId}
            waiting={actions.filter((a) => a.resourceId === r.id && a.state === 'open').length}
            onShowRequests={() => showRequest(actions, r.id)}
          />
        </li>
      ))}
    </ol>
  )
}

export function ResourcePanel(props: Props) {
  const { resources, actions, viewerId, now } = props
  return (
    <>
      {/* First in reading order (and on a phone): what waits on someone. On a wide screen it is the side column. */}
      <RequiredActions actions={actions} resources={resources} viewerId={viewerId} now={now} />
      <section className="resources" aria-labelledby="resources-title">
        <header className="view-head">
          <h2 id="resources-title">Resources</h2>
          <span className="count">{resources.length}</span>
          <span className="resources-summary">{summary(resources, actions)}</span>
        </header>
        <List {...props} />
      </section>
    </>
  )
}
