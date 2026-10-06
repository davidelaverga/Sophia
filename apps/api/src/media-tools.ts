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
import type pg from 'pg'
import type { MediaToolCall, MediaToolResult, Receipt } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  admitGoalCommand,
  canCommand,
  readSnapshot,
  readTaskStandings,
  researchGateOpen,
  sentCommand,
  submitContribution,
  toolSpeaker,
  withActor,
  withService,
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

/** Execute one call for its bound speaker. Unbound attribution is a question back, never an action. */
export async function executeToolCall(pool: pg.Pool, call: MediaToolCall): Promise<MediaToolResult> {
  if (!declaredBy(call)) {
    return {
      status: 'refused',
      output: { code: 'not_started:not_declared', reason: 'That operation is not available in this conversation.' },
    }
  }
  let speaker: { projectId: string }
  try {
    speaker = await withService(pool, (c) => toolSpeaker(c, call.exchangeId, call.inputEpoch, call.actorId))
  } catch {
    return clarify('I couldn’t tell who asked that. Could the person holding the floor ask again?')
  }
  const ctx: ToolContext = {
    pool,
    projectId: speaker.projectId,
    actorId: call.actorId,
    // The bridge's Google session: the same across a resumed connection, so a repeated call is the same call.
    key: `live:${call.exchangeId}:${String(call.connectionGeneration)}:${call.callId}`,
    call,
    args: call.args,
  }
  return TOOL_HANDLERS[call.name](ctx)
}
