// Owner-runner admission and its fences (migration 0092, amendment A47), level: sql-run, on real PostgreSQL with the
// production split: member calls on the non-owner sophia_api login under RLS, dispatch on the sophia_worker login. The
// qualification rows here are SYNTHETIC fixtures written by the migration owner: they prove the database's rules, not
// that any owner route, account or T3 install was qualified.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { OwnerRunnerOperationRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  admitGoalCommand,
  admitRunnerOperation,
  claimRunnerOutbox,
  claimRuntimeOutbox,
  createPool,
  maintainRunnerOperations,
  prepareRunnerSend,
  readRunnerOperation,
  readRunnerOperations,
  withActor,
} from './index.ts'

const A = randomUUID() // admin, the resource's owner
const E = randomUUID() // editor
const V = randomUUID() // viewer
const C = randomUUID() // outsider
const PIN = 'ade473018d32003658b7d38693e083ee2e314bd8'
/** SYNTHETIC source facts (0096): a requested base and a declared policy with one model and one effort option. */
const BASE = '0123456789abcdef0123456789abcdef01234567'
const POLICY = {
  v: 1,
  instanceId: 'claudeAgent',
  models: [{ model: 'synthetic-model', options: [{ id: 'effort', values: ['low', 'high'] }] }],
}
const SETTINGS = { instanceId: 'claudeAgent', model: 'synthetic-model', options: [{ id: 'effort', value: 'high' }] }
const SOURCE_FACTS = { sourceIds: [], baseCommit: BASE, writeScope: 'read_only', settings: SETTINGS } as const

let db: TestDatabase
let pool: pg.Pool
let worker: pg.Pool
let owner: pg.Pool

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  worker = createPool(db.workerUrl, { max: 2 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
})
after(async () => {
  await pool.end()
  await worker.end()
  await owner.end()
  await db.drop()
})

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof DomainError ? err.code : `raw:${String(err)}`
  }
}

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> => (await owner.query(sql, params)).rows[0] as T

/** A synthetic native resource of `who`, and (unless `qualify` is false) a synthetic qualification of its route. */
async function nativeResource(
  projectId: string,
  who: string,
  {
    qualify = true,
    operations = ['create', 'input', 'stop'],
    allowance = 50,
    accountKey = `claude:${randomUUID()}`,
    policy = true,
  } = {},
) {
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
    [projectId, resourceId, who, connectionId],
  )
  let qualificationId: string | null = null
  if (qualify) {
    qualificationId = (
      await one<{ id: string }>(
        `SELECT sophia.qualify_owner_runner($1, $2, $3, 'env-owner-1', 'project-sophia', 'read-only-v1', 1,
           'gateway_enforced', $4, $5, $6, now() + interval '1 day', 'synthetic fixture: not a live qualification') AS id`,
        [projectId, resourceId, PIN, accountKey, operations, allowance],
      )
    ).id
    if (policy)
      await owner.query(`SELECT sophia.declare_owner_runner_source_policy($1, $2, $3)`, [
        projectId,
        qualificationId,
        JSON.stringify(POLICY),
      ])
  }
  return { resourceId, connectionId, qualificationId, accountKey }
}

const createReq = (
  resourceId: string,
  goalId: string,
  over: Partial<OwnerRunnerOperationRequest> = {},
): OwnerRunnerOperationRequest => ({
  kind: 'create',
  resourceId,
  goalId,
  title: 'Read-only qualification',
  message: 'Report the Ask admission boundary.',
  expectedGoalRevision: 1,
  expectedAuthorityEpoch: 1,
  ...SOURCE_FACTS,
  ...over,
})

const admit = (who: string, projectId: string, req: OwnerRunnerOperationRequest, key = randomUUID()) =>
  withActor(pool, who, 'write', (c) => admitRunnerOperation(c, projectId, key, req))

const counts = (projectId: string) =>
  one<{ ops: number; commands: number; outbox: number }>(
    `SELECT (SELECT count(*)::int FROM sophia.owner_runner_operations WHERE project_id=$1) AS ops,
            (SELECT count(*)::int FROM sophia.commands WHERE project_id=$1) AS commands,
            (SELECT count(*)::int FROM sophia.outbox WHERE project_id=$1) AS outbox`,
    [projectId],
  )

describe('admission', () => {
  it('refuses a resource with no qualification, before any write', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    const r = await nativeResource(p.projectId, A, { qualify: false })
    assert.equal(await codeOf(admit(A, p.projectId, createReq(r.resourceId, p.goalId))), 'runner_unqualified')
    assert.deepEqual(await counts(p.projectId), { ops: 0, commands: 0, outbox: 0 })
  })

  it('is owner-bound: another member, a viewer or an outsider cannot use the resource', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] })
    const r = await nativeResource(p.projectId, A)
    assert.equal(await codeOf(admit(E, p.projectId, createReq(r.resourceId, p.goalId))), 'not_found')
    assert.equal(await codeOf(admit(V, p.projectId, createReq(r.resourceId, p.goalId))), 'forbidden')
    assert.equal(await codeOf(admit(C, p.projectId, createReq(r.resourceId, p.goalId))), 'forbidden')
    assert.deepEqual(await counts(p.projectId), { ops: 0, commands: 0, outbox: 0 })
  })

  it('keeps the operation, its command and outbox row together, the message out of what members can read', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const r = await nativeResource(p.projectId, A)
    const receipt = await admit(A, p.projectId, createReq(r.resourceId, p.goalId))
    assert.equal(receipt.state, 'admitted')
    const row = await one<{
      destination: string
      cleanup: boolean
      semantic: Record<string, unknown>
      binding_state: string
      owner: string
      unit: string
    }>(
      `SELECT ob.destination, ob.cleanup, c.semantic_request AS semantic, b.state AS binding_state,
              b.continuation_owner AS owner, b.runtime_unit_id AS unit
         FROM sophia.owner_runner_operations o
         JOIN sophia.outbox ob ON ob.project_id=o.project_id AND ob.id=o.outbox_id
         JOIN sophia.commands c ON c.project_id=o.project_id AND c.id=o.command_id
         JOIN sophia.execution_bindings b ON b.project_id=o.project_id AND b.id=o.binding_id
        WHERE o.id=$1`,
      [receipt.operationId],
    )
    assert.equal(row.destination, 'runner.create')
    assert.equal(row.cleanup, false)
    assert.deepEqual(Object.keys(row.semantic).toSorted(), ['kind', 'operationId', 'payloadDigest'])
    assert.equal(row.binding_state, 'launching', 'never created: the dsh cleanup path would settle it')
    assert.equal(row.owner, 'native_goal')
    assert.equal(row.unit, 'owner-runner:t3')
    // Its events are the owner's alone.
    const events = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM sophia.project_events WHERE project_id=$1 AND entity_id=$2 AND visibility_owner IS DISTINCT FROM $3`,
      [p.projectId, receipt.operationId, A],
    )
    assert.equal(events.n, 0)
    // Another member reads neither the operation nor its list.
    assert.equal(
      await codeOf(withActor(pool, E, 'read', (c) => readRunnerOperation(c, p.projectId, receipt.operationId))),
      'not_found',
    )
    assert.deepEqual(await withActor(pool, E, 'read', (c) => readRunnerOperations(c, p.projectId)), [])
    assert.equal(await codeOf(withActor(pool, C, 'read', (c) => readRunnerOperations(c, p.projectId))), 'forbidden')
    const mine = await withActor(pool, A, 'read', (c) => readRunnerOperation(c, p.projectId, receipt.operationId))
    assert.equal(mine.message, 'Report the Ask admission boundary.')
    assert.equal(mine.state, 'admitted')
  })

  it('answers the same key and request with the first receipt, and conflicts on another request', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    const r = await nativeResource(p.projectId, A)
    const key = randomUUID()
    const first = await admit(A, p.projectId, createReq(r.resourceId, p.goalId), key)
    assert.deepEqual(await admit(A, p.projectId, createReq(r.resourceId, p.goalId), key), first)
    assert.equal(
      await codeOf(admit(A, p.projectId, createReq(r.resourceId, p.goalId, { message: 'Something else.' }), key)),
      'idempotency_conflict',
    )
    const used = await one<{ used: number }>(
      `SELECT used_operations AS used FROM sophia.owner_runner_qualifications WHERE id=$1`,
      [r.qualificationId],
    )
    assert.equal(used.used, 1, 'a replay consumes no allowance')
  })

  it('refuses hold, resume, permission approval and question answers as unsupported, before any write', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    const r = await nativeResource(p.projectId, A)
    for (const kind of ['hold', 'resume', 'resolve_permission', 'answer_question'] as const) {
      assert.equal(
        await codeOf(admit(A, p.projectId, { kind, resourceId: r.resourceId })),
        'runner_operation_unsupported',
        kind,
      )
    }
    assert.deepEqual(await counts(p.projectId), { ops: 0, commands: 0, outbox: 0 })
  })

  it('refuses an operation the route was not qualified for, a used allowance, and a revoked or expired route', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    const narrow = await nativeResource(p.projectId, A, { operations: ['create'], allowance: 1 })
    const created = await admit(A, p.projectId, createReq(narrow.resourceId, p.goalId))
    assert.equal(
      await codeOf(admit(A, p.projectId, createReq(narrow.resourceId, p.goalId))),
      'runner_unqualified',
      'allowance used',
    )
    await owner.query(
      `UPDATE sophia.owner_runner_operations SET state='received', native_thread_id='t-1' WHERE id=$1`,
      [created.operationId],
    )
    assert.equal(
      await codeOf(
        admit(A, p.projectId, {
          kind: 'input',
          resourceId: narrow.resourceId,
          targetOperationId: created.operationId,
          message: 'x',
          expectedGoalRevision: 1,
          expectedAuthorityEpoch: 1,
          sourceIds: [],
        }),
      ),
      'runner_unqualified',
      'input not qualified',
    )
    const revoked = await nativeResource(p.projectId, A)
    await owner.query(`SELECT sophia.revoke_owner_runner($1, $2, 'synthetic revocation')`, [
      p.projectId,
      revoked.qualificationId,
    ])
    assert.equal(await codeOf(admit(A, p.projectId, createReq(revoked.resourceId, p.goalId))), 'runner_unqualified')
    const expired = await nativeResource(p.projectId, A)
    await owner.query(
      `UPDATE sophia.owner_runner_qualifications SET qualified_at=now()-interval '2 days', expires_at=now()-interval '1 day' WHERE id=$1`,
      [expired.qualificationId],
    )
    assert.equal(await codeOf(admit(A, p.projectId, createReq(expired.resourceId, p.goalId))), 'runner_unqualified')
  })

  it('needs the current goal revision and epoch, and a known thread for an input', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    const r = await nativeResource(p.projectId, A)
    assert.equal(
      await codeOf(admit(A, p.projectId, createReq(r.resourceId, p.goalId, { expectedAuthorityEpoch: 2 }))),
      'stale_revision',
    )
    const created = await admit(A, p.projectId, createReq(r.resourceId, p.goalId))
    const input = {
      kind: 'input' as const,
      resourceId: r.resourceId,
      targetOperationId: created.operationId,
      message: 'And the outbox?',
      expectedGoalRevision: 1,
      expectedAuthorityEpoch: 1,
      sourceIds: [],
    }
    assert.equal(await codeOf(admit(A, p.projectId, input)), 'invalid_state', 'its thread is not known yet')
    assert.equal(await codeOf(admit(A, p.projectId, { ...input, targetOperationId: randomUUID() })), 'not_found')
  })

  it('is never claimed by the dsh dispatcher, and a goal Hold before the send denies it', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    const r = await nativeResource(p.projectId, A)
    const created = await admit(A, p.projectId, createReq(r.resourceId, p.goalId))
    const dsh = await claimRuntimeOutbox(worker, 'dsh-worker', 50, 30)
    assert.equal(dsh.filter((o) => o.project_id === p.projectId && o.destination.startsWith('runner.')).length, 0)
    await withActor(pool, A, 'write', (c) =>
      admitGoalCommand(c, p.projectId, randomUUID(), {
        kind: 'hold',
        goalId: p.goalId,
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        bodySourceId: null,
      }),
    )
    assert.ok((await maintainRunnerOperations(worker)) >= 1)
    const op = await withActor(pool, A, 'read', (c) => readRunnerOperation(c, p.projectId, created.operationId))
    assert.equal(op.state, 'denied')
    const binding = await one<{ state: string }>(
      `SELECT b.state FROM sophia.execution_bindings b JOIN sophia.owner_runner_operations o ON o.binding_id=b.id WHERE o.id=$1`,
      [created.operationId],
    )
    assert.equal(binding.state, 'settled', 'nothing ran: the goal can complete its hold')
    const claimed = await claimRunnerOutbox(
      worker,
      'runner-worker',
      { ownerId: A, environmentRef: 'env-owner-1' },
      { newWork: true, limit: 50, leaseSeconds: 30 },
    )
    assert.equal(claimed.filter((o) => o.project_id === p.projectId).length, 0)
  })

  it("lets one owner runner claim only its own owner's rows, on its own native environment", async () => {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const mine = await nativeResource(p.projectId, A)
    const theirs = await nativeResource(p.projectId, E)
    await admit(A, p.projectId, createReq(mine.resourceId, p.goalId))
    await admit(E, p.projectId, createReq(theirs.resourceId, p.goalId))
    const newWorkOff = await claimRunnerOutbox(
      worker,
      'runner-worker',
      { ownerId: A, environmentRef: 'env-owner-1' },
      { newWork: false, limit: 50, leaseSeconds: 30 },
    )
    assert.equal(newWorkOff.filter((o) => o.project_id === p.projectId).length, 0, 'new work off claims no create (r3)')
    const otherEnvironment = await claimRunnerOutbox(
      worker,
      'runner-worker',
      { ownerId: A, environmentRef: 'env-other' },
      { newWork: true, limit: 50, leaseSeconds: 30 },
    )
    assert.equal(otherEnvironment.filter((o) => o.project_id === p.projectId).length, 0)
    const claimed = (
      await claimRunnerOutbox(
        worker,
        'runner-worker',
        { ownerId: A, environmentRef: 'env-owner-1' },
        { newWork: true, limit: 50, leaseSeconds: 30 },
      )
    ).filter((o) => o.project_id === p.projectId)
    assert.equal(claimed.length, 1)
    const claimedOwner = await one<{ owner_id: string }>(
      `SELECT owner_id FROM sophia.owner_runner_operations WHERE outbox_id=$1`,
      [claimed[0]?.id],
    )
    assert.equal(claimedOwner.owner_id, A)
  })

  it('refuses a send when the owner lost edit rights between claim and send', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const r = await nativeResource(p.projectId, E)
    const created = await admit(E, p.projectId, createReq(r.resourceId, p.goalId))
    const [row] = (
      await claimRunnerOutbox(
        worker,
        'runner-worker',
        { ownerId: E, environmentRef: 'env-owner-1' },
        { newWork: true, limit: 50, leaseSeconds: 30 },
      )
    ).filter((o) => o.project_id === p.projectId)
    assert.ok(row?.lease_token)
    await owner.query(
      `UPDATE sophia.project_members SET role='viewer', revision=revision+1 WHERE project_id=$1 AND actor_id=$2`,
      [p.projectId, E],
    )
    const prepared = await prepareRunnerSend(worker, p.projectId, row.id, row.lease_token, randomUUID())
    assert.equal(prepared.result, 'denied')
    const op = await one<{ state: string }>(`SELECT state FROM sophia.owner_runner_operations WHERE id=$1`, [
      created.operationId,
    ])
    assert.equal(op.state, 'denied')
  })
})

// ---- source authority (INC01-CC-005, migration 0096, amendment A50) ----

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
const dbNow = async () => (await one<{ t: Date }>('SELECT clock_timestamp() AS t')).t
/** A project-scoped, eligible, ready source as the existing source flows write one (put_text_source). */
const projectSource = async (projectId: string, who: string, body: string) =>
  (
    await one<{ id: string }>(`SELECT (sophia.put_text_source($1, $2, 'text/plain', $3)).id AS id`, [
      projectId,
      who,
      body,
    ])
  ).id
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
const opRow = (id: string) =>
  one<{
    message: string | null
    title: string | null
    semantic: Record<string, unknown>
    payload_source_id: string
    payload_sha256: string
    manifest_id: string
    manifest_sha256: string
    envelope_version: number
    requested_settings: unknown
  }>(`SELECT * FROM sophia.owner_runner_operations WHERE id=$1`, [id])

describe('source authority at admission (0096)', () => {
  it("keeps a create's instruction and title as the owner's private source, out of every member-readable record", async () => {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const r = await nativeResource(p.projectId, A)
    const spec = await projectSource(p.projectId, A, 'A shared spec')
    const receipt = await admit(A, p.projectId, createReq(r.resourceId, p.goalId, { sourceIds: [spec] }))
    const o = await opRow(receipt.operationId)
    assert.equal(o.envelope_version, 2)
    assert.equal(o.message, null)
    assert.equal(o.title, null)
    assert.deepEqual(Object.keys(o.semantic).includes('message') || Object.keys(o.semantic).includes('title'), false)
    assert.equal(o.semantic.payloadSha256, o.payload_sha256)
    const payload = await one<{
      scope: string
      eligible: boolean
      owner_id: string
      state: string
      body: string
      sha256: string
    }>(
      `SELECT s.scope, s.eligible, s.owner_id, s.state, s.sha256, t.body FROM sophia.source_objects s
        JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=s.id WHERE s.id=$1`,
      [o.payload_source_id],
    )
    assert.deepEqual(
      { scope: payload.scope, eligible: payload.eligible, owner: payload.owner_id, state: payload.state },
      { scope: 'private', eligible: false, owner: A, state: 'ready' },
    )
    assert.equal(payload.body, '{"message":"Report the Ask admission boundary.","title":"Read-only qualification"}')
    assert.equal(payload.sha256, o.payload_sha256)
    // Another member reads neither the instruction nor its context; the owner reads both under RLS.
    const readable = (who: string) =>
      withActor(pool, who, 'read', async (c) => {
        const { rows } = await c.query<{ n: number }>(
          `SELECT (SELECT count(*)::int FROM sophia.source_texts WHERE source_id=$1)
                + (SELECT count(*)::int FROM sophia.source_objects WHERE id=$1) AS n`,
          [o.payload_source_id],
        )
        return rows[0]?.n
      })
    assert.equal(await readable(E), 0)
    assert.equal(await readable(A), 2)
    // Its selection and its context are its own, frozen with their hashes and revisions.
    const selected = await one<{ ids: string[]; sha: string[] }>(
      `SELECT array_agg(os.source_id) ids, array_agg(os.sha256=s.sha256) sha FROM sophia.owner_runner_operation_sources os
        JOIN sophia.source_objects s ON s.project_id=os.project_id AND s.id=os.source_id WHERE os.operation_id=$1`,
      [receipt.operationId],
    )
    assert.deepEqual(selected.ids, [spec])
    const manifest = await one<{ state: string; sha256: string; body: string }>(
      `SELECT m.state, s.sha256, t.body FROM sophia.context_manifests m JOIN sophia.source_objects s ON s.id=m.body_source_id
        JOIN sophia.source_texts t ON t.source_id=s.id WHERE m.id=$1`,
      [o.manifest_id],
    )
    assert.equal(manifest.state, 'eligible')
    assert.equal(manifest.sha256, o.manifest_sha256)
    const body = JSON.parse(manifest.body) as Record<string, unknown>
    assert.equal(body.payloadSha256, o.payload_sha256)
    assert.equal(body.baseCommit, BASE)
    assert.equal(manifest.body.includes('Report the Ask'), false, 'the context holds no instruction text')
    const view = await withActor(pool, A, 'read', (c) => readRunnerOperation(c, p.projectId, receipt.operationId))
    assert.deepEqual(
      {
        content: view.content,
        message: view.message,
        title: view.title,
        sourceIds: view.sourceIds,
        baseCommit: view.baseCommit,
        writeScope: view.writeScope,
        settings: view.settings,
        envelopeVersion: view.envelopeVersion,
      },
      {
        content: 'available',
        message: 'Report the Ask admission boundary.',
        title: 'Read-only qualification',
        sourceIds: [spec],
        baseCommit: BASE,
        writeScope: 'read_only',
        settings: SETTINGS,
        envelopeVersion: 2,
      },
    )
  })

  it('refuses a selected source that is private, unready, erased, withdrawn through its closure, or unknown', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const r = await nativeResource(p.projectId, A)
    const mine = await one<{ id: string }>(
      `SELECT (sophia.owner_runner_put_private($1, $2, 'text/plain', 'my private note')).id AS id`,
      [p.projectId, A],
    )
    const theirs = await one<{ id: string }>(
      `SELECT (sophia.owner_runner_put_private($1, $2, 'text/plain', 'their private note')).id AS id`,
      [p.projectId, E],
    )
    const unready = await projectSource(p.projectId, A, 'not ready yet')
    await owner.query(`UPDATE sophia.source_objects SET state='uploading' WHERE id=$1`, [unready])
    const erased = await projectSource(p.projectId, A, 'erased')
    await erase(p.projectId, erased)
    const upstream = await projectSource(p.projectId, A, 'upstream')
    const derived = await projectSource(p.projectId, A, 'derived')
    await owner.query(
      `INSERT INTO sophia.source_dependencies(project_id, source_id, derived_source_id) VALUES ($1,$2,$3)`,
      [p.projectId, upstream, derived],
    )
    await erase(p.projectId, upstream)
    for (const id of [mine.id, theirs.id, unready, erased, derived, randomUUID()]) {
      assert.equal(
        await codeOf(admit(A, p.projectId, createReq(r.resourceId, p.goalId, { sourceIds: [id] }))),
        'invalid_request',
        id,
      )
    }
    assert.deepEqual(await counts(p.projectId), { ops: 0, commands: 0, outbox: 0 })
  })

  it('refuses a missing or malformed base, scope or selection, and settings outside the declared policy', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    const r = await nativeResource(p.projectId, A)
    // Each request lacks one fact, or names it malformed (an unchecked request, as an API body could be).
    const invalid: [string, unknown][] = [
      ['baseCommit', undefined],
      ['baseCommit', 'main'],
      ['baseCommit', '0123456'],
      ['writeScope', undefined],
      ['writeScope', 'read_write'],
      ['sourceIds', undefined],
      ['sourceIds', ['not-an-id']],
    ]
    for (const [key, value] of invalid) {
      const req: Record<string, unknown> = { ...createReq(r.resourceId, p.goalId) }
      if (value === undefined) delete req[key]
      else req[key] = value
      const malformed = req as unknown as OwnerRunnerOperationRequest
      assert.equal(await codeOf(admit(A, p.projectId, malformed)), 'invalid_request', `${key}: ${String(value)}`)
    }
    const unqualified = [
      { ...SETTINGS, model: 'undeclared-model' },
      { ...SETTINGS, options: [{ id: 'effort', value: 'xhigh' }] },
      { ...SETTINGS, options: [] },
      { ...SETTINGS, instanceId: 'codex' },
    ]
    for (const settings of unqualified)
      assert.equal(
        await codeOf(admit(A, p.projectId, createReq(r.resourceId, p.goalId, { settings }))),
        'runner_unqualified',
        JSON.stringify(settings),
      )
    const undeclared = await nativeResource(p.projectId, A, { policy: false })
    assert.equal(
      await codeOf(admit(A, p.projectId, createReq(undeclared.resourceId, p.goalId))),
      'runner_unqualified',
      'no source policy declared for the route',
    )
    assert.deepEqual(await counts(p.projectId), { ops: 0, commands: 0, outbox: 0 })
  })

  it("gives each input its own instruction and context, within its create's selection, never changing the create's", async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    const r = await nativeResource(p.projectId, A)
    const one1 = await projectSource(p.projectId, A, 'first')
    const two = await projectSource(p.projectId, A, 'second')
    const other = await projectSource(p.projectId, A, 'not selected')
    const created = await admit(A, p.projectId, createReq(r.resourceId, p.goalId, { sourceIds: [one1, two] }))
    await owner.query(
      `UPDATE sophia.owner_runner_operations SET state='received', native_thread_id='t-1' WHERE id=$1`,
      [created.operationId],
    )
    const prior = await opRow(created.operationId)
    const input = (over: Partial<OwnerRunnerOperationRequest> = {}) =>
      admit(A, p.projectId, {
        kind: 'input',
        resourceId: r.resourceId,
        targetOperationId: created.operationId,
        message: 'A follow-up instruction.',
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        sourceIds: [two],
        ...over,
      })
    assert.equal(await codeOf(input({ sourceIds: [other] })), 'invalid_request', 'outside its create selection')
    assert.equal(await codeOf(input({ baseCommit: BASE })), 'invalid_request', 'an input inherits its base')
    assert.equal(await codeOf(input({ settings: SETTINGS })), 'invalid_request', 'and its settings')
    const followed = await input()
    const mineInput = await opRow(followed.operationId)
    assert.notEqual(mineInput.payload_source_id, prior.payload_source_id)
    assert.notEqual(mineInput.manifest_id, prior.manifest_id)
    assert.deepEqual(mineInput.requested_settings, prior.requested_settings)
    const later = await opRow(created.operationId)
    assert.deepEqual(later, prior, "the create's frozen record is unchanged")
    const selection = await one<{ create: number; input: number }>(
      `SELECT (SELECT count(*)::int FROM sophia.owner_runner_operation_sources WHERE operation_id=$1) AS create,
              (SELECT count(*)::int FROM sophia.owner_runner_operation_sources WHERE operation_id=$2) AS input`,
      [created.operationId, followed.operationId],
    )
    assert.deepEqual(selection, { create: 2, input: 1 })
    // Admitted facts are immutable, even to the migration owner's direct writes.
    assert.notEqual(
      await codeOf(
        owner.query(`UPDATE sophia.owner_runner_operations SET base_commit=$2 WHERE id=$1`, [
          created.operationId,
          'f'.repeat(40),
        ]),
      ),
      'resolved',
    )
    assert.notEqual(
      await codeOf(
        owner.query(`DELETE FROM sophia.owner_runner_operation_sources WHERE operation_id=$1`, [created.operationId]),
      ),
      'resolved',
    )
  })

  it("reauthorizes the owner's read now: an erased instruction or source reads withdrawn, its metadata kept", async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    const r = await nativeResource(p.projectId, A)
    const spec = await projectSource(p.projectId, A, 'spec')
    const a = await admit(A, p.projectId, createReq(r.resourceId, p.goalId, { sourceIds: [spec] }))
    const b = await admit(A, p.projectId, createReq(r.resourceId, p.goalId, { message: 'Another.' }))
    await erase(p.projectId, spec)
    await erase(p.projectId, (await opRow(b.operationId)).payload_source_id)
    for (const id of [a.operationId, b.operationId]) {
      const v = await withActor(pool, A, 'read', (c) => readRunnerOperation(c, p.projectId, id))
      assert.equal(v.content, 'withdrawn')
      assert.equal(v.message, null)
      assert.equal(v.title, null)
      assert.equal(v.baseCommit, BASE)
      assert.equal(v.state, 'denied', 'admitted and unclaimed: denied by the withdrawal itself')
    }
  })

  for (const expires of [true, false]) {
    it(`an admission whose qualification ${expires ? 'expires' : 'stays valid'} while it waits on the goal is ${expires ? 'refused before any write' : 'admitted (control)'} (INC01-30813-EXPIRY-F01)`, async () => {
      const p = await seedProject(db.ownerUrl, { admin: A })
      const r = await nativeResource(p.projectId, A)
      const until = new Date((await dbNow()).getTime() + 1200)
      await owner.query(`UPDATE sophia.owner_runner_qualifications SET expires_at=$2 WHERE id=$1`, [
        r.qualificationId,
        expires ? until : new Date(until.getTime() + 3_600_000),
      ])
      const locker = await owner.connect()
      try {
        await locker.query('BEGIN')
        await locker.query('SELECT 1 FROM sophia.goals WHERE project_id=$1 AND id=$2 FOR UPDATE', [
          p.projectId,
          p.goalId,
        ])
        const admitted = codeOf(admit(A, p.projectId, createReq(r.resourceId, p.goalId)))
        while ((await dbNow()) <= until) await sleep(50)
        await sleep(150)
        assert.deepEqual(await counts(p.projectId), { ops: 0, commands: 0, outbox: 0 }, 'still waiting on the goal')
        await locker.query('ROLLBACK')
        assert.equal(await admitted, expires ? 'runner_unqualified' : 'resolved')
      } finally {
        locker.release()
      }
      assert.equal((await counts(p.projectId)).ops, expires ? 0 : 1)
    })
  }
})
