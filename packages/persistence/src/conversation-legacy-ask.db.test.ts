// INC03-CC-002 S01a: the legacy explicit-Ask path, characterized so that migration 0095 (automatic inputs) provably
// leaves it as it was. Real API, owner and synthetic assembler logins on a disposable PostgreSQL; every grant, runtime
// and route is synthetic and nothing leaves the database. This file passes with and without 0095 installed:
// - askSophia false writes a message and nothing that asks, and never an input record;
// - askSophia true, with an enabled current grant naming the asker, an admitted assembler and a ready runtime, admits
//   a pending reply with its work attempt, execution binding, create command and native.create outbox row (0071):
//   the real funded path, not a no-effect baseline. It never writes an input record either;
// - askSophia NULL at the SQL boundary is 22023, before anything is written;
// - the six legacy functions 0095 must not touch are byte-identical (definition, ACL, settings) with and without it.
// Not covered: the HTTP boundary (omitted / null / non-boolean askSophia is 422 there); no API file is part of S01a.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import { sendConversationMessage, startConversation } from './conversations.ts'
import { withActor } from './tx.ts'

const MIGRATIONS = new URL('../../../db/migrations/', import.meta.url).pathname
const ROUTE = 'route-legacy-ask-test'
/** The legacy functions 0095 must leave byte for byte. */
const LEGACY_FUNCTIONS = [
  'sophia.start_conversation(uuid,text,text,text,boolean,text)',
  'sophia.send_conversation_message(uuid,text,text,boolean,text)',
  'sophia.conversation_ask(uuid,uuid,sophia.conversation_messages)',
  'sophia.conversation_ask_capability(uuid)',
  'sophia.conversation_prior(uuid,text,text,jsonb)',
  'sophia.conversation_redact(uuid,uuid)',
]

interface World {
  db: TestDatabase
  owner: pg.Pool
  api: pg.Pool
}

async function open(migrations?: string): Promise<World> {
  const db = await createTestDatabase(migrations, { assembler: true })
  return {
    db,
    owner: new pg.Pool({ connectionString: db.ownerUrl, max: 3 }),
    api: new pg.Pool({ connectionString: db.apiUrl, max: 3 }),
  }
}

async function close(w: World): Promise<void> {
  await Promise.all([w.owner.end(), w.api.end()])
  await w.db.drop()
}

/**
 * A project with conversations on, a ready runtime advertising the conversation role and a current grant naming the
 * editor: the configuration in which 0071's conversation_ask admits (as in conversation-ask-capability.db.test.ts;
 * repeated here because test-support is outside this slice's lease).
 */
async function fundedProject(w: World, admin: string, editor: string): Promise<string> {
  const { projectId } = await seedProject(w.db.ownerUrl, { admin, editors: [editor] })
  await w.owner.query("SELECT sophia.set_conversation_settings($1,'enabled','inc03-cc-002-legacy-ask-test')", [
    projectId,
  ])
  const rt = await registerRuntime(w.db.ownerUrl, { projectId, admin, runtimeUnitId: 'sophia-runtime-test' })
  const hash = createHash('sha256').update(rt.token).digest()
  const bridge = randomUUID()
  const call = (op: string, body: unknown) =>
    w.api.query(`SELECT sophia.runtime_${op}($1,$2,$3,$4::jsonb) AS v`, [hash, rt.runtimeUnitId, bridge, body])
  await call('hello', {
    protocolVersion: 1,
    roles: [{ id: 'sophia-conversation-v1', route: ROUTE, presetDigest: 'x' }],
  })
  await call('record_ready', { state: 'ready', reason: null, unrecovered: [] })
  await w.owner.query('SELECT sophia.conversation_new_lineage($1,$2::jsonb)', [
    projectId,
    {
      unit: 'calls_tokens',
      routeId: ROUTE,
      credentialRef: 'synthetic-credential-ref',
      ownerResourceRef: 'synthetic-owner-resource-ref',
      approvalRef: `inc03-cc-002-legacy-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      maxCallsPerReply: 2,
      totalCallCap: 10,
      replyTokenCap: 100_000,
      totalTokenCap: 500_000,
      subjects: [editor],
    },
  ])
  return projectId
}

/** Rows an Ask, a reply or an admission could have written for the project. */
async function footprint(w: World, projectId: string): Promise<Record<string, number>> {
  const { rows } = await w.owner.query<Record<string, number>>(
    `SELECT (SELECT count(*)::int FROM sophia.conversation_replies WHERE project_id=$1) AS replies,
       (SELECT count(*)::int FROM sophia.conversation_replies WHERE project_id=$1 AND state='pending') AS pending,
       (SELECT count(*)::int FROM sophia.work_attempts WHERE project_id=$1) AS attempts,
       (SELECT count(*)::int FROM sophia.execution_bindings WHERE project_id=$1) AS bindings,
       (SELECT count(*)::int FROM sophia.commands WHERE project_id=$1) AS commands,
       (SELECT count(*)::int FROM sophia.outbox WHERE project_id=$1) AS outbox,
       (SELECT count(*)::int FROM sophia.conversation_messages WHERE project_id=$1) AS messages`,
    [projectId],
  )
  const row = rows[0]
  assert.ok(row)
  return row
}

/** Input records for the project; zero where 0095 is not installed (the table does not exist there). */
async function inputs(w: World, projectId: string): Promise<number> {
  const exists = await w.owner.query<{ t: string | null }>(
    "SELECT to_regclass('sophia.saved_conversation_inputs')::text AS t",
  )
  if (exists.rows[0]?.t === null) return 0
  const { rows } = await w.owner.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM sophia.saved_conversation_inputs WHERE project_id=$1',
    [projectId],
  )
  return rows[0]?.n ?? -1
}

/** The SQL error a write was refused with (withActor wraps it in a DomainError whose cause is PostgreSQL's). */
function sqlstate(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined
  const cause = err.cause
  return typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
    ? cause.code
    : undefined
}

/** Definition, ACL and settings of each legacy function. */
async function fingerprints(w: World): Promise<Record<string, string>> {
  const { rows } = await w.owner.query<{ sig: string; fp: string }>(
    `SELECT p.oid::regprocedure::text AS sig,
            md5(pg_get_functiondef(p.oid) || '|' || coalesce(p.proacl::text,'') || '|' || coalesce(p.proconfig::text,'')) AS fp
       FROM pg_proc p WHERE p.oid = ANY($1::regprocedure[]) ORDER BY 1`,
    [LEGACY_FUNCTIONS],
  )
  return Object.fromEntries(rows.map((r) => [r.sig, r.fp]))
}

describe('legacy explicit Ask, on the funded path', () => {
  let w: World
  const A = randomUUID()
  const E = randomUUID()
  before(async () => {
    w = await open()
  })
  after(() => close(w))

  it('askSophia false: a message, nothing that asks, no input record', async () => {
    const projectId = await fundedProject(w, A, E)
    const started = await withActor(w.api, E, 'write', (c) =>
      startConversation(c, projectId, randomUUID(), { title: 'Legacy', text: 'Opening.', askSophia: false }, 'E'),
    )
    assert.deepEqual([started.sophia, started.replyId], ['not_asked', null])
    const sent = await withActor(w.api, E, 'write', (c) =>
      sendConversationMessage(
        c,
        started.conversationId,
        randomUUID(),
        { text: 'Stop the job.', askSophia: false },
        'E',
      ),
    )
    assert.deepEqual([sent.sophia, sent.replyId], ['not_asked', null])
    assert.deepEqual(await footprint(w, projectId), {
      replies: 0,
      pending: 0,
      attempts: 0,
      bindings: 0,
      commands: 0,
      outbox: 0,
      messages: 2,
    })
    assert.equal(await inputs(w, projectId), 0)
  })

  it('askSophia true: a pending reply admitted with its attempt, binding, command and outbox row; no input record', async () => {
    const projectId = await fundedProject(w, A, E)
    const started = await withActor(w.api, E, 'write', (c) =>
      startConversation(
        c,
        projectId,
        randomUUID(),
        { title: 'Legacy', text: 'Explain the plan.', askSophia: true },
        'E',
      ),
    )
    assert.equal(started.sophia, 'asked')
    assert.ok(started.replyId)
    assert.deepEqual(await footprint(w, projectId), {
      replies: 1,
      pending: 1,
      attempts: 1,
      bindings: 1,
      commands: 1,
      outbox: 1,
      messages: 1,
    })
    const outbox = await w.owner.query<{ destination: string }>(
      'SELECT destination FROM sophia.outbox WHERE project_id=$1',
      [projectId],
    )
    assert.deepEqual(
      outbox.rows.map((r) => r.destination),
      ['native.create'],
    )
    assert.equal(await inputs(w, projectId), 0)
  })

  it('askSophia NULL at the SQL boundary is 22023 for start and send, and writes nothing', async () => {
    const projectId = await fundedProject(w, A, E)
    const first = await withActor(w.api, E, 'write', (c) =>
      startConversation(c, projectId, randomUUID(), { title: 'Legacy', text: 'Opening.', askSophia: false }, 'E'),
    )
    const prior = await footprint(w, projectId)
    await assert.rejects(
      withActor(w.api, E, 'write', (c) =>
        c.query('SELECT sophia.start_conversation($1,$2,$3,$4,NULL,$5)', [projectId, randomUUID(), 'T', 'x', 'E']),
      ),
      (err) => sqlstate(err) === '22023',
    )
    await assert.rejects(
      withActor(w.api, E, 'write', (c) =>
        c.query('SELECT sophia.send_conversation_message($1,$2,$3,NULL,$4)', [
          first.conversationId,
          randomUUID(),
          'x',
          'E',
        ]),
      ),
      (err) => sqlstate(err) === '22023',
    )
    assert.deepEqual(await footprint(w, projectId), prior)
    assert.equal(await inputs(w, projectId), 0)
  })
})

/** Fingerprints on a fresh database with these migrations, dropped again (0070's role allows one installation at a time). */
async function fingerprintsOf(migrations?: string): Promise<Record<string, string>> {
  const w = await open(migrations)
  try {
    return await fingerprints(w)
  } finally {
    await close(w)
  }
}

describe('the legacy functions are what they were without 0095', () => {
  it('definitions, ACLs and settings of all six are byte-identical', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sophia-pre-0095-'))
    try {
      for (const file of readdirSync(MIGRATIONS))
        if (file.endsWith('.sql') && file < '0095') copyFileSync(join(MIGRATIONS, file), join(dir, file))
      const withAll = await fingerprintsOf()
      assert.equal(Object.keys(withAll).length, LEGACY_FUNCTIONS.length)
      assert.deepEqual(withAll, await fingerprintsOf(dir))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
