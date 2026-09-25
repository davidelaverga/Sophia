// The private runtime service (contract amendment A04): the Sophia side of the dsh control bridge's transport
// (packages/dsh-bundle/src/transport.ts). These routes answer one registered runtime instance, authenticated by
// its capability (app.ts), never a member. Every call reaches a sophia.runtime_* function that checks the
// capability, runtime unit and lease itself; this file only shapes HTTP around them.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type pg from 'pg'
import type { RuntimeHello, RuntimeObservationBatch, RuntimeReady, RuntimeReceiptBatch } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  recordRuntimeObservations,
  recordRuntimeReady,
  recordRuntimeReceipts,
  runtimeHello,
  runtimePoll,
  withService,
  type RuntimeCaller,
} from '@sophia/persistence'
import type { NotificationHub } from '../notification-hub.ts'

/** The routes a runtime capability may call, and nothing else may: checked by exact route in app.ts. */
export const RUNTIME_ROUTES: ReadonlySet<string> = new Set([
  '/v1/runtime/hello',
  '/v1/runtime/commands',
  '/v1/runtime/receipts',
  '/v1/runtime/observations',
  '/v1/runtime/ready',
])

/** The transport headers every runtime call carries (A04). */
const runtimeHeaders = {
  type: 'object',
  properties: {
    'x-sophia-runtime-unit': { type: 'string', minLength: 1, maxLength: 160 },
    'x-sophia-bridge-instance': { type: 'string', minLength: 1, maxLength: 64 },
    'x-sophia-bridge-protocol': { type: 'string', enum: ['1'] },
  },
  required: ['x-sophia-runtime-unit', 'x-sophia-bridge-instance', 'x-sophia-bridge-protocol'],
} as const

/** Query values are strings on the wire and the API never coerces types: decimal digits, converted below. */
const pollQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    after: { type: 'string', pattern: '^(0|[1-9][0-9]{0,15})$' },
    waitMs: { type: 'string', pattern: '^(0|[1-9][0-9]{0,4})$' },
  },
  required: ['after', 'waitMs'],
} as const

/** The cursor and wait as numbers: a safe integer cursor, a wait of at most 25 s (A04). */
function pollBounds(query: { after: string; waitMs: string }): { after: number; waitMs: number } {
  const after = Number(query.after)
  if (!Number.isSafeInteger(after)) throw new DomainError('invalid_request', 'after is not a safe integer')
  return { after, waitMs: Math.min(Number(query.waitMs), 25_000) }
}

/** Observation batches carry assistant text; receipts carry inspect summaries. Both stay bounded per item. */
const BATCH_BODY_LIMIT = 8 * 1024 * 1024

interface Deps {
  pool: pg.Pool
  hub: NotificationHub
}

/** The authenticated caller app.ts attached; a runtime route without one is a wiring error, not a request. */
function callerOf(req: FastifyRequest): RuntimeCaller {
  if (!req.runtimeCaller) throw new DomainError('runtime_capability_required', 'Runtime capability required')
  return req.runtimeCaller
}

/** An AbortSignal that fires when the client goes away, so a waiting poll ends with its connection. */
function closedSignal(req: FastifyRequest): AbortSignal {
  const controller = new AbortController()
  req.raw.once('close', () => controller.abort())
  return controller.signal
}

export function runtimeRoutes(app: FastifyInstance, { pool, hub }: Deps): void {
  app.post<{ Body: RuntimeHello }>(
    '/v1/runtime/hello',
    {
      schema: {
        headers: runtimeHeaders,
        body: { $ref: 'RuntimeHello#' },
        response: { 200: { $ref: 'RuntimeHelloReply#' } },
      },
    },
    async (req) => withService(pool, (c) => runtimeHello(c, callerOf(req), req.body)),
  )

  // Long poll: read, and when nothing is queued, listen for this runtime's notification, read again (a command
  // committed before the listening began), then wait for the notification or the timeout and read once more.
  // Listening before the second read means a command committed at any point wakes the wait at once.
  app.get<{ Querystring: { after: string; waitMs: string } }>(
    '/v1/runtime/commands',
    {
      schema: { headers: runtimeHeaders, querystring: pollQuery, response: { 200: { $ref: 'RuntimeCommandBatch#' } } },
    },
    async (req) => {
      const who = callerOf(req)
      const { after, waitMs } = pollBounds(req.query)
      const first = await withService(pool, (c) => runtimePoll(c, who, after))
      if (first.commands.length > 0 || waitMs === 0) return { commands: first.commands, cursor: first.cursor }
      const waiter = await hub.arm(first.runtimeId)
      try {
        let next = await withService(pool, (c) => runtimePoll(c, who, after))
        if (next.commands.length === 0) {
          await waiter.wait(waitMs, closedSignal(req))
          next = await withService(pool, (c) => runtimePoll(c, who, after))
        }
        return { commands: next.commands, cursor: next.cursor }
      } finally {
        waiter.cancel()
      }
    },
  )

  app.post<{ Body: RuntimeReceiptBatch }>(
    '/v1/runtime/receipts',
    { bodyLimit: BATCH_BODY_LIMIT, schema: { headers: runtimeHeaders, body: { $ref: 'RuntimeReceiptBatch#' } } },
    async (req, reply) => {
      await withService(pool, (c) => recordRuntimeReceipts(c, callerOf(req), req.body.receipts))
      return reply.status(204).send()
    },
  )

  app.post<{ Body: RuntimeObservationBatch }>(
    '/v1/runtime/observations',
    { bodyLimit: BATCH_BODY_LIMIT, schema: { headers: runtimeHeaders, body: { $ref: 'RuntimeObservationBatch#' } } },
    async (req, reply) => {
      await withService(pool, (c) => recordRuntimeObservations(c, callerOf(req), req.body.observations))
      return reply.status(204).send()
    },
  )

  app.post<{ Body: RuntimeReady }>(
    '/v1/runtime/ready',
    { schema: { headers: runtimeHeaders, body: { $ref: 'RuntimeReady#' } } },
    async (req, reply) => {
      await withService(pool, (c) => recordRuntimeReady(c, callerOf(req), req.body))
      return reply.status(204).send()
    },
  )
}
