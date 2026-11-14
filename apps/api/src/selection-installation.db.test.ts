// INC04-S01b R2 (PR519-950D F01, F02): the installed boundaries the selection preview and member API contributions
// promise, through buildApp with a verified token, the production API role and real PostgreSQL. Level: sql-run.
// * F01: a current viewer's answer is decided in SQL before the pool (0106). A SYNTHETIC helper fault and an owned
//   relation lock are regression witnesses that the viewer's request never enters the pool's helpers or tables; the
//   matched editor request does. These are new causal checks, not evidence that a deployed database ever failed.
// * F02: with contributions on, /ready and the contribution routes' own installation check require everything they
//   promise (0094, 0100, 0104's protection and qualification, 0105, 0106). Real partial schemas are built from exact
//   prefixes of this tree's own migrations. A refused write leaves no account change, idempotency row or command.
// * INC04-S02a coherent: 0105's atomic admission is core. A database of the earlier source (every migration but 0105,
//   0106 included: no prefix) proves nothing installed: /ready refuses on and off, and the contribution routes, the
//   preview, the maintained research admission and the runtime's paid reserve all refuse before their SQL, while the
//   same fixtures through the old SQL still succeed there (the gap the guards close for the maintained callers only).
//   The real migrator, on a ledger that already records 0106, applies the pending 0105 and keeps 0106; the same
//   running API instances then serve, nothing having cached the refusal.
// Every account, grant, resource and token is SYNTHETIC; nothing here qualifies a real owner, account or route.
// * E62-SQL-F01 (fixture lifecycle): every pool this file opens is owned, and a teardown drops its database only after
//   each client those pools opened has actually ended (`owned`, `endOwned`, and the fence's own check at the end).
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeCommand, RuntimeRole } from '@sophia/contracts'
import { parseSelectionView } from '@sophia/contracts/validate'
import { DomainError } from '@sophia/domain'
import {
  admitResearchTask,
  atomicAdmissionInstalled,
  claimRuntimeOutbox,
  contributionWrite,
  createPool,
  dispatchRuntimeOutbox,
  migrate,
  readMigrations,
  recordRuntimeReady,
  recordRuntimeReceipts,
  runtimeHello,
  runtimePoll,
  runtimeResearchReserve,
  runtimeTokenHash,
  withActor,
  withService,
  type RuntimeCaller,
} from '@sophia/persistence'
import {
  createEmptyDatabase,
  createTestDatabase,
  registerRuntime,
  seedProject,
  withClusterMigrationLock,
  type EmptyDatabase,
  type TestDatabase,
} from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const token = (sub: string) =>
  new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))
const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })

/** What no preview body or log line may carry. */
const PRIVATE = /PRIVATE|SECRET|SYNTHETIC selection|Usd|evidence|custodian/
const RESTRICTED = {
  contract: 'inc04.selection.input.v1',
  policyVersion: 'inc04-s01-policy-v1',
  disclosure: 'restricted',
}
/** The tables an effect would touch. */
const LEDGERS = [
  'commands',
  'outbox',
  'project_events',
  'jobs',
  'research_allowances',
  'research_reservations',
  'api_contribution_tasks',
  'api_contribution_reservations',
  'api_contribution_requests',
  'research_funding_pins',
  'owner_runner_operations',
  'owner_runner_reservations',
]

// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type Body = any
type Method = 'GET' | 'POST' | 'PATCH'
/** One request: `route` is `<METHOD> <path>`; a write carries an Idempotency-Key (fresh unless given). */
async function http(
  app: FastifyInstance,
  who: string | null,
  route: `${Method} ${string}`,
  body?: unknown,
  key?: string,
) {
  const space = route.indexOf(' ')
  const method = route.slice(0, space) as Method
  const res = await app.inject({
    method,
    url: route.slice(space + 1),
    headers: {
      ...(who ? { authorization: `Bearer ${await token(who)}` } : {}),
      ...(method === 'GET' ? {} : { 'idempotency-key': key ?? randomUUID() }),
    },
    ...(body === undefined ? {} : { payload: body as object }),
  })
  const json: Body = res.body ? JSON.parse(res.body) : null
  return { status: res.statusCode, body: res.body, json, cache: res.headers['cache-control'] }
}
const ready = async (app: FastifyInstance) => (await app.inject({ method: 'GET', url: '/ready' })).statusCode
const previewUrl = (projectId: string, query = 'operation=research') =>
  `GET /api/v1/projects/${projectId}/selection-preview?${query}` as const

/** Settle `p` within `ms`, or fail: a request held by a lock must not hang the suite. */
const within = <T>(ms: number, p: Promise<T>, what: string) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${what}: no answer within ${String(ms)} ms`)), ms).unref(),
    ),
  ])

/**
 * E62-SQL-F01: the pools this file owns, and the actual end of every client each one opened. At the pinned pg-pool
 * 3.14.0, `Pool.end()` resolves as soon as its idle clients have left the pool's own accounting, while each one's
 * `Client.end()` (pg 8.23.0) is still waiting for its connection to end (docs/SOURCE_MAP.md §2r). A FORCE drop of the
 * fixture database in that window terminates an owned backend that is still connected, and the pool forwards the late
 * FATAL as an 'error'. So each pool is registered here before its first use, through its public 'connect' event, and a
 * teardown ends its pools and then waits for every owned client's own 'end' before it drops the database. Nothing is
 * caught or ignored: an error from an owned client stays exactly as visible as before.
 */
const clientEnds = new WeakMap<pg.Pool, Promise<void>[]>()
function owned<P extends pg.Pool>(pool: P): P {
  const ends: Promise<void>[] = []
  pool.on('connect', (client) => {
    ends.push(new Promise((ended) => client.once('end', () => ended())))
  })
  clientEnds.set(pool, ends)
  return pool
}
/** Every client `pools` opened has actually ended (bounded: a client that never ends fails the teardown, loudly). */
async function clientsEnded(...pools: pg.Pool[]): Promise<void> {
  for (const pool of pools) {
    const ends = clientEnds.get(pool)
    assert.ok(ends, 'a pool this file ends was registered as owned before its first use')
    await within(15_000, Promise.all(ends), 'the owned clients’ actual end')
  }
}
/** End `pools`, then wait until each client they opened has actually ended; only then may a database be dropped. */
async function endOwned(...pools: pg.Pool[]): Promise<void> {
  for (const pool of pools) await pool.end()
  await clientsEnded(...pools)
}

/** The tree's own migrations before `upTo` (exclusive), linked into a fresh directory. */
function prefixOf(upTo: string): string {
  const dir = mkdtempSync(join(tmpdir(), `sophia-before-${upTo}-`))
  const migrations = resolve('db/migrations')
  for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql') && n < upTo)) {
    symlinkSync(join(migrations, f), join(dir, f))
  }
  return dir
}

/** The number of candidates a shared (evaluated) view lists. */
const sharedCount = (r: { status: number; body: string }) => {
  assert.equal(r.status, 200, r.body)
  const v = parseSelectionView(JSON.parse(r.body))
  assert.ok(v.disclosure === 'shared' && v.candidates !== undefined, r.body)
  return v.candidates.length
}

const PROTECTION = { applicability: 'none_applicable', operations: ['research'], roles: ['sophia-research-md-v1'] }

describe('the selection preview’s viewer boundary over HTTP (0106, F01)', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let owner: pg.Pool
  let app: FastifyInstance
  const lines: string[] = []

  before(async () => {
    db = await createTestDatabase()
    pool = owned(createPool(db.apiUrl, { max: 8 }))
    owner = owned(new pg.Pool({ connectionString: db.ownerUrl, max: 4 }))
    app = buildApp({ pool, verifyActor, logger: { stream: { write: (line: string) => lines.push(line) } } })
    await app.ready()
  })
  after(async () => {
    await app.close()
    await endOwned(pool, owner)
    await db.drop()
  })

  const counts = async () =>
    Promise.all(
      LEDGERS.map(async (t) =>
        Number((await owner.query<{ n: string }>(`SELECT count(*) AS n FROM sophia.${t}`)).rows[0]?.n),
      ),
    )
  /** A project with an enabled research gate, an editor, a viewer and a former viewer, and `n` hidden natives. */
  async function world(n: number) {
    const [EDIT, VIEW, FORMER, OUT] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const p = await seedProject(db.ownerUrl, { admin: randomUUID(), editors: [EDIT], viewers: [VIEW, FORMER] })
    await owner.query(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [
      p.projectId,
      FORMER,
    ])
    await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
      p.projectId,
    ])
    const conn = randomUUID()
    await owner.query(
      `INSERT INTO sophia.execution_connections(id,owner_id,upstream_origin,upstream_subject,state) VALUES ($1,$2,'synthetic','synthetic','linked')`,
      [conn, EDIT],
    )
    const hide = (k: number) =>
      owner.query(
        `INSERT INTO sophia.executor_resources(project_id,owner_id,connection_id,harness,label,repository_root,state)
         SELECT $1,$2,$3,'claude-native','PRIVATE-label','/PRIVATE','active' FROM generate_series(1,$4::int)`,
        [p.projectId, EDIT, conn, k],
      )
    if (n > 0) await hide(n)
    return { ...p, EDIT, VIEW, FORMER, OUT, hide }
  }
  /** One request as a client sees it, with the status its log lines recorded. */
  async function seen(who: string, projectId: string, query?: string) {
    const from = lines.length
    const r = await http(app, who, previewUrl(projectId, query))
    const logged = lines.slice(from)
    return {
      status: r.status,
      body: r.body,
      cache: r.cache,
      loggedStatus: logged.flatMap((l) => {
        const code = (JSON.parse(l) as { res?: { statusCode?: number } }).res?.statusCode
        return code === undefined ? [] : [code]
      }),
      logged: logged.join(''),
    }
  }
  const restrictedOf = (r: Awaited<ReturnType<typeof seen>>) => {
    assert.equal(r.status, 200, r.body)
    assert.deepEqual(JSON.parse(r.body), RESTRICTED)
    assert.equal(parseSelectionView(JSON.parse(r.body)).disclosure, 'restricted')
    assert.equal(r.cache, 'no-store')
    assert.equal(PRIVATE.test(r.body) || PRIVATE.test(r.logged), false, 'no private marker in body or log')
  }

  it('answers a viewer one restricted response at 0, 200 and 201, with no effect; an editor evaluates ≤200 only', async () => {
    const w = await world(0)
    const initial = await counts()
    const at0 = await seen(w.VIEW, w.projectId)
    await w.hide(200)
    const at200 = await seen(w.VIEW, w.projectId)
    assert.equal(sharedCount(await http(app, w.EDIT, previewUrl(w.projectId))), 200, 'the editor evaluates 200')
    await w.hide(1)
    const at201 = await seen(w.VIEW, w.projectId)
    const over = await http(app, w.EDIT, previewUrl(w.projectId))
    assert.deepEqual([over.status, over.json.code], [503, 'projection_unavailable'], 'the editor needs the whole pool')
    for (const r of [at0, at200, at201]) {
      restrictedOf(r)
      assert.deepEqual([r.status, r.body, r.cache, r.loggedStatus], [at0.status, at0.body, at0.cache, [200]])
    }
    assert.deepEqual(await counts(), initial, 'no preview wrote, reserved, queued or notified anything')
  })

  it('keeps a viewer out of the private helpers: a SYNTHETIC helper fault changes nothing for them', async (t) => {
    const w = await world(1)
    const healthy = await seen(w.VIEW, w.projectId)
    restrictedOf(healthy)
    assert.equal(sharedCount(await http(app, w.EDIT, previewUrl(w.projectId))), 1, 'the matched editor read is healthy')
    const helpers = [
      'sophia.selection_project_budget(uuid)',
      'sophia.selection_native_candidate(sophia.executor_resources,timestamptz)',
      'sophia.selection_api_candidate(sophia.api_contribution_grants,uuid,sophia.research_funding_pins,boolean,timestamptz)',
      'sophia.selection_source(uuid,uuid)',
    ]
    const originals = await Promise.all(
      helpers.map(
        async (f) =>
          (await owner.query<{ d: string }>(`SELECT pg_get_functiondef($1::regprocedure) AS d`, [f])).rows[0]?.d,
      ),
    )
    // SYNTHETIC: each private helper replaced, in this test database only, by one that raises.
    const fault = `AS $function$ BEGIN RAISE EXCEPTION 'SYNTHETIC selection helper fault' USING ERRCODE='XX000'; END $function$`
    for (const def of originals) {
      assert.ok(def)
      await owner.query(
        def.replace(/AS \$function\$[\s\S]*\$function\$/, fault).replace(/LANGUAGE sql/, 'LANGUAGE plpgsql'),
      )
    }
    try {
      const faulted = await seen(w.VIEW, w.projectId, `operation=research&sourceIds=${randomUUID()}`)
      const editor = await http(app, w.EDIT, previewUrl(w.projectId))
      // Both observed before any assertion, so a red records what each request actually answered.
      t.diagnostic(`viewer ${String(faulted.status)} ${faulted.body}; editor ${String(editor.status)} ${editor.body}`)
      restrictedOf(faulted)
      assert.deepEqual([faulted.body, faulted.loggedStatus], [healthy.body, healthy.loggedStatus])
      // The editor's request does reach the faulted helper; its answer is the classifier's honest unavailable.
      assert.deepEqual([editor.status, editor.json.code], [503, 'unavailable'], editor.body)
      assert.equal(PRIVATE.test(editor.body), false)
    } finally {
      for (const d of originals) if (d) await owner.query(d)
    }
    assert.equal(
      sharedCount(await http(app, w.EDIT, previewUrl(w.projectId))),
      1,
      'restored: the editor evaluates again',
    )
  })

  it('keeps a viewer off the pool’s tables: an owned relation lock never holds them, while the editor waits for it', async () => {
    const w = await world(1)
    const source = randomUUID()
    const holder = await owner.connect()
    let editor: Promise<Awaited<ReturnType<typeof http>>> | undefined
    await holder.query('BEGIN')
    try {
      await holder.query(
        `LOCK TABLE sophia.projects, sophia.research_grants, sophia.research_funding_pins, sophia.source_objects,
          sophia.api_contribution_grants, sophia.executor_resources IN ACCESS EXCLUSIVE MODE`,
      )
      const viewer = await within(15_000, seen(w.VIEW, w.projectId, `operation=research&sourceIds=${source}`), 'viewer')
      restrictedOf(viewer)
      editor = http(app, w.EDIT, previewUrl(w.projectId))
      let waiting = 0
      for (let i = 0; i < 100 && waiting === 0; i += 1) {
        await new Promise((r) => setTimeout(r, 50))
        waiting = Number(
          (
            await owner.query<{ n: string }>(
              `SELECT count(*) AS n FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock'`,
              [db.apiRole],
            )
          ).rows[0]?.n,
        )
      }
      assert.equal(waiting, 1, 'the editor’s full read waits on the held lock')
    } finally {
      await holder.query('ROLLBACK')
      holder.release()
    }
    assert.ok(editor)
    assert.equal(sharedCount(await within(15_000, editor, 'editor')), 1, 'released: the editor evaluates')
  })

  it('still verifies membership and the closed query: 404, 401 and 422', async () => {
    const w = await world(1)
    const nonmember = await http(app, w.OUT, previewUrl(w.projectId))
    const missing = await http(app, w.VIEW, previewUrl(randomUUID()))
    const former = await http(app, w.FORMER, previewUrl(w.projectId))
    assert.deepEqual([nonmember.status, missing.status, former.status], [404, 404, 404])
    assert.equal((await http(app, null, previewUrl(w.projectId))).status, 401)
    assert.equal((await http(app, w.VIEW, previewUrl(w.projectId, 'operation=research&role=editor'))).status, 422)
    assert.equal((await http(app, w.VIEW, previewUrl(w.projectId, 'operation=review'))).status, 422)
  })

  it('refuses a form without the 0106 discriminant, or a full form for a viewer, as unavailable, never evaluating it', async () => {
    const w = await world(1)
    const original = (
      await owner.query<{ d: string }>(
        `SELECT pg_get_functiondef('sophia.selection_snapshot(uuid,uuid[])'::regprocedure) AS d`,
      )
    ).rows[0]?.d
    assert.ok(original)
    // An older-shaped body under the marker (a hand replacement the marker cannot see): complete, empty, unmarked.
    await owner.query(
      `CREATE OR REPLACE FUNCTION sophia.selection_snapshot(p_project uuid, p_source_ids uuid[]) RETURNS jsonb LANGUAGE sql
       STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
       SELECT CASE WHEN sophia.is_member(p_project) THEN jsonb_build_object('complete',true,'candidates','[]'::jsonb) END $$`,
    )
    try {
      for (const who of [w.EDIT, w.VIEW]) {
        const r = await http(app, who, previewUrl(w.projectId))
        assert.deepEqual([r.status, r.json.code], [503, 'projection_unavailable'], r.body)
      }
      // A full form for a viewer (a body that skips the role-first return) is never evaluated for them.
      await owner.query(
        `CREATE OR REPLACE FUNCTION sophia.selection_snapshot(p_project uuid, p_source_ids uuid[]) RETURNS jsonb LANGUAGE sql
         STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
         SELECT CASE WHEN sophia.is_member(p_project) THEN jsonb_build_object('evaluation','full','evaluatedAt',clock_timestamp(),
          'projectId',p_project,'actorId',sophia.actor_id(),'member',jsonb_build_object('role','viewer','active',true,'revision',1),
          'audienceRevision',1,'eligibilityRevision',1,'gate',NULL,'projectBudget',false,'pin',NULL,'sources','[]'::jsonb,
          'complete',true,'candidates','[]'::jsonb) END $$`,
      )
      const viewer = await http(app, w.VIEW, previewUrl(w.projectId))
      assert.deepEqual([viewer.status, viewer.json.code], [503, 'projection_unavailable'], viewer.body)
    } finally {
      await owner.query(original)
    }
    assert.equal(sharedCount(await http(app, w.EDIT, previewUrl(w.projectId))), 1)
  })
})

/** What a contribution write left behind, for one account: its revision and the ledgers a write would touch. */
async function footprint(owner: pg.Pool, accountId: string) {
  const one = async (sql: string, args: unknown[] = []) =>
    String((await owner.query<{ v: unknown }>(sql, args)).rows[0]?.v)
  return {
    revision: await one(`SELECT revision AS v FROM sophia.api_accounts WHERE id=$1`, [accountId]),
    requests: await one(`SELECT count(*) AS v FROM sophia.api_contribution_requests`),
    commands: await one(`SELECT count(*) AS v FROM sophia.commands`),
    accounts: await one(`SELECT count(*) AS v FROM sophia.api_accounts`),
  }
}

// Each prefix's /ready with contributions off (INC04-S02a coherent): this source requires 0105's atomic admission
// whatever the switch says, so a prefix without 0105 is not ready either way (the earlier source's off 200 there was
// true for that source); the prefix before 0106 holds 0105 and is ready off, needing nothing of 0106 then.
for (const [upTo, label, off200] of [
  ['0101', 'through 0100', false],
  ['0104', 'through 0102, without 0104', false],
  ['0106', 'with 0104 and 0105, without 0106', true],
] as const) {
  describe(`on a database ${label} (F02)`, () => {
    let db: TestDatabase
    let pool: pg.Pool
    let owner: pg.Pool
    let on: FastifyInstance
    let off: FastifyInstance
    const dir = prefixOf(upTo)

    before(async () => {
      db = await createTestDatabase(dir)
      pool = owned(createPool(db.apiUrl, { max: 4 }))
      owner = owned(new pg.Pool({ connectionString: db.ownerUrl, max: 2 }))
      on = buildApp({ pool, verifyActor, apiContributions: true })
      off = buildApp({ pool, verifyActor })
      await on.ready()
      await off.ready()
    })
    after(async () => {
      await on.close()
      await off.close()
      await endOwned(pool, owner)
      await db.drop()
      rmSync(dir, { recursive: true, force: true })
    })

    it('is not ready with contributions on, refuses every contribution route before SQL, and writes nothing', async (t) => {
      const OWNER = randomUUID()
      // An account made through 0094's own write entry, which every one of these databases has.
      const acc = await withActor(pool, OWNER, 'write', (c) =>
        contributionWrite(c, 'account_create', randomUUID(), { label: 'PRIVATE account', totalCapUsd: 10 }),
      )
      const accountId = String(acc.accountId)
      const initial = await footprint(owner, accountId)
      // Everything is observed before any assertion, so a red records each actual answer.
      const readiness = { on: await ready(on), off: await ready(off) }
      const patch = await http(on, OWNER, `PATCH /api/v1/me/api-accounts/${accountId}`, {
        expectedRevision: 1,
        patch: { protection: PROTECTION },
      })
      const mine = await http(on, OWNER, 'GET /api/v1/me/api-resources')
      const create = await http(on, OWNER, 'POST /api/v1/me/api-accounts', { label: 'x', totalCapUsd: 1 })
      const left = await footprint(owner, accountId)
      const offMine = await http(off, OWNER, 'GET /api/v1/me/api-resources')
      const preview = await http(off, OWNER, previewUrl(randomUUID()))
      t.diagnostic(
        JSON.stringify({
          readiness,
          patch: [patch.status, patch.json?.code],
          mine: [mine.status, mine.json?.code],
          create: [create.status, create.json?.code],
          initial,
          left,
          offMine: offMine.status,
          preview: [preview.status, preview.json?.code],
        }),
      )
      assert.deepEqual(
        readiness,
        { on: 503, off: off200 ? 200 : 503 },
        off200
          ? 'not ready with contributions on (no 0106); off (the default): ready, with 0105'
          : 'not ready on or off: without 0105, the core atomic admission',
      )
      for (const r of [patch, mine, create]) {
        assert.deepEqual(
          [r.status, r.json.code, r.json.message],
          [503, 'projection_unavailable', 'Member API contributions are not installed on this database'],
          r.body,
        )
      }
      assert.deepEqual(left, initial, 'no account change, idempotency row or command')
      assert.equal(offMine.status, 404, 'off: not served')
      assert.deepEqual(
        [preview.status, preview.json.code],
        [503, 'projection_unavailable'],
        'no viewer-safe preview here',
      )
    })
  })
}

describe('with 0104 and 0106 installed (F02)', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let owner: pg.Pool
  let on: FastifyInstance
  let off: FastifyInstance

  before(async () => {
    db = await createTestDatabase()
    pool = owned(createPool(db.apiUrl, { max: 4 }))
    owner = owned(new pg.Pool({ connectionString: db.ownerUrl, max: 2 }))
    on = buildApp({ pool, verifyActor, apiContributions: true })
    off = buildApp({ pool, verifyActor })
    await on.ready()
    await off.ready()
  })
  after(async () => {
    await on.close()
    await off.close()
    await endOwned(pool, owner)
    await db.drop()
  })

  it('is ready on and off, and the owner declares, replays, conflicts, reads and withdraws protection', async () => {
    assert.deepEqual([await ready(on), await ready(off)], [200, 200])
    const [OWNER, OTHER] = [randomUUID(), randomUUID()]
    const account = await http(on, OWNER, 'POST /api/v1/me/api-accounts', { label: 'PRIVATE account', totalCapUsd: 10 })
    assert.equal(account.status, 201, account.body)
    const path = `PATCH /api/v1/me/api-accounts/${String(account.json.accountId)}` as const
    const key = randomUUID()
    const first = await http(on, OWNER, path, { expectedRevision: 1, patch: { protection: PROTECTION } }, key)
    assert.deepEqual([first.status, first.json.revision], [200, 2], first.body)
    const again = await http(on, OWNER, path, { expectedRevision: 1, patch: { protection: PROTECTION } }, key)
    assert.deepEqual([again.status, again.json], [200, first.json], 'the same key and request replay its receipt')
    const protectedOne = { ...PROTECTION, applicability: 'protected', protectedConcurrency: 1 }
    const conflict = await http(on, OWNER, path, { expectedRevision: 1, patch: { protection: protectedOne } }, key)
    assert.equal(conflict.json.code, 'idempotency_conflict')
    const stale = await http(on, OWNER, path, { expectedRevision: 1, patch: { protection: protectedOne } })
    assert.deepEqual([stale.status, stale.json.code], [409, 'stale_revision'])
    const foreign = await http(on, OTHER, path, { expectedRevision: 2, patch: { protection: PROTECTION } })
    assert.equal(foreign.status, 403)
    const invalid = await http(on, OWNER, path, {
      expectedRevision: 2,
      patch: { protection: { ...PROTECTION, operations: ['research', 'review'] } },
    })
    assert.equal(invalid.status, 422)
    const replaced = await http(on, OWNER, path, { expectedRevision: 2, patch: { protection: protectedOne } })
    assert.deepEqual([replaced.status, replaced.json.revision], [200, 3], replaced.body)
    const read = await http(on, OWNER, 'GET /api/v1/me/api-resources')
    const mine = (read.json.accounts as Body[]).find((a: Body) => a.accountId === account.json.accountId)
    assert.deepEqual([mine.protection.applicability, mine.protection.protectedConcurrency], ['protected', 1])
    const theirs = await http(on, OTHER, 'GET /api/v1/me/api-resources')
    assert.deepEqual(theirs.json.accounts, [], 'another member reads none of it')
    const withdrawn = await http(on, OWNER, path, { expectedRevision: 3, patch: { protection: null } })
    assert.deepEqual([withdrawn.status, withdrawn.json.revision], [200, 4])
    const afterwards = await http(on, OWNER, 'GET /api/v1/me/api-resources')
    const last = (afterwards.json.accounts as Body[]).find((a: Body) => a.accountId === account.json.accountId)
    assert.equal(last.protection, null)
    assert.equal((await http(off, OWNER, 'GET /api/v1/me/api-resources')).status, 404, 'off (the default): not served')
  })
})

// ---- INC04-S02a coherent: 0105's atomic admission is core, and 0106 can be installed without it ----

/** Every migration of this tree except `omit`, linked into a fresh directory: no prefix can express this set. */
function allBut(omit: string): string {
  const dir = mkdtempSync(join(tmpdir(), `sophia-without-${omit}-`))
  const migrations = resolve('db/migrations')
  for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql') && !n.startsWith(`${omit}_`))) {
    symlinkSync(join(migrations, f), join(dir, f))
  }
  return dir
}

const MD: RuntimeRole = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const QUESTION = { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] as const }

/** A project with an enabled research gate (the project's own funding) and a ready SYNTHETIC runtime. */
async function researchProject(ownerUrl: string, api: pg.Pool) {
  const [ADMIN, EDIT, VIEW] = [randomUUID(), randomUUID(), randomUUID()]
  const { projectId } = await seedProject(ownerUrl, { admin: ADMIN, editors: [EDIT], viewers: [VIEW] })
  const o = new pg.Client({ connectionString: ownerUrl })
  await o.connect()
  try {
    await o.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
      projectId,
    ])
  } finally {
    await o.end()
  }
  const rt = await registerRuntime(ownerUrl, { projectId, admin: ADMIN })
  const who: RuntimeCaller = {
    tokenSha256: runtimeTokenHash(rt.token),
    runtimeUnitId: rt.runtimeUnitId,
    bridgeInstanceId: randomUUID(),
  }
  await withService(api, (c) =>
    runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] }),
  )
  await withService(api, (c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
  return { projectId, ADMIN, EDIT, VIEW, who, token: rt.token }
}
type ResearchProject = Awaited<ReturnType<typeof researchProject>>

/** The maintained admission, as research-tools calls it (inside withActor write). */
const admitMaintained = (api: pg.Pool, p: ResearchProject) =>
  withActor(api, p.EDIT, 'write', (c) =>
    admitResearchTask(c, p.projectId, {
      key: randomUUID(),
      exchangeId: randomUUID(),
      request: QUESTION,
      specialist: { role: MD.id, route: MD.route },
    }),
  )

/** The same admission through the old SQL directly, as an earlier API binary would: the gap this guard closes. */
const admitThroughOldSql = (api: pg.Pool, p: ResearchProject) =>
  withActor(api, p.EDIT, 'write', async (c) => {
    const { rows } = await c.query<{ r: { taskId: string; attemptId: string } }>(
      `SELECT sophia.admit_research_task($1, $2, $3, $4, $5, $6) AS r`,
      [p.projectId, randomUUID(), randomUUID(), JSON.stringify(QUESTION), MD.id, MD.route],
    )
    return rows[0]!.r
  })

/** Dispatch through the worker's SQL as an earlier worker binary would, and deliver the create to the runtime. */
async function deliverCreate(api: pg.Pool, worker: pg.Pool, p: ResearchProject, attemptId: string) {
  for (const row of await claimRuntimeOutbox(worker, 'earlier-worker', 50, 30))
    if (row.project_id === p.projectId) await dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
  const create = (await withService(api, (c) => runtimePoll(c, p.who, 0))).commands
    .map((q) => q.command as RuntimeCommand)
    .find((cmd) => cmd.binding.attemptId === attemptId)
  assert.ok(create, 'the create reached its runtime')
  await withService(api, (c) =>
    recordRuntimeReceipts(c, p.who, [
      {
        commandId: create.commandId,
        attemptId,
        stage: 'delivered',
        nativeSessionId: `sophia-${attemptId}`,
        nativeSequence: 1,
        evidenceRefs: [],
        observedAt: new Date().toISOString(),
        reason: null,
      },
    ]),
  )
  return { attemptId, nativeSessionId: `sophia-${attemptId}` }
}

/** Rows of every ledger an effect would touch (those this database has). */
async function ledgerRows(owner: pg.Pool) {
  const out: Record<string, number> = {}
  for (const t of [...LEDGERS, 'research_tasks']) {
    const { rows } = await owner.query<{ n: string | null }>(
      `SELECT CASE WHEN to_regclass('sophia.${t}') IS NULL THEN NULL
         ELSE (xpath('/row/n/text()', query_to_xml('SELECT count(*) AS n FROM sophia.${t}', false, true, '')))[1]::text END AS n`,
    )
    if (rows[0]?.n !== null && rows[0]?.n !== undefined) out[t] = Number(rows[0].n)
  }
  return out
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof DomainError ? `${err.code}: ${err.message}` : `raw: ${String(err)}`
  }
}
const NOT_INSTALLED =
  'projection_unavailable: The atomic contributed admission (0105) is not installed on this database'

const runtimeHeaders = (p: ResearchProject) => ({
  authorization: `Bearer ${p.token}`,
  'x-sophia-runtime-unit': p.who.runtimeUnitId,
  'x-sophia-bridge-instance': p.who.bridgeInstanceId,
  'x-sophia-bridge-protocol': '1',
})

describe('on a database of the earlier source: 0106 installed, 0105 not (no prefix; coherent)', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let worker: pg.Pool
  let owner: pg.Pool
  let on: FastifyInstance
  let off: FastifyInstance
  const dir = allBut('0105')

  before(async () => {
    db = await createTestDatabase(dir)
    pool = owned(createPool(db.apiUrl, { max: 4 }))
    worker = owned(createPool(db.workerUrl, { max: 2 }))
    owner = owned(new pg.Pool({ connectionString: db.ownerUrl, max: 2 }))
    on = buildApp({ pool, verifyActor, apiContributions: true })
    off = buildApp({ pool, verifyActor })
    await on.ready()
    await off.ready()
  })
  after(async () => {
    await on.close()
    await off.close()
    await endOwned(pool, worker, owner)
    await db.drop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('proves nothing installed although 0106 and every old signature are: not ready on or off', async () => {
    const present = (
      await owner.query<{ marker: boolean; admit: boolean; reserve: boolean }>(
        `SELECT to_regprocedure('sophia.selection_viewer_boundary_0106()') IS NOT NULL AS marker,
                to_regprocedure('sophia.admit_research_task(uuid,text,text,jsonb,text,text)') IS NOT NULL AS admit,
                to_regprocedure('sophia.runtime_research_reserve(bytea,text,text,jsonb)') IS NOT NULL AS reserve`,
      )
    ).rows[0]
    assert.deepEqual(present, { marker: true, admit: true, reserve: true }, 'the earlier source’s installation')
    assert.equal(await atomicAdmissionInstalled(pool), false, 'the API login reads 0105 missing')
    assert.equal(await atomicAdmissionInstalled(worker), false, 'the worker login reads 0105 missing')
    for (const app of [on, off]) {
      const r = await app.inject({ method: 'GET', url: '/ready' })
      assert.deepEqual([r.statusCode, r.json()], [503, { ready: false, reason: 'schema' }])
    }
  })

  it('refuses the contribution routes and the preview for every role before SQL, writing nothing', async () => {
    const OWNER = randomUUID()
    const acc = await withActor(pool, OWNER, 'write', (c) =>
      contributionWrite(c, 'account_create', randomUUID(), { label: 'PRIVATE account', totalCapUsd: 10 }),
    )
    const accountId = String(acc.accountId)
    const initial = await footprint(owner, accountId)
    const patch = await http(on, OWNER, `PATCH /api/v1/me/api-accounts/${accountId}`, {
      expectedRevision: 1,
      patch: { protection: PROTECTION },
    })
    assert.deepEqual(
      [patch.status, patch.json.code, patch.json.message],
      [503, 'projection_unavailable', 'Member API contributions are not installed on this database'],
      patch.body,
    )
    assert.deepEqual(await footprint(owner, accountId), initial, 'no account change, idempotency row or command')
    const p = await researchProject(db.ownerUrl, pool)
    for (const who of [p.EDIT, p.VIEW]) {
      const r = await http(off, who, previewUrl(p.projectId))
      assert.deepEqual([r.status, r.json.code], [503, 'projection_unavailable'], r.body)
      assert.doesNotMatch(r.body, PRIVATE)
    }
  })

  it('refuses the maintained admission and the paid reserve before their SQL; the old SQL itself still runs here', async () => {
    const p = await researchProject(db.ownerUrl, pool)
    const initial = await ledgerRows(owner)
    assert.equal(await codeOf(admitMaintained(pool, p)), NOT_INSTALLED)
    assert.deepEqual(await ledgerRows(owner), initial, 'no task, job, command, outbox row, allowance or event')

    // Positive control on the same fixtures: the old same-signature SQL admits (an earlier binary would reach it).
    const old = await admitThroughOldSql(pool, p)
    assert.ok(old.taskId && old.attemptId, JSON.stringify(old))
    const at = await deliverCreate(pool, worker, p, old.attemptId)
    const reserve = { ...at, callId: 'm1', kind: 'model' as const, provider: 'openai-research', amountUsd: 0.4 }
    const delivered = await ledgerRows(owner)
    assert.equal(await codeOf(withService(pool, (c) => runtimeResearchReserve(c, p.who, reserve))), NOT_INSTALLED)
    const viaHttp = await off.inject({
      method: 'POST',
      url: '/v1/runtime/research/reserve',
      headers: runtimeHeaders(p),
      payload: reserve,
    })
    assert.deepEqual(
      [viaHttp.statusCode, viaHttp.json().code],
      [503, 'projection_unavailable'],
      'the always-served runtime route refuses too, with contributions off',
    )
    assert.deepEqual(await ledgerRows(owner), delivered, 'no reservation was made by either refused reserve')
    // Positive control: the old reserve SQL, with the same authenticated runtime and session, reserves here.
    await withService(pool, (c) =>
      c.query(`SELECT sophia.runtime_research_reserve($1, $2, $3, $4) AS r`, [
        p.who.tokenSha256,
        p.who.runtimeUnitId,
        p.who.bridgeInstanceId,
        JSON.stringify(reserve),
      ]),
    )
    assert.equal(
      (await ledgerRows(owner)).research_reservations,
      (delivered.research_reservations ?? 0) + 1,
      'the fixtures were valid: only the guard refused',
    )
  })
})

describe('the real migrator on a ledger that already records 0106, without 0105 (coherent upgrade)', () => {
  let empty: EmptyDatabase
  let owner: pg.Pool
  let pool: pg.Pool
  let worker: pg.Pool
  let on: FastifyInstance
  let off: FastifyInstance
  const dir = allBut('0105')
  const suffix = randomBytes(6).toString('hex')
  const logins = [`sophia_api_u_${suffix}`, `sophia_worker_u_${suffix}`]

  /** A login granted `group`, like the production logins (test-support's own, made here for a migrated database). */
  async function login(role: string, group: string, password: string): Promise<string> {
    await owner.query(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
    )
    await owner.query(`GRANT ${group} TO ${role}`)
    await owner.query(`GRANT CONNECT ON DATABASE ${new URL(empty.ownerUrl).pathname.slice(1)} TO ${role}`)
    const u = new URL(empty.ownerUrl)
    u.username = role
    u.password = password
    return u.toString()
  }

  before(async () => {
    empty = await createEmptyDatabase('sophia_u')
    await withClusterMigrationLock(() => migrate(empty.ownerUrl, dir))
    owner = owned(new pg.Pool({ connectionString: empty.ownerUrl, max: 2 }))
    const password = randomBytes(12).toString('hex')
    pool = owned(createPool(await login(logins[0]!, 'sophia_api', password), { max: 4 }))
    worker = owned(createPool(await login(logins[1]!, 'sophia_worker', password), { max: 2 }))
    on = buildApp({ pool, verifyActor, apiContributions: true })
    off = buildApp({ pool, verifyActor })
    await on.ready()
    await off.ready()
  })
  after(async () => {
    await on.close()
    await off.close()
    await endOwned(pool, worker)
    for (const role of logins) await owner.query(`DROP OWNED BY ${role}; DROP ROLE ${role}`)
    await endOwned(owner)
    await empty.drop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('applies only the pending 0105, keeps 0106 exactly, and the same running API instances then serve', async () => {
    const ledger = async () =>
      new Map(
        (
          await owner.query<{ version: string; sha256: string }>(
            `SELECT version, sha256 FROM sophia_meta.schema_migrations`,
          )
        ).rows.map((r) => [r.version, r.sha256]),
      )
    const snapshotDef = async () =>
      (
        await owner.query<{ d: string }>(
          `SELECT pg_get_functiondef('sophia.selection_snapshot(uuid,uuid[])'::regprocedure) AS d`,
        )
      ).rows[0]?.d
    const files = new Map(readMigrations(resolve('db/migrations')).map((f) => [f.version, f.sha256]))
    const first = await ledger()
    assert.equal(first.get('0106'), files.get('0106'), 'the ledger already records 0106, as written')
    assert.equal(first.has('0105'), false, 'and not 0105')
    const snapshotBefore = await snapshotDef()

    // Refused while 0105 is missing (each answer is asked again, never remembered as false).
    const p = await researchProject(empty.ownerUrl, pool)
    assert.deepEqual([await ready(on), await ready(off)], [503, 503])
    assert.equal((await http(on, p.EDIT, 'GET /api/v1/me/api-resources')).status, 503)
    assert.equal((await http(off, p.VIEW, previewUrl(p.projectId))).status, 503)
    assert.equal(await codeOf(admitMaintained(pool, p)), NOT_INSTALLED)

    const report = await withClusterMigrationLock(() => migrate(empty.ownerUrl, resolve('db/migrations')))
    assert.deepEqual(
      report.rows.filter((r) => r.status !== 'already_applied').map((r) => [r.version, r.status]),
      [['0105', 'applied']],
      'only the pending 0105 was applied',
    )
    const second = await ledger()
    assert.equal(second.get('0106'), first.get('0106'), '0106 keeps its recorded checksum')
    assert.equal(second.get('0105'), files.get('0105'))
    assert.equal(await snapshotDef(), snapshotBefore, '0106’s role-first snapshot is unchanged by 0105')
    assert.equal(await atomicAdmissionInstalled(pool), true)
    assert.equal(await atomicAdmissionInstalled(worker), true)

    // The same instances, never restarted: ready, served, and the viewer still answered role first.
    assert.deepEqual([await ready(on), await ready(off)], [200, 200])
    assert.equal((await http(on, p.EDIT, 'GET /api/v1/me/api-resources')).status, 200)
    const viewer = await http(off, p.VIEW, previewUrl(p.projectId))
    assert.equal(viewer.status, 200, viewer.body)
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(RESTRICTED).map((k) => [k, parseSelectionView(viewer.json)[k as keyof typeof RESTRICTED]]),
      ),
      RESTRICTED,
      'a viewer gets the uniform restricted view',
    )
    // An editor evaluates (200, shared disclosure; sharedCount asserts both): no API contribution is granted here.
    assert.equal(sharedCount(await http(off, p.EDIT, previewUrl(p.projectId))), 0)
    const admitted = await admitMaintained(pool, p)
    assert.ok('admitted' in admitted, JSON.stringify(admitted))
  })
})

describe('the teardown fence: an owned client’s actual end, before its database is dropped (E62-SQL-F01)', () => {
  let db: TestDatabase
  let owner: pg.Pool

  before(async () => {
    db = await createTestDatabase()
    owner = owned(new pg.Pool({ connectionString: db.ownerUrl, max: 1 }))
  })
  after(async () => {
    await endOwned(owner)
    await db.drop()
  })

  it('a pool’s end resolves while its client is still connected; the drain waits for that client’s actual end', async () => {
    // A test-local client whose end() is held until this test releases it: the window the e62 CI failure fell into,
    // made deterministic. Only this client class is instrumented, through pg-pool's public `Client` option.
    const { promise: held, resolve: release } = Promise.withResolvers<void>()
    class HeldClient extends pg.Client {
      override end(): Promise<void>
      override end(callback: (err: Error) => void): void
      override end(callback?: (err: Error) => void): Promise<void> | undefined {
        const ended = held.then(() => super.end())
        if (!callback) return ended
        void ended.then(() => (callback as () => void)())
        return undefined
      }
    }
    const pool = owned(new pg.Pool({ connectionString: db.apiUrl, max: 1, Client: HeldClient }))
    let poolEnded = false
    const order: string[] = []
    try {
      const client = await pool.connect()
      const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid
      client.release()
      assert.ok(pid)
      const connected = async () =>
        Number(
          (await owner.query<{ n: string }>('SELECT count(*) AS n FROM pg_stat_activity WHERE pid = $1', [pid])).rows[0]
            ?.n,
        )

      await pool.end()
      poolEnded = true
      order.push('pool.end resolved')
      assert.equal(await connected(), 1, 'Pool.end() resolved while the owned backend is still connected')
      let drained = false
      const drain = clientsEnded(pool).then(() => {
        drained = true
        order.push('owned client ended')
      })
      assert.equal(await connected(), 1, 'still connected while its end is held')
      assert.equal(drained, false, 'the drain does not resolve before the owned client actually ends')

      release()
      await drain
      assert.equal(await connected(), 0, 'after the drain, no owned backend remains to be terminated by a drop')
      order.push('drop may run')
      assert.deepEqual(order, ['pool.end resolved', 'owned client ended', 'drop may run'])
    } finally {
      release()
      if (!poolEnded) await pool.end()
      await clientsEnded(pool)
    }
  })
})
