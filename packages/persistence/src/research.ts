// Research admission and the runtime research operations (SMC-M03 S4, db/migrations/0025, amendment A11).
// Admission runs inside withActor(..., 'write'); the runtime operations inside withService, with no member actor:
// the sophia.runtime_research_* functions authenticate the capability, the lease and the binding themselves, and
// every operation but settle is fenced by the goal's status and the session's current authority.
import type pg from 'pg'
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

export const runtimeResearchCapture = (c: pg.PoolClient, who: RuntimeCaller, request: ResearchCaptureRequest) =>
  operation<ResearchCapture>(c, 'runtime_research_capture', who, request)

export const runtimeResearchDraft = (c: pg.PoolClient, who: RuntimeCaller, request: ResearchDraftRequest) =>
  operation<ResearchDraft>(c, 'runtime_research_draft', who, request)

/** End the task: publish its current draft as the report's next version, or record a blocker (0026). */
export const runtimeResearchSubmit = (c: pg.PoolClient, who: RuntimeCaller, request: ResearchSubmitRequest) =>
  operation<ResearchSubmission>(c, 'runtime_research_submit', who, request)
