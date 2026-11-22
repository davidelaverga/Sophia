import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, it } from 'node:test'
import type {
  FounderBuildBinding,
  FounderBuildDestination,
  FounderBuildExport,
  FounderBuildReturn,
  ManagedExploreApproval,
  ManagedExplorePreviewPermit,
} from '@sophia/contracts'
import { prototypeManifestSha256 } from '@sophia/design'
import {
  createPool,
  markManagedExplorePreviewServed,
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
import { objectPath, storedKey, type ByteStore } from './byte-store.ts'

const founder = randomUUID()
const editor = randomUUID()
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
  async get(path) {
    await onRead?.()
    const bytes = files.get(path)
    assert.ok(bytes)
    return bytes
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
  pool = createPool(db.apiUrl)
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
  const { projectId } = await seedProject(db.ownerUrl, { admin: founder, editors: [editor] })
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
      VALUES($1,$2,$3,'fixture-org','fixture-project',1,'fixture-model','USD',10,100,20,'fixture-proof',
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
  assert.deepEqual(empty.json<FounderBuildDestination>(), { revision: 1, binding: null, export: null, returns: [] })
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
