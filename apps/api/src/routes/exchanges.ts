// The room's exchange with Sophia (contract amendment A06): open it, end it, stop her speaking, show her one
// source, stop her looking, resume her. Any member may act; none of these touches admitted work. Opening and
// resuming check the room's trusted presence (the LiveKit server's participant list) for guests first, and fail
// closed when that list cannot be read: a project-aware Sophia never speaks into a room with a guest in it.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { ExchangeRequest, LookRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { controlExchange, startExchange, withActor, type ExchangeAction } from '@sophia/persistence'
import { roomParticipants, type LiveKitConfig } from '../livekit.ts'
import { idempotencyHeader, UUID_PATTERN } from './schemas.ts'

interface Deps {
  pool: pg.Pool
  livekit: LiveKitConfig | undefined
}

const idParams = (name: string) =>
  ({
    type: 'object',
    additionalProperties: false,
    properties: { [name]: { type: 'string', pattern: UUID_PATTERN } },
    required: [name],
  }) as const

/**
 * Refuse while the LiveKit server lists a guest (or anyone of unsigned standing) in the room. Presence that cannot
 * be read refuses too, and so does an API without the room service configured: it cannot know who is listening.
 */
async function requireMemberOnlyRoom(livekit: LiveKitConfig | undefined, roomId: string): Promise<void> {
  if (!livekit) throw new DomainError('unavailable', 'The room service is not configured; Sophia stays paused')
  let people: Awaited<ReturnType<typeof roomParticipants>>
  try {
    people = await roomParticipants(livekit, roomId)
  } catch (err: unknown) {
    throw new DomainError('unavailable', 'The room’s presence could not be checked; Sophia stays paused', {
      cause: err,
    })
  }
  if (people.some((p) => p.standing === 'guest' || p.standing === 'unknown')) {
    throw new DomainError('invalid_state', 'A guest is in the room: Sophia joins when the room is member-only')
  }
}

const ACTIONS: ReadonlyArray<[path: string, action: ExchangeAction]> = [
  ['end', 'end'],
  ['stop-speaking', 'stop_speaking'],
  ['stop-looking', 'stop_looking'],
]

export function exchangeRoutes(app: FastifyInstance, { pool, livekit }: Deps): void {
  app.post<{ Params: { roomId: string }; Headers: { 'idempotency-key': string }; Body: ExchangeRequest }>(
    '/api/v1/rooms/:roomId/exchanges',
    {
      schema: {
        params: idParams('roomId'),
        headers: idempotencyHeader,
        body: { $ref: 'ExchangeRequest#' },
        response: { 201: { $ref: 'ExchangeReceipt#' } },
      },
    },
    async (req, reply) => {
      await requireMemberOnlyRoom(livekit, req.params.roomId)
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        startExchange(c, req.params.roomId, req.headers['idempotency-key'], req.body),
      )
      return reply.status(201).send(receipt)
    },
  )

  for (const [path, action] of ACTIONS) {
    app.post<{ Params: { exchangeId: string } }>(
      `/api/v1/exchanges/:exchangeId/${path}`,
      { schema: { params: idParams('exchangeId'), response: { 200: { $ref: 'ExchangeState#' } } } },
      async (req) => withActor(pool, req.actorId, 'write', (c) => controlExchange(c, req.params.exchangeId, action)),
    )
  }

  app.post<{ Params: { exchangeId: string }; Body: LookRequest }>(
    '/api/v1/exchanges/:exchangeId/look',
    {
      schema: {
        params: idParams('exchangeId'),
        body: { $ref: 'LookRequest#' },
        response: { 200: { $ref: 'ExchangeState#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'write', (c) => controlExchange(c, req.params.exchangeId, 'look', req.body.source)),
  )

  app.post<{ Params: { exchangeId: string } }>(
    '/api/v1/exchanges/:exchangeId/resume',
    { schema: { params: idParams('exchangeId'), response: { 200: { $ref: 'ExchangeState#' } } } },
    async (req) => {
      const room = await withActor(pool, req.actorId, 'read', async (c) => {
        const { rows } = await c.query<{ room_id: string }>(`SELECT room_id FROM sophia.room_exchanges WHERE id = $1`, [
          req.params.exchangeId,
        ])
        return rows[0]?.room_id
      })
      if (!room) throw new DomainError('forbidden', 'Not permitted')
      await requireMemberOnlyRoom(livekit, room)
      return withActor(pool, req.actorId, 'write', (c) => controlExchange(c, req.params.exchangeId, 'resume'))
    },
  )
}
