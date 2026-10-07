// WBC-02-CX-0024: the database boundary of fencing an unanswered status write, on a real PostgreSQL. A previous
// Paperclip instance (a child process holding its own session, as the server's role) sends an UPDATE that waits on a
// lock, and is killed. Its session lives on, and commits after it died: a dead process is no fence. The operator's
// procedure (deploy/paperclip/fence-previous-instance.sql, its statements exactly as written) refuses to fence while
// such a session remains, ends it, and only then fences; the waiting UPDATE is rolled back and never commits.
import { randomBytes, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createEmptyDatabase, type EmptyDatabase } from '@sophia/test-support'
import { installNamespace, NAMESPACE } from './memory-host.ts'

const GATE = 4242
const SCRIPT = fileURLToPath(new URL('../../../deploy/paperclip/fence-previous-instance.sql', import.meta.url))

/** The script's steps by name, its psql variables as parameters: $1 is `before`, $2 is `operator`. */
function steps(): ReadonlyMap<string, string> {
  const text = readFileSync(SCRIPT, 'utf8').replaceAll(":'before'", '$1').replaceAll(":'operator'", '$2')
  const parts = text.split(/^-- step: ([\w-]+)$/m)
  const map = new Map<string, string>()
  for (let i = 1; i < parts.length; i += 2) map.set(parts[i] ?? '', parts[i + 1] ?? '')
  return map
}

let db: EmptyDatabase
let owner: pg.Client
let appUrl: string
const role = `paperclip_app_t_${randomBytes(5).toString('hex')}`

before(async () => {
  db = await createEmptyDatabase('sophia_pcfence')
  owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
  await installNamespace(owner)
  const password = randomBytes(12).toString('hex')
  await owner.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`)
  await owner.query(`GRANT CONNECT ON DATABASE ${new URL(db.ownerUrl).pathname.slice(1)} TO ${role}`)
  await owner.query(`GRANT USAGE ON SCHEMA ${NAMESPACE} TO ${role}`)
  await owner.query(
    `GRANT SELECT, UPDATE ON ${NAMESPACE}.effects, ${NAMESPACE}.commissions, ${NAMESPACE}.wakes TO ${role}`,
  )
  // An issue row whose UPDATE waits, before it takes the row lock, until the test opens the gate.
  await owner.query('CREATE TABLE public.boundary (id int PRIMARY KEY, status text NOT NULL)')
  await owner.query(`GRANT SELECT, UPDATE ON public.boundary TO ${role}`)
  await owner.query(`CREATE FUNCTION public.gate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_advisory_lock(${GATE}); PERFORM pg_advisory_unlock(${GATE}); RETURN NULL; END $$`)
  await owner.query(
    'CREATE TRIGGER gate BEFORE UPDATE ON public.boundary FOR EACH STATEMENT EXECUTE FUNCTION public.gate()',
  )
  const url = new URL(db.ownerUrl)
  url.username = role
  url.password = password
  appUrl = url.toString()
})

after(async () => {
  await owner.query(`DROP OWNED BY ${role}`)
  await owner.end()
  await db.drop()
  const admin = new pg.Client({ connectionString: process.env.SOPHIA_DISPOSABLE_DATABASE_URL })
  await admin.connect()
  await admin.query(`DROP ROLE IF EXISTS ${role}`)
  await admin.end()
})

beforeEach(async () => {
  await owner.query(
    `TRUNCATE ${NAMESPACE}.controls, ${NAMESPACE}.effects, ${NAMESPACE}.wakes, ${NAMESPACE}.commissions`,
  )
  await owner.query('DELETE FROM public.boundary')
  await owner.query(`INSERT INTO public.boundary VALUES (1, 'cancelled')`)
})

const statusNow = async () =>
  (await owner.query<{ status: string }>('SELECT status FROM public.boundary')).rows[0]?.status

/** The sessions of the server's role: the previous instance's, here. */
const sessions = async () =>
  (
    await owner.query<{ pid: number; wait: string | null }>(
      `SELECT pid, wait_event_type AS wait FROM pg_stat_activity WHERE usename = $1 AND datname = current_database()`,
      [role],
    )
  ).rows

async function until(what: string, check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i += 1) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timed out waiting for ${what}`)
}

/**
 * A previous instance: a process of its own whose session, as the server's role, sends `UPDATE ... SET
 * status = 'blocked'` while the gate is shut; once its statement waits, the process is killed (SIGKILL) and reaped.
 */
async function previousInstanceDiesMidStatement() {
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import pg from 'pg'
       const c = new pg.Client({ connectionString: process.env.URL, application_name: 'previous-instance' })
       await c.connect()
       await c.query("UPDATE public.boundary SET status = 'blocked' WHERE id = 1")`,
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, URL: appUrl }, stdio: 'ignore' },
  )
  await until('its statement to wait on the gate', async () => (await sessions()).some((s) => s.wait === 'Lock'))
  const exited = new Promise((resolve) => child.once('exit', (_code, signal) => resolve(signal)))
  child.kill('SIGKILL')
  assert.equal(await exited, 'SIGKILL')
}

describe('the operator fence and the database boundary (WBC-02-CX-0024)', () => {
  it('a killed instance is no fence: its waiting statement commits after it died', async () => {
    await owner.query('SELECT pg_advisory_lock($1)', [GATE])
    await previousInstanceDiesMidStatement()
    assert.equal((await sessions()).length, 1, 'its session outlives it')
    assert.equal(await statusNow(), 'cancelled')
    await owner.query('SELECT pg_advisory_unlock($1)', [GATE])
    await until('its statement to finish', async () => (await sessions()).length === 0)
    assert.equal(await statusNow(), 'blocked', 'the dead instance wrote after it died')
  })

  it('the procedure fences only once the previous sessions are ended, and their statements never commit', async () => {
    await owner.query('SELECT pg_advisory_lock($1)', [GATE])
    await previousInstanceDiesMidStatement()
    await owner.query(
      `INSERT INTO ${NAMESPACE}.commissions (commission_key, company_id, sophia_project_id, paperclip_project_id, work_id, state,
         create_started_at, create_host_namespace, create_host_process)
       VALUES ('sophia-wbc02-k', 'c', 's', 'p', 'w', 'creating', now(), 'boot-1/pid:[1]', '2201:90101')`,
    )
    await owner.query(
      `INSERT INTO ${NAMESPACE}.effects (effect_id, commission_key, status, host_namespace, host_process)
       VALUES ('e1', 'sophia-wbc02-k', 'blocked', 'boot-1/pid:[1]', '2201:90101')`,
    )
    const issue = randomUUID()
    await owner.query('INSERT INTO public.issues (id) VALUES ($1)', [issue])
    await owner.query(
      `INSERT INTO ${NAMESPACE}.wakes (wake_key, issue_id, host_namespace, host_process)
       VALUES ('sophia-wbc02-k', $1, 'boot-1/pid:[1]', '2201:90101')`,
      [issue],
    )
    const T = (await owner.query<{ t: string }>('SELECT now()::text AS t')).rows[0]?.t ?? ''
    const operator = new pg.Client({ connectionString: appUrl })
    await operator.connect()
    try {
      const step = steps()
      const run = (name: string) => {
        const sql = step.get(name) ?? ''
        return operator.query(sql, sql.includes('$2') ? [T, 'test operator'] : [T])
      }
      assert.equal((await run('open')).rowCount, 1)
      assert.equal((await run('open-creates')).rowCount, 1)
      assert.equal((await run('open-wakes')).rowCount, 1)
      assert.equal((await run('fence')).rowCount, 0, 'never while a previous session remains')
      assert.equal((await run('fence-creates')).rowCount, 0, 'nor a create')
      assert.equal((await run('fence-wakes')).rowCount, 0, 'nor a wakeup ask')
      assert.equal((await run('end-sessions')).rowCount, 1)
      await until('the previous session to end', async () => (await sessions()).length === 1) // the operator's own
      assert.equal((await run('fence')).rowCount, 1)
      assert.equal((await run('fence-creates')).rowCount, 1)
      assert.equal((await run('fence-wakes')).rowCount, 1)
      assert.equal((await run('fence')).rowCount, 0, 'again: nothing left to fence')
      assert.equal((await run('fence-creates')).rowCount, 0, 'again: no create left to fence')
      assert.equal((await run('fence-wakes')).rowCount, 0, 'again: no wakeup ask left to fence')
    } finally {
      await operator.end()
    }
    await owner.query('SELECT pg_advisory_unlock($1)', [GATE])
    assert.equal(await statusNow(), 'cancelled', 'the ended session rolled its statement back')
    const fenced = await owner.query<{ fence: string }>(`SELECT fence FROM ${NAMESPACE}.effects`)
    assert.match(
      fenced.rows[0]?.fence ?? '',
      /^operator test operator: previous instance stopped before .+; its database sessions ended$/,
    )
    const create = await owner.query<{ fence: string }>(`SELECT create_fence AS fence FROM ${NAMESPACE}.commissions`)
    assert.match(
      create.rows[0]?.fence ?? '',
      /^operator test operator: previous instance stopped before .+; its database sessions ended$/,
    )
    const wake = await owner.query<{ fence: string }>(`SELECT fence FROM ${NAMESPACE}.wakes`)
    assert.match(
      wake.rows[0]?.fence ?? '',
      /^operator test operator: previous instance stopped before .+; its database sessions ended$/,
    )
  })
})
