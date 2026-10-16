// CON-01 Q13: actual admission and activation holds on an exclusively owned throwaway cluster, never a shared target.
// Requires the explicit owned-cluster marker AND a loopback server whose data directory is our private test directory.
// No provider, runtime or model executes. Clients close voluntarily; the outer owner removes the entire cluster.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { createConversationCandidateDatabase } from './conversation-candidate-fixture.ts'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'

const adminUrl = process.env.SOPHIA_DISPOSABLE_DATABASE_URL ?? ''
const enabled = process.env.SOPHIA_Q13_OWNED_CLUSTER === 'con01-q13-exclusive-v1'
const ROLE = 'sophia_conversation_assembler'
const suffix = randomBytes(6).toString('hex')
const login = `con01_q13_${suffix}`
const peer = `con01_q13_peer_${suffix}`
const extra = `con01_q13_extra_${suffix}`
const file = (name: string) => readFileSync(new URL(`../../../db/candidates/${name}`, import.meta.url), 'utf8')
const activation = file('con01-s3-assembler-activation-check.sql').replace(":'login'", '$1')
let admin: pg.Client
let target: pg.Client
let db: TestDatabase | undefined
let database: string
const clients = new Set<pg.Client>()

async function connect(role: string, name: string): Promise<pg.Client> {
  const url = new URL(adminUrl)
  url.username = role
  url.password = ''
  url.pathname = `/${name}`
  const c = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 1000, query_timeout: 5000 })
  await c.connect()
  clients.add(c)
  return c
}

async function end(c: pg.Client): Promise<void> {
  await c.end()
  clients.delete(c)
}

async function holds(c = target): Promise<string[]> {
  return (await c.query<{ what: string }>(activation, [login])).rows.map((r) => r.what)
}

async function freshDenied(name: string): Promise<void> {
  await assert.rejects(connect(login, name), (err: unknown) => err instanceof pg.DatabaseError && err.code === '42501')
}

/** Refuse before any permissions change unless this is the fresh loopback cluster the outer helper owns. */
async function requireOwned(): Promise<void> {
  const url = new URL(adminUrl)
  assert.equal(url.hostname, '127.0.0.1')
  const [row] = (
    await admin.query<{ path: string; clients: number; privileged: boolean }>(
      `SELECT current_setting('data_directory') AS path,
      (SELECT count(*)::int FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()) AS clients,
      (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS privileged`,
    )
  ).rows
  assert.ok(row)
  assert.ok(basename(dirname(row.path)).startsWith('con01-q13-owned-pg-'))
  assert.equal(basename(row.path), 'data')
  assert.equal(statSync(dirname(row.path)).uid, process.getuid?.())
  assert.equal(statSync(dirname(row.path)).mode & 0o777, 0o700)
  assert.equal(row.clients, 0, 'exclusive cluster before setup')
  assert.equal(row.privileged, true)
}

async function activationCase(setup: string, expected: RegExp): Promise<void> {
  await target.query('BEGIN')
  try {
    await target.query(setup)
    assert.ok(
      (await holds()).some((h) => expected.test(h)),
      `${setup}: expected ${String(expected)}`,
    )
  } finally {
    await target.query('ROLLBACK')
  }
  assert.deepEqual(await holds(), [], 'rolled-back drift restores the qualified control')
}

describe('Q13 exclusive owned-cluster admission and activation (L1, no hosted effects)', { skip: !enabled }, () => {
  before(async () => {
    admin = await connect('postgres', 'postgres')
    await requireOwned()
    db = await createConversationCandidateDatabase()
    database = new URL(db.ownerUrl).pathname.slice(1)
    target = await connect('postgres', database)
    await target.query('SET search_path=pg_catalog')
    for (const name of [
      'con01-s1-reply-states.sql',
      'con01-s2-conversation-reply-ledger.sql',
      'con01-s3-conversation-reply-context.sql',
    ])
      await target.query(file(name))
    await target.query(`CREATE ROLE ${login} LOGIN NOINHERIT; CREATE ROLE ${peer} LOGIN NOINHERIT;
      GRANT ${ROLE} TO ${login},${peer}; GRANT CONNECT ON DATABASE ${database} TO ${login},${peer}`)
    await admin.query(`CREATE DATABASE ${extra}`)
  })

  after(async () => {
    for (const c of clients) {
      await c.query('ROLLBACK').catch(() => undefined)
      await end(c)
    }
    if (db) await db.drop()
    const cleanup = await connect('postgres', 'postgres')
    try {
      await cleanup.query(`DROP DATABASE IF EXISTS ${extra}`)
      await cleanup.query(`REVOKE CONNECT ON DATABASE postgres FROM ${peer}`)
      await cleanup.query(`DROP ROLE IF EXISTS ${login},${peer},${ROLE}`)
    } finally {
      await end(cleanup)
    }
  })

  it('denies other databases by actual fresh connections and settles old connections only when their client closes', async () => {
    const outside = ['postgres', 'template1', extra]
    for (const name of outside) {
      const c = await connect(login, name)
      assert.equal((await c.query('SELECT current_database() AS name')).rows[0]?.name, name)
      await end(c)
    }
    const old = await connect(login, extra)
    const initial = await holds()
    for (const name of outside) assert.ok(initial.some((h) => h.startsWith(`admitted to ${name} `)))
    assert.ok(initial.some((h) => h.startsWith(`session open in ${extra} `)))
    // Only this exclusively owned throwaway cluster: no hosted or shared permission mutation is permitted here.
    for (const name of outside) await admin.query(`REVOKE CONNECT ON DATABASE ${name} FROM PUBLIC`)
    await admin.query(`GRANT CONNECT ON DATABASE postgres TO ${peer}`)
    await target.query(`REVOKE TEMPORARY ON DATABASE ${database} FROM PUBLIC`)
    for (const name of outside) await freshDenied(name)
    assert.equal(
      (await old.query('SELECT 42 AS alive')).rows[0]?.alive,
      42,
      'revocation did not settle the old connection',
    )
    assert.ok((await holds()).some((h) => h.startsWith(`session open in ${extra} `)))
    await end(old)
    assert.deepEqual(await holds(), [])
    const intended = await connect(login, database)
    assert.equal((await intended.query('SELECT current_database() AS name')).rows[0]?.name, database)
    await end(intended)
    const preserved = await connect(peer, 'postgres')
    assert.equal((await preserved.query('SELECT current_user AS role')).rows[0]?.role, peer)
    await end(preserved)
  })

  it('records installed security identities for the reviewed activation guard', async (t) => {
    const identities =
      await target.query(`SELECT 'function' AS kind, p.oid::regprocedure::text AS name, md5(pg_get_functiondef(p.oid)) AS hash
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sophia' AND (has_function_privilege('${ROLE}',p.oid,'EXECUTE') OR p.proname LIKE 'conversation_assembly_%' OR p.proname LIKE 'conversation_context_%')
      UNION ALL SELECT 'policy',c.relname||'.'||p.polname,md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE p.polname='con01_assembly_bound'
      UNION ALL SELECT 'rls',c.relname,c.relrowsecurity::text||','||c.relforcerowsecurity::text FROM pg_class c WHERE c.relnamespace='sophia'::regnamespace AND c.relkind='r' AND has_table_privilege('${ROLE}',c.oid,'SELECT') ORDER BY kind,name`)
    t.diagnostic(JSON.stringify(identities.rows))
    t.diagnostic(
      JSON.stringify(
        (
          await target.query(
            `SELECT t.tgname AS name,c.relname AS rel,md5(pg_get_triggerdef(t.oid)) AS hash,t.tgenabled AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND t.tgfoid IN (SELECT p.oid FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace AND p.proname LIKE 'conversation_context_%') ORDER BY name,rel`,
          )
        ).rows,
      ),
    )

    await target.query('BEGIN')
    try {
      await target.query(file('con01-s4-reply-fences.sql'))
      assert.deepEqual(await holds(), [], 'reviewed S4 composition keeps the assembly qualification')
      t.diagnostic(
        JSON.stringify(
          (
            await target.query(
              "SELECT p.oid::regprocedure::text AS name,md5(pg_get_functiondef(p.oid)) AS hash FROM pg_proc p WHERE p.oid='sophia.conversation_context_kept()'::regprocedure",
            )
          ).rows,
        ),
      )
    } finally {
      await target.query('ROLLBACK')
    }
  })

  it('rejects unreviewed grantees on assembly entry points and their private helpers', async () => {
    const claim = 'sophia.conversation_assembly_claim(uuid,integer)'
    for (const principal of ['sophia_api', 'sophia_worker', 'PUBLIC', login, peer])
      await activationCase(`GRANT EXECUTE ON FUNCTION ${claim} TO ${principal}`, /required:.*function ACL/)
    await activationCase(
      `CREATE ROLE con01_q13_callable; GRANT EXECUTE ON FUNCTION ${claim} TO con01_q13_callable`,
      /required:.*function ACL/,
    )
    for (const fn of [
      'sophia.conversation_assembly_project()',
      'sophia.conversation_assembly_locked(uuid,boolean)',
      'sophia.conversation_context_current(sophia.conversation_reply_contexts)',
    ])
      await activationCase(`GRANT EXECUTE ON FUNCTION ${fn} TO sophia_api`, /required:.*function ACL/)
    for (const fn of [
      'sophia.conversation_assembly_begin(uuid,integer,uuid)',
      'sophia.conversation_assembly_close(uuid,integer,uuid,text)',
      'sophia.conversation_assembly_fail(uuid,integer,uuid,text)',
      'sophia.conversation_record_context(uuid,integer,uuid,jsonb)',
    ])
      await activationCase(`GRANT EXECUTE ON FUNCTION ${fn} TO sophia_api`, /required:.*function ACL/)
    await activationCase(
      `UPDATE pg_catalog.pg_proc SET proacl=NULL WHERE oid='${claim}'::regprocedure`,
      /required:.*function ACL/,
    )
    await activationCase(`GRANT EXECUTE ON FUNCTION ${claim} TO ${ROLE} WITH GRANT OPTION`, /required:.*function ACL/)
  })

  it('requires every assembly callable, relation read and schema usage grant', async () => {
    for (const fn of [
      'actor_id()',
      'conversation_actor_label(uuid,uuid,text)',
      'is_member(uuid)',
      'is_task_kind(text)',
      'mission_capture_default()',
      'conversation_assembly_project()',
      'conversation_assembly_claim(uuid,integer)',
      'conversation_assembly_begin(uuid,integer,uuid)',
      'conversation_assembly_close(uuid,integer,uuid,text)',
      'conversation_assembly_fail(uuid,integer,uuid,text)',
      'conversation_record_context(uuid,integer,uuid,jsonb)',
    ])
      await activationCase(`REVOKE EXECUTE ON FUNCTION sophia.${fn} FROM ${ROLE}`, /required:.*function ACL/)
    const rels = await target.query<{ name: string }>(
      `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='sophia' AND has_table_privilege('${ROLE}',c.oid,'SELECT') ORDER BY c.relname`,
    )
    assert.equal(rels.rows.length, 20)
    for (const { name } of rels.rows)
      await activationCase(`REVOKE SELECT ON sophia.${name} FROM ${ROLE}`, /required:.*assembler SELECT/)
    await activationCase(`REVOKE USAGE ON SCHEMA sophia FROM ${ROLE}`, /required:.*assembler USAGE/)
    await activationCase('REVOKE EXECUTE ON FUNCTION sophia.actor_id() FROM sophia_api', /required:.*function ACL/)
    await activationCase(
      'REVOKE EXECUTE ON FUNCTION sophia.is_member(uuid) FROM sophia_worker',
      /required:.*function ACL/,
    )
  })

  it('fails closed on missing roles, login authority, assembler authority and PUBLIC/default effective authority', async () => {
    assert.deepEqual(await holds(), [])
    const cases: [string, RegExp][] = [
      [
        'ALTER TABLE sophia.conversation_messages DISABLE TRIGGER conversation_context_message_scrub; ALTER TABLE sophia.conversation_replies DISABLE TRIGGER conversation_context_reply_scrub',
        /semantic:.*trigger/,
      ],
      ['DROP TRIGGER conversation_context_message_scrub ON sophia.conversation_messages', /semantic:.*trigger/],
      [
        'CREATE OR REPLACE TRIGGER conversation_context_message_scrub AFTER UPDATE ON sophia.conversation_messages FOR EACH ROW EXECUTE FUNCTION sophia.conversation_context_reply_scrubbed()',
        /semantic:.*trigger/,
      ],
      [
        'ALTER TABLE sophia.conversation_reply_contexts DISABLE TRIGGER conversation_reply_contexts_kept',
        /semantic:.*trigger/,
      ],

      ['ALTER TABLE sophia.projects FORCE ROW LEVEL SECURITY', /semantic:.*row security/],
      [`ALTER SCHEMA sophia OWNER TO ${peer}`, /semantic:.*schema owner/],
      [
        `ALTER FUNCTION sophia.conversation_assembly_locked(uuid,boolean) OWNER TO ${peer}`,
        /semantic:.*function.*owner/,
      ],
      [
        "CREATE OR REPLACE FUNCTION sophia.conversation_assembly_privacy(r sophia.conversation_replies) RETURNS text LANGUAGE sql AS 'SELECT NULL::text'",
        /semantic:.*function/,
      ],

      ['ALTER TABLE sophia.projects DISABLE ROW LEVEL SECURITY', /semantic:.*row security/],
      [
        "CREATE OR REPLACE FUNCTION sophia.conversation_assembly_project() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS 'SELECT id FROM sophia.projects LIMIT 1'",
        /semantic:.*function/,
      ],
      ['ALTER POLICY con01_assembly_bound ON sophia.projects USING (true)', /semantic:.*polic/],
      ['ALTER POLICY members_read ON sophia.projects USING (true)', /semantic:.*polic/],
      ['CREATE POLICY q13_public ON sophia.projects FOR SELECT TO PUBLIC USING (true)', /semantic:.*polic/],
      ['ALTER VIEW sophia.native_task_view SET (security_invoker=false)', /semantic:.*view/],
      [`ALTER FUNCTION sophia.conversation_assembly_project() OWNER TO ${peer}`, /semantic:.*function.*owner/],
      [`ALTER FUNCTION sophia.is_member(uuid) OWNER TO ${peer}`, /semantic:.*function.*owner/],

      [`ALTER ROLE ${ROLE} RENAME TO con01_q13_parked; GRANT sophia_api TO ${login}`, /no assembler role/],
      [`ALTER DATABASE ${database} OWNER TO ${login}`, /the login owns something/],
      [`GRANT CREATE ON DATABASE ${database} TO ${login}`, /on the target database: CREATE/],
      [`GRANT TEMPORARY ON DATABASE ${database} TO ${login}`, /on the target database: TEMPORARY/],
      [`GRANT CONNECT ON DATABASE ${database} TO ${login} WITH GRANT OPTION`, /CONNECT with grant option/],
      [`ALTER ROLE ${ROLE} BYPASSRLS`, /the assembler has BYPASSRLS/],
      [
        `CREATE TABLE public.q13_owned(x int); ALTER TABLE public.q13_owned OWNER TO ${ROLE}`,
        /the assembler owns something/,
      ],
      [`GRANT SELECT ON sophia.outbox TO ${ROLE}`, /the assembler may SELECT on sophia.outbox/],
      [`GRANT INSERT ON sophia.goals TO ${ROLE}`, /the assembler may INSERT on sophia.goals/],
      [`GRANT SELECT ON sophia.goals TO ${ROLE} WITH GRANT OPTION`, /with grant option/],
      [`GRANT SELECT(title) ON sophia.goals TO ${ROLE}`, /on column goals.title/],
      [
        `GRANT EXECUTE ON FUNCTION sophia.create_project(text,text) TO ${ROLE}`,
        /the assembler may EXECUTE sophia.create_project/,
      ],
      [`GRANT CREATE ON SCHEMA sophia TO ${ROLE}`, /the assembler may CREATE on schema sophia/],
      [`CREATE POLICY q13_extra ON sophia.outbox FOR SELECT TO ${ROLE} USING (true)`, /a policy names the assembler/],
      [`ALTER DEFAULT PRIVILEGES IN SCHEMA sophia GRANT SELECT ON TABLES TO ${ROLE}`, /another kind/],
      [`CREATE ROLE con01_q13_group; GRANT ${ROLE} TO con01_q13_group`, /not a bare login/],
      [`GRANT sophia_api TO ${peer}`, /not a bare login/],
      [
        `CREATE FUNCTION public.q13_default() RETURNS int LANGUAGE sql AS 'SELECT 1'`,
        /effective:.*EXECUTE public.q13_default/,
      ],
      [
        'GRANT EXECUTE ON FUNCTION sophia.create_project(text,text) TO PUBLIC',
        /effective:.*EXECUTE sophia.create_project.*PUBLIC/,
      ],
      ['GRANT SELECT ON sophia.outbox TO PUBLIC', /effective:.*SELECT on sophia.outbox.*PUBLIC/],
      ['GRANT UPDATE(title) ON sophia.goals TO PUBLIC', /effective:.*UPDATE on sophia.goals.*PUBLIC/],
      [
        'CREATE SEQUENCE public.q13_seq; GRANT USAGE ON SEQUENCE public.q13_seq TO PUBLIC',
        /effective:.*USAGE on sequence public.q13_seq/,
      ],
      ['GRANT CREATE ON SCHEMA sophia TO PUBLIC', /effective:.*CREATE on schema sophia/],
      [`GRANT CREATE ON DATABASE ${database} TO PUBLIC`, /effective:.*CREATE on the target database/],
      [`GRANT TEMPORARY ON DATABASE ${database} TO PUBLIC`, /effective:.*TEMPORARY on the target database/],
      [
        'CREATE SCHEMA q13_hidden; REVOKE ALL ON SCHEMA q13_hidden FROM PUBLIC; CREATE TABLE q13_hidden.data(x int); GRANT SELECT ON q13_hidden.data TO PUBLIC; CREATE VIEW public.q13_view WITH (security_invoker=true) AS SELECT * FROM q13_hidden.data; GRANT SELECT ON public.q13_view TO PUBLIC',
        /effective:.*SELECT on q13_hidden.data/,
      ],
      [
        "DO $$ DECLARE o oid; BEGIN o:=lo_create(0); EXECUTE format('GRANT SELECT ON LARGE OBJECT %s TO PUBLIC',o); END $$",
        /effective:.*on large object/,
      ],
      [
        'CREATE FOREIGN DATA WRAPPER q13_fdw; GRANT USAGE ON FOREIGN DATA WRAPPER q13_fdw TO PUBLIC',
        /effective:.*USAGE on foreign-data wrapper/,
      ],
      [
        'CREATE FOREIGN DATA WRAPPER q13_fdw; CREATE SERVER q13_server FOREIGN DATA WRAPPER q13_fdw; GRANT USAGE ON FOREIGN SERVER q13_server TO PUBLIC',
        /effective:.*USAGE on server/,
      ],
      ['GRANT SET ON PARAMETER log_statement TO PUBLIC', /effective:.*SET on parameter log_statement/],
      [
        'GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) TO PUBLIC',
        /PUBLIC may EXECUTE pg_catalog.pg_read_file/,
      ],
      ['GRANT SELECT ON pg_catalog.pg_authid TO PUBLIC', /PUBLIC may SELECT on pg_catalog.pg_authid/],
      ['GRANT UPDATE ON pg_catalog.pg_authid TO PUBLIC', /PUBLIC may UPDATE on pg_catalog.pg_authid/],
      [
        `CREATE ROLE con01_q13_parent; GRANT SELECT ON sophia.outbox TO con01_q13_parent; GRANT con01_q13_parent TO ${ROLE}`,
        /effective:.*SELECT on sophia.outbox/,
      ],
    ]
    for (const [setup, expected] of cases) await activationCase(setup, expected)
  })
})

// The same admission over the MIGRATED schema: the role and its surface installed by 0070 (not by the candidate), after
// the candidate group above has closed every client, dropped its role and left PUBLIC CONNECT revoked on postgres and
// template1. One owned NOINHERIT login is admitted only by the activation check's own holds and actual connections,
// never by a fixture helper. Its outside database is this group's own: empty, created with PUBLIC CONNECT, so the
// admission, the old session and the fresh denial are each observed rather than found absent.
describe('Q13 exclusive admission over the migrated schema (0070; L1, no hosted effects)', { skip: !enabled }, () => {
  const admitted = `con01_q13_m_${suffix}`
  const outside = `con01_q13_m_out_${suffix}`
  let owner: pg.Client
  let migrated: TestDatabase | undefined
  let outsideMade = false
  let name: string

  const deniedTo = (other: string) =>
    assert.rejects(
      connect(admitted, other),
      (err: unknown) => err instanceof pg.DatabaseError && err.code === '42501',
      `fresh connection of ${admitted} to ${other}`,
    )

  before(async () => {
    admin = await connect('postgres', 'postgres')
    await requireOwned()
    migrated = await createTestDatabase(undefined, { assembler: false })
    name = new URL(migrated.ownerUrl).pathname.slice(1)
    owner = await connect('postgres', name)
    await owner.query(`CREATE ROLE ${admitted} LOGIN NOINHERIT; GRANT ${ROLE} TO ${admitted};
      GRANT CONNECT ON DATABASE ${name} TO ${admitted}`)
    // template0 is never connectable, so the copy holds no object; a new database's default ACL grants PUBLIC CONNECT.
    await admin.query(`CREATE DATABASE ${outside} TEMPLATE template0`)
    outsideMade = true
  })

  after(async () => {
    for (const c of clients) {
      await c.query('ROLLBACK').catch(() => undefined)
      await end(c)
    }
    if (migrated) await migrated.drop()
    const cleanup = await connect('postgres', 'postgres')
    try {
      if (outsideMade) await cleanup.query(`DROP DATABASE IF EXISTS ${outside}`)
      await cleanup.query(`DROP ROLE IF EXISTS ${admitted}`)
    } finally {
      await end(cleanup)
    }
  })

  it('admits, then denies an outside database by actual fresh connections; its old session holds until the client closes', async (t) => {
    await owner.query('SET search_path=pg_catalog')
    const holdsFor = async () => (await owner.query<{ what: string }>(activation, [admitted])).rows.map((r) => r.what)
    const stage = async (label: string) => {
      const now = await holdsFor()
      t.diagnostic(`${label}: ${JSON.stringify(now)}`)
      return now
    }
    // Denied before this group: a fresh login of the 0070 installation is refused there too, unconditionally.
    for (const other of ['postgres', 'template1']) await deniedTo(other)

    const admittedHolds = await stage('admitted, no session')
    assert.ok(admittedHolds.includes(`admitted to ${outside} (PUBLIC CONNECT)`), 'initial admission hold')
    assert.ok(!admittedHolds.some((h) => h.startsWith('session open in ')))
    const old = await connect(admitted, outside)
    assert.deepEqual((await old.query('SELECT current_database() AS d, current_user AS u')).rows[0], {
      d: outside,
      u: admitted,
    })
    assert.equal(
      (
        await old.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
          WHERE s.nspname NOT IN ('pg_catalog','information_schema') AND s.nspname NOT LIKE 'pg_toast%'`,
        )
      ).rows[0]?.n,
      0,
      'the owned outside database is empty',
    )
    const opened = await stage('admitted, old session open')
    assert.ok(opened.includes(`admitted to ${outside} (PUBLIC CONNECT)`))
    assert.ok(
      opened.some((h) => h.startsWith(`session open in ${outside} `)),
      'initial session hold',
    )

    // Only this exclusively owned throwaway cluster: no hosted or shared permission mutation is permitted here.
    await admin.query(`REVOKE CONNECT ON DATABASE ${outside} FROM PUBLIC`)
    await owner.query(`REVOKE TEMPORARY ON DATABASE ${name} FROM PUBLIC`)
    for (const other of [outside, 'postgres', 'template1']) await deniedTo(other)
    assert.equal(
      (await old.query('SELECT 42 AS alive')).rows[0]?.alive,
      42,
      'revocation did not settle the old session',
    )
    const revoked = await stage('revoked, old session open')
    assert.ok(!revoked.some((h) => h.startsWith('admitted to ')))
    assert.ok(
      revoked.some((h) => h.startsWith(`session open in ${outside} `)),
      'the old session still holds',
    )

    await end(old)
    assert.deepEqual(
      await stage('revoked, old session closed'),
      [],
      "0070's installed surface passes the reviewed activation check",
    )
    const intended = await connect(admitted, name)
    await intended.query(`SET ROLE ${ROLE}`)
    assert.equal((await intended.query('SELECT sophia.conversation_assembly_project() AS p')).rows[0]?.p, null)
    await end(intended)
  })
})
