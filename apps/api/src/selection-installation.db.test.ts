// INC04-S01b R2 (PR519-950D F01, F02): the installed boundaries the selection preview and member API contributions
// promise, through buildApp with a verified token, the production API role and real PostgreSQL. Level: sql-run.
// * F01: a current viewer's answer is decided in SQL before the pool (0106). A SYNTHETIC helper fault and an owned
//   relation lock are regression witnesses that the viewer's request never enters the pool's helpers or tables; the
//   matched editor request does. These are new causal checks, not evidence that a deployed database ever failed.
// * F02: with contributions on, /ready and the contribution routes' own installation check require everything they
//   promise (0094, 0100, 0104's protection and qualification, 0106). Real partial schemas are built from exact prefixes
//   of this tree's own migrations. A refused write leaves no account change, idempotency row or command.
// Every account, grant, resource and token is SYNTHETIC; nothing here qualifies a real owner, account or route.
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { parseSelectionView } from '@sophia/contracts/validate'
import { contributionWrite, createPool, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
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
    pool = createPool(db.apiUrl, { max: 8 })
    owner = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
    app = buildApp({ pool, verifyActor, logger: { stream: { write: (line: string) => lines.push(line) } } })
    await app.ready()
  })
  after(async () => {
    await app.close()
    await pool.end()
    await owner.end()
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

for (const [upTo, label] of [
  ['0101', 'through 0100'],
  ['0104', 'through 0102, without 0104'],
  ['0106', 'with 0104, without 0106'],
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
      pool = createPool(db.apiUrl, { max: 4 })
      owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
      on = buildApp({ pool, verifyActor, apiContributions: true })
      off = buildApp({ pool, verifyActor })
      await on.ready()
      await off.ready()
    })
    after(async () => {
      await on.close()
      await off.close()
      await pool.end()
      await owner.end()
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
      assert.deepEqual(readiness, { on: 503, off: 200 }, 'not ready with contributions on; off (the default) as before')
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
    pool = createPool(db.apiUrl, { max: 4 })
    owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
    on = buildApp({ pool, verifyActor, apiContributions: true })
    off = buildApp({ pool, verifyActor })
    await on.ready()
    await off.ready()
  })
  after(async () => {
    await on.close()
    await off.close()
    await pool.end()
    await owner.end()
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
