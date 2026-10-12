// The private media-bridge service (contract amendment A06): what apps/media-bridge may ask of the API. These
// routes answer the bridge's capability only (checked in app.ts by exact route), never a member; the database
// functions refuse a transaction that carries a member identity. Each assignment carries a short-lived LiveKit
// token for the `sophia` identity; the version that wakes the poll never includes tokens.
import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify'
import type pg from 'pg'
import type {
  MediaAnnounced,
  MediaAssignment,
  MediaEvidenceWrite,
  MediaQualificationReserve,
  MediaHolderEvent,
  MediaPresenceReport,
  MediaQuiesceAck,
  MediaRoomToken,
  MediaToolCall,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  ackQuiesce,
  holderEvent,
  mediaAssignments,
  recordAnnounced,
  recordQualificationEvidenceWrite,
  reserveQualification,
  reportPresence,
  voiceQualificationGuard,
  withService,
  withServiceWithin,
} from '@sophia/persistence'
import type { CallFences } from '../call-fence.ts'
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
  '/v1/media/evidence-writes',
  '/v1/media/qualification-reserve',
])

/**
 * The API's deadline for one of the bridge's bounded posts, counted from the route's onRequest hook (when Fastify begins
 * handling the request: its headers read, its body not yet parsed or validated), on the API process's own clock (Codex
 * P1 r4238081302). The bridge gives an attempt of each up at its own bound (POST_ATTEMPT_MS for presence, holder events,
 * quiesce acknowledgements and announcement records; EVIDENCE_ATTEMPT_MS for receipts; RESERVE_TIMEOUT_MS for
 * reservations: 3 s each) and then sends again; the request's socket closes, but nothing stopped its transaction, so a
 * lock held longer piled the attempts' transactions up until the pool was exhausted. withServiceWithin bounds by this
 * deadline the wait for a pool connection, each statement (its lock waits included) and each of COMMIT's lock waits; one
 * cut before COMMIT is rolled back and answers 503 `unavailable` (retry safe_read), so in the ordinary case the bridge
 * has its answer before it gives up. It is not an aggregate hard bound: COMMIT's own completion (WAL write and flush),
 * the network round trips and what comes before the hook (accepting the connection, reading the headers) are outside it,
 * and a cut at COMMIT is `outcome_unknown`. It bounds the server's own waits, not any handler or provider.
 * bridge-post-bound.db.test.ts checks it against the bridge's bounds.
 */
export const BRIDGE_POST_BOUND_MS = 2000

/** When each bridge post's onRequest hook ran (headers read, body not yet parsed): its deadline counts from then. */
const arrived = new WeakMap<FastifyRequest, number>()
const markArrival = (req: FastifyRequest, _reply: FastifyReply, done: HookHandlerDoneFunction) => {
  arrived.set(req, performance.now())
  done()
}
/** The deadline of a bridge post's transaction: BRIDGE_POST_BOUND_MS after its onRequest hook ran. */
const deadlineOf = (req: FastifyRequest) => (arrived.get(req) ?? performance.now()) + BRIDGE_POST_BOUND_MS

interface Deps {
  pool: pg.Pool
  hub: NotificationHub
  livekit: LiveKitConfig | undefined
  /** Voice qualification evidence (A15, 0046), off by default: see AppDeps.voiceQualification. */
  voice: boolean
  /** The fence sessions this API process's voice tool calls take, bounded (see AppDeps.callFenceSessions). */
  fences: CallFences
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

export function mediaRoutes(app: FastifyInstance, { pool, hub, livekit, voice, fences }: Deps): void {
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
  if (voice) {
    evidenceRoute(app, pool)
    reserveRoute(app, pool)
  }

  bridgeEventRoutes(app, pool)

  // The bridge activates its guide only when these equal its declarations (A08): an API without a handler for an
  // operation the prompt names must not be talked to by that prompt.
  app.get<{ Querystring: { guide?: GuideVersion } }>('/v1/media/tool-surface', TOOL_SURFACE_ROUTE, (req) => ({
    names: [...TOOL_SURFACES[req.query.guide ?? 'v1.1']],
  }))

  app.post<{ Body: MediaToolCall }>(
    '/v1/media/tool-calls',
    { schema: { body: { $ref: 'MediaToolCall#' }, response: { 200: { $ref: 'MediaToolResult#' } } } },
    async (req) => executeToolCall(pool, req.body, voice, fences),
  )
}

/**
 * The bridge's quiesce acknowledgement, holder events and announcement records, each in a transaction bounded by
 * BRIDGE_POST_BOUND_MS: the bridge sends each again after its own wait when an attempt is not answered.
 */
function bridgeEventRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.post<{ Body: MediaQuiesceAck }>(
    '/v1/media/quiesce-acks',
    { schema: { body: { $ref: 'MediaQuiesceAck#' } }, onRequest: markArrival },
    async (req, reply) => {
      await withServiceWithin(pool, deadlineOf(req), async (c, within) => {
        await within()
        await ackQuiesce(c, req.body.requestId, req.body.bridgeInstanceId)
      })
      return reply.status(204).send()
    },
  )

  app.post<{ Body: MediaHolderEvent }>(
    '/v1/media/holder',
    { schema: { body: { $ref: 'MediaHolderEvent#' } }, onRequest: markArrival },
    async (req, reply) => {
      await withServiceWithin(pool, deadlineOf(req), async (c, within) => {
        await within()
        await holderEvent(c, req.body)
      })
      return reply.status(204).send()
    },
  )

  app.post<{ Body: MediaAnnounced }>(
    '/v1/media/announced',
    { schema: { body: { $ref: 'MediaAnnounced#' } }, onRequest: markArrival },
    async (req, reply) => {
      await withServiceWithin(pool, deadlineOf(req), async (c, within) => {
        await within()
        await recordAnnounced(c, req.body)
      })
      return reply.status(204).send()
    },
  )
}

/**
 * A receipt for an exchange under a voice qualification grant (A15, 0046), numbered by the database (0051; Codex P1
 * r4232908444): under the exchange's locks, from its durable high-water counter, the same number for a repeat of the
 * same write (its writeId), never a number given before. The database binds it to the grant and its run and runs the
 * guard in the same transaction. The bridge's own numbering (`/v1/media/evidence`) is retired: 410, nothing kept.
 */
function evidenceRoute(app: FastifyInstance, pool: pg.Pool): void {
  app.post<{ Body: MediaEvidenceWrite }>(
    '/v1/media/evidence-writes',
    {
      schema: { body: { $ref: 'MediaEvidenceWrite#' }, response: { 200: { $ref: 'MediaEvidenceAck#' } } },
      onRequest: markArrival,
    },
    async (req) => {
      const { exchangeId, grantId, writeId, receipt } = req.body
      return withServiceWithin(pool, deadlineOf(req), async (c, within) => {
        await within()
        return recordQualificationEvidenceWrite(c, {
          exchangeId,
          grantId,
          writeId,
          kind: receipt.kind,
          receipt: { ...receipt },
        })
      })
    },
  )
  app.post('/v1/media/evidence', () => {
    throw new DomainError(
      'evidence_route_retired',
      'The service numbers receipts now: send them to /v1/media/evidence-writes',
    )
  })
}

/**
 * The bridge's durable reservation of a provider connection or a generation for an exchange under a voice qualification
 * grant (A15, 0046): the exchange's bound, held here for every session and every bridge process. A reservation that
 * does not fit ends the exchange in the same transaction.
 */
function reserveRoute(app: FastifyInstance, pool: pg.Pool): void {
  app.post<{ Body: MediaQualificationReserve }>(
    '/v1/media/qualification-reserve',
    {
      schema: {
        body: { $ref: 'MediaQualificationReserve#' },
        response: { 200: { $ref: 'MediaQualificationReservation#' } },
      },
      onRequest: markArrival,
    },
    async (req) =>
      withServiceWithin(pool, deadlineOf(req), async (c, within) => {
        await within()
        return reserveQualification(c, req.body)
      }),
  )
}

/**
 * The bridge's presence in a room (each 5 s), with a voice qualification grant's guard in the same transaction. A report
 * whose reportSeq is not above its process's last one for the room (0052) is answered 204 like any other and has no
 * presence effect; the independent guard still runs on it: it acts on the grant's deadline and limits, may end an
 * exchange for them and emits its own guard event, never on the report's account. Its wait for a connection, the
 * report's statement, the guard's and COMMIT's lock waits each have only what is left of BRIDGE_POST_BOUND_MS from the
 * route's onRequest hook. One cut before COMMIT rolls the whole transaction back (503 `unavailable`): nothing of the
 * report or of the guard is kept, and the bridge's next report, numbered anew, has it all again. One cut at COMMIT is
 * `outcome_unknown` (503).
 */
function presenceRoute(app: FastifyInstance, pool: pg.Pool, voice: boolean): void {
  app.post<{ Body: MediaPresenceReport }>(
    '/v1/media/presence',
    { schema: { body: { $ref: 'MediaPresenceReport#' } }, onRequest: markArrival },
    async (req, reply) => {
      await withServiceWithin(pool, deadlineOf(req), async (c, within) => {
        await within()
        await reportPresence(c, req.body)
        // Every presence report (each 5 s) holds an exchange under a grant to its deadline, whether or not the Lab is there.
        if (!voice) return
        await within()
        await voiceQualificationGuard(c)
      })
      return reply.status(204).send()
    },
  )
}
