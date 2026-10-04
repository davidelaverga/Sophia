import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { Contribution, ResearchRender, ResearchRendition } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { readNativeTask, requestResearchRendition, submitContribution, withActor } from '@sophia/persistence'
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
        submitContribution(c, req.params.projectId, req.headers['idempotency-key'], req.body),
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
}
