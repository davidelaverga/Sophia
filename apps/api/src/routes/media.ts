// The private media-bridge service (contract amendment A06): what apps/media-bridge may ask of the API. These
// routes answer the bridge's capability only (checked in app.ts by exact route), never a member; the database
// functions refuse a transaction that carries a member identity. Each assignment carries a short-lived LiveKit
// token for the `sophia` identity; the version that wakes the poll never includes tokens.
import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type pg from 'pg'
import type {
  MediaAnnounced,
  MediaAssignment,
  MediaHolderEvent,
  MediaPresenceReport,
  MediaQuiesceAck,
  MediaRoomToken,
  MediaToolCall,
} from '@sophia/contracts'
import {
  ackQuiesce,
  holderEvent,
  mediaAssignments,
  recordAnnounced,
  reportPresence,
  withService,
} from '@sophia/persistence'
import { issueBridgeToken, type LiveKitConfig } from '../livekit.ts'
import { executeToolCall } from '../media-tools.ts'
import type { NotificationHub } from '../notification-hub.ts'

/** The routes the media-bridge capability may call, and nothing else may: checked by exact route in app.ts. */
export const MEDIA_ROUTES: ReadonlySet<string> = new Set([
  '/v1/media/assignments',
  '/v1/media/presence',
  '/v1/media/quiesce-acks',
  '/v1/media/holder',
  '/v1/media/announced',
  '/v1/media/tool-calls',
])

interface Deps {
  pool: pg.Pool
  hub: NotificationHub
  livekit: LiveKitConfig | undefined
}

const pollQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    after: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    waitMs: { type: 'string', pattern: '^(0|[1-9][0-9]{0,4})$' },
  },
  required: ['waitMs'],
} as const

function closedSignal(req: FastifyRequest): AbortSignal {
  const controller = new AbortController()
  req.raw.once('close', () => controller.abort())
  return controller.signal
}

async function currentAssignments(pool: pg.Pool) {
  const list = await withService(pool, (c) => mediaAssignments(c))
  return { list, version: createHash('sha256').update(JSON.stringify(list)).digest('hex') }
}

/** Exactly the MediaRoomToken fields: the room is already the assignment's. */
async function bridgeToken(livekit: LiveKitConfig | undefined, roomId: string): Promise<MediaRoomToken | null> {
  if (!livekit) return null
  const { serverUrl, token, expiresAt } = await issueBridgeToken(livekit, roomId)
  return { serverUrl, token, expiresAt }
}

async function withTokens(
  livekit: LiveKitConfig | undefined,
  list: ReadonlyArray<Omit<MediaAssignment, 'roomToken'>>,
): Promise<MediaAssignment[]> {
  return Promise.all(list.map(async (a) => ({ ...a, roomToken: await bridgeToken(livekit, a.roomId) })))
}

export function mediaRoutes(app: FastifyInstance, { pool, hub, livekit }: Deps): void {
  app.get<{ Querystring: { after?: string; waitMs: string } }>(
    '/v1/media/assignments',
    { schema: { querystring: pollQuery, response: { 200: { $ref: 'MediaAssignmentBatch#' } } } },
    async (req) => {
      let current = await currentAssignments(pool)
      const waitMs = Math.min(Number(req.query.waitMs), 25_000)
      if (req.query.after === current.version && waitMs > 0) {
        await hub.wait(null, waitMs, closedSignal(req))
        current = await currentAssignments(pool)
      }
      return { assignments: await withTokens(livekit, current.list), version: current.version }
    },
  )

  app.post<{ Body: MediaPresenceReport }>(
    '/v1/media/presence',
    { schema: { body: { $ref: 'MediaPresenceReport#' } } },
    async (req, reply) => {
      await withService(pool, (c) => reportPresence(c, req.body))
      return reply.status(204).send()
    },
  )

  app.post<{ Body: MediaQuiesceAck }>(
    '/v1/media/quiesce-acks',
    { schema: { body: { $ref: 'MediaQuiesceAck#' } } },
    async (req, reply) => {
      await withService(pool, (c) => ackQuiesce(c, req.body.requestId, req.body.bridgeInstanceId))
      return reply.status(204).send()
    },
  )

  app.post<{ Body: MediaHolderEvent }>(
    '/v1/media/holder',
    { schema: { body: { $ref: 'MediaHolderEvent#' } } },
    async (req, reply) => {
      await withService(pool, (c) => holderEvent(c, req.body))
      return reply.status(204).send()
    },
  )

  app.post<{ Body: MediaAnnounced }>(
    '/v1/media/announced',
    { schema: { body: { $ref: 'MediaAnnounced#' } } },
    async (req, reply) => {
      await withService(pool, (c) => recordAnnounced(c, req.body))
      return reply.status(204).send()
    },
  )

  app.post<{ Body: MediaToolCall }>(
    '/v1/media/tool-calls',
    { schema: { body: { $ref: 'MediaToolCall#' }, response: { 200: { $ref: 'MediaToolResult#' } } } },
    async (req) => executeToolCall(pool, req.body),
  )
}
