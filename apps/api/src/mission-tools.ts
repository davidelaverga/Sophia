// The voice guide's mission operations (M01 §7, SMC-M01 binding §2): project_status, read_selected_source,
// record_mission_note, propose_mission_change and decide_mission_change. Each runs for the speaker the input epoch
// binds, under that speaker's own role, through the same use cases as the member routes. Arguments come from the
// model and are data: an id it names must exist in this project, and nothing it says grants authority or confirms a
// decision. A write's outcome is reported as it is: committed, proposed, conflict, denied or unknown.
import type pg from 'pg'
import type { MediaToolCall, MediaToolResult } from '@sophia/contracts'
import { DomainError, type ErrorCode } from '@sophia/domain'
import {
  decideMissionChange,
  pdfRendererReady,
  presentMissionProposal,
  proposeMissionChange,
  readConfirmationTarget,
  readDiscussion,
  readMissionContext,
  readMissionSource,
  readNativeTask,
  recordMissionEntry,
  researchGateOpen,
  withActor,
  type MissionTurn,
  type NoteWrite,
  type ProposalWrite,
} from '@sophia/persistence'
import { cursorOffset, pageOf } from './source-page.ts'
import { voiceStatus } from './voice-status.ts'

export interface ToolContext {
  pool: pg.Pool
  projectId: string
  actorId: string
  /** The call's idempotency key: the same across a provider retry or a resumed connection. */
  key: string
  call: MediaToolCall
  /** The call's arguments, as the model sent them: data to check, never trusted. */
  args: Record<string, unknown>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const optionalUuid = (v: unknown): string | null | undefined =>
  v === undefined || v === null ? null : isUuid(v) ? v : undefined
const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim().length > 0 && Array.from(v).length <= max ? v.trim() : null
const optionalText = (v: unknown, max: number): string | null | undefined =>
  v === undefined || v === null ? null : (text(v, max) ?? undefined)
function oneOf<T extends string>(v: unknown, values: readonly T[]): T | null {
  return values.find((value) => value === v) ?? null
}

const clarify = (ask: string): MediaToolResult => ({ status: 'clarify', output: { ask } })

/** The speaker's turn, as the database re-checks it; a decision also names where it was answered. */
function turnOf(call: MediaToolCall, answered: boolean): MissionTurn {
  const turn: MissionTurn = {
    exchangeId: call.exchangeId,
    inputEpoch: call.inputEpoch,
    inputMode: call.inputMode ?? 'voice',
  }
  if (!answered) return turn
  return {
    ...turn,
    connectionGeneration: call.connectionGeneration,
    ...(call.utterance === undefined ? {} : { utterance: call.utterance }),
  }
}

const DENIED_BY_ROLE = 'Only editors and admins can record notes, propose or decide; viewers can talk with Sophia.'
const RECORDS_UNAVAILABLE: MediaToolResult = {
  status: 'error',
  output: { reason: 'The project records are unavailable right now; nothing was saved.' },
}

/** A write's domain failure, in the outcome words the guide reports; anything not listed is an error. */
const OUTCOMES: Partial<Record<ErrorCode, (err: DomainError) => MediaToolResult>> = {
  note_policy_denied: (err) => ({ status: 'denied', output: { reason: err.message } }),
  forbidden: () => ({ status: 'denied', output: { reason: DENIED_BY_ROLE } }),
  stale_revision: (err) => ({
    status: 'conflict',
    output: { reason: err.message, next: 'Read project_status for the current state.' },
  }),
  idempotency_conflict: (err) => ({
    status: 'conflict',
    output: { reason: err.message, next: 'Read project_status for the current state.' },
  }),
  confirmation_required: (err) => ({
    status: 'clarify',
    output: { reason: err.message, ask: 'Put the proposal to the speaker and wait for their explicit answer.' },
  }),
  invalid_state: () => ({
    status: 'denied',
    output: { reason: 'The conversation is paused or has ended; nothing was saved.' },
  }),
  outcome_unknown: () => ({
    status: 'unknown',
    output: {
      reason: 'The save may or may not have happened.',
      next: 'Read project_status to see whether it was saved before saving it again.',
    },
  }),
  not_found: () => clarify('Which note, goal or proposal do you mean? Use the ids that project_status returned.'),
  invalid_request: () => clarify('Which note, goal or proposal do you mean? Use the ids that project_status returned.'),
}

/** A mission write's failure. Nothing here claims a save that did not happen. */
export function writeFailure(err: unknown): MediaToolResult {
  if (!(err instanceof DomainError))
    return { status: 'error', output: { reason: 'The tool failed; nothing was saved.' } }
  return OUTCOMES[err.code]?.(err) ?? RECORDS_UNAVAILABLE
}

/** project_status: the mission context for this speaker; `unavailable` is never reported as an empty project. */
export async function projectStatus(ctx: ToolContext): Promise<MediaToolResult> {
  try {
    const read = await withActor(ctx.pool, ctx.actorId, 'read', async (c) => ({
      context: await readMissionContext(c, ctx.projectId, { actorId: ctx.actorId, channel: 'voice' }),
      discussion: await readDiscussion(c, ctx.projectId),
      target: await readConfirmationTarget(c, ctx.call.exchangeId),
      // Only a v1.2 guide hears of render_research, so only it needs to know whether a PDF renderer runs.
      pdf: ctx.call.guide === 'v1.2' ? await pdfRendererReady(c) : undefined,
      // Likewise start_research, which admission refuses while the project's research gate is closed (0025).
      researchGate: ctx.call.guide === 'v1.2' ? await researchGateOpen(c, ctx.projectId) : undefined,
    }))
    if (!read.context) return { status: 'refused', output: { readState: 'unavailable', reason: 'Not permitted' } }
    const output = voiceStatus({
      ...read,
      context: read.context,
      speakerId: ctx.actorId,
      now: Date.now(),
      guide: ctx.call.guide,
    })
    return { status: 'ok', output }
  } catch {
    return {
      status: 'error',
      output: { readState: 'unavailable', reason: 'The project records could not be read just now.' },
    }
  }
}

type SourceRef = { kind: 'taskId' | 'contributionId' | 'entryId' | 'decisionId'; id: string }

function sourceRef(args: Record<string, unknown>): SourceRef | null {
  const refs = (['taskId', 'contributionId', 'entryId', 'decisionId'] as const)
    .filter((kind) => args[kind] !== undefined)
    .map((kind) => ({ kind, id: args[kind] }))
  const only = refs.length === 1 ? refs[0] : undefined
  return only && isUuid(only.id) ? { kind: only.kind, id: only.id } : null
}

interface Readable {
  sourceId: string
  sha256: string | null
  text: string | null
  textKind: 'sophia_paraphrase' | 'member_text' | 'runtime_result'
  state: string
  pending?: { revision: number }
}

async function readable(ctx: ToolContext, ref: SourceRef): Promise<Readable | null> {
  return withActor(ctx.pool, ctx.actorId, 'read', async (c) => {
    if (ref.kind === 'taskId') {
      const detail = await readNativeTask(c, ctx.projectId, ref.id)
      const r = detail.result
      return r
        ? {
            sourceId: r.sourceId,
            sha256: r.sha256,
            text: r.markdown,
            textKind: 'runtime_result',
            state: detail.task.phase,
          }
        : {
            sourceId: detail.task.contextSourceId,
            sha256: null,
            text: null,
            textKind: 'runtime_result',
            state: detail.task.phase,
          }
    }
    if (ref.kind === 'contributionId') {
      const entry = (await readDiscussion(c, ctx.projectId)).find((d) => d.id === ref.id)
      return entry
        ? { sourceId: entry.sourceId, sha256: entry.sha256, text: entry.text, textKind: 'member_text', state: 'shared' }
        : null
    }
    const source = await readMissionSource(c, ctx.projectId, ref.kind === 'entryId' ? 'entry' : 'decision', ref.id)
    if (!source) return null
    const pending = source.kind === 'decision' && source.state === 'proposed' && source.revision !== null
    return { ...source, ...(pending && source.revision !== null ? { pending: { revision: source.revision } } : {}) }
  })
}

/** Reading a pending proposal back to the speaker puts it to them: it becomes the exchange's confirmation target. */
async function putToSpeaker(ctx: ToolContext, decisionId: string): Promise<boolean> {
  try {
    await withActor(ctx.pool, ctx.actorId, 'write', (c) =>
      presentMissionProposal(c, ctx.projectId, decisionId, turnOf(ctx.call, true)),
    )
    return true
  } catch {
    // A viewer, a paused exchange or a call without its utterance: the text is still read, nothing is put.
    return false
  }
}

/** read_selected_source: exact eligible text, one page at a time, with its coverage and continuation. */
export async function readSelectedSource(ctx: ToolContext): Promise<MediaToolResult> {
  const ref = sourceRef(ctx.args)
  const start = cursorOffset(ctx.args.cursor)
  if (!ref || start === null)
    return clarify('Which one source should I read: a taskId, contributionId, entryId or decisionId?')
  let source: Readable | null
  try {
    source = await readable(ctx, ref)
  } catch (err: unknown) {
    if (err instanceof DomainError && err.code === 'not_found') source = null
    else return { status: 'error', output: { reason: 'The source could not be read just now.' } }
  }
  if (!source) return clarify('I can only read notes, proposals, points and briefs of this project.')
  const base = {
    [ref.kind]: ref.id,
    sourceId: source.sourceId,
    sha256: source.sha256,
    textKind: source.textKind,
    state: source.state,
  }
  if (source.text === null) return { status: 'ok', output: { ...base, text: null, coverage: 'none' } }
  const put = source.pending ? await putToSpeaker(ctx, ref.id) : false
  return {
    status: 'ok',
    output: {
      ...base,
      ...pageOf(source.text, start),
      exact: true,
      ...(source.pending ? { proposalRevision: source.pending.revision, putToSpeaker: put } : {}),
    },
  }
}

const ENTRY_KINDS = [
  'observation',
  'expectation',
  'outcome',
  'blocker',
  'explanation',
  'lesson_candidate',
  'continuity',
] as const
const EPISTEMIC = ['reported', 'observed', 'inferred'] as const

/** The note's optional links, each a uuid or null; undefined when any of them is malformed. */
function noteLinks(args: Record<string, unknown>) {
  const relatedEntryId = optionalUuid(args.relatedEntryId)
  const goalId = optionalUuid(args.goalId)
  const decisionId = optionalUuid(args.decisionId)
  const correctsEntryId = optionalUuid(args.correctsEntryId)
  if (relatedEntryId === undefined || goalId === undefined || decisionId === undefined || correctsEntryId === undefined)
    return undefined
  return { relatedEntryId, goalId, decisionId, correctsEntryId }
}

function noteWrite(args: Record<string, unknown>): NoteWrite | null {
  const kind = oneOf(args.kind, ENTRY_KINDS)
  const epistemic = oneOf(args.epistemic, EPISTEMIC)
  const body = text(args.text, 2000)
  const links = noteLinks(args)
  if (!kind || !epistemic || !body || !links) return null
  return { kind, epistemic, text: body, ...links }
}

/** record_mission_note: a paraphrased note bound to the speaker's turn, kept only under the note policy. */
export async function recordMissionNote(ctx: ToolContext): Promise<MediaToolResult> {
  const write = noteWrite(ctx.args)
  if (!write)
    return clarify(
      'What kind of note is it (observation, expectation, outcome, blocker, explanation, lesson candidate or continuity), and what should it say?',
    )
  try {
    const r = await withActor(ctx.pool, ctx.actorId, 'write', (c) =>
      recordMissionEntry(c, ctx.projectId, ctx.key, { ...write, turn: turnOf(ctx.call, false) }),
    )
    return {
      status: 'committed',
      output: {
        entryId: r.entryId,
        operation: r.operation,
        ledgerRevision: r.ledgerRevision,
        saved: 'A paraphrase attributed to the speaker’s turn, not their exact words.',
      },
    }
  } catch (err: unknown) {
    return writeFailure(err)
  }
}

/** A proposal's optional fields, each text or null; undefined when any of them is malformed. */
function proposalFields(args: Record<string, unknown>) {
  const purpose = optionalText(args.purpose, 1000)
  const destination = optionalText(args.destination, 1000)
  const origin = optionalText(args.origin, 1000)
  const supersedesDecisionId = optionalUuid(args.supersedesDecisionId)
  const supporting: unknown = args.supportingEntryIds ?? []
  const supportingEntryIds =
    Array.isArray(supporting) && supporting.length <= 8 && supporting.every(isUuid) ? supporting : null
  if (purpose === undefined || destination === undefined || origin === undefined || supersedesDecisionId === undefined)
    return undefined
  return supportingEntryIds ? { purpose, destination, origin, supersedesDecisionId, supportingEntryIds } : undefined
}

function proposalWrite(args: Record<string, unknown>): ProposalWrite | null {
  const kind = oneOf(args.kind, ['mission', 'constraint', 'lesson'] as const)
  const statement = text(args.statement, 2000)
  const fields = proposalFields(args)
  if (!kind || !statement || !fields) return null
  return { kind, statement, ...fields }
}

/** propose_mission_change: a proposal put to the speaker; creating it accepts nothing. */
export async function proposeChange(ctx: ToolContext): Promise<MediaToolResult> {
  const write = proposalWrite(ctx.args)
  if (!write) return clarify('What exactly is proposed (a mission, constraint or lesson), in one clear statement?')
  try {
    const r = await withActor(ctx.pool, ctx.actorId, 'write', (c) =>
      proposeMissionChange(c, ctx.projectId, ctx.key, { ...write, turn: turnOf(ctx.call, true) }),
    )
    return {
      status: 'proposed',
      output: {
        proposalId: r.decisionId,
        proposalRevision: r.decisionRevision,
        ledgerRevision: r.ledgerRevision,
        next: 'Not accepted. Make its meaning clear to the speaker and wait for their explicit answer.',
      },
    }
  } catch (err: unknown) {
    return writeFailure(err)
  }
}

/** decide_mission_change: the speaker's answer to the proposal put to them, bound by the database (binding §4.3). */
export async function decideChange(ctx: ToolContext): Promise<MediaToolResult> {
  const args = ctx.args
  const decision = oneOf(args.decision, ['accept', 'reject'] as const)
  const revision =
    typeof args.proposalRevision === 'number' && Number.isSafeInteger(args.proposalRevision)
      ? args.proposalRevision
      : null
  if (!isUuid(args.proposalId) || !decision || revision === null || revision < 1)
    return clarify('Which proposal, at which revision, and is the answer to accept or reject it?')
  const proposalId = args.proposalId
  try {
    const r = await withActor(ctx.pool, ctx.actorId, 'write', (c) =>
      decideMissionChange(c, ctx.projectId, proposalId, ctx.key, {
        decision,
        expectedRevision: revision,
        turn: turnOf(ctx.call, true),
      }),
    )
    return {
      status: 'committed',
      output: {
        proposalId,
        decision: r.decision,
        missionRevision: r.missionRevision,
        ledgerRevision: r.ledgerRevision,
      },
    }
  } catch (err: unknown) {
    return writeFailure(err)
  }
}
