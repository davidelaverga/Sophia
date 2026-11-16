// Owner-host enrollment and the owner-host channel (INC01-CC-003 S1a, migration 0093), level: sql-run on real
// PostgreSQL with the production split: the owner and the host on sophia_api, the worker on sophia_worker. The end to end
// cases run the backend's own dispatcher (runnerDispatchOnce, 0092) through the owner-host port proxy and channel to an
// owner-host agent with the real RunnerGateway and a real fsynced, locked disk journal over a FAKE T3 transport.
// Every case counts native effects. The qualification rows are SYNTHETIC fixtures written by the migration owner:
// nothing here qualifies a real owner route, host, account, T3 install or provider.
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { OwnerHostAgent } from '@sophia/coordination/owner-host-agent'
import {
  exchangeRequest,
  helloRefusal,
  newSecret,
  secretDigest,
  type GoResult,
  type HostChannel,
  type HostHello,
} from '@sophia/coordination/owner-host-channel'
import { OwnerHostPortProxy } from '@sophia/coordination/owner-host-port-proxy'
import { FakeT3 } from '@sophia/coordination/runner-fake-t3'
import { RunnerGateway, type GatewayProfile } from '@sophia/coordination/runner-gateway'
import { RunnerJournal } from '@sophia/coordination/runner-journal'
import { launchCommandId, stableMessageId } from '@sophia/coordination/t3-port-mapping'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
// The backend's own dispatcher, unchanged (INC01-CC-002): the e2e drives it, it is not reimplemented here.
import { runnerDispatchOnce } from '../../../apps/worker/src/runner-dispatch.ts'
import {
  admitRunnerOperation,
  createOwnerHostPairing,
  createPool,
  DbExchangeStore,
  DbHostChannel,
  listOwnerHosts,
  maintainOwnerHosts,
  ownerHostRunner,
  redeemOwnerHostPairing,
  retireOwnerHost,
  revokeOwnerHost,
  readRunnerOperation,
  revokeOwnerHostPairing,
  withActor,
} from './index.ts'

const PIN = 'ade473018d32003658b7d38693e083ee2e314bd8'
/** SYNTHETIC source facts (0096): a requested base and a declared policy with one model and one effort option. */
const BASE = '0123456789abcdef0123456789abcdef01234567'
const POLICY = {
  v: 1,
  instanceId: 'claudeAgent',
  models: [{ model: 'synthetic-model', options: [{ id: 'effort', values: ['low', 'high'] }] }],
} as const
const SETTINGS = { instanceId: 'claudeAgent', model: 'synthetic-model', options: [{ id: 'effort', value: 'high' }] }
const NS = 'client:fake-session-1'
let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let owner: pg.Pool
const root = mkdtempSync(join(tmpdir(), 'sophia-owner-host-'))
const gateways: RunnerGateway[] = []

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 6 })
  worker = createPool(db.workerUrl, { max: 6 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 6 })
})
after(async () => {
  for (const g of gateways) g.close()
  await api.end()
  await worker.end()
  await owner.end()
  await db.drop()
  rmSync(root, { recursive: true, force: true })
})

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> => (await owner.query(sql, params)).rows[0] as T
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof Error && 'code' in err && err.name === 'DomainError' ? String(err.code) : `raw:${String(err)}`
  }
}
const op = (id: string) =>
  one<{ state: string; reason: string | null; native_thread_id: string | null; gateway_journal_id: string | null }>(
    `SELECT state, reason, native_thread_id, gateway_journal_id FROM sophia.owner_runner_operations WHERE id=$1`,
    [id],
  )
const exchanges = (operationId: string) =>
  owner
    .query<{ id: string; kind: string; state: string; go_count: number; reason: string | null; host_id: string }>(
      `SELECT id, kind, state, go_count, reason, host_id FROM sophia.owner_host_exchanges WHERE operation_id=$1 ORDER BY created_at`,
      [operationId],
    )
    .then((r) => r.rows)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** An owner with a linked connection, a synthetic qualified native resource, and a project to admit work in. */
async function world() {
  const who = randomUUID()
  const accountKey = `claude:${randomUUID()}`
  const p = await seedProject(db.ownerUrl, { admin: who })
  const connectionId = randomUUID()
  const resourceId = randomUUID()
  await owner.query(
    `INSERT INTO sophia.execution_connections(id, owner_id, upstream_origin, upstream_subject, state)
     VALUES ($1, $2, 'synthetic-owner-host', 'synthetic-account', 'linked')`,
    [connectionId, who],
  )
  await owner.query(
    `INSERT INTO sophia.executor_resources(project_id, id, owner_id, connection_id, harness, label, repository_root, state)
     VALUES ($1, $2, $3, $4, 'claude-native', 'Synthetic Claude Code', 'synthetic/repository', 'active')`,
    [p.projectId, resourceId, who, connectionId],
  )
  const qualified = await owner.query<{ id: string }>(
    `SELECT sophia.qualify_owner_runner($1, $2, $3, 'env-owner-1', 'project-sophia', 'read-only-v1', 1, 'gateway_enforced',
       $4, ARRAY['create','input','stop'], 50, now() + interval '1 day', 'synthetic fixture: not a live qualification') AS id`,
    [p.projectId, resourceId, PIN, accountKey],
  )
  await owner.query(`SELECT sophia.declare_owner_runner_source_policy($1, $2, $3)`, [
    p.projectId,
    qualified.rows[0]?.id,
    JSON.stringify(POLICY),
  ])
  const profile: GatewayProfile = {
    ownerId: who,
    environmentRef: 'env-owner-1',
    adapterPin: PIN,
    nativeProjectRefs: new Set(['project-sophia']),
    accountKey,
    profileId: 'read-only-v1',
    profileRevision: 1,
    operations: new Set(['create', 'input', 'stop'] as const),
    sourcePolicy: POLICY,
  }
  const runner = { ownerId: who, environmentRef: 'env-owner-1' }
  const create = () =>
    withActor(api, who, 'write', (c) =>
      admitRunnerOperation(c, p.projectId, randomUUID(), {
        kind: 'create',
        resourceId,
        goalId: p.goalId,
        title: 'Read-only qualification',
        message: 'Report the Ask admission boundary.',
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        sourceIds: [],
        baseCommit: BASE,
        writeScope: 'read_only',
        settings: SETTINGS,
      }),
    )
  const pair = () => withActor(api, who, 'write', (c) => createOwnerHostPairing(c, connectionId))
  return { ...p, who, accountKey, connectionId, resourceId, profile, runner, create, pair }
}
type World = Awaited<ReturnType<typeof world>>

/** An owner host: a capability made on the host, a redeemed pairing, a journal, a gateway over FakeT3, an agent. */
async function enroll(
  w: World,
  opts: { t3?: FakeT3; file?: string; capability?: string; channel?: (c: HostChannel) => HostChannel } = {},
) {
  const capability = opts.capability ?? newSecret()
  if (!opts.capability) {
    const pairing = await w.pair()
    const bound = await redeemOwnerHostPairing(api, pairing.code, capability)
    assert.equal(bound.result, 'bound')
  }
  const t3 = opts.t3 ?? new FakeT3(NS)
  const file = opts.file ?? join(root, `${randomUUID()}.jsonl`)
  const journal = new RunnerJournal(file)
  const gateway = new RunnerGateway({ journal, transport: t3, profile: w.profile })
  gateways.push(gateway)
  const hello: HostHello = {
    v: 1,
    journalId: journal.id,
    environmentRef: 'env-owner-1',
    adapterPin: PIN,
    profileId: 'read-only-v1',
    profileRevision: 1,
    accountKey: w.accountKey,
    t3Namespace: NS,
  }
  const base = new DbHostChannel(api, capability)
  const channel = opts.channel ? opts.channel(base) : base
  const agent = new OwnerHostAgent({ channel, gateway, journal, hello, redeliverSeconds: 1, log: () => undefined })
  await agent.greet()
  return { capability, t3, file, journal, gateway, channel, agent, hello }
}
type Host = Awaited<ReturnType<typeof enroll>>

/** The worker's port for the owner runner: the proxy over the database store, bound to a host's journal. */
async function proxyFor(w: World, journalId?: string, deadlineMs = 4000) {
  const found = await ownerHostRunner(worker, w.who, 'env-owner-1')
  return new OwnerHostPortProxy({
    store: new DbExchangeStore(worker),
    ownerId: w.who,
    environmentRef: 'env-owner-1',
    journalId: journalId ?? found?.journalId ?? randomUUID(),
    namespace: found?.t3Namespace ?? NS,
    deadlineMs,
    pollMs: 20,
  })
}

/**
 * One dispatcher pass, while the host serves (or doesn't) until the pass is done. `followups: false` leaves follow-ups
 * for a later pass (they are due only after a minute), so a host can go away between a send and its reconciliation.
 */
async function pass(w: World, port: OwnerHostPortProxy, host: Host | null, followups = true) {
  const state = { done: false }
  const result = runnerDispatchOnce(worker, {
    workerId: 'owner-host-test',
    runner: w.runner,
    port,
    sends: true,
    leaseSeconds: 60,
    followupMinAgeSeconds: followups ? 0 : 3600,
  }).finally(() => {
    state.done = true
  })
  if (host) {
    for (;;) {
      if (state.done) break
      await host.agent.serveOnce()
      await sleep(15)
    }
  }
  return result
}

describe('owner-host enrollment', () => {
  it('pairs once: the code is shown once, the replayed redemption answers the same host, a racing one loses', async () => {
    const w = await world()
    const pairing = await w.pair()
    assert.match(pairing.code, /^[A-Za-z0-9_-]{43}$/)
    const listed = await withActor(api, w.who, 'read', (c) => listOwnerHosts(c))
    assert.ok(!JSON.stringify(listed).includes(pairing.code))
    const [a, b] = [newSecret(), newSecret()]
    const raced = await Promise.all([
      redeemOwnerHostPairing(api, pairing.code, a),
      redeemOwnerHostPairing(api, pairing.code, b),
    ])
    assert.deepEqual(raced.map((r) => r.result).toSorted(), ['bound', 'refused'])
    const winner = raced[0]?.result === 'bound' ? a : b
    const first = raced.find((r) => r.result === 'bound')
    const replay = await redeemOwnerHostPairing(api, pairing.code, winner)
    assert.equal(replay.result, 'bound')
    assert.equal(
      replay.result === 'bound' && first?.result === 'bound'
        ? replay.hostId === first.hostId && replay.replayed
        : false,
      true,
    )
    assert.equal(
      (await one<{ n: number }>(`SELECT count(*)::int n FROM sophia.owner_hosts WHERE owner_id=$1`, [w.who])).n,
      1,
    )
    // Only hashes are stored.
    const stored = await one<{ t: string }>(
      `SELECT row_to_json(p)::text t FROM sophia.owner_host_pairings p WHERE id=$1`,
      [pairing.pairingId],
    )
    assert.ok(!stored.t.includes(pairing.code))
  })

  it('refuses another owner, a revoked pairing and a revoked connection', async () => {
    const w = await world()
    const stranger = randomUUID()
    assert.equal(
      await codeOf(withActor(api, stranger, 'write', (c) => createOwnerHostPairing(c, w.connectionId))),
      'forbidden',
    )
    const p = await w.pair()
    assert.equal(
      (await withActor(api, w.who, 'write', (c) => revokeOwnerHostPairing(c, p.pairingId))).result,
      'revoked',
    )
    assert.equal((await redeemOwnerHostPairing(api, p.code, newSecret())).result, 'refused')
    const q = await w.pair()
    await owner.query(`UPDATE sophia.execution_connections SET state='revoked' WHERE id=$1`, [w.connectionId])
    assert.equal((await redeemOwnerHostPairing(api, q.code, newSecret())).result, 'refused')
    assert.notEqual(await codeOf(w.pair()), 'resolved')
  })

  it('binds the hello once: a changed namespace or journal is a conflict, and nothing is served until it matches', async () => {
    const w = await world()
    const h = await enroll(w)
    const changed = await h.channel.hello({ ...h.hello, t3Namespace: 'client:another-sign-in' })
    assert.deepEqual(changed.result === 'conflict' ? changed.changed : [], ['t3Namespace'])
    assert.equal(await ownerHostRunner(worker, w.who, 'env-owner-1'), null, 'no new work through a conflicting host')
    const created = await w.create()
    const port = await proxyFor(w, h.journal.id)
    const p = await pass(w, port, null)
    assert.deepEqual(p.sent, ['refused'])
    assert.equal((await op(created.operationId)).state, 'denied')
    assert.equal(h.t3.calls.length, 0)
    assert.equal((await h.channel.hello(h.hello)).result, 'ok')
    assert.equal((await ownerHostRunner(worker, w.who, 'env-owner-1'))?.journalId, h.journal.id)
  })
})

describe('the owner-host path end to end', () => {
  it('sends a create once through the backend dispatcher, the proxy, the channel and the gateway', async () => {
    const w = await world()
    const h = await enroll(w)
    const created = await w.create()
    const port = await proxyFor(w)
    assert.equal(port.journalId, h.journal.id)
    const p = await pass(w, port, h)
    assert.deepEqual(p.sent, ['received'])
    const sent = await op(created.operationId)
    assert.equal(sent.state, 'received')
    assert.equal(sent.gateway_journal_id, h.journal.id)
    assert.equal(sent.native_thread_id, launchCommandId(NS, `sophia:${created.operationId}`))
    // The send, granted GO once; then, in the same pass, its follow-up: an observe, a read that needs no GO.
    assert.deepEqual(
      (await exchanges(created.operationId)).map((x) => [x.kind, x.state, x.go_count]),
      [
        ['send', 'answered', 1],
        ['observe', 'answered', 0],
      ],
    )
    // Followed up through the channel: observed, still running.
    await pass(w, port, h)
    assert.equal((await op(created.operationId)).state, 'received')
    for (const t of h.t3.threads.values()) for (const r of t.runs) h.t3.finishRun(r.runId)
    await pass(w, port, h)
    assert.equal((await op(created.operationId)).state, 'settled')
    assert.equal(h.t3.effects.launches, 1)
  })

  it('a create with a lost reply and a reconnect makes ONE native effect with a stable identity', async () => {
    const w = await world()
    const t3 = new FakeT3(NS)
    const h = await enroll(w, { t3 })
    const created = await w.create()
    const port = await proxyFor(w)
    t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    assert.deepEqual((await pass(w, port, h, false)).sent, ['unknown'])
    assert.equal((await op(created.operationId)).state, 'unknown')
    // The host process dies and comes back: same journal file, same capability, a new channel and agent.
    h.gateway.close()
    const back = await enroll(w, { t3, file: h.file, capability: h.capability })
    assert.equal(back.journal.id, h.journal.id)
    const p = await pass(w, port, back)
    assert.equal(p.reconciled, 1)
    const settled = await op(created.operationId)
    assert.equal(settled.state, 'received')
    assert.equal(settled.native_thread_id, launchCommandId(NS, `sophia:${created.operationId}`))
    assert.equal(t3.effects.launches, 1)
    assert.equal(t3.count('t3_thread_launch'), 1)
  })

  it('keeps a send whose answer never reached Sophia after GO unknown, then reconciles it from the journal', async () => {
    const w = await world()
    // Every answer is lost until the host comes back; redelivery and a renewed GO cannot get one through either.
    let drop = true
    const h = await enroll(w, {
      channel: (c) => ({
        hello: (x) => c.hello(x),
        poll: (l, r) => c.poll(l, r),
        go: (id) => c.go(id),
        answer: async (id, a) => {
          if (drop) throw new Error('the reply was lost on the way to Sophia')
          return c.answer(id, a)
        },
      }),
    })
    const created = await w.create()
    const port = await proxyFor(w, undefined, 1500)
    const first = await pass(w, port, h, false)
    assert.deepEqual(first.sent, ['unknown'], 'GO was granted: a send may have happened, never refused')
    assert.equal((await op(created.operationId)).state, 'unknown')
    const [send] = await exchanges(created.operationId)
    assert.ok(send && send.go_count >= 1 && send.state === 'lapsed')
    drop = false
    await pass(w, port, h)
    assert.equal((await op(created.operationId)).state, 'received')
    assert.equal(h.t3.effects.launches, 1)
  })

  it('recovers a lost answer by redelivery within the deadline: GO again, answered from the journal', async () => {
    const w = await world()
    let drop = 1
    const h = await enroll(w, {
      channel: (c) => ({
        hello: (x) => c.hello(x),
        poll: (l, r) => c.poll(l, r),
        go: (id) => c.go(id),
        answer: async (id, a) => {
          if (drop-- > 0) throw new Error('the reply was lost on the way to Sophia')
          return c.answer(id, a)
        },
      }),
    })
    const created = await w.create()
    const p = await pass(w, await proxyFor(w), h, false)
    assert.deepEqual(p.sent, ['received'])
    const [send] = await exchanges(created.operationId)
    assert.equal(send?.go_count, 2, 'GO was asked again, and rechecked, for the redelivery')
    assert.equal(h.t3.effects.launches, 1)
    assert.equal(h.t3.count('t3_thread_launch'), 1)
  })

  /** A create whose goal moves on at one point of the channel: before delivery, or between delivery and GO. */
  async function goalMovesOn(at: 'delivery' | 'go') {
    const w = await world()
    const bump = () =>
      owner.query(`UPDATE sophia.goals SET revision=revision+1 WHERE project_id=$1 AND id=$2`, [w.projectId, w.goalId])
    let moved = false
    const h = await enroll(w, {
      channel: (c) => ({
        hello: (x) => c.hello(x),
        poll: async (l, r) => {
          if (at === 'delivery' && !moved) {
            const queued = await owner.query(`SELECT 1 FROM sophia.owner_host_exchanges WHERE owner_id=$1`, [w.who])
            if (queued.rowCount) {
              moved = true
              await bump()
            }
          }
          return c.poll(l, r)
        },
        go: async (id) => {
          if (at === 'go' && !moved) {
            moved = true
            await bump()
          }
          return c.go(id)
        },
        answer: (id, a) => c.answer(id, a),
      }),
    })
    const created = await w.create()
    const p = await pass(w, await proxyFor(w), h)
    assert.ok(moved)
    assert.deepEqual(p.sent, ['refused'])
    assert.equal((await op(created.operationId)).state, 'denied')
    assert.equal(h.t3.calls.length, 0, 'nothing reached T3')
    const [x] = await exchanges(created.operationId)
    assert.equal(x?.go_count, 0)
    const why = await one<{ r: string }>(
      `SELECT coalesce(reason, answer->>'reason') r FROM sophia.owner_host_exchanges WHERE id=$1`,
      [x?.id],
    )
    return why.r
  }

  it('rechecks authority at delivery: a goal changed after prepare is denied before it is delivered', async () => {
    assert.match(await goalMovesOn('delivery'), /^at delivery: the goal changed/)
  })

  it('rechecks authority at GO: a goal changed between delivery and GO is refused there, before the gateway', async () => {
    assert.match(await goalMovesOn('go'), /^at go: the goal changed/)
  })

  it('refuses a send with no host: nothing was queued, so nothing could be sent', async () => {
    const w = await world()
    const none = await w.create()
    const nobody = await proxyFor(w, randomUUID())
    assert.deepEqual((await pass(w, nobody, null)).sent, ['refused'])
    assert.equal((await op(none.operationId)).state, 'denied')
    assert.deepEqual(await exchanges(none.operationId), [])
  })

  it('fences queued new work when the host is retired', async () => {
    const w = await world()
    const h = await enroll(w)
    const port = await proxyFor(w)
    // A send queued and never delivered, then the owner retires the host.
    const queued = await w.create()
    const pending = pass(w, port, null)
    for (let i = 0; i < 300 && (await exchanges(queued.operationId)).length === 0; i++) await sleep(10)
    const hostId = (await exchanges(queued.operationId))[0]?.host_id ?? ''
    const retired = await withActor(api, w.who, 'write', (c) => retireOwnerHost(c, hostId))
    assert.equal(retired.fenced, 1)
    assert.deepEqual((await pending).sent, ['refused'])
    assert.equal((await op(queued.operationId)).state, 'denied')
    assert.equal((await exchanges(queued.operationId))[0]?.state, 'cancelled')
    assert.equal(await ownerHostRunner(worker, w.who, 'env-owner-1'), null, 'no new work through a retired host')
    assert.equal(h.t3.calls.length, 0)
  })

  it('keeps a retired host answering for its journal: observation goes on to settlement', async () => {
    const w = await world()
    const h = await enroll(w)
    const port = await proxyFor(w)
    const done = await w.create()
    await pass(w, port, h)
    assert.equal((await op(done.operationId)).state, 'received')
    const hostId = (await exchanges(done.operationId))[0]?.host_id ?? ''
    await withActor(api, w.who, 'write', (c) => retireOwnerHost(c, hostId))
    for (const t of h.t3.threads.values()) for (const r of t.runs) h.t3.finishRun(r.runId)
    await pass(w, port, h)
    assert.equal((await op(done.operationId)).state, 'settled')
    assert.equal(h.t3.effects.launches, 1)
  })

  it('revocation kills the capability and settles nothing', async () => {
    const w = await world()
    const t3 = new FakeT3(NS)
    const h = await enroll(w, { t3 })
    const created = await w.create()
    const port = await proxyFor(w)
    t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    await pass(w, port, h, false)
    assert.equal((await op(created.operationId)).state, 'unknown')
    const hostId = (await exchanges(created.operationId))[0]?.host_id ?? ''
    await withActor(api, w.who, 'write', (c) => revokeOwnerHost(c, hostId))
    assert.equal(await codeOf(h.channel.poll(5, 1)), 'forbidden')
    const p = await pass(w, port, null)
    assert.equal(p.reconciled, 1)
    assert.equal((await op(created.operationId)).state, 'unknown', 'no host answers: it stays unknown, never refused')
    const reserved = await one<{ n: number }>(
      `SELECT count(*)::int n FROM sophia.owner_runner_reservations WHERE account_key=$1`,
      [w.accountKey],
    )
    assert.equal(reserved.n, 1, 'the reservation is kept until proven settlement')
  })
})

describe('operation-aware receipts end to end (r2, CC003-S1A-STUDY-F01)', () => {
  it('keeps an input the host calls received with no run unknown, on the direct send and on reconcile, with one effect', async () => {
    const w = await world()
    // A host whose answers for an input carry no run: a malformed or unproven receipt, as the backend P1 class could produce.
    let malformed = true
    const h = await enroll(w, {
      channel: (c) => ({
        hello: (x) => c.hello(x),
        poll: (l, r) => c.poll(l, r),
        go: (id) => c.go(id),
        answer: (id, a) =>
          c.answer(
            id,
            malformed && a.kind === 'received' && a.identity.commandId.includes('thread-send')
              ? { ...a, runId: null }
              : a,
          ),
      }),
    })
    const port = await proxyFor(w)
    const created = await w.create()
    await pass(w, port, h)
    assert.equal((await op(created.operationId)).state, 'received')
    const input = await withActor(api, w.who, 'write', (c) =>
      admitRunnerOperation(c, w.projectId, randomUUID(), {
        kind: 'input',
        resourceId: w.resourceId,
        targetOperationId: created.operationId,
        message: 'And the outbox boundary?',
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        sourceIds: [],
      }),
    )
    const sent = await pass(w, port, h, false)
    assert.deepEqual(sent.sent, ['unknown'], 'GO was granted and the host said received, but named no run')
    assert.equal((await op(input.operationId)).state, 'unknown')
    const [send] = (await exchanges(input.operationId)).filter((x) => x.kind === 'send')
    assert.deepEqual([send?.state, send?.go_count], ['answered', 1], "the host's raw answer is kept as evidence")
    // Reconcile: the host answers received with no run again; still unknown, never received.
    const again = await pass(w, port, h)
    assert.equal(again.reconciled, 1)
    assert.equal((await op(input.operationId)).state, 'unknown')
    // The host now answers truthfully from its journal: received, with the original identity and a real run.
    malformed = false
    await pass(w, port, h)
    const settled = await one<{ state: string; native_run_id: string | null; native_message_id: string | null }>(
      `SELECT state, native_run_id, native_message_id FROM sophia.owner_runner_operations WHERE id=$1`,
      [input.operationId],
    )
    assert.equal(settled.state, 'received')
    assert.ok(settled.native_run_id && settled.native_run_id.trim().length > 0)
    assert.equal(settled.native_message_id, stableMessageId(NS, 'thread-send', `sophia:${input.operationId}`))
    assert.equal(h.t3.effects.messages, 1, 'one native effect: never resent')
    assert.equal(h.t3.count('t3_thread_send'), 1)
  })
})

describe('r3 integration on the reviewed backend: run identity shapes, direct and reconcile', () => {
  // How a host might answer an input it calls received: every shape that is not a run identity.
  const SHAPES: [string, (a: Record<string, unknown>) => Record<string, unknown>][] = [
    ['missing', ({ runId: _drop, ...rest }) => rest],
    ['null', (a) => ({ ...a, runId: null })],
    ['number', (a) => ({ ...a, runId: 7 })],
    ['object', (a) => ({ ...a, runId: { id: 'run-1' } })],
    ['empty', (a) => ({ ...a, runId: '' })],
    ['blank', (a) => ({ ...a, runId: '   ' })],
  ]
  for (const [shape, mutate] of SHAPES) {
    it(`an input received with a ${shape} run stays unknown, holds its commitment, and converges after a restart`, async () => {
      const w = await world()
      let malformed = true
      const host = (file?: string, capability?: string, t3?: FakeT3) =>
        enroll(w, {
          ...(file && capability && t3 ? { file, capability, t3 } : {}),
          channel: (c) => ({
            hello: (x) => c.hello(x),
            poll: (l, r) => c.poll(l, r),
            go: (id) => c.go(id),
            answer: (id, a) =>
              c.answer(
                id,
                malformed && a.kind === 'received' && a.identity.commandId.includes('thread-send')
                  ? // A deliberately malformed host answer: the channel stores whatever the host sends.
                    (mutate(a) as unknown as typeof a)
                  : a,
              ),
          }),
        })
      const h = await host()
      const port = await proxyFor(w)
      const created = await w.create()
      await pass(w, port, h)
      assert.equal((await op(created.operationId)).state, 'received')
      const input = await withActor(api, w.who, 'write', (c) =>
        admitRunnerOperation(c, w.projectId, randomUUID(), {
          kind: 'input',
          resourceId: w.resourceId,
          targetOperationId: created.operationId,
          message: 'And the outbox boundary?',
          expectedGoalRevision: 1,
          expectedAuthorityEpoch: 1,
          sourceIds: [],
        }),
      )
      assert.deepEqual((await pass(w, port, h, false)).sent, ['unknown'], 'direct: not received')
      await pass(w, port, h)
      const held = await op(input.operationId)
      assert.equal(held.state, 'unknown', 'reconcile: still not received')
      const [send] = (await exchanges(input.operationId)).filter((x) => x.kind === 'send')
      assert.deepEqual([send?.go_count, send?.state], [1, 'answered'], 'GO once; the host answer kept as evidence')
      const reserved = await one<{ n: number }>(
        `SELECT count(*)::int AS n FROM sophia.owner_runner_reservations WHERE account_key=$1`,
        [w.accountKey],
      )
      assert.equal(reserved.n, 1, 'the account commitment is held')
      // The host restarts on the same journal and answers truthfully: the original identities converge, no resend.
      h.gateway.close()
      malformed = false
      const back = await host(h.file, h.capability, h.t3)
      assert.equal(back.journal.id, h.journal.id)
      await pass(w, port, back)
      const done = await one<{
        state: string
        native_run_id: string | null
        native_message_id: string | null
        native_namespace: string | null
      }>(
        `SELECT state, native_run_id, native_message_id, native_namespace FROM sophia.owner_runner_operations WHERE id=$1`,
        [input.operationId],
      )
      assert.equal(done.state, 'received')
      assert.ok(done.native_run_id && done.native_run_id.trim().length > 0)
      assert.equal(done.native_message_id, stableMessageId(NS, 'thread-send', `sophia:${input.operationId}`))
      assert.equal(done.native_namespace, NS)
      assert.equal(h.t3.effects.messages, 1, 'one native message: never resent')
    })
  }

  // r4 (CC003-S1A-STUDY-R2-F01): Sophia always launches with a message, so a create's receipt must name its run too.
  const CREATE_SHAPES: [string, (a: Record<string, unknown>) => Record<string, unknown>][] = [
    ...SHAPES,
    ['boolean', (a) => ({ ...a, runId: true })],
    ['array', (a) => ({ ...a, runId: ['run-1'] })],
  ]
  for (const [shape, mutate] of CREATE_SHAPES) {
    it(`a create received with a ${shape} run stays unknown with one launch, and converges after a restart`, async () => {
      const w = await world()
      let malformed = true
      const host = (file?: string, capability?: string, t3?: FakeT3) =>
        enroll(w, {
          ...(file && capability && t3 ? { file, capability, t3 } : {}),
          channel: (c) => ({
            hello: (x) => c.hello(x),
            poll: (l, r) => c.poll(l, r),
            go: (id) => c.go(id),
            answer: (id, a) =>
              c.answer(
                id,
                malformed && a.kind === 'received' && a.identity.commandId.startsWith('mcp:launch:')
                  ? (mutate(a) as unknown as typeof a)
                  : a,
              ),
          }),
        })
      const h = await host()
      const port = await proxyFor(w)
      const created = await w.create()
      assert.deepEqual((await pass(w, port, h, false)).sent, ['unknown'], 'direct: not received')
      await pass(w, port, h)
      assert.equal((await op(created.operationId)).state, 'unknown', 'reconcile: still not received')
      const [send] = (await exchanges(created.operationId)).filter((x) => x.kind === 'send')
      assert.deepEqual([send?.go_count, send?.state], [1, 'answered'])
      const reserved = await one<{ n: number }>(
        `SELECT count(*)::int AS n FROM sophia.owner_runner_reservations WHERE account_key=$1`,
        [w.accountKey],
      )
      assert.equal(reserved.n, 1, 'the account commitment is held')
      h.gateway.close()
      malformed = false
      const back = await host(h.file, h.capability, h.t3)
      await pass(w, port, back)
      const done = await one<{ state: string; native_run_id: string | null; native_thread_id: string | null }>(
        `SELECT state, native_run_id, native_thread_id FROM sophia.owner_runner_operations WHERE id=$1`,
        [created.operationId],
      )
      assert.equal(done.state, 'received')
      assert.ok(done.native_run_id && done.native_run_id.trim().length > 0)
      assert.equal(done.native_thread_id, launchCommandId(NS, `sophia:${created.operationId}`))
      assert.equal(h.t3.effects.launches, 1, 'one launch: never resent')
    })
  }

  it('lets a Stop acknowledge with no run (nothing active), and settles it only from an observation', async () => {
    const w = await world()
    const h = await enroll(w)
    const port = await proxyFor(w)
    const created = await w.create()
    await pass(w, port, h)
    for (const t of h.t3.threads.values()) for (const r of t.runs) h.t3.finishRun(r.runId)
    const stop = await withActor(api, w.who, 'write', (c) =>
      admitRunnerOperation(c, w.projectId, randomUUID(), {
        kind: 'stop',
        resourceId: w.resourceId,
        targetOperationId: created.operationId,
      }),
    )
    assert.deepEqual((await pass(w, port, h, false)).sent, ['received'])
    const acked = await one<{ state: string; native_run_id: string | null; native_delivery: string | null }>(
      `SELECT state, native_run_id, native_delivery FROM sophia.owner_runner_operations WHERE id=$1`,
      [stop.operationId],
    )
    assert.deepEqual([acked.state, acked.native_run_id, acked.native_delivery], ['received', null, 'no_active_run'])
    await pass(w, port, h)
    assert.equal((await op(stop.operationId)).state, 'settled', 'settled only after a proven observation')
    assert.equal(h.t3.effects.stops, 0, 'nothing was running to stop')
  })
})

/** Erase a source as every existing caller does: the project locked first, then mission_erase_source. */
async function erase(projectId: string, sourceId: string) {
  const c = await owner.connect()
  try {
    await c.query('BEGIN')
    await c.query('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE', [projectId])
    await c.query('SELECT sophia.mission_erase_source($1, $2)', [projectId, sourceId])
    await c.query('COMMIT')
  } finally {
    c.release()
  }
}
const payloadOf = async (operationId: string) =>
  (
    await one<{ id: string }>(`SELECT payload_source_id AS id FROM sophia.owner_runner_operations WHERE id=$1`, [
      operationId,
    ])
  ).id

/**
 * A host whose channel withdraws the create's instruction at one point (at delivery, between delivery and GO, or just
 * after a granted GO), and records every GO it was given.
 */
async function withdrawnAt(at: 'delivery' | 'go' | 'after_go') {
  const w = await world()
  const gos: GoResult[] = []
  let operationId = ''
  let withdrawn = false
  const withdraw = async () => {
    withdrawn = true
    await erase(w.projectId, await payloadOf(operationId))
  }
  const h = await enroll(w, {
    channel: (c) => ({
      hello: (x) => c.hello(x),
      poll: async (l, r) => {
        if (at === 'delivery' && !withdrawn && operationId && (await exchanges(operationId)).length > 0)
          await withdraw()
        return c.poll(l, r)
      },
      go: async (id) => {
        if (at === 'go' && !withdrawn) await withdraw()
        const go = await c.go(id)
        gos.push(go)
        if (at === 'after_go' && !withdrawn && go.result === 'go') await withdraw()
        return go
      },
      answer: (id, a) => c.answer(id, a),
    }),
  })
  const created = await w.create()
  operationId = created.operationId
  const p = await pass(w, await proxyFor(w), h, false)
  assert.ok(withdrawn)
  return { w, h, p, gos, operationId }
}

describe('source authority over the owner-host channel (INC01-CC-005, 0096)', () => {
  it('carries no instruction in any exchange; only a granted GO hands it to the host, and the journal keeps none', async () => {
    const w = await world()
    const gos: GoResult[] = []
    const h = await enroll(w, {
      channel: (c) => ({
        hello: (x) => c.hello(x),
        poll: (l, r) => c.poll(l, r),
        answer: (i, a) => c.answer(i, a),
        go: async (id) => {
          const go = await c.go(id)
          gos.push(go)
          return go
        },
      }),
    })
    const created = await w.create()
    const p = await pass(w, await proxyFor(w), h)
    assert.deepEqual(p.sent, ['received'])
    const requests = await owner.query<{ request: unknown }>(
      `SELECT request FROM sophia.owner_host_exchanges WHERE operation_id=$1`,
      [created.operationId],
    )
    assert.ok(requests.rows.length >= 1)
    for (const r of requests.rows) {
      const text = JSON.stringify(r.request)
      assert.equal(text.includes('Report the Ask'), false, 'no instruction in an exchange')
      assert.equal(text.includes('Read-only qualification'), false, 'nor its title')
      assert.equal((r.request as { envelope: { v: number } }).envelope.v, 2)
    }
    assert.deepEqual(gos, [
      { result: 'go', payload: '{"message":"Report the Ask admission boundary.","title":"Read-only qualification"}' },
    ])
    const launch = h.t3.calls.find((c) => c.tool === 't3_thread_launch')
    assert.equal(launch?.args.message, 'Report the Ask admission boundary.')
    assert.deepEqual(launch?.args.workspaceStrategy, { type: 'worktree', baseRef: BASE })
    assert.deepEqual(launch?.args.modelSelection, SETTINGS)
    assert.equal(readFileSync(h.file, 'utf8').includes('Report the Ask'), false)
  })

  it('denies at delivery an instruction withdrawn after prepare-send: no GO, no body, no native call', async () => {
    const { h, p, gos, operationId } = await withdrawnAt('delivery')
    assert.deepEqual(p.sent, ['refused'])
    assert.equal((await op(operationId)).state, 'denied')
    assert.deepEqual(gos, [])
    assert.equal(h.t3.calls.length, 0)
    const [x] = await exchanges(operationId)
    assert.match(x?.reason ?? '', /^at delivery: (a source it was admitted with|its private instruction) was withdrawn/)
  })

  it('refuses GO for an instruction withdrawn between delivery and GO: the host never receives it or sends', async () => {
    const { h, p, gos, operationId } = await withdrawnAt('go')
    assert.deepEqual(p.sent, ['refused'])
    assert.equal((await op(operationId)).state, 'denied')
    assert.equal(gos.length, 1)
    assert.equal(gos[0]?.result, 'denied')
    assert.equal('payload' in (gos[0] ?? {}), false, 'a refused GO carries no instruction')
    assert.equal(h.t3.calls.length, 0)
  })

  it('after a granted GO, a withdrawal keeps the send and its commitment: a delivered copy is never claimed unsent', async () => {
    const { w, h, p, gos, operationId } = await withdrawnAt('after_go')
    assert.equal(gos[0]?.result, 'go')
    assert.deepEqual(p.sent, ['received'])
    assert.equal((await op(operationId)).state, 'received')
    assert.equal(h.t3.effects.launches, 1)
    const marked = await one<{ at: Date | null; reserved: number }>(
      `SELECT o.source_withdrawn_at AS at, (SELECT count(*)::int FROM sophia.owner_runner_reservations r
         WHERE r.binding_id=o.binding_id) AS reserved FROM sophia.owner_runner_operations o WHERE o.id=$1`,
      [operationId],
    )
    assert.ok(marked.at)
    assert.equal(marked.reserved, 1)
    const view = await withActor(api, w.who, 'read', (c) => readRunnerOperation(c, w.projectId, operationId))
    assert.equal(view.content, 'withdrawn')
    assert.equal(view.state, 'received')
  })
})

// ---- repair 1 over the configured channel (gate INC01-CC-005-final-53f42da1-SOURCE-PRE-PUSH-001) ----

const SECRET_MESSAGE = 'SECRET-INSTRUCTION-7f3a'
/** A FakeT3 that answers a launch or send with a refusal whose message echoes the call's instruction. */
class EchoT3 extends FakeT3 {
  echo = false
  override async call(call: Parameters<FakeT3['call']>[0]): ReturnType<FakeT3['call']> {
    if (this.echo && (call.tool === 't3_thread_launch' || call.tool === 't3_thread_send'))
      return {
        kind: 'failure',
        code: 'invalid_request',
        message: `${String(call.args.title)} ${String(call.args.message)}`,
      }
    return super.call(call)
  }
}

describe('repair 1 across the owner-host channel (CC005-E7-F01, F02)', () => {
  it("keeps a native refusal that echoes the instruction out of the host's answer, the exchange and the operation", async () => {
    const w = await world()
    const t3 = new EchoT3(NS)
    t3.echo = true
    const h = await enroll(w, { t3 })
    const created = await withActor(api, w.who, 'write', (c) =>
      admitRunnerOperation(c, w.projectId, randomUUID(), {
        kind: 'create',
        resourceId: w.resourceId,
        goalId: w.goalId,
        title: 'Read-only qualification',
        message: `${SECRET_MESSAGE}: report the boundary.`,
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        sourceIds: [],
        baseCommit: BASE,
        writeScope: 'read_only',
        settings: SETTINGS,
      }),
    )
    const p = await pass(w, await proxyFor(w), h, false)
    assert.deepEqual(p.sent, ['rejected'])
    const stored = await owner.query<{ answer: unknown; reason: string | null }>(
      `SELECT x.answer, o.reason FROM sophia.owner_host_exchanges x JOIN sophia.owner_runner_operations o ON o.id=x.operation_id
        WHERE x.operation_id=$1`,
      [created.operationId],
    )
    assert.equal(JSON.stringify(stored.rows).includes(SECRET_MESSAGE), false, JSON.stringify(stored.rows))
  })

  it("refuses GO for an input once its create's instruction is withdrawn between delivery and GO", async () => {
    const w = await world()
    let createId = ''
    let withdrawn = false
    const gos: GoResult[] = []
    const h = await enroll(w, {
      channel: (c) => ({
        hello: (x) => c.hello(x),
        poll: (l, r) => c.poll(l, r),
        answer: (i, a) => c.answer(i, a),
        go: async (id) => {
          if (createId && !withdrawn) {
            withdrawn = true
            await erase(w.projectId, await payloadOf(createId))
          }
          const go = await c.go(id)
          gos.push(go)
          return go
        },
      }),
    })
    const created = await w.create()
    const port = await proxyFor(w)
    await pass(w, port, h)
    assert.equal((await op(created.operationId)).state, 'received')
    createId = created.operationId
    gos.length = 0
    const input = await withActor(api, w.who, 'write', (c) =>
      admitRunnerOperation(c, w.projectId, randomUUID(), {
        kind: 'input',
        resourceId: w.resourceId,
        targetOperationId: created.operationId,
        message: 'A follow-up through the host.',
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        sourceIds: [],
      }),
    )
    const p = await pass(w, port, h, false)
    assert.ok(withdrawn)
    assert.deepEqual(p.sent, ['refused'])
    assert.equal((await op(input.operationId)).state, 'denied')
    assert.equal(gos[0]?.result, 'denied')
    assert.equal(h.t3.count('t3_thread_send'), 0, 'the host never sent it')
  })
})

// ---- repair 2 (PR505-33-F01, F02): GO serializes with revocation and source erasure ----

const ungranted = async (pid?: number) =>
  (
    await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
        WHERE NOT l.granted AND a.datname=current_database() AND ($1::int IS NULL OR l.pid=$1)`,
      [pid ?? null],
    )
  ).n
/** Whether `work` settles first or a waiter is observed in pg_locks first (`pid`'s, or any). Bounded, never a sleep. */
async function settledOrWaiting(work: Promise<unknown>, pid?: number): Promise<'settled' | 'waiting'> {
  let settled = false
  work.then(
    () => (settled = true),
    () => (settled = true),
  )
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (settled) return 'settled'
    if ((await ungranted(pid)) > 0) return 'waiting'
    await sleep(10)
  }
  throw new Error('neither settled nor observed waiting')
}
/**
 * Until a backend of this database waits for an ungranted lock on `relation` (pg_locks), with its own finite bound: a
 * barrier that never arrives fails the test here instead of hanging it (repair 3: the reviewer's bounded-wait note).
 */
async function untilWaitingOn(relation: string, ms = 15_000) {
  const deadline = Date.now() + ms
  for (;;) {
    const { n } = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted AND relation=$1::regclass`,
      [relation],
    )
    if (n > 0) return
    if (Date.now() >= deadline) throw new Error(`no backend waited on ${relation} within ${ms} ms`)
    await sleep(10)
  }
}
const pidOf = async (c: pg.PoolClient) =>
  (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0
const qualificationOf = async (w: World) =>
  (
    await one<{ id: string }>(
      `SELECT id FROM sophia.owner_runner_qualifications WHERE project_id=$1 AND resource_id=$2 AND revoked_at IS NULL`,
      [w.projectId, w.resourceId],
    )
  ).id

type Change = (c: pg.PoolClient, w: World, operationId: string) => Promise<unknown>
const eraseOwn: Change = async (c, w, operationId) => {
  await c.query('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE', [w.projectId])
  return c.query('SELECT sophia.mission_erase_source($1, $2)', [w.projectId, await payloadOf(operationId)])
}
const revoke: Change = async (c, w) =>
  c.query(`SELECT sophia.revoke_owner_runner($1, $2, 'synthetic revocation')`, [w.projectId, await qualificationOf(w)])

/**
 * A host whose GO meets `change` at one boundary. `paused`: GO is held at its own final exchange update (that table
 * held in SHARE mode, an ungranted lock observed), then `change` runs and commits on another client. `open`: `change`
 * runs in an open transaction first, then GO runs and the change commits. `target` names the operation whose context
 * the change withdraws (null: the sent operation's own). Each outcome is recorded.
 */
async function goMeets(w: World, at: 'paused' | 'open', change: Change, target: () => string | null) {
  const gos: GoResult[] = []
  const order: string[] = []
  let armed = false
  const h = await enroll(w, {
    channel: (c) => ({
      hello: (x) => c.hello(x),
      poll: (l, r) => c.poll(l, r),
      answer: (i, a) => c.answer(i, a),
      go: async (id) => {
        if (!armed) return c.go(id).then((g) => (gos.push(g), g))
        armed = false
        const locker = await owner.connect()
        const changer = await owner.connect()
        const changerPid = await pidOf(changer)
        const operationId =
          target() ??
          (await one<{ id: string }>('SELECT operation_id AS id FROM sophia.owner_host_exchanges WHERE id=$1', [id])).id
        try {
          let go: Promise<GoResult>
          if (at === 'paused') {
            await locker.query('BEGIN')
            await locker.query('LOCK TABLE sophia.owner_host_exchanges IN SHARE MODE')
            go = c.go(id)
            go.then(
              () => order.push('go'),
              () => order.push('go'),
            )
            await untilWaitingOn('sophia.owner_host_exchanges')
            await changer.query('BEGIN')
            const changed = change(changer, w, operationId).then(() => changer.query('COMMIT'))
            changed.then(
              () => order.push('change'),
              () => order.push('change'),
            )
            order.push(`change ${await settledOrWaiting(changed, changerPid)}`)
            await locker.query('ROLLBACK')
            await changed
          } else {
            await changer.query('BEGIN')
            await change(changer, w, operationId)
            go = c.go(id)
            go.then(
              () => order.push('go'),
              () => order.push('go'),
            )
            order.push(`go ${await settledOrWaiting(go)}`)
            await changer.query('COMMIT')
            order.push('change')
          }
          const result = await go
          gos.push(result)
          return result
        } finally {
          await locker.query('ROLLBACK').catch(() => undefined)
          await changer.query('ROLLBACK').catch(() => undefined)
          locker.release()
          changer.release()
        }
      },
    }),
  })
  return { h, gos, order, arm: () => (armed = true) }
}

describe('GO serializes with revocation and source erasure (repair 2, PR505-33-F01, F02)', () => {
  for (const [name, change] of [
    ['an erasure of its instruction', eraseOwn],
    ['a revocation of its route', revoke],
  ] as const) {
    it(`${name} that commits first denies GO: no payload, no native call`, async () => {
      const w = await world()
      const r = await goMeets(w, 'open', change, () => null)
      r.arm()
      const created = await w.create()
      const p = await pass(w, await proxyFor(w), r.h, false)
      assert.deepEqual(r.order.slice(0, 1), ['go waiting'], 'GO waits for the change that holds the authority lock')
      assert.equal(r.gos.at(-1)?.result, 'denied')
      assert.equal('payload' in (r.gos.at(-1) ?? {}), false)
      assert.deepEqual(p.sent, ['refused'])
      assert.equal((await op(created.operationId)).state, 'denied')
      assert.equal(r.h.t3.calls.length, 0)
    })

    it(`${name} waits for a GO that decided first; that send keeps its commitment`, async () => {
      const w = await world()
      const r = await goMeets(w, 'paused', change, () => null)
      r.arm()
      const created = await w.create()
      const p = await pass(w, await proxyFor(w), r.h, false)
      assert.equal(r.order[0], 'change waiting', 'the change waits for the GO that holds the authority lock')
      assert.equal(r.gos.at(-1)?.result, 'go')
      assert.deepEqual(p.sent, ['received'])
      assert.equal((await op(created.operationId)).state, 'received')
      assert.equal(r.h.t3.effects.launches, 1)
      const kept = await one<{ n: number }>(
        `SELECT count(*)::int AS n FROM sophia.owner_runner_reservations r JOIN sophia.owner_runner_operations o
          ON o.binding_id=r.binding_id WHERE o.id=$1`,
        [created.operationId],
      )
      assert.equal(kept.n, 1, 'its account commitment is kept')
    })
  }

  it('a connection revoked by a writer that holds only its row, uncommitted, makes GO wait, then deny', async () => {
    const w = await world()
    const directRevoke: Change = async (c) =>
      c.query(`UPDATE sophia.execution_connections SET state='revoked', revision=revision+1 WHERE id=$1`, [
        w.connectionId,
      ])
    const r = await goMeets(w, 'open', directRevoke, () => null)
    r.arm()
    const created = await w.create()
    const p = await pass(w, await proxyFor(w), r.h, false)
    assert.deepEqual(r.order.slice(0, 1), ['go waiting'])
    assert.equal(r.gos.at(-1)?.result, 'denied')
    assert.deepEqual(p.sent, ['refused'])
    assert.equal((await op(created.operationId)).state, 'denied')
    assert.equal(r.h.t3.calls.length, 0)
  })

  it("an erasure of an input's create context that commits first denies the input's GO", async () => {
    const w = await world()
    let createId = ''
    const r = await goMeets(w, 'open', eraseOwn, () => createId)
    const created = await w.create()
    const port = await proxyFor(w)
    await pass(w, port, r.h)
    assert.equal((await op(created.operationId)).state, 'received')
    createId = created.operationId
    r.arm()
    const input = await withActor(api, w.who, 'write', (c) =>
      admitRunnerOperation(c, w.projectId, randomUUID(), {
        kind: 'input',
        resourceId: w.resourceId,
        targetOperationId: created.operationId,
        message: 'A follow-up through the host.',
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        sourceIds: [],
      }),
    )
    const p = await pass(w, port, r.h, false)
    assert.deepEqual(r.order.slice(0, 1), ['go waiting'])
    assert.equal(r.gos.at(-1)?.result, 'denied')
    assert.deepEqual(p.sent, ['refused'])
    assert.equal((await op(input.operationId)).state, 'denied')
    assert.equal(r.h.t3.count('t3_thread_send'), 0)
  })

  it("an erasure of an input's create context waits for the input's GO that decided first; that send is kept", async () => {
    const w = await world()
    let createId = ''
    const r = await goMeets(w, 'paused', eraseOwn, () => createId)
    const created = await w.create()
    const port = await proxyFor(w)
    await pass(w, port, r.h)
    createId = created.operationId
    r.arm()
    const input = await withActor(api, w.who, 'write', (c) =>
      admitRunnerOperation(c, w.projectId, randomUUID(), {
        kind: 'input',
        resourceId: w.resourceId,
        targetOperationId: created.operationId,
        message: 'A follow-up through the host.',
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        sourceIds: [],
      }),
    )
    const p = await pass(w, port, r.h, false)
    assert.equal(r.order[0], 'change waiting')
    assert.equal(r.gos.at(-1)?.result, 'go')
    assert.deepEqual(p.sent, ['received'])
    assert.equal((await op(input.operationId)).state, 'received')
    assert.equal(r.h.t3.effects.messages, 1)
  })

  it('an unchanged GO still grants, and grants again on redelivery', async () => {
    const w = await world()
    const r = await goMeets(
      w,
      'paused',
      () => Promise.resolve(),
      () => null,
    )
    r.arm()
    const created = await w.create()
    await pass(w, await proxyFor(w), r.h, false)
    assert.equal(r.gos.at(-1)?.result, 'go')
    assert.equal((await op(created.operationId)).state, 'received')
    assert.equal(r.h.t3.effects.launches, 1)
  })
})

// ---- repair 3 (PR505-33-73-F03): one live host per connection under concurrent pairing ----

/** Redeem through the actual persistence consumer on one held client (its transaction left open by the caller). */
const redeemOn = (c: pg.PoolClient, code: string, capability: string) =>
  redeemOwnerHostPairing(c as unknown as pg.Pool, code, capability)
const liveHosts = async (w: World) =>
  (
    await owner.query<{ id: string; state: string }>(
      `SELECT id, state FROM sophia.owner_hosts WHERE owner_id=$1 AND connection_id=$2 ORDER BY created_at`,
      [w.who, w.connectionId],
    )
  ).rows
const dbClock = async () => (await one<{ t: Date }>('SELECT clock_timestamp() AS t')).t

describe('one live host per connection under concurrent pairing (repair 3, PR505-33-73-F03)', () => {
  it('two distinct codes redeemed at once leave one live host: the second waits, then replaces the first', async () => {
    const w = await world()
    const [a, b] = [await w.pair(), await w.pair()]
    const [capA, capB] = [newSecret(), newSecret()]
    const first = await api.connect()
    try {
      await first.query('BEGIN')
      const boundA = await redeemOn(first, a.code, capA)
      assert.equal(boundA.result, 'bound')
      const second = redeemOwnerHostPairing(api, b.code, capB)
      const waited = await settledOrWaiting(second)
      await first.query('COMMIT')
      const boundB = await second
      assert.equal(boundB.result, 'bound')
      assert.deepEqual(
        (await liveHosts(w)).map((h) => h.state),
        ['retired', 'bound'],
        'one live host: the first is retired, never revoked',
      )
      assert.equal(waited, 'waiting', 'the second redemption waited for the first')
      // The replacement serves the runner's new work.
      const hb = await enroll(w, { capability: capB })
      assert.equal((await ownerHostRunner(worker, w.who, 'env-owner-1'))?.journalId, hb.journal.id)
    } finally {
      await first.query('ROLLBACK').catch(() => undefined)
      first.release()
    }
  })

  it('refuses the second code when it expires while it waits, judged at the actual time', async () => {
    const w = await world()
    const [a, b] = [await w.pair(), await w.pair()]
    const until = new Date((await dbClock()).getTime() + 1200)
    await owner.query(`UPDATE sophia.owner_host_pairings SET expires_at=$2 WHERE id=$1`, [b.pairingId, until])
    const first = await api.connect()
    try {
      await first.query('BEGIN')
      assert.equal((await redeemOn(first, a.code, newSecret())).result, 'bound')
      const second = redeemOwnerHostPairing(api, b.code, newSecret())
      assert.equal(await settledOrWaiting(second), 'waiting')
      while ((await dbClock()) <= until) await sleep(50)
      await first.query('COMMIT')
      const refused = await second
      assert.equal(refused.result, 'refused')
      assert.match(refused.result === 'refused' ? refused.reason : '', /expired/)
      assert.deepEqual(
        (await liveHosts(w)).map((h) => h.state),
        ['bound'],
      )
    } finally {
      await first.query('ROLLBACK').catch(() => undefined)
      first.release()
    }
  })

  it('refuses both codes once the connection is revoked while they wait (control)', async () => {
    const w = await world()
    const [a, b] = [await w.pair(), await w.pair()]
    const operator = await owner.connect()
    try {
      await operator.query('BEGIN')
      await operator.query(`UPDATE sophia.execution_connections SET state='revoked', revision=revision+1 WHERE id=$1`, [
        w.connectionId,
      ])
      const ra = redeemOwnerHostPairing(api, a.code, newSecret())
      const rb = redeemOwnerHostPairing(api, b.code, newSecret())
      assert.equal(await settledOrWaiting(ra), 'waiting')
      await operator.query('COMMIT')
      for (const r of [await ra, await rb]) assert.equal(r.result, 'refused')
      assert.deepEqual(await liveHosts(w), [])
    } finally {
      await operator.query('ROLLBACK').catch(() => undefined)
      operator.release()
    }
  })

  it('keeps sequential replacement, same-code replay and used-code refusal (controls)', async () => {
    const w = await world()
    const [a, b] = [await w.pair(), await w.pair()]
    const [capA, capB] = [newSecret(), newSecret()]
    const boundA = await redeemOwnerHostPairing(api, a.code, capA)
    const replay = await redeemOwnerHostPairing(api, a.code, capA)
    assert.equal(replay.result === 'bound' && boundA.result === 'bound' && replay.hostId === boundA.hostId, true)
    assert.equal((await redeemOwnerHostPairing(api, a.code, newSecret())).result, 'refused')
    assert.equal((await redeemOwnerHostPairing(api, b.code, capB)).result, 'bound')
    assert.deepEqual(
      (await liveHosts(w)).map((h) => h.state),
      ['retired', 'bound'],
    )
  })

  it("another owner's redemption neither waits for nor replaces this connection's host (control)", async () => {
    const [w, v] = [await world(), await world()]
    const [a, b] = [await w.pair(), await v.pair()]
    const first = await api.connect()
    try {
      await first.query('BEGIN')
      assert.equal((await redeemOn(first, a.code, newSecret())).result, 'bound')
      const foreign = redeemOwnerHostPairing(api, b.code, newSecret())
      assert.equal(await settledOrWaiting(foreign), 'settled')
      assert.equal((await foreign).result, 'bound')
      await first.query('COMMIT')
      for (const x of [w, v])
        assert.deepEqual(
          (await liveHosts(x)).map((h) => h.state),
          ['bound'],
        )
    } finally {
      await first.query('ROLLBACK').catch(() => undefined)
      first.release()
    }
  })

  for (const first of ['retire', 'redeem'] as const)
    it(`a ${first} that holds the old host first: the other waits, and one live host remains`, async () => {
      const w = await world()
      const old = await w.pair()
      const bound = await redeemOwnerHostPairing(api, old.code, newSecret())
      const oldId = bound.result === 'bound' ? bound.hostId : ''
      const b = await w.pair()
      const gate = Promise.withResolvers<undefined>()
      const redeemer = await api.connect()
      try {
        let retired: Promise<unknown>
        let redeemed: Promise<Awaited<ReturnType<typeof redeemOwnerHostPairing>>>
        let waited: 'settled' | 'waiting'
        if (first === 'retire') {
          const entered = Promise.withResolvers<undefined>()
          retired = withActor(api, w.who, 'write', async (c) => {
            const r = await retireOwnerHost(c, oldId)
            entered.resolve(undefined)
            await gate.promise
            return r
          })
          await entered.promise
          redeemed = redeemOwnerHostPairing(api, b.code, newSecret())
          waited = await settledOrWaiting(redeemed)
          gate.resolve(undefined)
        } else {
          await redeemer.query('BEGIN')
          redeemed = redeemOn(redeemer, b.code, newSecret())
          await redeemed
          retired = withActor(api, w.who, 'write', (c) => retireOwnerHost(c, oldId))
          waited = await settledOrWaiting(retired)
          await redeemer.query('COMMIT')
        }
        await retired
        assert.equal((await redeemed).result, 'bound')
        assert.equal(waited, 'waiting')
        assert.deepEqual(
          (await liveHosts(w)).map((h) => h.state),
          ['retired', 'bound'],
        )
      } finally {
        gate.resolve(undefined)
        await redeemer.query('ROLLBACK').catch(() => undefined)
        redeemer.release()
      }
    })

  it('a host replaced by concurrent pairing keeps its unknown create: reconciled by identity, then its Stop', async () => {
    const w = await world()
    const t3 = new FakeT3(NS)
    const h = await enroll(w, { t3 })
    const created = await w.create()
    t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    await pass(w, await proxyFor(w), h, false)
    assert.equal((await op(created.operationId)).state, 'unknown')
    // Two new codes redeemed at once: the old host is retired, never revoked, and one new host is live.
    const [a, b] = [await w.pair(), await w.pair()]
    const first = await api.connect()
    try {
      await first.query('BEGIN')
      assert.equal((await redeemOn(first, a.code, newSecret())).result, 'bound')
      const second = redeemOwnerHostPairing(api, b.code, newSecret())
      assert.equal(await settledOrWaiting(second), 'waiting')
      await first.query('COMMIT')
      assert.equal((await second).result, 'bound')
    } finally {
      await first.query('ROLLBACK').catch(() => undefined)
      first.release()
    }
    assert.deepEqual(
      (await liveHosts(w)).map((x) => x.state),
      ['retired', 'retired', 'bound'],
    )
    // Nothing was unsent, refunded or settled by the replacement.
    assert.equal((await op(created.operationId)).state, 'unknown')
    const reserved = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM sophia.owner_runner_reservations WHERE account_key=$1`,
      [w.accountKey],
    )
    assert.equal(reserved.n, 1)
    // The retired host reconciles its own create by its original identity: no relaunch.
    const port = await proxyFor(w, h.journal.id)
    await pass(w, port, h)
    assert.equal((await op(created.operationId)).state, 'received')
    assert.equal(t3.effects.launches, 1)
    // Its qualified Stop still goes through it.
    const stop = await withActor(api, w.who, 'write', (c) =>
      admitRunnerOperation(c, w.projectId, randomUUID(), {
        kind: 'stop',
        resourceId: w.resourceId,
        targetOperationId: created.operationId,
      }),
    )
    await pass(w, port, h, false)
    assert.equal((await op(stop.operationId)).state, 'received')
    assert.equal(t3.effects.stops, 1)
  })

  it('a redemption waits for a GO that holds the old host; that send and its commitment are kept', async () => {
    const w = await world()
    const b = await w.pair()
    const capB = newSecret()
    const redeemB: Change = (c) => redeemOn(c, b.code, capB)
    const r = await goMeets(w, 'paused', redeemB, () => null)
    r.arm()
    const created = await w.create()
    const p = await pass(w, await proxyFor(w), r.h, false)
    assert.equal(r.order[0], 'change waiting', "the redemption waits for the GO holding the old host's row")
    assert.equal(r.gos.at(-1)?.result, 'go')
    assert.deepEqual(p.sent, ['received'])
    assert.equal((await op(created.operationId)).state, 'received')
    assert.equal(r.h.t3.effects.launches, 1)
    assert.deepEqual(
      (await liveHosts(w)).map((h) => h.state),
      ['retired', 'bound'],
    )
    // The retired host still observes its own possible work.
    await pass(w, await proxyFor(w, r.h.journal.id), r.h)
    assert.equal((await op(created.operationId)).state, 'received')
  })

  it('a redemption that commits first retires the old host before its GO: no new send through it (control)', async () => {
    const w = await world()
    const b = await w.pair()
    const redeemB: Change = (c) => redeemOn(c, b.code, newSecret())
    const r = await goMeets(w, 'open', redeemB, () => null)
    r.arm()
    const created = await w.create()
    const p = await pass(w, await proxyFor(w), r.h, false)
    assert.equal(r.order[0], 'go waiting')
    assert.equal(r.gos.at(-1)?.result, 'denied')
    assert.deepEqual(p.sent, ['refused'])
    assert.equal((await op(created.operationId)).state, 'denied')
    assert.equal(r.h.t3.calls.length, 0)
  })
})

describe('the exchange ledger', () => {
  it('is idempotent by key, conflicts on another payload, counts every GO, keeps the first answer, and lapses', async () => {
    const w = await world()
    const h = await enroll(w)
    const created = await w.create()
    // Mark the possible send without a dispatcher, so the exchange can be driven by hand.
    const [row] = (
      await owner.query<{ id: string }>(`SELECT outbox_id id FROM sophia.owner_runner_operations WHERE id=$1`, [
        created.operationId,
      ])
    ).rows
    const lease = randomUUID()
    await owner.query(
      `UPDATE sophia.outbox SET state='dispatching', lease_token=$3, lease_until=now()+interval '1 minute' WHERE project_id=$1 AND id=$2`,
      [w.projectId, row?.id, lease],
    )
    const prepared = await one<{ r: { result: string; envelope: Parameters<typeof exchangeRequest>[1] } }>(
      `SELECT sophia.owner_runner_prepare_send($1, $2, $3, $4) r`,
      [w.projectId, row?.id, lease, h.journal.id],
    )
    assert.equal(prepared.r.result, 'send')
    const store = new DbExchangeStore(worker)
    const request = exchangeRequest('send', prepared.r.envelope, h.journal.id)
    const input = {
      ownerId: w.who,
      environmentRef: 'env-owner-1',
      journalId: h.journal.id,
      key: `send:${created.operationId}`,
      request,
      deadlineMs: 60_000,
    }
    const q = await store.enqueue(input)
    assert.equal(q.result, 'queued')
    assert.equal((await store.enqueue(input)).result, 'existing')
    assert.equal(
      (await store.enqueue({ ...input, request: { ...request, digest: '0'.repeat(64) } })).result,
      'conflict',
    )
    // Another owner's envelope is not queued at all.
    assert.notEqual(await codeOf(store.enqueue({ ...input, ownerId: randomUUID() })), 'resolved')
    const exchangeId = q.result === 'queued' ? q.exchangeId : ''
    // An effect answer without GO is refused by the database.
    assert.equal((await h.channel.poll(5, 1)).length, 1)
    assert.notEqual(
      await codeOf(h.channel.answer(exchangeId, { kind: 'unknown', identity: null, reason: 'x' })),
      'resolved',
    )
    // Each grant of a v2 send carries its instruction (0096), read under that grant's recheck; nothing else does.
    const payload = '{"message":"Report the Ask admission boundary.","title":"Read-only qualification"}'
    assert.deepEqual(await h.channel.go(exchangeId), { result: 'go', payload })
    assert.deepEqual(await h.channel.go(exchangeId), { result: 'go', payload })
    assert.equal((await exchanges(created.operationId))[0]?.go_count, 2)
    const first = { kind: 'unknown', identity: null, reason: 'no certain answer' } as const
    assert.deepEqual(await h.channel.answer(exchangeId, first), { result: 'ok' })
    assert.deepEqual(await h.channel.answer(exchangeId, first), { result: 'ok' })
    assert.deepEqual(await h.channel.answer(exchangeId, { ...first, reason: 'other' }), { result: 'conflict' })
    assert.deepEqual((await store.exchange(w.who, exchangeId))?.answer, first)
    // Another owner reads nothing of it.
    assert.equal(await store.exchange(randomUUID(), exchangeId), null)
    // A never-granted read past its deadline lapses under maintenance.
    const read = await store.enqueue({
      ...input,
      key: `observe:${created.operationId}:${randomUUID()}`,
      request: { ...request, kind: 'observe' },
      deadlineMs: 1000,
    })
    await sleep(1100)
    assert.ok((await maintainOwnerHosts(worker)) >= 1)
    assert.equal((await store.exchange(w.who, read.result === 'queued' ? read.exchangeId : ''))?.state, 'lapsed')
  })
})

/** A host channel whose observe answers are rewritten per operation kind: what a broken or dishonest host may say. */
function rewritingObserve(rewrite: (operation: string, answer: unknown) => unknown) {
  return (c: HostChannel): HostChannel => {
    const kinds = new Map<string, string>()
    return {
      hello: (x) => c.hello(x),
      poll: async (limit, redeliver) => {
        const got = await c.poll(limit, redeliver)
        for (const d of got) {
          const env = (d.request as { envelope?: { kind?: unknown } }).envelope
          if (d.kind === 'observe' && typeof env?.kind === 'string') kinds.set(d.exchangeId, env.kind)
        }
        return got
      },
      go: (id) => c.go(id),
      answer: (id, a) => {
        const kind = kinds.get(id)
        return c.answer(id, (kind === undefined ? a : rewrite(kind, a)) as typeof a)
      },
    }
  }
}

const reservations = (accountKey: string) =>
  one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.owner_runner_reservations WHERE account_key=$1`, [
    accountKey,
  ]).then((r) => r.n)
const observeAnswers = (operationId: string) =>
  owner
    .query<{ state: string; answer: unknown }>(
      `SELECT state, answer FROM sophia.owner_host_exchanges WHERE operation_id=$1 AND kind='observe' ORDER BY created_at`,
      [operationId],
    )
    .then((r) => r.rows)
const running = (t3: FakeT3) => [...t3.threads.values()].flatMap((t) => t.runs).filter((r) => r.status === 'running')

describe('operation-aware observations end to end (r5, HOST-S1A-R4-F01)', () => {
  /** A received create with its run running, and a received Stop of it whose run is still running. */
  async function createAndStop(w: World, h: Host, port: OwnerHostPortProxy) {
    const created = await w.create()
    assert.deepEqual((await pass(w, port, h, false)).sent, ['received'])
    const stop = await withActor(api, w.who, 'write', (c) =>
      admitRunnerOperation(c, w.projectId, randomUUID(), {
        kind: 'stop',
        resourceId: w.resourceId,
        targetOperationId: created.operationId,
      }),
    )
    assert.deepEqual((await pass(w, port, h, false)).sent, ['received'])
    assert.equal(
      (await op(stop.operationId)).state,
      'received',
      'the Stop is acknowledged (stop_requested), not settled',
    )
    assert.equal(running(h.t3).length, 1, 'its run is still running after the interrupt request')
    return { created, stop }
  }

  const STOP_SUMMARIES: [string, unknown][] = [
    ['a running run with terminal:true', { kind: 'run', status: 'running', terminal: true }],
    ['an unknown status with terminal:true', { kind: 'run', status: 'mystery', terminal: true }],
    ["a valid terminal run summary (another operation's shape)", { kind: 'run', status: 'completed', terminal: true }],
  ]
  for (const [name, summary] of STOP_SUMMARIES) {
    it(`never settles a Stop from ${name}: it stays received, its run running, the commitment held`, async () => {
      const w = await world()
      const h = await enroll(w, { channel: rewritingObserve((k, a) => (k === 'stop' ? summary : a)) })
      const port = await proxyFor(w)
      const { created, stop } = await createAndStop(w, h, port)
      await pass(w, port, h)
      assert.equal((await op(stop.operationId)).state, 'received', 'not settled')
      assert.equal((await op(created.operationId)).state, 'received')
      assert.equal(running(h.t3).length, 1)
      assert.equal(await reservations(w.accountKey), 1)
      const answers = await observeAnswers(stop.operationId)
      assert.ok(answers.length >= 1, 'the observe request was made and answered')
      assert.deepEqual(
        answers.at(-1),
        { state: 'answered', answer: summary },
        'the raw host answer is kept as evidence',
      )
    })
  }

  const CREATE_SUMMARIES: [string, unknown][] = [
    ['no_active_run', { kind: 'no_active_run' }],
    ['a running run with terminal:true', { kind: 'run', status: 'running', terminal: true }],
    ['an unknown status with terminal:true', { kind: 'run', status: 'mystery', terminal: true }],
    ['a completed run with terminal:false', { kind: 'run', status: 'completed', terminal: false }],
  ]
  for (const [name, summary] of CREATE_SUMMARIES) {
    it(`never settles a running Create observed as ${name}, and never releases its account commitment`, async () => {
      const w = await world()
      const h = await enroll(w, { channel: rewritingObserve((k, a) => (k === 'create' ? summary : a)) })
      const port = await proxyFor(w)
      const created = await w.create()
      await pass(w, port, h, false)
      await pass(w, port, h)
      assert.equal((await op(created.operationId)).state, 'received', 'acknowledged, not settled')
      assert.equal(running(h.t3).length, 1)
      assert.equal(await reservations(w.accountKey), 1, 'the commitment is held')
      const recorded = await one<{ run_status: string | null }>(
        `SELECT run_status FROM sophia.owner_runner_operations WHERE id=$1`,
        [created.operationId],
      )
      assert.equal(recorded.run_status, null, 'a contradictory summary records no run status')
      assert.deepEqual((await observeAnswers(created.operationId)).at(-1), { state: 'answered', answer: summary })
      assert.equal(h.t3.effects.launches, 1, 'never resent')
    })
  }

  it('never settles an Input observed as no_active_run', async () => {
    const w = await world()
    const h = await enroll(w, {
      channel: rewritingObserve((k, a) => (k === 'input' ? { kind: 'no_active_run' } : a)),
    })
    const port = await proxyFor(w)
    const created = await w.create()
    await pass(w, port, h, false)
    const input = await withActor(api, w.who, 'write', (c) =>
      admitRunnerOperation(c, w.projectId, randomUUID(), {
        kind: 'input',
        resourceId: w.resourceId,
        targetOperationId: created.operationId,
        message: 'And the outbox boundary?',
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        sourceIds: [],
      }),
    )
    await pass(w, port, h, false)
    assert.equal((await op(input.operationId)).state, 'received')
    await pass(w, port, h)
    assert.equal((await op(input.operationId)).state, 'received', 'not settled by thread absence')
    assert.equal(h.t3.effects.messages, 1)
  })

  it('keeps valid observations: a running Create follows, a finished one settles, and a proven Stop settles the binding', async () => {
    const w = await world()
    const h = await enroll(w)
    const port = await proxyFor(w)
    const { created, stop } = await createAndStop(w, h, port)
    await pass(w, port, h)
    assert.deepEqual(
      [(await op(created.operationId)).state, (await op(stop.operationId)).state],
      ['received', 'received'],
      'a running run: followed, nothing settled',
    )
    const status = await one<{ run_status: string | null }>(
      `SELECT run_status FROM sophia.owner_runner_operations WHERE id=$1`,
      [created.operationId],
    )
    assert.equal(status.run_status, 'running', 'the valid nonterminal observation is recorded')
    for (const r of running(h.t3)) h.t3.finishRun(r.runId, 'interrupted')
    await pass(w, port, h)
    assert.equal((await op(created.operationId)).state, 'settled', 'its exact run is terminal')
    assert.equal((await op(stop.operationId)).state, 'settled', 'complete exact-thread proof')
    assert.equal(await reservations(w.accountKey), 0, 'released only after proven settlement')
    assert.equal(h.t3.effects.launches, 1)
  })
})

const omit = (b: Record<string, unknown>, k: string) => Object.fromEntries(Object.entries(b).filter(([x]) => x !== k))

describe('protocol versions and types at the SQL entry points (r5, HOST-S1A-R4-F02)', () => {
  const valid = (journalId: string, accountKey: string): Record<string, unknown> => ({
    v: 1,
    journalId,
    environmentRef: 'env-owner-1',
    adapterPin: PIN,
    profileId: 'read-only-v1',
    profileRevision: 1,
    accountKey,
    t3Namespace: NS,
  })
  const hello = (capability: string, body: unknown) =>
    api
      .query<{ r: { result: string } }>('SELECT sophia.owner_host_hello($1, $2::jsonb) AS r', [
        secretDigest(capability),
        body === undefined ? null : JSON.stringify(body),
      ])
      .then(
        (r) => r.rows[0]?.r.result ?? 'none',
        (err: unknown) => `raw:${(err as { code?: string }).code ?? String(err)}`,
      )

  it('binds a host only for an exact numeric v:1 and typed fields, on the API role, as helloRefusal does', async () => {
    const w = await world()
    const capability = newSecret()
    const pairing = await w.pair()
    assert.equal((await redeemOwnerHostPairing(api, pairing.code, capability)).result, 'bound')
    const good = valid(randomUUID(), w.accountKey)
    const bad: [string, unknown][] = [
      ['SQL null', undefined],
      ['an array', [good]],
      ['an empty object', {}],
      ['v omitted', omit(good, 'v')],
      ['v null', { ...good, v: null }],
      ['v the string "1"', { ...good, v: '1' }],
      ['v 2', { ...good, v: 2 }],
      ['v true', { ...good, v: true }],
      ['v 1.5', { ...good, v: 1.5 }],
      ['journalId null', { ...good, journalId: null }],
      ['environmentRef a number', { ...good, environmentRef: 5 }],
      ['profileId a number', { ...good, profileId: 7 }],
      ['accountKey an object', { ...good, accountKey: { k: 'x' } }],
      ['profileRevision a string', { ...good, profileRevision: '1' }],
      ['profileRevision null', { ...good, profileRevision: null }],
      ['t3Namespace null', { ...good, t3Namespace: null }],
      ['an extra key', { ...good, extra: 1 }],
    ]
    // Every case is run before asserting, so a failure shows the whole table. A case that binds stops the table: the
    // host would be bound, so the rest is checked against a bound host (still a refusal, never 'ok').
    const results: Record<string, string> = {}
    for (const [name, body] of bad) {
      results[name] = await hello(capability, body)
      assert.notEqual(helloRefusal(body), null, `${name}: TypeScript refuses it`)
    }
    assert.deepEqual(
      results,
      Object.fromEntries(bad.map(([name]) => [name, 'raw:22023'])),
      'refused at the SQL entry point',
    )
    const unbound = await one<{ journal_id: string | null; hello_ok: boolean; state: string }>(
      `SELECT journal_id, hello_ok, state FROM sophia.owner_hosts WHERE capability_sha256=$1`,
      [secretDigest(capability)],
    )
    assert.deepEqual([unbound.journal_id, unbound.hello_ok, unbound.state], [null, false, 'bound'], 'nothing bound')
    assert.equal(helloRefusal(good), null)
    assert.equal(await hello(capability, good), 'ok', 'the valid v:1 binds')
    // Bound once: a malformed hello is still refused, and leaves the identity and its standing alone.
    assert.equal(await hello(capability, { ...good, v: null }), 'raw:22023')
    assert.equal(await hello(capability, { ...good, t3Namespace: 'client:another' }), 'conflict')
    assert.equal(await hello(capability, good), 'ok')
    // Another owner's capability is not this host.
    assert.equal(await hello(newSecret(), good), 'raw:42501')
  })

  it('refuses null or wrongly typed versions, kinds and ids on enqueue (worker role)', async () => {
    const w = await world()
    const h = await enroll(w)
    const port = await proxyFor(w)
    const created = await w.create()
    await pass(w, port, h, false)
    const envelope = await one<{ e: Parameters<typeof exchangeRequest>[1] }>(
      `SELECT sophia.owner_runner_envelope(o) e FROM sophia.owner_runner_operations o WHERE id=$1`,
      [created.operationId],
    )
    const request = exchangeRequest('observe', envelope.e, h.journal.id) as unknown as Record<string, unknown>
    const enqueue = (kind: string | null, body: unknown) =>
      worker
        .query<{ r: { result: string; exchangeId?: string } }>(
          'SELECT sophia.owner_host_enqueue($1, $2, $3, $4, $5, $6::jsonb, $7) AS r',
          [
            w.who,
            'env-owner-1',
            h.journal.id,
            kind,
            `observe:${created.operationId}:${randomUUID()}`,
            JSON.stringify(body),
            5000,
          ],
        )
        .then(
          (r) => r.rows[0]?.r ?? { result: 'none' },
          (err: unknown): { result: string; exchangeId?: string } => ({
            result: `raw:${(err as { code?: string }).code ?? String(err)}`,
          }),
        )
    const badRequests: [string, string | null, unknown][] = [
      ['kind null', null, request],
      ['v null', 'observe', { ...request, v: null }],
      ['v "1"', 'observe', { ...request, v: '1' }],
      ['v omitted', 'observe', omit(request, 'v')],
      ['request kind null', 'observe', { ...request, kind: null }],
      ['journalId null', 'observe', { ...request, journalId: null }],
      ['operationId a number', 'observe', { ...request, operationId: 5 }],
    ]
    const results: Record<string, string> = {}
    for (const [name, kind, body] of badRequests) results[name] = (await enqueue(kind, body)).result
    assert.deepEqual(
      results,
      Object.fromEntries(badRequests.map(([name]) => [name, 'raw:22023'])),
      'refused at enqueue',
    )
    const queued = await enqueue('observe', request)
    assert.equal(queued.result, 'queued', 'the valid request is queued')
  })

  it('refuses an answer whose kind is missing, null or not a string (API role), and keeps the exchange open', async () => {
    const w = await world()
    const h = await enroll(w)
    const port = await proxyFor(w)
    const created = await w.create()
    await pass(w, port, h, false)
    const envelope = await one<{ e: Parameters<typeof exchangeRequest>[1] }>(
      `SELECT sophia.owner_runner_envelope(o) e FROM sophia.owner_runner_operations o WHERE id=$1`,
      [created.operationId],
    )
    const request = exchangeRequest('observe', envelope.e, h.journal.id) as unknown as Record<string, unknown>
    const enqueue = (kind: string | null, body: unknown) =>
      worker
        .query<{ r: { result: string; exchangeId?: string } }>(
          'SELECT sophia.owner_host_enqueue($1, $2, $3, $4, $5, $6::jsonb, $7) AS r',
          [
            w.who,
            'env-owner-1',
            h.journal.id,
            kind,
            `observe:${created.operationId}:${randomUUID()}`,
            JSON.stringify(body),
            5000,
          ],
        )
        .then(
          (r) => r.rows[0]?.r ?? { result: 'none' },
          (err: unknown): { result: string; exchangeId?: string } => ({
            result: `raw:${(err as { code?: string }).code ?? String(err)}`,
          }),
        )
    const queued = await enqueue('observe', request)
    assert.equal(queued.result, 'queued')
    const delivered = await h.channel.poll(5, 1)
    assert.ok(delivered.some((d) => d.exchangeId === queued.exchangeId))
    const answer = (body: unknown) =>
      api
        .query<{ r: { result: string } }>('SELECT sophia.owner_host_answer($1, $2, $3::jsonb) AS r', [
          secretDigest(h.capability),
          queued.exchangeId,
          JSON.stringify(body),
        ])
        .then(
          (r) => r.rows[0]?.r.result ?? 'none',
          (err: unknown) => `raw:${(err as { code?: string }).code ?? String(err)}`,
        )
    const badAnswers = [{}, { kind: null }, { kind: 5 }, { kind: ['run'] }, { reason: 'no kind' }]
    const answered: Record<string, string> = {}
    for (const body of badAnswers) answered[JSON.stringify(body)] = await answer(body)
    assert.deepEqual(
      answered,
      Object.fromEntries(badAnswers.map((b) => [JSON.stringify(b), 'raw:22023'])),
      'refused at answer',
    )
    assert.equal(
      (await one<{ state: string }>(`SELECT state FROM sophia.owner_host_exchanges WHERE id=$1`, [queued.exchangeId]))
        .state,
      'delivered',
    )
    assert.equal(await answer({ kind: 'unknown', reason: 'not read yet' }), 'ok')
  })
})
