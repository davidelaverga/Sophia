// The Gemini Live tool surface (architecture 06 §6–§7, SMC-M01 binding §2), per guide version: v1.1 is the six
// operations the M01 guide names; v1.2 (SMC-M03 S6) adds start_research and render_research, and steer on
// control_work; v1.3 (SDD-01) says what HTML now is (a designed page, asked for with start_research's html output)
// and adds revise_html_page. Each is implemented end to end by the API, and nothing else is declared: no brief, lead, builder,
// scheduler or monitor tool, because a tool that could only answer with a placeholder would teach the model to promise
// work nobody does. A version's declarations are static: the research tools are declared whether or not research is
// switched on, and the call answers with a typed refusal when it is not. The declared names must equal the guide
// manifest's (guide.ts checks it at start) and the API's surface for that version (the session checks
// /v1/media/tool-surface?guide= before it connects). Every tool is NON_BLOCKING, stated explicitly, and every response
// finishes its call at once with top-level `scheduling` and `willContinue: false`.
import { Behavior, FunctionResponseScheduling, type FunctionDeclaration, type FunctionResponse } from '@google/genai'
import type { MediaToolCall, MediaToolResult } from '@sophia/contracts'
import { sha256, type GuideVersion } from './guide.ts'

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

const M01_SHARED: FunctionDeclaration[] = [
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
]

const CONTROL_V11: FunctionDeclaration = {
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
}

const CONTROL_V12: FunctionDeclaration = {
  name: 'control_work',
  behavior: Behavior.NON_BLOCKING,
  description:
    'Hold, resume, stop or steer one piece of existing work (taskId from project_status). Only when the speaker explicitly asks. Steer passes a short brief of what they want the running work to change. It does not stop speech, looking or the exchange, and it creates no work. Steer reaches only research that project_status shows waiting or running; a finished report is changed with start_research and amendsTaskId. Do not say a control took effect before its result arrives; a refused control changed nothing.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      taskId: UUID_SCHEMA,
      action: { type: 'string', enum: ['hold', 'resume', 'stop', 'steer'] },
      brief: {
        type: 'string',
        maxLength: 2000,
        description: 'For steer only: what the speaker wants changed, in their words.',
      },
    },
    required: ['taskId', 'action'],
    additionalProperties: false,
  },
}

/** What start_research's outputs say; v1.2's predates the designed page (SDD-01) and is kept as it was qualified. */
const OUTPUTS_V12 =
  'Markdown is always written, and every report also downloads as an HTML page from its card; add html when the speaker asks for HTML or a web page, pdf when they ask for a PDF.'
const OUTPUTS_V13 =
  'Markdown is always written. Add html when the speaker asks for HTML or a web page: once the report is published, Sophia’s designer lays out a page from its exact content and it arrives as the report’s next version; a report without html has no web page. Add pdf when they ask for a PDF.'

/** start_research's parameters before and after its outputs, the same in every version that declares it. */
const RESEARCH_REQUEST = {
  question: {
    type: 'string',
    maxLength: 2000,
    description:
      'The whole request in the speaker’s own words and language: the topic and every instruction they gave about it (what to change and what to keep as it is, a length, the sections they want, limits on web searches or page reads). Never shortened to a topic.',
  },
  scope: {
    type: 'object',
    description:
      'Fill only the parts the speaker stated; leave out the others and do not ask for them. The research worker reads it with the question.',
    properties: {
      change: {
        type: 'string',
        maxLength: 500,
        description: 'What the speaker wants changed, mostly for a revision.',
      },
      keep: { type: 'string', maxLength: 500, description: 'What they want kept as it is.' },
      length: { type: 'string', maxLength: 100, description: 'The length they asked for, e.g. "about 500 words".' },
      sections: {
        type: 'array',
        items: { type: 'string', maxLength: 100 },
        maxItems: 12,
        description: 'The sections they want, in their order.',
      },
      maxSearches: { type: 'integer', minimum: 0, maximum: 5, description: 'The most web searches they allow.' },
      maxReads: { type: 'integer', minimum: 0, maximum: 8, description: 'The most page reads they allow.' },
    },
    additionalProperties: false,
  },
}
const RESEARCH_INPUTS = {
  inputSourceIds: {
    type: 'array',
    items: UUID_SCHEMA,
    maxItems: 8,
    description: 'Project sources the speaker named.',
  },
  urls: {
    type: 'array',
    items: { type: 'string', maxLength: 2048 },
    maxItems: 8,
    description: 'Web pages the speaker named, as full http or https addresses.',
  },
  assumptions: {
    type: 'array',
    items: { type: 'string', maxLength: 200 },
    maxItems: 8,
    description: 'What you assumed where the request was open.',
  },
  preferences: {
    type: 'object',
    properties: {
      depth: { type: 'string', enum: ['brief', 'standard', 'deep'] },
      sourceConstraints: { type: 'string', maxLength: 500 },
    },
    additionalProperties: false,
  },
  amendsTaskId: {
    ...UUID_SCHEMA,
    description:
      'A finished research task this request revises. The report is edited in place: say in question exactly what to change and anything the speaker wants kept as it is, and fill scope’s change and keep.',
  },
  newRequest: { type: 'boolean', description: 'Only after the speaker confirms a separate report.' },
}

const startResearch = (outputs: string): FunctionDeclaration => ({
  name: 'start_research',
  behavior: Behavior.NON_BLOCKING,
  description:
    'Commission one research report the speaker explicitly asked for. Admitted means accepted, not started: the report arrives later on its work card. not_started means nothing started; unconfirmed means read project_status before saying anything. existingTaskId means their research is already under way.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      ...RESEARCH_REQUEST,
      outputs: {
        type: 'array',
        items: { type: 'string', enum: ['markdown', 'html', 'pdf'] },
        minItems: 1,
        maxItems: 3,
        description: outputs,
      },
      ...RESEARCH_INPUTS,
    },
    required: ['question'],
    additionalProperties: false,
  },
})

const START_RESEARCH = startResearch(OUTPUTS_V12)
const START_RESEARCH_V13 = startResearch(OUTPUTS_V13)

const RENDER_RESEARCH: FunctionDeclaration = {
  name: 'render_research',
  behavior: Behavior.NON_BLOCKING,
  description:
    'Ask for a PDF of a published research report that has none (taskId from project_status). Queued means not printed yet: the PDF arrives as the report’s next version. It starts no research. HTML needs no call: every published report already downloads as an HTML page from its card.',
  parametersJsonSchema: {
    type: 'object',
    properties: { taskId: UUID_SCHEMA },
    required: ['taskId'],
    additionalProperties: false,
  },
}

/** v1.3's render_research: the same, without v1.2's promise that every report downloads as an HTML page. */
const RENDER_RESEARCH_V13: FunctionDeclaration = {
  ...RENDER_RESEARCH,
  description:
    'Ask for a PDF of a published research report that has none (taskId from project_status). Queued means not printed yet: the PDF arrives as the report’s next version. It starts no research and makes no HTML: a designed page is asked for with start_research’s html output and revised with revise_html_page.',
}

const REVISE_HTML_PAGE: FunctionDeclaration = {
  name: 'revise_html_page',
  behavior: Behavior.NON_BLOCKING,
  description:
    'Ask for a change to named sections of a report’s current designed HTML page (taskId and section ids from that task’s htmlPage in project_status). Only those sections change; the page around them and the shared styles stay as they are unless the speaker asks for them. It changes how the page presents the report, never what the report says. Admitted means accepted, not revised: the page arrives as the report’s next version. not_started means nothing started; unconfirmed means read project_status before saying anything.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      taskId: UUID_SCHEMA,
      sections: {
        type: 'array',
        items: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
        minItems: 1,
        maxItems: 16,
        description: 'The section ids of the page to change, as htmlPage lists them.',
      },
      instruction: {
        type: 'string',
        maxLength: 2000,
        description: 'What should change in those sections, in the speaker’s own words and language.',
      },
      shell: {
        type: 'boolean',
        description:
          'Only when the speaker asked to change the page around the sections (its header, footer or section list).',
      },
      styles: {
        type: 'boolean',
        description: 'Only when the speaker asked to change the whole page’s styles, not just these sections.',
      },
    },
    required: ['taskId', 'sections', 'instruction'],
    additionalProperties: false,
  },
}

/** One guide version's declarations and their names, in declaration order. */
export interface ToolSet {
  declarations: readonly FunctionDeclaration[]
  names: readonly string[]
  /** The SHA-256 of the declarations as JSON, the bytes Google receives: what a setup log names, never their text. */
  sha256: string
}

const toolSet = (declarations: FunctionDeclaration[]): ToolSet => ({
  declarations,
  names: declarations.map((t) => t.name ?? ''),
  sha256: sha256(Buffer.from(JSON.stringify(declarations), 'utf8')),
})

export const TOOL_SETS: Readonly<Record<GuideVersion, ToolSet>> = {
  'v1.1': toolSet([...M01_SHARED, CONTROL_V11]),
  'v1.2': toolSet([...M01_SHARED, CONTROL_V12, START_RESEARCH, RENDER_RESEARCH]),
  'v1.3': toolSet([...M01_SHARED, CONTROL_V12, START_RESEARCH_V13, RENDER_RESEARCH_V13, REVISE_HTML_PAGE]),
}

/** M01's v1.1 declarations and names. */
export const TOOL_DECLARATIONS: readonly FunctionDeclaration[] = TOOL_SETS['v1.1'].declarations
export const DECLARED_NAMES: readonly string[] = TOOL_SETS['v1.1'].names

/**
 * The operations that write: an unconfirmed outcome is `unknown`, never "nothing changed". Starting research, asking
 * for a PDF and asking for a page's revision write too: a lost receipt may have admitted the work.
 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  'record_mission_note',
  'propose_mission_change',
  'decide_mission_change',
  'control_work',
  'start_research',
  'render_research',
  'revise_html_page',
])

/** Whether a version declares this name (M01's v1.1 unless one is given). */
export const isToolName = (name: string | undefined, names: readonly string[] = DECLARED_NAMES): name is ToolName =>
  name !== undefined && names.includes(name)

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
