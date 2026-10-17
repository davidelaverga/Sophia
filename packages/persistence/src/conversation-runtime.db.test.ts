// CON-01 Phase B: real PostgreSQL ownership and runtime crossings, with synthetic records only.
// No provider or native process executes. Hosted activation and Q13 admission remain separate qualifications.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { DomainError } from '@sophia/domain'
import type { MissionProposalRequest } from '@sophia/contracts'
import {
  createTestDatabase,
  registerRuntime,
  seedProject,
  withClusterMigrationLock,
  type TestDatabase,
} from '@sophia/test-support'
import { createConversationCandidateDatabase } from './conversation-candidate-fixture.ts'
import { renderBound, recordPayload, type Binding } from './conversation-assembly.ts'
import {
  decideMissionChange,
  admitNativeTask,
  eraseConversation,
  proposeMissionChange,
  startConversation,
  submitContribution,
  readNativeTask,
  sendConversationMessage,
  withdrawConversationMessage,
  withActor,
  withService,
  runtimeConversationClaim,
  runtimeConversationGo,
  runtimeConversationReserve,
  runtimeConversationSettle,
  runtimeConversationAcknowledged,
} from './index.ts'

let db: TestDatabase
let owner: pg.Client
let ownerPool: pg.Pool
let api: pg.Pool
let worker: pg.Pool
let roleLock: pg.Client
const A = randomUUID()
const E = randomUUID()

before(async () => {
  assert.ok(process.env.SOPHIA_DISPOSABLE_DATABASE_URL)
  roleLock = new pg.Client({ connectionString: process.env.SOPHIA_DISPOSABLE_DATABASE_URL })
  await roleLock.connect()
  await roleLock.query("SELECT pg_advisory_lock(hashtext('con01-assembler-role'))")
  db = await createTestDatabase()
  owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
  ownerPool = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
  api = new pg.Pool({ connectionString: db.apiUrl, max: 4 })
  worker = new pg.Pool({ connectionString: db.workerUrl, max: 4 })
})

after(async () => {
  await worker?.end()
  await api?.end()
  await ownerPool?.end()
  await owner?.end()
  await db?.drop()
  await roleLock?.query("SELECT pg_advisory_unlock(hashtext('con01-assembler-role'))")
  await roleLock?.end()
})

/** Owner-created state is deliberate setup until the runtime/admission portions of Step1 are complete. */
async function pendingScene() {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
  await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','con01-runtime-local-test')", [projectId])
  const first = await withActor(api, E, 'write', (c) =>
    startConversation(
      c,
      projectId,
      randomUUID(),
      { title: 'Synthetic reply', text: 'First input', askSophia: false },
      'E',
    ),
  )
  const asked = await withActor(api, E, 'write', (c) =>
    sendConversationMessage(
      c,
      first.conversationId,
      randomUUID(),
      { text: 'Read only question', askSophia: true },
      'E',
    ),
  )
  assert.ok(asked.replyId)
  await owner.query("UPDATE sophia.conversation_replies SET state='pending',reason=NULL,settled_at=NULL WHERE id=$1", [
    asked.replyId,
  ])
  return {
    projectId,
    conversationId: first.conversationId,
    firstId: first.messageId,
    askId: asked.messageId,
    replyId: asked.replyId,
  }
}

/** Same compiler/record validator as S3, but explicit migration-owner setup; never claims Q13 identity qualification. */
async function recordScene(scene: Awaited<ReturnType<typeof pendingScene>>, running = true) {
  const c = await ownerPool.connect()
  try {
    const claimed = await c.query<{ v: { attempt: number; token: string; verdict: string } }>(
      'SELECT sophia.conversation_assembly_claim($1,8000) AS v',
      [scene.replyId],
    )
    const claim = claimed.rows[0]?.v
    assert.equal(claim?.verdict, 'claimed')
    assert.ok(claim)
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    const begun = await c.query<{ v: Binding & { verdict: string } }>(
      'SELECT sophia.conversation_assembly_begin($1,$2,$3) AS v',
      [scene.replyId, claim.attempt, claim.token],
    )
    const binding = begun.rows[0]?.v
    assert.ok(binding)
    assert.equal(binding.verdict, 'begun')
    const rendered = await renderBound(c, binding)
    await c.query('SELECT sophia.conversation_record_context($1,$2,$3,$4::jsonb)', [
      scene.replyId,
      claim.attempt,
      claim.token,
      recordPayload(rendered),
    ])
    await c.query('COMMIT')
    if (running)
      await owner.query("UPDATE sophia.conversation_replies SET state='running' WHERE id=$1", [scene.replyId])
    return scene
  } finally {
    await c.query('ROLLBACK')
    c.release()
  }
}

const recordedScene = async () => recordScene(await pendingScene())

describe('CON reply ownership (L1 SQL, no runtime execution)', () => {
  it('has a reply owner independently of goals, with validated exclusive ownership checks', async () => {
    const columns = await owner.query<{ table_name: string; column_name: string; is_nullable: string }>(
      `SELECT table_name,column_name,is_nullable FROM information_schema.columns
       WHERE table_schema='sophia' AND table_name IN ('work_attempts','outbox')
       AND column_name IN ('goal_id','goal_revision','conversation_reply_id') ORDER BY table_name,column_name`,
    )
    assert.deepEqual(columns.rows, [
      { table_name: 'outbox', column_name: 'conversation_reply_id', is_nullable: 'YES' },
      { table_name: 'outbox', column_name: 'goal_id', is_nullable: 'YES' },
      { table_name: 'work_attempts', column_name: 'conversation_reply_id', is_nullable: 'YES' },
      { table_name: 'work_attempts', column_name: 'goal_id', is_nullable: 'YES' },
      { table_name: 'work_attempts', column_name: 'goal_revision', is_nullable: 'YES' },
    ])
    const constraints = await owner.query<{ conname: string; convalidated: boolean }>(
      `SELECT conname,convalidated FROM pg_constraint WHERE conname IN
       ('work_attempts_owner','work_attempts_goal_revision','outbox_owner','outbox_retire_reply_only') ORDER BY conname`,
    )
    assert.equal(constraints.rowCount, 4)
    assert.ok(constraints.rows.every((r) => r.convalidated))
  })

  it('0064 installs no assembler role; 0070 adds it bare, and the API and worker still have no assembly privilege', async () => {
    // 0064's own footprint: no role and no grant to one (its source, unchanged).
    const runtime = readFileSync(
      new URL('../../../db/migrations/0064_conversation_runtime.sql', import.meta.url),
      'utf8',
    )
    assert.doesNotMatch(runtime, /CREATE ROLE|TO sophia_conversation_assembler/)
    // 0070's: NOLOGIN, a member of no role, and here only this fixture's synthetic login as its member.
    const role = (
      await owner.query<{ login: boolean; memberOf: number; members: string[] }>(
        `SELECT r.rolcanlogin AS login,
           (SELECT count(*)::int FROM pg_auth_members m WHERE m.member=r.oid) AS "memberOf",
           coalesce((SELECT array_agg(x.rolname::text ORDER BY x.rolname) FROM pg_auth_members m
             JOIN pg_roles x ON x.oid=m.member WHERE m.roleid=r.oid),'{}'::text[]) AS members
         FROM pg_roles r WHERE r.rolname='sophia_conversation_assembler'`,
      )
    ).rows[0]
    assert.deepEqual(role, { login: false, memberOf: 0, members: [db.assemblerRole] })
    for (const login of ['sophia_api', 'sophia_worker'])
      for (const entry of [
        'sophia.conversation_assembly_claim(uuid,integer)',
        'sophia.conversation_record_context(uuid,integer,uuid,jsonb)',
        'sophia.conversation_assembly_project()',
      ])
        assert.equal(
          (
            await owner.query<{ allowed: boolean }>(`SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed`, [
              login,
              entry,
            ])
          ).rows[0]?.allowed,
          false,
          `${login} ${entry}`,
        )
  })

  it('enforces the runtime-entrypoint-only grants through the actual API and worker logins', async () => {
    const rt = await runtimeProject()
    for (const name of ['claim', 'go', 'reserve', 'settle', 'acknowledged']) {
      await assert.rejects(
        worker.query(`SELECT sophia.runtime_conversation_${name}($1,$2,$3,$4)`, [
          rt.hash,
          rt.runtimeUnitId,
          rt.bridge,
          {},
        ]),
        denied('42501'),
      )
    }
    for (const pool of [api, worker]) {
      for (const sql of [
        'SELECT sophia.conversation_retire(NULL,NULL)',
        'SELECT sophia.conversation_acknowledged(NULL,NULL)',
        'SELECT * FROM sophia.conversation_executions',
        'SELECT * FROM sophia.conversation_cancellations',
      ])
        await assert.rejects(pool.query(sql), denied('42501'))
    }
  })
})

describe('CON cancellation provenance (L1 SQL, synthetic owner state)', () => {
  it('records the first real withdrawn message, and later withdrawal cannot replace it', async () => {
    const s = await pendingScene()
    await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.firstId, randomUUID()))
    const originalCause = (
      await owner.query('SELECT * FROM sophia.conversation_cancellations WHERE reply_id=$1', [s.replyId])
    ).rows
    assert.equal(originalCause.length, 1)
    assert.equal(originalCause[0]?.cause_kind, 'member_withdrawal')
    assert.equal(originalCause[0]?.cause_message_id, s.firstId)
    assert.equal(originalCause[0]?.caller, 'conversation_withdrawn_from')
    await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.askId, randomUUID()))
    await owner.query(
      "SELECT sophia.conversation_cancel($1,$2,'source_withdrawn',clock_timestamp(),'member_withdrawal',$3,1,$4,NULL)",
      [s.projectId, s.replyId, s.conversationId, s.firstId],
    )
    assert.deepEqual(
      (await owner.query('SELECT * FROM sophia.conversation_cancellations WHERE reply_id=$1', [s.replyId])).rows,
      originalCause,
    )
    await assert.rejects(
      owner.query('UPDATE sophia.conversation_cancellations SET reason=reason WHERE reply_id=$1', [s.replyId]),
      (error: unknown) => error instanceof pg.DatabaseError && error.code === '55000',
    )
  })

  for (const reason of ['asker_removed', 'audience_changed']) {
    it(`publication records ${reason} as its observed privacy cause, with no answer or invented source`, async () => {
      const s = await recordedScene()
      if (reason === 'asker_removed') {
        await owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
          s.projectId,
          E,
        ])
      } else {
        await owner.query('UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=$1', [s.projectId])
      }
      const result = await owner.query('SELECT sophia.conversation_publish_answer($1,1,$2,$3) AS v', [
        s.replyId,
        randomUUID(),
        'Must not publish',
      ])
      assert.deepEqual(result.rows[0]?.v, { verdict: 'cancelled', reason })
      const cause = (
        await owner.query('SELECT * FROM sophia.conversation_cancellations WHERE reply_id=$1', [s.replyId])
      ).rows[0]
      assert.equal(cause?.caller, 'conversation_publish_answer')
      assert.equal(cause?.cause_kind, 'publication_privacy')
      assert.equal(cause?.cause_assembly_attempt, 1)
      assert.equal(cause?.cause_source_id, null)
      assert.equal(cause?.cause_message_id, null)
      assert.equal(cause?.observed_member_active, reason !== 'asker_removed')
      assert.equal(cause?.attempt_id, null, 'no runtime attempt was created by this owner fixture')
      assert.equal(
        (
          await owner.query('SELECT count(*)::int AS n FROM sophia.conversation_reply_answers WHERE reply_id=$1', [
            s.replyId,
          ])
        ).rows[0]?.n,
        0,
      )
    })
  }
})

async function runtimeProject(runtimeUnitId = 'sophia-runtime-test') {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
  await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','con01-runtime-local-test')", [projectId])
  const rt = await registerRuntime(db.ownerUrl, { projectId, admin: A, runtimeUnitId })
  const runtime = { ...rt, projectId, bridge: randomUUID(), hash: createHash('sha256').update(rt.token).digest() }
  await call(runtime, 'hello', {
    protocolVersion: 1,
    roles: [{ id: 'sophia-conversation-v1', route: 'route-test', presetDigest: 'synthetic' }],
  })
  await call(runtime, 'record_ready', { state: 'ready', reason: null, unrecovered: [] })
  await owner.query('SELECT sophia.conversation_new_lineage($1,$2::jsonb)', [
    projectId,
    {
      unit: 'calls_tokens',
      routeId: 'route-test',
      credentialRef: 'synthetic-credential-ref',
      ownerResourceRef: 'synthetic-owner-resource-ref',
      approvalRef: 'synthetic-source-test',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      maxCallsPerReply: 2,
      totalCallCap: 10,
      replyTokenCap: 1000,
      totalTokenCap: 5000,
      subjects: [E],
    },
  ])
  return runtime
}

type RuntimeSetup = Awaited<ReturnType<typeof runtimeProject>>
type Operation =
  | 'hello'
  | 'record_ready'
  | 'record_observations'
  | 'record_receipts'
  | 'conversation_claim'
  | 'conversation_go'
  | 'conversation_reserve'
  | 'conversation_settle'
  | 'conversation_acknowledged'

async function call<T>(rt: RuntimeSetup, operation: Operation, body: unknown): Promise<T> {
  const result = await api.query<{ v: T }>(`SELECT sophia.runtime_${operation}($1,$2,$3,$4::jsonb) AS v`, [
    rt.hash,
    rt.runtimeUnitId,
    rt.bridge,
    JSON.stringify(body),
  ])
  const row = result.rows[0]
  assert.ok(row)
  return row.v
}

async function nativeScene(supplied?: RuntimeSetup) {
  const rt = supplied ?? (await runtimeProject())
  const first = await withActor(api, E, 'write', (c) =>
    startConversation(
      c,
      rt.projectId,
      randomUUID(),
      { title: 'Synthetic native conversation', text: 'First synthetic input', askSophia: false },
      'E',
    ),
  )
  const asked = await withActor(api, E, 'write', (c) =>
    sendConversationMessage(
      c,
      first.conversationId,
      randomUUID(),
      { text: 'Synthetic read only question', askSophia: true },
      'E',
    ),
  )
  assert.ok(asked.replyId)
  const scene = {
    projectId: rt.projectId,
    conversationId: first.conversationId,
    firstId: first.messageId,
    askId: asked.messageId,
    replyId: asked.replyId,
  }
  await recordScene(scene, false)
  const result = await owner.query<{ attempt_id: string; binding_id: string; native_session_id: string }>(
    `SELECT a.id AS attempt_id,b.id AS binding_id,b.native_session_id FROM sophia.work_attempts a
     JOIN sophia.execution_bindings b ON b.project_id=a.project_id AND b.attempt_id=a.id
     WHERE a.project_id=$1 AND a.conversation_reply_id=$2`,
    [rt.projectId, asked.replyId],
  )
  const binding = result.rows[0]
  assert.ok(binding, 'the real admission creates its one reply-owned attempt')
  return { ...scene, rt, ...binding }
}

type NativeScene = Awaited<ReturnType<typeof nativeScene>>

/** Owner seeds the dispatch lease only; the actual dispatcher is executed with the non-owner worker login. */
async function dispatchLease(s: NativeScene, destination = 'native.create') {
  const lease = randomUUID()
  const row = (
    await owner.query<{ id: string }>(
      `UPDATE sophia.outbox SET state='dispatching',lease_owner='test-worker',
    lease_token=$3,lease_until=clock_timestamp()+interval '30 seconds',attempts=attempts+1
    WHERE project_id=$1 AND conversation_reply_id=$2 AND destination=$4 AND state='pending' RETURNING id`,
      [s.projectId, s.replyId, lease, destination],
    )
  ).rows[0]
  assert.ok(row, `pending ${destination}`)
  return { id: row.id, lease }
}

async function dispatch(s: NativeScene, destination = 'native.create') {
  const row = await dispatchLease(s, destination)
  return (
    await worker.query<{ v: { result: string; commandId?: string } }>(
      'SELECT sophia.dispatch_runtime_outbox($1,$2,$3) AS v',
      [s.projectId, row.id, row.lease],
    )
  ).rows[0]?.v
}

async function command(s: NativeScene, kind = 'create') {
  const row = (
    await owner.query<{ id: string; authority_epoch: string }>(
      'SELECT id,authority_epoch FROM sophia.runtime_commands WHERE project_id=$1 AND binding_id=$2 AND kind=$3',
      [s.projectId, s.binding_id, kind],
    )
  ).rows[0]
  assert.ok(row)
  return row
}

async function request(s: NativeScene) {
  const c = await command(s)
  return { attemptId: s.attempt_id, commandId: c.id, authorityEpoch: Number(c.authority_epoch), leaseId: s.rt.bridge }
}

async function receipt(s: NativeScene, kind: string, stage: string) {
  const c = await command(s, kind)
  return call<number>(s.rt, 'record_receipts', [
    {
      commandId: c.id,
      attemptId: s.attempt_id,
      nativeSessionId: s.native_session_id,
      stage,
      observedAt: new Date().toISOString(),
    },
  ])
}

const isProjectionRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Synthetic native intake uses the closed child projection; malformed overrides remain malformed. */
function projectedFixture(type: string, value: unknown): unknown {
  if (!isProjectionRecord(value)) return value
  const usage = { provider: null, model: null, inputTokens: null, outputTokens: null, ordinal: 1 }
  if (type === 'compaction/summary') return { compactionId: null, ...usage, ...value }
  if (type !== 'assistant/message') return value
  const text = typeof value.text === 'string' ? value.text : ''
  const length = Array.from(text).length
  return {
    text: '',
    oversize: false,
    invalidText: false,
    length,
    interrupted: false,
    ...usage,
    ...value,
    ...(length > 16000 ? { text: null, oversize: true, length } : {}),
  }
}

function observation(
  s: Pick<NativeScene, 'rt' | 'attempt_id' | 'native_session_id'>,
  seq: number,
  type: string,
  data: unknown,
) {
  return {
    runtimeUnitId: s.rt.runtimeUnitId,
    attemptId: s.attempt_id,
    nativeSessionId: s.native_session_id,
    nativeSeq: seq,
    type,
    durable: true,
    data: projectedFixture(type, data),
  }
}

async function reply(s: NativeScene) {
  return (
    await owner.query<{ state: string; reason: string | null; answer_id: string | null }>(
      'SELECT state,reason,answer_id FROM sophia.conversation_replies WHERE project_id=$1 AND id=$2',
      [s.projectId, s.replyId],
    )
  ).rows[0]
}

async function go(s: NativeScene) {
  assert.equal((await dispatch(s))?.result, 'dispatched')
  assert.deepEqual(await call(s.rt, 'conversation_claim', await request(s)), { result: 'first' })
  assert.deepEqual(await call(s.rt, 'conversation_go', await request(s)), { result: 'go' })
}

/** Direct closed-writer probes use synthetic owner fixtures; real intake cases below test the actual capture caller. */
async function captureCancellation(s: NativeScene, end: string | null, reason = 'audience_changed') {
  return owner.query(
    `SELECT sophia.conversation_cancel($1,$2,$3,clock_timestamp(),'capture_privacy',$4,NULL,NULL,NULL,1::smallint,$5::uuid)`,
    [s.projectId, s.replyId, reason, s.conversationId, end],
  )
}

async function seedCaptureObservation(s: NativeScene, type = 'turn/end', seq = 1) {
  const row = (
    await owner.query<{ id: string }>(
      `INSERT INTO sophia.native_observations(project_id,binding_id,upstream_key,type,native_seq,data,observed_at)
       VALUES($1,$2,$3,$4,$5,'{}',clock_timestamp()) RETURNING id`,
      [s.projectId, s.binding_id, randomUUID(), type, seq],
    )
  ).rows[0]
  assert.ok(row)
  return row.id
}

describe('CON capture privacy amendment (L1 SQL, no native/provider)', () => {
  for (const reason of ['asker_removed', 'audience_changed']) {
    for (const output of [
      { label: 'empty', data: { text: '' }, kind: 'completed' },
      { label: 'invalid', data: { text: null, invalidText: true, length: 5 }, kind: 'completed' },
      { label: 'oversized', data: { text: null, oversize: true, length: 16001 }, kind: 'completed' },
      { label: 'failed', data: { text: 'must be scrubbed' }, kind: 'error' },
    ]) {
      it(`capture privacy ${reason} precedes ${output.label} output with actual immutable end provenance`, async () => {
        const s = await nativeScene()
        await go(s)
        if (reason === 'asker_removed')
          await owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
            s.projectId,
            E,
          ])
        else
          await owner.query('UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=$1', [
            s.projectId,
          ])
        await call(s.rt, 'record_observations', [
          observation(s, 1, 'assistant/message', output.data),
          observation(s, 2, 'turn/end', { reason: { kind: output.kind } }),
        ])
        assert.deepEqual(await reply(s), { state: 'cancelled', reason, answer_id: null })
        const cause = (
          await owner.query('SELECT * FROM sophia.conversation_cancellations WHERE reply_id=$1', [s.replyId])
        ).rows[0]
        const end = (
          await owner.query('SELECT id FROM sophia.native_observations WHERE binding_id=$1 AND native_seq=2', [
            s.binding_id,
          ])
        ).rows[0]
        assert.ok(cause)
        assert.ok(end)
        assert.equal(cause.caller, 'capture_native_result')
        assert.equal(cause.cause_kind, 'capture_privacy')
        assert.equal(cause.cause_turn_end_id, end.id)
        assert.equal(cause.cause_turn_end_seq, '2')
        assert.equal(cause.cause_assembly_attempt, 1)
        assert.equal(cause.cause_message_id, null)
        assert.equal(cause.cause_source_id, null)
        assert.equal(cause.had_claim, true)
        assert.equal((await acknowledge(s)).predicates.terminalWriter?.key?.kind, 'cancellation')
        await owner.query('SELECT sophia.capture_native_result($1,$2,2,$3)', [s.projectId, s.binding_id, output.kind])
        assert.deepEqual(
          (await owner.query('SELECT * FROM sophia.conversation_cancellations WHERE reply_id=$1', [s.replyId])).rows[0],
          cause,
        )
        assert.equal(
          (
            await owner.query('SELECT count(*)::int AS n FROM sophia.conversation_reply_answers WHERE reply_id=$1', [
              s.replyId,
            ])
          ).rows[0]?.n,
          0,
        )
      })
    }
  }

  for (const invalid of [
    'missing',
    'absent',
    'foreign-project',
    'foreign-binding',
    'non-end',
    'pre-go',
    'wrong-verdict',
  ]) {
    it(`capture privacy refuses ${invalid} provenance without changing reply, epoch or effects`, async () => {
      const s = await nativeScene()
      await go(s)
      await owner.query('UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=$1', [s.projectId])
      let end: string | null = null
      if (invalid === 'absent') end = randomUUID()
      else if (invalid === 'foreign-project') {
        const other = await nativeScene()
        end = await seedCaptureObservation(other)
      } else if (invalid === 'foreign-binding') {
        const other = await nativeScene(s.rt)
        end = await seedCaptureObservation(other)
      } else if (invalid !== 'missing') {
        end = await seedCaptureObservation(s, invalid === 'non-end' ? 'debug' : 'turn/end')
        if (invalid === 'pre-go')
          await owner.query("UPDATE sophia.native_observations SET observed_at='2000-01-01' WHERE id=$1", [end])
      }
      const beforeCounts = await operational(s)
      await assert.rejects(
        captureCancellation(s, end, invalid === 'wrong-verdict' ? 'asker_removed' : 'audience_changed'),
        denied('22023'),
      )
      assert.deepEqual(await operational(s), beforeCounts)
      assert.deepEqual(await reply(s), { state: 'running', reason: null, answer_id: null })
      assert.equal(
        (await owner.query('SELECT authority_epoch FROM sophia.work_attempts WHERE id=$1', [s.attempt_id])).rows[0]
          ?.authority_epoch,
        '1',
      )
      assert.equal(
        (
          await owner.query('SELECT count(*)::int AS n FROM sophia.conversation_cancellations WHERE reply_id=$1', [
            s.replyId,
          ])
        ).rows[0]?.n,
        0,
      )
    })
  }

  it('capture privacy retains its first cause after a real human withdrawal and a late second end', async () => {
    const s = await nativeScene()
    await go(s)
    await owner.query('UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=$1', [s.projectId])
    await call(s.rt, 'record_observations', [observation(s, 1, 'turn/end', { reason: { kind: 'completed' } })])
    const first = (await owner.query('SELECT * FROM sophia.conversation_cancellations WHERE reply_id=$1', [s.replyId]))
      .rows[0]
    assert.equal(first?.cause_kind, 'capture_privacy')
    await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.firstId, randomUUID()))
    await call(s.rt, 'record_observations', [observation(s, 2, 'turn/end', { reason: { kind: 'error' } })])
    assert.deepEqual(
      (await owner.query('SELECT * FROM sophia.conversation_cancellations WHERE reply_id=$1', [s.replyId])).rows[0],
      first,
    )
    assert.equal(
      (
        await owner.query(
          "SELECT count(*)::int AS n FROM sophia.outbox WHERE conversation_reply_id=$1 AND destination='native.stop'",
          [s.replyId],
        )
      ).rows[0]?.n,
      1,
    )
  })
})

describe('CON admitted runtime path (L1 SQL, synthetic route; no provider)', () => {
  for (const answer of [
    { label: 'empty', data: { text: '' }, reason: 'answer_empty' },
    {
      label: 'invalid projected text',
      data: { text: null, invalidText: true, length: 5 },
      reason: 'answer_invalid_text',
    },
    {
      label: 'oversized projected text',
      data: { text: null, oversize: true, length: 16001 },
      reason: 'answer_too_long',
    },
    { label: 'oversized raw text', data: { text: 'X'.repeat(16001) }, reason: 'answer_too_long' },
  ]) {
    it(`refuses ${answer.label} without poisoning the batch or inventing an answer`, async () => {
      const s = await nativeScene()
      await go(s)
      assert.equal(
        await call(s.rt, 'record_observations', [
          observation(s, 1, 'assistant/message', answer.data),
          observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
        ]),
        2,
      )
      assert.deepEqual(await reply(s), { state: 'failed', reason: answer.reason, answer_id: null })
      assert.equal((await acknowledge(s)).predicates.terminalWriter?.key?.kind, 'capture')
    })
  }

  for (const data of [
    { text: 42 },
    { text: { synthetic: 'OBJECT ANSWER' } },
    { text: 'SYNTHETIC INTERRUPTED', interrupted: 'true' },
    { text: 'SYNTHETIC INVALID', invalidText: 'true' },
    { text: 'SYNTHETIC OVERSIZE', oversize: 'false' },
    { text: 'SYNTHETIC NULL FLAG', interrupted: null },
  ]) {
    it(`refuses malformed native answer shape ${JSON.stringify(data)} without publishing`, async () => {
      const s = await nativeScene()
      await go(s)
      await receipt(s, 'create', 'delivered')
      await assert.rejects(
        call(s.rt, 'record_observations', [
          observation(s, 1, 'assistant/message', data),
          observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
        ]),
        { code: '22023' },
      )
      assert.deepEqual(await reply(s), { state: 'running', reason: null, answer_id: null })
      assert.equal(
        (
          await owner.query('SELECT count(*)::int AS n FROM sophia.native_observations WHERE binding_id=$1', [
            s.binding_id,
          ])
        ).rows[0]?.n,
        0,
      )
    })
  }

  for (const claimBefore of [false, true]) {
    it(`pre-go turn ends cannot latch capture or poison later execution (claimed=${String(claimBefore)})`, async () => {
      const s = await nativeScene()
      await dispatch(s)
      if (claimBefore) assert.deepEqual(await call(s.rt, 'conversation_claim', await request(s)), { result: 'first' })
      await call(s.rt, 'record_observations', [
        observation(s, 1, 'assistant/message', { text: 'SYNTHETIC PRE-GO ANSWER' }),
        observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
      ])
      const c = await command(s)
      const capture = async () =>
        (
          await owner.query<{ receipt: { capture?: { turnEndSeq: number } } | null }>(
            'SELECT receipt FROM sophia.commands WHERE project_id=$1 AND id=(SELECT command_id FROM sophia.runtime_commands WHERE project_id=$1 AND id=$2)',
            [s.projectId, c.id],
          )
        ).rows[0]?.receipt?.capture
      assert.equal(await capture(), undefined)
      if (!claimBefore) assert.deepEqual(await call(s.rt, 'conversation_claim', await request(s)), { result: 'first' })
      assert.deepEqual(await call(s.rt, 'conversation_go', await request(s)), { result: 'go' })
      // Internal recovery must not turn an already stored pre-go end into the execution's result.
      await owner.query('SELECT sophia.capture_completed_turns($1,$2)', [s.projectId, s.binding_id])
      await owner.query("SELECT sophia.capture_native_result($1,$2,2,'completed')", [s.projectId, s.binding_id])
      assert.equal(await capture(), undefined)
      assert.equal((await reply(s))?.state, 'running')
      await receipt(s, 'create', 'delivered')
      await call(s.rt, 'record_observations', [
        observation(s, 3, 'assistant/message', { text: 'SYNTHETIC REAL ANSWER' }),
        observation(s, 4, 'turn/end', { reason: { kind: 'completed' } }),
      ])
      const result = await reply(s)
      assert.equal(result?.state, 'answered')
      assert.equal((await capture())?.turnEndSeq, 4)
      const stored = await owner.query('SELECT body FROM sophia.conversation_messages WHERE id=$1', [result?.answer_id])
      assert.equal(stored.rows[0]?.body, 'SYNTHETIC REAL ANSWER')
      assert.equal((await acknowledge(s)).predicates.terminalWriter?.key?.kind, 'capture')
    })
  }

  it('captures a valid result when go and observation intake share a transaction', async () => {
    const s = await nativeScene()
    await dispatch(s)
    await call(s.rt, 'conversation_claim', await request(s))
    const c = await api.connect()
    try {
      await c.query('BEGIN')
      await c.query('SELECT sophia.runtime_conversation_go($1,$2,$3,$4::jsonb)', [
        s.rt.hash,
        s.rt.runtimeUnitId,
        s.rt.bridge,
        JSON.stringify(await request(s)),
      ])
      await c.query('SELECT sophia.runtime_record_observations($1,$2,$3,$4::jsonb)', [
        s.rt.hash,
        s.rt.runtimeUnitId,
        s.rt.bridge,
        JSON.stringify([
          observation(s, 1, 'assistant/message', { text: 'SYNTHETIC SAME TRANSACTION' }),
          observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
        ]),
      ])
      await c.query('COMMIT')
    } catch (error) {
      await c.query('ROLLBACK')
      throw error
    } finally {
      c.release()
    }
    assert.equal((await reply(s))?.state, 'answered')
    const times = await owner.query<{ after_go: boolean }>(
      `SELECT bool_and(o.observed_at>=e.went_at) AS after_go FROM sophia.native_observations o
       JOIN sophia.execution_bindings b ON b.project_id=o.project_id AND b.id=o.binding_id
       JOIN sophia.conversation_executions e ON e.project_id=b.project_id AND e.attempt_id=b.attempt_id
       WHERE o.project_id=$1 AND o.binding_id=$2`,
      [s.projectId, s.binding_id],
    )
    assert.equal(times.rows[0]?.after_go, true)
  })

  it('publishes the full 16000-code-point answer, preserving non-BMP characters', async () => {
    const s = await nativeScene()
    await go(s)
    const text = '😀'.repeat(16000)
    await call(s.rt, 'record_observations', [
      observation(s, 1, 'assistant/message', { text, length: 16000, oversize: false, invalidText: false }),
      observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
    ])
    const r = await reply(s)
    assert.equal(r?.state, 'answered')
    const stored = (
      await owner.query<{ body: string }>('SELECT body FROM sophia.conversation_messages WHERE id=$1', [r?.answer_id])
    ).rows[0]?.body
    assert.ok(stored)
    assert.equal(Array.from(stored).length, 16000)
    assert.equal(createHash('sha256').update(stored).digest('hex'), createHash('sha256').update(text).digest('hex'))
  })

  it('stores no answer text after recorded audience eligibility changes, even without a turn end', async () => {
    const s = await nativeScene()
    await go(s)
    await owner.query('UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=$1', [s.projectId])
    const checked = await owner.query('SELECT sophia.conversation_reply_check($1,1) AS v', [s.replyId])
    assert.equal(checked.rows[0]?.v.verdict, 'privacy')
    await call(s.rt, 'record_observations', [
      observation(s, 1, 'assistant/message', {
        text: 'PRIVATE AFTER AUDIENCE CHANGE',
        provider: 'synthetic',
        model: 'synthetic',
        inputTokens: 3,
        outputTokens: 2,
      }),
    ])
    const stored = (
      await owner.query('SELECT data FROM sophia.native_observations WHERE binding_id=$1', [s.binding_id])
    ).rows[0]?.data
    assert.deepEqual(stored, {
      scrubbed: true,
      provider: 'synthetic',
      model: 'synthetic',
      inputTokens: 3,
      outputTokens: 2,
      textLength: 29,
      ordinal: 1,
    })
    assert.deepEqual(
      (
        await owner.query('SELECT input_tokens,output_tokens FROM sophia.usage_records WHERE attempt_id=$1', [
          s.attempt_id,
        ])
      ).rows,
      [{ input_tokens: '3', output_tokens: '2' }],
    )
    assert.equal((await reply(s))?.state, 'running', 'intake fencing does not invent a cancellation writer')
  })

  for (const kind of ['completed', 'blocked', 'error']) {
    it(`privacy cancellation takes precedence over a scrubbed or invalid projected ${kind} result`, async () => {
      const s = await nativeScene()
      await go(s)
      await owner.query('UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=$1', [s.projectId])
      await call(s.rt, 'record_observations', [
        observation(s, 1, 'assistant/message', { text: null, invalidText: true, length: 5 }),
        observation(s, 2, 'turn/end', { reason: { kind } }),
      ])
      assert.deepEqual(await reply(s), { state: 'cancelled', reason: 'audience_changed', answer_id: null })
      assert.equal((await acknowledge(s)).predicates.terminalWriter?.key?.kind, 'cancellation')
    })
  }

  it('fenced projections cannot retain nested content disguised as accounting metadata', async () => {
    const s = await nativeScene()
    await go(s)
    const hidden = { text: 'PRIVATE NESTED COPY' }
    const data = {
      text: 'PRIVATE',
      provider: hidden,
      model: hidden,
      inputTokens: hidden,
      outputTokens: hidden,
      cacheReadTokens: hidden,
      cacheWriteTokens: hidden,
      ordinal: hidden,
      textLength: hidden,
      privateExtra: hidden,
    }
    await assert.rejects(call(s.rt, 'record_observations', [observation(s, 1, 'debug', data)]), { code: '22023' })
    // A pre-existing corrupt/legacy row is deliberate owner setup, not normal intake. Withdrawal must still scrub it.
    const legacy = await seedCaptureObservation(s, 'debug', 1)
    await owner.query('UPDATE sophia.native_observations SET data=$2::jsonb WHERE id=$1', [
      legacy,
      JSON.stringify(data),
    ])
    await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.firstId, randomUUID()))
    await assert.rejects(call(s.rt, 'record_observations', [observation(s, 2, 'debug', data)]), { code: '22023' })
    const stored = (
      await owner.query('SELECT data FROM sophia.native_observations WHERE binding_id=$1 ORDER BY native_seq', [
        s.binding_id,
      ])
    ).rows
    assert.deepEqual(stored, [{ data: { scrubbed: true, textLength: 7 } }])
  })

  it('usage keeps numeric accounting but never nested private text in provider/model metadata', async () => {
    const s = await nativeScene()
    await go(s)
    const data = {
      text: 'PRIVATE',
      provider: { text: 'PRIVATE PROVIDER COPY' },
      model: { text: 'PRIVATE MODEL COPY' },
      inputTokens: 3,
      outputTokens: 2,
      ordinal: 1,
    }
    await assert.rejects(call(s.rt, 'record_observations', [observation(s, 1, 'assistant/message', data)]), {
      code: '22023',
    })
    const projected = { ...data, provider: null, model: null }
    await call(s.rt, 'record_observations', [observation(s, 1, 'assistant/message', projected)])
    await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.firstId, randomUUID()))
    await assert.rejects(call(s.rt, 'record_observations', [observation(s, 2, 'assistant/message', data)]), {
      code: '22023',
    })
    await call(s.rt, 'record_observations', [observation(s, 2, 'assistant/message', projected)])
    assert.deepEqual(
      (
        await owner.query(
          'SELECT provider,model,input_tokens,output_tokens FROM sophia.usage_records WHERE attempt_id=$1 ORDER BY provider_call_id',
          [s.attempt_id],
        )
      ).rows,
      [
        { provider: null, model: null, input_tokens: '3', output_tokens: '2' },
        { provider: null, model: null, input_tokens: '3', output_tokens: '2' },
      ],
    )
  })

  it('claims once and replays go, refusing stale epoch and another project before work can run', async () => {
    const s = await nativeScene()
    assert.equal((await dispatch(s))?.result, 'dispatched')
    const body = await request(s)
    assert.deepEqual(await call(s.rt, 'conversation_claim', { ...body, authorityEpoch: 2 }), {
      result: 'refused',
      code: 'stale_epoch',
    })
    assert.deepEqual(await call(s.rt, 'conversation_claim', body), { result: 'first' })
    assert.deepEqual(await call(s.rt, 'conversation_claim', body), { result: 'refused', code: 'already_claimed' })
    assert.deepEqual(await call(s.rt, 'conversation_go', body), { result: 'go' })
    assert.deepEqual(await call(s.rt, 'conversation_go', body), { result: 'go' })
    const other = await runtimeProject()
    await assert.rejects(call(other, 'conversation_go', { ...body, leaseId: other.bridge }), denied('42501'))
    assert.equal((await reply(s))?.state, 'running')
    assert.equal(
      (
        await owner.query('SELECT count(*)::int AS n FROM sophia.conversation_executions WHERE reply_id=$1', [
          s.replyId,
        ])
      ).rows[0]?.n,
      1,
    )
  })

  it('a lost claim answer is not a second spawn; another hello terminalizes it and rejects the old lease', async () => {
    const s = await nativeScene()
    await dispatch(s)
    const body = await request(s)
    await call(s.rt, 'conversation_claim', body) // deliberately discard the successful response
    assert.deepEqual(await call(s.rt, 'conversation_claim', body), { result: 'refused', code: 'already_claimed' })
    const old = s.rt.bridge
    s.rt.bridge = randomUUID()
    await call(s.rt, 'hello', { protocolVersion: 1 })
    assert.equal((await reply(s))?.state, 'outcome_unknown')
    await assert.rejects(call({ ...s.rt, bridge: old }, 'conversation_go', body), denied('40001'))
    assert.deepEqual(await call(s.rt, 'conversation_go', { ...body, leaseId: s.rt.bridge }), {
      result: 'refused',
      code: 'lease_mismatch',
    })
    await receipt(s, 'create', 'outcome_unknown')
    assert.equal(
      (
        await owner.query(
          "SELECT count(*)::int AS n FROM sophia.outbox WHERE conversation_reply_id=$1 AND destination='native.retire'",
          [s.replyId],
        )
      ).rows[0]?.n,
      1,
    )
  })

  it('publishes one correlated answer, then scrubs stored observations and the queued prompt', async () => {
    const s = await nativeScene()
    await go(s)
    await receipt(s, 'create', 'delivered')
    const batch = [
      observation(s, 1, 'assistant/message', { text: 'Synthetic useful answer' }),
      observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
    ]
    assert.equal(await call(s.rt, 'record_observations', batch), 2)
    assert.equal(await call(s.rt, 'record_observations', batch), 0)
    const r = await reply(s)
    assert.equal(r?.state, 'answered')
    const answer = (
      await owner.query('SELECT body,reply_id FROM sophia.conversation_messages WHERE id=$1', [r?.answer_id])
    ).rows[0]
    assert.deepEqual(answer, { body: 'Synthetic useful answer', reply_id: s.replyId })
    const stored = (
      await owner.query('SELECT data FROM sophia.native_observations WHERE binding_id=$1', [s.binding_id])
    ).rows
    assert.ok(stored.every((row) => row.data.scrubbed === true && row.data.text === undefined))
    const rc = await command(s)
    const ack = await call<{ predicates: Record<string, { met: boolean }> }>(s.rt, 'conversation_acknowledged', {
      ...(await request(s)),
      keys: {
        observations: batch.map((v) => `${s.rt.runtimeUnitId}:${s.native_session_id}:${v.nativeSeq}`),
        usage: [],
        ordinals: [],
        hasTurnEnd: true,
      },
    })
    assert.ok(
      Object.values(ack.predicates).every((v) => v.met),
      JSON.stringify(ack),
    )
    assert.ok(rc.id)
  })

  it('withdrawal scrubs existing and late text, with one stop even when the runtime is not_ready', async () => {
    const s = await nativeScene()
    await go(s)
    await receipt(s, 'create', 'delivered')
    await call(s.rt, 'record_observations', [
      observation(s, 1, 'assistant/message', { text: 'PRIVATE SYNTHETIC CANARY' }),
    ])
    await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.firstId, randomUUID()))
    await call(s.rt, 'record_ready', { state: 'not_ready', reason: 'synthetic recovery', unrecovered: [] })
    assert.equal((await dispatch(s, 'native.stop'))?.result, 'dispatched')
    await call(s.rt, 'record_observations', [
      observation(s, 2, 'assistant/message', { text: 'LATE SYNTHETIC CANARY' }),
      observation(s, 3, 'turn/end', { reason: { kind: 'completed' } }),
    ])
    assert.equal((await reply(s))?.state, 'cancelled')
    const rows = (await owner.query('SELECT data FROM sophia.native_observations WHERE binding_id=$1', [s.binding_id]))
      .rows
    assert.ok(rows.every((row) => row.data.scrubbed === true && row.data.text === undefined))
    await receipt(s, 'create', 'failed')
    assert.equal(
      (
        await owner.query(
          "SELECT count(*)::int AS n FROM sophia.outbox WHERE conversation_reply_id=$1 AND destination='native.retire'",
          [s.replyId],
        )
      ).rows[0]?.n,
      0,
    )
    await receipt(s, 'stop', 'outcome_unknown')
    await receipt(s, 'stop', 'checked')
    assert.equal((await dispatch(s, 'native.retire'))?.result, 'dispatched')
    await receipt(s, 'retire', 'checked')
    assert.equal(
      (await owner.query('SELECT state FROM sophia.execution_bindings WHERE id=$1', [s.binding_id])).rows[0]?.state,
      'retired',
    )
  })
})

const denied = (expected: string) => (error: unknown) => error instanceof pg.DatabaseError && error.code === expected

const dispatchTables = [
  'projects',
  'outbox',
  'commands',
  'conversation_replies',
  'work_attempts',
  'execution_bindings',
  'runtime_commands',
  'conversation_executions',
  'conversation_cancellations',
  'conversation_reservations',
  'conversation_reply_allowances',
  'conversation_grants',
  'native_observations',
  'usage_records',
  'project_events',
  'jobs',
] as const
async function projectDigest(projectId: string, tables: readonly string[] = dispatchTables) {
  const result: Record<string, string> = {}
  for (const table of tables) {
    const rows = await owner.query<{ contents: unknown }>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS contents
      FROM sophia.${table} t WHERE ${table === 'projects' ? 'id' : 'project_id'}=$1`,
      [projectId],
    )
    result[table] = createHash('sha256').update(JSON.stringify(rows.rows[0]?.contents)).digest('hex')
  }
  return result
}

async function adverseJobs(s: NativeScene, commandId: string) {
  await owner.query(
    `INSERT INTO sophia.jobs(project_id,kind,command_id,state,reason) VALUES
    ($1,'con-adverse',$2,'pending','original-command-reason'),($1,'con-adverse',NULL,'pending','original-null-reason')`,
    [s.projectId, commandId],
  )
}

async function createOutbox(s: NativeScene) {
  const row = (
    await owner.query<{ id: string; command_id: string }>(
      `SELECT id,command_id FROM sophia.outbox
    WHERE project_id=$1 AND conversation_reply_id=$2 AND destination='native.create'`,
      [s.projectId, s.replyId],
    )
  ).rows[0]
  assert.ok(row)
  return row
}

const callBound = {
  routeId: 'route-test',
  credentialRef: 'synthetic-credential-ref',
  ownerResourceRef: 'synthetic-owner-resource-ref',
  unit: 'calls_tokens',
  tokens: 100,
  priceMicros: 0,
}
const usageBound = { calls: 1, tokens: 12, priceMicros: 0 }

async function goalScene(rt: RuntimeSetup) {
  const input = await withActor(api, E, 'write', (c) =>
    submitContribution(c, rt.projectId, randomUUID(), {
      source: null,
      text: 'Synthetic existing goal input',
      threadId: null,
      artifactVersionId: null,
      intent: 'discuss',
    }),
  )
  const task = await withActor(api, E, 'write', (c) =>
    admitNativeTask(c, rt.projectId, randomUUID(), {
      kind: 'draft_brief',
      instruction: 'Synthetic existing brief',
      contributionIds: [input.contributionId],
      expectedMissionRevision: 1,
    }),
  )
  const lease = randomUUID()
  const outbox = (
    await owner.query<{ id: string }>(
      `UPDATE sophia.outbox SET state='dispatching',lease_owner='mixed-goal-test',lease_token=$3,
     lease_until=clock_timestamp()+interval '30 seconds',attempts=attempts+1
     WHERE project_id=$1 AND command_id=$2 AND destination='native.create' RETURNING id`,
      [rt.projectId, task.commandId, lease],
    )
  ).rows[0]
  assert.ok(outbox)
  const sent = (
    await worker.query<{ v: { result: string } }>('SELECT sophia.dispatch_runtime_outbox($1,$2,$3) AS v', [
      rt.projectId,
      outbox.id,
      lease,
    ])
  ).rows[0]?.v
  assert.equal(sent?.result, 'enqueued')
  const native = (
    await owner.query<{ id: string; binding_id: string; native_session_id: string }>(
      `SELECT rc.id,rc.binding_id,b.native_session_id FROM sophia.runtime_commands rc
     JOIN sophia.execution_bindings b ON b.project_id=rc.project_id AND b.id=rc.binding_id
     WHERE rc.project_id=$1 AND rc.command_id=$2 AND rc.kind='create'`,
      [rt.projectId, task.commandId],
    )
  ).rows[0]
  assert.ok(native)
  await call(rt, 'record_receipts', [
    {
      commandId: native.id,
      attemptId: task.attemptId,
      nativeSessionId: native.native_session_id,
      stage: 'delivered',
      observedAt: new Date().toISOString(),
    },
  ])
  return { rt, ...native, attempt_id: task.attemptId, taskId: task.taskId }
}

async function closedMixedReply(state: string) {
  const s = await nativeScene()
  await go(s)
  await receipt(s, 'create', 'delivered')
  if (state === 'answered' || state === 'failed') {
    await call(s.rt, 'record_observations', [
      observation(s, 1, 'assistant/message', { text: state === 'answered' ? 'First synthetic answer' : '' }),
      observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
    ])
  } else if (state === 'lease_lost') {
    s.rt.bridge = randomUUID()
    await call(s.rt, 'hello', { protocolVersion: 1 })
    await call(s.rt, 'record_ready', { state: 'ready', reason: null, unrecovered: [] })
  } else if (state === 'erased') {
    await withActor(api, A, 'write', (c) => eraseConversation(c, s.conversationId, randomUUID()))
  } else {
    await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.firstId, randomUUID()))
    if (state !== 'withdrawn') {
      await dispatch(s, 'native.stop')
      await receipt(s, 'stop', state === 'stop_unknown' ? 'outcome_unknown' : 'checked')
    }
    if (state === 'retire_unknown' || state === 'retired') {
      await dispatch(s, 'native.retire')
      await receipt(s, 'retire', state === 'retired' ? 'checked' : 'outcome_unknown')
    }
  }
  return s
}

describe('CON mixed goal/reply intake preservation (real SQL, synthetic native data)', () => {
  for (const state of [
    'answered',
    'failed',
    'lease_lost',
    'erased',
    'withdrawn',
    'stop_unknown',
    'stop_checked',
    'retire_unknown',
    'retired',
  ]) {
    it(`a ${state} reply does not poison an actual goal result, usage, or replay in the same batch`, async () => {
      const s = await closedMixedReply(state)
      const goal = await goalScene(s.rt)
      const beforeReply = await reply(s)
      const beforeAllowance = await counters(s)
      const priorUsage = (
        await owner.query(
          'SELECT attempt_id,provider,input_tokens,output_tokens FROM sophia.usage_records WHERE project_id=$1 ORDER BY provider',
          [s.projectId],
        )
      ).rows
      const markdown = '## Intended outcome\nSynthetic preserved goal result\n## Cited inputs\n- synthetic'
      const batch = [
        observation(s, 3, 'assistant/message', {
          text: 'PRIVATE LATE REPLY',
          provider: 'synthetic-reply',
          model: 'synthetic',
          inputTokens: 7,
          outputTokens: 2,
          ordinal: 1,
        }),
        observation(goal, 1, 'assistant/message', {
          text: markdown,
          provider: 'synthetic-goal',
          model: 'synthetic',
          inputTokens: 11,
          outputTokens: 3,
          interrupted: false,
        }),
        observation(s, 4, 'turn/end', { reason: { kind: 'completed' } }),
        observation(goal, 2, 'turn/end', { reason: { kind: 'completed' } }),
      ]
      assert.equal(await call(s.rt, 'record_observations', batch), 4)
      assert.equal(await call(s.rt, 'record_observations', batch), 0)
      const detail = await withActor(api, E, 'read', (c) => readNativeTask(c, s.projectId, goal.taskId))
      assert.equal(detail.task.phase, 'result_ready')
      assert.equal(detail.result?.markdown, markdown)
      assert.equal(detail.result?.sha256, createHash('sha256').update(markdown).digest('hex'))
      assert.deepEqual(await reply(s), beforeReply)
      assert.deepEqual(await counters(s), beforeAllowance)
      const usage = (
        await owner.query(
          'SELECT attempt_id,provider,input_tokens,output_tokens FROM sophia.usage_records WHERE project_id=$1 ORDER BY provider',
          [s.projectId],
        )
      ).rows
      assert.deepEqual(usage, [
        { attempt_id: goal.attempt_id, provider: 'synthetic-goal', input_tokens: '11', output_tokens: '3' },
        { attempt_id: s.attempt_id, provider: 'synthetic-reply', input_tokens: '7', output_tokens: '2' },
        ...priorUsage,
      ])
      assert.equal(
        (
          await owner.query('SELECT data FROM sophia.native_observations WHERE binding_id=$1 AND native_seq=3', [
            s.binding_id,
          ])
        ).rows[0]?.data.text,
        undefined,
      )
    })
  }
})

async function acceptDecision(projectId: string, proposal: MissionProposalRequest) {
  const proposed = await withActor(api, A, 'write', (c) => proposeMissionChange(c, projectId, randomUUID(), proposal))
  assert.ok(proposed.decisionId)
  const id = proposed.decisionId
  await withActor(api, A, 'write', (c) =>
    decideMissionChange(c, projectId, id, randomUUID(), {
      decision: 'accept',
      expectedRevision: proposed.decisionRevision ?? 1,
    }),
  )
  return id
}

async function contextBody(s: NativeScene) {
  const row = (
    await owner.query<{ body: string | null }>(
      "SELECT body FROM sophia.conversation_reply_contexts WHERE project_id=$1 AND reply_id=$2 AND state='recorded'",
      [s.projectId, s.replyId],
    )
  ).rows[0]
  assert.ok(row?.body)
  return row.body
}

describe('CON current decision context (L1 SQL only)', () => {
  it('records the current project mission; later decisions mark the real captured answer changed, and the next Ask reads them', async () => {
    const rt = await runtimeProject()
    await acceptDecision(rt.projectId, {
      kind: 'mission',
      statement: 'Synthetic map first',
      purpose: 'Find synthetic places',
    })
    const other = await runtimeProject()
    await acceptDecision(other.projectId, {
      kind: 'mission',
      statement: 'OTHER PROJECT PRIVATE MISSION',
      purpose: 'Never share',
    })
    const s = await nativeScene(rt)
    const recorded = await contextBody(s)
    assert.ok(recorded.includes('Synthetic map first'))
    assert.ok(!recorded.includes('OTHER PROJECT PRIVATE MISSION'))
    await go(s)
    await receipt(s, 'create', 'delivered')
    await acceptDecision(rt.projectId, {
      kind: 'mission',
      statement: 'Synthetic list first',
      purpose: 'Find synthetic lists',
    })
    const governedWork = await projectDigest(rt.projectId, ['goals', 'jobs'])
    assert.equal(await contextBody(s), recorded, 'a running reply keeps its actual bounded snapshot')
    await call(s.rt, 'record_observations', [
      observation(s, 1, 'assistant/message', { text: 'Synthetic answer before the mission changed' }),
      observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
    ])
    assert.equal((await reply(s))?.state, 'answered')
    assert.equal(
      (
        await owner.query('SELECT context_changed FROM sophia.conversation_reply_answers WHERE reply_id=$1', [
          s.replyId,
        ])
      ).rows[0]?.context_changed,
      true,
    )
    const next = await nativeScene(rt)
    const current = await contextBody(next)
    assert.ok(current.includes('Synthetic list first'))
    assert.ok(!current.includes('Synthetic map first'))
    assert.deepEqual(await projectDigest(rt.projectId, ['goals', 'jobs']), governedWork)
  })

  it('a real recorded source withdrawal fences a claimed reply once and preserves the first source cause through late capture', async () => {
    const rt = await runtimeProject()
    const decision = await acceptDecision(rt.projectId, {
      kind: 'constraint',
      statement: 'Synthetic governed constraint',
    })
    const s = await nativeScene(rt)
    await go(s)
    await receipt(s, 'create', 'delivered')
    await call(s.rt, 'conversation_reserve', { ...(await request(s)), ordinal: 1, call: callBound })
    const source = (
      await owner.query<{ source_id: string }>(
        "SELECT source_id FROM sophia.conversation_reply_sources WHERE reply_id=$1 AND ref_id=$2 AND kind='constraint'",
        [s.replyId, decision],
      )
    ).rows[0]
    assert.ok(source)
    // These two closed writers are exercised as the migration owner, not represented as qualified live hooks.
    await owner.query('SELECT sophia.mission_erase_source($1,$2)', [s.projectId, source.source_id])
    const first = (
      await owner.query('SELECT sophia.conversation_source_out($1,$2) AS v', [s.projectId, source.source_id])
    ).rows[0]?.v
    assert.equal(first?.cancelled, 1)
    const cause = (await owner.query('SELECT * FROM sophia.conversation_cancellations WHERE reply_id=$1', [s.replyId]))
      .rows[0]
    assert.equal(cause?.cause_kind, 'source_out')
    assert.equal(cause?.caller, 'conversation_source_out')
    assert.equal(cause?.cause_source_id, source.source_id)
    await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.firstId, randomUUID()))
    await call(s.rt, 'record_observations', [
      observation(s, 1, 'assistant/message', { text: 'WITHDRAWN SOURCE MUST NOT RETURN' }),
      observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
    ])
    assert.deepEqual(
      (await owner.query('SELECT * FROM sophia.conversation_cancellations WHERE reply_id=$1', [s.replyId])).rows[0],
      cause,
    )
    assert.deepEqual(await reply(s), { state: 'cancelled', reason: 'source_withdrawn', answer_id: null })
    const cleanup = (
      await owner.query(
        'SELECT destination FROM sophia.outbox WHERE conversation_reply_id=$1 AND cleanup ORDER BY destination',
        [s.replyId],
      )
    ).rows
    assert.deepEqual(cleanup, [{ destination: 'native.stop' }])
    assert.equal((await counters(s))?.reserved_calls, '1', 'cancellation cannot invent native settlement')
    await dispatch(s, 'native.stop')
    await receipt(s, 'stop', 'checked')
    assert.equal((await counters(s))?.uncertain_calls, '1')
    assert.equal((await acknowledge(s)).predicates.terminalWriter?.key?.kind, 'cancellation')
    assert.equal((await operational(rt)).jobs, 0)
  })
})

describe('CON undispatched proof refuses contradictions (real API/worker SQL)', () => {
  for (const denial of ['grant-disabled', 'grant-expired', 'asker-removed', 'audience-changed']) {
    it(`A3 ${denial} without native evidence settles locally without changing jobs or accounting`, async () => {
      const s = await nativeScene()
      if (denial === 'grant-disabled')
        await owner.query('SELECT sophia.conversation_set_grant($1,$2)', [s.projectId, { state: 'disabled' }])
      if (denial === 'grant-expired')
        await owner.query(
          "UPDATE sophia.conversation_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE project_id=$1 AND current",
          [s.projectId],
        )
      if (denial === 'asker-removed')
        await owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
          s.projectId,
          E,
        ])
      if (denial === 'audience-changed')
        await owner.query('UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=$1', [s.projectId])
      await adverseJobs(s, (await createOutbox(s)).command_id)
      const tables = dispatchTables.filter(
        (table) =>
          !['outbox', 'commands', 'conversation_replies', 'work_attempts', 'execution_bindings'].includes(table),
      )
      const untouched = await projectDigest(s.projectId, tables)
      assert.equal((await dispatch(s))?.result, 'denied')
      assert.deepEqual(await reply(s), { state: 'failed', reason: 'not_dispatched', answer_id: null })
      assert.deepEqual(await projectDigest(s.projectId, tables), untouched)
      assert.deepEqual(
        (await owner.query('SELECT state,authority_epoch FROM sophia.work_attempts WHERE id=$1', [s.attempt_id]))
          .rows[0],
        { state: 'stopped', authority_epoch: '1' },
      )
      assert.equal(
        (await owner.query('SELECT state FROM sophia.execution_bindings WHERE id=$1', [s.binding_id])).rows[0]?.state,
        'retired',
      )
      assert.deepEqual(
        (
          await owner.query(
            'SELECT destination,state FROM sophia.outbox WHERE conversation_reply_id=$1 ORDER BY destination',
            [s.replyId],
          )
        ).rows,
        [
          { destination: 'native.create', state: 'denied' },
          { destination: 'native.retire', state: 'settled' },
        ],
      )
      await assert.rejects(
        call(s.rt, 'conversation_acknowledged', {
          attemptId: s.attempt_id,
          commandId: randomUUID(),
          authorityEpoch: 1,
          leaseId: s.rt.bridge,
          keys: { observations: [], usage: [], ordinals: [], hasTurnEnd: false },
        }),
        denied('42501'),
      )
    })
  }

  for (const evidence of ['runtime-command', 'execution', 'reserved', 'uncertain', 'observation', 'usage']) {
    it(`A3 ${evidence} contradiction refuses twice with every row unchanged after the dispatch lease`, async () => {
      const s = await nativeScene()
      if (evidence === 'runtime-command') {
        await dispatch(s)
        await owner.query(
          "UPDATE sophia.outbox SET state='pending' WHERE conversation_reply_id=$1 AND destination='native.create'",
          [s.replyId],
        )
      } else if (evidence === 'execution') {
        const other = await nativeScene(s.rt)
        await dispatch(other)
        await owner.query(
          `INSERT INTO sophia.conversation_executions(project_id,reply_id,attempt_id,command_id,lease_id,authority_epoch,outcome)
          VALUES($1,$2,$3,$4,$5,1,'claimed')`,
          [s.projectId, s.replyId, s.attempt_id, (await command(other)).id, s.rt.bridge],
        )
      } else if (evidence === 'reserved' || evidence === 'uncertain') {
        await owner.query("UPDATE sophia.conversation_replies SET state='running' WHERE id=$1", [s.replyId])
        await owner.query('SELECT sophia.conversation_reserve($1,$2,1,$3)', [s.projectId, s.replyId, callBound])
        if (evidence === 'uncertain')
          await owner.query('SELECT sophia.conversation_mark_uncertain($1,$2)', [s.projectId, s.replyId])
        await owner.query("UPDATE sophia.conversation_replies SET state='pending' WHERE id=$1", [s.replyId])
      } else if (evidence === 'observation') {
        await owner.query(
          `INSERT INTO sophia.native_observations(project_id,binding_id,upstream_key,type,native_seq,data)
          VALUES($1,$2,'contradiction','debug',1,'{}')`,
          [s.projectId, s.binding_id],
        )
      } else {
        await owner.query(
          `INSERT INTO sophia.usage_records(project_id,attempt_id,provider_call_id,billing_kind,input_tokens)
          VALUES($1,$2,'contradiction','unknown',3)`,
          [s.projectId, s.attempt_id],
        )
      }
      await owner.query('SELECT sophia.conversation_set_grant($1,$2)', [s.projectId, { state: 'disabled' }])
      await adverseJobs(s, (await createOutbox(s)).command_id)
      const lease = await dispatchLease(s)
      const digest = await projectDigest(s.projectId)
      for (let i = 0; i < 2; i++) {
        await assert.rejects(
          worker.query('SELECT sophia.dispatch_runtime_outbox($1,$2,$3)', [s.projectId, lease.id, lease.lease]),
          denied('55000'),
        )
        assert.deepEqual(await projectDigest(s.projectId), digest)
      }
    })
  }

  it('A2 in-flight deferral changes only its outbox and locks neither adverse job', async () => {
    const s = await nativeScene()
    const createLease = await dispatchLease(s)
    await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.firstId, randomUUID()))
    const retire = (
      await owner.query<{ command_id: string }>(
        "SELECT command_id FROM sophia.outbox WHERE conversation_reply_id=$1 AND destination='native.retire'",
        [s.replyId],
      )
    ).rows[0]
    assert.ok(retire)
    await adverseJobs(s, retire.command_id)
    const lease = await dispatchLease(s, 'native.retire')
    const untouched = await projectDigest(
      s.projectId,
      dispatchTables.filter((table) => table !== 'outbox'),
    )
    const jobs = (
      await owner.query('SELECT id,state,reason,xmin::text FROM sophia.jobs WHERE project_id=$1 ORDER BY id', [
        s.projectId,
      ])
    ).rows
    const c = await worker.connect()
    const witness = await ownerPool.connect()
    try {
      await c.query('BEGIN')
      const now = (await c.query<{ t: Date }>('SELECT now() AS t')).rows[0]?.t
      assert.ok(now)
      assert.equal(
        (
          await c.query<{ v: { result: string } }>('SELECT sophia.dispatch_runtime_outbox($1,$2,$3) AS v', [
            s.projectId,
            lease.id,
            lease.lease,
          ])
        ).rows[0]?.v.result,
        'deferred',
      )
      await witness.query('BEGIN')
      assert.equal(
        (await witness.query('SELECT id FROM sophia.jobs WHERE project_id=$1 FOR UPDATE NOWAIT', [s.projectId]))
          .rowCount,
        2,
      )
      await witness.query('ROLLBACK')
      await c.query('COMMIT')
      const outbox = (
        await owner.query(
          'SELECT state,lease_owner,lease_token,lease_until,available_at,outcome_reason,attempts FROM sophia.outbox WHERE id=$1',
          [lease.id],
        )
      ).rows[0]
      assert.deepEqual(outbox, {
        state: 'pending',
        lease_owner: null,
        lease_token: null,
        lease_until: null,
        available_at: new Date(now.getTime() + 5000),
        outcome_reason: 'waiting for undispatched reply proof',
        attempts: 1,
      })
      assert.deepEqual(
        await projectDigest(
          s.projectId,
          dispatchTables.filter((table) => table !== 'outbox'),
        ),
        untouched,
      )
      assert.deepEqual(
        (
          await owner.query('SELECT id,state,reason,xmin::text FROM sophia.jobs WHERE project_id=$1 ORDER BY id', [
            s.projectId,
          ])
        ).rows,
        jobs,
      )
      assert.equal(
        (
          await worker.query<{ v: { result: string } }>('SELECT sophia.dispatch_runtime_outbox($1,$2,$3) AS v', [
            s.projectId,
            createLease.id,
            createLease.lease,
          ])
        ).rows[0]?.v.result,
        'denied',
      )
      assert.equal((await dispatch(s, 'native.retire'))?.result, 'settled')
    } finally {
      await c.query('ROLLBACK')
      await witness.query('ROLLBACK')
      c.release()
      witness.release()
    }
  })

  for (const evidence of ['observation', 'usage']) {
    it(`A2 ${evidence} contradiction defers without erasing evidence or settling locally`, async () => {
      const s = await nativeScene()
      await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.firstId, randomUUID()))
      if (evidence === 'observation')
        await owner.query(
          `INSERT INTO sophia.native_observations(project_id,binding_id,upstream_key,type,native_seq,data)
        VALUES($1,$2,'contradiction','debug',1,'{}')`,
          [s.projectId, s.binding_id],
        )
      else
        await owner.query(
          `INSERT INTO sophia.usage_records(project_id,attempt_id,provider_call_id,billing_kind,input_tokens)
        VALUES($1,$2,'contradiction','unknown',3)`,
          [s.projectId, s.attempt_id],
        )
      const unchanged = await projectDigest(
        s.projectId,
        dispatchTables.filter((table) => table !== 'outbox'),
      )
      assert.equal((await dispatch(s, 'native.retire'))?.result, 'deferred')
      assert.deepEqual(
        await projectDigest(
          s.projectId,
          dispatchTables.filter((table) => table !== 'outbox'),
        ),
        unchanged,
      )
      assert.equal(
        (await owner.query('SELECT state FROM sophia.execution_bindings WHERE id=$1', [s.binding_id])).rows[0]?.state,
        'created',
      )
    })
  }
})

async function counters(s: NativeScene) {
  return (
    await owner.query<Record<string, string>>(
      `SELECT reserved_calls,spent_calls,uncertain_calls,reserved_tokens,spent_tokens,uncertain_tokens
    FROM sophia.conversation_grants WHERE project_id=$1 AND current`,
      [s.projectId],
    )
  ).rows[0]
}

interface JournalKeys {
  observations: string[]
  usage: { providerCallId: string; ordinal: number }[]
  ordinals: number[]
  hasTurnEnd: boolean
}

async function acknowledge(
  s: NativeScene,
  keys: JournalKeys = { observations: [], usage: [], ordinals: [], hasTurnEnd: false },
) {
  return call<{ predicates: Record<string, { met: boolean; key?: { kind: string } }> }>(
    s.rt,
    'conversation_acknowledged',
    { ...(await request(s)), keys },
  )
}

async function operational(s: { projectId: string }) {
  const counts: Record<string, number> = {}
  for (const table of [
    'goals',
    'jobs',
    'work_attempts',
    'execution_bindings',
    'commands',
    'outbox',
    'runtime_commands',
    'runtime_receipts',
    'native_observations',
    'usage_records',
    'conversation_executions',
    'conversation_reservations',
  ]) {
    counts[table] =
      (
        await owner.query<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.${table} WHERE project_id=$1`, [
          s.projectId,
        ])
      ).rows[0]?.n ?? -1
  }
  return counts
}

describe('CON admission and durable accounting (L1 SQL only)', () => {
  it('keeps all 500 original goal bindings and appends exactly zero, one or two reply bindings', async () => {
    const rt = await runtimeProject()
    await owner.query(
      `WITH attempts AS (
      INSERT INTO sophia.work_attempts(project_id,goal_id,goal_revision,authority_epoch,state)
      SELECT $1,g.id,g.revision,g.authority_epoch,'running' FROM sophia.goals g,generate_series(1,500)
      WHERE g.project_id=$1 RETURNING id)
      INSERT INTO sophia.execution_bindings(project_id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
      SELECT $1,a.id,r.resource_id,'synthetic-goal-'||a.id,r.runtime_unit_id,'native_goal','running'
      FROM attempts a,sophia.runtime_instances r WHERE r.id=$2`,
      [rt.projectId, rt.runtimeId],
    )
    const roles = (await owner.query('SELECT roles FROM sophia.runtime_instances WHERE id=$1', [rt.runtimeId])).rows[0]
      ?.roles
    const original = await call<{ bindings: unknown[] }>(rt, 'hello', { protocolVersion: 1, roles })
    assert.equal(original.bindings.length, 500)
    const replies: NativeScene[] = []
    for (const count of [1, 2]) {
      await call(rt, 'record_ready', { state: 'ready', reason: null, unrecovered: [] })
      replies.push(await nativeScene(rt))
      const hello = await call<{ bindings: { attemptId: string; state: string; authorityEpoch: number }[] }>(
        rt,
        'hello',
        { protocolVersion: 1, roles },
      )
      assert.equal(hello.bindings.length, 500 + count)
      assert.deepEqual(hello.bindings.slice(0, 500), original.bindings)
      const appended = hello.bindings.slice(500)
      assert.deepEqual(appended.map((b) => b.attemptId).toSorted(), replies.map((r) => r.attempt_id).toSorted())
      assert.ok(appended.every((b) => b.state === 'active' && b.authorityEpoch === 1))
      assert.ok(
        appended.every(
          (b) =>
            Object.keys(b).toSorted().join(',') ===
            'attemptId,authorityEpoch,conversationReplyId,create,nativeSessionId,state',
        ),
      )
    }
    // Step3 wire and SQL both carry the complete500goal+2CON report; native recovery qualification stays separate.
  })

  it('a new runtime instance cannot hide two old slots or reset an uncertain reservation', async () => {
    const rt = await runtimeProject()
    const first = await nativeScene(rt)
    await go(first)
    await receipt(first, 'create', 'delivered')
    await call(rt, 'conversation_reserve', { ...(await request(first)), ordinal: 1, call: callBound })
    await nativeScene(rt)
    const registered = await registerRuntime(db.ownerUrl, {
      projectId: rt.projectId,
      admin: A,
      runtimeUnitId: rt.runtimeUnitId,
    })
    const replacement = {
      ...registered,
      projectId: rt.projectId,
      bridge: randomUUID(),
      hash: createHash('sha256').update(registered.token).digest(),
    }
    await call(replacement, 'hello', {
      protocolVersion: 1,
      roles: [{ id: 'sophia-conversation-v1', route: 'route-test', presetDigest: 'synthetic' }],
    })
    await call(replacement, 'record_ready', { state: 'ready', reason: null, unrecovered: [] })
    assert.equal((await reply(first))?.state, 'outcome_unknown')
    assert.equal((await counters(first))?.uncertain_calls, '1')
    const previousOperations = await operational(rt)
    const allowance = await counters(first)
    const third = await withActor(api, E, 'write', (c) =>
      startConversation(
        c,
        rt.projectId,
        randomUUID(),
        {
          title: 'Synthetic after runtime replacement',
          text: 'Capacity cannot reset',
          askSophia: true,
        },
        'E',
      ),
    )
    assert.ok(third.replyId)
    assert.deepEqual(
      (await owner.query('SELECT state,reason FROM sophia.conversation_replies WHERE id=$1', [third.replyId])).rows[0],
      { state: 'blocked', reason: 'cleanup_capacity' },
    )
    assert.deepEqual(await operational(rt), previousOperations)
    assert.deepEqual(await counters(first), allowance)
    await assert.rejects(call(rt, 'conversation_go', await request(first)), denied('42501'))
  })

  for (const operation of [
    'conversation_claim',
    'conversation_go',
    'conversation_reserve',
    'conversation_settle',
    'conversation_acknowledged',
  ] as const) {
    it(`${operation} rejects crossed request/runtime/unit/lease/epoch identities without changing durable state`, async () => {
      const s = await nativeScene()
      await go(s)
      await call(s.rt, 'conversation_reserve', { ...(await request(s)), ordinal: 1, call: callBound })
      const sibling = await nativeScene(s.rt)
      await go(sibling)
      const other = await runtimeProject()
      const body = {
        ...(await request(s)),
        ordinal: 1,
        call: callBound,
        used: usageBound,
        keys: { observations: [], usage: [], ordinals: [], hasTurnEnd: false },
      }
      const siblingBody = await request(sibling)
      const unchanged = await projectDigest(s.projectId)
      for (const crossed of [
        { ...body, commandId: siblingBody.commandId },
        { ...body, attemptId: siblingBody.attemptId },
        { ...body, leaseId: randomUUID() },
      ])
        await assert.rejects(call(s.rt, operation, crossed), denied('42501'))
      if (operation === 'conversation_claim' || operation === 'conversation_go')
        assert.deepEqual(await call(s.rt, operation, { ...body, authorityEpoch: 2 }), {
          result: 'refused',
          code: 'stale_epoch',
        })
      else await assert.rejects(call(s.rt, operation, { ...body, authorityEpoch: 2 }), denied('42501'))
      await assert.rejects(call(other, operation, { ...body, leaseId: other.bridge }), denied('42501'))
      await assert.rejects(call({ ...s.rt, runtimeUnitId: 'wrong-owned-unit' }, operation, body), denied('42501'))
      assert.deepEqual(await projectDigest(s.projectId), unchanged)
    })
  }

  it('human-only chat with an enabled synthetic grant writes no execution or accounting row', async () => {
    const rt = await runtimeProject()
    const prior = await operational(rt)
    const grant = (await owner.query('SELECT * FROM sophia.conversation_grants WHERE project_id=$1', [rt.projectId]))
      .rows
    await withActor(api, E, 'write', (c) =>
      startConversation(
        c,
        rt.projectId,
        randomUUID(),
        { title: 'Human only', text: 'Synthetic message', askSophia: false },
        'E',
      ),
    )
    assert.deepEqual(await operational(rt), prior)
    assert.deepEqual(
      (await owner.query('SELECT * FROM sophia.conversation_grants WHERE project_id=$1', [rt.projectId])).rows,
      grant,
    )
  })

  it('admits two concurrent asks and keeps the third human message while cleanup capacity is exhausted', async () => {
    const rt = await runtimeProject()
    const send = () =>
      withActor(api, E, 'write', (c) =>
        startConversation(
          c,
          rt.projectId,
          randomUUID(),
          { title: 'Concurrent', text: 'Synthetic question', askSophia: true },
          'E',
        ),
      )
    const admitted = await Promise.all([send(), send()])
    assert.ok(admitted.every((r) => r.replyId))
    const prior = await operational(rt)
    const third = await send()
    const row = (await owner.query('SELECT state,reason FROM sophia.conversation_replies WHERE id=$1', [third.replyId]))
      .rows[0]
    assert.deepEqual(row, { state: 'blocked', reason: 'cleanup_capacity' })
    assert.deepEqual(await operational(rt), prior)
    assert.equal(
      (await owner.query('SELECT body FROM sophia.conversation_messages WHERE id=$1', [third.messageId])).rows[0]?.body,
      'Synthetic question',
    )
    await call(rt, 'hello', { protocolVersion: 1 })
    const unclaimed = (
      await owner.query('SELECT state FROM sophia.conversation_replies WHERE id=ANY($1)', [
        admitted.map((r) => r.replyId),
      ])
    ).rows
    assert.ok(
      unclaimed.every((r) => r.state === 'pending'),
      'hello does not invent an execution loss for unclaimed pending replies',
    )
    assert.equal(
      (
        await owner.query('SELECT count(*)::int AS n FROM sophia.conversation_executions WHERE project_id=$1', [
          rt.projectId,
        ])
      ).rows[0]?.n,
      0,
    )
  })

  it('capture preserves a reserved ordinal for recovery settle; identical replay cannot charge twice', async () => {
    const s = await nativeScene()
    await go(s)
    await receipt(s, 'create', 'delivered')
    const body = await request(s)
    await call(s.rt, 'conversation_reserve', { ...body, ordinal: 1, call: callBound })
    await call(s.rt, 'record_observations', [
      observation(s, 1, 'assistant/message', {
        text: 'Synthetic metered answer',
        provider: 'stub-not-executed',
        model: 'synthetic',
        inputTokens: 10,
        outputTokens: 2,
        ordinal: 1,
      }),
      observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
    ])
    assert.equal((await reply(s))?.state, 'answered')
    const old = s.rt.bridge
    s.rt.bridge = randomUUID()
    await call(s.rt, 'hello', { protocolVersion: 1 })
    await assert.rejects(
      call({ ...s.rt, bridge: old }, 'conversation_settle', { ...body, ordinal: 1, used: usageBound }),
      denied('40001'),
    )
    const recovery = { ...body, leaseId: s.rt.bridge, ordinal: 1, used: usageBound }
    const settled = await call(s.rt, 'conversation_settle', recovery) // discard at the simulated transport boundary below
    const once = await counters(s)
    assert.deepEqual(await call(s.rt, 'conversation_settle', recovery), settled)
    s.rt.bridge = randomUUID()
    await call(s.rt, 'hello', { protocolVersion: 1 })
    assert.deepEqual(await call(s.rt, 'conversation_settle', { ...recovery, leaseId: s.rt.bridge }), settled)
    assert.deepEqual(await counters(s), once)
    await assert.rejects(
      call(s.rt, 'conversation_settle', { ...recovery, leaseId: s.rt.bridge, used: { ...usageBound, tokens: 13 } }),
      denied('23505'),
    )
    await assert.rejects(
      call(s.rt, 'conversation_reserve', { ...body, leaseId: s.rt.bridge, ordinal: 2, call: callBound }),
      denied('42501'),
    )
  })

  for (const stage of ['rejected', 'failed', 'outcome_unknown']) {
    it(`a ${stage} create ends once, keeps uncertain allowance and refuses recovered publication/settle`, async () => {
      const s = await nativeScene()
      await go(s)
      const body = await request(s)
      await call(s.rt, 'conversation_reserve', { ...body, ordinal: 1, call: callBound })
      await receipt(s, 'create', stage)
      const ended = await reply(s)
      assert.equal(ended?.state, stage === 'outcome_unknown' ? 'outcome_unknown' : 'failed')
      const charged = await counters(s)
      assert.equal(charged?.uncertain_calls, '1')
      await receipt(s, 'create', 'delivered')
      assert.deepEqual(await reply(s), ended)
      s.rt.bridge = randomUUID()
      await call(s.rt, 'hello', { protocolVersion: 1 })
      await call(s.rt, 'record_observations', [
        observation(s, 1, 'assistant/message', {
          text: 'NEVER REPUBLISH',
          provider: 'synthetic',
          model: 'synthetic',
          inputTokens: 10,
          outputTokens: 2,
          ordinal: 1,
        }),
        observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
      ])
      assert.deepEqual(await reply(s), ended)
      assert.deepEqual(await counters(s), charged)
      await assert.rejects(
        call(s.rt, 'conversation_settle', { ...body, leaseId: s.rt.bridge, ordinal: 1, used: usageBound }),
        denied('42501'),
      )
      const ack = await acknowledge(s)
      assert.equal(ack.predicates.terminalWriter?.met, true)
      assert.equal(ack.predicates.terminalWriter?.key?.kind, 'receipt')
      assert.equal(
        (
          await owner.query('SELECT data FROM sophia.native_observations WHERE binding_id=$1 AND native_seq=1', [
            s.binding_id,
          ])
        ).rows[0]?.data.text,
        undefined,
      )
    })
  }
})

describe('CON cleanup evidence (L1 SQL only)', () => {
  it('reports all eight durable predicates only after their real correlated evidence exists', async () => {
    const s = await nativeScene()
    await go(s)
    const initial = (await acknowledge(s)).predicates
    assert.equal(initial.terminalState?.met, false)
    assert.equal(initial.terminalWriter?.met, false)
    assert.equal(initial.createAnswered?.met, false)
    assert.equal(initial.payloadScrubbed?.met, false)
    assert.equal(initial.capture?.met, true, 'none is honest only with no journal or database turn end')
    assert.equal(
      (await acknowledge(s, { observations: [], usage: [], ordinals: [], hasTurnEnd: true })).predicates.capture?.met,
      false,
    )
    await call(s.rt, 'conversation_reserve', { ...(await request(s)), ordinal: 1, call: callBound })
    await receipt(s, 'create', 'delivered')
    await call(s.rt, 'record_observations', [
      observation(s, 1, 'assistant/message', {
        text: 'Synthetic evidence answer',
        provider: 'synthetic',
        model: 'synthetic',
        inputTokens: 10,
        outputTokens: 2,
        ordinal: 1,
      }),
      observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
    ])
    await call(s.rt, 'conversation_settle', { ...(await request(s)), ordinal: 1, used: usageBound })
    const keys: JournalKeys = {
      observations: [1, 2].map((seq) => `${s.rt.runtimeUnitId}:${s.native_session_id}:${String(seq)}`),
      usage: [{ providerCallId: `${s.native_session_id}#1`, ordinal: 1 }],
      ordinals: [1],
      hasTurnEnd: true,
    }
    const predicates = (await acknowledge(s, keys)).predicates
    assert.equal(Object.keys(predicates).length, 8)
    assert.ok(Object.values(predicates).every((p) => p.met))
    assert.equal((await acknowledge(s, { ...keys, observations: [randomUUID()] })).predicates.observations?.met, false)
    assert.equal(
      (await acknowledge(s, { ...keys, usage: [{ providerCallId: `${s.native_session_id}#1`, ordinal: 2 }] }))
        .predicates.usage?.met,
      false,
    )
    assert.equal((await acknowledge(s, { ...keys, ordinals: [2] })).predicates.reservations?.met, false)
  })

  for (const outcome of ['reserved', 'uncertain']) {
    it(`an omitted ${outcome} database reservation still holds acknowledgement without correlated usage`, async () => {
      const s = await nativeScene()
      await go(s)
      await call(s.rt, 'conversation_reserve', { ...(await request(s)), ordinal: 1, call: callBound })
      if (outcome === 'uncertain') await receipt(s, 'create', 'outcome_unknown')
      const states = await owner.query(
        'SELECT call_ordinal,state FROM sophia.conversation_reservations WHERE reply_id=$1',
        [s.replyId],
      )
      assert.deepEqual(states.rows, [{ call_ordinal: 1, state: outcome }])
      assert.equal((await acknowledge(s)).predicates.reservations?.met, false)
      assert.equal(
        (await acknowledge(s, { observations: [], usage: [], ordinals: [1], hasTurnEnd: false })).predicates
          .reservations?.met,
        false,
      )
    })
  }

  it('does not infer capture from a database turn end after its durable capture marker is absent', async () => {
    const s = await nativeScene()
    await go(s)
    await receipt(s, 'create', 'delivered')
    await call(s.rt, 'record_observations', [observation(s, 1, 'turn/end', { reason: { kind: 'completed' } })])
    assert.equal((await acknowledge(s)).predicates.capture?.met, true)
    // Owner-only fault injection: an actual observation remains, while the content-free marker is missing.
    const c = await command(s)
    await owner.query(
      "UPDATE sophia.commands SET receipt=receipt-'capture'-'terminalWriter' WHERE project_id=$1 AND id=(SELECT command_id FROM sophia.runtime_commands WHERE project_id=$1 AND id=$2)",
      [s.projectId, c.id],
    )
    const predicates = (await acknowledge(s)).predicates
    assert.equal(predicates.capture?.met, false)
    assert.equal(predicates.terminalWriter?.met, false)
    assert.equal(predicates.createAnswered?.met, true, 'the independent real create receipt survives')
  })

  it('retires a never-dispatched cancellation locally, without inventing runtime receipts or deletion predicates', async () => {
    const s = await nativeScene()
    await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.firstId, randomUUID()))
    assert.equal((await dispatch(s, 'native.retire'))?.result, 'settled')
    const counts = await operational(s)
    assert.equal(counts.runtime_commands, 0)
    assert.equal(counts.runtime_receipts, 0)
    assert.equal(counts.conversation_executions, 0)
    assert.equal(counts.conversation_reservations, 0)
    assert.equal(counts.outbox, 2)
    assert.equal(counts.commands, 2)
    assert.equal(
      (await owner.query('SELECT state FROM sophia.execution_bindings WHERE id=$1', [s.binding_id])).rows[0]?.state,
      'retired',
    )
  })

  for (const first of ['outcome_unknown', 'checked']) {
    it(`cleanup ${first} first keeps delivery history while a recorded checked drives only retirement/cursor`, async () => {
      const s = await nativeScene()
      await go(s)
      await receipt(s, 'create', 'delivered')
      await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.firstId, randomUUID()))
      await dispatch(s, 'native.stop')
      await receipt(s, 'stop', first)
      const stageBefore = (
        await owner.query(
          `SELECT rc.answered_stage,o.state AS outbox,c.state AS command FROM sophia.runtime_commands rc
        JOIN sophia.outbox o ON o.project_id=rc.project_id AND o.id=rc.outbox_id
        JOIN sophia.commands c ON c.project_id=rc.project_id AND c.id=rc.command_id WHERE rc.binding_id=$1 AND rc.kind='stop'`,
          [s.binding_id],
        )
      ).rows[0]
      const stopSeq = Number(
        (
          await owner.query("SELECT seq FROM sophia.runtime_commands WHERE binding_id=$1 AND kind='stop'", [
            s.binding_id,
          ])
        ).rows[0]?.seq,
      )
      const cursor = async () =>
        Number((await owner.query('SELECT sophia.runtime_cursor($1) AS n', [s.rt.runtimeId])).rows[0]?.n)
      assert.equal(await cursor(), first === 'checked' ? stopSeq : stopSeq - 1)
      await receipt(s, 'stop', first === 'checked' ? 'outcome_unknown' : 'checked')
      assert.deepEqual(
        (
          await owner.query(
            `SELECT rc.answered_stage,o.state AS outbox,c.state AS command FROM sophia.runtime_commands rc
        JOIN sophia.outbox o ON o.project_id=rc.project_id AND o.id=rc.outbox_id
        JOIN sophia.commands c ON c.project_id=rc.project_id AND c.id=rc.command_id WHERE rc.binding_id=$1 AND rc.kind='stop'`,
            [s.binding_id],
          )
        ).rows[0],
        stageBefore,
      )
      assert.equal(await cursor(), stopSeq)
      assert.equal(
        (
          await owner.query(
            "SELECT count(*)::int AS n FROM sophia.runtime_receipts rr JOIN sophia.runtime_commands rc ON rc.project_id=rr.project_id AND rc.id=rr.runtime_command_id WHERE rc.binding_id=$1 AND rc.kind='stop'",
            [s.binding_id],
          )
        ).rows[0]?.n,
        2,
      )
      assert.equal(
        (
          await owner.query(
            "SELECT count(*)::int AS n FROM sophia.outbox WHERE conversation_reply_id=$1 AND destination='native.retire'",
            [s.replyId],
          )
        ).rows[0]?.n,
        1,
      )
      const ack = await acknowledge(s)
      assert.equal(ack.predicates.terminalWriter?.key?.kind, 'cancellation')
    })
  }

  for (const reason of ['asker_removed', 'audience_changed']) {
    it(`capture privacy ${reason} fences a real claimed reply, names observation instead of an invented withdrawal`, async () => {
      const s = await nativeScene()
      await go(s)
      await receipt(s, 'create', 'delivered')
      if (reason === 'asker_removed')
        await owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
          s.projectId,
          E,
        ])
      else
        await owner.query('UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=$1', [s.projectId])
      await call(s.rt, 'record_observations', [
        observation(s, 1, 'assistant/message', { text: 'PRIVATE REJECTED ANSWER' }),
        observation(s, 2, 'turn/end', { reason: { kind: 'completed' } }),
      ])
      assert.deepEqual(await reply(s), { state: 'cancelled', reason, answer_id: null })
      const cause = (
        await owner.query(
          'SELECT caller,cause_kind,cause_message_id,cause_source_id,had_claim FROM sophia.conversation_cancellations WHERE reply_id=$1',
          [s.replyId],
        )
      ).rows[0]
      assert.deepEqual(cause, {
        caller: 'capture_native_result',
        cause_kind: 'capture_privacy',
        cause_message_id: null,
        cause_source_id: null,
        had_claim: true,
      })
      assert.equal(
        (await owner.query('SELECT authority_epoch FROM sophia.work_attempts WHERE id=$1', [s.attempt_id])).rows[0]
          ?.authority_epoch,
        '2',
      )
      assert.equal(
        (
          await owner.query(
            "SELECT count(*)::int AS n FROM sophia.outbox WHERE conversation_reply_id=$1 AND destination='native.stop'",
            [s.replyId],
          )
        ).rows[0]?.n,
        1,
      )
      assert.equal((await acknowledge(s)).predicates.terminalWriter?.met, true)
    })
  }
})

interface FunctionIdentity extends pg.QueryResultRow {
  proname: string
  definition: string
  owner: string
  secdef: boolean
  config: string[]
  acl: string[] | null
  body: string
}

describe('CON sealed fixture integrity and cleanup (owned test database only)', () => {
  for (const fault of ['missing', 'changed']) {
    it(`refuses a ${fault} sealed migration before creating a database`, async () => {
      const source = await fs.mkdtemp(join(tmpdir(), 'con01-fixture-test-'))
      try {
        await fs.cp(new URL('../../../db/migrations/', import.meta.url), source, { recursive: true })
        const migration = join(source, '0053_runtime_outbox_reconcile.sql')
        if (fault === 'missing') await fs.rm(migration)
        else await fs.appendFile(migration, '\n-- synthetic drift\n')
        let created = false
        await assert.rejects(
          createConversationCandidateDatabase(pathToFileURL(`${source}/`), () => {
            created = true
            return Promise.reject(new Error('invalid sealed input reached database creation'))
          }),
          fault === 'missing' ? /ENOENT/u : /CON candidate migration baseline drift: 0053/u,
        )
        assert.equal(created, false)
      } finally {
        await fs.rm(source, { recursive: true })
      }
    })
  }

  it('drops the created database if removing the owned staging directory fails, and reports the failure', async (t) => {
    const remove = fs.rm
    let residual: string | undefined
    let created: TestDatabase | undefined
    const fault = t.mock.method(fs, 'rm', (path: Parameters<typeof fs.rm>[0], options: Parameters<typeof fs.rm>[1]) => {
      if (typeof path === 'string' && path.includes('con01-candidate-fixture-')) {
        residual = path
        return Promise.reject(new Error('synthetic fixture removal failure'))
      }
      return remove(path, options)
    })
    try {
      await assert.rejects(
        createConversationCandidateDatabase(undefined, async (directory) => {
          created = await createTestDatabase(directory)
          return created
        }),
        /synthetic fixture removal failure/u,
      )
      assert.ok(residual)
      assert.ok(created)
      assert.deepEqual(
        (
          await roleLock.query('SELECT datname FROM pg_database WHERE datname=$1', [
            new URL(created.ownerUrl).pathname.slice(1),
          ])
        ).rows,
        [],
      )
      assert.deepEqual(
        (
          await roleLock.query('SELECT rolname FROM pg_roles WHERE rolname=ANY($1)', [
            [created.apiRole, new URL(created.workerUrl).username],
          ])
        ).rows,
        [],
      )
    } finally {
      fault.mock.restore()
      if (residual) await remove(residual, { recursive: true })
      await created?.drop()
    }
  })
})
async function functionIdentities(c: pg.Client, names: readonly string[]) {
  return (
    await c.query<FunctionIdentity>(
      `SELECT proname,pg_get_functiondef(oid) AS definition,prosrc AS body,
    proowner::regrole::text AS owner,prosecdef AS secdef,proconfig AS config,proacl::text[] AS acl FROM pg_proc
    WHERE pronamespace='sophia'::regnamespace AND proname=ANY($1) ORDER BY proname`,
      [names],
    )
  ).rows
}

async function databaseSnapshot(c: pg.Client) {
  const relations = (
    await c.query<{ name: string }>(`SELECT n.nspname||'.'||t.relname AS name FROM pg_class t
    JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname IN ('sophia','sophia_secrets') AND t.relkind='r' ORDER BY 1`)
  ).rows
  const rows: Record<string, string> = {}
  for (const relation of relations) {
    assert.match(relation.name, /^[a-z_]+\.[a-z_]+$/)
    rows[relation.name] =
      (
        await c.query<{ digest: string }>(
          `SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]')::text) AS digest FROM ${relation.name} r`,
        )
      ).rows[0]?.digest ?? ''
  }
  const catalog = (
    await c.query(`SELECT jsonb_build_object(
    'relations',(SELECT jsonb_agg(jsonb_build_array(oid,relname,relkind,relacl,relrowsecurity,relforcerowsecurity) ORDER BY oid)
      FROM pg_class WHERE relnamespace IN ('sophia'::regnamespace,'sophia_secrets'::regnamespace)),
    'functions',(SELECT jsonb_agg(jsonb_build_array(oid,pg_get_functiondef(oid),proowner,proacl) ORDER BY oid)
      FROM pg_proc WHERE pronamespace='sophia'::regnamespace),
    'constraints',(SELECT jsonb_agg(jsonb_build_array(oid,conname,pg_get_constraintdef(oid),convalidated) ORDER BY oid)
      FROM pg_constraint WHERE connamespace='sophia'::regnamespace),
    'triggers',(SELECT jsonb_agg(jsonb_build_array(t.oid,pg_get_triggerdef(t.oid)) ORDER BY t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.relnamespace='sophia'::regnamespace),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p),
    'schema_acl',(SELECT jsonb_agg(jsonb_build_array(nspname,nspacl) ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('sophia','sophia_secrets'))
    ) AS value`)
  ).rows[0]?.value
  return { rows, catalog }
}
const sharedInsertions: Record<string, string[]> = {
  dispatch_runtime_outbox: ['D1', 'D2'],
  native_delivery_ineligible: ['N1'],
  capture_native_result: ['C1', 'C3'],
  runtime_hello: ['HELLO-LOSS', 'HELLO-BINDINGS', 'HELLO-EXECUTOR'],
  apply_runtime_receipt: ['RECEIPT'],
  runtime_record_observations: ['OBS-LOCKS', 'OBS-REPLY'],
  runtime_cursor: [],
}
function removeInsertion(body: string, marker: string) {
  const inline = ['C1', 'HELLO-LOSS', 'OBS-REPLY'].includes(marker)
  const pattern = new RegExp(
    String.raw`${inline ? '\n' : '^'}[ \t]*-- CON-${marker}-BEGIN[^\n]*\n[\s\S]*?^[ \t]*-- CON-${marker}-END[^\n]*\n`,
    'm',
  )
  assert.match(body, pattern, `marked ${marker}`)
  return body.replace(pattern, '')
}
/** 0075's own marked insertions (A41, session retirement), removed as CON's are; named apart from CON's. */
const retirementInsertions: Record<string, string> = {
  dispatch_runtime_outbox: 'RETIRE-KIND',
  runtime_hello: 'RETIRE-HELLO',
}
function restoredShared(identity: FunctionIdentity) {
  let definition = identity.definition
  const retirement = retirementInsertions[identity.proname]
  if (retirement) {
    const pattern = new RegExp(
      String.raw`^[ \t]*-- ${retirement}-BEGIN[^\n]*\n[\s\S]*?^[ \t]*-- ${retirement}-END[^\n]*\n`,
      'm',
    )
    assert.match(definition, pattern, `marked ${retirement}`)
    definition = definition.replace(pattern, '')
  }
  for (const marker of sharedInsertions[identity.proname] ?? []) definition = removeInsertion(definition, marker)
  if (identity.proname === 'runtime_cursor') {
    definition = definition
      .replace(/\/\* CON-CURSOR-BEGIN \*\/[\s\S]*?\/\* CON-CURSOR-END \*\//, '')
      .replace(/\/\* CON-CURSOR-TAIL-BEGIN \*\/[\s\S]*?\/\* CON-CURSOR-TAIL-END \*\//, '')
  }
  return { ...identity, definition, body: undefined }
}

// Immutable 7d8f415f S1-S4 function bodies (S4 deliberately supersedes S3 context_kept).
// These hashes come from the approved frozen inputs, not the authored migration.
/** What 0070 lets the assembler execute, of 0064's functions: the S3 candidate's own grants. */
const ASSEMBLER_EXECUTES = new Set([
  'conversation_assembly_claim',
  'conversation_assembly_begin',
  'conversation_assembly_close',
  'conversation_assembly_fail',
  'conversation_record_context',
  'conversation_assembly_project',
  'conversation_actor_label',
])

const frozenFunctions: Record<string, readonly [string, boolean, string]> = {
  conversation_withdrawn_from: [
    '789e613fb43a412d792ac32734ab0e080fa63a86483752429f4ee0ca00c1505d',
    true,
    'pg_catalog, sophia',
  ],
  conversation_ledger_kept: [
    '368bd3bbcb5aa9c32cd592b68d38e713a424542b0fd89f7deb076ca03f7100fa',
    false,
    'pg_catalog, sophia',
  ],
  conversation_ledger_amount: [
    'b473e978ded3eba9a815b886987a228c8d5f8dba393146beb9e8be80fd580546',
    false,
    'pg_catalog, sophia',
  ],
  conversation_reservation_receipt: [
    '1c0f8d40e4c529aa88439370118ac88b37012f9acb31944927df86e93d8d50b8',
    false,
    'pg_catalog, sophia',
  ],
  conversation_grant_subjects_set: [
    'e18a0ad129dacab0430c8211af0a8e8319765ab01b57a821fa6e73b86ca11871',
    false,
    'pg_catalog, sophia',
  ],
  conversation_new_lineage: [
    'c64f663531cc7c644051e5f9654bf0446cf5af574a7814a3acaea11d294cfbee',
    true,
    'pg_catalog, sophia',
  ],
  conversation_set_grant: [
    '95853cd9b4f824dd5bfb9c60e95813e660467061e4543233fdcca7a69ba24e38',
    true,
    'pg_catalog, sophia',
  ],
  conversation_reserve: [
    '361092fc058cda16cee504c25aeda998e64201232051031b262dc1a871f1500a',
    true,
    'pg_catalog, sophia',
  ],
  conversation_settle: ['be53fc37bedbce4d4c26d60814b277e5a4c436cc31df415d94ebdda25d1107db', true, 'pg_catalog, sophia'],
  conversation_mark_uncertain: [
    'c870b7e14c1d4f6045b1b640a7780c3540cc89ef1ba7712bffa755c3f77dc643',
    true,
    'pg_catalog, sophia',
  ],
  conversation_release: [
    '19f63c7e8544750b1776656624ef3647a202b738ed0036c5ddf90270360f79e3',
    true,
    'pg_catalog, sophia',
  ],
  conversation_reconcile: [
    '19f63c7e8544750b1776656624ef3647a202b738ed0036c5ddf90270360f79e3',
    true,
    'pg_catalog, sophia',
  ],
  conversation_context_kept: [
    '33fb7d1c999196e0e95511a18818d78985a82de4db19f1ceee98989ae0d2081d',
    false,
    'pg_catalog, sophia',
  ],
  conversation_context_quoted: [
    'cc85100d65d06ba304b8bba41cb15884e7b9d6c4b64595de5eaaabd53cfd5634',
    false,
    'pg_catalog',
  ],
  conversation_context_time: ['f65546378bb45c72393898e265f27a1d599805993ca4a1dbdf641bf74c0cc884', false, 'pg_catalog'],
  conversation_context_fields: [
    '7de15a80daa67d3302b9dd6e8d6e3e645c34fe0f1ad0d5a7ca85073b28d7969f',
    false,
    'pg_catalog, sophia',
  ],
  conversation_context_template: [
    '6db4d3444912b12cad34d1723a742306162b2c852a8e6caa612e4e222f2ecf8e',
    false,
    'pg_catalog',
  ],
  conversation_context_mission: [
    '79f2edb6baa6ceecdeee6db98718a2b09efb05d3f12be21447fa3aaded7234eb',
    true,
    'pg_catalog, sophia',
  ],
  conversation_context_decision: [
    'f9579a012fcda0ca202ab74c8984ff9446d9e42363c0455d60ee7118ccd2763d',
    true,
    'pg_catalog, sophia',
  ],
  conversation_context_message: [
    'd578d54c8f0b739cd418f5b7c5bac11c10e5b1d23c5b7d43e5a5154f7bdeeb6b',
    true,
    'pg_catalog, sophia',
  ],
  conversation_assembly_locked: [
    '4505b397428cd4253bd6969c759c18c8010b93b0a13c4ba54da38ef49197b085',
    true,
    'pg_catalog, sophia',
  ],
  conversation_assembly_privacy: [
    'be2ac6ece751a73c5d1806ec0ead00d1b57577abbfe5c5c73e2d7f102ee88f9b',
    true,
    'pg_catalog, sophia',
  ],
  conversation_assembly_current: [
    '7d2011f460b9ae46e31a85eab93a1894f677f0e0c10d4d6707a88b6fb6a6f852',
    true,
    'pg_catalog, sophia',
  ],
  conversation_context_current: [
    '3e2539de09627ebec05a01a8ff11a01528b0b5ee35c97a1203a094010010fd72',
    true,
    'pg_catalog, sophia',
  ],
  conversation_context_scrub: [
    '44ff88eb5d37eb4a0ac5f3d3bf1d2e84fd2693044ea3ca12e2c9fe81baaa3f42',
    true,
    'pg_catalog, sophia',
  ],
  conversation_context_message_scrubbed: [
    'c0b1476885077b529839f0538a314c7bbad9fda1e5eb7f5905aadb7318b237b2',
    true,
    'pg_catalog, sophia',
  ],
  conversation_context_reply_scrubbed: [
    '58e6f35beecdb8240ee4d592db5e40b3880b4da5efb6f5bbde2f400a83e0344d',
    true,
    'pg_catalog, sophia',
  ],
  conversation_assembly_claim: [
    '57f87d794cde3fc06300bcaf0532a202e4bedd94598f37975357366f76463e6b',
    true,
    'pg_catalog, sophia',
  ],
  conversation_assembly_begin: [
    '2edc548df2132d75d5919a8d8e53ad46df823a199a7a67796f88183740304fa8',
    true,
    'pg_catalog, sophia',
  ],
  conversation_assembly_close: [
    '06a660ae339b75e58d986c975358cca228b2b4c7b59a5dbb55d011d3634e2d5a',
    true,
    'pg_catalog, sophia',
  ],
  conversation_assembly_fail: [
    'b32030cff6a1edeb8ae8632a82caa94d3f238a5c955ec37258c07f4007be13f6',
    true,
    'pg_catalog, sophia',
  ],
  conversation_context_grammar: [
    '25cbdd689929c4934d19409915be4e62a2092c4d169ad06e3864fb11ed16f4e1',
    false,
    'pg_catalog',
  ],
  conversation_context_list: ['68cd80d8c3c598aba8da03bd2d19875d4a67268bacac3c1a973fa86ded2e36a6', false, 'pg_catalog'],
  conversation_record_context: [
    '70b8f2478f1224ac34ec1d2264faa3ac840e6be5cef9dea553fff924108a92c6',
    true,
    'pg_catalog, sophia',
  ],
  conversation_fences_kept: [
    '45a703970a7745ffeb021e70ce7d4c7c8529723c504308c8d2e501cb55410197',
    false,
    'pg_catalog, sophia',
  ],
  conversation_fences_locked: [
    'b34c8ef2ff2f5171c113bfc4db2f3e639e2245ebb0bb95a248e3036c31f4eef5',
    true,
    'pg_catalog, sophia',
  ],
  conversation_reply_verdict: [
    '6f3f368782bc5d66f13452253c8c3ef0c96257e90b55566625b306d3c1341831',
    true,
    'pg_catalog, sophia',
  ],
  conversation_fences_recorded: [
    '98006c8d21df184fc5950bc4d603fe11043dfd26ec1f491eb9479270b97066cc',
    true,
    'pg_catalog, sophia',
  ],
  conversation_answer_receipt: [
    'af26c4c2d441ca430c81195613961721accec3115cf909f245f5b12ee40433ce',
    true,
    'pg_catalog, sophia',
  ],
  conversation_context_digest_erase: [
    '82d676863e75a81762909ddaa96de5c3d1c103494c6bd97ae67d21beda010772',
    true,
    'pg_catalog, sophia',
  ],
  conversation_fences_text_gone: [
    '5b9ae5156ff9271e526459759ae3b1a05e5ab6ebdd65056c519f9b9038dcea34',
    true,
    'pg_catalog, sophia',
  ],
  conversation_reply_check: [
    '0aa12fba25b44a86e1bb43b95cf5950cd6abcef390e3c90f880348ce61665bee',
    true,
    'pg_catalog, sophia',
  ],
  conversation_publish_answer: [
    '4106dc6082392e7efccbf428304c70c5620910e310f6bac5ae5ac49fcd537d50',
    true,
    'pg_catalog, sophia',
  ],
  conversation_refuse_answer: [
    '8f653044021bafd0749d7f33049784a7f46277178d0c38a995fcdc15643d87f8',
    true,
    'pg_catalog, sophia',
  ],
  conversation_source_out: [
    'a91f76defab224a59501bf9a177fc0afaa0eddfe1db28af7c6c89fc9e2104f19',
    true,
    'pg_catalog, sophia',
  ],
}
const frozenCancellationUpdates: Record<string, string> = {
  W1: " UPDATE sophia.conversation_replies SET state='cancelled', reason=p_reason, settled_at=clock_timestamp()\n  WHERE project_id=p_project AND conversation_id=p_conversation AND cutoff_seq>=p_seq\n   AND state IN ('pending','running');\n",
  'S4-PUBLICATION':
    "  UPDATE sophia.conversation_replies SET state='cancelled', reason=v.o_privacy, settled_at=t\n   WHERE project_id=r.project_id AND id=r.id;\n",
  'S4-SOURCE':
    "   UPDATE sophia.conversation_replies SET state='cancelled', reason=why, settled_at=t\n    WHERE project_id=p_project AND id=r.id;\n",
}
function restoredFrozenBody(identity: FunctionIdentity) {
  let body = identity.body
  if (identity.proname === 'conversation_withdrawn_from') body = removeInsertion(body, 'W1-DECL')
  const markers: Record<string, string> = {
    conversation_withdrawn_from: 'W1',
    conversation_publish_answer: 'S4-PUBLICATION',
    conversation_source_out: 'S4-SOURCE',
  }
  const marker = markers[identity.proname]
  if (marker) {
    const pattern = new RegExp(
      String.raw`^[ \t]*-- CON-${marker}-BEGIN[^\n]*\n[\s\S]*?^[ \t]*-- CON-${marker}-END[^\n]*\n`,
      'm',
    )
    assert.match(body, pattern)
    body = body.replace(pattern, frozenCancellationUpdates[marker] ?? '')
  }
  return body
}

async function assertGoalOnlyErrors(urls: TestDatabase) {
  const c = new pg.Client({ connectionString: urls.ownerUrl })
  const runtimeApi = new pg.Pool({ connectionString: urls.apiUrl })
  await c.connect()
  try {
    const project = await seedProject(urls.ownerUrl, { admin: A })
    const rt = await registerRuntime(urls.ownerUrl, { projectId: project.projectId, admin: A })
    const hash = createHash('sha256').update(rt.token).digest()
    const bridge = randomUUID()
    await runtimeApi.query('SELECT sophia.runtime_hello($1,$2,$3,$4)', [
      hash,
      rt.runtimeUnitId,
      bridge,
      { protocolVersion: 1 },
    ])
    const attempt = randomUUID()
    await c.query(
      `INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,state)
      VALUES($1,$2,$3,1,1,'running')`,
      [project.projectId, attempt, project.goalId],
    )
    await c.query(
      `INSERT INTO sophia.execution_bindings(project_id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
      SELECT project_id,$2,resource_id,'goal-only-session',runtime_unit_id,'native_goal','running'
      FROM sophia.runtime_instances WHERE id=$1`,
      [rt.runtimeId, attempt],
    )
    const owned = {
      runtimeUnitId: rt.runtimeUnitId,
      attemptId: attempt,
      nativeSessionId: 'goal-only-session',
      nativeSeq: 1,
      type: 'assistant/message',
      data: { inputTokens: 'bad' },
    }
    if (urls === db) {
      await c.query("SELECT sophia.set_conversation_settings($1,'enabled','unrelated-reply-fixture')", [
        project.projectId,
      ])
      const unrelated = await withActor(runtimeApi, A, 'write', (connection) =>
        startConversation(
          connection,
          project.projectId,
          randomUUID(),
          { title: 'Unrelated conversation', text: 'Unrelated input', askSophia: true },
          'A',
        ),
      )
      assert.ok(unrelated.replyId)
      await c.query(
        `INSERT INTO sophia.work_attempts(project_id,conversation_reply_id,authority_epoch,state)
        VALUES($1,$2,1,'admitted')`,
        [project.projectId, unrelated.replyId],
      )
    }
    await assert.rejects(
      runtimeApi.query('SELECT sophia.runtime_record_observations($1,$2,$3,$4)', [
        hash,
        rt.runtimeUnitId,
        bridge,
        JSON.stringify([owned, { ...owned, nativeSeq: 2, runtimeUnitId: 'wrong' }]),
      ]),
      denied('22P02'),
    )
    for (const malformed of ['a'.repeat(36), '-'.repeat(36)]) {
      await assert.rejects(
        runtimeApi.query('SELECT sophia.runtime_record_observations($1,$2,$3,$4)', [
          hash,
          rt.runtimeUnitId,
          bridge,
          JSON.stringify([{ ...owned, attemptId: malformed, data: {} }]),
        ]),
        denied('42501'),
      )
    }
  } finally {
    await runtimeApi.end()
    await c.end()
  }
}

/**
 * What 0067 (FND-B2 provenance, A35) adds after 0064's promotion, set aside when the promotion is compared with the sealed
 * candidates: its own table, the grants' pinned execution, its guard, and the approvals' widened use (now including
 * pin_execution). 0067's own tests cover them.
 */
const LATER_0067 = {
  relations: ['conversation_dispatch_provenance'],
  columns: [
    'conversation_grants.execution',
    'conversation_grants.executor_artifact_digest',
    'conversation_grants.execution_pinned_at',
  ],
  constraints: [
    'conversation_grants.conversation_grants_execution_check',
    'conversation_grants.conversation_grants_executor_artifact_digest_check',
    'conversation_grants.conversation_grants_execution_pinned',
    'conversation_grant_approvals.conversation_grant_approvals_used_by_check',
  ],
  triggers: ['conversation_grants.conversation_grants_execution_kept'],
}
const notLater = (kind: 'columns' | 'constraints' | 'triggers', name: string) => (row: Record<string, unknown>) =>
  !LATER_0067[kind].includes(`${String(row.relname)}.${String(row[name])}`)

async function promotedRelations(c: pg.Client) {
  const selected = `n.nspname='sophia' AND t.relname LIKE 'conversation_%'
    AND t.relname NOT IN ('conversation_executions','conversation_cancellations',${LATER_0067.relations.map((r) => `'${r}'`).join(',')})`
  const result: Record<string, unknown> = {}
  result.constraints = (
    await c.query(`SELECT t.relname,k.conname,k.contype,k.convalidated,
    pg_get_constraintdef(k.oid,true) AS definition FROM pg_constraint k
    JOIN pg_class t ON t.oid=k.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE ${selected} ORDER BY t.relname,k.conname`)
  ).rows.filter(notLater('constraints', 'conname'))
  result.columns = (
    await c.query(`SELECT t.relname,a.attname,a.attnum,a.atttypid::regtype::text AS type,
    a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default FROM pg_attribute a
    JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE ${selected} AND t.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY t.relname,a.attnum`)
  ).rows.filter(notLater('columns', 'attname'))
  result.triggers = (
    await c.query(`SELECT t.relname,g.tgname,pg_get_triggerdef(g.oid,true) AS definition
    FROM pg_trigger g JOIN pg_class t ON t.oid=g.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE ${selected} AND NOT g.tgisinternal ORDER BY t.relname,g.tgname`)
  ).rows.filter(notLater('triggers', 'tgname'))
  result.indexes = (
    await c.query(`SELECT t.relname,i.relname AS name,pg_get_indexdef(k.indexrelid) AS definition
    FROM pg_index k JOIN pg_class t ON t.oid=k.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_class i ON i.oid=k.indexrelid WHERE ${selected} ORDER BY t.relname,i.relname`)
  ).rows
  result.rls = (
    await c.query(`SELECT t.relname,t.relrowsecurity,t.relforcerowsecurity FROM pg_class t
    JOIN pg_namespace n ON n.oid=t.relnamespace WHERE ${selected} AND t.relkind='r' ORDER BY t.relname`)
  ).rows
  return result
}

const candidateSeals = [
  ['con01-s1-reply-states.sql', 'bf2ce1908bf3cac25c9de094a7c74708c828f76a233ba373a84808f93f70d817'],
  ['con01-s2-conversation-reply-ledger.sql', 'e136626d20fdb85b4f375d54d8e27b5d4a5362e3baeab498fca0597bc92a4316'],
  // Current Q13 candidate supplies the same table DDL; its extra role/read policies are not promoted or compared here.
  // Resealed for the FND-B1 amendment (actor_label in the assembler's read helpers; members named by actor_label).
  ['con01-s3-conversation-reply-context.sql', '09da4ac3cc80b6971af26425557ac364b305e126f316e42284359c7afe37955d'],
  ['con01-s4-reply-fences.sql', 'ba32e07294d0e2908b06ba2887c207d8811625a2ea5e361c62ca90c4d34e47b8'],
] as const

async function applySealedCandidates(c: pg.Client) {
  for (const [name, sha] of candidateSeals) {
    const raw = readFileSync(new URL(`../../../db/candidates/${name}`, import.meta.url))
    assert.equal(createHash('sha256').update(raw).digest('hex'), sha, name)
    await c.query(raw.toString('utf8'))
  }
}

describe('CON migration preservation (real PostgreSQL)', () => {
  it('adds no cluster role or inherited/assumable membership when 0064 is actually applied', async () => {
    const baseline = await createConversationCandidateDatabase()
    const c = new pg.Client({ connectionString: baseline.ownerUrl })
    await c.connect()
    const snapshot = async () => ({
      roles: (
        await c.query(`SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
        rolreplication,rolbypassrls FROM pg_roles ORDER BY rolname`)
      ).rows,
      memberships: (
        await c.query(`SELECT to_jsonb(m) AS membership FROM pg_auth_members m
        ORDER BY to_jsonb(m)::text`)
      ).rows,
    })
    try {
      // Observe this migration's own catalog effects, without racing unrelated test-login creation/removal.
      const migration = readFileSync(
        new URL('../../../db/migrations/0064_conversation_runtime.sql', import.meta.url),
        'utf8',
      )
      assert.match(migration, /^BEGIN;$/mu)
      assert.match(migration, /\nCOMMIT;\s*$/u)
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
      const prior = await snapshot()
      await c.query(migration.replace(/^BEGIN;$/mu, '').replace(/\nCOMMIT;\s*$/u, ''))
      assert.deepEqual(await snapshot(), prior)
    } finally {
      await c.query('ROLLBACK')
      await c.end()
      await baseline.drop()
    }
  })

  it('preserves promoted columns, constraints, indexes, triggers and RLS against the sealed candidate tables', async () => {
    const baseline = await createConversationCandidateDatabase()
    const c = new pg.Client({ connectionString: baseline.ownerUrl })
    await c.connect()
    try {
      // Q13 forbids adopting the installed role's authority in another database: this cluster's role (0070, with this
      // file's synthetic login) is parked under a test-only name, and the sealed candidate creates a fresh bare role,
      // all in one transaction rolled back before the case ends (the pattern of conversation-fences.db.test.ts).
      await withClusterMigrationLock(async () => {
        await c.query('BEGIN')
        try {
          await c.query('ALTER ROLE sophia_conversation_assembler RENAME TO con01_runtime_installed')
          await applySealedCandidates(c)
          assert.deepEqual(await promotedRelations(owner), await promotedRelations(c))
        } finally {
          await c.query('ROLLBACK')
        }
      })
    } finally {
      await c.end()
      await baseline.drop()
    }
  })

  it('validates every new CHECK and rejects both goal-owned retire forms after migration', async () => {
    const s = await nativeScene()
    const goal = (await owner.query<{ id: string }>('SELECT id FROM sophia.goals WHERE project_id=$1', [s.projectId]))
      .rows[0]
    assert.ok(goal)
    const commandId = randomUUID()
    await owner.query(
      `INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,kind,idempotency_key,semantic_request,state)
      VALUES($1,$2,$3,$4,'stop','retire-check','{}','admitted')`,
      [s.projectId, commandId, A, goal.id],
    )
    for (const cleanup of [false, true]) {
      await assert.rejects(
        owner.query(
          `INSERT INTO sophia.outbox(project_id,command_id,goal_id,destination,destination_key,authority_epoch,cleanup)
        VALUES($1,$2,$3,'native.retire',$4,1,$5)`,
          [s.projectId, commandId, goal.id, `retire-check-${String(cleanup)}`, cleanup],
        ),
        (error: unknown) =>
          error instanceof pg.DatabaseError &&
          error.code === '23514' &&
          error.constraint === 'outbox_retire_reply_only',
      )
    }
    assert.equal(
      (
        await owner.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE contype='c' AND NOT convalidated
      AND conrelid IN ('sophia.outbox'::regclass,'sophia.work_attempts'::regclass,'sophia.execution_bindings'::regclass,
        'sophia.runtime_commands'::regclass,'sophia.conversation_executions'::regclass,'sophia.conversation_cancellations'::regclass)`)
      ).rows[0]?.n,
      0,
    )
  })

  for (const cleanup of [false, true]) {
    it(`refuses an existing goal-owned retire (cleanup=${String(cleanup)}) before any DDL or row changes`, async () => {
      const baseline = await createConversationCandidateDatabase()
      const c = new pg.Client({ connectionString: baseline.ownerUrl })
      await c.connect()
      try {
        const p = await seedProject(baseline.ownerUrl, { admin: A })
        const commandId = randomUUID()
        await c.query(
          `INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,kind,idempotency_key,semantic_request,state)
          VALUES($1,$2,$3,$4,'stop','preflight-retire','{}','admitted')`,
          [p.projectId, commandId, A, p.goalId],
        )
        await c.query(
          `INSERT INTO sophia.outbox(project_id,command_id,goal_id,destination,destination_key,authority_epoch,cleanup)
          VALUES($1,$2,$3,'native.retire','preflight-retire',1,$4)`,
          [p.projectId, commandId, p.goalId, cleanup],
        )
        const snapshot = await databaseSnapshot(c)
        const migration = readFileSync(
          new URL('../../../db/migrations/0064_conversation_runtime.sql', import.meta.url),
          'utf8',
        )
        await assert.rejects(c.query(migration), denied('23514'))
        await c.query('ROLLBACK')
        assert.deepEqual(await databaseSnapshot(c), snapshot)
        assert.equal(
          (await c.query("SELECT to_regclass('sophia.conversation_executions') AS name")).rows[0]?.name,
          null,
        )
      } finally {
        await c.end()
        await baseline.drop()
      }
    })
  }

  it('promotes every frozen function unchanged except the three approved cancelling UPDATEs', async () => {
    const functions = await functionIdentities(owner, Object.keys(frozenFunctions))
    const currentUser = (await owner.query<{ name: string }>('SELECT current_user AS name')).rows[0]?.name
    assert.equal(functions.length, Object.keys(frozenFunctions).length)
    for (const identity of functions) {
      const frozen = frozenFunctions[identity.proname]
      assert.ok(frozen)
      assert.equal(createHash('sha256').update(restoredFrozenBody(identity)).digest('hex'), frozen[0], identity.proname)
      assert.equal(identity.secdef, frozen[1], identity.proname)
      assert.deepEqual(identity.config, [`search_path=${frozen[2]}`], identity.proname)
      assert.equal(identity.owner, currentUser, identity.proname)
      // 0070 grants the assembler exactly the five entry points and the two claim-bound helpers; nothing else.
      const assembler = ASSEMBLER_EXECUTES.has(identity.proname)
        ? [`sophia_conversation_assembler=X/${currentUser}`]
        : []
      assert.deepEqual(identity.acl, [`${currentUser}=X/${currentUser}`, ...assembler], identity.proname)
    }
  })

  it('preserves the original first error for a goal-only observation batch', async () => {
    const baseline = await createConversationCandidateDatabase()
    try {
      for (const urls of [baseline, db]) {
        await assertGoalOnlyErrors(urls)
      }
    } finally {
      await baseline.drop()
    }
  })

  it('keeps all seven shared definitions byte-identical outside their named insertions, including ACL/security/config/owner', async () => {
    const baseline = await createConversationCandidateDatabase()
    const c = new pg.Client({ connectionString: baseline.ownerUrl })
    await c.connect()
    try {
      const prior = await functionIdentities(c, Object.keys(sharedInsertions))
      const current = await functionIdentities(owner, Object.keys(sharedInsertions))
      assert.equal(prior.length, 7)
      assert.deepEqual(
        current.map(restoredShared),
        prior.map((row) => ({ ...row, body: undefined })),
      )
    } finally {
      await c.end()
      await baseline.drop()
    }
  })
})

/** Each closure crosses the exported wrapper under the real non-owner API login. */
async function wrapperCalls(rt: RuntimeSetup, s: NativeScene) {
  const body = await request(s)
  const who = { tokenSha256: rt.hash, runtimeUnitId: rt.runtimeUnitId, bridgeInstanceId: rt.bridge }
  return {
    claim: () => withService(api, (c) => runtimeConversationClaim(c, who, body)),
    go: () => withService(api, (c) => runtimeConversationGo(c, who, body)),
    reserve: () =>
      withService(api, (c) =>
        runtimeConversationReserve(c, who, {
          ...body,
          ordinal: 1,
          call: {
            routeId: 'route-test',
            credentialRef: 'synthetic-credential-ref',
            ownerResourceRef: 'synthetic-owner-resource-ref',
            unit: 'calls_tokens',
            tokens: 100,
            priceMicros: 0,
          },
        }),
      ),
    settle: () =>
      withService(api, (c) =>
        runtimeConversationSettle(c, who, {
          ...body,
          ordinal: 1,
          used: { calls: 1, tokens: 10, priceMicros: 0 },
        }),
      ),
    acknowledged: () =>
      withService(api, (c) =>
        runtimeConversationAcknowledged(c, who, {
          ...body,
          keys: { observations: [], usage: [], ordinals: [1], hasTurnEnd: false },
        }),
      ),
  }
}

const wrappedDenial = (sqlstate: string) => (error: unknown) =>
  error instanceof DomainError && error.cause instanceof pg.DatabaseError && error.cause.code === sqlstate

describe('CON runtime persistence wrappers (L1 actual API login; no model)', () => {
  it('crosses all five entry points and preserves the durable reservation receipt on replay', async () => {
    const s = await nativeScene()
    await dispatch(s)
    const calls = await wrapperCalls(s.rt, s)
    assert.deepEqual(await calls.claim(), { result: 'first' })
    assert.deepEqual(await calls.go(), { result: 'go' })
    const reserved = await calls.reserve()
    assert.equal(reserved.state, 'reserved')
    assert.deepEqual(await calls.reserve(), reserved)
    const settled = await calls.settle()
    assert.equal(settled.state, 'settled')
    assert.deepEqual(await calls.settle(), settled)
    const ack = await calls.acknowledged()
    assert.equal(ack.predicates.reservations.met, true)
    assert.equal(ack.predicates.terminalState.met, false)
  })

  for (const operation of ['claim', 'go', 'reserve', 'settle', 'acknowledged'] as const) {
    it(`wrapper ${operation} denies another unit's attempt and the old lease after a newer hello`, async () => {
      const s = await nativeScene()
      const other = await nativeScene(await runtimeProject('con01-synthetic-other-unit'))
      assert.notEqual(s.rt.runtimeUnitId, other.rt.runtimeUnitId)
      await dispatch(s)
      await dispatch(other)
      const otherRequest = { ...other, rt: { ...other.rt, bridge: s.rt.bridge } }
      await assert.rejects((await wrapperCalls(s.rt, otherRequest))[operation](), wrappedDenial('42501'))
      const calls = await wrapperCalls(s.rt, s)
      await call({ ...s.rt, bridge: randomUUID() }, 'hello', { protocolVersion: 1 })
      await assert.rejects(calls[operation](), wrappedDenial('40001'))
    })
  }
})

describe('closed reply projection intake', () => {
  it('refuses raw/unlisted reply payloads before storage and accepts the bounded projection', async () => {
    const s = await nativeScene()
    await go(s)
    const valid = { ...observation(s, 991, 'user/message', { id: 'synthetic-user', length: 1 }), durable: true }
    const bad = [
      { ...valid, data: { id: 'synthetic-user', length: 1, text: 'SYNTHETIC PRIVATE CANARY' } },
      { ...valid, type: 'system/message', data: { text: 'SYNTHETIC PRIVATE CANARY' } },
      { ...valid, type: 'turn/start', data: { prompt: 'SYNTHETIC PRIVATE CANARY' } },
      { ...valid, data: { id: 42, length: 1 } },
      { ...valid, data: { id: 'synthetic-user', length: -1 } },
      { ...valid, extra: 'SYNTHETIC PRIVATE CANARY' },
      { ...valid, durable: false },
    ]
    for (const value of bad) {
      await assert.rejects(call(s.rt, 'record_observations', [value]), { code: '22023' })
      assert.equal(
        (
          await owner.query('SELECT count(*)::int AS n FROM sophia.native_observations WHERE binding_id=$1', [
            s.binding_id,
          ])
        ).rows[0]?.n,
        0,
      )
    }
    assert.equal(await call(s.rt, 'record_observations', [valid]), 1)
    assert.deepEqual(
      (await owner.query('SELECT data FROM sophia.native_observations WHERE binding_id=$1', [s.binding_id])).rows[0]
        ?.data,
      valid.data,
    )
  })
})

async function projectionSnapshot(s: NativeScene): Promise<unknown> {
  return (
    await owner.query<{ v: unknown }>(
      `SELECT jsonb_build_object(
   'observations',(SELECT count(*) FROM sophia.native_observations WHERE binding_id=$1),
   'usage',(SELECT count(*) FROM sophia.usage_records WHERE attempt_id=$2),
   'messages',(SELECT count(*) FROM sophia.conversation_messages WHERE conversation_id=$3),
   'reply',(SELECT to_jsonb(r) FROM sophia.conversation_replies r WHERE id=$4),
   'grant',(SELECT jsonb_agg(to_jsonb(g)) FROM sophia.conversation_grants g WHERE project_id=$5)) AS v`,
      [s.binding_id, s.attempt_id, s.conversationId, s.replyId, s.projectId],
    )
  ).rows[0]?.v
}

describe('closed reply projection value boundaries', () => {
  it('enforces UTF16 label limits, safe integer counts and exact required fields without partial effects', async () => {
    const s = await nativeScene()
    await go(s)
    const base = {
      text: 'ok',
      length: 2,
      oversize: false,
      invalidText: false,
      interrupted: false,
      provider: 'synthetic',
      model: 'synthetic',
      inputTokens: 1,
      outputTokens: 2,
      ordinal: 1,
    }
    const invalid = [
      { provider: 'x'.repeat(201) },
      { model: '😀'.repeat(101) },
      { provider: { text: 'PRIVATE' } },
      { inputTokens: Number.MAX_SAFE_INTEGER + 1 },
      { outputTokens: 0.5 },
      { inputTokens: -1 },
      { length: null },
      { cacheReadTokens: '1' },
      { ordinal: 0 },
      { ordinal: 1.5 },
      { interrupted: 'false' },
      { oversize: null },
      { text: null },
      { length: 3 },
      { privateExtra: 'PRIVATE' },
      { text: 'x'.repeat(16001), length: 16001 },
    ]
    const beforeSnapshot = await projectionSnapshot(s)
    for (const override of invalid) {
      await assert.rejects(
        call(s.rt, 'record_observations', [
          { ...observation(s, 1001, 'assistant/message', base), data: { ...base, ...override } },
        ]),
        { code: '22023' },
      )
      assert.deepEqual(await projectionSnapshot(s), beforeSnapshot)
    }
    const missing = { ...base }
    Reflect.deleteProperty(missing, 'provider')
    await assert.rejects(
      call(s.rt, 'record_observations', [{ ...observation(s, 1001, 'assistant/message', base), data: missing }]),
      { code: '22023' },
    )
    assert.deepEqual(await projectionSnapshot(s), beforeSnapshot)
    for (const [i, override] of [
      { provider: 'x'.repeat(200), model: '😀'.repeat(100), inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0 },
      { provider: null, model: null, inputTokens: null, outputTokens: null, cacheReadTokens: null },
    ].entries()) {
      assert.equal(
        await call(s.rt, 'record_observations', [
          observation(s, 1001 + i, 'assistant/message', { ...base, ...override }),
        ]),
        1,
      )
    }
    assert.equal((await reply(s))?.answer_id, null, 'an observation alone never publishes an answer')
  })

  it('rejects hidden compaction and turn content, missing envelopes and invalid ordinals with no effects', async () => {
    const s = await nativeScene()
    await go(s)
    const summary = {
      compactionId: 'synthetic',
      provider: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      ordinal: 2,
    }
    const missingEnvelope = observation(s, 1101, 'turn/start', {})
    Reflect.deleteProperty(missingEnvelope, 'durable')
    const values = [
      missingEnvelope,
      observation(s, 1101, 'compaction/summary', { ...summary, summary: 'PRIVATE' }),
      observation(s, 1101, 'compaction/summary', { ...summary, ordinal: null }),
      observation(s, 1101, 'compaction/summary', { ...summary, compactionId: '😀'.repeat(101) }),
      observation(s, 1101, 'turn/end', { reason: { kind: 'completed', text: 'PRIVATE' } }),
      observation(s, 1101, 'turn/end', { reason: { kind: 'invented' } }),
    ]
    const beforeSnapshot = await projectionSnapshot(s)
    for (const value of values) {
      await assert.rejects(call(s.rt, 'record_observations', [value]), { code: '22023' })
      assert.deepEqual(await projectionSnapshot(s), beforeSnapshot)
    }
    assert.equal(await call(s.rt, 'record_observations', [observation(s, 1101, 'compaction/summary', summary)]), 1)
  })
})

describe('closed scrubbed reply projection recovery', () => {
  it('persists late usage once while keeping uncertain accounting and never publishing', async () => {
    const s = await nativeScene()
    await go(s)
    await call(s.rt, 'conversation_reserve', { ...(await request(s)), ordinal: 1, call: callBound })
    await receipt(s, 'create', 'outcome_unknown')
    const data = {
      scrubbed: true,
      provider: 'synthetic',
      model: 'synthetic',
      inputTokens: 10,
      outputTokens: 2,
      ordinal: 1,
      textLength: 6,
    }
    const beforeSnapshot = await projectionSnapshot(s)
    for (const override of [
      { text: 'PRIVATE' },
      { ordinal: null },
      { scrubbed: false },
      { cacheReadTokens: { text: 'PRIVATE' } },
    ]) {
      await assert.rejects(
        call(s.rt, 'record_observations', [
          { ...observation(s, 1, 'assistant/message', {}), data: { ...data, ...override } },
        ]),
        { code: '22023' },
      )
      assert.deepEqual(await projectionSnapshot(s), beforeSnapshot)
    }
    const grant = (
      await owner.query('SELECT to_jsonb(g) AS v FROM sophia.conversation_grants g WHERE project_id=$1', [s.projectId])
    ).rows
    const batch = [
      { ...observation(s, 1, 'assistant/message', {}), data },
      { ...observation(s, 2, 'turn/end', {}), data: { scrubbed: true } },
    ]
    assert.equal(await call(s.rt, 'record_observations', batch), 2)
    assert.equal(await call(s.rt, 'record_observations', batch), 0)
    assert.deepEqual(
      (
        await owner.query('SELECT to_jsonb(g) AS v FROM sophia.conversation_grants g WHERE project_id=$1', [
          s.projectId,
        ])
      ).rows,
      grant,
    )
    assert.deepEqual(
      (await owner.query('SELECT state FROM sophia.conversation_reservations WHERE reply_id=$1', [s.replyId])).rows,
      [{ state: 'uncertain' }],
    )
    assert.deepEqual(
      (
        await owner.query('SELECT input_tokens,output_tokens FROM sophia.usage_records WHERE attempt_id=$1', [
          s.attempt_id,
        ])
      ).rows,
      [{ input_tokens: '10', output_tokens: '2' }],
    )
    assert.deepEqual(await reply(s), { state: 'outcome_unknown', reason: 'runtime_outcome_unknown', answer_id: null })
    const keys = {
      observations: [1, 2].map((seq) => `${s.rt.runtimeUnitId}:${s.native_session_id}:${seq}`),
      usage: [{ providerCallId: `${s.native_session_id}#1`, ordinal: 1 }],
      ordinals: [1],
      hasTurnEnd: true,
    }
    const predicates = (await acknowledge(s, keys)).predicates
    assert.ok(Object.values(predicates).every((p) => p.met))
  })

  it('accepts a parent fence before database termination but cannot publish an earlier intact answer', async () => {
    const s = await nativeScene()
    await go(s)
    await call(s.rt, 'record_observations', [observation(s, 1, 'assistant/message', { text: 'MUST NOT PUBLISH' })])
    assert.equal(
      await call(s.rt, 'record_observations', [{ ...observation(s, 2, 'turn/end', {}), data: { scrubbed: true } }]),
      1,
    )
    assert.deepEqual(await reply(s), { state: 'failed', reason: 'turn_error', answer_id: null })
    assert.equal(
      JSON.stringify(
        (await owner.query('SELECT data FROM sophia.native_observations WHERE binding_id=$1', [s.binding_id])).rows,
      ).includes('MUST NOT PUBLISH'),
      false,
    )
  })
})

describe('trusted CON hello recovery metadata', () => {
  it('distinguishes predispatch, original create identity, cancellation epoch and replacement runtime authority', async () => {
    const s = await nativeScene()
    const hello = () =>
      call<{
        bindings: { attemptId: string; conversationReplyId?: string; authorityEpoch: number; create?: unknown }[]
      }>(s.rt, 'hello', {
        protocolVersion: 1,
        roles: [{ id: 'sophia-conversation-v1', route: 'route-test', presetDigest: 'synthetic' }],
      })
    const pending = (await hello()).bindings.find((b) => b.attemptId === s.attempt_id)
    assert.equal(pending?.conversationReplyId, s.replyId)
    assert.equal(pending?.create, null)
    await call(s.rt, 'record_ready', { state: 'ready', reason: null, unrecovered: [] })
    await go(s)
    const body = await request(s)
    const running = (await hello()).bindings.find((b) => b.attemptId === s.attempt_id)
    assert.deepEqual(running?.create, { state: 'current', commandId: body.commandId, authorityEpoch: 1 })
    await withActor(api, E, 'write', (c) => withdrawConversationMessage(c, s.conversationId, s.firstId, randomUUID()))
    const cancelled = (await hello()).bindings.find((b) => b.attemptId === s.attempt_id)
    assert.equal(cancelled?.authorityEpoch, 2)
    assert.deepEqual(cancelled?.create, running?.create)
    await assert.rejects(
      call(s.rt, 'conversation_acknowledged', {
        ...body,
        authorityEpoch: 2,
        keys: { observations: [], usage: [], ordinals: [], hasTurnEnd: false },
      }),
      { code: '42501' },
    )
    const acknowledged = (await acknowledge(s)).predicates
    assert.equal(Object.keys(acknowledged).length, 8)
    assert.equal(acknowledged.terminalState?.met, true)
    assert.equal(acknowledged.createAnswered?.met, false, 'metadata is not a terminal receipt or host cleanup proof')
    const rt = await registerRuntime(db.ownerUrl, {
      projectId: s.projectId,
      admin: A,
      runtimeUnitId: s.rt.runtimeUnitId,
    })
    const replacement = {
      ...rt,
      projectId: s.projectId,
      bridge: randomUUID(),
      hash: createHash('sha256').update(rt.token).digest(),
    }
    assert.notEqual(replacement.runtimeId, s.rt.runtimeId)
    const changed = await call<{ bindings: { attemptId: string; create: unknown }[] }>(replacement, 'hello', {
      protocolVersion: 1,
    })
    assert.deepEqual(changed.bindings.find((b) => b.attemptId === s.attempt_id)?.create, {
      state: 'unresolved',
      reason: 'different_runtime',
    })
    await assert.rejects(
      call(replacement, 'conversation_acknowledged', {
        ...body,
        leaseId: replacement.bridge,
        keys: { observations: [], usage: [], ordinals: [], hasTurnEnd: false },
      }),
      { code: '42501' },
    )
  })
})

describe('CON partial and unknown usage correlation', () => {
  for (const sample of [
    { label: 'full output-only', type: 'assistant/message', reduced: false, counts: { outputTokens: 2 } },
    { label: 'full cache-only', type: 'assistant/message', reduced: false, counts: { cacheReadTokens: 4 } },
    { label: 'reduced output-only', type: 'compaction/summary', reduced: true, counts: { outputTokens: 3 } },
    { label: 'reduced cache-only', type: 'compaction/summary', reduced: true, counts: { cacheWriteTokens: 5 } },
    { label: 'reduced all-unknown', type: 'assistant/message', reduced: true, counts: {} },
  ]) {
    it(`persists ${sample.label} once without inventing zeros or settling uncertain allowance`, async () => {
      const s = await nativeScene()
      await go(s)
      await call(s.rt, 'conversation_reserve', { ...(await request(s)), ordinal: 1, call: callBound })
      if (sample.reduced) await receipt(s, 'create', 'outcome_unknown')
      const grant = (
        await owner.query('SELECT to_jsonb(g) AS v FROM sophia.conversation_grants g WHERE project_id=$1', [
          s.projectId,
        ])
      ).rows
      const data = sample.reduced
        ? { scrubbed: true, ordinal: 1, textLength: 9, ...sample.counts }
        : projectedFixture('assistant/message', { text: 'synthetic', ...sample.counts })
      const item = { ...observation(s, 1, sample.type, {}), data }
      assert.equal(await call(s.rt, 'record_observations', [item]), 1)
      assert.equal(await call(s.rt, 'record_observations', [item]), 0)
      const rows = (
        await owner.query(
          'SELECT input_tokens,output_tokens,cache_read_tokens,cache_write_tokens FROM sophia.usage_records WHERE attempt_id=$1',
          [s.attempt_id],
        )
      ).rows
      assert.deepEqual(rows, [
        {
          input_tokens: null,
          output_tokens: 'outputTokens' in sample.counts ? String(sample.counts.outputTokens) : null,
          cache_read_tokens: 'cacheReadTokens' in sample.counts ? String(sample.counts.cacheReadTokens) : null,
          cache_write_tokens: 'cacheWriteTokens' in sample.counts ? String(sample.counts.cacheWriteTokens) : null,
        },
      ])
      assert.deepEqual(
        (
          await owner.query('SELECT to_jsonb(g) AS v FROM sophia.conversation_grants g WHERE project_id=$1', [
            s.projectId,
          ])
        ).rows,
        grant,
      )
      assert.deepEqual(
        (await owner.query('SELECT state FROM sophia.conversation_reservations WHERE reply_id=$1', [s.replyId])).rows,
        [{ state: sample.reduced ? 'uncertain' : 'reserved' }],
      )
      const ack = await acknowledge(s, {
        observations: [`${s.rt.runtimeUnitId}:${s.native_session_id}:1`],
        usage: [{ providerCallId: `${s.native_session_id}#1`, ordinal: 1 }],
        ordinals: [1],
        hasTurnEnd: false,
      })
      assert.equal(ack.predicates.usage?.met, true)
      assert.equal(ack.predicates.reservations?.met, sample.reduced)
      assert.equal((await reply(s))?.answer_id, null)
    })
  }
})

async function ownedHelloCreate(s: NativeScene): Promise<unknown> {
  await owner.query('SET LOCAL ROLE sophia_api')
  const value = (
    await owner.query<{ v: { bindings: { attemptId: string; create?: unknown }[] } }>(
      'SELECT sophia.runtime_hello($1,$2,$3,$4::jsonb) AS v',
      [s.rt.hash, s.rt.runtimeUnitId, s.rt.bridge, JSON.stringify({ protocolVersion: 1 })],
    )
  ).rows[0]?.v
  await owner.query('RESET ROLE')
  return value?.bindings.find((b) => b.attemptId === s.attempt_id)?.create
}

describe('trusted CON hello contradictory predispatch evidence', () => {
  it('reports reservations, non-create commands and invalid original commands as unresolved under the API role', async () => {
    const s = await nativeScene()
    for (const evidence of ['reserved', 'uncertain', 'non-create', 'acknowledged', 'wrong-actor', 'wrong-semantic']) {
      await owner.query('BEGIN')
      try {
        if (evidence === 'reserved' || evidence === 'uncertain') {
          await owner.query(
            `INSERT INTO sophia.conversation_reply_allowances(project_id,reply_id,lineage_id,unit)
            SELECT project_id,$2,lineage_id,unit FROM sophia.conversation_grants WHERE project_id=$1 AND current`,
            [s.projectId, s.replyId],
          )
          await owner.query(
            `INSERT INTO sophia.conversation_reservations(project_id,reply_id,call_ordinal,lineage_id,grant_revision,unit,route_id,credential_ref,owner_resource_ref,amount_tokens,amount_price_micros,state)
            SELECT a.project_id,a.reply_id,1,a.lineage_id,g.grant_revision,a.unit,g.route_id,g.credential_ref,g.owner_resource_ref,100,0,$3
            FROM sophia.conversation_reply_allowances a JOIN sophia.conversation_grants g USING(project_id,lineage_id)
            WHERE a.project_id=$1 AND a.reply_id=$2`,
            [s.projectId, s.replyId, evidence],
          )
        } else if (evidence === 'non-create') {
          await owner.query(
            `INSERT INTO sophia.runtime_commands(project_id,runtime_id,seq,outbox_id,command_id,binding_id,attempt_id,kind,authority_epoch,body)
            SELECT o.project_id,$3,1,o.id,o.command_id,o.binding_id,b.attempt_id,'inspect',o.authority_epoch,'{}'
            FROM sophia.outbox o JOIN sophia.execution_bindings b ON b.project_id=o.project_id AND b.id=o.binding_id
            WHERE o.project_id=$1 AND o.conversation_reply_id=$2 AND o.destination='native.create'`,
            [s.projectId, s.replyId, s.rt.runtimeId],
          )
        } else if (evidence === 'acknowledged') {
          await owner.query(
            "UPDATE sophia.outbox SET state='acknowledged' WHERE project_id=$1 AND conversation_reply_id=$2 AND destination='native.create'",
            [s.projectId, s.replyId],
          )
        } else if (evidence === 'wrong-actor') {
          await owner.query(
            'UPDATE sophia.commands SET actor_id=$3 WHERE project_id=$1 AND id IN (SELECT command_id FROM sophia.outbox WHERE project_id=$1 AND conversation_reply_id=$2)',
            [s.projectId, s.replyId, A],
          )
        } else {
          await owner.query(
            "UPDATE sophia.commands SET semantic_request=jsonb_set(semantic_request,'{replyId}',to_jsonb($3::text)) WHERE project_id=$1 AND id IN (SELECT command_id FROM sophia.outbox WHERE project_id=$1 AND conversation_reply_id=$2)",
            [s.projectId, s.replyId, randomUUID()],
          )
        }
        assert.deepEqual(await ownedHelloCreate(s), { state: 'unresolved', reason: 'correlation_invalid' }, evidence)
      } finally {
        await owner.query('ROLLBACK')
      }
    }
    await owner.query('BEGIN')
    try {
      assert.equal(await ownedHelloCreate(s), null)
    } finally {
      await owner.query('ROLLBACK')
    }
  })
})

// --- 0067 / A35: a reply attempt's original execution, kept as dispatched (FND-B2, V's provenance disposition) -------

const ARTIFACT = 'a'.repeat(64)
const OTHER_ARTIFACT = 'b'.repeat(64)
const SERVICE = { execution: 'service', routeId: 'route-test', executorArtifactDigest: ARTIFACT }

async function lineageOf(projectId: string) {
  const row = (
    await owner.query<{ lineage_id: string }>(
      'SELECT lineage_id FROM sophia.conversation_grants WHERE project_id=$1 AND current',
      [projectId],
    )
  ).rows[0]
  assert.ok(row)
  return row.lineage_id
}

const pin = async (projectId: string, spec: Record<string, unknown> = {}) =>
  owner.query('SELECT sophia.conversation_pin_execution($1,$2::jsonb)', [
    projectId,
    { lineageId: await lineageOf(projectId), approvalRef: `pin-${randomUUID()}`, ...SERVICE, ...spec },
  ])

/**
 * The runtime's hello and ready again, its conversation role naming `executor` (A40): a pinned service grant is bound
 * and dispatched only to a runtime advertising its exact tuple.
 */
async function advertise(rt: RuntimeSetup, executor: unknown) {
  await call(rt, 'hello', {
    protocolVersion: 1,
    roles: [{ id: 'sophia-conversation-v1', route: 'route-test', presetDigest: 'synthetic', executor }],
  })
  await call(rt, 'record_ready', { state: 'ready', reason: null, unrecovered: [] })
}

async function serviceScene() {
  const rt = await runtimeProject()
  await advertise(rt, SERVICE)
  await pin(rt.projectId)
  return nativeScene(rt)
}

async function provenanceOf(s: NativeScene) {
  return (
    await owner.query<Record<string, unknown>>(
      `SELECT execution,route_id,executor_artifact_digest,runtime_command_id,lineage_id FROM sophia.conversation_dispatch_provenance
        WHERE project_id=$1 AND attempt_id=$2`,
      [s.projectId, s.attempt_id],
    )
  ).rows[0]
}

/** A reply ended before it ran, its create scrubbed, and its retire dispatched to the runtime. */
async function toRetire(s: NativeScene) {
  assert.equal((await dispatch(s))?.result, 'dispatched')
  await receipt(s, 'create', 'failed')
  assert.equal((await dispatch(s, 'native.retire'))?.result, 'dispatched')
}

async function retireReceipt(s: NativeScene, executor?: unknown) {
  const c = await command(s, 'retire')
  return call<number>(s.rt, 'record_receipts', [
    {
      commandId: c.id,
      attemptId: s.attempt_id,
      nativeSessionId: s.native_session_id,
      stage: 'checked',
      observedAt: new Date().toISOString(),
      ...(executor === undefined ? {} : { executor }),
    },
  ])
}

const bindingState = async (s: NativeScene) =>
  (await owner.query<{ state: string }>('SELECT state FROM sophia.execution_bindings WHERE id=$1', [s.binding_id]))
    .rows[0]?.state

async function helloBinding(s: NativeScene) {
  const hello = await call<{ bindings: Record<string, unknown>[] }>(s.rt, 'hello', {
    protocolVersion: 1,
    roles: [{ id: 'sophia-conversation-v1', route: 'route-test', presetDigest: 'synthetic' }],
  })
  return hello.bindings.find((b) => b.attemptId === s.attempt_id)
}

/** Whether `p` settles within `ms`: a transaction waiting on a lock does not. */
const settledWithin = async (p: Promise<unknown>, ms: number) =>
  Promise.race([
    p.then(
      () => true,
      () => true,
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ])

describe('conversation execution provenance (0067, A35)', () => {
  it('pins a lineage to service once, before it dispatches; the tuple and a service route never change after', async () => {
    const rt = await runtimeProject()
    await assert.rejects(
      api.query('SELECT sophia.conversation_pin_execution($1,$2::jsonb)', [rt.projectId, {}]),
      denied('42501'),
    )
    await assert.rejects(pin(rt.projectId, { executorArtifactDigest: 'short' }), denied('22023'))
    await assert.rejects(pin(rt.projectId, { routeId: 'another-route' }), denied('22023'))
    await assert.rejects(
      owner.query(
        "UPDATE sophia.conversation_grants SET execution='service',executor_artifact_digest=$2,execution_pinned_at=now() WHERE project_id=$1",
        [rt.projectId, ARTIFACT],
      ),
      denied('42501'),
      'only the pin function pins',
    )
    const approvalRef = `pin-${randomUUID()}`
    await pin(rt.projectId, { approvalRef })
    await pin(rt.projectId, { approvalRef }) // the same pin, replayed
    await assert.rejects(pin(rt.projectId, { executorArtifactDigest: OTHER_ARTIFACT }), denied('55000'))
    await assert.rejects(
      owner.query('UPDATE sophia.conversation_grants SET executor_artifact_digest=$2 WHERE project_id=$1', [
        rt.projectId,
        OTHER_ARTIFACT,
      ]),
      denied('55000'),
    )
    await assert.rejects(
      owner.query('SELECT sophia.conversation_set_grant($1,$2::jsonb)', [rt.projectId, { routeId: 'another-route' }]),
      denied('55000'),
      'a service lineage keeps its route',
    )
    // A native lineage that has dispatched is not pinned afterwards.
    const native = await nativeScene()
    assert.equal((await dispatch(native))?.result, 'dispatched')
    await assert.rejects(pin(native.projectId), denied('55000'))
  })

  it('serializes a pin with a dispatch of its lineage, either way round (Codex P1 on #393)', async () => {
    // A pin first, uncommitted: the dispatch waits for it, then records the service tuple the lineage now has. The bound
    // runtime advertises that executor (A40), so only the pin decides the outcome.
    const first = await nativeScene()
    await advertise(first.rt, SERVICE)
    const pinning = new pg.Client({ connectionString: db.ownerUrl })
    await pinning.connect()
    try {
      await pinning.query('BEGIN')
      await pinning.query('SELECT sophia.conversation_pin_execution($1,$2::jsonb)', [
        first.projectId,
        { lineageId: await lineageOf(first.projectId), approvalRef: `pin-${randomUUID()}`, ...SERVICE },
      ])
      const dispatching = dispatch(first)
      assert.equal(await settledWithin(dispatching, 400), false, 'the dispatch waits for the pin')
      await pinning.query('COMMIT')
      assert.equal((await dispatching)?.result, 'dispatched')
      assert.equal((await provenanceOf(first))?.execution, 'service')
    } finally {
      await pinning.end()
    }
    // A dispatch first, uncommitted: the pin waits for it, then finds the lineage has dispatched.
    const second = await nativeScene()
    const lease = await dispatchLease(second)
    const dispatcher = await worker.connect()
    try {
      await dispatcher.query('BEGIN')
      await dispatcher.query('SELECT sophia.dispatch_runtime_outbox($1,$2,$3)', [
        second.projectId,
        lease.id,
        lease.lease,
      ])
      const pinned = pin(second.projectId)
      assert.equal(await settledWithin(pinned, 400), false, 'the pin waits for the dispatch')
      await dispatcher.query('COMMIT')
      await assert.rejects(pinned, denied('55000'))
      assert.equal((await provenanceOf(second))?.execution, 'native')
    } finally {
      dispatcher.release()
    }
  })

  it('copies the tuple at dispatch, before anything runs; a service create carries it, a native one does not', async () => {
    const s = await serviceScene()
    assert.equal(await provenanceOf(s), undefined, 'nothing before dispatch')
    assert.equal((await dispatch(s))?.result, 'dispatched')
    const c = await command(s)
    assert.deepEqual(await provenanceOf(s), {
      execution: 'service',
      route_id: 'route-test',
      executor_artifact_digest: ARTIFACT,
      runtime_command_id: c.id,
      lineage_id: await lineageOf(s.projectId),
    })
    const body = (await owner.query('SELECT body FROM sophia.runtime_commands WHERE id=$1', [c.id])).rows[0]?.body
    assert.deepEqual(body.payload.conversation.execution, SERVICE)
    const n = await nativeScene()
    assert.equal((await dispatch(n))?.result, 'dispatched')
    assert.deepEqual(
      { ...(await provenanceOf(n)), runtime_command_id: null, lineage_id: null },
      {
        execution: 'native',
        route_id: 'route-test',
        executor_artifact_digest: null,
        runtime_command_id: null,
        lineage_id: null,
      },
    )
    const nativeBody = (
      await owner.query('SELECT body FROM sophia.runtime_commands WHERE id=$1', [(await command(n)).id])
    ).rows[0]?.body
    assert.equal('execution' in nativeBody.payload.conversation, false)
  })

  it('is kept as dispatched: no update, delete or truncate, and no login reads or writes it', async () => {
    const s = await serviceScene()
    assert.equal((await dispatch(s))?.result, 'dispatched')
    const where = [s.projectId, s.attempt_id]
    await assert.rejects(
      owner.query(
        "UPDATE sophia.conversation_dispatch_provenance SET execution='native',executor_artifact_digest=NULL WHERE project_id=$1 AND attempt_id=$2",
        where,
      ),
      denied('55000'),
    )
    await assert.rejects(
      owner.query('DELETE FROM sophia.conversation_dispatch_provenance WHERE project_id=$1 AND attempt_id=$2', where),
      denied('55000'),
    )
    await owner.query('BEGIN')
    try {
      await assert.rejects(owner.query('TRUNCATE sophia.conversation_dispatch_provenance CASCADE'), denied('55000'))
    } finally {
      await owner.query('ROLLBACK')
    }
    for (const pool of [api, worker]) {
      await assert.rejects(pool.query('SELECT * FROM sophia.conversation_dispatch_provenance'), denied('42501'))
      await assert.rejects(
        pool.query(
          "INSERT INTO sophia.conversation_dispatch_provenance(project_id,attempt_id,reply_id,runtime_command_id,lineage_id,execution,route_id) VALUES($1,$2,$2,$2,$2,'native','route-test')",
          [s.projectId, randomUUID()],
        ),
        denied('42501'),
      )
    }
    assert.equal((await provenanceOf(s))?.execution, 'service')
  })

  it('survives the scrub of its create, and only a service attempt projects it in hello; grant changes never follow', async () => {
    const s = await serviceScene()
    await toRetire(s)
    const c = await command(s)
    const body = (await owner.query('SELECT body FROM sophia.runtime_commands WHERE id=$1', [c.id])).rows[0]?.body
    assert.deepEqual(body.payload, { scrubbed: true })
    assert.deepEqual((await helloBinding(s))?.provenance, SERVICE)
    // A new grant lineage (no outstanding reservation) with another route cannot reclassify the dispatched attempt.
    await owner.query('SELECT sophia.conversation_new_lineage($1,$2::jsonb)', [
      s.projectId,
      {
        unit: 'calls_tokens',
        routeId: 'route-other',
        credentialRef: 'synthetic-credential-ref',
        ownerResourceRef: 'synthetic-owner-resource-ref',
        approvalRef: `lineage-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        maxCallsPerReply: 1,
        totalCallCap: 1,
        replyTokenCap: 10,
        totalTokenCap: 10,
        subjects: [E],
      },
    ])
    assert.deepEqual((await helloBinding(s))?.provenance, SERVICE)
    const n = await nativeScene()
    await toRetire(n)
    assert.equal('provenance' in ((await helloBinding(n)) ?? {}), false)
  })

  it('retires a service attempt only on its exact service claim: omission, native, wrong route or digest refuse', async () => {
    const s = await serviceScene()
    await toRetire(s)
    for (const executor of [
      undefined,
      { execution: 'native' },
      { ...SERVICE, routeId: 'route-other' },
      { ...SERVICE, executorArtifactDigest: OTHER_ARTIFACT },
      { execution: 'service', routeId: 'route-test' },
      { ...SERVICE, extra: true },
    ]) {
      await assert.rejects(retireReceipt(s, executor), (e: unknown) => denied('42501')(e) || denied('22023')(e))
      assert.notEqual(await bindingState(s), 'retired', JSON.stringify(executor))
    }
    assert.equal(await retireReceipt(s, SERVICE), 1)
    assert.equal(await bindingState(s), 'retired')
    assert.equal(await retireReceipt(s, SERVICE), 0, 'the same receipt again changes nothing')
    await assert.rejects(retireReceipt(s, undefined), denied('42501'), 'a replay cannot drop its claim')
  })

  it('refuses a service claim for a native or unknown attempt, whose own cleanup is unchanged', async () => {
    const n = await nativeScene()
    await toRetire(n)
    await assert.rejects(retireReceipt(n, SERVICE), denied('42501'))
    assert.notEqual(await bindingState(n), 'retired')
    assert.equal(await retireReceipt(n), 1)
    assert.equal(await bindingState(n), 'retired')
    const k = await nativeScene()
    await toRetire(k)
    assert.equal(await retireReceipt(k, { execution: 'native' }), 1, 'a native claim on a native attempt')
    // A replay under the same command and stage keeps the claim it was recorded with.
    await assert.rejects(retireReceipt(k), denied('23505'))
    assert.equal(await retireReceipt(k, { execution: 'native' }), 0)
  })

  it('a service attempt with an uncertain reservation: no redispatch, retired with its cost unchanged', async () => {
    const s = await serviceScene()
    await go(s)
    await receipt(s, 'create', 'delivered')
    await call(s.rt, 'conversation_reserve', { ...(await request(s)), ordinal: 1, call: callBound })
    await receipt(s, 'create', 'outcome_unknown')
    assert.equal((await reply(s))?.state, 'outcome_unknown')
    const counted = await counters(s)
    const reservations = async () =>
      (
        await owner.query<{ call_ordinal: number; state: string; amount_tokens: string }>(
          'SELECT call_ordinal,state,amount_tokens FROM sophia.conversation_reservations WHERE reply_id=$1',
          [s.replyId],
        )
      ).rows
    const reserved = await reservations()
    assert.equal(reserved[0]?.state, 'uncertain')
    const creates = async () =>
      (
        await owner.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM sophia.runtime_commands WHERE project_id=$1 AND binding_id=$2 AND kind='create'",
          [s.projectId, s.binding_id],
        )
      ).rows[0]?.n
    assert.equal(await creates(), 1)
    assert.deepEqual((await helloBinding(s))?.provenance, SERVICE)
    assert.equal((await dispatch(s, 'native.retire'))?.result, 'dispatched')
    assert.equal(await retireReceipt(s, SERVICE), 1)
    assert.equal(await bindingState(s), 'retired')
    assert.deepEqual(await counters(s), counted, 'reserved, spent and uncertain counters unchanged')
    assert.deepEqual(await reservations(), reserved)
    assert.equal(await creates(), 1, 'nothing dispatched again')
  })
})
