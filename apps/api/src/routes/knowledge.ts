import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { ReportSummaryEdit } from '@sophia/contracts'
import {
  editReportSummary,
  listReports,
  listReportSources,
  readArtifactVersions,
  withActor,
  type ReportQuery,
} from '@sophia/persistence'
import { UUID_PATTERN } from './schemas.ts'

const artifactParams = {
  type: 'object',
  additionalProperties: false,
  properties: { artifactId: { type: 'string', pattern: UUID_PATTERN } },
  required: ['artifactId'],
} as const

const versionParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    artifactId: { type: 'string', pattern: UUID_PATTERN },
    versionId: { type: 'string', pattern: UUID_PATTERN },
  },
  required: ['artifactId', 'versionId'],
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
 * Knowledge (A11, SMC-M03): listReports, listArtifactVersions and listReportSources, and editReportSummary. The reads
 * run under the member's RLS, so the cross-project list (project=all) reads only projects the reader is a member of,
 * and a guest's token never reaches them (guest tokens open the guest routes only). The description edit is checked
 * against the revision the editor saw instead of an idempotency key: a replay of the same edit is stale.
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

  app.get<{ Params: { artifactId: string; versionId: string } }>(
    '/api/v1/artifacts/:artifactId/versions/:versionId/sources',
    { schema: { params: versionParams, response: { 200: { $ref: 'ReportSourceList#' } } } },
    async (req) =>
      withActor(pool, req.actorId, 'read', (c) => listReportSources(c, req.params.artifactId, req.params.versionId)),
  )

  app.patch<{ Params: { artifactId: string }; Body: ReportSummaryEdit }>(
    '/api/v1/artifacts/:artifactId/summary',
    {
      schema: {
        params: artifactParams,
        body: { $ref: 'ReportSummaryEdit#' },
        response: { 200: { $ref: 'ReportSummary#' } },
      },
    },
    async (req) => withActor(pool, req.actorId, 'write', (c) => editReportSummary(c, req.params.artifactId, req.body)),
  )
}
