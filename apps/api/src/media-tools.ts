// Gemini Live tool calls (contract amendment A06, architecture 06 §6–§7). A call acts for the speaker its input
// epoch binds (sophia.media_tool_speaker), never for an actor the model names, and runs the same use cases as the
// HTTP routes under that speaker's own role: a viewer can ask about the project but cannot start or control work.
// Idempotency keys derive from (exchange, connection generation, call id), so a provider retry or reconnect never
// admits twice. Only implemented tools exist: no image, prototype or technical-lead tool answers here.
import type pg from 'pg'
import type { MediaToolCall, MediaToolResult, NativeTaskRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  admitGoalCommand,
  admitNativeTask,
  readNativeTask,
  readSnapshot,
  toolSpeaker,
  withActor,
  withService,
} from '@sophia/persistence'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null
const uuidList = (v: unknown): string[] | null => (Array.isArray(v) && v.every(isUuid) && v.length <= 8 ? v : null)

interface Context {
  pool: pg.Pool
  projectId: string
  actorId: string
  key: string
}

const clarify = (question: string): MediaToolResult => ({ status: 'clarify', output: { ask: question } })

/** Refusals in the speaker's words; anything unexpected is an error the model must not paper over. */
function refusal(err: unknown): MediaToolResult {
  if (!(err instanceof DomainError))
    return { status: 'error', output: { reason: 'The tool failed; nothing was changed.' } }
  if (err.code === 'forbidden') {
    return {
      status: 'refused',
      output: { reason: 'Only editors and admins can start or control work. Viewers can talk with Sophia.' },
    }
  }
  if (err.code === 'native_capability_unavailable') {
    return {
      status: 'refused',
      output: { reason: 'No Sophia runtime is connected to this project, so work cannot start.' },
    }
  }
  return { status: 'refused', output: { code: err.code, reason: err.message } }
}

async function projectStatus(ctx: Context): Promise<MediaToolResult> {
  const snap = await withActor(ctx.pool, ctx.actorId, 'read', (c) => readSnapshot(c, ctx.projectId))
  if (!snap) return refusal(new DomainError('forbidden', 'Not permitted'))
  return {
    status: 'ok',
    output: {
      project: snap.title,
      goals: snap.goals.slice(-10).map((g) => ({ goalId: g.id, title: g.title, status: g.status })),
      work: snap.work.slice(-10).map((t) => ({ taskId: t.id, kind: t.kind, phase: t.phase, reason: t.reason })),
      discussion: snap.discussion.slice(-10).map((d) => ({ contributionId: d.id, excerpt: d.text.slice(0, 280) })),
    },
  }
}

async function readSelectedSource(ctx: Context, args: Record<string, unknown>): Promise<MediaToolResult> {
  if (isUuid(args.taskId)) {
    const taskId = args.taskId
    const detail = await withActor(ctx.pool, ctx.actorId, 'read', (c) => readNativeTask(c, ctx.projectId, taskId))
    if (!detail.result)
      return { status: 'ok', output: { taskId: detail.task.id, phase: detail.task.phase, text: null } }
    const { sourceId, sha256, markdown } = detail.result
    return {
      status: 'ok',
      output: { taskId: detail.task.id, sourceId, sha256, text: markdown.slice(0, 8000), exact: true },
    }
  }
  if (isUuid(args.contributionId)) {
    const snap = await withActor(ctx.pool, ctx.actorId, 'read', (c) => readSnapshot(c, ctx.projectId))
    const entry = snap?.discussion.find((d) => d.id === args.contributionId)
    if (!entry) return clarify('Which point should I read? I can only read ones shared in this project.')
    return {
      status: 'ok',
      output: {
        contributionId: entry.id,
        sourceId: entry.sourceId,
        sha256: entry.sha256,
        text: entry.text,
        exact: true,
      },
    }
  }
  return clarify('Which brief or point should I read?')
}

async function startBrief(ctx: Context, args: Record<string, unknown>): Promise<MediaToolResult> {
  const instruction = text(args.instruction, 4000)
  const contributionIds = args.contributionIds === undefined ? [] : uuidList(args.contributionIds)
  if (!instruction || !contributionIds)
    return clarify('What should the brief do, and which shared points should it use?')
  const snap = await withActor(ctx.pool, ctx.actorId, 'read', (c) => readSnapshot(c, ctx.projectId))
  if (!snap) return refusal(new DomainError('forbidden', 'Not permitted'))
  const request: NativeTaskRequest = {
    kind: 'draft_brief',
    instruction,
    contributionIds,
    expectedMissionRevision: snap.missionRevision,
  }
  const receipt = await withActor(ctx.pool, ctx.actorId, 'write', (c) =>
    admitNativeTask(c, ctx.projectId, ctx.key, request),
  )
  return {
    status: 'admitted',
    output: {
      workId: receipt.taskId,
      commandId: receipt.commandId,
      note: 'Admitted. The result arrives later as project work; it is not done yet.',
    },
  }
}

const CONTROLS = new Set(['hold', 'resume', 'stop'])

async function controlWork(ctx: Context, args: Record<string, unknown>): Promise<MediaToolResult> {
  const action = typeof args.action === 'string' && CONTROLS.has(args.action) ? args.action : null
  if (!isUuid(args.taskId) || !action) return clarify('Which work, and should I hold, resume or stop it?')
  const taskId = args.taskId
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
}

/** Execute one call for its bound speaker. Unbound attribution is a question back, never an action. */
export async function executeToolCall(pool: pg.Pool, call: MediaToolCall): Promise<MediaToolResult> {
  let speaker: { projectId: string }
  try {
    speaker = await withService(pool, (c) => toolSpeaker(c, call.exchangeId, call.inputEpoch, call.actorId))
  } catch {
    return clarify('I couldn’t tell who asked that. Could the person holding the floor ask again?')
  }
  const ctx: Context = {
    pool,
    projectId: speaker.projectId,
    actorId: call.actorId,
    key: `live:${call.exchangeId}:${call.connectionGeneration}:${call.callId}`,
  }
  try {
    if (call.name === 'project_status') return await projectStatus(ctx)
    if (call.name === 'read_selected_source') return await readSelectedSource(ctx, call.args)
    if (call.name === 'start_brief') return await startBrief(ctx, call.args)
    return await controlWork(ctx, call.args)
  } catch (err: unknown) {
    return refusal(err)
  }
}
