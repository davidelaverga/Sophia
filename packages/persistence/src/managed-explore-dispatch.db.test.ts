import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type pg from 'pg'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  admitManagedExploreTurn,
  createPool,
  readManagedExploreEntry,
  readManagedExploreSession,
  recordManagedExploreWorkerReadiness,
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
  await recordManagedExploreWorkerReadiness(worker, scope, founder, true)
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

async function createReceipt(lease: ManagedExploreDispatchLease, providerSessionId = randomUUID()) {
  const observation = {
    kind: 'created',
    operationId: lease.createOperationId,
    providerSessionId,
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

it('prepares only the chosen design and exact retained parent under the outbound byte fence', async () => {
  const { projectId, sessionId } = await admit()
  const getSession = () => withActor(api, founder, 'read', (c) => readManagedExploreSession(c, projectId, sessionId))
  const claimTurn = async () => {
    const claim = await claimManagedExploreDispatch(worker, scope)
    assert.ok(claim)
    assert.equal(claim.projectId, projectId)
    return claim
  }
  const prepareEvent = (claim: ManagedExploreDispatchLease) =>
    prepareManagedExploreDispatch(worker, claim, { kind: 'event', predecessorRootId: claim.previousRootId })
  const first = await claimTurn()
  assert.equal((await prepareManagedExploreDispatch(worker, first, { kind: 'create' })).kind, 'create')
  await createReceipt(first, `synthetic-session-${randomUUID()}`)
  const event = await prepareEvent(first)
  assert.equal(event.kind, 'event')
  const firstRoot = {
    providerSessionId: event.providerSessionId,
    submissionId: event.submissionId,
    payloadSha256: event.payloadSha256,
    previousRootId: event.previousRootId,
    rootId: 'input-seed-root',
    status: 'completed',
  } as const
  await recordManagedExploreDispatch(worker, first, { ...firstRoot, kind: 'root' })
  await recordManagedExploreDispatch(worker, first, { ...firstRoot, kind: 'settle', reply: 'Clarification saved.' })

  const directionId = randomUUID()
  const unselectedId = randomUUID()
  const choice = {
    label: 'Vessel acknowledges first',
    firstActor: 'Vessel',
    nextStep: 'Acknowledge the exception',
    rationale: 'Shore can use the explanation',
    tradeoff: 'Wait for a vessel response',
    steps: [{ id: 'ack', label: 'Acknowledge', lane: 'vessel' }],
    edges: [],
  }
  await owner.query(
    `INSERT INTO sophia.managed_explore_directions(project_id,session_id,id,revision,position,candidate)
       VALUES ($1,$2,$3,1,1,$4::jsonb),($1,$2,$5,1,2,$6::jsonb)`,
    [
      projectId,
      sessionId,
      directionId,
      JSON.stringify(choice),
      unselectedId,
      JSON.stringify({ ...choice, label: 'Other direction' }),
    ],
  )
  const choose = async (id: string) => {
    const { revision } = await getSession()
    return withActor(api, founder, 'write', (c) =>
      selectManagedExploreDirection(c, projectId, sessionId, randomUUID(), {
        directionId: id,
        expectedDirectionRevision: 1,
        expectedSessionRevision: revision,
      }),
    )
  }
  const queue = async (kind: 'text' | 'prototype' | 'revision', instruction: string, parentVersionId?: string) => {
    const { revision } = await getSession()
    return withActor(api, founder, 'write', (c) =>
      admitManagedExploreTurn(c, projectId, sessionId, randomUUID(), {
        kind,
        instruction,
        expectedSessionRevision: revision,
        ...(kind === 'text' ? {} : { directionId }),
        ...(parentVersionId ? { parentVersionId } : {}),
      }),
    )
  }

  await choose(directionId)
  await queue('prototype', 'Use the selected workflow.')
  await choose(unselectedId)
  const staleSelection = await claimTurn()
  assert.deepEqual(await prepareEvent(staleSelection), { kind: 'denied', reason: 'direction_unavailable' })
  const {
    rows: [denied],
  } = await owner.query(
    'SELECT event_possible_at,payload_sha256 FROM sophia.managed_explore_dispatch_turns WHERE turn_id=$1',
    [staleSelection.turnId],
  )
  assert.deepEqual(denied, { event_possible_at: null, payload_sha256: null })

  await choose(directionId)
  await queue('prototype', 'Use the selected workflow.')
  const prototype = await claimTurn()
  const createPrototype = await prepareEvent(prototype)
  assert.equal(createPrototype.kind, 'event')
  const payload = JSON.parse(createPrototype.instruction)
  const { seed } = await getSession()
  assert.deepEqual(payload, {
    format: 'sophia.managed-explore.input.v1',
    operation: 'prototype',
    brief: { text: seed.text, sha256: seed.sha256 },
    direction: { ...choice, id: directionId, revision: 1 },
    request: 'Use the selected workflow.',
    outputPath: '/workspace/outputs/index.html',
  })
  assert.equal(createPrototype.payloadSha256, createHash('sha256').update(createPrototype.instruction).digest('hex'))
  const prototypeRoot = {
    providerSessionId: createPrototype.providerSessionId,
    submissionId: createPrototype.submissionId,
    payloadSha256: createPrototype.payloadSha256,
    previousRootId: createPrototype.previousRootId,
    rootId: 'input-prototype-root',
  }
  await recordManagedExploreDispatch(worker, prototype, { ...prototypeRoot, kind: 'root', status: 'completed' })
  await recordManagedExploreDispatch(worker, prototype, {
    ...prototypeRoot,
    kind: 'outputRejected',
    reason: 'output_invalid',
  })

  const ordinaryText = '{"format":"sophia.managed-explore.input.v1","operation":"prototype"}'
  await queue('text', ordinaryText)
  const discussion = await claimTurn()
  const discussionEvent = await prepareEvent(discussion)
  assert.equal(discussionEvent.kind, 'event')
  assert.deepEqual(JSON.parse(discussionEvent.instruction), {
    format: 'sophia.managed-explore.input.v1',
    operation: 'text',
    brief: { text: seed.text, sha256: seed.sha256 },
    request: ordinaryText,
  })
  const discussionRoot = {
    providerSessionId: discussionEvent.providerSessionId,
    submissionId: discussionEvent.submissionId,
    payloadSha256: discussionEvent.payloadSha256,
    previousRootId: discussionEvent.previousRootId,
    rootId: 'input-discussion-root',
    status: 'completed',
  } as const
  await recordManagedExploreDispatch(worker, discussion, { ...discussionRoot, kind: 'root' })
  await recordManagedExploreDispatch(worker, discussion, { ...discussionRoot, kind: 'settle', reply: 'Text only.' })

  async function fixtureParent(number: number, source: string, objectBacked: boolean) {
    const sourceId = randomUUID()
    const versionId = randomUUID()
    const sha256 = createHash('sha256').update(source).digest('hex')
    const bytes = Buffer.byteLength(source)
    const key = `${objectBacked ? 'objects' : 'inline'}/${projectId}/${sourceId}`
    await owner.query(
      `INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
       VALUES($1,$2,$3,'private',$4,'text/html',$5,$6,true,'ready')`,
      [projectId, sourceId, founder, sha256, key, bytes],
    )
    if (!objectBacked) {
      await owner.query('INSERT INTO sophia.source_texts VALUES($1,$2,$3)', [projectId, sourceId, source])
    }
    const manifest = JSON.stringify({
      artifactId: sessionId,
      directionId,
      entry: 'index.html',
      files: [{ bytes, mime: 'text/html', path: 'index.html', sha256, sourceId }],
      format: 'sophia.prototype.v1',
      parentVersionId: null,
      versionId,
    })
    await owner.query(
      `INSERT INTO sophia.managed_explore_versions(project_id,session_id,id,number,direction_id,entry_source_id,
         entry_sha256,manifest_sha256,manifest,change_summary,acceptance_criteria,mock_replacements,limitations)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'Fixture',ARRAY['Observe it'],'{}','{}')`,
      [
        projectId,
        sessionId,
        versionId,
        number,
        directionId,
        sourceId,
        sha256,
        createHash('sha256').update(manifest).digest('hex'),
        manifest,
      ],
    )
    return { id: versionId, entrySha256: sha256, html: source }
  }

  const source = '<!doctype html>\r\n<title>Vessel 🚢 and "shore"</title>\r\n<button>Acknowledge</button>'
  const firstParent = await fixtureParent(1, source, false)
  const objectParent = await fixtureParent(2, source, true)
  await queue('revision', 'Keep the prior controls.', objectParent.id)
  const unavailable = await claimTurn()
  assert.deepEqual(await prepareEvent(unavailable), { kind: 'denied', reason: 'parent_unavailable' })
  const {
    rows: [unavailableFence],
  } = await owner.query('SELECT event_possible_at FROM sophia.managed_explore_dispatch_turns WHERE turn_id=$1', [
    unavailable.turnId,
  ])
  assert.equal(unavailableFence.event_possible_at, null)

  // The retained source fits the inline storage limit. JSON escaping makes the outbound message too large.
  const largeParent = await fixtureParent(3, '<!doctype html>' + '\u0001'.repeat(180_000), false)
  await queue('revision', 'Keep the prior source.', largeParent.id)
  const oversized = await claimTurn()
  assert.deepEqual(await prepareEvent(oversized), { kind: 'denied', reason: 'input_too_large' })
  const {
    rows: [oversizeFence],
  } = await owner.query(
    'SELECT event_possible_at,payload_sha256 FROM sophia.managed_explore_dispatch_turns WHERE turn_id=$1',
    [oversized.turnId],
  )
  assert.deepEqual(oversizeFence, { event_possible_at: null, payload_sha256: null })

  await queue('revision', 'Keep the prior controls and require an explanation.', firstParent.id)
  const revision = await claimTurn()
  const revisionEvent = await prepareEvent(revision)
  assert.equal(revisionEvent.kind, 'event')
  const revised = JSON.parse(revisionEvent.instruction)
  assert.deepEqual(revised, {
    ...payload,
    operation: 'revision',
    request: 'Keep the prior controls and require an explanation.',
    parent: firstParent,
    componentId: null,
  })
  assert.equal(revisionEvent.payloadSha256, createHash('sha256').update(revisionEvent.instruction).digest('hex'))
  assert.deepEqual(await prepareEvent(revision), { kind: 'observe' })
})

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
  const nextInput = JSON.parse(next.instruction)
  assert.deepEqual(nextInput, {
    format: 'sophia.managed-explore.input.v1',
    operation: 'directions',
    brief: { text: seed.seed.text, sha256: seed.seed.sha256 },
    request: finished.turns[1]?.instruction,
  })
  assert.equal(next.payloadSha256, createHash('sha256').update(next.instruction).digest('hex'))
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

async function claimNextTurn(session: RetentionSession, request: Omit<TurnRequest, 'expectedSessionRevision'>) {
  const { revision } = await readSession(session)
  const { projectId, sessionId } = session
  const { turnId } = await withActor(api, founder, 'write', (c) =>
    admitManagedExploreTurn(c, projectId, sessionId, randomUUID(), { ...request, expectedSessionRevision: revision }),
  )
  const lease = await claimManagedExploreDispatch(worker, scope)
  assert.ok(lease)
  assert.equal(lease.turnId, turnId)
  return lease
}

async function completeTurn(session: RetentionSession, request: Omit<TurnRequest, 'expectedSessionRevision'>) {
  const lease = await claimNextTurn(session, request)
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

  const oversized = await claimNextTurn(session, {
    kind: 'revision',
    instruction: 'Show the success state.',
    directionId,
    parentVersionId: v1.id,
  })
  assert.deepEqual(
    await prepareManagedExploreDispatch(worker, oversized, {
      kind: 'event',
      predecessorRootId: oversized.previousRootId,
    }),
    { kind: 'denied', reason: 'input_too_large' },
  )
  assert.deepEqual(await readEntry(session, v1.id), entry)

  const small = await completeTurn(session, {
    kind: 'prototype',
    instruction: 'Keep the entry compact.',
    directionId,
  })
  const compact = artifact(small.event, Buffer.from('<!doctype html><button>Confirm</button>'))
  assert.deepEqual(await retainManagedExploreOutput(worker, small.lease, compact), { kind: 'completed' })
  const beforeRevision = await readSession(session)
  const smallParent = beforeRevision.versions[1]
  assert.ok(smallParent)
  const revision = await completeTurn(session, {
    kind: 'revision',
    instruction: 'Show the success state.',
    directionId,
    parentVersionId: smallParent.id,
  })
  const changed = artifact(revision.event, Buffer.from('<!doctype html><button>Done</button>'))
  await assert.rejects(
    retainManagedExploreOutput(worker, revision.lease, { ...changed, artifactId: output.artifactId }),
    {
      code: 'stale_revision',
    },
  )
  assert.deepEqual((await readSession(session)).versions, beforeRevision.versions)
  assert.deepEqual(await retainManagedExploreOutput(worker, revision.lease, changed), { kind: 'completed' })
  const second = await readSession(session)
  const v2 = second.versions[2]
  assert.ok(v2)
  assert.equal(v2.number, 3)
  assert.equal(v2.parentVersionId, smallParent.id)
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

it('persists the first exact terminal session refusal, denies unsent successors and preserves prior replies', async () => {
  const session = await startRetentionSession()
  const admitText = async () => {
    const view = await readSession(session)
    return withActor(api, founder, 'write', (c) =>
      admitManagedExploreTurn(c, session.projectId, session.sessionId, randomUUID(), {
        kind: 'text',
        instruction: 'What else should I verify?',
        expectedSessionRevision: view.revision,
      }),
    )
  }
  await admitText()
  const first = await claimManagedExploreDispatch(worker, scope)
  assert.ok(first?.providerSessionId && first.environmentId)
  assert.equal(first.projectId, session.projectId)
  const refusal = {
    kind: 'sessionRefused',
    providerSessionId: first.providerSessionId,
    environmentId: first.environmentId,
    status: 'budget_reached',
    requestId: 'synthetic-budget-readback',
  } as const
  await assert.rejects(
    recordManagedExploreDispatch(worker, first, { ...refusal, environmentId: 'unexpected-environment' }),
    { code: 'stale_revision' },
  )
  await assert.rejects(recordManagedExploreDispatch(api, first, refusal), { code: 'forbidden' })
  await recordManagedExploreDispatch(worker, first, refusal)
  await assert.rejects(recordManagedExploreDispatch(worker, first, refusal), { code: 'invalid_state' })
  const refused = await readSession(session)
  assert.equal(refused.turns.at(-1)?.error, 'budget_exceeded')
  assert.equal(refused.turns[0]?.reply, 'Ready.')

  await admitText()
  const successor = await claimManagedExploreDispatch(worker, scope)
  assert.ok(successor)
  assert.equal(successor.projectId, session.projectId)
  assert.equal(successor.sessionRefusalStatus, 'budget_reached')
  assert.deepEqual(
    await prepareManagedExploreDispatch(worker, successor, {
      kind: 'event',
      predecessorRootId: successor.previousRootId,
    }),
    { kind: 'denied', reason: 'budget_exceeded' },
  )
  const kept = await owner.query<{ input_refused_status: string; input_refused_request_id: string; possible: number }>(
    `SELECT input_refused_status,input_refused_request_id,
      (SELECT count(*)::int FROM sophia.managed_explore_dispatch_turns t
        WHERE t.project_id=d.project_id AND event_possible_at IS NOT NULL) AS possible
     FROM sophia.managed_explore_dispatch_sessions d WHERE project_id=$1`,
    [session.projectId],
  )
  assert.deepEqual(kept.rows, [
    {
      input_refused_status: 'budget_reached',
      input_refused_request_id: 'synthetic-budget-readback',
      possible: 1,
    },
  ])
})

it('rejects a session-level refusal for a possible event and retains that exact event for reconciliation', async () => {
  const session = await admit()
  const lease = await claimManagedExploreDispatch(worker, scope)
  assert.ok(lease)
  assert.equal(lease.projectId, session.projectId)
  assert.equal((await prepareManagedExploreDispatch(worker, lease, { kind: 'create' })).kind, 'create')
  const { providerSessionId, environmentId } = await createReceipt(lease)
  const event = await prepareManagedExploreDispatch(worker, lease, { kind: 'event', predecessorRootId: null })
  assert.equal(event.kind, 'event')
  await assert.rejects(
    recordManagedExploreDispatch(worker, lease, {
      kind: 'sessionRefused',
      providerSessionId,
      environmentId,
      status: 'failed',
      requestId: null,
    }),
    { code: 'stale_revision' },
  )
  const mailed = await readManagedExploreDispatch(worker, lease)
  assert.equal(mailed.payloadSha256, event.payloadSha256)
  assert.equal(mailed.sessionRefusalStatus, null)
  await recordManagedExploreDispatch(worker, lease, {
    ...event,
    kind: 'root',
    rootId: 'refusal-test-reconciled-root',
    status: 'failed',
  })
  await recordManagedExploreDispatch(worker, lease, {
    ...event,
    kind: 'settle',
    rootId: 'refusal-test-reconciled-root',
    status: 'failed',
    reason: 'provider_failed',
  })
  assert.equal((await readSession(session)).turns[0]?.error, 'provider_failed')
})

async function waitForPrepareLock() {
  const deadline = performance.now() + 1500
  while (performance.now() < deadline) {
    const { rowCount } = await owner.query(`SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock'
        AND query LIKE 'SELECT sophia.prepare_managed_explore_dispatch%'`)
    if (rowCount) return
    await delay(10)
  }
  assert.fail('Explore prepare did not reach its blocked statement')
}

it('drains a blocked Explore prepare without authorizing a send and a new lease can prepare once', async () => {
  const session = await admit()
  const first = await claimManagedExploreDispatch(worker, scope)
  assert.ok(first)
  assert.equal(first.projectId, session.projectId)
  const lock = await owner.connect()
  const stop = new AbortController()
  try {
    await lock.query('BEGIN')
    await lock.query('SELECT id FROM sophia.projects WHERE id=$1 FOR UPDATE', [session.projectId])
    const pending = prepareManagedExploreDispatch(
      worker,
      first,
      { kind: 'create' },
      {
        signal: stop.signal,
        deadline: performance.now() + 3000,
      },
    )
    const rejected = assert.rejects(pending, { code: 'unavailable' })
    await waitForPrepareLock()
    stop.abort()
    const timer = new AbortController()
    try {
      assert.equal(await Promise.race([rejected, delay(750, 'still blocked', { signal: timer.signal })]), undefined)
    } finally {
      timer.abort()
    }
  } finally {
    stop.abort()
    await lock.query('ROLLBACK')
    lock.release()
  }
  const afterDrain = await readManagedExploreDispatch(worker, first)
  assert.equal(afterDrain.createPossibleAt, null)
  await expire(first)
  const next = await claimManagedExploreDispatch(worker, scope)
  assert.ok(next)
  assert.equal(next.turnId, first.turnId)
  assert.notEqual(next.leaseToken, first.leaseToken)
  assert.equal((await prepareManagedExploreDispatch(worker, next, { kind: 'create' })).kind, 'create')
  assert.deepEqual(await prepareManagedExploreDispatch(worker, next, { kind: 'create' }), { kind: 'observe' })
})

it('atomically binds a created session already in failure and settles its original unsent turn', async () => {
  const session = await admit()
  const lease = await claimManagedExploreDispatch(worker, scope)
  assert.ok(lease)
  assert.equal(lease.projectId, session.projectId)
  assert.equal((await prepareManagedExploreDispatch(worker, lease, { kind: 'create' })).kind, 'create')
  const receipt = {
    kind: 'created',
    operationId: lease.createOperationId,
    providerSessionId: randomUUID(),
    environmentId: 'failed-at-creation',
    model: lease.model,
    sessionLimitCents: lease.sessionLimitCents,
    networkAccess: 'disabled',
    requestId: 'synthetic-terminal-creation',
    refusalStatus: 'failed',
  } as const
  await recordManagedExploreDispatch(worker, lease, receipt)
  assert.equal((await readSession(session)).turns[0]?.error, 'provider_failed')
  const row = await owner.query(
    `SELECT d.provider_session_id,d.input_refused_status,x.event_possible_at
     FROM sophia.managed_explore_dispatch_sessions d
     JOIN sophia.managed_explore_dispatch_turns x USING (project_id,session_id)
     WHERE d.project_id=$1`,
    [session.projectId],
  )
  assert.deepEqual(row.rows, [
    {
      provider_session_id: receipt.providerSessionId,
      input_refused_status: 'failed',
      event_possible_at: null,
    },
  ])
})
