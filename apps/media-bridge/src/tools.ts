// The Gemini Live tool surface (architecture 06 §6–§7, SMC-M01 binding §2): the six operations the M01 v1.1 guide
// names, each implemented end to end by the API, and nothing else. No brief, research, PDF, lead, builder, scheduler
// or monitor tool is declared: a tool that could only answer with a placeholder would teach the model to promise work
// nobody does. The declared names must equal the guide manifest's (guide.ts checks it at start) and the API's handlers
// (the session checks /v1/media/tool-surface before it connects). Every tool is NON_BLOCKING, stated explicitly, and
// every response finishes its call at once with top-level `scheduling` and `willContinue: false`.
import { Behavior, FunctionResponseScheduling, type FunctionDeclaration, type FunctionResponse } from '@google/genai'
import type { MediaToolCall, MediaToolResult } from '@sophia/contracts'

export type ToolName = MediaToolCall['name']

const UUID_SCHEMA = { type: 'string', pattern: '^[0-9a-f-]{36}$' }
const ENTRY_KINDS = [
  'observation',
  'expectation',
  'outcome',
  'blocker',
  'explanation',
  'lesson_candidate',
  'continuity',
]

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'project_status',
    behavior: Behavior.NON_BLOCKING,
    description:
      'Read the current mission, relevant notes and decisions, pending proposals, work, missing context, the note policy and which operations are available to the current speaker. It does not commission work.',
    parametersJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_selected_source',
    behavior: Behavior.NON_BLOCKING,
    description:
      'Read the exact eligible text of one source: a brief (taskId), a shared point (contributionId), a mission note (entryId) or a proposal or decision (decisionId). Long text comes in pages: coverage partial with a nextCursor means there is more. Reading a pending proposal to the speaker puts it to them.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        taskId: UUID_SCHEMA,
        contributionId: UUID_SCHEMA,
        entryId: UUID_SCHEMA,
        decisionId: UUID_SCHEMA,
        cursor: { type: 'string', description: 'The nextCursor of the previous page.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'record_mission_note',
    behavior: Behavior.NON_BLOCKING,
    description:
      'Record one meaningful project note from the current speaker’s admitted turn, as a paraphrase, under the active note policy. It never accepts a mission change.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ENTRY_KINDS },
        epistemic: { type: 'string', enum: ['reported', 'observed', 'inferred'] },
        text: { type: 'string', maxLength: 2000 },
        relatedEntryId: UUID_SCHEMA,
        goalId: UUID_SCHEMA,
        decisionId: UUID_SCHEMA,
        correctsEntryId: UUID_SCHEMA,
      },
      required: ['kind', 'epistemic', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_mission_change',
    behavior: Behavior.NON_BLOCKING,
    description:
      'Prepare one specific mission, constraint or lesson proposal. Creating it accepts nothing: the returned proposalId and proposalRevision are the decision target.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['mission', 'constraint', 'lesson'] },
        statement: { type: 'string', maxLength: 2000 },
        purpose: { type: 'string', maxLength: 1000 },
        destination: { type: 'string', maxLength: 1000 },
        origin: { type: 'string', maxLength: 1000 },
        supersedesDecisionId: UUID_SCHEMA,
        supportingEntryIds: { type: 'array', items: UUID_SCHEMA, maxItems: 8 },
      },
      required: ['kind', 'statement'],
      additionalProperties: false,
    },
  },
  {
    name: 'decide_mission_change',
    behavior: Behavior.NON_BLOCKING,
    description:
      'Accept or reject the specific proposal put to the current speaker, only after their explicit answer to it. The application binds the answer to the speaker, the proposal and the turn.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        proposalId: UUID_SCHEMA,
        proposalRevision: { type: 'integer', minimum: 1 },
        decision: { type: 'string', enum: ['accept', 'reject'] },
      },
      required: ['proposalId', 'proposalRevision', 'decision'],
      additionalProperties: false,
    },
  },
  {
    name: 'control_work',
    behavior: Behavior.NON_BLOCKING,
    description:
      'Hold, resume or stop one piece of existing work (taskId from project_status). Only when the speaker explicitly asks. It does not stop speech, looking or the exchange, and it creates no work.',
    parametersJsonSchema: {
      type: 'object',
      properties: { taskId: UUID_SCHEMA, action: { type: 'string', enum: ['hold', 'resume', 'stop'] } },
      required: ['taskId', 'action'],
      additionalProperties: false,
    },
  },
]

/** The declared names, in declaration order. */
export const DECLARED_NAMES: readonly string[] = TOOL_DECLARATIONS.map((t) => t.name ?? '')

/** The operations that write to the mission ledger: an unconfirmed outcome is `unknown`, never "nothing changed". */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  'record_mission_note',
  'propose_mission_change',
  'decide_mission_change',
  'control_work',
])

const NAMES: ReadonlySet<string> = new Set(DECLARED_NAMES)

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
