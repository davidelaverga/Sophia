// Synthetic PG16 fixtures only. Imported by the leased API/worker tests without registering this file's cases twice.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, readFileSync, readdirSync, symlinkSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve as absolutePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, beforeEach, afterEach, describe, it, mock } from 'node:test'
import pg from 'pg'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { OwnerHostAgent } from '@sophia/coordination/owner-host-agent'
import {
  newSecret,
  secretDigest,
  collectionExchangeRequest,
  type HostHello,
} from '@sophia/coordination/owner-host-channel'
import { OwnerHostPortProxy } from '@sophia/coordination/owner-host-port-proxy'
import { FakeT3 } from '@sophia/coordination/runner-fake-t3'
import { RunnerGateway, type GatewayProfile } from '@sophia/coordination/runner-gateway'
import { RunnerJournal } from '@sophia/coordination/runner-journal'
import { digestOf, type RunnerCollection } from '@sophia/coordination/runner-port'
import { resultVersionKey } from '../../../apps/worker/src/runner-results.ts'
import { runnerDispatchOnce } from '../../../apps/worker/src/runner-dispatch.ts'
import {
  admitRunnerOperation,
  admitGoalCommand,
  claimOutbox,
  createOwnerHostPairing,
  redeemOwnerHostPairing,
  DbHostChannel,
  DbExchangeStore,
  withActor,
  claimRunnerResult,
  resumeRunnerResult,
  consumeRunnerResult,
  finishRunnerResult,
  requestRunnerResult,
  RunnerResultExchangeStore,
  readRunnerResult,
  readRunnerWork,
  lookupRunnerWork,
  requireRunnerResults,
  maintainRunnerResults,
  type RunnerResultClaim,
} from './index.ts'

const PIN = 'ade473018d32003658b7d38693e083ee2e314bd8'
const BASE = '0123456789abcdef0123456789abcdef01234567'
const POLICY = { v: 1 as const, instanceId: 'claudeAgent', models: [{ model: 'synthetic-model', options: [] }] }
const SETTINGS = { instanceId: 'claudeAgent', model: 'synthetic-model', options: [] }
export const RESULT_TEXT = 'Useful private result. 🧭'
export const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Drive the real fake-host agent while a finite backend operation is pending. */
export async function serveUntil<T>(agent: OwnerHostAgent, task: Promise<T>): Promise<T> {
  const state = { done: false }
  const pending = task.finally(() => {
    state.done = true
  })
  // Attach before waiting so any failure is handled even while the host is serving.
  void pending.catch(() => undefined)
  for (let n = 0; !state.done && n < 3000; n += 1) {
    await agent.serveOnce()
    await pause(5)
  }
  assert.equal(state.done, true, 'finite fixture operation completed')
  return pending
}

/** Own every acquired fixture resource immediately, including partial construction. */
export class ResultResources {
  private actions: Array<() => unknown> = []
  add(action: () => unknown) {
    this.actions.push(action)
  }
  async close() {
    const actions = this.actions.splice(0).toReversed()
    const errors: unknown[] = []
    for (const action of actions) {
      try {
        await action()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Result fixture cleanup failed')
  }
  async guard<T>(body: () => Promise<T>): Promise<T> {
    try {
      return await body()
    } catch (primary) {
      try {
        await this.close()
      } catch (cleanup) {
        const failure = new AggregateError([primary, cleanup], 'Result fixture operation and cleanup failed')
        failure.cause = cleanup
        throw failure
      }
      throw primary
    }
  }
}

export async function withResultResources<T>(body: (resources: ResultResources) => Promise<T>): Promise<T> {
  const resources = new ResultResources()
  return resources.guard(async () => {
    const result = await body(resources)
    await resources.close()
    return result
  })
}

type ResultWorldFaults = {
  shared?: { who: string; accountKey: string; journal: RunnerJournal; t3: FakeT3 }
  afterPools?: (pools: readonly pg.Pool[]) => Promise<void>
  afterGateway?: (gateway: RunnerGateway, directory: string) => Promise<void>
}

export async function resultWorld(db: TestDatabase, faults: ResultWorldFaults = {}) {
  const resources = new ResultResources()
  return resources.guard(async () => {
    const owner = new pg.Pool({ connectionString: db.ownerUrl })
    resources.add(() => owner.end())
    const api = new pg.Pool({ connectionString: db.apiUrl })
    resources.add(() => api.end())
    const worker = new pg.Pool({ connectionString: db.workerUrl })
    resources.add(() => worker.end())
    await faults.afterPools?.([owner, api, worker])
    const shared = faults.shared ?? {
      who: randomUUID(),
      accountKey: `synthetic:${randomUUID()}`,
      journal: undefined,
      t3: undefined,
    }
    const who = shared.who
    const teammate = randomUUID()
    const p = await seedProject(db.ownerUrl, { admin: who, editors: [teammate] })
    const connectionId = randomUUID()
    const resourceId = randomUUID()
    const accountKey = shared.accountKey
    await owner.query(
      "INSERT INTO sophia.execution_connections(id,owner_id,upstream_origin,state) VALUES($1,$2,'synthetic','linked')",
      [connectionId, who],
    )
    await owner.query(
      `INSERT INTO sophia.executor_resources(project_id,id,owner_id,connection_id,harness,label,repository_root,state)
    VALUES($1,$2,$3,$4,'claude-native','Synthetic','synthetic/repository','active')`,
      [p.projectId, resourceId, who, connectionId],
    )
    const qualified = await owner.query<{ id: string }>(
      `SELECT sophia.qualify_owner_runner($1,$2,$3,'env-result','project-result','read-only-v1',1,
    'gateway_enforced',$4,ARRAY['create','input','stop'],50,now()+interval '1 day','synthetic fixture only') AS id`,
      [p.projectId, resourceId, PIN, accountKey],
    )
    await owner.query('SELECT sophia.declare_owner_runner_source_policy($1,$2,$3)', [
      p.projectId,
      qualified.rows[0]?.id,
      JSON.stringify(POLICY),
    ])
    const profile: GatewayProfile = {
      ownerId: who,
      environmentRef: 'env-result',
      adapterPin: PIN,
      nativeProjectRefs: new Set(['project-result']),
      accountKey,
      profileId: 'read-only-v1',
      profileRevision: 1,
      operations: new Set(['create', 'input', 'stop']),
      sourcePolicy: POLICY,
    }
    const directory = mkdtempSync(join(tmpdir(), 'sophia-s-result-'))
    resources.add(() => rmSync(directory, { recursive: true }))
    const journal = shared.journal ?? new RunnerJournal(join(directory, 'journal.jsonl'))
    if (!faults.shared) resources.add(() => journal.close())
    const t3 = shared.t3 ?? new FakeT3()
    const gateway = new RunnerGateway({ journal, transport: t3, profile, collectionVersion: 1 })
    resources.add(() => gateway.close())
    await faults.afterGateway?.(gateway, directory)
    const pairing = await withActor(api, who, 'write', (c) => createOwnerHostPairing(c, connectionId))
    const capability = newSecret()
    assert.equal((await redeemOwnerHostPairing(api, pairing.code, capability)).result, 'bound')
    const hello: HostHello = {
      v: 1,
      journalId: journal.id,
      environmentRef: 'env-result',
      adapterPin: PIN,
      profileId: 'read-only-v1',
      profileRevision: 1,
      accountKey,
      t3Namespace: t3.namespace(),
    }
    const channel = new DbHostChannel(api, capability)
    const agent = new OwnerHostAgent({ channel, gateway, journal, hello, log: () => undefined })
    await agent.greet()
    const port = new OwnerHostPortProxy({
      store: new DbExchangeStore(worker),
      ownerId: who,
      environmentRef: 'env-result',
      journalId: journal.id,
      namespace: t3.namespace(),
      deadlineMs: 2000,
      pollMs: 10,
    })
    resources.add(() => maintainRunnerResults(worker))
    resources.add(() =>
      owner.query(
        "UPDATE sophia.owner_runner_collections SET deadline_at=clock_timestamp()-interval '1 second' WHERE project_id=$1 AND state IN ('pending','collecting')",
        [p.projectId],
      ),
    )
    return {
      ...p,
      who,
      teammate,
      resourceId,
      connectionId,
      accountKey,
      owner,
      api,
      worker,
      t3,
      journal,
      gateway,
      agent,
      channel,
      capability,
      port,
      close: () => resources.close(),
    }
  })
}

export type ResultWorld = Awaited<ReturnType<typeof resultWorld>>

export async function admitResultOperation(w: ResultWorld, target?: string, key = randomUUID()) {
  const request = {
    resourceId: w.resourceId,
    expectedGoalRevision: 1,
    expectedAuthorityEpoch: 1,
    message: 'Synthetic private instruction',
    sourceIds: [w.sourceId],
    baseCommit: BASE,
    writeScope: 'read_only' as const,
    settings: SETTINGS,
  }
  const receipt = await withActor(w.api, w.who, 'write', (c) =>
    admitRunnerOperation(
      c,
      w.projectId,
      key,
      target
        ? {
            resourceId: w.resourceId,
            expectedGoalRevision: 1,
            expectedAuthorityEpoch: 1,
            message: 'Synthetic follow-up',
            sourceIds: [w.sourceId],
            kind: 'input',
            targetOperationId: target,
          }
        : { ...request, kind: 'create', goalId: w.goalId, title: 'Synthetic result' },
    ),
  )
  await serveUntil(
    w.agent,
    runnerDispatchOnce(w.worker, {
      workerId: 's-result-test',
      runner: { ownerId: w.who, environmentRef: 'env-result' },
      port: w.port,
      sends: true,
      followupMinAgeSeconds: 3600,
    }),
  )
  const { rows } = await w.owner.query<{ revision: string; native_run_id: string; native_thread_id: string }>(
    'SELECT revision,native_run_id,native_thread_id FROM sophia.owner_runner_operations WHERE project_id=$1 AND id=$2',
    [w.projectId, receipt.operationId],
  )
  const row = rows[0]
  assert.ok(row?.native_run_id, 'accepted own run')
  w.t3.finishRun(row.native_run_id)
  const thread = w.t3.threads.get(row.native_thread_id)
  assert.ok(thread)
  thread.collectionItems = [
    ...(thread.collectionItems ?? []),
    {
      position: thread.messages.length + 2,
      visibility: 'local',
      sourceThreadId: row.native_thread_id,
      itemId: `item-${receipt.operationId}`,
      messageId: `assistant-${receipt.operationId}`,
      runId: row.native_run_id,
      type: 'assistant_message',
      status: 'completed',
      text: RESULT_TEXT,
      textTruncated: false,
      nextTextOffset: null,
    },
  ]
  return { operationId: receipt.operationId, revision: Number(row.revision), runId: row.native_run_id, key }
}

export async function requestResult(
  w: ResultWorld,
  op: Awaited<ReturnType<typeof admitResultOperation>>,
  key = randomUUID(),
) {
  return withActor(w.api, w.who, 'write', (c) =>
    requestRunnerResult(c, { projectId: w.projectId, operationId: op.operationId }, key, {
      expectedOperationRevision: op.revision,
      maxPages: 8,
      maxBytes: 8192,
    }),
  )
}
export async function collectClaim(w: ResultWorld, claim: RunnerResultClaim) {
  const store = new RunnerResultExchangeStore(w.worker, claim)
  const port = new OwnerHostPortProxy({
    store,
    ownerId: claim.ownerId,
    environmentRef: claim.environmentRef,
    journalId: claim.journalId,
    namespace: claim.namespace,
    deadlineMs: 1000,
    pollMs: 10,
  })
  const result = await serveUntil(
    w.agent,
    port.collect(
      { envelope: claim.envelope, digest: digestOf(claim.envelope), journalId: claim.journalId },
      { v: 1, maxPages: claim.maxPages, maxBytes: claim.maxBytes },
    ),
  )
  return { store, result }
}
export async function retainResult(w: ResultWorld, op: Awaited<ReturnType<typeof admitResultOperation>>) {
  await requestResult(w, op)
  const claim = await claimRunnerResult(w.worker)
  assert.ok(claim)
  const { store, result } = await collectClaim(w, claim)
  assert.equal(result.kind, 'collected')
  if (result.kind !== 'collected' || !store.exchangeId) throw new Error('Synthetic result unavailable')
  const metadata = {
    exchangeId: store.exchangeId,
    sha256: result.textSha256,
    versionKey: resultVersionKey(claim, result),
  }
  const descriptor = await consumeRunnerResult(w.worker, claim, metadata)
  assert.ok(descriptor)
  return { claim, result, descriptor, metadata }
}

/** No database: caller ownership always drains, even after both primary and cleanup errors. */
export async function resultOwnershipNoDbRegression() {
  const calls: string[] = []
  const primary = new Error('controlled operation failure')
  const cleanup = new Error('controlled controller stop failure')
  await assert.rejects(
    withResultResources((resources) => {
      resources.add(() => {
        calls.push('drop')
      })
      resources.add(() => {
        calls.push('world')
      })
      resources.add(() => {
        calls.push('controller')
        throw cleanup
      })
      return Promise.reject(primary)
    }),
    (error: unknown) =>
      error instanceof AggregateError &&
      error.errors[0] === primary &&
      error.errors[1] instanceof AggregateError &&
      error.errors[1].errors[0] === cleanup,
  )
  assert.deepEqual(calls, ['controller', 'world', 'drop'])
}

async function acquiredPools(pools: readonly pg.Pool[]) {
  for (const pool of pools) await pool.query('SELECT pg_backend_pid()')
  assert.ok(pools.every((pool) => pool.totalCount === 1))
}

async function assertPoolsDrained(pools: readonly pg.Pool[]) {
  assert.equal(pools.length, 3)
  for (const pool of pools) {
    assert.equal(pool.totalCount, 0)
    assert.equal(pool.idleCount, 0)
    assert.equal(pool.waitingCount, 0)
    await assert.rejects(pool.query('SELECT 1'), /after calling end/)
  }
}

/** Controlled old fixture ordering, with independent outer rescue so the negative cannot leak. */
export async function legacyResultOwnershipRegression(db: TestDatabase, partial: boolean) {
  const pools = [
    new pg.Pool({ connectionString: db.ownerUrl }),
    new pg.Pool({ connectionString: db.apiUrl }),
    new pg.Pool({ connectionString: db.workerUrl }),
  ]
  const failure = new Error('controlled old fixture failure')
  try {
    await acquiredPools(pools)
    if (partial) {
      // 5cb4 setup had no local rescue after a query failed before returning the world.
      await assert.rejects(Promise.reject(failure), (error) => error === failure)
    } else {
      // 5cb4 close awaited expiry/maintenance before pool.end; failure skipped all later cleanup.
      const oldClose = async () => {
        await Promise.reject(failure)
        await Promise.all(pools.map((pool) => pool.end()))
      }
      await assert.rejects(oldClose(), (error) => error === failure)
    }
    await assertPoolsDrained(pools)
  } finally {
    await Promise.all(pools.map((pool) => pool.end()))
  }
}

async function partialWorldRegression(db: TestDatabase, late: boolean) {
  const pools: pg.Pool[] = []
  const primary = new Error('controlled partial start failure')
  const cleanup = new Error('controlled close failure after actual end')
  let directory: string | undefined
  let restore: (() => void) | undefined
  try {
    await assert.rejects(
      raceBound(
        'partial construction rescue',
        resultWorld(db, {
          afterPools: async (acquired) => {
            pools.push(...acquired)
            await acquiredPools(acquired)
            if (late) return
            const pool = acquired[0]!
            const end = pool.end.bind(pool)
            const mocked = mock.method(pool, 'end', async () => {
              await end()
              throw cleanup
            })
            restore = () => mocked.mock.restore()
            throw primary
          },
          afterGateway: (gateway, dir) => {
            directory = dir
            const close = gateway.close.bind(gateway)
            const mocked = mock.method(gateway, 'close', () => {
              close()
              throw cleanup
            })
            restore = () => mocked.mock.restore()
            throw primary
          },
        }),
      ),
      (error: unknown) =>
        error instanceof AggregateError &&
        error.errors[0] === primary &&
        error.errors[1] instanceof AggregateError &&
        error.errors[1].errors[0] === cleanup,
    )
    await assertPoolsDrained(pools)
    if (late) assert.equal(directory !== undefined && existsSync(directory), false)
  } finally {
    restore?.()
    // A failing regression must itself drain the real acquisitions before the database drops.
    await Promise.all(pools.filter((pool) => pool.totalCount > 0).map((pool) => pool.end()))
  }
}

async function closeWorldRegression(db: TestDatabase) {
  let directory = ''
  const w = await resultWorld(db, {
    afterPools: acquiredPools,
    afterGateway: (_gateway, dir) => {
      directory = dir
      return Promise.resolve()
    },
  })
  const primary = new Error('controlled expiry query failure')
  const maintenance = new Error('controlled maintenance query failure')
  const owner = mock.method(w.owner, 'query', () => Promise.reject(primary))
  const worker = mock.method(w.worker, 'query', () => Promise.reject(maintenance))
  try {
    await assert.rejects(
      raceBound('maintenance failure rescue', w.close()),
      (error: unknown) =>
        error instanceof AggregateError &&
        error.errors.length === 2 &&
        error.errors[0] === primary &&
        error.errors[1] instanceof DomainError &&
        error.errors[1].code === 'unavailable' &&
        error.errors[1].message === 'Result service unavailable',
    )
    assert.equal(owner.mock.callCount(), 1)
    assert.equal(worker.mock.callCount(), 1)
    owner.mock.restore()
    worker.mock.restore()
    await assertPoolsDrained([w.owner, w.api, w.worker])
    assert.equal(existsSync(directory), false)
    await w.close()
  } finally {
    owner.mock.restore()
    worker.mock.restore()
    await w.close()
  }
}

/** A delivered exchange with a real host-produced body, before any answer is staged. */
async function positionExchange(w: ResultWorld) {
  const op = await admitResultOperation(w)
  await requestResult(w, op)
  const claim = await claimRunnerResult(w.worker)
  assert.ok(claim)
  const store = new RunnerResultExchangeStore(w.worker, claim)
  const identity = { envelope: claim.envelope, digest: digestOf(claim.envelope), journalId: claim.journalId }
  const options = { v: 1 as const, maxPages: claim.maxPages, maxBytes: claim.maxBytes }
  const queued = await store.enqueue({
    ownerId: claim.ownerId,
    environmentRef: claim.environmentRef,
    journalId: claim.journalId,
    key: `collect:${op.operationId}:${randomUUID()}`,
    deadlineMs: 1000,
    request: collectionExchangeRequest(identity, options),
  })
  assert.equal(queued.result, 'queued')
  if (queued.result !== 'queued') throw new Error('fixture exchange not queued')
  assert.equal((await w.channel.poll(10, 1)).length, 1)
  const result = await w.gateway.collect(identity, options)
  if (result.kind !== 'collected') throw new Error('fixture did not collect')
  return { claim, result, exchangeId: queued.exchangeId }
}

async function authenticatedResultAnswer(w: ResultWorld, exchangeId: string, answer: unknown) {
  return w.api.query<{ r: { result: string } }>('SELECT sophia.owner_host_answer($1,$2,$3::jsonb) AS r', [
    secretDigest(w.capability),
    exchangeId,
    JSON.stringify(answer),
  ])
}

export async function resultPositionRegression(w: ResultWorld, position: number, checkInvalid = true) {
  const { claim, result, exchangeId } = await positionExchange(w)
  const { resultDigest: _digest, ...body } = result
  const answer = { ...body, lastPosition: position }
  const signed = { ...answer, resultDigest: digestOf(answer) }
  const previous = await w.owner.query('SELECT state,answer,answered_at FROM sophia.owner_host_exchanges WHERE id=$1', [
    exchangeId,
  ])
  for (const invalid of checkInvalid ? [-1, 0.5, 9007199254740992, '1', null, {}, [], true] : []) {
    const bad = { ...body, lastPosition: invalid }
    await assert.rejects(authenticatedResultAnswer(w, exchangeId, { ...bad, resultDigest: digestOf(bad) }), {
      code: '22023',
    })
    const following = await w.owner.query(
      'SELECT state,answer,answered_at FROM sophia.owner_host_exchanges WHERE id=$1',
      [exchangeId],
    )
    assert.deepEqual(following.rows, previous.rows)
    assert.equal(
      (
        await w.owner.query('SELECT 1 FROM sophia.owner_runner_results WHERE operation_id=$1', [
          claim.envelope.operationId,
        ])
      ).rowCount,
      0,
    )
  }
  assert.equal((await authenticatedResultAnswer(w, exchangeId, signed)).rows[0]?.r.result, 'ok')
  assert.equal((await w.channel.answer(exchangeId, signed)).result, 'ok')
  const descriptor = await consumeRunnerResult(w.worker, claim, {
    exchangeId,
    sha256: signed.textSha256,
    versionKey: resultVersionKey(claim, signed),
  })
  assert.ok(descriptor)
  assert.equal(
    (await withActor(w.api, w.who, 'read', (c) => readRunnerResult(c, w.projectId, descriptor.resultId))).text,
    RESULT_TEXT,
  )
}

/** Every held race has a sentinel and a finally drain; a regression fails instead of hanging the suite. */
async function raceBound<T>(what: string, pending: Promise<T>, ms = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new assert.AssertionError({ message: `${what} exceeded race bound` })), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function heldOwner(w: ResultWorld) {
  const c = await w.owner.connect()
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='2500ms'")
  let open = true
  return {
    c,
    async finish(commit: boolean) {
      if (!open) return
      try {
        await c.query(commit ? 'COMMIT' : 'ROLLBACK')
      } finally {
        open = false
        c.release()
      }
    },
  }
}

/** Observe the actual blocker, not elapsed wall time as a substitute for a causal wait. */
async function actualLockWait(w: ResultWorld, pid: number): Promise<void> {
  for (let n = 0; n < 200; n += 1) {
    const rows = await w.owner.query<{ n: number }>('SELECT cardinality(pg_blocking_pids($1)) AS n', [pid])
    if ((rows.rows[0]?.n ?? 0) > 0) return
    await pause(5)
  }
  assert.fail('capture did not reach its held row lock')
}

async function legacyUnlockedWithdrawal(w: ResultWorld): Promise<void> {
  const tx = await heldOwner(w)
  let pending: Promise<unknown> = Promise.resolve()
  let announce: ((pid: number) => void) | undefined
  const ready = new Promise<number>((resolve) => {
    announce = resolve
  })
  try {
    await tx.c.query('UPDATE sophia.source_objects SET eligible=false WHERE project_id=$1 AND id=$2', [
      w.projectId,
      w.sourceId,
    ])
    pending = withActor(w.api, w.who, 'write', async (c) => {
      const rows = await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      assert.ok(rows.rows[0])
      announce?.(rows.rows[0].pid)
      return admitGoalCommand(c, w.projectId, randomUUID(), {
        kind: 'steer',
        goalId: w.goalId,
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        bodySourceId: w.sourceId,
      })
    })
    void pending.catch(() => undefined)
    const pid = await raceBound('legacy admission announcement', ready)
    const outcome = await Promise.race([pending.then(() => 'admitted'), pause(500).then(() => 'sentinel')])
    if (outcome === 'sentinel') await actualLockWait(w, pid)
    assert.equal(outcome, 'admitted', 'no S state: a source-only legacy withdrawal must not hold the project')
    await tx.finish(true)
    const rows = await claimOutbox(w.worker, 'r1-legacy-control', 50, 60)
    assert.deepEqual(
      rows.filter((r) => r.project_id === w.projectId),
      [],
    )
  } finally {
    await tx.finish(false)
    await raceBound(
      'legacy admission drain',
      pending.catch(() => undefined),
    )
  }
}

function removeMigrationFixture(dir: string, names: string[]): void {
  for (const name of names) {
    try {
      unlinkSync(join(dir, name))
    } catch (err) {
      if (!(typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT')) throw err
    }
  }
  rmdirSync(dir)
}

/** Later explicit fail-before command uses the exact sealed EBBC migration, never a weakened old fixture. */
export async function legacyResultLockRegressionOnEbbc(badMigration: string): Promise<void> {
  const expected = '458bd1f6d20ed5531780d85f3cfe7ddac494c1b8f37fdd74a9069ef9241a80c6'
  assert.equal(createHash('sha256').update(readFileSync(badMigration)).digest('hex'), expected)
  const dir = mkdtempSync(join(tmpdir(), 'sophia-result-ebbc-control-'))
  const names = readdirSync('db/migrations').filter((name) => name.endsWith('.sql'))
  try {
    for (const name of names)
      symlinkSync(
        name === '0116_owner_runner_results.sql' ? absolutePath(badMigration) : absolutePath('db/migrations', name),
        join(dir, name),
      )
    const db = await createTestDatabase(dir)
    try {
      const w = await resultWorld(db)
      try {
        await legacyUnlockedWithdrawal(w)
      } finally {
        await w.close()
      }
    } finally {
      await db.drop()
    }
  } finally {
    removeMigrationFixture(dir, names)
  }
}

/** Exact sealed 5cb4 SQL control; the repaired fixture owns every negative-control resource. */
export async function resultPositionRegressionOn5cb4(badMigration: string) {
  assert.equal(
    createHash('sha256').update(readFileSync(badMigration)).digest('hex'),
    '4f12a203695cc422243390fbc0b7c23f9510f43b6d67f3afd1fe187e926d8e04',
  )
  const dir = mkdtempSync(join(tmpdir(), 'sophia-result-position-control-'))
  const names = readdirSync('db/migrations').filter((name) => name.endsWith('.sql'))
  await withResultResources(async (resources) => {
    resources.add(() => removeMigrationFixture(dir, names))
    for (const name of names)
      symlinkSync(
        name === '0116_owner_runner_results.sql' ? absolutePath(badMigration) : absolutePath('db/migrations', name),
        join(dir, name),
      )
    const db = await createTestDatabase(dir)
    resources.add(() => db.drop())
    const w = await resultWorld(db)
    resources.add(() => w.close())
    await resultPositionRegression(w, 1, false)
    console.log('old SQL ordinary valid answer authenticated, staged, replayed and consumed')
    const upper = await resultWorld(db)
    resources.add(() => upper.close())
    await resultPositionRegression(upper, 1000000000000000)
  })
}

type FenceKind =
  | 'selected'
  | 'private_object'
  | 'private_text'
  | 'manifest_body'
  | 'manifest_state'
  | 'transitive'
  | 'member'
  | 'qualification'
  | 'resource'
  | 'connection'
interface FenceMutation {
  sql: string
  params: string[]
}
async function fenceMutation(w: ResultWorld, operationId: string, kind: FenceKind): Promise<FenceMutation> {
  const rows = await w.owner.query<{
    payload_source_id: string
    manifest_id: string
    body_source_id: string
    qualification_id: string
  }>(
    `SELECT o.payload_source_id,o.manifest_id,m.body_source_id,o.qualification_id FROM sophia.owner_runner_operations o
     JOIN sophia.context_manifests m ON m.project_id=o.project_id AND m.id=o.manifest_id WHERE o.project_id=$1 AND o.id=$2`,
    [w.projectId, operationId],
  )
  const row = rows.rows[0]
  assert.ok(row)
  const statements: Record<FenceKind, FenceMutation> = {
    selected: {
      sql: 'UPDATE sophia.source_objects SET eligible=false WHERE project_id=$1 AND id=$2',
      params: [w.projectId, w.sourceId],
    },
    private_object: {
      sql: "UPDATE sophia.source_objects SET state='deleted' WHERE project_id=$1 AND id=$2",
      params: [w.projectId, row.payload_source_id],
    },
    private_text: {
      sql: "UPDATE sophia.source_texts SET body=body||' ' WHERE project_id=$1 AND source_id=$2",
      params: [w.projectId, row.payload_source_id],
    },
    manifest_body: {
      sql: "UPDATE sophia.source_texts SET body=body||' ' WHERE project_id=$1 AND source_id=$2",
      params: [w.projectId, row.body_source_id],
    },
    manifest_state: {
      sql: "UPDATE sophia.context_manifests SET state='retired' WHERE project_id=$1 AND id=$2",
      params: [w.projectId, row.manifest_id],
    },
    transitive: {
      sql: 'UPDATE sophia.source_objects SET eligible=false WHERE project_id=$1 AND id=$2',
      params: [w.projectId, w.sourceId],
    },
    member: {
      sql: 'UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2',
      params: [w.projectId, w.who],
    },
    qualification: {
      sql: 'UPDATE sophia.owner_runner_qualifications SET revoked_at=clock_timestamp() WHERE project_id=$1 AND id=$2',
      params: [w.projectId, row.qualification_id],
    },
    resource: {
      sql: "UPDATE sophia.executor_resources SET state='revoked' WHERE project_id=$1 AND id=$2",
      params: [w.projectId, w.resourceId],
    },
    connection: {
      sql: "UPDATE sophia.execution_connections SET state='revoked' WHERE id=$1 AND owner_id=$2",
      params: [w.connectionId, w.who],
    },
  }
  return statements[kind]
}

async function addTransitiveDependency(w: ResultWorld): Promise<string> {
  const id = randomUUID()
  await w.owner.query(
    `INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
   VALUES($1,$2,$3,'project',$4,'text/plain',$5,42,true,'ready')`,
    [w.projectId, id, w.who, 'a'.repeat(64), `synthetic/${id}`],
  )
  await w.owner.query(
    'INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES($1,$2,$3)',
    [w.projectId, id, w.sourceId],
  )
  return id
}

function announcedCapture(w: ResultWorld, op: Awaited<ReturnType<typeof admitResultOperation>>) {
  let announce: ((pid: number) => void) | undefined
  const ready = new Promise<number>((resolve) => {
    announce = resolve
  })
  const pending = withActor(w.api, w.who, 'write', async (c) => {
    const rows = await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    assert.ok(rows.rows[0])
    announce?.(rows.rows[0].pid)
    return requestRunnerResult(c, { projectId: w.projectId, operationId: op.operationId }, randomUUID(), {
      expectedOperationRevision: op.revision,
      maxPages: 8,
      maxBytes: 8192,
    })
  })
  void pending.catch(() => undefined)
  return { ready, pending }
}

async function firstCaptureWait(w: ResultWorld, kind: FenceKind, commit: boolean, expire = false): Promise<void> {
  const parent = kind === 'transitive' ? await addTransitiveDependency(w) : null
  const op = await admitResultOperation(w)
  const mutation = await fenceMutation(w, op.operationId, kind)
  if (parent) mutation.params[1] = parent
  if (expire)
    await w.owner.query(
      "UPDATE sophia.owner_runner_qualifications SET expires_at=clock_timestamp()+interval '0.2 seconds' WHERE resource_id=$1",
      [w.resourceId],
    )
  const tx = await heldOwner(w)
  let started: ReturnType<typeof announcedCapture> | undefined
  try {
    await tx.c.query(mutation.sql, mutation.params)
    started = announcedCapture(w, op)
    await actualLockWait(w, await raceBound('capture announcement', started.ready))
    if (expire) await pause(250)
    await tx.finish(commit)
    if (commit || expire)
      await assert.rejects(
        raceBound('capture refusal', started.pending),
        (err: unknown) =>
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err.code === 'invalid_request' || (kind === 'member' && err.code === 'forbidden')),
      )
    else {
      const receipt = await raceBound('capture after rollback', started.pending)
      assert.equal(receipt.state, 'pending')
      assert.equal(receipt.reservedPages, 0)
    }
  } finally {
    await tx.finish(false)
    if (started)
      await raceBound(
        'capture drain',
        started.pending.catch(() => undefined),
      )
  }
}

async function captureFirstWithdrawal(w: ResultWorld): Promise<void> {
  const op = await admitResultOperation(w)
  const tx = await heldOwner(w)
  let release: (() => void) | undefined
  const commit = new Promise<void>((resolve) => {
    release = resolve
  })
  let captured: (() => void) | undefined
  const ready = new Promise<void>((resolve) => {
    captured = resolve
  })
  const pending = withActor(w.api, w.who, 'write', async (c) => {
    const receipt = await requestRunnerResult(
      c,
      { projectId: w.projectId, operationId: op.operationId },
      randomUUID(),
      {
        expectedOperationRevision: op.revision,
        maxPages: 8,
        maxBytes: 8192,
      },
    )
    captured?.()
    await commit
    return receipt
  })
  void pending.catch(() => undefined)
  let withdrawal: Promise<unknown> = Promise.resolve()
  try {
    await raceBound('capture held before commit', ready)
    const pid = (await tx.c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid
    assert.ok(pid)
    withdrawal = tx.c.query('UPDATE sophia.source_objects SET eligible=false WHERE project_id=$1 AND id=$2', [
      w.projectId,
      w.sourceId,
    ])
    void withdrawal.catch(() => undefined)
    await actualLockWait(w, pid)
    release?.()
    const receipt = await raceBound('capture commit', pending)
    await raceBound('withdrawal after capture', withdrawal)
    await tx.finish(true)
    const rows = await w.owner.query<{ state: string; exchange_id: string | null; reserved_pages: number }>(
      'SELECT state,exchange_id,reserved_pages FROM sophia.owner_runner_collections WHERE id=$1',
      [receipt.collectionId],
    )
    assert.deepEqual(rows.rows[0], { state: 'withdrawn', exchange_id: null, reserved_pages: 0 })
  } finally {
    release?.()
    await raceBound(
      'withdrawal drain',
      withdrawal.catch(() => undefined),
    )
    await tx.finish(false)
    await raceBound(
      'held capture drain',
      pending.catch(() => undefined),
    )
  }
}

if (import.meta.url === pathToFileURL(absolutePath(process.argv[1] ?? '')).href) {
  describe('0116 private result persistence on real role-separated PostgreSQL', () => {
    let db: TestDatabase
    let w: ResultWorld
    let current: ResultWorld | undefined
    before(async () => {
      db = await createTestDatabase()
    })
    beforeEach(async () => {
      current = undefined
      w = await resultWorld(db)
      current = w
      await requireRunnerResults(w.api)
    })
    afterEach(async () => {
      const closing = current
      current = undefined
      await closing?.close()
    })
    after(async () => {
      await db?.drop()
    })
    it('R2: first actual pool acquisition failure preserves primary and cleanup errors and drains all pools', async () => {
      await partialWorldRegression(db, false)
    })
    it('R2: partial gateway start failure releases the journal, temporary directory and all acquired pools', async () => {
      await partialWorldRegression(db, true)
    })
    it('R2: expiry and maintenance failures both remain observable while all resources close', async () => {
      await closeWorldRegression(db)
      await resultOwnershipNoDbRegression()
    })
    for (const position of [1000000000000000, Number.MAX_SAFE_INTEGER])
      it(`R2: valid-digest lastPosition ${position} stages, replays and consumes; invalid values leave no writes`, async () => {
        await resultPositionRegression(w, position)
      })
    it('R1: an unrelated source-only legacy withdrawal never takes an S project lock', async () => {
      await legacyUnlockedWithdrawal(w)
    })
    for (const kind of [
      'selected',
      'private_object',
      'private_text',
      'manifest_body',
      'manifest_state',
      'transitive',
      'member',
      'qualification',
      'resource',
      'connection',
    ] as const) {
      for (const commit of [true, false])
        it(`R1 first capture fences ${kind}: withdrawal ${commit ? 'commits/refuses' : 'rolls back/rechecks'}`, async () => {
          await firstCaptureWait(w, kind, commit)
        })
    }
    it('R1: expiry after the actual source lock wait refuses capture after rollback too', async () => {
      await firstCaptureWait(w, 'selected', false, true)
    })
    it('R1: capture-first row locks make withdrawal wait, then see and synchronously purge the first collection', async () => {
      await captureFirstWithdrawal(w)
    })
    it('retains create and input exact own runs, one immutable Source, replay without native calls or lifecycle writes', async () => {
      const created = await admitResultOperation(w)
      const first = await retainResult(w, created)
      const input = await admitResultOperation(w, created.operationId)
      const next = await retainResult(w, input)
      assert.notEqual(first.descriptor.sourceId, next.descriptor.sourceId)
      assert.equal(next.descriptor.originalCreateId, created.operationId)
      assert.equal(next.descriptor.acceptedRunId, input.runId)
      assert.notEqual(next.descriptor.acceptedRunId, first.descriptor.acceptedRunId)
      const calls = w.t3.calls.length
      assert.deepEqual(await consumeRunnerResult(w.worker, next.claim, next.metadata), next.descriptor)
      assert.equal(w.t3.calls.length, calls)
      const read = await withActor(w.api, w.who, 'read', (c) =>
        readRunnerResult(c, w.projectId, next.descriptor.resultId),
      )
      assert.equal(read.text, RESULT_TEXT)
      assert.equal(read.result.versionId, read.result.sourceId)
      const staged = await w.owner.query<{ answer: unknown; state: string; go_count: number; delivery_count: number }>(
        'SELECT answer,state,go_count,delivery_count FROM sophia.owner_host_exchanges WHERE id=$1',
        [next.metadata.exchangeId],
      )
      assert.equal(staged.rows[0]?.answer, null)
      assert.equal(staged.rows[0]?.delivery_count, 1)
      assert.equal(staged.rows[0]?.go_count, 0)
      const own = await w.owner.query<{ state: string }>(
        'SELECT state FROM sophia.owner_runner_operations WHERE id=$1',
        [input.operationId],
      )
      assert.equal(own.rows[0]?.state, 'received')
    })
    it('keeps retained rights after host/qualification expiry; later queued input is not retroactively a dependency', async () => {
      const created = await admitResultOperation(w)
      const retained = await retainResult(w, created)
      await w.owner.query("UPDATE sophia.owner_hosts SET state='retired' WHERE journal_id=$1", [w.journal.id])
      await w.owner.query(
        "UPDATE sophia.owner_runner_qualifications SET qualified_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()-interval '1 second' WHERE resource_id=$1",
        [w.resourceId],
      )
      const read = await withActor(w.api, w.who, 'read', (c) =>
        readRunnerResult(c, w.projectId, retained.descriptor.resultId),
      )
      assert.equal(read.text, RESULT_TEXT)
      await w.owner.query("UPDATE sophia.owner_hosts SET state='active' WHERE journal_id=$1", [w.journal.id])
      await w.owner.query(
        "UPDATE sophia.owner_runner_qualifications SET expires_at=clock_timestamp()+interval '1 day' WHERE resource_id=$1",
        [w.resourceId],
      )
      const prior = await w.owner.query<{ n: string }>(
        'SELECT count(*) n FROM sophia.owner_runner_result_contexts WHERE result_id=$1',
        [retained.descriptor.resultId],
      )
      await admitResultOperation(w, created.operationId)
      const later = await w.owner.query<{ n: string }>(
        'SELECT count(*) n FROM sophia.owner_runner_result_contexts WHERE result_id=$1',
        [retained.descriptor.resultId],
      )
      assert.deepEqual(later.rows, prior.rows)
    })
    it('metadata discovery is owner/goal scoped and original-key lookup never proves an absent commit', async () => {
      const original = await admitResultOperation(w)
      const found = await withActor(w.api, w.who, 'read', (c) =>
        lookupRunnerWork(c, w, { key: original.key, kind: 'operation' }),
      )
      assert.equal(found.operation?.operationId, original.operationId)
      const page = await withActor(w.api, w.who, 'read', (c) => readRunnerWork(c, w.projectId, w.goalId, null))
      assert.ok(page.operations.length === 1)
      assert.equal(JSON.stringify(page).includes(RESULT_TEXT), false)
      const hidden = await withActor(w.api, w.teammate, 'read', (c) => readRunnerWork(c, w.projectId, w.goalId, null))
      assert.deepEqual(hidden.operations, [])
      const missing = await withActor(w.api, w.who, 'read', (c) =>
        lookupRunnerWork(c, w, { key: randomUUID(), kind: 'operation' }),
      )
      assert.equal(missing.state, 'not_observed')
      assert.equal(missing.absenceProvesNoCommit, false)
    })
    it('delivers one read durably, hides staged text from generic APIs, consumes concurrently once and refuses late resurrection', async () => {
      const op = await admitResultOperation(w)
      await requestResult(w, op)
      const claim = await claimRunnerResult(w.worker)
      assert.ok(claim)
      const { store, result } = await collectClaim(w, claim)
      assert.equal(result.kind, 'collected')
      if (result.kind !== 'collected' || !store.exchangeId) throw new Error('fixture did not collect')
      const generic = new DbExchangeStore(w.worker)
      assert.equal((await generic.exchange(w.who, store.exchangeId))?.answer, null)
      assert.equal((await generic.settle(w.who, store.exchangeId)).result, 'possible')
      assert.deepEqual(await w.channel.poll(10, 1), [])
      const metadata = {
        exchangeId: store.exchangeId,
        sha256: result.textSha256,
        versionKey: resultVersionKey(claim, result),
      }
      const pair = await Promise.all([
        consumeRunnerResult(w.worker, claim, metadata),
        consumeRunnerResult(w.worker, claim, metadata),
      ])
      assert.deepEqual(pair[0], pair[1])
      assert.equal((await w.channel.answer(store.exchangeId, result)).result, 'conflict')
      assert.equal(
        (await w.owner.query('SELECT 1 FROM sophia.owner_runner_results WHERE operation_id=$1', [op.operationId]))
          .rowCount,
        1,
      )
    })
    it('validates exact accepted run, UTF8 hash, closed keys and digest before accepting any staged body', async () => {
      const op = await admitResultOperation(w)
      await requestResult(w, op)
      const claim = await claimRunnerResult(w.worker)
      assert.ok(claim)
      const { store, result } = await collectClaim(w, claim)
      if (result.kind !== 'collected' || !store.exchangeId) throw new Error('fixture did not collect')
      const wrong: RunnerCollection[] = [
        { ...result, runId: 'another-run' },
        { ...result, byteLength: result.byteLength + 1 },
        { ...result, textSha256: '0'.repeat(64) },
        { ...result, resultDigest: 'f'.repeat(64) },
      ]
      for (const answer of wrong)
        await assert.rejects(w.channel.answer(store.exchangeId, answer), { message: 'Owner host result answer failed' })
      await w.owner.query(
        "UPDATE sophia.owner_runner_collections SET deadline_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [claim.collectionId],
      )
      assert.equal((await w.channel.answer(store.exchangeId, result)).result, 'conflict')
      assert.equal((await store.exchange(w.who, store.exchangeId))?.answer, null)
      await finishRunnerResult(w.worker, claim)
      const fresh = await requestResult(w, op)
      assert.equal(fresh.collectionId, claim.collectionId)
      assert.equal(fresh.state, 'unknown')
      assert.equal(fresh.reservedPages, 8)
      assert.equal(await claimRunnerResult(w.worker), null)
      assert.equal(
        (await w.owner.query('SELECT answer FROM sophia.owner_host_exchanges WHERE id=$1', [store.exchangeId])).rows[0]
          ?.answer,
        null,
      )
    })
    it('retries proven no-host refusal within the original root/deadline with no reserved pages', async () => {
      const op = await admitResultOperation(w)
      const admitted = await requestResult(w, op)
      await w.owner.query("UPDATE sophia.owner_hosts SET state='revoked' WHERE journal_id=$1", [w.journal.id])
      const c = await claimRunnerResult(w.worker)
      assert.ok(c)
      const store = new RunnerResultExchangeStore(w.worker, c)
      const port = new OwnerHostPortProxy({
        store,
        ownerId: c.ownerId,
        environmentRef: c.environmentRef,
        journalId: c.journalId,
        namespace: c.namespace,
        deadlineMs: 1000,
      })
      assert.equal(
        (
          await port.collect(
            { envelope: c.envelope, digest: digestOf(c.envelope), journalId: c.journalId },
            { v: 1, maxPages: 8, maxBytes: 8192 },
          )
        ).kind,
        'collection_unavailable',
      )
      await finishRunnerResult(w.worker, c)
      const same = await requestResult(w, op)
      assert.equal(same.collectionId, admitted.collectionId)
      assert.equal(same.deadlineAt, admitted.deadlineAt)
      assert.equal(same.reservedPages, 0)
      assert.equal(same.state, 'pending')
      await w.owner.query("UPDATE sophia.owner_hosts SET state='active' WHERE journal_id=$1", [w.journal.id])
      const retry = await claimRunnerResult(w.worker)
      assert.ok(retry)
      assert.notEqual(retry.permit, c.permit)
      const read = await collectClaim(w, retry)
      assert.equal(read.result.kind, 'collected')
      await finishRunnerResult(w.worker, retry)
    })
    it('freezes queued/uncertain input contexts as a declared privacy superset and purges when one is withdrawn', async () => {
      const op = await admitResultOperation(w)
      const queued = await withActor(w.api, w.who, 'write', (c) =>
        admitRunnerOperation(c, w.projectId, randomUUID(), {
          kind: 'input',
          resourceId: w.resourceId,
          targetOperationId: op.operationId,
          message: 'Queued context not proven read',
          expectedGoalRevision: 1,
          expectedAuthorityEpoch: 1,
          sourceIds: [w.sourceId],
        }),
      )
      const retained = await retainResult(w, op)
      const contexts = await w.owner.query(
        'SELECT operation_id FROM sophia.owner_runner_result_contexts WHERE result_id=$1',
        [retained.descriptor.resultId],
      )
      assert.equal(contexts.rowCount, 2)
      assert.ok(contexts.rows.some((x: { operation_id: string }) => x.operation_id === queued.operationId))
      await w.owner.query(
        "UPDATE sophia.source_objects SET state='deleted' WHERE id=(SELECT payload_source_id FROM sophia.owner_runner_operations WHERE id=$1)",
        [queued.operationId],
      )
      const read = await withActor(w.api, w.who, 'read', (c) =>
        readRunnerResult(c, w.projectId, retained.descriptor.resultId),
      )
      assert.equal(read.text, null)
      assert.equal(read.result.state, 'withdrawn')
    })
    it('original-key conflict, outsider and stale admission are refused before a new collection', async () => {
      const op = await admitResultOperation(w)
      const key = randomUUID()
      const first = await requestResult(w, op, key)
      assert.deepEqual(await requestResult(w, op, key), first)
      await assert.rejects(
        withActor(w.api, w.who, 'write', (c) =>
          requestRunnerResult(c, { projectId: w.projectId, operationId: op.operationId }, key, {
            expectedOperationRevision: op.revision,
            maxPages: 4,
            maxBytes: 8192,
          }),
        ),
        { code: 'idempotency_conflict' },
      )
      await assert.rejects(
        withActor(w.api, w.teammate, 'write', (c) =>
          requestRunnerResult(c, { projectId: w.projectId, operationId: op.operationId }, randomUUID(), {
            expectedOperationRevision: op.revision,
            maxPages: 8,
            maxBytes: 8192,
          }),
        ),
        { code: 'not_found' },
      )
      assert.equal(
        (await w.owner.query('SELECT 1 FROM sophia.owner_runner_collections WHERE project_id=$1', [w.projectId]))
          .rowCount,
        1,
      )
    })
    it('recovers a staged completed answer after worker loss without another native read and fences the old permit', async () => {
      const op = await admitResultOperation(w)
      await requestResult(w, op)
      const c = await claimRunnerResult(w.worker)
      assert.ok(c)
      const staged = await collectClaim(w, c)
      assert.equal(staged.result.kind, 'collected')
      await w.owner.query(
        "UPDATE sophia.owner_runner_collections SET consume_lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
        [c.collectionId],
      )
      const recovered = await resumeRunnerResult(w.worker)
      assert.ok(recovered)
      assert.notEqual(recovered.permit, c.permit)
      assert.equal(await resumeRunnerResult(w.worker), null)
      const calls = w.t3.calls.length
      const replayed = await collectClaim(w, recovered)
      assert.equal(w.t3.calls.length, calls)
      assert.equal(replayed.result.kind, 'collected')
      if (replayed.result.kind !== 'collected' || !replayed.store.exchangeId) throw new Error('missing staged answer')
      const metadata = {
        exchangeId: replayed.store.exchangeId,
        sha256: replayed.result.textSha256,
        versionKey: resultVersionKey(recovered, replayed.result),
      }
      await assert.rejects(consumeRunnerResult(w.worker, c, metadata), { code: 'forbidden' })
      assert.ok(await consumeRunnerResult(w.worker, recovered, metadata))
    })
    it('paginates beyond 100 operations for the selected goal and finds the original key outside page one', async () => {
      await w.owner.query(
        'UPDATE sophia.owner_runner_qualifications SET allowance_operations=1000 WHERE resource_id=$1',
        [w.resourceId],
      )
      const ids = new Set<string>()
      let originalKey = ''
      let originalId = ''
      for (let n = 0; n < 105; n += 1) {
        const key = randomUUID()
        const receipt = await withActor(w.api, w.who, 'write', (c) =>
          admitRunnerOperation(c, w.projectId, key, {
            kind: 'create',
            resourceId: w.resourceId,
            goalId: w.goalId,
            title: 'Paged history',
            message: 'Queued only',
            expectedGoalRevision: 1,
            expectedAuthorityEpoch: 1,
            sourceIds: [],
            baseCommit: BASE,
            writeScope: 'read_only',
            settings: SETTINGS,
          }),
        )
        ids.add(receipt.operationId)
        originalKey = key
        originalId = receipt.operationId
      }
      const first = await withActor(w.api, w.who, 'read', (c) => readRunnerWork(c, w.projectId, w.goalId, null))
      assert.equal(first.complete, false)
      assert.equal(first.operations.length, 100)
      assert.ok(first.nextCursor)
      const second = await withActor(w.api, w.who, 'read', (c) =>
        readRunnerWork(c, w.projectId, w.goalId, first.nextCursor),
      )
      assert.equal(second.complete, true)
      assert.equal(second.operations.length, 5)
      assert.deepEqual(new Set([...first.operations, ...second.operations].map((o) => o.operationId)), ids)
      const lookup = await withActor(w.api, w.who, 'read', (c) =>
        lookupRunnerWork(c, w, { key: originalKey, kind: 'operation' }),
      )
      assert.equal(lookup.operation?.operationId, originalId)
      assert.equal(w.t3.effects.launches, 0)
    })
    it('a delivered read remains unknown, fully charged and non-retryable under fresh keys and worker leases', async () => {
      const op = await admitResultOperation(w)
      const admitted = await requestResult(w, op)
      const c = await claimRunnerResult(w.worker)
      assert.ok(c)
      const store = new RunnerResultExchangeStore(w.worker, c)
      const input = {
        ownerId: c.ownerId,
        environmentRef: c.environmentRef,
        journalId: c.journalId,
        key: `collect:${op.operationId}:${randomUUID()}`,
        deadlineMs: 1000,
        request: collectionExchangeRequest(
          { envelope: c.envelope, digest: digestOf(c.envelope), journalId: c.journalId },
          { v: 1, maxPages: 8, maxBytes: 8192 },
        ),
      }
      const queued = await store.enqueue(input)
      assert.equal(queued.result, 'queued')
      assert.equal((await w.channel.poll(10, 1)).length, 1)
      assert.deepEqual(await w.channel.poll(10, 1), [])
      const again = await store.enqueue({ ...input, key: `collect:${op.operationId}:${randomUUID()}` })
      if (queued.result !== 'queued' || again.result !== 'existing') throw new Error('fixture exchange not queued')
      assert.equal(again.exchangeId, queued.exchangeId)
      await finishRunnerResult(w.worker, c)
      const same = await requestResult(w, op)
      assert.equal(same.collectionId, admitted.collectionId)
      assert.equal(same.deadlineAt, admitted.deadlineAt)
      assert.equal(same.state, 'unknown')
      assert.equal(same.reservedPages, 8)
      assert.equal(await claimRunnerResult(w.worker), null)
      assert.equal(await resumeRunnerResult(w.worker), null)
      assert.equal(
        (await w.channel.answer(queued.exchangeId, { v: 1, kind: 'collection_unavailable', reason: 'unavailable' }))
          .result,
        'conflict',
      )
    })
    it('source withdrawal waits for a locked staged answer, purges it synchronously and blocks late consume/answer', async () => {
      const op = await admitResultOperation(w)
      await requestResult(w, op)
      const c = await claimRunnerResult(w.worker)
      assert.ok(c)
      const staged = await collectClaim(w, c)
      if (staged.result.kind !== 'collected' || !staged.store.exchangeId) throw new Error('missing staged answer')
      const locker = await w.owner.connect()
      await locker.query('BEGIN')
      await locker.query('SELECT id FROM sophia.owner_host_exchanges WHERE id=$1 FOR UPDATE', [staged.store.exchangeId])
      const state = { done: false }
      const purge = w.owner
        .query('UPDATE sophia.source_objects SET eligible=false WHERE project_id=$1 AND id=$2', [
          w.projectId,
          w.sourceId,
        ])
        .finally(() => {
          state.done = true
        })
      void purge.catch(() => undefined)
      try {
        await pause(20)
        assert.equal(state.done, false, 'purge cannot skip a locked raw answer')
      } finally {
        await locker.query('COMMIT')
        locker.release()
      }
      await purge
      const row = await w.owner.query('SELECT answer FROM sophia.owner_host_exchanges WHERE id=$1', [
        staged.store.exchangeId,
      ])
      assert.equal(row.rows[0]?.answer, null)
      const metadata = {
        exchangeId: staged.store.exchangeId,
        sha256: staged.result.textSha256,
        versionKey: resultVersionKey(c, staged.result),
      }
      assert.equal(await consumeRunnerResult(w.worker, c, metadata), null)
      assert.equal((await w.channel.answer(staged.store.exchangeId, staged.result)).result, 'conflict')
    })
    it('membership loss purges the private output body while operation accounting metadata survives', async () => {
      const op = await admitResultOperation(w)
      const retained = await retainResult(w, op)
      await w.owner.query(
        'UPDATE sophia.project_members SET active=false,revision=revision+1 WHERE project_id=$1 AND actor_id=$2',
        [w.projectId, w.who],
      )
      await assert.rejects(
        withActor(w.api, w.who, 'read', (c) => readRunnerResult(c, w.projectId, retained.descriptor.resultId)),
        { code: 'not_found' },
      )
      assert.equal(
        (await w.owner.query('SELECT 1 FROM sophia.source_texts WHERE source_id=$1', [retained.descriptor.sourceId]))
          .rowCount,
        0,
      )
      assert.equal(
        (await w.owner.query('SELECT state FROM sophia.owner_runner_operations WHERE id=$1', [op.operationId])).rows[0]
          ?.state,
        'received',
      )
    })
    it('withdrawal synchronously removes all retained raw text and generic exchange/settle cannot recover it', async () => {
      await retainResult(w, await admitResultOperation(w))
      const rows = await w.owner.query<{ id: string; source_id: string }>(
        'SELECT id,source_id FROM sophia.owner_runner_results WHERE project_id=$1',
        [w.projectId],
      )
      await w.owner.query(
        'UPDATE sophia.source_objects SET eligible=false,eligibility_revision=eligibility_revision+1 WHERE project_id=$1 AND id=$2',
        [w.projectId, w.sourceId],
      )
      for (const r of rows.rows) {
        const read = await withActor(w.api, w.who, 'read', (c) => readRunnerResult(c, w.projectId, r.id))
        assert.equal(read.text, null)
        assert.equal(read.result.state, 'withdrawn')
        assert.equal(
          (await w.owner.query('SELECT 1 FROM sophia.source_texts WHERE source_id=$1', [r.source_id])).rowCount,
          0,
        )
      }
      const raw = await w.owner.query<{ n: string }>(
        "SELECT count(*) n FROM sophia.owner_host_exchanges WHERE kind='collect' AND project_id=$1 AND answer IS NOT NULL",
        [w.projectId],
      )
      assert.equal(raw.rows[0]?.n, '0')
    })
  })
}
