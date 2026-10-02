// The project's engineering resources (LFE-06.1/.2): every enrolled native tool, its sessions and capacity, and the
// requests waiting on an owner. It shows; it doesn't steer, hold or stop (LFE-06.4), and nothing here calls a tool.
import { RequiredActions } from './RequiredActions.tsx'
import { ResourceCard } from './ResourceCard.tsx'
import type { QuotaObservation, RequiredAction, Resource } from './resource.ts'
import './resources.css'

interface Props {
  resources: Resource[]
  /** The latest observation per account; an account without one shows its capacity as unknown. */
  observations: QuotaObservation[]
  actions: RequiredAction[]
  /** Who is looking: only an action's owner is told how to answer it. */
  viewerId: string
  now: Date
}

export function ResourcePanel({ resources, observations, actions, viewerId, now }: Props) {
  return (
    <div className="resources">
      <header className="resources-head">
        <span className="eyebrow">Resources</span>
        <h2>Who can work on this project</h2>
      </header>
      <div className="resource-list">
        {resources.map((r) => (
          <ResourceCard
            key={r.id}
            resource={r}
            observation={observations.find((o) => o.entitlement_id === r.entitlementId)}
            now={now}
          />
        ))}
      </div>
      <RequiredActions actions={actions} resources={resources} viewerId={viewerId} now={now} />
    </div>
  )
}
