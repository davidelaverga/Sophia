import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { FloorRequest, RoomTokenRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  authorizeRoomJoin,
  hostedRoom,
  nameActor,
  recordHostAct,
  rememberRoomName,
  transferInputFloor,
  withActor,
} from '@sophia/persistence'
import { issueRoomToken, memberInRoom, muteMicrophone, removeFromCall, type LiveKitConfig } from '../livekit.ts'
import { idempotencyHeader, projectParams } from './schemas.ts'

const roomParams = {
  type: 'object',
  additionalProperties: false,
  properties: { roomId: { type: 'string', format: 'uuid' } },
  required: ['roomId'],
} as const

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
}

/**
 * issueRoomToken and transferInputFloor (contract amendment A01). Joining the room and passing the
 * input floor change who can talk and who may address Sophia; neither touches goals or work.
 */
export function roomRoutes(app: FastifyInstance, { pool, livekit }: Deps): void {
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
      // The name the token carries is kept for the member's voice writes (0050), in the same transaction.
      const access = await withActor(pool, req.actorId, 'write', async (c) => {
        const allowed = await authorizeRoomJoin(c, req.params.projectId, roomId, expectedAudienceRevision)
        if (allowed) {
          await nameActor(c, req.actorName)
          await rememberRoomName(c, req.params.projectId)
        }
        return allowed
      })
      if (!access) throw new DomainError('forbidden', 'Not permitted')
      return issueRoomToken(livekit, {
        roomId,
        identity: req.actorId,
        name: req.actorName,
        // Viewers speak in the human room too (amendment A06): talking is not a work grant.
        canPublish: true,
        standing: { role: access.role },
      })
    },
  )

  hostControls(app, { pool, livekit })

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
 * An admin mutes or removes a member in the call (A24, docs/plans/host-controls.md). Who may is the database's answer;
 * who is in the call, and as what, is the room server's, from the standing the API signed into each token. Neither act
 * changes a record, so neither needs a key: twice is the same as once.
 */
function hostControls(app: FastifyInstance, { pool, livekit }: Deps): void {
  for (const what of ['mute', 'remove'] as const) {
    app.post<{ Params: { projectId: string; identity: string } }>(
      `/api/v1/projects/:projectId/room/people/:identity/${what}`,
      { schema: { params: personParams } },
      async (req, reply) => {
        const roomId = await withActor(pool, req.actorId, 'read', (c) => hostedRoom(c, req.params.projectId))
        if (!roomId) throw new DomainError('forbidden', 'Not permitted')
        if (req.params.identity === req.actorId) throw new DomainError('invalid_request', 'Your own call is yours')
        if (!livekit) throw new DomainError('unavailable', 'The voice room is not configured on this server')
        if (!(await memberInRoom(livekit, roomId, req.params.identity)))
          throw new DomainError('invalid_request', 'They aren’t a member in the call')
        await (what === 'mute' ? muteMicrophone : removeFromCall)(livekit, roomId, req.params.identity)
        // Evidence of who did it, once it is done (project-activity.md): the project's activity lists it.
        await withActor(pool, req.actorId, 'write', (c) =>
          recordHostAct(c, req.params.projectId, req.params.identity, what),
        )
        return reply.code(204).send()
      },
    )
  }
}
