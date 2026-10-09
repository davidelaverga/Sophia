import { randomUUID, timingSafeEqual } from 'node:crypto'
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import type pg from 'pg'
import { componentSchemas, type Error as ApiError } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  checkRoleSafety,
  claimObjectWrite,
  RUNTIME_COMMANDS_CHANNEL,
  runtimeTokenHash,
  withService,
  type RuntimeCaller,
} from '@sophia/persistence'
import { describeAuthRejection, type VerifyActor } from './auth.ts'
import { writeOnce, type ByteStore } from './byte-store.ts'
import { CompanionRunner, companionFailure, type Companion } from './companion.ts'
import { registerCors } from './cors.ts'
import { ProjectEventHub } from './event-hub.ts'
import type { InviteConfig } from './invite-token.ts'
import type { Mailer } from './mail.ts'
import { accessRoutes, GUEST_ROUTES, PUBLIC_ACCESS_ROUTES } from './routes/access.ts'
import { commandRoutes } from './routes/commands.ts'
import { COORDINATION_ROUTES, coordinationRoutes, REVIEW_RUNTIME_ROUTES } from './routes/coordination/index.ts'
import { conversationRoutes } from './routes/conversations.ts'
import { exchangeRoutes } from './routes/exchanges.ts'
import { knowledgeRoutes } from './routes/knowledge.ts'
import { MEDIA_ROUTES, mediaRoutes } from './routes/media.ts'
import { missionRoutes } from './routes/mission.ts'
import { personalRoutes } from './routes/personal.ts'
import { eventRoutes } from './routes/events.ts'
import { projectionRoutes } from './routes/projections.ts'
import { projectRoutes } from './routes/projects.ts'
import { roomRoutes } from './routes/rooms.ts'
import { designRoutes } from './routes/design.ts'
import { RENDERER_ROUTES, rendererRoutes } from './routes/renderer.ts'
import { RUNTIME_ROUTES, researchRoutes, runtimeRoutes } from './routes/runtime.ts'
import { sourceRoutes } from './routes/sources.ts'
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
    /** On a RENDERER_ROUTES request only: the render runner capability's hash (A11, 0030). */
    rendererToken: Buffer | null
    /** On a COORDINATION_ROUTES request only: the Paperclip adapter's capability hash (A13, 0042). */
    coordinationToken: Buffer | null
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
  /** Fastify's logger: on, off, or options (a test gives it a stream to read what is logged). */
  logger?: boolean | { stream: { write: (line: string) => void } }
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
  /** The report byte store (SMC-M03, D5); without it, stored bytes answer 503 and inline texts are still read. */
  byteStore?: ByteStore | null
  /**
   * Who answers in the personal space (amendment A10): the keyless rehearsal in development, the runtime's Companion
   * agent later. Without one, a personal message is refused (503) before anything is kept.
   */
  companion?: Companion | null
  /** The deployed commit (RENDER_GIT_COMMIT, 40 hex), served by /health so a probe can name what it reached; else null. */
  commit?: string | null
  /**
   * Voice qualification evidence (A15, migration 0046), off by default. On, the API runs 0046's guard on every bridge
   * presence report and assignment poll, takes the bridge's receipts, answers the principal's read and names the grant
   * on its principal's room token, and is ready only with 0046. Off, none of that: an assignment's grant is not passed
   * on, so a bridge never records.
   */
  voiceQualification?: boolean
}

/**
 * Functions the API requires in the database; /ready fails if any is missing, so an instance on a database that a
 * migration hasn't reached takes no traffic. The personal space (0021) lists every function its routes call. 0043
 * (#117) is required by the two functions the capture routes call, the only ones this API calls that main's doesn't:
 * the migration is one transaction, and its other changes replace functions under their own signatures. The previous
 * API requires nothing of 0043 and stays ready on either database (Codex on #107; readiness.db.test.ts).
 */
const REQUIRED_SCHEMA = `SELECT to_regproc('sophia.admit_goal_command') IS NOT NULL
  AND to_regproc('sophia.notify_project_event') IS NOT NULL
  AND to_regprocedure('sophia.create_project(text,text)') IS NOT NULL
  AND to_regprocedure('sophia.transfer_input_floor(uuid,uuid,bigint,text)') IS NOT NULL
  AND to_regprocedure('sophia.knock_room(bytea,text)') IS NOT NULL
  AND to_regprocedure('sophia.lobby_may_knock_again(sophia.room_lobby)') IS NOT NULL
  AND to_regprocedure('sophia.runtime_hello(bytea,text,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.admit_native_task(uuid,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.start_exchange(uuid,bigint,boolean,text)') IS NOT NULL
  AND to_regprocedure('sophia.claim_room_removals(text,integer,integer)') IS NOT NULL
  AND to_regprocedure('sophia.guest_token_minting(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.capture_completed_turns(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.mission_capture_default()') IS NOT NULL
  AND to_regprocedure('sophia.mission_turn_origin(jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.record_mission_entry(uuid,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.decide_mission_change(uuid,uuid,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.preview_mission_withdrawal(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.withdraw_mission_entry(uuid,uuid,text,jsonb,text)') IS NOT NULL
  AND to_regprocedure('sophia.is_task_kind(text)') IS NOT NULL
  AND to_regclass('sophia.artifact_renditions') IS NOT NULL
  AND to_regprocedure('sophia.usage_count(jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.admit_research_task(uuid,text,text,jsonb,text,text)') IS NOT NULL
  AND to_regprocedure('sophia.runtime_research_reserve(bytea,text,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.runtime_research_submit(bytea,text,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.research_draft_citations(sophia.research_scope,jsonb,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.edit_report_summary(uuid,text,bigint)') IS NOT NULL
  AND to_regprocedure('sophia.research_revoke_source(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.reconcile_research_overrun(uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.renderer_claim(bytea)') IS NOT NULL
  AND to_regprocedure('sophia.runtime_research_render(bytea,text,text,jsonb,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.request_research_rendition(uuid,uuid,text,text,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.source_withdrawn(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.render_gate_failures(jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.media_record_announced(uuid,uuid,integer,boolean,integer)') IS NOT NULL
  AND to_regprocedure('sophia.personal_reply_state(text,timestamptz,timestamptz)') IS NOT NULL
  AND to_regprocedure('sophia.personal_fence(bigint)') IS NOT NULL
  AND to_regprocedure('sophia.renew_personal_reply(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.renew_personal_greeting(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.begin_companion_call(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.end_companion_call(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.erased_companion_calls()') IS NOT NULL
  AND to_regprocedure('sophia.next_personal_reply()') IS NOT NULL
  AND to_regprocedure('sophia.forget_erased_companion_calls()') IS NOT NULL
  AND to_regprocedure('sophia.send_personal_turn(text,text,boolean)') IS NOT NULL
  AND to_regprocedure('sophia.retry_personal_turn(text,uuid,boolean)') IS NOT NULL
  AND to_regprocedure('sophia.record_personal_reply(uuid,uuid,text,text)') IS NOT NULL
  AND to_regprocedure('sophia.fail_personal_reply(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.record_personal_greeting(text,uuid,text,text)') IS NOT NULL
  AND to_regprocedure('sophia.begin_personal_greeting(text,text,boolean)') IS NOT NULL
  AND to_regprocedure('sophia.release_personal_greeting(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.claim_personal_reply(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.decide_personal_suggestion(text,uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.keep_personal_note(text,text,uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.forget_personal_note(text,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.carry_personal_note(text,uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.take_back_personal_release(text,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.erase_personal_space(text,text)') IS NOT NULL
  AND to_regprocedure('sophia.propose_source_review(uuid,text,jsonb,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.source_review_proposal(uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.answer_work_decision(uuid,uuid,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.work_command(uuid,uuid,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.read_work_result(uuid,uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.coordination_permit(bytea,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.runtime_source_review_submit(bytea,text,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.runtime_capture_issue(bytea,text,text,jsonb,text)') IS NOT NULL
  AND to_regprocedure('sophia.runtime_capture_delivered(bytea,text,text,jsonb,text)') IS NOT NULL
  AND to_regprocedure('sophia.media_claim_live_call(uuid,bigint,uuid,text,text,text)') IS NOT NULL AS ok`

/**
 * What an API with a byte store also requires: the claim every write makes first (0044, writeOnce). An API without
 * one, and the previous API, require nothing of 0044, so it is not needed before the store is configured.
 */
export const STORE_SCHEMA = `SELECT to_regprocedure('sophia.claim_object_write(text,text,bigint)') IS NOT NULL AS ok`

/**
 * What an API with voice qualification on (A15) calls of 0046: its guard, the bridge's receipts, the principal's read and
 * the room token's grant. An API with it off, the default, and the previous API, require nothing of 0046.
 */
export const VOICE_SCHEMA = `SELECT to_regprocedure('sophia.voice_qualification_guard()') IS NOT NULL
  AND to_regprocedure('sophia.media_record_evidence(uuid,uuid,integer,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.media_voice_reserve(uuid,uuid,text,integer,bigint)') IS NOT NULL
  AND to_regprocedure('sophia.voice_qualification_evidence_read(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.voice_room_qualification(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.media_record_live_call(uuid,bigint,uuid,text,text)') IS NOT NULL
  AND to_regprocedure('sophia.live_call_admits(uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.live_call_command()') IS NOT NULL
  AND to_regprocedure('sophia.media_answer_live_call(uuid,uuid,text,text)') IS NOT NULL
  AND to_regprocedure('sophia.media_live_call_answer(uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.exchange_calls(uuid,timestamptz)') IS NOT NULL
  AND to_regprocedure('sophia.room_live_presence(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.native_task_exchanges(uuid,uuid[])') IS NOT NULL
  AND to_regprocedure('sophia.task_withdrawn_sources(uuid,uuid)') IS NOT NULL AS ok`

/**
 * The byte store the routes are given: written once per key, by a claim the database keeps (0044). The operator's
 * write-once probe (storage-probe.ts) composes the API's store with this same function.
 */
export const writeOnceStore = (pool: pg.Pool, store: ByteStore | null | undefined): ByteStore | null =>
  store
    ? writeOnce(store, (path, sha256, byteLength) =>
        withService(pool, (c) => claimObjectWrite(c, path, sha256, byteLength)),
      )
    : null

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
  const voice = deps.voiceQualification === true
  registerHealth(app, deps.pool, { stores: Boolean(deps.byteStore), voice, commit: deps.commit ?? null })
  const store = writeOnceStore(deps.pool, deps.byteStore)

  projectRoutes(app, { pool: deps.pool, livekit: deps.livekit })
  projectionRoutes(app, { pool: deps.pool, voice })
  commandRoutes(app, { pool: deps.pool })
  conversationRoutes(app, { pool: deps.pool, voice })
  missionRoutes(app, { pool: deps.pool })
  runtimeRoutes(app, { pool: deps.pool, hub: runtimeHub })
  researchRoutes(app, deps.pool)
  designRoutes(app, { pool: deps.pool, store })
  roomRoutes(app, { pool: deps.pool, livekit: deps.livekit, voice })
  exchangeRoutes(app, { pool: deps.pool, livekit: deps.livekit })
  mediaRoutes(app, { pool: deps.pool, hub: mediaHub, livekit: deps.livekit, voice })
  accessRoutes(app, { pool: deps.pool, livekit: deps.livekit, invites: deps.invites, mailer: deps.mailer ?? null })
  sourceRoutes(app, { pool: deps.pool, store })
  rendererRoutes(app, { pool: deps.pool, store })
  knowledgeRoutes(app, { pool: deps.pool })
  coordinationRoutes(app, { pool: deps.pool })
  eventRoutes(app, { pool: deps.pool, hub, heartbeatMs: deps.eventPollMs ?? 10_000 })
  const companion = deps.companion
    ? new CompanionRunner(deps.pool, deps.companion, (err) =>
        app.log.error({ companion: companionFailure(err) }, 'companion answer failed'),
      )
    : null
  personalRoutes(app, { pool: deps.pool, companion })
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
/** A render runner's capability, hashed; the database checks it (0030). */
function rendererTokenOf(req: FastifyRequest): Buffer {
  const token = /^Bearer ([A-Za-z0-9._~+/=-]{32,512})$/.exec(req.headers.authorization ?? '')?.[1]
  if (!token) throw new DomainError('runtime_capability_required', 'Render runner capability required')
  return runtimeTokenHash(token)
}

/** The Paperclip adapter's capability, hashed; the database checks it against its company (0042). */
function coordinationTokenOf(req: FastifyRequest): Buffer {
  const token = /^Bearer ([A-Za-z0-9._~+/=-]{32,512})$/.exec(req.headers.authorization ?? '')?.[1]
  if (!token) throw new DomainError('coordination_capability_required', 'Integration credential required')
  return runtimeTokenHash(token)
}

/** The runtime capability's routes: the bridge's own, the research operations and the source reviewer's. */
const CAPABILITY_RUNTIME_ROUTES: ReadonlySet<string> = new Set([...RUNTIME_ROUTES, ...REVIEW_RUNTIME_ROUTES])

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
  app.decorateRequest('rendererToken', null)
  app.decorateRequest('coordinationToken', null)
  app.addHook('onRequest', async (req) => {
    const route = req.routeOptions.url ?? ''
    if (PUBLIC_ROUTES.has(route)) return
    if (CAPABILITY_RUNTIME_ROUTES.has(route)) {
      req.runtimeCaller = runtimeCallerOf(req)
      return
    }
    if (MEDIA_ROUTES.has(route)) {
      requireMediaCapability(req, mediaToken)
      return
    }
    if (RENDERER_ROUTES.has(route)) {
      req.rendererToken = rendererTokenOf(req)
      return
    }
    if (COORDINATION_ROUTES.has(route)) {
      req.coordinationToken = coordinationTokenOf(req)
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

function registerHealth(
  app: FastifyInstance,
  pool: pg.Pool,
  { stores, voice, commit }: { stores: boolean; voice: boolean; commit: string | null },
): void {
  app.get('/health', () => ({ ok: true, commit }))
  app.get('/ready', async (_req, reply) => {
    try {
      await checkRoleSafety(pool)
      const { rows } = await pool.query<{ ok: boolean }>(REQUIRED_SCHEMA)
      const store = stores ? (await pool.query<{ ok: boolean }>(STORE_SCHEMA)).rows[0]?.ok : true
      const voiced = voice ? (await pool.query<{ ok: boolean }>(VOICE_SCHEMA)).rows[0]?.ok : true
      if (!rows[0]?.ok || !store || !voiced) return await reply.status(503).send({ ready: false, reason: 'schema' })
      return { ready: true }
    } catch {
      return reply.status(503).send({ ready: false, reason: 'database' })
    }
  })
}
