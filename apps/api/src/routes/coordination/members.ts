// The work board for members (WBC-02, amendment A12): the board, the source-review pilot entry, decision answers,
// assignment commands, an operation's receipt and a work item's result. Every write runs under the member's own
// identity and Idempotency-Key, and is decided in SQL (0038); a business refusal is a recorded receipt, not an error.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type {
  SourceReviewProposalRequest,
  WorkBoardView,
  WorkCommand,
  WorkDecisionAnswer,
  WorkReceipt,
} from '@sophia/contracts'
import { ContractViolation, parseWorkBoardView, parseWorkReceipt } from '@sophia/contracts/validate'
import { projectBoard } from '@sophia/coordination'
import { DomainError } from '@sophia/domain'
import {
  admitWorkCommand,
  answerWorkDecision,
  proposeSourceReview,
  readBoardFacts,
  readWorkResult,
  sourceReviewAvailability,
  withActor,
  workOperationReceipt,
} from '@sophia/persistence'
import { idempotencyHeader, projectParams, UUID_PATTERN } from '../schemas.ts'
import { REVIEW_ROUTE } from './specialist.ts'

const withIds = (...names: string[]) =>
  ({
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(['projectId', ...names].map((n) => [n, { type: 'string', pattern: UUID_PATTERN }])),
    required: ['projectId', ...names],
  }) as const

const operationParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: { type: 'string', pattern: UUID_PATTERN },
    operationId: { type: 'string', minLength: 1, maxLength: 160 },
  },
  required: ['projectId', 'operationId'],
} as const

const versionQuery = {
  type: 'object',
  additionalProperties: false,
  properties: { version: { type: 'string', pattern: UUID_PATTERN } },
} as const

interface Deps {
  pool: pg.Pool
}

/** The viewer's board, checked against the contract before it leaves: a projection that breaks it is an outage. */
async function readBoard(pool: pg.Pool, actorId: string, projectId: string): Promise<WorkBoardView> {
  const facts = await withActor(pool, actorId, 'read', (c) => readBoardFacts(c, projectId, actorId))
  if (!facts) throw new DomainError('forbidden', 'Not permitted')
  try {
    return parseWorkBoardView(projectBoard(facts))
  } catch (err: unknown) {
    if (err instanceof ContractViolation)
      throw new DomainError('projection_unavailable', 'The work board could not be projected', { cause: err })
    throw err
  }
}

/**
 * The board's and the receipts' contracts carry the pack's conditional rules (if/then over nullable and constant
 * fields), which fast-json-stringify cannot compile. Those routes check the whole value against its contract (Ajv)
 * before it leaves and send it as plain JSON.
 */
const checkedJson = (data: unknown): string => JSON.stringify(data)

/** A receipt checked against sophia.work.receipt.v1: one that breaks it is never sent. */
function checkedReceipt(value: unknown): WorkReceipt {
  try {
    return parseWorkReceipt(value)
  } catch (err: unknown) {
    if (err instanceof ContractViolation)
      throw new DomainError('projection_unavailable', 'The receipt could not be checked', { cause: err })
    throw err
  }
}

/** The operation key and the body's operation_id are one identity: a mismatch is a malformed request. */
function sameOperation(key: string, operationId: string): void {
  if (key !== operationId) throw new DomainError('invalid_request', 'operation_id must equal the Idempotency-Key')
}

/** The board and the source-review pilot entry. */
function planRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/plans',
    {
      schema: { params: projectParams, response: { 200: { $ref: 'WorkBoardView#' } } },
      serializerCompiler: () => checkedJson,
    },
    async (req) => readBoard(pool, req.actorId, req.params.projectId),
  )

  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/plans/source-review',
    { schema: { params: projectParams, response: { 200: { $ref: 'SourceReviewAvailability#' } } } },
    async (req) => {
      const availability = await withActor(pool, req.actorId, 'read', (c) =>
        sourceReviewAvailability(c, req.params.projectId, REVIEW_ROUTE.role, REVIEW_ROUTE.id),
      )
      return { ...availability, route: REVIEW_ROUTE }
    },
  )

  app.post<{
    Params: { projectId: string }
    Headers: { 'idempotency-key': string }
    Body: SourceReviewProposalRequest
  }>(
    '/api/v1/projects/:projectId/plans/source-review',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'SourceReviewProposalRequest#' },
        response: { 201: { $ref: 'SourceReviewProposal#' } },
      },
    },
    async (req, reply) => {
      const proposal = await withActor(pool, req.actorId, 'write', (c) =>
        proposeSourceReview(c, req.params.projectId, req.headers['idempotency-key'], req.body, REVIEW_ROUTE),
      )
      return reply.status(201).send(proposal)
    },
  )
}

/** A decision's answer and an assignment's command: each a receipt, refusals included. */
function answerRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.post<{
    Params: { projectId: string; decisionId: string }
    Headers: { 'idempotency-key': string }
    Body: WorkDecisionAnswer
  }>(
    '/api/v1/projects/:projectId/decisions/:decisionId/answer',
    {
      schema: {
        params: withIds('decisionId'),
        headers: idempotencyHeader,
        body: { $ref: 'WorkDecisionAnswer#' },
        response: { 200: { $ref: 'WorkReceipt#' } },
      },
      serializerCompiler: () => checkedJson,
    },
    async (req) => {
      sameOperation(req.headers['idempotency-key'], req.body.operation_id)
      if (req.body.decision_id !== req.params.decisionId)
        throw new DomainError('invalid_request', 'decision_id must name the decision answered')
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        answerWorkDecision(c, req.params.projectId, req.params.decisionId, req.headers['idempotency-key'], req.body),
      )
      return checkedReceipt(receipt)
    },
  )

  app.post<{
    Params: { projectId: string; assignmentId: string }
    Headers: { 'idempotency-key': string }
    Body: WorkCommand
  }>(
    '/api/v1/projects/:projectId/assignments/:assignmentId/commands',
    {
      schema: {
        params: withIds('assignmentId'),
        headers: idempotencyHeader,
        body: { $ref: 'WorkCommand#' },
        response: { 202: { $ref: 'WorkReceipt#' } },
      },
      serializerCompiler: () => checkedJson,
    },
    async (req, reply) => {
      sameOperation(req.headers['idempotency-key'], req.body.operation_id)
      if (req.body.assignment_id !== req.params.assignmentId)
        throw new DomainError('invalid_request', 'assignment_id must name the assignment commanded')
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        admitWorkCommand(c, req.params.projectId, req.params.assignmentId, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(checkedReceipt(receipt))
    },
  )
}

/** An operation's receipt and a work item's result. */
function readRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Params: { projectId: string; operationId: string } }>(
    '/api/v1/projects/:projectId/work/operations/:operationId',
    {
      schema: { params: operationParams, response: { 200: { $ref: 'WorkReceipt#' } } },
      serializerCompiler: () => checkedJson,
    },
    async (req) =>
      checkedReceipt(
        await withActor(pool, req.actorId, 'read', (c) =>
          workOperationReceipt(c, req.params.projectId, req.params.operationId),
        ),
      ),
  )

  app.get<{ Params: { projectId: string; workId: string }; Querystring: { version?: string } }>(
    '/api/v1/projects/:projectId/work/:workId/result',
    { schema: { params: withIds('workId'), querystring: versionQuery, response: { 200: { $ref: 'WorkResult#' } } } },
    async (req) =>
      withActor(pool, req.actorId, 'read', (c) =>
        readWorkResult(c, req.params.projectId, req.params.workId, req.query.version ?? null),
      ),
  )
}

export function memberRoutes(app: FastifyInstance, { pool }: Deps): void {
  planRoutes(app, pool)
  answerRoutes(app, pool)
  readRoutes(app, pool)
}
