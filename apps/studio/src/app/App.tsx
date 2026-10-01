import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { forgetDrafts } from '../features/personal/draft.ts'
import { callEnded } from '../features/personal/notice-view.ts'
import { Places, type Opening } from '../features/personal/Places.tsx'
import type { InCall } from '../features/personal/PlacesBar.tsx'
import { OPEN, type Lock } from '../features/personal/lock.ts'
import { useLock, useUnlockOnReturn } from '../features/personal/useLock.ts'
import { ProjectShell, type ProjectCall } from '../features/studio/ProjectShell.tsx'
import { AccountMenu } from './AccountMenu.tsx'
import { useAuth } from './auth.ts'
import type { Identity } from './dev-identity.ts'
import { isJoinPath, joinStands } from './route.ts'
import { ShortcutScope } from './shortcuts.ts'
import { Centered, LinkOffer, SignIn } from './SignIn.tsx'
import { Toast, useToast, type ShowToast } from './Toast.tsx'
import { useProjectRoute } from './useProjectRoute.ts'

const queryClient = new QueryClient()

// Invitation links are a separate door: their page loads only when someone opens one.
const JoinFlow = lazy(() => import('../features/access/JoinFlow.tsx').then((m) => ({ default: m.JoinFlow })))

export function App() {
  const { state, chooseDev, signOut, acceptLink, declineLink } = useAuth()
  const routing = useProjectRoute()

  // Cached server state belongs to one identity; drop it whenever the identity changes.
  const switchIdentity = (identity: Identity | null) => {
    queryClient.clear()
    chooseDev(identity)
  }
  // Signing out leaves nothing personal on this device: the cache, and every message being written to Sophia.
  const leaveSession = () => {
    queryClient.clear()
    forgetDrafts()
    void signOut()
  }

  // An invitation link works before, during and after sign-in: it handles its own.
  if (isJoinPath(window.location.pathname)) {
    return (
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<Centered title="Opening the room…" busy />}>
          <JoinFlow auth={state} onChooseDev={switchIdentity} onSignOut={leaveSession} onOpenProject={routing.open} />
        </Suspense>
      </QueryClientProvider>
    )
  }
  if (state.status === 'loading') return <Centered title="Sophia" busy />
  if (state.status === 'link_offer') {
    return <LinkOffer account={state.account} onAccept={acceptLink} onDecline={declineLink} />
  }
  if (state.status === 'signed_out') return <SignIn onChooseDev={switchIdentity} notice={state.notice} />
  // A guest's session left over from a room's door is no account: the Studio asks them to sign in.
  if (state.identity.role === 'guest') return <SignIn onChooseDev={switchIdentity} />

  return (
    <QueryClientProvider client={queryClient}>
      <SignedIn
        key={state.identity.name}
        identity={state.identity}
        notice={state.notice}
        routing={routing}
        onChooseDev={switchIdentity}
        onSignOut={leaveSession}
      />
    </QueryClientProvider>
  )
}

interface SignedInProps {
  identity: Identity
  notice: string | undefined
  routing: ReturnType<typeof useProjectRoute>
  onChooseDev: (identity: Identity | null) => void
  onSignOut: () => void
}

/** Told when a call ends: the call as it was, and why when this person didn't leave it (call-end.ts). */
type OnEnded = (call: ProjectCall, note: string | null) => void

/**
 * One call at a time, wherever the person is. A project whose room holds the call stays mounted when the person goes
 * home or to their personal space (out of sight, taking no keys), so the call goes on; the places' bar shows it. A call
 * starting in another project ends the one before, without a word: the person asked for the new one.
 */
function useCall(ended: RefObject<OnEnded | null>) {
  const [call, setCall] = useState<ProjectCall | null>(null)
  const current = useRef<ProjectCall | null>(null)
  const report = useCallback(
    (projectId: string, next: ProjectCall | null, note: string | null = null) => {
      const prev = current.current
      if (!next && prev?.projectId !== projectId) return // a project without a call ends nobody's call
      if (next && prev && prev.projectId !== projectId) void prev.leave()
      current.current = next
      setCall(next)
      if (!next && prev) ended.current?.(prev, note)
    },
    [ended],
  )
  return [call, report] as const
}

/** The call as the places' bar shows it: where, what is being sent, back to it, and each off switch. */
const inCall = (call: ProjectCall, onReturn: () => void): InCall & { projectId: string } => ({
  projectId: call.projectId,
  title: call.title,
  sending: call.sending,
  onReturn,
  onLeave: () => void call.leave(),
  onMicrophone: (on) => void call.setMicrophone(on),
  onCamera: (on) => void call.setCamera(on),
  onScreen: (on) => void call.setScreenShare(on),
})

/** A call that ends says so in the toast where its room can't (callEnded); so does a sign-in link that failed. */
function useSayings(input: {
  ended: RefObject<OnEnded | null>
  say: ShowToast
  lock: Lock
  project: string | null
  notice: string | undefined
}) {
  const { ended, say, lock, project, notice } = input
  useEffect(() => {
    ended.current = (endedCall, note) => {
      const reopens = lock.locked && lock.by === 'room'
      const message = callEnded({ title: endedCall.title, note, here: project === endedCall.projectId, reopens })
      if (message) say(message)
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
  identity: Identity
  account: React.ReactNode
  routing: ReturnType<typeof useProjectRoute>
  joining: string | null
  onJoinHandled: () => void
  onCall: (projectId: string, next: ProjectCall | null, note?: string | null) => void
  onSignOut: () => void
}

function ProjectShells({ ids, identity, account, routing, joining, onJoinHandled, onCall, onSignOut }: ShellsProps) {
  const { route, show, leave, goTo } = routing
  return (
    <>
      {ids.map((id) => (
        <div key={id} hidden={id !== route.projectId}>
          <ShortcutScope.Provider value={id === route.projectId}>
            <ProjectShell
              key={`${identity.name}:${id}`}
              projectId={id}
              view={id === route.projectId ? route.view : 'studio'}
              identity={identity}
              account={account}
              onShow={show}
              onLeave={leave}
              onWork={() => goTo('work')}
              onSignOut={onSignOut}
              background={id !== route.projectId}
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
function SignedIn({ identity, notice, routing, onChooseDev, onSignOut }: SignedInProps) {
  const { route, open, leave, goTo } = routing
  const toast = useToast()
  const ended = useRef<OnEnded | null>(null)
  const [call, reportCall] = useCall(ended)
  const join = useJoinRequest(route.projectId)
  const [lock, setLock] = useLock(identity.name, call?.projectId ?? null)
  useUnlockOnReturn(() => {
    setLock(OPEN)
    goTo('personal')
  })
  const project = route.projectId
  useSayings({ ended, say: toast.show, lock, project, notice })
  const sheets = useSheetsAtHome(leave)
  const actions = { data: sheets.data, privacy: sheets.privacy, chooseDev: onChooseDev, signOut: onSignOut }
  const ids = [project, call && call.projectId !== project ? call.projectId : null].filter(
    (id): id is string => id !== null,
  )
  const openProject = (projectId: string, joins: boolean) => {
    join.ask(joins ? projectId : null)
    open(projectId)
  }
  return (
    <>
      <ProjectShells
        ids={ids}
        identity={identity}
        account={<AccountMenu identity={identity} where="project" actions={actions} />}
        routing={routing}
        joining={join.joining}
        onJoinHandled={join.handled}
        onCall={reportCall}
        onSignOut={onSignOut}
      />
      {!project && (
        <Places
          place={route.place}
          identity={identity}
          lock={lock}
          setLock={setLock}
          call={call ? inCall(call, () => open(call.projectId)) : null}
          toast={toast.show}
          opening={sheets.opening}
          onOpened={sheets.opened}
          onGo={goTo}
          onOpenProject={openProject}
          onChooseDev={onChooseDev}
          onSignOut={onSignOut}
        />
      )}
      <Toast notice={toast.notice} onHide={toast.hide} />
    </>
  )
}
