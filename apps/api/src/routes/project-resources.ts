// Project native resources (contract amendment A51, migration 0097; docs/plans/project-native-resources.md). The actor
// is the verified token's subject, read in one read-only transaction (withActor 'read'); no request field names an
// owner, account, host or qualification. The database checks current membership first and builds the owner-only part
// (connection, live host, recorded qualification) for the owner alone.
//
// A read: it is no grant, control, GO or readiness, writes nothing and is always served, whatever new owner-runner work
// admits. Each page is an observation (cache-control: no-store): a nonmember and a missing project answer 404 alike, a
// database without 0097 answers projection_unavailable (503), never an empty list, and no database message is returned.
//
// Path and cursor ids are checked as A51 declares them (`format: uuid`: the hex form in any case, optionally
// `urn:uuid:`) and then read in one spelling, lowercase without the prefix. The shared lowercase UUID_PATTERN is
// unchanged.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { readProjectNativeResources, withActor } from '@sophia/persistence'

/** What the boundary calls of 0097. */
export const PROJECT_NATIVE_RESOURCES_SCHEMA = `SELECT to_regprocedure('sophia.project_native_resources(uuid,uuid)') IS NOT NULL AS ok`

/** An id as A51 declares it. */
const declaredUuid = { type: 'string', format: 'uuid' } as const

/** The one spelling of an id the schema has accepted: its last 36 characters (no prefix), lowercase. */
const canonicalId = (id: string): string => id.slice(-36).toLowerCase()

const params = {
  type: 'object',
  additionalProperties: false,
  properties: { projectId: declaredUuid },
  required: ['projectId'],
} as const

const query = { type: 'object', additionalProperties: false, properties: { after: declaredUuid } } as const

/** A nonmember and a missing project are told apart from nothing: one answer for both. */
const notFound = (requestId: string) => ({
  code: 'not_found',
  message: 'No such project for this member',
  retry: 'never',
  requestId,
})

/** Whether 0097 is installed: remembered once seen (a migration is never undone under a running API). */
function installation(pool: pg.Pool): () => Promise<void> {
  let installed = false
  return async () => {
    if (installed) return
    let ok = false
    try {
      const { rows } = await pool.query<{ ok: boolean }>(PROJECT_NATIVE_RESOURCES_SCHEMA)
      ok = rows[0]?.ok === true
    } catch (err) {
      throw new DomainError('unavailable', 'Database unavailable', { cause: err })
    }
    if (!ok)
      throw new DomainError('projection_unavailable', 'The native resource catalog is not installed on this database')
    installed = true
  }
}

export function projectResourceRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  const requireInstalled = installation(pool)

  app.get<{ Params: { projectId: string }; Querystring: { after?: string } }>(
    '/api/v1/projects/:projectId/native-resources',
    { schema: { params, querystring: query, response: { 200: { $ref: 'ProjectNativeResourcePage#' } } } },
    async (req, reply) => {
      await requireInstalled()
      const projectId = canonicalId(req.params.projectId)
      const after = req.query.after === undefined ? null : canonicalId(req.query.after)
      const page = await withActor(pool, req.actorId, 'read', (c) => readProjectNativeResources(c, projectId, after))
      void reply.header('cache-control', 'no-store')
      if (page === null) return reply.status(404).send(notFound(req.id))
      return page
    },
  )
}
