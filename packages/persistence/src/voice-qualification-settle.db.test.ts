// What a bridge spent and the API may not hold (PR #190's billing P1s, r4235198833 and r4232295959; FND-B-G7-MAIN-PORT-01),
// level: sql-run. A generation that started unasked, and a debt a transcription or Sophia's words left, are charged
// after they arrived: a bridge process killed before that charge lands leaves it off the ledger, and PostgreSQL cannot
// know. So no connection is trusted as fully charged until its bridge says so (0085's 'settle'), and a new connection
// on an exchange whose earlier one never settled ends the exchange ('unsettled'): nothing more is spent on counts
// that may be short. A charge for what was already spent still lands on an exchange that has ended.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  createPool,
  readSnapshot,
  reserveQualification,
  startExchange,
  withActor,
  withService,
  type QualificationReserve,
} from './index.ts'

const A = randomUUID() // admin
const P = randomUUID() // the synthetic principal, an editor
const RUN = 'ab'.repeat(32)

let db: TestDatabase
let pool: pg.Pool

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
})
after(async () => {
  await pool.end()
  await db.drop()
})

async function owner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof DomainError ? err.code : `raw:${String(err)}`
  }
}

/** A project, a grant for P (3 connections, 20 turns, 1,000 output a turn, 200,000 in all), and an exchange P opened. */
async function exchange(): Promise<{ exchangeId: string; grantId: string }> {
  const seeded = await seedProject(db.ownerUrl, { admin: A, editors: [P] })
  const grantId = await owner(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `SELECT (sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',900,3,20,1000,200000,3600)).id AS id`,
      [seeded.projectId, P, RUN],
    )
    return rows[0]?.id ?? ''
  })
  const snap = await withActor(pool, P, 'read', (c) => readSnapshot(c, seeded.projectId))
  assert.ok(snap)
  const { exchangeId } = await withActor(pool, P, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  return { exchangeId, grantId }
}

const reserve = (
  x: { exchangeId: string; grantId: string },
  kind: QualificationReserve['kind'],
  ordinal?: number,
  charge?: number,
  owed?: number,
) =>
  withService(pool, (c) =>
    reserveQualification(c, {
      ...x,
      kind,
      ...(ordinal === undefined ? {} : { ordinal }),
      ...(charge === undefined ? {} : { charge }),
      ...(owed === undefined ? {} : { owed }),
    }),
  )

/** What the ledger holds of the exchange: its state and why it ended, its counters, and what it may have cost. */
const ledgerOf = async (exchangeId: string) =>
  (
    await owner((c) =>
      c.query<{ state: string; reason: string | null; connections: number; turns: number; committed: string }>(
        `SELECT e.state, q.ended_reason AS reason, q.connections_opened AS connections, q.turns,
                sophia.voice_committed(e.id)::text AS committed
           FROM sophia.room_exchanges e JOIN sophia.voice_qualification_exchanges q ON q.exchange_id=e.id
          WHERE e.id=$1`,
        [exchangeId],
      ),
    )
  ).rows[0]

describe('a connection is trusted as fully charged only once its bridge settles it (0085)', () => {
  it('a bridge killed with a charge unanswered: the next connection ends the exchange (unsettled), granting nothing', async () => {
    const x = await exchange()
    assert.deepEqual(await reserve(x, 'connection'), { ok: true, ordinal: 1, stop: null, ended: false })
    assert.equal((await reserve(x, 'generation', 1, 3000)).ok, true)
    // Output arrived unasked and the process died before its charge was asked: nothing of it reached the ledger.
    const prior = await ledgerOf(x.exchangeId)
    assert.deepEqual(await reserve(x, 'connection'), { ok: false, ordinal: null, stop: 'unsettled', ended: true })
    assert.deepEqual(await ledgerOf(x.exchangeId), {
      ...prior,
      state: 'ended',
      reason: 'unsettled',
    })
    // And so nothing more is granted on it: a generation on the old connection is refused, the exchange having ended.
    assert.equal(await codeOf(reserve(x, 'generation', 1, 3000)), 'invalid_state')
  })

  it('two processes on one exchange at once (a deploy’s overlap): the second’s connection ends it, never runs beside it', async () => {
    const x = await exchange()
    assert.equal((await reserve(x, 'connection')).ordinal, 1)
    assert.deepEqual(await reserve(x, 'connection'), { ok: false, ordinal: null, stop: 'unsettled', ended: true })
    assert.equal((await ledgerOf(x.exchangeId))?.connections, 1)
  })

  it('a connection its bridge settled: the next one is granted on the exchange’s true counts', async () => {
    const x = await exchange()
    assert.equal((await reserve(x, 'connection')).ordinal, 1)
    assert.equal((await reserve(x, 'generation', 1, 3000)).ok, true)
    assert.equal((await reserve(x, 'unasked', 1, 3000)).ok, true)
    assert.deepEqual(await reserve(x, 'settle', 1), { ok: true, ordinal: 1, stop: null, ended: false })
    assert.deepEqual(await reserve(x, 'connection'), { ok: true, ordinal: 2, stop: null, ended: false })
    assert.deepEqual(await ledgerOf(x.exchangeId), {
      state: 'open',
      reason: null,
      connections: 2,
      turns: 2,
      committed: '6000',
    })
    // Settling again is the same answer; a connection never reserved cannot be settled.
    assert.equal((await reserve(x, 'settle', 1)).ok, true)
    assert.equal(await codeOf(reserve(x, 'settle', 9)), 'invalid_request')
    assert.equal(await codeOf(reserve(x, 'settle')), 'invalid_request')
  })
})

describe('a charge for what was already spent lands on an exchange that has ended (0085)', () => {
  it('after the bridge’s own stop: an unasked generation and a debt are kept, counted; a new generation is not', async () => {
    const x = await exchange()
    assert.equal((await reserve(x, 'connection')).ordinal, 1)
    assert.equal((await reserve(x, 'generation', 1, 3000)).ok, true)
    assert.equal((await reserve(x, 'stop')).ok, true)
    assert.equal((await ledgerOf(x.exchangeId))?.reason, 'bridge')
    // Spent before the stop was answered, charged after: kept, as the provider billed it.
    assert.deepEqual(await reserve(x, 'unasked', 1, 2500), { ok: true, ordinal: 1, stop: null, ended: true })
    assert.deepEqual(await reserve(x, 'spend', 1, 40), { ok: true, ordinal: 1, stop: null, ended: true })
    assert.deepEqual(await ledgerOf(x.exchangeId), {
      state: 'ended',
      reason: 'bridge',
      connections: 1,
      turns: 2,
      committed: '5540',
    })
    // Nothing new is granted: a generation is still refused once the exchange ended, and so is a connection.
    assert.equal(await codeOf(reserve(x, 'generation', 1, 3000)), 'invalid_state')
    assert.equal(await codeOf(reserve(x, 'connection')), 'invalid_state')
    // And the connection can still be settled, so what it spent is known to be all there.
    assert.equal((await reserve(x, 'settle', 1)).ok, true)
  })
})

// R2-G7-INTERIM-F1: a debt is for what the provider already billed (a transcription, Sophia's words), charged after it
// arrived. Charged while the exchange is still open, it can be the very charge that crosses the budget or a limit: the
// exchange then ends, and what was already spent must still be on the ledger. What it would have prepaid for input not
// sent yet is not: that is refused, as any reservation past the bound is.
describe('a refused charge keeps what was already spent, and grants nothing (0085 owed)', () => {
  it('a top-up whose debt crosses the budget: refused (usage), the exchange ends, the debt kept, the refill not', async () => {
    const x = await exchange()
    assert.equal((await reserve(x, 'connection')).ordinal, 1)
    assert.equal((await reserve(x, 'generation', 1, 150_000)).ok, true)
    // 60,000 asked: 50,000 owed for words already heard, 10,000 to refill the allowance. 210,000 is past 200,000.
    const answer = await reserve(x, 'spend', 1, 60_000, 50_000)
    assert.deepEqual(await ledgerOf(x.exchangeId), {
      state: 'ended',
      reason: 'usage',
      connections: 1,
      turns: 1,
      committed: '200000',
    })
    assert.deepEqual(answer, { ok: false, ordinal: null, stop: 'usage', ended: true, kept: 50_000 })
    // Nothing new on it: no generation, no connection; a late debt still lands, and the connection can be settled.
    assert.equal(await codeOf(reserve(x, 'generation', 1, 3000)), 'invalid_state')
    assert.equal(await codeOf(reserve(x, 'connection')), 'invalid_state')
    assert.equal((await reserve(x, 'settle', 1)).ok, true)
  })

  it('a generation asked with a debt in its prepay, past the turns: refused, the debt kept, no turn counted', async () => {
    const x = await exchange()
    assert.equal((await reserve(x, 'connection')).ordinal, 1)
    for (let turn = 0; turn < 20; turn += 1) assert.equal((await reserve(x, 'generation', 1, 1000)).ok, true)
    assert.deepEqual(await reserve(x, 'generation', 1, 4000, 700), {
      ok: false,
      ordinal: null,
      stop: 'turns',
      ended: true,
      kept: 700,
    })
    assert.deepEqual(await ledgerOf(x.exchangeId), {
      state: 'ended',
      reason: 'turns',
      connections: 1,
      turns: 20,
      committed: '20700',
    })
  })

  it('a refill with nothing owed, past the budget: refused as before, and nothing kept (control)', async () => {
    const x = await exchange()
    assert.equal((await reserve(x, 'connection')).ordinal, 1)
    assert.equal((await reserve(x, 'generation', 1, 150_000)).ok, true)
    assert.deepEqual(await reserve(x, 'spend', 1, 60_000), {
      ok: false,
      ordinal: null,
      stop: 'usage',
      ended: true,
      kept: 0,
    })
    assert.equal((await ledgerOf(x.exchangeId))?.committed, '150000')
  })

  it('an unasked generation past a limit: refused, and its whole charge kept, as it always was; the answer says so', async () => {
    const x = await exchange()
    assert.equal((await reserve(x, 'connection')).ordinal, 1)
    assert.equal((await reserve(x, 'generation', 1, 150_000)).ok, true)
    assert.deepEqual(await reserve(x, 'unasked', 1, 60_000), {
      ok: false,
      ordinal: null,
      stop: 'usage',
      ended: true,
      kept: 60_000,
    })
    assert.equal((await ledgerOf(x.exchangeId))?.committed, '210000')
  })

  it('owed is part of a generation’s or a top-up’s charge, and nothing else’s', async () => {
    const x = await exchange()
    assert.equal((await reserve(x, 'connection')).ordinal, 1)
    assert.equal(await codeOf(reserve(x, 'spend', 1, 100, 101)), 'invalid_request')
    assert.equal(await codeOf(reserve(x, 'spend', 1, 100, -1)), 'invalid_request')
    assert.equal(await codeOf(reserve(x, 'unasked', 1, 100, 100)), 'invalid_request')
    assert.equal(await codeOf(reserve(x, 'settle', 1, undefined, 1)), 'invalid_request')
    assert.equal((await ledgerOf(x.exchangeId))?.committed, '0')
  })
})

// R2-G7-42CD-P1: the bridge's bound stopped the session and its stop's own request never committed. Its settlement says
// so (stopped), and the exchange ends with it, in the same transaction: no connection is reusable while that stop is
// missing.
describe('a settlement of a session its bound stopped carries that stop (0085 stopped)', () => {
  it('the stop lost, the settlement taken: the exchange ends (bridge) with it, and the next connection is refused', async () => {
    const x = await exchange()
    assert.equal((await reserve(x, 'connection')).ordinal, 1)
    assert.equal((await reserve(x, 'generation', 1, 3000)).ok, true)
    const settled = await withService(pool, (c) =>
      reserveQualification(c, { ...x, kind: 'settle', ordinal: 1, stopped: true }),
    )
    assert.deepEqual(settled, { ok: true, ordinal: 1, stop: null, ended: true })
    assert.deepEqual(await ledgerOf(x.exchangeId), {
      state: 'ended',
      reason: 'bridge',
      connections: 1,
      turns: 1,
      committed: '3000',
    })
    assert.equal(await codeOf(reserve(x, 'connection')), 'invalid_state')
  })

  it('on an exchange already ended (the stop taken, or a limit): answered the same, and the first reason stays', async () => {
    const x = await exchange()
    assert.equal((await reserve(x, 'connection')).ordinal, 1)
    for (let turn = 0; turn < 20; turn += 1) assert.equal((await reserve(x, 'generation', 1, 1000)).ok, true)
    assert.equal((await reserve(x, 'generation', 1, 1000)).stop, 'turns')
    const settled = await withService(pool, (c) =>
      reserveQualification(c, { ...x, kind: 'settle', ordinal: 1, stopped: true }),
    )
    assert.deepEqual(settled, { ok: true, ordinal: 1, stop: null, ended: true })
    assert.equal((await ledgerOf(x.exchangeId))?.reason, 'turns')
  })

  it('a settlement with no stop leaves the exchange open (control); stopped is a settlement’s alone', async () => {
    const x = await exchange()
    assert.equal((await reserve(x, 'connection')).ordinal, 1)
    const plain = await withService(pool, (c) =>
      reserveQualification(c, { ...x, kind: 'settle', ordinal: 1, stopped: false }),
    )
    assert.deepEqual(plain, { ok: true, ordinal: 1, stop: null, ended: false })
    assert.equal((await ledgerOf(x.exchangeId))?.state, 'open')
    const misplaced = withService(pool, (c) =>
      reserveQualification(c, { ...x, kind: 'generation', ordinal: 1, charge: 10, stopped: true }),
    )
    assert.equal(await codeOf(misplaced), 'invalid_request')
    assert.equal((await ledgerOf(x.exchangeId))?.state, 'open')
  })
})
