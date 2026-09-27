// Room access (contract amendments A02 and A03, S1-04A): invitations, the lobby (let in, decline for now,
// block for good), room sessions and one's own membership. Links are derived here (invite-token.ts) and never stored; every write goes through the
// sophia.* functions, which re-check authority. Guests reach only knock, their lobby entry and the call.
import { randomUUID } from 'node:crypto'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type pg from 'pg'
import type {
  Invitation,
  InvitationCreate,
  InvitationToken,
  Knock,
  LobbyDecision,
  LobbyEntry,
  SessionCreate,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  acceptRoomInvitation,
  authorizeGuestJoin,
  guestTokenMinting,
  cancelRoomSession,
  createRoomInvitation,
  decideLobbyEntry,
  knockRoom,
  listInvitations,
  pendingRemoval,
  previewRoomInvitation,
  quiesceAcked,
  readInvitation,
  readLobbyEntry,
  readMembership,
  readRemoval,
  recordInvitationEmail,
  reissueRoomInvitation,
  requestGuestQuiesce,
  revokeRoomInvitation,
  scheduleRoomSession,
  settleRoomRemoval,
  withActor,
  withoutActor,
  withService,
  type InvitationRecord,
  type InvitationRequest,
  type LobbyRecord,
} from '@sophia/persistence'
import { inviteEmail } from '../invite-email.ts'
import { linkFor, tokenHash, type InviteConfig } from '../invite-token.ts'
import { issueRoomToken, removeParticipant, roomParticipants, SOPHIA_IDENTITY, type LiveKitConfig } from '../livekit.ts'
import type { Mailer } from '../mail.ts'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

export interface AccessDeps {
  pool: pg.Pool
  /** Absent when no link secret is configured: invitations then say so (503), honestly. */
  invites: InviteConfig | undefined
  /** Null when no email is configured: invitations are still created and say "not_configured". */
  mailer: Mailer | null
  livekit: LiveKitConfig | undefined
}

const params = (name: string) => ({
  type: 'object',
  additionalProperties: false,
  properties: { [name]: { type: 'string', pattern: UUID_PATTERN } },
  required: [name],
})
const ref = (name: string) => ({ $ref: `${name}#` })

const DAY_HOURS = 24
const DEFAULTS = { guest: { hours: 7 * DAY_HOURS, uses: 50 }, member: { hours: 7 * DAY_HOURS, uses: 1 } } as const

function requireInvites(deps: AccessDeps): InviteConfig {
  if (!deps.invites) throw new DomainError('unavailable', 'Invitations are not configured on this server')
  return deps.invites
}

/** RLS hides invitations from people who cannot manage them: an unreadable one is simply not permitted. */
function mustRead(record: InvitationRecord | null): InvitationRecord {
  if (!record) throw new DomainError('forbidden', 'Not permitted')
  return record
}

function invitationRequest(body: InvitationCreate, inviterName: string | null): InvitationRequest {
  const d = DEFAULTS[body.kind]
  return {
    kind: body.kind,
    role: body.kind === 'member' ? (body.role ?? 'editor') : null,
    email: body.email ?? null,
    sessionId: body.sessionId ?? null,
    expiresAt: new Date(Date.now() + (body.expiresInHours ?? d.hours) * 3_600_000).toISOString(),
    maxUses: body.maxUses ?? d.uses,
    inviterName,
  }
}

const toBody = (cfg: InviteConfig, r: InvitationRecord): Invitation => ({
  id: r.id,
  kind: r.kind,
  role: r.role,
  email: r.email,
  sessionId: r.sessionId,
  expiresAt: r.expiresAt,
  maxUses: r.maxUses,
  uses: r.uses,
  revokedAt: r.revokedAt,
  emailStatus: r.emailStatus,
  createdAt: r.createdAt,
  url: linkFor(cfg, r.id, r.tokenVersion).url,
})

const lobbyBody = (e: LobbyRecord): LobbyEntry => ({
  id: e.id,
  displayName: e.displayName,
  status: e.status,
  requestedAt: e.requestedAt,
  decidedAt: e.decidedAt,
  knocks: e.knocks,
})

/** Declined or blocked while in the call: they leave it now, not when their token expires. */
const leavesTheCall = (status: LobbyEntry['status']) => status === 'denied' || status === 'blocked'

/**
 * One attempt right after the decision (amendment A07). The database recorded the obligation with the decision;
 * this settles it only on the server's evidence. A failure, or no LiveKit configured here, leaves it pending for
 * the worker, and the member sees it pending.
 */
async function attemptRemoval(deps: AccessDeps, actorId: string, entryId: string): Promise<void> {
  const open = await withActor(deps.pool, actorId, 'read', (c) => pendingRemoval(c, entryId))
  if (!open || !deps.livekit) return
  const result = await removeParticipant(deps.livekit, open.roomId, open.identity)
  await withService(deps.pool, (c) => settleRoomRemoval(c, open.id, `api:${randomUUID()}`, result))
}

interface Delivery {
  deps: AccessDeps
  cfg: InviteConfig
  record: InvitationRecord
  log: FastifyBaseLogger
}

/** Email the current link once per version (the provider key makes a retried request a no-op). */
async function sendInvitation({ deps, cfg, record, log }: Delivery): Promise<'sent' | 'failed' | 'not_configured'> {
  const email = record.email
  if (!deps.mailer || !email) return 'not_configured'
  const { url, hash } = linkFor(cfg, record.id, record.tokenVersion)
  const preview = await withoutActor(deps.pool, (c) => previewRoomInvitation(c, hash))
  const mail = inviteEmail({ ...preview, invitationId: record.id, kind: record.kind, role: record.role, email, url })
  const calendar = mail.ics
    ? [{ filename: 'invitation.ics', content: Buffer.from(mail.ics).toString('base64'), contentType: 'text/calendar' }]
    : []
  try {
    await deps.mailer.send({
      ...mail,
      to: email,
      attachments: calendar,
      idempotencyKey: `invitation-${record.id}-v${record.tokenVersion}`,
    })
    return 'sent'
  } catch (err: unknown) {
    // Never the link or the address in logs: the invitation id is enough to find it.
    log.warn(
      { invitationId: record.id, reason: err instanceof Error ? err.message : 'unknown' },
      'invitation email failed',
    )
    return 'failed'
  }
}

async function deliver(d: Delivery, actorId: string): Promise<InvitationRecord> {
  if (!d.record.email || d.record.emailStatus !== 'none') return d.record
  const status = await sendInvitation(d)
  await withActor(d.deps.pool, actorId, 'write', (c) =>
    recordInvitationEmail(c, d.record.id, d.record.tokenVersion, status),
  )
  return { ...d.record, emailStatus: status }
}

function invitationRoutes(app: FastifyInstance, deps: AccessDeps): void {
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: InvitationCreate }>(
    '/api/v1/projects/:projectId/invitations',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: ref('InvitationCreate'),
        response: { 200: ref('Invitation') },
      },
    },
    async (req) => {
      const cfg = requireInvites(deps)
      const id = randomUUID()
      const request = invitationRequest(req.body, req.actorName)
      const record = await withActor(deps.pool, req.actorId, 'write', async (c) => {
        const created = await createRoomInvitation(c, {
          projectId: req.params.projectId,
          id,
          request,
          tokenSha256: linkFor(cfg, id, 1).hash,
          idempotencyKey: req.headers['idempotency-key'],
        })
        return mustRead(await readInvitation(c, created))
      })
      return toBody(cfg, await deliver({ deps, cfg, record, log: req.log }, req.actorId))
    },
  )

  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/invitations',
    { schema: { params: projectParams, response: { 200: ref('InvitationList') } } },
    async (req) => {
      const cfg = requireInvites(deps)
      const list = await withActor(deps.pool, req.actorId, 'read', (c) => listInvitations(c, req.params.projectId))
      return { invitations: list.map((r) => toBody(cfg, r)) }
    },
  )
}

/** A new link for an invitation (the old one stops working), or no link at all. */
function manageInvitationRoutes(app: FastifyInstance, deps: AccessDeps): void {
  app.post<{ Params: { invitationId: string } }>(
    '/api/v1/invitations/:invitationId/reissue',
    { schema: { params: params('invitationId'), response: { 200: ref('Invitation') } } },
    async (req) => {
      const cfg = requireInvites(deps)
      const record = await withActor(deps.pool, req.actorId, 'write', async (c) => {
        const current = mustRead(await readInvitation(c, req.params.invitationId))
        const next = linkFor(cfg, current.id, current.tokenVersion + 1)
        await reissueRoomInvitation(c, current.id, current.tokenVersion, next.hash)
        return mustRead(await readInvitation(c, current.id))
      })
      return toBody(cfg, await deliver({ deps, cfg, record, log: req.log }, req.actorId))
    },
  )

  app.post<{ Params: { invitationId: string } }>(
    '/api/v1/invitations/:invitationId/revoke',
    { schema: { params: params('invitationId'), response: { 200: ref('Invitation') } } },
    async (req) => {
      const cfg = requireInvites(deps)
      const id = req.params.invitationId
      const record = await withActor(deps.pool, req.actorId, 'write', async (c) => {
        await revokeRoomInvitation(c, id)
        return mustRead(await readInvitation(c, id))
      })
      return toBody(cfg, record)
    },
  )
}

function joinRoutes(app: FastifyInstance, deps: AccessDeps): void {
  // Public: the token in the body is the capability. An unknown token is not_found and reveals nothing.
  app.post<{ Body: InvitationToken }>(
    '/api/v1/join/preview',
    { schema: { body: ref('InvitationToken'), response: { 200: ref('InvitationPreview') } } },
    async (req) => withoutActor(deps.pool, (c) => previewRoomInvitation(c, tokenHash(req.body.token))),
  )

  app.post<{ Body: Knock }>(
    '/api/v1/join/knock',
    { schema: { body: ref('Knock'), response: { 200: ref('LobbyEntry') } } },
    async (req) =>
      lobbyBody(
        await withActor(deps.pool, req.actorId, 'write', (c) =>
          knockRoom(c, tokenHash(req.body.token), req.body.displayName),
        ),
      ),
  )

  app.post<{ Body: InvitationToken }>(
    '/api/v1/join/accept',
    { schema: { body: ref('InvitationToken'), response: { 200: ref('InvitationAccepted') } } },
    async (req) => {
      const email = req.actorName
      if (req.actorAnonymous || !email) throw new DomainError('forbidden', 'Sign in with the invited email to accept')
      return withActor(deps.pool, req.actorId, 'write', (c) =>
        acceptRoomInvitation(c, tokenHash(req.body.token), email),
      )
    },
  )
}

/** How long a guest's join waits for the bridge to confirm Sophia stopped listening and speaking (case A12). */
const QUIESCE_WAIT_MS = 5000
const QUIESCE_POLL_MS = 150

/**
 * Before a guest's token: the bridge confirms it closed Google input and cleared Sophia's output. Without that
 * confirmation the guest waits, unless the LiveKit server itself says Sophia is not in the room (then nothing
 * project-aware can reach them). An unreadable room refuses: the API never claims output is muted when it can't
 * know.
 */
async function awaitQuiescence(deps: AccessDeps, requestId: string, roomId: string): Promise<void> {
  const deadline = Date.now() + QUIESCE_WAIT_MS
  while (Date.now() < deadline) {
    if (await withService(deps.pool, (c) => quiesceAcked(c, requestId))) return
    await new Promise((resolve) => setTimeout(resolve, QUIESCE_POLL_MS))
  }
  const livekit = deps.livekit
  const absent = livekit
    ? await roomParticipants(livekit, roomId).then(
        (people) => !people.some((p) => p.identity === SOPHIA_IDENTITY),
        () => false,
      )
    : false
  if (!absent) throw new DomainError('unavailable', 'Sophia is being paused before you join. Try again in a moment.')
}

function lobbyRoutes(app: FastifyInstance, deps: AccessDeps): void {
  const entryParams = params('entryId')
  app.get<{ Params: { entryId: string } }>(
    '/api/v1/lobby/:entryId',
    { schema: { params: entryParams, response: { 200: ref('LobbyEntry') } } },
    async (req) =>
      lobbyBody(await withActor(deps.pool, req.actorId, 'read', (c) => readLobbyEntry(c, req.params.entryId))),
  )

  app.post<{ Params: { entryId: string } }>(
    '/api/v1/lobby/:entryId/room-token',
    { schema: { params: entryParams, response: { 200: ref('RoomToken') } } },
    async (req) => {
      if (!deps.livekit) throw new DomainError('unavailable', 'The voice room is not configured on this server')
      const admitted = await withActor(deps.pool, req.actorId, 'read', (c) => authorizeGuestJoin(c, req.params.entryId))
      const quiesce = await withActor(deps.pool, req.actorId, 'write', (c) =>
        requestGuestQuiesce(c, req.params.entryId),
      )
      if (quiesce) await awaitQuiescence(deps, quiesce, admitted.roomId)
      // Immediately before the mint, on every path: the admission is checked again (an editor may have declined the
      // guest during the wait, or just after the quiesce committed), and the guest fence is stamped, so it lasts as
      // long as this token does.
      const access = await withActor(deps.pool, req.actorId, 'write', (c) => guestTokenMinting(c, req.params.entryId))
      return issueRoomToken(deps.livekit, {
        roomId: access.roomId,
        identity: req.actorId,
        name: access.displayName,
        canPublish: true,
        standing: { guest: true },
      })
    },
  )

  app.post<{ Params: { entryId: string }; Body: LobbyDecision }>(
    '/api/v1/lobby/:entryId/decision',
    { schema: { params: entryParams, body: ref('LobbyDecision'), response: { 200: ref('LobbyEntry') } } },
    async (req) => {
      const entry = await withActor(deps.pool, req.actorId, 'write', (c) =>
        decideLobbyEntry(c, req.params.entryId, req.body.decision),
      )
      if (leavesTheCall(entry.status)) await attemptRemoval(deps, req.actorId, entry.id)
      const removal = await withActor(deps.pool, req.actorId, 'read', (c) => readRemoval(c, entry.id))
      return { ...lobbyBody(entry), removal }
    },
  )
}

/** Intl knows every IANA zone the browser can report; anything else would break the email and calendar. */
function checkTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0)
  } catch {
    throw new DomainError('invalid_request', 'Unknown time zone')
  }
}

function sessionRoutes(app: FastifyInstance, deps: AccessDeps): void {
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: SessionCreate }>(
    '/api/v1/projects/:projectId/sessions',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: ref('SessionCreate'),
        response: { 200: ref('RoomSession') },
      },
    },
    async (req) => {
      checkTimeZone(req.body.timeZone)
      return withActor(deps.pool, req.actorId, 'write', (c) =>
        scheduleRoomSession(c, req.params.projectId, req.body, req.headers['idempotency-key']),
      )
    },
  )

  app.post<{ Params: { sessionId: string } }>(
    '/api/v1/sessions/:sessionId/cancel',
    { schema: { params: params('sessionId'), response: { 200: ref('RoomSession') } } },
    async (req) => withActor(deps.pool, req.actorId, 'write', (c) => cancelRoomSession(c, req.params.sessionId)),
  )

  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/membership',
    { schema: { params: projectParams, response: { 200: ref('Membership') } } },
    async (req) => {
      const membership = await withActor(deps.pool, req.actorId, 'read', (c) => readMembership(c, req.params.projectId))
      if (!membership) throw new DomainError('forbidden', 'Not permitted')
      return membership
    },
  )
}

export function accessRoutes(app: FastifyInstance, deps: AccessDeps): void {
  invitationRoutes(app, deps)
  manageInvitationRoutes(app, deps)
  joinRoutes(app, deps)
  lobbyRoutes(app, deps)
  sessionRoutes(app, deps)
}

/** Routes an anonymous guest may call; everything else is for people with an account (app.ts). */
export const GUEST_ROUTES: ReadonlySet<string> = new Set([
  '/api/v1/join/knock',
  '/api/v1/lobby/:entryId',
  '/api/v1/lobby/:entryId/room-token',
])

/** Routes anyone may call, signed in or not. */
export const PUBLIC_ACCESS_ROUTES: readonly string[] = ['/api/v1/join/preview']
