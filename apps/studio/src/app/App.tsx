import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import { Places } from '../features/personal/Places.tsx'
import type { InCall } from '../features/personal/PlacesBar.tsx'
import { useLock } from '../features/personal/useLock.ts'
import { ProjectShell, type ProjectCall } from '../features/studio/ProjectShell.tsx'
import { useAuth } from './auth.ts'
import type { Identity } from './dev-identity.ts'
import { IdentityControl } from './IdentityControl.tsx'
import { isJoinPath } from './route.ts'
import { ShortcutScope } from './shortcuts.ts'
import { Centered, LinkOffer, SignIn } from './SignIn.tsx'
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
  const leaveSession = () => {
    queryClient.clear()
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

/**
 * One call at a time, wherever the person is. A project whose room holds the call stays mounted when the person goes
 * home or to their personal space (out of sight, taking no keys), so the call goes on; the places' bar shows it. A call
 * starting in another project ends the one before.
 */
function useCall() {
  const [call, setCall] = useState<ProjectCall | null>(null)
  const current = useRef<ProjectCall | null>(null)
  const report = useCallback((projectId: string, next: ProjectCall | null) => {
    const prev = current.current
    if (!next && prev?.projectId !== projectId) return // a project without a call ends nobody's call
    if (next && prev && prev.projectId !== projectId) void prev.leave()
    current.current = next
    setCall(next)
  }, [])
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

/**
 * Everything a signed-in person reaches: the three places (home, their personal space, their work space) and an open
 * project. The personal padlock lives here, above both, so a room shuts it wherever the person is.
 */
function SignedIn({ identity, notice, routing, onChooseDev, onSignOut }: SignedInProps) {
  const { route, open, show, leave, goTo } = routing
  const [call, reportCall] = useCall()
  const [joining, setJoining] = useState<string | null>(null)
  const [lock, setLock] = useLock(identity.name, call !== null)
  const project = route.projectId
  const shells = [project, call && call.projectId !== project ? call.projectId : null].filter(
    (id): id is string => id !== null,
  )
  const openProject = (projectId: string, join: boolean) => {
    if (join) setJoining(projectId)
    open(projectId)
  }
  return (
    <>
      {shells.map((id) => (
        <div key={id} hidden={id !== project}>
          <ShortcutScope.Provider value={id === project}>
            <ProjectShell
              key={`${identity.name}:${id}`}
              projectId={id}
              view={id === project ? route.view : 'studio'}
              identity={identity}
              identitySwitcher={<IdentityControl identity={identity} onChooseDev={onChooseDev} onSignOut={onSignOut} />}
              onShow={show}
              onLeave={leave}
              onSignOut={onSignOut}
              background={id !== project}
              onCall={(next) => reportCall(id, next)}
              joinOnOpen={joining === id}
              onJoinHandled={() => setJoining(null)}
            />
          </ShortcutScope.Provider>
        </div>
      ))}
      {!project && (
        <Places
          place={route.place}
          identity={identity}
          lock={lock}
          setLock={setLock}
          notice={notice}
          call={call ? inCall(call, () => open(call.projectId)) : null}
          onGo={goTo}
          onOpenProject={openProject}
          onChooseDev={onChooseDev}
          onSignOut={onSignOut}
        />
      )}
    </>
  )
}
