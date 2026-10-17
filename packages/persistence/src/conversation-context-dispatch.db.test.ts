// 0071: an ordinary Ask's create waits for its context instead of being denied for the lack of it. The real API and
// worker logins and functions; the context is recorded by the real assembler (assembleReply) through this fixture's
// synthetic assembler login, never by owner-run setup. Each refusal that is not about a missing context is unchanged.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import { assembleReply, type AssemblyLimits } from './conversation-assembly.ts'
import { sendConversationMessage, startConversation, withActor, withdrawConversationMessage } from './index.ts'

const A = randomUUID()
const E = randomUUID()
const ROUTE = 'route-test'
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

/** A project with conversations on, a ready runtime offering the conversation role, and a grant naming E. */
async function project(w: World) {
  const { projectId } = await seedProject(w.db.ownerUrl, { admin: A, editors: [E] })
  await w.owner.query("SELECT sophia.set_conversation_settings($1,'enabled','con01-0071-test')", [projectId])
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
      approvalRef: `con01-0071-${randomUUID()}`,
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

/** E asks Sophia in a new conversation, through the API login's functions. */
async function ask(w: World, projectId: string) {
  const first = await withActor(w.api, E, 'write', (c) =>
    startConversation(c, projectId, randomUUID(), { title: 'Ask', text: 'Opening.', askSophia: false }, 'E'),
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

describe('0071, no admitted assembler login', () => {
  let w: World
  before(async () => {
    w = await open(false)
  })
  after(() => close(w))

  it('refuses the Ask at once (blocked, context_assembler_unbound): no attempt, no outbox, nothing dispatched', async () => {
    assert.equal(w.db.assemblerUrl, null)
    const s = await ask(w, await project(w))
    assert.deepEqual(await reply(w, s.replyId), { state: 'blocked', reason: 'context_assembler_unbound' })
    const rows = await w.owner.query(
      `SELECT (SELECT count(*)::int FROM sophia.work_attempts WHERE conversation_reply_id=$1) AS attempts,
         (SELECT count(*)::int FROM sophia.outbox WHERE conversation_reply_id=$1) AS outbox`,
      [s.replyId],
    )
    assert.deepEqual(rows.rows[0], { attempts: 0, outbox: 0 })
  })
})

describe('0071, an assembler login whose membership cannot SET the role (#393 r4300923362)', () => {
  let w: World
  const login = `sophia_assembler_noset_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  before(async () => {
    w = await open(false)
    // Otherwise bare (LOGIN, no attribute, no other membership, CONNECT through PUBLIC), but the worker's
    // SET LOCAL ROLE needs SET on this edge, and the activation check holds 'assembler edge: ... no SET'.
    await w.owner.query(`CREATE ROLE ${login} LOGIN`)
    await w.owner.query(`GRANT sophia_conversation_assembler TO ${login} WITH SET FALSE`)
  })
  after(async () => {
    await close(w)
    const admin = new pg.Client({ connectionString: process.env.SOPHIA_DISPOSABLE_DATABASE_URL })
    await admin.connect()
    try {
      await admin.query(`DROP ROLE IF EXISTS ${login}`)
    } finally {
      await admin.end()
    }
  })

  it('cannot act as the assembler: its SET LOCAL ROLE is refused', async () => {
    const u = new URL(w.db.ownerUrl)
    u.username = login
    u.password = ''
    const c = new pg.Client({ connectionString: u.toString() })
    await c.connect()
    try {
      await c.query('BEGIN')
      await assert.rejects(c.query('SET LOCAL ROLE sophia_conversation_assembler'), { code: '42501' })
      await c.query('ROLLBACK')
    } finally {
      await c.end()
    }
  })

  it('refuses the Ask at once (blocked, context_assembler_unbound): no attempt, no outbox, nothing dispatched', async () => {
    const s = await ask(w, await project(w))
    assert.deepEqual(await reply(w, s.replyId), { state: 'blocked', reason: 'context_assembler_unbound' })
    const rows = await w.owner.query(
      `SELECT (SELECT count(*)::int FROM sophia.work_attempts WHERE conversation_reply_id=$1) AS attempts,
         (SELECT count(*)::int FROM sophia.outbox WHERE conversation_reply_id=$1) AS outbox`,
      [s.replyId],
    )
    assert.deepEqual(rows.rows[0], { attempts: 0, outbox: 0 })
  })
})

describe('0071, an admitted (synthetic) assembler login', () => {
  let w: World
  before(async () => {
    w = await open(true)
  })
  after(() => close(w))

  it('defers a create whose context is not yet recorded, then dispatches it once the assembler recorded it', async () => {
    assert.ok(w.db.assemblerUrl)
    const s = await ask(w, await project(w))
    assert.deepEqual(await reply(w, s.replyId), { state: 'pending', reason: null })
    assert.deepEqual(await dispatch(w, s), { result: 'deferred', reason: 'waiting for reply context' })
    assert.deepEqual(await reply(w, s.replyId), { state: 'pending', reason: null }, 'never denied for the wait')
    const recorded = await assembleReply(w.db.assemblerUrl, s.replyId, LIMITS)
    assert.equal(recorded.outcome, 'recorded')
    await w.owner.query(
      "UPDATE sophia.outbox SET available_at=now() WHERE conversation_reply_id=$1 AND destination='native.create'",
      [s.replyId],
    )
    assert.equal((await dispatch(w, s))?.result, 'dispatched')
  })

  it('denies once the wait has run out, with the truthful reason context_unavailable', async () => {
    const s = await ask(w, await project(w))
    await w.owner.query(
      "UPDATE sophia.conversation_replies SET created_at=created_at-sophia.conversation_context_wait()-interval '1 second' WHERE id=$1",
      [s.replyId],
    )
    assert.equal((await dispatch(w, s))?.result, 'denied')
    assert.deepEqual(await reply(w, s.replyId), { state: 'failed', reason: 'context_unavailable' })
  })

  it('denies every other ineligibility at once, as before, even with no context yet: a disabled grant', async () => {
    const projectId = await project(w)
    const s = await ask(w, projectId)
    await w.owner.query('SELECT sophia.conversation_set_grant($1,$2)', [projectId, { state: 'disabled' }])
    assert.deepEqual(await dispatch(w, s), { result: 'denied', reason: 'reply grant unavailable' })
    assert.deepEqual(await reply(w, s.replyId), { state: 'failed', reason: 'not_dispatched' })
  })

  it('a question withdrawn before its context is recorded is never dispatched or assembled', async () => {
    const s = await ask(w, await project(w))
    await withActor(w.api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.askId, randomUUID()))
    const ended = await reply(w, s.replyId)
    assert.notEqual(ended?.state, 'pending')
    const outcome = await assembleReply(w.db.assemblerUrl ?? '', s.replyId, LIMITS)
    assert.equal(outcome.outcome, 'not_pending')
    const created = await w.owner.query(
      "SELECT count(*)::int AS n FROM sophia.runtime_commands rc JOIN sophia.work_attempts a ON a.id=rc.attempt_id WHERE a.conversation_reply_id=$1 AND rc.kind='create'",
      [s.replyId],
    )
    assert.equal(created.rows[0]?.n, 0)
  })
})
