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
import { CALL_FENCE_SESSIONS, CallFences } from './call-fence.ts'
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
import { searchRoutes } from './routes/search.ts'
import { humanTaskRoutes, TASK_WRITES } from './routes/human-tasks.ts'
import { MEDIA_ROUTES, mediaRoutes } from './routes/media.ts'
import { missionRoutes } from './routes/mission.ts'
import { personalRoutes } from './routes/personal.ts'
import { personalInputRoutes } from './routes/personal-inputs.ts'
import { personalAnswerControlRoutes } from './routes/personal-answer-controls.ts'
import { PERSONAL_ANSWERS_SCHEMA, personalAnswerRoutes } from './routes/personal-answers.ts'
import { needsRoutes } from './routes/needs.ts'
import { CONVERSATION_SCHEMA, projectConversationRoutes } from './routes/project-conversations.ts'
import { CONVERSATION_INPUTS_SCHEMA, conversationInputRoutes } from './routes/conversation-inputs.ts'
import { updatesRoutes } from './routes/updates.ts'
import { contributionActRoutes } from './routes/contribution-acts.ts'
import { profileRoutes } from './routes/profile.ts'
import { eventRoutes } from './routes/events.ts'
import { projectionRoutes } from './routes/projections.ts'
import { projectRoutes } from './routes/projects.ts'
import { goalTargetRoutes } from './routes/goal-targets.ts'
import { activityRoutes } from './routes/activity.ts'
import { roomRoutes } from './routes/rooms.ts'
import { designRoutes } from './routes/design.ts'
import { RENDERER_ROUTES, rendererRoutes } from './routes/renderer.ts'
import { RUNTIME_ROUTES, conversationRuntimeRoutes, researchRoutes, runtimeRoutes } from './routes/runtime.ts'
import { OWNER_RUNNER_SCHEMA, runnerOperationRoutes, type OwnerRunnerAdmissions } from './routes/runner-operations.ts'
import { apiContributionRoutes } from './routes/api-contributions.ts'
import { projectResourceRoutes } from './routes/project-resources.ts'
import { sourceRoutes } from './routes/sources.ts'
import type { LiveKitConfig } from './livekit.ts'
import { NotificationHub } from './notification-hub.ts'

declare module 'fastify' {
  interface FastifyRequest {
    actorId: string
    /**
     * The account provider's name from the verified token, or null: it seeds a display name the person hasn't chosen
     * (0062). Never an address; others see a person's profile name, never this.
     */
    actorName: string | null
    /** The verified token's email, or null: the contact invitations are matched by (A16). Never shown as a name. */
    actorContact: string | null
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
  /**
   * Saved project conversations (CON-01, amendment A33): served only when on (SOPHIA_CONVERSATIONS=on). Off, no A33 route
   * exists and /ready requires nothing of migration 0063, so this API and the previous one run on either database.
   */
  conversations?: boolean
  /**
   * Saved-conversation automatic inputs (INC03-CC-002 S01b, amendment A49, migration 0095): off unless set, and only with
   * `conversations` (set alone, buildApp refuses the configuration). server.ts does not set it. Off, no A49 route exists
   * and /ready requires nothing of 0095; on, /ready requires 0095's two writers.
   */
  conversationInputs?: boolean
  /**
   * Personal automatic inputs (INC03-CC-002 P2, amendment A52, migrations 0098 and 0099): off unless set; server.ts
   * does not set it. Off, POST /api/v1/personal/inputs does not exist (404) and nothing is written; turned off again
   * after it was on, the held turns it kept stay readable in every Personal read.
   */
  personalInputs?: boolean
  /**
   * Personal answers (INC03-CC-003 A2, amendment A53, migrations 0101 and 0102): off unless set; server.ts does not set
   * it. Off, /api/v1/personal/answers and its operations do not exist (404). On, only with a live companion whose
   * settings make a trusted answer profile 0101 accepts (anything else: buildApp refuses the configuration), and /ready
   * requires 0101's writers and 0102's guard. The guard and the resumption of waiting turns do not depend on it.
   */
  personalAnswers?: boolean
  /**
   * Paid admission of a Personal answer replacement (INC03-CC-003 A3, amendment A54, migration 0103): off unless set;
   * server.ts does not set it. A replacement the owner asks for is admitted at once, or later by their own explicit
   * admit, only with this AND personalAnswers on and the live companion's current profile; otherwise it is kept, held
   * with its reason. It gates nothing else: the control routes (cancel, the held replacement, the reads, the export,
   * replay) are served whenever 0103 is installed, whatever this or personalAnswers say. On without personalAnswers is a
   * configuration error, refused when the app is built.
   */
  personalAnswerReplacementAdmission?: boolean
  /** The deployed commit (RENDER_GIT_COMMIT, 40 hex), served by /health so a probe can name what it reached; else null. */
  commit?: string | null
  /**
   * Voice qualification evidence (A45, migration 0085), off by default. On, the API runs 0085's guard on every bridge
   * presence report and assignment poll, takes the bridge's receipts, answers the principal's read and names the grant
   * on its principal's room token, and is ready only with 0085. Off, none of that: an assignment's grant is not passed
   * on, so a bridge never records.
   */
  voiceQualification?: boolean
  /**
   * With voice qualification on, at most this many voice tool calls are made at once in this process, each under its
   * key's fence, a database session of its own beside the pool's (Codex P1 r4234782537): CALL_FENCE_SESSIONS (8) by
   * default. A call that finds none free within its wait (5 s) answers unknown, and runs and marks nothing.
   */
  callFenceSessions?: number
  /**
   * New owner-runner work (A47, migration 0092): `off` by default. The routes are always served: off refuses new
   * creates and inputs (runner_admission_disabled) but still admits a qualified owner's Stop of a running binding, with
   * all its checks, and the owner keeps reading work already admitted; a database without 0092
   * answers those reads projection_unavailable, never an empty list, and /ready requires 0092 only with `admit`. Each
   * admission still needs an operator-recorded qualification of the owner's route, which no request can create.
   */
  ownerRunnerAdmissions?: OwnerRunnerAdmissions
  /**
   * Member API contributions (A48, migration 0094): the owner's account and connection metadata, selected-project grants,
   * admin narrowing, a member's funding pin and task funding. Off unless set: server.ts does not set it, so only a test
   * (or a later, separately approved activation) mounts the boundary.
   */
  apiContributions?: boolean
}

/**
 * Columns the API reads that no required function names: the authors' names a room message keeps (0048) and a note
 * and a decision keep (0049). The chat and the brief read them on every load (Codex P1 on #336).
 */
const COLUMNS = [
  ['contributions', 'author_name'],
  ['mission_entries', 'author_name'],
  ['decisions', 'proposed_by_name'],
  ['decisions', 'decided_by_name'],
] as const

/** Whether a column of the schema exists: read from the catalog, which every role may read. */
const columnExists = (table: string, column: string) =>
  `EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = to_regclass('sophia.${table}') AND attname = '${column}' AND NOT attisdropped)`

/**
 * Functions the API requires in the database; /ready fails if any is missing, so an instance on a database that a
 * migration hasn't reached takes no traffic. The personal space (0021) lists every function its routes call. 0043
 * (#117) is required by the two functions the capture routes call, the only ones this API calls that main's doesn't:
 * the migration is one transaction, and its other changes replace functions under their own signatures. The previous
 * API requires nothing of 0043 and stays ready on either database (Codex on #107; readiness.db.test.ts). The bridge's
 * presence reports carry their process's sequence (amendment A46 and 0088): this API
 * accepts reportSeq, so it requires 0088's last sequence per room and process (its column, read from pg_attribute) and
 * the guest aggregate its media_report_presence calls. The previous API calls 0088's function with no reportSeq (its
 * contract has none) and stays ready on either database; the bridge that sends reportSeq is deployed after this API.
 * The columns above are required too. A report's Sources open a cited project text (amendment A11's
 * getCitedReportText), which only 0090's contextual guard answers: this API requires it and this login's EXECUTE on it.
 */
const REQUIRED_SCHEMA = `SELECT to_regproc('sophia.admit_goal_command') IS NOT NULL
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('sophia.room_bridge_reports')
    AND attname='last_seq' AND NOT attisdropped)
  AND to_regprocedure('sophia.room_guests_asserted(uuid,timestamptz)') IS NOT NULL
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
  AND to_regprocedure('sophia.remember_room_name(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.rename_project(uuid,text,text)') IS NOT NULL
  AND to_regprocedure('sophia.leave_project(uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.set_goal_target(uuid,uuid,uuid,date,bigint)') IS NOT NULL
  AND to_regprocedure('sophia.invitable_people(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.change_member_role(uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.project_activity(uuid,bigint,integer)') IS NOT NULL
  AND to_regprocedure('sophia.remove_member(uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.set_project_archived(uuid,boolean,text)') IS NOT NULL
  AND to_regprocedure('sophia.record_room_act(uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.activity_name(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.name_from_room(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.name_actor(text,text)') IS NOT NULL
  AND to_regprocedure('sophia.my_profile()') IS NOT NULL
  AND to_regprocedure('sophia.set_my_profile(text,bigint,text)') IS NOT NULL
  AND to_regprocedure('sophia.actor_label(uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.list_needs()') IS NOT NULL
  AND to_regprocedure('sophia.mark_reply_seen(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.project_updates(uuid,integer)') IS NOT NULL
  AND to_regprocedure('sophia.mark_project_seen(uuid,bigint)') IS NOT NULL
  AND to_regprocedure('sophia.preview_contribution_act(uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.correct_contribution(uuid,uuid,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.withdraw_contribution(uuid,uuid,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.list_needs(boolean)') IS NOT NULL
  -- 0069 already made list_needs(boolean); only 0076's body reads a mention's source as its recipient may (4308526636).
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure('sophia.list_needs(boolean)')
    AND position('s.owner_id=a OR (s.scope=''project'' AND s.eligible)' IN p.prosrc) > 0)
  AND to_regprocedure('sophia.mark_mention_seen(uuid,uuid,bigint,bigint)') IS NOT NULL
  AND to_regprocedure('sophia.contribution_recipients(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.markdown_section_texts(text)') IS NOT NULL
  AND to_regprocedure('sophia.create_project_task(uuid,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.set_project_task_owner(uuid,uuid,uuid,bigint)') IS NOT NULL
  AND to_regprocedure('sophia.finish_project_task(uuid,uuid,text,bigint)') IS NOT NULL
  AND ${TASK_WRITES}
  AND to_regprocedure('sophia.goal_retirements(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.media_claim_live_call(uuid,bigint,uuid,text,text,text)') IS NOT NULL
  AND coalesce(has_function_privilege(to_regprocedure('sophia.cited_report_text(uuid,uuid,uuid)'), 'EXECUTE'), false)
  AND ${COLUMNS.map(([table, column]) => columnExists(table, column)).join('\n  AND ')} AS ok`

/**
 * What an API with a byte store also requires: the claim every write makes first (0044, writeOnce). An API without
 * one, and the previous API, require nothing of 0044, so it is not needed before the store is configured.
 */
export const STORE_SCHEMA = `SELECT to_regprocedure('sophia.claim_object_write(text,text,bigint)') IS NOT NULL AS ok`

/**
 * What an API with voice qualification on (A45) calls of 0085: its guard, the bridge's receipts, the principal's read and
 * the room token's grant; of 0086, a recorded call's answer, its fence's generation, and the seal and the mark that
 * write the answer under it (Codex P1 r4234782534); and of 0087, the service's numbering of the bridge's receipts
 * (Codex P1 r4232908444). An API with it off, the default, and the previous API, require nothing of 0085 or 0087, and
 * of 0086 only the claim (REQUIRED_SCHEMA).
 */
/**
 * Member API contributions on (A48): 0094's write entry and 0100's rebuild funding guard (INC01-COHERENT-WRITE-003). An
 * API with contributions on is not ready on a database without 0100, where a rebuilt contributed task would run unbound.
 */
export const CONTRIBUTION_FUNDING_SCHEMA = `SELECT to_regprocedure('sophia.api_contribution_write(text,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.contribution_lineage_unbound(uuid,uuid)') IS NOT NULL AS ok`

export const VOICE_SCHEMA = `SELECT to_regprocedure('sophia.voice_qualification_guard()') IS NOT NULL
  AND to_regprocedure('sophia.media_record_evidence(uuid,uuid,integer,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.media_record_evidence_write(uuid,uuid,uuid,text,jsonb)') IS NOT NULL
  AND to_regclass('sophia.voice_evidence_high_water') IS NOT NULL
  AND to_regclass('sophia.voice_evidence_writes') IS NOT NULL
  AND to_regprocedure('sophia.media_voice_reserve(uuid,uuid,text,integer,bigint,bigint,boolean)') IS NOT NULL
  AND to_regprocedure('sophia.voice_qualification_evidence_read(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.voice_room_qualification(uuid)') IS NOT NULL
  AND to_regprocedure('sophia.media_record_live_call(uuid,bigint,uuid,text,text)') IS NOT NULL
  AND to_regprocedure('sophia.live_call_admits(uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.live_call_command()') IS NOT NULL
  AND to_regprocedure('sophia.media_live_call_answer(uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.media_fence_live_call(uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.live_call_seal(uuid,text,bigint,text)') IS NOT NULL
  AND to_regprocedure('sophia.media_mark_live_call(uuid,uuid,text,bigint,text)') IS NOT NULL
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
    ? writeOnce(store, (path, sha256, byteLength, control) =>
        withService(pool, (c) => claimObjectWrite(c, path, sha256, byteLength), control),
      )
    : null

export function buildApp(deps: AppDeps): FastifyInstance {
  // Refuses automatic inputs without conversations, and answers without a live profile, before anything exists.
  refuseMisconfiguration(deps)
  const app = Fastify({
    logger: deps.logger ?? false,
    genReqId: () => randomUUID(),
    // A path parameter may be as long as its contract allows: a need's id is up to 600 characters (A15), escaped in the
    // path (`:` as %3A); the router's default (100) answered such a path 414.
    routerOptions: { maxParamLength: 2000 },
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
  registerHealth(app, deps.pool, healthOf(deps))
  const store = writeOnceStore(deps.pool, deps.byteStore)

  projectRoutes(app, { pool: deps.pool, livekit: deps.livekit })
  projectionRoutes(app, { pool: deps.pool, voice })
  goalTargetRoutes(app, { pool: deps.pool })
  profileRoutes(app, { pool: deps.pool })
  needsRoutes(app, { pool: deps.pool })
  updatesRoutes(app, { pool: deps.pool })
  contributionActRoutes(app, { pool: deps.pool })
  activityRoutes(app, { pool: deps.pool, livekit: deps.livekit })
  commandRoutes(app, { pool: deps.pool })
  conversationRoutes(app, { pool: deps.pool, voice })
  missionRoutes(app, { pool: deps.pool })
  runtimeRoutes(app, { pool: deps.pool, hub: runtimeHub })
  researchRoutes(app, deps.pool)
  // The reply runtime's routes call 0064's functions: served, and checked by /ready, only with conversations on.
  if (deps.conversations) conversationRuntimeRoutes(app, deps.pool)
  designRoutes(app, { pool: deps.pool, store })
  roomRoutes(app, { pool: deps.pool, livekit: deps.livekit, voice })
  exchangeRoutes(app, { pool: deps.pool, livekit: deps.livekit })
  const fences = new CallFences(deps.callFenceSessions ?? CALL_FENCE_SESSIONS)
  mediaRoutes(app, { pool: deps.pool, hub: mediaHub, livekit: deps.livekit, voice, fences })
  accessRoutes(app, { pool: deps.pool, livekit: deps.livekit, invites: deps.invites, mailer: deps.mailer ?? null })
  sourceRoutes(app, { pool: deps.pool, store })
  rendererRoutes(app, { pool: deps.pool, store })
  knowledgeRoutes(app, { pool: deps.pool })
  searchRoutes(app, { pool: deps.pool })
  humanTaskRoutes(app, { pool: deps.pool })
  coordinationRoutes(app, { pool: deps.pool })
  eventRoutes(app, { pool: deps.pool, hub, heartbeatMs: deps.eventPollMs ?? 10_000 })
  registerPersonal(app, deps)
  registerConversationWrites(app, deps)
  registerNativeRunner(app, deps)
  // Member API contributions (A48, 0094): the whole boundary only when the API is built with it; off by default.
  if (deps.apiContributions === true) apiContributionRoutes(app, { pool: deps.pool })
  return app
}

/**
 * Owner-runner operations (A47), as before, and the native resource catalog (A51, 0097): the catalog is a read, always
 * served whatever new owner-runner work admits.
 */
function registerNativeRunner(app: FastifyInstance, deps: AppDeps): void {
  runnerOperationRoutes(app, { pool: deps.pool, admissions: deps.ownerRunnerAdmissions ?? 'off' })
  projectResourceRoutes(app, { pool: deps.pool })
}

/**
 * The owner's Personal space: its companion's runner, if one is configured, and its routes. Kept apart from buildApp so
 * the composed app stays within its length (FND-B104: Task's routes and this one's close hook, each its own branch's).
 */
function registerPersonal(app: FastifyInstance, deps: AppDeps): void {
  const companion = deps.companion
    ? new CompanionRunner(deps.pool, deps.companion, (err) =>
        app.log.error({ companion: companionFailure(err) }, 'companion answer failed'),
      )
    : null
  // Shutdown waits for the answers already accepted (their runs outlive the 202), before the pool or model close.
  if (companion) app.addHook('onClose', () => companion.close())
  // R1 (A2): once ready, the live companion's one owner's oldest waiting turn is resumed (a restart, a config change),
  // through the same runner and 0102's guard; whatever the Answer routes' switch. Its failure is reported, never thrown.
  const owner = companion?.liveOwner ?? null
  if (companion && owner)
    app.addHook('onReady', () => {
      void companion.resume(owner)
      return Promise.resolve()
    })
  personalRoutes(app, { pool: deps.pool, companion })
  if (deps.personalInputs === true) personalInputRoutes(app, { pool: deps.pool })
  if (companion && answersOn(deps)) personalAnswerRoutes(app, { pool: deps.pool, companion })
  // Installation, not a switch, is the boundary (A54): served always, answering 503 where 0103 is not installed.
  personalAnswerControlRoutes(app, {
    pool: deps.pool,
    companion,
    replacementAdmission: replacementAdmissionOn(deps),
  })
}

/** The switches' configuration errors, thrown before the app has anything of its own. */
function refuseMisconfiguration(deps: AppDeps): void {
  inputsOn(deps)
  answersOn(deps)
  replacementAdmissionOn(deps)
}

/**
 * Whether a Personal answer replacement may be admitted with payment: personalAnswerReplacementAdmission AND
 * personalAnswers (which itself requires a live companion with a supported profile). On without personalAnswers is a
 * configuration error, refused when the app is built.
 */
function replacementAdmissionOn(deps: AppDeps): boolean {
  if (deps.personalAnswerReplacementAdmission !== true) return false
  if (!answersOn(deps)) throw new Error('personalAnswerReplacementAdmission requires personalAnswers')
  return true
}

/**
 * Whether the Answer routes are served: the switch on, with a live companion whose live settings make a trusted answer
 * profile 0101 accepts. On without one is a configuration error, refused when the app is built.
 */
function answersOn(deps: AppDeps): boolean {
  if (deps.personalAnswers !== true) return false
  const { companion } = deps
  if (companion?.mode !== 'live' || !companion.answerProfile?.())
    throw new Error('personalAnswers requires a live companion with a supported answer profile')
  return true
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
  app.decorateRequest('actorContact', null)
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
      req.actorContact = actor.contact
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

/** Whether the companion has what it needs outside this process (none needed: ready). */
const companionReady = async (companion: Companion | null): Promise<boolean> =>
  companion?.ready ? companion.ready() : true

/**
 * Saved project conversations (A33), and their automatic inputs (A49, 0095) only with conversations on as well. Kept
 * apart from buildApp so the composed app stays within its length.
 */
function registerConversationWrites(app: FastifyInstance, deps: AppDeps): void {
  if (deps.conversations) projectConversationRoutes(app, { pool: deps.pool })
  if (inputsOn(deps)) conversationInputRoutes(app, { pool: deps.pool })
}

/**
 * Whether the automatic-input routes are served: both switches on. Inputs without conversations is a configuration
 * error, refused when the app is built, so it never looks enabled while no route exists.
 */
function inputsOn(deps: AppDeps): boolean {
  if (deps.conversationInputs !== true) return false
  if (deps.conversations !== true) throw new Error('conversationInputs requires conversations')
  return true
}

/** What /health and /ready answer for: the schema parts this API's switches require, its companion and its commit. */
interface Health {
  stores: boolean
  conversations: boolean
  conversationInputs: boolean
  personalAnswers: boolean
  companion: Companion | null
  voice: boolean
  ownerRunners: boolean
  apiContributions: boolean
  commit: string | null
}

const healthOf = (deps: AppDeps): Health => ({
  stores: Boolean(deps.byteStore),
  conversations: Boolean(deps.conversations),
  conversationInputs: inputsOn(deps),
  personalAnswers: answersOn(deps),
  companion: deps.companion ?? null,
  voice: deps.voiceQualification === true,
  ownerRunners: deps.ownerRunnerAdmissions === 'admit',
  apiContributions: deps.apiContributions === true,
  commit: deps.commit ?? null,
})

/** Whether the database has every function and column this API's switches call (each part only when it is on). */
async function schemaReady(
  pool: pg.Pool,
  { stores, conversations, conversationInputs, personalAnswers, voice, ownerRunners, apiContributions }: Health,
): Promise<boolean> {
  const part = async (on: boolean, sql: string) => !on || (await pool.query<{ ok: boolean }>(sql)).rows[0]?.ok === true
  return (
    (await part(true, REQUIRED_SCHEMA)) &&
    (await part(stores, STORE_SCHEMA)) &&
    (await part(conversations, CONVERSATION_SCHEMA)) &&
    (await part(conversationInputs, CONVERSATION_INPUTS_SCHEMA)) &&
    (await part(personalAnswers, PERSONAL_ANSWERS_SCHEMA)) &&
    (await part(voice, VOICE_SCHEMA)) &&
    (await part(ownerRunners, OWNER_RUNNER_SCHEMA)) &&
    (await part(apiContributions, CONTRIBUTION_FUNDING_SCHEMA))
  )
}

function registerHealth(app: FastifyInstance, pool: pg.Pool, health: Health): void {
  const { companion, commit } = health
  app.get('/health', () => ({ ok: true, commit }))
  app.get('/ready', async (_req, reply) => {
    try {
      await checkRoleSafety(pool)
      if (!(await schemaReady(pool, health))) return await reply.status(503).send({ ready: false, reason: 'schema' })
      // The live companion's payer is still admitted (0073): without it no personal answer could be asked.
      if (!(await companionReady(companion))) return await reply.status(503).send({ ready: false, reason: 'companion' })
      return { ready: true }
    } catch {
      return reply.status(503).send({ ready: false, reason: 'database' })
    }
  })
}
