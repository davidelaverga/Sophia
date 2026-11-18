// A61: actor-owned enrollment/management and a disjoint capability-only host channel. No native credentials.
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { isSecret, helloRefusal, secretDigest, type HostHello } from '@sophia/coordination/owner-host-channel'
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

// Shared by the always-mounted host authentication query and readiness, independent of enrollment/new-work flags.
const ADMISSION_FUNCTION = 'sophia.owner_host_admission_allowed'
const ADMISSION_SIGNATURE = `${ADMISSION_FUNCTION}(bytea)`
export const OWNER_HOST_SCHEMA = `SELECT CASE WHEN has_schema_privilege('sophia', 'USAGE') THEN
  to_regprocedure('${ADMISSION_SIGNATURE}') IS NOT NULL
  AND coalesce(has_function_privilege(to_regprocedure('${ADMISSION_SIGNATURE}'), 'EXECUTE'), false)
  ELSE false END AS ok`

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
export async function authenticateOwnerHost(
  req: FastifyRequest,
  pool: pg.Pool,
  control: ServiceControl,
): Promise<void> {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')?.[1]
  if (!token) throw new DomainError('forbidden', 'Owner host refused')
  const { rows } = await withService(
    pool,
    (c) => c.query<{ allowed: boolean }>(`SELECT ${ADMISSION_FUNCTION}($1::bytea) AS allowed`, [secretDigest(token)]),
    control,
  )
  if (rows.length !== 1 || typeof rows[0]?.allowed !== 'boolean')
    throw new DomainError('unavailable', 'Owner host request refused')
  if (!rows[0].allowed) throw new DomainError('forbidden', 'Owner host refused')
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

type Lane = 'public' | 'verify' | 'owner' | 'host'
interface Admission {
  lane: Lane
  control: ServiceControl
  expired: boolean
  handling: boolean
  release(): void
  settled(): void
  responded(): void
  abandon(): void
}
type Unverified = 'public' | 'verify'
type Rates = Record<Unverified, Map<string, { epoch: number; count: number }>>
function closeUnfinishedBody(req: FastifyRequest, reply: FastifyReply): void {
  const close = () => {
    if (!req.raw.complete) req.raw.destroy()
  }
  reply.raw.once('finish', close)
  reply.raw.once('close', close)
}
function expireRates(rates: Rates, epoch: number): void {
  for (const map of Object.values(rates)) for (const [ip, entry] of map) if (entry.epoch !== epoch) map.delete(ip)
}
function takeRate(rates: Rates, lane: Unverified, ip: string): void {
  const epoch = Math.floor(Date.now() / 60_000)
  expireRates(rates, epoch)
  const map = rates[lane],
    entry = map.get(ip) ?? { epoch, count: 0 }
  const total = (rates.public.get(ip)?.count ?? 0) + (rates.verify.get(ip)?.count ?? 0)
  if (total >= 120 || (lane === 'public' && entry.count >= 16) || (!map.has(ip) && map.size >= 512))
    throw new DomainError('unavailable', 'Owner host request refused')
  entry.count++
  map.set(ip, entry)
}
/** Fixed disjoint capacity. Authentication is work, not proof of an authenticated reservation. */
export function ownerHostAdmission() {
  const admitted = new WeakMap<FastifyRequest, Admission>()
  const active = { public: 0, verify: 0, owner: 0, host: 0 }
  const limits = { public: 4, verify: 4, owner: 12, host: 12 }
  const live = { public: new Map<string, number>(), verify: new Map<string, number>() }
  const rates = {
    public: new Map<string, { epoch: number; count: number }>(),
    verify: new Map<string, { epoch: number; count: number }>(),
  }
  const begin = (req: FastifyRequest, reply: FastifyReply) => {
    if (!isOwnerHostRoute(req)) return
    reply.header('cache-control', 'no-store')
    // Includes refused bodies; these must not form an uncounted waiting queue.
    closeUnfinishedBody(req, reply)
    const lane = req.routeOptions.url === REDEEM_ROUTE ? 'public' : 'verify'
    if (active[lane] >= limits[lane] || (live[lane].get(req.ip) ?? 0) >= 2)
      throw new DomainError('unavailable', 'Owner host request refused')
    takeRate(rates, lane, req.ip)
    active[lane]++
    live[lane].set(req.ip, (live[lane].get(req.ip) ?? 0) + 1)
    const state = admissionState(req, reply, lane, () => {
      active[state.lane]--
      if (state.lane === 'public' || state.lane === 'verify') {
        const ips = live[state.lane],
          left = (ips.get(req.ip) ?? 1) - 1
        if (left) ips.set(req.ip, left)
        else ips.delete(req.ip)
      }
      admitted.delete(req)
      capabilities.delete(req)
      req.body = undefined
    })
    admitted.set(req, state)
    if (req.raw.destroyed || reply.raw.destroyed) state.abandon()
  }
  const methods = admissionMethods(admitted)
  const promote = (req: FastifyRequest, lane: 'owner' | 'host') => {
    methods.assert(req)
    const state = admitted.get(req)
    if (!state || state.lane !== 'verify' || active[lane] >= limits[lane])
      throw new DomainError('unavailable', 'Owner host request refused')
    active[lane]++
    active.verify--
    const left = (live.verify.get(req.ip) ?? 1) - 1
    if (left) live.verify.set(req.ip, left)
    else live.verify.delete(req.ip)
    state.lane = lane
  }
  return { begin, promote, ...methods }
}
/** Own disconnects at admission, including before body parsing. Running work retains the slot until its finally. */
function admissionState(req: FastifyRequest, reply: FastifyReply, lane: Lane, released: () => void): Admission {
  const controller = new AbortController()
  let releasing = false
  let finished = false
  let responseDone = false
  const finish = () => {
    if (
      finished ||
      !releasing ||
      state.handling ||
      !(req.raw.complete || req.raw.readableEnded || req.raw.destroyed) ||
      !(responseDone || reply.raw.writableFinished || reply.raw.destroyed)
    )
      return
    finished = true
    clearTimeout(timer)
    unwatch()
    req.raw.removeListener('end', finish)
    req.raw.removeListener('close', finish)
    reply.raw.removeListener('finish', responseFinished)
    reply.raw.removeListener('close', responseFinished)
    released()
  }
  const state: Admission = {
    lane,
    control: { signal: controller.signal, deadline: performance.now() + 10_000 },
    expired: false,
    handling: false,
    abandon() {
      state.expired = true
      controller.abort()
      state.release()
    },
    release() {
      releasing = true
      finish()
    },
    settled: finish,
    responded() {
      responseDone = true
      state.release()
    },
  }
  const responseFinished = () => state.responded()
  req.raw.on('end', finish)
  req.raw.on('close', finish)
  reply.raw.on('finish', responseFinished)
  reply.raw.on('close', responseFinished)
  const timer = setTimeout(() => {
    state.abandon()
    if (reply.sent && !reply.raw.writableFinished) reply.raw.destroy()
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
    if (!isOwnerHostRoute(req)) return
    const state = admitted.get(req)
    if (!state || state.expired || state.control.signal.aborted || performance.now() >= state.control.deadline)
      throw new DomainError('unavailable', 'Owner host request refused')
  }
  const finish = (req: FastifyRequest) => {
    const state = admitted.get(req)
    state?.responded()
  }
  const authorize = async <T>(req: FastifyRequest, call: () => Promise<T>): Promise<T> => {
    const state = admitted.get(req)
    if (state) state.handling = true
    try {
      return await call()
    } finally {
      if (state) {
        state.handling = false
        state.settled()
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
      state.handling = false
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
