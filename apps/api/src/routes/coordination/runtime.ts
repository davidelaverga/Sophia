// The source reviewer's runtime operations (WBC-02, amendment A12): authenticated like the research operations (the
// runtime capability in app.ts, then the lease and a source-review binding in SQL), fenced by the work's current
// authority except settle. Its model calls reserve and settle through the shared research accounting.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type pg from 'pg'
import type {
  ResearchReserveRequest,
  ResearchSettleRequest,
  ReviewContextRequest,
  ReviewSubmitRequest,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  runtimeReviewContext,
  runtimeReviewReserve,
  runtimeReviewSettle,
  runtimeReviewSubmit,
  withService,
  type RuntimeCaller,
} from '@sophia/persistence'

/** The review routes a runtime capability may call; app.ts adds them to the runtime routes. */
export const REVIEW_RUNTIME_ROUTES: readonly string[] = [
  '/v1/runtime/review/context',
  '/v1/runtime/review/reserve',
  '/v1/runtime/review/settle',
  '/v1/runtime/review/submit',
]

const runtimeHeaders = {
  type: 'object',
  properties: {
    'x-sophia-runtime-unit': { type: 'string', minLength: 1, maxLength: 160 },
    'x-sophia-bridge-instance': { type: 'string', minLength: 1, maxLength: 64 },
    'x-sophia-bridge-protocol': { type: 'string', enum: ['1'] },
  },
  required: ['x-sophia-runtime-unit', 'x-sophia-bridge-instance', 'x-sophia-bridge-protocol'],
} as const

/** A review submit carries at most 16 KiB of report and forty findings, which JSON escaping can grow. */
const REVIEW_BODY_LIMIT = 256 * 1024

function callerOf(req: FastifyRequest): RuntimeCaller {
  if (!req.runtimeCaller) throw new DomainError('runtime_capability_required', 'Runtime capability required')
  return req.runtimeCaller
}

const review = (body: string, response: string) => ({
  bodyLimit: REVIEW_BODY_LIMIT,
  schema: { headers: runtimeHeaders, body: { $ref: `${body}#` }, response: { 200: { $ref: `${response}#` } } },
})

export function reviewRuntimeRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.post<{ Body: ReviewContextRequest }>(
    '/v1/runtime/review/context',
    review('ReviewContextRequest', 'ReviewContextReply'),
    async (req) => withService(pool, (c) => runtimeReviewContext(c, callerOf(req), req.body)),
  )
  app.post<{ Body: ResearchReserveRequest }>(
    '/v1/runtime/review/reserve',
    review('ResearchReserveRequest', 'ResearchReservation'),
    async (req) => withService(pool, (c) => runtimeReviewReserve(c, callerOf(req), req.body)),
  )
  app.post<{ Body: ResearchSettleRequest }>(
    '/v1/runtime/review/settle',
    review('ResearchSettleRequest', 'ResearchSettlement'),
    async (req) => withService(pool, (c) => runtimeReviewSettle(c, callerOf(req), req.body)),
  )
  app.post<{ Body: ReviewSubmitRequest }>(
    '/v1/runtime/review/submit',
    review('ReviewSubmitRequest', 'ReviewSubmission'),
    async (req) => withService(pool, (c) => runtimeReviewSubmit(c, callerOf(req), req.body)),
  )
}
