import { randomUUID, timingSafeEqual } from 'node:crypto'
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import type pg from 'pg'
import { componentSchemas, type Error as ApiError } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { checkRoleSafety, RUNTIME_COMMANDS_CHANNEL, runtimeTokenHash, type RuntimeCaller } from '@sophia/persistence'
import { describeAuthRejection, type VerifyActor } from './auth.ts'
import { registerCors } from './cors.ts'
import { ProjectEventHub } from './event-hub.ts'
import type { InviteConfig } from './invite-token.ts'
import type { Mailer } from './mail.ts'
import { accessRoutes, GUEST_ROUTES, PUBLIC_ACCESS_ROUTES } from './routes/access.ts'
import { commandRoutes } from './routes/commands.ts'
import { conversationRoutes } from './routes/conversations.ts'
import { exchangeRoutes } from './routes/exchanges.ts'
import { MEDIA_ROUTES, mediaRoutes } from './routes/media.ts'
import { eventRoutes } from './routes/events.ts'
import { projectionRoutes } from './routes/projections.ts'
import { projectRoutes } from './routes/projects.ts'
import { roomRoutes } from './routes/rooms.ts'
import { RUNTIME_ROUTES, runtimeRoutes } from './routes/runtime.ts'
import type { LiveKitConfig } from './livekit.ts'
import { NotificationHub } from './notification-hub.ts'

declare module 'fastify' {
  interface FastifyRequest {
    actorId: string
    /** Display name from the verified token (email), or null. Shown to others; never authority. */
    actorName: string | null
    /** An anonymous guest: only GUEST_ROUTES are open to them. */
    actorAnonymous: boolean
    /** On a RUNTIME_ROUTES request only: the runtime capability's hash and transport headers (A04). */
    runtimeCaller: RuntimeCaller | null
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
  /** The LiveKit server for project rooms; without it, room tokens answer 503. */
  livekit?: LiveKitConfig
  /** Exact Studio origins allowed to call the API from a browser (a deployed Studio); none by default. */
  corsOrigins?: readonly string[]
  /** The secret and Studio address for invitation links; without them, invitations answer 503. */
  invites?: InviteConfig
  /** Sends invitation emails; without it invitations are created and report `not_configured`. */
  mailer?: Mailer | null
  /** SHA-256 of the media bridge's capability (amendment A06); without it, /v1/media/* answers 401. */
  mediaBridgeTokenSha256?: Buffer
}

/** Functions the API requires in the database; /ready fails if any is missing. */
const REQUIRED_SCHEMA = `SELECT to_regproc('sophia.admit_goal_command') IS NOT NULL
  AND to_regproc('sophia.notify_project_event') IS NOT NULL
  AND to_regprocedure('sophia.create_project(text,text)') IS NOT NULL
  AND to_regprocedure('sophia.transfer_input_floor(uuid,uuid,bigint,text)') IS NOT NULL
  AND to_regprocedure('sophia.knock_room(bytea,text)') IS NOT NULL
  AND to_regprocedure('sophia.lobby_may_knock_again(sophia.room_lobby)') IS NOT NULL
  AND to_regprocedure('sophia.runtime_hello(bytea,text,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.admit_native_task(uuid,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.start_exchange(uuid,bigint,boolean,text)') IS NOT NULL
  AND to_regprocedure('sophia.claim_room_removals(text,integer,integer)') IS NOT NULL AS ok`

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
  const runtimeHub = new NotificationHub(deps.pool, RUNTIME_COMMANDS_CHANNEL, (err) =>
    app.log.error({ err }, 'runtime listener failed'),
  )
  const mediaHub = new NotificationHub(deps.pool, 'sophia_media', (err) =>
    app.log.error({ err }, 'media listener failed'),
  )
  app.addHook('onClose', async () => {
    await hub.close()
    await runtimeHub.close()
    await mediaHub.close()
  })

  registerCors(app, deps.corsOrigins ?? [])
  registerAuthentication(app, deps.verifyActor, deps.mediaBridgeTokenSha256 ?? null)
  app.setErrorHandler(handleError)
  registerHealth(app, deps.pool)

  projectRoutes(app, { pool: deps.pool })
  projectionRoutes(app, { pool: deps.pool })
  commandRoutes(app, { pool: deps.pool })
  conversationRoutes(app, { pool: deps.pool })
  runtimeRoutes(app, { pool: deps.pool, hub: runtimeHub })
  roomRoutes(app, { pool: deps.pool, livekit: deps.livekit })
  exchangeRoutes(app, { pool: deps.pool, livekit: deps.livekit })
  mediaRoutes(app, { pool: deps.pool, hub: mediaHub, livekit: deps.livekit })
  accessRoutes(app, { pool: deps.pool, livekit: deps.livekit, invites: deps.invites, mailer: deps.mailer ?? null })
  eventRoutes(app, { pool: deps.pool, hub, heartbeatMs: deps.eventPollMs ?? 10_000 })
  return app
}

/** Routes anyone may call. Everything else, matched or not, needs a verified actor. */
const PUBLIC_ROUTES: ReadonlySet<string> = new Set(['/health', '/ready', ...PUBLIC_ACCESS_ROUTES])

/**
 * A runtime route carries a runtime capability, never a member JWT (A04). Only its hash leaves this function;
 * the sophia.runtime_* functions decide whether it is known, for this unit, and the lease holder.
 */
function runtimeCallerOf(req: FastifyRequest): RuntimeCaller {
  const token = /^Bearer ([A-Za-z0-9._~+/=-]{32,512})$/.exec(req.headers.authorization ?? '')?.[1]
  if (!token) throw new DomainError('runtime_capability_required', 'Runtime capability required')
  const header = (name: string) => {
    const value = req.headers[name]
    return typeof value === 'string' ? value : ''
  }
  return {
    tokenSha256: runtimeTokenHash(token),
    runtimeUnitId: header('x-sophia-runtime-unit'),
    bridgeInstanceId: header('x-sophia-bridge-instance'),
  }
}

/**
 * Every non-public request acts as the verified token subject; a 401 is logged with non-secret reasons.
 * The check uses the route the router matched, never the raw URL: the router decodes percent-escapes,
 * so a raw-URL prefix test could be skipped with `/%61pi/...` (review of #4). The runtime routes are an
 * exact list too: they take a runtime capability instead of a member token, and nothing else does.
 */
/** The media bridge's capability, compared by hash in constant time (amendment A06); nothing to compare with refuses. */
function requireMediaCapability(req: FastifyRequest, expected: Buffer | null): void {
  const token = /^Bearer ([A-Za-z0-9._~+/=-]{32,512})$/.exec(req.headers.authorization ?? '')?.[1]
  if (!token || !expected || !timingSafeEqual(runtimeTokenHash(token), expected)) {
    throw new DomainError('media_capability_required', 'Media bridge capability required')
  }
}

function registerAuthentication(app: FastifyInstance, verifyActor: VerifyActor, mediaToken: Buffer | null): void {
  app.decorateRequest('actorId', '')
  app.decorateRequest('actorName', null)
  app.decorateRequest('actorAnonymous', false)
  app.decorateRequest('runtimeCaller', null)
  app.addHook('onRequest', async (req) => {
    const route = req.routeOptions.url ?? ''
    if (PUBLIC_ROUTES.has(route)) return
    if (RUNTIME_ROUTES.has(route)) {
      req.runtimeCaller = runtimeCallerOf(req)
      return
    }
    if (MEDIA_ROUTES.has(route)) {
      requireMediaCapability(req, mediaToken)
      return
    }
    try {
      const actor = await verifyActor(req.headers.authorization)
      req.actorId = actor.id
      req.actorName = actor.name
      req.actorAnonymous = actor.anonymous
    } catch (err: unknown) {
      req.log.warn({ auth: describeAuthRejection(req.headers.authorization, err) }, 'authentication rejected')
      throw err
    }
    // A guest without an account can knock, wait and join the call they were admitted to; nothing else.
    if (req.actorAnonymous && !GUEST_ROUTES.has(route)) {
      throw new DomainError('forbidden', 'Guests can only join the room they were admitted to')
    }
  })
}

function sendError(req: FastifyRequest, reply: FastifyReply, status: number, body: Omit<ApiError, 'requestId'>) {
  // A refusal's code is what an operator needs to tell a stale floor from a bad capability; the request line
  // alone carries only the status. Codes and ids only: never a body or a message built from user input.
  if (status < 500) req.log.info({ status, code: body.code }, 'request refused')
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
