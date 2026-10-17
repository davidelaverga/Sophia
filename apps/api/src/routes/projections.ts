import type { FastifyInstance, FastifyReply } from 'fastify'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { readDiscussionPage, readSnapshot, withActor, type ServiceControl } from '@sophia/persistence'
import { projectParams } from './schemas.ts'

/**
 * How long a projection read may hold its database connection (READ-BOUNDS-01). Under the Studio's 30 s read
 * (apps/studio READ_TIMEOUT_MS), so the server answers «unavailable, ask again» before the browser gives up, with room
 * for the pool, the rollback and the reply. The transaction also bounds each statement on the server (statement_timeout)
 * and retires its connection at the deadline, or as soon as the person's request goes away.
 */
export const PROJECTION_READ_MS = 20_000

/** A projection read's control: its deadline, and an abort when the request closes before its answer is sent. */
function readControl(reply: FastifyReply): ServiceControl {
  const gone = new AbortController()
  reply.raw.once('close', () => {
    if (!reply.raw.writableFinished) gone.abort()
  })
  return { signal: gone.signal, deadline: performance.now() + PROJECTION_READ_MS }
}

/** getProjectSnapshot — consistent authorized snapshot with replay cursor (S1-02). */
export function projectionRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/snapshot',
    { schema: { params: projectParams, response: { 200: { $ref: 'Snapshot#' } } } },
    async (req, reply) => {
      const snapshot = await withActor(
        pool,
        req.actorId,
        'read',
        (c) => readSnapshot(c, req.params.projectId),
        readControl(reply),
      )
      // Unknown and non-member projects look the same: no existence oracle.
      if (!snapshot) throw new DomainError('forbidden', 'Not permitted')
      return snapshot
    },
  )

  // readDiscussion (A23): the room's discussion further back than the snapshot's 50, a page at a time.
  app.get<{ Params: { projectId: string }; Querystring: { before?: string } }>(
    '/api/v1/projects/:projectId/discussion',
    {
      schema: {
        params: projectParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { before: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { $ref: 'DiscussionPage#' } },
      },
    },
    async (req, reply) => {
      const page = await withActor(
        pool,
        req.actorId,
        'read',
        (c) => readDiscussionPage(c, req.params.projectId, req.query.before ?? null),
        readControl(reply),
      )
      if (!page) throw new DomainError('forbidden', 'Not permitted')
      return page
    },
  )
}
