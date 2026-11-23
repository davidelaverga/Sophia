import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type {
  FounderBuildBinding,
  FounderBuildDestination,
  FounderBuildExport,
  FounderBuildReturn,
  FounderBuildVerification,
  FounderBuildVerificationAccess,
  FounderBuildVerificationRequest,
  FounderBuildVerificationTarget,
  ManagedExploreApproval,
  ManagedExplorePreviewPermit,
} from '@sophia/contracts'
import { PROTOTYPE_ENTRY_MAX_BYTES, prototypeManifestSha256 } from '@sophia/design'
import {
  createPool,
  markManagedExplorePreviewServed,
  recordManagedExploreWorkerReadiness,
  recordMissionEntry,
  startManagedExplore,
  withActor,
} from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import type pg from 'pg'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { ByteStoreError, objectPath, storedKey, type ByteStore } from './byte-store.ts'
import { managedExplorePreviewReader } from './routes/managed-explore.ts'

const founder = randomUUID()
const editor = randomUUID()
const deployedVerifier = randomUUID()
const implementationAuthor = randomUUID()
const issuer = 'https://build-fixture.example.test/auth/v1'
const secret = 'synthetic-foundation-build-signing-secret'
const previewOrigin = 'https://build-fixture-preview.example.test'
const routeId = 'fixture-explore'
const html = Buffer.from('<!doctype html>\r\n<title>Fictional port fixture</title>\r\n', 'utf8')
const entrySha256 = createHash('sha256').update(html).digest('hex')
const criteria = ['The port team can assign a fault.\r\nUse the original text.']
const target = {
  repositoryId: '123456789',
  repository: 'FictionalOwner/FictionalPort',
  defaultBranch: 'main',
  seedCommit: 'b'.repeat(40),
  privateConfirmed: true as const,
}

let db: TestDatabase
let owner: pg.Pool
let pool: pg.Pool
let app: FastifyInstance
let off: FastifyInstance
let onRead: (() => Promise<void>) | undefined
const files = new Map<string, Uint8Array>()
const store: ByteStore = {
  get() {
    throw new Error('A retained prototype must use the bounded read')
  },
  async getExact(path, { expectedBytes, maxBytes }) {
    assert.equal(expectedBytes, html.byteLength)
    assert.equal(maxBytes, PROTOTYPE_ENTRY_MAX_BYTES)
    await onRead?.()
    const bytes = files.get(path)
    assert.ok(bytes)
    if (bytes.byteLength !== expectedBytes) throw new ByteStoreError(409, 'fixture length mismatch')
    return Uint8Array.from(bytes)
  },
  put() {
    throw new Error('No writes to the test byte store')
  },
  signedUrl() {
    throw new Error('No signing in the Build route')
  },
}

before(async () => {
  db = await createTestDatabase()
  owner = createPool(db.ownerUrl)
  await owner.query('UPDATE sophia.managed_explore_pilot_budget SET cap_micros=100000000 WHERE singleton')
  pool = createPool(db.apiUrl)
  const worker = createPool(db.workerUrl)
  try {
    await recordManagedExploreWorkerReadiness(
      worker,
      { routeId, providerOrg: 'fixture-org', providerProject: 'fixture-project', credentialGeneration: 1 },
      randomUUID(),
      true,
    )
  } finally {
    await worker.end()
  }
  const verifyActor = createActorVerifier({ issuer, audience: 'authenticated', secret })
  app = buildApp({
    pool,
    verifyActor,
    byteStore: store,
    managedExplore: true,
    managedExplorePreviewOrigin: previewOrigin,
    founderBuildHandoff: true,
  })
  off = buildApp({ pool, verifyActor })
})

after(async () => {
  await Promise.all([app?.close(), off?.close(), owner?.end(), pool?.end()])
  await db?.drop()
})

async function call(
  path: string,
  opts: { payload?: object; actor?: string; key?: string; server?: FastifyInstance } = {},
) {
  const { payload, actor = founder, key = randomUUID(), server = app } = opts
  const token = await new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setSubject(actor)
    .setExpirationTime('5m')
    .sign(Buffer.from(secret))
  return server.inject({
    method: payload ? 'POST' : 'GET',
    url: path,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
    ...(payload ? { payload } : {}),
  })
}

async function startPrototype() {
  const { projectId } = await seedProject(db.ownerUrl, {
    admin: founder,
    editors: [editor],
    viewers: [deployedVerifier, implementationAuthor],
  })
  const note = await withActor(pool, founder, 'write', (c) =>
    recordMissionEntry(c, projectId, randomUUID(), {
      kind: 'expectation',
      epistemic: 'reported',
      text: 'Prototype a fictional port workflow.',
    }),
  )
  assert.ok(note.entryId)
  const seedEntryId = note.entryId
  await owner.query(
    `INSERT INTO sophia.managed_explore_grants(project_id,founder_id,route_id,provider_org,provider_project,
      credential_generation,model,currency,per_turn_micros,per_session_micros,environment_micros,funding_evidence_ref,
      grant_only_verified,enabled,expires_at,credential_expires_at)
      VALUES($1,$2,$3,'fixture-org','fixture-project',1,'fixture-model','USD',10,10000,20,'fixture-proof',
      true,true,now()+interval '1 hour',now()+interval '1 hour')`,
    [projectId, founder, routeId],
  )
  const { sessionId } = await withActor(pool, founder, 'write', (c) =>
    startManagedExplore(c, projectId, randomUUID(), {
      seedEntryId,
      expectedSeedRevision: note.ledgerRevision,
      routeId,
    }),
  )
  return { projectId, sessionId }
}

async function approveFixture() {
  const { projectId, sessionId } = await startPrototype()
  const directionId = randomUUID()
  const versionId = randomUUID()
  const sourceId = randomUUID()
  const storePath = objectPath(projectId, sourceId)
  files.set(storePath, html)
  await owner.query(
    `INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
      VALUES($1,$2,$3,'private',$4,'text/html',$5,$6,true,'ready')`,
    [projectId, sourceId, founder, entrySha256, storedKey(projectId, sourceId), html.byteLength],
  )
  await owner.query(
    `INSERT INTO sophia.managed_explore_directions(project_id,session_id,id,revision,position,candidate)
      VALUES($1,$2,$3,1,1,'{}')`,
    [projectId, sessionId, directionId],
  )
  const versionManifest = {
    artifactId: sessionId,
    directionId,
    entry: 'index.html',
    format: 'sophia.prototype.v1',
    versionId,
    parentVersionId: null,
    files: [{ bytes: html.byteLength, mime: 'text/html', path: 'index.html', sha256: entrySha256, sourceId }],
  }
  const manifestSha256 = prototypeManifestSha256(versionManifest)
  await owner.query(
    `INSERT INTO sophia.managed_explore_versions(project_id,session_id,id,number,direction_id,entry_source_id,
      entry_sha256,manifest_sha256,manifest,change_summary,acceptance_criteria,mock_replacements,limitations)
      VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,'A retained fixture',ARRAY['Draft'],ARRAY['Fixture'],ARRAY['Synthetic'])`,
    [
      projectId,
      sessionId,
      versionId,
      directionId,
      sourceId,
      entrySha256,
      manifestSha256,
      JSON.stringify(versionManifest),
    ],
  )
  const path = `/api/v1/projects/${projectId}/explore/sessions/${sessionId}`
  const preview = await call(`${path}/versions/${versionId}/preview-permits`, {
    payload: { manifestSha256, entrySha256 },
  })
  assert.equal(preview.statusCode, 200, preview.body)
  const token = new URL(preview.json<ManagedExplorePreviewPermit>().url).pathname.split('/')[3]
  assert.ok(token)
  const viewed = await managedExplorePreviewReader(pool, store)(token)
  assert.ok(viewed)
  assert.deepEqual(Buffer.from(viewed.bytes), html)
  assert.equal(await markManagedExplorePreviewServed(pool, token), true)
  const decision = await call(`${path}/approvals`, {
    payload: {
      prototypeVersionId: versionId,
      expectedManifestDigest: manifestSha256,
      expectedSessionRevision: 1,
      acceptanceCriteria: criteria,
    },
  })
  assert.equal(decision.statusCode, 200, decision.body)
  const { id: approvalId } = decision.json<ManagedExploreApproval>()
  return {
    projectId,
    sessionId,
    approvalId,
    versionId,
    sourceId,
    storePath,
    manifestSha256,
    path: `${path}/handoff/${approvalId}`,
  }
}

async function installTarget(projectId: string, sessionId: string, approvalId: string) {
  await owner.query(
    `INSERT INTO sophia.founder_build_grants(project_id,session_id,approval_id,founder_id,recipient_id,repository_id,
      repository,default_branch,seed_commit,private_confirmed,provenance,authority_ref,enabled,expires_at)
      VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,true,'reported','disposable-fixture-grant',true,now()+interval '1 hour')`,
    [
      projectId,
      sessionId,
      approvalId,
      founder,
      target.repositoryId,
      target.repository,
      target.defaultBranch,
      target.seedCommit,
    ],
  )
}

it('binds a private target, exports the original bytes and retains reported return evidence under current authority', async () => {
  const { projectId, sessionId, approvalId, versionId, sourceId, storePath, manifestSha256, path } =
    await approveFixture()
  const destination = `${path}/destination`
  const bind = `${path}/repository-binding`
  const prepare = `${path}/exports`
  assert.equal((await off.inject('/ready')).statusCode, 200)
  assert.equal((await app.inject('/ready')).statusCode, 200)
  assert.equal((await call(destination, { server: off })).statusCode, 404)
  assert.equal((await call(destination, { actor: editor })).statusCode, 404)
  const empty = await call(destination)
  assert.equal(empty.statusCode, 200, empty.body)
  assert.deepEqual(empty.json<FounderBuildDestination>(), {
    revision: 1,
    binding: null,
    export: null,
    returns: [],
  })
  const bindRequest = { ...target, expectedRevision: 1 }
  assert.equal((await call(bind, { payload: bindRequest })).statusCode, 404)
  await installTarget(projectId, sessionId, approvalId)
  assert.equal((await call(bind, { payload: { ...bindRequest, repositoryId: '7654321' } })).statusCode, 404)
  assert.equal((await call(bind, { payload: { ...bindRequest, privateConfirmed: false } })).statusCode, 422)
  assert.equal((await call(bind, { payload: { ...bindRequest, ownerId: founder } })).statusCode, 422)
  const bindKey = randomUUID()
  const bound = await Promise.all([
    call(bind, { payload: bindRequest, key: bindKey }),
    call(bind, { payload: { ...bindRequest, repository: target.repository.toLowerCase() }, key: bindKey }),
  ])
  for (const result of bound) assert.equal(result.statusCode, 200, result.body)
  const [binding, bindingReplay] = bound.map((r) => r.json<FounderBuildBinding>())
  assert.ok(binding)
  assert.deepEqual(binding, bindingReplay)
  assert.equal(binding.repository, target.repository)
  assert.equal(binding.provenance, 'reported')

  const exportRequest = { expectedRevision: 2, bindingId: binding.id }
  files.set(storePath, Buffer.from('Changed transport bytes'))
  assert.equal((await call(prepare, { payload: exportRequest })).statusCode, 409)
  files.set(storePath, html)
  const exportKey = randomUUID()
  const exported = await call(prepare, { payload: exportRequest, key: exportKey })
  assert.equal(exported.statusCode, 200, exported.body)
  const receipt = exported.json<FounderBuildExport>()
  assert.equal(receipt.revision, 3)
  assert.equal(receipt.sha256, prototypeManifestSha256(receipt.manifest))
  assert.notEqual(receipt.sha256, entrySha256)
  assert.equal(receipt.manifest.versionId, versionId)
  assert.equal(receipt.manifest.prototypeManifestSha256, manifestSha256)
  assert.equal(receipt.manifest.recipient, founder)
  assert.deepEqual(receipt.manifest.acceptanceCriteria, criteria)
  assert.deepEqual(receipt.manifest.files, [
    {
      id: sourceId,
      sourceId,
      path: 'index.html',
      mime: 'text/html',
      byteCount: html.byteLength,
      sha256: entrySha256,
    },
  ])
  assert.deepEqual(
    (await call(prepare, { payload: exportRequest, key: exportKey })).json<FounderBuildExport>(),
    receipt,
  )
  const manifest = `${prepare}/${receipt.id}/manifest`
  const file = `${prepare}/${receipt.id}/files/${sourceId}`
  assert.deepEqual((await call(manifest)).json<FounderBuildExport>(), receipt)
  assert.equal((await call(file.replace(sourceId, randomUUID()))).statusCode, 404)
  assert.equal((await call(file, { actor: editor })).statusCode, 404)
  assert.equal((await call(manifest.replace(approvalId, randomUUID()))).statusCode, 404)
  const download = await call(file)
  assert.equal(download.statusCode, 200, download.body)
  assert.deepEqual(download.rawPayload, html)
  assert.equal(download.headers['content-disposition'], 'attachment; filename="index.html"')
  assert.equal(download.headers['content-type'], 'text/plain; charset=utf-8')
  assert.equal(download.headers['content-length'], String(html.byteLength))
  assert.equal(download.headers['cache-control'], 'private, no-store')

  const lookup = (await call(destination)).json<FounderBuildDestination>()
  assert.deepEqual(lookup, { revision: 3, binding, export: receipt, returns: [] })
  const returns = `${path}/returns`
  const reportRequest = {
    expectedRevision: 3,
    exportId: receipt.id,
    exportSha256: receipt.sha256,
    repositoryId: target.repositoryId,
  }
  assert.equal((await call(returns, { payload: reportRequest })).statusCode, 422)
  assert.equal(
    (await call(returns, { payload: { ...reportRequest, status: 'verified', pullRequestNumber: 17 } })).statusCode,
    422,
  )
  assert.equal(
    (await call(returns, { payload: { ...reportRequest, repositoryId: '7654321', pullRequestNumber: 17 } })).statusCode,
    409,
  )
  assert.equal(
    (await call(returns, { payload: { ...reportRequest, exportSha256: entrySha256, pullRequestNumber: 17 } }))
      .statusCode,
    409,
  )
  const reportKey = randomUUID()
  const candidate = { ...reportRequest, candidateSha: 'c'.repeat(40), pullRequestNumber: 17 }
  const reported = await call(returns, { payload: candidate, key: reportKey })
  assert.equal(reported.statusCode, 200, reported.body)
  const first = reported.json<FounderBuildReturn>()
  assert.equal(first.status, 'reported')
  assert.deepEqual((await call(returns, { payload: candidate, key: reportKey })).json<FounderBuildReturn>(), first)
  assert.equal(
    (await call(returns, { payload: { ...candidate, pullRequestNumber: 18 }, key: reportKey })).statusCode,
    409,
  )
  const deployment = await call(returns, {
    payload: {
      ...reportRequest,
      expectedRevision: 4,
      deployedSha: 'd'.repeat(40),
      deploymentReference: 'https://fictional-deploy.example.test/revisions/one',
    },
  })
  assert.equal(deployment.statusCode, 200, deployment.body)
  const final = (await call(destination)).json<FounderBuildDestination>()
  assert.equal(final.revision, 5)
  assert.deepEqual(final.returns, [first, deployment.json<FounderBuildReturn>()])

  await owner.query('UPDATE sophia.founder_build_grants SET enabled=false WHERE project_id=$1', [projectId])
  const revokedDownload = await call(file)
  assert.equal(revokedDownload.statusCode, 404)
  assert.equal(revokedDownload.headers['cache-control'], 'private, no-store')
  assert.equal((await call(returns, { payload: candidate, key: reportKey })).statusCode, 404)
  await owner.query('UPDATE sophia.founder_build_grants SET enabled=true WHERE project_id=$1', [projectId])
  onRead = async () => {
    await owner.query("UPDATE sophia.source_objects SET eligible=false,state='blocked' WHERE project_id=$1 AND id=$2", [
      projectId,
      sourceId,
    ])
  }
  try {
    const withdrawnDownload = await call(file)
    assert.equal(withdrawnDownload.statusCode, 404)
    assert.equal(withdrawnDownload.headers['cache-control'], 'private, no-store')
  } finally {
    onRead = undefined
  }
  assert.equal((await call(manifest)).statusCode, 404)
})

const reportedTuple = {
  candidateSha: 'c'.repeat(40),
  pullRequestNumber: 19,
  mergeSha: 'd'.repeat(40),
  deploymentReference: 'https://client-fixture.example.test/deploy/immutable-one',
  deployedSha: 'e'.repeat(40),
}

async function verificationFixture() {
  const f = await approveFixture()
  await installTarget(f.projectId, f.sessionId, f.approvalId)
  const bind = await call(`${f.path}/repository-binding`, { payload: { ...target, expectedRevision: 1 } })
  assert.equal(bind.statusCode, 200, bind.body)
  const exported = await call(`${f.path}/exports`, {
    payload: { bindingId: bind.json<FounderBuildBinding>().id, expectedRevision: 2 },
  })
  assert.equal(exported.statusCode, 200, exported.body)
  const { id: exportId, sha256: exportSha256 } = exported.json<FounderBuildExport>()
  const bound = { exportId, exportSha256, repositoryId: target.repositoryId }
  const report = async (revision: number, details: object) => {
    const returned = await call(`${f.path}/returns`, { payload: { ...bound, ...details, expectedRevision: revision } })
    assert.equal(returned.statusCode, 200, returned.body)
    return returned.json<FounderBuildReturn>()
  }
  const destination = async () => (await call(`${f.path}/destination`)).json<FounderBuildDestination>()
  return { ...f, destination, report, bound }
}

async function installVerification(
  f: Awaited<ReturnType<typeof verificationFixture>>,
  pinned: FounderBuildVerificationTarget,
  role: { reviewer: string; kind: FounderBuildVerificationRequest['kind']; author?: string },
  client: pg.Pool | pg.PoolClient = owner,
) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO sophia.founder_build_verification_grants
      (project_id,session_id,approval_id,return_id,export_id,reviewer_id,source_author_id,kind,target,enabled,authority_ref,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'approved disposable reviewer fixture',now()+interval '1 hour')
     RETURNING id`,
    [
      f.projectId,
      f.sessionId,
      f.approvalId,
      pinned.returnId,
      pinned.exportId,
      role.reviewer,
      role.author ?? implementationAuthor,
      role.kind,
      JSON.stringify(pinned),
    ],
  )
  return rows[0]?.id
}

function verificationPayload(ret: FounderBuildReturn, revision: number): FounderBuildVerificationRequest {
  return {
    expectedRevision: revision,
    returnId: ret.id,
    kind: 'source_review',
    outcome: 'passed',
    scenario: 'Reviewed the exact candidate independently.',
    expected: 'The acceptance checks run against the reviewed head.',
    observed: 'The reviewed head passed the acceptance checks.',
    evidenceReference: 'https://review-fixture.example.test/evidence/pr-19',
  }
}

function deploymentPayload(ret: FounderBuildReturn, revision: number, pinned: FounderBuildVerificationTarget) {
  return {
    ...verificationPayload(ret, revision),
    kind: 'deployed_app',
    mappingSourceSha: pinned.mergeSha,
    observedDeployedSha: pinned.deployedSha,
    observedDeploymentReference: pinned.deploymentReference,
    evidenceReference: 'https://test-fixture.example.test/observations/first-pass',
  } satisfies FounderBuildVerificationRequest
}

it('requires exact independent authorities and retains the original evidence when a later reported tuple is partial', async () => {
  const f = await verificationFixture()
  const partial = await f.report(3, { candidateSha: reportedTuple.candidateSha })
  assert.deepEqual((await f.destination()).verification, {
    status: 'reported',
    currentReturnId: partial.id,
    receipts: [],
    checks: { sourceReview: 'pending', deployedApp: 'pending' },
  })
  const complete = await f.report(4, reportedTuple)
  const pinned = { ...f.bound, ...reportedTuple, repository: target.repository, returnId: complete.id }
  const path = `${f.path}/verifications`
  const access = `${path}?returnId=${complete.id}`
  const sourceGrant = await installVerification(f, pinned, { reviewer: editor, kind: 'source_review' })
  await installVerification(f, pinned, { reviewer: deployedVerifier, kind: 'deployed_app' })
  assert.equal((await f.destination()).verification?.status, 'awaiting_verification')
  const read = await call(access, { actor: editor })
  assert.equal(read.statusCode, 200, read.body)
  assert.deepEqual(read.json<FounderBuildVerificationAccess>(), { revision: 5, kind: 'source_review', target: pinned })
  assert.equal((await call(access)).statusCode, 404)
  assert.equal((await call(access, { actor: implementationAuthor })).statusCode, 404)
  assert.equal((await call(access.replace(f.projectId, randomUUID()), { actor: editor })).statusCode, 404)
  assert.equal((await call(`${f.path}/destination`, { actor: editor })).statusCode, 404)
  assert.equal(
    (await call(`${f.path}/exports/${pinned.exportId}/manifest`, { actor: deployedVerifier })).statusCode,
    404,
  )

  const key = randomUUID()
  const payload = verificationPayload(complete, 5)
  assert.equal((await call(path, { payload })).statusCode, 404)
  const pair = await Promise.all([
    call(path, { actor: editor, payload, key }),
    call(path, { actor: editor, payload, key }),
  ])
  for (const result of pair) assert.equal(result.statusCode, 200, result.body)
  const [source, replay] = pair.map((result) => result.json<FounderBuildVerification>())
  assert.deepEqual(replay, source)
  assert.equal(
    (await call(path, { actor: editor, payload: { ...payload, observed: 'Changed observation.' }, key })).statusCode,
    409,
  )
  const appEvidence = deploymentPayload(complete, 6, pinned)
  assert.equal((await call(path, { actor: editor, payload: appEvidence })).statusCode, 404)
  assert.equal(
    (await call(path, { actor: deployedVerifier, payload: { ...appEvidence, mappingSourceSha: 'f'.repeat(40) } }))
      .statusCode,
    409,
  )
  assert.equal(
    (await call(path, { actor: deployedVerifier, payload: { ...appEvidence, observedDeployedSha: 'f'.repeat(40) } }))
      .statusCode,
    409,
  )
  assert.equal(
    (
      await call(path, {
        actor: deployedVerifier,
        payload: { ...appEvidence, observedDeploymentReference: 'https://client-fixture.example.test/deploy/other' },
      })
    ).statusCode,
    409,
  )
  assert.equal(
    (await call(path, { actor: deployedVerifier, payload: { ...appEvidence, expectedRevision: 5 } })).statusCode,
    409,
  )
  const failed = await call(path, {
    actor: deployedVerifier,
    payload: {
      ...payload,
      kind: 'deployed_app',
      expectedRevision: 6,
      outcome: 'failed',
      evidenceReference: 'https://test-fixture.example.test/observations/wrong-build',
      observedDeployedSha: 'f'.repeat(40),
    },
  })
  assert.equal(failed.statusCode, 200, failed.body)
  assert.equal(failed.json<FounderBuildVerification>().observedDeployedSha, 'f'.repeat(40))
  assert.equal(failed.json<FounderBuildVerification>().mappingSourceSha, undefined)
  assert.deepEqual((await f.destination()).verification?.checks, { sourceReview: 'passed', deployedApp: 'failed' })
  assert.equal((await f.destination()).verification?.status, 'awaiting_verification')
  const tested = await call(path, {
    actor: deployedVerifier,
    payload: { ...appEvidence, expectedRevision: 7 },
  })
  assert.equal(tested.statusCode, 200, tested.body)
  assert.deepEqual((await f.destination()).verification, {
    status: 'verified_in_app',
    currentReturnId: complete.id,
    checks: { sourceReview: 'passed', deployedApp: 'passed' },
    receipts: [source, failed.json<FounderBuildVerification>(), tested.json<FounderBuildVerification>()],
  })

  await owner.query('UPDATE sophia.founder_build_verification_grants SET enabled=false WHERE id=$1', [sourceGrant])
  assert.equal((await call(path, { actor: editor, payload, key })).statusCode, 404)
  assert.equal((await f.destination()).verification?.status, 'awaiting_verification')
  assert.deepEqual((await f.destination()).verification?.checks, {
    sourceReview: 'authority_withdrawn',
    deployedApp: 'passed',
  })
  await owner.query('UPDATE sophia.founder_build_verification_grants SET enabled=true WHERE id=$1', [sourceGrant])
  const next = await f.report(8, { deployedSha: 'a'.repeat(40) })
  const reopened = await f.destination()
  assert.equal(reopened.verification?.status, 'reported')
  assert.equal(reopened.verification?.currentReturnId, next.id)
  assert.equal(reopened.verification?.receipts.length, 3)
  assert.equal((await call(access, { actor: editor })).statusCode, 404)
})

it('denies mis-scoped, expired, revoked-source and author verification authority without recording', async () => {
  const f = await verificationFixture()
  const complete = await f.report(3, reportedTuple)
  const pinned = { ...f.bound, ...reportedTuple, repository: target.repository, returnId: complete.id }
  const path = `${f.path}/verifications`
  const access = `${path}?returnId=${complete.id}`
  const payload = verificationPayload(complete, 4)
  await assert.rejects(installVerification(f, pinned, { reviewer: implementationAuthor, kind: 'source_review' }), {
    code: '23514',
  })
  const grant = await installVerification(
    f,
    { ...pinned, repositoryId: '987654321' },
    { reviewer: editor, kind: 'source_review' },
  )
  assert.equal((await call(access, { actor: editor })).statusCode, 404)
  await owner.query('UPDATE sophia.founder_build_verification_grants SET target=$2,expires_at=now() WHERE id=$1', [
    grant,
    JSON.stringify(pinned),
  ])
  assert.equal((await call(path, { payload, actor: editor })).statusCode, 404)
  await owner.query(
    "UPDATE sophia.founder_build_verification_grants SET expires_at=now()+interval '1 hour' WHERE id=$1",
    [grant],
  )
  await owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
    f.projectId,
    editor,
  ])
  assert.equal((await call(access, { actor: editor })).statusCode, 404)
  await owner.query('UPDATE sophia.project_members SET active=true WHERE project_id=$1 AND actor_id=$2', [
    f.projectId,
    editor,
  ])
  await owner.query("UPDATE sophia.source_objects SET eligible=false,state='blocked' WHERE project_id=$1 AND id=$2", [
    f.projectId,
    f.sourceId,
  ])
  assert.equal((await call(path, { payload, actor: editor })).statusCode, 404)
  const kept = await owner.query('SELECT 1 FROM sophia.founder_build_verifications WHERE project_id=$1', [f.projectId])
  assert.equal(kept.rowCount, 0)
})

it('refuses a stale passing observation and a conflicting evidence URL while a distinct retest can pass', async () => {
  const f = await verificationFixture()
  const returned = await f.report(3, reportedTuple)
  const pinned = { ...f.bound, ...reportedTuple, repository: target.repository, returnId: returned.id }
  const path = `${f.path}/verifications`
  await installVerification(f, pinned, { reviewer: editor, kind: 'source_review' })
  await installVerification(f, pinned, { reviewer: deployedVerifier, kind: 'deployed_app' })
  const source = await call(path, { actor: editor, payload: verificationPayload(returned, 4) })
  assert.equal(source.statusCode, 200, source.body)
  const pass = {
    ...deploymentPayload(returned, 5, pinned),
    observed: ['The first check passed.', 'The server kept the explanation.'].join(String.fromCodePoint(10)),
  }
  const originalKey = randomUUID()
  const initial = await call(path, { actor: deployedVerifier, payload: pass, key: originalKey })
  assert.equal(initial.statusCode, 200, initial.body)
  assert.equal((await f.destination()).verification?.status, 'verified_in_app')
  const failure = await call(path, {
    actor: deployedVerifier,
    payload: {
      ...pass,
      expectedRevision: 6,
      outcome: 'failed',
      observed: 'The latest check found a failed control.',
      evidenceReference: 'https://test-fixture.example.test/observations/new-failure',
    },
  })
  assert.equal(failure.statusCode, 200, failure.body)
  const unresolved = await f.destination()
  assert.equal(unresolved.verification?.status, 'awaiting_verification')
  assert.equal(unresolved.revision, 7)

  const retry = await call(path, { actor: deployedVerifier, payload: pass, key: originalKey })
  assert.equal(retry.statusCode, 200, retry.body)
  assert.deepEqual(retry.json<FounderBuildVerification>(), initial.json<FounderBuildVerification>())
  const duplicate = await call(path, {
    actor: deployedVerifier,
    payload: {
      ...pass,
      expectedRevision: 7,
      observed: pass.observed + String.fromCodePoint(0xa0, 0x3000, 9, 10),
      evidenceReference: 'https://test-fixture.example.test/observations/relabeled',
    },
  })
  assert.equal(duplicate.statusCode, 409, duplicate.body)
  const differentFraming = [
    String.fromCodePoint(0x3000, 32) + pass.observed,
    pass.observed.replaceAll(String.fromCodePoint(10), String.fromCodePoint(13, 10)),
  ]
  for (const observed of differentFraming) {
    const match = await call(path, {
      actor: deployedVerifier,
      payload: {
        ...pass,
        expectedRevision: 7,
        observed,
        evidenceReference: 'https://test-fixture.example.test/observations/relabeled',
      },
    })
    assert.equal(match.statusCode, 409, match.body)
  }
  const conflicting = await call(path, {
    actor: deployedVerifier,
    payload: {
      ...pass,
      expectedRevision: 7,
      observed: 'Conflicting content with the first evidence link.',
    },
  })
  assert.equal(conflicting.statusCode, 409, conflicting.body)
  assert.deepEqual(await f.destination(), unresolved)
  const fresh = {
    ...pass,
    expectedRevision: 7,
    observed: '船🚢'.repeat(1_000),
    evidenceReference: 'https://test-fixture.example.test/observations/new-retest',
  }
  assert.equal(
    (await call(path, { actor: deployedVerifier, payload: { ...fresh, observed: fresh.observed + '🚢' } })).statusCode,
    422,
  )
  const retest = await call(path, { actor: deployedVerifier, payload: fresh })
  assert.equal(retest.statusCode, 200, retest.body)
  assert.equal(retest.json<FounderBuildVerification>().observed, fresh.observed)
  const final = await f.destination()
  assert.equal(final.revision, 8)
  assert.equal(final.verification?.status, 'verified_in_app')
  assert.equal(final.verification?.receipts.length, 4)
})

it('refuses to reclassify identical evidence without a URL and accepts a distinct retest', async () => {
  const f = await verificationFixture()
  const returned = await f.report(3, reportedTuple)
  const pinned = { ...f.bound, ...reportedTuple, repository: target.repository, returnId: returned.id }
  const path = `${f.path}/verifications`
  await installVerification(f, pinned, { reviewer: editor, kind: 'source_review' })
  await installVerification(f, pinned, { reviewer: deployedVerifier, kind: 'deployed_app' })
  const source = await call(path, { actor: editor, payload: verificationPayload(returned, 4) })
  assert.equal(source.statusCode, 200, source.body)
  const failure = {
    expectedRevision: 5,
    returnId: returned.id,
    kind: 'deployed_app',
    outcome: 'failed',
    scenario: 'Signed in as the chief engineer in a fresh session.',
    expected: 'A valid explanation enables shore assignment.',
    observed: 'Assignment stayed disabled after the explanation was saved.',
    mappingSourceSha: pinned.mergeSha,
    observedDeployedSha: pinned.deployedSha,
    observedDeploymentReference: pinned.deploymentReference,
  } satisfies FounderBuildVerificationRequest
  const submitted = await call(path, { actor: deployedVerifier, payload: failure })
  assert.equal(submitted.statusCode, 200, submitted.body)
  const saved = await f.destination()
  assert.equal(saved.verification?.checks?.deployedApp, 'failed')
  assert.equal(saved.verification?.status, 'awaiting_verification')
  const reclassified = { ...failure, expectedRevision: 6, outcome: 'passed' }
  const duplicate = await call(path, { actor: deployedVerifier, payload: reclassified })
  assert.equal(duplicate.statusCode, 409, duplicate.body)
  assert.deepEqual(await f.destination(), saved)

  const retest = await call(path, {
    actor: deployedVerifier,
    payload: {
      ...reclassified,
      observed: 'In a new session, shore assigned the fault after the explanation was saved.',
    },
  })
  assert.equal(retest.statusCode, 200, retest.body)
  const closed = await f.destination()
  assert.equal(closed.verification?.checks?.deployedApp, 'passed')
  assert.equal(closed.verification?.status, 'verified_in_app')
  assert.equal(closed.verification?.receipts.length, 3)
})

async function waitForVerifierGrantLock() {
  const deadline = performance.now() + 1500
  while (performance.now() < deadline) {
    const { rowCount } = await owner.query(
      `SELECT 1 FROM pg_stat_activity
       WHERE datname=current_database() AND wait_event_type='Lock'
       AND query LIKE 'SELECT sophia.write_founder_build_verification%'`,
    )
    if (rowCount) return
    await delay(10)
  }
  assert.fail('verification did not reach its blocked grant row')
}

it('does not move an in-flight verification onto a replacement grant after revocation', async () => {
  const f = await verificationFixture()
  const returned = await f.report(3, reportedTuple)
  const pinned = { ...f.bound, ...reportedTuple, repository: target.repository, returnId: returned.id }
  const role = { reviewer: editor, kind: 'source_review' } as const
  const original = await installVerification(f, pinned, role)
  const submit = () => call(`${f.path}/verifications`, { actor: editor, payload: verificationPayload(returned, 4) })
  const operator = await owner.connect()
  let replacement: string | undefined
  try {
    await operator.query('BEGIN')
    await operator.query('UPDATE sophia.founder_build_verification_grants SET enabled=false WHERE id=$1', [original])
    replacement = await installVerification(f, pinned, role, operator)
    const waiting = submit()
    await waitForVerifierGrantLock()
    await operator.query('COMMIT')
    const refused = await waiting
    assert.equal(refused.statusCode, 404, refused.body)
  } finally {
    await operator.query('ROLLBACK')
    operator.release()
  }
  assert.deepEqual((await f.destination()).verification?.receipts, [])
  const accepted = await submit()
  assert.equal(accepted.statusCode, 200, accepted.body)
  const { rows } = await owner.query('SELECT grant_id FROM sophia.founder_build_verifications WHERE project_id=$1', [
    f.projectId,
  ])
  assert.deepEqual(rows, [{ grant_id: replacement }])
})
