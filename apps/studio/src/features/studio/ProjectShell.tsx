// ProjectShell (architecture 04 §3): project header, view navigation, the one project feed every view
// shares, and the room connection, which outlives view changes: joining in Studio and reading Goals
// keeps you in the room. Views change the address, never the project.
import { useState } from 'react'
import type { Snapshot } from '@sophia/contracts'
import { Icon, SwapLabel } from '@sophia/ui'
import { ApiError } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { routePath, type View } from '../../app/route.ts'
import { MiniDock } from '../voice/MiniDock.tsx'
import { useProjectRoom, type ProjectRoom } from '../voice/useProjectRoom.ts'
import { GoalList } from '../work/GoalList.tsx'
import { WorkPulse } from '../work/WorkPulse.tsx'
import { PendingView } from './PendingView.tsx'
import { StudioShell } from './StudioShell.tsx'
import { useProjectFeed, type Connection } from './useProjectFeed.ts'
import { ViewNav } from './ViewNav.tsx'

const CONNECTION: Record<Connection, string> = {
  connecting: 'Connecting',
  live: 'Live',
  reconnecting: 'Reconnecting',
  resyncing: 'Resyncing',
  denied: 'No access',
}

/** Why the project cannot be shown: session ended (401), not a member (403) or unreachable. */
type Blocked = 'expired' | 'denied' | 'unreachable'

function blockedBy(error: Error | null): Blocked | null {
  if (!error) return null
  if (error instanceof ApiError && error.status === 401) return 'expired'
  if (error instanceof ApiError && error.status === 403) return 'denied'
  return 'unreachable'
}

interface Props {
  projectId: string
  view: View
  identity: Identity
  identitySwitcher: React.ReactNode
  onShow: (view: View) => void
  onLeave: () => void
}

export function ProjectShell({ projectId, view, identity, identitySwitcher, onShow, onLeave }: Props) {
  const { snapshot, feed, connection } = useProjectFeed(projectId, identity.name, identity.token)
  const room = useProjectRoom(projectId, identity.token, snapshot.data)
  const blocked = blockedBy(snapshot.error)
  return (
    <div className="shell" data-view={view}>
      <header className="topbar">
        <button type="button" className="mark" onClick={onLeave} title="All projects">
          <span className="mark-dot" data-live={connection === 'live' || undefined} aria-hidden />
          <span className="mark-word">Sophia</span>
        </button>
        <h1 className="project-name">{snapshot.data?.title ?? (blocked ? 'Unavailable' : 'Loading…')}</h1>
        {!blocked && <ViewNav projectId={projectId} view={view} onShow={onShow} />}
        <div className="topbar-end">
          <span role="status" className="connection" data-state={connection} title={CONNECTION[connection]}>
            <span className="connection-dot" aria-hidden />
            <span className="connection-label">{CONNECTION[connection]}</span>
          </span>
          {snapshot.data && <CopyLinkButton projectId={projectId} />}
          {identitySwitcher}
        </div>
      </header>
      {blocked ? (
        <AccessNotice
          blocked={blocked}
          identityName={identity.name}
          onLeave={onLeave}
          onRetry={() => void snapshot.refetch()}
        />
      ) : (
        <ProjectBody
          view={view}
          projectId={projectId}
          identity={identity}
          room={room}
          snapshot={snapshot.data}
          pulse={<WorkPulse feed={feed} connection={connection} />}
          onShow={onShow}
        />
      )}
    </div>
  )
}

interface BodyProps {
  view: View
  projectId: string
  identity: Identity
  room: ProjectRoom
  snapshot: Snapshot | undefined
  pulse: React.ReactNode
  onShow: (view: View) => void
}

/** Studio is the room itself; every other view is a page, with the room one click away in the mini dock. */
function ProjectBody({ view, projectId, identity, room, snapshot, pulse, onShow }: BodyProps) {
  if (view === 'studio')
    return <StudioShell projectId={projectId} identity={identity} room={room} snapshot={snapshot} />
  const work = view === 'work'
  return (
    <>
      <main className={`page${work ? ' split' : ''}`}>
        {view === 'goals' || work ? (
          <GoalList snapshot={snapshot} projectId={projectId} identity={identity} controls={work} />
        ) : (
          <PendingView view={view} />
        )}
        {work && pulse}
      </main>
      <MiniDock room={room} onOpen={() => onShow('studio')} />
    </>
  )
}

/** Copies the Studio link, not the current view: the other person opens the shared room. */
function CopyLinkButton({ projectId }: { projectId: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${routePath({ projectId, view: 'studio' })}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable: the address bar still has the link.
    }
  }
  return (
    <button
      type="button"
      className="ghost copy-link"
      aria-label={copied ? 'Link copied' : 'Copy link'}
      title="Copy the room’s link"
      onClick={() => void copy()}
    >
      <Icon name="link" size={16} />
      <SwapLabel value={copied ? 'copied' : 'copy'} labels={{ copy: 'Copy link', copied: 'Link copied' }} />
    </button>
  )
}

const NOTICE: Record<Blocked, { title: string; body: (name: string) => string; action: 'leave' | 'retry' }> = {
  expired: { title: 'Your session ended', body: () => 'Sign in again to continue.', action: 'leave' },
  denied: {
    title: 'No access to this project',
    body: (name) => `${name} isn’t a member. Ask a project admin to add you, or open another project.`,
    action: 'leave',
  },
  unreachable: {
    title: 'Sophia is unreachable',
    body: () => 'The project couldn’t be loaded. Nothing was changed.',
    action: 'retry',
  },
}

interface NoticeProps {
  blocked: Blocked
  identityName: string
  onLeave: () => void
  onRetry: () => void
}

function AccessNotice({ blocked, identityName, onLeave, onRetry }: NoticeProps) {
  const notice = NOTICE[blocked]
  return (
    <main className="page notice">
      <h2>{notice.title}</h2>
      <p>{notice.body(identityName)}</p>
      {notice.action === 'leave' ? (
        <button type="button" className="pill" onClick={onLeave}>
          Back to projects
        </button>
      ) : (
        <button type="button" className="pill" onClick={onRetry}>
          Try again
        </button>
      )}
    </main>
  )
}
