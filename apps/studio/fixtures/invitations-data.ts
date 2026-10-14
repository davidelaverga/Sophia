// The invitations the fixture API keeps (docs/plans/invite-members.md): one created is listed, sent again or cancelled,
// answered as the API answers them, so the demo's Invite has no dead end. Nothing is emailed; every address is synthetic.
import type { Invitation, InvitationCreate } from '@sophia/contracts'

const HOUR = 3_600_000
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const isCreate = (value: unknown): value is InvitationCreate =>
  typeof value === 'object' && value !== null && 'kind' in value && (value.kind === 'guest' || value.kind === 'member')

/** The list the page reads, and how many were ever made: each new one's id and link are new, as the API's are. */
export interface Invitations {
  kept: Invitation[]
  made: number
}

function made(invitations: Invitations, request: InvitationCreate): Invitation {
  invitations.made += 1
  const n = String(invitations.made).padStart(12, '0')
  const now = Date.now()
  return {
    id: `00000000-0000-4000-8000-${n}`,
    kind: request.kind,
    role: request.kind === 'member' ? (request.role ?? 'editor') : null,
    email: request.email ?? null,
    sessionId: request.sessionId ?? null,
    expiresAt: new Date(now + (request.expiresInHours ?? 168) * HOUR).toISOString(),
    maxUses: request.maxUses ?? (request.email ? 1 : 50),
    uses: 0,
    revokedAt: null,
    emailStatus: request.email ? 'sent' : 'none',
    createdAt: new Date(now).toISOString(),
    url: `${window.location.origin}/join#fixture-invitation-${n}`,
  }
}

const ONE = /^\/api\/v1\/invitations\/([0-9a-f-]{36})\/(reissue|revoke)$/

/** Sent again (a new link, the old one stops) or cancelled; null when the id is none of these. */
function changed(invitations: Invitations, id: string, act: string): Response | null {
  const at = invitations.kept.findIndex((i) => i.id === id)
  const was = invitations.kept[at]
  if (!was) return null
  const now = new Date().toISOString()
  if (act === 'revoke') {
    const revoked = { ...was, revokedAt: now }
    invitations.kept[at] = revoked
    return json(revoked)
  }
  const again = made(invitations, {
    kind: was.kind,
    ...(was.role && { role: was.role }),
    ...(was.email && { email: was.email }),
  })
  invitations.kept[at] = { ...was, revokedAt: now }
  invitations.kept.unshift(again)
  return json(again)
}

/** The project's invitations: listed (GET), made (POST), sent again or cancelled; null for any other request. */
export function invitationsAnswer(
  invitations: Invitations,
  method: string,
  path: string,
  init: RequestInit | undefined,
  base: string,
): Response | null {
  if (path === `${base}/invitations`) {
    if (method === 'GET') return json({ invitations: invitations.kept })
    const request: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
    if (method !== 'POST' || !isCreate(request)) return null
    const invitation = made(invitations, request)
    invitations.kept.unshift(invitation)
    return json(invitation)
  }
  const one = method === 'POST' ? ONE.exec(path) : null
  return one?.[1] && one[2] ? changed(invitations, one[1], one[2]) : null
}
