// The trusted read-only selection preview (INC04-S01b, contract amendment A56, migrations 0104 and 0106;
// docs/plans/selection-preview.md). The actor is the verified token's subject; the only request facts are the path
// project, the one closed operation (research) and the exact named source ids. The query is closed: no actor, role,
// goal, task, grant, proof, policy or settings field exists, so none can be supplied.
//
// One REPEATABLE READ READ ONLY snapshot (sophia.selection_snapshot, which checks membership itself and fixes one
// instant) → the pure assembler → the kernel's evaluateSelection → projectSelection for the actor. Only that projection
// is returned (no-store); the snapshot and the internal decision never reach HTTP, logs or events. Opening it calls no
// provider, model, companion or runner, and reserves, admits, wakes, notifies or dispatches nothing. Existing admission
// stays the authority and rechecks everything before any effect.
//
// A nonmember and a missing project answer 404 alike. A database without 0104, without the 0106 viewer boundary, or
// without 0105's atomic admission (whose promised money the preview counts; 0106 can be installed without it) answers
// projection_unavailable (503) for every role, before any snapshot is read, never an empty preview. A current viewer always answers the one
// uniform restricted view, whatever the pool holds: the database decides the role first and returns a restricted
// snapshot before it reads the pool, budget, Pin or sources (R2, 0106), so a healthy viewer's answer depends on none of
// them. Nothing promises constant time, and a database failure still answers unavailable. For a current admin or editor,
// a pool larger than one evaluation may hold (200) is projection_unavailable too, rather than a ranked subset.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { ATOMIC_ADMISSION_INSTALLED, readSelectionSnapshot, withActor } from '@sophia/persistence'
import { previewSelection } from '../selection-snapshot.ts'

/**
 * Whether 0106's viewer boundary is installed: its private marker, which the same-signature 0104 snapshot lacks. A
 * predicate fragment, also required by member API contributions (routes/api-contributions.ts).
 */
export const SELECTION_VIEWER_BOUNDARY = `to_regprocedure('sophia.selection_viewer_boundary_0106()') IS NOT NULL`

/**
 * What the boundary calls: the snapshot (0104), with the role decided first (0106), over the ledger 0105 makes atomic
 * (the shared catalog proof of persistence's contribution-installation).
 */
export const SELECTION_PREVIEW_SCHEMA = `SELECT to_regprocedure('sophia.selection_snapshot(uuid,uuid[])') IS NOT NULL
  AND ${ATOMIC_ADMISSION_INSTALLED}
  AND ${SELECTION_VIEWER_BOUNDARY} AS ok`

const UUID = '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'

const params = {
  type: 'object',
  additionalProperties: false,
  properties: { projectId: { type: 'string', format: 'uuid' } },
  required: ['projectId'],
} as const

/** The closed query: the one operation, and up to 8 source ids as one comma-separated value. */
const query = {
  type: 'object',
  additionalProperties: false,
  properties: {
    operation: { type: 'string', enum: ['research'] },
    sourceIds: { type: 'string', pattern: `^(${UUID})(,${UUID}){0,7}$` },
  },
  required: ['operation'],
} as const

/** The one spelling of an id the schema has accepted: its last 36 characters (no prefix), lowercase. */
const canonicalId = (id: string): string => id.slice(-36).toLowerCase()

/** The named sources, distinct, in their order; an empty list is an expressly context-free request. */
function sourceIdsOf(raw: string | undefined): string[] {
  if (raw === undefined) return []
  const ids = raw.split(',').map(canonicalId)
  if (new Set(ids).size !== ids.length) throw new DomainError('invalid_request', 'Name each source once')
  return ids
}

const notFound = (requestId: string) => ({
  code: 'not_found',
  message: 'No such project for this member',
  retry: 'never',
  requestId,
})

/**
 * Whether 0104, 0105 and 0106 are installed: remembered once seen (a migration is never undone under a running API);
 * a missing one is asked again on the next request, so the same API serves once the migration has run.
 */
function installation(pool: pg.Pool): () => Promise<void> {
  let installed = false
  return async () => {
    if (installed) return
    let ok = false
    try {
      const { rows } = await pool.query<{ ok: boolean }>(SELECTION_PREVIEW_SCHEMA)
      ok = rows[0]?.ok === true
    } catch (err) {
      throw new DomainError('unavailable', 'Database unavailable', { cause: err })
    }
    if (!ok) throw new DomainError('projection_unavailable', 'The selection preview is not installed on this database')
    installed = true
  }
}

export function selectionPreviewRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  const requireInstalled = installation(pool)

  app.get<{ Params: { projectId: string }; Querystring: { operation: 'research'; sourceIds?: string } }>(
    '/api/v1/projects/:projectId/selection-preview',
    { schema: { params, querystring: query, response: { 200: { $ref: 'SelectionView#' } } } },
    async (req, reply) => {
      await requireInstalled()
      const projectId = canonicalId(req.params.projectId)
      const sourceIds = sourceIdsOf(req.query.sourceIds)
      const snapshot = await withActor(pool, req.actorId, 'read', (c) => readSelectionSnapshot(c, projectId, sourceIds))
      void reply.header('cache-control', 'no-store')
      if (snapshot === null) return reply.status(404).send(notFound(req.id))
      // A viewer's snapshot is restricted in SQL before the pool is read (R2); an evaluator's larger pool is
      // projection_unavailable (previewSelection).
      return previewSelection(snapshot)
    },
  )
}
