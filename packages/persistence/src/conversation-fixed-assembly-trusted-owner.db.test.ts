// 0084 (FND-B-ASK-ALTERNATIVE-01) on an exclusively owned cluster shaped like hosted Supabase: its bootstrap superuser is
// not postgres, and postgres is a plain CREATEROLE/CREATEDB login that owns the database and schema sophia, so it
// installs everything (0001-0084) and switches the mode as the trusted installation owner, not as a superuser. The
// switch's temporary edges are its own: SET (and INHERIT, to take functions back) on the assembler and CREATE on schema
// sophia for it, each granted and revoked inside the act. Here: template1's PUBLIC CONNECT stays, as on the managed
// cluster, so the login route's Q13 holds; the fixed mode is enabled, checked, used for a real reply, disabled and
// enabled again, and every edge it leaves is exactly the recorded creator edge.
// Requires the explicit marker AND the owned loopback cluster. No provider, runtime or model executes.
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { registerRuntime, seedProject } from '@sophia/test-support'
import { assembleReply, type AssemblyLimits } from './conversation-assembly.ts'
import { migrate, sendConversationMessage, startConversation, withActor } from './index.ts'

const enabled = process.env.SOPHIA_FIXED_ASSEMBLY_TRUSTED_OWNER === 'fnd-b-ask-alternative-v1'
const installerUrl = process.env.SOPHIA_DISPOSABLE_DATABASE_URL ?? ''
const ROLE = 'sophia_conversation_assembler'
const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations/', import.meta.url))
const check = (name: string) => readFileSync(new URL(`../../../db/candidates/${name}`, import.meta.url), 'utf8')
const LOGIN_CHECK = check('con01-s3-assembler-activation-check.sql').replace(":'login'", '$1')
const FIXED_CHECK = check('con01-fixed-assembly-activation-check.sql')
const suffix = randomBytes(5).toString('hex')
const target = `fnd_b_fixed_${suffix}`
const login = `fnd_b_fixed_login_${suffix}`
const api = `fnd_b_fixed_api_${suffix}`
const worker = `fnd_b_fixed_worker_${suffix}`
const password = randomBytes(12).toString('hex')
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

const urlOf = (role: string, database: string, secret = '') => {
  const u = new URL(installerUrl)
  u.username = role
  u.password = secret
  u.pathname = `/${database}`
  return u.href
}

async function connect(role: string, database: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: urlOf(role, database), connectionTimeoutMillis: 2000 })
  await c.connect()
  return c
}

/** Every membership edge of the assembler, as the catalog holds it. */
async function edges(c: pg.Client) {
  return (
    await c.query<{ member: string; grantor: string; admin: boolean; inherit: boolean; set: boolean }>(
      `SELECT m.member::regrole::text AS member, m.grantor::regrole::text AS grantor, m.admin_option AS admin,
         m.inherit_option AS inherit, m.set_option AS set
       FROM pg_auth_members m WHERE m.roleid=to_regrole($1) OR m.member=to_regrole($1) ORDER BY m.oid`,
      [ROLE],
    )
  ).rows
}

const owners = async (c: pg.Client) =>
  (
    await c.query<{ o: string }>(
      `SELECT DISTINCT p.proowner::regrole::text AS o FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='sophia' AND p.proname ~ '^conversation_assembly_(read_|count_|has_)'`,
    )
  ).rows.map((r) => r.o)

async function holds(c: pg.Client, sql: string, args: unknown[] = []): Promise<string[]> {
  await c.query('SET search_path=pg_catalog')
  try {
    return (await c.query<{ what: string }>(sql, args)).rows.map((r) => r.what)
  } finally {
    await c.query('RESET search_path')
  }
}

/**
 * Refuse before any permission changes unless this is the fresh loopback cluster shaped like the managed one. The data
 * directory is the bootstrap superuser's to read (postgres may not examine it): its own connection, closed here.
 */
async function requireOwned(installer: pg.Client): Promise<string> {
  assert.equal(new URL(installerUrl).hostname, '127.0.0.1')
  const [me] = (
    await installer.query<{ user: string; superuser: boolean; createrole: boolean; bootstrap: string }>(
      `SELECT current_user AS user, r.rolsuper AS superuser, r.rolcreaterole AS createrole, b.rolname AS bootstrap
       FROM pg_roles r, pg_roles b WHERE r.rolname=current_user AND b.oid=10`,
    )
  ).rows
  assert.ok(me)
  assert.deepEqual(
    [me.user, me.superuser, me.createrole],
    ['postgres', false, true],
    'postgres: CREATEROLE, no superuser',
  )
  assert.notEqual(me.bootstrap, 'postgres')
  const boot = await connect(me.bootstrap, 'postgres')
  try {
    const [row] = (
      await boot.query<{ path: string; clients: number }>(
        `SELECT current_setting('data_directory') AS path,
          (SELECT count(*)::int FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()) AS clients`,
      )
    ).rows
    assert.ok(row)
    assert.ok(basename(dirname(row.path)).startsWith('fnd-b-ask-owned-pg-'))
    assert.equal(statSync(dirname(row.path)).mode & 0o777, 0o700)
    assert.equal(row.clients, 1, 'exclusive cluster: only the installer connection besides this one')
  } finally {
    await boot.end()
  }
  return me.bootstrap
}

describe(
  '0084 as the trusted installation owner (owned Supabase-shaped cluster, no hosted effects)',
  { skip: !enabled },
  () => {
    const held: { owner?: pg.Client; boot?: pg.Client } = {}
    /** The owner's connection to the target, made by before(). */
    const own = () => held.owner ?? assert.fail('no owner connection')

    before(async () => {
      const installer = await connect('postgres', 'postgres')
      let bootstrap: string
      try {
        bootstrap = await requireOwned(installer)
        await installer.query(`CREATE DATABASE ${target}`)
      } finally {
        await installer.end()
      }
      held.boot = await connect(bootstrap, 'postgres')
      await migrate(urlOf('postgres', target), MIGRATIONS)
      held.owner = await connect('postgres', target)
    })

    after(async () => {
      const { boot, owner } = held
      if (!boot) return
      await owner?.end().catch(() => undefined)
      await boot.query(`DROP DATABASE IF EXISTS ${target} WITH (FORCE)`)
      await boot.query(`DROP ROLE IF EXISTS ${login},${api},${worker},${ROLE}`)
      await boot.end()
    })

    it('the login route stays held (template1 PUBLIC CONNECT), and while its login exists the fixed mode is refused', async () => {
      assert.equal(
        (await own().query<{ s: boolean }>('SELECT rolsuper AS s FROM pg_roles WHERE rolname=current_user')).rows[0]?.s,
        false,
      )
      await own().query('SELECT sophia.conversation_admit_assembler_login($1)', [login])
      assert.ok((await holds(own(), LOGIN_CHECK, [login])).includes('admitted to template1 (PUBLIC CONNECT)'))
      await assert.rejects(own().query('SELECT sophia.conversation_enable_fixed_assembly()'), { code: '42501' })
      assert.deepEqual(await owners(own()), ['postgres'], 'refused before anything moved')
      // The login route retired: its login no longer a member (its own creator edge and CONNECT stay until it is dropped).
      await own().query(`REVOKE ${ROLE} FROM ${login}`)
    })

    it('enabled by the non-superuser owner: readers the assembler’s, only the creator edge left, its gate holds nothing', async () => {
      const kept = await edges(own())
      assert.equal(
        (await own().query<{ on: boolean }>('SELECT sophia.conversation_enable_fixed_assembly() AS on')).rows[0]?.on,
        true,
      )
      assert.deepEqual(await edges(own()), kept, 'the temporary SET edge is gone; the creator edge is as it was')
      assert.deepEqual(
        kept.map((e) => [e.member, e.admin, e.inherit, e.set]),
        [['postgres', true, false, false]],
      )
      assert.deepEqual(await owners(own()), [ROLE])
      const create = await own().query<{ c: boolean }>(`SELECT has_schema_privilege($1,'sophia','CREATE') AS c`, [ROLE])
      assert.equal(create.rows[0]?.c, false, 'its temporary CREATE is gone')
      assert.deepEqual(await holds(own(), FIXED_CHECK), [])
    })

    it('a real Ask is recorded through the worker’s own login and dispatched', async () => {
      await own()
        .query(`CREATE ROLE ${api} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT sophia_api TO ${api}; GRANT CONNECT ON DATABASE ${target} TO ${api};
      CREATE ROLE ${worker} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT sophia_worker TO ${worker}; GRANT CONNECT ON DATABASE ${target} TO ${worker}`)
      const pools = {
        api: new pg.Pool({ connectionString: urlOf(api, target, password), max: 2 }),
        worker: new pg.Pool({ connectionString: urlOf(worker, target, password), max: 2 }),
      }
      try {
        const ownerUrl = urlOf('postgres', target)
        const { projectId } = await seedProject(ownerUrl, { admin: A, editors: [E] })
        await own().query("SELECT sophia.set_conversation_settings($1,'enabled','fnd-b-ask-alternative-test')", [
          projectId,
        ])
        const rt = await registerRuntime(ownerUrl, { projectId, admin: A, runtimeUnitId: 'sophia-runtime-test' })
        const hash = createHash('sha256').update(rt.token).digest()
        const bridge = randomUUID()
        const call = (op: string, body: unknown) =>
          pools.api.query(`SELECT sophia.runtime_${op}($1,$2,$3,$4::jsonb) AS v`, [
            hash,
            rt.runtimeUnitId,
            bridge,
            body,
          ])
        await call('hello', {
          protocolVersion: 1,
          roles: [{ id: 'sophia-conversation-v1', route: ROUTE, presetDigest: 'synthetic' }],
        })
        await call('record_ready', { state: 'ready', reason: null, unrecovered: [] })
        await own().query('SELECT sophia.conversation_new_lineage($1,$2::jsonb)', [
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
        const first = await withActor(pools.api, E, 'write', (c) =>
          startConversation(c, projectId, randomUUID(), { title: 'Ask', text: 'Opening.', askSophia: false }, 'E'),
        )
        const asked = await withActor(pools.api, E, 'write', (c) =>
          sendConversationMessage(c, first.conversationId, randomUUID(), { text: 'A question.', askSophia: true }, 'E'),
        )
        const replyId = asked.replyId ?? ''
        const dispatch = async () => {
          const lease = randomUUID()
          const row = (
            await own().query<{ id: string }>(
              `UPDATE sophia.outbox SET state='dispatching',lease_owner='test-worker',lease_token=$3,
              lease_until=clock_timestamp()+interval '30 seconds',attempts=attempts+1, available_at=now()
             WHERE project_id=$1 AND conversation_reply_id=$2 AND destination='native.create' AND state='pending' RETURNING id`,
              [projectId, replyId, lease],
            )
          ).rows[0]
          assert.ok(row, 'a pending create')
          return (
            await pools.worker.query<{ v: { result: string } }>(
              'SELECT sophia.dispatch_runtime_outbox($1,$2,$3) AS v',
              [projectId, row.id, lease],
            )
          ).rows[0]?.v.result
        }
        assert.equal(await dispatch(), 'deferred')
        assert.equal(
          (await assembleReply(urlOf(worker, target, password), replyId, LIMITS, 'fixed')).outcome,
          'recorded',
        )
        assert.equal(await dispatch(), 'dispatched')
      } finally {
        await Promise.all([pools.api.end(), pools.worker.end()])
      }
    })

    it('disabled and enabled again by the owner: each act leaves the creator edge alone and its gate as it says', async () => {
      const kept = await edges(own())
      await own().query('SELECT sophia.conversation_disable_fixed_assembly()')
      assert.deepEqual(await edges(own()), kept, 'the temporary SET/INHERIT edge is gone')
      assert.deepEqual(await owners(own()), ['postgres'])
      assert.ok((await holds(own(), FIXED_CHECK)).length > 0)
      await own().query('SELECT sophia.conversation_enable_fixed_assembly()')
      assert.deepEqual(await edges(own()), kept)
      assert.deepEqual(await holds(own(), FIXED_CHECK), [])
    })
  },
)
