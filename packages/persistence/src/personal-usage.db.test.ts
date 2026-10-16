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
    `INSERT INTO sophia.personal_companion_payers(payer, allowance_micros) VALUES ('p-one', 1000), ('p-two', 1000)`,
  )
})

after(async () => {
  await pool.end()
  await db.drop()
})

describe('personal companion usage (0073)', () => {
  it('reserves once per registered call of the current epoch, within the admitted allowance', async () => {
    const ana = randomUUID()
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
      await reserve(await registered(ana), 'p-one', 500),
      'exhausted',
      'reserved counts against the allowance',
    )
    assert.equal(
      await withActor(pool, ana, 'write', (c) =>
        settlePersonalCompanion(c, call, 120, { inputTokens: 100, outputTokens: 40 }),
      ),
      true,
    )
    assert.equal(await reserve(await registered(ana), 'p-one', 500), 'reserved', 'settled counts what it used')
    // A call registered before an erasure reserves nothing after it.
    const stale = await registered(ana)
    await withActor(pool, ana, 'write', (c) => erasePersonalSpace(c, randomUUID(), 'delete'))
    assert.equal(await reserve(stale, 'p-one', 10), 'not_current')
  })

  it('is the owner’s own: another person settles, holds or releases none of it, and the API role reads none', async () => {
    const bea = randomUUID()
    const cal = randomUUID()
    const call = await registered(bea)
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
  })

  it('an uncertain call holds its payer until an operator reconciles it; erasure keeps every cost row', async () => {
    const dan = randomUUID()
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
})
