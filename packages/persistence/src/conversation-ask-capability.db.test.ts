// 0089: the conversation list's Ask capability reads, without writing, whether conversation_ask (0071) would admit an
// ask by the caller now. Real API, owner and synthetic assembler logins on real PostgreSQL; the list is read through the
// API login's READ ONLY transaction (withActor), as the route reads it. No runtime process, model or provider: the
// runtime is a hello and ready through the API login's functions, and every grant is synthetic.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import { readConversationList, sendConversationMessage, startConversation, withActor } from './index.ts'

const A = randomUUID() // admin, outside the cohort
const E = randomUUID() // editor in the cohort
const F = randomUUID() // editor outside the cohort
const V = randomUUID() // viewer named in the cohort: still no writer
const O = randomUUID() // a member of another project only
const ROUTE = 'route-test'
const DIGEST = 'a'.repeat(64)
/** The one reason anyone outside the current cohort, or unable to write, is told (P's privacy decision). */
const GENERIC = 'replies_not_enabled'

interface World {
  db: TestDatabase
  owner: pg.Pool
  api: pg.Pool
}

async function open(assembler: boolean): Promise<World> {
  const db = await createTestDatabase(undefined, { assembler })
  return {
    db,
    owner: new pg.Pool({ connectionString: db.ownerUrl, max: 3 }),
    api: new pg.Pool({ connectionString: db.apiUrl, max: 3 }),
  }
}

async function close(w: World) {
  await Promise.all([w.owner.end(), w.api.end()])
  await w.db.drop()
}

const role = (executor?: unknown) => ({
  id: 'sophia-conversation-v1',
  route: ROUTE,
  presetDigest: 'synthetic',
  ...(executor === undefined ? {} : { executor }),
})
const service = (digest: string) => role({ execution: 'service', routeId: ROUTE, executorArtifactDigest: digest })

interface Setup {
  /** What the runtime's hello advertises; null registers no runtime. */
  roles?: unknown[] | null
  /** Pin the grant to the service executor with this digest. */
  pin?: string
  /** Make no grant. */
  grant?: boolean
}

/** A project with conversations on, (by default) a ready runtime with the conversation role, and a grant naming E and V. */
async function project(w: World, s: Setup = {}) {
  const { projectId } = await seedProject(w.db.ownerUrl, { admin: A, editors: [E, F], viewers: [V] })
  await w.owner.query("SELECT sophia.set_conversation_settings($1,'enabled','con-ask-capability-test')", [projectId])
  let runtime: { call: (op: string, body: unknown) => Promise<pg.QueryResult> } | null = null
  if (s.roles !== null) {
    const rt = await registerRuntime(w.db.ownerUrl, { projectId, admin: A, runtimeUnitId: 'sophia-runtime-test' })
    const hash = createHash('sha256').update(rt.token).digest()
    const bridge = randomUUID()
    const call = (op: string, body: unknown) =>
      w.api.query(`SELECT sophia.runtime_${op}($1,$2,$3,$4::jsonb) AS v`, [hash, rt.runtimeUnitId, bridge, body])
    await call('hello', { protocolVersion: 1, roles: s.roles ?? [role()] })
    await call('record_ready', { state: 'ready', reason: null, unrecovered: [] })
    runtime = { call }
  }
  if (s.grant !== false) {
    await w.owner.query('SELECT sophia.conversation_new_lineage($1,$2::jsonb)', [
      projectId,
      {
        unit: 'calls_tokens',
        routeId: ROUTE,
        credentialRef: 'synthetic-credential-ref',
        ownerResourceRef: 'synthetic-owner-resource-ref',
        approvalRef: `con-ask-capability-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        maxCallsPerReply: 2,
        totalCallCap: 10,
        replyTokenCap: 100_000,
        totalTokenCap: 500_000,
        subjects: [E, V],
      },
    ])
  }
  if (s.pin) {
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
        executorArtifactDigest: s.pin,
        approvalRef: `con-ask-capability-pin-${randomUUID()}`,
      },
    ])
  }
  return { projectId, runtime }
}

/** The list's capability, as the route reads it: the API login, the actor set, READ ONLY. */
const capability = async (w: World, actor: string, projectId: string) =>
  (await withActor(w.api, actor, 'read', (c) => readConversationList(c, projectId))).capability

/** The capability's answer alone. */
const ask = async (w: World, actor: string, projectId: string) => {
  const c = await capability(w, actor, projectId)
  return { ask: c.ask, askReason: c.askReason }
}
const available = { ask: 'available', askReason: null }
/** Refused by the database (42501), as withActor surfaces it: forbidden, with PostgreSQL's error as its cause. */
const denied = (err: unknown) =>
  err instanceof Error &&
  'code' in err &&
  err.code === 'forbidden' &&
  (err.cause as { code?: string })?.code === '42501'
const unavailable = (askReason: string) => ({ ask: 'unavailable', askReason })

/** 0089 called directly by the API login, under an actor. */
const direct = (w: World, actor: string, projectId: string) =>
  withActor(
    w.api,
    actor,
    'read',
    async (c) =>
      (await c.query<{ r: string | null }>('SELECT sophia.conversation_ask_capability($1) AS r', [projectId])).rows[0]
        ?.r,
  )

/** 0089 called by the API login with no actor set at all (withActor itself refuses to go without one). */
async function directWithoutActor(w: World, projectId: string) {
  const c = await w.api.connect()
  try {
    await c.query('BEGIN READ ONLY')
    return (await c.query<{ r: unknown }>('SELECT sophia.conversation_ask_capability($1) AS r', [projectId])).rows[0]?.r
  } finally {
    await c.query('ROLLBACK')
    c.release()
  }
}

/** E asks Sophia in a new conversation, through the API login: what conversation_ask recorded. */
async function sendAsk(w: World, projectId: string, actor = E) {
  const first = await withActor(w.api, actor, 'write', (c) =>
    startConversation(c, projectId, randomUUID(), { title: 'Ask', text: 'Opening.', askSophia: false }, 'E'),
  )
  const asked = await withActor(w.api, actor, 'write', (c) =>
    sendConversationMessage(c, first.conversationId, randomUUID(), { text: 'A question.', askSophia: true }, 'E'),
  )
  assert.ok(asked.replyId)
  const r = await w.owner.query<{ state: string; reason: string | null }>(
    'SELECT state,reason FROM sophia.conversation_replies WHERE id=$1',
    [asked.replyId],
  )
  return r.rows[0]
}

/** Parity for a writer in the cohort: the capability's reason is the one the real Ask then records. */
async function parity(w: World, projectId: string, reason: string | null) {
  assert.deepEqual(await ask(w, E, projectId), reason === null ? available : unavailable(reason), 'capability')
  assert.deepEqual(
    await sendAsk(w, projectId),
    reason === null ? { state: 'pending', reason: null } : { state: 'blocked', reason },
    'conversation_ask',
  )
}

/** A migration as written. */
const migration = (file: string) => readFileSync(new URL(`../../../db/migrations/${file}`, import.meta.url), 'utf8')

/** Everything an Ask or a reply could have written or changed, for the project. */
const footprint = async (w: World, projectId: string) =>
  (
    await w.owner.query<Record<string, unknown>>(
      `SELECT (SELECT count(*)::int FROM sophia.conversation_replies WHERE project_id=$1) AS replies,
         (SELECT count(*)::int FROM sophia.work_attempts WHERE project_id=$1) AS attempts,
         (SELECT count(*)::int FROM sophia.execution_bindings WHERE project_id=$1) AS bindings,
         (SELECT count(*)::int FROM sophia.commands WHERE project_id=$1) AS commands,
         (SELECT count(*)::int FROM sophia.outbox WHERE project_id=$1) AS outbox,
         (SELECT count(*)::int FROM sophia.runtime_commands WHERE project_id=$1) AS runtime_commands,
         (SELECT count(*)::int FROM sophia.conversation_reservations WHERE project_id=$1) AS reservations,
         (SELECT count(*)::int FROM sophia.conversation_requests WHERE project_id=$1) AS requests,
         (SELECT event_sequence::text FROM sophia.projects WHERE id=$1) AS events,
         (SELECT to_jsonb(g) FROM sophia.conversation_grants g WHERE project_id=$1 AND current) AS grant_row,
         (SELECT jsonb_agg(to_jsonb(ri) ORDER BY ri.id) FROM sophia.runtime_instances ri WHERE project_id=$1) AS runtimes`,
      [projectId],
    )
  ).rows[0]

describe('0089: who is answered, and what', () => {
  let w: World
  before(async () => {
    w = await open(true)
  })
  after(() => close(w))

  it('a writer in the current cohort, on a configured route, sees Sophia available (the old list said unavailable)', async () => {
    const { projectId } = await project(w)
    const c = await capability(w, E, projectId)
    assert.deepEqual(c, { state: 'enabled', write: true, moderate: false, ask: 'available', askReason: null })
    assert.equal(await direct(w, E, projectId), null)
  })

  it('a pinned service grant is available only with a runtime advertising its exact executor', async () => {
    const pinned = await project(w, { roles: [service(DIGEST)], pin: DIGEST })
    assert.deepEqual(await ask(w, E, pinned.projectId), available)
    const wrong = await project(w, { roles: [service('b'.repeat(64)), role()], pin: DIGEST })
    assert.deepEqual(await ask(w, E, wrong.projectId), unavailable('runtime_unavailable'))
  })

  it('refuses a non-member, no actor and another project inside the function, not only in the API', async () => {
    const { projectId } = await project(w)
    const { projectId: other } = await seedProject(w.db.ownerUrl, { admin: O })
    await assert.rejects(capability(w, O, projectId), { code: 'forbidden' })
    await assert.rejects(direct(w, O, projectId), denied)
    await assert.rejects(directWithoutActor(w, projectId), { code: '42501' })
    await assert.rejects(direct(w, E, other), denied, "E is no member of O's project")
    await assert.rejects(direct(w, E, randomUUID()), denied, 'a project that does not exist')
  })

  it('a viewer and a writer outside the cohort are told the same generic reason, whatever the grant', async () => {
    const { projectId } = await project(w)
    const coarse = async (label: string) => {
      for (const actor of [V, F, A]) assert.deepEqual(await ask(w, actor, projectId), unavailable(GENERIC), label)
    }
    await coarse('enabled')
    await w.owner.query(
      'UPDATE sophia.conversation_grants SET reserved_calls=5, uncertain_calls=5 WHERE project_id=$1 AND current',
      [projectId],
    )
    await coarse('exhausted')
    await w.owner.query(
      "UPDATE sophia.conversation_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE project_id=$1 AND current",
      [projectId],
    )
    await coarse('expired')
    await w.owner.query('SELECT sophia.conversation_set_grant($1,$2)', [projectId, { state: 'disabled' }])
    await coarse('disabled')
    // The coarse answer is a privacy choice, not admission parity: the real Ask by F records the grant's own reason.
    assert.deepEqual(await sendAsk(w, projectId, F), { state: 'blocked', reason: 'grant_disabled' })
  })

  it('with no current grant there is no cohort: generic for everyone, where the real Ask records no_grant', async () => {
    const { projectId } = await project(w, { grant: false })
    for (const actor of [E, F, A, V]) assert.deepEqual(await ask(w, actor, projectId), unavailable(GENERIC))
    assert.deepEqual(await sendAsk(w, projectId), { state: 'blocked', reason: 'no_grant' })
  })

  it('settings read only: the cohort writer is told replies_disabled, and writes nothing', async () => {
    const { projectId } = await project(w)
    await w.owner.query("SELECT sophia.set_conversation_settings($1,'read_only','con-ask-capability-test')", [
      projectId,
    ])
    const c = await capability(w, E, projectId)
    assert.deepEqual(c, {
      state: 'read_only',
      write: false,
      moderate: false,
      ask: 'unavailable',
      askReason: 'replies_disabled',
    })
  })
})

describe("0089: a cohort writer's reason is conversation_ask's", () => {
  let w: World
  before(async () => {
    w = await open(true)
  })
  after(() => close(w))

  it('admitted: available, and the real Ask is pending', async () => {
    const { projectId } = await project(w)
    await parity(w, projectId, null)
  })

  it('grant disabled', async () => {
    const { projectId } = await project(w)
    await w.owner.query('SELECT sophia.conversation_set_grant($1,$2)', [projectId, { state: 'disabled' }])
    await parity(w, projectId, 'grant_disabled')
  })

  it('grant expired', async () => {
    const { projectId } = await project(w)
    await w.owner.query(
      "UPDATE sophia.conversation_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE project_id=$1 AND current",
      [projectId],
    )
    await parity(w, projectId, 'grant_expired')
  })

  it('calls exhausted, counting spent, reserved and uncertain calls', async () => {
    const { projectId } = await project(w)
    const counts = (spent: number, reserved: number, uncertain: number) =>
      w.owner.query(
        'UPDATE sophia.conversation_grants SET spent_calls=$2, reserved_calls=$3, uncertain_calls=$4 WHERE project_id=$1 AND current',
        [projectId, spent, reserved, uncertain],
      )
    await counts(3, 3, 3)
    assert.deepEqual(await ask(w, E, projectId), available, 'one call left')
    await counts(3, 3, 4)
    assert.deepEqual(await ask(w, E, projectId), unavailable('calls_exhausted'), 'uncertain counts')
    await counts(0, 10, 0)
    assert.deepEqual(await ask(w, E, projectId), unavailable('calls_exhausted'), 'reserved counts')
    await parity(w, projectId, 'calls_exhausted')
  })

  it('no runtime, a stale one, or one advertising another route', async () => {
    const none = await project(w, { roles: null })
    await parity(w, none.projectId, 'runtime_unavailable')
    const stale = await project(w)
    await w.owner.query("UPDATE sophia.runtime_instances SET seen_at=now()-interval '91 seconds' WHERE project_id=$1", [
      stale.projectId,
    ])
    await parity(w, stale.projectId, 'runtime_unavailable')
    const elsewhere = await project(w, { roles: [{ ...role(), route: 'another-route' }] })
    await parity(w, elsewhere.projectId, 'runtime_unavailable')
  })

  it('cleanup capacity: two unretired reply bindings on the runtime', async () => {
    const { projectId } = await project(w)
    assert.deepEqual(await sendAsk(w, projectId), { state: 'pending', reason: null })
    assert.deepEqual(await sendAsk(w, projectId), { state: 'pending', reason: null })
    await parity(w, projectId, 'cleanup_capacity')
  })
})

describe('0089: no admitted assembler login', () => {
  let w: World
  before(async () => {
    w = await open(false)
  })
  after(() => close(w))

  it('a cohort writer is told context_assembler_unbound, as the real Ask records', async () => {
    const { projectId } = await project(w)
    await parity(w, projectId, 'context_assembler_unbound')
  })
})

describe('0089: a snapshot, never permission', () => {
  let w: World
  before(async () => {
    w = await open(true)
  })
  after(() => close(w))

  it('changes nothing, however often it is read, and holds no project lock', async () => {
    const { projectId } = await project(w)
    const was = await footprint(w, projectId)
    for (let i = 0; i < 5; i++) for (const actor of [E, F, A, V]) await capability(w, actor, projectId)
    assert.deepEqual(await footprint(w, projectId), was)
    // Read inside an open transaction of the API login, while the owner takes the project's row lock without waiting.
    const c = await w.api.connect()
    try {
      await c.query('BEGIN READ ONLY')
      await c.query("SELECT set_config('sophia.actor_id', $1, true)", [E])
      assert.equal((await c.query('SELECT sophia.conversation_ask_capability($1) AS r', [projectId])).rows[0]?.r, null)
      const locker = await w.owner.connect()
      try {
        await locker.query('BEGIN')
        await locker.query('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE NOWAIT', [projectId])
      } finally {
        await locker.query('ROLLBACK')
        locker.release()
      }
    } finally {
      await c.query('ROLLBACK')
      c.release()
    }
  })

  it('a grant disabled, a member removed from the cohort or demoted, or the runtime gone: the next read says so, and the real Ask decides anew', async () => {
    const { projectId } = await project(w)
    assert.deepEqual(await ask(w, E, projectId), available)
    await w.owner.query('SELECT sophia.conversation_set_grant($1,$2)', [projectId, { state: 'disabled' }])
    assert.deepEqual(await ask(w, E, projectId), unavailable('grant_disabled'))
    assert.deepEqual(await sendAsk(w, projectId), { state: 'blocked', reason: 'grant_disabled' })

    const cohort = await project(w)
    assert.deepEqual(await ask(w, E, cohort.projectId), available)
    await w.owner.query('SELECT sophia.conversation_set_grant($1,$2)', [cohort.projectId, { subjects: [F] }])
    assert.deepEqual(await ask(w, E, cohort.projectId), unavailable(GENERIC))
    assert.deepEqual(await ask(w, F, cohort.projectId), available, 'the new cohort')
    assert.deepEqual(await sendAsk(w, cohort.projectId), { state: 'blocked', reason: 'asker_not_authorized' })

    const demoted = await project(w)
    assert.deepEqual(await ask(w, E, demoted.projectId), available)
    await w.owner.query("UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2", [
      demoted.projectId,
      E,
    ])
    assert.deepEqual(await ask(w, E, demoted.projectId), unavailable(GENERIC))
    await w.owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
      demoted.projectId,
      E,
    ])
    await assert.rejects(direct(w, E, demoted.projectId), denied, 'no longer a member')

    const gone = await project(w)
    assert.deepEqual(await ask(w, E, gone.projectId), available)
    await w.owner.query("UPDATE sophia.runtime_instances SET seen_at=now()-interval '91 seconds' WHERE project_id=$1", [
      gone.projectId,
    ])
    assert.deepEqual(await ask(w, E, gone.projectId), unavailable('runtime_unavailable'))
    assert.deepEqual(await sendAsk(w, gone.projectId), { state: 'blocked', reason: 'runtime_unavailable' })
  })
})

describe('0089: its surface', () => {
  let w: World
  before(async () => {
    w = await open(false)
  })
  after(() => close(w))

  it('only the API login may call it; the grant tables stay closed to it', async () => {
    const acl = await w.owner.query(
      `SELECT has_function_privilege('sophia_api', p.oid, 'EXECUTE') AS api,
              has_function_privilege('sophia_worker', p.oid, 'EXECUTE') AS worker,
              has_function_privilege('public', p.oid, 'EXECUTE') AS public,
              p.prosecdef AS definer, p.provolatile AS volatility, p.proconfig AS config
         FROM pg_proc p WHERE p.oid='sophia.conversation_ask_capability(uuid)'::regprocedure`,
    )
    assert.deepEqual(acl.rows[0], {
      api: true,
      worker: false,
      public: false,
      definer: true,
      volatility: 's',
      config: ['search_path=pg_catalog, sophia'],
    })
    const { projectId } = await project(w)
    for (const table of ['conversation_grants', 'conversation_grant_subjects', 'conversation_reservations'])
      await assert.rejects(
        withActor(w.api, E, 'read', (c) => c.query(`SELECT 1 FROM sophia.${table} WHERE project_id=$1`, [projectId])),
        denied,
        table,
      )
  })

  it('leaves conversation_ask exactly as 0071 wrote it, and 0089 defines this one function alone', async () => {
    const m0071 = migration('0071_conversation_context_before_dispatch.sql')
    const from = m0071.indexOf('CREATE OR REPLACE FUNCTION sophia.conversation_ask(')
    const body = m0071.slice(
      m0071.indexOf('AS $$', from) + 'AS $$'.length,
      m0071.indexOf('END $$;', from) + 'END '.length,
    )
    const { rows } = await w.owner.query<{ src: string }>(
      "SELECT prosrc AS src FROM pg_proc WHERE oid='sophia.conversation_ask(uuid,uuid,sophia.conversation_messages)'::regprocedure",
    )
    assert.equal(rows[0]?.src, body)
    const m0089 = migration('0089_conversation_ask_capability.sql')
      .split('\n')
      .filter((l) => !l.startsWith('--'))
      .join('\n')
    assert.deepEqual(m0089.match(/\b(CREATE|ALTER|DROP)\b[^;(]*/g), [
      'CREATE FUNCTION sophia.conversation_ask_capability',
    ])
    assert.deepEqual(m0089.match(/\bGRANT\b[^;]*/g), [
      'GRANT EXECUTE ON FUNCTION sophia.conversation_ask_capability(uuid) TO sophia_api',
    ])
  })
})
