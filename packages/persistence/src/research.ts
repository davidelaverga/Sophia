// Research admission and the runtime research operations (SMC-M03 S4, db/migrations/0025, amendment A11).
// Admission runs inside withActor(..., 'write'); the runtime operations inside withService, with no member actor:
// the sophia.runtime_research_* functions authenticate the capability, the lease and the binding themselves, and
// every operation but settle is fenced by the goal's status and the session's current authority. A submitted result
// cites what its draft cites (CX-0019): the report's parser reads them here, the service checks and adds them (0036).
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { parseMarkdown } from '@sophia/report/markdown'
import type {
  NativeTaskReceipt,
  ResearchCapture,
  ResearchCaptureRequest,
  ResearchContextReply,
  ResearchContextRequest,
  ResearchDraft,
  ResearchDraftRequest,
  ResearchReservation,
  ResearchResult,
  ResearchReserveRequest,
  ResearchSettleRequest,
  ResearchSettlement,
  ResearchSubmission,
  ResearchSubmitRequest,
} from '@sophia/contracts'
import { onlyRow } from './rows.ts'
import type { RuntimeCaller } from './runtime.ts'

/** What the model supplied to start_research; the API adds the specialist and route it resolved. */
export interface ResearchAdmissionRequest {
  readonly question: string
  readonly outputs: ReadonlyArray<'markdown' | 'pdf'>
  readonly inputSourceIds?: readonly string[]
  readonly urls?: readonly string[]
  readonly preferences?: { readonly depth?: 'brief' | 'standard' | 'deep'; readonly sourceConstraints?: string }
  readonly assumptions?: readonly string[]
  readonly amendsTaskId?: string
  readonly newRequest?: boolean
}

/** A new task's receipt, or the person's task already under way in this exchange. */
export type ResearchAdmission =
  { readonly admitted: NativeTaskReceipt } | { readonly existingTaskId: string; readonly receipt: NativeTaskReceipt }

export interface ResearchSpecialist {
  readonly role: string
  readonly route: string
}

export interface ResearchAdmissionCall {
  /** The command's idempotency key (a tool call's: exchange, connection generation and call id). */
  readonly key: string
  /** The exchange the person asked in: a second call there returns their task already under way. */
  readonly exchangeId: string | null
  readonly request: ResearchAdmissionRequest
  readonly specialist: ResearchSpecialist
}

export async function admitResearchTask(
  c: pg.PoolClient,
  projectId: string,
  { key, exchangeId, request, specialist }: ResearchAdmissionCall,
): Promise<ResearchAdmission> {
  const { rows } = await c.query<{
    result: NativeTaskReceipt | { existingTaskId: string; receipt: NativeTaskReceipt }
  }>(`SELECT sophia.admit_research_task($1, $2, $3, $4, $5, $6) AS result`, [
    projectId,
    key,
    exchangeId,
    JSON.stringify(request),
    specialist.role,
    specialist.route,
  ])
  const result = onlyRow(rows, 'admit_research_task').result
  return 'existingTaskId' in result ? result : { admitted: result }
}

/**
 * Whether the project's research gate is open, as admission reads it (0025): an enabled grant. No grant is a closed
 * gate, never an open one. Read under the member's own policy (0024 members_read), in withActor(..., 'read'): an
 * outsider reads it closed.
 */
export async function researchGateOpen(c: pg.PoolClient, projectId: string): Promise<boolean> {
  const { rows } = await c.query<{ open: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM sophia.research_grants WHERE project_id = $1 AND state = 'enabled') AS open`,
    [projectId],
  )
  return onlyRow(rows, 'research_grants').open
}

const args = (who: RuntimeCaller) => [who.tokenSha256, who.runtimeUnitId, who.bridgeInstanceId]

async function operation<T>(c: pg.PoolClient, fn: string, who: RuntimeCaller, request: unknown): Promise<T> {
  const { rows } = await c.query<{ reply: T }>(`SELECT sophia.${fn}($1, $2, $3, $4) AS reply`, [
    ...args(who),
    JSON.stringify(request),
  ])
  return onlyRow(rows, fn).reply
}

export const runtimeResearchContext = (c: pg.PoolClient, who: RuntimeCaller, request: ResearchContextRequest) =>
  operation<ResearchContextReply>(c, 'runtime_research_context', who, request)

export const runtimeResearchReserve = (c: pg.PoolClient, who: RuntimeCaller, request: ResearchReserveRequest) =>
  operation<ResearchReservation>(c, 'runtime_research_reserve', who, request)

export const runtimeResearchSettle = (c: pg.PoolClient, who: RuntimeCaller, request: ResearchSettleRequest) =>
  operation<ResearchSettlement>(c, 'runtime_research_settle', who, request)

/**
 * Keep what a search or a read returned. A page read with no text at all (one that renders only with JavaScript) is
 * refused as a request, never as a service fault: there is nothing to keep or cite, and asking again changes nothing.
 */
export async function runtimeResearchCapture(c: pg.PoolClient, who: RuntimeCaller, request: ResearchCaptureRequest) {
  if (request.kind === 'web_read' && request.text === '') {
    throw new DomainError('invalid_request', 'The page had no text, so nothing was kept: cite it only as unread')
  }
  return operation<ResearchCapture>(c, 'runtime_research_capture', who, request)
}

export const runtimeResearchDraft = (c: pg.PoolClient, who: RuntimeCaller, request: ResearchDraftRequest) =>
  operation<ResearchDraft>(c, 'runtime_research_draft', who, request)

/** A draft is at most 262144 bytes (0025), so as many characters at most; a page of a source is 6000 of them. */
const DRAFT_PAGES = Math.ceil(262_144 / 6000)
/**
 * As many ids as a draft can name: each takes 36 of its 262144 bytes. The service keeps the first that the task may
 * cite, up to a result's 200 (0036), so ids it refuses never take the place of ones it keeps.
 */
const MOST_DRAFT_IDS = Math.ceil(262_144 / 36)

/** The current draft's text, read as the model reads it (research_read_context): null unless it is the one submitted. */
async function draftText(c: pg.PoolClient, who: RuntimeCaller, at: ResearchContextRequest, result: ResearchResult) {
  const task = await runtimeResearchContext(c, who, at)
  const draft = 'draft' in task ? task.draft : null
  if (draft?.sha256 !== result.draftSha256) return null
  let text = ''
  let offset: number | null = 0
  for (let page = 0; page < DRAFT_PAGES && offset !== null; page += 1) {
    const read = await runtimeResearchContext(c, who, { ...at, sourceId: draft.sourceId, offset })
    if (!('text' in read)) return null
    text += read.text
    offset = read.nextOffset
  }
  return offset === null ? text : null
}

/**
 * The submitted draft's text, or null when it cannot be read (stale, the task ended, any failure). The reads run in a
 * savepoint: a refused one leaves the submit's transaction as it was.
 */
async function submittedDraft(
  c: pg.PoolClient,
  who: RuntimeCaller,
  at: ResearchContextRequest,
  result: ResearchResult,
) {
  await c.query('SAVEPOINT draft_citations')
  let text: string | null
  try {
    text = await draftText(c, who, at, result)
  } catch {
    await c.query('ROLLBACK TO SAVEPOINT draft_citations')
    text = null
  }
  await c.query('RELEASE SAVEPOINT draft_citations')
  return text
}

/**
 * The ids a draft's text cites as the report's parser numbers them (the code Studio and the page read it with), for
 * any set of sources a link may cite: with none, a link reads as its label, which may cite another source than the
 * link's target (Studio numbers that label when the target is not among the version's sources). Null if the parse
 * fails.
 */
function citedIn(text: string): string[] | null {
  try {
    return [...new Set([...parseMarkdown(text).citations, ...parseMarkdown(text, { citable: [] }).citations])]
  } catch {
    return null
  }
}

/**
 * The ids the submitted draft cites but those the model listed; undefined when the draft cannot be read or parsed, so
 * the model's list stands alone.
 */
async function citedByDraft(
  c: pg.PoolClient,
  who: RuntimeCaller,
  request: ResearchSubmitRequest,
  result: ResearchResult,
) {
  const text = await submittedDraft(
    c,
    who,
    { attemptId: request.attemptId, nativeSessionId: request.nativeSessionId },
    result,
  )
  const cited = text === null ? null : citedIn(text)
  if (cited === null) return undefined
  const listed = new Set(result.citations)
  return cited.filter((id) => !listed.has(id)).slice(0, MOST_DRAFT_IDS)
}

/**
 * End the task: publish its current draft as the report's next version, or record a blocker (0026). A result cites
 * what the model listed and every other source its draft cites that the task may cite (CX-0019, 0036): the parser
 * reads the draft here and the service checks each id in the submit's own transaction, so the version's Sources,
 * facts and lineage are what its text cites. The ids go beside the result (draftCitations), never inside it, and
 * only from here: one the request carried is dropped (the API's schema refuses it before this).
 */
export async function runtimeResearchSubmit(c: pg.PoolClient, who: RuntimeCaller, request: ResearchSubmitRequest) {
  const { draftCitations: _carried, ...asked } = request as ResearchSubmitRequest & { draftCitations?: unknown }
  const cited = asked.result ? await citedByDraft(c, who, asked, asked.result) : undefined
  return operation<ResearchSubmission>(
    c,
    'runtime_research_submit',
    who,
    cited ? { ...asked, draftCitations: cited } : asked,
  )
}
