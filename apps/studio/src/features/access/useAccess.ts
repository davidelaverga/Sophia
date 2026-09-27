// Server state for room access: this person's role in the project, the invitations they can manage, and
// their answers at the lobby. TanStack Query caches per person and project; mutations refresh them.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { LobbyDecision, LobbyEntry, Membership, RoomSession } from '@sophia/contracts'
import { decideLobbyEntry, getMembership, listInvitations } from '../../api/access.ts'
import { ApiError } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'

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

/**
 * Answers at the lobby, for one person or several at once (Let in all): one decision at a time, since each
 * locks the project, then everyone's lobby refreshes. A refusal is said in the API's words.
 */
export function useLobbyDecision(projectId: string, identity: Identity) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const decide = async (entries: readonly LobbyEntry[], decision: LobbyDecision['decision']) => {
    setBusy(true)
    setError(null)
    try {
      await entries.reduce<Promise<unknown>>(
        (previous, e) => previous.then(() => decideLobbyEntry(identity.token, e.id, decision)),
        Promise.resolve(),
      )
    } catch (err: unknown) {
      const refused = err instanceof ApiError && err.status > 0 && err.status < 500
      setError(refused ? err.message : 'Couldn’t answer the door. Try again.')
    } finally {
      setBusy(false)
      void queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) })
    }
  }
  return { busy, error, decide }
}
