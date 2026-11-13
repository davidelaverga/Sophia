// Owner-runner operations (migration 0092, contract amendment A47; docs/plans/owner-runner-operations.md). An owner's
// operation on their own qualified native resource is admitted through sophia.admit_owner_runner_operation, which
// rechecks membership, ownership, the route's qualification, the goal and idempotency under the project lock and writes
// the operation, its command and its outbox row together. The worker (sophia_worker login) claims, prepares, records,
// maintains and follows up through the 0092 functions; it never writes the tables directly. Reads run under the
// owner's RLS: another member's operation answers like a missing one.
// Source authority (INC01-CC-005, migration 0096, amendment A50): a create or input is admitted with its sources, base,
// write scope and settings, and its instruction kept as an owner-private source. Its text is read back only through
// sophia.owner_runner_content, which rechecks that authority now (owner-only RLS is not reauthorization): `available`,
// or `withdrawn` with its metadata. A v1 (A47) row's text stays inline. Prepare-send returns a v2 send's instruction
// beside its content-free envelope, only after its recheck.
import type pg from 'pg'
import type { OwnerRunnerOperation, OwnerRunnerOperationReceipt, OwnerRunnerOperationRequest } from '@sophia/contracts'
import { digestOf, type RunnerAnswer, type RunnerEnvelope, type RunObservation } from '@sophia/coordination/runner-port'
import { DomainError } from '@sophia/domain'
import { classifyDbError } from './errors.ts'
import type { OutboxRow } from './outbox.ts'
import { onlyRow } from './rows.ts'

const wrap = async <T>(p: Promise<T>): Promise<T> => {
  try {
    return await p
  } catch (err) {
    throw classifyDbError(err)
  }
}

/**
 * Admit one operation. Call inside withActor(..., 'write'). The request's digest (SHA-256 over its canonical JSON) is
 * kept with it: the same key and request return the first receipt, another request under the key conflicts.
 */
export async function admitRunnerOperation(
  c: pg.PoolClient,
  projectId: string,
  idempotencyKey: string,
  request: OwnerRunnerOperationRequest,
): Promise<OwnerRunnerOperationReceipt> {
  const { rows } = await c.query<{ receipt: OwnerRunnerOperationReceipt }>(
    'SELECT sophia.admit_owner_runner_operation($1, $2, $3, $4) AS receipt',
    [projectId, idempotencyKey, JSON.stringify(request), digestOf(request)],
  )
  return onlyRow(rows, 'admit_owner_runner_operation').receipt
}

interface OperationRow {
  id: string
  kind: OwnerRunnerOperation['kind']
  state: OwnerRunnerOperation['state']
  reason: string | null
  goal_id: string
  resource_id: string
  target_operation_id: string | null
  title: string | null
  message: string | null
  revision: string
  created_at: Date
  possible_send_at: Date | null
  received_at: Date | null
  settled_at: Date | null
  native_thread_id: string | null
  native_run_id: string | null
  native_delivery: OwnerRunnerOperation['nativeDelivery']
  run_status: string | null
  deferrals: number
  reconcile_attempts: number
  /** sophia.owner_runner_content: the source facts and the instruction as they may be read now. */
  content: SourceContent
}

interface SourceContent {
  envelopeVersion: 1 | 2
  content: OwnerRunnerOperation['content']
  sourceIds: string[] | null
  baseCommit: string | null
  writeScope: 'read_only' | null
  settings: OwnerRunnerOperation['settings']
  message?: string | null
  title?: string | null
}

const COLUMNS = `id, kind, state, reason, goal_id, resource_id, target_operation_id, title, message, revision, created_at,
  possible_send_at, received_at, settled_at, native_thread_id, native_run_id, native_delivery, run_status, deferrals,
  reconcile_attempts, sophia.owner_runner_content(project_id, id) AS content`

const iso = (d: Date | null) => (d === null ? null : d.toISOString())

/**
 * The owner's view. The native namespace and derived command/message ids stay in the database, out of the view. A v2
 * row's title and message are its instruction only while it may be read now; withdrawn, they are null.
 */
function view(r: OperationRow): OwnerRunnerOperation {
  const c = r.content
  const inline = c.envelopeVersion === 1
  return {
    operationId: r.id,
    kind: r.kind,
    state: r.state,
    reason: r.reason,
    goalId: r.goal_id,
    resourceId: r.resource_id,
    targetOperationId: r.target_operation_id,
    title: inline ? r.title : (c.title ?? null),
    message: inline ? r.message : (c.message ?? null),
    revision: Number(r.revision),
    admittedAt: r.created_at.toISOString(),
    possibleSendAt: iso(r.possible_send_at),
    receivedAt: iso(r.received_at),
    settledAt: iso(r.settled_at),
    nativeThreadId: r.native_thread_id,
    nativeRunId: r.native_run_id,
    nativeDelivery: r.native_delivery,
    runStatus: r.run_status,
    deferrals: r.deferrals,
    reconcileAttempts: r.reconcile_attempts,
    envelopeVersion: c.envelopeVersion,
    content: c.content,
    sourceIds: c.sourceIds,
    baseCommit: c.baseCommit,
    writeScope: c.writeScope,
    settings: c.settings,
  }
}

async function requireMember(c: pg.PoolClient, projectId: string): Promise<void> {
  const { rows } = await c.query<{ member: boolean }>('SELECT sophia.is_member($1) AS member', [projectId])
  if (!rows[0]?.member) throw new DomainError('forbidden', 'Not permitted')
}

/** The caller's own operations in the project, newest first. Call inside withActor(..., 'read'). */
export async function readRunnerOperations(c: pg.PoolClient, projectId: string): Promise<OwnerRunnerOperation[]> {
  await requireMember(c, projectId)
  const { rows } = await c.query<OperationRow>(
    `SELECT ${COLUMNS} FROM sophia.owner_runner_operations WHERE project_id = $1 ORDER BY created_at DESC, id LIMIT 100`,
    [projectId],
  )
  return rows.map(view)
}

/** One of the caller's operations; another's, or none, is not found. Call inside withActor(..., 'read'). */
export async function readRunnerOperation(
  c: pg.PoolClient,
  projectId: string,
  operationId: string,
): Promise<OwnerRunnerOperation> {
  await requireMember(c, projectId)
  const { rows } = await c.query<OperationRow>(
    `SELECT ${COLUMNS} FROM sophia.owner_runner_operations WHERE project_id = $1 AND id = $2`,
    [projectId, operationId],
  )
  const row = rows[0]
  if (!row) throw new DomainError('not_found', 'Operation not found')
  return view(row)
}

// ---- Worker side (sophia_worker login) ----

/** One owner runner: an owner's gateway bound to one native environment. It answers only for its own operations. */
export interface OwnerRunner {
  ownerId: string
  environmentRef: string
}

/**
 * Claim one runner's pending deliveries (stops first) under a lease. A claim is scheduling ownership, not an effect;
 * another owner's or environment's rows are never claimed here, so they never reach this runner's gateway.
 */
/** What a claim may take: every runner row, or (new work off, r3 R2-F08) only already-admitted Stops. */
export interface RunnerClaim {
  readonly newWork: boolean
  readonly limit?: number
  readonly leaseSeconds?: number
}

export async function claimRunnerOutbox(
  pool: pg.Pool,
  worker: string,
  runner: OwnerRunner,
  claim: RunnerClaim,
): Promise<OutboxRow[]> {
  const { rows } = await wrap(
    pool.query<OutboxRow>('SELECT * FROM sophia.claim_owner_runner_outbox($1, $2, $3, $4, $5, $6)', [
      worker,
      runner.ownerId,
      runner.environmentRef,
      claim.newWork,
      claim.limit ?? 10,
      claim.leaseSeconds ?? 60,
    ]),
  )
  return rows
}

/**
 * A send carries, for a v2 envelope, its instruction (`payload`: the canonical text whose SHA-256 is payloadSha256),
 * read under the same recheck. An owner-host proxy drops it; an in-process gateway checks and sends it.
 */
export type PrepareOutcome =
  | { result: 'send'; envelope: RunnerEnvelope; payload?: string }
  | { result: 'denied'; reason: string }
  | { result: 'deferred'; reason: string }
  | { result: 'expired'; reason: string }

/**
 * Recheck current authority and mark the possible send, committed before the gateway is called; or deny or defer.
 * A lost lease raises invalid_state: the row is maintained from what the database recorded, never sent here.
 */
export async function prepareRunnerSend(
  pool: pg.Pool,
  projectId: string,
  outboxId: string,
  leaseToken: string,
  journalId: string,
): Promise<PrepareOutcome> {
  const { rows } = await wrap(
    pool.query<{ outcome: PrepareOutcome }>('SELECT sophia.owner_runner_prepare_send($1, $2, $3, $4) AS outcome', [
      projectId,
      outboxId,
      leaseToken,
      journalId,
    ]),
  )
  return onlyRow(rows, 'owner_runner_prepare_send').outcome
}

/** What the worker records: the gateway's answer, or an observation (an unknown observation is `unobserved`). */
/**
 * What is recorded: a gateway answer, or an observation. A Stop's observation carries the barrier token its follow-up
 * returned (integrated r2, F01): SQL settles a Stop only on an observation made under its inputs' current token.
 */
export type RunnerRecord =
  | RunnerAnswer
  | (Exclude<RunObservation, { kind: 'unknown' }> & { readonly barrier?: string | null })
  | { kind: 'unobserved' }

/** Record an answer for a send (with its lease) or a reconciliation or observation (without). */
export interface RunnerRecordTarget {
  projectId: string
  operationId: string
  /** The send's lease, when recording a send's answer; null for a reconciliation or an observation. */
  leaseToken: string | null
  /** The journal of the gateway that answered: an answer from any journal but the bound one changes nothing. */
  journalId: string
}

export async function recordRunnerAnswer(
  pool: pg.Pool,
  { projectId, operationId, leaseToken, journalId }: RunnerRecordTarget,
  answer: RunnerRecord,
): Promise<{ operationId: string; state: OwnerRunnerOperation['state']; changed: boolean }> {
  const { rows } = await wrap(
    pool.query<{ result: { operationId: string; state: OwnerRunnerOperation['state']; changed: boolean } }>(
      'SELECT sophia.owner_runner_record($1, $2, $3, $4, $5) AS result',
      [projectId, operationId, leaseToken, journalId, JSON.stringify(answer)],
    ),
  )
  return onlyRow(rows, 'owner_runner_record').result
}

/** Expired leases and superseded rows: requeue what was never possibly sent, mark the rest unknown or denied. */
export async function maintainRunnerOperations(pool: pg.Pool, limit = 50): Promise<number> {
  const { rows } = await wrap(pool.query<{ n: number }>('SELECT sophia.owner_runner_maintain($1) AS n', [limit]))
  return onlyRow(rows, 'owner_runner_maintain').n
}

export interface RunnerFollowup {
  projectId: string
  operationId: string
  kind: OwnerRunnerOperation['kind']
  state: 'unknown' | 'received'
  envelope: RunnerEnvelope
  /** A Stop's barrier token over its binding's inputs (integrated r2, F01); null for a create or an input. */
  barrier: string | null
}

/** One runner's operations to reconcile (unknown) or observe (received), each with the envelope its digest binds. */
export async function runnerFollowups(
  pool: pg.Pool,
  runner: OwnerRunner,
  /** This runner's journal: only operations bound to it are followed here. */
  journalId: string,
  limit = 20,
  minAgeSeconds = 10,
): Promise<RunnerFollowup[]> {
  const { rows } = await wrap(
    pool.query<{
      project_id: string
      operation_id: string
      kind: RunnerFollowup['kind']
      state: RunnerFollowup['state']
      envelope: RunnerEnvelope
      barrier: string | null
    }>('SELECT * FROM sophia.owner_runner_followups($1, $2, $3, $4, $5)', [
      runner.ownerId,
      runner.environmentRef,
      journalId,
      limit,
      minAgeSeconds,
    ]),
  )
  return rows.map((r) => ({
    projectId: r.project_id,
    operationId: r.operation_id,
    kind: r.kind,
    state: r.state,
    envelope: r.envelope,
    barrier: r.barrier,
  }))
}
