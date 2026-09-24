import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StudioShell } from '../features/studio/StudioShell.tsx'
import { authMode, useAuth } from './auth.ts'
import { devProjectId, type Identity } from './dev-identity.ts'
import { IdentityControl } from './IdentityControl.tsx'
import { ProjectHome } from './ProjectHome.tsx'
import { Centered, SignIn } from './SignIn.tsx'
import { useProjectRoute } from './useProjectRoute.ts'

const queryClient = new QueryClient()

export function App() {
  const { state, chooseDev, signOut } = useAuth()
  const route = useProjectRoute(authMode === 'dev' ? (devProjectId ?? null) : null)

  // Cached server state belongs to one identity; drop it whenever the identity changes.
  const switchIdentity = (identity: Identity | null) => {
    queryClient.clear()
    chooseDev(identity)
  }

  if (state.status === 'loading') return <Centered title="Sophia" busy />
  if (state.status === 'signed_out') return <SignIn onChooseDev={switchIdentity} />

  const { identity } = state
  const identityControl = (
    <IdentityControl
      identity={identity}
      onChooseDev={switchIdentity}
      onSignOut={() => {
        queryClient.clear()
        void signOut()
      }}
    />
  )
  return (
    <QueryClientProvider client={queryClient}>
      {route.projectId ? (
        <StudioShell
          key={`${identity.name}:${route.projectId}`}
          projectId={route.projectId}
          identity={identity}
          identitySwitcher={identityControl}
          onLeave={route.leave}
        />
      ) : (
        <ProjectHome identity={identity} identityControl={identityControl} onOpen={route.open} />
      )}
    </QueryClientProvider>
  )
}
