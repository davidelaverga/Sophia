// A project's activity, for its admins (contract amendment A28, docs/plans/project-activity.md): who did what, on whom,
// and when, from the project's events. Codes and names only, never content.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { readProjectActivity, withActor } from '@sophia/persistence'
import { projectParams } from './schemas.ts'

export function activityRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.get<{ Params: { projectId: string }; Querystring: { before?: string } }>(
    '/api/v1/projects/:projectId/activity',
    {
      schema: {
        params: projectParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { before: { type: 'string', pattern: '^[1-9][0-9]{0,18}$' } },
        },
        response: { 200: { $ref: 'ActivityPage#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'read', (c) =>
        readProjectActivity(c, req.params.projectId, req.query.before ?? null),
      ),
  )
}
