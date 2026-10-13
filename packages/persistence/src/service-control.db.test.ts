// Real PostgreSQL: scoped upload controls retire blocked transactions, fence late acquisition, and preserve COMMIT uncertainty.
import assert from 'node:assert/strict'
import { after, before, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import { DomainError } from '@sophia/domain'
import { createPool, withService } from './tx.ts'
import type pg from 'pg'

let db: TestDatabase
let pool: pg.Pool
let observer: pg.Pool
const noop = () => {}
before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 1, connectionTimeoutMillis: 500 })
  const owner = createPool(db.ownerUrl)
  observer = createPool(db.ownerUrl)
  try {
    await owner.query(`CREATE TABLE public.upload_deadline_probe(id integer PRIMARY KEY);
      GRANT INSERT, SELECT ON public.upload_deadline_probe TO sophia_api;
      CREATE FUNCTION public.delay_upload_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(2); RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER upload_commit_wait AFTER INSERT ON public.upload_deadline_probe
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.delay_upload_commit()`)
  } finally {
    await owner.end()
  }
})
after(async () => {
  await pool?.end()
  await observer?.end()
  await db?.drop()
})

async function beforeSentinel<T>(pending: Promise<T>): Promise<T> {
  const sentinel = Symbol('sentinel')
  const controller = new AbortController()
  try {
    const result = await Promise.race([pending, delay(1500, sentinel, { signal: controller.signal })])
    assert.notEqual(result, sentinel, 'database operation settled before the sentinel')
    if (result === sentinel) throw new Error('sentinel')
    return result
  } finally {
    controller.abort()
  }
}
const errorCode = (pending: Promise<unknown>) =>
  pending.then(
    () => 'resolved',
    (err: unknown) => (err instanceof DomainError ? err.code : String(err)),
  )

it('retires a checked-out blocked query at its absolute deadline and recovers the single-client pool', async () => {
  const old = await pool.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
  const control = { signal: new AbortController().signal, deadline: performance.now() + 150 }
  const pending = withService(pool, (c) => c.query('SELECT pg_sleep(2)'), control)
  assert.equal(await beforeSentinel(errorCode(pending)), 'unavailable')
  let active = true
  for (let i = 0; i < 25 && active; i += 1) {
    const observed = await observer.query(`SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active'`, [
      old.rows[0]?.pid,
    ])
    active = observed.rows.length !== 0
    if (active) await delay(20)
  }
  assert.equal(active, false, 'old server SQL settled before any cleanup cancellation')
  const fresh = await beforeSentinel(
    pool.query<{ pid: number }>('SELECT pg_backend_pid() AS pid').catch((error: unknown) => ({ error })),
  )
  if ('error' in fresh)
    assert.fail('replacement query must succeed instead of inheriting an aborted timed-out transaction')
  assert.notEqual(fresh.rows[0]?.pid, old.rows[0]?.pid, 'expired client never returned to the idle pool')
})

it('an abort terminates original SQL instead of waiting for its later success', async () => {
  const controller = new AbortController()
  let entered = noop
  const ready = new Promise<void>((resolve) => {
    entered = resolve
  })
  const pending = withService(
    pool,
    async (c) => {
      const query = c.query('SELECT pg_sleep(2)')
      entered()
      return query
    },
    { signal: controller.signal, deadline: performance.now() + 5000 },
  )
  await beforeSentinel(ready)
  controller.abort()
  assert.equal(await beforeSentinel(errorCode(pending)), 'unavailable')
  assert.equal((await beforeSentinel(pool.query('SELECT 1'))).rowCount, 1)
})

it('bounds actual queued acquisition and removes its pending pool entry without calling the transaction', async () => {
  const short = createPool(db.apiUrl, { max: 1, connectionTimeoutMillis: 100 })
  const held = await short.connect()
  let calls = 0
  try {
    const pending = withService(short, () => {
      calls += 1
      return Promise.resolve('unexpected')
    })
    assert.equal(await beforeSentinel(errorCode(pending)), 'unavailable')
    assert.equal(calls, 0)
    assert.equal(short.waitingCount, 0, 'real pool wait was removed, not merely raced publicly')
  } finally {
    held.release()
    await short.end()
  }
})

it('fences acquisition that returns after control expiry before BEGIN or callback', async () => {
  const held = await pool.connect()
  let calls = 0
  const control = { signal: new AbortController().signal, deadline: performance.now() + 30 }
  const pending = withService(
    pool,
    () => {
      calls += 1
      return Promise.resolve('unexpected')
    },
    control,
  )
  try {
    await delay(70)
    held.release()
    assert.equal(await beforeSentinel(errorCode(pending)), 'unavailable')
    assert.equal(calls, 0)
    assert.equal((await beforeSentinel(pool.query('SELECT 1'))).rowCount, 1)
  } finally {
    await pending.catch(() => undefined)
  }
})

it('preserves outcome_unknown when a deferred trigger stalls an already-sent COMMIT', async () => {
  const control = { signal: new AbortController().signal, deadline: performance.now() + 150 }
  const pending = withService(pool, (c) => c.query('INSERT INTO public.upload_deadline_probe VALUES (1)'), control)
  assert.equal(await beforeSentinel(errorCode(pending)), 'outcome_unknown')
  assert.equal((await beforeSentinel(pool.query('SELECT 1'))).rowCount, 1, 'retired COMMIT client is replaced')
})
