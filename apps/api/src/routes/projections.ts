import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { readSnapshot, withActor } from '@sophia/persistence'
import { withExchanges } from '../voice-joins.ts'
import { projectParams } from './schemas.ts'

/** getProjectSnapshot — consistent authorized snapshot with replay cursor (S1-02). */
export function projectionRoutes(app: FastifyInstance, { pool, voice }: { pool: pg.Pool; voice: boolean }): void {
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/snapshot',
    { schema: { params: projectParams, response: { 200: { $ref: 'Snapshot#' } } } },
    async (req) => {
      const snapshot = await withActor(pool, req.actorId, 'read', async (c) => {
        const read = await readSnapshot(c, req.params.projectId)
        // Voice qualification on (A15): each voice-created task names its exchange.
        return read && voice ? { ...read, work: await withExchanges(c, req.params.projectId, read.work) } : read
      })
      // Unknown and non-member projects look the same: no existence oracle.
      if (!snapshot) throw new DomainError('forbidden', 'Not permitted')
      return snapshot
    },
  )
}
