// What waits on a resource's owner, in its sheet: the requests its native tool is holding, with the session, what they
// ask and until when. Only the owner is told how to answer, in the native tool, and gets the session's id to copy;
// there is no Approve here (phase one), and seeing a request answers nothing.
import { useRef, useState } from 'react'
import { SwapLabel, Tag } from '@sophia/ui'
import { actionLine, actionState, expiry, TOOL, type RequiredAction, type Resource } from './resource.ts'

const TONE = {
  open: 'amber',
  resolved: 'teal',
  denied: 'rose',
  expired: 'muted',
  superseded: 'muted',
  unknown: 'amber',
} as const

const COPY = { copy: 'Copy session id', copied: 'Copied' } as const

/** The session's id, to find it in the native tool: copied, and said so for a moment (the words crossfade). */
function CopySession({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sessionId)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button type="button" className="text-button waiting-copy" onClick={() => void copy()}>
      <SwapLabel value={copied ? 'copied' : 'copy'} labels={COPY} />
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
  const mine = viewerId === action.ownerId && action.state === 'open'
  return (
    <li className={`event waiting ${action.state}`}>
      <span className="dot" aria-hidden />
      <div className="waiting-body">
        <p className="waiting-operation">{action.operation}</p>
        <p className="waiting-session">Session {action.sessionId}</p>
        {line && <p className="waiting-line">{line}</p>}
        <p className="waiting-foot">
          <Tag tone={TONE[action.state]}>{actionState(action)}</Tag>
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
      <h3 id="requests-title">Waiting on {resource.owner.id === viewerId ? 'you' : resource.owner.name}</h3>
      <ol className="events">
        {own.map((a) => (
          <Request key={a.id} action={a} resource={resource} viewerId={viewerId} now={now} />
        ))}
      </ol>
    </section>
  )
}
