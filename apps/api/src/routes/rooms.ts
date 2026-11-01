import type { FastifyInstance, FastifyRequest } from 'fastify'
import type pg from 'pg'
import type { FloorRequest, RoomTokenRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  authorizeRoomJoin,
  hostedRoom,
  nameActor,
  readExchangeCalls,
  readLivePresence,
  readQualificationEvidence,
  recordHostAct,
  recordRoomAct,
  removedJustNow,
  rememberRoomName,
  roomQualification,
  transferInputFloor,
  withActor,
} from '@sophia/persistence'
import {
  issueRoomToken,
  memberInRoom,
  muteEveryone,
  muteMicrophone,
  removeFromCall,
  stopCamera,
  stopScreen,
  type LiveKitConfig,
  type PartialMute,
} from '../livekit.ts'
import { recordedIfDone, recordedStop } from './host-acts.ts'
import { namesOf } from './profile.ts'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

const roomParams = {
  type: 'object',
  additionalProperties: false,
  properties: { roomId: { type: 'string', format: 'uuid' } },
  required: ['roomId'],
} as const

/** A45's routes take only lowercase canonical ids, as the contract declares them (schemas.ts). */
const voiceParams = (name: 'roomId' | 'exchangeId') =>
  ({
    type: 'object',
    additionalProperties: false,
    properties: { [name]: { type: 'string', pattern: UUID_PATTERN } },
    required: [name],
  }) as const

const personParams = {
  type: 'object',
  additionalProperties: false,
  properties: { projectId: { type: 'string', format: 'uuid' }, identity: { type: 'string', format: 'uuid' } },
  required: ['projectId', 'identity'],
} as const

interface Deps {
  pool: pg.Pool
  /** Absent when no LiveKit server is configured: token requests then say so (503), honestly. */
  livekit: LiveKitConfig | undefined
  /** Voice qualification evidence (A45, 0085), off by default: see AppDeps.voiceQualification. */
  voice?: boolean
}

/**
 * issueRoomToken and transferInputFloor (contract amendment A01). Joining the room and passing the
 * input floor change who can talk and who may address Sophia; neither touches goals or work.
 */
export function roomRoutes(app: FastifyInstance, { pool, livekit, voice = false }: Deps): void {
  // The contract requires an Idempotency-Key here too. Issuing a token has no durable effect, so a
  // retry simply gets a fresh short-lived token.
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: RoomTokenRequest }>(
    '/api/v1/projects/:projectId/room-token',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'RoomTokenRequest#' },
        response: { 200: { $ref: 'RoomToken#' } },
      },
    },
    async (req) => {
      if (!livekit) throw new DomainError('unavailable', 'The voice room is not configured on this server')
      const { roomId, expectedAudienceRevision } = req.body
      // The room keeps the member's address for invitations (0050, 0062); the call names them by their display name,
      // never their address, as everyone in it reads a participant's name.
      const joining = await withActor(pool, req.actorId, 'write', async (c) => {
        const allowed = await authorizeRoomJoin(c, req.params.projectId, roomId, expectedAudienceRevision)
        if (!allowed) return null
        const shown = await nameActor(c, namesOf(req))
        await rememberRoomName(c, req.params.projectId)
        // A voice qualification grant names itself to its principal only, while it is active (A45, 0085).
        const qualification = voice ? await roomQualification(c, roomId) : null
        return { access: allowed, shown, qualification }
      })
      if (!joining) throw new DomainError('forbidden', 'Not permitted')
      const { access, shown, qualification } = joining
      const token = await issueRoomToken(livekit, {
        roomId,
        identity: req.actorId,
        name: shown,
        // Viewers speak in the human room too (amendment A06): talking is not a work grant.
        canPublish: true,
        standing: { role: access.role },
      })
      return qualification ? { ...token, qualification } : token
    },
  )

  hostControls(app, { pool, livekit })
  if (voice) {
    evidenceReadRoute(app, pool)
    livePresenceRoute(app, pool)
    exchangeCallsRoute(app, pool)
  }

  app.post<{ Params: { roomId: string }; Headers: { 'idempotency-key': string }; Body: FloorRequest }>(
    '/api/v1/rooms/:roomId/input-floor',
    {
      schema: {
        params: roomParams,
        headers: idempotencyHeader,
        body: { $ref: 'FloorRequest#' },
        response: { 200: { $ref: 'ExchangeReceipt#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'write', (c) =>
        transferInputFloor(c, req.params.roomId, req.headers['idempotency-key'], req.body),
      ),
  )
}

/** The room this admin hosts, and the room server, or why not (A24, A31). */
async function hostRoom(
  deps: Deps,
  actorId: string,
  projectId: string,
): Promise<{ roomId: string; lk: LiveKitConfig }> {
  const roomId = await withActor(deps.pool, actorId, 'read', (c) => hostedRoom(c, projectId))
  if (!roomId) throw new DomainError('forbidden', 'Not permitted')
  if (!deps.livekit) throw new DomainError('unavailable', 'The voice room is not configured on this server')
  return { roomId, lk: deps.livekit }
}

const STOPS = {
  'stop-camera': { stop: stopCamera, act: 'camera' },
  'stop-screen': { stop: stopScreen, act: 'screen' },
} as const

/**
 * More for the host (A31, docs/plans/host-more.md): stop a member's camera or screen share, or mute everyone else. As
 * A24's acts: the database says who may, the room server who is in the call; recorded once done; twice is once.
 */
function moreHostControls(app: FastifyInstance, deps: Deps): void {
  for (const [path, { stop, act }] of Object.entries(STOPS)) {
    app.post<{ Params: { projectId: string; identity: string } }>(
      `/api/v1/projects/:projectId/room/people/:identity/${path}`,
      { schema: { params: personParams } },
      async (req, reply) => {
        const { roomId, lk } = await hostRoom(deps, req.actorId, req.params.projectId)
        if (req.params.identity === req.actorId) throw new DomainError('invalid_request', 'Your own call is yours')
        if (!(await memberInRoom(lk, roomId, req.params.identity)))
          throw new DomainError('invalid_request', 'They aren’t a member in the call')
        await recordedStop(stop(lk, roomId, req.params.identity), () =>
          withActor(deps.pool, req.actorId, 'write', (c) =>
            recordRoomAct(c, req.params.projectId, req.params.identity, act),
          ),
        )
        return reply.code(204).send()
      },
    )
  }
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/room/mute-all',
    { schema: { params: projectParams } },
    async (req, reply) => {
      const { roomId, lk } = await hostRoom(deps, req.actorId, req.params.projectId)
      await recordedIfDone(
        muteEveryone(lk, roomId, req.actorId),
        () =>
          withActor(deps.pool, req.actorId, 'write', (c) => recordRoomAct(c, req.params.projectId, null, 'mute_all')),
        (partial) => recordMembersMuted(deps, req, partial),
      )
      return reply.code(204).send()
    },
  )
}

const MEMBER_STANDINGS: ReadonlySet<string> = new Set(['admin', 'editor', 'viewer'])

/**
 * A mute-all the room server failed partway (Codex P2 on #385): never «muted everyone». Each member it did mute is
 * recorded as that member muted (record_host_act, 0057), one by one; the request still fails. A guest it muted has no
 * activity the project can name (0057 names members only): not recorded, never written as a member's or everyone's.
 * A member the database no longer admits is not recorded either; the failure says so in the log.
 */
async function recordMembersMuted(
  deps: Deps,
  req: FastifyRequest<{ Params: { projectId: string } }>,
  partial: PartialMute,
) {
  for (const p of partial.participants) {
    if (!MEMBER_STANDINGS.has(p.standing)) continue
    try {
      await withActor(deps.pool, req.actorId, 'write', (c) =>
        recordHostAct(c, req.params.projectId, p.identity, 'mute'),
      )
    } catch (err: unknown) {
      req.log.warn({ target: p.identity, err }, 'a member muted by a partial mute-all could not be recorded')
    }
  }
}

/**
 * An admin mutes or removes a member in the call (A24, docs/plans/host-controls.md). Who may is the database's answer;
 * who is in the call, and as what, is the room server's, from the standing the API signed into each token. Neither act
 * changes a record, so neither needs a key: twice is the same as once.
 */
function hostControls(app: FastifyInstance, { pool, livekit }: Deps): void {
  moreHostControls(app, { pool, livekit })
  for (const what of ['mute', 'remove'] as const) {
    app.post<{ Params: { projectId: string; identity: string } }>(
      `/api/v1/projects/:projectId/room/people/:identity/${what}`,
      { schema: { params: personParams } },
      async (req, reply) => {
        const roomId = await withActor(pool, req.actorId, 'read', (c) => hostedRoom(c, req.params.projectId))
        if (!roomId) throw new DomainError('forbidden', 'Not permitted')
        if (req.params.identity === req.actorId) throw new DomainError('invalid_request', 'Your own call is yours')
        if (!livekit) throw new DomainError('unavailable', 'The voice room is not configured on this server')
        if (!(await memberInRoom(livekit, roomId, req.params.identity))) {
          // A removal retried after its answer was lost finds them gone: done, as the first said (Codex P2 on #351).
          const gone =
            what === 'remove' &&
            (await withActor(pool, req.actorId, 'read', (c) =>
              removedJustNow(c, req.params.projectId, req.params.identity),
            ))
          if (gone) return reply.code(204).send()
          throw new DomainError('invalid_request', 'They aren’t a member in the call')
        }
        // A removal is done once the room server answers; a mute only when there was a microphone to mute.
        const done =
          what === 'mute'
            ? muteMicrophone(livekit, roomId, req.params.identity)
            : removeFromCall(livekit, roomId, req.params.identity).then(() => true)
        // Evidence of who did it, once it is done (project-activity.md): the project's activity lists it.
        await recordedIfDone(done, () =>
          withActor(pool, req.actorId, 'write', (c) =>
            recordHostAct(c, req.params.projectId, req.params.identity, what),
          ),
        )
        return reply.code(204).send()
      },
    )
  }
}

/**
 * The grant's principal reads what was recorded of an exchange its voice qualification grant covers (A45); anyone else,
 * or an exchange under no grant, is not found.
 */
function evidenceReadRoute(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Params: { exchangeId: string } }>(
    '/api/v1/exchanges/:exchangeId/qualification-evidence',
    {
      schema: { params: voiceParams('exchangeId'), response: { 200: { $ref: 'QualificationEvidence#' } } },
    },
    async (req) => withActor(pool, req.actorId, 'read', (c) => readQualificationEvidence(c, req.params.exchangeId)),
  )
}

/**
 * A member reads the room as the media bridge last saw it (A45): whether they themselves are in it, the counts, the
 * bridge's voice and the report's age; nobody else's identity. A room outside the caller's projects is not found.
 */
function livePresenceRoute(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Params: { roomId: string } }>(
    '/api/v1/rooms/:roomId/live-presence',
    { schema: { params: voiceParams('roomId'), response: { 200: { $ref: 'RoomLivePresence#' } } } },
    async (req) => withActor(pool, req.actorId, 'read', (c) => readLivePresence(c, req.params.roomId)),
  )
}

/**
 * A member reads their own voice tool calls in an exchange, in the order they were recorded, each with its tool, the
 * command it admitted, the task that command created and how it was answered (A45). With `after` (an earlier read's
 * readAt), only calls whose recording began after that read. Another member's calls are never listed; an exchange
 * outside the caller's projects is not found.
 */
function exchangeCallsRoute(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Params: { exchangeId: string }; Querystring: { after?: string } }>(
    '/api/v1/exchanges/:exchangeId/calls',
    {
      schema: {
        params: voiceParams('exchangeId'),
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { after: { type: 'string', format: 'date-time' } },
        },
        response: { 200: { $ref: 'ExchangeCalls#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'read', (c) => readExchangeCalls(c, req.params.exchangeId, req.query.after ?? null)),
  )
}
