// WBC-02 (db/migrations/0042, amendment A13): one Paperclip-managed source review. The member operations run inside
// withActor; the adapter's and the runtime's inside withService (the sophia.* functions authenticate their own
// capability and refuse a member identity); the worker's on its own sophia_worker pool. Every decision is the
// database's: these functions pass the request through and read back what it recorded.
import type pg from 'pg'
import type {
  CoordinationObservation,
  CoordinationPermit,
  CoordinationPermitRequest,
  CoordinationRunRequest,
  CoordinationStart,
  ResearchReservation,
  ResearchReserveRequest,
  ResearchSettleRequest,
  ResearchSettlement,
  SourceReviewContextReply,
  SourceReviewContextRequest,
  SourceReviewSubmission,
  SourceReviewSubmitRequest,
  SourceReviewAvailability,
  SourceReviewProposal,
  SourceReviewProposalRequest,
  SourceReviewRoute,
  WorkCommand,
  WorkDecisionAnswer,
  WorkReceipt,
  WorkResult,
} from '@sophia/contracts'
import type { BoardFacts, DecisionFact, PlanFact, WorkFact } from '@sophia/coordination'
import { classifyDbError } from './errors.ts'
import { onlyRow } from './rows.ts'
import type { RuntimeCaller } from './runtime.ts'

async function call<T>(c: pg.PoolClient | pg.Pool, sql: string, params: readonly unknown[], name: string): Promise<T> {
  const { rows } = await c.query<{ reply: T }>(sql, [...params])
  return onlyRow(rows, name).reply
}

// --- members -------------------------------------------------------------------------------------------------------

/** Propose one source-review plan; route is the registry's specialist, never the request's. */
export const proposeSourceReview = (
  c: pg.PoolClient,
  projectId: string,
  key: string,
  request: SourceReviewProposalRequest,
  route: SourceReviewRoute,
) =>
  call<SourceReviewProposal>(
    c,
    'SELECT sophia.propose_source_review($1, $2, $3, $4) AS reply',
    [projectId, key, JSON.stringify(request), JSON.stringify(route)],
    'propose_source_review',
  )

export const answerWorkDecision = (
  c: pg.PoolClient,
  projectId: string,
  decisionId: string,
  key: string,
  answer: WorkDecisionAnswer,
) =>
  call<WorkReceipt>(
    c,
    'SELECT sophia.answer_work_decision($1, $2, $3, $4) AS reply',
    [projectId, decisionId, key, JSON.stringify(answer)],
    'answer_work_decision',
  )

export const admitWorkCommand = (
  c: pg.PoolClient,
  projectId: string,
  assignmentId: string,
  key: string,
  command: WorkCommand,
) =>
  call<WorkReceipt>(
    c,
    'SELECT sophia.work_command($1, $2, $3, $4) AS reply',
    [projectId, assignmentId, key, JSON.stringify(command)],
    'work_command',
  )

export const workOperationReceipt = (c: pg.PoolClient, projectId: string, operationId: string) =>
  call<WorkReceipt>(
    c,
    'SELECT sophia.work_operation_receipt($1, $2) AS reply',
    [projectId, operationId],
    'work_operation_receipt',
  )

export const readWorkResult = (c: pg.PoolClient, projectId: string, workId: string, versionId: string | null) =>
  call<WorkResult>(
    c,
    'SELECT sophia.read_work_result($1, $2, $3) AS reply',
    [projectId, workId, versionId],
    'read_work_result',
  )

/** What the pilot entry may offer; route is added by the caller from the registry (the database does not hold it). */
export const sourceReviewAvailability = (c: pg.PoolClient, projectId: string, role: string, routeId: string) =>
  call<Omit<SourceReviewAvailability, 'route'>>(
    c,
    'SELECT sophia.source_review_availability($1, $2, $3) AS reply',
    [projectId, role, routeId],
    'source_review_availability',
  )

// --- the board's facts, read under the viewer's own policies -----------------------------------------------------------

interface PlanRow {
  definition: PlanFact['definition']
  state: PlanFact['state']
  decision_id: string
  created_at: string
}

interface DecisionRow {
  id: string
  revision: number
  plan_id: string
  plan_revision: number
  work_id: string
  question: string
  decider_id: string
  choices: DecisionFact['choices']
  expires_at: string
  state: DecisionFact['state']
  selected_choice: string | null
  choice_receipt_id: string | null
}

type WorkRow = Omit<WorkFact, 'deliveryUnknown'> & { delivery_unknown: boolean }

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`
const iso = (column: string) => `to_char(${column} AT TIME ZONE 'UTC', ${ISO})`

async function readPlans(c: pg.PoolClient, projectId: string): Promise<PlanFact[]> {
  const { rows } = await c.query<PlanRow>(
    `SELECT definition, state, decision_id, ${iso('created_at')} AS created_at
       FROM sophia.work_plans WHERE project_id = $1 ORDER BY created_at, id`,
    [projectId],
  )
  return rows.map((r) => ({
    definition: r.definition,
    state: r.state,
    decisionId: r.decision_id,
    createdAt: r.created_at,
  }))
}

async function readDecisions(c: pg.PoolClient, projectId: string): Promise<DecisionFact[]> {
  // The receipt id is the one work_receipt (0042) gives the answer's operation: its first and only revision.
  const { rows } = await c.query<DecisionRow>(
    `SELECT id, revision, plan_id, plan_revision, work_id, question, decider_id, choices, ${iso('expires_at')} AS expires_at,
            state, selected_choice,
            CASE WHEN choice_operation IS NOT NULL
             THEN 'receipt:' || md5(project_id::text || answered_by::text || choice_operation) || ':1' END AS choice_receipt_id
       FROM sophia.work_decisions WHERE project_id = $1 ORDER BY created_at, id`,
    [projectId],
  )
  return rows.map((r) => ({
    id: r.id,
    revision: r.revision,
    planId: r.plan_id,
    planRevision: r.plan_revision,
    workId: r.work_id,
    question: r.question,
    deciderId: r.decider_id,
    choices: r.choices,
    expiresAt: r.expires_at,
    state: r.state,
    selectedChoice: r.selected_choice,
    choiceReceiptId: r.choice_receipt_id,
  }))
}

async function readWork(c: pg.PoolClient, projectId: string): Promise<WorkFact[]> {
  const { rows } = await c.query<WorkRow>(
    `SELECT w.id AS "workId", w.plan_id AS "planId", w.closed_reason AS "closedReason", w.wake_owed AS "wakeOwed",
            jsonb_build_object('status', g.status, 'stateRevision', g.state_revision) AS goal,
            (SELECT jsonb_build_object('id', a.id, 'generation', a.generation) FROM sophia.work_assignments a
              WHERE a.project_id = w.project_id AND a.work_id = w.id AND a.state = 'active') AS assignment,
            jsonb_build_object('state', cm.state, 'reason', cm.reason) AS commission,
            (SELECT jsonb_build_object('id', wa.id, 'nativeSessionId', b.native_session_id, 'bindingState', b.state,
                     'jobState', j.state, 'jobReason', j.reason)
               FROM sophia.work_attempts wa
               JOIN sophia.execution_bindings b ON b.project_id = wa.project_id AND b.attempt_id = wa.id
               JOIN sophia.jobs j ON j.project_id = wa.project_id AND j.attempt_id = wa.id AND j.kind = 'source_review'
              WHERE wa.project_id = w.project_id AND wa.goal_id = w.execution_goal_id
              ORDER BY wa.id LIMIT 1) AS attempt,
            coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'sourceId', r.source_id, 'sha256', r.sha256,
                       'state', r.state, 'createdAt', ${iso('r.created_at')}) ORDER BY r.created_at, r.id)
                       FROM sophia.work_results r WHERE r.project_id = w.project_id AND r.work_id = w.id), '[]') AS results,
            EXISTS(SELECT 1 FROM sophia.coordination_outbox o WHERE o.project_id = w.project_id AND o.work_id = w.id
                    AND (o.state = 'outcome_unknown' OR (o.state = 'delivering' AND o.attempts > 1))) AS delivery_unknown,
            (SELECT jsonb_build_object('op', o.op, 'code', o.result->>'code')
               FROM sophia.coordination_outbox o WHERE o.project_id = w.project_id AND o.work_id = w.id AND o.state = 'refused'
              ORDER BY o.seq DESC LIMIT 1) AS "controlRefused",
            ${iso(`greatest(w.created_at, cm.updated_at, (SELECT max(e.occurred_at) FROM sophia.project_events e
                     WHERE e.project_id = w.project_id AND e.entity_id IN (w.id, w.execution_goal_id)))`)} AS "updatedAt"
       FROM sophia.work_items w
       JOIN sophia.goals g ON g.project_id = w.project_id AND g.id = w.execution_goal_id
       JOIN sophia.work_commissions cm ON cm.project_id = w.project_id AND cm.work_id = w.id
      WHERE w.project_id = $1 ORDER BY w.created_at, w.id`,
    [projectId],
  )
  return rows.map(({ delivery_unknown, ...work }) => ({ ...work, deliveryUnknown: delivery_unknown }))
}

/**
 * Everything the board shows, read in one repeatable-read transaction (withActor 'read') under the viewer's own
 * policies, at the project cursor the snapshot reports. Null for someone who cannot read the project.
 */
export async function readBoardFacts(
  c: pg.PoolClient,
  projectId: string,
  viewerId: string,
): Promise<BoardFacts | null> {
  const { rows } = await c.query<{ cursor: string; can_edit: boolean; now: string }>(
    `SELECT p.event_sequence::text AS cursor, sophia.can_edit(p.id) AS can_edit, ${iso('now()')} AS now
       FROM sophia.projects p WHERE p.id = $1`,
    [projectId],
  )
  const head = rows[0]
  if (head === undefined) return null
  const [plans, decisions, work] = [
    await readPlans(c, projectId),
    await readDecisions(c, projectId),
    await readWork(c, projectId),
  ]
  return {
    projectId,
    cursor: head.cursor,
    now: head.now,
    viewer: { id: viewerId, canEdit: head.can_edit },
    plans,
    decisions,
    work,
  }
}

// --- the Paperclip adapter (coordinationCapability) ---------------------------------------------------------------------

const integration = <T>(c: pg.PoolClient, fn: string, tokenSha256: Buffer, request: unknown) =>
  call<T>(c, `SELECT sophia.${fn}($1, $2) AS reply`, [tokenSha256, JSON.stringify(request)], fn)

export const coordinationPermit = (c: pg.PoolClient, tokenSha256: Buffer, request: CoordinationPermitRequest) =>
  integration<CoordinationPermit>(c, 'coordination_permit', tokenSha256, request)
export const coordinationStart = (c: pg.PoolClient, tokenSha256: Buffer, request: CoordinationRunRequest) =>
  integration<CoordinationStart>(c, 'coordination_start', tokenSha256, request)
export const coordinationObserve = (c: pg.PoolClient, tokenSha256: Buffer, request: CoordinationRunRequest) =>
  integration<CoordinationObservation>(c, 'coordination_observe', tokenSha256, request)
export const coordinationCancel = (c: pg.PoolClient, tokenSha256: Buffer, request: CoordinationRunRequest) =>
  integration<CoordinationObservation>(c, 'coordination_cancel', tokenSha256, request)

// --- the reviewer's runtime operations (runtimeCapability) --------------------------------------------------------------

const runtime = <T>(c: pg.PoolClient, fn: string, who: RuntimeCaller, request: unknown) =>
  call<T>(
    c,
    `SELECT sophia.${fn}($1, $2, $3, $4) AS reply`,
    [who.tokenSha256, who.runtimeUnitId, who.bridgeInstanceId, JSON.stringify(request)],
    fn,
  )

export const runtimeSourceReviewContext = (c: pg.PoolClient, who: RuntimeCaller, request: SourceReviewContextRequest) =>
  runtime<SourceReviewContextReply>(c, 'runtime_source_review_context', who, request)
export const runtimeSourceReviewReserve = (c: pg.PoolClient, who: RuntimeCaller, request: ResearchReserveRequest) =>
  runtime<ResearchReservation>(c, 'runtime_source_review_reserve', who, request)
export const runtimeSourceReviewSettle = (c: pg.PoolClient, who: RuntimeCaller, request: ResearchSettleRequest) =>
  runtime<ResearchSettlement>(c, 'runtime_source_review_settle', who, request)
export const runtimeSourceReviewSubmit = (c: pg.PoolClient, who: RuntimeCaller, request: SourceReviewSubmitRequest) =>
  runtime<SourceReviewSubmission>(c, 'runtime_source_review_submit', who, request)

// --- the worker's deliveries to the plugin (sophia_worker) ----------------------------------------------------------------

/** One claimed delivery, as claim_coordination_outbox (0042) returns it. */
export interface CoordinationDelivery {
  readonly projectId: string
  readonly id: string
  readonly workId: string
  readonly op: 'commission' | 'hold' | 'resume' | 'stop' | 'complete' | 'fail'
  readonly deliveryKey: string
  readonly leaseToken: string
  /** Its previous outcome was unknown: find out what happened before sending anything again. */
  readonly reconcile: boolean
  readonly attempts: number
  /** Who initiated what is delivered: a member, or Sophia itself (the integration actor). */
  readonly initiator: { readonly kind: 'member' | 'sophia'; readonly id: string }
  readonly commission: {
    readonly key: string
    readonly companyId: string
    readonly paperclipProjectId: string
    readonly issueId: string | null
    readonly title: string
    readonly description: string
    readonly initialStatus: 'todo' | 'blocked' | 'cancelled'
    readonly wake: boolean
  }
}

export type DeliveryOutcome = 'delivered' | 'rejected' | 'unknown' | 'absent'

const worker = async <T>(p: Promise<T>): Promise<T> => {
  try {
    return await p
  } catch (err) {
    throw classifyDbError(err)
  }
}

export async function claimCoordinationOutbox(
  pool: pg.Pool,
  workerId: string,
  limit = 10,
  leaseSeconds = 60,
): Promise<CoordinationDelivery[]> {
  const { rows } = await worker(
    pool.query<{ delivery: CoordinationDelivery }>(
      'SELECT d AS delivery FROM sophia.claim_coordination_outbox($1, $2, $3) AS d',
      [workerId, limit, leaseSeconds],
    ),
  )
  return rows.map((r) => r.delivery)
}

/** Record what one delivery led to, under its lease; a lost lease raises invalid_state (reconcile on a later pass). */
export async function recordCoordinationDelivery(
  pool: pg.Pool,
  delivery: Pick<CoordinationDelivery, 'projectId' | 'id' | 'leaseToken'>,
  outcome: DeliveryOutcome,
  result: Readonly<Record<string, unknown>> | null,
  reason: string | null,
): Promise<string> {
  const { rows } = await worker(
    pool.query<{ reply: { state: string } }>(
      'SELECT sophia.record_coordination_delivery($1, $2, $3, $4, $5, $6) AS reply',
      [
        delivery.projectId,
        delivery.id,
        delivery.leaseToken,
        outcome,
        result === null ? null : JSON.stringify(result),
        reason,
      ],
    ),
  )
  return onlyRow(rows, 'record_coordination_delivery').reply.state
}

export async function expireCoordinationLeases(pool: pg.Pool): Promise<number> {
  const { rows } = await worker(pool.query<{ n: number }>('SELECT sophia.expire_coordination_leases() AS n'))
  return onlyRow(rows, 'expire_coordination_leases').n
}
