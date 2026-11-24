import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'
import { createPool } from '@sophia/persistence'
import { createTestDatabase } from '@sophia/test-support'
import { SignJWT } from 'jose'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

async function oldBuildSchema() {
  const directory = await mkdtemp(join(tmpdir(), 'sx-f13-'))
  try {
    const migrations = 'db/migrations'
    const prior = (await readdir(migrations)).filter((file) => file.endsWith('.sql') && file < '0144_')
    await Promise.all(prior.map((file) => copyFile(join(migrations, file), join(directory, file))))
    return await createTestDatabase(directory, { assembler: false })
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

it('starts A68 on the old database while the A69 verification path remains unavailable', async () => {
  const db = await oldBuildSchema()
  const pool = createPool(db.apiUrl)
  const issuer = 'https://f13-old-schema.fixture.test/auth/v1'
  const secret = 'synthetic-f13-rollout-signing-secret'
  const app = buildApp({
    pool,
    verifyActor: createActorVerifier({ issuer, audience: 'authenticated', secret }),
    founderBuildHandoff: true,
  })
  try {
    assert.equal((await app.inject('/ready')).statusCode, 200)
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject(randomUUID())
      .setExpirationTime('5m')
      .sign(Buffer.from(secret))
    const headers = { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() }
    const base = `/api/v1/projects/${randomUUID()}/explore/sessions/${randomUUID()}/handoff/${randomUUID()}`
    assert.equal((await app.inject({ url: `${base}/destination`, headers })).statusCode, 404)
    const returnId = randomUUID()
    const read = await app.inject({ url: `${base}/verifications?returnId=${returnId}`, headers })
    assert.equal(read.statusCode, 503, read.body)
    const write = await app.inject({
      method: 'POST',
      url: `${base}/verifications`,
      headers,
      payload: {
        expectedRevision: 4,
        returnId,
        kind: 'source_review',
        outcome: 'passed',
        scenario: 'Fixture',
        expected: 'Fixture',
        observed: 'Fixture',
      },
    })
    assert.equal(write.statusCode, 503, write.body)
  } finally {
    await app.close()
    await pool.end()
    await db.drop()
  }
})
