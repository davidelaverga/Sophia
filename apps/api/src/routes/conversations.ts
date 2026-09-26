import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { Contribution, NativeTaskRequest } from '@sophia/contracts'
import { admitNativeTask, readNativeTask, submitContribution, withActor } from '@sophia/persistence'
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

/**
 * submitContribution, admitNativeTask and getNativeTask (contract amendment A05). Discussion is recorded with
 * its author and never starts work; a native task is admitted only by its own explicit request, idempotent per
 * person and key, and answered with a receipt (202), never a finished result.
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

  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: NativeTaskRequest }>(
    '/api/v1/projects/:projectId/native-tasks',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'NativeTaskRequest#' },
        response: { 202: { $ref: 'NativeTaskReceipt#' } },
      },
    },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        admitNativeTask(c, req.params.projectId, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.get<{ Params: { projectId: string; taskId: string } }>(
    '/api/v1/projects/:projectId/native-tasks/:taskId',
    { schema: { params: taskParams, response: { 200: { $ref: 'NativeTaskDetail#' } } } },
    async (req) =>
      withActor(pool, req.actorId, 'read', (c) => readNativeTask(c, req.params.projectId, req.params.taskId)),
  )
}
