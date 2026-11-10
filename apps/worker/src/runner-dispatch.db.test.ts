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
  createPool,
  maintainRunnerOperations,
  prepareRunnerSend,
  recordRunnerAnswer,
  runnerFollowups,
  withActor,
} from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { runnerDispatchFromEnv, runnerDispatchOnce } from './runner-dispatch.ts'

/** The admission request, as persistence takes it (the worker does not depend on the contracts package). */
type OwnerRunnerOperationRequest = Parameters<typeof admitRunnerOperation>[3]
const PIN = 'ade473018d32003658b7d38693e083ee2e314bd8'

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
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
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
  const qualify = async (key: string, profileId = 'read-only-v1') =>
    (
      await one<{ id: string }>(
        `SELECT sophia.qualify_owner_runner($1, $2, $3, 'env-owner-1', 'project-sophia', $5, 1, 'gateway_enforced',
           $4, ARRAY['create','input','stop'], $6, now() + interval '1 day', 'synthetic fixture: not a live qualification') AS id`,
        [p.projectId, resourceId, PIN, key, profileId, allowance],
      )
    ).id
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
    })
  const input = (target: string, message = 'And the outbox boundary?') =>
    admit({ kind: 'input', targetOperationId: target, message, expectedGoalRevision: 1, expectedAuthorityEpoch: 1 })
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
      (await w.gateway.send(prepared.envelope, digestOf(prepared.envelope), w.gateway.journalId)).kind,
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
        (await w.gateway.send(prepared.envelope, digestOf(prepared.envelope), w.gateway.journalId)).kind,
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

  it('keeps the Stop unresolved while a lost-response input is unreconciled, then settles it on a fresh proof', async () => {
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
    const converged = (await op(lost.operationId)).state
    assert.ok(['received', 'settled'].includes(converged), `the input converged (${converged})`)
    assert.equal((await op(stopped.operationId)).state, 'settled', 'converged, then proven by a fresh complete read')
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

describe('the worker setting', () => {
  it('accepts only off: no owner-host transport is qualified', () => {
    assert.equal(runnerDispatchFromEnv({}), 'off')
    assert.equal(runnerDispatchFromEnv({ SOPHIA_OWNER_RUNNER_DISPATCH: 'off' }), 'off')
    assert.throws(() => runnerDispatchFromEnv({ SOPHIA_OWNER_RUNNER_DISPATCH: 'on' }), /INC01-CC-003/)
  })
})
