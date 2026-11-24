// DEP-R07/R09: addressed rollback replays existing receipts only, under current authority and the original semantic.
// Real PostgreSQL exercises 0133; no model, provider, dispatch, public service or protected SQL test is used.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, it } from 'node:test'
import { SignJWT } from 'jose'
import pg from 'pg'
import type {
  AddressedConversationInputStart,
  ConversationInputStarted,
  ConversationInputRecorded,
} from '@sophia/contracts'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const issuer = 'https://replay.synthetic.test/auth/v1'
const secret = randomBytes(40).toString('hex')
const actor = randomUUID()
let tokenName = 'Original synthetic name'
let database: TestDatabase
let pool: pg.Pool
let owner: pg.Pool
let projectId: string
const servers: ReturnType<typeof buildApp>[] = []
const token = (id = actor) =>
  new SignJWT({
    role: 'authenticated',
    is_anonymous: false,
    name: tokenName,
    email: 'synthetic@example.invalid',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setSubject(id)
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))
const body: AddressedConversationInputStart = {
  interactionContract: 'automatic_v1',
  addressingVersion: 1,
  title: 'Synthetic replay question',
  text: 'Synthetic message',
  mentions: [],
}

function server(mode: boolean | 'replay', observe = false) {
  const app = buildApp({
    pool,
    verifyActor: createActorVerifier({ issuer, audience: 'authenticated', secret }),
    conversations: true,
    conversationInputs: true,
    conversationInputAddressing: mode,
    conversationInputObservation: observe,
  })
  servers.push(app)
  return app
}

before(async () => {
  const base = resolve('db/migrations')
  const migrations = await mkdtemp(join(tmpdir(), 'sophia-pre-replay-'))
  try {
    for (const name of await readdir(base)) {
      if (name.endsWith('.sql') && name !== replayMigration) await symlink(join(base, name), join(migrations, name))
    }
    database = await createTestDatabase(migrations, { assembler: false })
  } finally {
    await rm(migrations, { recursive: true, force: true })
  }
  pool = createPool(database.apiUrl)
  owner = new pg.Pool({ connectionString: database.ownerUrl })
  projectId = (await seedProject(database.ownerUrl, { admin: actor })).projectId
  await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','Replay fixture')", [projectId])
})
after(async () => {
  for (const app of servers) await app.close()
  await pool?.end()
  await owner?.end()
  await database?.drop()
})

const replayMigration = '0133_saved_input_addressed_replay.sql'
const installReplay = () => owner.query(readFileSync(join('db/migrations', replayMigration), 'utf8'))

const startUrl = () => `/api/v1/projects/${projectId}/conversation-inputs/addressed`
const sendUrl = (id: string) => `/api/v1/conversations/${id}/inputs/addressed`
async function post(app: ReturnType<typeof server>, url: string, payload: object, key: string, id = actor) {
  return app.inject({
    method: 'POST',
    url,
    payload,
    headers: { authorization: 'Bearer ' + (await token(id)), 'idempotency-key': key },
  })
}

async function recorded() {
  tokenName = 'Original synthetic name'
  const on = server(true)
  const key = randomUUID()
  const start = await post(on, startUrl(), body, key)
  assert.equal(start.statusCode, 202, start.body)
  const receipt = start.json<ConversationInputStarted>()
  const sendKey = randomUUID()
  const sendBody = {
    interactionContract: 'automatic_v1',
    addressingVersion: 1,
    text: 'Synthetic reply',
    mentions: [],
    replyToMessageId: receipt.message.id,
  }
  const sent = await post(on, sendUrl(receipt.conversation.id), sendBody, sendKey)
  assert.equal(sent.statusCode, 202, sent.body)
  return { key, receipt, sendKey, sendBody, sent: sent.json<ConversationInputRecorded>() }
}

const tables = [
  'conversations',
  'conversation_messages',
  'conversation_requests',
  'saved_conversation_inputs',
  'saved_conversation_input_addressing',
  'saved_conversation_input_observations',
  'actor_profiles',
  'actor_profile_writes',
  'room_names',
  'outbox',
]
async function counts() {
  const result: Record<string, string> = {}
  for (const table of tables) {
    const { rows } = await owner.query<{ count: string }>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text AS count FROM sophia.${table} t`,
    )
    result[table] = rows[0]?.count ?? ''
  }
  return result
}

it('replay returns exact prior start/send receipts, never retries their missing observations, and rejects new keys without effects', async () => {
  const f = await recorded(),
    replay = server('replay', true)
  // Capture the start receipt before installing 0133 and at the same projection revision as its replay.
  const original = await post(server(true), startUrl(), body, f.key)
  assert.equal(original.statusCode, 202, original.body)
  const beforeCounts = await counts()
  const beforeInstall = server('replay')
  assert.equal((await beforeInstall.inject('/ready')).statusCode, 503)
  assert.equal((await post(beforeInstall, startUrl(), body, f.key)).statusCode, 503)
  await installReplay()
  tokenName = 'Replay must not rename'
  assert.equal((await replay.inject('/ready')).statusCode, 200)
  assert.deepEqual((await post(replay, startUrl(), body, f.key)).json(), original.json())
  assert.deepEqual((await post(replay, sendUrl(f.receipt.conversation.id), f.sendBody, f.sendKey)).json(), f.sent)
  for (const [url, payload] of [
    [startUrl(), body],
    [sendUrl(f.receipt.conversation.id), f.sendBody],
  ] as const) {
    const fresh = await post(replay, url, payload, randomUUID())
    assert.equal(fresh.statusCode, 503, fresh.body)
    assert.equal(fresh.json<{ code: string }>().code, 'outcome_unknown')
    assert.equal(fresh.json<{ retry: string }>().retry, 'same_admission_key')
  }
  assert.deepEqual(await counts(), beforeCounts)
  assert.equal(
    (
      await post(
        replay,
        `/api/v1/projects/${projectId}/conversation-inputs`,
        { interactionContract: 'automatic_v1', title: 'Do not create', text: 'No legacy fallback' },
        randomUUID(),
      )
    ).statusCode,
    404,
  )
})

it('current authority, mismatched semantics and erased requests remain definitive refusals before the replay guard', async () => {
  const f = await recorded(),
    replay = server('replay')
  const mismatch = await post(replay, startUrl(), { ...body, text: 'Different semantic' }, f.key)
  assert.equal(mismatch.statusCode, 409)
  assert.equal(mismatch.json<{ code: string }>().code, 'idempotency_conflict')
  const outsider = await post(replay, startUrl(), body, f.key, randomUUID())
  assert.equal(outsider.statusCode, 403)
  const erased = await post(
    server(true),
    `/api/v1/conversations/${f.receipt.conversation.id}/erasure`,
    {},
    randomUUID(),
  )
  assert.equal(erased.statusCode, 202, erased.body)
  assert.notEqual((await post(replay, startUrl(), body, f.key)).statusCode, 202)
  assert.notEqual((await post(replay, sendUrl(f.receipt.conversation.id), f.sendBody, f.sendKey)).statusCode, 202)
})

it('normal addressed and legacy writers are unchanged and a pooled replay guard cannot leak into their transactions', async () => {
  const f = await recorded(),
    replay = server('replay')
  assert.equal((await post(replay, startUrl(), body, randomUUID())).statusCode, 503)
  assert.equal((await post(server(true), startUrl(), body, randomUUID())).statusCode, 202)
  const legacy = await post(
    replay,
    `/api/v1/projects/${projectId}/conversations`,
    { title: 'Legacy remains available', text: 'Synthetic legacy message', askSophia: false },
    randomUUID(),
  )
  assert.equal(legacy.statusCode, 202, legacy.body)
  assert.equal((await post(server(false), sendUrl(f.receipt.conversation.id), f.sendBody, f.sendKey)).statusCode, 404)
})

it('without the sentinel replay fails closed even when the older unguarded 0128 writers are installed', async () => {
  const old = readFileSync('db/migrations/0128_saved_input_artifact_context.sql', 'utf8')
  const start = old.indexOf('CREATE FUNCTION sophia.start_conversation_addressed_input(')
  const end = old.indexOf('CREATE OR REPLACE FUNCTION sophia.start_conversation_addressed_input(')
  const unguarded = old.slice(start, end).replaceAll('CREATE FUNCTION sophia.', 'CREATE OR REPLACE FUNCTION sophia.')
  try {
    await owner.query('DROP FUNCTION sophia.addressed_input_replay_installed()')
    await owner.query(unguarded)
    const replay = server('replay'),
      beforeCounts = await counts()
    assert.equal((await replay.inject('/ready')).statusCode, 503)
    const answer = await post(replay, startUrl(), body, randomUUID())
    assert.equal(answer.statusCode, 503)
    assert.equal(answer.json<{ code: string }>().code, 'projection_unavailable')
    assert.deepEqual(await counts(), beforeCounts)
    assert.equal((await post(server(true), startUrl(), body, randomUUID())).statusCode, 202)
  } finally {
    await installReplay()
  }
})

it('replay preserves exact artifact reads and attached prior receipts without a first observer write', async () => {
  const artifactId = randomUUID(),
    versionId = randomUUID()
  await owner.query(
    "INSERT INTO sophia.artifacts(project_id,id,title,format) VALUES($1,$2,'Replay artifact','markdown')",
    [projectId, artifactId],
  )
  await owner.query(
    `INSERT INTO sophia.artifact_versions(project_id,id,artifact_id,source_id,source_hash,goal_id,goal_revision,authority_epoch,state,version_number)
    SELECT $1,$2,$3,(s).id,(s).sha256,g.id,1,1,'stable',1
    FROM (SELECT sophia.put_text_source($1,$4,'text/markdown','# Replay fixture') AS s) src
    CROSS JOIN LATERAL (SELECT id FROM sophia.goals WHERE project_id=$1 ORDER BY created_at LIMIT 1) g`,
    [projectId, versionId, artifactId, actor],
  )
  await owner.query('UPDATE sophia.artifacts SET stable_version_id=$2 WHERE id=$1', [artifactId, versionId])
  const payload = { ...body, artifactVersionId: versionId },
    key = randomUUID()
  const original = await post(server(true), startUrl(), payload, key)
  assert.equal(original.statusCode, 202, original.body)
  const replay = server('replay', true),
    beforeCounts = await counts()
  const read = await replay.inject({
    url: `/api/v1/projects/${projectId}/conversation-artifact-versions/${versionId}`,
    headers: { authorization: 'Bearer ' + (await token()) },
  })
  assert.equal(read.statusCode, 200, read.body)
  assert.equal(read.json<{ versionId: string }>().versionId, versionId)
  assert.deepEqual((await post(replay, startUrl(), payload, key)).json(), original.json())
  assert.equal((await post(replay, startUrl(), payload, randomUUID())).statusCode, 503)
  assert.deepEqual(await counts(), beforeCounts)
})
