import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type {
  Contribution,
  DesignEditRequest,
  DesignRetryRequest,
  ResearchRender,
  ResearchRendition,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  readNativeTask,
  requestDesignEdit,
  retryFailedDesign,
  requestResearchRendition,
  submitContribution,
  withActor,
} from '@sophia/persistence'
import { namesOf } from './profile.ts'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

const taskParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: { type: 'string', pattern: UUID_PATTERN },
    taskId: { type: 'string', pattern: UUID_PATTERN },
  },
  required: ['projectId', 'taskId'],
} as const

/** A rendition as a member reads it: its state, the render, why it ended, and a refused report's checks. */
const renditionOf = (r: ResearchRender): ResearchRendition => ({
  state: r.state,
  ...(r.renderJobId ? { renderJobId: r.renderJobId } : {}),
  ...(r.reason ? { reason: r.reason } : {}),
  ...(r.reportChecks ? { checks: r.reportChecks } : {}),
})

/** What a client that still asks for a brief is told (SMC-M01): nothing was written, and what to do instead. */
export const BRIEF_RETIRED =
  'New briefs are retired: talk the idea through with Sophia, who keeps the project’s mission and notes. Existing briefs stay readable and their work controls still apply.'

/**
 * submitContribution, getNativeTask and the retired admitNativeTask (contract amendments A05, A08). Discussion is
 * recorded with its author and never starts work. New brief admission answers 410 before any write, whatever the
 * request (a stale client keeps getting the same answer); existing briefs stay readable.
 */
export function conversationRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: Contribution }>(
    '/api/v1/projects/:projectId/contributions',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'Contribution#' },
        response: { 202: { $ref: 'ContributionReceipt#' } },
      },
    },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        // The author's display name (0062), kept with the message: the room names them outside a call too.
        submitContribution(c, req.params.projectId, req.headers['idempotency-key'], req.body, {
          names: namesOf(req),
        }),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/native-tasks',
    { schema: { params: projectParams } },
    () => {
      throw new DomainError('native_task_retired', BRIEF_RETIRED)
    },
  )

  app.get<{ Params: { projectId: string; taskId: string } }>(
    '/api/v1/projects/:projectId/native-tasks/:taskId',
    { schema: { params: taskParams, response: { 200: { $ref: 'NativeTaskDetail#' } } } },
    async (req) =>
      withActor(pool, req.actorId, 'read', (c) => readNativeTask(c, req.params.projectId, req.params.taskId)),
  )

  renditionRoutes(app, pool)
}

/**
 * A published report's other formats: "Try PDF again" (A11) and a scoped edit of its designed page (A12, SDD-01).
 */
function renditionRoutes(app: FastifyInstance, pool: pg.Pool): void {
  // "Try PDF again" (S5b, 0032): the API prints the published version and queues it, in one transaction.
  app.post<{ Params: { projectId: string; taskId: string }; Headers: { 'idempotency-key': string } }>(
    '/api/v1/projects/:projectId/native-tasks/:taskId/rendition',
    {
      schema: { params: taskParams, headers: idempotencyHeader, response: { 202: { $ref: 'ResearchRendition#' } } },
    },
    async (req, reply) => {
      const rendition = await withActor(pool, req.actorId, 'write', (c) =>
        requestResearchRendition(c, req.params.projectId, req.params.taskId, req.headers['idempotency-key']),
      )
      return reply.status(202).send(renditionOf(rendition))
    },
  )

  // Revise named sections of a report's designed page (SDD-01 G5, 0041): a design task in mode edit, admitted with the
  // person's instruction as their own contribution, in one transaction.
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: DesignEditRequest }>(
    '/api/v1/projects/:projectId/html-edits',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'DesignEditRequest#' },
        response: { 202: { $ref: 'DesignEditReceipt#' } },
      },
    },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        requestDesignEdit(c, req.params.projectId, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(receipt)
    },
  )
  // Try a failed HTML design of a report again (A42, 0081): one new design attempt on its frozen content package, under
  // the owner's current research grant and a new allowance; refused, with nothing admitted, otherwise.
  app.post<{
    Params: { projectId: string; taskId: string }
    Headers: { 'idempotency-key': string }
    Body: DesignRetryRequest
  }>(
    '/api/v1/projects/:projectId/native-tasks/:taskId/html-retry',
    {
      schema: {
        params: taskParams,
        headers: idempotencyHeader,
        body: { $ref: 'DesignRetryRequest#' },
        response: { 202: { $ref: 'DesignRetryReceipt#' } },
      },
    },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        retryFailedDesign(c, req.params.projectId, req.params.taskId, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(receipt)
    },
  )
}
