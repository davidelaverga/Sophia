import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { ProjectShell } from '../features/studio/ProjectShell.tsx'
import { authMode, useAuth } from './auth.ts'
import { devProjectId, type Identity } from './dev-identity.ts'
import { IdentityControl } from './IdentityControl.tsx'
import { ProjectHome } from './ProjectHome.tsx'
import { isJoinPath } from './route.ts'
import { Centered, SignIn } from './SignIn.tsx'
import { useProjectRoute } from './useProjectRoute.ts'

const queryClient = new QueryClient()

// Invitation links are a separate door: their page loads only when someone opens one.
const JoinFlow = lazy(() => import('../features/access/JoinFlow.tsx').then((m) => ({ default: m.JoinFlow })))

export function App() {
  const { state, chooseDev, signOut } = useAuth()
  const { route, open, show, leave } = useProjectRoute(authMode === 'dev' ? (devProjectId ?? null) : null)

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
          <JoinFlow auth={state} onChooseDev={switchIdentity} onSignOut={leaveSession} onOpenProject={open} />
        </Suspense>
      </QueryClientProvider>
    )
  }
  if (state.status === 'loading') return <Centered title="Sophia" busy />
  if (state.status === 'signed_out') return <SignIn onChooseDev={switchIdentity} notice={state.notice} />

  const { identity } = state
  const identityControl = <IdentityControl identity={identity} onChooseDev={switchIdentity} onSignOut={leaveSession} />
  return (
    <QueryClientProvider client={queryClient}>
      {route.projectId ? (
        <ProjectShell
          key={`${identity.name}:${route.projectId}`}
          projectId={route.projectId}
          view={route.view}
          identity={identity}
          identitySwitcher={identityControl}
          onShow={show}
          onLeave={leave}
        />
      ) : (
        <ProjectHome identity={identity} identityControl={identityControl} onOpen={open} />
      )}
    </QueryClientProvider>
  )
}
