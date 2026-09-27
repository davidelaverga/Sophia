// The Gemini Live tool surface (architecture 06 §6–§7, S1-05A): only tools that are implemented end to end.
// Image, prototype and technical-lead tools are not declared: a tool that could only answer with a placeholder
// would teach the model to promise work nobody does. Every tool is NON_BLOCKING, stated explicitly (no model
// default is relied on), and every response finishes its call at once with top-level `scheduling` and
// `willContinue: false`: admitted work reports a real work id, and long results arrive as project events.
import { Behavior, FunctionResponseScheduling, type FunctionDeclaration, type FunctionResponse } from '@google/genai'
import type { MediaToolCall, MediaToolResult } from '@sophia/contracts'

export type ToolName = MediaToolCall['name']

const UUID_SCHEMA = { type: 'string', pattern: '^[0-9a-f-]{36}$' }

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'project_status',
    behavior: Behavior.NON_BLOCKING,
    description:
      'Read the project’s current goals, background work (with task ids and phases) and recent shared points (with ids). Use before starting or controlling work.',
    parametersJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_selected_source',
    behavior: Behavior.NON_BLOCKING,
    description:
      'Read the exact text of one drafted brief (taskId) or one shared point (contributionId). Use it for precise values instead of guessing from the screen.',
    parametersJsonSchema: {
      type: 'object',
      properties: { taskId: UUID_SCHEMA, contributionId: UUID_SCHEMA },
      additionalProperties: false,
    },
  },
  {
    name: 'start_brief',
    behavior: Behavior.NON_BLOCKING,
    description:
      'Ask Sophia’s runtime to draft an implementation brief from shared points. Only when the speaker explicitly asks for a brief. Returns an admitted work id at once; the brief arrives later.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'What the brief should do, in the speaker’s words.' },
        contributionIds: { type: 'array', items: UUID_SCHEMA, maxItems: 8 },
      },
      required: ['instruction'],
      additionalProperties: false,
    },
  },
  {
    name: 'control_work',
    behavior: Behavior.NON_BLOCKING,
    description:
      'Hold, resume or stop one piece of background work (taskId from project_status). Only when the speaker explicitly asks. Stopping ending your speech is not stopping work.',
    parametersJsonSchema: {
      type: 'object',
      properties: { taskId: UUID_SCHEMA, action: { type: 'string', enum: ['hold', 'resume', 'stop'] } },
      required: ['taskId', 'action'],
      additionalProperties: false,
    },
  },
]

const NAMES: ReadonlySet<string> = new Set(TOOL_DECLARATIONS.map((t) => t.name ?? ''))

export const isToolName = (name: string | undefined): name is ToolName => name !== undefined && NAMES.has(name)

/**
 * The response that finishes a call: the service's result as the `response`, with `scheduling` and
 * `willContinue` at the TOP level of the FunctionResponse (G-06), never inside `response`.
 */
export function toolResponse(call: { id: string; name: string }, result: MediaToolResult): FunctionResponse {
  return {
    id: call.id,
    name: call.name,
    response: { output: { status: result.status, ...result.output } },
    scheduling: FunctionResponseScheduling.WHEN_IDLE,
    willContinue: false,
  }
}

/** A call the bridge cannot attribute or does not know: answered at once, never executed. */
export function refusedResponse(call: { id: string; name: string }, ask: string): FunctionResponse {
  return toolResponse(call, { status: 'clarify', output: { ask } })
}
