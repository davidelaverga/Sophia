// Owner-runner operations through the API's real routes (amendment A47, migration 0092), level: sql-run on real
// PostgreSQL. Admissions off (the default) refuses only NEW work (create, input): the owner still reads work already
// admitted, and a qualified owner's Stop of a running binding is still admitted with every check (r3, R2-F08).
// A database that never had 0092 answers reads projection_unavailable, never an empty list, and the API with
// admissions off stays ready on it. The qualification rows are SYNTHETIC fixtures: no route, account or T3 install
// is qualified by them.
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  claimRunnerOutbox,
  createPool,
  prepareRunnerSend,
  recordRunnerAnswer,
  runnerFollowups,
} from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const A = randomUUID() // the resource's owner
const E = randomUUID() // another editor
const C = randomUUID() // an outsider
const PIN = 'ade473018d32003658b7d38693e083ee2e314bd8'

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })

// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type Body = any
async function call(app: FastifyInstance, who: string | null, url: string, body?: unknown, key = randomUUID()) {
  const res = await app.inject({
    method: body === undefined ? 'GET' : 'POST',
    url,
    headers: {
      ...(who ? { authorization: `Bearer ${await token(who)}` } : {}),
      ...(body === undefined ? {} : { 'idempotency-key': key }),
    },
    ...(body === undefined ? {} : { payload: body as object }),
  })
  const json: Body = res.body ? JSON.parse(res.body) : null
  return { status: res.statusCode, json }
}

describe('with 0092 installed', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let worker: pg.Pool
  let owner: pg.Pool
  let off: FastifyInstance
  let admit: FastifyInstance

  before(async () => {
    db = await createTestDatabase()
    pool = createPool(db.apiUrl, { max: 4 })
    worker = createPool(db.workerUrl, { max: 2 })
    owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
    off = buildApp({ pool, verifyActor })
    admit = buildApp({ pool, verifyActor, ownerRunnerAdmissions: 'admit' })
    await off.ready()
    await admit.ready()
  })
  after(async () => {
    await off.close()
    await admit.close()
    await pool.end()
    await worker.end()
    await owner.end()
    await db.drop()
  })

  /** A create sent and received through the worker's own SQL functions (a synthetic receipt; no T3 is involved). */
  async function received(projectId: string, operationId: string) {
    const [row] = (
      await claimRunnerOutbox(
        worker,
        'api-test-worker',
        { ownerId: A, environmentRef: 'env-owner-1' },
        { newWork: true, limit: 50, leaseSeconds: 30 },
      )
    ).filter((o) => o.project_id === projectId)
    assert.ok(row?.lease_token)
    const journalId = randomUUID()
    assert.equal((await prepareRunnerSend(worker, projectId, row.id, row.lease_token, journalId)).result, 'send')
    const thread = `mcp:launch:${'a'.repeat(64)}`
    await recordRunnerAnswer(
      worker,
      { projectId, operationId, leaseToken: row.lease_token, journalId },
      {
        kind: 'received',
        identity: { namespace: 'client:s1', commandId: thread, messageId: thread, threadId: thread },
        runId: 'run-1',
        delivery: 'started',
      },
    )
  }

  /** A Stop sent, acknowledged and proven settled through the worker's own SQL functions (no T3 is involved). */
  async function settleStop(projectId: string, stopId: string) {
    const runner = { ownerId: A, environmentRef: 'env-owner-1' }
    const [row] = (
      await claimRunnerOutbox(worker, 'api-test-worker', runner, { newWork: true, limit: 50, leaseSeconds: 30 })
    ).filter((o) => o.project_id === projectId)
    assert.ok(row?.lease_token)
    const journalId = randomUUID()
    assert.equal((await prepareRunnerSend(worker, projectId, row.id, row.lease_token, journalId)).result, 'send')
    const thread = `mcp:launch:${'a'.repeat(64)}`
    await recordRunnerAnswer(
      worker,
      { projectId, operationId: stopId, leaseToken: row.lease_token, journalId },
      {
        kind: 'received',
        identity: { namespace: 'client:s1', commandId: 'command:mcp:stop', messageId: null, threadId: thread },
        runId: null,
        delivery: 'stop_requested',
      },
    )
    const followup = (await runnerFollowups(worker, runner, journalId, 50, 0)).find((f) => f.operationId === stopId)
    assert.ok(followup)
    await recordRunnerAnswer(
      worker,
      { projectId, operationId: stopId, leaseToken: null, journalId },
      { kind: 'no_active_run', barrier: followup.barrier },
    )
  }

  async function qualifiedProject() {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const connectionId = randomUUID()
    const resourceId = randomUUID()
    await owner.query(
      `INSERT INTO sophia.execution_connections(id, owner_id, upstream_origin, upstream_subject, state)
       VALUES ($1, $2, 'synthetic-owner-host', 'synthetic-account', 'linked')`,
      [connectionId, A],
    )
    await owner.query(
      `INSERT INTO sophia.executor_resources(project_id, id, owner_id, connection_id, harness, label, repository_root, state)
       VALUES ($1, $2, $3, $4, 'codex-native', 'Synthetic Codex', 'synthetic/repository', 'active')`,
      [p.projectId, resourceId, A, connectionId],
    )
    await owner.query(
      `SELECT sophia.qualify_owner_runner($1, $2, $3, 'env-owner-1', 'project-sophia', 'read-only-v1', 1, 'gateway_enforced',
         $4, ARRAY['create','input','stop'], 50, now() + interval '1 day', 'synthetic fixture: not a live qualification')`,
      [p.projectId, resourceId, PIN, `codex:${randomUUID()}`],
    )
    const qualificationId = (
      await owner.query<{ id: string }>(
        `SELECT id FROM sophia.owner_runner_qualifications WHERE project_id=$1 AND resource_id=$2`,
        [p.projectId, resourceId],
      )
    ).rows[0]?.id
    const create = {
      kind: 'create',
      resourceId,
      goalId: p.goalId,
      title: 'Read-only qualification',
      message: 'Report the Ask admission boundary.',
      expectedGoalRevision: 1,
      expectedAuthorityEpoch: 1,
    }
    return { ...p, resourceId, qualificationId, create, base: `/api/v1/projects/${p.projectId}/runner-operations` }
  }

  it('admits through the route, replays the same key, and refuses unknown fields and unsupported kinds', async () => {
    const p = await qualifiedProject()
    const key = randomUUID()
    const first = await call(admit, A, p.base, p.create, key)
    assert.equal(first.status, 202)
    assert.equal(first.json.state, 'admitted')
    const again = await call(admit, A, p.base, p.create, key)
    assert.deepEqual(again, first)
    assert.equal(
      (await call(admit, A, p.base, { ...p.create, message: 'Other.' }, key)).json.code,
      'idempotency_conflict',
    )
    for (const extra of [
      { shell: 'rm -rf /' },
      { tool: 't3_thread_send' },
      { url: 'https://example.invalid' },
      { nativeSessionId: 's' },
    ]) {
      const r = await call(admit, A, p.base, { ...p.create, ...extra })
      assert.equal(r.status, 422, JSON.stringify(extra))
    }
    for (const kind of ['hold', 'resume', 'resolve_permission', 'answer_question']) {
      const r = await call(admit, A, p.base, { kind, resourceId: p.resourceId })
      assert.equal(r.json.code, 'runner_operation_unsupported', kind)
    }
    // Another member's use of A's resource answers like a missing one.
    assert.equal((await call(admit, E, p.base, p.create)).json.code, 'not_found')
  })

  it('with admissions off after admission: no new admission, while the owner still reads the work and its state', async () => {
    const p = await qualifiedProject()
    const admitted = await call(admit, A, p.base, p.create)
    assert.equal(admitted.status, 202)
    // An operation possibly sent and uncertain, as a worker would have left it before the switch.
    await owner.query(
      `UPDATE sophia.owner_runner_operations SET state='unknown', reason='the dispatch lease expired after a possible send',
         possible_send_at=now(), native_namespace='client:s1', native_command_id='mcp:launch:x', native_thread_id='mcp:launch:x'
       WHERE id=$1`,
      [admitted.json.operationId],
    )
    const refused = await call(off, A, p.base, p.create)
    assert.equal(refused.status, 403)
    assert.equal(refused.json.code, 'runner_admission_disabled')
    const list = await call(off, A, p.base)
    assert.equal(list.status, 200)
    assert.deepEqual(
      (list.json as { operations: { operationId: string }[] }).operations.map((o) => o.operationId),
      [admitted.json.operationId],
    )
    const one = await call(off, A, `${p.base}/${admitted.json.operationId}`)
    assert.equal(one.status, 200)
    assert.equal(one.json.state, 'unknown')
    assert.equal(one.json.nativeThreadId, 'mcp:launch:x', 'the original identity is kept and shown to its owner')
    assert.equal('nativeNamespace' in one.json, false, 'the MCP session namespace stays out of the view')
    // Owner-safe: another member and an outsider see nothing of it.
    assert.deepEqual((await call(off, E, p.base)).json.operations, [])
    assert.equal((await call(off, E, `${p.base}/${admitted.json.operationId}`)).json.code, 'not_found')
    assert.equal((await call(off, C, p.base)).status, 403)
    // The off API requires nothing new to be ready; the admitting one requires 0092, which is here.
    assert.equal((await off.inject({ method: 'GET', url: '/ready' })).statusCode, 200)
    assert.equal((await admit.inject({ method: 'GET', url: '/ready' })).statusCode, 200)
  })

  it('with admissions off: a qualified owner Stop is admitted, while create and input are refused (r3, R2-F08)', async () => {
    const p = await qualifiedProject()
    const created = await call(admit, A, p.base, p.create)
    await received(p.projectId, created.json.operationId)
    const target = created.json.operationId as string
    const input = { kind: 'input', resourceId: p.resourceId, targetOperationId: target, message: 'And the outbox?' }
    const stop = { kind: 'stop', resourceId: p.resourceId, targetOperationId: target }
    const operationsOf = async () =>
      (
        await owner.query<{ kind: string; state: string }>(
          `SELECT kind, state FROM sophia.owner_runner_operations WHERE project_id=$1 ORDER BY created_at`,
          [p.projectId],
        )
      ).rows
    for (const [what, body] of [
      ['a create', p.create],
      ['an input', input],
      ['a hold', { kind: 'hold', resourceId: p.resourceId }],
    ] as const) {
      const refused = await call(off, A, p.base, body)
      assert.equal(refused.status, 403, what)
      assert.equal(refused.json.code, 'runner_admission_disabled', what)
    }
    // Off grants nothing: the same Stop by another editor, an outsider, or on another project, is refused as before.
    assert.equal((await call(off, E, p.base, stop)).json.code, 'not_found')
    assert.equal((await call(off, C, p.base, stop)).status, 403)
    const elsewhere = await qualifiedProject()
    assert.equal((await call(off, A, elsewhere.base, stop)).json.code, 'not_found')
    assert.deepEqual(await operationsOf(), [{ kind: 'create', state: 'received' }], 'nothing written by a refusal')
    const key = randomUUID()
    const stopped = await call(off, A, p.base, stop, key)
    assert.equal(stopped.status, 202)
    assert.equal(stopped.json.kind, 'stop')
    assert.equal(stopped.json.state, 'admitted')
    assert.deepEqual(await call(off, A, p.base, stop, key), stopped, 'the same key replays its receipt')
    assert.equal(
      (await call(off, A, p.base, stop)).json.code,
      'invalid_state',
      'integrated r2 F02: a second Stop under a fresh key is refused, never an unbound success',
    )
    assert.deepEqual(await operationsOf(), [
      { kind: 'create', state: 'received' },
      { kind: 'stop', state: 'admitted' },
    ])
    const binding = await owner.query<{ state: string }>(
      `SELECT b.state FROM sophia.execution_bindings b JOIN sophia.owner_runner_operations o ON o.binding_id=b.id
        WHERE o.id=$1`,
      [target],
    )
    assert.equal(binding.rows[0]?.state, 'stopping', "the Stop's fence, unchanged")
  })

  it('binds every successful Stop key; a fresh-key duplicate is refused and binds nothing (integrated r2, F02)', async () => {
    const p = await qualifiedProject()
    const created = await call(admit, A, p.base, p.create)
    await received(p.projectId, created.json.operationId)
    const stop = { kind: 'stop', resourceId: p.resourceId, targetOperationId: created.json.operationId }
    const rowsUnder = async (key: string) =>
      (
        await owner.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM sophia.owner_runner_operations WHERE project_id=$1 AND client_request_id=$2`,
          [p.projectId, key],
        )
      ).rows[0]?.n
    // Two concurrent gestures under different keys: one Stop is admitted, the other refused.
    const keys = [randomUUID(), randomUUID()] as const
    const both = await Promise.all(keys.map((k) => call(admit, A, p.base, stop, k)))
    const wonAt = both.findIndex((r) => r.status === 202)
    assert.equal(both.filter((r) => r.status === 202).length, 1, JSON.stringify(both))
    const won = both[wonAt]
    const refused = both[1 - wonAt]
    const wonKey = keys[wonAt]
    const refusedKey = keys[1 - wonAt]
    assert.ok(won && refused && wonKey && refusedKey)
    assert.equal(refused.json.code, 'invalid_state')
    assert.equal(await rowsUnder(refusedKey), 0, 'a refused key binds nothing')
    assert.equal(await rowsUnder(wonKey), 1)
    // The successful key replays exactly; another request under it conflicts.
    assert.deepEqual(await call(admit, A, p.base, stop, wonKey), won)
    assert.equal((await call(admit, A, p.base, p.create, wonKey)).json.code, 'idempotency_conflict')
    assert.equal(
      (await call(admit, A, p.base, { ...stop, targetOperationId: randomUUID() }, wonKey)).json.code,
      'idempotency_conflict',
      'a changed target under the same key',
    )
    // After settlement (and with admissions off) the same key still replays its own, now settled, receipt.
    await settleStop(p.projectId, won.json.operationId)
    const replay = await call(off, A, p.base, stop, wonKey)
    assert.equal(replay.status, 202)
    assert.equal(replay.json.operationId, won.json.operationId)
    assert.equal(replay.json.state, 'settled')
    // A refused key may carry another request later: the refusal bound nothing.
    const reused = await call(admit, A, p.base, p.create, refusedKey)
    assert.equal(reused.status, 202)
    assert.notEqual(reused.json.operationId, won.json.operationId)
    // One actual Stop, and no allowance used by any Stop.
    const stops = await owner.query(
      `SELECT id FROM sophia.owner_runner_operations WHERE project_id=$1 AND kind='stop'`,
      [p.projectId],
    )
    assert.equal(stops.rowCount, 1)
    const used = await owner.query<{ used: number }>(
      `SELECT used_operations AS used FROM sophia.owner_runner_qualifications WHERE id=$1`,
      [p.qualificationId],
    )
    assert.equal(used.rows[0]?.used, 2, 'the two creates only')
    // Keys are scoped to their project and owner: the same key elsewhere is another request entirely.
    const elsewhere = await qualifiedProject()
    assert.equal((await call(admit, A, elsewhere.base, elsewhere.create, wonKey)).status, 202)
  })

  it('with admissions off: a Stop on a revoked route is still refused (no revocation policy is invented)', async () => {
    const p = await qualifiedProject()
    const created = await call(admit, A, p.base, p.create)
    await received(p.projectId, created.json.operationId)
    await owner.query(`SELECT sophia.revoke_owner_runner($1, $2, 'synthetic')`, [p.projectId, p.qualificationId])
    const refused = await call(off, A, p.base, {
      kind: 'stop',
      resourceId: p.resourceId,
      targetOperationId: created.json.operationId,
    })
    assert.equal(refused.status, 403)
    assert.equal(refused.json.code, 'runner_unqualified')
  })
})

describe('on a database that never had 0092', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let off: FastifyInstance
  let admit: FastifyInstance
  const dir = mkdtempSync(join(tmpdir(), 'sophia-before-0092-'))

  before(async () => {
    const migrations = resolve('db/migrations')
    for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql') && n < '0092')) {
      symlinkSync(join(migrations, f), join(dir, f))
    }
    db = await createTestDatabase(dir)
    pool = createPool(db.apiUrl, { max: 2 })
    off = buildApp({ pool, verifyActor })
    admit = buildApp({ pool, verifyActor, ownerRunnerAdmissions: 'admit' })
    await off.ready()
    await admit.ready()
  })
  after(async () => {
    await off.close()
    await admit.close()
    await pool.end()
    await db.drop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('answers reads projection_unavailable, never an empty list, and stays ready with admissions off', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    const base = `/api/v1/projects/${p.projectId}/runner-operations`
    const list = await call(off, A, base)
    assert.equal(list.status, 503)
    assert.equal(list.json.code, 'projection_unavailable')
    assert.equal((await call(off, A, `${base}/${randomUUID()}`)).json.code, 'projection_unavailable')
    assert.equal(
      (await call(off, A, base, { kind: 'create', resourceId: randomUUID() })).json.code,
      'runner_admission_disabled',
    )
    assert.equal(
      (await call(off, A, base, { kind: 'stop', resourceId: randomUUID(), targetOperationId: randomUUID() })).json.code,
      'projection_unavailable',
      'a Stop reaches the installation check, and is never an empty success',
    )
    assert.equal((await off.inject({ method: 'GET', url: '/ready' })).statusCode, 200)
    // An API set to admit is not ready here: it would call what this database does not have.
    assert.equal((await admit.inject({ method: 'GET', url: '/ready' })).statusCode, 503)
    assert.equal(
      (await call(admit, A, base, { kind: 'create', resourceId: randomUUID() })).json.code,
      'projection_unavailable',
    )
  })
})
