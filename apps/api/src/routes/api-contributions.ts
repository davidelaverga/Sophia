// Member API contributions (contract amendment A48, migration 0094; docs/plans/api-contributions.md "S5b"). The actor
// is the verified token's subject, never a field of the request: no body, header or path field names an owner,
// requester, payer, credential, runtime or capability, and the request schemas refuse unknown fields. Authority (the
// record's owner, an admin of the grant's own project, a current editor) is decided by the database under its locks.
//
// Every write goes through one idempotent entry (sophia.api_contribution_write): the same Idempotency-Key and request
// replays the first receipt under the caller's CURRENT authority; another request under the key is
// idempotency_conflict. Metadata and control only: no key intake, registration, qualification or execution endpoint.
// A connection state of `connected` is metadata, never live authentication, qualification or funding.
//
// Path ids are checked exactly as A48 declares them (`format: uuid`: the hex form in any case, optionally `urn:uuid:`)
// and then written in one spelling, lowercase without the prefix, before a write merges them or a read looks them up.
//
// Mounted only when the API is built with apiContributions (off by default; server.ts and the environment do not turn
// it on). A database without everything these routes promise (0094, 0100, 0104's owner protection and account
// qualification, 0105's atomic admission and 0106's viewer boundary) answers projection_unavailable (503) before any
// read or write reaches SQL, never an empty list, a refused setting or a database message (R2, F02; INC04-S02a
// coherent: 0106 can be installed without 0105).
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import {
  ATOMIC_ADMISSION_INSTALLED,
  contributionWrite,
  readMyContributions,
  readProjectContributions,
  readResearchTaskFunding,
  withActor,
  type ContributionWrite,
} from '@sophia/persistence'
import { idempotencyHeader } from './schemas.ts'
import { SELECTION_VIEWER_BOUNDARY } from './selection-preview.ts'

/** The owner protection columns 0104 adds to the accounting root. */
const PROTECTION_COLUMNS = [
  'protection_applicability',
  'protection_operations',
  'protection_roles',
  'protected_concurrency',
  'protected_spend_usd',
  'protection_declared_at',
  'protection_valid_until',
]

/** Whether `fn`'s installed body calls `callee`: the replaced 0104 body, not only a function of the same signature. */
const bodyCalls = (fn: string, callee: string) =>
  `EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure('${fn}') AND position('${callee}' IN p.prosrc) > 0)`

/**
 * Everything the contribution routes promise (R2, F02), required by these routes AND by /ready with contributions on
 * (app.ts), one predicate so the two cannot drift:
 * - 0094: the write entry and the owner's projection;
 * - 0100: the rebuild funding guard (INC01-COHERENT-WRITE-003), without which a rebuilt contributed task runs unbound;
 * - 0104: owner protection and account qualification (A56): the refusal, the views, the qualification table, the
 *   protection columns, and the replaced update and owner's projection that use them; 0094's update refuses a
 *   protection patch;
 * - 0105: the atomic contributed admission (persistence's shared catalog proof: its claim table, lineage holds,
 *   dispatch funding and checked facts), which no 0104 or 0106 object implies;
 * - 0106: the selection preview's viewer boundary.
 */
export const API_CONTRIBUTIONS_SCHEMA = `SELECT to_regprocedure('sophia.api_contribution_write(text,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.api_contributions_mine()') IS NOT NULL
  AND to_regprocedure('sophia.contribution_lineage_unbound(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.account_protection_refusal(jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.account_protection_view(sophia.api_accounts)') IS NOT NULL
  AND to_regprocedure('sophia.account_qualification_view(sophia.api_connections,timestamptz)') IS NOT NULL
  AND to_regclass('sophia.api_account_qualifications') IS NOT NULL
  AND (SELECT count(*) FROM pg_catalog.pg_attribute WHERE attrelid = to_regclass('sophia.api_accounts')
    AND attname IN (${PROTECTION_COLUMNS.map((c) => `'${c}'`).join(', ')}) AND NOT attisdropped) = ${String(PROTECTION_COLUMNS.length)}
  AND ${bodyCalls('sophia.api_account_update(uuid,bigint,jsonb)', 'account_protection_refusal')}
  AND ${bodyCalls('sophia.api_contributions_mine()', 'account_protection_view')}
  AND ${ATOMIC_ADMISSION_INSTALLED}
  AND ${SELECTION_VIEWER_BOUNDARY} AS ok`

/** A path id as A48 declares it. Not the shared lowercase pattern, which legacy routes keep. */
const pathUuid = { type: 'string', format: 'uuid' } as const

/** The one spelling of a path id the schema has accepted: its last 36 characters (no prefix), lowercase. */
const pathId = (id: string): string => id.slice(-36).toLowerCase()

const idParams = (name: string) =>
  ({ type: 'object', additionalProperties: false, properties: { [name]: pathUuid }, required: [name] }) as const

const projectParams = idParams('projectId')

const taskParams = {
  type: 'object',
  additionalProperties: false,
  properties: { projectId: pathUuid, taskId: pathUuid },
  required: ['projectId', 'taskId'],
} as const

/**
 * Whether everything above is installed, checked before any route reaches SQL: remembered once seen (a migration is
 * never undone under a running API; an online rollback after a success is not detected).
 */
function installation(pool: pg.Pool): () => Promise<void> {
  let installed = false
  return async () => {
    if (installed) return
    let ok = false
    try {
      const { rows } = await pool.query<{ ok: boolean }>(API_CONTRIBUTIONS_SCHEMA)
      ok = rows[0]?.ok === true
    } catch (err) {
      throw new DomainError('unavailable', 'Database unavailable', { cause: err })
    }
    if (!ok)
      throw new DomainError('projection_unavailable', 'Member API contributions are not installed on this database')
    installed = true
  }
}

const response = (status: number, schema: string) => ({ [status]: { $ref: `${schema}#` } })

/** One HTTP write: its method, path, path parameter, body schema, success status and receipt, and its operation. */
interface WriteRoute {
  readonly method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  readonly url: string
  /** The path parameter merged into the request under the same name, or null. */
  readonly param: 'accountId' | 'connectionId' | 'grantId' | 'projectId' | null
  /** The request body schema, or null for a write without a body (clearing a pin). */
  readonly body: string | null
  readonly status: 200 | 201
  readonly receipt: string
  readonly operation: ContributionWrite
}

const GRANTS = '/api/v1/api-contribution-grants/:grantId'
const WRITES: readonly WriteRoute[] = [
  {
    method: 'POST',
    url: '/api/v1/me/api-accounts',
    param: null,
    body: 'ApiAccountCreateRequest',
    status: 201,
    receipt: 'ApiAccountReceipt',
    operation: 'account_create',
  },
  {
    method: 'PATCH',
    url: '/api/v1/me/api-accounts/:accountId',
    param: 'accountId',
    body: 'ApiAccountUpdateRequest',
    status: 200,
    receipt: 'ApiAccountReceipt',
    operation: 'account_update',
  },
  {
    method: 'POST',
    url: '/api/v1/me/api-connections',
    param: null,
    body: 'ApiConnectionCreateRequest',
    status: 201,
    receipt: 'ApiConnectionReceipt',
    operation: 'connection_create',
  },
  {
    method: 'POST',
    url: '/api/v1/me/api-connections/:connectionId/state',
    param: 'connectionId',
    body: 'ApiConnectionStateRequest',
    status: 200,
    receipt: 'ApiConnectionReceipt',
    operation: 'connection_state',
  },
  {
    method: 'POST',
    url: '/api/v1/me/api-connections/:connectionId/grants',
    param: 'connectionId',
    body: 'ApiContributionGrantCreateRequest',
    status: 201,
    receipt: 'ApiContributionGrantReceipt',
    operation: 'grant_create',
  },
  {
    method: 'PATCH',
    url: GRANTS,
    param: 'grantId',
    body: 'ApiContributionGrantUpdateRequest',
    status: 200,
    receipt: 'ApiContributionGrantReceipt',
    operation: 'grant_update',
  },
  {
    method: 'POST',
    url: `${GRANTS}/state`,
    param: 'grantId',
    body: 'ApiContributionGrantStateRequest',
    status: 200,
    receipt: 'ApiContributionGrantReceipt',
    operation: 'grant_state',
  },
  {
    method: 'POST',
    url: `${GRANTS}/admin-disable`,
    param: 'grantId',
    body: 'ApiContributionAdminDisableRequest',
    status: 200,
    receipt: 'ApiContributionGrantReceipt',
    operation: 'admin_disable',
  },
  {
    method: 'POST',
    url: `${GRANTS}/admin-lift`,
    param: 'grantId',
    body: 'ApiContributionAdminLiftRequest',
    status: 200,
    receipt: 'ApiContributionGrantReceipt',
    operation: 'admin_lift',
  },
  {
    method: 'POST',
    url: `${GRANTS}/admin-narrow`,
    param: 'grantId',
    body: 'ApiContributionAdminNarrowRequest',
    status: 200,
    receipt: 'ApiContributionGrantReceipt',
    operation: 'admin_narrow',
  },
  {
    method: 'PUT',
    url: '/api/v1/projects/:projectId/research-funding',
    param: 'projectId',
    body: 'ResearchFundingPinRequest',
    status: 200,
    receipt: 'ResearchFundingPin',
    operation: 'pin_set',
  },
  {
    method: 'DELETE',
    url: '/api/v1/projects/:projectId/research-funding',
    param: 'projectId',
    body: null,
    status: 200,
    receipt: 'ResearchFundingPin',
    operation: 'pin_clear',
  },
]

type WriteRequest = {
  Params: Record<string, string>
  Headers: { 'idempotency-key': string }
  Body: Record<string, unknown> | undefined
}

/** Register one write: schema-checked, the actor from the token, path ids merged in, through the idempotent entry. */
function writeRoute(app: FastifyInstance, pool: pg.Pool, ready: () => Promise<void>, w: WriteRoute): void {
  app.route<WriteRequest>({
    method: w.method,
    url: w.url,
    schema: {
      ...(w.param ? { params: idParams(w.param) } : {}),
      headers: idempotencyHeader,
      ...(w.body ? { body: { $ref: `${w.body}#` } } : {}),
      response: response(w.status, w.receipt),
    },
    handler: async (req, reply) => {
      await ready()
      const request: Record<string, unknown> = { ...req.body }
      if (w.param) request[w.param] = pathId(String(req.params[w.param]))
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        contributionWrite(c, w.operation, req.headers['idempotency-key'], request),
      )
      return reply.status(w.status).send(receipt)
    },
  })
}

/** The three reads: the caller's own records, a project member's view, and a task's funding. */
function readRoutes(app: FastifyInstance, pool: pg.Pool, ready: () => Promise<void>): void {
  app.get('/api/v1/me/api-resources', { schema: { response: response(200, 'MyApiResources') } }, async (req) => {
    await ready()
    return withActor(pool, req.actorId, 'read', readMyContributions)
  })
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/api-contributions',
    { schema: { params: projectParams, response: response(200, 'ProjectApiContributionList') } },
    async (req) => {
      await ready()
      return withActor(pool, req.actorId, 'read', (c) => readProjectContributions(c, pathId(req.params.projectId)))
    },
  )
  app.get<{ Params: { projectId: string; taskId: string } }>(
    '/api/v1/projects/:projectId/research-tasks/:taskId/funding',
    { schema: { params: taskParams, response: response(200, 'ResearchTaskFunding') } },
    async (req) => {
      await ready()
      return withActor(pool, req.actorId, 'read', (c) =>
        readResearchTaskFunding(c, pathId(req.params.projectId), pathId(req.params.taskId)),
      )
    },
  )
}

export function apiContributionRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  const ready = installation(pool)
  readRoutes(app, pool, ready)
  for (const w of WRITES) writeRoute(app, pool, ready, w)
}
