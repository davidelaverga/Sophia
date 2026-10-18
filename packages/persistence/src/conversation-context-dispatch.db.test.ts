// 0071: an ordinary Ask's create waits for its context instead of being denied for the lack of it. The real API and
// worker logins and functions; the context is recorded by the real assembler (assembleReply) through this fixture's
// synthetic assembler login, never by owner-run setup. Each refusal that is not about a missing context is unchanged.
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
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
  // A synthetic password of its own (hex, as test-support's logins): the CI server authenticates by SCRAM, so a login
  // without one never connects, and the case would fail on authentication, not on SET (job 117383125250).
  const password = randomBytes(12).toString('hex')
  before(async () => {
    w = await open(false)
    // Otherwise bare (LOGIN, no attribute, no other membership, CONNECT through PUBLIC), but the worker's
    // SET LOCAL ROLE needs SET on this edge, and the activation check holds 'assembler edge: ... no SET'.
    await w.owner.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}'`)
    await w.owner.query(`GRANT sophia_conversation_assembler TO ${login} WITH SET FALSE`)
  })
  after(async () => {
    try {
      await close(w)
    } finally {
      const admin = new pg.Client({ connectionString: process.env.SOPHIA_DISPOSABLE_DATABASE_URL })
      await admin.connect()
      try {
        await admin.query(`DROP ROLE IF EXISTS ${login}`)
      } finally {
        await admin.end()
      }
    }
  })

  it('cannot act as the assembler: its SET LOCAL ROLE is refused', async () => {
    const u = new URL(w.db.ownerUrl)
    u.username = login
    u.password = password
    const c = new pg.Client({ connectionString: u.toString() })
    try {
      // Authenticated as that login first: only then is the refusal SET's, not the connection's.
      await c.connect()
      assert.equal((await c.query<{ who: string }>('SELECT current_user AS who')).rows[0]?.who, login)
      await c.query('BEGIN')
      await assert.rejects(c.query('SET LOCAL ROLE sophia_conversation_assembler'), { code: '42501' })
      await c.query('ROLLBACK')
    } finally {
      await c.end().catch(() => undefined)
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

// A40 (#393 discussion 4302482626): a reply is bound only to a runtime that can execute its grant. Two DISTINCT runtime
// units, each with a real hello and ready through the API login; the grant pinned to service names one executor.
const DA = 'a'.repeat(64)
const DB = 'b'.repeat(64)
const conversationRole = (executor?: unknown) => ({
  id: 'sophia-conversation-v1',
  route: ROUTE,
  presetDigest: 'synthetic',
  ...(executor === undefined ? {} : { executor }),
})
const service = (digest: string) =>
  conversationRole({ execution: 'service', routeId: ROUTE, executorArtifactDigest: digest })

interface Runtime {
  unit: string
  call: (op: string, body: unknown) => Promise<pg.QueryResult>
}

/** A project, its runtimes in order (each one's hello after the last's, so the later is newer), and a grant naming E. */
async function projectWith(w: World, roles: unknown[][], pin: string | null) {
  const { projectId } = await seedProject(w.db.ownerUrl, { admin: A, editors: [E] })
  await w.owner.query("SELECT sophia.set_conversation_settings($1,'enabled','con01-a40-test')", [projectId])
  const runtimes: Runtime[] = []
  for (const [i, advertised] of roles.entries()) {
    const unit = `sophia-runtime-${String.fromCharCode(97 + i)}`
    const rt = await registerRuntime(w.db.ownerUrl, { projectId, admin: A, runtimeUnitId: unit })
    const hash = createHash('sha256').update(rt.token).digest()
    const bridge = randomUUID()
    const call = (op: string, body: unknown) =>
      w.api.query(`SELECT sophia.runtime_${op}($1,$2,$3,$4::jsonb) AS v`, [hash, unit, bridge, body])
    await call('hello', { protocolVersion: 1, roles: advertised })
    await call('record_ready', { state: 'ready', reason: null, unrecovered: [] })
    runtimes.push({ unit, call })
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  await w.owner.query('SELECT sophia.conversation_new_lineage($1,$2::jsonb)', [
    projectId,
    {
      unit: 'calls_tokens',
      routeId: ROUTE,
      credentialRef: 'synthetic-credential-ref',
      ownerResourceRef: 'synthetic-owner-resource-ref',
      approvalRef: `con01-a40-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      maxCallsPerReply: 2,
      totalCallCap: 10,
      replyTokenCap: 100_000,
      totalTokenCap: 500_000,
      subjects: [E],
    },
  ])
  if (pin) {
    const lineage = await w.owner.query<{ lineage_id: string }>(
      'SELECT lineage_id FROM sophia.conversation_grants WHERE project_id=$1 AND current',
      [projectId],
    )
    await w.owner.query('SELECT sophia.conversation_pin_execution($1,$2::jsonb)', [
      projectId,
      {
        lineageId: lineage.rows[0]?.lineage_id,
        execution: 'service',
        routeId: ROUTE,
        executorArtifactDigest: pin,
        approvalRef: `con01-a40-pin-${randomUUID()}`,
      },
    ])
  }
  return { projectId, runtimes }
}

const boundUnit = async (w: World, replyId: string) =>
  (
    await w.owner.query<{ unit: string }>(
      `SELECT b.runtime_unit_id AS unit FROM sophia.execution_bindings b JOIN sophia.work_attempts a ON a.id=b.attempt_id
        WHERE a.conversation_reply_id=$1`,
      [replyId],
    )
  ).rows[0]?.unit
const created = async (w: World, replyId: string) =>
  (
    await w.owner.query<{ unit: string; execution: unknown }>(
      `SELECT ri.runtime_unit_id AS unit, rc.body->'payload'->'conversation'->'execution' AS execution
         FROM sophia.runtime_commands rc JOIN sophia.runtime_instances ri ON ri.id=rc.runtime_id
        WHERE rc.kind='create' AND rc.attempt_id=(SELECT id FROM sophia.work_attempts WHERE conversation_reply_id=$1)`,
      [replyId],
    )
  ).rows
const provenance = async (w: World, replyId: string) =>
  (
    await w.owner.query<{ execution: string; route_id: string; executor_artifact_digest: string | null }>(
      'SELECT execution,route_id,executor_artifact_digest FROM sophia.conversation_dispatch_provenance WHERE reply_id=$1',
      [replyId],
    )
  ).rows
const nothingAdmitted = async (w: World, replyId: string) =>
  (
    await w.owner.query<{ attempts: number; outbox: number }>(
      `SELECT (SELECT count(*)::int FROM sophia.work_attempts WHERE conversation_reply_id=$1) AS attempts,
         (SELECT count(*)::int FROM sophia.outbox WHERE conversation_reply_id=$1) AS outbox`,
      [replyId],
    )
  ).rows[0]

describe('A40: a reply goes only to a runtime that can execute its grant (#393 discussion 4302482626)', () => {
  let w: World
  before(async () => {
    w = await open(true)
  })
  after(() => close(w))

  it("chooses the older runtime with the pinned executor over a newer one without it; the create carries the grant's tuple", async () => {
    const { projectId } = await projectWith(w, [[service(DA)], [service(DB)]], DA)
    const stored = await w.owner.query<{ unit: string; roles: unknown }>(
      'SELECT runtime_unit_id AS unit, roles FROM sophia.runtime_instances WHERE project_id=$1 ORDER BY seen_at',
      [projectId],
    )
    assert.deepEqual(
      stored.rows.map((r) => r.roles),
      [[service(DA)], [service(DB)]],
      'the executor each hello named is kept with its role',
    )
    const s = await ask(w, projectId)
    assert.deepEqual(await reply(w, s.replyId), { state: 'pending', reason: null })
    assert.equal(await boundUnit(w, s.replyId), 'sophia-runtime-a', 'not the newer runtime that cannot execute it')
    // The context still comes first: deferred until the assembler records it, then dispatched once, to A.
    assert.deepEqual(await dispatch(w, s), { result: 'deferred', reason: 'waiting for reply context' })
    assert.equal((await assembleReply(w.db.assemblerUrl ?? '', s.replyId, LIMITS)).outcome, 'recorded')
    await w.owner.query(
      "UPDATE sophia.outbox SET available_at=now() WHERE conversation_reply_id=$1 AND destination='native.create'",
      [s.replyId],
    )
    assert.equal((await dispatch(w, s))?.result, 'dispatched')
    const tuple = { execution: 'service', routeId: ROUTE, executorArtifactDigest: DA }
    assert.deepEqual(await created(w, s.replyId), [{ unit: 'sophia-runtime-a', execution: tuple }])
    assert.deepEqual(await provenance(w, s.replyId), [
      { execution: 'service', route_id: ROUTE, executor_artifact_digest: DA },
    ])
  })

  it('refuses the Ask at once when no runtime advertises the pinned executor: no attempt, no outbox', async () => {
    // Another digest, a role naming no executor (unknown), and the native executor: none can serve a service pin.
    const { projectId } = await projectWith(
      w,
      [[service(DB)], [conversationRole()], [conversationRole({ execution: 'native' })]],
      DA,
    )
    const s = await ask(w, projectId)
    assert.deepEqual(await reply(w, s.replyId), { state: 'blocked', reason: 'runtime_unavailable' })
    assert.deepEqual(await nothingAdmitted(w, s.replyId), { attempts: 0, outbox: 0 })
  })

  it("keeps a native grant's legacy behaviour: a role naming no executor, or the native one, serves it; a service one never does", async () => {
    const legacy = await projectWith(w, [[conversationRole()], [service(DA)]], null)
    const s1 = await ask(w, legacy.projectId)
    assert.equal(await boundUnit(w, s1.replyId), 'sophia-runtime-a')
    const native = await projectWith(w, [[conversationRole({ execution: 'native' })], [service(DA)]], null)
    const s2 = await ask(w, native.projectId)
    assert.equal(await boundUnit(w, s2.replyId), 'sophia-runtime-a')
    const onlyService = await projectWith(w, [[service(DA)]], null)
    const s3 = await ask(w, onlyService.projectId)
    assert.deepEqual(await reply(w, s3.replyId), { state: 'blocked', reason: 'runtime_unavailable' })
    assert.deepEqual(await nothingAdmitted(w, s3.replyId), { attempts: 0, outbox: 0 })
  })

  it("refuses at hello an executor that is not exactly one of A35's: another route, an extra key, a bad digest, another mode", async () => {
    const { runtimes } = await projectWith(w, [[service(DA)]], null)
    const rt = runtimes[0]
    assert.ok(rt)
    for (const executor of [
      { execution: 'service', routeId: 'another-route', executorArtifactDigest: DA },
      { execution: 'service', routeId: ROUTE, executorArtifactDigest: DA, extra: true },
      { execution: 'service', routeId: ROUTE, executorArtifactDigest: 'A'.repeat(64) },
      { execution: 'service', routeId: ROUTE },
      { execution: 'native', routeId: ROUTE },
      { execution: 'byo' },
      'service',
    ])
      await assert.rejects(
        rt.call('hello', { protocolVersion: 1, roles: [conversationRole(executor)] }),
        { code: '22023' },
        JSON.stringify(executor),
      )
  })

  it('never retargets a bound reply: a runtime whose executor drifts before dispatch makes the create wait, with no provenance', async () => {
    const { projectId, runtimes } = await projectWith(w, [[service(DA)]], DA)
    const s = await ask(w, projectId)
    assert.equal(await boundUnit(w, s.replyId), 'sophia-runtime-a')
    assert.equal((await assembleReply(w.db.assemblerUrl ?? '', s.replyId, LIMITS)).outcome, 'recorded')
    const rt = runtimes[0]
    assert.ok(rt)
    await rt.call('hello', { protocolVersion: 1, roles: [service(DB)] })
    await rt.call('record_ready', { state: 'ready', reason: null, unrecovered: [] })
    await w.owner.query(
      "UPDATE sophia.outbox SET available_at=now() WHERE conversation_reply_id=$1 AND destination='native.create'",
      [s.replyId],
    )
    assert.deepEqual(await dispatch(w, s), { result: 'deferred', reason: 'waiting for compatible reply role' })
    assert.deepEqual(await created(w, s.replyId), [], 'nothing sent to the drifted runtime')
    assert.deepEqual(await provenance(w, s.replyId), [], 'no provenance written for a create that did not leave')
    assert.equal(await boundUnit(w, s.replyId), 'sophia-runtime-a', 'still bound where it was')
  })
})
