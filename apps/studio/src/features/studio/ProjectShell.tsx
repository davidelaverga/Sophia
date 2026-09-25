// ProjectShell (architecture 04 §3): project header, view navigation and the one project feed every view
// shares. Views change the address, never the project; the pulse stays with the views about work.
import { useState } from 'react'
import type { Snapshot } from '@sophia/contracts'
import { Tag, type Tone } from '@sophia/ui'
import { ApiError } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { routePath, type View } from '../../app/route.ts'
import { SophiaDock } from '../voice/SophiaDock.tsx'
import { GoalList } from '../work/GoalList.tsx'
import { WorkPulse } from '../work/WorkPulse.tsx'
import { PendingView } from './PendingView.tsx'
import { StudioShell } from './StudioShell.tsx'
import { useProjectFeed, type Connection } from './useProjectFeed.ts'
import { ViewNav } from './ViewNav.tsx'

const CONNECTION: Record<Connection, { label: string; tone: Tone }> = {
  connecting: { label: 'Connecting', tone: 'muted' },
  live: { label: 'Live', tone: 'teal' },
  reconnecting: { label: 'Reconnecting', tone: 'amber' },
  resyncing: { label: 'Resyncing', tone: 'amber' },
  denied: { label: 'No access', tone: 'rose' },
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
  const blocked = blockedBy(snapshot.error)
  const withPulse = view === 'studio' || view === 'work'
  return (
    <div className="shell">
      <ProjectHeader
        title={snapshot.data?.title ?? (blocked ? 'Unavailable' : 'Loading…')}
        connection={connection}
        projectId={snapshot.data ? projectId : null}
        identitySwitcher={identitySwitcher}
        onLeave={onLeave}
      />
      {blocked ? (
        <AccessNotice
          blocked={blocked}
          identityName={identity.name}
          onLeave={onLeave}
          onRetry={() => void snapshot.refetch()}
        />
      ) : (
        <>
          <ViewNav projectId={projectId} view={view} onShow={onShow} />
          <main className={`stage${withPulse ? '' : ' wide'}`}>
            <ViewBody view={view} snapshot={snapshot.data} projectId={projectId} identity={identity} />
            {withPulse && <WorkPulse feed={feed} connection={connection} />}
          </main>
          <SophiaDock projectId={projectId} identity={identity} snapshot={snapshot.data} />
        </>
      )}
    </div>
  )
}

interface ViewBodyProps {
  view: View
  snapshot: Snapshot | undefined
  projectId: string
  identity: Identity
}

function ViewBody({ view, snapshot, projectId, identity }: ViewBodyProps) {
  if (view === 'studio') return <StudioShell projectId={projectId} viewerName={identity.name} />
  if (view === 'goals' || view === 'work') {
    return <GoalList snapshot={snapshot} projectId={projectId} identity={identity} controls={view === 'work'} />
  }
  return <PendingView view={view} />
}

interface HeaderProps {
  title: string
  connection: Connection
  /** Shown only once the project loaded, so a copied link always works for its members. */
  projectId: string | null
  identitySwitcher: React.ReactNode
  onLeave: () => void
}

function ProjectHeader({ title, connection, projectId, identitySwitcher, onLeave }: HeaderProps) {
  const conn = CONNECTION[connection]
  return (
    <header className="topbar">
      <button type="button" className="brand quiet" onClick={onLeave} title="All projects">
        <span className={`orb${connection === 'live' ? ' ready' : ''}`} aria-hidden />
        <span className="brand-name">Sophia</span>
      </button>
      <div className="project-title">
        <span className="eyebrow">Project</span>
        <h1>{title}</h1>
      </div>
      <div className="topbar-end">
        <span role="status">
          <Tag tone={conn.tone}>{conn.label}</Tag>
        </span>
        {projectId && <CopyLinkButton projectId={projectId} />}
        {identitySwitcher}
      </div>
    </header>
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
    <button type="button" className="quiet" onClick={() => void copy()}>
      {copied ? 'Link copied' : 'Copy link'}
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
    <main className="stage single">
      <section className="notice">
        <h2>{notice.title}</h2>
        <p>{notice.body(identityName)}</p>
        {notice.action === 'leave' ? (
          <button type="button" onClick={onLeave}>
            Back to projects
          </button>
        ) : (
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        )}
      </section>
    </main>
  )
}
