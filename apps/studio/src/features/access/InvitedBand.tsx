// The invitations waiting for the signed-in person (A16, docs/plans/pending-invitations-studio.md), at the head of Home
// and Work: who invited them to what, as what, and Accept, which does what accepting by the link does (the welcome
// remembered, the project opened). Nothing shows when nothing waits.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { PendingInvitation } from '@sophia/contracts'
import { acceptPendingInvitation, listPendingInvitations } from '../../api/access.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { invitedLine, inviterName } from './pending-invitations.ts'
import { rememberWelcome } from './welcome.ts'

/** Read as Work's project list is: now and then, so an invitation sent while the person is in the app appears. */
const EVERY_MS = 20_000

const pendingKey = (name: string) => ['invitations', 'pending', name] as const

export function usePendingInvitations(identity: Identity) {
  return useQuery({
    queryKey: pendingKey(identity.name),
    queryFn: ({ signal }) => listPendingInvitations(identity.token, signal),
    refetchInterval: EVERY_MS,
  })
}

function Row({
  invitation,
  identity,
  onOpen,
}: {
  invitation: PendingInvitation
  identity: Identity
  onOpen: (projectId: string) => void
}) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      const { projectId } = await acceptPendingInvitation(identity.token, invitation.id)
      // As accepting by the link does (JoinFlow): the project says who brought them and as what, once.
      rememberWelcome({
        projectId,
        inviter: invitation.inviter ? inviterName(invitation.inviter) : null,
        role: invitation.role,
        at: Date.now(),
      })
      void queryClient.invalidateQueries({ queryKey: ['projects', identity.name] })
      onOpen(projectId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not accept the invitation.')
      setBusy(false)
    } finally {
      // Accepted, or closed meanwhile: either way the list is read again, and the invitation leaves it.
      void queryClient.invalidateQueries({ queryKey: pendingKey(identity.name) })
    }
  }
  return (
    <li className="invited-row">
      <span className="invited-line">{invitedLine(invitation)}</span>
      <button
        type="button"
        className="pill primary"
        aria-disabled={busy || undefined}
        onClick={() => !busy && void accept()}
      >
        {busy ? 'Accepting…' : 'Accept'}
      </button>
      {error && (
        <p className="invited-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

export function InvitedBand({ identity, onOpen }: { identity: Identity; onOpen: (projectId: string) => void }) {
  const invitations = usePendingInvitations(identity).data?.invitations ?? []
  if (invitations.length === 0) return null
  return (
    <section className="invited" aria-label="Invitations">
      <ul>
        {invitations.map((invitation) => (
          <Row key={invitation.id} invitation={invitation} identity={identity} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  )
}
