// ProjectShell (architecture 04 §3): project header, view navigation, the one project feed every view
// shares, and the room connection, which outlives view changes: joining in Studio and reading Goals
// keeps you in the room. Views change the address, never the project.
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Membership, Snapshot } from '@sophia/contracts'
import { Icon, SwapLabel, Tip } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { projectTitle, useDocumentTitle } from '../../app/document-title.ts'
import { forgetProject, rememberProject } from '../../app/recent-projects.ts'
import { routePath, type View } from '../../app/route.ts'
import { useShortcuts } from '../../app/shortcuts.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { LobbyPanel } from '../access/LobbyPanel.tsx'
import { canInvite, useMembership } from '../access/useAccess.ts'
import { MiniDock } from '../voice/MiniDock.tsx'
import { shortName } from '../voice/room-view.ts'
import { lookingText } from '../voice/sophia-view.ts'
import { useProjectRoom, type ProjectRoom } from '../voice/useProjectRoom.ts'
import { GoalList } from '../work/GoalList.tsx'
import { WorkPulse } from '../work/WorkPulse.tsx'
import { PendingView } from './PendingView.tsx'
import { blockedBy, isStale, shownConnection, type Blocked } from './project-door.ts'
import { StudioShell } from './StudioShell.tsx'
import { useProjectFeed, type Connection } from './useProjectFeed.ts'
import { ViewNav } from './ViewNav.tsx'

// The Invite sheet (and its QR encoder) loads the first time someone opens it.
const InviteSheet = lazy(() => import('../access/InviteSheet.tsx').then((m) => ({ default: m.InviteSheet })))

/** The project feed, not the call: "Live" read as a call in progress, so it says whether the view is current. */
const CONNECTION: Record<Connection, string> = {
  connecting: 'Connecting',
  live: 'Up to date',
  reconnecting: 'Reconnecting',
  resyncing: 'Catching up',
  denied: 'No access',
}

/**
 * A closed door closes the call too. Signed out or no longer a member, the project's screen gives way to a notice
 * with no dock: the call must not stay open behind it with a microphone nobody can mute.
 */
function useLeaveBehindClosedDoor(blocked: Blocked | null, room: ProjectRoom) {
  const leave = useRef(room.leave)
  useEffect(() => {
    leave.current = room.leave
  })
  const closed = blocked === 'expired' || blocked === 'denied'
  useEffect(() => {
    if (closed) void leave.current()
  }, [closed])
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
  const waiting = snapshot?.lobby.filter((e) => e.status === 'waiting').length ?? 0
  useDocumentTitle(snapshot ? projectTitle(snapshot.title, waiting) : null)
}

/**
 * A project that is slow to open says so (useSlow.ts), where the lobby would float: under the bar, out of the way.
 * A project that cannot be shown has its notice instead.
 */
function OpeningNote({ loaded, blocked }: { loaded: boolean; blocked: Blocked | null }) {
  if (!useSlow(!loaded && !blocked)) return null
  return (
    <p className="wait-note arrive" role="status">
      {SLOW_NOTE}
    </p>
  )
}

const isInCall = (room: ProjectRoom) => room.status === 'live' || room.status === 'reconnecting'

interface ShareProps {
  invites: boolean
  projectId: string
  onInvite: () => void
}

/** Invite for editors and admins; for viewers, the project's link. */
function Share({ invites, projectId, onInvite }: ShareProps) {
  return invites ? <InviteButton onClick={onInvite} /> : <CopyLinkButton projectId={projectId} />
}

interface Props {
  projectId: string
  view: View
  identity: Identity
  identitySwitcher: React.ReactNode
  onShow: (view: View) => void
  onLeave: () => void
  onSignOut: () => void
}

export function ProjectShell(props: Props) {
  const { projectId, view, identity, identitySwitcher, onShow, onLeave, onSignOut } = props
  const { snapshot, feed, connection } = useProjectFeed(projectId, identity.name, identity.token)
  const room = useProjectRoom(projectId, identity.token, snapshot.data)
  const membership = useMembership(projectId, identity.name, identity.token).data
  const [inviting, setInviting] = useState(false)
  const loaded = snapshot.data !== undefined
  const blocked = blockedBy(snapshot.error, loaded)
  const invite = () => setInviting(true)
  useLeaveBehindClosedDoor(blocked, room)
  useRecentProject(identity.name, projectId, snapshot.data, blocked)
  useTabTitle(snapshot.data)
  useShortcuts({ i: invite }, loaded && canInvite(membership) && !inviting)
  return (
    <div className="shell" data-view={view}>
      <ProjectHeader
        title={snapshot.data?.title ?? (blocked ? 'Unavailable' : 'Loading…')}
        connection={shownConnection(connection, blocked, isStale(snapshot.error, loaded))}
        nav={blocked ? null : <ViewNav projectId={projectId} view={view} onShow={onShow} />}
        share={loaded && <Share invites={canInvite(membership)} projectId={projectId} onInvite={invite} />}
        identitySwitcher={identitySwitcher}
        inCall={isInCall(room)}
        onLeave={onLeave}
      />
      <OpeningNote loaded={loaded} blocked={blocked} />
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
          actions={{ leave: onLeave, retry: () => void snapshot.refetch(), signin: onSignOut }}
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
          onInvite={invite}
        />
      )}
    </div>
  )
}

interface HeaderProps {
  title: string
  /** The feed's state; null while the project can't be shown, where the notice below says why. */
  connection: Connection | null
  nav: React.ReactNode
  /** Invite (editors and admins) or copy the link (viewers). */
  share: React.ReactNode
  identitySwitcher: React.ReactNode
  /** In the call: going home leaves it, and the way there says so before it is pressed. */
  inCall: boolean
  onLeave: () => void
}

function ProjectHeader({ title, connection, nav, share, identitySwitcher, inCall, onLeave }: HeaderProps) {
  const home = inCall ? 'Home: you leave the room' : 'Home'
  return (
    <header className="topbar">
      <button type="button" className="mark has-tip" onClick={onLeave} aria-label={home}>
        <span className="mark-dot" data-live={connection === 'live' || undefined} aria-hidden />
        <span className="mark-word">Sophia</span>
        <Tip label={home} side="bottom" />
      </button>
      <span className="crumb-sep" aria-hidden>
        /
      </span>
      <h1 className="project-name">{title}</h1>
      {nav}
      <div className="topbar-end">
        {connection && (
          <span role="status" className="connection" data-state={connection} title={CONNECTION[connection]}>
            <span className="connection-dot" aria-hidden />
            <span className="connection-label">{CONNECTION[connection]}</span>
          </span>
        )}
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
  onInvite: () => void
}

/**
 * Studio is the room itself; every other view is a page, with the room one click away in the mini dock.
 * The lobby shows on every view: someone waiting at the door should never depend on which page you read.
 */
function ProjectBody(props: BodyProps) {
  const { view, projectId, identity, room, membership, snapshot, pulse, onShow, onInvite } = props
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
          <GoalList
            snapshot={snapshot}
            projectId={projectId}
            identity={identity}
            controls={work}
            canAct={canInvite(membership)}
            onOpenStudio={() => onShow('studio')}
            onInvite={onInvite}
          />
        ) : (
          <PendingView view={view} onShow={onShow} />
        )}
        {work && pulse}
      </main>
      <MiniDock
        room={room}
        looking={lookingText(snapshot?.room.sophia, (id) => nameIn(room, id))}
        onOpen={() => onShow('studio')}
      />
    </>
  )
}

/** A person's short name in the room ('you' for yourself), for the observation indicator. */
function nameIn(room: ProjectRoom, identity: string): string {
  const p = room.participants.find((q) => q.identity === identity)
  if (!p) return 'someone'
  return p.local ? 'you' : shortName(p.name)
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
  // A viewer's link opens the project only for its members: the tip says so, so nobody mistakes it for an invitation.
  return (
    <button
      type="button"
      className="ghost copy-link has-tip"
      aria-label={copied ? 'Link copied' : 'Copy project link'}
      onClick={() => void copy()}
    >
      <Icon name="link" />
      <SwapLabel value={copied ? 'copied' : 'copy'} labels={{ copy: 'Copy project link', copied: 'Link copied' }} />
      <Tip label="For project members. To bring someone new, ask an editor to invite them." side="bottom" align="end" />
    </button>
  )
}

type NoticeAction = 'leave' | 'retry' | 'signin'

const NOTICE: Record<Blocked, { title: string; body: (name: string) => string; action: NoticeAction }> = {
  expired: { title: 'You’ve been signed out', body: () => 'Sign in again to continue.', action: 'signin' },
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

const ACTION_LABEL: Record<NoticeAction, string> = {
  leave: 'Back to projects',
  retry: 'Try again',
  signin: 'Sign in again',
}

interface NoticeProps {
  blocked: Blocked
  identityName: string
  actions: Record<NoticeAction, () => void>
}

function AccessNotice({ blocked, identityName, actions }: NoticeProps) {
  const notice = NOTICE[blocked]
  return (
    <main className="page notice">
      <h2>{notice.title}</h2>
      <p>{notice.body(identityName)}</p>
      <button type="button" className="pill" onClick={actions[notice.action]}>
        {ACTION_LABEL[notice.action]}
      </button>
    </main>
  )
}
