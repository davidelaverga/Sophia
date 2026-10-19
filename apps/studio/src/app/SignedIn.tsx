// The signed-in Studio (docs/plans/signed-in-later.md): Home, the personal space and the projects, with what keeps
// them together. Its own chunk: a sign-in page never downloads it; App loads it once a session is there.
import { withoutResources } from '../api/needs.ts'
import type { ProjectList, Snapshot } from '@sophia/contracts'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { callEnded, NOTICE } from '../features/personal/notice-view.ts'
import { Places, type Opening } from '../features/personal/Places.tsx'
import type { InCall } from '../features/personal/PlacesBar.tsx'
import { OPEN } from '../features/personal/lock.ts'
import { useLock, useUnlockOnReturn } from '../features/personal/useLock.ts'
import { useCallSeen } from '../features/personal/useSinceNews.ts'
import { ProjectShell, type ProjectCall } from '../features/studio/ProjectShell.tsx'
import { snapshotKey } from '../features/studio/useProjectFeed.ts'
import { AccountMenu } from './AccountMenu.tsx'
import { forgetPersonalReads } from './account-cache.ts'
import { accountOf } from './auth-callback.ts'
import { oneCall } from './one-call.ts'
import { OpeningPrepares } from './opening-prepares.ts'
import type { Identity } from './dev-identity.ts'
import { joinStands, projectOnScreen, shownView, type Place } from './route.ts'
import { ATTENTION } from './attention.ts'
import { CONVERSATIONS, VISION } from './vision.ts'
import { ShortcutScope } from './shortcuts.ts'
import { SIGN_OUT_FAILED } from './sign-out.ts'
import { Toast, useToast, type ShowToast } from './Toast.tsx'
import type { useProjectRoute } from './useProjectRoute.ts'

interface SignedInProps {
  identity: Identity
  notice: string | undefined
  routing: ReturnType<typeof useProjectRoute>
  onChooseDev: (identity: Identity | null) => void
  /** This device's sign-out: resolves to whether it went through (sign-out-failed.md). */
  onSignOut: () => Promise<boolean>
  /** Every device the account is on (sign-out-scope.md): Settings' «Sign out of all devices». */
  onSignOutEverywhere: () => Promise<boolean>
}

/**
 * Told when a call ends: the call as it was, why when this person didn't leave it (call-end.ts), and the project whose
 * opening ended it (useOneCallInSight), or null.
 */
type OnEnded = (call: ProjectCall, note: string | null, opened: string | null) => void

/**
 * One call at a time, wherever the person is (one-call.ts). A project whose room holds the call stays mounted when the
 * person goes home or to their personal space (out of sight, taking no keys), so the call goes on; the places' bar
 * shows it. A call starting in another project ends the one before, without a word: the person asked for the new one.
 * `leaveFor` leaves a call because another project opened, and its end says which (call-ends-on-open.md). What a call
 * held was in front of the person, so Home never tells them it as news once it ends (home-since-you-looked.md).
 */
function useCall(ended: RefObject<OnEnded | null>, identity: Identity) {
  const [call, setCall] = useState<ProjectCall | null>(null)
  const [one] = useState(() => oneCall<ProjectCall>())
  useCallSeen(identity, call?.projectId ?? null)
  const report = useCallback(
    (projectId: string, next: ProjectCall | null, note: string | null = null) => {
      const said = one.report(projectId, next)
      if (!said) return
      if (said.leave) void said.leave.leave()
      setCall(next)
      if (said.ended) ended.current?.(said.ended.call, note, said.ended.opened)
    },
    [ended, one],
  )
  const leaveFor = useCallback(
    (left: ProjectCall, opened: string) => {
      if (one.leaving(left, opened)) void left.leave()
    },
    [one],
  )
  return [call, report, leaveFor] as const
}

/**
 * The call as the places' bar shows it: where, what is being sent, text mode, what Sophia is looking at, what stopped a
 * device, back to it, and each off switch.
 */
const inCall = (call: ProjectCall, onReturn: () => void): InCall & { projectId: string } => ({
  projectId: call.projectId,
  title: call.title,
  sending: call.sending,
  textMode: call.textMode,
  looking: call.looking,
  note: call.note,
  onReturn,
  onVoice: () => void call.leaveTextMode(),
  // Quiet: the call's project goes with the call from here, so no recap could show (MeetingRecap; A13's Updates will).
  onLeave: () => void call.leave(),
  onMicrophone: (on) => void call.setMicrophone(on),
  onCamera: (on) => void call.setCamera(on),
  onScreen: (on) => void call.setScreenShare(on),
})

/** A project's title as this page last read it for `viewer`: in Work's list, else its own snapshot; null if neither. */
const titleRead = (client: QueryClient, viewer: string, projectId: string): string | null =>
  client.getQueryData<ProjectList>(['projects', viewer])?.projects.find((p) => p.projectId === projectId)?.title ??
  client.getQueryData<Snapshot>(snapshotKey(projectId, viewer))?.title ??
  null

/**
 * A call that ends says so in the toast where its room can't (callEnded): when opening another project ended it, with
 * Rejoin, which opens the call's project and joins it. So does a sign-in link that failed.
 */
function useSayings(input: {
  ended: RefObject<OnEnded | null>
  say: ShowToast
  project: string | null
  notice: string | undefined
  /** The account whose reads name the opened project (titleRead). */
  viewer: string
  /** A project opened, its call joined when asked (opening). */
  open: (projectId: string, joins: boolean) => void
}) {
  const { ended, say, project, notice, viewer, open } = input
  const client = useQueryClient()
  useEffect(() => {
    ended.current = (endedCall, note, opened) => {
      const how = opened === null ? {} : { opened: titleRead(client, viewer, opened) }
      const said = callEnded({ title: endedCall.title, note, here: project === endedCall.projectId, ...how })
      if (said?.act) say(said.message, () => open(endedCall.projectId, true), said.act)
      else if (said) say(said.message)
    }
  })
  useEffect(() => {
    if (notice) say(notice)
  }, [notice, say])
}

/**
 * "Join the room" from Work: the project joins as soon as it can, on that opening only (joinStands). Leaving it before
 * then (home, Back, a closed door) drops the request, so a later visit never joins on its own.
 */
function useJoinRequest(onScreen: string | null) {
  const [joining, setJoining] = useState<string | null>(null)
  const stands = joinStands(joining, onScreen)
  useEffect(() => {
    if (joining !== stands) setJoining(stands)
  }, [joining, stands])
  return { joining: stands, ask: setJoining, handled: () => setJoining(null) }
}

/**
 * One call, and the project or place on screen with it: opening another project leaves the call (the toast says
 * so, with Rejoin), and the call's project stays on screen until it has (projectOnScreen). A project's bar has no room
 * for another room's call, and nothing may keep sending out of sight.
 */
function useOneCallInSight(
  call: ProjectCall | null,
  project: string | null,
  leaveFor: (call: ProjectCall, opened: string) => void,
) {
  useEffect(() => {
    if (call && project && project !== call.projectId) leaveFor(call, project)
  }, [call, project, leaveFor])
}

/**
 * Nothing personal stays in memory while the padlock is shut, wherever the person is (Places may not be mounted), and
 * under every address the account had here (account-cache.ts).
 */
function useForgetWhileLocked(locked: boolean) {
  const client = useQueryClient()
  useEffect(() => {
    if (locked) forgetPersonalReads(client)
  }, [locked, client])
}

/**
 * Back from the provider the padlock sent the person to: a check that passed opens the space, unless a call began
 * meanwhile (it shut the padlock after the check left), and goes there only if no project is on screen.
 */
function useProviderReturn(input: {
  call: ProjectCall | null
  project: string | null
  place: Place
  setLock: (lock: typeof OPEN) => void
  goTo: (place: 'personal') => void
  say: ShowToast
}) {
  const { call, project, place, setLock, goTo, say } = input
  const landed = useRef(place) // where the return put them, before its check is answered
  useUnlockOnReturn({
    passed: () => {
      if (call) return
      setLock(OPEN)
      // Only while they are still where the return put them: a check that passes late never moves someone who went on.
      if (!project && place === landed.current) goTo('personal')
    },
    unchecked: () => say(NOTICE.unchecked),
  })
}

/** From a project, your data and how privacy works open at home, where the personal space's sheets are. */
function useSheetsAtHome(leave: () => void) {
  const [opening, setOpening] = useState<Opening | null>(null)
  const atHome = (sheet: Opening) => () => {
    setOpening(sheet)
    leave()
  }
  const opened = useCallback(() => setOpening(null), [])
  return { opening, opened, data: atHome('data'), privacy: atHome('privacy') }
}

interface ShellsProps {
  /** The project on screen, and the one out of sight whose room holds the call. */
  ids: readonly string[]
  /** The project on screen (projectOnScreen): the one asked for, or the call's until it has left. */
  onScreen: string | null
  identity: Identity
  account: React.ReactNode
  routing: ReturnType<typeof useProjectRoute>
  joining: string | null
  onJoinHandled: () => void
  onCall: (projectId: string, next: ProjectCall | null, note?: string | null) => void
  onSignOut: () => void
}

function ProjectShells(props: ShellsProps) {
  const { ids, onScreen, identity, account, routing, joining, onJoinHandled, onCall, onSignOut } = props
  const { route, show, leave, goTo } = routing
  return (
    <>
      {ids.map((id) => (
        <div key={id} hidden={id !== onScreen}>
          <ShortcutScope.Provider value={id === onScreen}>
            <ProjectShell
              key={`${accountOf(identity)}:${id}`}
              projectId={id}
              view={id === route.projectId ? shownView(route.view, VISION, CONVERSATIONS, ATTENTION) : 'studio'}
              identity={identity}
              account={account}
              onShow={show}
              onLeave={leave}
              onWork={() => goTo('work')}
              onSignOut={onSignOut}
              background={id !== onScreen}
              routed={id === route.projectId}
              onCall={(next, note) => onCall(id, next, note)}
              joinOnOpen={joining === id}
              onJoinHandled={onJoinHandled}
            />
          </ShortcutScope.Provider>
        </div>
      ))}
    </>
  )
}

/**
 * Everything a signed-in person reaches: the three places (home, their personal space, their work space) and an open
 * project. The personal padlock lives here, above both, so a room shuts it wherever the person is; so does the toast,
 * so a result is said the same way in a project and in the places, and a call that ends out of sight says why.
 */
/** A project opened from the places: the call joined with it when asked (the join request), then the project. */
const opening =
  (ask: (projectId: string | null) => void, open: (projectId: string) => void) =>
  (projectId: string, joins: boolean) => {
    ask(joins ? projectId : null)
    open(projectId)
  }

/**
 * A sign-out that fails keeps the person in: the toast says so, with Try again, which tries the same once more
 * (sign-out-failed.md, Codex P2 on #410).
 */
const sayingIfFailed = (say: ShowToast) => {
  const tried = (end: () => Promise<boolean>) => (): void => {
    void end().then((out) => {
      if (!out) say(SIGN_OUT_FAILED, tried(end), 'Try again')
    })
  }
  return tried
}

/** This device's sign-out and every device's, each said when it fails (sayingIfFailed). */
const signOuts = (say: ShowToast, props: Pick<SignedInProps, 'onSignOut' | 'onSignOutEverywhere'>) => {
  const tried = sayingIfFailed(say)
  return { signOut: tried(props.onSignOut), signOutEverywhere: tried(props.onSignOutEverywhere) }
}

/** The account menu's actions, wherever it shows: here over a project, in the places their own (Places). */
const accountActions = (
  sheets: { data: () => void; privacy: () => void },
  chooseDev: SignedInProps['onChooseDev'],
  out: { signOut: () => void; signOutEverywhere: () => void },
) => ({ data: sheets.data, privacy: sheets.privacy, chooseDev, ...out })

function SignedIn(props: SignedInProps) {
  const { identity, notice, routing, onChooseDev } = props
  const { route, open, openAt, leave, goTo } = routing
  const toast = useToast()
  const ended = useRef<OnEnded | null>(null)
  const [call, reportCall, leaveFor] = useCall(ended, identity)
  const join = useJoinRequest(route.projectId)
  const [lock, setLock, lockedNow] = useLock(accountOf(identity), call?.projectId ?? null)
  const project = route.projectId
  const openProject = opening(join.ask, open)
  useProviderReturn({ call, project, place: route.place, setLock, goTo, say: toast.show })
  useOneCallInSight(call, project, leaveFor)
  useForgetWhileLocked(lock.locked)
  useSayings({ ended, say: toast.show, project, notice, viewer: identity.name, open: openProject })
  const sheets = useSheetsAtHome(leave)
  const out = signOuts(toast.show, props)
  const actions = accountActions(sheets, onChooseDev, out)
  const onScreen = projectOnScreen(project, call?.projectId ?? null)
  const ids = [onScreen, call && call.projectId !== onScreen ? call.projectId : null].filter(
    (id): id is string => id !== null,
  )
  return (
    <>
      <ProjectShells
        ids={ids}
        onScreen={onScreen}
        identity={identity}
        account={<AccountMenu identity={identity} where="project" actions={actions} />}
        routing={routing}
        joining={join.joining}
        onJoinHandled={join.handled}
        onCall={reportCall}
        onSignOut={out.signOut}
      />
      {!project && (
        <Places
          place={route.place}
          identity={identity}
          lock={lock}
          setLock={setLock}
          lockedNow={lockedNow}
          call={call ? inCall(call, () => open(call.projectId)) : null}
          toast={toast.show}
          opening={sheets.opening}
          onOpened={sheets.opened}
          onGo={goTo}
          onOpenProject={openProject}
          onOpenView={(projectId, view, at) => {
            // No served Resources yet in the signed-in app: a permission opens its task (withoutResources).
            const where = withoutResources(view, at)
            openAt(projectId, where.view, where.at)
          }}
          onChooseDev={onChooseDev}
          onSignOut={out.signOut}
          onSignOutEverywhere={out.signOutEverywhere}
        />
      )}
      <Toast notice={toast.notice} onHide={toast.hide} />
    </>
  )
}

/**
 * The signed-in Studio as App draws it once its chunk is here: the opening's last step (Home's reads, then the warming)
 * and the Studio itself, afresh for each account.
 */
export function Studio(props: SignedInProps) {
  return (
    <>
      <OpeningPrepares identity={props.identity} />
      <SignedIn key={accountOf(props.identity)} {...props} />
    </>
  )
}
