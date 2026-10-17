// D-Q13, the approved trusted-creator exception, on an exclusively owned cluster shaped like hosted Supabase: its
// bootstrap superuser is not postgres, and postgres is a plain CREATEROLE/CREATEDB login that owns the database and
// schema sophia (the installation owner the activation check already binds). When postgres creates the assembler role
// (0070) or an execution login (conversation_admit_assembler_login), PostgreSQL makes it the new role's creator: one
// ADMIN edge, granted by the bootstrap superuser, with no SET and no INHERIT, which postgres cannot revoke. Exactly that
// edge, on a role created fresh in the same transaction and recorded as it is made, is accepted. Every other
// membership, attribute, dependency, second installation and pre-existing role stays refused, before anything is
// granted. The trusted owner can still grant itself SET on either role: this does not isolate the roles from it.
// Requires the explicit marker AND the owned loopback cluster (scripts/q13-owned-pg16-inner.sh makes one). No provider,
// runtime or model executes; the runtime and the assembler are local and synthetic.
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { registerRuntime, seedProject } from '@sophia/test-support'
import { assembleReply, type AssemblyLimits } from './conversation-assembly.ts'
import { migrate, sendConversationMessage, startConversation, withActor } from './index.ts'

const enabled = process.env.SOPHIA_Q13_TRUSTED_CREATOR === 'con01-q13-trusted-creator-v1'
const installerUrl = process.env.SOPHIA_DISPOSABLE_DATABASE_URL ?? ''
const ROLE = 'sophia_conversation_assembler'
const MARK = 'con01-q13-fresh-creator v1'
const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations/', import.meta.url))
const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .toSorted()
const before0070 = files.filter((f) => f < '0070')
const through0070 = files.filter((f) => f < '0071')
const activation = readFileSync(
  new URL('../../../db/candidates/con01-s3-assembler-activation-check.sql', import.meta.url),
  'utf8',
).replace(":'login'", '$1')
const suffix = randomBytes(5).toString('hex')
const target = `con01_q13_tc_${suffix}`
const second = `con01_q13_tc2_${suffix}`
const outside = `con01_q13_tc_out_${suffix}`
const other = `con01_q13_other_${suffix}`
const login = `con01_q13_login_${suffix}`
const oldLogin = `con01_q13_old_${suffix}`
const api = `con01_q13_api_${suffix}`
const worker = `con01_q13_worker_${suffix}`
const A = randomUUID()
const E = randomUUID()
const ROUTE = 'route-test'
const LIMITS: AssemblyLimits = {
  leaseMs: 6_000,
  deadlineMs: 2_000,
  connectMs: 1_000,
  statementTimeoutMs: 1_000,
  lockTimeoutMs: 500,
  idleInTransactionMs: 1_000,
  connectionCheckMs: 500,
}
const clients = new Set<pg.Client>()
let bootstrap = ''

const urlOf = (role: string, database: string) => {
  const u = new URL(installerUrl)
  u.username = role
  u.password = ''
  u.pathname = `/${database}`
  return u.href
}

async function connect(role: string, database: string): Promise<pg.Client> {
  const c = new pg.Client({
    connectionString: urlOf(role, database),
    connectionTimeoutMillis: 2000,
    query_timeout: 10_000,
  })
  await c.connect()
  clients.add(c)
  return c
}

async function end(c: pg.Client): Promise<void> {
  await c.end()
  clients.delete(c)
}

async function once<T extends pg.QueryResultRow>(role: string, database: string, sql: string, params: unknown[] = []) {
  const c = await connect(role, database)
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await end(c)
  }
}

/**
 * The repository's migration runner (one transaction per file, its ledger row inside it) over the named files only,
 * as `role`, optionally with session settings: null, or the database error of the file it rolled back.
 */
async function migrateAs(
  role: string,
  database: string,
  names: readonly string[],
  settings = '',
): Promise<pg.DatabaseError | null> {
  const dir = mkdtempSync(join(tmpdir(), 'con01-q13-tc-'))
  try {
    for (const name of names) copyFileSync(join(MIGRATIONS, name), join(dir, name))
    const u = new URL(urlOf(role, database))
    if (settings) u.searchParams.set('options', settings)
    await migrate(u.href, dir)
    return null
  } catch (error) {
    if (error instanceof Error && error.cause instanceof pg.DatabaseError) return error.cause
    throw error
  } finally {
    rmSync(dir, { recursive: true })
  }
}

/** Whether the assembler role exists, and what this database grants it (its pg_shdepend rows here). */
async function assembler(database: string) {
  const [row] = await once<{ present: boolean; held: number }>(
    'postgres',
    database,
    `SELECT EXISTS(SELECT FROM pg_roles WHERE rolname=$1) AS present,
       (SELECT count(*)::int FROM pg_shdepend d JOIN pg_roles r ON r.oid=d.refobjid WHERE r.rolname=$1
         AND d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())) AS held`,
    [ROLE],
  )
  return row
}

/** Every membership edge touching a role, as the catalog holds it. */
async function edges(c: pg.Client, role: string) {
  return (
    await c.query<{
      edge: string
      role: string
      member: string
      grantor: string
      admin: boolean
      inherit: boolean
      set: boolean
    }>(
      `SELECT m.oid::text AS edge, m.roleid::regrole::text AS role, m.member::regrole::text AS member,
         m.grantor::text AS grantor, m.admin_option AS admin, m.inherit_option AS inherit, m.set_option AS set
       FROM pg_auth_members m WHERE m.roleid=to_regrole($1) OR m.member=to_regrole($1) ORDER BY m.oid`,
      [role],
    )
  ).rows
}

const recorded = async (c: pg.Client, role: string) =>
  (await c.query<{ c: string | null }>(`SELECT shobj_description(to_regrole($1),'pg_authid') AS c`, [role])).rows[0]?.c

const admitted = async (c: pg.Client) =>
  (await c.query<{ ok: boolean }>('SELECT sophia.conversation_assembler_admitted() AS ok')).rows[0]?.ok

async function holds(c: pg.Client, who = login): Promise<string[]> {
  await c.query('SET search_path=pg_catalog')
  return (await c.query<{ what: string }>(activation, [who])).rows.map((r) => r.what)
}

/** Refuse before any permission changes unless this is the fresh loopback cluster the outer helper owns. */
async function requireOwned(installer: pg.Client): Promise<void> {
  assert.equal(new URL(installerUrl).hostname, '127.0.0.1')
  const [me] = (
    await installer.query<{
      user: string
      session: string
      superuser: boolean
      createrole: boolean
      createdb: boolean
      bootstrap: string
      bootsuper: boolean
      selfgrant: string
    }>(
      `SELECT current_user AS user, session_user AS session, r.rolsuper AS superuser, r.rolcreaterole AS createrole,
         r.rolcreatedb AS createdb, b.rolname AS bootstrap, b.rolsuper AS bootsuper,
         current_setting('createrole_self_grant') AS selfgrant
       FROM pg_roles r, pg_roles b WHERE r.rolname=current_user AND b.oid=10`,
    )
  ).rows
  assert.ok(me)
  assert.deepEqual(
    [me.user, me.session, me.superuser, me.createrole, me.createdb, me.bootsuper, me.selfgrant],
    ['postgres', 'postgres', false, true, true, true, ''],
    'postgres is the plain CREATEROLE/CREATEDB installer; OID 10 is the superuser; the self-grant default',
  )
  assert.notEqual(me.bootstrap, 'postgres')
  bootstrap = me.bootstrap
  const boot = await connect(bootstrap, 'postgres')
  try {
    const [row] = (
      await boot.query<{ path: string; clients: number }>(
        `SELECT current_setting('data_directory') AS path,
          (SELECT count(*)::int FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()) AS clients`,
      )
    ).rows
    assert.ok(row)
    assert.ok(basename(dirname(row.path)).startsWith('con01-q13-owned-pg-'))
    assert.equal(basename(row.path), 'data')
    assert.equal(statSync(dirname(row.path)).uid, process.getuid?.())
    assert.equal(statSync(dirname(row.path)).mode & 0o777, 0o700)
    assert.equal(row.clients, 1, 'exclusive cluster: only the installer connection besides this one')
  } finally {
    await end(boot)
  }
}

/**
 * 0070 alone, run as `role` on the target after any session setting: refused by its own guard, as 42501, in its own
 * transaction, so `role` is left with nothing of it. Not through the runner: its ledger needs CREATE on the database,
 * which a stranger or a non-owner lacks, and the guard is what is under test.
 */
async function guardRefuses(role: string, reason: RegExp, settings = '') {
  const c = await connect(role, target)
  try {
    if (settings) await c.query(settings)
    await assert.rejects(
      c.query(readFileSync(join(MIGRATIONS, '0070_conversation_assembler_role_binding.sql'), 'utf8')),
      (error: unknown) => error instanceof pg.DatabaseError && error.code === '42501' && reason.test(error.message),
    )
    await c.query('ROLLBACK')
  } finally {
    await end(c)
  }
}

/** A refused 0070, leaving no assembler role and nothing granted to one. */
async function refused(role: string, reason: RegExp, settings = '') {
  await guardRefuses(role, reason, settings)
  assert.deepEqual(await assembler(target), { present: false, held: 0 })
}

describe(
  'D-Q13: the trusted owner creates the assembler and its login fresh (owned cluster, no hosted effects)',
  {
    skip: !enabled,
  },
  () => {
    let installer: pg.Client
    let owner: pg.Client
    let boot: pg.Client
    let pools: { owner: pg.Pool; api: pg.Pool; worker: pg.Pool } | undefined
    const made = new Set<string>()

    before(async () => {
      installer = await connect('postgres', 'postgres')
      await requireOwned(installer)
      boot = await connect(bootstrap, 'postgres')
      await installer.query(`CREATE DATABASE ${target}`)
      made.add(target)
      owner = await connect('postgres', target)
      assert.equal(await migrateAs('postgres', target, before0070), null, '0001–0069 as the trusted owner')
    })

    after(async () => {
      if (pools) await Promise.all([pools.owner.end(), pools.api.end(), pools.worker.end()])
      for (const c of clients) {
        if (c === boot) continue
        await c.query('ROLLBACK').catch(() => undefined)
        await end(c)
      }
      try {
        for (const name of made) await boot.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
        // What the activation stage revoked from PUBLIC, given back, so the owned cluster can run this file again.
        await boot.query('GRANT CONNECT ON DATABASE postgres TO PUBLIC; GRANT CONNECT ON DATABASE template1 TO PUBLIC')
        await boot.query(`DROP ROLE IF EXISTS ${login},${oldLogin},${api},${worker},${other},${ROLE}`)
      } finally {
        await end(boot)
      }
    })

    it('refuses, before any grant, every 0070 that is not the trusted owner’s own fresh creation', async () => {
      assert.deepEqual(await assembler(target), { present: false, held: 0 })
      // Another non-superuser installer: its creator edge is not the trusted owner's.
      await boot.query(`CREATE ROLE ${other} LOGIN NOSUPERUSER CREATEROLE`)
      await refused(other, /unexpected memberships/)
      // The trusted name without its ownership: the database, or schema sophia, owned by someone else.
      await boot.query(`ALTER DATABASE ${target} OWNER TO ${other}`)
      try {
        await refused('postgres', /unexpected memberships/)
      } finally {
        await boot.query(`ALTER DATABASE ${target} OWNER TO postgres`)
      }
      const sophia = await connect(bootstrap, target)
      try {
        await sophia.query(`ALTER SCHEMA sophia OWNER TO ${other}`)
        try {
          await refused('postgres', /unexpected memberships/)
        } finally {
          await sophia.query('ALTER SCHEMA sophia OWNER TO postgres')
        }
      } finally {
        await end(sophia)
      }
      // A creator edge PostgreSQL makes otherwise than by default (createrole_self_grant): SET and INHERIT on.
      await refused('postgres', /unexpected memberships/, "SET createrole_self_grant='set, inherit'")
      // A role found already made, even by the trusted owner and even with its record forged, is never adopted.
      await owner.query(`CREATE ROLE ${ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`)
      try {
        const lookalike = async () => {
          await guardRefuses('postgres', /unexpected memberships/)
          const kept = await owner.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [ROLE])
          assert.equal(kept.rowCount, 1, 'left as found: nothing revoked or adopted')
          assert.equal((await assembler(target))?.held, 0, 'nothing granted to it')
        }
        await lookalike()
        await owner.query(`DO $$ BEGIN EXECUTE format('COMMENT ON ROLE ${ROLE} IS %L', '${MARK} edge='||
        (SELECT m.oid FROM pg_auth_members m WHERE m.roleid='${ROLE}'::regrole)||' installer='||'postgres'::regrole::oid); END $$`)
        await lookalike()
      } finally {
        await owner.query(`DROP ROLE ${ROLE}`)
      }
      assert.deepEqual(await assembler(target), { present: false, held: 0 }, 'each refusal rolled back')
    })

    it('installs fresh as the trusted owner: the one mandatory creator edge, recorded, and nothing else', async () => {
      assert.equal(await migrateAs('postgres', target, files), null, '0070 and 0071 as the trusted owner')
      const [installerOid] = (await owner.query<{ oid: string }>(`SELECT 'postgres'::regrole::oid::text AS oid`)).rows
      const found = await edges(owner, ROLE)
      assert.equal(found.length, 1, JSON.stringify(found))
      assert.deepEqual(
        { ...found[0], edge: undefined },
        { edge: undefined, role: ROLE, member: 'postgres', grantor: '10', admin: true, inherit: false, set: false },
      )
      assert.equal(
        await recorded(owner, ROLE),
        `${MARK} edge=${found[0]?.edge ?? ''} installer=${installerOid?.oid ?? ''}`,
      )
      const deps = await owner.query<{ here: boolean; owns: boolean }>(
        `SELECT d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AS here, d.deptype='o' AS owns
       FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=$1::regrole`,
        [ROLE],
      )
      assert.ok(deps.rows.length > 0 && deps.rows.every((d) => d.here && !d.owns), 'grants here alone; owns nothing')
      const ledger = await owner.query<{ version: string }>(
        `SELECT version FROM sophia_meta.schema_migrations WHERE version IN ('0070','0071') ORDER BY version`,
      )
      assert.deepEqual(
        ledger.rows.map((r) => r.version),
        ['0070', '0071'],
      )
    })

    it('still refuses a second installation in the same cluster', async () => {
      await installer.query(`CREATE DATABASE ${second}`)
      made.add(second)
      assert.equal(await migrateAs('postgres', second, before0070), null)
      const failure = await migrateAs('postgres', second, through0070)
      assert.equal(failure?.code, '42501')
      assert.match(failure?.message ?? '', /unexpected memberships/)
      await boot.query(`DROP DATABASE ${second} WITH (FORCE)`)
      made.delete(second)
    })

    it('admits only a login it creates fresh: never an existing one, never for another caller or self-grant', async () => {
      // An existing login, made by the trusted owner and granted the role by hand: not admitted, not adoptable.
      await owner.query(`CREATE ROLE ${oldLogin} LOGIN NOINHERIT; GRANT ${ROLE} TO ${oldLogin} WITH SET TRUE, ADMIN FALSE;
      GRANT CONNECT ON DATABASE ${target} TO ${oldLogin}`)
      assert.equal(await admitted(owner), false, 'a login the owner made earlier is not admitted')
      assert.ok((await holds(owner, oldLogin)).includes('the login has a member: postgres'))
      await assert.rejects(owner.query('SELECT sophia.conversation_admit_assembler_login($1)', [oldLogin]), {
        code: '42501',
      })
      await owner.query(`REVOKE CONNECT ON DATABASE ${target} FROM ${oldLogin}; DROP ROLE ${oldLogin}`)
      // Only the trusted owner itself, with the self-grant default.
      const superuser = await connect(bootstrap, target)
      try {
        await assert.rejects(superuser.query('SELECT sophia.conversation_admit_assembler_login($1)', [login]), {
          code: '42501',
        })
      } finally {
        await end(superuser)
      }
      await owner.query("SET createrole_self_grant='set'")
      try {
        await assert.rejects(owner.query('SELECT sophia.conversation_admit_assembler_login($1)', [login]), {
          code: '42501',
        })
      } finally {
        await owner.query('RESET createrole_self_grant')
      }
      assert.equal((await owner.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [login])).rowCount, 0, 'rolled back')

      await owner.query('SELECT sophia.conversation_admit_assembler_login($1)', [login])
      const found = await edges(owner, login)
      assert.deepEqual(
        found.map((e) => ({ ...e, edge: undefined })),
        [
          { edge: undefined, role: login, member: 'postgres', grantor: '10', admin: true, inherit: false, set: false },
          {
            edge: undefined,
            role: ROLE,
            member: login,
            grantor: (await owner.query<{ o: string }>(`SELECT 'postgres'::regrole::oid::text AS o`)).rows[0]?.o,
            admin: false,
            inherit: false,
            set: true,
          },
        ],
      )
      const creator = found.find((e) => e.role === login)
      assert.equal(
        await recorded(owner, login),
        `${MARK} edge=${creator?.edge ?? ''} installer=${(await owner.query<{ o: string }>(`SELECT 'postgres'::regrole::oid::text AS o`)).rows[0]?.o ?? ''}`,
      )
      const deps = await owner.query<{ kind: string; place: string }>(
        `SELECT d.classid::regclass::text AS kind, coalesce((SELECT datname FROM pg_database WHERE oid=d.objid),'?') AS place
       FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=$1::regrole`,
        [login],
      )
      assert.deepEqual(deps.rows, [{ kind: 'pg_database', place: target }], 'CONNECT on the target alone')
      assert.equal(await admitted(owner), true)
    })

    it('its Ask waits for context, the admitted login records it under SET LOCAL ROLE, and the create dispatches', async () => {
      await owner.query(`CREATE ROLE ${api} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT sophia_api TO ${api}; GRANT CONNECT ON DATABASE ${target} TO ${api};
      CREATE ROLE ${worker} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT sophia_worker TO ${worker}; GRANT CONNECT ON DATABASE ${target} TO ${worker}`)
      pools = {
        owner: new pg.Pool({ connectionString: urlOf('postgres', target), max: 2 }),
        api: new pg.Pool({ connectionString: urlOf(api, target), max: 2 }),
        worker: new pg.Pool({ connectionString: urlOf(worker, target), max: 2 }),
      }
      const p = pools
      // Restricted: without SET LOCAL ROLE the login reads nothing; with it, the assembler's surface alone.
      const asLogin = await connect(login, target)
      try {
        await assert.rejects(asLogin.query('SELECT count(*) FROM sophia.projects'), { code: '42501' })
        await asLogin.query('BEGIN')
        await asLogin.query(`SET LOCAL ROLE ${ROLE}`)
        assert.equal((await asLogin.query('SELECT sophia.conversation_assembly_project() AS p')).rows[0]?.p, null)
        await assert.rejects(asLogin.query('SELECT count(*) FROM sophia.outbox'), { code: '42501' })
        await asLogin.query('ROLLBACK')
      } finally {
        await end(asLogin)
      }
      const ownerUrl = urlOf('postgres', target)
      const { projectId } = await seedProject(ownerUrl, { admin: A, editors: [E] })
      await p.owner.query("SELECT sophia.set_conversation_settings($1,'enabled','con01-q13-trusted-creator-test')", [
        projectId,
      ])
      const rt = await registerRuntime(ownerUrl, { projectId, admin: A, runtimeUnitId: 'sophia-runtime-test' })
      const hash = createHash('sha256').update(rt.token).digest()
      const bridge = randomUUID()
      const call = (op: string, body: unknown) =>
        p.api.query(`SELECT sophia.runtime_${op}($1,$2,$3,$4::jsonb) AS v`, [hash, rt.runtimeUnitId, bridge, body])
      await call('hello', {
        protocolVersion: 1,
        roles: [{ id: 'sophia-conversation-v1', route: ROUTE, presetDigest: 'synthetic' }],
      })
      await call('record_ready', { state: 'ready', reason: null, unrecovered: [] })
      await p.owner.query('SELECT sophia.conversation_new_lineage($1,$2::jsonb)', [
        projectId,
        {
          unit: 'calls_tokens',
          routeId: ROUTE,
          credentialRef: 'synthetic-credential-ref',
          ownerResourceRef: 'synthetic-owner-resource-ref',
          approvalRef: `con01-q13-tc-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          maxCallsPerReply: 2,
          totalCallCap: 10,
          replyTokenCap: 100_000,
          totalTokenCap: 500_000,
          subjects: [E],
        },
      ])
      const first = await withActor(p.api, E, 'write', (c) =>
        startConversation(c, projectId, randomUUID(), { title: 'Ask', text: 'Opening.', askSophia: false }, 'E'),
      )
      const asked = await withActor(p.api, E, 'write', (c) =>
        sendConversationMessage(c, first.conversationId, randomUUID(), { text: 'A question.', askSophia: true }, 'E'),
      )
      assert.ok(asked.replyId)
      const state = async () =>
        (
          await p.owner.query<{ state: string; reason: string | null }>(
            'SELECT state,reason FROM sophia.conversation_replies WHERE id=$1',
            [asked.replyId],
          )
        ).rows[0]
      assert.deepEqual(await state(), { state: 'pending', reason: null }, 'admitted: not context_assembler_unbound')
      const dispatch = async () => {
        const lease = randomUUID()
        const row = (
          await p.owner.query<{ id: string }>(
            `UPDATE sophia.outbox SET state='dispatching',lease_owner='test-worker',lease_token=$3,
            lease_until=clock_timestamp()+interval '30 seconds',attempts=attempts+1, available_at=now()
           WHERE project_id=$1 AND conversation_reply_id=$2 AND destination='native.create' AND state='pending' RETURNING id`,
            [projectId, asked.replyId, lease],
          )
        ).rows[0]
        assert.ok(row, 'a pending create')
        return (
          await p.worker.query<{ v: { result: string; reason?: string } }>(
            'SELECT sophia.dispatch_runtime_outbox($1,$2,$3) AS v',
            [projectId, row.id, lease],
          )
        ).rows[0]?.v
      }
      assert.deepEqual(await dispatch(), { result: 'deferred', reason: 'waiting for reply context' })
      assert.equal((await assembleReply(urlOf(login, target), asked.replyId ?? '', LIMITS)).outcome, 'recorded')
      assert.equal((await dispatch())?.result, 'dispatched')
    })

    it('denies other databases by fresh connections; an old session holds until its client closes; then no hold', async (t) => {
      await boot.query(`CREATE DATABASE ${outside} TEMPLATE template0`)
      made.add(outside)
      const stage = async (label: string) => {
        const now = await holds(owner)
        t.diagnostic(`${label}: ${JSON.stringify(now)}`)
        return now
      }
      const deniedTo = (database: string) =>
        assert.rejects(
          connect(login, database),
          (err: unknown) => err instanceof pg.DatabaseError && err.code === '42501',
        )
      const initial = await stage('admitted, no session')
      assert.ok(initial.includes(`admitted to ${outside} (PUBLIC CONNECT)`))
      const old = await connect(login, outside)
      assert.equal((await old.query('SELECT current_user AS u')).rows[0]?.u, login)
      assert.ok((await stage('admitted, old session open')).some((h) => h.startsWith(`session open in ${outside} `)))
      for (const database of [outside, 'postgres', 'template1'])
        await boot.query(`REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`)
      await owner.query(`REVOKE TEMPORARY ON DATABASE ${target} FROM PUBLIC`)
      for (const database of [outside, 'postgres', 'template1']) await deniedTo(database)
      assert.equal(
        (await old.query('SELECT 42 AS alive')).rows[0]?.alive,
        42,
        'revocation did not settle the old session',
      )
      const revoked = await stage('revoked, old session open')
      assert.ok(!revoked.some((h) => h.startsWith('admitted to ')))
      assert.ok(revoked.some((h) => h.startsWith(`session open in ${outside} `)))
      await end(old)
      assert.deepEqual(await stage('revoked, old session closed'), [])
    })

    it('holds and stops admitting on any drift from the one recorded creator edge', async () => {
      assert.deepEqual(await holds(owner), [])
      assert.equal(await admitted(owner), true)
      const drift = async (c: pg.Client, setup: string, expected: RegExp) => {
        await c.query('BEGIN')
        try {
          await c.query(setup)
          const now = await holds(c)
          assert.ok(
            now.some((h) => expected.test(h)),
            `${setup}: expected ${String(expected)} in ${JSON.stringify(now)}`,
          )
          assert.equal(await admitted(c), false, `${setup}: admission stops`)
        } finally {
          await c.query('ROLLBACK')
        }
      }
      const repoint = (role: string) =>
        `DO $$ BEGIN EXECUTE format('COMMENT ON ROLE %I IS %L', '${role}', '${MARK} edge='||
        (SELECT m.oid FROM pg_auth_members m WHERE m.roleid='${role}'::regrole AND m.member='postgres'::regrole)||
        ' installer='||'postgres'::regrole::oid); END $$`
      // Extra inbound edges on the login: another member, or the owner's own SET grant beside its creator edge.
      await drift(
        owner,
        `CREATE ROLE con01_q13_peer NOLOGIN; GRANT ${login} TO con01_q13_peer`,
        /the login has a member: con01_q13_peer/,
      )
      await drift(owner, `GRANT ${login} TO postgres WITH SET TRUE`, /the login has a member: postgres/)
      // An extra outbound edge.
      await drift(owner, `GRANT sophia_api TO ${login}`, /member of sophia_api/)
      // The record missing, or naming another edge.
      await drift(owner, `COMMENT ON ROLE ${login} IS NULL`, /the login has a member: postgres/)
      await drift(owner, `COMMENT ON ROLE ${login} IS '${MARK} edge=0 installer=0'`, /the login has a member: postgres/)
      // The assembler: the owner's SET grant beside its creator edge, or its record missing (its own hold).
      const assemblerDrift = async (setup: string) => {
        await owner.query('BEGIN')
        try {
          await owner.query(setup)
          assert.ok((await holds(owner)).includes('a member of the assembler is not a bare login: postgres'), setup)
        } finally {
          await owner.query('ROLLBACK')
        }
      }
      await assemblerDrift(`GRANT ${ROLE} TO postgres WITH SET TRUE`)
      await assemblerDrift(`COMMENT ON ROLE ${ROLE} IS NULL`)
      // As a superuser: the owner no longer owns the database; the creator edge replaced by another grantor's (whose
      // own membership also holds), with the record re-pointed at it.
      const su = await connect(bootstrap, target)
      try {
        await drift(su, `ALTER DATABASE ${target} OWNER TO ${other}`, /the login has a member: postgres/)
        await drift(
          su,
          `CREATE ROLE con01_q13_mid NOLOGIN CREATEROLE; GRANT ${login} TO con01_q13_mid WITH ADMIN TRUE;
         REVOKE ${login} FROM postgres; SET ROLE con01_q13_mid;
         GRANT ${login} TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE; RESET ROLE; ${repoint(login)}`,
          /the login has a member: postgres/,
        )
      } finally {
        await end(su)
      }
      assert.deepEqual(await holds(owner), [], 'every drift rolled back')
      assert.equal(await admitted(owner), true)
    })
  },
)
