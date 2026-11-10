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
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { OwnerRunnerOperationRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { admitRunnerOperation, readRunnerOperation, readRunnerOperations, withActor } from '@sophia/persistence'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

export type OwnerRunnerAdmissions = 'off' | 'admit'

/** What admitting calls of 0092. /ready requires it only with admissions on; reads check installation per request. */
export const OWNER_RUNNER_SCHEMA = `SELECT to_regprocedure('sophia.admit_owner_runner_operation(uuid,text,jsonb,text)') IS NOT NULL
  AND to_regclass('sophia.owner_runner_operations') IS NOT NULL AS ok`

const operationParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: { type: 'string', pattern: UUID_PATTERN },
    operationId: { type: 'string', pattern: UUID_PATTERN },
  },
  required: ['projectId', 'operationId'],
} as const

/** Whether 0092 is installed: remembered once seen (a migration is never undone under a running API). */
function installation(pool: pg.Pool): () => Promise<void> {
  let installed = false
  return async () => {
    if (installed) return
    const { rows } = await pool.query<{ ok: boolean }>(
      `SELECT to_regclass('sophia.owner_runner_operations') IS NOT NULL AS ok`,
    )
    if (rows[0]?.ok !== true) {
      throw new DomainError('projection_unavailable', 'Owner-runner operations are not installed on this database')
    }
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
