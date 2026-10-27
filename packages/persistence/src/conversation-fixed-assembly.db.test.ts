// 0084 (FND-B-ASK-ALTERNATIVE-01): a reply's context through the fixed claim-bound readers, read by the worker's own login,
// which can be no assembler. The real API and worker logins and functions, the real Ask, dispatch and assembleReply;
// owner-run setup only for what no runtime path writes (a mode switch, a lapsed lease, a removed member). Each refusal is
// asserted at the worker's own connection: no role it may assume, no claim it did not begin in the same transaction, no
// actor or project of its own, no relation a temporary table of its own could stand in for. And (#487 P1) no session
// that assumed the assembler before the owner's cutover may outlive it into the fixed mode: enable waits for it to close.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import type { MissionProposalRequest } from '@sophia/contracts'
import { readMissionContextFixed } from './mission-context.ts'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  assembleReply,
  recordPayload,
  renderBound,
  renderFixed,
  type AssemblyLimits,
  type Binding,
} from './conversation-assembly.ts'
import {
  decideMissionChange,
  previewMissionWithdrawal,
  proposeMissionChange,
  recordMissionEntry,
  sendConversationMessage,
  shownReach,
  startConversation,
  withActor,
  withdrawConversationMessage,
  withdrawMissionEntry,
} from './index.ts'

const A = randomUUID() // admin
const E = randomUUID() // editor who asks
const B = randomUUID() // editor
const ROUTE = 'route-test'
const ROLE = 'sophia_conversation_assembler'
/** Local test values (checkedLimits' rules): not live configuration. */
const LIMITS: AssemblyLimits = {
  leaseMs: 6_000,
  deadlineMs: 2_000,
  connectMs: 1_000,
  statementTimeoutMs: 1_000,
  lockTimeoutMs: 500,
  idleInTransactionMs: 1_000,
  connectionCheckMs: 500,
}

interface World {
  db: TestDatabase
  owner: pg.Pool
  api: pg.Pool
  worker: pg.Pool
}

async function open(assembler: boolean): Promise<World> {
  const db = await createTestDatabase(undefined, { assembler })
  return {
    db,
    owner: new pg.Pool({ connectionString: db.ownerUrl, max: 2 }),
    api: new pg.Pool({ connectionString: db.apiUrl, max: 2 }),
    worker: new pg.Pool({ connectionString: db.workerUrl, max: 2 }),
  }
}

async function close(w: World) {
  await Promise.all([w.owner.end(), w.api.end(), w.worker.end()])
  await w.db.drop()
}

/** One connection of `url`'s login, used and closed: the worker's own, or the login route's. */
async function asLogin<T>(url: string, run: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  const c = await pool.connect()
  try {
    return await run(c)
  } finally {
    c.release(true)
    await pool.end()
  }
}

/** The worker's own login: everything the fixed mode lets it do, it does through this. */
const asWorker = <T>(w: World, run: (c: pg.PoolClient) => Promise<T>) => asLogin(w.db.workerUrl, run)

const check = (name: string) => readFileSync(new URL(`../../../db/candidates/${name}`, import.meta.url), 'utf8')
/** The login route's Q13 activation check (unchanged), for one login; and the fixed mode's own. */
const LOGIN_CHECK = check('con01-s3-assembler-activation-check.sql').replace(":'login'", '$1')
const FIXED_CHECK = check('con01-fixed-assembly-activation-check.sql')

/** An activation check's holds, read as the owner with search_path pg_catalog, as each check requires. */
async function holds(w: World, sql: string, args: unknown[] = []): Promise<string[]> {
  const c = await w.owner.connect()
  try {
    await c.query('SET search_path=pg_catalog')
    return (await c.query<{ what: string }>(sql, args)).rows.map((r) => r.what)
  } finally {
    c.release(true)
  }
}

const enable = (w: World) => w.owner.query('SELECT sophia.conversation_enable_fixed_assembly() AS on')
const markCutover = (c: pg.Pool | pg.Client) => c.query('SELECT sophia.conversation_mark_fixed_assembly_cutover()')

/** Login sessions of this database that may be the assembler by enable's rule: no superuser's, begun by the cutover. */
async function unsettled(w: World): Promise<number[]> {
  const { rows } = await w.owner.query<{ pid: number }>(
    `SELECT s.pid FROM pg_stat_activity s, sophia.conversation_fixed_assembly_cutover c
      WHERE s.datid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND s.pid<>pg_backend_pid()
        AND s.usesysid IS NOT NULL AND NOT coalesce((SELECT rolsuper FROM pg_roles WHERE oid=s.usesysid), false)
        AND s.backend_start<=c.marked_at ORDER BY s.pid`,
  )
  return rows.map((r) => r.pid)
}

/** Until `done`, within 5 s: a closed client's backend leaves pg_stat_activity shortly after, not at once. */
async function until(done: () => Promise<boolean>) {
  for (const stop = Date.now() + 5_000; !(await done()); await delay(50))
    if (Date.now() > stop) assert.fail('not settled within 5 s')
}

/**
 * The owner's cutover, then what enable waits for: this fixture's API and worker pools, opened before it, close
 * voluntarily and open again. Nothing is terminated; a session they do not own (`keep`) is left as it is.
 */
async function cutover(w: World, keep: number[] = []) {
  await markCutover(w.owner)
  await Promise.all([w.api.end(), w.worker.end()])
  w.api = new pg.Pool({ connectionString: w.db.apiUrl, max: 2 })
  w.worker = new pg.Pool({ connectionString: w.db.workerUrl, max: 2 })
  await until(async () => JSON.stringify(await unsettled(w)) === JSON.stringify(keep))
}
const admitted = async (w: World) =>
  (await w.owner.query<{ v: boolean }>('SELECT sophia.conversation_assembler_admitted() AS v')).rows[0]?.v

/** A project with conversations on, a ready runtime offering the conversation role, and a grant naming E. */
async function project(w: World) {
  const { projectId } = await seedProject(w.db.ownerUrl, { admin: A, editors: [E, B] })
  await w.owner.query("SELECT sophia.set_conversation_settings($1,'enabled','fnd-b-ask-alternative-test')", [projectId])
  const rt = await registerRuntime(w.db.ownerUrl, { projectId, admin: A, runtimeUnitId: 'sophia-runtime-test' })
  const hash = createHash('sha256').update(rt.token).digest()
  const bridge = randomUUID()
  const call = (op: string, body: unknown) =>
    w.api.query(`SELECT sophia.runtime_${op}($1,$2,$3,$4::jsonb) AS v`, [hash, rt.runtimeUnitId, bridge, body])
  await call('hello', {
    protocolVersion: 1,
    roles: [{ id: 'sophia-conversation-v1', route: ROUTE, presetDigest: 'synthetic' }],
  })
  await call('record_ready', { state: 'ready', reason: null, unrecovered: [] })
  await w.owner.query('SELECT sophia.conversation_new_lineage($1,$2::jsonb)', [
    projectId,
    {
      unit: 'calls_tokens',
      routeId: ROUTE,
      credentialRef: 'synthetic-credential-ref',
      ownerResourceRef: 'synthetic-owner-resource-ref',
      approvalRef: `fnd-b-ask-alternative-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      maxCallsPerReply: 2,
      totalCallCap: 10,
      replyTokenCap: 100_000,
      totalTokenCap: 500_000,
      subjects: [E],
    },
  ])
  return projectId
}

/** A proposal by `actor`, which A accepts, rejects, or leaves waiting. */
async function propose(
  w: World,
  projectId: string,
  actor: string,
  write: MissionProposalRequest,
  decision: 'accept' | 'reject' | null = 'accept',
) {
  const r = await withActor(w.api, actor, 'write', (c) => proposeMissionChange(c, projectId, randomUUID(), write))
  assert.ok(r.decisionId)
  if (decision !== null)
    await withActor(w.api, A, 'write', (c) =>
      decideMissionChange(c, projectId, r.decisionId ?? '', randomUUID(), {
        decision,
        expectedRevision: r.decisionRevision ?? 1,
      }),
    )
}

/**
 * Records every compiler read: a mission, a constraint, a lesson, a pending and a rejected proposal (the decided list),
 * E's current note and a note E withdrew (the history).
 */
async function ledger(w: World, projectId: string) {
  await propose(w, projectId, A, { kind: 'mission', statement: 'Ship the map first', purpose: 'People find places' })
  await propose(w, projectId, A, { kind: 'constraint', statement: 'Map before list' })
  await propose(w, projectId, A, { kind: 'lesson', statement: 'Ask before building' })
  await propose(w, projectId, E, { kind: 'constraint', statement: 'Briefs stay on one page' }, null)
  await propose(w, projectId, E, { kind: 'constraint', statement: 'Drop the list view' }, 'reject')
  await withActor(w.api, E, 'write', (c) =>
    recordMissionEntry(c, projectId, randomUUID(), {
      kind: 'observation',
      epistemic: 'reported',
      text: 'Pins load slowly',
    }),
  )
  const old = await withActor(w.api, E, 'write', (c) =>
    recordMissionEntry(c, projectId, randomUUID(), { kind: 'observation', epistemic: 'reported', text: 'Old guess' }),
  )
  const entryId = old.entryId ?? assert.fail('a note')
  const preview = await withActor(w.api, E, 'read', (c) => previewMissionWithdrawal(c, projectId, entryId))
  await withActor(w.api, E, 'write', (c) =>
    withdrawMissionEntry(c, projectId, entryId, randomUUID(), shownReach(preview)),
  )
}

/** E asks Sophia, after a short exchange, through the API login's functions. */
async function ask(w: World, projectId: string) {
  const first = await withActor(w.api, E, 'write', (c) =>
    startConversation(c, projectId, randomUUID(), { title: 'Ask', text: 'Opening.', askSophia: false }, 'E'),
  )
  await withActor(w.api, B, 'write', (c) =>
    sendConversationMessage(c, first.conversationId, randomUUID(), { text: 'B adds a detail.', askSophia: false }, 'B'),
  )
  const asked = await withActor(w.api, E, 'write', (c) =>
    sendConversationMessage(c, first.conversationId, randomUUID(), { text: 'A question.', askSophia: true }, 'E'),
  )
  assert.ok(asked.replyId)
  return { projectId, conversationId: first.conversationId, askId: asked.messageId, replyId: asked.replyId }
}

const reply = async (w: World, replyId: string) =>
  (
    await w.owner.query<{ state: string; reason: string | null }>(
      'SELECT state,reason FROM sophia.conversation_replies WHERE id=$1',
      [replyId],
    )
  ).rows[0]

/** One worker dispatch of the reply's create: the outbox leased as the claim does, then the worker's function. */
async function dispatch(w: World, s: { projectId: string; replyId: string }) {
  await w.owner.query(
    "UPDATE sophia.outbox SET available_at=now() WHERE conversation_reply_id=$1 AND destination='native.create'",
    [s.replyId],
  )
  const lease = randomUUID()
  const row = (
    await w.owner.query<{ id: string }>(
      `UPDATE sophia.outbox SET state='dispatching',lease_owner='test-worker',lease_token=$3,
        lease_until=clock_timestamp()+interval '30 seconds',attempts=attempts+1
       WHERE project_id=$1 AND conversation_reply_id=$2 AND destination='native.create' AND state='pending' RETURNING id`,
      [s.projectId, s.replyId, lease],
    )
  ).rows[0]
  assert.ok(row, 'a pending create')
  return (
    await w.worker.query<{ v: { result: string; reason?: string } }>(
      'SELECT sophia.dispatch_runtime_outbox($1,$2,$3) AS v',
      [s.projectId, row.id, lease],
    )
  ).rows[0]?.v
}

interface Claim {
  replyId: string
  attempt: number
  token: string
}

/** A claim taken through the entry point, committed, as assembleReply's first transaction takes it. */
async function claimAs(c: pg.PoolClient, replyId: string, asAssembler: boolean, leaseMs = 60_000): Promise<Claim> {
  await c.query('BEGIN')
  if (asAssembler) await c.query(`SET LOCAL ROLE ${ROLE}`)
  const v = (
    await c.query<{ v: { verdict: string; attempt: number; token: string } }>(
      'SELECT sophia.conversation_assembly_claim($1, $2) AS v',
      [replyId, leaseMs],
    )
  ).rows[0]?.v
  await c.query('COMMIT')
  assert.equal(v?.verdict, 'claimed')
  return { replyId, attempt: v.attempt, token: v.token }
}

/** BEGIN REPEATABLE READ and the claim's begin: begin's binding, as conversation-assembly reads it. */
async function begin(c: pg.PoolClient, k: Claim, asAssembler: boolean): Promise<Binding> {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
  if (asAssembler) await c.query(`SET LOCAL ROLE ${ROLE}`)
  const v = (
    await c.query<{ v: Record<string, unknown> }>('SELECT sophia.conversation_assembly_begin($1,$2,$3) AS v', [
      k.replyId,
      k.attempt,
      k.token,
    ])
  ).rows[0]?.v
  assert.equal(v?.verdict, 'begun', JSON.stringify(v))
  return {
    projectId: String(v.projectId),
    conversationId: String(v.conversationId),
    askedBy: String(v.askedBy),
    messageId: String(v.messageId),
    cutoffSeq: Number(v.cutoffSeq),
    earlierCount: Number(v.earlierCount),
    window: v.window as string[],
  }
}

const PROJECT_READ = 'SELECT * FROM sophia.conversation_assembly_read_project($1,$2,$3)'

/** The worker's reader call, its rows or its refusal's SQLSTATE and message. */
async function read(c: pg.PoolClient, sql: string, args: unknown[]) {
  try {
    return { rows: (await c.query(sql, args)).rows }
  } catch (err) {
    const e = err as pg.DatabaseError
    return { code: e.code, message: e.message }
  }
}

describe('0084 installed and not enabled: OFF', () => {
  let w: World
  before(async () => {
    w = await open(false)
  })
  after(() => close(w))

  it('refuses the Ask at once (context_assembler_unbound); the worker can begin nothing and no reader reads', async () => {
    assert.equal(await admitted(w), false)
    const s = await ask(w, await project(w))
    assert.deepEqual(await reply(w, s.replyId), { state: 'blocked', reason: 'context_assembler_unbound' })
    await asWorker(w, async (c) => {
      assert.equal((await read(c, 'SELECT sophia.conversation_assembly_claim($1, 60000)', [s.replyId])).code, '42501')
      const r = await read(c, 'SELECT * FROM sophia.conversation_assembly_read_project($1,1,$2)', [
        s.replyId,
        randomUUID(),
      ])
      assert.deepEqual(r, { code: '42501', message: 'fixed assembly is not enabled' }, 'owned by postgres: refused')
    })
    const owners = await w.owner.query<{ o: string }>(
      `SELECT DISTINCT p.proowner::regrole::text AS o FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='sophia' AND p.proname ~ '^conversation_assembly_(read_|count_|has_)'`,
    )
    assert.deepEqual(
      owners.rows.map((r) => r.o),
      ['postgres'],
    )
    // No cutover yet: what an earlier session may still be is unknown, so enable is refused and the gate holds it.
    await assert.rejects(enable(w), { code: '55000', message: /no cutover recorded/ })
    assert.ok(
      (await holds(w, FIXED_CHECK)).includes('no cutover recorded (sophia.conversation_mark_fixed_assembly_cutover)'),
    )
  })
})

describe('0084: the same records render the same context through the login route and the fixed readers', () => {
  let w: World
  before(async () => {
    w = await open(true)
  })
  after(() => close(w))

  it('byte for byte, in the same snapshot, for the same claim: the readers are the compiler’s reads, no more', async () => {
    assert.ok(w.db.assemblerUrl && w.db.assemblerRole)
    const projectId = await project(w)
    await ledger(w, projectId)
    const s = await ask(w, projectId)
    const { k, viaLogin } = await asLogin(w.db.assemblerUrl, async (login) => {
      const claimed = await claimAs(login, s.replyId, true)
      const b = await begin(login, claimed, true)
      const rendered = await renderBound(login, b)
      await login.query('ROLLBACK')
      return { k: claimed, viaLogin: rendered }
    })
    // The login route's own gate on this cluster: PUBLIC CONNECT on template1 reaches every login, as on the managed
    // cluster, and Q13 holds it. Unchanged, and not passed by anything here.
    assert.ok((await holds(w, LOGIN_CHECK, [w.db.assemblerRole])).includes('admitted to template1 (PUBLIC CONNECT)'))
    // The login route retired (its login no longer a member), then the fixed mode enabled: claim and records unchanged.
    await w.owner.query(`REVOKE ${ROLE} FROM ${w.db.assemblerRole}`)
    await cutover(w)
    assert.deepEqual((await enable(w)).rows[0], { on: true })
    assert.deepEqual(await holds(w, FIXED_CHECK), [], 'the fixed mode’s own gate holds nothing once enabled')
    const viaFixed = await asWorker(w, async (c) => {
      const b = await begin(c, k, false)
      const r = await renderFixed(c, k, b)
      await c.query('ROLLBACK')
      return r
    })
    assert.equal(viaFixed.text, viaLogin.text)
    assert.deepEqual(viaFixed, viaLogin)
    for (const part of ['Ship the map first', 'Map before list', 'Ask before building', 'Briefs stay on one page'])
      assert.ok(viaFixed.text.includes(part), part)
    // The decided list and the history are read too (the rejected proposal, the withdrawn note's place, not its text).
    const ctx = await asWorker(w, async (c) => {
      const b = await begin(c, k, false)
      const m = await readMissionContextFixed(c, k, b.projectId, { actorId: b.askedBy, channel: 'studio' })
      await c.query('ROLLBACK')
      return m
    })
    assert.ok(ctx?.decided.some((d) => d.state === 'rejected' && d.statement === 'Drop the list view'))
    assert.ok(ctx?.history.some((h) => h.state === 'withdrawn' && h.text === null))
    assert.ok(!viaFixed.text.includes('Old guess'))
  })
})

describe('0084 enabled: the fixed mode end to end, and every boundary at the worker’s own connection', () => {
  let w: World
  before(async () => {
    w = await open(false)
    await cutover(w)
    assert.deepEqual((await enable(w)).rows[0], { on: true })
  })
  after(() => close(w))

  it('an Ask waits, the worker’s own login records its context, and the create is dispatched once, with no credential', async () => {
    assert.equal(await admitted(w), true)
    const projectId = await project(w)
    await ledger(w, projectId)
    const s = await ask(w, projectId)
    assert.deepEqual(await reply(w, s.replyId), { state: 'pending', reason: null })
    assert.deepEqual(await dispatch(w, s), { result: 'deferred', reason: 'waiting for reply context' })
    const recorded = await assembleReply(w.db.workerUrl, s.replyId, LIMITS, 'fixed')
    assert.equal(recorded.outcome, 'recorded')
    assert.equal((await assembleReply(w.db.workerUrl, s.replyId, LIMITS, 'fixed')).outcome, 'already_recorded')
    assert.equal((await dispatch(w, s))?.result, 'dispatched')
    const sent = await w.owner.query<{ body: unknown }>(
      `SELECT rc.body FROM sophia.runtime_commands rc JOIN sophia.work_attempts a ON a.id=rc.attempt_id
        WHERE a.conversation_reply_id=$1 AND rc.kind='create'`,
      [s.replyId],
    )
    assert.equal(sent.rows.length, 1)
    const body = JSON.stringify(sent.rows[0]?.body)
    assert.ok(body.includes('Ship the map first'), 'the recorded context is what is sent')
    for (const secret of [w.db.workerUrl, new URL(w.db.workerUrl).password, 'postgres://', 'postgresql://'])
      assert.ok(!body.includes(secret), 'no database credential reaches the runtime')
  })

  it('the worker can be no assembler, and reads nothing without a claim it began in the same transaction', async () => {
    const s = await ask(w, await project(w))
    await asWorker(w, async (c) => {
      await c.query('BEGIN')
      assert.equal((await read(c, `SET LOCAL ROLE ${ROLE}`, [])).code, '42501')
      await c.query('ROLLBACK')
      const k = await claimAs(c, s.replyId, false)
      // Claimed, not begun; then begun, but in another transaction of the worker's, still open; then the wrong token,
      // the wrong attempt, a variant word that is not one, or a lapsed lease.
      assert.equal((await read(c, PROJECT_READ, [k.replyId, k.attempt, k.token])).code, '55000')
      await begin(c, k, false)
      await asWorker(w, async (other) => {
        await other.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
        assert.equal((await read(other, PROJECT_READ, [k.replyId, k.attempt, k.token])).code, '55000')
        await other.query('ROLLBACK')
      })
      assert.equal((await read(c, PROJECT_READ, [k.replyId, k.attempt, k.token])).rows?.length, 1, 'its own begin')
      await c.query('ROLLBACK')
    })
    const s2 = await ask(w, await project(w))
    await asWorker(w, async (c) => {
      const k = await claimAs(c, s2.replyId, false)
      await begin(c, k, false)
      assert.equal((await read(c, PROJECT_READ, [k.replyId, k.attempt, randomUUID()])).code, '55000')
      await c.query('ROLLBACK')
      await begin(c, k, false)
      assert.equal((await read(c, PROJECT_READ, [k.replyId, k.attempt + 1, k.token])).code, '55000')
      await c.query('ROLLBACK')
      await begin(c, k, false)
      const odd = await read(c, 'SELECT * FROM sophia.conversation_assembly_read_decisions($1,$2,$3,$4)', [
        k.replyId,
        k.attempt,
        k.token,
        "constraints' OR true --",
      ])
      assert.deepEqual(odd, { code: '22023', message: 'unknown reader variant' })
      await c.query('ROLLBACK')
    })
    // A lease that lapses while the transaction that began its claim is still open: the next read is refused.
    const s3 = await ask(w, await project(w))
    await asWorker(w, async (c) => {
      const k = await claimAs(c, s3.replyId, false, 300)
      await begin(c, k, false)
      await new Promise((resolve) => setTimeout(resolve, 400))
      assert.equal((await read(c, PROJECT_READ, [k.replyId, k.attempt, k.token])).code, '55000')
      await c.query('ROLLBACK')
    })
  })

  it('the actor is the asker’s, whatever the caller sets: another member’s consent and role are never read', async () => {
    const projectId = await project(w)
    await w.owner.query(
      `INSERT INTO sophia.mission_note_policies(project_id,capture,revision,changed_by) VALUES($1,'automatic',1,$2)
        ON CONFLICT DO NOTHING`,
      [projectId, A],
    )
    await w.owner.query(
      `INSERT INTO sophia.mission_note_consents(project_id,actor_id,state,revision) VALUES($1,$2,'declined',1),($1,$3,'accepted',1)`,
      [projectId, E, B],
    )
    const s = await ask(w, projectId)
    await w.owner.query(`UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2`, [
      projectId,
      B,
    ])
    await asWorker(w, async (c) => {
      const k = await claimAs(c, s.replyId, false)
      await begin(c, k, false)
      await c.query("SELECT set_config('sophia.actor_id', $1, true)", [B])
      const args = [k.replyId, k.attempt, k.token]
      const policy = (await c.query('SELECT * FROM sophia.conversation_assembly_read_note_policy($1,$2,$3)', args))
        .rows[0]
      const role = (await c.query('SELECT role FROM sophia.conversation_assembly_read_project($1,$2,$3)', args)).rows[0]
      assert.deepEqual([policy?.consent, role?.role], ['declined', 'editor'], 'E’s, not B’s')
      const actor = (await c.query("SELECT current_setting('sophia.actor_id', true) AS v")).rows[0]?.v
      assert.equal(actor, E, 'the readers made the asker the actor again')
      await c.query('ROLLBACK')
    })
  })

  it('another project, a private conversation and a temporary table of the worker’s own never reach the context', async () => {
    const projectId = await project(w)
    await ledger(w, projectId)
    const other = await project(w)
    await withActor(w.api, E, 'write', (c) =>
      recordMissionEntry(c, other, randomUUID(), { kind: 'observation', epistemic: 'reported', text: 'CANARY-OTHER' }),
    )
    const s = await ask(w, projectId)
    const clean = await asWorker(w, async (c) => {
      const k = await claimAs(c, s.replyId, false)
      const b = await begin(c, k, false)
      const r = await renderFixed(c, k, b)
      await c.query('ROLLBACK')
      return { k, r }
    })
    // The same claim, begun again in a session that first made temporary tables named as the relations the entry points
    // and readers use, holding a canary: pg_temp is last in every reader's path, and the context is unchanged.
    const shadowed = await asWorker(w, async (c) => {
      for (const t of [
        'projects',
        'project_members',
        'project_revisions',
        'mission_entries',
        'decisions',
        'source_objects',
        'source_texts',
        'conversation_messages',
        'conversation_replies',
        'conversation_assembly_claims',
        'goals',
        'mission_note_policies',
        'mission_note_consents',
      ])
        await c.query(`CREATE TEMP TABLE ${t} (canary text DEFAULT 'CANARY-TEMP')`)
      const b = await begin(c, clean.k, false)
      const r = await renderFixed(c, clean.k, b)
      await c.query('ROLLBACK')
      return r
    })
    assert.deepEqual(shadowed, clean.r)
    for (const canary of ['CANARY-OTHER', 'CANARY-TEMP']) assert.ok(!clean.r.text.includes(canary), canary)
  })

  it('a forged context is refused at record; a removed asker or a withdrawn question ends the reply, never dispatched', async () => {
    const projectId = await project(w)
    const s = await ask(w, projectId)
    await asWorker(w, async (c) => {
      const k = await claimAs(c, s.replyId, false)
      const b = await begin(c, k, false)
      const r = await renderFixed(c, k, b)
      const forged = JSON.parse(recordPayload(r)) as { text: string }
      forged.text = `${forged.text}\nInjected.`
      const refused = await read(c, 'SELECT sophia.conversation_record_context($1,$2,$3,$4::jsonb)', [
        k.replyId,
        k.attempt,
        k.token,
        JSON.stringify(forged),
      ])
      assert.equal(refused.code, '22023')
      assert.equal(refused.message, 'context_forged')
      await c.query('ROLLBACK')
    })
    const removed = await ask(w, projectId)
    await w.owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
      projectId,
      E,
    ])
    assert.deepEqual(await assembleReply(w.db.workerUrl, removed.replyId, LIMITS, 'fixed'), {
      outcome: 'closed',
      reason: 'asker_removed',
    })
    await w.owner.query('UPDATE sophia.project_members SET active=true WHERE project_id=$1 AND actor_id=$2', [
      projectId,
      E,
    ])
    const withdrawn = await ask(w, await project(w))
    assert.equal((await assembleReply(w.db.workerUrl, withdrawn.replyId, LIMITS, 'fixed')).outcome, 'recorded')
    await withActor(w.api, E, 'write', (c) =>
      withdrawConversationMessage(c, withdrawn.conversationId, withdrawn.askId, randomUUID()),
    )
    assert.notEqual((await reply(w, withdrawn.replyId))?.state, 'pending')
    const created = await w.owner.query(
      `SELECT count(*)::int AS n FROM sophia.runtime_commands rc JOIN sophia.work_attempts a ON a.id=rc.attempt_id
        WHERE a.conversation_reply_id=ANY($1) AND rc.kind='create'`,
      [[removed.replyId, withdrawn.replyId]],
    )
    assert.equal(created.rows[0]?.n, 0)
  })

  it('no login route beside it: a login admitted to the assembler makes the mode refuse, never fall back', async () => {
    const login = `sophia_assembler_beside_${randomUUID().replaceAll('-', '').slice(0, 10)}`
    await w.owner.query(`CREATE ROLE ${login} LOGIN`)
    try {
      await w.owner.query(`GRANT ${ROLE} TO ${login} WITH INHERIT FALSE, SET TRUE`)
      assert.equal(await admitted(w), false)
      assert.ok((await holds(w, FIXED_CHECK)).includes(`a role can act as the assembler: ${login} (a login)`))
      const s = await ask(w, await project(w))
      assert.deepEqual(await reply(w, s.replyId), { state: 'blocked', reason: 'context_assembler_unbound' })
      await assert.rejects(enable(w), { code: '42501' })
    } finally {
      await w.owner.query(`DROP ROLE ${login}`)
    }
    assert.equal(await admitted(w), true)
  })

  it('disabled again: the worker loses the entry points, the readers return to the owner, and the Ask is refused', async () => {
    await w.owner.query('SELECT sophia.conversation_disable_fixed_assembly()')
    assert.equal(await admitted(w), false)
    assert.ok(
      (await holds(w, FIXED_CHECK)).includes('no cutover recorded (sophia.conversation_mark_fixed_assembly_cutover)'),
    )
    const s = await ask(w, await project(w))
    assert.deepEqual(await reply(w, s.replyId), { state: 'blocked', reason: 'context_assembler_unbound' })
    await asWorker(w, async (c) => {
      assert.equal((await read(c, 'SELECT sophia.conversation_assembly_claim($1, 60000)', [s.replyId])).code, '42501')
    })
    // Disable forgets the cutover: a login route may have come and gone since, so enabling again needs a new one.
    await assert.rejects(enable(w), { code: '55000', message: /no cutover recorded/ })
    await cutover(w)
    assert.deepEqual((await enable(w)).rows[0], { on: true })
  })
})

/** A connection's authenticated login and its current user, which SET ROLE changed. */
const who = async (c: pg.Client) =>
  (await c.query<{ s: string; c: string }>('SELECT session_user::text AS s, current_user::text AS c')).rows[0]

describe('#487 P1: a session that assumed the assembler before the cutover', () => {
  let w: World
  before(async () => {
    w = await open(true)
  })
  after(() => close(w))

  const login = () => w.db.assemblerRole ?? assert.fail('an assembler login')
  const readerOwners = async () =>
    (
      await w.owner.query<{ o: string }>(
        `SELECT DISTINCT p.proowner::regrole::text AS o FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='sophia' AND p.proname ~ '^conversation_assembly_(read_|count_|has_)'`,
      )
    ).rows.map((r) => r.o)

  it('kept open across SET ROLE, the revoke and the cutover, it holds enable before anything changes, until it closes', async () => {
    // The login route's real execution login assumes the assembler for its session and stays connected.
    const stale = new pg.Client({ connectionString: w.db.assemblerUrl ?? '' })
    await stale.connect()
    let connected = true
    try {
      await stale.query(`SET ROLE ${ROLE}`)
      const pid = (await stale.query<{ p: number }>('SELECT pg_backend_pid() AS p')).rows[0]?.p ?? 0
      await w.owner.query(`REVOKE ${ROLE} FROM ${login()}`)
      // No member is left, the role is NOLOGIN and pg_stat_activity names the login: none of it shows what this is.
      assert.deepEqual(await who(stale), { s: login(), c: ROLE })
      await assert.rejects(enable(w), { code: '55000', message: /no cutover recorded/ })
      await cutover(w, [pid])
      // The same login, connected after the cutover: no membership to assume the assembler with, and nothing held.
      const fresh = new pg.Client({ connectionString: w.db.assemblerUrl ?? '' })
      await fresh.connect()
      try {
        await assert.rejects(fresh.query(`SET ROLE ${ROLE}`), { code: '42501' })
        assert.deepEqual(await unsettled(w), [pid])
      } finally {
        await fresh.end()
      }
      const comment = async () =>
        (await w.owner.query<{ d: string | null }>(`SELECT shobj_description(to_regrole($1),'pg_authid') AS d`, [ROLE]))
          .rows[0]?.d
      const kept = await comment()
      const hold = `pid ${pid} (${login()}, began before the cutover)`
      await assert.rejects(
        enable(w),
        (e: unknown) => e instanceof Error && 'code' in e && e.code === '55006' && e.message.includes(hold),
      )
      // Refused before anything changed: the readers the owner's, no entry point for the worker or helper for the
      // assembler, its comment as it was; the mode not whole and its gate holding that session.
      assert.deepEqual(await readerOwners(), ['postgres'])
      const granted = await w.owner.query<{ begin: boolean; bind: boolean }>(
        `SELECT has_function_privilege('sophia_worker','sophia.conversation_assembly_begin(uuid,integer,uuid)','EXECUTE') AS begin,
                has_function_privilege($1,'sophia.conversation_assembly_bind(uuid,integer,uuid)','EXECUTE') AS bind`,
        [ROLE],
      )
      assert.deepEqual(granted.rows[0], { begin: false, bind: false })
      assert.equal(await comment(), kept)
      assert.equal(await admitted(w), false)
      assert.ok((await holds(w, FIXED_CHECK)).includes(`a session may still act as the assembler: ${hold}`))
      // It is still the assembler, owning nothing: no reader to give away.
      assert.deepEqual(await who(stale), { s: login(), c: ROLE })
      await assert.rejects(
        stale.query('GRANT EXECUTE ON FUNCTION sophia.conversation_assembly_read_project(uuid,integer,uuid) TO PUBLIC'),
        { code: '42501' },
      )
      // Closed by its own client (never terminated here), then the mode is enabled and whole.
      await stale.end()
      connected = false
      await until(async () => (await unsettled(w)).length === 0)
    } finally {
      if (connected) await stale.end()
    }
    assert.deepEqual((await enable(w)).rows[0], { on: true })
    assert.deepEqual(await readerOwners(), [ROLE])
    assert.deepEqual(await holds(w, FIXED_CHECK), [])
    const s = await ask(w, await project(w))
    assert.equal((await assembleReply(w.db.workerUrl, s.replyId, LIMITS, 'fixed')).outcome, 'recorded')
  })

  it('the transition is serialized: no GRANT or REVOKE of the assembler lands while the cutover or enable decides', async () => {
    await w.owner.query('SELECT sophia.conversation_disable_fixed_assembly()')
    const operator = new pg.Client({ connectionString: w.db.ownerUrl })
    const other = new pg.Client({ connectionString: w.db.ownerUrl })
    await Promise.all([operator.connect(), other.connect()])
    try {
      await other.query("SET lock_timeout='300ms'")
      const grant = () => other.query(`GRANT ${ROLE} TO ${login()} WITH INHERIT FALSE, SET TRUE`)
      // Run in REPEATABLE READ (a snapshot older than the lock), either act is refused.
      for (const act of [
        'sophia.conversation_mark_fixed_assembly_cutover()',
        'sophia.conversation_enable_fixed_assembly()',
      ]) {
        await operator.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
        await assert.rejects(operator.query(`SELECT ${act}`), { code: '25000' })
        await operator.query('ROLLBACK')
      }
      // The cutover's transaction, open: a concurrent grant of the assembler waits for it and here times out.
      await operator.query('BEGIN')
      await markCutover(operator)
      await assert.rejects(grant(), { code: '55P03' })
      await operator.query('COMMIT')
      await cutover(w)
      // Enable's transaction, open after its checks and transfer: the same.
      await operator.query('BEGIN')
      assert.deepEqual((await operator.query('SELECT sophia.conversation_enable_fixed_assembly() AS on')).rows[0], {
        on: true,
      })
      await assert.rejects(grant(), { code: '55P03' })
      await operator.query('COMMIT')
      assert.equal(await admitted(w), true)
      // A grant after enable is a login route beside it again: the mode is not whole and its gate holds the member.
      // (Its revoke leaves no trace PostgreSQL keeps: re-establishing the mode then takes disable and a new cutover.)
      await grant()
      assert.equal(await admitted(w), false)
      assert.ok((await holds(w, FIXED_CHECK)).includes(`a role can act as the assembler: ${login()} (a login)`))
      await other.query(`REVOKE ${ROLE} FROM ${login()}`)
      // While the mode is enabled, a new cutover is refused.
      await assert.rejects(markCutover(w.owner), { code: '55000', message: /disable it first/ })
    } finally {
      await Promise.all([operator.end(), other.end()])
    }
  })
})
