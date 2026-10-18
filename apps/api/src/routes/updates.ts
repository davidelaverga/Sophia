// What changed in a project since a member last looked (A34, docs/plans/project-updates.md, #365 section 2):
// GET /api/v1/projects/{projectId}/since and PUT /api/v1/projects/{projectId}/seen. Active members only; the member is
// the token's subject. Reading acknowledges nothing: only the seen write moves the mark, to the toSequence shown.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { ProjectSeenRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { markProjectSeen, readProjectUpdates, withActor } from '@sophia/persistence'
import { projectParams } from './schemas.ts'

/** The largest sequence a bigint holds: a seen sequence past it is refused here, not by the database (503). */
const MOST_SEQUENCE = 9223372036854775807n

export function updatesRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/since',
    { schema: { params: projectParams, response: { 200: { $ref: 'ProjectUpdates#' } } } },
    async (req) => withActor(pool, req.actorId, 'read', (c) => readProjectUpdates(c, req.params.projectId)),
  )

  app.put<{ Params: { projectId: string }; Body: ProjectSeenRequest }>(
    '/api/v1/projects/:projectId/seen',
    { schema: { params: projectParams, body: { $ref: 'ProjectSeenRequest#' } } },
    async (req, reply) => {
      if (BigInt(req.body.sequence) > MOST_SEQUENCE)
        throw new DomainError('invalid_request', 'A seen sequence the project has reached')
      await withActor(pool, req.actorId, 'write', (c) => markProjectSeen(c, req.params.projectId, req.body.sequence))
      return reply.status(204).send()
    },
  )
}
