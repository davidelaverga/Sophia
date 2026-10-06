// ProjectShell (architecture 04 §3): project header, view navigation, the one project feed every view
// shares, and the room connection, which outlives view changes: joining in Studio and reading Goals
// keeps you in the room. Views change the address, never the project. The call also outlives leaving the
// project for home or the personal space: the shell stays mounted out of sight (`background`), takes no keys,
// and reports the call upward (`onCall`) so the places' bar shows it with Leave one tap away.
import { taskPeople } from '../artifacts/task-view.ts'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Membership, Snapshot } from '@sophia/contracts'
import { Icon, SwapLabel, Tip } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { projectTitle, useDocumentTitle } from '../../app/document-title.ts'
import { routePath, type View } from '../../app/route.ts'
import { useShortcuts } from '../../app/shortcuts.ts'
import { VISION } from '../../app/vision.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { LobbyPanel } from '../access/LobbyPanel.tsx'
import { canInvite, useMembership, type SheetContext } from '../access/useAccess.ts'
import { DocumentViewerProvider } from '../artifacts/DocumentViewer.tsx'
import { KnowledgeReports } from '../artifacts/KnowledgeReports.tsx'
import { sendingOf } from '../voice/CallSwitches.tsx'
import { MiniDock, RoomSwitches } from '../voice/MiniDock.tsx'
import { CallInReach } from '../../app/call-in-reach.tsx'
import { shortName } from '../voice/room-view.ts'
import { lookingText } from '../voice/sophia-view.ts'
import { useHeldCaptions } from '../voice/StageCaptions.tsx'
import { useStageMade } from '../voice/StageMade.tsx'
import { showRenderOf } from '../voice/StagePresent.tsx'
import { ProjectSearch, SearchButton } from '../search/SearchSheet.tsx'
import { useCatchUp } from '../voice/CatchUp.tsx'
import { MeetingRecapOnLeave } from '../voice/MeetingRecap.tsx'
import { useProjectRoom, type LeaveHow, type ProjectRoom } from '../voice/useProjectRoom.ts'
import { GoalList, type GoalPlan } from '../work/GoalList.tsx'
import { WorkPulse } from '../work/WorkPulse.tsx'
import { PendingView } from './PendingView.tsx'
import { useKnownNames } from './useKnownNames.ts'
import { UpdatesView } from '../updates/UpdatesView.tsx'
import { Connections } from '../connections/Connections.tsx'
import { blockedBy, isStale, shownConnection, type Blocked } from './project-door.ts'
import { PanelCallSwitches, StudioShell, useRoomPanel, type RoomPanel } from './StudioShell.tsx'
import { useProjectFeed, type Connection } from './useProjectFeed.ts'
import { ViewNav } from './ViewNav.tsx'
import { Mark } from '../../app/Mark.tsx'

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

/**
 * The tab names the project and counts what waits: who is at its door, and the requests waiting on this person in
 * their tools (`resourcesWaiting`), so a tab in the background still calls.
 */
function useTabTitle(snapshot: Snapshot | undefined, resourcesWaiting = 0) {
  const waiting = (snapshot?.lobby.filter((e) => e.status === 'waiting').length ?? 0) + resourcesWaiting
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

/**
 * A call in this project's room, as the rest of the app sees it: where it is, what this person is sending (each shown
 * with its off switch wherever they are), and the room's own switches. Plain values and stable functions, so reporting
 * it upward re-renders nothing unless something a person can see changed.
 */
export interface ProjectCall {
  projectId: string
  title: string
  sending: { microphone: boolean; camera: boolean; screen: boolean }
  /** Text mode while it holds (Sophia not heard, the microphone off): said wherever the call shows. */
  textMode: boolean
  /** What Sophia is looking at, in words, or null: said wherever the call shows. */
  looking: string | null
  /** What stopped a device in this call, in words, or null. */
  note: string | null
  leave: (how?: LeaveHow) => Promise<void>
  setMicrophone: (on: boolean) => Promise<void>
  setCamera: (on: boolean) => Promise<void>
  setScreenShare: (on: boolean) => Promise<void>
  leaveTextMode: () => Promise<void>
}

interface Props {
  projectId: string
  view: View
  identity: Identity
  /** The account control (AccountMenu), the same in every bar. */
  account: React.ReactNode
  onShow: (view: View) => void
  /** Home: the two doors. A call goes on (the places' bar shows it). */
  onLeave: () => void
  /** Back to the projects, in Work: where a closed door sends you. */
  onWork: () => void
  onSignOut: () => void
  /** Out of sight while its call goes on: nothing here is on screen or takes a key. */
  background?: boolean
  /**
   * The call started or changed (what is being sent), or ended (null): with why (call-end.ts) when this person didn't
   * leave it, so wherever they are it can be said.
   */
  onCall?: (call: ProjectCall | null, ended?: string | null) => void
  /** Opened by "Join the room": join as soon as the room can. */
  joinOnOpen?: boolean
  onJoinHandled?: () => void
  /**
   * The Resources view's content, once something serves the project's resources (SCM-01/02); until then the view says
   * it is coming. The resource fixture fills it (fixtures/resources.tsx).
   */
  resources?: React.ReactNode
  /**
   * Each goal's plan from the lead, by the goal's id, shown in Tasks inside that goal's row, once something serves
   * plans (SCM-04, LFE-07.1); until then Tasks shows the goals alone. The work fixture fills it (fixtures/work.tsx).
   * Each plan's board needs the open requests (`actions`), or no waiting task says whom it waits on.
   */
  plans?: Readonly<Record<string, GoalPlan>>
  /** Requests waiting on this person in their own tools (ResourcePanel's actions): counted in the tab's title. */
  resourcesWaiting?: number
}

/**
 * Tells the app whether this project's room holds a call, and what the call's other places must say (what this person
 * sends, text mode, what Sophia is looking at, what stopped a device), whenever that changes.
 */
function useReportCall(
  projectId: string,
  title: string | undefined,
  room: ProjectRoom,
  looking: string | null,
  onCall: Props['onCall'],
) {
  const report = useRef(onCall)
  const latest = useRef(room)
  useEffect(() => {
    report.current = onCall
    latest.current = room
  })
  const [switches] = useState(() => ({
    leave: (how?: LeaveHow) => latest.current.leave(how),
    setMicrophone: (on: boolean) => latest.current.setMicrophone(on),
    setCamera: (on: boolean) => latest.current.setCamera(on),
    setScreenShare: (on: boolean) => latest.current.setScreenShare(on),
    leaveTextMode: () => latest.current.setTextMode(false),
  }))
  const { microphone, camera, screen } = sendingOf(room.participants.find((p) => p.local))
  const inCall = isInCall(room)
  const { textMode, mediaError: note } = room
  useEffect(() => {
    const sending = { microphone, camera, screen }
    const call = { projectId, title: title ?? 'the project', sending, textMode, looking, note, ...switches }
    // Out of the call, the room's note says why it ended when this person didn't leave (useProjectRoom).
    report.current?.(inCall ? call : null, inCall ? null : latest.current.error)
  }, [inCall, projectId, title, microphone, camera, screen, textMode, looking, note, switches])
  useEffect(() => () => report.current?.(null), [])
}

/** "Join the room" from Work: once the project has loaded and the room can be joined, join it, once. */
function useJoinOnOpen(room: ProjectRoom, joinOnOpen: boolean, onHandled: (() => void) | undefined) {
  const done = useRef(false)
  useEffect(() => {
    if (!joinOnOpen || done.current || !room.ready || room.status !== 'idle') return
    done.current = true
    void room.join()
    onHandled?.()
  }, [joinOnOpen, room, onHandled])
}

/**
 * What the shell does for the rest of the app: its tab title while on screen, its call reported, a join on arrival,
 * and no call kept behind a closed door.
 */
function useBeyondTheView(props: Props, snapshot: Snapshot | undefined, room: ProjectRoom, blocked: Blocked | null) {
  useLeaveBehindClosedDoor(blocked, room)
  useTabTitle(props.background ? undefined : snapshot, props.resourcesWaiting)
  const looking = lookingText(snapshot?.room.sophia, (id) => nameIn(room, id))
  useReportCall(props.projectId, snapshot?.title, room, looking, props.onCall)
  useJoinOnOpen(room, props.joinOnOpen ?? false, props.onJoinHandled)
}

/** H goes home and W to the projects, from a project as from every place; I invites, where the viewer may. */
function useProjectKeys(
  go: { onLeave: () => void; onWork: () => void; invite: () => void; search: () => void },
  inviting: boolean,
  mayInvite: boolean,
  shown: boolean,
) {
  useShortcuts({ h: go.onLeave, w: go.onWork }, !inviting)
  useShortcuts({ i: go.invite }, mayInvite && !inviting)
  // `/` searches the project (A13, behind the vision flag).
  useShortcuts({ '/': go.search }, VISION && shown && !inviting)
}

/** While a call is live in view, a sheet that covers the room's own switches shows them (SheetCall). */
function CallKeptInReach({
  room,
  background,
  children,
}: {
  room: ProjectRoom
  background: boolean
  children: React.ReactNode
}) {
  const call = isInCall(room) && !background ? <RoomSwitches room={room} side="bottom" /> : null
  return <CallInReach.Provider value={call}>{children}</CallInReach.Provider>
}

export function ProjectShell(props: Props) {
  const { projectId, view, identity, account, onShow, onLeave, onWork, onSignOut } = props
  const { snapshot, feed, connection } = useProjectFeed(projectId, identity.name, identity.token)
  const room = useProjectRoom(projectId, identity.token, snapshot.data)
  const membership = useMembership(projectId, identity.name, identity.token).data
  const [inviting, setInviting] = useState(false)
  const [searching, setSearching] = useState(false)
  const search = () => setSearching(true)
  const loaded = snapshot.data !== undefined
  const blocked = blockedBy(snapshot.error, loaded)
  // Behind a closed door the project's last snapshot may still be in the cache: nothing acts on it (Invite, I).
  const shown = blocked ? undefined : snapshot.data
  const invite = () => setInviting(true)
  useBeyondTheView(props, snapshot.data, room, blocked)
  useProjectKeys({ onLeave, onWork, invite, search }, inviting, !!shown && canInvite(membership), !!shown)
  return (
    <CallKeptInReach room={room} background={!!props.background}>
      <div className="shell" data-view={view}>
        <ProjectHeader
          title={snapshot.data?.title ?? (blocked ? 'Unavailable' : 'Loading…')}
          connection={shownConnection(connection, blocked, isStale(snapshot.error, loaded))}
          nav={blocked ? null : <ViewNav projectId={projectId} view={view} onShow={onShow} />}
          share={shown && <HeadActions may={canInvite(membership)} projectId={projectId} go={{ invite, search }} />}
          account={account}
          onLeave={onLeave}
          onWork={onWork}
        />
        <OpeningNote loaded={loaded} blocked={blocked} />
        {inviting && shown && (
          <LazyInvite
            context={{ projectId, identity, membership, sessions: shown.sessions, lobby: shown.lobby }}
            onClose={() => setInviting(false)}
          />
        )}
        {blocked ? (
          <AccessNotice
            blocked={blocked}
            identityName={identity.name}
            actions={{ leave: onWork, retry: () => void snapshot.refetch(), signin: onSignOut }}
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
            background={!!props.background}
            resources={props.resources}
            plans={props.plans}
            search={{ open: searching, onClose: () => setSearching(false) }}
          />
        )}
      </div>
    </CallKeptInReach>
  )
}

interface HeaderProps {
  title: string
  /** The feed's state; null while the project can't be shown, where the notice below says why. */
  connection: Connection | null
  nav: React.ReactNode
  /** Invite (editors and admins) or copy the link (viewers). */
  share: React.ReactNode
  account: React.ReactNode
  onLeave: () => void
  onWork: () => void
}

/** The head's actions: Search (A13, the vision flag's), then Invite or the link to copy. */
function HeadActions(props: { may: boolean; projectId: string; go: { invite: () => void; search: () => void } }) {
  return (
    <>
      {VISION && <SearchButton onClick={props.go.search} />}
      <Share invites={props.may} projectId={props.projectId} onInvite={props.go.invite} />
    </>
  )
}

/** The invitation's sheet, loaded as it opens. */
function LazyInvite({ context, onClose }: { context: SheetContext; onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <InviteSheet context={context} onClose={onClose} />
    </Suspense>
  )
}

/**
 * The path to the project, as the places name it: the mark goes home, Work to the projects. Both keep a call going:
 * the places' bar shows the room, with Leave one tap away.
 */
function ProjectHeader({ title, connection, nav, share, account, onLeave, onWork }: HeaderProps) {
  const home = 'Home'
  return (
    <header className="topbar">
      <button type="button" className="mark has-tip" onClick={onLeave} aria-label={home}>
        <Mark live={connection === 'live'} />
        <span className="mark-word">Sophia</span>
        <Tip label={home} keys="H" side="bottom" />
      </button>
      <span className="crumb-sep" aria-hidden>
        /
      </span>
      <button type="button" className="crumb has-tip" onClick={onWork}>
        Work
        <Tip label="Your projects" keys="W" side="bottom" />
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
        {account}
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
  /** Kept out of sight for its call (the person is in the places): nothing in it is in view. */
  background: boolean
  resources: React.ReactNode
  plans: Readonly<Record<string, GoalPlan>> | undefined
  /** The project's search (A13): open from the head's Search, or `/`. */
  search: { open: boolean; onClose: () => void }
}

/**
 * Studio is the room itself; every other view is a page, with the room one click away in the mini dock.
 * The lobby shows on every view: someone waiting at the door should never depend on which page you read.
 * A report opens in the same viewer on every view (DocumentViewer), never beside the side panel.
 */
function ProjectBody(props: BodyProps) {
  const { view, projectId, identity, room, membership, snapshot, pulse, onShow, background } = props
  // The side panel's state lives here, past a visit to another view (useRoomPanel). Out of sight for its call, its open
  // tab isn't in view: what arrives there meanwhile is new when the person comes back.
  const panel = useRoomPanel(snapshot, room, view === 'studio' && !background)
  // So is the stage captions' hold: back from another view, what was said meanwhile has gone, as in the room.
  const captions = useHeldCaptions(room.captions)
  // And what Sophia made, once put away: it stays away past a visit to another view.
  const made = useStageMade(room.notices)
  const looking = lookingText(snapshot?.room.sophia, (id) => nameIn(room, id))
  // For whoever joined late, the meeting so far (A13): its card goes on the stage, its sheet on the page.
  const catchUp = useCatchUp(room, { projectId, identity, me: membership?.actorId ?? '', names: useKnownNames(room) })
  const withViewer = (body: React.ReactNode) => (
    <WithViewer {...props} panel={panel} looking={looking}>
      {body}
      <ProjectSheets {...props} panel={panel} catchUp={catchUp.sheet} />
    </WithViewer>
  )
  const lobby = (
    <LobbyPanel
      projectId={projectId}
      identity={identity}
      lobby={snapshot?.lobby ?? []}
      canDecide={canInvite(membership)}
    />
  )
  if (view === 'studio') {
    return withViewer(
      <>
        {lobby}
        <StudioShell
          projectId={projectId}
          identity={identity}
          room={room}
          snapshot={snapshot}
          panel={panel}
          looking={looking}
          captions={captions}
          made={made}
          catchUp={catchUp.card}
          background={background}
        />
      </>,
    )
  }
  const work = view === 'work'
  // A served Resources view takes the page's whole width: its tiles fill it. So does Tasks with a plan, its pulse under.
  const resources = view === 'resources' ? props.resources : undefined
  return withViewer(
    <>
      {lobby}
      <main className={pageClass(work, props.plans)}>
        {resources ?? <PageBody {...props} />}
        {work && pulse}
      </main>
      <MiniDock room={room} looking={looking} onOpen={() => onShow('studio')} />
    </>,
  )
}

/**
 * The project's sheets that belong to no view (A12, A13, behind the vision flag): what the meeting left, on leaving it
 * from any view; the meeting so far; the search. After the page, so they open on top of any sheet the page has open,
 * and in the same place in every view, so switching views keeps them.
 */
function ProjectSheets(props: BodyProps & { panel: RoomPanel; catchUp: React.ReactNode }) {
  const { projectId, identity, room, snapshot, membership, panel, onShow } = props
  if (!VISION) return null
  return (
    <>
      <MeetingRecapOnLeave {...{ projectId, identity, room, snapshot, membership }} />
      {props.catchUp}
      <ProjectSearch
        {...{ projectId, identity, snapshot, membership, room }}
        {...props.search}
        onBrief={() => {
          onShow('studio')
          // Opened as its toggle opens it, so closing it gives the focus back there.
          if (panel.panel !== 'brief') panel.toggle('brief')
        }}
      />
    </>
  )
}

interface ViewerProps extends BodyProps {
  panel: RoomPanel
  /** What Sophia is looking at, in words, or null (lookingText). */
  looking: string | null
  children: React.ReactNode
}

/**
 * The report viewer around a view: opening a report closes the side panel, and opening the panel closes the report. In
 * the room the pane covers the panel's toggles, so its head offers the chat. Where it covers the dock or the mini dock
 * (a phone, the full page), its head carries the call's switches and note, as the side panel's does (LFE-02.1).
 */
function WithViewer({ projectId, identity, view, room, panel, looking, snapshot, children }: ViewerProps) {
  const studio = view === 'studio'
  return (
    <DocumentViewerProvider
      projectId={projectId}
      identity={identity}
      // The side panel is the room's: a chat left open there is not open on another page.
      panelOpen={studio && panel.panel !== null}
      closePanel={() => panel.show(null)}
      openChat={studio ? () => panel.toggle('chat') : undefined}
      askAbout={studio ? panel.ask : undefined}
      people={studio && isInCall(room) ? taskPeople(room.participants) : undefined}
      cursor={snapshot?.cursor}
      show={studio ? showRenderOf(snapshot, room, { projectId, identity }) : undefined}
      chatUnread={panel.unread}
      call={<PanelCallSwitches room={room} looking={looking} keys={studio} />}
      note={room.mediaError ?? room.error}
    >
      {children}
    </DocumentViewerProvider>
  )
}

/** Tasks beside its pulse; with a plan, Tasks takes the page's width and its pulse goes under. */
function pageClass(work: boolean, plans: BodyProps['plans']): string {
  if (!work) return 'page'
  return Object.keys(plans ?? {}).length > 0 ? 'page planned' : 'page split'
}

/**
 * A page other than the room: Goals and Work list the goals (Tasks with each goal's plan), Knowledge its reports; the
 * views still to come say so.
 */
function PageBody(props: BodyProps) {
  const { view, projectId, identity, membership, snapshot, onShow, onInvite, plans } = props
  if (view === 'knowledge') {
    return (
      <>
        <KnowledgeReports projectId={projectId} identity={identity} canEdit={canInvite(membership)} />
        {VISION && <Connections projectId={projectId} identity={identity} title={snapshot?.title ?? 'This project'} />}
      </>
    )
  }
  if (view === 'goals' || view === 'work') {
    return (
      <GoalList
        snapshot={snapshot}
        projectId={projectId}
        identity={identity}
        controls={view === 'work'}
        canAct={canInvite(membership)}
        plans={view === 'work' ? plans : undefined}
        onOpenStudio={() => onShow('studio')}
        onInvite={onInvite}
      />
    )
  }
  if (view === 'updates' && VISION) {
    const inCall = props.room.status === 'live' || props.room.status === 'reconnecting'
    return <UpdatesView {...{ projectId, identity, snapshot, membership, inCall }} />
  }
  return view === 'studio' ? null : <PendingView view={view} onShow={onShow} />
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
