// A61: actor-owned enrollment/management and a disjoint capability-only host channel. No native credentials.
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { isSecret, helloRefusal, type HostHello } from '@sophia/coordination/owner-host-channel'
import {
  createOwnerHostPairing,
  revokeOwnerHostPairing,
  listOwnerHosts,
  retireOwnerHost,
  revokeOwnerHost,
  redeemOwnerHostPairing,
  DbHostChannel,
  withActor,
  withService,
  type ServiceControl,
} from '@sophia/persistence'
import type { RunnerAnswer, RunObservation, RunnerCollection } from '@sophia/coordination/runner-port'

export const REDEEM_ROUTE = '/api/v1/owner-host/redeem'
export const HOST_ROUTES: ReadonlySet<string> = new Set([
  '/api/v1/owner-host/hello',
  '/api/v1/owner-host/poll',
  '/api/v1/owner-host/exchanges/:exchangeId/go',
  '/api/v1/owner-host/exchanges/:exchangeId/answer',
])
const OWNER_ROUTES = new Set([
  '/api/v1/owner-host-pairings',
  '/api/v1/owner-host-pairings/:pairingId/revoke',
  '/api/v1/owner-hosts',
  '/api/v1/owner-hosts/:hostId/retire',
  '/api/v1/owner-hosts/:hostId/revoke',
])
export const isOwnerHostRoute = (req: FastifyRequest): boolean => {
  const route = req.routeOptions.url ?? ''
  return route === REDEEM_ROUTE || HOST_ROUTES.has(route) || OWNER_ROUTES.has(route)
}
const capabilities = new WeakMap<FastifyRequest, string>()
export function authenticateOwnerHost(req: FastifyRequest): void {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')?.[1]
  if (!token) throw new DomainError('forbidden', 'Owner host refused')
  capabilities.set(req, token)
}

/** Fixed safe diagnostics even for Fastify parsing/validation and database failures; no error cause is logged. */
function parsingStatus(err: unknown): unknown {
  if (typeof err !== 'object' || err === null) return undefined
  if ('validation' in err) return 422
  return 'statusCode' in err ? err.statusCode : undefined
}
export function ownerHostError(err: unknown, reply: FastifyReply): FastifyReply {
  if (reply.sent) return reply
  const candidate = err instanceof DomainError ? err.status : parsingStatus(err)
  const status =
    typeof candidate === 'number' && [400, 401, 403, 409, 413, 415, 422, 429].includes(candidate) ? candidate : 503
  return reply
    .header('cache-control', 'no-store')
    .status(status)
    .send({
      code: status === 503 ? 'unavailable' : 'owner_host_refused',
      message: 'Owner host request refused',
      retry: status === 503 ? 'same_admission_key' : 'never',
    })
}

interface Admission {
  control: ServiceControl
  expired: boolean
  handling: boolean
  release(): void
  abandon(): void
}
/** Per-app bounded concurrency and fixed-window per-address rate; no code/token is a rate key. */
export function ownerHostAdmission() {
  const admitted = new WeakMap<FastifyRequest, Admission>()
  const addresses = new Map<string, { until: number; count: number }>()
  let active = 0
  const begin = (req: FastifyRequest, reply: FastifyReply) => {
    if (!isOwnerHostRoute(req)) return
    reply.header('cache-control', 'no-store')
    const now = Date.now()
    for (const [ip, entry] of addresses) if (entry.until <= now) addresses.delete(ip)
    const entry = addresses.get(req.ip) ?? { until: now + 60_000, count: 0 }
    if (active >= 32 || entry.count >= 120 || (!addresses.has(req.ip) && addresses.size >= 1024))
      throw new DomainError('unavailable', 'Owner host request refused')
    entry.count++
    addresses.set(req.ip, entry)
    active++
    const state = admissionState(req, reply, () => {
      active--
      admitted.delete(req)
      capabilities.delete(req)
      req.body = undefined
    })
    admitted.set(req, state)
    if (req.raw.destroyed || reply.raw.destroyed) state.abandon()
  }
  return { begin, ...admissionMethods(admitted) }
}
/** Own disconnects at admission, including before body parsing. Running work retains the slot until its finally. */
function admissionState(req: FastifyRequest, reply: FastifyReply, released: () => void): Admission {
  const controller = new AbortController()
  let releasing = false
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    unwatch()
    req.raw.removeListener('end', finish)
    req.raw.removeListener('close', finish)
    released()
  }
  const state: Admission = {
    control: { signal: controller.signal, deadline: performance.now() + 10_000 },
    expired: false,
    handling: false,
    abandon() {
      state.expired = true
      controller.abort()
      if (!state.handling) state.release()
    },
    release() {
      if (releasing) return
      releasing = true
      if (req.raw.complete || req.raw.destroyed) finish()
      else {
        req.raw.once('end', finish)
        req.raw.once('close', finish)
      }
    },
  }
  const timer = setTimeout(() => {
    state.abandon()
    if (!reply.sent) ownerHostError(undefined, reply)
    if (!req.raw.complete) req.raw.destroy()
  }, 10_000)
  timer.unref()
  const unwatch = watchDisconnect(req, reply, () => state.abandon())
  return state
}
function watchDisconnect(req: FastifyRequest, reply: FastifyReply, abandon: () => void): () => void {
  const requestClosed = () => {
    if (!req.raw.complete) abandon()
  }
  const responseClosed = () => {
    if (!reply.raw.writableFinished) abandon()
  }
  req.raw.once('aborted', abandon)
  req.raw.once('close', requestClosed)
  reply.raw.once('close', responseClosed)
  return () => {
    req.raw.removeListener('aborted', abandon)
    req.raw.removeListener('close', requestClosed)
    reply.raw.removeListener('close', responseClosed)
  }
}
function admissionMethods(admitted: WeakMap<FastifyRequest, Admission>) {
  const assert = (req: FastifyRequest) => {
    if (isOwnerHostRoute(req) && admitted.get(req)?.expired !== false)
      throw new DomainError('unavailable', 'Owner host request refused')
  }
  const finish = (req: FastifyRequest) => {
    const state = admitted.get(req)
    if (state && !state.handling) state.release()
  }
  const authorize = async <T>(req: FastifyRequest, call: () => Promise<T>): Promise<T> => {
    const state = admitted.get(req)
    if (state) state.handling = true
    try {
      return await call()
    } finally {
      if (state) {
        state.handling = false
        if (state.expired) state.release()
      }
    }
  }
  const handle = async (req: FastifyRequest, call: () => Promise<unknown>) => {
    assert(req)
    const state = admitted.get(req)
    if (!state) throw new DomainError('unavailable', 'Owner host request refused')
    state.handling = true
    try {
      return await call()
    } finally {
      state.release()
    }
  }
  const control = (req: FastifyRequest): ServiceControl => {
    assert(req)
    const state = admitted.get(req)
    if (!state) throw new DomainError('unavailable', 'Owner host refused')
    return state.control
  }
  return { assert, finish, handle, authorize, control }
}

interface Deps {
  pool: pg.Pool
  enrollment: boolean
  admission: ReturnType<typeof ownerHostAdmission>
}
const options = (body?: string, params?: string): RouteShorthandOptions => ({
  logLevel: 'silent',
  bodyLimit: 65_536,
  schema: {
    ...(body ? { body: { $ref: body + '#' } } : {}),
    ...(params ? { params: { $ref: params + '#' } } : {}),
    querystring: { type: 'object', additionalProperties: false },
  },
})
function channel(req: FastifyRequest, pool: pg.Pool, control: ServiceControl): DbHostChannel {
  const capability = capabilities.get(req)
  if (!capability) throw new DomainError('forbidden', 'Owner host refused')
  return new DbHostChannel(boundedHostPool(pool, control), capability)
}
/** The frozen wrappers use only query(text, values). Scope each call to a bounded no-actor transaction. */
function boundedHostPool(pool: pg.Pool, control: ServiceControl): pg.Pool {
  return new Proxy(pool, {
    get(target, property): unknown {
      if (property === 'query')
        return (sql: string, values: unknown[]) =>
          withService(pool, (c) => c.query(sql, values), control).catch((err: unknown) => {
            // The frozen wrapper classifies raw query failures itself. Preserve only a pre-commit refusal's cause;
            // a COMMIT outcome_unknown must remain uncertain even when its underlying error has a refusal SQLSTATE.
            if (err instanceof DomainError && err.status < 500 && err.cause instanceof Error) throw err.cause
            throw err
          })
      return Reflect.get(target, property)
    },
  })
}
const enabled = (value: boolean) => {
  if (!value) throw new DomainError('forbidden', 'Owner host enrollment disabled')
}

export function ownerHostRoutes(app: FastifyInstance, d: Deps): void {
  app.addHook('onSend', (req, reply, payload, done) => {
    if (isOwnerHostRoute(req) && (typeof payload !== 'string' || Buffer.byteLength(payload, 'utf8') > 65_536)) {
      reply.code(503)
      done(
        null,
        JSON.stringify({
          code: 'unavailable',
          message: 'Owner host response unavailable',
          retry: 'same_admission_key',
        }),
      )
      return
    }
    done(null, payload)
  })
  app.addHook('onResponse', (req, _reply, done) => {
    d.admission.finish(req)
    done()
  })
  ownerManagementRoutes(app, d)
  hostChannelRoutes(app, d)
}
function ownerManagementRoutes(app: FastifyInstance, d: Deps): void {
  app.post<{ Body: { connectionId: string; ttlSeconds: number } }>(
    '/api/v1/owner-host-pairings',
    options('OwnerHostPairingRequest'),
    async (req) =>
      d.admission.handle(req, async () => {
        enabled(d.enrollment)
        return withActor(
          d.pool,
          req.actorId,
          'write',
          (c) => createOwnerHostPairing(c, req.body.connectionId, req.body.ttlSeconds),
          d.admission.control(req),
        )
      }),
  )
  app.post<{ Params: { pairingId: string } }>(
    '/api/v1/owner-host-pairings/:pairingId/revoke',
    options(undefined, 'OwnerHostPairingParams'),
    async (req) =>
      d.admission.handle(req, () =>
        withActor(
          d.pool,
          req.actorId,
          'write',
          (c) => revokeOwnerHostPairing(c, req.params.pairingId),
          d.admission.control(req),
        ),
      ),
  )
  app.get('/api/v1/owner-hosts', options(), async (req) =>
    d.admission.handle(req, () => withActor(d.pool, req.actorId, 'read', listOwnerHosts, d.admission.control(req))),
  )
  for (const action of ['retire', 'revoke'] as const)
    app.post<{ Params: { hostId: string } }>(
      `/api/v1/owner-hosts/:hostId/${action}`,
      options(undefined, 'OwnerHostParams'),
      async (req) =>
        d.admission.handle(req, () =>
          withActor(
            d.pool,
            req.actorId,
            'write',
            async (c) =>
              action === 'retire'
                ? await retireOwnerHost(c, req.params.hostId)
                : await revokeOwnerHost(c, req.params.hostId),
            d.admission.control(req),
          ),
        ),
    )
}
function hostChannelRoutes(app: FastifyInstance, d: Deps): void {
  app.post<{ Body: { code: string; capability: string } }>(
    REDEEM_ROUTE,
    options('OwnerHostRedeemRequest'),
    async (req) =>
      d.admission.handle(req, async () => {
        enabled(d.enrollment)
        if (!isSecret(req.body.code) || !isSecret(req.body.capability))
          throw new DomainError('invalid_request', 'Owner host refused')
        return redeemOwnerHostPairing(
          boundedHostPool(d.pool, d.admission.control(req)),
          req.body.code,
          req.body.capability,
        )
      }),
  )
  app.post<{ Body: HostHello }>('/api/v1/owner-host/hello', options('OwnerHostHello'), async (req) =>
    d.admission.handle(req, async () => {
      if (helloRefusal(req.body)) throw new DomainError('invalid_request', 'Owner host refused')
      return channel(req, d.pool, d.admission.control(req)).hello(req.body)
    }),
  )
  app.post<{ Body: { limit: number; redeliverSeconds: number } }>(
    '/api/v1/owner-host/poll',
    options('OwnerHostPollRequest'),
    async (req) =>
      d.admission.handle(req, () =>
        channel(req, d.pool, d.admission.control(req)).poll(req.body.limit, req.body.redeliverSeconds),
      ),
  )
  app.post<{ Params: { exchangeId: string } }>(
    '/api/v1/owner-host/exchanges/:exchangeId/go',
    options('OwnerHostEmpty', 'OwnerHostExchangeParams'),
    async (req) =>
      d.admission.handle(req, () => channel(req, d.pool, d.admission.control(req)).go(req.params.exchangeId)),
  )
  app.post<{ Params: { exchangeId: string }; Body: RunnerAnswer | RunObservation | RunnerCollection }>(
    '/api/v1/owner-host/exchanges/:exchangeId/answer',
    options('OwnerHostAnswer', 'OwnerHostExchangeParams'),
    async (req) =>
      d.admission.handle(req, () =>
        channel(req, d.pool, d.admission.control(req)).answer(req.params.exchangeId, req.body),
      ),
  )
}
