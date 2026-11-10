// Owner-host enrollment and the owner-host channel (INC01-CC-003 S1a, migration 0093; docs/plans/owner-host-transport.md).
// Three callers, each through its own 0093 functions and never the tables:
//   * the owner (sophia_api, inside withActor): pairs a host of their own, lists, retires and revokes their hosts;
//   * the host (sophia_api, no actor): redeems a pairing and serves the channel, authenticated by its capability;
//   * the worker (sophia_worker): finds the active host of an owner runner, queues exchanges, reads and settles them.
// A pairing code is made here and returned once; a host capability is made on the host. Only their SHA-256 reaches
// the database, and neither is ever logged or returned again. No route mounts the host functions yet.
import type pg from 'pg'
import {
  newSecret,
  PAIRING_TTL_MAX_SECONDS,
  secretDigest,
  type AnswerResult,
  type Delivered,
  type EnqueueResult,
  type ExchangeStore,
  type ExchangeView,
  type GoResult,
  type HelloResult,
  type HostChannel,
  type HostHello,
  type SettleResult,
} from '@sophia/coordination/owner-host-channel'
import type { RunnerAnswer, RunObservation } from '@sophia/coordination/runner-port'
import { classifyDbError } from './errors.ts'
import { onlyRow } from './rows.ts'

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>

const wrap = async <T>(p: Promise<T>): Promise<T> => {
  try {
    return await p
  } catch (err) {
    throw classifyDbError(err)
  }
}

async function call<T>(db: Queryable, sql: string, params: unknown[], name: string): Promise<T> {
  const { rows } = await wrap(db.query<{ r: T }>(sql, params))
  return onlyRow(rows, name).r
}

// ---- the owner (sophia_api, inside withActor) ----

export interface OwnerHostPairing {
  pairingId: string
  expiresAt: string
  /** Shown to the owner once, to give to their host. Not stored anywhere. */
  code: string
}

/** A one-use pairing for one of the actor's own linked connections, expiring within ten minutes. */
export async function createOwnerHostPairing(
  c: pg.PoolClient,
  connectionId: string,
  ttlSeconds = PAIRING_TTL_MAX_SECONDS,
): Promise<OwnerHostPairing> {
  const code = newSecret()
  const r = await call<{ pairingId: string; expiresAt: string }>(
    c,
    'SELECT sophia.owner_host_create_pairing($1, $2, $3) AS r',
    [connectionId, secretDigest(code), ttlSeconds],
    'owner_host_create_pairing',
  )
  return { pairingId: r.pairingId, expiresAt: r.expiresAt, code }
}

export const revokeOwnerHostPairing = (c: pg.PoolClient, pairingId: string) =>
  call<{ result: 'revoked' | 'consumed'; hostId?: string }>(
    c,
    'SELECT sophia.owner_host_revoke_pairing($1) AS r',
    [pairingId],
    'owner_host_revoke_pairing',
  )

/** No new work through this host; its journal's operations stay observable and stoppable through it. */
export const retireOwnerHost = (c: pg.PoolClient, hostId: string) =>
  call<{ result: 'retired'; fenced: number }>(
    c,
    'SELECT sophia.owner_host_retire($1) AS r',
    [hostId],
    'owner_host_retire',
  )

/** The capability is dead. Operations bound to its journal keep their state: this settles nothing. */
export const revokeOwnerHost = (c: pg.PoolClient, hostId: string) =>
  call<{ result: 'revoked'; fenced: number }>(
    c,
    'SELECT sophia.owner_host_revoke($1) AS r',
    [hostId],
    'owner_host_revoke',
  )

export interface OwnerHostView {
  hostId: string
  connectionId: string
  state: 'bound' | 'active' | 'retired' | 'revoked'
  environmentRef: string | null
  profileId: string | null
  profileRevision: number | null
  helloOk: boolean
  helloConflict: string | null
  createdAt: string
  boundAt: string | null
  lastSeenAt: string | null
}
export interface OwnerHostPairingView {
  pairingId: string
  connectionId: string
  expiresAt: string
  consumed: boolean
  revoked: boolean
}

/** The actor's own hosts and pairings: no code, hash or capability. */
export const listOwnerHosts = (c: pg.PoolClient) =>
  call<{ hosts: OwnerHostView[]; pairings: OwnerHostPairingView[] }>(
    c,
    'SELECT sophia.owner_host_list() AS r',
    [],
    'owner_host_list',
  )

// ---- the host (sophia_api, no actor; authenticated by its capability) ----

export type RedeemResult =
  | { result: 'bound'; hostId: string; ownerId: string; connectionId: string; replayed: boolean }
  | { result: 'refused'; reason: string }

/**
 * Redeem a pairing code with a capability the host generated. A lost reply is retried with the SAME code and
 * capability: it answers `bound` with the same host (replayed), never a second host.
 */
export const redeemOwnerHostPairing = (pool: pg.Pool, code: string, capability: string) =>
  call<RedeemResult>(
    pool,
    'SELECT sophia.owner_host_redeem($1, $2) AS r',
    [secretDigest(code), secretDigest(capability)],
    'owner_host_redeem',
  )

/** The host's side of the channel over the database (in tests; later behind a route). */
export class DbHostChannel implements HostChannel {
  private readonly pool: pg.Pool
  private readonly capability: Buffer

  constructor(pool: pg.Pool, capability: string) {
    this.pool = pool
    this.capability = secretDigest(capability)
  }

  hello(hello: HostHello): Promise<HelloResult> {
    return call(
      this.pool,
      'SELECT sophia.owner_host_hello($1, $2) AS r',
      [this.capability, JSON.stringify(hello)],
      'hello',
    )
  }

  poll(limit: number, redeliverSeconds: number): Promise<Delivered[]> {
    return call(
      this.pool,
      'SELECT sophia.owner_host_poll($1, $2, $3) AS r',
      [this.capability, limit, redeliverSeconds],
      'poll',
    )
  }

  async go(exchangeId: string): Promise<GoResult> {
    const r = await call<{ result: 'go' } | { result: 'denied'; reason: string; grantedBefore?: boolean }>(
      this.pool,
      'SELECT sophia.owner_host_go($1, $2) AS r',
      [this.capability, exchangeId],
      'go',
    )
    // Anything but an explicit grant is no GO (fail closed); a grant counted before is reported as such.
    return r.result === 'go'
      ? { result: 'go' }
      : { result: 'denied', reason: r.reason, grantedBefore: r.grantedBefore === true }
  }

  answer(exchangeId: string, answer: RunnerAnswer | RunObservation): Promise<AnswerResult> {
    return call(
      this.pool,
      'SELECT sophia.owner_host_answer($1, $2, $3) AS r',
      [this.capability, exchangeId, JSON.stringify(answer)],
      'answer',
    )
  }
}

// ---- the worker (sophia_worker) ----

export interface OwnerHostRunner {
  hostId: string
  journalId: string
  accountKey: string
  profileId: string
  profileRevision: number
  t3Namespace: string
}

/** The active host of one owner runner, with its bound identity, or null. */
export const ownerHostRunner = (pool: pg.Pool, ownerId: string, environmentRef: string) =>
  call<OwnerHostRunner | null>(
    pool,
    'SELECT sophia.owner_host_runner($1, $2) AS r',
    [ownerId, environmentRef],
    'owner_host_runner',
  )

/** The worker's side of the channel over the database. */
export class DbExchangeStore implements ExchangeStore {
  private readonly pool: pg.Pool

  constructor(pool: pg.Pool) {
    this.pool = pool
  }

  enqueue(input: Parameters<ExchangeStore['enqueue']>[0]): Promise<EnqueueResult> {
    return call(
      this.pool,
      'SELECT sophia.owner_host_enqueue($1, $2, $3, $4, $5, $6, $7) AS r',
      [
        input.ownerId,
        input.environmentRef,
        input.journalId,
        input.request.kind,
        input.key,
        JSON.stringify(input.request),
        input.deadlineMs,
      ],
      'owner_host_enqueue',
    )
  }

  exchange(ownerId: string, exchangeId: string): Promise<ExchangeView | null> {
    return call(
      this.pool,
      'SELECT sophia.owner_host_exchange($1, $2) AS r',
      [ownerId, exchangeId],
      'owner_host_exchange',
    )
  }

  settle(ownerId: string, exchangeId: string): Promise<SettleResult> {
    return call(this.pool, 'SELECT sophia.owner_host_settle($1, $2) AS r', [ownerId, exchangeId], 'owner_host_settle')
  }
}

/** Bounded cleanup: never-granted exchanges past their deadline lapse; old finished reads go. Sends are kept. */
export const maintainOwnerHosts = (pool: pg.Pool, limit = 100) =>
  call<number>(pool, 'SELECT sophia.owner_host_maintain($1) AS r', [limit], 'owner_host_maintain')
