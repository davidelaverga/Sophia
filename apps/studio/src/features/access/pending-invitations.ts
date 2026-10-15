// An invitation waiting for the signed-in person (A16, docs/plans/pending-invitations-studio.md): said as the join page
// says it, so the band at Home and in Work reads as the email and the link do.
import type { PendingInvitation } from '@sophia/contracts'

/** The inviter as the join page names them: an address's first word, capitalised; a given name stays whole. */
export function inviterName(name: string): string {
  if (!name.includes('@')) return name
  const local = name.split('@')[0] ?? name
  const word = local.split(/[.\-_+\s]/)[0] || local
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** «Luis invited you to “Onboarding pilot” as an editor»; «You were invited to …» when the account gave no inviter. */
export function invitedLine(invitation: Pick<PendingInvitation, 'inviter' | 'projectTitle' | 'role'>): string {
  const as = invitation.role === 'viewer' ? 'a viewer' : 'an editor'
  const to = `“${invitation.projectTitle}” as ${as}`
  return invitation.inviter ? `${inviterName(invitation.inviter)} invited you to ${to}` : `You were invited to ${to}`
}
