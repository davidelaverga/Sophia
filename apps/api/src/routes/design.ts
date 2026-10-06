// The runtime design and review operations (SDD-01, amendment A12, db/migrations/0039–0040): the native designer's
// and the separate visual reviewer's tools reach these routes through the dsh bridge. They authenticate like research's
// (the runtime capability, then the binding, in SQL). A source is checked with @sophia/design and a render compiled in
// the persistence layer, inside the operation's transaction. An inspection reads the captures' bytes from the byte
// store here and checks each against the hash the service recorded before it is sent: the model sees exactly the
// pixels the renderer produced, or nothing. Only then is the delivery issued (0043), and the captures count as seen once
// the runtime acknowledges that it saved them for its model (`…/delivered`), not when they were asked for.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type pg from 'pg'
import type {
  DesignCaptureImage,
  DesignCaptureReply,
  DesignCaptureRequest,
  DesignContextRequest,
  DesignDeliveryAck,
  DesignPatchRequest,
  DesignRecordRequest,
  DesignRenderRequest,
  DesignRenderResultRequest,
  DesignSubmitRequest,
  DesignWriteRequest,
  ResearchReserveRequest,
  ResearchSettleRequest,
  ReviewSubmitRequest,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  designCaptureRefs,
  designDelivered,
  issueDesignDelivery,
  runtimeDesignContext,
  runtimeDesignRecord,
  runtimeDesignRender,
  runtimeDesignRenderResult,
  runtimeDesignReserve,
  runtimeDesignSettle,
  runtimeDesignSource,
  runtimeDesignSubmit,
  runtimeReviewContext,
  runtimeReviewSubmit,
  withService,
  type DesignCaptureLocation,
  type RuntimeCaller,
} from '@sophia/persistence'
import { storedKey, type ByteStore } from '../byte-store.ts'
import { sha256Hex } from '../s3-sign.ts'

/** The routes a runtime capability may call for design and review (app.ts checks them by exact route). */
export const DESIGN_ROUTES: readonly string[] = [
  '/v1/runtime/design/context',
  '/v1/runtime/design/record',
  '/v1/runtime/design/source',
  '/v1/runtime/design/patch',
  '/v1/runtime/design/render',
  '/v1/runtime/design/render-result',
  '/v1/runtime/design/capture',
  '/v1/runtime/design/delivered',
  '/v1/runtime/design/reserve',
  '/v1/runtime/design/settle',
  '/v1/runtime/design/submit',
  '/v1/runtime/review/context',
  '/v1/runtime/review/capture',
  '/v1/runtime/review/delivered',
  '/v1/runtime/review/submit',
]

/** A source write carries up to 640 KiB of HTML and CSS, which JSON escaping can grow. */
const SOURCE_BODY_LIMIT = 4 * 1024 * 1024
const BODY_LIMIT = 1024 * 1024

const runtimeHeaders = {
  type: 'object',
  properties: {
    'x-sophia-runtime-unit': { type: 'string', minLength: 1, maxLength: 160 },
    'x-sophia-bridge-instance': { type: 'string', minLength: 1, maxLength: 64 },
    'x-sophia-bridge-protocol': { type: 'string', enum: ['1'] },
  },
  required: ['x-sophia-runtime-unit', 'x-sophia-bridge-instance', 'x-sophia-bridge-protocol'],
} as const

interface Deps {
  pool: pg.Pool
  store: ByteStore | null
}

function callerOf(req: FastifyRequest): RuntimeCaller {
  if (!req.runtimeCaller) throw new DomainError('runtime_capability_required', 'Runtime capability required')
  return req.runtimeCaller
}

const schema = (body: string, response: string, bodyLimit = BODY_LIMIT) => ({
  bodyLimit,
  schema: { headers: runtimeHeaders, body: { $ref: `${body}#` }, response: { 200: { $ref: `${response}#` } } },
})

/** One capture's bytes from the store, checked against its record. */
async function captureBytes(store: ByteStore | null, projectId: string, capture: DesignCaptureLocation) {
  const path = capture.storageKey.replace(/^objects\//, '')
  if (!store || capture.storageKey !== storedKey(projectId, capture.sourceId)) {
    throw new DomainError('unavailable', 'This capture has no stored bytes')
  }
  let bytes: Uint8Array
  try {
    bytes = await store.get(path)
  } catch (err) {
    throw new DomainError('unavailable', 'The report store did not answer', { cause: err })
  }
  if (sha256Hex(bytes) !== capture.sha256)
    throw new DomainError('unavailable', 'A stored capture does not match its record')
  return bytes
}

/** The project a capture's storage key names (objects/<project>/<source>). */
const projectOf = (capture: DesignCaptureLocation) => capture.storageKey.split('/')[1] ?? ''

/** The captures an inspection hands over, with their checked bytes. */
async function inspect(deps: Deps, req: FastifyRequest<{ Body: DesignCaptureRequest }>, role: 'design' | 'review') {
  const refs = await withService(deps.pool, (c) => designCaptureRefs(c, callerOf(req), role, req.body))
  const captures: DesignCaptureImage[] = []
  for (const capture of refs.captures) {
    const bytes = await captureBytes(deps.store, projectOf(capture), capture)
    const { storageKey: _key, sourceId: _source, ...shown } = capture
    captures.push({ ...shown, mime: 'image/png', data: Buffer.from(bytes).toString('base64') })
  }
  // Issued only now, every byte checked, under the work's authority checked again after the read.
  const named = captures.map((c) => ({ name: c.name, sha256: c.sha256 }))
  const delivery = await withService(deps.pool, (c) =>
    issueDesignDelivery(c, callerOf(req), role, { ...req.body, renderJobId: refs.renderJobId, captures: named }),
  )
  const reply: DesignCaptureReply = { renderJobId: refs.renderJobId, deliveryId: delivery.deliveryId, captures }
  return reply
}

function designerRoutes(app: FastifyInstance, deps: Deps): void {
  const { pool } = deps
  app.post<{ Body: DesignContextRequest }>(
    '/v1/runtime/design/context',
    schema('DesignContextRequest', 'DesignContextReply'),
    async (req) => withService(pool, (c) => runtimeDesignContext(c, callerOf(req), req.body)),
  )
  app.post<{ Body: DesignRecordRequest }>(
    '/v1/runtime/design/record',
    schema('DesignRecordRequest', 'DesignRecord'),
    async (req) => withService(pool, (c) => runtimeDesignRecord(c, callerOf(req), req.body)),
  )
  app.post<{ Body: DesignWriteRequest }>(
    '/v1/runtime/design/source',
    schema('DesignWriteRequest', 'DesignSourceReply', SOURCE_BODY_LIMIT),
    async (req) => withService(pool, (c) => runtimeDesignSource(c, callerOf(req), { kind: 'write', ...req.body })),
  )
  app.post<{ Body: DesignPatchRequest }>(
    '/v1/runtime/design/patch',
    schema('DesignPatchRequest', 'DesignSourceReply', SOURCE_BODY_LIMIT),
    async (req) => withService(pool, (c) => runtimeDesignSource(c, callerOf(req), { kind: 'patch', ...req.body })),
  )
  app.post<{ Body: DesignRenderRequest }>(
    '/v1/runtime/design/render',
    schema('DesignRenderRequest', 'DesignRender'),
    async (req) => withService(pool, (c) => runtimeDesignRender(c, callerOf(req), req.body)),
  )
  app.post<{ Body: DesignRenderResultRequest }>(
    '/v1/runtime/design/render-result',
    schema('DesignRenderResultRequest', 'DesignRender'),
    async (req) => withService(pool, (c) => runtimeDesignRenderResult(c, callerOf(req), req.body)),
  )
  app.post<{ Body: DesignCaptureRequest }>(
    '/v1/runtime/design/capture',
    schema('DesignCaptureRequest', 'DesignCaptureReply'),
    async (req) => inspect(deps, req, 'design'),
  )
  app.post<{ Body: DesignDeliveryAck }>(
    '/v1/runtime/design/delivered',
    schema('DesignDeliveryAck', 'DesignDeliveryReceipt'),
    async (req) => withService(pool, (c) => designDelivered(c, callerOf(req), 'design', req.body)),
  )
  app.post<{ Body: DesignSubmitRequest }>(
    '/v1/runtime/design/submit',
    schema('DesignSubmitRequest', 'DesignSubmission'),
    async (req) => withService(pool, (c) => runtimeDesignSubmit(c, callerOf(req), req.body)),
  )
}

function sharedRoutes(app: FastifyInstance, deps: Deps): void {
  const { pool } = deps
  app.post<{ Body: ResearchReserveRequest }>(
    '/v1/runtime/design/reserve',
    schema('ResearchReserveRequest', 'ResearchReservation'),
    async (req) => withService(pool, (c) => runtimeDesignReserve(c, callerOf(req), req.body)),
  )
  app.post<{ Body: ResearchSettleRequest }>(
    '/v1/runtime/design/settle',
    schema('ResearchSettleRequest', 'ResearchSettlement'),
    async (req) => withService(pool, (c) => runtimeDesignSettle(c, callerOf(req), req.body)),
  )
}

function reviewerRoutes(app: FastifyInstance, deps: Deps): void {
  const { pool } = deps
  app.post<{ Body: DesignContextRequest }>(
    '/v1/runtime/review/context',
    schema('DesignContextRequest', 'ReviewContextReply'),
    async (req) => withService(pool, (c) => runtimeReviewContext(c, callerOf(req), req.body)),
  )
  app.post<{ Body: DesignCaptureRequest }>(
    '/v1/runtime/review/capture',
    schema('DesignCaptureRequest', 'DesignCaptureReply'),
    async (req) => inspect(deps, req, 'review'),
  )
  app.post<{ Body: DesignDeliveryAck }>(
    '/v1/runtime/review/delivered',
    schema('DesignDeliveryAck', 'DesignDeliveryReceipt'),
    async (req) => withService(pool, (c) => designDelivered(c, callerOf(req), 'review', req.body)),
  )
  app.post<{ Body: ReviewSubmitRequest }>(
    '/v1/runtime/review/submit',
    schema('ReviewSubmitRequest', 'ReviewSubmission'),
    async (req) => withService(pool, (c) => runtimeReviewSubmit(c, callerOf(req), req.body)),
  )
}

export function designRoutes(app: FastifyInstance, deps: Deps): void {
  designerRoutes(app, deps)
  sharedRoutes(app, deps)
  reviewerRoutes(app, deps)
}
