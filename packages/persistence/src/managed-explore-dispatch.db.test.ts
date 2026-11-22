import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, it } from 'node:test'
import type pg from 'pg'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  admitManagedExploreTurn,
  createPool,
  readManagedExploreSession,
  recordMissionEntry,
  startManagedExplore,
  withActor,
} from './index.ts'
import {
  claimManagedExploreDispatch,
  prepareManagedExploreDispatch,
  readManagedExploreDispatch,
  recordManagedExploreDispatch,
  type ManagedExploreDispatchLease,
  type ManagedExploreDispatchScope,
} from './managed-explore-dispatch.ts'

const founder = randomUUID()
const brief = 'Use the exact server-confirmed brief.\r\nKeep it synthetic.'
const scope: ManagedExploreDispatchScope = {
  workerId: 'synthetic-explore-worker',
  routeId: 'synthetic-explore-route',
  credentialGeneration: 5,
  providerOrg: 'synthetic-org',
  providerProject: 'synthetic-provider-project',
  leaseSeconds: 60,
  allowSend: true,
}
const paused = { ...scope, allowSend: false }
let db: TestDatabase
let owner: pg.Pool
let api: pg.Pool
let worker: pg.Pool

before(async () => {
  db = await createTestDatabase()
  owner = createPool(db.ownerUrl)
  api = createPool(db.apiUrl)
  worker = createPool(db.workerUrl)
})

after(async () => {
  await Promise.all([owner?.end(), api?.end(), worker?.end()])
  await db?.drop()
})

async function admit() {
  const { projectId } = await seedProject(db.ownerUrl, { admin: founder })
  await owner.query(
    `INSERT INTO sophia.managed_explore_grants(project_id,founder_id,route_id,provider_org,provider_project,
      credential_generation,model,currency,per_turn_micros,per_session_micros,environment_micros,funding_evidence_ref,
      grant_only_verified,enabled,expires_at,credential_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,'synthetic-model','USD',10000,100000,20000,'synthetic-proof',
      true,true,now()+interval '1 hour',now()+interval '1 hour')`,
    [projectId, founder, scope.routeId, scope.providerOrg, scope.providerProject, scope.credentialGeneration],
  )
  const note = await withActor(api, founder, 'write', (c) =>
    recordMissionEntry(c, projectId, randomUUID(), { kind: 'expectation', epistemic: 'reported', text: brief }),
  )
  assert.ok(note.entryId)
  const seedEntryId = note.entryId
  const { sessionId } = await withActor(api, founder, 'write', (c) =>
    startManagedExplore(c, projectId, randomUUID(), {
      seedEntryId,
      expectedSeedRevision: note.ledgerRevision,
      routeId: scope.routeId,
    }),
  )
  return { projectId, sessionId, sourceId: note.sourceId }
}

function expire(lease: ManagedExploreDispatchLease) {
  return owner.query(
    "UPDATE sophia.outbox SET lease_until=clock_timestamp()-interval '1 sec' WHERE project_id=$1 AND id=$2",
    [lease.projectId, lease.outboxId],
  )
}

async function createReceipt(lease: ManagedExploreDispatchLease) {
  const observation = {
    kind: 'created',
    operationId: lease.createOperationId,
    providerSessionId: 'synthetic-session-1',
    environmentId: 'synthetic-environment-1',
    model: lease.model,
    sessionLimitCents: lease.sessionLimitCents,
    networkAccess: 'disabled',
    requestId: 'synthetic-create-receipt',
  } as const
  await assert.rejects(recordManagedExploreDispatch(worker, lease, { ...observation, sessionLimitCents: 9 }), {
    code: 'stale_revision',
  })
  await assert.rejects(recordManagedExploreDispatch(worker, lease, { ...observation, operationId: randomUUID() }), {
    code: 'stale_revision',
  })
  await recordManagedExploreDispatch(worker, lease, observation)
  await recordManagedExploreDispatch(worker, lease, {
    kind: 'environment',
    providerSessionId: observation.providerSessionId,
    environmentId: observation.environmentId,
    status: 'ready',
  })
  return observation
}

it('fences create, event and root evidence through expiry, restart and the queued successor', async () => {
  const { projectId, sessionId } = await admit()
  await assert.rejects(claimManagedExploreDispatch(api, scope), { code: 'forbidden' })
  assert.equal(await claimManagedExploreDispatch(worker, paused), null)
  assert.equal(await claimManagedExploreDispatch(worker, { ...scope, credentialGeneration: 4 }), null)
  assert.equal(await claimManagedExploreDispatch(worker, { ...scope, providerProject: 'other-project' }), null)
  const pair = await Promise.all([
    claimManagedExploreDispatch(worker, scope),
    claimManagedExploreDispatch(worker, scope),
  ])
  const first = pair.find((claim) => claim !== null)
  assert.ok(first)
  assert.equal(pair.filter(Boolean).length, 1)
  assert.equal(first.sessionId, sessionId)
  assert.equal(first.model, 'synthetic-model')
  assert.equal(first.sessionLimitCents, 10)
  assert.equal(first.eventPossibleAt, null)
  assert.equal('instruction' in first, false)
  const { revision } = await withActor(api, founder, 'read', (c) => readManagedExploreSession(c, projectId, sessionId))
  const { turnId: successorId } = await withActor(api, founder, 'write', (c) =>
    admitManagedExploreTurn(c, projectId, sessionId, randomUUID(), {
      kind: 'directions',
      instruction: 'Compare two directions.',
      expectedSessionRevision: revision,
    }),
  )
  assert.equal(await claimManagedExploreDispatch(worker, scope), null)

  await expire(first)
  const beforeSend = await claimManagedExploreDispatch(worker, scope)
  assert.ok(beforeSend)
  assert.equal(beforeSend.createOperationId, first.createOperationId)
  assert.notEqual(beforeSend.leaseToken, first.leaseToken)
  await assert.rejects(prepareManagedExploreDispatch(worker, first, { kind: 'create' }), { code: 'invalid_state' })
  assert.equal((await prepareManagedExploreDispatch(worker, beforeSend, { kind: 'create' })).kind, 'create')
  assert.deepEqual(await prepareManagedExploreDispatch(worker, beforeSend, { kind: 'create' }), { kind: 'observe' })
  await expire(beforeSend)
  const recovery = await claimManagedExploreDispatch(worker, paused)
  assert.ok(recovery)
  assert.equal(recovery.turnStatus, 'outcome_unknown')
  assert.equal(recovery.createOperationId, first.createOperationId)
  assert.equal(recovery.providerSessionId, null)
  assert.deepEqual(await prepareManagedExploreDispatch(worker, recovery, { kind: 'create' }), { kind: 'observe' })
  const created = await createReceipt(recovery)
  assert.deepEqual(await prepareManagedExploreDispatch(worker, recovery, { kind: 'event', predecessorRootId: null }), {
    kind: 'blocked',
    reason: 'worker_send_disabled',
  })
  await expire(recovery)
  assert.equal(await claimManagedExploreDispatch(worker, paused), null)
  const send = await claimManagedExploreDispatch(worker, scope)
  assert.ok(send)
  assert.equal(send.providerSessionId, created.providerSessionId)
  await assert.rejects(
    prepareManagedExploreDispatch(worker, send, { kind: 'event', predecessorRootId: 'stale-root' }),
    {
      code: 'stale_revision',
    },
  )
  const event = await prepareManagedExploreDispatch(worker, send, { kind: 'event', predecessorRootId: null })
  assert.equal(event.kind, 'event')
  const seed = await withActor(api, founder, 'read', (c) => readManagedExploreSession(c, projectId, sessionId))
  assert.equal(event.instruction, seed.seed.text)
  assert.equal(event.payloadSha256, createHash('sha256').update(seed.seed.text).digest('hex'))
  assert.deepEqual(await prepareManagedExploreDispatch(worker, send, { kind: 'event', predecessorRootId: null }), {
    kind: 'observe',
  })
  const ids = {
    submissionId: event.submissionId,
    providerSessionId: event.providerSessionId,
    payloadSha256: event.payloadSha256,
    previousRootId: event.previousRootId,
  }
  const ack = { ...ids, kind: 'eventAccepted', requestId: 'synthetic-event-receipt' } as const
  await assert.rejects(recordManagedExploreDispatch(worker, send, { ...ack, submissionId: randomUUID() }), {
    code: 'stale_revision',
  })
  await recordManagedExploreDispatch(worker, send, ack)
  await owner.query('UPDATE sophia.managed_explore_grants SET enabled=false WHERE project_id=$1', [projectId])
  await expire(send)
  const observe = await claimManagedExploreDispatch(worker, paused)
  assert.ok(observe)
  assert.equal(observe.eventRequestId, ack.requestId)
  assert.equal(observe.turnStatus, 'outcome_unknown')
  assert.deepEqual(await prepareManagedExploreDispatch(worker, observe, { kind: 'event', predecessorRootId: null }), {
    kind: 'observe',
  })
  const root = { ...ids, kind: 'root', rootId: 'synthetic-root-1', status: 'completed' } as const
  await assert.rejects(recordManagedExploreDispatch(worker, send, root), { code: 'invalid_state' })
  await recordManagedExploreDispatch(worker, observe, {
    ...root,
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
  })
  assert.deepEqual((await readManagedExploreDispatch(worker, observe)).usage, {
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 3,
  })
  await assert.rejects(recordManagedExploreDispatch(worker, observe, { ...root, rootId: 'wrong-root' }), {
    code: 'stale_revision',
  })
  await recordManagedExploreDispatch(worker, observe, { ...root, kind: 'settle', reply: 'A saved answer.' })
  const finished = await withActor(api, founder, 'read', (c) => readManagedExploreSession(c, projectId, sessionId))
  assert.deepEqual(
    finished.turns.map(({ status }) => status),
    ['completed', 'queued'],
  )
  assert.equal(finished.turns[0]?.reply, 'A saved answer.')
  assert.equal(await claimManagedExploreDispatch(worker, paused), null)

  await owner.query('UPDATE sophia.managed_explore_grants SET enabled=true WHERE project_id=$1', [projectId])
  const successor = await claimManagedExploreDispatch(worker, scope)
  assert.ok(successor)
  assert.equal(successor.turnId, successorId)
  assert.equal(successor.createOperationId, first.createOperationId)
  assert.equal(successor.previousRootId, root.rootId)
  assert.equal((await readManagedExploreDispatch(worker, successor)).previousRootId, root.rootId)
  await assert.rejects(prepareManagedExploreDispatch(worker, successor, { kind: 'event', predecessorRootId: null }), {
    code: 'stale_revision',
  })
  const next = await prepareManagedExploreDispatch(worker, successor, {
    kind: 'event',
    predecessorRootId: successor.previousRootId,
  })
  assert.equal(next.kind, 'event')
  const directions = {
    kind: 'root',
    submissionId: next.submissionId,
    providerSessionId: next.providerSessionId,
    payloadSha256: next.payloadSha256,
    previousRootId: root.rootId,
    rootId: 'synthetic-root-2',
    status: 'completed',
  } as const
  await assert.rejects(recordManagedExploreDispatch(worker, successor, { ...directions, rootId: root.rootId }), {
    code: 'stale_revision',
  })
  await recordManagedExploreDispatch(worker, successor, directions)
  assert.equal((await readManagedExploreDispatch(worker, successor)).turnStatus, 'retaining')
  await assert.rejects(
    recordManagedExploreDispatch(worker, successor, { ...directions, kind: 'settle', reply: 'Two cards' }),
    {
      code: 'invalid_state',
    },
  )
  // Settle this fixture only so subsequent cases see only their own work.
  await owner.query("UPDATE sophia.managed_explore_turns SET status='cancelled' WHERE project_id=$1 AND id=$2", [
    projectId,
    successorId,
  ])
})

it('rechecks current grant and source before a possible send and preserves the original scope', async () => {
  const { projectId } = await admit()
  const claim = await claimManagedExploreDispatch(worker, scope)
  assert.ok(claim)
  assert.equal(claim.projectId, projectId)
  await assert.rejects(
    owner.query("UPDATE sophia.managed_explore_grants SET model='different-model' WHERE project_id=$1", [projectId]),
    { code: '40001' },
  )
  await owner.query('UPDATE sophia.managed_explore_grants SET enabled=false WHERE project_id=$1', [projectId])
  assert.deepEqual(await prepareManagedExploreDispatch(worker, claim, { kind: 'create' }), {
    kind: 'denied',
    reason: 'funding_unavailable',
  })
  const ps = await owner.query<{ create_possible_at: Date | null }>(
    'SELECT create_possible_at FROM sophia.managed_explore_dispatch_sessions WHERE project_id=$1',
    [projectId],
  )
  assert.equal(ps.rows[0]?.create_possible_at, null)

  const revoked = await admit()
  const second = await claimManagedExploreDispatch(worker, scope)
  assert.ok(second)
  assert.equal(second.projectId, revoked.projectId)
  await owner.query("UPDATE sophia.source_objects SET eligible=false,state='blocked' WHERE project_id=$1 AND id=$2", [
    revoked.projectId,
    revoked.sourceId,
  ])
  assert.deepEqual(await prepareManagedExploreDispatch(worker, second, { kind: 'create' }), {
    kind: 'denied',
    reason: 'source_unavailable',
  })
})

it('skips an expired stale unsent lease and preserves a possible send under its original route', async () => {
  const stale = await admit()
  const old = await claimManagedExploreDispatch(worker, scope)
  assert.ok(old)
  assert.equal(old.projectId, stale.projectId)
  await expire(old)
  await owner.query(
    "UPDATE sophia.managed_explore_grants SET revision=revision+1,model='changed' WHERE project_id=$1",
    [stale.projectId],
  )

  const current = await admit()
  const active = await claimManagedExploreDispatch(worker, scope)
  assert.ok(active)
  assert.equal(active.projectId, current.projectId)
  await assert.rejects(prepareManagedExploreDispatch(worker, old, { kind: 'create' }), { code: 'invalid_state' })
  const unsent = await owner.query<{ create_possible_at: Date | null }>(
    'SELECT create_possible_at FROM sophia.managed_explore_dispatch_sessions WHERE project_id=$1',
    [stale.projectId],
  )
  assert.equal(unsent.rows[0]?.create_possible_at, null)

  const create = await prepareManagedExploreDispatch(worker, active, { kind: 'create' })
  assert.equal(create.kind, 'create')
  const rotatedProject = 'rotated-provider-project'
  await owner.query(
    'UPDATE sophia.managed_explore_grants SET revision=revision+1,provider_project=$2 WHERE project_id=$1',
    [current.projectId, rotatedProject],
  )
  await expire(active)
  assert.equal(await claimManagedExploreDispatch(worker, { ...scope, providerProject: rotatedProject }), null)

  const recovery = await claimManagedExploreDispatch(worker, scope)
  assert.ok(recovery)
  assert.equal(recovery.projectId, current.projectId)
  assert.equal(recovery.createOperationId, create.operationId)
  assert.equal(recovery.turnStatus, 'outcome_unknown')
  assert.equal(recovery.allowSend, false)
  assert.deepEqual(await prepareManagedExploreDispatch(worker, recovery, { kind: 'create' }), { kind: 'observe' })

  await recordManagedExploreDispatch(worker, recovery, {
    kind: 'created',
    operationId: create.operationId,
    providerSessionId: 'rotated-fixture-original-session',
    environmentId: 'rotated-fixture-original-environment',
    model: create.model,
    sessionLimitCents: create.sessionLimitCents,
    networkAccess: 'disabled',
  })
  assert.deepEqual(await prepareManagedExploreDispatch(worker, recovery, { kind: 'event', predecessorRootId: null }), {
    kind: 'blocked',
    reason: 'worker_send_disabled',
  })
})
