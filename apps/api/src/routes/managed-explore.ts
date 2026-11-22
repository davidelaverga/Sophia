import type {
  ManagedExploreApprovalRequest,
  ManagedExploreDirectionSelection,
  ManagedExplorePreviewRequest,
  ManagedExploreStartRequest,
  ManagedExploreTurnRequest,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { hasOnlyLocalPrototypeResources } from '@sophia/design'
import {
  admitManagedExploreTurn,
  approveManagedExploreVersion,
  issueManagedExplorePreview,
  readManagedExploreEntry,
  readManagedExploreHandoff,
  type ManagedExploreRetainedEntry,
  resolveManagedExplorePreviewEntry,
  readManagedExplorePreflight,
  readManagedExploreSession,
  selectManagedExploreDirection,
  startManagedExplore,
  withActor,
  withoutActor,
} from '@sophia/persistence'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type pg from 'pg'
import type { ByteStore } from '../byte-store.ts'
import { readRetainedPrototype } from '../retained-prototype.ts'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

export const MANAGED_EXPLORE_SCHEMA = `SELECT
  to_regprocedure('sophia.read_managed_explore_preflight(uuid,uuid,bigint,boolean)') IS NOT NULL
  AND to_regprocedure('sophia.start_managed_explore(uuid,uuid,bigint,text,text)') IS NOT NULL
  AND to_regprocedure('sophia.read_managed_explore_session(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.admit_managed_explore_turn(uuid,uuid,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.select_managed_explore_direction(uuid,uuid,text,uuid,bigint,bigint)') IS NOT NULL
  AND to_regprocedure('sophia.read_managed_explore_entry(uuid,uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.issue_managed_explore_preview(uuid,uuid,uuid,text,text,text)') IS NOT NULL
  AND to_regprocedure('sophia.resolve_managed_explore_preview(text)') IS NOT NULL
  AND to_regprocedure('sophia.mark_managed_explore_preview_served(text)') IS NOT NULL
  AND to_regprocedure('sophia.approve_managed_explore_version(uuid,uuid,text,uuid,text,bigint,text[])') IS NOT NULL
  AND to_regprocedure('sophia.read_managed_explore_handoff(uuid,uuid,uuid)') IS NOT NULL
  AS ok`

const base = '/api/v1/projects/:projectId/explore'
const uuid = { type: 'string', pattern: UUID_PATTERN } as const
const sessionParams = {
  ...projectParams,
  properties: { ...projectParams.properties, sessionId: uuid },
  required: [...projectParams.required, 'sessionId'],
} as const
const preflightQuery = {
  type: 'object',
  additionalProperties: false,
  properties: { seedEntryId: uuid, expectedSeedRevision: { type: 'string', pattern: '^[1-9][0-9]{0,15}$' } },
  required: ['seedEntryId', 'expectedSeedRevision'],
} as const
const schemaRef = (name: string) => ({ $ref: `${name}#` })
const write = (params: object, body: string, response: string, status = 202) => ({
  params,
  headers: idempotencyHeader,
  body: schemaRef(body),
  response: { [status]: schemaRef(response) },
})

interface ProjectPath {
  projectId: string
}

interface SessionPath extends ProjectPath {
  sessionId: string
}

interface ExploreHeaders {
  'idempotency-key': string
}

interface Deps {
  pool: pg.Pool
  store: ByteStore | null
  admissions: boolean
  previewOrigin?: string
  studioOrigins?: readonly string[]
}

function noStore(reply: FastifyReply): void {
  reply.header('cache-control', 'private, no-store')
}

function requireAdmissions(admissions: boolean): void {
  if (!admissions) throw new DomainError('unavailable', 'Managed Explore is unavailable')
}

function admissionRoutes(app: FastifyInstance, { pool, admissions }: Deps): void {
  app.get<{ Params: ProjectPath; Querystring: { seedEntryId: string; expectedSeedRevision: string } }>(
    `${base}/preflight`,
    {
      schema: {
        params: projectParams,
        querystring: preflightQuery,
        response: { 200: schemaRef('ManagedExplorePreflight') },
      },
    },
    async (req, reply) => {
      noStore(reply)
      const { seedEntryId, expectedSeedRevision } = req.query
      const revision = Number(expectedSeedRevision)
      if (!Number.isSafeInteger(revision)) throw new DomainError('invalid_request', 'Invalid saved brief revision')
      return withActor(pool, req.actorId, 'read', (c) =>
        readManagedExplorePreflight(c, req.params.projectId, seedEntryId, revision, admissions),
      )
    },
  )

  app.post<{ Params: ProjectPath; Headers: ExploreHeaders; Body: ManagedExploreStartRequest }>(
    `${base}/sessions`,
    { schema: write(projectParams, 'ManagedExploreStartRequest', 'ManagedExploreStartReceipt') },
    async (req, reply) => {
      noStore(reply)
      requireAdmissions(admissions)
      const result = await withActor(pool, req.actorId, 'write', (c) =>
        startManagedExplore(c, req.params.projectId, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(result)
    },
  )

  app.post<{ Params: SessionPath; Headers: ExploreHeaders; Body: ManagedExploreTurnRequest }>(
    `${base}/sessions/:sessionId/turns`,
    { schema: write(sessionParams, 'ManagedExploreTurnRequest', 'ManagedExploreTurnReceipt') },
    async (req, reply) => {
      noStore(reply)
      requireAdmissions(admissions)
      const { projectId, sessionId } = req.params
      const result = await withActor(pool, req.actorId, 'write', (c) =>
        admitManagedExploreTurn(c, projectId, sessionId, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(result)
    },
  )
}

export function managedExploreRoutes(app: FastifyInstance, deps: Deps): void {
  const preview = previewOrigin(deps.previewOrigin, deps.studioOrigins ?? [])
  void app.register((scoped, _opts, done) => {
    scoped.setErrorHandler((err, req, reply) => {
      if (!(err instanceof DomainError) || err.code !== 'not_found') throw err
      return reply.status(404).send({
        code: 'not_found',
        message: 'Managed Explore target not found',
        retry: 'never',
        requestId: req.id,
      })
    })
    admissionRoutes(scoped, deps)
    sessionRoutes(scoped, deps.pool)
    retentionRoutes(scoped, deps, preview)
    done()
  })
}

function sessionRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Params: SessionPath }>(
    `${base}/sessions/:sessionId`,
    { schema: { params: sessionParams, response: { 200: schemaRef('ManagedExploreSession') } } },
    async (req, reply) => {
      noStore(reply)
      const { projectId, sessionId } = req.params
      return withActor(pool, req.actorId, 'read', (c) => readManagedExploreSession(c, projectId, sessionId))
    },
  )

  app.post<{ Params: SessionPath; Headers: ExploreHeaders; Body: ManagedExploreDirectionSelection }>(
    `${base}/sessions/:sessionId/direction-selection`,
    { schema: write(sessionParams, 'ManagedExploreDirectionSelection', 'ManagedExploreRevision', 200) },
    async (req, reply) => {
      noStore(reply)
      const { projectId, sessionId } = req.params
      return withActor(pool, req.actorId, 'write', (c) =>
        selectManagedExploreDirection(c, projectId, sessionId, req.headers['idempotency-key'], req.body),
      )
    },
  )
}

function previewOrigin(value: string | undefined, studioOrigins: readonly string[]): URL | null {
  if (value === undefined) return null
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.origin !== value ||
    studioOrigins.some((origin) => new URL(origin).hostname === url.hostname)
  )
    throw new Error('Managed Explore preview requires a distinct HTTPS content origin')
  return url
}

const withTarget = (name: string) => ({
  ...sessionParams,
  properties: { ...sessionParams.properties, [name]: uuid },
  required: [...sessionParams.required, name],
})

function retentionRoutes(app: FastifyInstance, { pool, store }: Deps, preview: URL | null): void {
  app.post<{
    Params: SessionPath & { versionId: string }
    Headers: ExploreHeaders
    Body: ManagedExplorePreviewRequest
  }>(
    `${base}/sessions/:sessionId/versions/:versionId/preview-permits`,
    { schema: write(withTarget('versionId'), 'ManagedExplorePreviewRequest', 'ManagedExplorePreviewPermit', 200) },
    async (req, reply) => {
      noStore(reply)
      if (!preview || req.hostname.toLowerCase() === preview.hostname) {
        throw new DomainError('unavailable', 'Managed Explore preview is unavailable')
      }
      const { projectId, sessionId, versionId } = req.params
      const entry = await withActor(pool, req.actorId, 'read', (c) =>
        readManagedExploreEntry(c, projectId, sessionId, versionId),
      )
      await readRetainedEntry(entry, store)
      const { token, ...lease } = await withActor(pool, req.actorId, 'write', (c) =>
        issueManagedExplorePreview(c, { projectId, sessionId, versionId }, req.headers['idempotency-key'], req.body),
      )
      return { ...lease, url: new URL(`/v1/previews/${token}/index.html`, preview).href }
    },
  )

  app.post<{ Params: SessionPath; Headers: ExploreHeaders; Body: ManagedExploreApprovalRequest }>(
    `${base}/sessions/:sessionId/approvals`,
    { schema: write(sessionParams, 'ManagedExploreApprovalRequest', 'ManagedExploreApproval', 200) },
    async (req, reply) => {
      noStore(reply)
      const { projectId, sessionId } = req.params
      const entry = await withActor(pool, req.actorId, 'read', (c) =>
        readManagedExploreEntry(c, projectId, sessionId, req.body.prototypeVersionId),
      )
      await readRetainedEntry(entry, store)
      return withActor(pool, req.actorId, 'write', (c) =>
        approveManagedExploreVersion(c, projectId, sessionId, req.headers['idempotency-key'], req.body),
      )
    },
  )
  app.get<{ Params: SessionPath & { approvalId: string } }>(
    `${base}/sessions/:sessionId/handoff/:approvalId`,
    { schema: { params: withTarget('approvalId'), response: { 200: schemaRef('ManagedExploreHandoff') } } },
    async (req, reply) => {
      noStore(reply)
      const { projectId, sessionId, approvalId } = req.params
      return withActor(pool, req.actorId, 'read', (c) => readManagedExploreHandoff(c, projectId, sessionId, approvalId))
    },
  )
}

async function readRetainedEntry(entry: ManagedExploreRetainedEntry, store: ByteStore | null): Promise<Uint8Array> {
  const bytes = await readRetainedPrototype(entry, store)
  if (!hasOnlyLocalPrototypeResources(bytes)) {
    throw new DomainError('invalid_state', 'The exact retained prototype did not meet preview policy')
  }
  return bytes
}

/** For a distinct content-origin server. No member bearer or arbitrary path enters this reader. */
export function managedExplorePreviewReader(pool: pg.Pool, store: ByteStore | null) {
  return async (token: string) => {
    const entry = await withoutActor(pool, (c) => resolveManagedExplorePreviewEntry(c, token))
    if (!entry) return null
    const { text, expiresAt, entrySha256, byteLength } = entry
    const bytes = await readRetainedEntry(entry, store)
    // Fetching the store may take time. Recheck current scope before passing its bytes to the content handler.
    if (text === null && !(await withoutActor(pool, (c) => resolveManagedExplorePreviewEntry(c, token)))) return null
    return { expiresAt, entrySha256, byteLength, bytes }
  }
}
