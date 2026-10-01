import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { listReports, readArtifactVersions, withActor, type ReportQuery } from '@sophia/persistence'
import { UUID_PATTERN } from './schemas.ts'

const artifactParams = {
  type: 'object',
  additionalProperties: false,
  properties: { artifactId: { type: 'string', pattern: UUID_PATTERN } },
  required: ['artifactId'],
} as const

const reportsQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    project: { type: 'string', pattern: `^(all|${UUID_PATTERN.slice(1, -1)})$` },
    format: { type: 'string', enum: ['any', 'pdf', 'markdown_only'] },
    q: { type: 'string', maxLength: 200 },
    cursor: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,200}$' },
  },
  required: ['project'],
} as const

interface ReportsQuerystring {
  project: string
  format?: ReportQuery['format']
  q?: string
  cursor?: string
}

/**
 * Knowledge reads (A11, SMC-M03): listReports and listArtifactVersions. Both run under the member's RLS, so the
 * cross-project list (project=all) reads only projects the reader is a member of, and a guest's token never reaches
 * them (guest tokens open the guest routes only).
 */
export function knowledgeRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.get<{ Querystring: ReportsQuerystring }>(
    '/api/v1/knowledge/reports',
    { schema: { querystring: reportsQuery, response: { 200: { $ref: 'ReportList#' } } } },
    async (req) => {
      const search = req.query.q?.trim() ?? ''
      const query: ReportQuery = {
        projectId: req.query.project === 'all' ? null : req.query.project,
        format: req.query.format ?? 'any',
        search: search === '' ? null : search,
        cursor: req.query.cursor ?? null,
      }
      return withActor(pool, req.actorId, 'read', (c) => listReports(c, query))
    },
  )

  app.get<{ Params: { artifactId: string } }>(
    '/api/v1/artifacts/:artifactId/versions',
    { schema: { params: artifactParams, response: { 200: { $ref: 'ArtifactVersionList#' } } } },
    async (req) => withActor(pool, req.actorId, 'read', (c) => readArtifactVersions(c, req.params.artifactId)),
  )
}
