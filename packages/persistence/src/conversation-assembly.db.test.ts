// CON-01 G2-S3 (CX-0094 N2): a reply's context, assembled and recorded, through the review-only candidate
// db/candidates/con01-s3-conversation-reply-context.sql, applied here after every migration and the S1 and S2 candidates
// to a disposable database. Level: L1 sql-run on a disposable PostgreSQL 16. Requests are put in `pending` and other
// states by the owner here, because no runtime path writes them yet; that is this test's setup, not a path the candidate
// offers. The assembler role and an owner-made test login exist only for this file and are removed after it. Nothing
// here dispatches, answers, reserves or calls a model.
import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import pg from 'pg'
import type { MissionProposalRequest } from '@sophia/contracts'
import { createTestDatabase, seedProject, withClusterMigrationLock, type TestDatabase } from '@sophia/test-support'
import {
  assembleReply,
  checkedLimits,
  recordPayload,
  renderBound,
  type AssemblyLimits,
  type Binding,
} from './conversation-assembly.ts'
import { renderConversationContext, TEMPLATES, type ContextMessage, type TemplateId } from './conversation-context.ts'
import { readMissionContext } from './mission-context.ts'
import {
  createPool,
  decideMissionChange,
  eraseConversation,
  proposeMissionChange,
  recordMissionEntry,
  sendConversationMessage,
  startConversation,
  withActor,
  withdrawConversationMessage,
} from './index.ts'

const candidate = (name: string) => readFileSync(new URL(`../../../db/candidates/${name}`, import.meta.url), 'utf8')
const CANDIDATES = [
  'con01-s1-reply-states.sql',
  'con01-s2-conversation-reply-ledger.sql',
  'con01-s3-conversation-reply-context.sql',
]
const ROLE = 'sophia_conversation_assembler'
const AS_ASSEMBLER = `SET LOCAL ROLE ${ROLE}`
const APP = 'sophia-conversation-assembler'

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
const C = randomUUID() // editor

/** Every entry point and helper the candidate adds, and the five its role may execute. */
const ADDED_FUNCTIONS = [
  'sophia.conversation_assembly_begin(uuid,integer,uuid)',
  'sophia.conversation_assembly_claim(uuid,integer)',
  'sophia.conversation_assembly_close(uuid,integer,uuid,text)',
  'sophia.conversation_assembly_current(sophia.conversation_replies,integer,uuid)',
  'sophia.conversation_assembly_fail(uuid,integer,uuid,text)',
  'sophia.conversation_assembly_locked(uuid,boolean)',
  'sophia.conversation_assembly_privacy(sophia.conversation_replies)',
  'sophia.conversation_context_current(sophia.conversation_reply_contexts)',
  'sophia.conversation_context_decision(sophia.projects,text,text)',
  'sophia.conversation_context_fields(jsonb)',
  'sophia.conversation_context_grammar()',
  'sophia.conversation_context_kept()',
  'sophia.conversation_context_list(jsonb,integer,integer,bigint,boolean,boolean)',
  'sophia.conversation_context_message(sophia.conversation_replies,uuid,boolean)',
  'sophia.conversation_context_message_scrubbed()',
  'sophia.conversation_context_mission(sophia.projects)',
  'sophia.conversation_context_quoted(text)',
  'sophia.conversation_context_reply_scrubbed()',
  'sophia.conversation_context_scrub(uuid,uuid,integer,text)',
  'sophia.conversation_context_template(text,jsonb)',
  'sophia.conversation_context_time(timestamp with time zone)',
  'sophia.conversation_record_context(uuid,integer,uuid,jsonb)',
]
const ENTRY_POINTS = [
  'sophia.conversation_assembly_begin(uuid,integer,uuid)',
  'sophia.conversation_assembly_claim(uuid,integer)',
  'sophia.conversation_assembly_close(uuid,integer,uuid,text)',
  'sophia.conversation_assembly_fail(uuid,integer,uuid,text)',
  'sophia.conversation_record_context(uuid,integer,uuid,jsonb)',
]
const ADDED_TABLES = [
  'conversation_assembly_claims',
  'conversation_reply_contexts',
  'conversation_reply_messages',
  'conversation_reply_sources',
]
const ADDED_INDEXES = [
  'conversation_assembly_claims_lease_token_key',
  'conversation_assembly_claims_pkey',
  'conversation_reply_contexts_pkey',
  'conversation_reply_contexts_recorded',
  'conversation_reply_messages_by_message',
  'conversation_reply_messages_pkey',
  'conversation_reply_sources_pkey',
]
const ADDED_TRIGGERS = [
  'conversation_assembly_claims_kept on conversation_assembly_claims',
  'conversation_context_message_scrub on conversation_messages',
  'conversation_context_reply_scrub on conversation_replies',
  'conversation_context_tables_kept on conversation_assembly_claims',
  'conversation_context_tables_kept on conversation_reply_contexts',
  'conversation_context_tables_kept on conversation_reply_messages',
  'conversation_context_tables_kept on conversation_reply_sources',
  'conversation_reply_contexts_kept on conversation_reply_contexts',
  'conversation_reply_messages_kept on conversation_reply_messages',
  'conversation_reply_sources_kept on conversation_reply_sources',
]
/**
 * The cluster-global group roles migration 0002 creates when they are missing. A fresh cluster gains them with the first
 * test database, and the harness never drops them.
 */
const MIGRATION_ROLES = ['sophia_api', 'sophia_worker']
/** A test database's own logins (test-support's createTestDatabase), this file's or another file's running alongside. */
const TEST_LOGIN = /^sophia_(api|worker)_t_[0-9a-f]{12}$/
/** Rows of the runtime, the model and the allowance: none is ever written here. */
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
  'conversation_grants',
  'conversation_reply_allowances',
  'conversation_reservations',
]

interface Verdict {
  verdict: string
  attempt: number
  token: string
  leaseExpiresAt: string
  reason: string
  state: string
  contextHash: string
  byteLength: number
  projectId: string
  conversationId: string
  askedBy: string
  messageId: string
  cutoffSeq: number
  earlierCount: number
  window: string[]
}

interface Context {
  attempt: number
  state: string
  body: string | null
  byte_length: number
  renderer: string
  compiler: string
  predicate: string
  trusted: string[]
  mission_revision: string
  ledger_revision: string
  eligibility_revision: string
  audience_revision: string
  erasure_revision: string
  cutoff_seq: string
  earlier_count: string
  included: number
  from_seq: string | null
  coverage: unknown
  fragments: Array<Record<string, unknown>>
  context_hash: string
  scrubbed_at: Date | null
  scrubbed_by: string | null
}

interface Claim {
  attempt: number
  outcome: string | null
  outcome_reason: string | null
  begun: boolean
  window_ids: string[] | null
}

interface Fragment {
  kind: string
  id: string
  item?: string
  args?: number[]
  text: string
  extra?: number
}

interface Payload {
  compiler: string
  renderer: string
  text: string
  fragments: Fragment[]
  coverage: {
    constraints: { compiled: number; included: number; omitted: number; mayBeMore: boolean }
    pending: { compiled: number; included: number; omitted: number; mayBeMore: boolean }
    messages: { read: number; included: number; omitted: number; fromSeq: number | null; cutoffSeq: number }
  }
  revisions: { mission: number; ledger: number; eligibility: number }
}

interface Scene {
  projectId: string
  conversationId: string
  replyId: string
  askId: string
  /** The earlier messages, oldest first. */
  earlier: string[]
}

let db: TestDatabase
let ownerPool: pg.Pool
let api: pg.Pool
let loginUrl: string
let loginRole: string
let assemblerPool: pg.Pool
let rolesBefore: string[]
let assemblerExisted: boolean
const adminUrl = process.env.SOPHIA_DISPOSABLE_DATABASE_URL ?? ''

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

const roleNames = async () =>
  (await onAdmin<{ r: string }>('SELECT rolname AS r FROM pg_roles ORDER BY 1')).map((x) => x.r)

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

/** A promise settled from outside: a held transaction's gate. */
function gate(): { open: () => void; wait: Promise<void> } {
  const { promise, resolve } = Promise.withResolvers<void>()
  return { open: () => resolve(), wait: promise }
}

const asActor = <T>(actor: string, fn: (c: pg.PoolClient) => Promise<T>) => withActor(api, actor, 'write', fn)

async function waiting(pid: number): Promise<boolean> {
  const [row] = await owner<{ w: string | null }>('SELECT wait_event_type AS w FROM pg_stat_activity WHERE pid = $1', [
    pid,
  ])
  return row?.w === 'Lock'
}

async function alive(pid: number): Promise<boolean> {
  return (await owner('SELECT 1 FROM pg_stat_activity WHERE pid = $1', [pid])).length > 0
}

// --- Scenes ---------------------------------------------------------------------------------------------------------

async function newProject(): Promise<string> {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E, B, C] })
  await owner(`SELECT sophia.set_conversation_settings($1, 'enabled', 'CON-01 N2 test')`, [projectId])
  return projectId
}

/** A proposal by `actor`, accepted by `decider` unless null. */
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

/** An accepted mission (by A), an accepted constraint and lesson, and a constraint waiting (E's). */
async function ledger(projectId: string) {
  const mission = await propose(
    projectId,
    A,
    { kind: 'mission', statement: 'Ship the map first', purpose: 'People find places', origin: 'Field notes' },
    A,
  )
  const constraint = await propose(projectId, A, { kind: 'constraint', statement: 'Map before list' }, A)
  const lesson = await propose(projectId, A, { kind: 'lesson', statement: 'Ask before building' }, A)
  const pending = await propose(projectId, E, { kind: 'constraint', statement: 'Briefs stay on one page' }, null)
  return { mission, constraint, lesson, pending }
}

async function ask(
  projectId: string,
  conversationId: string,
  text: string,
): Promise<{ replyId: string; askId: string }> {
  const r = await asActor(E, (c) =>
    sendConversationMessage(c, conversationId, randomUUID(), { text, askSophia: true }, 'Lucía'),
  )
  assert.ok(r.replyId)
  await owner(`UPDATE sophia.conversation_replies SET state='pending', reason=NULL, settled_at=NULL WHERE id=$1`, [
    r.replyId,
  ])
  void projectId
  return { replyId: r.replyId, askId: r.messageId }
}

/** A conversation with `earlier` messages before the asking one (E's, or Sophia's every fifth), the request pending. */
async function conversation(projectId: string, earlier: number, bulk = 0): Promise<Scene> {
  const first = await asActor(E, (c) =>
    startConversation(c, projectId, randomUUID(), { title: 'Plan', text: 'Words 1', askSophia: false }, 'Lucía'),
  )
  const ids = [first.messageId]
  for (let i = 2; i <= earlier; i++) {
    const sent = await asActor(i % 2 === 0 ? E : B, (c) =>
      sendConversationMessage(
        c,
        first.conversationId,
        randomUUID(),
        { text: `Words ${String(i)}`, askSophia: false },
        i % 2 === 0 ? 'Lucía' : 'Bo',
      ),
    )
    ids.push(sent.messageId)
  }
  if (bulk > 0) await bulkMessages(projectId, first.conversationId, bulk)
  const { replyId, askId } = await ask(projectId, first.conversationId, 'What should we decide?')
  return { projectId, conversationId: first.conversationId, replyId, askId, earlier: ids }
}

/** `n` member messages written by the owner after the last one, in order: a large history in one statement. */
async function bulkMessages(projectId: string, conversationId: string, n: number): Promise<void> {
  await owner(
    `WITH c AS (UPDATE sophia.conversations SET message_seq = message_seq + $3 WHERE project_id = $1 AND id = $2
                RETURNING message_seq - $3 AS base)
     INSERT INTO sophia.conversation_messages(project_id, conversation_id, seq, author, actor_id, author_name, body)
     SELECT $1, $2, c.base + s, 'member', $4, 'Bulk', 'Bulk ' || (c.base + s) FROM c, generate_series(1, $3::bigint) s`,
    [projectId, conversationId, n, E],
  )
}

async function scene(earlier = 5): Promise<Scene & Awaited<ReturnType<typeof ledger>>> {
  const projectId = await newProject()
  const decisions = await ledger(projectId)
  return { ...(await conversation(projectId, earlier)), ...decisions }
}

const contexts = (replyId: string) =>
  owner<Context>(
    `SELECT attempt, state, body, byte_length, renderer, compiler, predicate, trusted, mission_revision, ledger_revision,
            eligibility_revision, audience_revision, erasure_revision, cutoff_seq, earlier_count, included, from_seq,
            coverage, fragments, context_hash, scrubbed_at, scrubbed_by
       FROM sophia.conversation_reply_contexts WHERE reply_id = $1 ORDER BY attempt`,
    [replyId],
  )

const claims = (replyId: string) =>
  owner<Claim>(
    `SELECT attempt, outcome, outcome_reason, begun_xid IS NOT NULL AS begun, window_ids::text[] AS window_ids
       FROM sophia.conversation_assembly_claims WHERE reply_id = $1 ORDER BY attempt`,
    [replyId],
  )

const replyOf = async (replyId: string) =>
  (
    await owner<{ state: string; reason: string | null; settled: boolean }>(
      'SELECT state, reason, settled_at IS NOT NULL AS settled FROM sophia.conversation_replies WHERE id = $1',
      [replyId],
    )
  )[0]

/** The context rendered again on the API's own connection, as the asker, from the compiler and every message. */
async function independent(s: Scene) {
  return withActor(api, E, 'read', async (c) => {
    const context = await readMissionContext(c, s.projectId, { actorId: E, channel: 'studio' })
    assert.ok(context)
    const { rows } = await c.query<{
      id: string
      seq: string
      author: ContextMessage['author']
      author_name: string | null
      body: string | null
      created_at: Date
      cutoff: string
    }>(
      `SELECT m.id, m.seq::text AS seq, m.author, m.author_name, m.body, m.created_at, r.cutoff_seq::text AS cutoff
         FROM sophia.conversation_messages m JOIN sophia.conversation_replies r ON r.id = $2
        WHERE m.conversation_id = $1 AND m.seq <= r.cutoff_seq ORDER BY m.seq`,
      [s.conversationId, s.replyId],
    )
    const cutoffSeq = Number(rows[0]?.cutoff)
    const messages: ContextMessage[] = rows.map((m) => ({
      id: m.id,
      conversationId: s.conversationId,
      seq: Number(m.seq),
      author: m.author,
      name: m.author_name,
      body: m.body,
      at: m.created_at.toISOString(),
    }))
    const earlierCount = messages.filter((m) => m.seq < cutoffSeq && m.body !== null).length
    return renderConversationContext({ context, conversationId: s.conversationId, cutoffSeq, messages, earlierCount })
  })
}

// --- The assembler's own steps, by hand, as the test login ------------------------------------------------------------

/** Every session a test opens by hand, released (destroyed) after the file if a failed assertion left it open. */
const sessions = new Set<pg.PoolClient>()

async function session(): Promise<{ s: pg.PoolClient; pid: number }> {
  const s = await assemblerPool.connect()
  s.on('error', () => undefined)
  sessions.add(s)
  const pid = (await s.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0
  return { s, pid }
}

async function claimAs(replyId: string, leaseMs: number): Promise<Verdict> {
  const { s } = await session()
  try {
    await s.query(`BEGIN; ${AS_ASSEMBLER}`)
    const v = (
      await s.query<{ v: Verdict }>('SELECT sophia.conversation_assembly_claim($1, $2) AS v', [replyId, leaseMs])
    ).rows[0]?.v
    await s.query('COMMIT')
    assert.ok(v)
    return v
  } finally {
    s.release(true)
  }
}

/** A REPEATABLE READ assembly transaction, begun and left open: its client, backend and begin's answer. */
async function begin(replyId: string, k: Pick<Verdict, 'attempt' | 'token'>, settings = '') {
  const { s, pid } = await session()
  await s.query(`BEGIN ISOLATION LEVEL REPEATABLE READ; ${AS_ASSEMBLER}${settings}`)
  const pending = s.query<{ v: Verdict }>('SELECT sophia.conversation_assembly_begin($1, $2, $3) AS v', [
    replyId,
    k.attempt,
    k.token,
  ])
  return { s, pid, begun: pending.then((r) => r.rows[0]?.v as Verdict) }
}

const bindingOf = (v: Verdict): Binding => ({
  projectId: v.projectId,
  conversationId: v.conversationId,
  askedBy: v.askedBy,
  messageId: v.messageId,
  cutoffSeq: v.cutoffSeq,
  earlierCount: v.earlierCount,
  window: v.window,
})

const record = (s: pg.PoolClient, replyId: string, k: Pick<Verdict, 'attempt' | 'token'>, payload: string) =>
  s
    .query<{ v: Verdict }>('SELECT sophia.conversation_record_context($1, $2, $3, $4::jsonb) AS v', [
      replyId,
      k.attempt,
      k.token,
      payload,
    ])
    .then((r) => r.rows[0]?.v as Verdict)

// --- The catalog, before and after the candidate ----------------------------------------------------------------------

interface Catalog {
  functions: { sig: string; src: string; secdef: boolean; acl: string }[]
  relations: { name: string; kind: string; acl: string; rls: boolean }[]
  triggers: { name: string; def: string }[]
  policies: { name: string; qual: string | null }[]
  rows: { relname: string; n: string }[]
}

async function catalog(): Promise<Catalog> {
  const [functions, relations, triggers, policies, rows] = await Promise.all([
    owner<Catalog['functions'][number]>(
      `SELECT p.oid::regprocedure::text AS sig, md5(p.prosrc) AS src, p.prosecdef AS secdef, coalesce(p.proacl::text, '') AS acl
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'sophia' ORDER BY 1`,
    ),
    owner<Catalog['relations'][number]>(
      `SELECT c.relname AS name, c.relkind::text AS kind, coalesce(c.relacl::text, '') AS acl, c.relrowsecurity AS rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'sophia' ORDER BY 1`,
    ),
    owner<Catalog['triggers'][number]>(
      `SELECT t.tgname || ' on ' || c.relname AS name, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'sophia' AND NOT t.tgisinternal ORDER BY 1`,
    ),
    owner<Catalog['policies'][number]>(
      `SELECT polname || ' on ' || polrelid::regclass::text AS name, pg_get_expr(polqual, polrelid) AS qual
         FROM pg_policy ORDER BY 1`,
    ),
    owner<Catalog['rows'][number]>(
      `SELECT c.relname, (xpath('/row/n/text()',
                query_to_xml(format('SELECT count(*) AS n FROM sophia.%I', c.relname), false, true, '')))[1]::text AS n
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'sophia' AND c.relkind IN ('r', 'p') ORDER BY 1`,
    ),
  ])
  return { functions, relations, triggers, policies, rows }
}

const without = <T>(xs: T[], key: (x: T) => string, names: string[]) => xs.filter((x) => !names.includes(key(x)))
const added = (b: string[], a: string[]) => a.filter((x) => !b.includes(x))

// --- A rendered payload, taken apart for the forgeries ------------------------------------------------------------------

const at = (p: Payload, pick: (f: Fragment) => boolean) => p.fragments.findIndex(pick)
const tpl = (id: string) => (f: Fragment) => f.kind === 'template' && f.id === id
const itm = (item: string) => (f: Fragment) => f.kind === 'item' && f.item === item
function resync(p: Payload): void {
  p.text = p.fragments.map((f) => f.text).join('')
}
/** One section's fragment range: its heading up to the next heading. */
function section(p: Payload, head: string): readonly [number, number] {
  const from = at(p, tpl(head))
  const rest = p.fragments.slice(from + 1)
  const to = rest.findIndex((f) => f.kind === 'template' && f.id.endsWith('.head'))
  return [from, from + 1 + (to < 0 ? rest.length : to)]
}

describe('CON-01 N2: a reply’s context, assembled and recorded (L1, disposable PostgreSQL)', () => {
  let pre: Catalog
  let post: Catalog

  before(async () => {
    rolesBefore = await roleNames()
    assemblerExisted = rolesBefore.includes(ROLE)
    db = await createTestDatabase()
    ownerPool = new pg.Pool({ connectionString: db.ownerUrl, max: 6 })
    api = createPool(db.apiUrl, { max: 8 })
    await withClusterMigrationLock(async () => {
      for (const name of CANDIDATES.slice(0, 2)) await owner(candidate(name))
      pre = await catalog()
      await owner(candidate(CANDIDATES[2] ?? ''))
      post = await catalog()
    })
    // The test login: NOINHERIT, so it holds nothing until SET LOCAL ROLE, which the module issues in each transaction.
    loginRole = `con01_n2_t_${randomBytes(6).toString('hex')}`
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
    assemblerPool = new pg.Pool({ connectionString: loginUrl, max: 12 })
    assemblerPool.on('error', () => undefined)
  })

  // A test that fails mid-transaction leaves its session open with its locks: released here, before the next test.
  afterEach(() => {
    for (const s of sessions) {
      try {
        s.release(true)
      } catch {
        // released already by its test
      }
    }
    sessions.clear()
  })

  after(async () => {
    for (const s of sessions) {
      try {
        s.release(true)
      } catch {
        // released already by its test
      }
    }
    await assemblerPool.end()
    await api.end()
    await ownerPool.end()
    await db.drop()
    await onAdmin(`DROP ROLE IF EXISTS ${loginRole}`)
    if (!assemblerExisted) await onAdmin(`DROP ROLE IF EXISTS ${ROLE}`)
    // This file's own roles are gone. Any other change is one a named class explains, else it fails.
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
  })

  describe('its footprint and its role', () => {
    it('adds exactly its four tables, their indexes, its functions and triggers; changes nothing else, inserts no row', () => {
      assert.deepEqual(
        added(
          pre.functions.map((f) => f.sig),
          post.functions.map((f) => f.sig),
        ),
        ADDED_FUNCTIONS,
      )
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
        ADDED_TRIGGERS,
      )
      assert.deepEqual(
        without(post.functions, (f) => f.sig, ADDED_FUNCTIONS),
        pre.functions,
        'no function changed',
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

    it('makes a dormant, cluster-global role: no login, no bypass, sophia_api its only role, nothing owned, no member but the test login', async () => {
      const [r] = await owner<Record<string, unknown>>(
        `SELECT r.rolsuper, r.rolinherit, r.rolcanlogin, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
                ARRAY(SELECT b.rolname FROM pg_auth_members m JOIN pg_roles b ON b.oid = m.roleid WHERE m.member = r.oid)::text[] AS member_of,
                ARRAY(SELECT u.rolname FROM pg_auth_members m JOIN pg_roles u ON u.oid = m.member WHERE m.roleid = r.oid)::text[] AS members,
                (SELECT count(*) FROM pg_shdepend d WHERE d.refobjid = r.oid AND d.deptype = 'o')::int AS owns
           FROM pg_roles r WHERE r.rolname = $1`,
        [ROLE],
      )
      assert.deepEqual(r, {
        rolsuper: false,
        rolinherit: true,
        rolcanlogin: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        member_of: ['sophia_api'],
        members: [loginRole],
        owns: 0,
      })
    })

    it('lets only the assembler execute the five entry points, and nobody read or write its tables', async () => {
      const grants = await owner<{ role: string; fn: string }>(
        `SELECT g.role, p.oid::regprocedure::text AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
                unnest(ARRAY['public', 'sophia_api', 'sophia_worker', $1]) g(role)
          WHERE n.nspname = 'sophia' AND p.oid::regprocedure::text = ANY($2)
            AND (CASE WHEN g.role = 'public' THEN has_function_privilege('public', p.oid, 'EXECUTE')
                 ELSE has_function_privilege(g.role, p.oid, 'EXECUTE') END) ORDER BY 1, 2`,
        [ROLE, ADDED_FUNCTIONS],
      )
      assert.deepEqual(
        grants.map((g) => `${g.role} ${g.fn}`),
        ENTRY_POINTS.map((f) => `${ROLE} ${f}`),
      )
      const tables = await owner<{ role: string; t: string }>(
        `SELECT g.role, t FROM unnest($2::text[]) t, unnest(ARRAY['public', 'sophia_api', 'sophia_worker', $1]) g(role)
          WHERE has_table_privilege(g.role, 'sophia.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,
        [ROLE, ADDED_TABLES],
      )
      assert.deepEqual(tables, [])
      // The API and worker logins, and the test login without the role set, are refused every entry point.
      const s = await newProject().then((p) => conversation(p, 1))
      const call = 'SELECT sophia.conversation_assembly_claim($1, 1000)'
      for (const url of [db.apiUrl, db.workerUrl, loginUrl]) {
        const c = new pg.Client({ connectionString: url })
        await c.connect()
        try {
          assert.equal(await refusal(c.query(call, [s.replyId])), '42501', url)
        } finally {
          await c.end()
        }
      }
      // With it set, the login reads no table of its own and every project's rows only through row security.
      const { s: c } = await session()
      try {
        await c.query(`BEGIN; ${AS_ASSEMBLER}`)
        assert.equal(await refusal(c.query('SELECT 1 FROM sophia.conversation_reply_contexts')), '42501')
        await c.query('ROLLBACK')
        await c.query(`BEGIN; ${AS_ASSEMBLER}`)
        assert.equal((await c.query('SELECT 1 FROM sophia.conversation_messages')).rowCount, 0, 'no actor, no row')
        await c.query(`SELECT set_config('sophia.actor_id', $1, true)`, [E])
        assert.ok(((await c.query('SELECT 1 FROM sophia.conversation_messages')).rowCount ?? 0) > 0, 'as a member')
        await c.query('ROLLBACK')
      } finally {
        c.release(true)
      }
    })

    it('records what the role inherits from sophia_api (CX49): every API function, and the five of its own beside them', async (t) => {
      const [r] = await owner<{ own: string[]; inherited: number; api: number; definers: number }>(
        `WITH f AS (SELECT p.oid, p.oid::regprocedure::text AS sig, p.prosecdef FROM pg_proc p
                      JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'sophia')
         SELECT ARRAY(SELECT sig FROM f WHERE has_function_privilege($1, oid, 'EXECUTE')
                        AND NOT has_function_privilege('sophia_api', oid, 'EXECUTE') ORDER BY 1)::text[] AS own,
                (SELECT count(*) FROM f WHERE has_function_privilege($1, oid, 'EXECUTE')
                   AND has_function_privilege('sophia_api', oid, 'EXECUTE'))::int AS inherited,
                (SELECT count(*) FROM f WHERE has_function_privilege('sophia_api', oid, 'EXECUTE'))::int AS api,
                (SELECT count(*) FROM f WHERE has_function_privilege('sophia_api', oid, 'EXECUTE') AND prosecdef)::int AS definers`,
        [ROLE],
      )
      assert.ok(r)
      assert.deepEqual(r.own, ENTRY_POINTS)
      assert.equal(r.inherited, r.api, 'everything sophia_api may execute, the assembler may too')
      t.diagnostic(
        `inherited from sophia_api: ${String(r.api)} functions, ${String(r.definers)} SECURITY DEFINER; ` +
          'kept dormant (no login member, no caller) until a least-privilege execution proof',
      )
    })
  })

  describe('the renderer’s grammar in SQL', () => {
    it('quotes exactly as JSON.stringify and writes times exactly as the driver’s Date.toISOString()', async () => {
      const corpus = [
        'plain',
        'a"b',
        'back\\slash',
        'line\nbreak\r\n',
        'tab\t',
        '\b\f',
        '\u0001\u001f\u007f',
        '  ',
        'é € ñ',
        '𝄞 😀',
        '</script>',
        '"\\"\\\\',
        'x'.repeat(4000),
      ]
      const quoted = await owner<{ q: string }>(
        `SELECT sophia.conversation_context_quoted(v) AS q FROM unnest($1::text[]) WITH ORDINALITY u(v, o) ORDER BY o`,
        [corpus],
      )
      assert.deepEqual(
        quoted.map((r) => r.q),
        corpus.map((v) => JSON.stringify(v)),
      )
      const [none] = await owner<{ q: string }>('SELECT sophia.conversation_context_quoted(NULL) AS q')
      assert.equal(none?.q, 'null')
      const times = [
        '2026-10-01 00:00:01.123987+00',
        '2026-10-01 00:00:01.999999+00',
        '2026-10-01 00:00:01.000001+00',
        '2026-12-31 23:59:59.9995+00',
        '1999-12-31 23:59:59.9999+05:30',
        '2026-03-29 01:30:00+02',
      ]
      const rows = await owner<{ s: string; d: Date }>(
        `SELECT sophia.conversation_context_time(t) AS s, t AS d FROM unnest($1::timestamptz[]) WITH ORDINALITY u(t, o) ORDER BY o`,
        [times],
      )
      assert.deepEqual(
        rows.map((r) => r.s),
        rows.map((r) => r.d.toISOString()),
      )
    })

    it('pins every template to the renderer’s text, and takes only the arguments each takes', async () => {
      const ids = Object.keys(TEMPLATES) as TemplateId[]
      const cases = ids.flatMap((id) =>
        id.endsWith('.omitted')
          ? [
              { id, args: [7] },
              { id, args: [9007199254740991] },
            ]
          : [{ id, args: [] as number[] }],
      )
      const rows = await owner<{ t: string | null }>(
        `SELECT sophia.conversation_context_template(c->>'id', c->'args') AS t
           FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY u(c, o) ORDER BY o`,
        [JSON.stringify(cases)],
      )
      assert.deepEqual(
        rows.map((r) => r.t),
        cases.map((c) => TEMPLATES[c.id](c.args)),
      )
      const refused = await owner<{ t: string | null }>(
        `SELECT sophia.conversation_context_template(id, args::jsonb) AS t FROM (VALUES
           ('messages.omitted', '[]'), ('messages.omitted', '[0]'), ('messages.omitted', '[1.5]'),
           ('messages.omitted', '["3"]'), ('messages.head', '[1]'), ('messages.some', '[]')) v(id, args)`,
      )
      assert.deepEqual(
        refused.map((r) => r.t),
        [null, null, null, null, null, null],
      )
    })
  })

  describe('assembly and record', () => {
    it('records the text the renderer writes from the compiler’s own read as the asker; sources and messages derived', async () => {
      const s = await scene(5)
      const result = await assembleReply(loginUrl, s.replyId, LIMITS)
      const expected = await independent(s)
      assert.equal(result.outcome, 'recorded')
      const [x] = await contexts(s.replyId)
      assert.ok(x)
      assert.equal(x.body, expected.text, 'byte for byte the independent render')
      assert.deepEqual(result, {
        outcome: 'recorded',
        attempt: 1,
        contextHash: x.context_hash,
        byteLength: expected.byteLength,
      })
      const [p] = await owner<Record<string, string>>(
        `SELECT p.mission_revision, p.ledger_revision, p.eligibility_revision, p.audience_revision, c.erasure_revision
           FROM sophia.projects p JOIN sophia.conversations c ON c.project_id = p.id WHERE c.id = $1`,
        [s.conversationId],
      )
      assert.deepEqual(
        {
          state: x.state,
          byte_length: x.byte_length,
          renderer: x.renderer,
          compiler: x.compiler,
          predicate: x.predicate,
          trusted: x.trusted,
          revisions: [
            x.mission_revision,
            x.ledger_revision,
            x.eligibility_revision,
            x.audience_revision,
            x.erasure_revision,
          ],
          cutoff_seq: x.cutoff_seq,
          earlier_count: x.earlier_count,
          included: x.included,
          from_seq: x.from_seq,
          coverage: x.coverage,
          scrubbed: x.scrubbed_by,
        },
        {
          state: 'recorded',
          byte_length: expected.byteLength,
          renderer: 'sophia.conversation-context.v1',
          compiler: 'sophia.mission-context.v1',
          predicate: 'conversation-source-v1',
          trusted: ['selection', 'coverage'],
          revisions: [
            p?.mission_revision,
            p?.ledger_revision,
            p?.eligibility_revision,
            p?.audience_revision,
            p?.erasure_revision,
          ],
          cutoff_seq: '6',
          earlier_count: '5',
          included: 5,
          from_seq: '1',
          coverage: expected.coverage,
          scrubbed: null,
        },
      )
      assert.ok(
        x.fragments.every((f) => !('text' in f)),
        'fragments are kept without their text',
      )
      assert.equal(x.fragments.length, expected.fragments.length)
      const sources = await owner<{ kind: string; ref_id: string; ok: boolean }>(
        `SELECT s.kind, s.ref_id, (o.sha256 = s.sha256 AND o.eligibility_revision = s.eligibility_revision) AS ok
           FROM sophia.conversation_reply_sources s JOIN sophia.source_objects o ON o.project_id = s.project_id AND o.id = s.source_id
          WHERE s.reply_id = $1 ORDER BY s.kind, s.ref_id`,
        [s.replyId],
      )
      assert.deepEqual(
        sources.map((r) => [r.kind, r.ref_id, r.ok]),
        [
          ...[s.constraint, s.lesson].toSorted().map((id) => ['constraint', id, true]),
          ['mission', s.mission, true],
          ['pending', s.pending, true],
        ],
      )
      const messages = await owner<{ message_id: string; role: string; body_sha256: string; body: string }>(
        `SELECT r.message_id, r.role, r.body_sha256, m.body FROM sophia.conversation_reply_messages r
           JOIN sophia.conversation_messages m ON m.project_id = r.project_id AND m.id = r.message_id
          WHERE r.reply_id = $1 ORDER BY r.seq`,
        [s.replyId],
      )
      assert.deepEqual(
        messages.map((m) => [m.message_id, m.role, m.body_sha256]),
        [...s.earlier.map((id) => [id, 'earlier']), [s.askId, 'ask']].map((r, i) => [
          ...r,
          sha256(messages[i]?.body ?? ''),
        ]),
      )
      const [k] = await claims(s.replyId)
      assert.deepEqual(k, {
        attempt: 1,
        outcome: 'recorded',
        outcome_reason: null,
        begun: true,
        window_ids: s.earlier.toReversed(),
      })
      assert.deepEqual(
        await replyOf(s.replyId),
        { state: 'pending', reason: null, settled: false },
        'nothing else moves',
      )
    })

    it('gives the same bytes and hash for the same records, and another hash once a record moves', async () => {
      const s = await scene(3)
      const k = await claimAs(s.replyId, LIMITS.leaseMs)
      const round = async () => {
        const { s: c, begun } = await begin(s.replyId, k)
        try {
          const rendered = await renderBound(c, bindingOf(await begun))
          const v = await record(c, s.replyId, k, recordPayload(rendered))
          return { text: rendered.text, hash: v.contextHash }
        } finally {
          await c.query('ROLLBACK')
          c.release(true)
        }
      }
      const one = await round()
      const two = await round()
      assert.deepEqual(two, one)
      await propose(s.projectId, A, { kind: 'constraint', statement: 'Keep it short' }, A)
      const three = await round()
      assert.notEqual(three.hash, one.hash)
      assert.notEqual(three.text, one.text)
    })

    it('reads nothing of another conversation, another project, Personal or the project’s notes', async () => {
      const s = await scene(3)
      await asActor(E, (c) =>
        startConversation(
          c,
          s.projectId,
          randomUUID(),
          { title: 'Other', text: 'CANARY-OTHER-CONVERSATION', askSophia: false },
          'Lucía',
        ),
      )
      const elsewhere = await newProject()
      await asActor(E, (c) =>
        startConversation(
          c,
          elsewhere,
          randomUUID(),
          { title: 'Else', text: 'CANARY-OTHER-PROJECT', askSophia: false },
          'Lucía',
        ),
      )
      await owner(`INSERT INTO sophia.personal_spaces(owner_id, turn_seq) VALUES ($1, 1) ON CONFLICT DO NOTHING`, [E])
      await owner(
        `INSERT INTO sophia.personal_turns(owner_id, seq, author, body, reply, asked_at)
         VALUES ($1, (SELECT coalesce(max(seq), 0) + 1 FROM sophia.personal_turns WHERE owner_id = $1), 'person', 'CANARY-PERSONAL', 'pending', now())`,
        [E],
      )
      await asActor(E, (c) =>
        recordMissionEntry(c, s.projectId, randomUUID(), {
          kind: 'observation',
          epistemic: 'reported',
          text: 'CANARY-NOTE',
        }),
      )
      assert.equal((await assembleReply(loginUrl, s.replyId, LIMITS)).outcome, 'recorded')
      const [x] = await contexts(s.replyId)
      for (const canary of ['CANARY-OTHER-CONVERSATION', 'CANARY-OTHER-PROJECT', 'CANARY-PERSONAL', 'CANARY-NOTE']) {
        assert.ok(!x?.body?.includes(canary), canary)
      }
      const foreign = await owner(
        `SELECT 1 FROM sophia.conversation_reply_messages r JOIN sophia.conversation_messages m ON m.id = r.message_id
          WHERE r.reply_id = $1 AND m.conversation_id <> $2`,
        [s.replyId, s.conversationId],
      )
      assert.deepEqual(foreign, [])
    })

    it('names who accepted the mission by the revision row at mission_revision: not the creator, the decider or an older revision', async () => {
      // Project created by A; revision 2 accepted by A; revision 3's decision decided by C, its row accepted by B.
      const projectId = await newProject()
      await propose(projectId, A, { kind: 'mission', statement: 'First mission' }, A)
      await propose(projectId, C, { kind: 'mission', statement: 'Second mission', destination: 'A map' }, C)
      await owner(
        `UPDATE sophia.project_revisions SET accepted_by = $2, created_at = '2026-10-01 12:34:56.789999+00'
          WHERE project_id = $1 AND revision = 3`,
        [projectId, B],
      )
      const [rev] = await owner<{ mission_revision: string; created_by: string }>(
        'SELECT mission_revision, created_by FROM sophia.projects WHERE id = $1',
        [projectId],
      )
      assert.deepEqual(rev, { mission_revision: '3', created_by: A })
      const s = await conversation(projectId, 2)
      assert.equal((await assembleReply(loginUrl, s.replyId, LIMITS)).outcome, 'recorded')
      const [x] = await contexts(s.replyId)
      assert.equal(x?.body, (await independent(s)).text)
      assert.ok(
        x?.body?.includes(`- statement: "Second mission"\n  purpose: null\n  destination: "A map"\n  origin: null\n`),
      )
      assert.ok(x?.body?.includes(`  accepted by actor ${B} at 2026-10-01T12:34:56.789Z\n`))
      for (const other of [A, C]) assert.ok(!x?.body?.includes(`accepted by actor ${other}`))
      assert.ok(!x?.body?.includes('First mission'))
    })

    it('renders a withdrawn, a legacy and an empty frame as the compiler reads them, and records each', async () => {
      const cases: Array<[string, (p: string) => Promise<void>, string]> = [
        [
          'withdrawn',
          async (p) => {
            await propose(p, A, { kind: 'mission', statement: 'Gone' }, A)
            await owner(
              `UPDATE sophia.project_revisions r SET frame = jsonb_build_object('withdrawn', true, 'decisionId', r.frame->>'decisionId')
                 FROM sophia.projects p WHERE p.id = $1 AND r.project_id = p.id AND r.revision = p.mission_revision`,
              [p],
            )
          },
          '\n## The accepted mission\nNo accepted mission.\n',
        ],
        [
          'legacy',
          (p) =>
            owner(
              `UPDATE sophia.project_revisions SET frame = '{"statement":"An old mission"}' WHERE project_id = $1 AND revision = 1`,
              [p],
            ).then(() => undefined),
          '\n## The accepted mission\nNo accepted mission. An older mission statement exists that is not an accepted decision; it is not used.\n',
        ],
        ['empty', () => Promise.resolve(), '\n## The accepted mission\nNo accepted mission.\n'],
      ]
      for (const [name, frame, missionSection] of cases) {
        const p = await newProject()
        await frame(p)
        const s = await conversation(p, 1)
        assert.equal((await assembleReply(loginUrl, s.replyId, LIMITS)).outcome, 'recorded', name)
        const [x] = await contexts(s.replyId)
        assert.equal(x?.body, (await independent(s)).text, name)
        assert.ok(x?.body?.includes(missionSection), name)
        assert.ok(x?.body?.includes('- no accepted mission\n'), name)
        assert.ok(!x?.body?.includes('An old mission') && !x?.body?.includes('Gone'), name)
      }
    })
  })

  describe('the history read: a window of 40, an exact count', () => {
    it('counts 300,001 earlier messages exactly once in the snapshot and reads only the newest 40; a 1 ms statement_timeout cancels the count', async (t) => {
      const projectId = await newProject()
      const s = await conversation(projectId, 1, 300_000)
      // A test statement_timeout of 1 ms: begin's count is cancelled, the claim counted, nothing recorded.
      const k = await claimAs(s.replyId, 1500)
      const { s: c, begun } = await begin(s.replyId, k, '; SET LOCAL statement_timeout = 1')
      assert.equal(await refusal(begun), '57014')
      await c.query('ROLLBACK')
      c.release(true)
      assert.deepEqual(await contexts(s.replyId), [])
      assert.deepEqual(await claims(s.replyId), [
        { attempt: 1, outcome: null, outcome_reason: null, begun: false, window_ids: null },
      ])
      assert.equal((await replyOf(s.replyId))?.state, 'pending')
      await sleep(1600)
      const start = Date.now()
      const result = await assembleReply(loginUrl, s.replyId, LIMITS)
      const elapsed = Date.now() - start
      assert.equal(result.outcome, 'recorded')
      const [x] = await contexts(s.replyId)
      assert.deepEqual([x?.attempt, x?.earlier_count, x?.included, x?.from_seq], [2, '300001', 40, '299962'])
      assert.equal((await claims(s.replyId))[1]?.window_ids?.length, 40, 'begin kept a window of 40, no more')
      assert.ok(x?.body?.includes('\n299961 earlier messages not included.\n'))
      assert.equal(x?.body, (await independent(s)).text)
      t.diagnostic(
        `300,001 earlier messages: one assembly (claim, count, compile, render, record) took ${String(elapsed)} ms`,
      )
    })
  })

  describe('durable claims: at most 3 per reply, across rollbacks, restarts and lost commits', () => {
    it('a 40001 rolls the attempt back and keeps its claim; after a restart the next claim is attempt 2', async (t) => {
      const s = await scene(2)
      const k = await claimAs(s.replyId, 1200)
      const writerHeld = gate()
      const writerIn = gate()
      let writerPid = 0
      const writer = asActor(E, async (c) => {
        writerPid = (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0
        await sendConversationMessage(
          c,
          s.conversationId,
          randomUUID(),
          { text: 'Meanwhile', askSophia: false },
          'Lucía',
        )
        writerIn.open()
        await writerHeld.wait
      })
      await writerIn.wait
      const { s: c, pid, begun } = await begin(s.replyId, k)
      t.diagnostic(
        `begin waited ${String(await waitFor('begin to wait', () => waiting(pid)))} ms on the writer (pid ${String(writerPid)})`,
      )
      writerHeld.open()
      await writer
      assert.equal(await refusal(begun), '40001')
      await c.query('ROLLBACK')
      c.release(true)
      assert.deepEqual(await claims(s.replyId), [
        { attempt: 1, outcome: null, outcome_reason: null, begun: false, window_ids: null },
      ])
      await sleep(1300)
      assert.equal((await assembleReply(loginUrl, s.replyId, LIMITS)).outcome, 'recorded')
      assert.deepEqual(
        (await claims(s.replyId)).map((r) => [r.attempt, r.outcome]),
        [
          [1, 'expired'],
          [2, 'recorded'],
        ],
      )
    })

    it('a COMMIT whose answer is lost: the next claim finds the record, counts nothing, and answers already_recorded', async () => {
      const s = await scene(2)
      const k = await claimAs(s.replyId, LIMITS.leaseMs)
      const { s: c, begun } = await begin(s.replyId, k)
      const rendered = await renderBound(c, bindingOf(await begun))
      void record(c, s.replyId, k, recordPayload(rendered)).catch(() => undefined)
      await c.query('COMMIT') // the record's answer is never read
      c.release(true)
      const [x] = await contexts(s.replyId)
      assert.deepEqual(await assembleReply(loginUrl, s.replyId, LIMITS), {
        outcome: 'already_recorded',
        attempt: 1,
        contextHash: x?.context_hash,
      })
      assert.equal((await claims(s.replyId)).length, 1)
    })

    it('three abandoned claims, then a fourth call: the reply fails context_unstable, durably', async () => {
      const s = await scene(1)
      for (const attempt of [1, 2, 3]) {
        const v = await claimAs(s.replyId, 200)
        assert.deepEqual([v.verdict, v.attempt], ['claimed', attempt])
        await sleep(250)
      }
      assert.deepEqual(await assembleReply(loginUrl, s.replyId, LIMITS), { outcome: 'exhausted', attempts: 3 })
      const fresh = new pg.Client({ connectionString: db.ownerUrl })
      await fresh.connect()
      try {
        const { rows } = await fresh.query('SELECT state, reason FROM sophia.conversation_replies WHERE id = $1', [
          s.replyId,
        ])
        assert.deepEqual(rows, [{ state: 'failed', reason: 'context_unstable' }], 'read again on a new connection')
      } finally {
        await fresh.end()
      }
      assert.deepEqual(await assembleReply(loginUrl, s.replyId, LIMITS), { outcome: 'not_pending', state: 'failed' })
      assert.deepEqual(
        (await claims(s.replyId)).map((r) => r.outcome),
        ['expired', 'expired', 'expired'],
      )
    })

    it('two assemblers: the second waits on the first’s locks, then finds its record; a live lease is in progress, an expired one is replaced', async (t) => {
      const s = await scene(2)
      const k = await claimAs(s.replyId, LIMITS.leaseMs)
      assert.deepEqual(await assembleReply(loginUrl, s.replyId, LIMITS), {
        outcome: 'in_progress',
        attempt: 1,
        leaseExpiresAt: k.leaseExpiresAt,
      })
      const { s: c, begun } = await begin(s.replyId, k)
      const binding = bindingOf(await begun)
      const second = assembleReply(loginUrl, s.replyId, LIMITS)
      const waited = await waitFor(
        'the second assembler to wait',
        async () =>
          (
            await owner(`SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'`, [
              APP,
            ])
          ).length === 1,
      )
      t.diagnostic(`the second assembler's claim waited on the first's reply lock (seen after ${String(waited)} ms)`)
      await record(c, s.replyId, k, recordPayload(await renderBound(c, binding)))
      await c.query('COMMIT')
      c.release(true)
      const [x] = await contexts(s.replyId)
      assert.deepEqual(await second, { outcome: 'already_recorded', attempt: 1, contextHash: x?.context_hash })
      // A claim abandoned with its lease live: in progress; once it runs out, the next assembler takes attempt 2.
      const r = await scene(1)
      await claimAs(r.replyId, 600)
      assert.equal((await assembleReply(loginUrl, r.replyId, LIMITS)).outcome, 'in_progress')
      await sleep(650)
      assert.deepEqual(await assembleReply(loginUrl, r.replyId, LIMITS), {
        outcome: 'recorded',
        attempt: 2,
        contextHash: (await contexts(r.replyId))[0]?.context_hash,
        byteLength: (await contexts(r.replyId))[0]?.byte_length,
      })
    })

    it('a terminal refusal fails the reply in its own transaction; without it the claim stays counted until its lease runs out', async () => {
      // The renderer refuses a statement longer than its schema allows: the module fails the reply invalid_input.
      const s = await scene(1)
      await owner(
        `UPDATE sophia.decisions SET proposal = jsonb_set(proposal, '{statement}', to_jsonb(repeat('x', 2001))) WHERE id = $1`,
        [s.constraint],
      )
      assert.deepEqual(await assembleReply(loginUrl, s.replyId, LIMITS), {
        outcome: 'failed',
        attempt: 1,
        reason: 'invalid_input',
      })
      assert.deepEqual(await replyOf(s.replyId), { state: 'failed', reason: 'invalid_input', settled: true })
      assert.deepEqual(
        (await claims(s.replyId)).map((r) => [r.outcome, r.outcome_reason]),
        [['failed', 'invalid_input']],
      )
      // A refused record with no fail call after it: the claim stays current until its lease runs out, then counts.
      const r = await scene(1)
      const k = await claimAs(r.replyId, 800)
      const { s: c, begun } = await begin(r.replyId, k)
      const rendered = JSON.parse(recordPayload(await renderBound(c, bindingOf(await begun)))) as Payload
      rendered.text += ' '
      assert.equal(await refusal(record(c, r.replyId, k, JSON.stringify(rendered))), 'context_forged')
      await c.query('ROLLBACK')
      c.release(true)
      assert.equal((await assembleReply(loginUrl, r.replyId, LIMITS)).outcome, 'in_progress')
      await sleep(850)
      assert.equal((await assembleReply(loginUrl, r.replyId, LIMITS)).outcome, 'recorded')
      assert.deepEqual(
        (await claims(r.replyId)).map((x) => x.outcome),
        ['expired', 'recorded'],
      )
    })

    it('a stale, expired or foreign token can neither begin, record, close nor fail a replacement', async () => {
      const s = await scene(1)
      const old = await claimAs(s.replyId, 200)
      await sleep(250)
      const current = await claimAs(s.replyId, LIMITS.leaseMs)
      assert.deepEqual([current.verdict, current.attempt], ['claimed', 2])
      const other = await scene(1)
      const foreign = await claimAs(other.replyId, LIMITS.leaseMs)
      const tokens = [
        { attempt: 1, token: old.token },
        { attempt: 2, token: old.token },
        { attempt: 2, token: foreign.token },
        { attempt: 1, token: randomUUID() },
      ]
      for (const k of tokens) {
        const { s: c, begun } = await begin(s.replyId, k)
        assert.equal(await refusal(begun), 'claim_not_current', JSON.stringify(k))
        await c.query('ROLLBACK')
        await c.query(`BEGIN ISOLATION LEVEL REPEATABLE READ; ${AS_ASSEMBLER}`)
        assert.equal(await refusal(record(c, s.replyId, k, '{}')), 'claim_not_current')
        await c.query('ROLLBACK')
        await c.query(`BEGIN; ${AS_ASSEMBLER}`)
        assert.equal(
          await refusal(
            c.query('SELECT sophia.conversation_assembly_close($1, $2, $3, $4)', [
              s.replyId,
              k.attempt,
              k.token,
              'asker_removed',
            ]),
          ),
          'claim_not_current',
        )
        await c.query('ROLLBACK')
        await c.query(`BEGIN; ${AS_ASSEMBLER}`)
        const failed = await c.query<{ v: Verdict }>('SELECT sophia.conversation_assembly_fail($1, $2, $3, $4) AS v', [
          s.replyId,
          k.attempt,
          k.token,
          'invalid_input',
        ])
        assert.equal(failed.rows[0]?.v.verdict, 'claim_not_current')
        await c.query('ROLLBACK')
        c.release(true)
      }
      assert.deepEqual(await replyOf(s.replyId), { state: 'pending', reason: null, settled: false })
      assert.deepEqual(
        (await claims(s.replyId)).map((r) => [r.attempt, r.outcome]),
        [
          [1, 'expired'],
          [2, null],
        ],
      )
    })
  })

  describe('every transaction bounded: timeouts, a deadline, an idle gap, a crash', () => {
    it('a lease that runs out mid-assembly: begun in time, the attempt can no longer record or close, and nothing is written', async () => {
      const s = await scene(1)
      const k = await claimAs(s.replyId, 300)
      const { s: c, begun } = await begin(s.replyId, k)
      const rendered = await renderBound(c, bindingOf(await begun))
      await sleep(350)
      await c.query('SAVEPOINT late')
      assert.equal(await refusal(record(c, s.replyId, k, recordPayload(rendered))), 'claim_not_current')
      await c.query('ROLLBACK TO SAVEPOINT late')
      assert.equal(
        await refusal(
          c.query('SELECT sophia.conversation_assembly_close($1, $2, $3, $4)', [
            s.replyId,
            k.attempt,
            k.token,
            'asker_removed',
          ]),
        ),
        'claim_not_current',
      )
      await c.query('ROLLBACK')
      c.release(true)
      assert.deepEqual(await contexts(s.replyId), [])
      assert.deepEqual(
        (await claims(s.replyId)).map((r) => [r.attempt, r.outcome]),
        [[1, null]],
      )
      assert.deepEqual(await replyOf(s.replyId), { state: 'pending', reason: null, settled: false })
    })

    /** The asking message's row held FOR UPDATE by the owner: the claim passes, begin waits. */
    async function holdAsk(s: Scene) {
      const c = new pg.Client({ connectionString: db.ownerUrl })
      await c.connect()
      await c.query('BEGIN')
      await c.query('SELECT 1 FROM sophia.conversation_messages WHERE id = $1 FOR UPDATE', [s.askId])
      return c
    }

    it('lock_timeout and statement_timeout end a waiting begin: the attempt counted, nothing recorded, the reply pending', async () => {
      for (const [limits, cause] of [
        [{ ...LIMITS, lockTimeoutMs: 200 }, 'lock_timeout'],
        [{ ...LIMITS, statementTimeoutMs: 200, lockTimeoutMs: 1500 }, 'statement_timeout'],
      ] as const) {
        const s = await scene(1)
        const holder = await holdAsk(s)
        try {
          assert.deepEqual(await assembleReply(loginUrl, s.replyId, limits), {
            outcome: 'retry',
            stage: 'assembly',
            attempt: 1,
            cause,
          })
        } finally {
          await holder.query('ROLLBACK')
          await holder.end()
        }
        assert.deepEqual(await contexts(s.replyId), [])
        assert.deepEqual(
          (await claims(s.replyId)).map((r) => [r.attempt, r.outcome]),
          [[1, null]],
        )
        assert.equal((await replyOf(s.replyId))?.state, 'pending')
      }
    })

    it('the client deadline destroys the connection mid-wait, and the server ends that backend while the lock it waited on is still held', async (t) => {
      const s = await scene(1)
      const holder = await holdAsk(s)
      const limits = {
        ...LIMITS,
        deadlineMs: 400,
        connectMs: 400,
        statementTimeoutMs: 5000,
        lockTimeoutMs: 5000,
        idleInTransactionMs: 5000,
        connectionCheckMs: 50,
        leaseMs: 10_000,
      }
      try {
        const seen: number[] = []
        const watch = waitFor('the assembler to wait', async () => {
          const rows = await owner<{ pid: number }>(
            `SELECT pid FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'`,
            [APP],
          )
          seen.push(...rows.map((r) => r.pid))
          return rows.length > 0
        })
        const result = await assembleReply(loginUrl, s.replyId, limits)
        await watch
        assert.deepEqual(result, { outcome: 'retry', stage: 'assembly', attempt: 1, cause: 'deadline' })
        const pid = seen[0] ?? 0
        const gone = await waitFor('the abandoned backend to end', async () => !(await alive(pid)), 3000)
        t.diagnostic(
          `backend ${String(pid)} ended ${String(gone)} ms after the deadline answer; its lock wait never got the lock`,
        )
        assert.equal((await holder.query('SELECT 1 AS held')).rows.length, 1, 'the holder still holds its lock')
      } finally {
        await holder.query('ROLLBACK')
        await holder.end()
      }
      assert.deepEqual(await contexts(s.replyId), [])
    })

    it('an assembly that idles past idle_in_transaction_session_timeout is ended by the server, and a waiting writer proceeds', async (t) => {
      const s = await scene(1)
      const k = await claimAs(s.replyId, LIMITS.leaseMs)
      const { s: c, pid, begun } = await begin(s.replyId, k, '; SET LOCAL idle_in_transaction_session_timeout = 300')
      assert.equal((await begun).verdict, 'begun')
      const start = Date.now()
      await asActor(E, (w) =>
        sendConversationMessage(w, s.conversationId, randomUUID(), { text: 'Waiting', askSophia: false }, 'Lucía'),
      )
      const waited = Date.now() - start
      t.diagnostic(`the writer waited ${String(waited)} ms for the idle assembly to be ended`)
      assert.ok(waited >= 200 && waited < 3000, String(waited))
      assert.equal(await alive(pid), false)
      c.release(true)
      assert.deepEqual(await contexts(s.replyId), [])
      assert.deepEqual(
        (await claims(s.replyId)).map((r) => [r.attempt, r.outcome, r.begun]),
        [[1, null, false]],
      )
    })

    it('an assembler process killed mid-transaction keeps no lock: its backend ends and a waiting writer proceeds', async (t) => {
      const s = await scene(1)
      const k = await claimAs(s.replyId, LIMITS.leaseMs)
      const script = `
        import pg from 'pg'
        const c = new pg.Client({ connectionString: process.env.N2_URL, application_name: 'con01-n2-crash' })
        await c.connect()
        const pid = (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
        await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ; ${AS_ASSEMBLER}')
        const v = (await c.query('SELECT sophia.conversation_assembly_begin($1, $2, $3) AS v',
          [process.env.N2_REPLY, Number(process.env.N2_ATTEMPT), process.env.N2_TOKEN])).rows[0].v
        process.stdout.write(JSON.stringify({ pid, verdict: v.verdict }) + '\\n')
        setInterval(() => undefined, 1000)`
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: {
          ...process.env,
          N2_URL: loginUrl,
          N2_REPLY: s.replyId,
          N2_ATTEMPT: String(k.attempt),
          N2_TOKEN: k.token,
        },
        stdio: ['ignore', 'pipe', 'inherit'],
      })
      const held = await new Promise<{ pid: number; verdict: string }>((resolve, reject) => {
        child.stdout.once('data', (d: Buffer) => resolve(JSON.parse(d.toString()) as { pid: number; verdict: string }))
        child.once('exit', (code) => reject(new Error(`the child exited early: ${String(code)}`)))
      })
      assert.equal(held.verdict, 'begun')
      const writing = asActor(E, (w) =>
        sendConversationMessage(
          w,
          s.conversationId,
          randomUUID(),
          { text: 'After the crash', askSophia: false },
          'Lucía',
        ),
      )
      await waitFor(
        'the writer to wait',
        async () =>
          (
            await owner(
              `SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`,
            )
          ).length > 0,
      )
      const killed = Date.now()
      child.kill('SIGKILL')
      await writing
      t.diagnostic(
        `the writer proceeded ${String(Date.now() - killed)} ms after SIGKILL; backend ${String(held.pid)} gone`,
      )
      assert.equal(await alive(held.pid), false)
      assert.deepEqual(await contexts(s.replyId), [])
      assert.deepEqual(
        (await claims(s.replyId)).map((r) => [r.attempt, r.outcome]),
        [[1, null]],
      )
    })

    it('refuses limits that are not whole milliseconds, or a lease shorter than what it covers', () => {
      for (const bad of [
        { ...LIMITS, deadlineMs: 0 },
        { ...LIMITS, statementTimeoutMs: 1.5 },
        { ...LIMITS, lockTimeoutMs: Number.NaN },
        { ...LIMITS, idleInTransactionMs: 2 ** 31 },
        { ...LIMITS, connectMs: LIMITS.deadlineMs + 1 },
        { ...LIMITS, connectionCheckMs: LIMITS.statementTimeoutMs + 1 },
        { ...LIMITS, leaseMs: 3 * LIMITS.deadlineMs - 1 },
        { ...LIMITS, leaseMs: 7600, statementTimeoutMs: 5000, idleInTransactionMs: 2601 },
      ]) {
        assert.throws(() => checkedLimits(bad), RangeError, JSON.stringify(bad))
      }
      assert.equal(checkedLimits(LIMITS), LIMITS)
    })
  })

  describe('a forged record is refused', () => {
    it('refuses every fragment, count, order, label, revision or identity that is not what the rows render, then records the honest one', async () => {
      // A mission accepted twice (a proposal against the first is stale), a constraint and a lesson, 45 earlier messages.
      const projectId = await newProject()
      await propose(projectId, A, { kind: 'mission', statement: 'First' }, A)
      const stale = await propose(projectId, B, { kind: 'mission', statement: 'Stale idea' }, null)
      await propose(projectId, A, { kind: 'mission', statement: 'Ship the map first' }, A)
      await propose(projectId, A, { kind: 'constraint', statement: 'Map before list' }, A)
      await propose(projectId, A, { kind: 'lesson', statement: 'Ask before building' }, A)
      await propose(projectId, E, { kind: 'constraint', statement: 'Briefs stay on one page' }, null)
      const s = await conversation(projectId, 45)
      const elsewhere = await asActor(E, (c) =>
        startConversation(
          c,
          projectId,
          randomUUID(),
          { title: 'Elsewhere', text: 'Another place', askSophia: false },
          'Lucía',
        ),
      )
      const k = await claimAs(s.replyId, LIMITS.leaseMs)
      const { s: c, begun } = await begin(s.replyId, k)
      const honest = JSON.parse(recordPayload(await renderBound(c, bindingOf(await begun)))) as Payload
      const cases: Record<string, (p: Payload) => void> = {
        text_is_not_fragments: (p) => {
          p.text += ' '
        },
        template_text: (p) => {
          const head = p.fragments[0]
          if (head) head.text = head.text.replace('untrusted', 'trusted')
        },
        unknown_template: (p) => {
          const f = p.fragments[at(p, tpl('missing.notes'))]
          if (f) f.id = 'missing.ideas'
        },
        omitted_count: (p) => {
          const f = p.fragments[at(p, tpl('messages.omitted'))]
          if (f) Object.assign(f, { args: [4], text: '4 earlier messages not included.\n' })
          p.coverage.messages.omitted = 4
        },
        constraint_text: (p) => {
          const f = p.fragments.find((x) => x.kind === 'item' && x.text.includes('Map before list'))
          if (f) f.text = f.text.replace('Map before list', 'Map after list')
        },
        pending_as_accepted: (p) => {
          const i = p.fragments.findIndex((x) => x.kind === 'item' && x.text.includes('Briefs stay on one page'))
          const [f] = p.fragments.splice(i, 1)
          if (!f) return
          f.item = 'constraint'
          f.text = f.text.replace('- proposed constraint, not decided, at', '- accepted constraint, decided at')
          p.fragments.splice(at(p, tpl('constraints.head')) + 1, 0, f)
          p.coverage.constraints.compiled += 1
          p.coverage.constraints.included += 1
          p.coverage.pending.compiled -= 1
          p.coverage.pending.included -= 1
        },
        stale_label: (p) => {
          const f = p.fragments.find((x) => x.kind === 'item' && x.id === stale)
          if (f) f.text = f.text.replace(', proposed against an earlier mission', '')
        },
        accepted_by: (p) => {
          const f = p.fragments[at(p, itm('mission'))]
          if (f) f.text = f.text.replace(/accepted by actor [0-9a-f-]+/, `accepted by actor ${B}`)
        },
        non_contiguous_window: (p) => {
          const [, end] = section(p, 'messages.head')
          p.fragments.splice(end - 1, 1)
          p.coverage.messages.included -= 1
          p.coverage.messages.omitted += 1
          const f = p.fragments[at(p, tpl('messages.omitted'))]
          if (f) Object.assign(f, { args: [6], text: '6 earlier messages not included.\n' })
        },
        earlier_count: (p) => {
          p.coverage.messages.read += 1
          p.coverage.messages.omitted += 1
          const f = p.fragments[at(p, tpl('messages.omitted'))]
          if (f) Object.assign(f, { args: [6], text: '6 earlier messages not included.\n' })
        },
        revisions: (p) => {
          p.revisions.mission += 1
        },
        sections_swapped: (p) => {
          const [cs, ce] = section(p, 'constraints.head')
          const [ps, pe] = section(p, 'pending.head')
          const constraints = p.fragments.slice(cs, ce)
          const pending = p.fragments.slice(ps, pe)
          p.fragments.splice(cs, pe - cs, ...pending, ...constraints)
        },
        ask_replaced: (p) => {
          const asking = p.fragments.at(-1)
          const newest = p.fragments.at(-3)
          if (asking && newest) Object.assign(asking, { id: newest.id, text: newest.text })
        },
        missing_mission_added: (p) => {
          p.fragments.splice(at(p, tpl('missing.head')) + 1, 0, {
            kind: 'template',
            id: 'missing.accepted_mission',
            args: [],
            text: '- no accepted mission\n',
          })
        },
        mission_omitted: (p) => {
          const i = at(p, itm('mission'))
          p.fragments.splice(i, 1, { kind: 'template', id: 'mission.none', args: [], text: 'No accepted mission.\n' })
          p.fragments.splice(at(p, tpl('missing.head')) + 1, 0, {
            kind: 'template',
            id: 'missing.accepted_mission',
            args: [],
            text: '- no accepted mission\n',
          })
        },
        renderer: (p) => {
          p.renderer = 'sophia.conversation-context.v2'
        },
        compiler: (p) => {
          p.compiler = 'sophia.mission-context.v2'
        },
        after_ask: (p) => {
          p.fragments.push({ kind: 'template', id: 'messages.none', args: [], text: 'No earlier messages.\n' })
        },
        another_conversation: (p) => {
          const f = p.fragments.at(-3)
          if (f) Object.assign(f, { id: elsewhere.messageId, text: f.text.replace(/"Words \d+"/, '"Another place"') })
        },
        extra_key: (p) => {
          const head = p.fragments[0]
          if (head) head.extra = 1
        },
        // CX99: a fragment whose item is JSON null, alone and as the cover for sections out of order.
        null_item: (p) => {
          const asking = p.fragments.at(-1)
          if (asking) Object.assign(asking, { item: null })
        },
        null_item_sections_swapped: (p) => {
          const asking = p.fragments.at(-1)
          if (asking) Object.assign(asking, { item: null })
          const [cs, ce] = section(p, 'constraints.head')
          const [ps, pe] = section(p, 'pending.head')
          const constraints = p.fragments.slice(cs, ce)
          const pending = p.fragments.slice(ps, pe)
          p.fragments.splice(cs, pe - cs, ...pending, ...constraints)
        },
        numeric_item: (p) => {
          const asking = p.fragments.at(-1)
          if (asking) Object.assign(asking, { item: 5 })
        },
        non_object_fragment: (p) => {
          p.fragments.splice(1, 0, 'stray' as unknown as Fragment)
        },
      }
      const refused: Record<string, string> = {}
      for (const [name, mutate] of Object.entries(cases)) {
        const p = structuredClone(honest)
        mutate(p)
        if (name !== 'text_is_not_fragments') resync(p)
        await c.query('SAVEPOINT forged')
        refused[name] = await refusal(record(c, s.replyId, k, JSON.stringify(p)))
        await c.query('ROLLBACK TO SAVEPOINT forged')
      }
      assert.deepEqual(
        refused,
        Object.fromEntries(
          Object.keys(cases).map((n) => [n, n === 'compiler' ? 'context_compiler_changed' : 'context_forged']),
        ),
      )
      assert.equal((await record(c, s.replyId, k, JSON.stringify(honest))).verdict, 'recorded')
      await c.query('COMMIT')
      c.release(true)
      assert.equal((await contexts(s.replyId))[0]?.body, honest.text)
    })

    it('trusts the compiler’s counts, as declared (`trusted: coverage`): a compiled count is not selected again', async () => {
      const s = await scene(1)
      const k = await claimAs(s.replyId, LIMITS.leaseMs)
      const { s: c, begun } = await begin(s.replyId, k)
      const p = JSON.parse(recordPayload(await renderBound(c, bindingOf(await begun)))) as Payload
      const [, end] = (() => {
        const from = p.fragments.findIndex((f) => f.kind === 'template' && f.id === 'constraints.head')
        const to = p.fragments.findIndex((f, i) => i > from && f.kind === 'template' && f.id === 'pending.head')
        return [from, to] as const
      })()
      p.fragments.splice(end, 0, {
        kind: 'template',
        id: 'constraints.omitted',
        args: [2],
        text: '2 more accepted constraints and lessons not included.\n',
      })
      p.coverage.constraints.compiled += 2
      p.coverage.constraints.omitted = 2
      p.text = p.fragments.map((f) => f.text).join('')
      assert.equal((await record(c, s.replyId, k, JSON.stringify(p))).verdict, 'recorded')
      await c.query('ROLLBACK')
      c.release(true)
    })
  })

  describe('failing closed', () => {
    it('answers not_pending for every other state, and claims nothing', async () => {
      for (const state of ['running', 'answered', 'failed', 'cancelled', 'blocked', 'outcome_unknown']) {
        const s = await scene(1)
        const answer =
          state === 'answered'
            ? (
                await owner<{ id: string }>(
                  `SELECT (sophia.conversation_append($1, $2, 'sophia', NULL, NULL, 'An answer', $3)).id AS id`,
                  [s.projectId, s.conversationId, s.replyId],
                )
              )[0]?.id
            : null
        await owner(
          `UPDATE sophia.conversation_replies SET state = $2, answer_id = $3, reason = CASE WHEN $2 IN ('failed','cancelled','blocked','outcome_unknown') THEN 'test_state' END,
             settled_at = CASE WHEN $2 = 'running' THEN NULL ELSE clock_timestamp() END WHERE id = $1`,
          [s.replyId, state, answer],
        )
        const was = await replyOf(s.replyId)
        assert.deepEqual(await assembleReply(loginUrl, s.replyId, LIMITS), { outcome: 'not_pending', state })
        assert.deepEqual(await replyOf(s.replyId), was, state)
        assert.deepEqual(await claims(s.replyId), [], state)
      }
    })

    it('closes a reply whose asker is gone or no longer writes, whose conversation is erased or whose asking text is withdrawn', async () => {
      const cases: Array<[string, (s: Scene) => Promise<unknown>]> = [
        [
          'asker_removed',
          (s) =>
            owner(`UPDATE sophia.project_members SET active = false WHERE project_id = $1 AND actor_id = $2`, [
              s.projectId,
              E,
            ]),
        ],
        [
          'asker_removed',
          (s) =>
            owner(`UPDATE sophia.project_members SET role = 'viewer' WHERE project_id = $1 AND actor_id = $2`, [
              s.projectId,
              E,
            ]),
        ],
        [
          'conversation_erased',
          (s) =>
            owner(`UPDATE sophia.conversations SET state = 'erased', title = NULL WHERE id = $1`, [s.conversationId]),
        ],
        [
          'source_withdrawn',
          (s) =>
            owner(
              `UPDATE sophia.conversation_messages SET body = NULL, author_name = NULL, withdrawn_at = now(), withdrawn_by = 'author' WHERE id = $1`,
              [s.askId],
            ),
        ],
      ]
      for (const [reason, change] of cases) {
        const s = await scene(1)
        await change(s)
        assert.deepEqual(await assembleReply(loginUrl, s.replyId, LIMITS), { outcome: 'closed', reason })
        assert.deepEqual(await replyOf(s.replyId), { state: 'cancelled', reason, settled: true })
        assert.deepEqual(
          (await claims(s.replyId)).map((r) => [r.outcome, r.outcome_reason]),
          [['closed', reason]],
        )
        assert.deepEqual(await contexts(s.replyId), [])
      }
    })

    it('a recorded context is used again only after the privacy checks: an asker removed since closes the reply and scrubs it', async () => {
      const s = await scene(2)
      assert.equal((await assembleReply(loginUrl, s.replyId, LIMITS)).outcome, 'recorded')
      await owner(`UPDATE sophia.project_members SET active = false WHERE project_id = $1 AND actor_id = $2`, [
        s.projectId,
        E,
      ])
      assert.deepEqual(await assembleReply(loginUrl, s.replyId, LIMITS), { outcome: 'closed', reason: 'asker_removed' })
      const [x] = await contexts(s.replyId)
      assert.deepEqual([x?.body, x?.scrubbed_by], [null, 'reply_ended'])
      assert.equal((await claims(s.replyId)).length, 1, 'counted nothing')
    })

    it('refuses a close on a verdict that does not hold, a fail on a reason that is not terminal, the wrong isolation, a bad lease, an unknown reply', async () => {
      const s = await scene(1)
      const k = await claimAs(s.replyId, LIMITS.leaseMs)
      const { s: c } = await session()
      try {
        await c.query(`BEGIN; ${AS_ASSEMBLER}`)
        const close = 'SELECT sophia.conversation_assembly_close($1, $2, $3, $4)'
        const fail = 'SELECT sophia.conversation_assembly_fail($1, $2, $3, $4)'
        const claim = 'SELECT sophia.conversation_assembly_claim($1, $2)'
        assert.equal(await refusal(c.query(close, [s.replyId, k.attempt, k.token, 'asker_removed'])), 'close_refused')
        await c.query('ROLLBACK')
        for (const reason of ['serialization', 'statement_timeout', 'source_withdrawn', 'context_unstable']) {
          await c.query(`BEGIN; ${AS_ASSEMBLER}`)
          assert.equal(await refusal(c.query(fail, [s.replyId, k.attempt, k.token, reason])), 'invalid_reason', reason)
          await c.query('ROLLBACK')
        }
        await c.query(`BEGIN ISOLATION LEVEL REPEATABLE READ; ${AS_ASSEMBLER}`)
        assert.equal(await refusal(c.query(claim, [s.replyId, 1000])), 'read_committed_required')
        await c.query('ROLLBACK')
        await c.query(`BEGIN; ${AS_ASSEMBLER}`)
        assert.equal(
          await refusal(
            c.query('SELECT sophia.conversation_assembly_begin($1, $2, $3)', [s.replyId, k.attempt, k.token]),
          ),
          'repeatable_read_required',
        )
        await c.query('ROLLBACK')
        await c.query(`BEGIN ISOLATION LEVEL REPEATABLE READ; ${AS_ASSEMBLER}`)
        assert.equal(
          await refusal(record(c, s.replyId, k, '{}')),
          'claim_not_current',
          'a record with no begin in its transaction',
        )
        await c.query('ROLLBACK')
        await c.query(`BEGIN; ${AS_ASSEMBLER}`)
        assert.equal(await refusal(c.query(claim, [s.replyId, 0])), 'invalid_lease')
        await c.query('ROLLBACK')
        await c.query(`BEGIN; ${AS_ASSEMBLER}`)
        assert.equal(await refusal(c.query(claim, [randomUUID(), 1000])), 'no_reply')
        await c.query('ROLLBACK')
      } finally {
        c.release(true)
      }
      assert.deepEqual(await replyOf(s.replyId), { state: 'pending', reason: null, settled: false })
    })
  })

  describe('scrubbing: the recorded body goes when what it read goes or the reply ends', () => {
    async function recorded(earlier = 3) {
      const s = await scene(earlier)
      assert.equal((await assembleReply(loginUrl, s.replyId, LIMITS)).outcome, 'recorded')
      const [x] = await contexts(s.replyId)
      assert.ok(x?.body)
      return { s, x }
    }

    /** The scrub receipt: no body, no message hash, when and why; ids, seqs, revisions, sources and the hash kept. */
    async function scrubbed(s: Scene, x: Context, by: string) {
      const [now] = await contexts(s.replyId)
      assert.ok(now)
      assert.deepEqual([now.body, now.scrubbed_by, now.scrubbed_at !== null], [null, by, true])
      assert.deepEqual(
        { ...now, body: null, scrubbed_at: null, scrubbed_by: null },
        { ...x, body: null, scrubbed_at: null, scrubbed_by: null },
        'everything else kept',
      )
      const hashes = await owner<{ n: number; nulls: number }>(
        `SELECT count(*)::int AS n, count(*) FILTER (WHERE body_sha256 IS NULL)::int AS nulls FROM sophia.conversation_reply_messages WHERE reply_id = $1`,
        [s.replyId],
      )
      assert.equal(hashes[0]?.nulls, hashes[0]?.n)
      assert.ok((hashes[0]?.n ?? 0) > 0)
    }

    it('scrubs at an author’s withdrawal, an admin’s, and an erasure; the reply is cancelled', async () => {
      const paths: Array<[string, (s: Scene) => Promise<unknown>, string]> = [
        [
          'author',
          (s) => asActor(E, (c) => withdrawConversationMessage(c, s.conversationId, s.earlier[1] ?? '', randomUUID())),
          'source_withdrawn',
        ],
        [
          'admin',
          (s) => asActor(A, (c) => withdrawConversationMessage(c, s.conversationId, s.earlier[2] ?? '', randomUUID())),
          'source_withdrawn',
        ],
        [
          'erasure',
          (s) => asActor(A, (c) => eraseConversation(c, s.conversationId, randomUUID())),
          'conversation_erased',
        ],
      ]
      for (const [name, withdraw, reason] of paths) {
        const { s, x } = await recorded()
        await withdraw(s)
        await scrubbed(s, x, 'message_withdrawn')
        assert.deepEqual(await replyOf(s.replyId), { state: 'cancelled', reason, settled: true }, name)
        const found = await owner(
          `SELECT 1 FROM sophia.conversation_reply_contexts WHERE reply_id = $1 AND body LIKE '%Words%'`,
          [s.replyId],
        )
        assert.deepEqual(
          found,
          [],
          `${name}: a byte search of the record finds no text (evidence, not proof of deletion)`,
        )
      }
    })

    it('scrubs at each terminal state, a withdrawal the window never read included', async () => {
      for (const state of ['answered', 'failed', 'cancelled', 'blocked', 'outcome_unknown']) {
        const { s, x } = await recorded()
        const answer =
          state === 'answered'
            ? (
                await owner<{ id: string }>(
                  `SELECT (sophia.conversation_append($1, $2, 'sophia', NULL, NULL, 'An answer', $3)).id AS id`,
                  [s.projectId, s.conversationId, s.replyId],
                )
              )[0]?.id
            : null
        await owner(
          `UPDATE sophia.conversation_replies SET state = $2, answer_id = $3, reason = CASE WHEN $2 = 'answered' THEN NULL ELSE 'test_state' END,
             settled_at = clock_timestamp() WHERE id = $1`,
          [s.replyId, state, answer],
        )
        await scrubbed(s, x, 'reply_ended')
      }
      // A message older than the window of 40: the context never read it, the reply is cancelled, and that scrubs it.
      const { s, x } = await recorded(42)
      assert.equal(x.included, 40)
      await asActor(E, (c) => withdrawConversationMessage(c, s.conversationId, s.earlier[0] ?? '', randomUUID()))
      await scrubbed(s, x, 'reply_ended')
    })

    it('supersedes and scrubs a record whose revisions moved, and records again as the next attempt', async () => {
      const { s, x } = await recorded()
      await propose(s.projectId, A, { kind: 'constraint', statement: 'Keep it short' }, A)
      assert.equal((await assembleReply(loginUrl, s.replyId, LIMITS)).outcome, 'recorded')
      const [was, now] = await contexts(s.replyId)
      assert.deepEqual(
        [was?.state, was?.body, was?.scrubbed_by, was?.context_hash],
        ['superseded', null, 'superseded', x.context_hash],
      )
      assert.deepEqual([now?.attempt, now?.state], [2, 'recorded'])
      assert.ok(now?.body?.includes('Keep it short'))
    })

    it('a withdrawal against an assembly, both orders: first, a 40001 then not pending; after, a record then scrubbed', async () => {
      // The withdrawal first: committed after begin's snapshot, before its locks.
      const s = await scene(3)
      const k = await claimAs(s.replyId, LIMITS.leaseMs)
      const held = gate()
      const inside = gate()
      const withdrawal = asActor(E, async (c) => {
        await withdrawConversationMessage(c, s.conversationId, s.earlier[1] ?? '', randomUUID())
        inside.open()
        await held.wait
      })
      await inside.wait
      const { s: c, pid, begun } = await begin(s.replyId, k)
      await waitFor('begin to wait', () => waiting(pid))
      held.open()
      await withdrawal
      assert.equal(await refusal(begun), '40001')
      await c.query('ROLLBACK')
      c.release(true)
      assert.deepEqual(await assembleReply(loginUrl, s.replyId, LIMITS), { outcome: 'not_pending', state: 'cancelled' })
      assert.deepEqual(await contexts(s.replyId), [])
      // The assembly first: recorded, then scrubbed by the withdrawal's trigger.
      const { s: r, x } = await recorded()
      await asActor(E, (w) => withdrawConversationMessage(w, r.conversationId, r.earlier[1] ?? '', randomUUID()))
      await scrubbed(r, x, 'message_withdrawn')
    })

    it('keeps what it recorded: a body never returns, and no claim or record is deleted or truncated, even by the owner', async () => {
      const { s } = await recorded()
      await owner(
        `UPDATE sophia.conversation_replies SET state = 'failed', reason = 'test_state', settled_at = now() WHERE id = $1`,
        [s.replyId],
      )
      const tries = [
        `UPDATE sophia.conversation_reply_contexts SET body = 'restored', scrubbed_at = NULL, scrubbed_by = NULL WHERE reply_id = '${s.replyId}'`,
        `UPDATE sophia.conversation_reply_messages SET body_sha256 = repeat('a', 64) WHERE reply_id = '${s.replyId}'`,
        `UPDATE sophia.conversation_reply_sources SET sha256 = repeat('a', 64) WHERE reply_id = '${s.replyId}'`,
        `UPDATE sophia.conversation_assembly_claims SET outcome = NULL, outcome_at = NULL WHERE reply_id = '${s.replyId}'`,
        `UPDATE sophia.conversation_assembly_claims SET lease_expires_at = lease_expires_at + interval '1 day' WHERE reply_id = '${s.replyId}'`,
        `DELETE FROM sophia.conversation_assembly_claims WHERE reply_id = '${s.replyId}'`,
        `DELETE FROM sophia.conversation_reply_messages WHERE reply_id = '${s.replyId}'`,
        'TRUNCATE sophia.conversation_assembly_claims CASCADE',
        'TRUNCATE sophia.conversation_reply_contexts CASCADE',
      ]
      // On its own connection with a lock_timeout: a lock left by another test fails this one, never hangs it.
      const c = new pg.Client({ connectionString: db.ownerUrl })
      await c.connect()
      try {
        await c.query('SET lock_timeout = 5000')
        for (const sql of tries) assert.equal(await refusal(c.query(sql)), 'context_kept', sql)
      } finally {
        await c.end()
      }
    })
  })

  describe('writers and an assembly', () => {
    it('a conversation writer and a mission writer wait for an assembly’s commit, then proceed', async (t) => {
      const s = await scene(2)
      const k = await claimAs(s.replyId, LIMITS.leaseMs)
      const { s: c, begun } = await begin(s.replyId, k)
      const binding = bindingOf(await begun)
      const pids: number[] = []
      const sending = asActor(E, async (w) => {
        pids.push((await w.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0)
        return sendConversationMessage(
          w,
          s.conversationId,
          randomUUID(),
          { text: 'While assembling', askSophia: false },
          'Lucía',
        )
      })
      const proposing = asActor(A, async (w) => {
        pids.push((await w.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0)
        return proposeMissionChange(w, s.projectId, randomUUID(), { kind: 'constraint', statement: 'Later' })
      })
      await waitFor(
        'both writers to wait',
        async () => pids.length === 2 && (await waiting(pids[0] ?? 0)) && (await waiting(pids[1] ?? 0)),
      )
      const rows = await owner<{ pid: number; wait_event_type: string; wait_event: string }>(
        'SELECT pid, wait_event_type, wait_event FROM pg_stat_activity WHERE pid = ANY($1) ORDER BY pid',
        [pids],
      )
      t.diagnostic(`waiting in pg_stat_activity: ${JSON.stringify(rows.map((r) => [r.wait_event_type, r.wait_event]))}`)
      await record(c, s.replyId, k, recordPayload(await renderBound(c, binding)))
      await c.query('COMMIT')
      c.release(true)
      await sending
      await proposing
      assert.equal((await contexts(s.replyId))[0]?.state, 'recorded')
    })
  })

  it('wrote no runtime, model, allowance or dispatch row anywhere', async () => {
    const rows = await owner<{ relname: string; n: string }>(
      `SELECT c.relname, (xpath('/row/n/text()',
                query_to_xml(format('SELECT count(*) AS n FROM sophia.%I', c.relname), false, true, '')))[1]::text AS n
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'sophia' AND c.relname = ANY($1)`,
      [UNTOUCHED],
    )
    assert.equal(rows.length, UNTOUCHED.length)
    for (const r of rows) assert.equal(r.n, '0', r.relname)
  })
})
