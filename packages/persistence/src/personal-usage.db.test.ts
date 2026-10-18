// 0073 (level: sql-run): a live personal companion's cost rows, as the API role can and cannot touch them. Owner-only,
// content-free, reserved once per registered call of the current epoch, held while uncertain, reconciled only by an
// operator, and kept through an erasure.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import {
  beginCompanionCall,
  createPool,
  erasePersonalSpace,
  holdPersonalCompanion,
  releasePersonalCompanion,
  reservePersonalCompanion,
  sendPersonalTurn,
  settlePersonalCompanion,
  withActor,
} from './index.ts'

let db: TestDatabase
let pool: pg.Pool

async function owner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await c.end()
  }
}

/** Refused by PostgreSQL's privileges (withActor classifies 42501 as not permitted; its cause says why). */
const denied = (err: unknown): boolean =>
  err instanceof Error && err.cause instanceof Error && err.cause.message.startsWith('permission denied')

/** The server process of a connection, to see it waiting on a lock. */
const backendPid = async (c: pg.Client) =>
  (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid

/** A transaction on its own connection, as `actor` when given (the migration owner's when not). */
const openTx = async (url: string, actor?: string) => {
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  await c.query('BEGIN')
  // A statement that waits past this fails, never hangs the test.
  await c.query("SET LOCAL statement_timeout = '20s'")
  if (actor) await c.query("SELECT set_config('sophia.actor_id', $1, true)", [actor])
  return c
}

/** FIXTURE: the operator enrolls `payer` for its one owner (0073: one owner per payer, #435 4304103151). */
const enroll = (payer: string, actor: string) =>
  owner(`UPDATE sophia.personal_companion_payers SET owner_id=$2 WHERE payer=$1`, [payer, actor])

/** A call registered for `actor`, as CompanionRunner registers one before it asks the companion. */
const registered = async (actor: string) => {
  const id = randomUUID()
  await withActor(pool, actor, 'write', (c) => beginCompanionCall(c, id))
  return id
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  await owner(
    `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('p-one', $1, 1000), ('p-two', $1, 1000)`,
    [randomUUID()],
  )
})

after(async () => {
  await pool.end()
  await db.drop()
})

describe('personal companion usage (0073)', () => {
  it('reserves once per registered call of the current epoch, within the admitted allowance', async () => {
    const ana = randomUUID()
    await enroll('p-one', ana)
    await withActor(pool, ana, 'write', (c) => sendPersonalTurn(c, randomUUID(), 'hello'))
    const reserve = (call: string, payer: string, micros: number) =>
      withActor(pool, ana, 'write', (c) => reservePersonalCompanion(c, call, payer, 'route-a', micros))
    assert.equal(await reserve(randomUUID(), 'p-one', 10), 'not_current', 'an unregistered call asks nothing')
    const call = await registered(ana)
    assert.equal(await reserve(call, 'nobody', 10), 'not_admitted')
    assert.equal(await reserve(call, 'p-one', 1001), 'exhausted')
    assert.equal(await reserve(call, 'p-one', 600), 'reserved')
    await assert.rejects(reserve(call, 'p-one', 1), /already reserved/)
    assert.equal(
      await reserve(await registered(ana), 'p-one', 1),
      'held',
      'one unresolved call per payer: a reserved call holds the next (#435 4303867348)',
    )
    assert.equal(
      await withActor(pool, ana, 'write', (c) =>
        settlePersonalCompanion(c, call, 120, { inputTokens: 100, outputTokens: 40 }),
      ),
      true,
    )
    assert.equal(
      await reserve(await registered(ana), 'p-one', 881),
      'exhausted',
      'settled counts what it used: 120 + 881',
    )
    assert.equal(await reserve(await registered(ana), 'p-one', 500), 'reserved')
    // A call registered before an erasure reserves nothing after it.
    const stale = await registered(ana)
    await withActor(pool, ana, 'write', (c) => erasePersonalSpace(c, randomUUID(), 'delete'))
    assert.equal(await reserve(stale, 'p-one', 10), 'not_current')
  })

  it('is the owner’s own: another person settles, holds or releases none of it, and the API role reads none', async () => {
    const bea = randomUUID()
    const cal = randomUUID()
    await enroll('p-two', bea)
    const call = await registered(bea)
    const strangers = await registered(cal)
    assert.equal(
      await withActor(pool, cal, 'write', (c) => reservePersonalCompanion(c, strangers, 'p-two', 'route-a', 1)),
      'not_admitted',
      'someone the payer is not enrolled for reserves nothing on it, on the restricted role directly',
    )
    assert.equal(
      await withActor(pool, bea, 'write', (c) => reservePersonalCompanion(c, call, 'p-two', 'route-a', 50)),
      'reserved',
    )
    assert.equal(
      await withActor(pool, cal, 'write', (c) =>
        settlePersonalCompanion(c, call, 0, { inputTokens: 0, outputTokens: 0 }),
      ),
      false,
    )
    assert.equal(await withActor(pool, cal, 'write', (c) => holdPersonalCompanion(c, call, 'usage_unknown')), false)
    assert.equal(await withActor(pool, cal, 'write', (c) => releasePersonalCompanion(c, call, 'not_prepared')), false)
    await assert.rejects(
      withActor(pool, bea, 'read', (c) => c.query('SELECT * FROM sophia.personal_companion_usage')),
      denied,
    )
    await assert.rejects(
      withActor(pool, bea, 'write', (c) => c.query(`UPDATE sophia.personal_companion_payers SET allowance_micros=1e9`)),
      denied,
    )
    await assert.rejects(
      withActor(pool, bea, 'write', (c) =>
        c.query(`SELECT sophia.reconcile_personal_companion($1, 0, '{"inputTokens":0,"outputTokens":0}')`, [call]),
      ),
      denied,
      'only an operator reconciles',
    )
    await assert.rejects(
      withActor(pool, bea, 'write', (c) =>
        settlePersonalCompanion(c, call, 1, JSON.parse('{"inputTokens":1,"outputTokens":1,"text":1}') as never),
      ),
      /token counts/,
      'a settlement keeps token counts only',
    )
    // Its owner may release it (never asked), which leaves the payer with no unresolved call.
    assert.equal(await withActor(pool, bea, 'write', (c) => releasePersonalCompanion(c, call, 'not_prepared')), true)
  })

  it('an uncertain call holds its payer until an operator reconciles it; erasure keeps every cost row', async () => {
    const dan = randomUUID()
    await enroll('p-two', dan)
    const call = await registered(dan)
    await withActor(pool, dan, 'write', (c) => reservePersonalCompanion(c, call, 'p-two', 'route-a', 50))
    assert.equal(await withActor(pool, dan, 'write', (c) => holdPersonalCompanion(c, call, 'usage_unknown')), true)
    const next = await registered(dan)
    assert.equal(
      await withActor(pool, dan, 'write', (c) => reservePersonalCompanion(c, next, 'p-two', 'route-a', 1)),
      'held',
    )
    await withActor(pool, dan, 'write', (c) => erasePersonalSpace(c, randomUUID(), 'delete'))
    const [kept] = await owner<{ state: string }>(
      `SELECT state FROM sophia.personal_companion_usage WHERE call_id=$1`,
      [call],
    )
    assert.equal(kept?.state, 'uncertain', 'the erasure leaves the cost row')
    await owner(`SELECT sophia.reconcile_personal_companion($1, 30, '{"inputTokens":10,"outputTokens":20}')`, [call])
    const later = await registered(dan)
    assert.equal(
      await withActor(pool, dan, 'write', (c) => reservePersonalCompanion(c, later, 'p-two', 'route-a', 1)),
      'reserved',
    )
  })

  // #435 4303867348: a reserved call that never settles (its process died after the provider was asked, or its
  // settlement failed) is unresolved usage. It holds its payer, for every owner, until an operator settles it from the
  // provider's record once its call is no longer registered. Its full reservation stays counted meanwhile.
  it('an abandoned reserved call holds its payer for every owner until an operator settles it from evidence', async () => {
    const eve = randomUUID()
    const fay = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('p-three', $1, 100000)`,
      [eve],
    )
    const call = await registered(eve)
    assert.equal(
      await withActor(pool, eve, 'write', (c) => reservePersonalCompanion(c, call, 'p-three', 'route-a', 50)),
      'reserved',
    )
    // A live call is not abandoned: the operator cannot settle it while it is registered.
    const [live] = await owner<{ ok: boolean }>(
      `SELECT sophia.reconcile_personal_companion($1, 30, '{"inputTokens":10,"outputTokens":20}') AS ok`,
      [call],
    )
    assert.equal(live?.ok, false, 'a registered call is still its runner’s')
    // FIXTURE: the runner is gone; its call registration has ended (0021 deletes it with the call).
    await owner(`DELETE FROM sophia.personal_companion_calls WHERE call_id=$1`, [call])
    const other = await registered(eve)
    assert.equal(
      await withActor(pool, eve, 'write', (c) => reservePersonalCompanion(c, other, 'p-three', 'route-a', 1)),
      'held',
      'the owner’s next call is held, with ample allowance left',
    )
    const strangers = await registered(fay)
    assert.equal(
      await withActor(pool, fay, 'write', (c) => reservePersonalCompanion(c, strangers, 'p-three', 'route-a', 1)),
      'not_admitted',
      'and nobody else is asked on it',
    )
    await withActor(pool, eve, 'write', (c) => erasePersonalSpace(c, randomUUID(), 'delete'))
    const [kept] = await owner<{ state: string; reserved_micros: string }>(
      `SELECT state, reserved_micros FROM sophia.personal_companion_usage WHERE call_id=$1`,
      [call],
    )
    assert.deepEqual(
      [kept?.state, kept?.reserved_micros],
      ['reserved', '50'],
      'the erasure keeps its full bound counted',
    )
    await assert.rejects(
      withActor(pool, fay, 'write', (c) =>
        c.query(`SELECT sophia.reconcile_personal_companion($1, 0, '{"inputTokens":0,"outputTokens":0}')`, [call]),
      ),
      denied,
      'the API role cannot settle or release it',
    )
    const [settled] = await owner<{ ok: boolean }>(
      `SELECT sophia.reconcile_personal_companion($1, 30, '{"inputTokens":10,"outputTokens":20}') AS ok`,
      [call],
    )
    assert.equal(settled?.ok, true, 'the operator settles it from the provider’s record')
    const [again] = await owner<{ ok: boolean }>(
      `SELECT sophia.reconcile_personal_companion($1, 0, '{"inputTokens":0,"outputTokens":0}') AS ok`,
      [call],
    )
    assert.equal(again?.ok, false, 'once')
    const [row] = await owner<{ state: string; used_micros: string }>(
      `SELECT state, used_micros FROM sophia.personal_companion_usage WHERE call_id=$1`,
      [call],
    )
    assert.deepEqual([row?.state, row?.used_micros], ['settled', '30'])
    const later = await registered(eve)
    assert.equal(
      await withActor(pool, eve, 'write', (c) => reservePersonalCompanion(c, later, 'p-three', 'route-a', 1)),
      'reserved',
    )
  })

  // #435 4303867352: admission and every usage transition take the payer first. Two independent connections, two
  // owners, one payer; each case waits for the other connection to be seen blocked on a lock, never on a timer.
  it('takes the payer first in both orders: a hold waits for an admission, and an admission for a hold', async () => {
    const gus = randomUUID()
    // One owner per payer (#435 4304103151): two independent connections of the payer's one owner.
    const hal = gus
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('p-four', $1, 100000)`,
      [gus],
    )
    const open = async (actor: string) => {
      const c = new pg.Client({ connectionString: db.apiUrl })
      await c.connect()
      await c.query('BEGIN')
      await c.query("SELECT set_config('sophia.actor_id', $1, true)", [actor])
      return c
    }
    const waitBlocked = async (pid: number | undefined) => {
      for (let i = 0; i < 200; i++) {
        const [row] = await owner<{ n: string }>(
          `SELECT count(*) AS n FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'`,
          [pid],
        )
        if (row?.n === '1') return true
        await new Promise((r) => setTimeout(r, 25))
      }
      return false
    }
    // Reserve first: hal's admission holds the payer; gus's hold waits until hal commits.
    const first = await registered(gus)
    assert.equal(
      await withActor(pool, gus, 'write', (c) => reservePersonalCompanion(c, first, 'p-four', 'route-a', 10)),
      'reserved',
    )
    const a = await open(hal)
    const b = await open(gus)
    try {
      const pidB = await backendPid(b)
      const halCall = await registered(hal)
      assert.equal(
        (
          await a.query<{ r: string }>(`SELECT sophia.reserve_personal_companion($1,'p-four','route-a',1) AS r`, [
            halCall,
          ])
        ).rows[0]?.r,
        'held',
      )
      const hold = b.query<{ ok: boolean }>(`SELECT sophia.hold_personal_companion($1,'usage_unknown') AS ok`, [first])
      assert.equal(await waitBlocked(pidB), true, 'the hold waits for the admission holding the payer')
      await a.query('COMMIT')
      assert.equal((await hold).rows[0]?.ok, true)
      await b.query('COMMIT')
    } finally {
      await a.end()
      await b.end()
    }
    // Hold first: gus's hold of a fresh reservation holds the payer; hal's admission waits, then sees it unresolved.
    await owner(`SELECT sophia.reconcile_personal_companion($1, 5, '{"inputTokens":1,"outputTokens":1}')`, [first])
    const second = await registered(gus)
    assert.equal(
      await withActor(pool, gus, 'write', (c) => reservePersonalCompanion(c, second, 'p-four', 'route-a', 10)),
      'reserved',
    )
    const c1 = await open(gus)
    const c2 = await open(hal)
    try {
      const pid2 = await backendPid(c2)
      assert.equal(
        (await c1.query<{ ok: boolean }>(`SELECT sophia.hold_personal_companion($1,'usage_unknown') AS ok`, [second]))
          .rows[0]?.ok,
        true,
      )
      const halCall = await registered(hal)
      const reserve = c2.query<{ r: string }>(
        `SELECT sophia.reserve_personal_companion($1,'p-four','route-a',1) AS r`,
        [halCall],
      )
      assert.equal(await waitBlocked(pid2), true, 'the admission waits for the hold holding the payer')
      await c1.query('COMMIT')
      assert.equal((await reserve).rows[0]?.r, 'held', 'then sees the payer held')
      await c2.query('COMMIT')
    } finally {
      await c1.end()
      await c2.end()
    }
  })

  // #435 4304290365: an erasure and an admission are taken in turn on the owner's space, in both orders, also while a
  // third connection holds the payer. Each case waits for the other connection to be seen blocked on a lock.
  it('takes the space before the payer: an erasure waits for an admission, and an admission for an erasure', async () => {
    const ivy = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('p-five', $1, 100000)`,
      [ivy],
    )
    const blocked = async (pid: number | undefined) => {
      for (let i = 0; i < 200; i++) {
        const [row] = await owner<{ n: string }>(
          `SELECT count(*) AS n FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'`,
          [pid],
        )
        if (row?.n === '1') return true
        await new Promise((r) => setTimeout(r, 25))
      }
      return false
    }
    const usageOf = async (call: string) =>
      owner<{ state: string; epoch: string }>(
        `SELECT state, epoch::text FROM sophia.personal_companion_usage WHERE call_id=$1`,
        [call],
      )
    // An admission first, waiting on a payer a third connection holds: the erasure waits for it, so the admission is
    // wholly before the erasure (its cost stays, for the erasure to drain), never after it.
    const old = await registered(ivy)
    const payer = await openTx(db.ownerUrl)
    await payer.query(`SELECT 1 FROM sophia.personal_companion_payers WHERE payer='p-five' FOR UPDATE`)
    const admit = await openTx(db.apiUrl, ivy)
    const erase = await openTx(db.apiUrl, ivy)
    // Each pid is read before its connection is given a statement that may wait (a client runs one at a time).
    const [admitPid, erasePid] = [await backendPid(admit), await backendPid(erase)]
    try {
      const reserving = admit.query<{ r: string }>(
        `SELECT sophia.reserve_personal_companion($1,'p-five','route-a',1) AS r`,
        [old],
      )
      assert.equal(await blocked(admitPid), true, 'the admission waits for the payer')
      const erasing = erase.query(`SELECT sophia.erase_personal_space($1,'delete')`, [randomUUID()])
      assert.equal(await blocked(erasePid), true, 'the erasure waits for the admission holding the space')
      await payer.query('COMMIT')
      assert.equal((await reserving).rows[0]?.r, 'reserved')
      await admit.query('COMMIT')
      await erasing
      await erase.query('COMMIT')
    } finally {
      await Promise.all([payer, admit, erase].map((c) => c.end().catch(() => undefined)))
    }
    assert.deepEqual(
      (await usageOf(old)).map((u) => u.state),
      ['reserved'],
    )
    await owner(`UPDATE sophia.personal_companion_usage SET state='released' WHERE call_id=$1`, [old])
    // An erasure first: the admission waits for it, then finds its call from before the erasure (not_current), and
    // nothing is reserved.
    const earlier = await registered(ivy)
    const erase2 = await openTx(db.apiUrl, ivy)
    const admit2 = await openTx(db.apiUrl, ivy)
    const admit2Pid = await backendPid(admit2)
    try {
      await erase2.query(`SELECT sophia.erase_personal_space($1,'delete')`, [randomUUID()])
      const reserving = admit2.query<{ r: string }>(
        `SELECT sophia.reserve_personal_companion($1,'p-five','route-a',1) AS r`,
        [earlier],
      )
      assert.equal(await blocked(admit2Pid), true, 'the admission waits for the erasure holding the space')
      await erase2.query('COMMIT')
      assert.equal((await reserving).rows[0]?.r, 'not_current')
      await admit2.query('COMMIT')
    } finally {
      await Promise.all([erase2, admit2].map((c) => c.end().catch(() => undefined)))
    }
    assert.deepEqual(await usageOf(earlier), [])
  })
})
