// The project's engineering resources (LFE-06): what waits on an owner first, then every enrolled native tool with
// its sessions and capacity. It shows; it doesn't steer, hold or stop (LFE-06.4), and nothing here calls a tool.
import { requestId, RequiredActions } from './RequiredActions.tsx'
import { ResourceCard } from './ResourceCard.tsx'
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

export function ResourcePanel({ resources, observations, actions, viewerId, now }: Props) {
  return (
    <div className="resources">
      <header className="resources-head">
        <span className="eyebrow">Resources</span>
        <h2>Who can work on this project</h2>
        <p className="resources-summary">{summary(resources, actions)}</p>
      </header>
      <RequiredActions actions={actions} resources={resources} viewerId={viewerId} now={now} />
      <div className="resource-list">
        {resources.map((r) => (
          <ResourceCard
            key={r.id}
            resource={r}
            observation={observations.find((o) => o.entitlement_id === r.entitlementId)}
            now={now}
            mine={r.owner.id === viewerId}
            waiting={actions.filter((a) => a.resourceId === r.id && a.state === 'open').length}
            onShowRequests={() => showRequest(actions, r.id)}
          />
        ))}
      </div>
    </div>
  )
}
