// searchProject (A38, docs/handoffs/FND-C4-PROJECT-SEARCH-attempt-1.md; #365 section 5): GET
// /api/v1/projects/{projectId}/search. Read as the member under their own row security; an unknown project and one they
// aren't an active member of look the same (403). Lexical only: no model, provider or index is asked.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { searchProject, withActor } from '@sophia/persistence'
import { projectParams } from './schemas.ts'

const searchQuerystring = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // At most 200 characters, counted as the contract counts them (code points).
    q: { type: 'string', maxLength: 200 },
    cursor: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,512}$' },
  },
  required: ['q'],
} as const

export function searchRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.get<{ Params: { projectId: string }; Querystring: { q: string; cursor?: string } }>(
    '/api/v1/projects/:projectId/search',
    { schema: { params: projectParams, querystring: searchQuerystring, response: { 200: { $ref: 'SearchPage#' } } } },
    async (req) => {
      const page = await withActor(pool, req.actorId, 'read', (c) =>
        searchProject(c, { projectId: req.params.projectId, q: req.query.q, cursor: req.query.cursor ?? null }),
      )
      if (!page) throw new DomainError('forbidden', 'Not permitted')
      return page
    },
  )
}
