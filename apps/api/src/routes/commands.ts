import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { GoalCommand } from '@sophia/contracts'
import { admitGoalCommand, withActor } from '@sophia/persistence'
import { idempotencyHeader, projectParams } from './schemas.ts'

/**
 * admitGoalCommand — durable admission, 202 with a receipt; never a finished result.
 * The same Idempotency-Key + payload returns the original receipt (safe retry after a lost reply).
 */
export function commandRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: GoalCommand }>(
    '/api/v1/projects/:projectId/commands',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'GoalCommand#' },
        response: { 202: { $ref: 'Receipt#' } },
      },
    },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        admitGoalCommand(c, req.params.projectId, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(receipt)
    },
  )
}
