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
  MediaEvidenceWrite,
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
  recordQualificationEvidence,
  reportPresence,
  voiceQualificationGuard,
  withService,
} from '@sophia/persistence'
import { issueBridgeToken, type LiveKitConfig } from '../livekit.ts'
import { executeToolCall, TOOL_SURFACES, type GuideVersion } from '../media-tools.ts'
import type { NotificationHub } from '../notification-hub.ts'

/** The routes the media-bridge capability may call, and nothing else may: checked by exact route in app.ts. */
export const MEDIA_ROUTES: ReadonlySet<string> = new Set([
  '/v1/media/assignments',
  '/v1/media/presence',
  '/v1/media/quiesce-acks',
  '/v1/media/holder',
  '/v1/media/announced',
  '/v1/media/tool-calls',
  '/v1/media/tool-surface',
  '/v1/media/evidence',
])

interface Deps {
  pool: pg.Pool
  hub: NotificationHub
  livekit: LiveKitConfig | undefined
  /** Voice qualification evidence (A15, 0046), off by default: see AppDeps.voiceQualification. */
  voice: boolean
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

async function currentAssignments(pool: pg.Pool, voice: boolean) {
  const list = await withService(pool, async (c) => {
    if (!voice) return (await mediaAssignments(c)).map(({ qualification: _, ...rest }) => rest)
    // A voice qualification grant's guard (0046) first: an exchange past its grant's deadline or limits is not assigned.
    await voiceQualificationGuard(c)
    return mediaAssignments(c)
  })
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

/** The tool surface of the guide version the bridge names (A11), v1.1 when it names none. */
const TOOL_SURFACE_ROUTE = {
  schema: {
    querystring: {
      type: 'object',
      additionalProperties: false,
      properties: { guide: { type: 'string', enum: Object.keys(TOOL_SURFACES) } },
    },
    response: { 200: { $ref: 'MediaToolSurface#' } },
  },
}

export function mediaRoutes(app: FastifyInstance, { pool, hub, livekit, voice }: Deps): void {
  app.get<{ Querystring: { after?: string; waitMs: string } }>(
    '/v1/media/assignments',
    { schema: { querystring: pollQuery, response: { 200: { $ref: 'MediaAssignmentBatch#' } } } },
    async (req) => {
      const waitMs = Math.min(Number(req.query.waitMs), 25_000)
      // Listening starts before the read, so a change committed after the read still wakes the wait at once.
      const waiter = await hub.arm(null)
      try {
        let current = await currentAssignments(pool, voice)
        if (req.query.after === current.version && waitMs > 0) {
          await waiter.wait(waitMs, closedSignal(req))
          current = await currentAssignments(pool, voice)
        }
        return { assignments: await withTokens(livekit, current.list), version: current.version }
      } finally {
        waiter.cancel()
      }
    },
  )

  presenceRoute(app, pool, voice)
  if (voice) evidenceRoute(app, pool)

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

  // The bridge activates its guide only when these equal its declarations (A08): an API without a handler for an
  // operation the prompt names must not be talked to by that prompt.
  app.get<{ Querystring: { guide?: GuideVersion } }>('/v1/media/tool-surface', TOOL_SURFACE_ROUTE, (req) => ({
    names: [...TOOL_SURFACES[req.query.guide ?? 'v1.1']],
  }))

  app.post<{ Body: MediaToolCall }>(
    '/v1/media/tool-calls',
    { schema: { body: { $ref: 'MediaToolCall#' }, response: { 200: { $ref: 'MediaToolResult#' } } } },
    async (req) => executeToolCall(pool, req.body),
  )
}

/**
 * A receipt for an exchange under a voice qualification grant (A15, 0046): the database binds it to the grant and its
 * run, keeps it once per sequence number and runs the guard in the same transaction.
 */
function evidenceRoute(app: FastifyInstance, pool: pg.Pool): void {
  app.post<{ Body: MediaEvidenceWrite }>(
    '/v1/media/evidence',
    { schema: { body: { $ref: 'MediaEvidenceWrite#' }, response: { 200: { $ref: 'MediaEvidenceAck#' } } } },
    async (req) => {
      const { exchangeId, grantId, seq, receipt } = req.body
      return withService(pool, (c) =>
        recordQualificationEvidence(c, { exchangeId, grantId, seq, kind: receipt.kind, receipt: { ...receipt } }),
      )
    },
  )
}

/** The bridge's presence in a room (each 5 s), with a voice qualification grant's guard in the same transaction. */
function presenceRoute(app: FastifyInstance, pool: pg.Pool, voice: boolean): void {
  app.post<{ Body: MediaPresenceReport }>(
    '/v1/media/presence',
    { schema: { body: { $ref: 'MediaPresenceReport#' } } },
    async (req, reply) => {
      await withService(pool, async (c) => {
        await reportPresence(c, req.body)
        // Every presence report (each 5 s) holds an exchange under a grant to its deadline, whether or not the Lab is there.
        if (voice) await voiceQualificationGuard(c)
      })
      return reply.status(204).send()
    },
  )
}
