import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, it } from 'node:test'
import type pg from 'pg'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  admitManagedExploreTurn,
  createPool,
  readManagedExploreEntry,
  readManagedExploreSession,
  recordMissionEntry,
  retainManagedExploreOutput,
  selectManagedExploreDirection,
  startManagedExplore,
  withActor,
  type ManagedExploreRetentionOutput,
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
    providerSessionId: randomUUID(),
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
  const rejected = { ...directions, kind: 'outputRejected', reason: 'output_missing' } as const
  await assert.rejects(recordManagedExploreDispatch(worker, successor, rejected), { code: 'invalid_state' })
  await assert.rejects(
    recordManagedExploreDispatch(worker, successor, {
      ...rejected,
      rootId: 'unrelated-root',
      reason: 'output_invalid',
    }),
    { code: 'stale_revision' },
  )
  await owner.query(
    "UPDATE sophia.managed_explore_dispatch_turns SET root_completed_seen_at=clock_timestamp()-interval '6 minutes' WHERE project_id=$1 AND turn_id=$2",
    [projectId, successorId],
  )
  await recordManagedExploreDispatch(worker, successor, rejected)
  const { turns } = await withActor(api, founder, 'read', (c) => readManagedExploreSession(c, projectId, sessionId))
  assert.equal(turns.find((turn) => turn.id === successorId)?.status, 'failed')
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

type RetentionSession = Awaited<ReturnType<typeof admit>>
type DirectionOutput = Extract<ManagedExploreRetentionOutput, { kind: 'directions' }>
type PrototypeOutput = Extract<ManagedExploreRetentionOutput, { kind: 'prototype' }>
type Direction = DirectionOutput['directions'][number]
type TurnRequest = Parameters<typeof admitManagedExploreTurn>[4]

function readSession({ projectId, sessionId }: RetentionSession) {
  return withActor(api, founder, 'read', (c) => readManagedExploreSession(c, projectId, sessionId))
}

async function startRetentionSession() {
  const session = await admit()
  const first = await claimManagedExploreDispatch(worker, scope)
  assert.ok(first)
  assert.equal(first.projectId, session.projectId)
  assert.equal((await prepareManagedExploreDispatch(worker, first, { kind: 'create' })).kind, 'create')
  await createReceipt(first)
  const identity = await recordCompletedRoot(await readManagedExploreDispatch(worker, first))
  await recordManagedExploreDispatch(worker, first, {
    ...identity,
    kind: 'settle',
    status: 'completed',
    reply: 'Ready.',
  })
  return session
}

async function recordCompletedRoot(lease: ManagedExploreDispatchLease) {
  assert.ok(lease.environmentId)
  const event = await prepareManagedExploreDispatch(worker, lease, {
    kind: 'event',
    predecessorRootId: lease.previousRootId,
  })
  assert.equal(event.kind, 'event')
  const { providerSessionId, submissionId, payloadSha256, previousRootId } = event
  const identity = { providerSessionId, submissionId, payloadSha256, previousRootId, rootId: randomUUID() }
  await recordManagedExploreDispatch(worker, lease, {
    ...identity,
    kind: 'root',
    status: 'completed',
    usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
  })
  return { ...identity, environmentId: lease.environmentId }
}

async function completeTurn(session: RetentionSession, request: Omit<TurnRequest, 'expectedSessionRevision'>) {
  const { revision } = await readSession(session)
  const { projectId, sessionId } = session
  const { turnId } = await withActor(api, founder, 'write', (c) =>
    admitManagedExploreTurn(c, projectId, sessionId, randomUUID(), { ...request, expectedSessionRevision: revision }),
  )
  const lease = await claimManagedExploreDispatch(worker, scope)
  assert.ok(lease)
  assert.equal(lease.turnId, turnId)
  return { lease, event: await recordCompletedRoot(lease) }
}

function candidate(firstLane: 'shore' | 'vessel', secondLane: 'shore' | 'vessel'): Direction {
  return {
    label: `${firstLane} acts first`,
    firstActor: firstLane,
    nextStep: `${secondLane} confirms`,
    rationale: 'Keep one operator responsible for the next action.',
    tradeoff: 'The first actor has to act before the other has a complete picture.',
    steps: [
      { id: 'start', label: 'Start assignment', lane: firstLane },
      { id: 'confirm', label: 'Confirm assignment', lane: secondLane },
    ],
    edges: [{ from: 'start', to: 'confirm' }],
  }
}

async function directionResult(session: RetentionSession) {
  const { lease, event } = await completeTurn(session, { kind: 'directions', instruction: 'Show both workflows.' })
  const first = candidate('shore', 'vessel')
  const second = candidate('vessel', 'shore')
  const output: DirectionOutput = { ...event, kind: 'directions', directions: [first, second] }
  return { lease, output, first, second }
}

async function selectDirection(session: RetentionSession, position: number) {
  const { directions, revision } = await readSession(session)
  const direction = directions[position]
  assert.ok(direction)
  const { projectId, sessionId } = session
  await withActor(api, founder, 'write', (c) =>
    selectManagedExploreDirection(c, projectId, sessionId, randomUUID(), {
      directionId: direction.id,
      expectedDirectionRevision: direction.revision,
      expectedSessionRevision: revision,
    }),
  )
  return direction.id
}

function artifact(event: Omit<DirectionOutput, 'kind' | 'directions'>, bytes: Buffer): PrototypeOutput {
  return {
    ...event,
    kind: 'prototype',
    artifactId: randomUUID(),
    artifactRequestId: randomUUID(),
    path: '/workspace/outputs/index.html',
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
    changeSummary: 'Add the confirm action.',
    acceptanceCriteria: ['Keyboard confirmation changes the state.'],
    mockReplacements: ['Replace the fictional assignment.'],
  }
}

it('retains only the exact completed direction pair and makes an ambiguous commit retry safe', async () => {
  const session = await startRetentionSession()
  const { lease, output, first, second } = await directionResult(session)
  const otherProject = { ...lease, projectId: randomUUID() }
  await assert.rejects(retainManagedExploreOutput(api, lease, output), { code: 'forbidden' })
  await assert.rejects(retainManagedExploreOutput(worker, otherProject, output), { code: 'invalid_state' })
  await assert.rejects(retainManagedExploreOutput(worker, lease, { ...output, environmentId: randomUUID() }), {
    code: 'stale_revision',
  })
  await assert.rejects(retainManagedExploreOutput(worker, lease, { ...output, rootId: randomUUID() }), {
    code: 'stale_revision',
  })
  await assert.rejects(retainManagedExploreOutput(worker, lease, { ...output, payloadSha256: 'a'.repeat(64) }), {
    code: 'stale_revision',
  })
  const invalidPair: DirectionOutput['directions'] = [first, { ...second, edges: [{ from: 'missing', to: 'confirm' }] }]
  await assert.rejects(retainManagedExploreOutput(worker, lease, { ...output, directions: invalidPair }), {
    code: 'invalid_request',
  })
  await assert.rejects(retainManagedExploreOutput(worker, lease, { ...output, directions: [first, first] }), {
    code: 'invalid_request',
  })
  const retaining = await readSession(session)
  assert.equal(retaining.directions.length, 0)
  assert.equal(retaining.turns.at(-1)?.status, 'retaining')

  await expire(lease)
  await assert.rejects(retainManagedExploreOutput(worker, lease, output), { code: 'invalid_state' })
  const retry = await claimManagedExploreDispatch(worker, paused)
  assert.ok(retry)
  assert.equal(retry.turnId, lease.turnId)
  await owner.query('UPDATE sophia.managed_explore_grants SET enabled=false WHERE project_id=$1', [session.projectId])
  assert.deepEqual(
    await Promise.all([
      retainManagedExploreOutput(worker, retry, output),
      retainManagedExploreOutput(worker, retry, output),
    ]),
    [{ kind: 'completed' }, { kind: 'completed' }],
  )
  const ready = await readSession(session)
  assert.equal(ready.revision, retaining.revision + 1)
  assert.equal(ready.turns.at(-1)?.status, 'completed')
  assert.deepEqual(
    ready.directions.map(({ label }) => label),
    [first.label, second.label],
  )
  await assert.rejects(retainManagedExploreOutput(worker, retry, { ...output, directions: [second, first] }), {
    code: 'stale_revision',
  })
  await assert.rejects(retainManagedExploreOutput(worker, lease, output), { code: 'stale_revision' })
  assert.deepEqual(await readSession(session), ready)
  await assert.rejects(readManagedExploreDispatch(worker, retry), { code: 'invalid_state' })
})

async function preparePrototype(session: RetentionSession) {
  const { lease, output } = await directionResult(session)
  assert.deepEqual(await retainManagedExploreOutput(worker, lease, output), { kind: 'completed' })
  const directionId = await selectDirection(session, 0)
  const work = await completeTurn(session, { kind: 'prototype', instruction: 'Build the prototype.', directionId })
  return { directionId, ...work }
}

function fullEntry() {
  const start = Buffer.from('\uFEFF<!doctype html>\r\n<meta charset="utf-8"><button>Confirm 🚢</button><!--')
  const end = Buffer.from('-->')
  return Buffer.concat([start, Buffer.alloc(2_097_152 - start.length - end.length, 'x'), end])
}

function readEntry(session: RetentionSession, versionId: string) {
  return withActor(api, founder, 'read', (c) =>
    readManagedExploreEntry(c, session.projectId, session.sessionId, versionId),
  )
}

async function assertInvalidArtifacts(lease: ManagedExploreDispatchLease, output: PrototypeOutput) {
  const { rootId, environmentId, submissionId, previousRootId, payloadSha256, providerSessionId } = output
  const event = { rootId, environmentId, submissionId, previousRootId, payloadSha256, providerSessionId }
  const excess = artifact(event, Buffer.alloc(2_097_153, 'x'))
  const malformed = artifact(event, Buffer.from([0xc0, 0xaf]))
  const injectedScope = { ...output, storageKey: 'an-untrusted-choice' }
  const injectedParent = { ...output, parentVersionId: randomUUID() }
  for (const bad of [
    excess,
    malformed,
    injectedScope,
    injectedParent,
    { ...output, byteLength: 1 },
    {
      ...output,
      sha256: 'a'.repeat(64),
    },
  ]) {
    await assert.rejects(retainManagedExploreOutput(worker, lease, bad), { code: 'invalid_request' })
  }
}

it('retains the exact 2 MiB entry, creates immutable revision lineage and rejects stale or invalid output', async () => {
  const session = await startRetentionSession()
  const { directionId, lease, event } = await preparePrototype(session)
  const bytes = fullEntry()
  const output = artifact(event, bytes)
  await assertInvalidArtifacts(lease, output)
  assert.deepEqual((await readSession(session)).versions, [])
  assert.deepEqual(await retainManagedExploreOutput(worker, lease, output), { kind: 'completed' })
  const first = await readSession(session)
  const v1 = first.versions[0]
  assert.ok(v1)
  assert.equal(v1.directionId, directionId)
  assert.equal(first.turns.at(-1)?.resultVersionId, v1.id)
  assert.equal(v1.parentVersionId, null)
  assert.deepEqual(await retainManagedExploreOutput(worker, lease, output), { kind: 'completed' })
  const entry = await readEntry(session, v1.id)
  assert.equal(entry.byteLength, 2_097_152)
  assert.equal(entry.entrySha256, output.sha256)
  assert.deepEqual(Buffer.from(entry.text ?? ''), bytes)
  await assert.rejects(worker.query('SELECT provider_artifact_id FROM sophia.managed_explore_retention_receipts'), {
    code: '42501',
  })
  await assert.rejects(api.query('SELECT body FROM sophia.managed_explore_entry_bodies'), { code: '42501' })
  assert.equal(JSON.stringify(first).includes(output.artifactId), false)

  const revision = await completeTurn(session, {
    kind: 'revision',
    instruction: 'Show the success state.',
    directionId,
    parentVersionId: v1.id,
  })
  const changed = artifact(revision.event, Buffer.from('<!doctype html><button>Done</button>'))
  await assert.rejects(
    retainManagedExploreOutput(worker, revision.lease, { ...changed, artifactId: output.artifactId }),
    {
      code: 'stale_revision',
    },
  )
  assert.deepEqual((await readSession(session)).versions, first.versions)
  assert.deepEqual(await retainManagedExploreOutput(worker, revision.lease, changed), { kind: 'completed' })
  const second = await readSession(session)
  const v2 = second.versions[1]
  assert.ok(v2)
  assert.equal(v2.number, 2)
  assert.equal(v2.parentVersionId, v1.id)
  assert.equal(v2.entrySha256, changed.sha256)
  assert.notEqual(v2.manifestSha256, v1.manifestSha256)
  assert.deepEqual(await readEntry(session, v1.id), entry)
  assert.equal(await readEntry(session, v2.id).then(({ text }) => text), Buffer.from(changed.bytes).toString())
})

it('settles completed provider work without publishing a prototype after a change in selected direction', async () => {
  const session = await startRetentionSession()
  const { lease, event } = await preparePrototype(session)
  await selectDirection(session, 1)
  const output = artifact(event, Buffer.from('<!doctype html><button>Confirm</button>'))
  assert.deepEqual(await retainManagedExploreOutput(worker, lease, output), {
    kind: 'denied',
    reason: 'direction_unavailable',
  })
  const view = await readSession(session)
  assert.deepEqual(view.versions, [])
  assert.equal(view.turns.at(-1)?.status, 'failed')
  assert.equal(view.turns.at(-1)?.error, 'direction_unavailable')
  const { rows } = await owner.query<{ state: string; usage: unknown }>(
    `SELECT o.state,x.usage FROM sophia.outbox o JOIN sophia.managed_explore_dispatch_turns x
       ON x.project_id=o.project_id AND x.turn_id=o.managed_explore_turn_id
     WHERE o.project_id=$1 AND o.id=$2`,
    [session.projectId, lease.outboxId],
  )
  assert.deepEqual(rows, [{ state: 'denied', usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } }])
})

it('refuses a revision when its exact parent was withdrawn during provider work', async () => {
  const session = await startRetentionSession()
  const { directionId, lease, event } = await preparePrototype(session)
  const first = artifact(event, Buffer.from('<!doctype html><button>Prior version</button>'))
  assert.deepEqual(await retainManagedExploreOutput(worker, lease, first), { kind: 'completed' })
  const parent = (await readSession(session)).versions[0]
  assert.ok(parent)
  const work = await completeTurn(session, {
    kind: 'revision',
    instruction: 'Keep the original interaction.',
    directionId,
    parentVersionId: parent.id,
  })
  const { sourceId } = await readEntry(session, parent.id)
  await owner.query("UPDATE sophia.source_objects SET eligible=false,state='blocked' WHERE project_id=$1 AND id=$2", [
    session.projectId,
    sourceId,
  ])
  const output = artifact(work.event, Buffer.from('<!doctype html><button>Unpublished revision</button>'))
  assert.deepEqual(await retainManagedExploreOutput(worker, work.lease, output), {
    kind: 'denied',
    reason: 'parent_unavailable',
  })
  const rejected = await readSession(session)
  assert.deepEqual(rejected.versions, [])
  assert.equal(rejected.turns.at(-1)?.resultVersionId, null)
  const { rows } = await owner.query<{ count: number }>(
    'SELECT count(*)::integer AS count FROM sophia.managed_explore_versions WHERE project_id=$1',
    [session.projectId],
  )
  assert.deepEqual(rows, [{ count: 1 }])
})

it('denies output after founder membership or the exact seed is withdrawn', async () => {
  const withoutMember = await startRetentionSession()
  const member = await directionResult(withoutMember)
  await owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
    withoutMember.projectId,
    founder,
  ])
  assert.deepEqual(await retainManagedExploreOutput(worker, member.lease, member.output), {
    kind: 'denied',
    reason: 'membership_changed',
  })
  const withoutSeed = await startRetentionSession()
  const seed = await directionResult(withoutSeed)
  await owner.query("UPDATE sophia.source_objects SET eligible=false,state='blocked' WHERE project_id=$1 AND id=$2", [
    withoutSeed.projectId,
    withoutSeed.sourceId,
  ])
  assert.deepEqual(await retainManagedExploreOutput(worker, seed.lease, seed.output), {
    kind: 'denied',
    reason: 'source_unavailable',
  })
  const { rows } = await owner.query<{ count: number }>(
    'SELECT count(*)::integer AS count FROM sophia.managed_explore_directions WHERE project_id=ANY($1)',
    [[withoutMember.projectId, withoutSeed.projectId]],
  )
  assert.deepEqual(rows, [{ count: 0 }])
})
