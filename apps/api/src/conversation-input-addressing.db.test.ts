import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { after, before, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import type {
  AddressedConversationInputSend,
  AddressedConversationInputStart,
  ConversationInputRecorded,
  ConversationInputStarted,
} from '@sophia/contracts'
import {
  createPool,
  readAddressedConversationInput,
  recordAddressedInputObservation,
  withActor,
} from '@sophia/persistence'
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

const tokenOf = (actorId: string) =>
  new SignJWT({ role: 'authenticated', is_anonymous: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setSubject(actorId)
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))
const editorToken = () => tokenOf(editor)

const syntheticTitle = 'Artifact context fixture'

async function artifactVersions(projectId: string) {
  const artifactId = randomUUID()
  await ownerPool.query("INSERT INTO sophia.artifacts(project_id,id,title,format) VALUES($1,$2,$3,'markdown')", [
    projectId,
    artifactId,
    syntheticTitle,
  ])
  const seedVersion = async (number: number, state: string) => {
    const versionId = randomUUID()
    const { rows } = await ownerPool.query<{ source: string }>(
      `INSERT INTO sophia.artifact_versions(project_id,id,artifact_id,source_id,source_hash,goal_id,goal_revision,
        authority_epoch,state,version_number)
       SELECT $1,$2,$3,(s).id,(s).sha256,g.id,1,1,$4,$5
         FROM (SELECT sophia.put_text_source($1,$6,'text/markdown',$7) AS s) src
         CROSS JOIN LATERAL (SELECT id FROM sophia.goals WHERE project_id=$1 ORDER BY created_at LIMIT 1) g
       RETURNING source_id AS source`,
      [projectId, versionId, artifactId, state, number, editor, `# Fixture version ${String(number)}`],
    )
    assert.ok(rows[0])
    return { versionId, sourceId: rows[0].source }
  }
  const first = await seedVersion(1, 'superseded')
  const second = await seedVersion(2, 'stable')
  const candidate = await seedVersion(3, 'candidate')
  await ownerPool.query('UPDATE sophia.artifacts SET stable_version_id=$2 WHERE id=$1', [artifactId, second.versionId])
  return { artifactId, first, second, candidate }
}

function artifactPath(projectId: string, id: string): string {
  return `/api/v1/projects/${projectId}/conversation-artifact-versions/${id}`
}

const addressedStart: AddressedConversationInputStart = {
  interactionContract: 'automatic_v1',
  addressingVersion: 1,
  title: 'Discuss the selected report',
  text: 'How does the selected version explain the result?',
  mentions: [],
}

it('A64 resolves only an exact shared published version and binds it to the start key', async () => {
  const { artifactId, first, second, candidate } = await artifactVersions(project)
  const headers = { authorization: 'Bearer ' + (await editorToken()), 'idempotency-key': randomUUID() }
  const get = (id: string, readHeaders = headers) =>
    app.inject({ url: artifactPath(project, id), headers: readHeaders })
  const visible = await get(first.versionId)
  assert.equal(visible.statusCode, 200)
  assert.deepEqual(visible.json(), { artifactId, versionId: first.versionId, title: syntheticTitle, versionNumber: 1 })
  const missing = await get(candidate.versionId)
  assert.equal(missing.statusCode, 422)
  const outsider = await get(first.versionId, { ...headers, authorization: 'Bearer ' + (await tokenOf(randomUUID())) })
  assert.equal(outsider.statusCode, 422)
  assert.equal(outsider.json<{ code: string }>().code, missing.json<{ code: string }>().code)
  const foreign = await seedProject(database.ownerUrl, { admin: editor })
  const { first: outside } = await artifactVersions(foreign.projectId)
  assert.equal((await get(outside.versionId)).statusCode, 422)

  const post = (payload: AddressedConversationInputStart, writeHeaders = headers) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project}/conversation-inputs/addressed`,
      headers: writeHeaders,
      payload,
    })
  const attached = { ...addressedStart, artifactVersionId: first.versionId }
  const rejected = await post({ ...attached, artifactVersionId: outside.versionId })
  assert.equal(rejected.statusCode, 422)
  const started = await post(attached)
  assert.equal(started.statusCode, 202)
  const receipt = started.json<ConversationInputStarted>()
  assert.deepEqual([receipt.input.state, receipt.input.effect], ['recorded', 'none'])
  assert.deepEqual((await post(attached)).json(), receipt)
  assert.equal((await post({ ...attached, artifactVersionId: second.versionId })).statusCode, 409)
  assert.equal((await post(addressedStart)).statusCode, 409)
  const { rows } = await ownerPool.query(
    'SELECT artifact_version_id FROM sophia.saved_conversation_input_addressing WHERE input_id=$1',
    [receipt.input.id],
  )
  assert.deepEqual(rows, [{ artifact_version_id: first.versionId }])
})

it('A64 keeps an accepted send exact through source withdrawal and fences fresh writes and the old observer', async () => {
  const { first, second } = await artifactVersions(project)
  const auth = 'Bearer ' + (await editorToken())
  const started = await app.inject({
    method: 'POST',
    url: `/api/v1/projects/${project}/conversation-inputs/addressed`,
    headers: { authorization: auth, 'idempotency-key': randomUUID() },
    payload: addressedStart,
  })
  assert.equal(started.statusCode, 202)
  const { conversation, message } = started.json<ConversationInputStarted>()
  const key = randomUUID()
  const payload: AddressedConversationInputSend = {
    interactionContract: 'automatic_v1',
    addressingVersion: 1,
    text: 'Refer to this version.',
    mentions: [],
    replyToMessageId: message.id,
    artifactVersionId: first.versionId,
  }
  const send = (body = payload, id = key) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversation.id}/inputs/addressed`,
      headers: { authorization: auth, 'idempotency-key': id },
      payload: body,
    })
  const reply = await send()
  assert.equal(reply.statusCode, 202)
  const sent = reply.json<ConversationInputRecorded>()
  assert.equal((await send({ ...payload, artifactVersionId: second.versionId })).statusCode, 409)
  assert.equal(
    await withActor(apiPool, editor, 'read', (client) =>
      readAddressedConversationInput(client, project, conversation.id, sent.input.id),
    ),
    null,
  )
  await assert.rejects(
    recordAddressedInputObservation(apiPool, editor, {
      projectId: project,
      conversationId: conversation.id,
      inputId: sent.input.id,
    }),
    /Input unavailable/,
  )
  const ref = () =>
    withActor(
      apiPool,
      editor,
      'read',
      async (client) =>
        (
          await client.query<{ artifact_version_id: string; reply_target: string }>(
            'SELECT artifact_version_id, reply_target FROM sophia.saved_conversation_input_addressing WHERE input_id=$1',
            [sent.input.id],
          )
        ).rows,
    )
  assert.deepEqual(await ref(), [{ artifact_version_id: first.versionId, reply_target: message.id }])

  await ownerPool.query('SELECT sophia.mission_erase_source($1,$2)', [project, first.sourceId])
  assert.deepEqual(await ref(), [])
  assert.equal(
    (await app.inject({ url: artifactPath(project, first.versionId), headers: { authorization: auth } })).statusCode,
    422,
  )
  assert.deepEqual((await send()).json(), sent)
  assert.equal((await send(payload, randomUUID())).statusCode, 422)
  const { rows } = await ownerPool.query(
    `SELECT count(*)::int AS inputs, count(artifact_version_id)::int AS attachments
       FROM sophia.saved_conversation_input_addressing WHERE conversation_id=$1`,
    [conversation.id],
  )
  assert.deepEqual(rows, [{ inputs: 2, attachments: 1 }])
})

it('retains the explicit null reply target accepted by the generated request type', async () => {
  const jwt = await editorToken()
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

const stockStartupMs = 15_000
const stockShutdownMs = 5000
type StockExit = { code: number | null; signal: NodeJS.Signals | null }

function stockServerStartup(child: ChildProcess, mode: string) {
  const closed = new Promise<StockExit>((resolve) => child.once('close', (code, signal) => resolve({ code, signal })))
  const listening = Promise.withResolvers<string>()
  assert.ok(child.stdout)
  createInterface({ input: child.stdout }).on('line', (line) => {
    const url = /Server listening at (http:\/\/127\.0\.0\.1:\d+)/.exec(line)?.[1]
    if (url) listening.resolve(url)
  })
  child.on('error', (error: NodeJS.ErrnoException) => {
    listening.reject(new Error(`Stock API process error (${mode}, ${error.code ?? 'unknown'})`))
  })
  const ready = Promise.race([
    listening.promise,
    closed.then(({ code, signal }) => {
      throw new Error(`Stock API exited before listening (${mode}, code=${String(code)}, signal=${String(signal)})`)
    }),
    delay(stockStartupMs, undefined, { ref: false }).then(() => {
      throw new Error(`Stock API did not start within ${String(stockStartupMs)} ms (${mode})`)
    }),
  ])
  return { closed, ready }
}

async function stopStockServer(child: ChildProcess, closed: Promise<StockExit>, mode: string) {
  const running = () => child.pid !== undefined && child.exitCode === null && child.signalCode === null
  const grace = () => delay(stockShutdownMs, 'timeout', { ref: false })
  if (running()) child.kill('SIGTERM')
  if ((await Promise.race([closed, grace()])) !== 'timeout') return
  if (running()) child.kill('SIGKILL')
  assert.notEqual(await Promise.race([closed, grace()]), 'timeout', `Stock API did not close after SIGKILL (${mode})`)
}

it('the stock server observes only when explicitly configured for observation', async () => {
  const jwt = await editorToken()
  const payload: AddressedConversationInputStart = {
    interactionContract: 'automatic_v1',
    addressingVersion: 1,
    title: 'Synthetic stock entry',
    text: 'What would fit this case?',
    mentions: [],
  }
  const headers = {
    authorization: 'Bearer ' + jwt,
    'content-type': 'application/json',
  }

  for (const [enabled, observe] of [
    [false, false],
    [true, false],
    [true, true],
  ]) {
    const mode = `addressing=${String(enabled)}, observation=${String(observe)}`
    const child = spawn(process.execPath, ['apps/api/src/server.ts'], {
      env: {
        PATH: process.env.PATH ?? '',
        HOST: '127.0.0.1',
        PORT: '0',
        SOPHIA_API_DATABASE_URL: database.apiUrl,
        SUPABASE_JWT_ISSUER: issuer,
        SUPABASE_JWT_SECRET: secret,
        SOPHIA_CONVERSATIONS: 'on',
        ...(enabled ? { SOPHIA_CONVERSATION_INPUT_ADDRESSING: 'on' } : {}),
        ...(observe ? { SOPHIA_CONVERSATION_INPUT_OBSERVATION: 'on' } : {}),
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const { ready, closed } = stockServerStartup(child, mode)
    try {
      const liveUrl = await ready
      assert.equal((await fetch(liveUrl + '/ready', { signal: AbortSignal.timeout(5000) })).status, 200)
      const route = liveUrl + '/api/v1/projects/' + project + '/conversation-inputs/addressed'
      const modeHeaders = { ...headers, 'idempotency-key': randomUUID() }
      const send = () =>
        fetch(route, {
          method: 'POST',
          headers: modeHeaders,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000),
        })
      const result = await send()
      assert.equal(result.status, enabled ? 202 : 404)
      if (enabled) {
        const first = (await result.json()) as ConversationInputStarted
        assert.deepEqual([first.input.state, first.input.effect], ['recorded', 'none'])
        const replay = await send()
        assert.equal(replay.status, 202)
        assert.equal(((await replay.json()) as ConversationInputStarted).input.id, first.input.id)
        const { rows } = await ownerPool.query(
          `SELECT
            EXISTS(SELECT 1 FROM sophia.saved_conversation_input_observations WHERE input_id=$1) AS observed,
            to_regclass('sophia.saved_input_assessment_attempts') IS NOT NULL AS assessment_installed`,
          [first.input.id],
        )
        assert.deepEqual(rows, [{ observed: observe, assessment_installed: false }])
      }
    } finally {
      await stopStockServer(child, closed, mode)
    }
  }
})

it('a blocked send observation preserves the accepted input and the same request can recover it', async () => {
  const observing = buildApp({
    pool: apiPool,
    verifyActor: createActorVerifier({ issuer, audience: 'authenticated', secret }),
    conversations: true,
    conversationInputs: true,
    conversationInputAddressing: true,
    conversationInputObservation: true,
  })
  try {
    const jwt = await editorToken()
    const start = await observing.inject({
      method: 'POST',
      url: '/api/v1/projects/' + project + '/conversation-inputs/addressed',
      headers: { authorization: 'Bearer ' + jwt, 'idempotency-key': randomUUID() },
      payload: {
        interactionContract: 'automatic_v1',
        addressingVersion: 1,
        title: 'Synthetic observer retry',
        text: 'Start a thread.',
        mentions: [],
      } satisfies AddressedConversationInputStart,
    })
    assert.equal(start.statusCode, 202)
    const { conversation } = start.json<ConversationInputStarted>()
    const headers = { authorization: 'Bearer ' + jwt, 'idempotency-key': randomUUID() }
    const send = () =>
      observing.inject({
        method: 'POST',
        url: '/api/v1/conversations/' + conversation.id + '/inputs/addressed',
        headers,
        payload: {
          interactionContract: 'automatic_v1',
          addressingVersion: 1,
          text: 'Record this while the observer is blocked.',
          mentions: [],
          replyToMessageId: null,
        } satisfies AddressedConversationInputSend,
      })
    const owner = await ownerPool.connect()
    let firstId: string
    try {
      await owner.query('BEGIN')
      await owner.query('LOCK TABLE sophia.saved_conversation_input_observations IN ACCESS EXCLUSIVE MODE')
      const first = await send()
      assert.equal(first.statusCode, 202)
      const { input } = first.json<ConversationInputRecorded>()
      assert.deepEqual([input.state, input.effect], ['recorded', 'none'])
      firstId = input.id
    } finally {
      try {
        await owner.query('ROLLBACK')
      } finally {
        owner.release()
      }
    }
    const state = () =>
      ownerPool.query(
        `SELECT
          (SELECT count(*)::int FROM sophia.saved_conversation_inputs WHERE id=$1) AS inputs,
          (SELECT count(*)::int FROM sophia.saved_conversation_input_observations WHERE input_id=$1) AS observations,
          to_regclass('sophia.saved_input_assessment_attempts') IS NOT NULL AS assessment_installed`,
        [firstId],
      )
    assert.deepEqual((await state()).rows, [{ inputs: 1, observations: 0, assessment_installed: false }])
    const replay = await send()
    assert.equal(replay.statusCode, 202)
    assert.equal(replay.json<ConversationInputRecorded>().input.id, firstId)
    assert.deepEqual((await state()).rows, [{ inputs: 1, observations: 1, assessment_installed: false }])
  } finally {
    await observing.close()
  }
})
