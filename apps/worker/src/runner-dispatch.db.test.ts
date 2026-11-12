// The owner-runner path end to end (INC01-CC-002 r2; migration 0092, amendment A47), level: sql-run on real PostgreSQL
// with the production split (member admissions on sophia_api under RLS, dispatch on sophia_worker), through the one
// SophiaRunnerPort: an owner gateway with a real fsynced, locked disk journal over a FAKE T3 transport. Every case
// counts the transport's calls and native effects. Each fence has its own fresh fixture and asserts its own branch.
// The qualification rows are SYNTHETIC fixtures written by the migration owner: nothing here qualifies a real owner
// route, account, T3 install or provider.
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { OwnerHostAgent } from '@sophia/coordination/owner-host-agent'
import { newSecret, type GoResult, type HostChannel, type HostHello } from '@sophia/coordination/owner-host-channel'
import { OwnerHostPortProxy } from '@sophia/coordination/owner-host-port-proxy'
import { FakeT3 } from '@sophia/coordination/runner-fake-t3'
import { RunnerGateway, type GatewayProfile } from '@sophia/coordination/runner-gateway'
import { RunnerJournal } from '@sophia/coordination/runner-journal'
import {
  digestOf,
  type RunnerIdentity,
  type RunObservation,
  type SophiaRunnerPort,
} from '@sophia/coordination/runner-port'
import {
  launchCommandId,
  stableMessageId,
  type T3Call,
  type T3Reply,
  type T3Transport,
} from '@sophia/coordination/t3-port-mapping'
import {
  admitGoalCommand,
  admitRunnerOperation,
  claimRunnerOutbox,
  createOwnerHostPairing,
  createPool,
  DbExchangeStore,
  DbHostChannel,
  maintainRunnerOperations,
  prepareRunnerSend,
  readRunnerOperation,
  recordRunnerAnswer,
  redeemOwnerHostPairing,
  runnerFollowups,
  withActor,
} from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { runnerDispatchFromEnv, runnerDispatchOnce } from './runner-dispatch.ts'

/** The admission request, as persistence takes it (the worker does not depend on the contracts package). */
type OwnerRunnerOperationRequest = Parameters<typeof admitRunnerOperation>[3]
const PIN = 'ade473018d32003658b7d38693e083ee2e314bd8'
/** SYNTHETIC source facts (0096): a requested base and a declared policy with one model and one effort option. */
const BASE = '0123456789abcdef0123456789abcdef01234567'
const POLICY = {
  v: 1,
  instanceId: 'claudeAgent',
  models: [{ model: 'synthetic-model', options: [{ id: 'effort', values: ['low', 'high'] }] }],
} as const
const SETTINGS = { instanceId: 'claudeAgent', model: 'synthetic-model', options: [{ id: 'effort', value: 'high' }] }

let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let owner: pg.Pool
const root = mkdtempSync(join(tmpdir(), 'sophia-runner-dispatch-'))
const gateways: RunnerGateway[] = []

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 4 })
  worker = createPool(db.workerUrl, { max: 4 })
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
    // A DomainError's code (the worker does not depend on @sophia/domain).
    return err instanceof Error && 'code' in err && err.name === 'DomainError' ? String(err.code) : `raw:${String(err)}`
  }
}

interface Op {
  state: string
  reason: string | null
  native_namespace: string | null
  native_command_id: string | null
  native_thread_id: string | null
  native_message_id: string | null
  native_run_id: string | null
  native_delivery: string | null
  binding_id: string
  payload_source_id: string | null
  account_key: string
  gateway_journal_id: string | null
}
const op = (id: string) => one<Op>(`SELECT * FROM sophia.owner_runner_operations WHERE id=$1`, [id])
const binding = (id: string) => one<{ state: string }>(`SELECT state FROM sophia.execution_bindings WHERE id=$1`, [id])
const reservations = async (accountKey: string) =>
  (
    await owner.query<{ binding_id: string }>(
      `SELECT binding_id FROM sophia.owner_runner_reservations WHERE account_key=$1`,
      [accountKey],
    )
  ).rows
/** Make every pending row of the project due now (a requeue waits a second): no sleeping in tests. */
const due = (projectId: string) =>
  owner.query(`UPDATE sophia.outbox SET available_at=now() WHERE project_id=$1 AND state='pending'`, [projectId])
/** The dispatch lease of the project's claimed rows ran out (a crashed worker). */
const expireLeases = (projectId: string) =>
  owner.query(
    `UPDATE sophia.outbox SET lease_until=now()-interval '1 second' WHERE project_id=$1 AND state='dispatching'`,
    [projectId],
  )

/** owner_runner_record called as the worker does, with a raw answer: what the database itself accepts. */
const recordRaw = (projectId: string, operationId: string, journalId: string, answer: unknown) =>
  codeOf(
    worker
      .query('SELECT sophia.owner_runner_record($1, $2, NULL, $3, $4::jsonb)', [
        projectId,
        operationId,
        journalId,
        JSON.stringify(answer),
      ])
      .then(() => undefined),
  )

/**
 * A transport that can keep one `t3_thread_send` in transit (integrated r2, F01): the gateway gets a lost answer at
 * once, and the very same request reaches the fake T3 only when the test releases it. A delayed delivery, never a
 * resend: nothing here builds a request.
 */
class TransitT3 implements T3Transport {
  holdNextSend = false
  private readonly held: T3Call[] = []
  readonly fake: FakeT3
  constructor(fake: FakeT3) {
    this.fake = fake
  }
  namespace(): string {
    return this.fake.namespace()
  }
  async call(call: T3Call): Promise<T3Reply> {
    if (call.tool === 't3_thread_send' && this.holdNextSend) {
      this.holdNextSend = false
      this.held.push(call)
      return { kind: 'transport_error', reason: 'fake: the request is still in transit' }
    }
    return this.fake.call(call)
  }
  /** Deliver every held request now, exactly once. */
  async release(): Promise<number> {
    const landing = this.held.splice(0)
    for (const call of landing) await this.fake.call(call)
    return landing.length
  }
}

/**
 * Integrated r3 (F01): holds one send in transit like TransitT3, and meanwhile forges either that send's own reply or a
 * read item naming the held message, with a given run field. The request lands only on release, exactly once.
 */
class ForgingT3 implements T3Transport {
  holdNextSend = false
  forgedSendRun: Record<string, unknown> | null = null
  forgedReadRun: Record<string, unknown> | null = null
  private readonly held: { call: T3Call; messageId: string }[] = []
  readonly fake: FakeT3
  constructor(fake: FakeT3) {
    this.fake = fake
  }
  namespace(): string {
    return this.fake.namespace()
  }
  async call(call: T3Call): Promise<T3Reply> {
    if (call.tool === 't3_thread_send' && this.holdNextSend) {
      this.holdNextSend = false
      const messageId = stableMessageId(this.fake.namespace(), 'thread-send', String(call.args.clientRequestId))
      this.held.push({ call, messageId })
      if (!this.forgedSendRun) return { kind: 'transport_error', reason: 'fake: still in transit' }
      return {
        kind: 'ok',
        body: {
          threadId: call.args.threadId,
          messageId,
          status: 'running',
          delivery: 'started',
          ...this.forgedSendRun,
        },
      }
    }
    const reply = await this.fake.call(call)
    const held = this.held[0]
    if (call.tool !== 't3_thread_read' || !this.forgedReadRun || !held || reply.kind !== 'ok') return reply
    const body = reply.body as { items: unknown[] }
    const forged = { position: 900, messageId: held.messageId, ...this.forgedReadRun }
    return { kind: 'ok', body: { ...body, items: [...body.items, forged] } }
  }
  async release(): Promise<number> {
    this.forgedSendRun = null
    this.forgedReadRun = null
    const landing = this.held.splice(0)
    for (const h of landing) await this.fake.call(h.call)
    return landing.length
  }
}

interface WorldOptions {
  accountKey?: string
  t3?: FakeT3
  transport?: T3Transport
  who?: string
  allowance?: number
}

/** A project of a fresh owner, a synthetic native resource and qualification, and an owner gateway over a fake T3. */
async function world({
  accountKey = `claude:${randomUUID()}`,
  t3 = new FakeT3(),
  transport,
  who = randomUUID(),
  allowance = 50,
}: WorldOptions = {}) {
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
  const qualify = async (key: string, profileId = 'read-only-v1') => {
    const { id } = await one<{ id: string }>(
      `SELECT sophia.qualify_owner_runner($1, $2, $3, 'env-owner-1', 'project-sophia', $5, 1, 'gateway_enforced',
         $4, ARRAY['create','input','stop'], $6, now() + interval '1 day', 'synthetic fixture: not a live qualification') AS id`,
      [p.projectId, resourceId, PIN, key, profileId, allowance],
    )
    await owner.query(`SELECT sophia.declare_owner_runner_source_policy($1, $2, $3)`, [
      p.projectId,
      id,
      JSON.stringify(POLICY),
    ])
    return id
  }
  const qualificationId = await qualify(accountKey)
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
  const journalFile = join(root, `${randomUUID()}.jsonl`)
  const gateway = new RunnerGateway({ journal: new RunnerJournal(journalFile), transport: transport ?? t3, profile })
  gateways.push(gateway)
  /** The owner host restarts its gateway on the same journal (same journal id). */
  const restart = (old: RunnerGateway) => {
    old.close()
    const next = new RunnerGateway({ journal: new RunnerJournal(journalFile), transport: transport ?? t3, profile })
    gateways.push(next)
    return next
  }
  const runner = { ownerId: who, environmentRef: 'env-owner-1' }
  const claim = async () =>
    (await claimRunnerOutbox(worker, 'crashed-worker', runner, { newWork: true, limit: 50, leaseSeconds: 30 })).filter(
      (o) => o.project_id === p.projectId,
    )
  const admit = (req: Omit<OwnerRunnerOperationRequest, 'resourceId'>, key: string = randomUUID()) =>
    withActor(api, who, 'write', (c) => admitRunnerOperation(c, p.projectId, key, { ...req, resourceId }))
  const create = () =>
    admit({
      kind: 'create',
      goalId: p.goalId,
      title: 'Read-only qualification',
      message: 'Report the Ask admission boundary.',
      expectedGoalRevision: 1,
      expectedAuthorityEpoch: 1,
      sourceIds: [],
      baseCommit: BASE,
      writeScope: 'read_only',
      settings: SETTINGS,
    })
  const input = (target: string, message = 'And the outbox boundary?') =>
    admit({
      kind: 'input',
      targetOperationId: target,
      message,
      expectedGoalRevision: 1,
      expectedAuthorityEpoch: 1,
      sourceIds: [],
    })
  const stop = (target: string, key?: string) => admit({ kind: 'stop', targetOperationId: target }, key)
  const pass = (opts: { sends?: boolean; port?: SophiaRunnerPort; minAge?: number } = {}) =>
    runnerDispatchOnce(worker, {
      workerId: 'runner-test',
      runner,
      port: opts.port ?? gateway,
      sends: opts.sends ?? true,
      leaseSeconds: 30,
      followupMinAgeSeconds: opts.minAge ?? 0,
      log: (l) => {
        if (process.env.RUNNER_LOG) console.log(l)
      },
    })
  const finishAll = (status = 'completed') => {
    for (const t of t3.threads.values()) for (const r of t.runs) t3.finishRun(r.runId, status)
  }
  return {
    ...p,
    who,
    resourceId,
    connectionId,
    qualificationId,
    qualify,
    accountKey,
    journalFile,
    profile,
    gateway,
    restart,
    t3,
    runner,
    claim,
    admit,
    create,
    input,
    stop,
    pass,
    finishAll,
  }
}

describe('the owner-runner path', () => {
  it('sends a create once, observes it to settlement, and keeps the account reserved until then', async () => {
    const w = await world()
    const created = await w.create()
    assert.deepEqual((await w.pass()).sent, ['received'])
    const sent = await op(created.operationId)
    assert.equal(sent.state, 'received')
    assert.equal(sent.gateway_journal_id, w.gateway.journalId)
    assert.equal(sent.native_thread_id, launchCommandId('client:fake-session-1', `sophia:${created.operationId}`))
    assert.deepEqual(await reservations(w.accountKey), [{ binding_id: sent.binding_id }])
    await w.pass()
    assert.equal((await op(created.operationId)).state, 'received', 'still running: received is not done')
    w.t3.finishRun(sent.native_run_id ?? '')
    await w.pass()
    assert.equal((await op(created.operationId)).state, 'settled')
    assert.deepEqual(await reservations(w.accountKey), [])
    assert.equal(w.t3.effects.launches, 1)
  })

  it('lets concurrent passes send it once', async () => {
    const w = await world()
    await w.create()
    const passes = await Promise.all([w.pass(), w.pass(), w.pass()])
    assert.equal(passes.flatMap((p) => p.sent).length, 1)
    assert.equal(w.t3.count('t3_thread_launch'), 1)
  })

  it('requeues a claim that crashed before the send was prepared, and sends it once', async () => {
    const w = await world()
    const created = await w.create()
    await w.claim()
    await expireLeases(w.projectId)
    assert.ok((await w.pass()).maintained >= 1)
    assert.equal((await op(created.operationId)).state, 'admitted')
    await due(w.projectId)
    await w.pass()
    assert.equal((await op(created.operationId)).state, 'received')
    assert.equal(w.t3.effects.launches, 1)
  })

  it('keeps one prepared but never handed to its gateway unknown: no journal proves it unsent (r3, R2-F01)', async () => {
    const w = await world()
    const created = await w.create()
    const [row] = await w.claim()
    assert.equal(
      (await prepareRunnerSend(worker, w.projectId, row?.id ?? '', row?.lease_token ?? '', w.gateway.journalId)).result,
      'send',
    )
    await expireLeases(w.projectId)
    for (let i = 0; i < 3; i++) {
      await w.pass()
      await due(w.projectId)
    }
    const unsure = await op(created.operationId)
    assert.equal(unsure.state, 'unknown', 'never requeued: the named manual-settlement gap')
    assert.equal(unsure.native_command_id, null)
    assert.deepEqual(await reservations(w.accountKey), [{ binding_id: unsure.binding_id }])
    const outbox = await one<{ state: string }>(
      `SELECT ob.state FROM sophia.outbox ob JOIN sophia.owner_runner_operations o ON o.outbox_id=ob.id WHERE o.id=$1`,
      [created.operationId],
    )
    assert.equal(outbox.state, 'outcome_unknown')
    assert.equal(w.t3.calls.length, 0)
  })

  it('reconciles a native accept whose answer was lost, by its original identity, without a second send', async () => {
    const w = await world()
    const created = await w.create()
    w.t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    const p = await w.pass()
    assert.deepEqual(p.sent, ['unknown'])
    assert.equal(p.reconciled, 1)
    assert.equal((await op(created.operationId)).state, 'received')
    assert.equal(w.t3.count('t3_thread_launch'), 1)
  })

  it('keeps one lost before any effect unknown, with its reservation, and never sends it again', async () => {
    const w = await world()
    const created = await w.create()
    w.t3.inject('t3_thread_launch', { kind: 'lose_before_effect' })
    for (let i = 0; i < 3; i++) await w.pass()
    const unsure = await op(created.operationId)
    assert.equal(unsure.state, 'unknown')
    assert.deepEqual(await reservations(w.accountKey), [{ binding_id: unsure.binding_id }])
    assert.equal(w.t3.count('t3_thread_launch'), 1)
    assert.equal(w.t3.effects.launches, 0)
  })

  it('reads back an answer the gateway journaled but the service never recorded, after the gateway restarts', async () => {
    const w = await world()
    const created = await w.create()
    const [row] = await w.claim()
    const prepared = await prepareRunnerSend(
      worker,
      w.projectId,
      row?.id ?? '',
      row?.lease_token ?? '',
      w.gateway.journalId,
    )
    assert.equal(prepared.result, 'send')
    if (prepared.result !== 'send') return
    assert.equal(
      (await w.gateway.send(prepared.envelope, digestOf(prepared.envelope), w.gateway.journalId, prepared.payload))
        .kind,
      'received',
    )
    // The worker died before recording; the owner host restarted its gateway on the same journal: same journal id.
    await expireLeases(w.projectId)
    w.gateway.close()
    const restarted = new RunnerGateway({
      journal: new RunnerJournal(w.journalFile),
      transport: w.t3,
      profile: w.profile,
    })
    gateways.push(restarted)
    assert.equal(restarted.journalId, w.gateway.journalId)
    await w.pass({ port: restarted })
    assert.equal((await op(created.operationId)).state, 'received')
    assert.equal(w.t3.count('t3_thread_launch'), 1)
  })

  it('queues a follow-up behind a busy run and starts one on an idle thread, on the same binding', async () => {
    const w = await world()
    const created = await w.create()
    await w.pass()
    const busy = await w.input(created.operationId)
    await w.pass()
    assert.equal((await op(busy.operationId)).native_delivery, 'queued')
    w.finishAll()
    await w.pass()
    assert.equal((await op(busy.operationId)).state, 'settled')
    const idle = await w.input(created.operationId, 'One more question.')
    await w.pass()
    assert.equal((await op(idle.operationId)).native_delivery, 'started')
    assert.ok(w.t3.calls.filter((c) => c.tool === 't3_thread_send').every((c) => c.args.mode === 'queue'))
  })

  it('keeps a steered delivery unknown, its reservation held, however often it is reconciled', async () => {
    const w = await world()
    const created = await w.create()
    await w.pass()
    const steered = await w.input(created.operationId)
    w.t3.inject('t3_thread_send', { kind: 'deliver_as', delivery: 'steered' })
    await w.pass()
    await w.pass()
    assert.match((await op(steered.operationId)).reason ?? '', /steered/)
    w.finishAll()
    await w.pass()
    assert.equal((await reservations(w.accountKey)).length, 1, 'held while any operation of the binding is unsettled')
  })

  it('holds one account to one active assignment across projects, and waits rather than doubling capacity', async () => {
    const accountKey = `claude:${randomUUID()}`
    const t3 = new FakeT3()
    const who = randomUUID()
    const first = await world({ accountKey, t3, who })
    const second = await world({ accountKey, t3, who })
    second.gateway.close()
    const a = await first.create()
    await first.pass()
    const b = await second.create()
    assert.deepEqual((await first.pass()).prepared, ['deferred'])
    assert.equal((await op(b.operationId)).state, 'admitted')
    await expireLeases(first.projectId)
    await first.pass()
    assert.deepEqual(
      await reservations(accountKey),
      [{ binding_id: (await op(a.operationId)).binding_id }],
      'lease expiry releases nothing',
    )
    t3.finishRun((await op(a.operationId)).native_run_id ?? '')
    await first.pass()
    await due(second.projectId)
    await first.pass()
    assert.equal((await op(b.operationId)).state, 'received')
    assert.equal(t3.effects.launches, 2)
  })

  it("never sends, reconciles or observes another owner's operation through this runner", async () => {
    const t3 = new FakeT3()
    const mine = await world({ t3 })
    const theirs = await world({ t3 })
    const theirsOp = await theirs.create()
    const p = await mine.pass()
    assert.deepEqual(p.prepared, [])
    assert.equal(p.reconciled + p.observed, 0)
    assert.equal((await op(theirsOp.operationId)).state, 'admitted')
    assert.equal(t3.calls.length, 0)
  })

  it('with sends turned off after admission: no new send, while what was sent is still reconciled and observed', async () => {
    const w = await world()
    const sentBefore = await w.create()
    w.t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    await w.pass({ minAge: 3600 })
    assert.equal((await op(sentBefore.operationId)).state, 'unknown')
    const other = await world({ t3: w.t3, who: w.who })
    other.gateway.close()
    const waitingOp = await other.create()
    const off = await w.pass({ sends: false })
    assert.deepEqual(off.prepared, [])
    assert.equal(off.reconciled, 1)
    const reconciled = await op(sentBefore.operationId)
    assert.equal(reconciled.state, 'received')
    assert.equal(reconciled.native_namespace, 'client:fake-session-1')
    assert.equal((await op(waitingOp.operationId)).state, 'admitted', 'admitted work waits, visibly, unsent')
    assert.deepEqual(await reservations(w.accountKey), [{ binding_id: reconciled.binding_id }])
    w.t3.finishRun(reconciled.native_run_id ?? '')
    await w.pass({ sends: false })
    assert.equal((await op(sentBefore.operationId)).state, 'settled')
    assert.deepEqual(await reservations(w.accountKey), [])
    assert.equal(w.t3.effects.launches, 1)
  })
})

describe('only the bound journal speaks, and nothing proves no send (R1-F01, R2-F01)', () => {
  it('keeps an operation bound to a replaced journal unknown, its identities and reservation kept, never resent', async () => {
    const w = await world()
    const created = await w.create()
    w.t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    await w.pass({ minAge: 3600 })
    const unsure = await op(created.operationId)
    assert.equal(unsure.state, 'unknown')
    w.gateway.close()
    // A replacement journal, same owner, environment, account and profile: it proves nothing about the original.
    const replacement = new RunnerGateway({
      journal: new RunnerJournal(join(root, `${randomUUID()}.jsonl`)),
      transport: w.t3,
      profile: w.profile,
    })
    gateways.push(replacement)
    w.t3.renewSession('client:fake-session-2')
    const p = await w.pass({ port: replacement })
    assert.equal(p.reconciled + p.observed, 0, 'not followed through another journal')
    // Even if asked directly, an answer from the replacement changes nothing.
    const received = await recordRunnerAnswer(
      worker,
      { projectId: w.projectId, operationId: created.operationId, leaseToken: null, journalId: replacement.journalId },
      { kind: 'refused', reason: 'a replacement journal' },
    )
    assert.equal(received.changed, false)
    assert.equal(
      await recordRaw(w.projectId, created.operationId, replacement.journalId, { kind: 'not_sent', reason: 'empty' }),
      'resolved',
    )
    const kept = await op(created.operationId)
    assert.equal(kept.state, 'unknown')
    assert.equal(kept.gateway_journal_id, unsure.gateway_journal_id)
    assert.deepEqual(await reservations(w.accountKey), [{ binding_id: kept.binding_id }])
    assert.equal(w.t3.count('t3_thread_launch'), 1)
    assert.equal(w.t3.effects.launches, 1)
  })

  it('refuses a not_sent answer from any journal, with or without a recorded identity, changing nothing (r3)', async () => {
    const w = await world()
    const crashed = await w.create()
    const [row] = await w.claim()
    // Prepared through the original journal, then the worker died before calling it: possibly sent, no identity known.
    await prepareRunnerSend(worker, w.projectId, row?.id ?? '', row?.lease_token ?? '', w.gateway.journalId)
    await expireLeases(w.projectId)
    await maintainRunnerOperations(worker)
    assert.equal((await op(crashed.operationId)).native_command_id, null)
    const notSent = { kind: 'not_sent', reason: 'its journal has no record' }
    assert.equal(await recordRaw(w.projectId, crashed.operationId, randomUUID(), notSent), 'resolved', 'ignored')
    assert.equal((await op(crashed.operationId)).state, 'unknown')
    assert.match(
      await recordRaw(w.projectId, crashed.operationId, w.gateway.journalId, notSent),
      /Invalid runner answer/,
    )
    assert.equal((await op(crashed.operationId)).state, 'unknown')
    const w2 = await world()
    const lost = await w2.create()
    w2.t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    await w2.pass({ minAge: 3600 })
    assert.ok((await op(lost.operationId)).native_command_id)
    assert.match(
      await recordRaw(w2.projectId, lost.operationId, w2.gateway.journalId, notSent),
      /Invalid runner answer/,
    )
    assert.equal((await op(lost.operationId)).state, 'unknown')
    assert.equal(w.t3.calls.length, 0)
    assert.equal(w2.t3.effects.launches, 1)
  })

  for (const [prefix, keep] of [
    ['header only', 1],
    ['intent only', 2],
  ] as const) {
    it(`never relaunches after its journal is restored to a valid ${prefix} prefix, under a new namespace (r3, R2-F01)`, async () => {
      const w = await world()
      const created = await w.create()
      const [row] = await w.claim()
      const prepared = await prepareRunnerSend(
        worker,
        w.projectId,
        row?.id ?? '',
        row?.lease_token ?? '',
        w.gateway.journalId,
      )
      assert.equal(prepared.result, 'send')
      if (prepared.result !== 'send') return
      // T3 applies the launch and the receipt is lost; the worker then dies before recording anything in SQL.
      w.t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
      assert.equal(
        (await w.gateway.send(prepared.envelope, digestOf(prepared.envelope), w.gateway.journalId, prepared.payload))
          .kind,
        'unknown',
      )
      const boundTo = w.gateway.journalId
      w.gateway.close()
      // The owner host's journal is rolled back to a valid earlier prefix of itself: same header, same journal id.
      const lines = readFileSync(w.journalFile, 'utf8').split('\n').filter(Boolean)
      writeFileSync(w.journalFile, `${lines.slice(0, keep).join('\n')}\n`)
      w.t3.renewSession('client:fake-session-2')
      const restored = new RunnerGateway({
        journal: new RunnerJournal(w.journalFile),
        transport: w.t3,
        profile: w.profile,
      })
      gateways.push(restored)
      assert.equal(restored.journalId, boundTo)
      await expireLeases(w.projectId)
      for (let i = 0; i < 3; i++) {
        await w.pass({ port: restored })
        await due(w.projectId)
      }
      const kept = await op(created.operationId)
      assert.equal(kept.state, 'unknown', 'not requeued, not resent: an operator settles it')
      assert.equal(kept.gateway_journal_id, boundTo)
      assert.deepEqual(await reservations(w.accountKey), [{ binding_id: kept.binding_id }])
      assert.equal(w.t3.count('t3_thread_launch'), 1)
      assert.equal(w.t3.effects.launches, 1, 'one native thread, never a second under the new namespace')
      assert.equal(w.t3.threads.size, 1)
    })
  }

  it('reconciles an input lost across a renewed session by the original namespace, never resent in the new one', async () => {
    const w = await world()
    const created = await w.create()
    await w.pass()
    const sent = await w.input(created.operationId)
    w.t3.inject('t3_thread_send', { kind: 'lose_after_effect' })
    await w.pass({ minAge: 3600 })
    assert.equal((await op(sent.operationId)).state, 'unknown')
    w.t3.renewSession('client:fake-session-2')
    await w.pass()
    const found = await op(sent.operationId)
    assert.equal(found.state, 'received')
    assert.equal(found.native_namespace, 'client:fake-session-1')
    assert.equal(w.t3.count('t3_thread_send'), 1)
    assert.equal(w.t3.effects.messages, 1)
  })
})

describe('current authority at send: each fence denies with zero native calls (R1-F06)', () => {
  /** A create admitted and claimed, then `fence`, then prepare-send: it must deny, with `reason`. */
  async function fenced(fence: (w: Awaited<ReturnType<typeof world>>) => Promise<unknown>, reason: RegExp) {
    const w = await world()
    const created = await w.create()
    const [row] = await w.claim()
    assert.ok(row?.lease_token)
    await fence(w)
    const prepared = await prepareRunnerSend(worker, w.projectId, row.id, row.lease_token, w.gateway.journalId)
    assert.equal(prepared.result, 'denied')
    assert.match(prepared.result === 'denied' ? prepared.reason : '', reason)
    assert.equal((await op(created.operationId)).state, 'denied')
    assert.equal(w.t3.calls.length, 0)
    assert.deepEqual(await reservations(w.accountKey), [])
  }

  it('the qualification revoked', () =>
    fenced(
      (w) => owner.query(`SELECT sophia.revoke_owner_runner($1, $2, 'synthetic')`, [w.projectId, w.qualificationId]),
      /qualification/,
    ))
  it('the owner demoted', () =>
    fenced(
      (w) =>
        owner.query(
          `UPDATE sophia.project_members SET role='viewer', revision=revision+1 WHERE project_id=$1 AND actor_id=$2`,
          [w.projectId, w.who],
        ),
      /no longer start work/,
    ))
  it("the owner's membership changed", () =>
    fenced(
      (w) =>
        owner.query(`UPDATE sophia.project_members SET revision=revision+1 WHERE project_id=$1 AND actor_id=$2`, [
          w.projectId,
          w.who,
        ]),
      /membership changed/,
    ))
  it('the goal held', () =>
    fenced(
      (w) =>
        withActor(api, w.who, 'write', (c) =>
          admitGoalCommand(c, w.projectId, randomUUID(), {
            kind: 'hold',
            goalId: w.goalId,
            expectedGoalRevision: 1,
            expectedAuthorityEpoch: 1,
            bodySourceId: null,
          }),
        ),
      /authority epoch moved on/,
    ))
  it("the goal's revision moved without its epoch", () =>
    fenced(
      (w) =>
        owner.query(`UPDATE sophia.goals SET revision=revision+1 WHERE project_id=$1 AND id=$2`, [
          w.projectId,
          w.goalId,
        ]),
      /goal changed/,
    ))
  it("the connection's authentication expired", () =>
    fenced(
      (w) =>
        owner.query(`UPDATE sophia.execution_connections SET expires_at=now()-interval '1 second' WHERE id=$1`, [
          w.connectionId,
        ]),
      /authentication expired/,
    ))
  it('the connection rotated', () =>
    fenced(
      (w) => owner.query(`UPDATE sophia.execution_connections SET revision=revision+1 WHERE id=$1`, [w.connectionId]),
      /connection changed/,
    ))
  it('the resource revoked', () =>
    fenced(
      (w) => owner.query(`UPDATE sophia.executor_resources SET state='revoked' WHERE id=$1`, [w.resourceId]),
      /resource changed/,
    ))

  it('refuses admission, and qualification, on a connection already expired', async () => {
    const w = await world()
    await owner.query(`UPDATE sophia.execution_connections SET expires_at=now()-interval '1 hour' WHERE id=$1`, [
      w.connectionId,
    ])
    assert.equal(await codeOf(w.create()), 'runner_unqualified')
    await owner.query(`SELECT sophia.revoke_owner_runner($1, $2, 'synthetic')`, [w.projectId, w.qualificationId])
    await assert.rejects(w.qualify(w.accountKey), /unexpired/)
  })
})

describe('a Stop fences its binding at once and stays available (R1-F05, R1-F04)', () => {
  it('denies waiting inputs and refuses new ones; only the stop crosses; settlement waits for proof', async () => {
    const w = await world()
    const created = await w.create()
    await w.pass()
    const waiting = await w.input(created.operationId)
    const stopped = await w.stop(created.operationId)
    const b = (await op(created.operationId)).binding_id
    assert.equal((await binding(b)).state, 'stopping')
    assert.equal((await op(waiting.operationId)).state, 'denied', 'denied in the Stop transaction')
    assert.equal(await codeOf(w.input(created.operationId)), 'invalid_state', 'no new input while stopping')
    await w.pass()
    assert.equal(w.t3.count('t3_thread_send'), 0)
    assert.equal(w.t3.count('t3_thread_interrupt'), 1)
    const ack = await op(stopped.operationId)
    assert.equal(ack.state, 'received')
    assert.equal(ack.native_delivery, 'stop_requested')
    await w.pass()
    assert.equal((await op(stopped.operationId)).state, 'received', 'still running: acknowledged, not settled')
    assert.equal((await binding(b)).state, 'stopping')
    w.finishAll('interrupted')
    await w.pass()
    assert.equal((await op(stopped.operationId)).state, 'settled')
    assert.equal((await binding(b)).state, 'settled')
    assert.deepEqual(await reservations(w.accountKey), [])
  })

  it('denies an input claimed before the Stop, at its prepare-send', async () => {
    const w = await world()
    const created = await w.create()
    await w.pass()
    const raced = await w.input(created.operationId)
    const [row] = await w.claim()
    assert.ok(row?.lease_token)
    await w.stop(created.operationId)
    const prepared = await prepareRunnerSend(worker, w.projectId, row.id, row.lease_token, w.gateway.journalId)
    assert.equal(prepared.result, 'denied')
    assert.equal((await op(raced.operationId)).state, 'denied')
    await w.pass()
    assert.equal(w.t3.count('t3_thread_send'), 0)
  })

  it('admits a Stop at an exhausted work allowance, consuming none; a second Stop under a fresh key is refused', async () => {
    const w = await world({ allowance: 1 })
    const created = await w.create()
    await w.pass()
    assert.equal(await codeOf(w.input(created.operationId)), 'runner_unqualified', 'new work: allowance used')
    const firstKey = randomUUID()
    const first = await w.stop(created.operationId, firstKey)
    assert.equal(
      await codeOf(w.stop(created.operationId)),
      'invalid_state',
      'integrated r2 F02: never an unbound success',
    )
    assert.equal((await w.stop(created.operationId, firstKey)).operationId, first.operationId, 'its own key replays')
    const used = await one<{ used: number }>(
      `SELECT used_operations AS used FROM sophia.owner_runner_qualifications WHERE id=$1`,
      [w.qualificationId],
    )
    assert.equal(used.used, 1)
    await w.pass()
    assert.equal(w.t3.count('t3_thread_interrupt'), 1)
  })

  it('keeps a Stop answered no_active_run acknowledged until a complete read proves the thread settled', async () => {
    const w = await world()
    const created = await w.create()
    await w.pass()
    w.finishAll()
    await w.pass()
    const stopped = await w.stop(created.operationId)
    w.t3.inject('t3_thread_read', { kind: 'malformed_read' })
    await w.pass()
    const ack = await op(stopped.operationId)
    assert.equal(ack.native_delivery, 'no_active_run')
    assert.equal(ack.state, 'received', 'an acknowledgement is not settlement, and a malformed read proves nothing')
    assert.equal((await binding(ack.binding_id)).state, 'stopping')
    await w.pass()
    assert.equal((await op(stopped.operationId)).state, 'settled')
    assert.equal((await binding(ack.binding_id)).state, 'settled')
  })
})

describe('turning new work off keeps the qualified Stop (r3, R2-F08)', () => {
  const outboxOf = (operationId: string) =>
    one<{ state: string; attempts: number }>(
      `SELECT ob.state, ob.attempts FROM sophia.outbox ob JOIN sophia.owner_runner_operations o ON o.outbox_id=ob.id
        WHERE o.id=$1`,
      [operationId],
    )

  it('with sends off: no launch or input crosses, one admitted Stop does, and settles only on proof', async () => {
    const w = await world()
    const created = await w.create()
    await w.pass()
    assert.equal((await op(created.operationId)).state, 'received')
    // Admitted before the switch: another create (a new binding) and an input on the running one.
    const waitingCreate = await w.create()
    const waitingInput = await w.input(created.operationId)
    const quiet = await w.pass({ sends: false })
    assert.deepEqual(quiet.prepared, [])
    assert.equal((await op(waitingInput.operationId)).state, 'admitted')
    const stopped = await w.stop(created.operationId)
    assert.equal((await op(waitingInput.operationId)).state, 'denied', "the Stop's fence, unchanged")
    const off = await w.pass({ sends: false })
    assert.deepEqual(off.prepared, ['send'])
    assert.deepEqual(off.sent, ['received'])
    assert.equal(w.t3.count('t3_thread_interrupt'), 1)
    assert.equal(w.t3.count('t3_thread_launch'), 1, 'only the create sent before the switch')
    assert.equal(w.t3.count('t3_thread_send'), 0)
    assert.equal(w.t3.effects.launches, 1)
    assert.equal(w.t3.effects.messages, 0)
    assert.deepEqual(await outboxOf(waitingCreate.operationId), { state: 'pending', attempts: 0 }, 'never claimed')
    assert.equal((await op(waitingCreate.operationId)).state, 'admitted')
    const ack = await op(stopped.operationId)
    assert.equal(ack.state, 'received', 'acknowledged, not settled')
    assert.equal((await binding(ack.binding_id)).state, 'stopping')
    w.finishAll('interrupted')
    await w.pass({ sends: false })
    assert.equal((await op(stopped.operationId)).state, 'settled')
    assert.equal((await binding(ack.binding_id)).state, 'settled')
    assert.equal(w.t3.count('t3_thread_interrupt'), 1)
    assert.equal((await op(waitingCreate.operationId)).state, 'admitted', 'still waiting for new work to be on')
  })

  it('with sends off: a Stop whose route was revoked after admission is denied at prepare-send, nothing sent', async () => {
    const w = await world()
    const created = await w.create()
    await w.pass()
    const stopped = await w.stop(created.operationId)
    await owner.query(`SELECT sophia.revoke_owner_runner($1, $2, 'synthetic')`, [w.projectId, w.qualificationId])
    const off = await w.pass({ sends: false })
    assert.deepEqual(off.prepared, ['denied'])
    assert.equal((await op(stopped.operationId)).state, 'denied')
    assert.equal(w.t3.count('t3_thread_interrupt'), 0)
  })

  it("with sends off: another owner's admitted Stop is never claimed through this runner", async () => {
    const t3 = new FakeT3()
    const mine = await world({ t3 })
    const theirs = await world({ t3 })
    const theirsCreate = await theirs.create()
    await theirs.pass()
    const theirsStop = await theirs.stop(theirsCreate.operationId)
    const off = await mine.pass({ sends: false })
    assert.deepEqual(off.prepared, [])
    assert.equal((await op(theirsStop.operationId)).state, 'admitted')
    assert.equal(t3.count('t3_thread_interrupt'), 0)
  })
})

describe("a follow-up never moves its binding's route (R1-F07)", () => {
  it('refuses a follow-up or Stop after a requalification to another account or profile; nothing crosses', async () => {
    const w = await world()
    const created = await w.create()
    await w.pass()
    const pendingInput = await w.input(created.operationId)
    // Rotate: revoke, advance the connection and its account, qualify the same resource under another account/profile.
    await owner.query(`SELECT sophia.revoke_owner_runner($1, $2, 'synthetic rotation')`, [
      w.projectId,
      w.qualificationId,
    ])
    await owner.query(
      `UPDATE sophia.execution_connections SET revision=revision+1, upstream_subject='another-account' WHERE id=$1`,
      [w.connectionId],
    )
    const otherKey = `claude:${randomUUID()}`
    await w.qualify(otherKey, 'read-only-v2')
    assert.equal(await codeOf(w.input(created.operationId)), 'runner_unqualified')
    assert.equal(await codeOf(w.stop(created.operationId)), 'runner_unqualified')
    // The input admitted under the original route is denied at send, never funded by the new account.
    await w.pass()
    assert.equal((await op(pendingInput.operationId)).state, 'denied')
    assert.equal(w.t3.count('t3_thread_send'), 0)
    assert.deepEqual(await reservations(otherKey), [], 'no second reservation for the old binding')
    assert.equal(
      (await reservations(w.accountKey)).length,
      1,
      'the original reservation stays with the original account',
    )
  })
})

/** The binding's operations, by kind and state, oldest first. */
const bindingOps = async (bindingId: string) =>
  (
    await owner.query<{ id: string; kind: string; state: string; reason: string | null }>(
      `SELECT id, kind, state, reason FROM sophia.owner_runner_operations WHERE binding_id=$1 ORDER BY created_at`,
      [bindingId],
    )
  ).rows

describe('a Stop settles only after every earlier input has converged (integrated r2, F01)', () => {
  it('keeps a Stop unresolved over an input still in transit; the late input is reconciled, a second Stop ends it', async () => {
    const t3 = new FakeT3()
    const transit = new TransitT3(t3)
    const w = await world({ t3, transport: transit })
    const created = await w.create()
    await w.pass()
    const b = (await op(created.operationId)).binding_id
    transit.holdNextSend = true
    const late = await w.input(created.operationId)
    await w.pass({ minAge: 3600 })
    assert.equal((await op(late.operationId)).state, 'unknown', 'sent, its answer lost, its request still in transit')
    w.finishAll()
    // Rollback (admissions and sends off) still admits and dispatches the Stop.
    const stopped = await w.stop(created.operationId)
    await w.pass({ sends: false })
    await w.pass({ sends: false })
    const waiting = await op(stopped.operationId)
    assert.equal(waiting.state, 'received', 'no active run now, but an earlier input may still arrive')
    assert.match(waiting.reason ?? '', /earlier input/)
    assert.equal((await binding(b)).state, 'stopping')
    assert.deepEqual(await reservations(w.accountKey), [{ binding_id: b }])
    // The very request in transit lands after the interrupt; the owner host reconnects under a renewed session.
    assert.equal(await transit.release(), 1)
    const restarted = w.restart(w.gateway)
    t3.renewSession('client:fake-session-2')
    await w.pass({ sends: false, port: restarted })
    await w.pass({ sends: false, port: restarted })
    const landed = await op(late.operationId)
    assert.equal(landed.state, 'received', 'reconciled by its original identities')
    assert.equal(landed.native_namespace, 'client:fake-session-1')
    const overtaken = await op(stopped.operationId)
    assert.equal(overtaken.state, 'received', 'its late run is active: still not settled')
    assert.match(overtaken.reason ?? '', /after this Stop was sent/)
    assert.equal((await binding(b)).state, 'stopping')
    // The owner's control: a second Stop, admitted because the first was overtaken, reaches the late run.
    const again = await w.stop(created.operationId)
    assert.notEqual(again.operationId, stopped.operationId)
    await w.pass({ sends: false, port: restarted })
    assert.equal(t3.count('t3_thread_interrupt'), 2)
    w.finishAll('interrupted')
    await w.pass({ sends: false, port: restarted })
    await w.pass({ sends: false, port: restarted })
    assert.deepEqual(
      (await bindingOps(b)).map((o) => [o.kind, o.state]),
      [
        ['create', 'settled'],
        ['input', 'settled'],
        ['stop', 'settled'],
        ['stop', 'settled'],
      ],
    )
    assert.equal((await binding(b)).state, 'settled')
    assert.deepEqual(await reservations(w.accountKey), [])
    assert.equal(t3.effects.launches, 1)
    assert.equal(t3.effects.messages, 1, 'the late request once; nothing replayed')
    assert.equal(t3.count('t3_thread_send'), 1, 'the fake saw the one released request; nothing was resent')
  })

  it('keeps the Stop unresolved while a lost-response input is unreconciled, and still after its queued run is cancelled (repair 8)', async () => {
    const w = await world()
    const created = await w.create()
    await w.pass()
    w.t3.inject('t3_thread_send', { kind: 'lose_after_effect' })
    const lost = await w.input(created.operationId)
    await w.pass({ minAge: 3600 })
    assert.equal((await op(lost.operationId)).state, 'unknown')
    const stopped = await w.stop(created.operationId)
    await w.pass({ minAge: 3600 })
    assert.equal((await op(stopped.operationId)).state, 'received')
    w.finishAll('interrupted')
    // The create's and the input's reads fail this pass (they are followed before the Stop, which was followed last),
    // so the Stop is observed while the input is still unknown.
    w.t3.inject('t3_thread_read', { kind: 'malformed_read' })
    w.t3.inject('t3_thread_read', { kind: 'malformed_read' })
    await w.pass()
    assert.equal((await op(lost.operationId)).state, 'unknown')
    assert.equal(
      (await op(stopped.operationId)).state,
      'received',
      'the barrier holds while an earlier input is unknown',
    )
    await w.pass()
    await w.pass()
    // Repair 8 (NATIVE7-F01): the Stop cancelled the input's queued run, so no read proves it ever started or is still
    // queued: the input stays unknown, the barrier holds, and an operator settles it. Nothing is sent again.
    assert.equal((await op(lost.operationId)).state, 'unknown')
    const s = await op(stopped.operationId)
    assert.equal(s.state, 'received', 'no settlement over an unproven input')
    assert.equal((await binding(s.binding_id)).state, 'stopping')
    assert.deepEqual(await reservations(w.accountKey), [{ binding_id: s.binding_id }])
    assert.equal(w.t3.effects.messages, 1)
    assert.equal(w.t3.count('t3_thread_interrupt'), 1)
  })

  it('never settles a Stop over an input possibly sent and never answered: an operator settles it', async () => {
    const w = await world()
    const created = await w.create()
    await w.pass()
    const sent = await w.input(created.operationId)
    const [row] = await w.claim()
    assert.equal(
      (await prepareRunnerSend(worker, w.projectId, row?.id ?? '', row?.lease_token ?? '', w.gateway.journalId)).result,
      'send',
    )
    const stopped = await w.stop(created.operationId)
    await expireLeases(w.projectId)
    w.finishAll()
    for (let i = 0; i < 4; i++) {
      await w.pass()
      await due(w.projectId)
    }
    assert.equal((await op(sent.operationId)).state, 'unknown')
    const s = await op(stopped.operationId)
    assert.equal(s.state, 'received')
    assert.match(s.reason ?? '', /earlier input/)
    assert.equal((await binding(s.binding_id)).state, 'stopping')
    assert.deepEqual(await reservations(w.accountKey), [{ binding_id: s.binding_id }])
    assert.equal(w.t3.effects.messages, 0)
  })

  it("never settles from a gateway's cached settlement: a lost Stop needs a fresh read after its inputs converge", async () => {
    const t3 = new FakeT3()
    const transit = new TransitT3(t3)
    const w = await world({ t3, transport: transit })
    const created = await w.create()
    await w.pass()
    transit.holdNextSend = true
    const late = await w.input(created.operationId)
    await w.pass({ minAge: 3600 })
    w.finishAll()
    const stopped = await w.stop(created.operationId)
    t3.inject('t3_thread_interrupt', { kind: 'lose_after_effect' })
    await w.pass({ minAge: 3600 })
    assert.equal((await op(stopped.operationId)).state, 'unknown')
    await w.pass()
    assert.equal((await op(stopped.operationId)).state, 'unknown', 'the read showed no run, but an input is in transit')
    // Recorded directly, the journaled settlement is still no settlement.
    const cached = await recordRunnerAnswer(
      worker,
      { projectId: w.projectId, operationId: stopped.operationId, leaseToken: null, journalId: w.gateway.journalId },
      { kind: 'settled', identity: null, reason: 'a cached read' },
    )
    assert.equal(cached.changed, false)
    assert.equal((await op(stopped.operationId)).state, 'unknown')
    assert.equal(await transit.release(), 1)
    await w.pass()
    await w.pass()
    assert.equal((await op(late.operationId)).state, 'received')
    assert.equal((await op(stopped.operationId)).state, 'unknown', "the gateway's journaled settlement predates run 2")
    w.finishAll('interrupted')
    await w.pass()
    await w.pass()
    assert.equal((await op(stopped.operationId)).state, 'settled')
    const records = await one<{ outbox: string; command: string }>(
      `SELECT ob.state AS outbox, c.state AS command FROM sophia.owner_runner_operations o
        JOIN sophia.outbox ob ON ob.id=o.outbox_id JOIN sophia.commands c ON c.id=o.command_id WHERE o.id=$1`,
      [stopped.operationId],
    )
    assert.deepEqual(
      records,
      { outbox: 'settled', command: 'checked' },
      'a lost Stop, proven settled, settles its records',
    )
    assert.equal(t3.effects.messages, 1)
  })

  it('never settles on an observation made before an earlier input converged, even if recorded after it', async () => {
    const t3 = new FakeT3()
    const transit = new TransitT3(t3)
    const w = await world({ t3, transport: transit })
    const created = await w.create()
    await w.pass()
    transit.holdNextSend = true
    const late = await w.input(created.operationId)
    await w.pass({ minAge: 3600 })
    w.finishAll()
    const stopped = await w.stop(created.operationId)
    await w.pass({ minAge: 3600 })
    assert.equal((await op(stopped.operationId)).state, 'received')
    // The Stop is observed (no active run); before that observation is recorded, the input lands and converges.
    const inner = w.gateway
    let armed = true
    const interleaving: SophiaRunnerPort = {
      get journalId() {
        return inner.journalId
      },
      send: (e, d, j) => inner.send(e, d, j),
      reconcile: (i) => inner.reconcile(i),
      observe: async (i: RunnerIdentity): Promise<RunObservation> => {
        const seen = await inner.observe(i)
        if (!armed || i.envelope.operationId !== stopped.operationId) return seen
        armed = false
        assert.equal(seen.kind, 'no_active_run', 'run 2 has not started when the Stop is observed')
        assert.equal(await transit.release(), 1)
        const f = (await runnerFollowups(worker, w.runner, inner.journalId, 50, 0)).find(
          (x) => x.operationId === late.operationId,
        )
        assert.ok(f)
        const answer = await inner.reconcile({
          envelope: f.envelope,
          digest: digestOf(f.envelope),
          journalId: inner.journalId,
        })
        await recordRunnerAnswer(
          worker,
          { projectId: w.projectId, operationId: late.operationId, leaseToken: null, journalId: inner.journalId },
          answer,
        )
        assert.equal((await op(late.operationId)).state, 'received')
        return seen
      },
    }
    await w.pass({ port: interleaving })
    assert.equal(armed, false)
    assert.equal((await op(stopped.operationId)).state, 'received', 'the observation predates run 2: no settlement')
    assert.equal((await binding((await op(stopped.operationId)).binding_id)).state, 'stopping')
    await w.pass()
    assert.equal((await op(stopped.operationId)).state, 'received', 'run 2 is active')
    w.finishAll('interrupted')
    await w.pass()
    assert.equal((await op(stopped.operationId)).state, 'settled')
  })
})

/** The promise's outcome, asserted to arrive before an independent deadline of this test's own. */
async function settled<T>(
  what: string,
  p: Promise<T>,
  ms: number,
): Promise<{ ok: true; v: T } | { ok: false; e: unknown }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const sentinel = new Promise<'sentinel'>((resolve) => {
    timer = setTimeout(() => resolve('sentinel'), ms)
  })
  try {
    const won = await Promise.race([
      p.then(
        (v) => ({ ok: true as const, v }),
        (e: unknown) => ({ ok: false as const, e }),
      ),
      sentinel,
    ])
    if (won === 'sentinel') assert.fail(`${what} did not finish within ${ms} ms: the independent sentinel won`)
    return won
  } finally {
    clearTimeout(timer)
  }
}
const sqlstate = (e: unknown) => (e instanceof Error && 'code' in e ? String(e.code) : String(e))

describe('a missing or malformed run identity never lifts the Stop barrier (integrated r3, F01)', () => {
  const BAD_RUNS: readonly [string, Record<string, unknown>][] = [
    ['missing', {}],
    ['null', { runId: null }],
    ['a number', { runId: 19 }],
    ['an object', { runId: {} }],
    ['empty', { runId: '' }],
    ['blank', { runId: '   ' }],
  ]
  for (const path of ['direct receipt', 'reconcile read'] as const) {
    for (const [what, run] of BAD_RUNS) {
      it(`${path}, runId ${what}: the input stays unknown, the Stop unsettled; the held request lands once`, async () => {
        const t3 = new FakeT3()
        const forging = new ForgingT3(t3)
        const w = await world({ t3, transport: forging })
        const created = await w.create()
        await w.pass()
        const b = (await op(created.operationId)).binding_id
        forging.holdNextSend = true
        if (path === 'direct receipt') forging.forgedSendRun = run
        else forging.forgedReadRun = run
        const late = await w.input(created.operationId)
        await w.pass({ minAge: 3600 })
        w.finishAll()
        const stopped = await w.stop(created.operationId)
        await w.pass()
        await w.pass()
        await w.pass()
        const held = await op(late.operationId)
        assert.equal(held.state, 'unknown', 'no valid run: not received')
        assert.equal(held.native_run_id, null)
        assert.notEqual((await op(stopped.operationId)).state, 'settled')
        assert.equal((await binding(b)).state, 'stopping')
        assert.deepEqual(await reservations(w.accountKey), [{ binding_id: b }])
        // The very request lands after the interrupt; the owner host restarts under a renewed session.
        assert.equal(await forging.release(), 1)
        const restarted = w.restart(w.gateway)
        t3.renewSession('client:fake-session-2')
        await w.pass({ port: restarted })
        await w.pass({ port: restarted })
        const landed = await op(late.operationId)
        assert.equal(landed.state, 'received', 'its real run, by its original identities')
        assert.ok(landed.native_run_id && landed.native_run_id.trim().length > 0)
        assert.equal(landed.native_namespace, 'client:fake-session-1')
        assert.notEqual((await op(stopped.operationId)).state, 'settled', 'its run is active')
        assert.equal(t3.effects.messages, 1, 'landed once; never replayed')
        assert.equal(t3.effects.launches, 1)
      })
    }
  }
})

describe('maintenance takes its locks in the recorder order (integrated r2, F03)', () => {
  it('never deadlocks with a recorder holding the project: no 40P01, the operation stays unknown and reserved', async () => {
    const w = await world()
    const created = await w.create()
    const [row] = await w.claim()
    assert.equal(
      (await prepareRunnerSend(worker, w.projectId, row?.id ?? '', row?.lease_token ?? '', w.gateway.journalId)).result,
      'send',
    )
    await expireLeases(w.projectId)
    const recorder = await owner.connect()
    const maintainer = await worker.connect()
    let open = false
    try {
      await recorder.query('BEGIN')
      open = true
      // The recorder's first step: the project, before any operation or outbox row.
      await recorder.query('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE', [w.projectId])
      const maintainerPid = (await maintainer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid
      // Its outcome is captured at once, so a failure is asserted below rather than surfacing as an unhandled rejection.
      const maintained = maintainer.query<{ n: number }>('SELECT sophia.owner_runner_maintain(50) AS n').then(
        (r) => r,
        (e: unknown) => Promise.reject(e instanceof Error ? e : new Error(String(e))),
      )
      maintained.catch(() => undefined)
      // Until maintenance either finishes or waits on the recorder (the old row-first order), bounded.
      const blockedOrDone = (async () => {
        for (;;) {
          const { rows } = await owner.query<{ blocked: boolean; active: boolean }>(
            `SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked,
                    EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active') AS active`,
            [maintainerPid],
          )
          if (rows[0]?.blocked || !rows[0]?.active) return
          await new Promise((r) => setTimeout(r, 20))
        }
      })()
      await settled('maintenance to finish or wait on the recorder', blockedOrDone, 10_000)
      const recorded = recorder.query('SELECT sophia.owner_runner_record($1, $2, NULL, $3, $4::jsonb) AS r', [
        w.projectId,
        created.operationId,
        w.gateway.journalId,
        JSON.stringify({ kind: 'unknown', identity: null, reason: 'the recorder answers while maintenance runs' }),
      ])
      const rec = await settled('the recorder', recorded, 10_000)
      await recorder.query(rec.ok ? 'COMMIT' : 'ROLLBACK')
      open = false
      const main = await settled('maintenance', maintained, 10_000)
      assert.ok(rec.ok, `recorder failed: ${rec.ok ? '' : sqlstate(rec.e)}`)
      assert.ok(main.ok, `maintenance failed: ${main.ok ? '' : sqlstate(main.e)}`)
    } finally {
      if (open) await recorder.query('ROLLBACK').catch(() => undefined)
      recorder.release()
      maintainer.release()
    }
    await w.pass({ minAge: 3600 })
    const kept = await op(created.operationId)
    assert.equal(kept.state, 'unknown')
    assert.deepEqual(await reservations(w.accountKey), [{ binding_id: kept.binding_id }])
    assert.equal(w.t3.calls.length, 0)
  })
})

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
const dbNow = async () => (await one<{ t: Date }>('SELECT clock_timestamp() AS t')).t

/**
 * Run `work` while another transaction holds `lockSql`, until the database's actual clock is past `until`; check that
 * the work is still waiting (`waiting`), then release the lock and return what the work did.
 */
async function whileLocked<T>(
  lockSql: string,
  params: unknown[],
  until: Date,
  work: () => Promise<T>,
  waiting: () => Promise<void>,
): Promise<T> {
  const locker = await owner.connect()
  let open = false
  try {
    await locker.query('BEGIN')
    open = true
    await locker.query(lockSql, params)
    assert.ok((await dbNow()) < until, 'the work starts before the deadline')
    const running = work()
    while ((await dbNow()) <= until) await sleep(50)
    await sleep(150)
    await waiting()
    await locker.query('ROLLBACK')
    open = false
    return await running
  } finally {
    if (open) await locker.query('ROLLBACK').catch(() => undefined)
    locker.release()
  }
}

/** Expire the route's qualification or its connection at `at` (the database's clock). */
async function expireAt(w: { qualificationId: string; connectionId: string }, what: string, at: Date) {
  if (what === 'qualification')
    await owner.query(`UPDATE sophia.owner_runner_qualifications SET expires_at=$2 WHERE id=$1`, [
      w.qualificationId,
      at,
    ])
  else await owner.query(`UPDATE sophia.execution_connections SET expires_at=$2 WHERE id=$1`, [w.connectionId, at])
}

describe('the decision clock: expiry is judged after every wait, before the possible send (INC01-30813-EXPIRY-F01)', () => {
  for (const what of ['qualification', 'connection'] as const) {
    for (const expires of [true, false]) {
      it(`a ${what} that ${expires ? 'expires' : 'stays valid'} while prepare-send waits on the project is ${expires ? 'denied with no native call' : 'sent once (control)'}`, async () => {
        const w = await world()
        const created = await w.create()
        const until = new Date((await dbNow()).getTime() + 1200)
        await expireAt(w, what, expires ? until : new Date(until.getTime() + 3_600_000))
        const pass = await whileLocked(
          'SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE',
          [w.projectId],
          until,
          () => w.pass(),
          async () => assert.equal((await op(created.operationId)).state, 'admitted', 'still waiting on the project'),
        )
        const o = await op(created.operationId)
        if (expires) {
          assert.deepEqual(pass.prepared, ['denied'])
          assert.deepEqual(pass.sent, [])
          assert.equal(o.state, 'denied')
          assert.match(o.reason ?? '', /expired|revoked, expired or changed/)
          assert.equal(w.t3.calls.length, 0, 'no native call after the expiry')
          assert.deepEqual(await reservations(w.accountKey), [], 'no account commitment')
          assert.equal((await binding(o.binding_id)).state, 'settled')
        } else {
          assert.deepEqual(pass.prepared, ['send'])
          assert.deepEqual(pass.sent, ['received'])
          assert.equal(o.state, 'received')
          assert.equal(w.t3.effects.launches, 1)
        }
      })
    }
  }

  for (const expires of [true, false]) {
    it(`an input whose qualification ${expires ? 'expires' : 'stays valid'} while prepare-send waits on the account's reservation is ${expires ? 'denied, its binding still committed' : 'sent once (control)'}`, async () => {
      const w = await world()
      const created = await w.create()
      await w.pass()
      assert.equal((await op(created.operationId)).state, 'received')
      const input = await w.input(created.operationId)
      const until = new Date((await dbNow()).getTime() + 1200)
      await expireAt(w, 'qualification', expires ? until : new Date(until.getTime() + 3_600_000))
      const pass = await whileLocked(
        'SELECT 1 FROM sophia.owner_runner_reservations WHERE account_key=$1 FOR UPDATE',
        [w.accountKey],
        until,
        () => w.pass(),
        async () => assert.equal((await op(input.operationId)).state, 'admitted', 'still waiting on the account'),
      )
      const o = await op(input.operationId)
      if (expires) {
        assert.deepEqual(pass.prepared, ['denied'])
        assert.equal(o.state, 'denied')
        assert.equal(w.t3.count('t3_thread_send'), 0, 'no native message after the expiry')
        assert.equal(w.t3.effects.messages, 0)
        // The create's own possible commitment is kept: its binding still holds the account.
        assert.deepEqual(await reservations(w.accountKey), [{ binding_id: o.binding_id }])
        assert.equal((await op(created.operationId)).state, 'received')
      } else {
        assert.deepEqual(pass.prepared, ['send'])
        assert.equal(o.state, 'received')
        assert.equal(w.t3.effects.messages, 1)
      }
    })
  }
})

/**
 * The FROZEN 0092 bytes of admission, eligibility and prepare-send, installed under legacy names: exactly how an operation
 * was admitted, prepared and sent BEFORE 0096. 0092 is not edited, and the current functions stay 0096's.
 */
let legacyInstalled = false
async function installLegacy0092() {
  if (legacyInstalled) return
  const sql = readFileSync(new URL('../../../db/migrations/0092_owner_runner_operations.sql', import.meta.url), 'utf8')
  const fn = (name: string) => {
    const start = sql.indexOf(`CREATE FUNCTION sophia.${name}(`)
    assert.ok(start >= 0, name)
    return sql.slice(start, sql.indexOf('END $$;', start) + 'END $$;'.length)
  }
  const ineligible = fn('owner_runner_ineligible').replace(
    'sophia.owner_runner_ineligible(',
    'sophia.legacy0092_ineligible(',
  )
  const admitFn = fn('admit_owner_runner_operation').replace(
    'sophia.admit_owner_runner_operation(',
    'sophia.legacy0092_admit(',
  )
  const prepare = fn('owner_runner_prepare_send')
    .replace('sophia.owner_runner_prepare_send(', 'sophia.legacy0092_prepare_send(')
    .replace('sophia.owner_runner_ineligible(o)', 'sophia.legacy0092_ineligible(o)')
  for (const statement of [ineligible, admitFn, prepare]) await owner.query(statement)
  await owner.query(`GRANT EXECUTE ON FUNCTION sophia.legacy0092_admit(uuid,text,jsonb,text) TO sophia_api`)
  await owner.query(`GRANT EXECUTE ON FUNCTION sophia.legacy0092_prepare_send(uuid,uuid,uuid,uuid) TO sophia_worker`)
  legacyInstalled = true
}

type World = Awaited<ReturnType<typeof world>>
const v1Create = (w: World) => ({
  kind: 'create',
  resourceId: w.resourceId,
  goalId: w.goalId,
  title: 'Read-only qualification',
  message: 'A v1 instruction, inline as before 0096.',
  expectedGoalRevision: 1,
  expectedAuthorityEpoch: 1,
})
/** Admit as 0092 did: the owner on sophia_api, inside withActor. */
async function legacyAdmit(w: World, request: Record<string, unknown>, key = randomUUID()) {
  await installLegacy0092()
  return withActor(api, w.who, 'write', async (c) => {
    const { rows } = await c.query<{ r: { operationId: string } }>(
      'SELECT sophia.legacy0092_admit($1, $2, $3, $4) AS r',
      [w.projectId, key, JSON.stringify(request), digestOf(request)],
    )
    return rows[0]?.r ?? assert.fail('no receipt')
  })
}
/** Prepare as 0092 did, send through the owner gateway, and record the answer under the lease. */
async function legacySend(w: World, operationId: string) {
  const outbox = (
    await one<{ outbox_id: string }>(`SELECT outbox_id FROM sophia.owner_runner_operations WHERE id=$1`, [operationId])
  ).outbox_id
  const row = (await w.claim()).find((r) => r.id === outbox)
  assert.ok(row?.lease_token)
  const { rows } = await worker.query<{ r: { result: string; envelope: Parameters<SophiaRunnerPort['send']>[0] } }>(
    'SELECT sophia.legacy0092_prepare_send($1, $2, $3, $4) AS r',
    [w.projectId, row.id, row.lease_token, w.gateway.journalId],
  )
  const prepared = rows[0]?.r
  assert.equal(prepared?.result, 'send')
  assert.equal(prepared?.envelope.v, 1)
  const envelope = prepared?.envelope ?? assert.fail('no envelope')
  const answer = await w.gateway.send(envelope, digestOf(envelope), w.gateway.journalId)
  await recordRunnerAnswer(
    worker,
    { projectId: w.projectId, operationId, leaseToken: row.lease_token, journalId: w.gateway.journalId },
    answer,
  )
  return { envelope, answer }
}
const journalRecords = (file: string) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type: string; operationId?: string; digest?: string; envelope?: { v: number } })

describe('v1 operations admitted before 0096: characterized, kept, never given new work', () => {
  it('a v1 create sent before 0096 keeps its bytes, observation, inline view and qualified Stop, and takes no input', async () => {
    const w = await world()
    const created = await legacyAdmit(w, v1Create(w))
    const { envelope, answer } = await legacySend(w, created.operationId)
    assert.equal(answer.kind, 'received')
    const launch = w.t3.calls.find((c) => c.tool === 't3_thread_launch')
    assert.equal(launch?.args.message, 'A v1 instruction, inline as before 0096.')
    assert.equal('workspaceStrategy' in (launch?.args ?? {}), false, 'a v1 launch asks for no base')
    assert.equal('modelSelection' in (launch?.args ?? {}), false, 'and for no settings')
    // Its envelope now is byte for byte the one journaled before 0096: the same digest binds it for every follow-up.
    const [followup] = (await runnerFollowups(worker, w.runner, w.gateway.journalId, 50, 0)).filter(
      (f) => f.operationId === created.operationId,
    )
    assert.equal(digestOf(followup?.envelope), digestOf(envelope))
    const intent = journalRecords(w.journalFile).find((r) => r.type === 'intent')
    assert.equal(intent?.digest, digestOf(followup?.envelope))
    const view = await withActor(api, w.who, 'read', (c) => readRunnerOperation(c, w.projectId, created.operationId))
    assert.equal(view.envelopeVersion, 1)
    assert.equal(view.content, 'inline')
    assert.equal(view.message, 'A v1 instruction, inline as before 0096.')
    assert.equal(view.sourceIds, null)
    // No new work on a v1 binding: it has no selection to bound an input.
    assert.equal(await codeOf(w.input(created.operationId)), 'invalid_request')
    // Its qualified Stop is unchanged: admitted, sent once, settled only by a proven read.
    await w.stop(created.operationId)
    await w.pass()
    assert.equal(w.t3.effects.stops, 1)
    w.finishAll()
    await w.pass()
    await w.pass()
    assert.equal((await binding((await op(created.operationId)).binding_id)).state, 'settled')
    assert.deepEqual(await reservations(w.accountKey), [])
    assert.equal(w.t3.effects.launches, 1)
  })

  it('a v1 create lost after its effect before 0096 is reconciled by its original identity, never relaunched', async () => {
    const w = await world()
    const created = await legacyAdmit(w, v1Create(w))
    w.t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    assert.equal((await legacySend(w, created.operationId)).answer.kind, 'unknown')
    assert.equal((await op(created.operationId)).state, 'unknown')
    await w.pass()
    assert.equal((await op(created.operationId)).state, 'received')
    assert.equal(w.t3.count('t3_thread_launch'), 1)
    assert.equal(w.t3.effects.launches, 1)
  })

  it('a v1 create admitted before 0096 but never sent is denied at its prepare-send, with no native call', async () => {
    const w = await world()
    const created = await legacyAdmit(w, v1Create(w))
    const pass = await w.pass()
    assert.deepEqual(pass.prepared, ['denied'])
    const o = await op(created.operationId)
    assert.equal(o.state, 'denied')
    assert.match(o.reason ?? '', /before source authority/)
    assert.equal(w.t3.calls.length, 0)
    assert.deepEqual(await reservations(w.accountKey), [])
    assert.equal((await binding(o.binding_id)).state, 'settled')
  })

  it('a key first admitted before 0096 replays its first receipt; another request under it conflicts', async () => {
    const w = await world()
    const key = randomUUID()
    const first = await legacyAdmit(w, v1Create(w), key)
    const { resourceId: _r, ...request } = v1Create(w)
    assert.deepEqual(await w.admit(request as OwnerRunnerOperationRequest, key), first)
    assert.equal(
      await codeOf(w.admit({ ...request, message: 'Something else.' } as OwnerRunnerOperationRequest, key)),
      'idempotency_conflict',
    )
  })
})

/** A project-scoped, eligible, ready source, as the existing source flows write one (put_text_source). */
const projectSource = async (w: World, body: string) =>
  (
    await one<{ id: string }>(`SELECT (sophia.put_text_source($1, $2, 'text/plain', $3)).id AS id`, [
      w.projectId,
      w.who,
      body,
    ])
  ).id
/** Erase a source as every existing caller does: the project locked first, then mission_erase_source. */
async function erase(projectId: string, sourceId: string) {
  const c = await owner.connect()
  try {
    await c.query('BEGIN')
    await c.query('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE', [projectId])
    await c.query('SELECT sophia.mission_erase_source($1, $2)', [projectId, sourceId])
    await c.query('COMMIT')
  } catch (err) {
    await c.query('ROLLBACK')
    throw err
  } finally {
    c.release()
  }
}
const createWith = (w: World, sourceIds: string[], message = 'A private instruction: report the boundary.') =>
  w.admit({
    kind: 'create',
    goalId: w.goalId,
    title: 'A private title',
    message,
    expectedGoalRevision: 1,
    expectedAuthorityEpoch: 1,
    sourceIds,
    baseCommit: BASE,
    writeScope: 'read_only',
    settings: SETTINGS,
  })
const viewOf = (w: World, operationId: string) =>
  withActor(api, w.who, 'read', (c) => readRunnerOperation(c, w.projectId, operationId))

describe('source authority across the dispatcher, gateway, fsynced journal and FakeT3 (INC01-CC-005, 0096)', () => {
  it("sends each create's and input's own instruction, the requested base and settings, and journals no body", async () => {
    const w = await world()
    const spec = await projectSource(w, 'A shared project spec')
    const created = await createWith(w, [spec])
    await w.pass()
    assert.equal((await op(created.operationId)).state, 'received')
    const launch = w.t3.calls.find((c) => c.tool === 't3_thread_launch')
    assert.equal(launch?.args.message, 'A private instruction: report the boundary.')
    assert.equal(launch?.args.title, 'A private title')
    assert.deepEqual(launch?.args.workspaceStrategy, { type: 'worktree', baseRef: BASE })
    assert.deepEqual(launch?.args.modelSelection, SETTINGS)
    const input = await w.admit({
      kind: 'input',
      targetOperationId: created.operationId,
      message: 'A second private instruction.',
      expectedGoalRevision: 1,
      expectedAuthorityEpoch: 1,
      sourceIds: [spec],
    })
    await w.pass()
    const send = w.t3.calls.find((c) => c.tool === 't3_thread_send')
    assert.equal(send?.args.message, 'A second private instruction.')
    assert.equal('modelSelection' in (send?.args ?? {}), false, 'an input runs in its create thread')
    // Each its own private instruction and context; nothing of either text in the gateway's journal.
    const rows = await owner.query<{ payload_source_id: string; manifest_id: string; envelope_version: number }>(
      `SELECT payload_source_id, manifest_id, envelope_version FROM sophia.owner_runner_operations WHERE id = ANY($1)`,
      [[created.operationId, input.operationId]],
    )
    assert.equal(new Set(rows.rows.map((r) => r.payload_source_id)).size, 2)
    assert.equal(new Set(rows.rows.map((r) => r.manifest_id)).size, 2)
    assert.ok(rows.rows.every((r) => r.envelope_version === 2))
    const journal = readFileSync(w.journalFile, 'utf8')
    for (const text of ['private instruction', 'A private title', 'second private'])
      assert.equal(journal.includes(text), false)
    assert.ok(journalRecords(w.journalFile).some((r) => r.type === 'intent' && r.envelope?.v === 2))
  })

  it('a withdrawal before prepare-send denies it at once, with no native call and no body in the view', async () => {
    const w = await world()
    const spec = await projectSource(w, 'A spec withdrawn before the send')
    const created = await createWith(w, [spec])
    await erase(w.projectId, spec)
    const o = await op(created.operationId)
    assert.equal(o.state, 'denied')
    assert.match(o.reason ?? '', /withdrawn before it was sent/)
    await w.pass()
    assert.equal(w.t3.calls.length, 0)
    assert.deepEqual(await reservations(w.accountKey), [])
    const view = await viewOf(w, created.operationId)
    assert.equal(view.content, 'withdrawn')
    assert.equal(view.message, null)
    assert.equal(view.title, null)
    assert.deepEqual(view.sourceIds, [spec])
    assert.equal(view.baseCommit, BASE)
  })

  it('a withdrawal of a source in the closure, or of the instruction itself, after the claim is denied by prepare-send', async () => {
    for (const which of ['closure', 'instruction'] as const) {
      const w = await world()
      const base = await projectSource(w, 'An upstream source')
      const derived = await projectSource(w, 'A source derived from it')
      await owner.query(
        `INSERT INTO sophia.source_dependencies(project_id, source_id, derived_source_id) VALUES ($1,$2,$3)`,
        [w.projectId, base, derived],
      )
      const created = await createWith(w, [derived])
      const [row] = await w.claim()
      assert.ok(row?.lease_token)
      const payload = await op(created.operationId)
      await erase(w.projectId, which === 'closure' ? base : (payload.payload_source_id ?? ''))
      const prepared = await prepareRunnerSend(worker, w.projectId, row.id, row.lease_token, w.gateway.journalId)
      assert.equal(prepared.result, 'denied', which)
      assert.equal(w.t3.calls.length, 0)
      assert.equal((await viewOf(w, created.operationId)).content, 'withdrawn')
    }
  })

  it('after a possible send, a withdrawal keeps the state, the commitment and the reconciliation by original identity', async () => {
    const w = await world()
    const spec = await projectSource(w, 'A spec withdrawn after the send')
    const created = await createWith(w, [spec])
    w.t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    await w.pass({ minAge: 3600 })
    const prior = await op(created.operationId)
    assert.equal(prior.state, 'unknown')
    await erase(w.projectId, spec)
    const later = await op(created.operationId)
    assert.equal(later.state, 'unknown', 'never denied, reset or replayed after a possible send')
    assert.equal(later.native_command_id, prior.native_command_id)
    assert.deepEqual(await reservations(w.accountKey), [{ binding_id: later.binding_id }])
    const marked = await one<{ at: Date | null }>(
      `SELECT source_withdrawn_at AS at FROM sophia.owner_runner_operations WHERE id=$1`,
      [created.operationId],
    )
    assert.ok(marked.at)
    assert.equal((await viewOf(w, created.operationId)).content, 'withdrawn')
    // Reconciled by its original identity: the body is never needed again, and nothing is relaunched.
    await w.pass()
    assert.equal((await op(created.operationId)).state, 'received')
    assert.equal(w.t3.count('t3_thread_launch'), 1)
    assert.equal(w.t3.effects.launches, 1)
  })

  for (const [what, change] of [
    ['audience', 'UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=$1'],
    ['eligibility', 'UPDATE sophia.projects SET eligibility_revision=eligibility_revision+1 WHERE id=$1'],
  ] as const) {
    it(`a moved ${what} revision denies before prepare-send, never re-snapshotted`, async () => {
      const w = await world()
      const created = await createWith(w, [])
      await owner.query(change, [w.projectId])
      const pass = await w.pass()
      assert.deepEqual(pass.prepared, ['denied'])
      assert.match((await op(created.operationId)).reason ?? '', new RegExp(what))
      assert.equal(w.t3.calls.length, 0)
    })
  }

  it('an altered stored instruction is denied; a payload altered in transit is refused by the gateway before intent', async () => {
    const w = await world()
    const altered = await createWith(w, [])
    const o = await op(altered.operationId)
    await owner.query(`UPDATE sophia.source_texts SET body=replace(body,'report','delete') WHERE source_id=$1`, [
      o.payload_source_id,
    ])
    assert.deepEqual((await w.pass()).prepared, ['denied'])
    assert.equal(w.t3.calls.length, 0)
    const w2 = await world()
    const created = await createWith(w2, [])
    const [row] = await w2.claim()
    assert.ok(row?.lease_token)
    const prepared = await prepareRunnerSend(worker, w2.projectId, row.id, row.lease_token, w2.gateway.journalId)
    assert.equal(prepared.result, 'send')
    if (prepared.result !== 'send') return
    assert.ok(prepared.payload?.includes('report the boundary'))
    const forged = prepared.payload?.replace('report', 'delete')
    const answer = await w2.gateway.send(prepared.envelope, digestOf(prepared.envelope), w2.gateway.journalId, forged)
    assert.equal(answer.kind, 'refused')
    assert.equal(w2.t3.calls.length, 0)
    const records = journalRecords(w2.journalFile)
    assert.ok(records.some((r) => r.type === 'refused' && r.operationId === created.operationId))
    assert.equal(
      records.some((r) => r.type === 'intent'),
      false,
      'nothing journaled as possibly sent',
    )
  })

  it('a selected source that is no longer eligible by any path, or whose hash moved, is denied before prepare-send', async () => {
    for (const change of [
      `UPDATE sophia.source_objects SET eligible=false WHERE id=$1`,
      `UPDATE sophia.source_objects SET sha256=repeat('e',64) WHERE id=$1`,
    ]) {
      const w = await world()
      const spec = await projectSource(w, 'A spec changed outside the erase hook')
      const created = await createWith(w, [spec])
      await owner.query(change, [spec])
      assert.deepEqual((await w.pass()).prepared, ['denied'], change)
      assert.match(
        (await op(created.operationId)).reason ?? '',
        /a source it was admitted with was withdrawn or changed/,
      )
      assert.equal(w.t3.calls.length, 0)
    }
  })

  it('restarts a journal holding a v1 and a v2 operation, and resends neither', async () => {
    const w = await world()
    const old = await legacyAdmit(w, v1Create(w))
    await legacySend(w, old.operationId)
    w.finishAll()
    await w.stop(old.operationId)
    await w.pass()
    await w.pass()
    assert.deepEqual(await reservations(w.accountKey), [])
    const created = await createWith(w, [])
    await w.pass()
    assert.equal((await op(created.operationId)).state, 'received')
    const versions = journalRecords(w.journalFile)
      .filter((r) => r.type === 'intent')
      .map((r) => r.envelope?.v)
    assert.deepEqual(
      versions.toSorted((a, b) => Number(a) - Number(b)),
      [1, 1, 2],
    )
    const restarted = w.restart(w.gateway)
    assert.equal(restarted.journalId, w.gateway.journalId)
    await w.pass({ port: restarted })
    await w.pass({ port: restarted })
    assert.equal(w.t3.effects.launches, 2)
    assert.equal(w.t3.count('t3_thread_launch'), 2)
  })
})

// ---- repair 1 (gate INC01-CC-005-final-53f42da1-SOURCE-PRE-PUSH-001) ----

const SECRET_MESSAGE = 'SECRET-INSTRUCTION-7f3a'
const SECRET_TITLE = 'SECRET-TITLE-9b1c'
const textOf = (v: unknown) => (typeof v === 'string' ? v : '')
/** A FakeT3 that echoes a call's instruction and title through one untrusted diagnostic field of its reply. */
class EchoT3 extends FakeT3 {
  mode: 'failure' | 'transport' | 'throw' | null = null
  override async call(call: T3Call): Promise<T3Reply> {
    const send = call.tool === 't3_thread_launch' || call.tool === 't3_thread_send'
    if (!send || this.mode === null) return super.call(call)
    const echo = `${textOf(call.args.title)} ${textOf(call.args.message)}`
    if (this.mode === 'failure') return { kind: 'failure', code: 'invalid_request', message: echo }
    if (this.mode === 'transport') return { kind: 'transport_error', reason: echo }
    throw new Error(echo)
  }
}
const leaks = (text: string | null | undefined) =>
  (text ?? '').includes(SECRET_MESSAGE) || (text ?? '').includes(SECRET_TITLE)

describe('a private instruction never becomes a diagnostic (repair 1, CC005-E7-F01)', () => {
  for (const mode of ['failure', 'transport', 'throw'] as const) {
    it(`keeps a ${mode} that echoes it out of the operation's reason, its events and the view, before and after erasure`, async () => {
      const t3 = new EchoT3()
      t3.mode = mode
      const w = await world({ t3 })
      const created = await createWith(w, [], `${SECRET_MESSAGE}: report the boundary.`)
      await w.pass({ minAge: 3600 })
      const o = await op(created.operationId)
      assert.notEqual(o.state, 'admitted')
      assert.equal(leaks(o.reason), false, o.reason ?? '')
      await erase(w.projectId, o.payload_source_id ?? '')
      const view = await viewOf(w, created.operationId)
      assert.equal(view.content, 'withdrawn')
      assert.equal(leaks(view.reason), false, view.reason ?? '')
      assert.equal(leaks(JSON.stringify(view)), false)
      // A reconciliation after the erasure (the journal answers it) restores nothing of it either.
      t3.mode = null
      await w.pass()
      assert.equal(leaks((await op(created.operationId)).reason), false)
      const events = await owner.query<{ summary_code: string }>(
        `SELECT summary_code FROM sophia.project_events WHERE project_id=$1`,
        [w.projectId],
      )
      assert.equal(leaks(JSON.stringify(events.rows)), false)
      assert.equal(leaks(readFileSync(w.journalFile, 'utf8')), false)
      assert.equal(w.t3.count('t3_thread_launch') <= 1, true)
    })
  }
})

describe('a port that throws the instruction back (repair 1, CC005-E7-F01)', () => {
  it("records a fixed reason, never the port's error text", async () => {
    const w = await world()
    const created = await createWith(w, [], `${SECRET_MESSAGE}: report the boundary.`)
    const throwing: SophiaRunnerPort = {
      journalId: w.gateway.journalId,
      send: (_e, _d, _j, payload) => Promise.reject(new Error(`echo ${String(payload)}`)),
      reconcile: (i) => w.gateway.reconcile(i),
      observe: (i) => w.gateway.observe(i),
    }
    await w.pass({ port: throwing, minAge: 3600 })
    const o = await op(created.operationId)
    assert.equal(o.state, 'unknown')
    assert.equal(leaks(o.reason), false, o.reason ?? '')
  })
})

const sends = (w: World) => w.t3.count('t3_thread_send')
const inputWith = (w: World, target: string, sourceIds: string[], message = 'A follow-up instruction.') =>
  w.admit({
    kind: 'input',
    targetOperationId: target,
    message,
    expectedGoalRevision: 1,
    expectedAuthorityEpoch: 1,
    sourceIds,
  })

describe("an input is fenced by its native session's whole disclosed context (repair 1, CC005-E7-F02)", () => {
  /** A received create with one selected source, and, when asked, one received input with its own instruction. */
  async function session(withInput = false) {
    const w = await world()
    const spec = await projectSource(w, 'A spec the create selected')
    const created = await createWith(w, [spec])
    await w.pass()
    assert.equal((await op(created.operationId)).state, 'received')
    let earlier: string | null = null
    if (withInput) {
      earlier = (await inputWith(w, created.operationId, [spec], 'An earlier input.')).operationId
      await w.pass()
      assert.equal((await op(earlier)).state, 'received')
    }
    return { w, spec, created: created.operationId, earlier }
  }

  for (const [what, withdraw] of [
    ["the create's selected source", async (s: Awaited<ReturnType<typeof session>>) => erase(s.w.projectId, s.spec)],
    [
      "the create's private instruction",
      async (s: Awaited<ReturnType<typeof session>>) =>
        erase(s.w.projectId, (await op(s.created)).payload_source_id ?? ''),
    ],
    [
      "an earlier input's private instruction",
      async (s: Awaited<ReturnType<typeof session>>) =>
        erase(s.w.projectId, (await op(s.earlier ?? '')).payload_source_id ?? ''),
    ],
    [
      "a revision of the create's selected source",
      async (s: Awaited<ReturnType<typeof session>>) => {
        await owner.query(
          `UPDATE sophia.source_objects SET sha256=repeat('e',64), eligibility_revision=eligibility_revision+1 WHERE id=$1`,
          [s.spec],
        )
      },
    ],
  ] as const) {
    it(`refuses a new input with an empty selection once ${what} is withdrawn or changed`, async () => {
      const s = await session(what.includes('earlier'))
      const sentBefore = sends(s.w)
      await withdraw(s)
      assert.equal(await codeOf(inputWith(s.w, s.created, [])), 'invalid_request')
      await s.w.pass()
      assert.equal(sends(s.w), sentBefore, 'no native message')
    })

    it(`denies an admitted input before prepare-send once ${what} is withdrawn or changed`, async () => {
      const s = await session(what.includes('earlier'))
      const sentBefore = sends(s.w)
      const queued = await inputWith(s.w, s.created, [])
      await withdraw(s)
      await s.w.pass()
      assert.equal((await op(queued.operationId)).state, 'denied')
      assert.equal(sends(s.w), sentBefore, 'no native message')
    })
  }

  it('never rebases a selected source onto another revision under the same id', async () => {
    const s = await session()
    await owner.query(`UPDATE sophia.source_objects SET sha256=repeat('e',64) WHERE id=$1`, [s.spec])
    assert.equal(await codeOf(inputWith(s.w, s.created, [s.spec])), 'invalid_request')
  })

  it("refuses a new input once the project's audience moved since its create", async () => {
    const s = await session()
    await owner.query('UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=$1', [s.w.projectId])
    assert.equal(await codeOf(inputWith(s.w, s.created, [])), 'invalid_request')
  })

  it('keeps an unchanged session usable, and its qualified Stop after a withdrawal', async () => {
    const s = await session(true)
    await inputWith(s.w, s.created, [s.spec])
    await s.w.pass()
    assert.equal(s.w.t3.effects.messages, 2, 'an unchanged subset is still sent')
    await erase(s.w.projectId, s.spec)
    await s.w.stop(s.created)
    await s.w.pass()
    assert.equal(s.w.t3.count('t3_thread_interrupt'), 1)
  })
})

describe('characters are code points from admission to the gateway (repair 1, CC005-E7-F03)', () => {
  const rocket = '\u{1F680}'
  const allowance = async (w: World) =>
    (
      await one<{ used: number }>(
        `SELECT used_operations AS used FROM sophia.owner_runner_qualifications WHERE id=$1`,
        [w.qualificationId],
      )
    ).used
  const createText = (w: World, message: string, title: string) =>
    w.admit({
      kind: 'create',
      goalId: w.goalId,
      title,
      message,
      expectedGoalRevision: 1,
      expectedAuthorityEpoch: 1,
      sourceIds: [],
      baseCommit: BASE,
      writeScope: 'read_only',
      settings: SETTINGS,
    })

  for (const [name, message, title] of [
    ['4001 supplementary characters', rocket.repeat(4001), 'T'],
    ['8000 supplementary characters and a 120-character title', rocket.repeat(8000), rocket.repeat(120)],
    ['8000 mixed characters', `a${rocket}`.repeat(4000), `b${rocket}`.repeat(60)],
  ] as const) {
    it(`sends what it admits: ${name}`, async () => {
      const w = await world()
      const created = await createText(w, message, title)
      await w.pass()
      assert.equal((await op(created.operationId)).state, 'received')
      const launch = w.t3.calls.find((c) => c.tool === 't3_thread_launch')
      assert.equal(launch?.args.message, message)
      assert.equal(launch?.args.title, title)
    })
  }

  it('sends an input of 8000 supplementary characters', async () => {
    const w = await world()
    const created = await createText(w, 'm', 'T')
    await w.pass()
    await inputWith(w, created.operationId, [], rocket.repeat(8000))
    await w.pass()
    assert.equal(w.t3.calls.find((c) => c.tool === 't3_thread_send')?.args.message, rocket.repeat(8000))
  })

  for (const [name, message, title] of [
    ['8001 characters', rocket.repeat(8001), 'T'],
    ['a 121-character title', 'm', rocket.repeat(121)],
    ['a message of only non-ASCII blank characters', '  　', 'T'],
    ['a title of only line breaks', 'm', '\n\n'],
  ] as const) {
    it(`refuses before any write or allowance: ${name}`, async () => {
      const w = await world()
      const used = await allowance(w)
      assert.equal(await codeOf(createText(w, message, title)), 'invalid_request')
      assert.equal(await allowance(w), used)
      assert.equal(w.t3.calls.length, 0)
    })
  }
})

// ---- repair 2 (PR505-33-F01): revocation and the final prepare-send decision serialize ----

/** Ungranted locks in this test database: a backend genuinely waiting on another (pg_locks), optionally one backend. */
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
  let done = false
  work.then(
    () => (done = true),
    () => (done = true),
  )
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (done) return 'settled'
    if ((await ungranted(pid)) > 0) return 'waiting'
    await new Promise((resolve) => setTimeout(resolve, 10))
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
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
const pidOf = async (c: pg.PoolClient) =>
  (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0
const revokeSql = `SELECT sophia.revoke_owner_runner($1, $2, 'synthetic revocation')`

describe('revocation and the final prepare-send decision serialize (repair 2, PR505-33-F01)', () => {
  it('a revocation waits for a prepare-send that decided first; that send keeps its commitment', async () => {
    const w = await world()
    await w.create()
    const locker = await owner.connect()
    const revoker = await owner.connect()
    const revokerPid = await pidOf(revoker)
    try {
      // Prepare-send's own event insert is held back: it has made its final check and marked the possible send.
      await locker.query('BEGIN')
      await locker.query('LOCK TABLE sophia.project_events IN SHARE MODE')
      const pass = w.pass()
      await untilWaitingOn('sophia.project_events')
      const revoke = revoker.query(revokeSql, [w.projectId, w.qualificationId])
      assert.equal(
        await settledOrWaiting(revoke, revokerPid),
        'waiting',
        'the revocation waits for the decision that holds the authority lock',
      )
      await locker.query('ROLLBACK')
      const done = await pass
      await revoke
      assert.deepEqual(done.prepared, ['send'])
      assert.deepEqual(done.sent, ['received'])
      assert.equal(w.t3.effects.launches, 1)
      assert.equal((await reservations(w.accountKey)).length, 1, 'its account commitment is kept')
      // The revocation is in force for what comes after.
      assert.equal(await codeOf(w.create()), 'runner_unqualified')
    } finally {
      await locker.query('ROLLBACK').catch(() => undefined)
      locker.release()
      revoker.release()
    }
  })

  it("a prepare-send waits for a connection revoked by a writer that holds only the connection's row", async () => {
    const w = await world()
    const created = await w.create()
    const operator = await owner.connect()
    try {
      // An operator's direct update: no project lock, only the connection row.
      await operator.query('BEGIN')
      await operator.query(`UPDATE sophia.execution_connections SET state='revoked', revision=revision+1 WHERE id=$1`, [
        w.connectionId,
      ])
      const pass = w.pass()
      assert.equal(await settledOrWaiting(pass), 'waiting', "prepare-send waits on the connection's row")
      await operator.query('COMMIT')
      const done = await pass
      assert.deepEqual(done.prepared, ['denied'])
      assert.equal((await op(created.operationId)).state, 'denied')
      assert.equal(w.t3.calls.length, 0)
    } finally {
      await operator.query('ROLLBACK').catch(() => undefined)
      operator.release()
    }
  })

  it('a prepare-send waits for a revocation that holds the authority lock, then denies with no native call', async () => {
    const w = await world()
    const created = await w.create()
    const revoker = await owner.connect()
    try {
      await revoker.query('BEGIN')
      await revoker.query(revokeSql, [w.projectId, w.qualificationId])
      const pass = w.pass()
      assert.equal(await settledOrWaiting(pass), 'waiting', 'prepare-send waits for the revocation')
      await revoker.query('COMMIT')
      const done = await pass
      assert.deepEqual(done.prepared, ['denied'])
      assert.equal((await op(created.operationId)).state, 'denied')
      assert.equal(w.t3.calls.length, 0)
      assert.deepEqual(await reservations(w.accountKey), [])
    } finally {
      await revoker.query('ROLLBACK').catch(() => undefined)
      revoker.release()
    }
  })
})

// ---- repair 4 (gate INC01-CC-005-repair3-map-compose-SOURCE-PRE-PUSH-001: CC005-R3-F01) ----

/** The backends of this database waiting for `table`'s lock while running `fn` (pg_locks, pg_stat_activity). */
const waitersAt = async (table: string, fn: string) =>
  (
    await owner.query<{ pid: number }>(
      `SELECT l.pid FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
        WHERE NOT l.granted AND l.relation=$1::regclass AND a.datname=current_database() AND strpos(a.query, $2) > 0`,
      [table, fn],
    )
  ).rows.map((r) => r.pid)
/** What the barrier saw: the call waited on the final write before the limit, and still waited after it. */
interface Seen {
  waitedBefore?: boolean
  stillWaitingAfter?: boolean
}
/**
 * Run `work` while another transaction holds `table` in SHARE mode: only a write (ROW EXCLUSIVE) waits, never the reads
 * and row locks before it. Bounded: the call running `fn` must be observed waiting on `table` within 15 s, then the
 * database's clock must pass `until` within 30 s while it still waits. Then the lock is released.
 */
async function finalWriteWait<T>(table: string, fn: string, until: Date, work: () => Promise<T>, seen: Seen) {
  const locker = await owner.connect()
  let open = false
  try {
    await locker.query('BEGIN')
    open = true
    await locker.query(`LOCK TABLE ${table} IN SHARE MODE`)
    const running = work()
    running.catch(() => undefined)
    const deadline = Date.now() + 15_000
    let pid: number | undefined
    while (pid === undefined) {
      pid = (await waitersAt(table, fn))[0]
      if (pid === undefined && Date.now() >= deadline) throw new Error(`no ${fn} waited on ${table} within 15 s`)
      if (pid === undefined) await sleep(10)
    }
    seen.waitedBefore = (await dbNow()) < until
    const bound = Date.now() + 30_000
    while ((await dbNow()) <= until) {
      if (Date.now() >= bound) throw new Error('the database clock did not pass the limit within 30 s')
      await sleep(50)
    }
    seen.stillWaitingAfter = (await waitersAt(table, fn)).includes(pid)
    await locker.query('ROLLBACK')
    open = false
    return await running
  } finally {
    if (open) await locker.query('ROLLBACK').catch(() => undefined)
    locker.release()
  }
}
const eventsOf = async (operationId: string) =>
  (
    await owner.query<{ type: string }>(
      `SELECT type FROM sophia.project_events WHERE entity_type='runner_operation' AND entity_id=$1 ORDER BY sequence`,
      [operationId],
    )
  ).rows.map((r) => r.type)
const commandOf = async (operationId: string) =>
  (
    await one<{ state: string }>(
      `SELECT c.state FROM sophia.commands c JOIN sophia.owner_runner_operations o ON o.command_id=c.id WHERE o.id=$1`,
      [operationId],
    )
  ).state
const intents = (file: string) => journalRecords(file).filter((r) => r.type === 'intent')
const soon = async (ms = 1500) => new Date((await dbNow()).getTime() + ms)

describe('prepare-send decides after its last write wait (repair 4, CC005-R3-F01)', () => {
  const cases = [
    ['sophia.project_events', 'event INSERT', 'qualification'],
    ['sophia.project_events', 'event INSERT', 'connection'],
    ['sophia.commands', 'command UPDATE', 'qualification'],
  ] as const
  for (const [table, label, what] of cases) {
    for (const expires of [true, false]) {
      it(`a ${what} that ${expires ? 'expires' : 'stays valid'} while prepare-send waits on its ${label} is ${expires ? 'denied: no send, no sending event' : 'sent once (control)'}`, async () => {
        const w = await world()
        const created = await w.create()
        const until = await soon()
        await expireAt(w, what, expires ? until : new Date(until.getTime() + 3_600_000))
        const seen: Seen = {}
        const pass = await finalWriteWait(table, 'owner_runner_prepare_send', until, () => w.pass(), seen)
        assert.deepEqual(
          seen,
          { waitedBefore: true, stillWaitingAfter: true },
          'decided before the limit, written after',
        )
        const o = await op(created.operationId)
        if (expires) {
          assert.deepEqual(pass.prepared, ['denied'])
          assert.deepEqual(pass.sent, [])
          assert.equal(o.state, 'denied')
          assert.match(o.reason ?? '', /expired/)
          assert.equal(w.t3.calls.length, 0, 'no native call after the expiry')
          assert.equal(intents(w.journalFile).length, 0, 'nothing journaled as possibly sent')
          assert.deepEqual(await reservations(w.accountKey), [], 'no account commitment')
          assert.equal(o.gateway_journal_id, null, 'bound to no journal')
          assert.equal(await commandOf(created.operationId), 'denied')
          const events = await eventsOf(created.operationId)
          assert.equal(events.includes('runner_operation.sending'), false, 'no sending event to replay')
          assert.equal(events.at(-1), 'runner_operation.denied')
        } else {
          assert.deepEqual(pass.prepared, ['send'])
          assert.deepEqual(pass.sent, ['received'])
          assert.equal(o.state, 'received')
          assert.equal(w.t3.effects.launches, 1)
          assert.equal((await eventsOf(created.operationId)).filter((e) => e === 'runner_operation.sending').length, 1)
        }
      })
    }
  }

  it('an input denied at its last write keeps the received create: binding, reservation, journal, and its later reconciliation', async () => {
    const w = await world()
    const created = await w.create()
    await w.pass()
    assert.equal((await op(created.operationId)).state, 'received')
    const bindingBefore = await binding((await op(created.operationId)).binding_id)
    const input = await w.input(created.operationId)
    const until = await soon()
    await expireAt(w, 'qualification', until)
    const seen: Seen = {}
    const pass = await finalWriteWait('sophia.project_events', 'owner_runner_prepare_send', until, () => w.pass(), seen)
    assert.deepEqual(seen, { waitedBefore: true, stillWaitingAfter: true })
    assert.deepEqual(pass.prepared, ['denied'])
    assert.equal((await op(input.operationId)).state, 'denied')
    assert.equal(w.t3.count('t3_thread_send'), 0, 'no native message after the expiry')
    const kept = await op(created.operationId)
    assert.equal(kept.state, 'received', 'the earlier send is untouched')
    assert.deepEqual(await binding(kept.binding_id), bindingBefore, 'its binding unchanged')
    assert.deepEqual(await reservations(w.accountKey), [{ binding_id: kept.binding_id }])
    assert.deepEqual(
      intents(w.journalFile).map((r) => r.operationId),
      [created.operationId],
    )
    // Its observation goes on to proven settlement, by its original identity, with one launch.
    w.finishAll()
    await w.pass()
    assert.equal((await op(created.operationId)).state, 'settled')
    assert.equal(w.t3.effects.launches, 1)
  })
})

const NS = 'client:fake-session-r4'
/** An owner host on the world's FakeT3: a pairing redeemed through persistence, the DB channel, agent and gateway. */
async function hostOf(w: World, wrap: (c: HostChannel) => HostChannel) {
  const capability = newSecret()
  const pairing = await withActor(api, w.who, 'write', (c) => createOwnerHostPairing(c, w.connectionId))
  assert.equal((await redeemOwnerHostPairing(api, pairing.code, capability)).result, 'bound')
  const journalFile = join(root, `${randomUUID()}.jsonl`)
  const journal = new RunnerJournal(journalFile)
  const gateway = new RunnerGateway({ journal, transport: w.t3, profile: w.profile })
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
  const channel = wrap(new DbHostChannel(api, capability))
  const agent = new OwnerHostAgent({ channel, gateway, journal, hello, redeliverSeconds: 1, log: () => undefined })
  await agent.greet()
  return { agent, journal, journalFile }
}
type Host = Awaited<ReturnType<typeof hostOf>>
/** One dispatcher pass through the owner-host proxy while the host serves, bounded by the pass itself (and 60 s). */
async function hostPass(w: World, host: Host, deadlineMs: number) {
  const port = new OwnerHostPortProxy({
    store: new DbExchangeStore(worker),
    ownerId: w.who,
    environmentRef: 'env-owner-1',
    journalId: host.journal.id,
    namespace: NS,
    deadlineMs,
    pollMs: 20,
  })
  const state = { done: false }
  const result = w.pass({ port, minAge: 3600 }).finally(() => {
    state.done = true
  })
  const bound = Date.now() + 60_000
  while (!state.done) {
    if (Date.now() >= bound) throw new Error('the pass did not end within 60 s')
    await host.agent.serveOnce()
    await sleep(15)
  }
  return result
}
/** A channel whose next GO meets the final-write barrier, until the limit `until` names for its exchange. */
function goAt(armed: { on: boolean }, gos: GoResult[], seen: Seen, until: (exchange: string) => Promise<Date>) {
  return (c: HostChannel): HostChannel => ({
    hello: (x) => c.hello(x),
    poll: (l, r) => c.poll(l, r),
    answer: (i, a) => c.answer(i, a),
    go: async (id) => {
      if (!armed.on) return c.go(id).then((g) => (gos.push(g), g))
      armed.on = false
      const g = await finalWriteWait(
        'sophia.owner_host_exchanges',
        'owner_host_go',
        await until(id),
        () => c.go(id),
        seen,
      )
      gos.push(g)
      return g
    },
  })
}
const deadlineOf = async (exchange: string) =>
  (await one<{ t: Date }>('SELECT deadline_at AS t FROM sophia.owner_host_exchanges WHERE id=$1', [exchange])).t
const exchangeOf = (operationId: string) =>
  one<{ state: string; go_count: number }>(
    `SELECT state, go_count FROM sophia.owner_host_exchanges WHERE operation_id=$1 AND kind='send'`,
    [operationId],
  )

describe('GO decides after its final exchange write wait (repair 4, CC005-R3-F01)', () => {
  for (const what of ['qualification', 'connection', 'deadline'] as const) {
    it(`a ${what} that runs out while GO waits on its final write: no grant, no payload, no native call`, async () => {
      const w = await world({ t3: new FakeT3(NS) })
      const gos: GoResult[] = []
      const seen: Seen = {}
      const armed = { on: false }
      let until = new Date(0)
      const host = await hostOf(
        w,
        goAt(armed, gos, seen, async (x) => (what === 'deadline' ? deadlineOf(x) : until)),
      )
      const created = await w.create()
      armed.on = true
      if (what !== 'deadline') {
        until = await soon(2500)
        await expireAt(w, what, until)
      }
      await hostPass(w, host, what === 'deadline' ? 2000 : 8000)
      assert.deepEqual(seen, { waitedBefore: true, stillWaitingAfter: true }, 'decided before the limit, written after')
      assert.equal(gos.at(-1)?.result, 'denied')
      assert.equal('payload' in (gos.at(-1) ?? {}), false, 'no private payload')
      assert.equal(w.t3.calls.length, 0, 'no native call')
      assert.equal(intents(host.journalFile).length, 0, 'nothing journaled as possibly sent')
      assert.equal((await exchangeOf(created.operationId)).go_count, 0, 'never granted')
      assert.notEqual((await op(created.operationId)).state, 'received')
    })
  }

  it('an authority that stays valid through the same wait is granted once (control)', async () => {
    const w = await world({ t3: new FakeT3(NS) })
    const gos: GoResult[] = []
    const seen: Seen = {}
    const armed = { on: false }
    const until = await soon(2500)
    const host = await hostOf(
      w,
      goAt(armed, gos, seen, () => Promise.resolve(until)),
    )
    const created = await w.create()
    armed.on = true
    await hostPass(w, host, 8000)
    assert.deepEqual(seen, { waitedBefore: true, stillWaitingAfter: true })
    assert.equal(gos.at(-1)?.result, 'go')
    const granted = gos.at(-1)
    assert.ok(granted?.result === 'go' && granted.payload?.includes('Report the Ask admission boundary.'))
    assert.equal((await op(created.operationId)).state, 'received')
    assert.equal(w.t3.effects.launches, 1)
    assert.equal((await exchangeOf(created.operationId)).go_count, 1)
  })

  it("an input refused at its GO's deadline keeps the received create, its reservation, journal and qualified Stop", async () => {
    const w = await world({ t3: new FakeT3(NS) })
    const gos: GoResult[] = []
    const seen: Seen = {}
    const armed = { on: false }
    const host = await hostOf(w, goAt(armed, gos, seen, deadlineOf))
    const created = await w.create()
    await hostPass(w, host, 8000)
    assert.equal((await op(created.operationId)).state, 'received')
    const input = await w.input(created.operationId)
    armed.on = true
    await hostPass(w, host, 2000)
    assert.deepEqual(seen, { waitedBefore: true, stillWaitingAfter: true })
    assert.equal(gos.at(-1)?.result, 'denied')
    assert.equal('payload' in (gos.at(-1) ?? {}), false)
    assert.equal(w.t3.count('t3_thread_send'), 0, 'no native message')
    assert.equal((await exchangeOf(input.operationId)).go_count, 0)
    const kept = await op(created.operationId)
    assert.equal(kept.state, 'received', 'the earlier send is untouched')
    assert.deepEqual(await reservations(w.accountKey), [{ binding_id: kept.binding_id }])
    assert.deepEqual(
      intents(host.journalFile).map((r) => r.operationId),
      [created.operationId],
    )
    // The route is still qualified: its Stop goes through the same host, and the create settles from an observation.
    const stop = await w.stop(created.operationId)
    await hostPass(w, host, 8000)
    assert.equal((await op(stop.operationId)).state, 'received')
    assert.equal(w.t3.effects.stops, 1)
    assert.equal(w.t3.effects.launches, 1)
  })
})

describe('the worker setting', () => {
  it('accepts only off: no owner-host transport is qualified', () => {
    assert.equal(runnerDispatchFromEnv({}), 'off')
    assert.equal(runnerDispatchFromEnv({ SOPHIA_OWNER_RUNNER_DISPATCH: 'off' }), 'off')
    assert.throws(() => runnerDispatchFromEnv({ SOPHIA_OWNER_RUNNER_DISPATCH: 'on' }), /INC01-CC-003/)
  })
})
