// Research admission and the runtime research operations (SMC-M03 S4, db/migrations/0025, amendment A11).
// Admission runs inside withActor(..., 'write'); the runtime operations inside withService, with no member actor:
// the sophia.runtime_research_* functions authenticate the capability, the lease and the binding themselves, and
// every operation but settle is fenced by the goal's status and the session's current authority. A submitted result
// cites what its draft cites (CX-0019): see runtimeResearchSubmit.
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
  ResearchReserveRequest,
  ResearchResult,
  ResearchSettleRequest,
  ResearchSettlement,
  ResearchSourcePage,
  ResearchSubmission,
  ResearchSubmitRequest,
  ResearchTaskContext,
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

/** A report cites 1 to 200 sources (0027). */
const MAX_CITATIONS = 200
/** At most this many ids the draft cites and the model did not list are checked: each check holds the task's locks. */
const MAX_PROBES = 50
/** A draft is at most 256 KiB (0025), read 6,000 characters a page: never more pages than this. */
const MAX_DRAFT_PAGES = 64
/**
 * A JSON source is read whole to tell the task's manifest from a capture, at most this many pages after the first. In
 * jsonb's key order the manifest's schema comes after only its base, role, URLs (8 at most, 2,048 characters each),
 * route and inputs (8 at most), well inside the 30,000 characters these pages hold.
 */
const MAX_JSON_PAGES = 4
const MANIFEST_SCHEMA = 'sophia.research-manifest.v1'
/** The manifest's schema, as jsonb_pretty prints it: how a manifest too long to read whole is still known. */
const MANIFEST_MARK = /"schema"\s*:\s*"sophia\.research-manifest\.v1"/

/** The submit's own transaction, caller and task: what every check below reads through. */
interface Reader {
  readonly c: pg.PoolClient
  readonly who: RuntimeCaller
  readonly at: { readonly attemptId: string; readonly nativeSessionId: string }
}

/** The task (request, inputs, URLs, base, latest draft): runtime_research_context without a source. */
const overview = (r: Reader) => operation<ResearchTaskContext>(r.c, 'runtime_research_context', r.who, r.at)

/** A page of a stored source the task may read; refused (not found) when it may not. */
const pageOf = (r: Reader, page: { sourceId: string; offset: number; limit?: number }) =>
  operation<ResearchSourcePage>(r.c, 'runtime_research_context', r.who, { ...r.at, ...page })

/** The first page of a source the task may read; null when it may not (or it has no text), the transaction intact. */
async function readable(r: Reader, sourceId: string) {
  await r.c.query('SAVEPOINT cite_probe')
  try {
    const page = await pageOf(r, { sourceId, offset: 0 })
    await r.c.query('RELEASE SAVEPOINT cite_probe')
    return page
  } catch {
    await r.c.query('ROLLBACK TO SAVEPOINT cite_probe')
    return null
  }
}

/** A stored source's text from its first page, up to `pages` more pages; whole when nothing of it is left. */
async function textOf(r: Reader, first: ResearchSourcePage, pages: number) {
  let text = first.text
  let next = first.nextOffset
  for (let n = 1; next !== null && n <= pages; n += 1) {
    const more = await pageOf(r, { sourceId: first.sourceId, offset: next })
    text += more.text
    next = more.nextOffset
  }
  return { text, whole: next === null }
}

/** Whether a whole text is the manifest: JSON of its schema. Text that is not JSON never is. */
function isManifest(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && 'schema' in value && value.schema === MANIFEST_SCHEMA
  } catch {
    return false
  }
}

/**
 * Whether a source is the task's own request, which it reads but never cites: its question (the source's whole text)
 * or its manifest (JSON of that schema; past what is read whole, a text that names the schema).
 */
async function ownRequest(r: Reader, task: ResearchTaskContext, page: ResearchSourcePage) {
  if (page.nextOffset === null && page.text === task.question) return true
  if (!page.text.trimStart().startsWith('{')) return false
  const { text, whole } = await textOf(r, page, MAX_JSON_PAGES)
  return whole ? isManifest(text) : MANIFEST_MARK.test(text)
}

/** The sources the current draft cites, in any form (bare, bracketed, a link); none for a stale or absent draft. */
async function draftCites(r: Reader, task: ResearchTaskContext, sha256: string) {
  const draft = task.draft
  if (draft === null || draft.sha256 !== sha256) return []
  const { text } = await textOf(r, await pageOf(r, { sourceId: draft.sourceId, offset: 0 }), MAX_DRAFT_PAGES)
  return parseMarkdown(text).citations.filter((id) => id !== draft.sourceId)
}

/**
 * Whether a page reads as an earlier draft of this report, which the task may read but never cites: it cites a source
 * the current draft cites. No page from the web carries the project's source ids. A draft that cites nothing on its
 * first page is not known this way (the service, too, accepts a draft the model lists).
 */
const earlierDraft = (page: ResearchSourcePage, cites: ReadonlySet<string>) =>
  parseMarkdown(page.text).citations.some((id) => id !== page.sourceId && cites.has(id))

/**
 * Whether the task may cite a source its draft names: the service lets it read it, and it is an input or the base, or
 * neither an earlier draft nor its own request.
 */
async function mayCite(r: Reader, task: ResearchTaskContext, cites: ReadonlySet<string>, id: string) {
  const page = await readable(r, id)
  if (page === null) return false
  if (task.inputs.some((i) => i.sourceId === id) || task.base?.sourceId === id) return true
  return !earlierDraft(page, cites) && !(await ownRequest(r, task, page))
}

/** The model's citations, then every other source the draft cites that the task may cite, within the bounds. */
async function citationsOf(r: Reader, result: ResearchResult) {
  const task = await overview(r)
  const listed = new Set(result.citations.map((id) => id.toLowerCase()))
  const cites = new Set(await draftCites(r, task, result.draftSha256))
  const missing = [...cites].filter((id) => !listed.has(id))
  const out = [...result.citations]
  for (const id of missing.slice(0, MAX_PROBES)) {
    if (out.length >= MAX_CITATIONS) break
    if (await mayCite(r, task, cites, id)) out.push(id)
  }
  return out
}

/** citationsOf in its own savepoint: on any failure (a replay of an ended task, say), the model's list as it was. */
async function withDraftCitations(r: Reader, result: ResearchResult) {
  await r.c.query('SAVEPOINT draft_citations')
  try {
    const citations = await citationsOf(r, result)
    await r.c.query('RELEASE SAVEPOINT draft_citations')
    return citations
  } catch {
    await r.c.query('ROLLBACK TO SAVEPOINT draft_citations')
    return result.citations
  }
}

/**
 * End the task: publish its current draft as the report's next version, or record a blocker (0026). A result cites
 * what the model listed and every other source its draft cites that the task may cite (CX-0019), checked by the
 * service's own rule (a page read through runtime_research_context) and never the task's own question, manifest or an
 * earlier draft it can tell: the version's Sources, facts and lineage are what its text cites. The service still checks
 * every citation.
 */
export async function runtimeResearchSubmit(c: pg.PoolClient, who: RuntimeCaller, request: ResearchSubmitRequest) {
  const { result } = request
  if (!result) return operation<ResearchSubmission>(c, 'runtime_research_submit', who, request)
  const at = { attemptId: request.attemptId, nativeSessionId: request.nativeSessionId }
  const citations = await withDraftCitations({ c, who, at }, result)
  return operation<ResearchSubmission>(c, 'runtime_research_submit', who, {
    ...request,
    result: { ...result, citations },
  })
}
