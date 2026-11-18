// Real Fastify contract + role-separated PG. Synthetic fixture qualification only, no real account/native route.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, afterEach, beforeEach, describe, it } from 'node:test'
import { SignJWT } from 'jose'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import {
  parseOwnerRunnerCollection,
  parseOwnerRunnerRetainedResult,
  parseOwnerRunnerWorkPage,
  parseOwnerRunnerWorkLookup,
  parseOwnerRunnerWorkAvailability,
} from '@sophia/contracts/validate'
import {
  resultWorld,
  admitResultOperation,
  retainResult,
  RESULT_TEXT,
  type ResultWorld,
} from '../../../packages/persistence/src/runner-results.db.test.ts'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
const SECRET = 'synthetic-result-db-signing-key-only'
const ISSUER = 'https://result-db.invalid/auth/v1'
const verifier = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
const headers = async (who: string) => ({
  authorization: `Bearer ${await new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(who)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))}`,
  'idempotency-key': randomUUID(),
})

describe('A60 actual API routes, generated client readers and installation guards', () => {
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
  })
  afterEach(async () => {
    const closing = current
    current = undefined
    await closing?.close()
  })
  after(async () => {
    await db.drop()
  })
  it('retained GET survives actions OFF and host/qualification unavailable; teammate cannot read', async () => {
    const op = await admitResultOperation(w)
    const retained = await retainResult(w, op)
    await w.owner.query("UPDATE sophia.owner_hosts SET state='revoked' WHERE journal_id=$1", [w.journal.id])
    await w.owner.query(
      "UPDATE sophia.owner_runner_qualifications SET qualified_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE resource_id=$1",
      [w.resourceId],
    )
    const app = buildApp({
      pool: w.api,
      verifyActor: verifier,
      ownerRunnerResults: false,
      ownerRunnerAdmissions: 'off',
    })
    try {
      const url = `/api/v1/projects/${w.projectId}/runner-results/${retained.descriptor.resultId}`
      const response = await app.inject({ url, headers: await headers(w.who) })
      assert.equal(response.statusCode, 200)
      const read = parseOwnerRunnerRetainedResult(response.json())
      assert.equal(read.text, RESULT_TEXT)
      assert.equal(read.result.acceptedRunId, op.runId)
      const denied = await app.inject({ url, headers: await headers(w.teammate) })
      assert.notEqual(denied.statusCode, 200)
      assert.equal(denied.body.includes(RESULT_TEXT), false)
      const page = await app.inject({
        url: `/api/v1/projects/${w.projectId}/goals/${w.goalId}/native-work`,
        headers: await headers(w.who),
      })
      assert.equal(page.statusCode, 200)
      const parsed = parseOwnerRunnerWorkPage(page.json())
      assert.equal(parsed.operations[0]?.result?.resultId, retained.descriptor.resultId)
      const off = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${w.projectId}/runner-operations/${op.operationId}/results`,
        headers: await headers(w.who),
        payload: { expectedOperationRevision: op.revision, maxPages: 8, maxBytes: 8192 },
      })
      assert.equal(off.statusCode, 403)
    } finally {
      await app.close()
    }
  })
  it('real router admits exact server operation and original-key lookup; rejects browser authority fields', async () => {
    const op = await admitResultOperation(w)
    const app = buildApp({
      pool: w.api,
      verifyActor: verifier,
      ownerRunnerResults: true,
      ownerRunnerAdmissions: 'admit',
    })
    try {
      const url = `/api/v1/projects/${w.projectId}/runner-operations/${op.operationId}/results`
      const h = await headers(w.who)
      const payload = { expectedOperationRevision: op.revision, maxPages: 8, maxBytes: 8192 }
      for (const field of ['actorId', 'ownerId', 'runId', 'threadId', 'itemId', 'body', 'cursor', 'url']) {
        const refused = await app.inject({ method: 'POST', url, headers: h, payload: { ...payload, [field]: w.who } })
        assert.equal(refused.statusCode, 422, field)
      }
      const response = await app.inject({ method: 'POST', url, headers: h, payload })
      assert.equal(response.statusCode, 202)
      const collection = parseOwnerRunnerCollection(response.json())
      const lookup = await app.inject({
        url: `/api/v1/projects/${w.projectId}/goals/${w.goalId}/native-work/lookup?kind=collection&key=${h['idempotency-key']}`,
        headers: h,
      })
      assert.equal(lookup.statusCode, 200)
      const found = parseOwnerRunnerWorkLookup(lookup.json())
      assert.equal(found.collection?.collectionId, collection.collectionId)
      assert.equal(found.absenceProvesNoCommit, false)
      const availability = await app.inject({
        url: `/api/v1/projects/${w.projectId}/goals/${w.goalId}/native-work/availability`,
        headers: h,
      })
      assert.equal(availability.statusCode, 200)
      const route = parseOwnerRunnerWorkAvailability(availability.json())
      assert.equal(route.resultsEnabled, true)
      assert.equal(route.canAdmit, true)
      assert.equal(route.resources[0]?.sourcePolicy.instanceId, 'claudeAgent')
      assert.equal(route.sources[0]?.sourceId, w.sourceId)
      assert.equal(JSON.stringify(route).includes(RESULT_TEXT), false)
    } finally {
      await app.close()
    }
  })
  it('exact schema guard rejects a partial install: enabled ready false, disabled ready compatible, retained GET truthful', async () => {
    const on = buildApp({ pool: w.api, verifyActor: verifier, ownerRunnerResults: true })
    const off = buildApp({ pool: w.api, verifyActor: verifier })
    try {
      assert.equal((await on.inject('/ready')).statusCode, 200)
      await w.owner.query(
        'ALTER TABLE sophia.owner_runner_collections RENAME COLUMN permit TO synthetic_missing_permit',
      )
      assert.equal((await on.inject('/ready')).statusCode, 503)
      assert.equal((await off.inject('/ready')).statusCode, 200)
      const response = await off.inject({
        url: `/api/v1/projects/${w.projectId}/runner-results/${randomUUID()}`,
        headers: await headers(w.who),
      })
      assert.equal(response.statusCode, 503)
      assert.ok(response.body.includes('projection_unavailable'))
    } finally {
      await w.owner.query(
        'ALTER TABLE sophia.owner_runner_collections RENAME COLUMN synthetic_missing_permit TO permit',
      )
      await Promise.all([on.close(), off.close()])
    }
  })
})
