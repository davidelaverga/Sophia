// ProjectShell (architecture 04 §3): project header, view navigation, the one project feed every view
// shares, and the room connection, which outlives view changes: joining in Studio and reading Goals
// keeps you in the room. Views change the address, never the project.
import { lazy, Suspense, useEffect, useState } from 'react'
import type { Membership, Snapshot } from '@sophia/contracts'
import { Icon, SwapLabel, Tip } from '@sophia/ui'
import { ApiError } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { forgetProject, rememberProject } from '../../app/recent-projects.ts'
import { routePath, type View } from '../../app/route.ts'
import { useShortcuts } from '../../app/shortcuts.ts'
import { LobbyPanel } from '../access/LobbyPanel.tsx'
import { canInvite, useMembership } from '../access/useAccess.ts'
import { MiniDock } from '../voice/MiniDock.tsx'
import { useProjectRoom, type ProjectRoom } from '../voice/useProjectRoom.ts'
import { GoalList } from '../work/GoalList.tsx'
import { WorkPulse } from '../work/WorkPulse.tsx'
import { PendingView } from './PendingView.tsx'
import { StudioShell } from './StudioShell.tsx'
import { useProjectFeed, type Connection } from './useProjectFeed.ts'
import { ViewNav } from './ViewNav.tsx'

// The Invite sheet (and its QR encoder) loads the first time someone opens it.
const InviteSheet = lazy(() => import('../access/InviteSheet.tsx').then((m) => ({ default: m.InviteSheet })))

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

/** The home screen lists what this device opened; a project that closed its door leaves the list. */
function useRecentProject(
  identity: string,
  projectId: string,
  snapshot: Snapshot | undefined,
  blocked: Blocked | null,
) {
  const title = snapshot?.title
  useEffect(() => {
    if (title) rememberProject(identity, { id: projectId, title, openedAt: Date.now() })
  }, [identity, projectId, title])
  useEffect(() => {
    if (blocked === 'denied') forgetProject(identity, projectId)
  }, [identity, projectId, blocked])
}

/** The tab names the project and counts who waits at its door, so a tab in the background still calls. */
function useTabTitle(snapshot: Snapshot | undefined) {
  const title = snapshot?.title
  const waiting = snapshot?.lobby.filter((e) => e.status === 'waiting').length ?? 0
  useEffect(() => {
    if (!title) return undefined
    document.title = waiting > 0 ? `(${waiting}) ${title} · Sophia` : `${title} · Sophia`
    return () => {
      document.title = 'Sophia Studio'
    }
  }, [title, waiting])
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
  const membership = useMembership(projectId, identity.name, identity.token).data
  const [inviting, setInviting] = useState(false)
  const blocked = blockedBy(snapshot.error)
  useRecentProject(identity.name, projectId, snapshot.data, blocked)
  useTabTitle(snapshot.data)
  useShortcuts({ i: () => setInviting(true) }, !!snapshot.data && canInvite(membership) && !inviting)
  return (
    <div className="shell" data-view={view}>
      <ProjectHeader
        title={snapshot.data?.title ?? (blocked ? 'Unavailable' : 'Loading…')}
        connection={connection}
        nav={blocked ? null : <ViewNav projectId={projectId} view={view} onShow={onShow} />}
        share={
          snapshot.data ? (
            canInvite(membership) ? (
              <InviteButton onClick={() => setInviting(true)} />
            ) : (
              <CopyLinkButton projectId={projectId} />
            )
          ) : null
        }
        identitySwitcher={identitySwitcher}
        onLeave={onLeave}
      />
      {inviting && snapshot.data && (
        <Suspense fallback={null}>
          <InviteSheet
            context={{ projectId, identity, membership, sessions: snapshot.data.sessions, lobby: snapshot.data.lobby }}
            onClose={() => setInviting(false)}
          />
        </Suspense>
      )}
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
          membership={membership}
          snapshot={snapshot.data}
          pulse={<WorkPulse feed={feed} connection={connection} />}
          onShow={onShow}
        />
      )}
    </div>
  )
}

interface HeaderProps {
  title: string
  connection: Connection
  nav: React.ReactNode
  /** Invite (editors and admins) or copy the link (viewers). */
  share: React.ReactNode
  identitySwitcher: React.ReactNode
  onLeave: () => void
}

function ProjectHeader({ title, connection, nav, share, identitySwitcher, onLeave }: HeaderProps) {
  return (
    <header className="topbar">
      <button type="button" className="mark has-tip" onClick={onLeave} aria-label="Home">
        <span className="mark-dot" data-live={connection === 'live' || undefined} aria-hidden />
        <span className="mark-word">Sophia</span>
        <Tip label="Home" side="bottom" />
      </button>
      <span className="crumb-sep" aria-hidden>
        /
      </span>
      <h1 className="project-name">{title}</h1>
      {nav}
      <div className="topbar-end">
        <span role="status" className="connection" data-state={connection} title={CONNECTION[connection]}>
          <span className="connection-dot" aria-hidden />
          <span className="connection-label">{CONNECTION[connection]}</span>
        </span>
        {share}
        {identitySwitcher}
      </div>
    </header>
  )
}

function InviteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ghost invite-button has-tip" aria-label="Invite" onClick={onClick}>
      <Icon name="invite" />
      <span className="invite-label">Invite</span>
      <Tip label="Invite people" keys="I" side="bottom" align="end" />
    </button>
  )
}

interface BodyProps {
  view: View
  projectId: string
  identity: Identity
  room: ProjectRoom
  membership: Membership | undefined
  snapshot: Snapshot | undefined
  pulse: React.ReactNode
  onShow: (view: View) => void
}

/**
 * Studio is the room itself; every other view is a page, with the room one click away in the mini dock.
 * The lobby shows on every view: someone waiting at the door should never depend on which page you read.
 */
function ProjectBody({ view, projectId, identity, room, membership, snapshot, pulse, onShow }: BodyProps) {
  const lobby = (
    <LobbyPanel
      projectId={projectId}
      identity={identity}
      lobby={snapshot?.lobby ?? []}
      canDecide={canInvite(membership)}
    />
  )
  if (view === 'studio') {
    return (
      <>
        {lobby}
        <StudioShell projectId={projectId} identity={identity} room={room} snapshot={snapshot} />
      </>
    )
  }
  const work = view === 'work'
  return (
    <>
      {lobby}
      <main className={`page${work ? ' split' : ''}`}>
        {view === 'goals' || work ? (
          <GoalList snapshot={snapshot} projectId={projectId} identity={identity} controls={work} />
        ) : (
          <PendingView view={view} onShow={onShow} />
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
      onClick={() => void copy()}
    >
      <Icon name="link" />
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
