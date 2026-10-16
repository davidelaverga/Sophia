// The signed-in person's own profile (A32), read once per account and kept a minute: the account menu's head names them
// by it, and «Your name» is offered only by a server that serves it (docs/plans/profile-editor.md). Keyed by the
// account (accountOf: the token's subject), inside the account's own cache (account-cache.ts).
import { useQuery } from '@tanstack/react-query'
import { getMyProfile } from '../api/profile.ts'
import { accountOf } from './auth-callback.ts'
import type { Identity } from './dev-identity.ts'
import { readTrouble } from './profile-view.ts'

export const profileKey = (identity: Pick<Identity, 'name' | 'token'>) => ['profile', accountOf(identity)] as const

export function useMyProfile(identity: Identity) {
  const query = useQuery({
    queryKey: profileKey(identity),
    queryFn: ({ signal }) => getMyProfile(identity.token, signal),
    staleTime: 60_000,
    // The editor holds what it read: a refetch behind a name being typed would move its revision silently.
    refetchOnWindowFocus: false,
  })
  const trouble = query.error ? readTrouble(query.error) : null
  return {
    profile: query.data ?? null,
    /** Why there is no profile: unavailable (no route here), signed out, or a read that failed. */
    trouble,
    /** «Your name» is offered unless this server has no profile to change. */
    offered: trouble !== 'unavailable' && (query.data !== undefined || query.isError),
    reread: () => query.refetch(),
  }
}
