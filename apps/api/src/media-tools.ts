// Gemini Live tool calls (contract amendments A06, A08). A call acts for the speaker its input epoch binds
// (sophia.media_tool_speaker), never for an actor the model names, and runs the same use cases as the HTTP routes
// under that speaker's own role: a viewer can ask about the project but cannot change the mission or control work.
// Idempotency keys derive from (exchange, connection generation, call id), so a provider retry or reconnect never
// writes twice. TOOL_HANDLERS is the one list of the guide's operations: the contract's name union keys it, so a
// missing handler fails typecheck. /v1/media/tool-surface serves the names of the guide version the bridge runs
// (TOOL_SURFACES): v1.1 is M01's six, v1.2 adds start_research and render_research, and steer on control_work
// (SMC-M03 S6), and v1.3 adds revise_html_page (SDD-01). No brief, lead or builder tool answers here. For a v1.2 guide, a control the work refused is
// explained from where the task stands now, and a steer on work that ended is refused before anything is admitted
// (CX-0026); a write whose commit is lost is unknown for every guide, never a refusal, and a retried control is
// answered as the one already admitted.
import { createHash } from 'node:crypto'
import pg from 'pg'
import type { MediaToolCall, MediaToolResult, Receipt } from '@sophia/contracts'
import { canonicalJson } from '@sophia/coordination'
import { DomainError } from '@sophia/domain'
import {
  admitGoalCommand,
  answerLiveCall,
  canCommand,
  claimLiveCall,
  liveCallAdmits,
  liveCallAnswer,
  readSnapshot,
  readTaskStandings,
  recordLiveCall,
  researchGateOpen,
  sentCommand,
  submitContribution,
  toolSpeaker,
  withActor,
  withService,
  type LiveCallAnswer,
  type SentCommand,
  type TaskStanding,
} from '@sophia/persistence'
import {
  endedWithNothingUnderWay,
  refusedControl,
  steerAccepted,
  type Control,
  type NotApplied,
} from './control-words.ts'
import {
  decideChange,
  projectStatus,
  proposeChange,
  readSelectedSource,
  recordMissionNote,
  type ToolContext,
} from './mission-tools.ts'
import { reviseHtmlPage } from './design-tools.ts'
import { renderResearch, startResearch } from './research-tools.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

const clarify = (question: string): MediaToolResult => ({ status: 'clarify', output: { ask: question } })

/** A call key another call holds (another speaker, epoch, operation or call under a reused id): nothing runs. */
const reusedCall: MediaToolResult = {
  status: 'refused',
  output: {
    code: 'not_started:idempotency_conflict',
    reason: 'That call was already made as another operation; nothing was done. Ask again.',
  },
}

/**
 * The digest a call's key is claimed with (0047): SHA-256 over the canonical JSON (keys sorted at every depth, no
 * whitespace) of everything its handlers read that the key (exchange, connection generation, call id) and the claim's
 * own columns (speaker, input epoch, tool) do not hold: its arguments, the utterance it answers, its input mode and the
 * guide. An absent field is null, which no present one can be. The same call in another key order is the same call;
 * other arguments (Codex P1 r4233409532), a later utterance (r4233923450: a decision the utterance its proposal was put
 * in could only clarify, accepted under the same id in the next), another input mode or guide under a reused call id
 * are another call, never a retry. The bridge resends a lost answer's call as it was, so a retry is the same call. Only
 * the digest leaves the API, never the arguments.
 */
export const callSha256 = (call: Pick<MediaToolCall, 'args' | 'utterance' | 'inputMode' | 'guide'>): string =>
  createHash('sha256')
    .update(
      canonicalJson({
        args: call.args,
        utterance: call.utterance ?? null,
        inputMode: call.inputMode ?? null,
        guide: call.guide ?? null,
      }),
      'utf8',
    )
    .digest('hex')

/**
 * A recorded call already answered, asked again (Codex P1 r4234171899): its recorded answer, with the command it admitted
 * and that command's task, and nothing run or admitted again. A state-dependent refusal or question stays its answer.
 */
const replayed = (answer: LiveCallAnswer): MediaToolResult => ({
  status: answer.outcome,
  output: {
    replayed: true,
    ...(answer.commandId === null ? {} : { commandId: answer.commandId }),
    ...(answer.taskId === null ? {} : { taskId: answer.taskId }),
    note: 'This call was already answered; nothing more was done.',
  },
})

/**
 * How long a call waits for the fence another attempt of it holds, in this API process or another (a rolling deploy),
 * before it answers that the call is still being made. The bridge sets no limit on a tool call's answer, so this one
 * never makes it ask again.
 */
export const CALL_FENCE_WAIT_MS = 5000

/** Another attempt of the call holds its fence: nothing was run or marked here, and whether it applied is not known. */
const inProgress: MediaToolResult = {
  status: 'unknown',
  output: {
    code: 'unconfirmed:in_progress',
    reason: 'That call is still being made; I could not confirm whether it was applied. Read project_status.',
  },
}

const fenceUnavailable: MediaToolResult = {
  status: 'error',
  output: { reason: 'The tool failed; nothing was changed.' },
}

/**
 * The fence on a call's key, across API processes (Codex P1 r4234393693, r4234171899): a session advisory lock on a
 * connection of its own, keyed by the call key. It is taken before the call is claimed, bound and recorded, and held
 * across its handler and its answer's mark, so another attempt of the call, in any API process, waits for it (at most
 * `waitMs`), then reads the answer the holder gave, or runs a call the holder left unanswered. It is taken while holding
 * no other lock, and calls under other keys never wait on it, so it adds no lock order. A holder that dies ends its
 * session, which releases the fence. Resolves to its release (once), or null when the wait ran out.
 */
async function fenceCall(pool: pg.Pool, key: string, waitMs: number): Promise<(() => Promise<void>) | null> {
  const client = new pg.Client(pool.options)
  // A fence connection lost: its session, and so its fence, ended with it.
  client.on('error', () => undefined)
  const lock = `sophia.live_call:${key}`
  try {
    await client.connect()
    await client.query(`SELECT set_config('lock_timeout', $1, false)`, [`${String(waitMs)}ms`])
    await client.query(`SELECT pg_advisory_lock(hashtextextended($1, 0))`, [lock])
  } catch (err: unknown) {
    await client.end().catch(() => undefined)
    // lock_timeout: another attempt holds the fence still.
    if (err instanceof Error && 'code' in err && err.code === '55P03') return null
    throw err
  }
  let released: Promise<void> | null = null
  return () =>
    (released ??= client
      .query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [lock])
      .then(
        () => undefined,
        () => undefined,
      )
      // Ending the session releases the fence whatever the unlock did.
      .then(() => client.end())
      .catch(() => undefined))
}

/**
 * control_work's refusals in the speaker's words; anything unexpected is an error the model must not paper over. A
 * commit whose outcome is lost, or a database that did not answer, is unknown: it may have been applied.
 */
function refusal(err: unknown): MediaToolResult {
  if (!(err instanceof DomainError))
    return { status: 'error', output: { reason: 'The tool failed; nothing was changed.' } }
  if (err.code === 'forbidden') {
    return {
      status: 'refused',
      output: { reason: 'Only editors and admins can start or control work. Viewers can talk with Sophia.' },
    }
  }
  if (err.code === 'outcome_unknown' || err.code === 'unavailable') {
    return {
      status: 'unknown',
      output: {
        code: `unconfirmed:${err.code}`,
        reason: 'I could not confirm whether it was applied; read project_status.',
      },
    }
  }
  return { status: 'refused', output: { code: err.code, reason: err.message } }
}

const controlOf = (v: unknown): Control | null =>
  v === 'hold' || v === 'resume' || v === 'stop' || v === 'steer' ? v : null

/** A steer's brief: what the speaker asked the work to change, as the guide put it (1 to 2000 characters). */
const briefOf = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 2000 ? v.trim() : null

type ControlRequest = { taskId: string; action: Control; brief: string | null }

/** The control the model asked for, or the one question that would make it one. */
function controlRequest(args: Record<string, unknown>): ControlRequest | MediaToolResult {
  const action = controlOf(args.action)
  if (!isUuid(args.taskId) || !action) return clarify('Which work, and should I hold, resume, stop or steer it?')
  const brief = action === 'steer' ? briefOf(args.brief) : null
  if (action === 'steer' && !brief) return clarify('What should the work change or focus on?')
  return { taskId: args.taskId, action, brief }
}

/** What the write did: a command admitted (with where the steered task stood), or a steer on work that ended. */
type Admission = { receipt: Receipt; standing: TaskStanding | null } | { ended: TaskStanding; researchGate: boolean }

type Goal = { id: string; revision: number; authorityEpoch: number }

/**
 * The steered task when this steer is refused before anything is written: it ended while nothing of its goal is under
 * way, and the work would accept the steer for a goal its blocker or failure left running (0026, 0036). Never for a
 * retry, which the work answers with its first receipt, nor for a speaker who may not command work: they hear the role
 * first, as admission checks it first.
 */
async function endedSteer(
  c: pg.PoolClient,
  projectId: string,
  standing: TaskStanding | null,
  sent: SentCommand | null,
): Promise<TaskStanding | null> {
  if (sent || !standing || !endedWithNothingUnderWay(standing)) return null
  return (await canCommand(c, projectId)) ? standing : null
}

/**
 * Admit the control in one transaction. A steer reads the task first, and one on work that ended is refused here
 * (endedSteer). The brief is the speaker's own attributed contribution, and that source is the steer's body. A
 * retry under the same key sends what its first call expected of the goal, so the work answers it with that receipt.
 */
async function admitControl(c: pg.PoolClient, ctx: ToolContext, req: ControlRequest, goal: Goal): Promise<Admission> {
  const sent = await sentCommand(c, ctx.projectId, ctx.key)
  const standing =
    req.action === 'steer' ? ((await readTaskStandings(c, ctx.projectId, [req.taskId]))[0] ?? null) : null
  const ended = await endedSteer(c, ctx.projectId, standing, sent)
  if (ended) return { ended, researchGate: await researchGateOpen(c, ctx.projectId) }
  const body = req.brief
    ? await submitContribution(
        c,
        ctx.projectId,
        `${ctx.key}:steer`,
        { source: null, text: req.brief, threadId: null, artifactVersionId: null, intent: 'discuss' },
        'voice',
      )
    : null
  if (ctx.liveCall) await liveCallAdmits(c, ctx.projectId, ctx.key)
  const receipt = await admitGoalCommand(c, ctx.projectId, ctx.key, {
    kind: req.action,
    goalId: goal.id,
    expectedGoalRevision: sent?.expectedGoalRevision ?? goal.revision,
    expectedAuthorityEpoch: sent?.expectedAuthorityEpoch ?? goal.authorityEpoch,
    bodySourceId: body?.sourceId ?? null,
  })
  return { receipt, standing }
}

const notApplied = (output: NotApplied): MediaToolResult => ({ status: 'refused', output: { ...output } })

/**
 * Why the work refused a v1.2 guide's control, read afresh after the refusal: the refused write rolled back, so
 * nothing was applied whatever this read finds, and a read that fails says only that.
 */
async function explainRefusal(
  ctx: ToolContext,
  req: ControlRequest,
  refusedAs: 'invalid_state' | 'stale_revision',
): Promise<MediaToolResult> {
  const read = await withActor(ctx.pool, ctx.actorId, 'read', async (c) => ({
    standing: (await readTaskStandings(c, ctx.projectId, [req.taskId]))[0] ?? null,
    researchGate: req.action === 'steer' ? await researchGateOpen(c, ctx.projectId) : null,
    // A failed read loses only the reason: the refused write rolled back either way.
  })).catch(() => null)
  return notApplied(
    refusedControl({
      action: req.action,
      refusedAs,
      standing: read?.standing ?? null,
      researchGate: read?.researchGate ?? null,
    }),
  )
}

/** A refusal a v1.2 guide is told the reason for: the work's state or revision, never a lost commit. */
const explained = (err: unknown): 'invalid_state' | 'stale_revision' | null =>
  err instanceof DomainError && (err.code === 'invalid_state' || err.code === 'stale_revision') ? err.code : null

/**
 * control_work: Hold, Resume or Stop existing work, exactly as before M01; or steer it (v1.2). It never creates
 * work. An accepted steer is said as not applied yet, with the task it reaches; nothing reports back when it is.
 */
async function controlWork(ctx: ToolContext): Promise<MediaToolResult> {
  const request = controlRequest(ctx.args)
  if ('status' in request) return request
  try {
    const snap = await withActor(ctx.pool, ctx.actorId, 'read', (c) => readSnapshot(c, ctx.projectId))
    const task = snap?.work.find((t) => t.id === request.taskId)
    const goal = snap?.goals.find((g) => g.id === task?.goalId)
    if (!task || !goal) return clarify('I can’t find that work in this project.')
    const done = await withActor(ctx.pool, ctx.actorId, 'write', (c) => admitControl(c, ctx, request, goal))
    if ('ended' in done) {
      return notApplied(
        refusedControl({
          action: 'steer',
          refusedAs: 'invalid_state',
          standing: done.ended,
          researchGate: done.researchGate,
        }),
      )
    }
    if (request.action === 'steer')
      return {
        status: 'ok',
        output: { commandId: done.receipt.commandId, accepted: true, note: steerAccepted(done.standing) },
      }
    return {
      status: 'ok',
      output: {
        commandId: done.receipt.commandId,
        stage: done.receipt.stage,
        note: `${request.action} requested; the work confirms it.`,
      },
    }
  } catch (err: unknown) {
    const refusedAs = sinceV12(ctx.call.guide) ? explained(err) : null
    return refusedAs ? explainRefusal(ctx, request, refusedAs) : refusal(err)
  }
}

/** The guide's model-facing operations: M01 v1.1's six in the asset manifest's order, v1.2's research tools, v1.3's edit. */
export const TOOL_HANDLERS = {
  project_status: projectStatus,
  read_selected_source: readSelectedSource,
  record_mission_note: recordMissionNote,
  propose_mission_change: proposeChange,
  decide_mission_change: decideChange,
  control_work: controlWork,
  start_research: startResearch,
  render_research: renderResearch,
  revise_html_page: reviseHtmlPage,
} satisfies Record<MediaToolCall['name'], (ctx: ToolContext) => Promise<MediaToolResult>>

const M01_TOOLS = [
  'project_status',
  'read_selected_source',
  'record_mission_note',
  'propose_mission_change',
  'decide_mission_change',
  'control_work',
] as const satisfies ReadonlyArray<keyof typeof TOOL_HANDLERS>

/** What /v1/media/tool-surface serves for each guide version; v1.1 when the bridge names none. */
export const TOOL_SURFACES = {
  'v1.1': M01_TOOLS,
  'v1.2': [...M01_TOOLS, 'start_research', 'render_research'],
  'v1.3': [...M01_TOOLS, 'start_research', 'render_research', 'revise_html_page'],
} as const satisfies Record<string, ReadonlyArray<keyof typeof TOOL_HANDLERS>>

export type GuideVersion = keyof typeof TOOL_SURFACES

/** Whether a guide version has v1.2's operations and words (v1.3 keeps them all). */
export const sinceV12 = (guide: string | undefined): boolean => guide === 'v1.2' || guide === 'v1.3'

/**
 * Whether the bridge's guide declares this call: its name is on the guide's surface, and a steer is v1.2's. A bridge
 * rolled back to v1.1 never sends the research tools; one that did is refused before anything is read or written.
 */
function declaredBy(call: MediaToolCall): boolean {
  const guide = call.guide ?? 'v1.1'
  const surface: readonly string[] = TOOL_SURFACES[guide]
  const args: Record<string, unknown> = call.args
  return surface.includes(call.name) && (sinceV12(guide) || call.name !== 'control_work' || args.action !== 'steer')
}

/**
 * Execute one call for its bound speaker. Unbound attribution is a question back, never an action. With voice
 * qualification on (A15), a call of a grant's principal in an exchange under that grant is recorded as it is bound;
 * the command it admits is linked to it in the same transaction (liveCallAdmits), the canonical join from the task it
 * creates to the exchange (NativeTask.exchangeId); and once it is answered, after that admission committed, it is
 * marked so with the answer's status. A mark that fails leaves the call unanswered, which proves nothing. Every call,
 * voice qualification on or off, first claims its key for its speaker, epoch, operation and the call's digest (0047,
 * callSha256): one call per key, whoever speaks. A key another call holds (a provider call id reused by another speaker,
 * under another epoch, for another operation, or with other arguments, utterance, input mode or guide) is refused before
 * anything runs, so no second write is admitted under it; the same call again (the bridge's retry of a lost answer)
 * goes on as before. A recorded call once answered is terminal (Codex P1 r4234171899): its repeat is answered from the
 * record, and its handler never runs again, so a refusal that depended on the work's state can never admit later what
 * the record says it refused. A recorded call not answered yet (the attempt before stopped before its mark) runs again,
 * and is marked. With voice qualification on, the only API that records, every call is made under its key's fence
 * (fenceCall, r4234393693): one attempt at a time across API processes, from before its binding to after its mark, so a
 * repeat reads the answer once it is given, never while it is being made; one that cannot get the fence in time answers
 * that it is still being made (unknown), and runs and marks nothing. A call that is not recorded (voice qualification
 * off, or anyone but the grant's principal) runs again as before: there is no record to keep true, and a lost answer
 * gets a fresh one.
 */
export async function executeToolCall(pool: pg.Pool, call: MediaToolCall, voice = false): Promise<MediaToolResult> {
  if (!declaredBy(call)) {
    return {
      status: 'refused',
      output: { code: 'not_started:not_declared', reason: 'That operation is not available in this conversation.' },
    }
  }
  // The bridge's Google session: the same across a resumed connection, so a repeated call is the same call.
  const key = `live:${call.exchangeId}:${String(call.connectionGeneration)}:${call.callId}`
  if (!voice) {
    const bound = await bindCall(pool, call, key, false)
    return 'status' in bound ? bound : handleCall(pool, call, key, bound)
  }
  let release: (() => Promise<void>) | null
  try {
    release = await fenceCall(pool, key, CALL_FENCE_WAIT_MS)
  } catch {
    return fenceUnavailable
  }
  if (!release) return inProgress
  try {
    const bound = await bindCall(pool, call, key, true)
    if ('status' in bound) return bound
    const result = await handleCall(pool, call, key, bound)
    await markCall(pool, call, key, bound, result)
    return result
  } finally {
    await release()
  }
}

/** What binding a call found: its project, whether it is recorded, and its answer if it was given already. */
interface Bound {
  projectId: string
  recorded: boolean
  answered: LiveCallAnswer | null
}

/**
 * Claim the call's key, bind it to its speaker and (voice qualification on) record it, in one transaction; a recorded
 * call reads its answer there. A refusal or a question back when it does not bind.
 */
async function bindCall(
  pool: pg.Pool,
  call: MediaToolCall,
  key: string,
  voice: boolean,
): Promise<Bound | MediaToolResult> {
  try {
    return await withService(pool, async (c) => {
      // Before any row lock: the claim locks only its key's row (0047 has no foreign key), never the project or the
      // exchange, so it adds no lock order to the recording's project lock below.
      await claimLiveCall(c, { ...call, key, callSha256: callSha256(call) })
      const bound = await toolSpeaker(c, call.exchangeId, call.inputEpoch, call.actorId)
      const recorded = voice && (await recordLiveCall(c, { ...call, key }))
      // A recorded call once answered is terminal: read in the transaction that binds it, under its fence.
      const answered = recorded
        ? await liveCallAnswer(c, { exchangeId: call.exchangeId, actorId: call.actorId, key })
        : null
      return { ...bound, recorded, answered }
    })
  } catch (err: unknown) {
    if (err instanceof DomainError && err.code === 'idempotency_conflict') return reusedCall
    return clarify('I couldn’t tell who asked that. Could the person holding the floor ask again?')
  }
}

/** A bound call's answer: its recorded answer replayed, or its handler run for its speaker. */
async function handleCall(pool: pg.Pool, call: MediaToolCall, key: string, bound: Bound): Promise<MediaToolResult> {
  if (bound.answered) return replayed(bound.answered)
  const ctx: ToolContext = {
    pool,
    projectId: bound.projectId,
    actorId: call.actorId,
    key,
    call,
    args: call.args,
    liveCall: bound.recorded,
  }
  return TOOL_HANDLERS[call.name](ctx)
}

/** A recorded call answered now (not replayed), after what it admitted committed: its answer's status, once. */
async function markCall(
  pool: pg.Pool,
  call: MediaToolCall,
  key: string,
  bound: Bound,
  result: MediaToolResult,
): Promise<void> {
  if (!bound.recorded || bound.answered) return
  const answered = { exchangeId: call.exchangeId, actorId: call.actorId, key, outcome: result.status }
  await withService(pool, (c) => answerLiveCall(c, answered)).catch(() => undefined)
}
