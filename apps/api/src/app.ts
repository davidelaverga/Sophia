import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import type pg from 'pg'
import { componentSchemas, type Error as ApiError } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { checkRoleSafety } from '@sophia/persistence'
import { describeAuthRejection, type VerifyActor } from './auth.ts'
import { ProjectEventHub } from './event-hub.ts'
import { commandRoutes } from './routes/commands.ts'
import { eventRoutes } from './routes/events.ts'
import { projectionRoutes } from './routes/projections.ts'
import { projectRoutes } from './routes/projects.ts'

declare module 'fastify' {
  interface FastifyRequest {
    actorId: string
  }
}

export interface AppDeps {
  pool: pg.Pool
  verifyActor: VerifyActor
  /**
   * SSE heartbeat and fallback re-read interval (ms). Clients treat ~2.5 intervals of silence as a
   * dead stream (apps/studio/src/api/stream.ts), so keep the two in step.
   */
  eventPollMs?: number
  logger?: boolean
}

/** Functions the API requires in the database; /ready fails if any is missing. */
const REQUIRED_SCHEMA = `SELECT to_regproc('sophia.admit_goal_command') IS NOT NULL
  AND to_regproc('sophia.notify_project_event') IS NOT NULL
  AND to_regprocedure('sophia.create_project(text,text)') IS NOT NULL AS ok`

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.logger ?? false,
    genReqId: () => randomUUID(),
    // The contract rejects unknown properties (e.g. a spoofed actor field) instead of silently
    // stripping them, and never coerces types (api/README: runtime validation obligations).
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
  })
  for (const schema of componentSchemas()) app.addSchema(schema)

  const hub = new ProjectEventHub(deps.pool, (err) => app.log.error({ err }, 'event listener failed'))
  app.addHook('onClose', async () => {
    await hub.close()
  })

  registerAuthentication(app, deps.verifyActor)
  app.setErrorHandler(handleError)
  registerHealth(app, deps.pool)

  projectRoutes(app, { pool: deps.pool })
  projectionRoutes(app, { pool: deps.pool })
  commandRoutes(app, { pool: deps.pool })
  eventRoutes(app, { pool: deps.pool, hub, heartbeatMs: deps.eventPollMs ?? 10_000 })
  return app
}

/** Every /api route acts as the verified token subject; a 401 is logged with non-secret reasons. */
function registerAuthentication(app: FastifyInstance, verifyActor: VerifyActor): void {
  app.decorateRequest('actorId', '')
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return
    try {
      req.actorId = await verifyActor(req.headers.authorization)
    } catch (err: unknown) {
      req.log.warn({ auth: describeAuthRejection(req.headers.authorization, err) }, 'authentication rejected')
      throw err
    }
  })
}

function sendError(req: FastifyRequest, reply: FastifyReply, status: number, body: Omit<ApiError, 'requestId'>) {
  return reply.status(status).send({ ...body, requestId: req.id })
}

/** Contract errors: stable code, safe message, request id and retry disposition. */
function handleError(err: FastifyError | DomainError, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof DomainError) {
    if (err.status >= 500) req.log.error({ err: err.cause ?? err }, err.message)
    return sendError(req, reply, err.status, { code: err.code, message: err.message, retry: err.retry })
  }
  if (err.validation) {
    return sendError(req, reply, 422, { code: 'invalid_request', message: err.message, retry: 'never' })
  }
  if (err.statusCode !== undefined && err.statusCode < 500) {
    return sendError(req, reply, 400, { code: 'malformed', message: err.message, retry: 'never' })
  }
  req.log.error({ err }, 'unhandled error')
  return sendError(req, reply, 503, { code: 'unavailable', message: 'Unavailable', retry: 'safe_read' })
}

function registerHealth(app: FastifyInstance, pool: pg.Pool): void {
  app.get('/health', () => ({ ok: true }))
  app.get('/ready', async (_req, reply) => {
    try {
      await checkRoleSafety(pool)
      const { rows } = await pool.query<{ ok: boolean }>(REQUIRED_SCHEMA)
      if (!rows[0]?.ok) return await reply.status(503).send({ ready: false, reason: 'schema' })
      return { ready: true }
    } catch {
      return reply.status(503).send({ ready: false, reason: 'database' })
    }
  })
}
