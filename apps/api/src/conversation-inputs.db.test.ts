// INC03-CC-002 S01b (A49, 0095) over HTTP: the real buildApp, synthetic HS256 tokens through the real verifier, and a
// disposable PostgreSQL. A writer's message is kept once with a metadata-only input record and nothing follows from it.
// Every grant, runtime and route is synthetic; no model, provider or native call is made. Not covered: routing,
// assessment, mentions, reply targets, selections, personal or voice inputs, the composer, any funded answer or work.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import { atomicAdmissionInstalled, createPool } from '@sophia/persistence'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const ROUTE = 'route-inputs-http-test'
const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })

const token = (sub: string, meta?: Record<string, string>) =>
  new SignJWT({
    role: 'authenticated',
    email: `${sub.slice(0, 6)}@example.test`,
    ...(meta ? { user_metadata: meta } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type Json = any

let db: TestDatabase
let pool: pg.Pool
let ownerPool: pg.Pool

const servers: Record<'on' | 'conversationsOnly' | 'off', { app: FastifyInstance; base: string }> = Object.create(null)

async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}

async function call(
  path: string,
  init: { as?: string; meta?: Record<string, string>; body?: unknown; key?: string; at?: string; get?: boolean } = {},
): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${init.at ?? servers.on.base}${path}`, {
    method: init.get ? 'GET' : 'POST',
    headers: {
      ...(init.as ? { authorization: `Bearer ${await token(init.as, init.meta)}` } : {}),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.key ? { 'idempotency-key': init.key } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

async function owner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await ownerPool.query<T>(sql, params)).rows
}

interface Project {
  projectId: string
  admin: string
  editor: string
  viewer: string
}

/** Conversations on; funded (default): a ready runtime and a current grant naming the editor, so legacy Ask admits. */
async function project(funded = true): Promise<Project> {
  const p = { admin: randomUUID(), editor: randomUUID(), viewer: randomUUID() }
  const { projectId } = await seedProject(db.ownerUrl, { admin: p.admin, editors: [p.editor], viewers: [p.viewer] })
  await owner("SELECT sophia.set_conversation_settings($1,'enabled','inc03-cc-002-s01b-test')", [projectId])
  if (funded) await fund(projectId, p.admin, p.editor)
  return { projectId, ...p }
}

async function fund(projectId: string, admin: string, editor: string): Promise<void> {
  const rt = await registerRuntime(db.ownerUrl, { projectId, admin, runtimeUnitId: 'sophia-runtime-test' })
  const hash = createHash('sha256').update(rt.token).digest()
  const bridge = randomUUID()
  const runtime = (op: string, body: unknown) =>
    pool.query(`SELECT sophia.runtime_${op}($1,$2,$3,$4::jsonb) AS v`, [hash, rt.runtimeUnitId, bridge, body])
  await runtime('hello', {
    protocolVersion: 1,
    roles: [{ id: 'sophia-conversation-v1', route: ROUTE, presetDigest: 'x' }],
  })
  await runtime('record_ready', { state: 'ready', reason: null, unrecovered: [] })
  await owner('SELECT sophia.conversation_new_lineage($1,$2::jsonb)', [
    projectId,
    {
      unit: 'calls_tokens',
      routeId: ROUTE,
      credentialRef: 'synthetic-credential-ref',
      ownerResourceRef: 'synthetic-owner-resource-ref',
      approvalRef: `inc03-cc-002-s01b-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      maxCallsPerReply: 2,
      totalCallCap: 10,
      replyTokenCap: 100_000,
      totalTokenCap: 500_000,
      subjects: [editor],
    },
  ])
}

const startInput = (p: string, body: unknown, as: string, key: string = randomUUID(), meta?: Record<string, string>) =>
  call(`/api/v1/projects/${p}/conversation-inputs`, { as, key, body, ...(meta ? { meta } : {}) })
const sendInput = (c: string, body: unknown, as: string, key: string = randomUUID()) =>
  call(`/api/v1/conversations/${c}/inputs`, { as, key, body })
const legacyStart = (p: string, body: unknown, as: string, key: string = randomUUID()) =>
  call(`/api/v1/projects/${p}/conversations`, { as, key, body })
const legacySend = (c: string, body: unknown, as: string, key: string = randomUUID()) =>
  call(`/api/v1/conversations/${c}/messages`, { as, key, body })
const auto = { interactionContract: 'automatic_v1' } as const

/** Every table an Ask, a reply, attention, a mention, a reservation or a dispatch writes for the project. */
const EFFECT_TABLES = [
  'conversation_replies',
  'conversation_reply_allowances',
  'conversation_reply_answers',
  'conversation_reply_contexts',
  'conversation_reply_messages',
  'conversation_reply_sources',
  'conversation_reply_suppressions',
  'conversation_reservations',
  'work_attempts',
  'execution_bindings',
  'commands',
  'outbox',
  'coordination_outbox',
  'runtime_commands',
  'contribution_mentions',
  'viewer_attention',
  'api_contribution_reservations',
  'owner_runner_reservations',
  'research_reservations',
] as const

async function effects(projectId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of EFFECT_TABLES) {
    const [row] = await owner<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.${table} WHERE project_id=$1`, [
      projectId,
    ])
    counts[table] = row?.n ?? -1
  }
  return counts
}

/** Messages, requests, inputs and events written for the project. */
interface Written {
  messages: number
  requests: number
  inputs: number
  events: number
}

/** The only row a query answers. */
function only<T>(rows: T[]): T {
  const [row] = rows
  assert.ok(row !== undefined && rows.length === 1)
  return row
}

async function written(projectId: string): Promise<Written> {
  const [row] = await owner<Written>(
    `SELECT (SELECT count(*)::int FROM sophia.conversation_messages WHERE project_id=$1) AS messages,
       (SELECT count(*)::int FROM sophia.conversation_requests WHERE project_id=$1) AS requests,
       (SELECT count(*)::int FROM sophia.saved_conversation_inputs WHERE project_id=$1) AS inputs,
       (SELECT count(*)::int FROM sophia.project_events WHERE project_id=$1) AS events`,
    [projectId],
  )
  assert.ok(row)
  return row
}

async function inputRow(inputId: string): Promise<Record<string, unknown>> {
  const [row] = await owner<{ row: Record<string, unknown> }>(
    'SELECT to_jsonb(i) AS row FROM sophia.saved_conversation_inputs i WHERE id=$1',
    [inputId],
  )
  assert.ok(row)
  return row.row
}

const INPUT_KEYS = ['contractVersion', 'effect', 'id', 'interactionContract', 'state']
/** Internals no response may carry: digests, semantics, settings, roles, keys or the contract's legacy selector. */
const HIDDEN = [
  'textSha256',
  'titleSha256',
  'semantic',
  'settings',
  'writer_role',
  'writerRole',
  'idempotency',
  'askSophia',
]

/** The main database with 0095, its logins and three apps; made after the 0095-less suite has dropped its own. */
async function setUp(): Promise<void> {
  db = await createTestDatabase(undefined, { assembler: true })
  pool = createPool(db.apiUrl, { max: 8 })
  ownerPool = new pg.Pool({ connectionString: db.ownerUrl, max: 3 })
  for (const [name, deps] of [
    ['on', { conversations: true, conversationInputs: true }],
    ['conversationsOnly', { conversations: true }],
    ['off', {}],
  ] as const) {
    const app = buildApp({ pool, verifyActor, ...deps })
    servers[name] = { app, base: await listen(app) }
  }
}
async function tearDown(): Promise<void> {
  for (const s of Object.values(servers)) await s.app.close()
  await pool.end()
  await ownerPool.end()
  await db.drop()
}

// Runs first, with a database of its own dropped when it ends: 0070 installs the cluster-wide assembler role only while
// no other database holds that role's grants or logins, so the two databases never exist at once.
describe('A49 over HTTP on a database without 0095', () => {
  let bare: TestDatabase
  let barePool: pg.Pool
  let dir = ''
  const bareServers: { on: string; conversationsOnly: string; apps: FastifyInstance[] } = {
    on: '',
    conversationsOnly: '',
    apps: [],
  }

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'sophia-no-0095-'))
    const migrations = resolve('db/migrations')
    for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql') && n < '0095'))
      symlinkSync(join(migrations, f), join(dir, f))
    bare = await createTestDatabase(dir, { assembler: false })
    barePool = createPool(bare.apiUrl, { max: 2 })
    const on = buildApp({ pool: barePool, verifyActor, conversations: true, conversationInputs: true })
    const old = buildApp({ pool: barePool, verifyActor, conversations: true })
    bareServers.apps.push(on, old)
    bareServers.on = await listen(on)
    bareServers.conversationsOnly = await listen(old)
  })
  after(async () => {
    for (const a of bareServers.apps) await a.close()
    await barePool.end()
    await bare.drop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('the routes answer projection_unavailable (503) without any database message; /ready says schema', async () => {
    const admin = randomUUID()
    const { projectId } = await seedProject(bare.ownerUrl, { admin })
    const r = await call(`/api/v1/projects/${projectId}/conversation-inputs`, {
      at: bareServers.on,
      as: admin,
      key: randomUUID(),
      body: { ...auto, title: 't', text: 'x' },
    })
    assert.equal(r.status, 503)
    assert.equal(r.json.code, 'projection_unavailable')
    assert.ok(!/sophia\.|to_regprocedure|function/i.test(JSON.stringify(r.json)))
    const s = await call(`/api/v1/conversations/${randomUUID()}/inputs`, {
      at: bareServers.on,
      as: admin,
      key: randomUUID(),
      body: { ...auto, text: 'x' },
    })
    assert.equal(s.status, 503)
    const ready = await call('/ready', { at: bareServers.on, get: true })
    assert.deepEqual([ready.status, ready.json], [503, { ready: false, reason: 'schema' }])
    const old = await call('/ready', { at: bareServers.conversationsOnly, get: true })
    // INC04-S02a coherent: this database also lacks 0105, which every API requires whatever its switches say; that
    // conversations alone need nothing of 0095 is shown below, on a database with the whole core.
    assert.deepEqual(
      [old.status, old.json],
      [503, { ready: false, reason: 'schema' }],
      'conversations alone: not ready without the core atomic admission (0105)',
    )
  })
})

// Its own database, made and dropped before the main suite (0070's cluster-wide assembler role, as above): every
// migration installed, then ONE 0095 writer hidden by a committed, reversible rename. A SYNTHETIC missing capability,
// never a claim that 0095 was absent: the function object, its ACL and its body are kept and restored.
describe('A49 readiness on a database with the whole core and one 0095 writer SYNTHETICALLY hidden', () => {
  const WRITER = 'start_conversation_input(uuid,text,text,text,text,text)'
  const HIDDEN_WRITER = 'start_conversation_input__hidden_synthetic'
  let full: TestDatabase
  let fullPool: pg.Pool
  let fullOwner: pg.Pool
  const apps: Record<'on' | 'conversationsOnly' | 'off', string> = Object.create(null)
  const opened: FastifyInstance[] = []

  before(async () => {
    full = await createTestDatabase(undefined, { assembler: false })
    fullPool = createPool(full.apiUrl, { max: 2 })
    fullOwner = new pg.Pool({ connectionString: full.ownerUrl, max: 1 })
    for (const [name, deps] of [
      ['on', { conversations: true, conversationInputs: true }],
      ['conversationsOnly', { conversations: true }],
      ['off', {}],
    ] as const) {
      const app = buildApp({ pool: fullPool, verifyActor, ...deps })
      opened.push(app)
      apps[name] = await listen(app)
    }
  })
  after(async () => {
    for (const a of opened) await a.close()
    await fullPool.end()
    await fullOwner.end()
    await full.drop()
  })

  const readyAt = async (at: string) => (await call('/ready', { at, get: true })).status
  const identity = async (signature: string) =>
    (
      await fullOwner.query<{ oid: string; acl: string | null; src: string; definer: boolean }>(
        `SELECT p.oid::text AS oid, p.proacl::text AS acl, p.prosrc AS src, p.prosecdef AS definer
           FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure($1)`,
        [signature],
      )
    ).rows[0]

  it('is ready with inputs off, alone or with conversations, and not with inputs on; restored, all are ready', async () => {
    assert.equal(await atomicAdmissionInstalled(fullPool), true, 'the core atomic admission is installed')
    assert.deepEqual(
      [await readyAt(apps.on), await readyAt(apps.conversationsOnly), await readyAt(apps.off)],
      [200, 200, 200],
    )
    const original = await identity(`sophia.${WRITER}`)
    assert.ok(original)
    await fullOwner.query(`ALTER FUNCTION sophia.${WRITER} RENAME TO ${HIDDEN_WRITER}`)
    try {
      assert.deepEqual(
        await identity(`sophia.${HIDDEN_WRITER}(uuid,text,text,text,text,text)`),
        original,
        'the same object',
      )
      assert.equal(await atomicAdmissionInstalled(fullPool), true, 'the core is untouched')
      assert.equal(await readyAt(apps.conversationsOnly), 200, 'conversations alone require nothing of 0095')
      assert.equal(await readyAt(apps.off), 200, 'off: nothing of 0095')
      const on = await call('/ready', { at: apps.on, get: true })
      assert.deepEqual([on.status, on.json], [503, { ready: false, reason: 'schema' }], 'inputs on: not ready')
    } finally {
      await fullOwner.query(
        `ALTER FUNCTION sophia.${HIDDEN_WRITER}(uuid,text,text,text,text,text) RENAME TO start_conversation_input`,
      )
    }
    assert.deepEqual(await identity(`sophia.${WRITER}`), original, 'restored: the same object, ACL and body')
    assert.deepEqual(
      [await readyAt(apps.on), await readyAt(apps.conversationsOnly), await readyAt(apps.off)],
      [200, 200, 200],
    )
  })
})

describe('A49 over HTTP with 0095', () => {
  before(setUp)
  after(tearDown)

  describe('A49 over HTTP: an automatic_v1 input is recorded, with no effect', () => {
    it('start: 202 with the legacy DTOs read back under the writer, the body kept once and metadata only', async () => {
      const p = await project(false)
      const was = await written(p.projectId)
      const text = `Opening words ${randomUUID()}`
      const r = await startInput(p.projectId, { ...auto, title: 'Inputs', text }, p.editor, randomUUID(), {
        full_name: 'Elena Ruiz',
      })
      assert.equal(r.status, 202, JSON.stringify(r.json))
      assert.deepEqual(Object.keys(r.json).toSorted(), ['conversation', 'cursor', 'input', 'message'])
      assert.deepEqual(Object.keys(r.json.input).toSorted(), INPUT_KEYS)
      assert.deepEqual(
        { ...r.json.input, id: 'x' },
        { id: 'x', interactionContract: 'automatic_v1', contractVersion: 1, state: 'recorded', effect: 'none' },
      )
      assert.equal(r.json.message.text, text)
      assert.equal(r.json.message.actorId, p.editor)
      assert.equal(r.json.message.name, 'Elena Ruiz')
      assert.equal(r.json.message.author, 'member')
      assert.equal(r.json.message.ask, null)
      assert.equal(r.json.conversation.title, 'Inputs')
      const { position } = only(
        await owner<{ position: string }>('SELECT event_sequence::text AS position FROM sophia.projects WHERE id=$1', [
          p.projectId,
        ]),
      )
      assert.equal(r.json.cursor, position)
      for (const word of HIDDEN) assert.ok(!JSON.stringify(r.json).includes(word), word)
      const now = await written(p.projectId)
      assert.deepEqual(
        {
          messages: now.messages - was.messages,
          requests: now.requests - was.requests,
          inputs: now.inputs - was.inputs,
        },
        { messages: 1, requests: 1, inputs: 1 },
      )
      // The words are kept once, in the conversation's own message store, and nowhere in the input record.
      const { n } = only(
        await owner<{ n: number }>('SELECT count(*)::int AS n FROM sophia.conversation_messages WHERE body=$1', [text]),
      )
      assert.equal(n, 1)
      const row = await inputRow(r.json.input.id)
      assert.ok(!JSON.stringify(row).includes(text) && !JSON.stringify(row).includes('Inputs'))
      assert.deepEqual(
        {
          message_id: row.message_id,
          conversation_id: row.conversation_id,
          actor_id: row.actor_id,
          operation: row.operation,
          interaction_contract: row.interaction_contract,
          origin: row.origin,
          audience_kind: row.audience_kind,
          writer_role: row.writer_role,
          structured_mentions: row.structured_mentions,
          reply_target: row.reply_target,
          addressing_basis: row.addressing_basis,
          state: row.state,
          message_seq: row.message_seq,
        },
        {
          message_id: r.json.message.id,
          conversation_id: r.json.conversation.id,
          actor_id: p.editor,
          operation: 'start',
          interaction_contract: 'automatic_v1',
          origin: 'text',
          audience_kind: 'project_members',
          writer_role: 'editor',
          structured_mentions: [],
          reply_target: null,
          addressing_basis: 'none',
          state: 'recorded',
          message_seq: r.json.message.seq,
        },
      )
    })

    it('send: the same key and words replay the original receipt after later messages; nothing is written twice', async () => {
      const p = await project(false)
      const s = await startInput(p.projectId, { ...auto, title: 'Replay', text: 'First.' }, p.editor)
      const conversationId: string = s.json.conversation.id
      const key: string = randomUUID()
      const first = await sendInput(conversationId, { ...auto, text: 'Second.' }, p.editor, key)
      assert.equal(first.status, 202)
      assert.deepEqual(Object.keys(first.json).toSorted(), ['input', 'message'])
      await sendInput(conversationId, { ...auto, text: 'Third.' }, p.admin)
      await legacySend(conversationId, { text: 'Fourth.', askSophia: false }, p.editor)
      const was = await written(p.projectId)
      const replay = await sendInput(conversationId, { ...auto, text: 'Second.' }, p.editor, key)
      assert.equal(replay.status, 202)
      assert.deepEqual(replay.json, first.json)
      assert.deepEqual(await written(p.projectId), was)
      const startReplay = await startInput(p.projectId, { ...auto, title: 'Replay', text: 'First.' }, p.editor, key)
      assert.equal(startReplay.status, 409, 'a start under the send key conflicts')
    })

    it('a start replays its conversation, message and input; the cursor says where the replay is current', async () => {
      const p = await project(false)
      const key: string = randomUUID()
      const body = { ...auto, title: 'Start replay', text: 'Words.' }
      const first = await startInput(p.projectId, body, p.editor, key)
      await startInput(p.projectId, { ...auto, title: 'Other', text: 'Later.' }, p.editor)
      const replay = await startInput(p.projectId, body, p.editor, key)
      assert.equal(replay.status, 202)
      assert.deepEqual(
        { conversation: replay.json.conversation.id, message: replay.json.message, input: replay.json.input },
        { conversation: first.json.conversation.id, message: first.json.message, input: first.json.input },
      )
      assert.ok(BigInt(replay.json.cursor) > BigInt(first.json.cursor))
    })

    it('another request under a used key conflicts and writes nothing: words, title, operation, legacy in either direction', async () => {
      const p = await project(false)
      const key: string = randomUUID()
      const s = await startInput(p.projectId, { ...auto, title: 'Keys', text: 'Words.' }, p.editor, key)
      const conversationId: string = s.json.conversation.id
      const sendKey = randomUUID()
      await sendInput(conversationId, { ...auto, text: 'Said.' }, p.editor, sendKey)
      const legacyKey = randomUUID()
      await legacySend(conversationId, { text: 'Legacy.', askSophia: false }, p.editor, legacyKey)
      const was = await written(p.projectId)
      const conflicts = [
        await startInput(p.projectId, { ...auto, title: 'Keys', text: 'Other words.' }, p.editor, key),
        await startInput(p.projectId, { ...auto, title: 'Other title', text: 'Words.' }, p.editor, key),
        await sendInput(conversationId, { ...auto, text: 'Changed.' }, p.editor, sendKey),
        await sendInput(conversationId, { ...auto, text: 'Said.' }, p.editor, key),
        await sendInput(conversationId, { ...auto, text: 'Legacy.' }, p.editor, legacyKey),
        await legacySend(conversationId, { text: 'Said.', askSophia: false }, p.editor, sendKey),
        await legacyStart(p.projectId, { title: 'Keys', text: 'Words.', askSophia: false }, p.editor, key),
      ]
      for (const [i, c] of conflicts.entries()) {
        assert.equal(c.status, 409, `conflict ${String(i)}`)
        assert.equal(c.json.code, 'idempotency_conflict', `conflict ${String(i)}`)
      }
      assert.deepEqual(await written(p.projectId), was)
    })

    it('concurrent requests under one key: the same words give one message and one receipt; other words conflict', async () => {
      const p = await project(false)
      const s = await startInput(p.projectId, { ...auto, title: 'Race', text: 'Go.' }, p.editor)
      const conversationId: string = s.json.conversation.id
      const was = await written(p.projectId)
      const key: string = randomUUID()
      const same = await Promise.all(
        [1, 2, 3].map(() => sendInput(conversationId, { ...auto, text: 'Once.' }, p.editor, key)),
      )
      for (const r of same) assert.equal(r.status, 202)
      assert.deepEqual(same[1]?.json, same[0]?.json)
      assert.deepEqual(same[2]?.json, same[0]?.json)
      const now = await written(p.projectId)
      assert.equal(now.messages - was.messages, 1)
      assert.equal(now.inputs - was.inputs, 1)
      const other = randomUUID()
      const mixed = await Promise.all([
        sendInput(conversationId, { ...auto, text: 'One.' }, p.editor, other),
        sendInput(conversationId, { ...auto, text: 'Two.' }, p.editor, other),
      ])
      assert.deepEqual(
        mixed.map((r) => r.status).toSorted((a, b) => a - b),
        [202, 409],
      )
      assert.equal((await written(p.projectId)).messages - now.messages, 1)
    })
  })

  describe('A49 over HTTP: who may write, and what the request may not say', () => {
    it('viewers, outsiders and members of another project are refused; nothing is written', async () => {
      const p = await project(false)
      const elsewhere = await project(false)
      const s = await startInput(p.projectId, { ...auto, title: 'Members', text: 'Hi.' }, p.editor)
      const conversationId: string = s.json.conversation.id
      const was = await written(p.projectId)
      assert.equal((await startInput(p.projectId, { ...auto, title: 'V', text: 'v' }, p.viewer)).status, 403)
      assert.equal((await sendInput(conversationId, { ...auto, text: 'v' }, p.viewer)).status, 403)
      const outsider = randomUUID()
      assert.equal((await startInput(p.projectId, { ...auto, title: 'O', text: 'o' }, outsider)).status, 403)
      const foreign = await sendInput(conversationId, { ...auto, text: 'o' }, elsewhere.editor)
      assert.ok([403, 422].includes(foreign.status), String(foreign.status))
      assert.ok(!JSON.stringify(foreign.json).includes('Members'))
      assert.equal((await sendInput(conversationId, { ...auto, text: 'n' }, '')).status, 401)
      assert.deepEqual(await written(p.projectId), was)
    })

    it('a writer demoted or removed after writing can neither write nor replay a receipt', async () => {
      const p = await project(false)
      const s = await startInput(p.projectId, { ...auto, title: 'Authority', text: 'Mine.' }, p.editor)
      const conversationId: string = s.json.conversation.id
      const key: string = randomUUID()
      assert.equal((await sendInput(conversationId, { ...auto, text: 'Kept.' }, p.editor, key)).status, 202)
      await owner("UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2", [
        p.projectId,
        p.editor,
      ])
      const demotedReplay = await sendInput(conversationId, { ...auto, text: 'Kept.' }, p.editor, key)
      assert.equal(demotedReplay.status, 403)
      assert.ok(!JSON.stringify(demotedReplay.json).includes('Kept.'))
      assert.equal((await sendInput(conversationId, { ...auto, text: 'New.' }, p.editor)).status, 403)
      await owner("UPDATE sophia.project_members SET role='editor', active=false WHERE project_id=$1 AND actor_id=$2", [
        p.projectId,
        p.editor,
      ])
      // Removed, they no longer see the conversation at all: not_found, as for any non-member, and no receipt.
      const removedReplay = await sendInput(conversationId, { ...auto, text: 'Kept.' }, p.editor, key)
      assert.deepEqual([removedReplay.status, removedReplay.json.code], [422, 'not_found'])
      assert.ok(!JSON.stringify(removedReplay.json).includes('Kept.'))
      const removedLegacy = await legacySend(conversationId, { text: 'Legacy.', askSophia: false }, p.editor)
      assert.deepEqual([removedLegacy.status, removedLegacy.json.code], [422, 'not_found'])
      assert.equal((await startInput(p.projectId, { ...auto, title: 'R', text: 'r' }, p.editor)).status, 403)
    })

    it('every unsupported field, a missing or other contract and a legacy body are refused (422); nothing is written', async () => {
      const p = await project(false)
      const s = await startInput(p.projectId, { ...auto, title: 'Closed', text: 'Hi.' }, p.editor)
      const conversationId: string = s.json.conversation.id
      const was = await written(p.projectId)
      const hints: Record<string, unknown> = {
        askSophia: true,
        actorId: p.admin,
        name: 'Someone Else',
        audience: 'personal',
        origin: 'voice_final',
        mentions: [p.admin],
        replyTo: s.json.message.id,
        selection: { artifact: 'x@v1' },
        context: { trusted: true },
        projectId: p.projectId,
      }
      for (const [field, value] of Object.entries(hints)) {
        const sent = await sendInput(conversationId, { ...auto, text: 'x', [field]: value }, p.editor)
        assert.equal(sent.status, 422, field)
        const started = await startInput(p.projectId, { ...auto, title: 't', text: 'x', [field]: value }, p.editor)
        assert.equal(started.status, 422, field)
      }
      for (const body of [
        { text: 'x' },
        { interactionContract: 'legacy_explicit_ask', text: 'x' },
        { interactionContract: 'automatic', text: 'x' },
        { interactionContract: null, text: 'x' },
        { text: 'x', askSophia: false },
        { ...auto, text: '' },
        { ...auto },
      ])
        assert.equal((await sendInput(conversationId, body, p.editor)).status, 422, JSON.stringify(body))
      assert.equal((await startInput(p.projectId, { ...auto, text: 'no title' }, p.editor)).status, 422)
      assert.equal(
        (
          await call(`/api/v1/conversations/${conversationId}/inputs`, {
            as: p.editor,
            key: '',
            body: { ...auto, text: 'x' },
          })
        ).status,
        422,
      )
      assert.equal((await sendInput(conversationId.toUpperCase(), { ...auto, text: 'x' }, p.editor)).status, 422)
      assert.equal(
        (await startInput(p.projectId.toUpperCase(), { ...auto, title: 't', text: 'x' }, p.editor)).status,
        422,
      )
      assert.deepEqual(await written(p.projectId), was)
    })

    it('names and quotations in the words are words: no recipient, reply or addressing is derived from them', async () => {
      const p = await project(false)
      const text = `@${p.admin} and @sophia, please "stop the job" now.`
      const r = await startInput(p.projectId, { ...auto, title: 'Words', text }, p.editor)
      assert.equal(r.status, 202)
      assert.equal(r.json.message.text, text)
      const row = await inputRow(r.json.input.id)
      assert.deepEqual([row.structured_mentions, row.reply_target, row.addressing_basis], [[], null, 'none'])
    })
  })

  describe('A49 over HTTP: settings, withdrawal and erasure', () => {
    it('read-only settings refuse a new write and still replay a receipt already kept', async () => {
      const p = await project(false)
      const key: string = randomUUID()
      const body = { ...auto, title: 'Read only', text: 'Before.' }
      const first = await startInput(p.projectId, body, p.editor, key)
      await owner("SELECT sophia.set_conversation_settings($1,'read_only','inc03-cc-002-s01b-test')", [p.projectId])
      const refused = await startInput(p.projectId, { ...auto, title: 'After', text: 'After.' }, p.editor)
      assert.equal(refused.status, 403)
      assert.equal(refused.json.code, 'conversations_closed')
      const refusedSend = await sendInput(first.json.conversation.id, { ...auto, text: 'After.' }, p.editor)
      assert.equal(refusedSend.json.code, 'conversations_closed')
      const replay = await startInput(p.projectId, body, p.editor, key)
      assert.equal(replay.status, 202)
      assert.equal(replay.json.input.id, first.json.input.id)
    })

    it('a withdrawn message or an erased conversation is never replayed (409 request_erased); the record keeps ids only', async () => {
      const p = await project(false)
      const startKey = randomUUID()
      const s = await startInput(p.projectId, { ...auto, title: 'Gone', text: 'Started.' }, p.editor, startKey)
      const conversationId: string = s.json.conversation.id
      const key: string = randomUUID()
      const sent = await sendInput(conversationId, { ...auto, text: 'To withdraw.' }, p.editor, key)
      const w = await call(`/api/v1/conversations/${conversationId}/messages/${sent.json.message.id}/withdrawal`, {
        as: p.editor,
        key: randomUUID(),
      })
      assert.equal(w.status, 202)
      const retry = await sendInput(conversationId, { ...auto, text: 'To withdraw.' }, p.editor, key)
      assert.equal(retry.status, 409)
      assert.equal(retry.json.code, 'request_erased')
      assert.ok(!JSON.stringify(retry.json).includes('To withdraw.'))
      const row = await inputRow(sent.json.input.id)
      assert.ok(!JSON.stringify(row).includes('To withdraw.'))
      const e = await call(`/api/v1/conversations/${conversationId}/erasure`, { as: p.admin, key: randomUUID() })
      assert.equal(e.status, 202)
      const erased = await startInput(p.projectId, { ...auto, title: 'Gone', text: 'Started.' }, p.editor, startKey)
      assert.equal(erased.status, 409)
      assert.equal(erased.json.code, 'request_erased')
      const page = await call(`/api/v1/conversations/${conversationId}/messages`, { as: p.viewer, get: true })
      assert.ok(!JSON.stringify(page.json).includes('Started.'))
    })
  })

  describe('A49 over HTTP: no effect, even where a legacy Ask would admit work', () => {
    it('a funded project: legacy askSophia:true admits a reply and work; automatic inputs write none of it', async () => {
      const p = await project(true)
      const legacy = await legacyStart(
        p.projectId,
        { title: 'Funded', text: 'Answer this.', askSophia: true },
        p.editor,
      )
      assert.equal(legacy.status, 202, JSON.stringify(legacy.json))
      assert.equal(legacy.json.sophia, 'asked')
      const admitted = await effects(p.projectId)
      for (const table of ['conversation_replies', 'work_attempts', 'execution_bindings', 'commands', 'outbox'])
        assert.ok((admitted[table] ?? 0) > 0, `legacy Ask admitted ${table}`)
      const eventsWere = (await written(p.projectId)).events
      const s = await startInput(p.projectId, { ...auto, title: 'Funded input', text: 'Answer this.' }, p.editor)
      assert.equal(s.status, 202)
      const sent = await sendInput(s.json.conversation.id, { ...auto, text: '@sophia answer this too.' }, p.editor)
      assert.equal(sent.status, 202)
      const inLegacy = await sendInput(legacy.json.conversation.id, { ...auto, text: 'And here.' }, p.editor)
      assert.equal(inLegacy.status, 202)
      assert.deepEqual(
        await effects(p.projectId),
        admitted,
        'no reply, attempt, binding, command, outbox, attention or reservation',
      )
      const events = await owner<{ summary_code: string }>(
        'SELECT summary_code FROM sophia.project_events WHERE project_id=$1 ORDER BY sequence OFFSET $2',
        [p.projectId, eventsWere],
      )
      assert.deepEqual(
        events.map((e) => e.summary_code),
        ['conversation.started', 'conversation.message_recorded', 'conversation.message_recorded'],
      )
    })

    it('legacy A33 is unchanged: true asks, false is quiet, omitted, null and non-boolean are 422', async () => {
      const p = await project(false)
      const quiet = await legacyStart(p.projectId, { title: 'Legacy', text: 'Quiet.', askSophia: false }, p.editor)
      assert.equal(quiet.status, 202)
      assert.deepEqual([quiet.json.sophia, quiet.json.reply], ['not_asked', null])
      const conversationId: string = quiet.json.conversation.id
      const was = await written(p.projectId)
      for (const body of [
        { text: 'x' },
        { text: 'x', askSophia: null },
        { text: 'x', askSophia: 'true' },
        { text: 'x', askSophia: 1 },
        { text: 'x', askSophia: false, interactionContract: 'automatic_v1' },
        { ...auto, text: 'x' },
      ])
        assert.equal((await legacySend(conversationId, body, p.editor)).status, 422, JSON.stringify(body))
      assert.equal((await legacyStart(p.projectId, { ...auto, title: 't', text: 'x' }, p.editor)).status, 422)
      assert.deepEqual(await written(p.projectId), was)
      const { inputs } = only(
        await owner<{ inputs: number }>(
          'SELECT count(*)::int AS inputs FROM sophia.saved_conversation_inputs WHERE conversation_id=$1',
          [conversationId],
        ),
      )
      assert.equal(inputs, 0, 'a legacy message is never an input')
    })
  })

  describe('A49 over HTTP: off by default, and never pretending to be installed', () => {
    it('without conversationInputs (or with nothing on) no route exists: 404, nothing written', async () => {
      const p = await project(false)
      const was = await written(p.projectId)
      for (const at of [servers.conversationsOnly.base, servers.off.base]) {
        const r = await call(`/api/v1/projects/${p.projectId}/conversation-inputs`, {
          at,
          as: p.editor,
          key: randomUUID(),
          body: { ...auto, title: 't', text: 'x' },
        })
        assert.equal(r.status, 404)
        const s = await call(`/api/v1/conversations/${randomUUID()}/inputs`, {
          at,
          as: p.editor,
          key: randomUUID(),
          body: { ...auto, text: 'x' },
        })
        assert.equal(s.status, 404)
      }
      assert.deepEqual(await written(p.projectId), was)
    })

    it('inputs without conversations is a configuration error, refused when the app is built', () => {
      assert.throws(
        () => buildApp({ pool, verifyActor, conversationInputs: true }),
        /conversationInputs requires conversations/,
      )
      assert.throws(
        () => buildApp({ pool, verifyActor, conversations: false, conversationInputs: true }),
        /conversationInputs requires conversations/,
      )
    })

    it('ready on this database with every switch combination', async () => {
      for (const s of Object.values(servers)) {
        const r = await call('/ready', { at: s.base, get: true })
        assert.equal(r.status, 200, JSON.stringify(r.json))
      }
    })
  })
})
