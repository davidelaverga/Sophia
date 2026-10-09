import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { FloorRequest, RoomTokenRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  authorizeRoomJoin,
  readExchangeCalls,
  readLivePresence,
  readQualificationEvidence,
  roomQualification,
  transferInputFloor,
  withActor,
} from '@sophia/persistence'
import { issueRoomToken, type LiveKitConfig } from '../livekit.ts'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

const roomParams = {
  type: 'object',
  additionalProperties: false,
  properties: { roomId: { type: 'string', format: 'uuid' } },
  required: ['roomId'],
} as const

/** A15's routes take only lowercase canonical ids, as the contract declares them (schemas.ts). */
const voiceParams = (name: 'roomId' | 'exchangeId') =>
  ({
    type: 'object',
    additionalProperties: false,
    properties: { [name]: { type: 'string', pattern: UUID_PATTERN } },
    required: [name],
  }) as const

interface Deps {
  pool: pg.Pool
  /** Absent when no LiveKit server is configured: token requests then say so (503), honestly. */
  livekit: LiveKitConfig | undefined
  /** Voice qualification evidence (A15, 0046), off by default: see AppDeps.voiceQualification. */
  voice: boolean
}

/**
 * issueRoomToken and transferInputFloor (contract amendment A01). Joining the room and passing the
 * input floor change who can talk and who may address Sophia; neither touches goals or work.
 */
export function roomRoutes(app: FastifyInstance, { pool, livekit, voice }: Deps): void {
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
      const { access, qualification } = await withActor(pool, req.actorId, 'read', async (c) => {
        const joined = await authorizeRoomJoin(c, req.params.projectId, roomId, expectedAudienceRevision)
        // A voice qualification grant names itself to its principal only, while it is active (A15, 0046).
        return { access: joined, qualification: joined && voice ? await roomQualification(c, roomId) : null }
      })
      if (!access) throw new DomainError('forbidden', 'Not permitted')
      const token = await issueRoomToken(livekit, {
        roomId,
        identity: req.actorId,
        name: req.actorName,
        // Viewers speak in the human room too (amendment A06): talking is not a work grant.
        canPublish: true,
        standing: { role: access.role },
      })
      return qualification ? { ...token, qualification } : token
    },
  )

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

/**
 * The grant's principal reads what was recorded of an exchange its voice qualification grant covers (A15); anyone else,
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
 * A member reads the room as the media bridge last saw it (A15): whether they themselves are in it, the counts, the
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
 * command it admitted, the task that command created and how it was answered (A15). With `after` (an earlier read's
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
