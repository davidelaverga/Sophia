// Test-only PostgreSQL/HTTP wiring probe. Delay one real installed function in an owned disposable database.
// The verdict observes the old server backend; cleanup cancellation never counts as successful deadline handling.
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import type pg from 'pg'

async function until(check: () => Promise<boolean>, ms: number, message: string): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return
    await delay(20)
  }
  assert.fail(message)
}

async function delayFunction(owner: pg.Client, name: string, invocation: number) {
  assert.match(name, /^(renderer_(output_slot|capture_slot|record_output|record_capture)|claim_object_write)$/u)
  const { rows } = await owner.query<{ definition: string }>(
    `SELECT pg_get_functiondef(oid) AS definition FROM pg_proc
     WHERE pronamespace='sophia'::regnamespace AND proname=$1`,
    [name],
  )
  assert.equal(rows.length, 1)
  const original = rows[0]?.definition
  assert.equal(typeof original, 'string')
  if (typeof original !== 'string') throw new Error('function definition missing')
  assert.ok(original.includes('BEGIN\n'))
  await owner.query('CREATE SEQUENCE public.upload_deadline_invocations')
  const altered = original.replace(
    'BEGIN\n',
    `BEGIN\n IF nextval('public.upload_deadline_invocations')=${invocation} THEN PERFORM pg_sleep(30); END IF;\n`,
  )
  await owner.query(altered)
  return async () => {
    await owner.query(original)
    await owner.query('DROP SEQUENCE public.upload_deadline_invocations')
  }
}

export async function probeUploadDeadline(
  owner: pg.Client,
  name: string,
  invocation: number,
  upload: () => Promise<{ status: number }>,
): Promise<void> {
  const restore = await delayFunction(owner, name, invocation)
  let pid: number | undefined
  const pending = upload()
  let result: { status: number } | undefined
  let failure: unknown
  void pending.then(
    (value) => {
      result = value
    },
    (error: unknown) => {
      failure = error
    },
  )
  try {
    await until(
      async () => {
        const { rows } = await owner.query<{ pid: number }>(
          `SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
         AND wait_event='PgSleep' AND query LIKE $1`,
          [`%sophia.${name}(%`],
        )
        assert.ok(rows.length <= 1)
        pid = rows[0]?.pid
        return pid !== undefined
      },
      3000,
      `actual ${name} query reached no planted server wait`,
    )
    await until(
      () => Promise.resolve(result !== undefined || failure !== undefined),
      12_000,
      'HTTP deadline beat its asserted sentinel',
    )
    assert.ifError(failure)
    assert.equal(result?.status, 503)
    await until(
      async () => {
        const { rows } = await owner.query(`SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active'`, [pid])
        return rows.length === 0
      },
      1000,
      `expired ${name} still has active server SQL`,
    )
  } finally {
    if (pid !== undefined)
      await owner.query('SELECT pg_cancel_backend($1) WHERE EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1)', [pid])
    await pending.catch(() => undefined)
    await restore()
  }
}
