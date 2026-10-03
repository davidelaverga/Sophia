// What waits on a resource's owner, in its sheet: the requests its native tool is holding, with the session, what they
// ask and until when. Only the owner is told how to answer, in the native tool, and gets the session's id to copy;
// there is no Approve here (phase one), and seeing a request answers nothing.
import { SwapLabel, Tag } from '@sophia/ui'
import { useCopy } from './copy.ts'
import {
  actionLine,
  actionState,
  expiry,
  requestsHeading,
  TOOL,
  type RequiredAction,
  type Resource,
} from './resource.ts'

const TONE = {
  open: 'amber',
  resolved: 'teal',
  denied: 'rose',
  expired: 'muted',
  superseded: 'muted',
  unknown: 'amber',
} as const

/** The session's id, to find it in the native tool: copied and said so, or, when the browser refuses, shown to copy. */
function CopySession({ sessionId }: { sessionId: string }) {
  const { state, copy } = useCopy(() => sessionId)
  const labels = { idle: 'Copy session id', copied: 'Copied', failed: `Couldn’t copy: ${sessionId}` }
  return (
    <button type="button" className="text-button waiting-copy" data-copy={state} onClick={copy}>
      <SwapLabel value={state} labels={labels} />
    </button>
  )
}

interface Props {
  actions: RequiredAction[]
  resource: Resource
  viewerId: string
  now: Date
}

function Request({ action, resource, viewerId, now }: Omit<Props, 'actions'> & { action: RequiredAction }) {
  const line = actionLine(action, viewerId, resource)
  const open = action.state === 'open'
  const mine = viewerId === action.ownerId && open
  return (
    <li className={`event waiting ${action.state}`}>
      <span className="dot" aria-hidden />
      <div className="waiting-body">
        <p className="waiting-operation">{action.operation}</p>
        {/* The owner's line already names the session; everyone else is told it here. */}
        {!mine && <p className="waiting-session">Session {action.sessionId}</p>}
        {line && <p className="waiting-line">{line}</p>}
        <p className="waiting-foot">
          {/* What still waits is said by its heading; one answered, denied or expired says what it became. */}
          {!open && <Tag tone={TONE[action.state]}>{actionState(action)}</Tag>}
          {action.deadline && <span className="muted">{expiry(action.deadline, now)}</span>}
          {mine && <CopySession sessionId={action.sessionId} />}
          {mine && action.openTarget && (
            <a className="pill" href={action.openTarget}>
              Open in {TOOL[resource.tool]}
            </a>
          )}
        </p>
      </div>
    </li>
  )
}

/** First in the sheet when anything waits; nothing at all when nothing does. */
export function ResourceRequests({ actions, resource, viewerId, now }: Props) {
  const own = actions.filter((a) => a.resourceId === resource.id)
  if (own.length === 0) return null
  return (
    <section className="sheet-section resource-requests" aria-labelledby="requests-title">
      <h3 id="requests-title">
        {/* Once none is open, nothing waits: the heading doesn't say it does; one not settled isn't "earlier". */}
        {requestsHeading(own, resource.owner, viewerId)}
      </h3>
      <ol className="events">
        {own.map((a) => (
          <Request key={a.id} action={a} resource={resource} viewerId={viewerId} now={now} />
        ))}
      </ol>
    </section>
  )
}
