// Gemini Live tool calls (contract amendments A06, A08). A call acts for the speaker its input epoch binds
// (sophia.media_tool_speaker), never for an actor the model names, and runs the same use cases as the HTTP routes
// under that speaker's own role: a viewer can ask about the project but cannot change the mission or control work.
// Idempotency keys derive from (exchange, connection generation, call id), so a provider retry or reconnect never
// writes twice. TOOL_HANDLERS is the one list of the guide's operations: the contract's name union keys it, so a
// missing handler fails typecheck. /v1/media/tool-surface serves the names of the guide version the bridge runs
// (TOOL_SURFACES): v1.1 is M01's six, v1.2 adds start_research and render_research, and steer on control_work
// (SMC-M03 S6). No brief, lead or builder tool answers here.
import type pg from 'pg'
import type { MediaToolCall, MediaToolResult } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  admitGoalCommand,
  readSnapshot,
  submitContribution,
  toolSpeaker,
  withActor,
  withService,
} from '@sophia/persistence'
import {
  decideChange,
  projectStatus,
  proposeChange,
  readSelectedSource,
  recordMissionNote,
  type ToolContext,
} from './mission-tools.ts'
import { renderResearch, startResearch } from './research-tools.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

const clarify = (question: string): MediaToolResult => ({ status: 'clarify', output: { ask: question } })

/** control_work's refusals in the speaker's words; anything unexpected is an error the model must not paper over. */
function refusal(err: unknown): MediaToolResult {
  if (!(err instanceof DomainError))
    return { status: 'error', output: { reason: 'The tool failed; nothing was changed.' } }
  if (err.code === 'forbidden') {
    return {
      status: 'refused',
      output: { reason: 'Only editors and admins can start or control work. Viewers can talk with Sophia.' },
    }
  }
  return { status: 'refused', output: { code: err.code, reason: err.message } }
}

type Control = 'hold' | 'resume' | 'stop' | 'steer'
const controlOf = (v: unknown): Control | null =>
  v === 'hold' || v === 'resume' || v === 'stop' || v === 'steer' ? v : null

/** A steer's brief: what the speaker asked the work to change, as the guide put it (1 to 2000 characters). */
const briefOf = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 2000 ? v.trim() : null

/** The control the model asked for, or the one question that would make it one. */
function controlRequest(
  args: Record<string, unknown>,
): { taskId: string; action: Control; brief: string | null } | MediaToolResult {
  const action = controlOf(args.action)
  if (!isUuid(args.taskId) || !action) return clarify('Which work, and should I hold, resume, stop or steer it?')
  const brief = action === 'steer' ? briefOf(args.brief) : null
  if (action === 'steer' && !brief) return clarify('What should the work change or focus on?')
  return { taskId: args.taskId, action, brief }
}

/**
 * control_work: Hold, Resume or Stop existing work, exactly as before M01; or steer it (v1.2). A steer's brief is
 * recorded first as the speaker's own attributed contribution, and that source is the steer's body, in one
 * transaction. It never creates work.
 */
async function controlWork(ctx: ToolContext): Promise<MediaToolResult> {
  const request = controlRequest(ctx.args)
  if ('status' in request) return request
  const { taskId, action, brief } = request
  try {
    const snap = await withActor(ctx.pool, ctx.actorId, 'read', (c) => readSnapshot(c, ctx.projectId))
    const task = snap?.work.find((t) => t.id === taskId)
    const goal = snap?.goals.find((g) => g.id === task?.goalId)
    if (!task || !goal) return clarify('I can’t find that work in this project.')
    const receipt = await withActor(ctx.pool, ctx.actorId, 'write', async (c) => {
      const body = brief
        ? await submitContribution(
            c,
            ctx.projectId,
            `${ctx.key}:steer`,
            { source: null, text: brief, threadId: null, artifactVersionId: null, intent: 'discuss' },
            'voice',
          )
        : null
      return admitGoalCommand(c, ctx.projectId, ctx.key, {
        kind: action,
        goalId: goal.id,
        expectedGoalRevision: goal.revision,
        expectedAuthorityEpoch: goal.authorityEpoch,
        bodySourceId: body?.sourceId ?? null,
      })
    })
    return {
      status: 'ok',
      output: {
        commandId: receipt.commandId,
        stage: receipt.stage,
        note: `${action} requested; the work confirms it.`,
      },
    }
  } catch (err: unknown) {
    return refusal(err)
  }
}

/** The guide's model-facing operations: M01 v1.1's six in the asset manifest's order, then v1.2's research tools. */
export const TOOL_HANDLERS = {
  project_status: projectStatus,
  read_selected_source: readSelectedSource,
  record_mission_note: recordMissionNote,
  propose_mission_change: proposeChange,
  decide_mission_change: decideChange,
  control_work: controlWork,
  start_research: startResearch,
  render_research: renderResearch,
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
} as const satisfies Record<string, ReadonlyArray<keyof typeof TOOL_HANDLERS>>

export type GuideVersion = keyof typeof TOOL_SURFACES

/**
 * Whether the bridge's guide declares this call: its name is on the guide's surface, and a steer is v1.2's. A bridge
 * rolled back to v1.1 never sends the research tools; one that did is refused before anything is read or written.
 */
function declaredBy(call: MediaToolCall): boolean {
  const guide = call.guide ?? 'v1.1'
  const surface: readonly string[] = TOOL_SURFACES[guide]
  const args: Record<string, unknown> = call.args
  return surface.includes(call.name) && (guide === 'v1.2' || call.name !== 'control_work' || args.action !== 'steer')
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
