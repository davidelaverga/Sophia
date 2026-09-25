// renderRoom → StudioShell (frontend bindings): project snapshot + event stream.
// Minimal S1-02 view: goals with their controls and the work pulse. Lenses, dock and room come in S1-04.
import { useState } from 'react'
import type { Snapshot } from '@sophia/contracts'
import { Tag, type Tone } from '@sophia/ui'
import { ApiError } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { GoalCard } from '../work/GoalCard.tsx'
import { WorkPulse } from '../work/WorkPulse.tsx'
import { useProjectFeed, type Connection } from './useProjectFeed.ts'

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
  identity: Identity
  identitySwitcher: React.ReactNode
  onLeave: () => void
}

export function StudioShell({ projectId, identity, identitySwitcher, onLeave }: Props) {
  const { snapshot, feed, connection } = useProjectFeed(projectId, identity.name, identity.token)
  const blocked = blockedBy(snapshot.error)
  return (
    <div className="shell">
      <StudioHeader
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
        <main className="stage">
          <GoalList snapshot={snapshot.data} projectId={projectId} identity={identity} />
          <WorkPulse feed={feed} connection={connection} />
        </main>
      )}
    </div>
  )
}

interface HeaderProps {
  title: string
  connection: Connection
  /** Shown only once the project loaded, so a copied link always works for its members. */
  projectId: string | null
  identitySwitcher: React.ReactNode
  onLeave: () => void
}

function StudioHeader({ title, connection, projectId, identitySwitcher, onLeave }: HeaderProps) {
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

function CopyLinkButton({ projectId }: { projectId: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/projects/${projectId}`)
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

interface GoalListProps {
  snapshot: Snapshot | undefined
  projectId: string
  identity: Identity
}

function GoalList({ snapshot, projectId, identity }: GoalListProps) {
  return (
    <section className="goals" aria-labelledby="goals-title">
      <div className="section-head">
        <h2 id="goals-title">Goals</h2>
        {snapshot && <span className="muted">{snapshot.goals.length}</span>}
      </div>
      {!snapshot && <div className="goal skeleton" aria-busy="true" />}
      {snapshot?.goals.length === 0 && <p className="empty">No goals yet.</p>}
      {snapshot?.goals.map((g) => (
        <GoalCard key={g.id} goal={g} projectId={projectId} identity={identity} />
      ))}
    </section>
  )
}
