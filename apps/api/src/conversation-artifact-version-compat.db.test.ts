import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { it } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import type { AddressedConversationInputStart } from '@sophia/contracts'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const issuer = 'https://synthetic.supabase.test/auth/v1'
const secret = randomBytes(40).toString('hex')
const editor = randomUUID()
const editorToken = () =>
  new SignJWT({ role: 'authenticated', is_anonymous: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setSubject(editor)
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))

const addressedStart: AddressedConversationInputStart = {
  interactionContract: 'automatic_v1',
  addressingVersion: 1,
  title: 'Older addressed input',
  text: 'The ordinary addressed writer remains available.',
  mentions: [],
}

it('the database before 0128 refuses artifact context and still accepts ordinary addressed inputs', async () => {
  const migrations = await mkdtemp(join(tmpdir(), 'sophia-before-artifacts-'))
  let older: TestDatabase | undefined
  let pool: pg.Pool | undefined
  let server: FastifyInstance | undefined
  try {
    const directory = resolve('db/migrations')
    for (const file of await readdir(directory)) {
      if (file.endsWith('.sql') && file < '0128_saved_input_artifact_context.sql') {
        await symlink(join(directory, file), join(migrations, file))
      }
    }
    older = await createTestDatabase(migrations, { assembler: false })
    pool = createPool(older.apiUrl)
    const { projectId } = await seedProject(older.ownerUrl, { admin: editor })
    const owner = new pg.Client({ connectionString: older.ownerUrl })
    await owner.connect()
    try {
      await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','Older addressed fixture')", [projectId])
    } finally {
      await owner.end()
    }
    server = buildApp({
      pool,
      verifyActor: createActorVerifier({ issuer, audience: 'authenticated', secret }),
      conversations: true,
      conversationInputs: true,
      conversationInputAddressing: true,
      conversationInputObservation: true,
    })
    const headers = { authorization: 'Bearer ' + (await editorToken()), 'idempotency-key': randomUUID() }
    const url = `/api/v1/projects/${projectId}/conversation-inputs/addressed`
    const versionId = randomUUID()
    const unavailable = await server.inject({
      url: `/api/v1/projects/${projectId}/conversation-artifact-versions/${versionId}`,
      headers,
    })
    assert.equal(unavailable.statusCode, 503)
    const attached = await server.inject({
      method: 'POST',
      url,
      headers,
      payload: { ...addressedStart, artifactVersionId: versionId },
    })
    assert.equal(attached.statusCode, 503)
    assert.equal(attached.json<{ code: string }>().code, 'projection_unavailable')
    assert.equal((await server.inject({ method: 'POST', url, headers, payload: addressedStart })).statusCode, 202)
    assert.equal((await server.inject('/ready')).statusCode, 200)
  } finally {
    await server?.close()
    await pool?.end()
    await older?.drop()
    await rm(migrations, { recursive: true, force: true })
  }
})
