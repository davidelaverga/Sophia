/** A60 / 0116: private result retention and metadata. No raw response is passed back into SQL for consumption. */
import type pg from 'pg'
import type {
  OwnerRunnerCollection,
  OwnerRunnerResultDescriptor,
  OwnerRunnerResultRequest,
  OwnerRunnerRetainedResult,
  OwnerRunnerWorkAvailability,
  OwnerRunnerWorkLookup,
  OwnerRunnerWorkPage,
} from '@sophia/contracts'
import type { EnqueueResult, ExchangeStore, ExchangeView, SettleResult } from '@sophia/coordination/owner-host-channel'
import { digestOf, type RunnerEnvelope } from '@sophia/coordination/runner-port'
import { DomainError } from '@sophia/domain'

export type { OwnerRunnerCollection, OwnerRunnerResultDescriptor }
type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>

/** This boundary never propagates driver text, DETAIL, parameters, or a raw error cause. */
export function runnerResultFailure(err: unknown): DomainError {
  const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined
  if (code === '42501') return new DomainError('forbidden', 'Result access refused')
  if (code === 'P0002') return new DomainError('not_found', 'Result not found')
  if (code === '23505') return new DomainError('idempotency_conflict', 'Result request conflict')
  if (typeof code === 'string' && code.startsWith('22'))
    return new DomainError('invalid_request', 'Result request unavailable')
  return new DomainError('unavailable', 'Result service unavailable')
}

async function call<T>(db: Queryable, sql: string, params: unknown[] = []): Promise<T> {
  try {
    const { rows } = await db.query<{ r: T }>(sql, params)
    const row = rows[0]
    if (!row) throw new Error('missing result')
    return row.r
  } catch (err) {
    throw runnerResultFailure(err)
  }
}

/** Exact installation predicate shared by stock readiness and every A60 route. */
export const OWNER_RUNNER_RESULTS_SCHEMA = `SELECT
 to_regprocedure('sophia.request_runner_result(uuid,uuid,text,bigint,integer,integer)') IS NOT NULL
 AND to_regprocedure('sophia.runner_result_capture_fence(uuid,uuid)') IS NOT NULL
 AND to_regprocedure('sophia.runner_result_relevant(uuid)') IS NOT NULL
 AND to_regprocedure('sophia.read_runner_result(uuid,uuid)') IS NOT NULL
 AND to_regprocedure('sophia.runner_work_page(uuid,uuid,uuid)') IS NOT NULL
 AND to_regprocedure('sophia.runner_work_lookup(uuid,uuid,text,text)') IS NOT NULL
 AND to_regprocedure('sophia.runner_work_availability(uuid,uuid,uuid)') IS NOT NULL
 AND to_regprocedure('sophia.resume_runner_result()') IS NOT NULL
 AND to_regprocedure('sophia.claim_runner_result()') IS NOT NULL
 AND to_regprocedure('sophia.enqueue_runner_result(uuid,uuid,uuid,jsonb,text,text)') IS NOT NULL
 AND to_regprocedure('sophia.read_runner_result_exchange(uuid,uuid,uuid,uuid)') IS NOT NULL
 AND to_regprocedure('sophia.consume_runner_result(uuid,uuid,uuid,uuid,text,text)') IS NOT NULL
 AND to_regprocedure('sophia.finish_runner_result(uuid,uuid,uuid)') IS NOT NULL
 AND to_regprocedure('sophia.maintain_runner_results()') IS NOT NULL
 AND (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE NOT a.attisdropped AND a.attnum>0 AND
 ((a.attrelid=to_regclass('sophia.owner_runner_collections') AND a.attname IN ('permit','exchange_id','reserved_pages','deadline_at','claimed','max_pages','max_bytes','consume_lease_until'))
 OR (a.attrelid=to_regclass('sophia.owner_runner_results') AND a.attname IN ('version_key','source_id','operation_id','goal_id','binding_id','attempt_id','run_id','audience_revision'))
 OR (a.attrelid=to_regclass('sophia.owner_runner_result_dependencies') AND a.attname IN ('source_id','sha256','eligibility_revision','scope','owner_id'))
 OR (a.attrelid=to_regclass('sophia.owner_runner_result_contexts') AND a.attname IN ('manifest_id','qualification_id','profile_id'))))=24 AS ok`

export async function requireRunnerResults(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ ok: boolean }>(OWNER_RUNNER_RESULTS_SCHEMA).catch(() => {
    throw new DomainError('unavailable', 'Result service unavailable')
  })
  if (rows[0]?.ok !== true)
    throw new DomainError('projection_unavailable', 'Owner-runner results are not installed on this database')
}

export function requestRunnerResult(
  c: pg.PoolClient,
  target: { projectId: string; operationId: string },
  key: string,
  request: OwnerRunnerResultRequest,
): Promise<OwnerRunnerCollection> {
  return call(c, 'SELECT sophia.request_runner_result($1,$2,$3,$4,$5,$6) AS r', [
    target.projectId,
    target.operationId,
    key,
    request.expectedOperationRevision,
    request.maxPages,
    request.maxBytes,
  ])
}
export const readRunnerResult = (c: pg.PoolClient, projectId: string, resultId: string) =>
  call<OwnerRunnerRetainedResult>(c, 'SELECT sophia.read_runner_result($1,$2) AS r', [projectId, resultId])
export const readRunnerWork = (c: pg.PoolClient, projectId: string, goalId: string, after: string | null) =>
  call<OwnerRunnerWorkPage>(c, 'SELECT sophia.runner_work_page($1,$2,$3) AS r', [projectId, goalId, after])
export const lookupRunnerWork = (
  c: pg.PoolClient,
  target: { projectId: string; goalId: string },
  query: { key: string; kind: 'operation' | 'collection' },
) =>
  call<OwnerRunnerWorkLookup>(c, 'SELECT sophia.runner_work_lookup($1,$2,$3,$4) AS r', [
    target.projectId,
    target.goalId,
    query.key,
    query.kind,
  ])
export const runnerWorkAvailability = (c: pg.PoolClient, projectId: string, goalId: string, after: string | null) =>
  call<Omit<OwnerRunnerWorkAvailability, 'resultsEnabled'>>(
    c,
    'SELECT sophia.runner_work_availability($1,$2,$3) AS r',
    [projectId, goalId, after],
  )

export interface RunnerResultClaim {
  projectId: string
  collectionId: string
  permit: string
  ownerId: string
  environmentRef: string
  journalId: string
  namespace: string
  envelope: RunnerEnvelope
  maxPages: number
  maxBytes: number
}
export const claimRunnerResult = (pool: pg.Pool) =>
  call<RunnerResultClaim | null>(pool, 'SELECT sophia.claim_runner_result() AS r')
export const resumeRunnerResult = (pool: pg.Pool) =>
  call<RunnerResultClaim | null>(pool, 'SELECT sophia.resume_runner_result() AS r')
export const maintainRunnerResults = (pool: pg.Pool) =>
  call<number>(pool, 'SELECT sophia.maintain_runner_results() AS r')
export const finishRunnerResult = (pool: pg.Pool, c: RunnerResultClaim) =>
  call<void>(pool, 'SELECT sophia.finish_runner_result($1,$2,$3) AS r', [c.projectId, c.collectionId, c.permit])
export const consumeRunnerResult = (
  pool: pg.Pool,
  c: RunnerResultClaim,
  metadata: { exchangeId: string; sha256: string; versionKey: string },
) =>
  call<OwnerRunnerResultDescriptor | null>(pool, 'SELECT sophia.consume_runner_result($1,$2,$3,$4,$5,$6) AS r', [
    c.projectId,
    c.collectionId,
    c.permit,
    metadata.exchangeId,
    metadata.sha256,
    metadata.versionKey,
  ])

/** One proxy, bound to one durable logical request. It cannot enqueue any other kind or operation. */
export class RunnerResultExchangeStore implements ExchangeStore {
  readonly collectionVersion = 1
  private id: string | null = null
  private readonly pool: pg.Pool
  private readonly claim: RunnerResultClaim
  constructor(pool: pg.Pool, claim: RunnerResultClaim) {
    this.pool = pool
    this.claim = claim
  }
  get exchangeId(): string | null {
    return this.id
  }
  async enqueue(input: Parameters<ExchangeStore['enqueue']>[0]): Promise<EnqueueResult> {
    const c = this.claim
    if (
      input.ownerId !== c.ownerId ||
      input.environmentRef !== c.environmentRef ||
      input.journalId !== c.journalId ||
      input.request.kind !== 'collect' ||
      digestOf(input.request.envelope) !== digestOf(c.envelope)
    )
      throw new Error('Result permit refused')
    const r = await call<EnqueueResult>(this.pool, 'SELECT sophia.enqueue_runner_result($1,$2,$3,$4,$5,$6) AS r', [
      c.projectId,
      c.collectionId,
      c.permit,
      JSON.stringify(input.request),
      digestOf(c.envelope),
      input.key,
    ])
    if (r.result === 'queued' || r.result === 'existing') this.id = r.exchangeId
    return r
  }
  exchange(ownerId: string, exchangeId: string): Promise<ExchangeView | null> {
    if (ownerId !== this.claim.ownerId || exchangeId !== this.id) throw new Error('Result permit refused')
    return call(this.pool, 'SELECT sophia.read_runner_result_exchange($1,$2,$3,$4) AS r', [
      this.claim.projectId,
      this.claim.collectionId,
      this.claim.permit,
      exchangeId,
    ])
  }
  settle(): Promise<SettleResult> {
    return Promise.resolve({ result: 'possible', reason: 'A collection timeout is not transport quiescence' })
  }
}
