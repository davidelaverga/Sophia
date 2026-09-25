// Server state for room access: this person's role in the project and the invitations they can manage.
// TanStack Query caches both per person and project; mutations refresh them.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LobbyEntry, Membership, RoomSession } from '@sophia/contracts'
import { getMembership, listInvitations } from '../../api/access.ts'
import type { Identity } from '../../app/dev-identity.ts'

/** What the Invite sheet works with: the project, who is inviting, their role, and the room's calendar. */
export interface SheetContext {
  projectId: string
  identity: Identity
  membership: Membership | undefined
  sessions: readonly RoomSession[]
  /** The lobby from the snapshot: who waits and which guests are in the call. */
  lobby: readonly LobbyEntry[]
}

export const membershipKey = (projectId: string, viewer: string) => ['membership', projectId, viewer] as const
export const invitationsKey = (projectId: string, viewer: string) => ['invitations', projectId, viewer] as const

/** The role decides what the Studio offers: only editors and admins invite and admit; only admins add members. */
export function useMembership(projectId: string, viewer: string, token: string) {
  return useQuery({
    queryKey: membershipKey(projectId, viewer),
    queryFn: () => getMembership(token, projectId),
    staleTime: 60_000,
  })
}

export const canInvite = (m: Membership | undefined) => m?.role === 'admin' || m?.role === 'editor'

export function useInvitations(projectId: string, viewer: string, token: string, enabled: boolean) {
  return useQuery({
    queryKey: invitationsKey(projectId, viewer),
    queryFn: () => listInvitations(token, projectId),
    enabled,
  })
}

/** After any invitation change, re-read the list. */
export function useRefreshInvitations(projectId: string, viewer: string) {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: invitationsKey(projectId, viewer) })
}
