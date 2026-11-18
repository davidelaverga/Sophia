import { OwnerHostFixtureResources } from '../../../tests/helpers/owner-host-fixture-resources.ts'
// Metadata-only exact-journal lookup over real restricted roles. Qualification rows are synthetic, never live proof.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { before, after, test } from 'node:test'
import pg from 'pg'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  createPool,
  withActor,
  createOwnerHostPairing,
  redeemOwnerHostPairing,
  DbHostChannel,
  retireOwnerHost,
  revokeOwnerHost,
  checkRoleSafety,
} from './index.ts'
import { OwnerHostRouteController } from '../../../apps/worker/src/owner-host-route.ts'
import { checkExchangeRequest } from '@sophia/coordination/owner-host-channel'
import { deriveIdentity } from '@sophia/coordination/t3-port-mapping'
import {
  admitRunnerOperation,
  claimRunnerOutbox,
  prepareRunnerSend,
  recordRunnerAnswer,
  readRunnerOperation,
} from './index.ts'
import { originalOwnerHostRoute } from './owner-host-route.ts'
let db: TestDatabase, api: pg.Pool, worker: pg.Pool, owner: pg.Pool
const PIN = 'ade473018d32003658b7d38693e083ee2e314bd8'
const suiteResources = new OwnerHostFixtureResources()
before(async () =>
  suiteResources.setup(async () => {
    db = suiteResources.database(await createTestDatabase())
    api = suiteResources.pool(createPool(db.apiUrl))
    worker = suiteResources.pool(createPool(db.workerUrl))
    owner = suiteResources.pool(new pg.Pool({ connectionString: db.ownerUrl }))
    await checkRoleSafety(api)
    await checkRoleSafety(worker, 'sophia_worker')
  }),
)

after(() => suiteResources.close())
async function world() {
  const who = randomUUID(),
    connection = randomUUID(),
    resource = randomUUID(),
    journal = randomUUID(),
    cap = 'a' + randomUUID().replaceAll('-', '') + 'b'.repeat(10)
  const p = await seedProject(db.ownerUrl, { admin: who })
  await owner.query(
    "INSERT INTO sophia.execution_connections(id,owner_id,upstream_origin,upstream_subject,state) VALUES($1,$2,'synthetic-h-route','synthetic','linked')",
    [connection, who],
  )
  await owner.query(
    "INSERT INTO sophia.executor_resources(project_id,id,owner_id,connection_id,harness,label,repository_root,state) VALUES($1,$2,$3,$4,'claude-native','Synthetic H','fixture/repository','active')",
    [p.projectId, resource, who, connection],
  )
  const q = await owner.query<{ id: string }>(
    "SELECT sophia.qualify_owner_runner($1,$2,$3,'fixture-env','fixture-project','fixture-profile',1,'gateway_enforced','fixture-account',ARRAY['create','input','stop'],50,now()+interval '1 day','SYNTHETIC H fixture only') AS id",
    [p.projectId, resource, PIN],
  )
  const qualification = q.rows[0]?.id
  assert.ok(qualification)
  await owner.query('SELECT sophia.declare_owner_runner_source_policy($1,$2,$3)', [
    p.projectId,
    qualification,
    JSON.stringify({ v: 1, instanceId: 'fixture-instance', models: [{ model: 'fixture-model', options: [] }] }),
  ])
  const pairing = await withActor(api, who, 'write', (c) => createOwnerHostPairing(c, connection))
  const redeemed = await redeemOwnerHostPairing(api, pairing.code, cap)
  assert.equal(redeemed.result, 'bound')
  assert.ok(redeemed.result === 'bound')
  const channel = new DbHostChannel(api, cap)
  await channel.hello({
    v: 1,
    journalId: journal,
    environmentRef: 'fixture-env',
    adapterPin: PIN,
    profileId: 'fixture-profile',
    profileRevision: 1,
    accountKey: 'fixture-account',
    t3Namespace: 'client:fixture',
  })
  return { ...p, resource, who, connection, qualification, journal, channel, hostId: redeemed.hostId }
}
test('0117 structural SQL runs; API and PUBLIC have no worker lookup privilege', async () => {
  await owner.query(readFileSync('db/tests/0117_owner_host_route.sql', 'utf8'))
  await assert.rejects(originalOwnerHostRoute(api, randomUUID(), 'fixture-env', randomUUID()), {
    message: 'Owner host route unavailable',
  })
})
test('active current qualification, retired maintenance, mismatch/revocation/expiry and replacement never reroute', async () => {
  const w = await world()
  const active = await originalOwnerHostRoute(worker, w.who, 'fixture-env', w.journal)
  assert.equal(active?.newWorkQualified, true)
  assert.equal(await originalOwnerHostRoute(worker, w.who, 'fixture-env', randomUUID()), null)
  assert.equal(await originalOwnerHostRoute(worker, randomUUID(), 'fixture-env', w.journal), null)
  await owner.query(
    "UPDATE sophia.owner_runner_qualifications SET expires_at=now()-interval '1 hour',qualified_at=now()-interval '2 hours' WHERE id=$1",
    [w.qualification],
  )
  assert.equal((await originalOwnerHostRoute(worker, w.who, 'fixture-env', w.journal))?.newWorkQualified, false)
  await withActor(api, w.who, 'write', (c) => retireOwnerHost(c, w.hostId))
  assert.equal((await originalOwnerHostRoute(worker, w.who, 'fixture-env', w.journal))?.state, 'retired')
  await withActor(api, w.who, 'write', (c) => revokeOwnerHost(c, w.hostId))
  assert.equal(await originalOwnerHostRoute(worker, w.who, 'fixture-env', w.journal), null)
  const pairing = await withActor(api, w.who, 'write', (c) => createOwnerHostPairing(c, w.connection))
  const cap = 'z'.repeat(43)
  await redeemOwnerHostPairing(api, pairing.code, cap)
  await new DbHostChannel(api, cap).hello({
    v: 1,
    journalId: w.journal,
    environmentRef: 'fixture-env',
    adapterPin: PIN,
    profileId: 'fixture-profile',
    profileRevision: 1,
    accountKey: 'fixture-account',
    t3Namespace: 'client:replacement',
  })
  assert.equal(await originalOwnerHostRoute(worker, w.who, 'fixture-env', w.journal), null)
})

async function receivedCreate(w: Awaited<ReturnType<typeof world>>) {
  const created = await withActor(api, w.who, 'write', (c) =>
    admitRunnerOperation(c, w.projectId, randomUUID(), {
      kind: 'create',
      resourceId: w.resource,
      goalId: w.goalId,
      title: 'Synthetic H only',
      message: 'inert synthetic fixture',
      expectedGoalRevision: 1,
      expectedAuthorityEpoch: 1,
      sourceIds: [],
      baseCommit: 'a'.repeat(40),
      writeScope: 'read_only',
      settings: { instanceId: 'fixture-instance', model: 'fixture-model', options: [] },
    }),
  )
  const rows = await claimRunnerOutbox(
    worker,
    'h-fixture',
    { ownerId: w.who, environmentRef: 'fixture-env' },
    { newWork: true, limit: 1 },
  )
  const row = rows[0]
  assert.ok(row?.lease_token)
  const prepared = await prepareRunnerSend(worker, row.project_id, row.id, row.lease_token, w.journal)
  assert.ok(prepared.result === 'send')
  await recordRunnerAnswer(
    worker,
    { projectId: w.projectId, operationId: created.operationId, leaseToken: row.lease_token, journalId: w.journal },
    {
      kind: 'received',
      identity: deriveIdentity(prepared.envelope, 'client:fixture'),
      runId: 'synthetic-run',
      delivery: 'started',
    },
  )
  return created
}
async function deliverStop(w: Awaited<ReturnType<typeof world>>) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const deliveries = await w.channel.poll(1, 15)
    if (deliveries.length) {
      const d = deliveries[0]
      assert.ok(d)
      const checked = checkExchangeRequest(d.request)
      assert.ok(checked.ok)
      assert.equal(checked.request.envelope.kind, 'stop')
      assert.equal((await w.channel.go(d.exchangeId)).result, 'go')
      await w.channel.answer(d.exchangeId, {
        kind: 'received',
        identity: deriveIdentity(checked.request.envelope, 'client:fixture'),
        runId: null,
        delivery: 'stop_requested',
      })
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Synthetic Stop delivery deadline')
}
test('stock OFF controller sends an admitted Stop through its retired original journal, never the active replacement', async () => {
  const w = await world()
  const created = await receivedCreate(w)
  const stop = await withActor(api, w.who, 'write', (c) =>
    admitRunnerOperation(c, w.projectId, randomUUID(), {
      kind: 'stop',
      resourceId: w.resource,
      targetOperationId: created.operationId,
    }),
  )
  const outbox = await owner.query<{ id: string }>(
    'SELECT outbox_id AS id FROM sophia.owner_runner_operations WHERE id=$1',
    [stop.operationId],
  )
  const outboxId = outbox.rows[0]?.id
  assert.ok(outboxId)
  await withActor(api, w.who, 'write', (c) => retireOwnerHost(c, w.hostId))
  const pairing = await withActor(api, w.who, 'write', (c) => createOwnerHostPairing(c, w.connection))
  const cap = 'q'.repeat(43),
    replacement = randomUUID()
  await redeemOwnerHostPairing(api, pairing.code, cap)
  await new DbHostChannel(api, cap).hello({
    v: 1,
    journalId: replacement,
    environmentRef: 'fixture-env',
    adapterPin: PIN,
    profileId: 'fixture-profile',
    profileRevision: 1,
    accountKey: 'fixture-account',
    t3Namespace: 'client:replacement',
  })
  const target = { projectId: w.projectId, outboxId }
  assert.equal((await originalOwnerHostRoute(worker, w.who, 'fixture-env', w.journal, target))?.state, 'retired')
  assert.equal(await originalOwnerHostRoute(worker, w.who, 'fixture-env', replacement, target), null)
  const controllerResources = new OwnerHostFixtureResources()
  const controller = new OwnerHostRouteController(
    worker,
    { ownerId: w.who, environmentRef: 'fixture-env', journalId: w.journal, sends: false },
    'h-fixture',
  )
  controllerResources.own('controller stop', () => controller.stop())
  await controllerResources.run(async () => {
    controller.pass()
    await deliverStop(w)
  })
  const operation = await withActor(api, w.who, 'read', (c) => readRunnerOperation(c, w.projectId, stop.operationId))
  assert.equal(operation.state, 'received')
  const stored = await owner.query<{ journal: string }>(
    'SELECT gateway_journal_id AS journal FROM sophia.owner_runner_operations WHERE id=$1',
    [stop.operationId],
  )
  assert.equal(stored.rows[0]?.journal, w.journal)
})
