// The render runner's endpoints (SMC-M03 S5a part 2, amendment A11, db/migrations/0030). The supervisor on the
// renderer host holds only a render runner capability. It claims a job under a lease, fetches each file of the
// job's source package here (the API reads inline text or the byte store and checks every byte against the
// package's hash), uploads the PDF here once, and settles with the kernel's receipt. No storage URL or key, and no
// database credential, ever reaches the renderer host.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type pg from 'pg'
import type { RenderClaimRequest, RenderLease, RenderSettleRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  rendererCaptureSlot,
  rendererClaim,
  rendererFile,
  rendererHeartbeat,
  rendererOutputSlot,
  rendererRecordCapture,
  rendererRecordOutput,
  rendererSettle,
  withService,
} from '@sophia/persistence'
import { ByteStoreError, objectPath, storedKey, WriteClaimError, type ByteStore } from '../byte-store.ts'
import { sha256Hex } from '../s3-sign.ts'

/** Exact routes that take a render runner capability instead of a member token. */
export const RENDERER_ROUTES: ReadonlySet<string> = new Set([
  '/v1/renderer/claim',
  '/v1/renderer/jobs/:jobId/heartbeat',
  '/v1/renderer/jobs/:jobId/file',
  '/v1/renderer/jobs/:jobId/output',
  '/v1/renderer/jobs/:jobId/settle',
  '/v1/renderer/jobs/:jobId/captures/:name',
])

/** The largest PDF a render may upload (the service's own bound, 0030). */
export const RENDER_OUTPUT_LIMIT = 32 * 1024 * 1024
/** The largest PNG a capture may upload (the service's own bound, 0039). */
export const CAPTURE_OUTPUT_LIMIT = 8 * 1024 * 1024
/** A capture's receipt names every block's measures (at most 1 MiB, 0039); a PDF's is far smaller. */
const SETTLE_BODY_LIMIT = 1280 * 1024
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

const jobParams = {
  type: 'object',
  properties: { jobId: { type: 'string', pattern: UUID } },
  required: ['jobId'],
} as const
const leaseHeaders = {
  type: 'object',
  properties: { 'x-sophia-render-lease': { type: 'string', pattern: UUID } },
  required: ['x-sophia-render-lease'],
} as const
const captureParams = {
  type: 'object',
  properties: {
    jobId: { type: 'string', pattern: UUID },
    name: { type: 'string', pattern: '^[a-z0-9][a-z0-9.-]{0,150}\\.png$' },
  },
  required: ['jobId', 'name'],
} as const
const fileQuery = {
  type: 'object',
  additionalProperties: false,
  properties: { path: { type: 'string', minLength: 1, maxLength: 512 } },
  required: ['path'],
} as const

/** The formats a claim names; undefined (a PDF runner) when its body names none. */
function formatsOf(body: unknown): string[] | undefined {
  if (typeof body !== 'object' || body === null || !('formats' in body) || !Array.isArray(body.formats))
    return undefined
  const formats = body.formats.filter((f): f is string => f === 'pdf' || f === 'png')
  if (formats.length !== body.formats.length || formats.length === 0) {
    throw new DomainError('invalid_request', 'A runner renders pdf, png or both')
  }
  return formats
}

/** The capability's hash, set by the authentication hook on RENDERER_ROUTES only. */
function tokenOf(req: FastifyRequest): Buffer {
  if (!req.rendererToken) throw new DomainError('runtime_capability_required', 'Render runner capability required')
  return req.rendererToken
}

const leaseOf = (req: FastifyRequest): string => {
  const value = req.headers['x-sophia-render-lease']
  return typeof value === 'string' ? value : ''
}

interface Deps {
  pool: pg.Pool
  store: ByteStore | null
}

/** One file's bytes: inline text, or the byte store's object, checked against the hash the package recorded. */
async function fileBytes(
  deps: Deps,
  req: FastifyRequest<{ Params: { jobId: string }; Querystring: { path: string } }>,
) {
  const file = await withService(deps.pool, (c) =>
    rendererFile(c, tokenOf(req), req.params.jobId, leaseOf(req), req.query.path),
  )
  let bytes: Uint8Array
  if (file.text !== null) bytes = Buffer.from(file.text, 'utf8')
  else {
    if (file.storageKey !== storedKey(file.projectId, file.sourceId) || !deps.store) {
      throw new DomainError('unavailable', 'This file has no stored bytes')
    }
    try {
      bytes = await deps.store.get(objectPath(file.projectId, file.sourceId))
    } catch (err) {
      throw new DomainError('unavailable', 'The report store did not answer', { cause: err })
    }
  }
  if (sha256Hex(bytes) !== file.sha256) throw new DomainError('unavailable', 'A stored file does not match its record')
  return bytes
}

/**
 * Why an upload was not stored, in the runner's terms: a key written before (409; never one a fresh slot names), the
 * database that keeps the write claims (nothing was sent to the store), or the store itself.
 * @param err what the byte store's put threw
 */
function storeFailure(err: unknown): DomainError {
  if (err instanceof WriteClaimError) {
    return new DomainError('unavailable', 'The database did not answer the write claim', { cause: err })
  }
  if (err instanceof ByteStoreError && err.status === 409) {
    return new DomainError('invalid_state', 'This output was already written', { cause: err })
  }
  return new DomainError('unavailable', 'The report store did not answer', { cause: err })
}

/** Store an uploaded PDF once under a new source of the job's project, then record it as the job's output. */
async function storeOutput(deps: Deps, req: FastifyRequest<{ Params: { jobId: string }; Body: unknown }>) {
  const bytes = req.body
  if (!Buffer.isBuffer(bytes) || bytes.byteLength < 5 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new DomainError('invalid_request', 'A render output is a PDF')
  }
  if (!deps.store) throw new DomainError('unavailable', 'The report store is not set up')
  const token = tokenOf(req)
  const lease = leaseOf(req)
  const slot = await withService(deps.pool, (c) => rendererOutputSlot(c, token, req.params.jobId, lease))
  try {
    await deps.store.put(objectPath(slot.projectId, slot.sourceId), bytes, 'application/pdf')
  } catch (err) {
    throw storeFailure(err)
  }
  const output = { sourceId: slot.sourceId, sha256: sha256Hex(bytes), byteLength: bytes.byteLength }
  return withService(deps.pool, (c) => rendererRecordOutput(c, token, req.params.jobId, lease, output))
}

/** Store one uploaded PNG of a capture job once under a new source of the job's project, then record it by name. */
async function storeCapture(
  deps: Deps,
  req: FastifyRequest<{ Params: { jobId: string; name: string }; Body: unknown }>,
) {
  const bytes = req.body
  if (!Buffer.isBuffer(bytes) || bytes.byteLength < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new DomainError('invalid_request', 'A capture is a PNG')
  }
  if (!deps.store) throw new DomainError('unavailable', 'The report store is not set up')
  const token = tokenOf(req)
  const lease = leaseOf(req)
  const { jobId, name } = req.params
  const slot = await withService(deps.pool, (c) => rendererCaptureSlot(c, token, jobId, lease, name))
  try {
    await deps.store.put(objectPath(slot.projectId, slot.sourceId), bytes, 'image/png')
  } catch (err) {
    throw storeFailure(err)
  }
  const capture = { name, sourceId: slot.sourceId, sha256: sha256Hex(bytes), byteLength: bytes.byteLength }
  return withService(deps.pool, (c) => rendererRecordCapture(c, token, jobId, lease, capture))
}

/** The claim and the capture uploads (A12): a runner names its formats, and a capture job uploads PNGs by name. */
function captureRoutes(app: FastifyInstance, deps: Deps): void {
  app.addContentTypeParser('image/png', { parseAs: 'buffer', bodyLimit: CAPTURE_OUTPUT_LIMIT }, (_req, body, done) => {
    done(null, body)
  })
  // A runner names the formats it renders (A12); one that sends no body is a PDF runner and never gets a capture.
  app.post<{ Body: RenderClaimRequest | undefined }>(
    '/v1/renderer/claim',
    { schema: { response: { 200: { $ref: 'RenderClaim#' } } } },
    async (req) => ({
      job: await withService(deps.pool, (c) => rendererClaim(c, tokenOf(req), formatsOf(req.body))),
    }),
  )
  app.put<{ Params: { jobId: string; name: string }; Body: unknown }>(
    '/v1/renderer/jobs/:jobId/captures/:name',
    {
      bodyLimit: CAPTURE_OUTPUT_LIMIT,
      schema: { params: captureParams, headers: leaseHeaders, response: { 200: { $ref: 'RenderCaptureOutput#' } } },
    },
    async (req) => storeCapture(deps, req),
  )
}

export function rendererRoutes(app: FastifyInstance, deps: Deps): void {
  app.addContentTypeParser(
    'application/pdf',
    { parseAs: 'buffer', bodyLimit: RENDER_OUTPUT_LIMIT },
    (_req, body, done) => {
      done(null, body)
    },
  )
  captureRoutes(app, deps)
  app.post<{ Params: { jobId: string }; Body: RenderLease }>(
    '/v1/renderer/jobs/:jobId/heartbeat',
    { schema: { params: jobParams, body: { $ref: 'RenderLease#' }, response: { 200: { $ref: 'RenderHeartbeat#' } } } },
    async (req) =>
      withService(deps.pool, (c) => rendererHeartbeat(c, tokenOf(req), req.params.jobId, req.body.leaseToken)),
  )
  app.get<{ Params: { jobId: string }; Querystring: { path: string } }>(
    '/v1/renderer/jobs/:jobId/file',
    { schema: { params: jobParams, headers: leaseHeaders, querystring: fileQuery } },
    async (req, reply) => {
      const bytes = await fileBytes(deps, req)
      void reply
        .header('content-type', 'application/octet-stream')
        .header('cache-control', 'no-store')
        .header('x-content-type-options', 'nosniff')
      return reply.send(Buffer.from(bytes))
    },
  )
  app.put<{ Params: { jobId: string }; Body: unknown }>(
    '/v1/renderer/jobs/:jobId/output',
    {
      bodyLimit: RENDER_OUTPUT_LIMIT,
      schema: { params: jobParams, headers: leaseHeaders, response: { 200: { $ref: 'RenderOutput#' } } },
    },
    async (req) => storeOutput(deps, req),
  )
  app.post<{ Params: { jobId: string }; Body: RenderSettleRequest }>(
    '/v1/renderer/jobs/:jobId/settle',
    {
      bodyLimit: SETTLE_BODY_LIMIT,
      schema: {
        params: jobParams,
        body: { $ref: 'RenderSettleRequest#' },
        response: { 200: { $ref: 'RenderSettlement#' } },
      },
    },
    async (req) =>
      withService(deps.pool, (c) =>
        rendererSettle(c, tokenOf(req), req.params.jobId, req.body.leaseToken, req.body.receipt),
      ),
  )
}
