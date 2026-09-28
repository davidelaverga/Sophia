// Gemini Live tool calls (contract amendments A06, A08). A call acts for the speaker its input epoch binds
// (sophia.media_tool_speaker), never for an actor the model names, and runs the same use cases as the HTTP routes
// under that speaker's own role: a viewer can ask about the project but cannot change the mission or control work.
// Idempotency keys derive from (exchange, connection generation, call id), so a provider retry or reconnect never
// writes twice. TOOL_HANDLERS is the one list of the guide's operations: the contract's name union keys it, so a
// missing handler fails typecheck, and /v1/media/tool-surface serves its names to the bridge. No brief, research,
// lead or builder tool answers here.
import type pg from 'pg'
import type { MediaToolCall, MediaToolResult } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { admitGoalCommand, readSnapshot, toolSpeaker, withActor, withService } from '@sophia/persistence'
import {
  decideChange,
  projectStatus,
  proposeChange,
  readSelectedSource,
  recordMissionNote,
  type ToolContext,
} from './mission-tools.ts'

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

const CONTROLS = new Set(['hold', 'resume', 'stop'])

/** control_work: Hold, Resume or Stop existing work, exactly as before M01. It never creates work. */
async function controlWork(ctx: ToolContext): Promise<MediaToolResult> {
  const args = ctx.args
  const action = typeof args.action === 'string' && CONTROLS.has(args.action) ? args.action : null
  if (!isUuid(args.taskId) || !action) return clarify('Which work, and should I hold, resume or stop it?')
  const taskId = args.taskId
  try {
    const snap = await withActor(ctx.pool, ctx.actorId, 'read', (c) => readSnapshot(c, ctx.projectId))
    const task = snap?.work.find((t) => t.id === taskId)
    const goal = snap?.goals.find((g) => g.id === task?.goalId)
    if (!task || !goal) return clarify('I can’t find that work in this project.')
    const kind = action === 'hold' ? 'hold' : action === 'resume' ? 'resume' : 'stop'
    const receipt = await withActor(ctx.pool, ctx.actorId, 'write', (c) =>
      admitGoalCommand(c, ctx.projectId, ctx.key, {
        kind,
        goalId: goal.id,
        expectedGoalRevision: goal.revision,
        expectedAuthorityEpoch: goal.authorityEpoch,
        bodySourceId: null,
      }),
    )
    return {
      status: 'ok',
      output: { commandId: receipt.commandId, stage: receipt.stage, note: `${kind} requested; the work confirms it.` },
    }
  } catch (err: unknown) {
    return refusal(err)
  }
}

/** The guide's six model-facing operations (M01 v1.1), in the asset manifest's order. */
export const TOOL_HANDLERS = {
  project_status: projectStatus,
  read_selected_source: readSelectedSource,
  record_mission_note: recordMissionNote,
  propose_mission_change: proposeChange,
  decide_mission_change: decideChange,
  control_work: controlWork,
} satisfies Record<MediaToolCall['name'], (ctx: ToolContext) => Promise<MediaToolResult>>

/** What /v1/media/tool-surface serves: the names this API executes, in the handlers' order. */
export const TOOL_NAMES: readonly string[] = Object.keys(TOOL_HANDLERS)

/** Execute one call for its bound speaker. Unbound attribution is a question back, never an action. */
export async function executeToolCall(pool: pg.Pool, call: MediaToolCall): Promise<MediaToolResult> {
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
