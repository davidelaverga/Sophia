// What waits on an owner, in the Resources view's side column, as Work has its pulse: the requests a native tool is
// holding for its owner, with whose they are, the session, what they ask and until when. Only the owner is told how
// to answer, in the native tool, and gets the session's id to copy; there is no Approve here (phase one), and seeing
// a request answers nothing. A resource's row brings the focus here (`requestId`).
import { useRef, useState } from 'react'
import { Tag } from '@sophia/ui'
import { actionLine, actionState, expiry, TOOL, type RequiredAction, type Resource } from './resource.ts'
import { ToolLogo } from './ToolLogo.tsx'

const TONE = {
  open: 'amber',
  resolved: 'teal',
  denied: 'rose',
  expired: 'muted',
  superseded: 'muted',
  unknown: 'amber',
} as const

/** The element a request is shown in, for a row that points to it. */
export const requestId = (actionId: string) => `request-${actionId}`

interface Props {
  actions: RequiredAction[]
  resources: Resource[]
  viewerId: string
  now: Date
}

/** The session's id, to find it in the native tool: copied, and said so for a moment. */
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
      {copied ? 'Copied' : 'Copy session id'}
    </button>
  )
}

interface RequestProps {
  action: RequiredAction
  resource: Resource
  viewerId: string
  now: Date
}

function Request({ action, resource, viewerId, now }: RequestProps) {
  const line = actionLine(action, viewerId, resource)
  const mine = viewerId === action.ownerId && action.state === 'open'
  return (
    <li className={`event waiting ${action.state}`} id={requestId(action.id)} tabIndex={-1}>
      <span className="dot" aria-hidden />
      <div className="waiting-body">
        <p className="waiting-owner">
          <ToolLogo tool={resource.tool} size="sm" />
          {resource.owner.name}’s {TOOL[resource.tool]} · session {action.sessionId}
        </p>
        <p className="waiting-operation">{action.operation}</p>
        {line && <p className="waiting-line">{line}</p>}
        <p className="waiting-foot">
          <Tag tone={TONE[action.state]}>{actionState(action)}</Tag>
          {action.deadline && <span className="muted">{expiry(action.deadline, now)}</span>}
        </p>
        {mine && <CopySession sessionId={action.sessionId} />}
        {mine && action.openTarget && (
          <a className="pill" href={action.openTarget}>
            Open in {TOOL[resource.tool]}
          </a>
        )}
      </div>
    </li>
  )
}

export function RequiredActions({ actions, resources, viewerId, now }: Props) {
  return (
    <aside className="pulse resources-waiting" aria-labelledby="waiting-title">
      <div className="pulse-head">
        <h4 id="waiting-title">Waiting on an owner</h4>
      </div>
      {actions.length === 0 ? (
        <p className="empty">Nothing is waiting on an owner.</p>
      ) : (
        <ol className="events">
          {actions.map((a) => {
            const resource = resources.find((r) => r.id === a.resourceId)
            return resource ? <Request key={a.id} action={a} resource={resource} viewerId={viewerId} now={now} /> : null
          })}
        </ol>
      )}
    </aside>
  )
}
