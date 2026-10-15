// The invitations the fixture API keeps (docs/plans/invite-members.md): one created is listed, sent again or cancelled,
// answered as the API answers them, so the demo's Invite has no dead end. Nothing is emailed; every address is synthetic.
import type { Invitation, InvitationCreate } from '@sophia/contracts'
import { personId } from './fake-people.ts'

const HOUR = 3_600_000
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const isCreate = (value: unknown): value is InvitationCreate =>
  typeof value === 'object' && value !== null && 'kind' in value && (value.kind === 'guest' || value.kind === 'member')

/** The list the page reads, and how many were ever made: each new one's id and link are new, as the API's are. */
export interface Invitations {
  kept: Invitation[]
  made: number
  /** The people offered from the admin's other projects (A26); `invitable=none`, nobody. */
  offered?: { actorId: string; email: string }[]
  /** The next invitation to this address fails as an unavailable API's (`window.fixture.failInvite`). */
  failFor?: string | null
}

/** Three people the demo's admin shares other projects with (invite-from-projects.md). */
export const OFFERED = [
  { actorId: personId(2), email: 'lucia@example.test' },
  { actorId: personId(1), email: 'marco@example.test' },
  { actorId: personId(3), email: 'noor@example.test' },
]

/** The people offered, without those an open member invitation already reaches. */
function invitable(invitations: Invitations): Response {
  const now = Date.now()
  const reached = new Set(
    invitations.kept
      .filter((i) => i.kind === 'member' && !i.revokedAt && i.uses < i.maxUses && Date.parse(i.expiresAt) > now)
      .map((i) => i.email),
  )
  return json({ people: (invitations.offered ?? []).filter((p) => !reached.has(p.email)) })
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

/** One made (POST), as the API makes it; an address the page set to fail is refused once, as an unavailable API. */
function created(invitations: Invitations, init: RequestInit | undefined): Response | null {
  const request: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  if (!isCreate(request)) return null
  if (request.email && request.email === invitations.failFor) {
    invitations.failFor = null
    const problem = { code: 'unavailable', message: 'Unavailable', requestId: 'fixture', retry: 'safe_read' }
    return new Response(JSON.stringify(problem), { status: 503, headers: { 'content-type': 'application/json' } })
  }
  const invitation = made(invitations, request)
  invitations.kept.unshift(invitation)
  return json(invitation)
}

/** The project's invitations: listed (GET), made (POST), sent again or cancelled; null for any other request. */
export function invitationsAnswer(
  invitations: Invitations,
  method: string,
  path: string,
  init: RequestInit | undefined,
  base: string,
): Response | null {
  if (path === `${base}/invitable` && method === 'GET') return invitable(invitations)
  if (path === `${base}/invitations`) {
    if (method === 'GET') return json({ invitations: invitations.kept })
    return method === 'POST' ? created(invitations, init) : null
  }
  const one = method === 'POST' ? ONE.exec(path) : null
  return one?.[1] && one[2] ? changed(invitations, one[1], one[2]) : null
}
