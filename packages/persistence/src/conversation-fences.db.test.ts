// CON-01 G2-S4 (CX-0100/CX-0101 N4: CC-0100 as amended by CC-0101): a reply's answer published under its fences, and a
// source's withdrawal reaching what read it, through the review-only candidate db/candidates/con01-s4-reply-fences.sql,
// applied here after every migration and the S1, S2 and S3 candidates to a disposable database. Level: L1 sql-run on a
// disposable PostgreSQL 16. The owner puts requests in `running` and other states, and calls the entry points: no
// runtime path dispatches or captures yet, and nothing is granted. The answer text is supplied by the test; it is not a
// native result or a provider's. The assembler role and an owner-made test login exist only to record contexts (N2) and
// are removed after the file. Nothing here dispatches, reserves through a runtime, or calls a model.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import pg from 'pg'
import { createConversationCandidateDatabase } from './conversation-candidate-fixture.ts'
import type { MissionProposalRequest } from '@sophia/contracts'
import { seedProject, withClusterMigrationLock, type TestDatabase } from '@sophia/test-support'
import { assembleReply, type AssemblyLimits } from './conversation-assembly.ts'
import {
  createPool,
  decideMissionChange,
  eraseConversation,
  proposeMissionChange,
  sendConversationMessage,
  startConversation,
  withActor,
  withdrawConversationMessage,
} from './index.ts'

const candidate = (name: string) => readFileSync(new URL(`../../../db/candidates/${name}`, import.meta.url), 'utf8')
const BEFORE_N4 = [
  'con01-s1-reply-states.sql',
  'con01-s2-conversation-reply-ledger.sql',
  'con01-s3-conversation-reply-context.sql',
]
const N4 = 'con01-s4-reply-fences.sql'
const ROLE = 'sophia_conversation_assembler'

/** Local test values in a disposable cluster: not live configuration, which stays unbound. */
const LIMITS: AssemblyLimits = {
  leaseMs: 8000,
  deadlineMs: 2500,
  connectMs: 1000,
  statementTimeoutMs: 2000,
  lockTimeoutMs: 1500,
  idleInTransactionMs: 2000,
  connectionCheckMs: 100,
}

const A = randomUUID() // admin; creates every project
const E = randomUUID() // editor who asks
const B = randomUUID() // editor

/** What N4 adds, what it replaces, and the three entry points (none executable but by the owner). */
const ADDED_FUNCTIONS = [
  'sophia.conversation_answer_receipt(sophia.conversation_reply_answers,text)',
  'sophia.conversation_context_digest_erase(uuid,uuid,integer,text)',
  'sophia.conversation_fences_kept()',
  'sophia.conversation_fences_locked(uuid,integer,boolean)',
  'sophia.conversation_fences_recorded(sophia.conversation_replies,integer)',
  'sophia.conversation_fences_text_gone()',
  'sophia.conversation_publish_answer(uuid,integer,uuid,text)',
  'sophia.conversation_refuse_answer(uuid,integer,text)',
  'sophia.conversation_reply_check(uuid,integer)',
  'sophia.conversation_reply_verdict(sophia.conversation_replies,sophia.conversation_reply_contexts)',
  'sophia.conversation_source_out(uuid,uuid)',
]
const REPLACED_FUNCTIONS = ['sophia.conversation_context_kept()']
const ADDED_TABLES = ['conversation_context_erasures', 'conversation_reply_answers', 'conversation_reply_suppressions']
const ADDED_INDEXES = [
  'conversation_context_erasures_pkey',
  'conversation_reply_answers_pkey',
  'conversation_reply_answers_project_id_answer_id_key',
  'conversation_reply_answers_result_ref_key',
  'conversation_reply_suppressions_pkey',
]
const ADDED_TRIGGERS = [
  'conversation_context_erasures_kept on conversation_context_erasures',
  'conversation_fences_tables_kept on conversation_context_erasures',
  'conversation_fences_tables_kept on conversation_reply_answers',
  'conversation_fences_tables_kept on conversation_reply_suppressions',
  'conversation_fences_text_gone on conversation_messages',
  'conversation_reply_answers_kept on conversation_reply_answers',
  'conversation_reply_suppressions_kept on conversation_reply_suppressions',
]
const MIGRATION_ROLES = ['sophia_api', 'sophia_worker']
const TEST_LOGIN = /^sophia_(api|worker)_t_[0-9a-f]{12}$/
/** Rows of the runtime and the model: none is ever written here. */
const UNTOUCHED = [
  'commands',
  'jobs',
  'work_attempts',
  'execution_bindings',
  'outbox',
  'runtime_commands',
  'runtime_receipts',
  'native_observations',
  'usage_records',
]

interface Receipt {
  verdict: string
  replyId: string
  attempt: number
  resultRef: string
  answerId: string
  contextChanged: boolean
  publishedAt: string
  visible: boolean
  withdrawnBy: string | null
  reason?: string
  state?: string
}

interface Scene {
  projectId: string
  conversationId: string
  replyId: string
  askId: string
  earlier: string[]
  constraint: string
}

let db: TestDatabase
let ownerPool: pg.Pool
let api: pg.Pool
let loginUrl: string
let loginRole: string
let rolesBefore: string[]
let assemblerExisted: boolean
let untouchedBefore: Record<string, string>
const adminUrl = process.env.SOPHIA_DISPOSABLE_DATABASE_URL ?? ''

/**
 * The cluster-global assembler role is shared by every file that applies the S3 candidate (N2's and N4's), and node --test
 * runs files at once. Each file holds this lock on the admin database from the first line of its setup to the last of its
 * teardown, so one file's role census and the role's removal never overlap another file's use of the role.
 */
const ROLE_LOCK = `hashtext('con01-assembler-role')`
let roleLock: pg.Client

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

async function owner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await ownerPool.query<T>(sql, params)).rows
}

async function onAdmin<T extends pg.QueryResultRow>(sql: string): Promise<T[]> {
  const c = new pg.Client({ connectionString: adminUrl })
  await c.connect()
  try {
    return (await c.query<T>(sql)).rows
  } finally {
    await c.end()
  }
}

/**
 * Every connection a pool opens, from the pool's creation until its socket closes (the client's own 'end'). pg-pool's
 * count is no barrier: it drops a client as soon as it is removed (a release(true), an end), before its socket closes,
 * and a 'remove' still to come for such a client can't be told from one for a client still open. A closed socket is one
 * no later termination can reach; after a graceful end it is also a backend gone, as PostgreSQL closes it only at exit.
 */
const connections = new WeakMap<pg.Pool, Set<Promise<void>>>()

function tracked<P extends pg.Pool>(pool: P): P {
  const ends = new Set<Promise<void>>()
  connections.set(pool, ends)
  pool.on('connect', (opened) => {
    ends.add(new Promise<void>((resolve) => opened.once('end', () => resolve())))
  })
  return pool
}

/** A pool ended and every connection it ever opened closed: none left open for a forced DROP DATABASE to terminate. */
async function closed(pool: pg.Pool): Promise<void> {
  const ends = connections.get(pool)
  assert.ok(ends, 'a pool closed here is tracked from its creation')
  await pool.end()
  await Promise.all(ends)
}

const roleNames = async () =>
  (await onAdmin<{ r: string }>('SELECT rolname AS r FROM pg_roles ORDER BY rolname COLLATE "C"')).map((x) => x.r)

/** The message (or `resolved`) a promise ends with: a database refusal's message, else its code or text. */
async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    if (err instanceof pg.DatabaseError) return /^[a-z_]+$/.test(err.message) ? err.message : (err.code ?? err.message)
    return String(err)
  }
}

async function waitFor(what: string, check: () => Promise<boolean>, ms = 8000): Promise<number> {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await check()) return Date.now() - start
    await sleep(20)
  }
  throw new Error(`timed out waiting for ${what}`)
}

const waiting = async (pid: number) =>
  (await owner<{ w: string | null }>('SELECT wait_event_type AS w FROM pg_stat_activity WHERE pid = $1', [pid]))[0]
    ?.w === 'Lock'

const asActor = <T>(actor: string, fn: (c: pg.PoolClient) => Promise<T>) => withActor(api, actor, 'write', fn)

/** Every client a test opens by hand, ended after it if a failed assertion left it open. */
const clients = new Set<pg.Client>()
async function client(): Promise<{ c: pg.Client; pid: number }> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  c.on('error', () => undefined)
  await c.connect()
  clients.add(c)
  const pid = (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0
  return { c, pid }
}
async function closeClients() {
  for (const c of clients) await c.end().catch(() => undefined)
  clients.clear()
}

// --- Scenes ------------------------------------------------------------------------------------------------------------

async function newProject(): Promise<string> {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E, B] })
  await owner(`SELECT sophia.set_conversation_settings($1, 'enabled', 'CON-01 N4 test')`, [projectId])
  return projectId
}

async function propose(projectId: string, actor: string, write: MissionProposalRequest, decider: string | null) {
  const r = await asActor(actor, (c) => proposeMissionChange(c, projectId, randomUUID(), write))
  assert.ok(r.decisionId)
  const id = r.decisionId
  if (decider !== null) {
    await asActor(decider, (c) =>
      decideMissionChange(c, projectId, id, randomUUID(), {
        decision: 'accept',
        expectedRevision: r.decisionRevision ?? 1,
      }),
    )
  }
  return id
}

/** A conversation of `earlier` messages (E's, then B's, alternately), then E asks; the context recorded (N2). */
async function recorded(earlier = 3): Promise<Scene> {
  const projectId = await newProject()
  await propose(projectId, A, { kind: 'mission', statement: 'Ship the map first', purpose: 'Find places' }, A)
  const constraint = await propose(projectId, A, { kind: 'constraint', statement: 'Map before list' }, A)
  const first = await asActor(E, (c) =>
    startConversation(c, projectId, randomUUID(), { title: 'Plan', text: 'Words 1', askSophia: false }, 'Lucía'),
  )
  const ids = [first.messageId]
  for (let i = 2; i <= earlier; i++) {
    const by = i % 2 === 0 ? E : B
    const sent = await asActor(by, (c) =>
      sendConversationMessage(
        c,
        first.conversationId,
        randomUUID(),
        { text: `Words ${String(i)}`, askSophia: false },
        'M',
      ),
    )
    ids.push(sent.messageId)
  }
  const asked = await asActor(E, (c) =>
    sendConversationMessage(c, first.conversationId, randomUUID(), { text: 'What now?', askSophia: true }, 'Lucía'),
  )
  assert.ok(asked.replyId)
  await owner(`UPDATE sophia.conversation_replies SET state='pending', reason=NULL, settled_at=NULL WHERE id=$1`, [
    asked.replyId,
  ])
  assert.equal((await assembleReply(loginUrl, asked.replyId, LIMITS)).outcome, 'recorded')
  return {
    projectId,
    conversationId: first.conversationId,
    replyId: asked.replyId,
    askId: asked.messageId,
    earlier: ids,
    constraint,
  }
}

/** A recorded reply, dispatched (as a dispatcher would set it): running. */
async function running(earlier = 3): Promise<Scene> {
  const s = await recorded(earlier)
  await owner(`UPDATE sophia.conversation_replies SET state='running' WHERE id=$1`, [s.replyId])
  return s
}

/** E asks again in the scene's conversation; the request recorded (N2) and dispatched (running). */
async function askAgain(s: Pick<Scene, 'conversationId'>, record = true): Promise<string> {
  const asked = await asActor(E, (c) =>
    sendConversationMessage(c, s.conversationId, randomUUID(), { text: 'And now?', askSophia: true }, 'Lucía'),
  )
  assert.ok(asked.replyId)
  await owner(`UPDATE sophia.conversation_replies SET state='pending', reason=NULL, settled_at=NULL WHERE id=$1`, [
    asked.replyId,
  ])
  if (record) {
    assert.equal((await assembleReply(loginUrl, asked.replyId, LIMITS)).outcome, 'recorded')
    await owner(`UPDATE sophia.conversation_replies SET state='running' WHERE id=$1`, [asked.replyId])
  }
  return asked.replyId
}

const publish = async (replyId: string, attempt: number, result: string, text: string, c?: pg.Client) => {
  const sql = 'SELECT sophia.conversation_publish_answer($1, $2, $3, $4) AS v'
  const params = [replyId, attempt, result, text]
  const rows = c ? (await c.query<{ v: Receipt }>(sql, params)).rows : await owner<{ v: Receipt }>(sql, params)
  return rows[0]?.v as Receipt
}
const check = async (replyId: string, attempt = 1) =>
  (
    await owner<{ v: { verdict: string; reason: string | null; contextChanged: boolean; state: string } }>(
      'SELECT sophia.conversation_reply_check($1, $2) AS v',
      [replyId, attempt],
    )
  )[0]?.v
const sourceOut = async (projectId: string, sourceId: string, c?: pg.Client) => {
  const sql = 'SELECT sophia.conversation_source_out($1, $2) AS v'
  const rows = c
    ? (await c.query<{ v: Record<string, unknown> }>(sql, [projectId, sourceId])).rows
    : await owner<{ v: Record<string, unknown> }>(sql, [projectId, sourceId])
  return rows[0]?.v
}

const replyOf = async (replyId: string) =>
  (
    await owner<{ state: string; reason: string | null; answer_id: string | null; settled: boolean }>(
      'SELECT state, reason, answer_id, settled_at IS NOT NULL AS settled FROM sophia.conversation_replies WHERE id=$1',
      [replyId],
    )
  )[0]
const answerOf = async (replyId: string) =>
  (
    await owner<{
      attempt: number
      result_ref: string
      answer_id: string
      text_sha256: string | null
      context_changed: boolean
      withdrawn_by: string | null
    }>(
      `SELECT attempt, result_ref, answer_id, text_sha256, context_changed, withdrawn_by
         FROM sophia.conversation_reply_answers WHERE reply_id=$1`,
      [replyId],
    )
  )[0]
const messageOf = async (id: string) =>
  (
    await owner<{
      seq: string
      author: string
      reply_id: string | null
      body: string | null
      withdrawn_by: string | null
    }>('SELECT seq::text, author, reply_id, body, withdrawn_by FROM sophia.conversation_messages WHERE id=$1', [id])
  )[0]
const sophiaMessages = async (replyId: string) =>
  Number(
    (
      await owner<{ n: string }>(`SELECT count(*) AS n FROM sophia.conversation_messages WHERE reply_id=$1`, [replyId])
    )[0]?.n,
  )
const contextOf = async (replyId: string, attempt = 1) =>
  (
    await owner<{
      state: string
      body: string | null
      scrubbed_by: string | null
      context_hash: string
      byte_length: number
    }>(
      `SELECT state, body, scrubbed_by, context_hash, byte_length FROM sophia.conversation_reply_contexts
        WHERE reply_id=$1 AND attempt=$2`,
      [replyId, attempt],
    )
  )[0]
const erasureOf = async (replyId: string, attempt = 1) =>
  (
    await owner<{ reason: string; tombstone: string }>(
      'SELECT reason, tombstone FROM sophia.conversation_context_erasures WHERE reply_id=$1 AND attempt=$2',
      [replyId, attempt],
    )
  )[0]
/** The source a recorded constraint was read from, and the hash the context retained for it. */
const dependency = async (replyId: string, decision: string, attempt = 1) =>
  (
    await owner<{ source_id: string; sha256: string; eligibility_revision: string }>(
      `SELECT source_id, sha256, eligibility_revision::text FROM sophia.conversation_reply_sources
        WHERE reply_id=$1 AND attempt=$2 AND kind='constraint' AND ref_id=$3`,
      [replyId, attempt, decision],
    )
  )[0]
const suppressionOf = async (replyId: string) =>
  (
    await owner<{ source_id: string; reason: string; tombstone: string | null; at: string }>(
      `SELECT source_id, reason, tombstone, suppressed_at::text AS at FROM sophia.conversation_reply_suppressions
        WHERE reply_id=$1`,
      [replyId],
    )
  )[0]
/** The sources and messages a reply's attempt read, as recorded. */
const readsOf = async (replyId: string) => ({
  sources: (
    await owner<{ s: string }>(
      'SELECT source_id::text AS s FROM sophia.conversation_reply_sources WHERE reply_id=$1 ORDER BY 1',
      [replyId],
    )
  ).map((r) => r.s),
  messages: (
    await owner<{ m: string }>(
      'SELECT message_id::text AS m FROM sophia.conversation_reply_messages WHERE reply_id=$1 ORDER BY 1',
      [replyId],
    )
  ).map((r) => r.m),
})
const sourceRow = async (sourceId: string) =>
  (
    await owner<{ sha256: string; eligible: boolean; state: string; scope: string; eligibility_revision: string }>(
      'SELECT sha256, eligible, state, scope, eligibility_revision::text FROM sophia.source_objects WHERE id=$1',
      [sourceId],
    )
  )[0]
const events = async (projectId: string, code: string) =>
  Number(
    (
      await owner<{ n: string }>(
        `SELECT count(*) AS n FROM sophia.project_events WHERE project_id=$1 AND type='conversation.updated'
           AND summary_code=$2`,
        [projectId, code],
      )
    )[0]?.n,
  )
const ineligible = (sourceId: string) =>
  owner(`UPDATE sophia.source_objects SET eligible=false, eligibility_revision=eligibility_revision+1 WHERE id=$1`, [
    sourceId,
  ])
const erase = (projectId: string, sourceId: string) =>
  owner('SELECT sophia.mission_erase_source($1, $2)', [projectId, sourceId])

// --- The allowance ledger (S2), set up by the owner: a lineage for the asker, and one call reserved then uncertain. ---

const ledgerState = async (projectId: string, replyId: string) => ({
  reservations: await owner(
    'SELECT to_jsonb(r) AS r FROM sophia.conversation_reservations r WHERE reply_id=$1 ORDER BY call_ordinal',
    [replyId],
  ),
  grant: await owner('SELECT to_jsonb(g) AS g FROM sophia.conversation_grants g WHERE project_id=$1', [projectId]),
})
const grantFor = (projectId: string) =>
  owner('SELECT sophia.conversation_new_lineage($1, $2)', [
    projectId,
    JSON.stringify({
      unit: 'calls_tokens',
      routeId: 'route-a',
      credentialRef: 'cred-a',
      ownerResourceRef: 'owner-a',
      approvalRef: `approval-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      maxCallsPerReply: 2,
      totalCallCap: 10,
      replyTokenCap: 1000,
      totalTokenCap: 5000,
      subjects: [E],
    }),
  ])
const reserveUncertain = async (s: Pick<Scene, 'projectId' | 'replyId'>) => {
  await owner('SELECT sophia.conversation_reserve($1, $2, 1, $3)', [
    s.projectId,
    s.replyId,
    JSON.stringify({
      routeId: 'route-a',
      credentialRef: 'cred-a',
      ownerResourceRef: 'owner-a',
      unit: 'calls_tokens',
      tokens: 100,
      priceMicros: 0,
    }),
  ])
  await owner('SELECT sophia.conversation_mark_uncertain($1, $2)', [s.projectId, s.replyId])
}

// --- The catalog, before and after the candidate ----------------------------------------------------------------------

interface Catalog {
  functions: { sig: string; src: string; secdef: boolean; acl: string }[]
  relations: { name: string; kind: string; acl: string; rls: boolean }[]
  triggers: { name: string; def: string }[]
  policies: { name: string; qual: string | null }[]
  constraints: { name: string; def: string }[]
  rows: { relname: string; n: string }[]
}

// Every text ordering in this file is byte order (COLLATE "C"), as its expected lists are.
async function catalog(): Promise<Catalog> {
  const [functions, relations, triggers, policies, constraints, rows] = await Promise.all([
    owner<Catalog['functions'][number]>(
      `SELECT p.oid::regprocedure::text AS sig, md5(p.prosrc) AS src, p.prosecdef AS secdef, coalesce(p.proacl::text, '') AS acl
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'sophia'
        ORDER BY p.oid::regprocedure::text COLLATE "C"`,
    ),
    owner<Catalog['relations'][number]>(
      `SELECT c.relname AS name, c.relkind::text AS kind, coalesce(c.relacl::text, '') AS acl, c.relrowsecurity AS rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'sophia' ORDER BY c.relname COLLATE "C"`,
    ),
    owner<Catalog['triggers'][number]>(
      `SELECT t.tgname || ' on ' || c.relname AS name, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'sophia' AND NOT t.tgisinternal ORDER BY (t.tgname || ' on ' || c.relname) COLLATE "C"`,
    ),
    owner<Catalog['policies'][number]>(
      `SELECT polname || ' on ' || polrelid::regclass::text AS name, pg_get_expr(polqual, polrelid) AS qual
         FROM pg_policy ORDER BY (polname || ' on ' || polrelid::regclass::text) COLLATE "C"`,
    ),
    owner<Catalog['constraints'][number]>(
      `SELECT c.conrelid::regclass::text || ' ' || c.conname AS name, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'sophia'
        ORDER BY (c.conrelid::regclass::text || ' ' || c.conname) COLLATE "C"`,
    ),
    owner<Catalog['rows'][number]>(
      `SELECT c.relname, (xpath('/row/n/text()',
                query_to_xml(format('SELECT count(*) AS n FROM sophia.%I', c.relname), false, true, '')))[1]::text AS n
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'sophia' AND c.relkind IN ('r', 'p') ORDER BY c.relname COLLATE "C"`,
    ),
  ])
  return { functions, relations, triggers, policies, constraints, rows }
}

const without = <T>(xs: T[], key: (x: T) => string, names: string[]) => xs.filter((x) => !names.includes(key(x)))
const sigs = (c: Catalog) => c.functions.map((f) => f.sig)
const constraintNames = (c: Catalog) => c.constraints.map((x) => x.name)

/** A row that must be there, returned as present. */
async function must<T>(p: Promise<T | undefined>, what: string): Promise<T> {
  const v = await p
  assert.ok(v, what)
  return v
}
const added = (b: string[], a: string[]) => a.filter((x) => !b.includes(x))

async function untouched(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const t of UNTOUCHED)
    out[t] = (await owner<{ n: string }>(`SELECT count(*)::text AS n FROM sophia.${t}`))[0]?.n ?? ''
  return out
}

// G2_CON_ONLY_PLAN Step B. The refusal of an answer publication can't take, and what it must leave behind.
const refuse = async (replyId: string, attempt: number | null, reason: string, c?: pg.Client) => {
  const sql = 'SELECT sophia.conversation_refuse_answer($1, $2, $3) AS v'
  const params = [replyId, attempt, reason]
  const rows = c
    ? (await c.query<{ v: Record<string, unknown> }>(sql, params)).rows
    : await owner<{ v: Record<string, unknown> }>(sql, params)
  return rows[0]?.v
}
const scrubTrigger = async () =>
  (
    await owner<{ e: string }>(
      `SELECT tgenabled AS e FROM pg_trigger WHERE tgname = 'conversation_context_reply_scrub'`,
    )
  )[0]?.e
/** The reply's governed context: each attempt's state, whether its body is kept, its scrub and hash; message hashes kept;
 * the source hashes it retained; and its suppressions. */
const governed = async (replyId: string) =>
  (
    await owner<{ g: Record<string, unknown> }>(
      `SELECT jsonb_build_object(
         'contexts', (SELECT jsonb_agg(jsonb_build_object('attempt', attempt, 'state', state, 'body', body IS NOT NULL,
            'by', scrubbed_by, 'at', scrubbed_at, 'hash', context_hash) ORDER BY attempt)
            FROM sophia.conversation_reply_contexts WHERE reply_id = $1),
         'messageHashes', (SELECT count(*) FILTER (WHERE body_sha256 IS NOT NULL)
            FROM sophia.conversation_reply_messages WHERE reply_id = $1),
         'messages', (SELECT count(*) FROM sophia.conversation_reply_messages WHERE reply_id = $1),
         'sources', (SELECT jsonb_agg(sha256 ORDER BY kind, ref_id) FROM sophia.conversation_reply_sources WHERE reply_id = $1),
         'suppressions', (SELECT count(*) FROM sophia.conversation_reply_suppressions WHERE reply_id = $1)) AS g`,
      [replyId],
    )
  )[0]?.g as {
    contexts: { attempt: number; state: string; body: boolean; by: string | null; at: string | null; hash: string }[]
    messageHashes: number
    messages: number
    sources: string[]
    suppressions: number
  }
/** A recorded reply whose first attempt was superseded by a second, recorded after a new mission; then running. */
async function onSecondAttempt(): Promise<Scene> {
  const s = await recorded()
  await propose(s.projectId, A, { kind: 'mission', statement: 'Ship the list first', purpose: 'Find lists' }, A)
  assert.equal((await assembleReply(loginUrl, s.replyId, LIMITS)).outcome, 'recorded')
  await owner(`UPDATE sophia.conversation_replies SET state='running' WHERE id=$1`, [s.replyId])
  assert.deepEqual(
    (await governed(s.replyId)).contexts.map((x) => x.state),
    ['superseded', 'recorded'],
  )
  return s
}

// G2_CON_ONLY_PLAN Step A. Dependency rows only, inserted with replication triggers off, so no reply or context stands
// behind them: 25,000 over 2,000 sources in one project, 5,000 in another. `read`: three replies read it, and it is still
// within its predicate, so source_out's loop has nothing to do. `unread`: no reply read it. Written inside the caller's
// transaction, so nothing of it outlives the rollback.
async function sourceKeyFixture(c: pg.Client, projectId: string, elsewhere: string) {
  await c.query('SET LOCAL session_replication_role = replica')
  const sources = `INSERT INTO sophia.source_objects(project_id, id, owner_id, scope, sha256, mime, storage_key,
      byte_length, eligible, state)
    SELECT $1::uuid, gen_random_uuid(), $2::uuid, 'project', encode(sha256(convert_to(g::text||$1::text, 'UTF8')), 'hex'),
      'text/plain', 'inline/'||gen_random_uuid(), 10, true, 'ready' FROM generate_series(1, $3::int) g`
  await c.query(sources, [projectId, A, 2000])
  await c.query(sources, [elsewhere, A, 500])
  const deps = `INSERT INTO sophia.conversation_reply_sources(project_id, reply_id, attempt, kind, ref_id, source_id,
      sha256, eligibility_revision)
    SELECT $1::uuid, gen_random_uuid(), 1, 'constraint', gen_random_uuid(), s.ids[1 + g % s.n], s.shas[1 + g % s.n], 1
      FROM (SELECT array_agg(id) AS ids, array_agg(sha256) AS shas, count(*)::int AS n
              FROM sophia.source_objects WHERE project_id = $1::uuid) s, generate_series(1, $2::int) g`
  await c.query(deps, [projectId, 25000])
  await c.query(deps, [elsewhere, 5000])
  const read = randomUUID()
  const unread = randomUUID()
  for (const id of [read, unread])
    await c.query(
      `INSERT INTO sophia.source_objects(project_id, id, owner_id, scope, sha256, mime, storage_key, byte_length,
         eligible, state) VALUES ($1::uuid, $2::uuid, $3::uuid, 'project', repeat('a', 64), 'text/plain', 'inline/'||$2::text, 10,
         true, 'ready')`,
      [projectId, id, A],
    )
  for (let i = 0; i < 3; i++)
    await c.query(
      `INSERT INTO sophia.conversation_reply_sources
         SELECT $1::uuid, gen_random_uuid(), 1, 'constraint', gen_random_uuid(), $2::uuid, sha256, eligibility_revision
           FROM sophia.source_objects WHERE project_id = $1::uuid AND id = $2::uuid`,
      [projectId, read],
    )
  await c.query('SET LOCAL session_replication_role = DEFAULT')
  await c.query('ANALYZE sophia.conversation_reply_sources')
  await c.query('ANALYZE sophia.source_objects')
  return { read, unread }
}

/** Every statement this session runs from here, nested ones included, is reported to it with its plan and buffers. */
async function explainNested(c: pg.Client) {
  await c.query("LOAD 'auto_explain'")
  for (const setting of [
    'auto_explain.log_min_duration = 0',
    'auto_explain.log_nested_statements = on',
    'auto_explain.log_analyze = on',
    'auto_explain.log_buffers = on',
    "auto_explain.log_format = 'json'",
    "auto_explain.log_level = 'notice'",
    'client_min_messages = notice',
  ])
    await c.query(`SET LOCAL ${setting}`)
}

type PlanNode = Record<string, unknown> & { Plans?: PlanNode[] }
const planNodes = (n: PlanNode): PlanNode[] => [n, ...(n.Plans ?? []).flatMap(planNodes)]

/** How source_out's own dependency query was planned, in one call under the given plan cache mode, rolled back. */
async function sourceOutPlan(c: pg.Client, plans: string[], mode: string, projectId: string, sourceId: string) {
  plans.length = 0
  await c.query('SAVEPOINT planned')
  try {
    await c.query(`SET LOCAL plan_cache_mode = ${mode}`)
    const sql = 'SELECT sophia.conversation_source_out($1, $2) AS v'
    const v = (await c.query<{ v: { suppressed: number } }>(sql, [projectId, sourceId])).rows[0]?.v
    assert.equal(v?.suppressed, 0, 'nothing for source_out to act on')
  } finally {
    await c.query('ROLLBACK TO SAVEPOINT planned')
  }
  const query = plans
    .map((t) => JSON.parse(t) as { 'Query Text': string; Plan: PlanNode })
    .find(
      (x) =>
        x['Query Text'].includes('FROM sophia.conversation_reply_sources s') &&
        x['Query Text'].includes('s.source_id=p_source'),
    )
  if (!query) return "source_out's dependency query was not planned"
  const all = planNodes(query.Plan)
  const scans = all.some((n) => n['Node Type'] === 'Seq Scan' && n['Relation Name'] === 'conversation_reply_sources')
  const indexed = all.some((n) => n['Index Name'] === 'conversation_reply_sources_by_source')
  const buffers = Number(query.Plan['Shared Hit Blocks'] ?? 0) + Number(query.Plan['Shared Read Blocks'] ?? 0)
  return `${scans ? 'scans the table' : 'no scan of the table'}; ${
    indexed ? 'by conversation_reply_sources_by_source' : 'not by the index'
  }; ${buffers <= 32 ? 'at most 32 buffers' : `${buffers} buffers`}`
}

describe('CON-01 N4: a reply’s answer under its fences, and a source’s withdrawal (L1, disposable PostgreSQL)', () => {
  let pre: Catalog
  let post: Catalog

  before(async () => {
    roleLock = new pg.Client({ connectionString: adminUrl })
    await roleLock.connect()
    await roleLock.query(`SELECT pg_advisory_lock(${ROLE_LOCK})`)
    rolesBefore = await roleNames()
    assemblerExisted = rolesBefore.includes(ROLE)
    db = await createConversationCandidateDatabase()
    ownerPool = tracked(new pg.Pool({ connectionString: db.ownerUrl, max: 8 }))
    api = tracked(createPool(db.apiUrl, { max: 8 }))
    await withClusterMigrationLock(async () => {
      for (const name of BEFORE_N4) await owner(candidate(name))
      pre = await catalog()
      await owner(candidate(N4))
      post = await catalog()
    })
    loginRole = `con01_n4_t_${randomBytes(6).toString('hex')}`
    const password = randomBytes(12).toString('hex')
    await owner(
      `CREATE ROLE ${loginRole} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
    )
    await owner(`GRANT ${ROLE} TO ${loginRole}`)
    await owner(`GRANT CONNECT ON DATABASE ${new URL(db.ownerUrl).pathname.slice(1)} TO ${loginRole}`)
    const u = new URL(db.ownerUrl)
    u.username = loginRole
    u.password = password
    loginUrl = u.toString()
    untouchedBefore = await untouched()
  })

  afterEach(closeClients)

  after(async () => {
    try {
      await closeClients()
      await closed(api)
      await closed(ownerPool)
      await db.drop()
      await onAdmin(`DROP ROLE IF EXISTS ${loginRole}`)
      if (!assemblerExisted) await onAdmin(`DROP ROLE IF EXISTS ${ROLE}`)
      const now = await roleNames()
      const workerRole = db.apiRole.replace(/^sophia_api_t_/, 'sophia_worker_t_')
      for (const role of [loginRole, db.apiRole, workerRole, ...(assemblerExisted ? [] : [ROLE])])
        assert.ok(!now.includes(role), `${role} remains`)
      assert.deepEqual(
        now.filter((r) => !rolesBefore.includes(r) && !MIGRATION_ROLES.includes(r) && !TEST_LOGIN.test(r)),
        [],
        'no role appeared that neither the migrations nor another file’s test database explain',
      )
      assert.deepEqual(
        rolesBefore.filter((r) => !now.includes(r) && !TEST_LOGIN.test(r)),
        [],
        'no role removed but test logins',
      )
    } finally {
      await roleLock.query(`SELECT pg_advisory_unlock(${ROLE_LOCK})`).catch(() => undefined)
      await roleLock.end()
    }
  })

  describe('its footprint, its change to N2, and its closure', () => {
    it('adds exactly its tables, indexes, functions and triggers, replaces only N2’s guard, and inserts no row', () => {
      assert.deepEqual(added(sigs(pre), sigs(post)), ADDED_FUNCTIONS.toSorted())
      assert.deepEqual(
        added(
          pre.relations.map((r) => r.name),
          post.relations.map((r) => r.name),
        ),
        [...ADDED_TABLES, ...ADDED_INDEXES].toSorted(),
      )
      assert.deepEqual(
        added(
          pre.triggers.map((t) => t.name),
          post.triggers.map((t) => t.name),
        ),
        ADDED_TRIGGERS.toSorted(),
      )
      // The one replaced function: its body changed, its signature, SECURITY and privileges did not.
      const [was] = pre.functions.filter((f) => REPLACED_FUNCTIONS.includes(f.sig))
      const [now] = post.functions.filter((f) => REPLACED_FUNCTIONS.includes(f.sig))
      assert.ok(was && now)
      assert.notEqual(now.src, was.src)
      assert.deepEqual({ ...now, src: '' }, { ...was, src: '' })
      assert.deepEqual(
        without(post.functions, (f) => f.sig, [...ADDED_FUNCTIONS, ...REPLACED_FUNCTIONS]),
        without(pre.functions, (f) => f.sig, REPLACED_FUNCTIONS),
        'no other function changed',
      )
      assert.deepEqual(
        without(post.relations, (r) => r.name, [...ADDED_TABLES, ...ADDED_INDEXES]),
        pre.relations,
      )
      assert.deepEqual(
        without(post.triggers, (t) => t.name, ADDED_TRIGGERS),
        pre.triggers,
      )
      assert.deepEqual(post.policies, pre.policies, 'no policy added or changed')
      // Constraints: the new tables' own, and N2's length CHECK replaced under its own name; nothing else.
      const onAdded = (name: string) => ADDED_TABLES.some((tb) => name.startsWith(`sophia.${tb} `))
      assert.deepEqual(
        added(constraintNames(pre), constraintNames(post)).filter((n) => !onAdded(n)),
        [],
        'no constraint added elsewhere',
      )
      assert.deepEqual(added(constraintNames(post), constraintNames(pre)), [], 'no constraint dropped')
      const changed = post.constraints.filter((x) => pre.constraints.some((y) => y.name === x.name && y.def !== x.def))
      assert.deepEqual(changed, [
        {
          name: 'sophia.conversation_reply_contexts conversation_reply_contexts_byte_length_check',
          def: 'CHECK ((((byte_length >= 1) AND (byte_length <= 126976)) OR ((byte_length = 0) AND (body IS NULL))))',
        },
      ])
      assert.equal(
        pre.constraints.find((x) => x.name === changed[0]?.name)?.def,
        'CHECK (((byte_length >= 1) AND (byte_length <= 126976)))',
      )
      assert.deepEqual(
        without(post.rows, (r) => r.relname, ADDED_TABLES),
        pre.rows,
        'no row written anywhere',
      )
      for (const table of ADDED_TABLES) {
        assert.equal(post.rows.find((r) => r.relname === table)?.n, '0')
        assert.equal(post.relations.find((r) => r.name === table)?.rls, true, `${table}: row security on`)
      }
    })

    it('lets no role but the owner execute anything it adds, or read or write its tables', async () => {
      const grants = await owner<{ role: string; fn: string }>(
        `SELECT g.role, p.oid::regprocedure::text AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
                unnest(ARRAY['public', 'sophia_api', 'sophia_worker', $1]) g(role)
          WHERE n.nspname = 'sophia' AND p.oid::regprocedure::text = ANY($2)
            AND has_function_privilege(g.role, p.oid, 'EXECUTE')`,
        [ROLE, [...ADDED_FUNCTIONS, ...REPLACED_FUNCTIONS]],
      )
      assert.deepEqual(grants, [])
      const tables = await owner<{ role: string; t: string }>(
        `SELECT g.role, t FROM unnest($2::text[]) t, unnest(ARRAY['public', 'sophia_api', 'sophia_worker', $1]) g(role)
          WHERE has_table_privilege(g.role, 'sophia.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,
        [ROLE, ADDED_TABLES],
      )
      assert.deepEqual(tables, [])
      // Called directly: the API login, the worker login, and the test login with and without the assembler role.
      const s = await running()
      const calls = [
        `SELECT sophia.conversation_publish_answer('${s.replyId}', 1, '${randomUUID()}', 'x')`,
        `SELECT sophia.conversation_reply_check('${s.replyId}', 1)`,
        `SELECT sophia.conversation_source_out('${s.projectId}', '${randomUUID()}')`,
        ...ADDED_TABLES.map((t) => `SELECT 1 FROM sophia.${t}`),
      ]
      for (const [url, setup] of [
        [db.apiUrl, ''],
        [db.workerUrl, ''],
        [loginUrl, ''],
        [loginUrl, `SET ROLE ${ROLE}`],
      ] as const) {
        const c = new pg.Client({ connectionString: url })
        await c.connect()
        try {
          if (setup) await c.query(setup)
          for (const call of calls) assert.equal(await refusal(c.query(call)), '42501', `${url} ${setup} ${call}`)
        } finally {
          await c.end()
        }
      }
      assert.equal((await replyOf(s.replyId))?.state, 'running', 'nothing was written by the refused calls')
    })

    it('keeps N2’s refusals with N4 applied, and admits only the two tombstones it adds', async () => {
      const s = await running()
      const dep = await dependency(s.replyId, s.constraint)
      assert.ok(dep)
      const random = () => sha256(randomUUID())
      const N2_REFUSED = [
        [`UPDATE sophia.conversation_reply_sources SET sha256=$1 WHERE reply_id=$2`, [random(), s.replyId]],
        [
          `UPDATE sophia.conversation_reply_sources SET eligibility_revision=eligibility_revision+1 WHERE reply_id=$1`,
          [s.replyId],
        ],
        [`DELETE FROM sophia.conversation_reply_sources WHERE reply_id=$1`, [s.replyId]],
        [`UPDATE sophia.conversation_reply_contexts SET context_hash=$1 WHERE reply_id=$2`, [random(), s.replyId]],
        [`UPDATE sophia.conversation_reply_contexts SET included=included+1 WHERE reply_id=$1`, [s.replyId]],
        [`UPDATE sophia.conversation_reply_contexts SET byte_length=byte_length+1 WHERE reply_id=$1`, [s.replyId]],
        [`UPDATE sophia.conversation_reply_contexts SET byte_length=0 WHERE reply_id=$1`, [s.replyId]],
        [`DELETE FROM sophia.conversation_reply_contexts WHERE reply_id=$1`, [s.replyId]],
        [`UPDATE sophia.conversation_reply_messages SET seq=seq+100 WHERE reply_id=$1`, [s.replyId]],
        [`UPDATE sophia.conversation_assembly_claims SET lease_token=gen_random_uuid() WHERE reply_id=$1`, [s.replyId]],
        [`TRUNCATE sophia.conversation_reply_sources CASCADE`, []],
      ] as const
      for (const [sql, params] of N2_REFUSED) assert.equal(await refusal(owner(sql, [...params])), 'context_kept', sql)
      // The CHECK alone, the guard bypassed: a context that still has its body never has length 0.
      const probe = await client()
      await probe.c.query('BEGIN')
      await probe.c.query(`SET LOCAL session_replication_role = replica`)
      assert.equal(
        await refusal(
          probe.c.query(`UPDATE sophia.conversation_reply_contexts SET byte_length=0 WHERE reply_id=$1`, [s.replyId]),
        ),
        '23514',
      )
      await probe.c.query('ROLLBACK')
      // The two N4 admits, then nothing more: a second change to either is refused.
      await erase(s.projectId, dep.source_id)
      await sourceOut(s.projectId, dep.source_id)
      const [sup] = await owner<{ tombstone: string }>(
        'SELECT tombstone FROM sophia.conversation_reply_suppressions WHERE reply_id=$1',
        [s.replyId],
      )
      assert.equal((await dependency(s.replyId, s.constraint))?.sha256, sup?.tombstone)
      assert.equal((await contextOf(s.replyId))?.context_hash, (await erasureOf(s.replyId))?.tombstone)
      assert.equal((await contextOf(s.replyId))?.byte_length, 0)
      for (const sql of [
        `UPDATE sophia.conversation_reply_sources SET sha256=$1 WHERE reply_id=$2`,
        `UPDATE sophia.conversation_reply_contexts SET context_hash=$1 WHERE reply_id=$2`,
      ])
        assert.equal(await refusal(owner(sql, [random(), s.replyId])), 'context_kept', `again: ${sql}`)
      assert.equal(
        await refusal(
          owner(`UPDATE sophia.conversation_reply_contexts SET byte_length=42 WHERE reply_id=$1`, [s.replyId]),
        ),
        'context_kept',
        'a length never comes back',
      )
      // N4's own rows.
      for (const sql of [
        `UPDATE sophia.conversation_reply_suppressions SET reason='source_out_of_scope' WHERE reply_id=$1`,
        `DELETE FROM sophia.conversation_reply_suppressions WHERE reply_id=$1`,
        `UPDATE sophia.conversation_context_erasures SET tombstone=md5(random()::text)||md5(random()::text) WHERE reply_id=$1`,
        `DELETE FROM sophia.conversation_context_erasures WHERE reply_id=$1`,
      ])
        assert.equal(await refusal(owner(sql, [s.replyId])), 'fences_kept', sql)
      for (const t of ADDED_TABLES)
        assert.equal(await refusal(owner(`TRUNCATE sophia.${t} CASCADE`)), 'fences_kept', `TRUNCATE ${t}`)
      const p = await running()
      await publish(p.replyId, 1, randomUUID(), 'An answer.')
      for (const sql of [
        `UPDATE sophia.conversation_reply_answers SET context_changed=NOT context_changed WHERE reply_id=$1`,
        `UPDATE sophia.conversation_reply_answers SET result_ref=gen_random_uuid() WHERE reply_id=$1`,
        `UPDATE sophia.conversation_reply_answers SET text_sha256=md5('x')||md5('y') WHERE reply_id=$1`,
        `DELETE FROM sophia.conversation_reply_answers WHERE reply_id=$1`,
      ])
        assert.equal(await refusal(owner(sql, [p.replyId])), 'fences_kept', sql)
    })
  })

  describe('a publication', () => {
    it('publishes one Sophia message from the recorded attempt and the result it names; the context is scrubbed', async () => {
      const s = await running()
      const result = randomUUID()
      const recordedEvents = await events(s.projectId, 'conversation.message_recorded')
      const v = await publish(s.replyId, 1, result, 'The map comes first.')
      assert.equal(v.verdict, 'published')
      const a = await answerOf(s.replyId)
      assert.ok(a)
      assert.deepEqual(
        {
          attempt: a.attempt,
          result: a.result_ref,
          hash: a.text_sha256,
          changed: a.context_changed,
          by: a.withdrawn_by,
        },
        { attempt: 1, result, hash: sha256('The map comes first.'), changed: false, by: null },
      )
      const m = await messageOf(a.answer_id)
      const ask = await messageOf(s.askId)
      assert.deepEqual(
        { author: m?.author, reply: m?.reply_id, body: m?.body, seq: Number(m?.seq) },
        { author: 'sophia', reply: s.replyId, body: 'The map comes first.', seq: Number(ask?.seq) + 1 },
      )
      assert.deepEqual(await replyOf(s.replyId), {
        state: 'answered',
        reason: null,
        answer_id: a.answer_id,
        settled: true,
      })
      const x = await contextOf(s.replyId)
      assert.deepEqual([x?.state, x?.body, x?.scrubbed_by], ['recorded', null, 'reply_ended'])
      assert.equal(await events(s.projectId, 'conversation.message_recorded'), recordedEvents + 1)
      assert.deepEqual(
        { ...v, publishedAt: '' },
        {
          verdict: 'published',
          replyId: s.replyId,
          attempt: 1,
          resultRef: result,
          answerId: a.answer_id,
          contextChanged: false,
          publishedAt: '',
          visible: true,
          withdrawnBy: null,
        },
      )
    })

    it('replays its receipt for the same attempt, result and text, even after a lost response and N2’s scrub; anything else conflicts', async () => {
      const s = await running()
      const result = randomUUID()
      // The publication commits and its response is lost.
      const { c } = await client()
      await c.query('BEGIN')
      const lost = await publish(s.replyId, 1, result, 'One answer.', c)
      await c.query('COMMIT')
      assert.equal((await contextOf(s.replyId))?.body, null, 'N2 scrubbed the context at answered')
      const recordedEvents = await events(s.projectId, 'conversation.message_recorded')
      const again = await publish(s.replyId, 1, result, 'One answer.')
      assert.deepEqual({ ...again, verdict: '' }, { ...lost, verdict: '' })
      assert.equal(again.verdict, 'already_answered')
      for (const [attempt, ref, text] of [
        [1, result, 'Another answer.'],
        [1, randomUUID(), 'One answer.'],
        [2, result, 'One answer.'],
      ] as const)
        assert.equal(await refusal(publish(s.replyId, attempt, ref, text)), 'answer_conflict', `${attempt} ${text}`)
      const other = await running()
      assert.equal(await refusal(publish(other.replyId, 1, result, 'One answer.')), 'answer_conflict', 'result reused')
      assert.equal(await sophiaMessages(s.replyId), 1)
      assert.equal(await events(s.projectId, 'conversation.message_recorded'), recordedEvents, 'no second event')
      assert.equal((await replyOf(other.replyId))?.state, 'running')
    })

    it('refuses a reply that is not running, an attempt that is not its recorded one, and malformed input; writes nothing', async () => {
      for (const state of ['pending', 'cancelled', 'failed', 'blocked', 'outcome_unknown']) {
        const s = await running()
        const settled = state === 'pending' ? 'NULL' : 'now()'
        await owner(`UPDATE sophia.conversation_replies SET state=$2, reason=$3, settled_at=${settled} WHERE id=$1`, [
          s.replyId,
          state,
          state === 'pending' ? null : 'test_state',
        ])
        assert.deepEqual(await publish(s.replyId, 1, randomUUID(), 'Late.'), { verdict: 'not_running', state })
        assert.equal(await sophiaMessages(s.replyId), 0, state)
        assert.equal(await answerOf(s.replyId), undefined, state)
        assert.equal((await replyOf(s.replyId))?.state, state)
      }
      const s = await running()
      assert.equal(await refusal(publish(s.replyId, 2, randomUUID(), 'x')), 'not_recorded')
      for (const [ref, text] of [
        [randomUUID(), ''],
        [randomUUID(), 'x'.repeat(16001)],
      ] as const)
        assert.equal(await refusal(publish(s.replyId, 1, ref, text)), 'invalid_input')
      assert.equal(
        await refusal(owner('SELECT sophia.conversation_publish_answer($1, 1, NULL, $2)', [s.replyId, 'x'])),
        'invalid_input',
      )
      const { c } = await client()
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
      assert.equal(await refusal(publish(s.replyId, 1, randomUUID(), 'x', c)), 'read_committed_required')
      await c.query('ROLLBACK')
      // A superseded attempt is no longer the recorded one.
      await owner(
        `SELECT sophia.conversation_context_scrub(x.project_id, x.reply_id, 1, 'superseded')
                     FROM sophia.conversation_replies r JOIN sophia.conversation_reply_contexts x ON x.reply_id=r.id
                    WHERE r.id=$1`,
        [s.replyId],
      )
      await owner(`UPDATE sophia.conversation_reply_contexts SET state='superseded' WHERE reply_id=$1`, [s.replyId])
      assert.equal(await refusal(publish(s.replyId, 1, randomUUID(), 'x')), 'not_recorded')
      assert.equal(await sophiaMessages(s.replyId), 0)
      assert.equal((await replyOf(s.replyId))?.state, 'running')
    })
  })

  describe('privacy before publication: every reason cancels, and nothing is published', () => {
    const cases: Array<[string, (s: Scene) => Promise<unknown>, string]> = [
      [
        'conversation erased',
        (s) => owner(`UPDATE sophia.conversations SET state='erased', title=NULL WHERE id=$1`, [s.conversationId]),
        'conversation_erased',
      ],
      [
        'asking message withdrawn',
        (s) =>
          owner(
            `UPDATE sophia.conversation_messages SET body=NULL, author_name=NULL, withdrawn_at=now(), withdrawn_by='author'
              WHERE id=$1`,
            [s.askId],
          ),
        'source_withdrawn',
      ],
      [
        'a later message withdrawn (erasure revision)',
        async (s) => {
          const later = await asActor(E, (c) =>
            sendConversationMessage(
              c,
              s.conversationId,
              randomUUID(),
              { text: 'After the ask', askSophia: false },
              'L',
            ),
          )
          await asActor(E, (c) => withdrawConversationMessage(c, s.conversationId, later.messageId, randomUUID()))
        },
        'source_withdrawn',
      ],
      [
        'asker no longer a writer',
        (s) =>
          owner(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [s.projectId, E]),
        'asker_removed',
      ],
      [
        'a read source erased',
        async (s) => erase(s.projectId, (await dependency(s.replyId, s.constraint))?.source_id ?? ''),
        'source_withdrawn',
      ],
      [
        'a read source ineligible',
        async (s) => ineligible((await dependency(s.replyId, s.constraint))?.source_id ?? ''),
        'source_withdrawn',
      ],
      [
        'a read source made private',
        async (s) =>
          owner(`UPDATE sophia.source_objects SET scope='private' WHERE id=$1`, [
            (await dependency(s.replyId, s.constraint))?.source_id,
          ]),
        'source_out_of_scope',
      ],
      [
        'the audience revision moved',
        (s) => owner(`UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=$1`, [s.projectId]),
        'audience_changed',
      ],
    ]
    for (const [name, change, reason] of cases) {
      it(`${name}: check says ${reason} and writes nothing; publication cancels with it`, async () => {
        const s = await running()
        await change(s)
        assert.deepEqual(
          { ...(await check(s.replyId)), contextChanged: null },
          { verdict: 'privacy', reason, contextChanged: null, state: 'running' },
        )
        assert.equal((await replyOf(s.replyId))?.state, 'running', 'the check wrote nothing')
        assert.deepEqual(await publish(s.replyId, 1, randomUUID(), 'Should not appear.'), {
          verdict: 'cancelled',
          reason,
        })
        assert.deepEqual(await replyOf(s.replyId), { state: 'cancelled', reason, answer_id: null, settled: true })
        assert.equal(await sophiaMessages(s.replyId), 0)
        assert.equal(await answerOf(s.replyId), undefined)
      })
    }

    it('a read earlier message withdrawn through 0063: the reply was cancelled there, its digest erased, and nothing publishes', async () => {
      const s = await running()
      const was = await contextOf(s.replyId)
      await asActor(E, (c) => withdrawConversationMessage(c, s.conversationId, s.earlier[0] ?? '', randomUUID()))
      assert.deepEqual(await publish(s.replyId, 1, randomUUID(), 'x'), { verdict: 'not_running', state: 'cancelled' })
      const e = await erasureOf(s.replyId)
      assert.equal(e?.reason, 'message_withdrawn')
      assert.equal((await contextOf(s.replyId))?.context_hash, e?.tombstone)
      assert.notEqual(e?.tombstone, was?.context_hash)
    })
  })

  describe('an ordinary replacement is not a privacy failure', () => {
    it('a decision accepted after the record publishes, marked contextChanged; with none, contextChanged is false', async () => {
      const quiet = await running()
      assert.equal((await check(quiet.replyId))?.contextChanged, false)
      const s = await running()
      await propose(s.projectId, A, { kind: 'lesson', statement: 'Ask before building' }, A)
      assert.deepEqual(await check(s.replyId), { verdict: 'ok', reason: null, contextChanged: true, state: 'running' })
      const v = await publish(s.replyId, 1, randomUUID(), 'Written before the decision.')
      assert.deepEqual([v.verdict, v.contextChanged], ['published', true])
      assert.equal((await answerOf(s.replyId))?.context_changed, true)
    })
  })

  describe('after publication, privacy dominates the replay', () => {
    const paths: Array<[string, (s: Scene, answerId: string) => Promise<unknown>, string, boolean]> = [
      [
        'a read message withdrawn by its author',
        (s) => asActor(E, (c) => withdrawConversationMessage(c, s.conversationId, s.earlier[0] ?? '', randomUUID())),
        'source',
        true,
      ],
      [
        'the answer moderated by an admin',
        (s, answerId) => asActor(A, (c) => withdrawConversationMessage(c, s.conversationId, answerId, randomUUID())),
        'admin',
        false,
      ],
      [
        'the conversation erased',
        (s) => asActor(A, (c) => eraseConversation(c, s.conversationId, randomUUID())),
        'admin',
        true,
      ],
      [
        'a read source erased, then source_out',
        async (s) => {
          const dep = await dependency(s.replyId, s.constraint)
          await erase(s.projectId, dep?.source_id ?? '')
          return sourceOut(s.projectId, dep?.source_id ?? '')
        },
        'source',
        true,
      ],
    ]
    for (const [name, withdraw, by, digest] of paths) {
      it(`${name}: the text and its hash go, and no replay restores them`, async () => {
        const s = await running()
        const result = randomUUID()
        const v = await publish(s.replyId, 1, result, 'Visible for now.')
        const hashBefore = (await must(contextOf(s.replyId), 'context')).context_hash
        await withdraw(s, v.answerId)
        const a = await must(answerOf(s.replyId), 'answer')
        const m = await must(messageOf(v.answerId), 'message')
        assert.deepEqual([a.text_sha256, a.withdrawn_by, m.body, m.withdrawn_by], [null, by, null, by])
        const recordedEvents = await events(s.projectId, 'conversation.message_recorded')
        for (const text of ['Visible for now.', 'Something else.']) {
          const r = await publish(s.replyId, 1, result, text)
          assert.deepEqual(
            [r.verdict, r.visible, r.withdrawnBy, r.answerId],
            ['answer_withdrawn', false, by, v.answerId],
          )
        }
        assert.equal((await must(messageOf(v.answerId), 'message')).body, null, 'never restored')
        assert.equal(await sophiaMessages(s.replyId), 1)
        assert.equal(await events(s.projectId, 'conversation.message_recorded'), recordedEvents)
        // The context's digest goes when the withdrawal reached what it read; moderation of the answer alone does not.
        const x = await must(contextOf(s.replyId), 'context')
        if (digest) {
          const e = await must(erasureOf(s.replyId), 'erasure')
          assert.deepEqual([x.context_hash, x.byte_length], [e.tombstone, 0])
          assert.notEqual(x.context_hash, hashBefore)
        } else assert.equal(x.context_hash, hashBefore)
      })
    }
  })

  describe('a source’s withdrawal, through conversation_source_out', () => {
    it('in flight, its source erased: suppressed once, cancelled, the digest and the retained hash become tombstones', async () => {
      const s = await running()
      const dep = await dependency(s.replyId, s.constraint)
      assert.ok(dep)
      const hashBefore = (await must(contextOf(s.replyId), 'context')).context_hash
      await erase(s.projectId, dep.source_id)
      assert.deepEqual(await sourceOut(s.projectId, dep.source_id), {
        verdict: 'source_out',
        reason: 'source_withdrawn',
        suppressed: 1,
        cancelled: 1,
        withdrawn: 0,
      })
      assert.deepEqual(await replyOf(s.replyId), {
        state: 'cancelled',
        reason: 'source_withdrawn',
        answer_id: null,
        settled: true,
      })
      const x = await must(contextOf(s.replyId), 'context')
      const e = await must(erasureOf(s.replyId), 'erasure')
      assert.deepEqual(
        [x.body, x.scrubbed_by, e.reason, x.context_hash, x.byte_length],
        [null, 'reply_ended', 'source_withdrawn', e.tombstone, 0],
      )
      assert.notEqual(x.context_hash, hashBefore)
      const [sup] = await owner<{ reason: string; tombstone: string | null }>(
        'SELECT reason, tombstone FROM sophia.conversation_reply_suppressions WHERE reply_id=$1',
        [s.replyId],
      )
      assert.ok(sup?.tombstone)
      const now = await must(dependency(s.replyId, s.constraint), 'dependency')
      const source = await must(sourceRow(dep.source_id), 'source')
      assert.equal(sup.reason, 'source_withdrawn')
      assert.equal(now.sha256, sup.tombstone)
      assert.notEqual(now.sha256, dep.sha256)
      assert.notEqual(now.sha256, source.sha256)
      assert.deepEqual(await sourceOut(s.projectId, dep.source_id), {
        verdict: 'source_out',
        reason: 'source_withdrawn',
        suppressed: 0,
        cancelled: 0,
        withdrawn: 0,
      })
    })

    it('after publication, its source ineligible only: the answer withdrawn, the retained hash kept as the source keeps it, re-eligibility revives nothing', async () => {
      const s = await running()
      const v = await publish(s.replyId, 1, randomUUID(), 'Read from that constraint.')
      const dep = await dependency(s.replyId, s.constraint)
      assert.ok(dep)
      assert.equal((await contextOf(s.replyId))?.body, null, 'already scrubbed at answered')
      const withdrawnEvents = await events(s.projectId, 'conversation.message_withdrawn')
      await ineligible(dep.source_id)
      assert.deepEqual(await sourceOut(s.projectId, dep.source_id), {
        verdict: 'source_out',
        reason: 'source_withdrawn',
        suppressed: 1,
        cancelled: 0,
        withdrawn: 1,
      })
      assert.deepEqual(
        [(await messageOf(v.answerId))?.body, (await messageOf(v.answerId))?.withdrawn_by],
        [null, 'source'],
      )
      assert.deepEqual(
        [(await answerOf(s.replyId))?.text_sha256, (await answerOf(s.replyId))?.withdrawn_by],
        [null, 'source'],
      )
      assert.equal(await events(s.projectId, 'conversation.message_withdrawn'), withdrawnEvents + 1)
      const [sup] = await owner<{ tombstone: string | null }>(
        'SELECT tombstone FROM sophia.conversation_reply_suppressions WHERE reply_id=$1',
        [s.replyId],
      )
      assert.equal(sup?.tombstone, null)
      assert.equal((await dependency(s.replyId, s.constraint))?.sha256, dep.sha256, 'the source still holds that hash')
      assert.equal((await contextOf(s.replyId))?.context_hash, (await erasureOf(s.replyId))?.tombstone)
      // The source made eligible again, at the very revision the context read: nothing comes back.
      await owner(`UPDATE sophia.source_objects SET eligible=true, eligibility_revision=$2 WHERE id=$1`, [
        dep.source_id,
        dep.eligibility_revision,
      ])
      assert.deepEqual(
        { ...(await check(s.replyId)), contextChanged: null },
        { verdict: 'privacy', reason: 'source_withdrawn', contextChanged: null, state: 'answered' },
      )
      assert.equal(
        (await publish(s.replyId, 1, randomUUID(), 'Read from that constraint.')).verdict,
        'answer_withdrawn',
      )
      assert.deepEqual(await sourceOut(s.projectId, dep.source_id), {
        verdict: 'source_out',
        reason: 'source_withdrawn',
        suppressed: 0,
        cancelled: 0,
        withdrawn: 0,
      })
      assert.equal((await messageOf(v.answerId))?.body, null)
    })

    // The suppression alone: no answer was withdrawn, so no erasure revision moved, and the source comes back exactly as
    // the context read it. Only the permanent rows stand between it and a context that would pass.
    it('in flight, suppressed, then its source eligible again at the very recorded revision: the check still refuses', async () => {
      const s = await running()
      const dep = await must(dependency(s.replyId, s.constraint), 'dependency')
      await ineligible(dep.source_id)
      assert.equal((await must(sourceOut(s.projectId, dep.source_id), 'source_out')).cancelled, 1)
      await owner(`UPDATE sophia.source_objects SET eligible=true, eligibility_revision=$2 WHERE id=$1`, [
        dep.source_id,
        dep.eligibility_revision,
      ])
      const source = await must(sourceRow(dep.source_id), 'source')
      assert.deepEqual(
        [source.eligible, source.state, source.sha256, source.eligibility_revision],
        [true, 'ready', dep.sha256, dep.eligibility_revision],
        'the source is exactly as the context read it',
      )
      assert.deepEqual(
        { ...(await check(s.replyId)), contextChanged: null },
        { verdict: 'privacy', reason: 'source_withdrawn', contextChanged: null, state: 'cancelled' },
      )
      assert.deepEqual(await publish(s.replyId, 1, randomUUID(), 'x'), { verdict: 'not_running', state: 'cancelled' })
    })

    it('a source made private: source_out_of_scope; a source still within its predicate: nothing', async () => {
      const s = await running()
      const dep = await dependency(s.replyId, s.constraint)
      assert.ok(dep)
      assert.deepEqual(await sourceOut(s.projectId, dep.source_id), {
        verdict: 'source_out',
        reason: 'source_withdrawn',
        suppressed: 0,
        cancelled: 0,
        withdrawn: 0,
      })
      assert.equal((await replyOf(s.replyId))?.state, 'running')
      assert.equal(await erasureOf(s.replyId), undefined)
      await owner(`UPDATE sophia.source_objects SET scope='private' WHERE id=$1`, [dep.source_id])
      assert.deepEqual(await sourceOut(s.projectId, dep.source_id), {
        verdict: 'source_out',
        reason: 'source_out_of_scope',
        suppressed: 1,
        cancelled: 1,
        withdrawn: 0,
      })
      assert.deepEqual(
        [(await replyOf(s.replyId))?.reason, (await erasureOf(s.replyId))?.reason],
        ['source_out_of_scope', 'source_out_of_scope'],
      )
    })

    it('reaches a superseded attempt and the recorded one alike: both suppressed, both digests erased', async () => {
      const s = await recorded()
      // The ledger moves; the next claim supersedes attempt 1 and attempt 2 is recorded.
      await propose(s.projectId, A, { kind: 'lesson', statement: 'Keep it short' }, A)
      assert.equal((await assembleReply(loginUrl, s.replyId, LIMITS)).outcome, 'recorded')
      const one = await must(contextOf(s.replyId, 1), 'attempt 1')
      const two = await must(contextOf(s.replyId, 2), 'attempt 2')
      assert.deepEqual([one.state, one.scrubbed_by, two.state], ['superseded', 'superseded', 'recorded'])
      const dep = await dependency(s.replyId, s.constraint, 2)
      assert.ok(dep)
      await erase(s.projectId, dep.source_id)
      const v = await must(sourceOut(s.projectId, dep.source_id), 'source_out')
      assert.deepEqual([v.suppressed, v.cancelled], [2, 1])
      for (const [attempt, was] of [
        [1, one],
        [2, two],
      ] as const) {
        const e = await must(erasureOf(s.replyId, attempt), `erasure ${String(attempt)}`)
        const x = await must(contextOf(s.replyId, attempt), `context ${String(attempt)}`)
        assert.deepEqual([e.reason, x.context_hash, x.byte_length], ['source_withdrawn', e.tombstone, 0])
        assert.notEqual(x.context_hash, was.context_hash)
      }
    })

    it('a read message withdrawn after the terminal scrub: the digest still goes, once; a second cause changes nothing', async () => {
      const s = await running()
      await publish(s.replyId, 1, randomUUID(), 'Answered.')
      const was = await must(contextOf(s.replyId), 'context')
      assert.equal(was.body, null)
      await asActor(E, (c) => withdrawConversationMessage(c, s.conversationId, s.earlier[0] ?? '', randomUUID()))
      const e = await must(erasureOf(s.replyId), 'erasure')
      const x = await must(contextOf(s.replyId), 'context')
      assert.deepEqual([e.reason, x.context_hash, x.byte_length], ['message_withdrawn', e.tombstone, 0])
      assert.notEqual(e.tombstone, was.context_hash)
      const dep = await must(dependency(s.replyId, s.constraint), 'dependency')
      await erase(s.projectId, dep.source_id)
      await sourceOut(s.projectId, dep.source_id)
      assert.deepEqual(await erasureOf(s.replyId), e, 'the first cause stays the only one')
      assert.equal((await must(contextOf(s.replyId), 'context')).context_hash, e.tombstone)
    })
  })

  describe('a source’s withdrawal, later and further (CX-0102)', () => {
    const outOfPredicate: Array<[string, (id: string) => Promise<unknown>, string]> = [
      ['made ineligible', (id) => ineligible(id), 'source_withdrawn'],
      [
        'made private',
        (id) => owner(`UPDATE sophia.source_objects SET scope='private' WHERE id=$1`, [id]),
        'source_out_of_scope',
      ],
    ]
    for (const [name, change, reason] of outOfPredicate) {
      it(`a source ${name}, then erased: the retained hash becomes a tombstone then, once; nothing else moves`, async () => {
        const s = await running()
        const v = await publish(s.replyId, 1, randomUUID(), 'Read from it.')
        const dep = await must(dependency(s.replyId, s.constraint), 'dependency')
        await change(dep.source_id)
        await sourceOut(s.projectId, dep.source_id)
        const first = await must(suppressionOf(s.replyId), 'suppression')
        assert.deepEqual([first.reason, first.tombstone], [reason, null])
        assert.equal((await must(dependency(s.replyId, s.constraint), 'dependency')).sha256, dep.sha256)
        const erasure = await must(erasureOf(s.replyId), 'erasure')
        const withdrawnEvents = await events(s.projectId, 'conversation.message_withdrawn')
        // The source's text is erased now (0018): its hash changes, and the retained copy must not keep the old one.
        await erase(s.projectId, dep.source_id)
        await sourceOut(s.projectId, dep.source_id)
        const now = await must(suppressionOf(s.replyId), 'suppression')
        assert.ok(now.tombstone, 'the suppression takes a tombstone')
        assert.deepEqual({ ...now, tombstone: null }, first, 'its reason and time stay')
        const kept = await must(dependency(s.replyId, s.constraint), 'dependency')
        assert.equal(kept.sha256, now.tombstone)
        assert.notEqual(kept.sha256, dep.sha256)
        assert.notEqual(kept.sha256, (await must(sourceRow(dep.source_id), 'source')).sha256)
        assert.deepEqual(await erasureOf(s.replyId), erasure, 'the context’s erasure stays the first')
        assert.equal((await must(messageOf(v.answerId), 'message')).body, null, 'nothing restored')
        assert.equal(
          await events(s.projectId, 'conversation.message_withdrawn'),
          withdrawnEvents,
          'nothing more withdrawn',
        )
        await sourceOut(s.projectId, dep.source_id)
        assert.deepEqual(await suppressionOf(s.replyId), now, 'a third call changes nothing')
        assert.equal((await must(dependency(s.replyId, s.constraint), 'dependency')).sha256, now.tombstone)
      })
    }

    it('withdraws every answer derived from a withdrawn one, every hop, once; cancels what is open; leaves the ledger', async () => {
      // R1 reads the first mission's source S and is answered.
      const s = await running()
      const a1 = await publish(s.replyId, 1, randomUUID(), 'R1, read from the first mission.')
      const [mission] = await owner<{ source_id: string }>(
        `SELECT source_id FROM sophia.conversation_reply_sources WHERE reply_id=$1 AND kind='mission'`,
        [s.replyId],
      )
      assert.ok(mission)
      // A new mission is accepted: what is asked from now on no longer reads S, only R1's answer.
      await propose(s.projectId, A, { kind: 'mission', statement: 'Ship the list first', purpose: 'Find lists' }, A)
      const r2 = await askAgain(s)
      const reads2 = await readsOf(r2)
      assert.ok(!reads2.sources.includes(mission.source_id), 'R2 does not read S')
      assert.ok(reads2.messages.includes(a1.answerId), 'R2 reads R1’s answer')
      await grantFor(s.projectId)
      await reserveUncertain({ projectId: s.projectId, replyId: r2 })
      const ledger = await ledgerState(s.projectId, r2)
      const a2 = await publish(r2, 1, randomUUID(), 'R2, read from R1’s answer.')
      const r3 = await askAgain(s)
      assert.ok((await readsOf(r3)).messages.includes(a2.answerId), 'R3 reads R2’s answer')
      const a3 = await publish(r3, 1, randomUUID(), 'R3, read from R2’s answer.')
      const r4 = await askAgain(s, false)
      const withdrawnEvents = await events(s.projectId, 'conversation.message_withdrawn')
      // S is erased (0018), and its withdrawal reaches R1 directly, and through R1's answer, R2 and R3, and R4.
      await erase(s.projectId, mission.source_id)
      const v = await must(sourceOut(s.projectId, mission.source_id), 'source_out')
      assert.deepEqual([v.suppressed, v.withdrawn], [1, 1], 'one direct dependency, one answer withdrawn directly')
      for (const [reply, answerId, text] of [
        [s.replyId, a1.answerId, 'R1, read from the first mission.'],
        [r2, a2.answerId, 'R2, read from R1’s answer.'],
        [r3, a3.answerId, 'R3, read from R2’s answer.'],
      ] as const) {
        const m = await must(messageOf(answerId), 'message')
        const a = await must(answerOf(reply), 'answer')
        assert.deepEqual(
          [m.body, m.withdrawn_by, a.text_sha256, a.withdrawn_by],
          [null, 'source', null, 'source'],
          text,
        )
        const read = await withActor(
          api,
          E,
          'read',
          async (c) =>
            (
              await c.query<{ body: string | null }>('SELECT body FROM sophia.conversation_messages WHERE id=$1', [
                answerId,
              ])
            ).rows[0]?.body,
        )
        assert.equal(read, null, `a member reads no text: ${text}`)
        const replay = await publish(reply, 1, a.result_ref, text)
        assert.deepEqual([replay.verdict, replay.visible], ['answer_withdrawn', false], `replay: ${text}`)
        assert.equal(await sophiaMessages(reply), 1, `one message: ${text}`)
      }
      assert.deepEqual(await replyOf(r4), {
        state: 'cancelled',
        reason: 'source_withdrawn',
        answer_id: null,
        settled: true,
      })
      for (const reply of [r2, r3]) assert.equal((await must(erasureOf(reply), 'erasure')).reason, 'message_withdrawn')
      assert.equal(await events(s.projectId, 'conversation.message_withdrawn'), withdrawnEvents + 1, 'one event')
      assert.deepEqual(await ledgerState(s.projectId, r2), ledger, 'the uncertain call stays counted')
      const again = await must(sourceOut(s.projectId, mission.source_id), 'source_out')
      assert.deepEqual([again.suppressed, again.cancelled, again.withdrawn], [0, 0, 0])
      assert.equal(await events(s.projectId, 'conversation.message_withdrawn'), withdrawnEvents + 1)
    })
  })

  describe('a source’s withdrawal reaches a reply only through the attempt it stands on (r4241643132)', () => {
    /**
     * Attempt 1 reads the first mission's source (S) and the constraint's (C). A new mission is accepted, so the next
     * claim supersedes attempt 1, and attempt 2 is recorded reading C but not S.
     */
    async function superseded() {
      const s = await recorded()
      const [mission] = await owner<{ source_id: string }>(
        `SELECT source_id FROM sophia.conversation_reply_sources WHERE reply_id=$1 AND attempt=1 AND kind='mission'`,
        [s.replyId],
      )
      assert.ok(mission)
      await propose(s.projectId, A, { kind: 'mission', statement: 'Ship the list first', purpose: 'Find lists' }, A)
      assert.equal((await assembleReply(loginUrl, s.replyId, LIMITS)).outcome, 'recorded')
      const one = await must(contextOf(s.replyId, 1), 'attempt 1')
      const two = await must(contextOf(s.replyId, 2), 'attempt 2')
      assert.deepEqual([one.state, two.state], ['superseded', 'recorded'])
      const reads2 = await owner<{ s: string }>(
        'SELECT source_id::text AS s FROM sophia.conversation_reply_sources WHERE reply_id=$1 AND attempt=2',
        [s.replyId],
      )
      assert.ok(!reads2.some((r) => r.s === mission.source_id), 'attempt 2 does not read S')
      const c = await must(dependency(s.replyId, s.constraint, 2), 'attempt 2 reads C')
      assert.equal((await must(dependency(s.replyId, s.constraint, 1), 'attempt 1 reads C')).source_id, c.source_id)
      return { ...s, onlyOne: mission.source_id, both: c.source_id, two }
    }
    const suppressions = (replyId: string) =>
      owner<{ attempt: number; source_id: string; reason: string; tombstoned: boolean }>(
        `SELECT attempt, source_id::text, reason, tombstone IS NOT NULL AS tombstoned
           FROM sophia.conversation_reply_suppressions WHERE reply_id=$1 ORDER BY attempt, source_id`,
        [replyId],
      )
    /** Attempt 1 suppressed for S alone, its digest and length erased; attempt 2's kept. */
    async function onlyOneSuppressed(s: Awaited<ReturnType<typeof superseded>>) {
      assert.deepEqual(await suppressions(s.replyId), [
        { attempt: 1, source_id: s.onlyOne, reason: 'source_withdrawn', tombstoned: true },
      ])
      const e = await must(erasureOf(s.replyId, 1), 'erasure 1')
      const x = await must(contextOf(s.replyId, 1), 'context 1')
      assert.deepEqual([e.reason, x.context_hash, x.byte_length], ['source_withdrawn', e.tombstone, 0])
      assert.equal(await erasureOf(s.replyId, 2), undefined, 'attempt 2 keeps its digest')
    }

    it('answered from attempt 2: a source only superseded attempt 1 read leaves the answer; one attempt 2 read withdraws it', async () => {
      const s = await superseded()
      await owner(`UPDATE sophia.conversation_replies SET state='running' WHERE id=$1`, [s.replyId])
      await grantFor(s.projectId)
      await reserveUncertain(s)
      const ledger = await ledgerState(s.projectId, s.replyId)
      const text = 'Answered from attempt 2.'
      const v = await publish(s.replyId, 2, randomUUID(), text)
      assert.deepEqual([v.verdict, v.attempt], ['published', 2])
      const two = await must(contextOf(s.replyId, 2), 'attempt 2, scrubbed at answered')
      const withdrawnEvents = await events(s.projectId, 'conversation.message_withdrawn')
      await erase(s.projectId, s.onlyOne)
      assert.deepEqual(await sourceOut(s.projectId, s.onlyOne), {
        verdict: 'source_out',
        reason: 'source_withdrawn',
        suppressed: 1,
        cancelled: 0,
        withdrawn: 0,
      })
      await onlyOneSuppressed(s)
      assert.deepEqual(await contextOf(s.replyId, 2), two)
      assert.deepEqual(
        [(await messageOf(v.answerId))?.body, (await messageOf(v.answerId))?.withdrawn_by],
        [text, null],
        'the answer stands',
      )
      assert.deepEqual(
        [(await answerOf(s.replyId))?.text_sha256, (await answerOf(s.replyId))?.withdrawn_by],
        [sha256(text), null],
      )
      assert.equal((await replyOf(s.replyId))?.state, 'answered')
      assert.equal(await events(s.projectId, 'conversation.message_withdrawn'), withdrawnEvents)
      assert.deepEqual(
        { ...(await check(s.replyId, 2)), contextChanged: null },
        { verdict: 'ok', reason: null, contextChanged: null, state: 'answered' },
      )
      const replay = await publish(s.replyId, 2, v.resultRef, text)
      assert.deepEqual([replay.verdict, replay.visible], ['already_answered', true])
      // The control: C, which attempt 2 read too, withdraws the answer (attempt 1's dependency on it is suppressed too).
      await erase(s.projectId, s.both)
      assert.deepEqual(await sourceOut(s.projectId, s.both), {
        verdict: 'source_out',
        reason: 'source_withdrawn',
        suppressed: 2,
        cancelled: 0,
        withdrawn: 1,
      })
      assert.deepEqual(
        [(await messageOf(v.answerId))?.body, (await messageOf(v.answerId))?.withdrawn_by],
        [null, 'source'],
      )
      assert.deepEqual(
        [(await answerOf(s.replyId))?.text_sha256, (await answerOf(s.replyId))?.withdrawn_by],
        [null, 'source'],
      )
      assert.equal(await events(s.projectId, 'conversation.message_withdrawn'), withdrawnEvents + 1)
      assert.equal((await must(erasureOf(s.replyId, 2), 'erasure 2')).reason, 'source_withdrawn')
      assert.deepEqual(await ledgerState(s.projectId, s.replyId), ledger, 'the uncertain call stays counted')
    })

    for (const state of ['pending', 'running'] as const) {
      it(`${state} on recorded attempt 2: a source only superseded attempt 1 read leaves it ${state}; one attempt 2 read cancels it`, async () => {
        const s = await superseded()
        if (state === 'running') {
          await owner(`UPDATE sophia.conversation_replies SET state='running' WHERE id=$1`, [s.replyId])
          await grantFor(s.projectId)
          await reserveUncertain(s)
        }
        const ledger = await ledgerState(s.projectId, s.replyId)
        await erase(s.projectId, s.onlyOne)
        assert.deepEqual(await sourceOut(s.projectId, s.onlyOne), {
          verdict: 'source_out',
          reason: 'source_withdrawn',
          suppressed: 1,
          cancelled: 0,
          withdrawn: 0,
        })
        await onlyOneSuppressed(s)
        assert.deepEqual(await replyOf(s.replyId), { state, reason: null, answer_id: null, settled: false })
        assert.deepEqual(await contextOf(s.replyId, 2), s.two, 'attempt 2 untouched: its body, digest and length')
        assert.equal((await check(s.replyId, 2))?.verdict, 'ok')
        // The control: C, which recorded attempt 2 read too, cancels the reply.
        await erase(s.projectId, s.both)
        assert.deepEqual(await sourceOut(s.projectId, s.both), {
          verdict: 'source_out',
          reason: 'source_withdrawn',
          suppressed: 2,
          cancelled: 1,
          withdrawn: 0,
        })
        assert.deepEqual(await replyOf(s.replyId), {
          state: 'cancelled',
          reason: 'source_withdrawn',
          answer_id: null,
          settled: true,
        })
        const e = await must(erasureOf(s.replyId, 2), 'erasure 2')
        const x = await must(contextOf(s.replyId, 2), 'context 2')
        assert.deepEqual([x.body, e.reason, x.context_hash, x.byte_length], [null, 'source_withdrawn', e.tombstone, 0])
        assert.deepEqual(await ledgerState(s.projectId, s.replyId), ledger, 'the ledger stays as it was')
      })
    }
  })

  describe('a rollback keeps read and erase access', () => {
    it('source_out rolled back: the answer stays readable by members, and withdrawable and erasable through 0063', async () => {
      const s = await running()
      const v = await publish(s.replyId, 1, randomUUID(), 'Still here.')
      const dep = await must(dependency(s.replyId, s.constraint), 'dependency')
      const was = await must(contextOf(s.replyId), 'context')
      const { c } = await client()
      await c.query('BEGIN')
      await c.query('SELECT sophia.mission_erase_source($1, $2)', [s.projectId, dep.source_id])
      assert.equal((await must(sourceOut(s.projectId, dep.source_id, c), 'source_out')).withdrawn, 1)
      await c.query('ROLLBACK')
      assert.equal((await must(messageOf(v.answerId), 'message')).body, 'Still here.')
      assert.equal((await must(answerOf(s.replyId), 'answer')).text_sha256, sha256('Still here.'))
      assert.deepEqual(await contextOf(s.replyId), was)
      assert.equal((await must(dependency(s.replyId, s.constraint), 'dependency')).sha256, dep.sha256)
      assert.equal(await erasureOf(s.replyId), undefined)
      const read = await withActor(
        api,
        E,
        'read',
        async (cl) =>
          (
            await cl.query<{ body: string | null }>('SELECT body FROM sophia.conversation_messages WHERE id=$1', [
              v.answerId,
            ])
          ).rows[0]?.body,
      )
      assert.equal(read, 'Still here.', 'a member reads it')
      await asActor(A, (cl) => withdrawConversationMessage(cl, s.conversationId, v.answerId, randomUUID()))
      assert.equal((await answerOf(s.replyId))?.withdrawn_by, 'admin')
      await asActor(A, (cl) => eraseConversation(cl, s.conversationId, randomUUID()))
      assert.equal((await erasureOf(s.replyId))?.reason, 'message_withdrawn')
    })

    it('a publication rolled back leaves nothing: still running, the context intact, and it publishes after', async () => {
      const s = await running()
      const x = await contextOf(s.replyId)
      const { c } = await client()
      await c.query('BEGIN')
      assert.equal((await publish(s.replyId, 1, randomUUID(), 'Not yet.', c)).verdict, 'published')
      await c.query('ROLLBACK')
      assert.equal(await sophiaMessages(s.replyId), 0)
      assert.equal(await answerOf(s.replyId), undefined)
      assert.equal((await replyOf(s.replyId))?.state, 'running')
      assert.deepEqual(await contextOf(s.replyId), x)
      assert.equal((await publish(s.replyId, 1, randomUUID(), 'Now.')).verdict, 'published')
    })
  })

  describe('concurrency: the verdict holds from the check to the insert', () => {
    it('a source change first, uncommitted: publication waits on the source row, then refuses', async () => {
      const s = await running()
      const dep = await dependency(s.replyId, s.constraint)
      const w = await client()
      await w.c.query('BEGIN')
      await w.c.query(
        `UPDATE sophia.source_objects SET eligible=false, eligibility_revision=eligibility_revision+1 WHERE id=$1`,
        [dep?.source_id],
      )
      const p = await client()
      const pending = publish(s.replyId, 1, randomUUID(), 'Too late.', p.c)
      await waitFor('publication waiting on the source row', () => waiting(p.pid))
      await w.c.query('COMMIT')
      assert.deepEqual(await pending, { verdict: 'cancelled', reason: 'source_withdrawn' })
      assert.equal(await sophiaMessages(s.replyId), 0)
    })

    it('a publication first, open: the source change waits until it commits, and source_out then withdraws the answer', async () => {
      const s = await running()
      const dep = await dependency(s.replyId, s.constraint)
      const p = await client()
      await p.c.query('BEGIN')
      const v = await publish(s.replyId, 1, randomUUID(), 'First.', p.c)
      assert.equal(v.verdict, 'published')
      const w = await client()
      const change = w.c.query(
        `UPDATE sophia.source_objects SET eligible=false, eligibility_revision=eligibility_revision+1 WHERE id=$1`,
        [dep?.source_id],
      )
      await waitFor('the source change waiting on the publication', () => waiting(w.pid))
      await p.c.query('COMMIT')
      await change
      assert.equal((await messageOf(v.answerId))?.body, 'First.', 'published before the change')
      assert.equal((await sourceOut(s.projectId, dep?.source_id ?? ''))?.withdrawn, 1)
      assert.equal((await messageOf(v.answerId))?.body, null)
    })

    it('the asker’s removal first: publication waits on the membership row, then refuses; publication first: it stands', async () => {
      const s = await running()
      const m = await client()
      await m.c.query('BEGIN')
      await m.c.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
        s.projectId,
        E,
      ])
      const p = await client()
      const pending = publish(s.replyId, 1, randomUUID(), 'Too late.', p.c)
      await waitFor('publication waiting on the membership row', () => waiting(p.pid))
      await m.c.query('COMMIT')
      assert.deepEqual(await pending, { verdict: 'cancelled', reason: 'asker_removed' })
      const t = await running()
      const q = await client()
      await q.c.query('BEGIN')
      const v = await publish(t.replyId, 1, randomUUID(), 'In time.', q.c)
      const n = await client()
      const removal = n.c.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
        t.projectId,
        E,
      ])
      await waitFor('the removal waiting on the publication', () => waiting(n.pid))
      await q.c.query('COMMIT')
      await removal
      assert.equal((await messageOf(v.answerId))?.body, 'In time.', 'a published answer follows its current audience')
    })

    it('a withdrawal through 0063 first: publication waits on the project, then finds the reply cancelled; publication first: 0063 withdraws the answer', async () => {
      const s = await running()
      const w = await client()
      await w.c.query('BEGIN')
      await w.c.query(`SELECT set_config('sophia.actor_id', $1, true)`, [E])
      await w.c.query('SELECT sophia.withdraw_conversation_message($1, $2, $3)', [
        s.conversationId,
        s.earlier[0],
        randomUUID(),
      ])
      const p = await client()
      const pending = publish(s.replyId, 1, randomUUID(), 'x', p.c)
      await waitFor('publication waiting on the project', () => waiting(p.pid))
      await w.c.query('COMMIT')
      assert.deepEqual(await pending, { verdict: 'not_running', state: 'cancelled' })
      const t = await running()
      const q = await client()
      await q.c.query('BEGIN')
      const v = await publish(t.replyId, 1, randomUUID(), 'In time.', q.c)
      const u = await client()
      await u.c.query('BEGIN')
      await u.c.query(`SELECT set_config('sophia.actor_id', $1, true)`, [E])
      const withdrawal = u.c.query('SELECT sophia.withdraw_conversation_message($1, $2, $3)', [
        t.conversationId,
        t.earlier[0],
        randomUUID(),
      ])
      await waitFor('the withdrawal waiting on the publication', () => waiting(u.pid))
      await q.c.query('COMMIT')
      await withdrawal
      await u.c.query('COMMIT')
      assert.deepEqual(
        [(await messageOf(v.answerId))?.body, (await answerOf(t.replyId))?.withdrawn_by],
        [null, 'source'],
      )
      assert.equal((await erasureOf(t.replyId))?.reason, 'message_withdrawn')
    })
  })

  describe('the allowance ledger (S2) is never touched', () => {
    it('an uncertain reservation stays exactly as it was through publication, replay, source_out and re-eligibility', async () => {
      const s = await running()
      await grantFor(s.projectId)
      await reserveUncertain(s)
      const was = await ledgerState(s.projectId, s.replyId)
      assert.equal((was.reservations[0] as { r: { state: string } } | undefined)?.r.state, 'uncertain')
      const result = randomUUID()
      await publish(s.replyId, 1, result, 'Answered while a call is uncertain.')
      assert.deepEqual(await ledgerState(s.projectId, s.replyId), was, 'publication')
      await publish(s.replyId, 1, result, 'Answered while a call is uncertain.')
      assert.deepEqual(await ledgerState(s.projectId, s.replyId), was, 'replay')
      const dep = await dependency(s.replyId, s.constraint)
      await ineligible(dep?.source_id ?? '')
      await sourceOut(s.projectId, dep?.source_id ?? '')
      assert.deepEqual(await ledgerState(s.projectId, s.replyId), was, 'source_out')
      await owner(`UPDATE sophia.source_objects SET eligible=true WHERE id=$1`, [dep?.source_id])
      await publish(s.replyId, 1, result, 'Answered while a call is uncertain.')
      assert.deepEqual(await ledgerState(s.projectId, s.replyId), was, 're-eligibility and replay')
      // A lost execution (outcome_unknown) is refused, and its uncertain call stays counted.
      const t = await running()
      await grantFor(t.projectId)
      await reserveUncertain(t)
      await owner(`UPDATE sophia.conversation_replies SET state='outcome_unknown', settled_at=now() WHERE id=$1`, [
        t.replyId,
      ])
      const lost = await ledgerState(t.projectId, t.replyId)
      assert.deepEqual(await publish(t.replyId, 1, randomUUID(), 'x'), {
        verdict: 'not_running',
        state: 'outcome_unknown',
      })
      assert.deepEqual(await ledgerState(t.projectId, t.replyId), lost)
    })
  })

  describe('an answer publication can’t take is refused, never published (G2_CON_ONLY_PLAN Step B)', () => {
    it('refuses each of the three: failed with the reason, nothing published, S3’s scrub kept with its trigger enabled; a replay changes nothing', async () => {
      assert.equal(await scrubTrigger(), 'O')
      for (const reason of ['answer_empty', 'answer_too_long', 'answer_invalid_text']) {
        const s = await running()
        const was = await governed(s.replyId)
        assert.deepEqual(
          was.contexts.map((x) => [x.state, x.body, x.by]),
          [['recorded', true, null]],
        )
        assert.ok(was.messageHashes > 0 && was.messageHashes === was.messages)
        assert.deepEqual(await refuse(s.replyId, 1, reason), { verdict: 'refused', state: 'failed', reason })
        assert.deepEqual(await replyOf(s.replyId), { state: 'failed', reason, answer_id: null, settled: true })
        assert.equal(await sophiaMessages(s.replyId), 0, 'no message')
        assert.equal(await answerOf(s.replyId), undefined, 'no answer')
        const now = await governed(s.replyId)
        // S3's governed cleanup at a terminal move: the body and the message hashes go; state, hash, sources stay.
        assert.deepEqual(
          now.contexts.map((x) => [x.state, x.body, x.by, x.hash]),
          was.contexts.map((x) => ['recorded', false, 'reply_ended', x.hash]),
        )
        assert.deepEqual(
          [now.messageHashes, now.messages, now.sources, now.suppressions],
          [0, was.messages, was.sources, 0],
        )
        assert.deepEqual(await refuse(s.replyId, 1, reason), { verdict: 'unchanged', state: 'failed', reason })
        assert.deepEqual(await governed(s.replyId), now, 'a replay scrubs nothing further')
      }
      assert.equal(await scrubTrigger(), 'O')
    })

    it('refuses an unknown reason, a missing attempt and a call outside READ COMMITTED; changes nothing', async () => {
      const s = await running()
      const was = await governed(s.replyId)
      assert.equal(await refusal(refuse(s.replyId, 1, 'answer_unknown')), 'invalid_input')
      assert.equal(await refusal(refuse(s.replyId, null, 'answer_empty')), 'invalid_input')
      const r = await client()
      await r.c.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
      assert.equal(await refusal(refuse(s.replyId, 1, 'answer_empty', r.c)), 'read_committed_required')
      await r.c.query('ROLLBACK')
      assert.deepEqual(await replyOf(s.replyId), { state: 'running', reason: null, answer_id: null, settled: false })
      assert.deepEqual(await governed(s.replyId), was)
    })

    it('leaves a reply already ended, and an attempt the reply no longer stands on, as they are', async () => {
      const s = await running()
      await asActor(E, (c) => withdrawConversationMessage(c, s.conversationId, s.earlier[0] ?? '', randomUUID()))
      const ended = await must(replyOf(s.replyId), 'reply')
      assert.equal(ended.state, 'cancelled')
      const kept = await governed(s.replyId)
      assert.deepEqual(await refuse(s.replyId, 1, 'answer_empty'), {
        verdict: 'unchanged',
        state: 'cancelled',
        reason: ended.reason,
      })
      assert.deepEqual([await replyOf(s.replyId), await governed(s.replyId)], [ended, kept])
      const t = await onSecondAttempt()
      assert.deepEqual(await refuse(t.replyId, 1, 'answer_too_long'), {
        verdict: 'unchanged',
        state: 'running',
        reason: null,
      })
      assert.equal((await replyOf(t.replyId))?.state, 'running')
      assert.deepEqual(await refuse(t.replyId, 2, 'answer_too_long'), {
        verdict: 'refused',
        state: 'failed',
        reason: 'answer_too_long',
      })
    })

    it('against publication, and against a withdrawal through 0063, in both orders under a held lock: one outcome each', async () => {
      const s = await running()
      const p = await client()
      await p.c.query('BEGIN')
      const v = await publish(s.replyId, 1, randomUUID(), 'In time.', p.c)
      const r = await client()
      const refused = refuse(s.replyId, 1, 'answer_empty', r.c)
      await waitFor('the refusal waiting on the publication', () => waiting(r.pid))
      await p.c.query('COMMIT')
      assert.deepEqual(await refused, { verdict: 'unchanged', state: 'answered', reason: null })
      assert.equal((await answerOf(s.replyId))?.answer_id, v.answerId)

      const t = await running()
      const q = await client()
      await q.c.query('BEGIN')
      assert.deepEqual(await refuse(t.replyId, 1, 'answer_too_long', q.c), {
        verdict: 'refused',
        state: 'failed',
        reason: 'answer_too_long',
      })
      const u = await client()
      const published = publish(t.replyId, 1, randomUUID(), 'Too late.', u.c)
      await waitFor('the publication waiting on the refusal', () => waiting(u.pid))
      await q.c.query('COMMIT')
      assert.deepEqual(await published, { verdict: 'not_running', state: 'failed' })
      assert.equal(await sophiaMessages(t.replyId), 0)

      const w = await running()
      const x = await client()
      await x.c.query('BEGIN')
      await x.c.query(`SELECT set_config('sophia.actor_id', $1, true)`, [E])
      await x.c.query('SELECT sophia.withdraw_conversation_message($1, $2, $3)', [
        w.conversationId,
        w.earlier[0],
        randomUUID(),
      ])
      const y = await client()
      const late = refuse(w.replyId, 1, 'answer_invalid_text', y.c)
      await waitFor('the refusal waiting on the withdrawal', () => waiting(y.pid))
      await x.c.query('COMMIT')
      const cancelled = await must(replyOf(w.replyId), 'reply')
      assert.equal(cancelled.state, 'cancelled')
      assert.deepEqual(await late, { verdict: 'unchanged', state: 'cancelled', reason: cancelled.reason })

      const z = await running()
      const k = await client()
      await k.c.query('BEGIN')
      await refuse(z.replyId, 1, 'answer_empty', k.c)
      const m = await client()
      await m.c.query('BEGIN')
      await m.c.query(`SELECT set_config('sophia.actor_id', $1, true)`, [E])
      const withdrawal = m.c.query('SELECT sophia.withdraw_conversation_message($1, $2, $3)', [
        z.conversationId,
        z.earlier[0],
        randomUUID(),
      ])
      await waitFor('the withdrawal waiting on the refusal', () => waiting(m.pid))
      await k.c.query('COMMIT')
      await withdrawal
      await m.c.query('COMMIT')
      assert.deepEqual(await replyOf(z.replyId), {
        state: 'failed',
        reason: 'answer_empty',
        answer_id: null,
        settled: true,
      })
      assert.equal((await messageOf(z.earlier[0] ?? ''))?.body, null, 'the withdrawal still went through')
    })

    it('publication’s own bounds stand beside it: 1 and 16,000 characters publish, as U+0001 and outside the BMP; 0 and 16,001 raise', async () => {
      const astral = '\u{1F600}'
      for (const text of ['x', '\u0001'.repeat(16000), astral.repeat(16000)]) {
        const s = await running()
        const v = await publish(s.replyId, 1, randomUUID(), text)
        const label = `${String(Array.from(text).length)} characters, ${String(text.length)} UTF-16 units`
        assert.equal(v.verdict, 'published', label)
        assert.equal((await messageOf(v.answerId))?.body === text, true, label)
      }
      const s = await running()
      for (const text of ['', '\u0001'.repeat(16001), astral.repeat(16001)])
        assert.equal(
          await refusal(publish(s.replyId, 1, randomUUID(), text)),
          'invalid_input',
          `${String(Array.from(text).length)} characters`,
        )
      assert.deepEqual(await replyOf(s.replyId), { state: 'running', reason: null, answer_id: null, settled: false })
    })
  })

  describe('a source’s dependencies are found by an index, not a scan (G2_CON_ONLY_PLAN Step A)', () => {
    it('plans source_out’s own dependency query on conversation_reply_sources_by_source, custom and generic, in few buffers', async () => {
      // Another database, so its fixture rows reach no other test. S1 to N4 are applied in one transaction, rolled back
      // at the end. Q13 forbids adopting the role's authority from another database: a temporary name parks this
      // database's installed role and a fresh bare role is created for the isolated candidate, all rolled back.
      const other = await createConversationCandidateDatabase()
      const projectId = (await seedProject(other.ownerUrl, { admin: A })).projectId
      const elsewhere = (await seedProject(other.ownerUrl, { admin: A })).projectId
      const c = new pg.Client({ connectionString: other.ownerUrl })
      await c.connect()
      const plans: string[] = []
      c.on('notice', (n) => {
        const text = n.message ?? ''
        if (text.includes('"Query Text"')) plans.push(text.slice(text.indexOf('{')))
      })
      const outcomes: string[] = []
      try {
        await withClusterMigrationLock(async () => {
          await c.query('BEGIN')
          try {
            await c.query(`ALTER ROLE ${ROLE} RENAME TO con01_fences_installed`)
            for (const name of [...BEFORE_N4, N4]) await c.query(candidate(name))
            const { read, unread } = await sourceKeyFixture(c, projectId, elsewhere)
            await explainNested(c)
            for (const mode of ['force_custom_plan', 'force_generic_plan'])
              for (const [label, source] of [
                ['three dependencies', read],
                ['none', unread],
              ] as const)
                outcomes.push(`${mode}, ${label}: ${await sourceOutPlan(c, plans, mode, projectId, source)}`)
          } finally {
            await c.query('ROLLBACK')
          }
        })
      } finally {
        await c.end()
        await other.drop()
      }
      const good = 'no scan of the table; by conversation_reply_sources_by_source; at most 32 buffers'
      assert.deepEqual(outcomes, [
        `force_custom_plan, three dependencies: ${good}`,
        `force_custom_plan, none: ${good}`,
        `force_generic_plan, three dependencies: ${good}`,
        `force_generic_plan, none: ${good}`,
      ])
    })
  })

  describe('no operational row', () => {
    it('writes no command, job, attempt, binding, outbox, runtime, observation or usage row', async () => {
      assert.deepEqual(await untouched(), untouchedBefore)
    })
  })
})
