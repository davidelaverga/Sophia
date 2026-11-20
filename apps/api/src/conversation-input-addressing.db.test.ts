import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, it } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import type {
  AddressedConversationInputSend,
  AddressedConversationInputStart,
  ConversationInputRecorded,
  ConversationInputStarted,
} from '@sophia/contracts'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const issuer = 'https://synthetic.supabase.test/auth/v1'
const secret = randomBytes(40).toString('hex')
const editor = randomUUID()
let database: TestDatabase
let apiPool: pg.Pool
let ownerPool: pg.Pool
let app: FastifyInstance
let project: string

before(async () => {
  database = await createTestDatabase(undefined, { assembler: false })
  apiPool = createPool(database.apiUrl)
  ownerPool = new pg.Pool({ connectionString: database.ownerUrl })
  const seeded = await seedProject(database.ownerUrl, { admin: randomUUID(), editors: [editor] })
  project = seeded.projectId
  await ownerPool.query("SELECT sophia.set_conversation_settings($1, 'enabled', 'Addressing fixture')", [project])
  app = buildApp({
    pool: apiPool,
    verifyActor: createActorVerifier({ issuer, audience: 'authenticated', secret }),
    conversations: true,
    conversationInputs: true,
    conversationInputAddressing: true,
  })
})

after(async () => {
  await app?.close()
  await apiPool?.end()
  await ownerPool?.end()
  await database?.drop()
})

it('retains the explicit null reply target accepted by the generated request type', async () => {
  const jwt = await new SignJWT({ role: 'authenticated', is_anonymous: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setSubject(editor)
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))
  const post = (url: string, payload: AddressedConversationInputStart | AddressedConversationInputSend) =>
    app.inject({
      method: 'POST',
      url,
      headers: { authorization: 'Bearer ' + jwt, 'idempotency-key': randomUUID() },
      payload,
    })
  const started = await post('/api/v1/projects/' + project + '/conversation-inputs/addressed', {
    interactionContract: 'automatic_v1',
    addressingVersion: 1,
    title: 'Synthetic saved conversation',
    text: 'Start a saved conversation.',
    mentions: [],
  })
  assert.equal(started.statusCode, 202)
  const conversationId = started.json<ConversationInputStarted>().conversation.id
  const body: AddressedConversationInputSend = {
    interactionContract: 'automatic_v1',
    addressingVersion: 1,
    text: 'Send without selecting a reply target.',
    mentions: [],
    replyToMessageId: null,
  }
  const sent = await post('/api/v1/conversations/' + conversationId + '/inputs/addressed', body)
  assert.equal(sent.statusCode, 202)
  const { input, message } = sent.json<ConversationInputRecorded>()
  assert.deepEqual([input.state, input.effect, message.actorId], ['recorded', 'none', editor])
  const { rows } = await ownerPool.query<{ reply_target: string | null; reply_target_actor_id: string | null }>(
    'SELECT reply_target, reply_target_actor_id FROM sophia.saved_conversation_input_addressing WHERE project_id=$1 AND input_id=$2',
    [project, input.id],
  )
  assert.deepEqual(rows, [{ reply_target: null, reply_target_actor_id: null }])
})
