// The requests a native tool is holding for its owner: who it belongs to, the session, what it asks and until when.
// Only the owner is told how to answer it, in the native tool; there is no Approve here (phase one), and seeing a
// request answers nothing.
import { Tag } from '@sophia/ui'
import { actionLine, actionState, expiry, TOOL, type RequiredAction, type Resource } from './resource.ts'

const TONE = {
  open: 'amber',
  resolved: 'teal',
  denied: 'rose',
  expired: 'muted',
  superseded: 'muted',
  unknown: 'amber',
} as const

interface Props {
  actions: RequiredAction[]
  resources: Resource[]
  viewerId: string
  now: Date
}

function ActionCard({
  action,
  resource,
  viewerId,
  now,
}: { action: RequiredAction; resource: Resource } & Omit<Props, 'actions' | 'resources'>) {
  const line = actionLine(action, viewerId, resource)
  const mine = viewerId === action.ownerId
  return (
    <li className="required-action">
      <div className="required-action-head">
        <span className="required-action-owner">
          {resource.owner.name}’s {TOOL[resource.tool]} · session {action.sessionId}
        </span>
        <Tag tone={TONE[action.state]}>{actionState(action)}</Tag>
      </div>
      <p className="required-action-operation">{action.operation}</p>
      {action.deadline && <p className="required-action-meta">{expiry(action.deadline, now)}</p>}
      {line && <p className="required-action-line">{line}</p>}
      {mine && action.state === 'open' && action.openTarget && (
        <a className="pill" href={action.openTarget}>
          Open in {TOOL[resource.tool]}
        </a>
      )}
    </li>
  )
}

export function RequiredActions({ actions, resources, viewerId, now }: Props) {
  if (actions.length === 0) return null
  return (
    <section className="required-actions" aria-labelledby="required-actions-title">
      <h3 id="required-actions-title">Waiting on an owner</h3>
      <ul>
        {actions.map((a) => {
          const resource = resources.find((r) => r.id === a.resourceId)
          return resource ? (
            <ActionCard key={a.id} action={a} resource={resource} viewerId={viewerId} now={now} />
          ) : null
        })}
      </ul>
    </section>
  )
}
