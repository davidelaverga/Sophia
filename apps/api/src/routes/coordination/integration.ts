// The Paperclip dsh adapter's routes (WBC-02, amendment A13): a run asks Sophia for an effect permit, starts the
// work's one attempt, observes it and reports a cancellation. They take the adapter's own capability (app.ts), never a
// member token and never a Paperclip token; the sophia.coordination_* functions check it against its company and
// decide everything else.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type pg from 'pg'
import type { CoordinationPermitRequest, CoordinationRunRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  coordinationCancel,
  coordinationObserve,
  coordinationPermit,
  coordinationStart,
  withService,
} from '@sophia/persistence'

/** The routes the adapter's capability may call, and nothing else may: checked by exact route in app.ts. */
export const COORDINATION_ROUTES: ReadonlySet<string> = new Set([
  '/v1/coordination/permit',
  '/v1/coordination/start',
  '/v1/coordination/observe',
  '/v1/coordination/cancel',
])

function tokenOf(req: FastifyRequest): Buffer {
  if (!req.coordinationToken)
    throw new DomainError('coordination_capability_required', 'Integration credential required')
  return req.coordinationToken
}

const route = (body: string, response: string) => ({
  bodyLimit: 16 * 1024,
  schema: { body: { $ref: `${body}#` }, response: { 200: { $ref: `${response}#` } } },
})

export function integrationRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.post<{ Body: CoordinationPermitRequest }>(
    '/v1/coordination/permit',
    route('CoordinationPermitRequest', 'CoordinationPermit'),
    async (req) => withService(pool, (c) => coordinationPermit(c, tokenOf(req), req.body)),
  )
  app.post<{ Body: CoordinationRunRequest }>(
    '/v1/coordination/start',
    route('CoordinationRunRequest', 'CoordinationStart'),
    async (req) => withService(pool, (c) => coordinationStart(c, tokenOf(req), req.body)),
  )
  app.post<{ Body: CoordinationRunRequest }>(
    '/v1/coordination/observe',
    route('CoordinationRunRequest', 'CoordinationObservation'),
    async (req) => withService(pool, (c) => coordinationObserve(c, tokenOf(req), req.body)),
  )
  app.post<{ Body: CoordinationRunRequest }>(
    '/v1/coordination/cancel',
    route('CoordinationRunRequest', 'CoordinationObservation'),
    async (req) => withService(pool, (c) => coordinationCancel(c, tokenOf(req), req.body)),
  )
}
