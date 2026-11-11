// Owner-runner operations (contract amendment A47, migration 0092; docs/plans/owner-runner-operations.md). The actor is
// the verified token's subject, never a field of the request; ownership, the route's qualification, the goal and
// idempotency are rechecked by the database under the project lock.
//
// The routes are always served. SOPHIA_OWNER_RUNNERS gates NEW WORK only: off (the default) refuses a create or an input
// (and the unsupported kinds) with runner_admission_disabled, admit admits them. A Stop is not new work (r3, R2-F08): it
// is admitted in both modes by the same database admission with every one of its checks (owner, the binding's received
// create, the route's current stop qualification and lineage, expiry, idempotency), so turning new work off never takes
// away a qualified owner's Stop of work already running. Turning admissions off never hides work already admitted: the
// owner still reads each operation's state, its uncertainty and its native identities. A database that never had 0092
// is not an empty list: its reads answer projection_unavailable (503), so an old installation is never reported as
// "nothing".
//
// Source authority (INC01-CC-005, migration 0096, amendment A50): a create names its project sources, base, write scope
// and settings, and an input a subset of its create's sources; the database refuses any of them missing, ineligible or
// outside the route's declared policy before a write. A read's instruction is rechecked now: `withdrawn` keeps the
// operation's state, identities, Stop and reconciliation. Nothing here claims what a run used.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { OwnerRunnerOperationRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { admitRunnerOperation, readRunnerOperation, readRunnerOperations, withActor } from '@sophia/persistence'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

export type OwnerRunnerAdmissions = 'off' | 'admit'

/**
 * What the current A47/A50 boundary needs installed, as one query: readiness with admissions on (app.ts) and every
 * request here use exactly this (repair 7A, NATIVE6-F01). Not merely 0092's admission signature and table, which a
 * database without 0096 also has: there the frozen 0092 admission would ignore an A50 request's sources, base, scope
 * and settings and prepare a v1 envelope. So 0096's own objects are required too: the admitted-sources table, the
 * owner's content read, the source-policy declaration, and the columns the A50 operation and qualification carry. Each
 * check returns false, never an error, for something missing.
 */
export const OWNER_RUNNER_SCHEMA = `SELECT to_regprocedure('sophia.admit_owner_runner_operation(uuid,text,jsonb,text)') IS NOT NULL
  AND to_regclass('sophia.owner_runner_operations') IS NOT NULL
  AND to_regclass('sophia.owner_runner_operation_sources') IS NOT NULL
  AND to_regprocedure('sophia.owner_runner_content(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.declare_owner_runner_source_policy(uuid,uuid,jsonb)') IS NOT NULL
  AND (SELECT count(*) FROM pg_catalog.pg_attribute a
        WHERE NOT a.attisdropped AND a.attnum > 0
          AND ((a.attrelid = to_regclass('sophia.owner_runner_operations') AND a.attname IN ('envelope_version','requested_settings'))
            OR (a.attrelid = to_regclass('sophia.owner_runner_qualifications') AND a.attname = 'source_policy'))) = 3 AS ok`

const operationParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: { type: 'string', pattern: UUID_PATTERN },
    operationId: { type: 'string', pattern: UUID_PATTERN },
  },
  required: ['projectId', 'operationId'],
} as const

/**
 * Whether the whole capability is installed (OWNER_RUNNER_SCHEMA), checked before any admission write or read. Only a
 * complete installation is remembered (a migration is never undone under a running API); a partial one is asked again
 * each time, so the same instance serves once the missing migration lands, with no restart. Incomplete is
 * projection_unavailable, never an empty list or a v1 admission; a failed check is unavailable, never its message.
 */
function installation(pool: pg.Pool): () => Promise<void> {
  let installed = false
  return async () => {
    if (installed) return
    let ok = false
    try {
      const { rows } = await pool.query<{ ok: boolean }>(OWNER_RUNNER_SCHEMA)
      ok = rows[0]?.ok === true
    } catch (err) {
      throw new DomainError('unavailable', 'Database unavailable', { cause: err })
    }
    if (!ok)
      throw new DomainError('projection_unavailable', 'Owner-runner operations are not installed on this database')
    installed = true
  }
}

export function runnerOperationRoutes(
  app: FastifyInstance,
  { pool, admissions }: { pool: pg.Pool; admissions: OwnerRunnerAdmissions },
): void {
  const requireInstalled = installation(pool)

  app.post<{
    Params: { projectId: string }
    Headers: { 'idempotency-key': string }
    Body: OwnerRunnerOperationRequest
  }>(
    '/api/v1/projects/:projectId/runner-operations',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'OwnerRunnerOperationRequest#' },
        response: { 202: { $ref: 'OwnerRunnerOperationReceipt#' } },
      },
    },
    async (req, reply) => {
      if (admissions !== 'admit' && req.body.kind !== 'stop')
        throw new DomainError('runner_admission_disabled', 'Owner-runner admissions of new work are off')
      await requireInstalled()
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        admitRunnerOperation(c, req.params.projectId, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/runner-operations',
    { schema: { params: projectParams, response: { 200: { $ref: 'OwnerRunnerOperationList#' } } } },
    async (req) => {
      await requireInstalled()
      return {
        operations: await withActor(pool, req.actorId, 'read', (c) => readRunnerOperations(c, req.params.projectId)),
      }
    },
  )

  app.get<{ Params: { projectId: string; operationId: string } }>(
    '/api/v1/projects/:projectId/runner-operations/:operationId',
    { schema: { params: operationParams, response: { 200: { $ref: 'OwnerRunnerOperation#' } } } },
    async (req) => {
      await requireInstalled()
      return withActor(pool, req.actorId, 'read', (c) =>
        readRunnerOperation(c, req.params.projectId, req.params.operationId),
      )
    },
  )
}
