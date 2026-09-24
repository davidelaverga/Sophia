import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { ProjectCreate } from '@sophia/contracts'
import { createProject, withActor } from '@sophia/persistence'
import { idempotencyHeader } from './schemas.ts'

/**
 * createProject — project + creator membership atomically, idempotent per actor and key.
 * A retry with the same key returns the same project (201 again), never a second project.
 */
export function projectRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.post<{ Headers: { 'idempotency-key': string }; Body: ProjectCreate }>(
    '/api/v1/projects',
    {
      schema: {
        headers: idempotencyHeader,
        body: { $ref: 'ProjectCreate#' },
        response: { 201: { $ref: 'ProjectCreated#' } },
      },
    },
    async (req, reply) => {
      const created = await withActor(pool, req.actorId, 'write', (c) =>
        createProject(c, req.headers['idempotency-key'], req.body),
      )
      return reply.status(201).send(created)
    },
  )
}
