import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { readSnapshot, withActor } from '@sophia/persistence'
import { projectParams } from './schemas.ts'

/** getProjectSnapshot — consistent authorized snapshot with replay cursor (S1-02). */
export function projectionRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/snapshot',
    { schema: { params: projectParams, response: { 200: { $ref: 'Snapshot#' } } } },
    async (req) => {
      const snapshot = await withActor(pool, req.actorId, 'read', (c) => readSnapshot(c, req.params.projectId))
      // Unknown and non-member projects look the same: no existence oracle.
      if (!snapshot) throw new DomainError('forbidden', 'Not permitted')
      return snapshot
    },
  )
}
