import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import type pg from 'pg'
import type {
  ManagedExploreApproval,
  ManagedExploreHandoff,
  ManagedExplorePreflight,
  ManagedExplorePreviewPermit,
  ManagedExploreSession,
  ManagedExploreStartReceipt,
  ManagedExploreTurnReceipt,
  MissionReceipt,
} from '@sophia/contracts'
import {
  createPool,
  markManagedExplorePreviewServed,
  readSnapshot,
  recordManagedExploreWorkerReadiness,
  shownReach,
  startExchange,
  withActor,
} from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { managedExploreAccountFromEnv } from './managed-explore-account.ts'
import { managedExplorePreviewReader } from './routes/managed-explore.ts'

const issuer = 'https://synthetic.supabase.test/auth/v1'
const secret = 'disposable-only-test-signing-secret-32-bytes'
const mediaToken = 'disposable-managed-explore-voice-capability'
const founder = randomUUID()
const admin = randomUUID()
const editor = randomUUID()
const viewer = randomUUID()
const routeId = 'fixture-explore'
const workerRoute = { routeId, providerOrg: 'fixture-org', providerProject: 'fixture-project', credentialGeneration: 1 }
const workerInstance = randomUUID()
const previewOrigin = 'https://explore-content.example.test'
const noteText = 'When the ship reports a fault, show the port team the next action.'
let db: TestDatabase
let owner: pg.Pool
let pool: pg.Pool
let worker: pg.Pool
let app: FastifyInstance
let off: FastifyInstance

async function token(actor: string): Promise<string> {
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(actor)
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl)
  owner = createPool(db.ownerUrl)
  worker = createPool(db.workerUrl)
  const verifyActor = createActorVerifier({ issuer, audience: 'authenticated', secret })
  const mediaBridgeTokenSha256 = createHash('sha256').update(mediaToken).digest()
  app = buildApp({
    pool,
    verifyActor,
    mediaBridgeTokenSha256,
    managedExplore: true,
    managedExplorePreviewOrigin: previewOrigin,
  })
  off = buildApp({ pool, verifyActor })
})

after(async () => {
  await app?.close()
  await off?.close()
  await owner?.end()
  await pool?.end()
  await worker?.end()
  await db?.drop()
})

async function request(
  path: string,
  opts: {
    actor?: string
    payload?: object
    method?: 'GET' | 'POST' | 'PUT'
    key?: string
    server?: FastifyInstance
  } = {},
) {
  const { actor = founder, payload, method = payload ? 'POST' : 'GET', key = randomUUID(), server = app } = opts
  return server.inject({
    method,
    url: path,
    headers: { authorization: `Bearer ${await token(actor)}`, 'idempotency-key': key },
    ...(payload ? { payload } : {}),
  })
}

async function recordVoiceNote(projectId: string): Promise<MissionReceipt> {
  const mission = `/api/v1/projects/${projectId}/mission`
  const policy = await request(`${mission}/note-policy`, {
    actor: admin,
    method: 'PUT',
    payload: { capture: 'automatic', expectedRevision: 0 },
  })
  assert.equal(policy.statusCode, 200, policy.body)
  const consent = await request(`${mission}/note-consent`, { method: 'PUT', payload: { state: 'accepted' } })
  assert.equal(consent.statusCode, 200, consent.body)
  const snapshot = await withActor(pool, founder, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snapshot)
  const { exchangeId } = await withActor(pool, founder, 'write', (c) =>
    startExchange(c, snapshot.room.id, randomUUID(), {
      expectedRoomRevision: snapshot.room.revision,
      allowVision: false,
    }),
  )
  const saved = await app.inject({
    method: 'POST',
    url: '/v1/media/tool-calls',
    headers: { authorization: `Bearer ${mediaToken}` },
    payload: {
      exchangeId,
      connectionGeneration: 3,
      callId: 'founder-pilot-brief',
      name: 'record_mission_note',
      args: { kind: 'expectation', epistemic: 'reported', text: noteText },
      inputEpoch: 1,
      actorId: founder,
      utterance: 1,
      inputMode: 'voice',
    },
  })
  assert.equal(saved.statusCode, 200, saved.body)
  const result = saved.json<{ status: string; output: MissionReceipt }>()
  assert.equal(result.status, 'committed', saved.body)
  return result.output
}

async function addGrant(projectId: string, route = routeId, announce = true) {
  await owner.query(
    `INSERT INTO sophia.managed_explore_grants(project_id,founder_id,route_id,provider_org,provider_project,
       credential_generation,model,currency,per_turn_micros,per_session_micros,environment_micros,funding_evidence_ref,
       grant_only_verified,enabled,expires_at,credential_expires_at)
     VALUES($1,$2,$3,'fixture-org','fixture-project',1,'fixture-model','USD',10,100,20,'fixture-proof',
       true,true,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour')`,
    [projectId, founder, route],
  )
  if (announce)
    await recordManagedExploreWorkerReadiness(worker, { ...workerRoute, routeId: route }, workerInstance, true)
}

async function waitForBlockedTransaction(pid: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const {
      rows: [activity],
    } = await owner.query<{ waiting: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND $1::int=ANY(pg_blocking_pids(pid))) AS waiting",
      [pid],
    )
    if (activity?.waiting) return true
    await delay(10)
  }
  return false
}

it('requires fresh matching worker readiness for new admissions and preserves prior receipts while it is offline', async () => {
  const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [founder] })
  const root = `/api/v1/projects/${projectId}/explore`
  const note = await recordVoiceNote(projectId)
  const route = { ...workerRoute, routeId: 'fixture-readiness-route' }
  await addGrant(projectId, route.routeId, false)
  const payload = { seedEntryId: note.entryId, expectedSeedRevision: note.ledgerRevision, routeId: route.routeId }
  const preflight = `${root}/preflight?seedEntryId=${note.entryId}&expectedSeedRevision=${note.ledgerRevision}`
  const start = `${root}/sessions`
  const key = randomUUID()
  const second = randomUUID()

  await assert.rejects(recordManagedExploreWorkerReadiness(pool, route, workerInstance, true), { code: 'forbidden' })
  assert.equal((await request(preflight)).statusCode, 503)
  assert.equal((await request(start, { payload, key })).statusCode, 503)
  await recordManagedExploreWorkerReadiness(worker, { ...route, credentialGeneration: 2 }, workerInstance, true)
  await recordManagedExploreWorkerReadiness(worker, { ...route, providerOrg: 'other-org' }, workerInstance, true)
  await recordManagedExploreWorkerReadiness(
    worker,
    { ...route, providerProject: 'other-project' },
    workerInstance,
    true,
  )
  assert.equal((await request(preflight)).statusCode, 503)
  assert.equal((await request(start, { payload, key })).statusCode, 503)
  const count = async () =>
    (
      await owner.query<{ count: number }>(
        'SELECT count(*)::int FROM sophia.managed_explore_turns WHERE project_id=$1',
        [projectId],
      )
    ).rows[0]?.count
  assert.equal(await count(), 0)

  await recordManagedExploreWorkerReadiness(worker, route, workerInstance, true)
  const blocker = await owner.connect()
  let blockedStart: ReturnType<typeof request> | undefined
  try {
    const {
      rows: [process],
    } = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    assert.ok(process)
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM sophia.projects WHERE id=$1 FOR UPDATE', [projectId])
    blockedStart = request(start, { payload, key })
    assert.ok(await waitForBlockedTransaction(process.pid), 'start must be waiting on the project lock')
    await blocker.query(
      'UPDATE sophia.managed_explore_worker_readiness SET ready_until=clock_timestamp() WHERE instance_id=$1 AND route_id=$2 AND credential_generation=$3',
      [workerInstance, route.routeId, route.credentialGeneration],
    )
    await blocker.query('COMMIT')
    const afterExpiry = await blockedStart
    assert.equal(afterExpiry.statusCode, 503, afterExpiry.body)
  } finally {
    await blocker.query('ROLLBACK')
    blocker.release()
    await blockedStart
  }
  assert.equal(await count(), 0)

  await recordManagedExploreWorkerReadiness(worker, route, workerInstance, true)
  await recordManagedExploreWorkerReadiness(worker, route, second, true)
  await recordManagedExploreWorkerReadiness(worker, route, workerInstance, false)
  assert.equal((await request(preflight)).statusCode, 200)
  const first = await request(start, { payload, key })
  assert.equal(first.statusCode, 202, first.body)
  const { sessionId } = first.json<ManagedExploreStartReceipt>()
  const sessionUrl = `${start}/${sessionId}`

  await owner.query(
    "UPDATE sophia.managed_explore_worker_readiness SET ready_until=clock_timestamp()-interval '1 second' WHERE instance_id=$1",
    [second],
  )
  const replay = await request(start, { payload, key })
  assert.equal(replay.statusCode, 202, replay.body)
  assert.equal(replay.json<ManagedExploreStartReceipt>().sessionId, sessionId)
  const resume = await request(preflight)
  assert.equal(resume.statusCode, 200)
  assert.equal(resume.json<ManagedExplorePreflight>().sessionId, sessionId)
  const session = await request(sessionUrl)
  assert.equal(session.statusCode, 200, session.body)
  const latest = session.json<ManagedExploreSession>()
  const refused = await request(`${sessionUrl}/turns`, {
    payload: { kind: 'text', instruction: 'A later question', expectedSessionRevision: latest.revision },
  })
  assert.equal(refused.statusCode, 503, refused.body)
  assert.equal(await count(), 1)
})

it('retires its readiness even if the first announcement was still committing', async () => {
  const route = { ...workerRoute, routeId: 'fixture-worker-commit-race' }
  const instance = randomUUID()
  const announcing = await worker.connect()
  let retirement: Promise<void> | undefined
  try {
    const {
      rows: [process],
    } = await announcing.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    assert.ok(process)
    await announcing.query('BEGIN')
    await announcing.query('SELECT sophia.record_managed_explore_worker_readiness($1,$2,$3,$4,$5,true)', [
      route.routeId,
      route.providerOrg,
      route.providerProject,
      route.credentialGeneration,
      instance,
    ])
    retirement = recordManagedExploreWorkerReadiness(worker, route, instance, false)
    assert.ok(await waitForBlockedTransaction(process.pid), 'retirement must wait for the first readiness write')
    await announcing.query('COMMIT')
    await retirement
    const { rows } = await owner.query(
      'SELECT instance_id FROM sophia.managed_explore_worker_readiness WHERE instance_id=$1',
      [instance],
    )
    assert.deepEqual(rows, [])
  } finally {
    await announcing.query('ROLLBACK')
    announcing.release()
    await retirement
  }
})

it('uses a real saved voice note and atomically admits one authorized start across retries', async () => {
  const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [founder, editor], viewers: [viewer] })
  const projectPath = `/api/v1/projects/${projectId}`
  const root = `${projectPath}/explore`
  const note = await recordVoiceNote(projectId)
  assert.ok(note.entryId)
  const payload = { seedEntryId: note.entryId, expectedSeedRevision: note.ledgerRevision, routeId }
  const preflight = `${root}/preflight?seedEntryId=${note.entryId}&expectedSeedRevision=${String(note.ledgerRevision)}`
  assert.equal((await app.inject({ url: preflight })).statusCode, 401)
  assert.equal((await request(preflight)).statusCode, 503)
  await addGrant(projectId)
  assert.equal((await request(preflight, { server: off })).statusCode, 503)
  assert.equal((await off.inject('/ready')).statusCode, 200)
  assert.equal((await app.inject('/ready')).statusCode, 200)
  assert.equal((await request(preflight, { actor: editor })).statusCode, 503)
  assert.equal((await request(preflight, { actor: viewer })).statusCode, 503)
  assert.equal((await request(preflight.replace(/=\d+$/, '=9007199254740992'))).statusCode, 422)
  assert.equal((await request(preflight.replace(/=\d+$/, '=123456'))).statusCode, 409)
  const shown = await request(preflight)
  assert.equal(shown.statusCode, 200, shown.body)
  const seed = {
    entryId: note.entryId,
    revision: note.ledgerRevision,
    text: noteText,
    sha256: createHash('sha256').update(noteText).digest('hex'),
  }
  assert.deepEqual(shown.json<ManagedExplorePreflight>(), {
    seed,
    funding: { routeId, label: 'OpenAI API credits' },
    sessionId: null,
  })
  assert.equal(shown.headers['cache-control'], 'private, no-store')

  const start = `${root}/sessions`
  assert.equal((await request(start, { payload: { ...payload, actorId: founder } })).statusCode, 422)
  assert.equal((await request(start, { payload: { ...payload, routeId: 'ordinary-research' } })).statusCode, 503)
  assert.equal((await request(start, { payload, server: off })).statusCode, 503)
  const key = randomUUID()
  const pair = await Promise.all([request(start, { payload, key }), request(start, { payload, key })])
  for (const res of pair) assert.equal(res.statusCode, 202, res.body)
  const [first, second] = pair.map((res) => res.json<ManagedExploreStartReceipt>())
  assert.ok(first)
  assert.deepEqual(first, second)
  const { sessionId } = first
  assert.equal((await request(start, { payload: { ...payload, routeId: 'changed' }, key })).statusCode, 409)
  assert.equal((await request(start, { payload })).statusCode, 409)
  assert.equal((await request(preflight)).json<ManagedExplorePreflight>().sessionId, sessionId)
  assert.equal((await request(preflight, { server: off })).json<ManagedExplorePreflight>().sessionId, sessionId)
  const session = `${start}/${sessionId}`
  assert.equal((await request(session, { actor: editor })).statusCode, 404)
  const other = await seedProject(db.ownerUrl, { admin, editors: [founder] })
  assert.equal((await request(session.replace(projectId, other.projectId))).statusCode, 404)
  const read = await request(session, { server: off })
  assert.equal(read.statusCode, 200, read.body)
  const view = read.json<ManagedExploreSession>()
  assert.deepEqual(view.seed, seed)
  assert.equal(view.revision, 1)
  assert.deepEqual(
    view.turns.map(({ kind, status, instruction }) => ({ kind, status, instruction })),
    [{ kind: 'text', status: 'queued', instruction: noteText }],
  )
  const queued = await owner.query<{ destination: string; semantic: object; reserved: string }>(
    `SELECT o.destination,c.semantic_request AS semantic,s.reserved_micros AS reserved
      FROM sophia.managed_explore_sessions s
      JOIN sophia.managed_explore_turns t ON t.project_id=s.project_id AND t.session_id=s.id
      JOIN sophia.commands c ON c.project_id=t.project_id AND c.id=t.command_id
      JOIN sophia.outbox o ON o.project_id=t.project_id AND o.managed_explore_turn_id=t.id
      WHERE s.project_id=$1 AND s.id=$2`,
    [projectId, sessionId],
  )
  const initial = view.turns[0]
  assert.ok(initial)
  assert.deepEqual(queued.rows, [
    {
      destination: 'managed_explore.turn',
      semantic: { turnId: initial.id, payloadDigest: seed.sha256 },
      reserved: '30',
    },
  ])

  const turns = `${session}/turns`
  const turn = { kind: 'directions', instruction: 'Give me two choices.', expectedSessionRevision: 1 }
  assert.equal((await request(turns, { payload: { ...turn, expectedSessionRevision: 3 } })).statusCode, 409)
  assert.equal((await request(turns, { payload: { ...turn, componentId: 'unbound' } })).statusCode, 422)
  assert.equal((await request(turns, { payload: turn })).statusCode, 409)
  // Establish an in-flight root for the admission assertions without a provider or fabricated public endpoint.
  await owner.query("UPDATE sophia.managed_explore_turns SET status='running' WHERE project_id=$1 AND id=$2", [
    projectId,
    initial.id,
  ])
  const turnKey = randomUUID()
  const admitted = await request(turns, { payload: turn, key: turnKey })
  assert.equal(admitted.statusCode, 202, admitted.body)
  assert.deepEqual(
    (
      await request(turns, { payload: { ...turn, instruction: ` ${turn.instruction} ` }, key: turnKey })
    ).json<ManagedExploreTurnReceipt>(),
    admitted.json<ManagedExploreTurnReceipt>(),
  )
  assert.equal((await request(turns, { payload: { ...turn, expectedSessionRevision: 2 } })).statusCode, 409)

  await owner.query('UPDATE sophia.managed_explore_grants SET enabled=false WHERE project_id=$1', [projectId])
  assert.equal((await request(preflight)).json<ManagedExplorePreflight>().sessionId, sessionId)
  assert.equal((await request(turns, { payload: { ...turn, expectedSessionRevision: 2 } })).statusCode, 503)
  await owner.query('UPDATE sophia.managed_explore_grants SET enabled=true WHERE project_id=$1', [projectId])

  const withdrawal = `${projectPath}/mission/entries/${note.entryId}/withdrawal`
  const preview = await request(withdrawal)
  assert.equal(preview.statusCode, 200, preview.body)
  const forgotten = await request(withdrawal, { payload: shownReach(preview.json()) })
  assert.equal(forgotten.statusCode, 202, forgotten.body)
  assert.equal((await request(preflight)).statusCode, 404)
  assert.equal((await request(session)).statusCode, 404)
  assert.equal((await request(start, { payload, key })).statusCode, 404)
})

const fixtureHtml = '<!DOCTYPE html>\r\n<title>Sample</title>\r\n'
const sha256 = (data: string) => createHash('sha256').update(data, 'utf8').digest('hex')

async function finishedPrototype(projectId: string, sessionId: string, html = fixtureHtml) {
  const directionId = randomUUID()
  await owner.query(
    `INSERT INTO sophia.managed_explore_directions(project_id,session_id,id,revision,position,candidate)
      VALUES($1,$2,$3,1,1,'{"label":"Shore assigns first","firstActor":"Shore","nextStep":"Assign",
        "rationale":"The queue is available at the start","tradeoff":"Port assigns early","steps":[],"edges":[]}'),
        ($1,$2,$4,1,2,'{"label":"Vessel responds first","firstActor":"Vessel","nextStep":"Reply",
        "rationale":"Act on vessel response","tradeoff":"Port waits","steps":[],"edges":[]}')`,
    [projectId, sessionId, directionId, randomUUID()],
  )
  const versionId = randomUUID()
  const sourceId = randomUUID()
  const entrySha256 = sha256(html)
  const byteLength = Buffer.byteLength(html)
  await owner.query(
    `INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
      VALUES($1,$2,$3,'private',$4,'text/html',$5,$6,true,'ready')`,
    [projectId, sourceId, founder, entrySha256, `inline/${projectId}/${sourceId}`, byteLength],
  )
  await owner.query('INSERT INTO sophia.source_texts VALUES($1,$2,$3)', [projectId, sourceId, html])
  // These keys are in the canonical lexical order. The digest is over the manifest without its own digest.
  const manifest = JSON.stringify({
    artifactId: sessionId,
    directionId,
    entry: 'index.html',
    files: [{ bytes: byteLength, mime: 'text/html', path: 'index.html', sha256: entrySha256, sourceId }],
    format: 'sophia.prototype.v1',
    parentVersionId: null,
    versionId,
  })
  const manifestSha256 = sha256(manifest)
  await owner.query(
    `INSERT INTO sophia.managed_explore_versions(project_id,session_id,id,number,direction_id,entry_source_id,
        entry_sha256,manifest_sha256,manifest,change_summary,acceptance_criteria,mock_replacements,limitations)
      VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,'First prototype',ARRAY['Draft'],ARRAY['Mock port API'],ARRAY['Test data'])`,
    [projectId, sessionId, versionId, directionId, sourceId, entrySha256, manifestSha256, manifest],
  )
  return { versionId, directionId, sourceId, entrySha256, manifestSha256, byteLength }
}

async function startFixture(): Promise<{ projectId: string; sessionId: string; path: string }> {
  const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [founder, editor] })
  await addGrant(projectId)
  const note = await recordVoiceNote(projectId)
  assert.ok(note.entryId)
  const root = `/api/v1/projects/${projectId}/explore/sessions`
  const opened = await request(root, {
    payload: { seedEntryId: note.entryId, expectedSeedRevision: note.ledgerRevision, routeId },
  })
  assert.equal(opened.statusCode, 202, opened.body)
  const { sessionId } = opened.json<ManagedExploreStartReceipt>()
  return { projectId, sessionId, path: `${root}/${sessionId}` }
}

it('binds a preview and one approval to verified retained bytes, then rechecks permissions and expiry', async () => {
  const { projectId, sessionId, path } = await startFixture()
  const { versionId, sourceId, entrySha256, manifestSha256, byteLength, directionId } = await finishedPrototype(
    projectId,
    sessionId,
  )
  const select = await request(`${path}/direction-selection`, {
    payload: { directionId, expectedDirectionRevision: 1, expectedSessionRevision: 1 },
  })
  assert.equal(select.statusCode, 200, select.body)
  const approvalPath = `${path}/approvals`
  const approve = {
    prototypeVersionId: versionId,
    expectedManifestDigest: manifestSha256,
    expectedSessionRevision: 2,
    acceptanceCriteria: ['The designated port editor can assign the fault.'],
  }
  assert.equal((await request(approvalPath, { payload: approve })).statusCode, 409)
  const permits = `${path}/versions/${versionId}/preview-permits`
  assert.equal((await request(permits, { payload: { manifestSha256, entrySha256 }, actor: editor })).statusCode, 404)
  assert.equal((await request(permits, { payload: { manifestSha256, entrySha256: 'a'.repeat(64) } })).statusCode, 409)
  const permitKey = randomUUID()
  const issued = await request(permits, { payload: { manifestSha256, entrySha256 }, key: permitKey })
  assert.equal(issued.statusCode, 200, issued.body)
  const receipt = issued.json<ManagedExplorePreviewPermit>()
  const issuedAgain = await request(permits, { payload: { entrySha256, manifestSha256 }, key: permitKey })
  assert.deepEqual(issuedAgain.json<ManagedExplorePreviewPermit>(), receipt)
  assert.equal(receipt.versionId, versionId)
  const url = new URL(receipt.url)
  assert.equal(url.origin, previewOrigin)
  const permit = /^\/v1\/previews\/([a-f0-9]{64})\/index\.html$/.exec(url.pathname)?.[1]
  assert.ok(permit)
  const read = managedExplorePreviewReader(pool, null)
  const shown = await read(permit)
  assert.deepEqual(shown, { expiresAt: receipt.expiresAt, entrySha256, byteLength, bytes: Buffer.from(fixtureHtml) })
  // Issuing the permit and resolving its bytes do not prove that the content host offered an authorized GET.
  assert.equal((await request(approvalPath, { payload: approve })).statusCode, 409)
  assert.equal(await markManagedExplorePreviewServed(pool, 'a'.repeat(64)), false)
  assert.equal(await markManagedExplorePreviewServed(pool, permit), true)

  assert.equal((await request(approvalPath, { payload: { ...approve, expectedSessionRevision: 1 } })).statusCode, 409)
  const approvalKey = randomUUID()
  const approvals = await Promise.all([
    request(approvalPath, { payload: approve, key: approvalKey }),
    request(approvalPath, { payload: approve, key: approvalKey }),
  ])
  for (const res of approvals) assert.equal(res.statusCode, 200, res.body)
  const [first, second] = approvals.map((res) => res.json<ManagedExploreApproval>())
  assert.ok(first)
  assert.deepEqual(first, second)
  assert.equal(
    (await request(approvalPath, { payload: { ...approve, acceptanceCriteria: ['Changed'] }, key: approvalKey }))
      .statusCode,
    409,
  )
  const handoffPath = `${path}/handoff/${first.id}`
  const handoff = await request(handoffPath, { server: off })
  assert.equal(handoff.statusCode, 200, handoff.body)
  assert.deepEqual(handoff.json<ManagedExploreHandoff>(), {
    approvalId: first.id,
    versionId,
    manifestSha256,
    seedText: noteText,
    acceptanceCriteria: approve.acceptanceCriteria,
    mockReplacements: ['Mock port API'],
    limitations: ['Test data'],
    files: [{ path: 'index.html', mime: 'text/html', byteCount: byteLength, sha256: entrySha256 }],
  })
  assert.equal((await request(handoffPath, { actor: editor })).statusCode, 404)

  await owner.query("UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2", [
    projectId,
    founder,
  ])
  assert.equal(await read(permit), null)
  await owner.query("UPDATE sophia.project_members SET role='editor' WHERE project_id=$1 AND actor_id=$2", [
    projectId,
    founder,
  ])
  await owner.query(
    `UPDATE sophia.managed_explore_preview_permits SET issued_at=clock_timestamp()-interval '11 min',
      expires_at=clock_timestamp()-interval '2 min',served_at=clock_timestamp()-interval '3 min' WHERE project_id=$1 AND session_id=$2`,
    [projectId, sessionId],
  )
  assert.equal(await read(permit), null)
  assert.equal(await markManagedExplorePreviewServed(pool, permit), false)
  const replayed = await request(approvalPath, { payload: approve, key: approvalKey })
  assert.equal(replayed.statusCode, 200, replayed.body)
  assert.deepEqual(replayed.json<ManagedExploreApproval>(), first)
  assert.equal((await request(permits, { payload: { manifestSha256, entrySha256 }, key: permitKey })).statusCode, 409)
  const refreshed = await request(permits, { payload: { manifestSha256, entrySha256 } })
  assert.equal(refreshed.statusCode, 200, refreshed.body)
  assert.equal(refreshed.json<ManagedExplorePreviewPermit>().versionId, versionId)

  await owner.query("UPDATE sophia.source_objects SET state='blocked',eligible=false WHERE project_id=$1 AND id=$2", [
    projectId,
    sourceId,
  ])
  assert.equal((await request(handoffPath)).statusCode, 404)
  assert.equal((await request(permits, { payload: { manifestSha256, entrySha256 } })).statusCode, 404)
})

it('refuses a retained artifact that fails the content host resource policy before mint and approval', async () => {
  const { projectId, sessionId, path } = await startFixture()
  const { versionId, entrySha256, manifestSha256 } = await finishedPrototype(
    projectId,
    sessionId,
    '<!doctype html><title>Test only</title><img src="https://preview-fixture.invalid/image.png">',
  )
  const permit = await request(`${path}/versions/${versionId}/preview-permits`, {
    payload: { entrySha256, manifestSha256 },
  })
  assert.equal(permit.statusCode, 409, permit.body)
  assert.match(permit.body, /did not meet preview policy/)
  const approval = await request(`${path}/approvals`, {
    payload: {
      prototypeVersionId: versionId,
      expectedManifestDigest: manifestSha256,
      expectedSessionRevision: 1,
      acceptanceCriteria: ['The fixture has no remote resources.'],
    },
  })
  assert.equal(approval.statusCode, 409, approval.body)
  assert.match(approval.body, /did not meet preview policy/)
})

it('serializes the scoped funding observation only after the founder preflight or session is authorized', async () => {
  const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [founder, editor] })
  await addGrant(projectId)
  const note = await recordVoiceNote(projectId)
  assert.ok(note.entryId)
  const root = `/api/v1/projects/${projectId}/explore`
  const preflight = `${root}/preflight?seedEntryId=${note.entryId}&expectedSeedRevision=${String(note.ledgerRevision)}`
  const observation = {
    balanceCents: 0,
    currency: 'USD' as const,
    autoRechargeEnabled: null,
    observedAt: '2026-11-21T13:00:00Z',
  }
  const account = managedExploreAccountFromEnv(
    JSON.stringify({ projectId, founderId: founder, routeId, ...observation }),
  )
  assert.ok(account)
  const verifyActor = createActorVerifier({ issuer, audience: 'authenticated', secret })
  const configured = buildApp({ pool, verifyActor, managedExplore: true, managedExploreAccountSnapshot: account })
  try {
    const scoped = await request(preflight, { server: configured })
    assert.equal(scoped.statusCode, 200, scoped.body)
    assert.equal(scoped.headers['cache-control'], 'private, no-store')
    assert.deepEqual(scoped.json<ManagedExplorePreflight>().funding, {
      routeId,
      label: 'OpenAI API credits',
      accountSnapshot: observation,
    })
    assert.equal((await request(preflight, { actor: editor, server: configured })).statusCode, 503)
    assert.equal((await request(preflight)).json<ManagedExplorePreflight>().funding.accountSnapshot, undefined)
    const admitted = await request(`${root}/sessions`, {
      server: configured,
      payload: { seedEntryId: note.entryId, expectedSeedRevision: note.ledgerRevision, routeId },
    })
    assert.equal(admitted.statusCode, 202, admitted.body)
    const receipt = admitted.json<ManagedExploreStartReceipt>()
    assert.deepEqual(Object.keys(receipt), ['sessionId'])
    const session = `${root}/sessions/${receipt.sessionId}`
    const read = await request(session, { server: configured })
    assert.equal(read.statusCode, 200, read.body)
    assert.equal(read.headers['cache-control'], 'private, no-store')
    assert.deepEqual(read.json<ManagedExploreSession>().funding.accountSnapshot, observation)
    assert.equal((await request(session, { actor: editor, server: configured })).statusCode, 404)
    assert.equal((await request(session)).json<ManagedExploreSession>().funding.accountSnapshot, undefined)

    // Observations can still be read when authorized, but can never replace an active grant for another turn.
    await owner.query('UPDATE sophia.managed_explore_grants SET enabled=false WHERE project_id=$1', [projectId])
    const blocked = await request(`${session}/turns`, {
      server: configured,
      payload: { kind: 'text', instruction: 'A second turn.', expectedSessionRevision: 1 },
    })
    assert.equal(blocked.statusCode, 503)
  } finally {
    await configured.close()
  }
})
