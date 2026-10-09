// Voice qualification under concurrency (migration 0046), level: sql-run. A receipt or a reservation holds its own
// exchange and checks only that one; the guard skips a row another transaction holds and ends it on a later run; all of
// them lock a project before its exchange (0003), as control_exchange does. The calls are raw SQL on the sophia_api
// login, so a deadlock (40P01) shows as itself.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { createPool, readSnapshot, startExchange, withActor } from './index.ts'

const A = randomUUID() // admin
const P = randomUUID() // the synthetic principal, an editor
const RUN = 'ab'.repeat(32)
const TRIALS = 20

let db: TestDatabase
let pool: pg.Pool

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 10 })
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

/** One statement in its own transaction on the API's login, as the bridge (no actor) or as a member: 'ok' or its SQLSTATE. */
async function run(sql: string, params: unknown[], actor: string | null = null): Promise<string> {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    if (actor) await c.query(`SELECT set_config('sophia.actor_id', $1, true)`, [actor])
    // A wait longer than this is a lock the statement should never have waited on.
    await c.query(`SET LOCAL lock_timeout = '5s'`)
    await c.query(sql, params)
    await c.query('COMMIT')
    return 'ok'
  } catch (err: unknown) {
    await c.query('ROLLBACK').catch(() => undefined)
    return (err as { code?: string }).code ?? 'error'
  } finally {
    c.release()
  }
}

/** A project with a grant whose exchanges may last 60 s, and an exchange opened 61 s ago: due at the deadline. */
async function dueExchange(): Promise<{ projectId: string; exchangeId: string; grantId: string }> {
  const seeded = await seedProject(db.ownerUrl, { admin: A, editors: [P] })
  const grantId = await owner(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `SELECT (sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',60,3,20,1000,200000,3600)).id AS id`,
      [seeded.projectId, P, RUN],
    )
    return rows[0]?.id ?? ''
  })
  const snap = await withActor(pool, P, 'read', (c) => readSnapshot(c, seeded.projectId))
  assert.ok(snap)
  const { exchangeId } = await withActor(pool, P, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  await owner(async (c) => {
    await c.query(
      `UPDATE sophia.voice_qualification_grants SET created_at=created_at-interval '61 s',
        expires_at=expires_at-interval '61 s' WHERE id=$1`,
      [grantId],
    )
    await c.query(`UPDATE sophia.room_exchanges SET opened_at=opened_at-interval '61 s' WHERE id=$1`, [exchangeId])
  })
  return { projectId: seeded.projectId, exchangeId, grantId }
}

const receipt = (grantId: string) =>
  JSON.stringify({
    kind: 'input_turn',
    schema: 'sophia.bridge.voice_qualification.v1',
    grantId,
    runBindingSha256: RUN,
    atMs: 1,
  })
const write = (x: { exchangeId: string; grantId: string }, seq = 1) =>
  run(`SELECT sophia.media_record_evidence($1,$2,$3,'input_turn',$4)`, [
    x.exchangeId,
    x.grantId,
    seq,
    receipt(x.grantId),
  ])
const reserve = (x: { exchangeId: string; grantId: string }) =>
  run(`SELECT sophia.media_voice_reserve($1,$2,'connection',NULL,NULL)`, [x.exchangeId, x.grantId])
const guard = () => run(`SELECT sophia.voice_qualification_guard()`, [])
const stopSpeaking = (x: { exchangeId: string }) =>
  run(`SELECT sophia.control_exchange($1,'stop_speaking',NULL)`, [x.exchangeId], P)

async function endedWhy(exchangeId: string): Promise<string> {
  const { rows } = await owner((c) =>
    c.query<{ state: string; reason: string | null }>(
      `SELECT e.state, q.ended_reason AS reason FROM sophia.room_exchanges e
        LEFT JOIN sophia.voice_qualification_exchanges q ON q.exchange_id=e.id WHERE e.id=$1`,
      [exchangeId],
    ),
  )
  return `${rows[0]?.state}:${rows[0]?.reason}`
}

/** A transaction on the owner's login holding `sql`'s row locks until `release` is called. */
async function holding(sql: string, params: unknown[]): Promise<() => Promise<void>> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  await c.query('BEGIN')
  await c.query(sql, params)
  return async () => {
    await c.query('COMMIT')
    await c.end()
  }
}

describe('voice qualification under concurrency: no deadlock, and every due exchange still ends (0046)', () => {
  it('receipts for two due exchanges at once, with the guard: no deadlock in 20 trials, and each ends', async () => {
    const outcomes: string[] = []
    const all: string[] = []
    for (let trial = 0; trial < TRIALS; trial += 1) {
      const a = await dueExchange()
      const b = await dueExchange()
      all.push(a.exchangeId, b.exchangeId)
      outcomes.push(...(await Promise.all([write(a), write(b), guard()])))
    }
    assert.deepEqual(
      outcomes.filter((o) => o !== 'ok'),
      [],
      'no deadlock (40P01) and no wait past the lock timeout (55P03)',
    )
    assert.equal(await guard(), 'ok')
    for (const x of all) assert.equal(await endedWhy(x), 'ended:deadline')
  })

  it('a member’s control racing a receipt, a reservation or the guard that ends the exchange: no deadlock', async () => {
    const outcomes: string[] = []
    const all: string[] = []
    for (let trial = 0; trial < TRIALS; trial += 1) {
      const [a, b, c] = [await dueExchange(), await dueExchange(), await dueExchange()]
      all.push(a.exchangeId, b.exchangeId, c.exchangeId)
      const results = await Promise.all([
        stopSpeaking(a),
        write(a),
        stopSpeaking(b),
        reserve(b),
        stopSpeaking(c),
        guard(),
      ])
      // Stop Speaking on an exchange the race already ended is refused as such (40001): that is not a deadlock.
      outcomes.push(...results.filter((r) => r !== '40001'))
    }
    assert.deepEqual(
      outcomes.filter((o) => o !== 'ok'),
      [],
      'no deadlock (40P01) and no wait past the lock timeout (55P03)',
    )
    assert.equal(await guard(), 'ok')
    for (const x of all) assert.equal(await endedWhy(x), 'ended:deadline')
  })

  it('the guard never waits on an exchange, or its project, that another transaction holds; a later run ends it', async () => {
    for (const lock of ['exchange', 'project'] as const) {
      const x = await dueExchange()
      const release = await holding(
        lock === 'exchange'
          ? `SELECT 1 FROM sophia.room_exchanges WHERE id=$1 FOR UPDATE`
          : `SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`,
        [lock === 'exchange' ? x.exchangeId : x.projectId],
      )
      try {
        const started = Date.now()
        assert.equal(await guard(), 'ok', `the guard did not wait on the held ${lock}`)
        assert.ok(Date.now() - started < 4000, `the guard did not wait on the held ${lock}`)
        assert.equal(await endedWhy(x.exchangeId), 'open:null', 'skipped while held')
      } finally {
        await release()
      }
      assert.equal(await guard(), 'ok')
      assert.equal(await endedWhy(x.exchangeId), 'ended:deadline', `ended once the ${lock} was free`)
    }
  })

  it('a receipt checks its own exchange alone: another due exchange is left to the guard', async () => {
    const due = await dueExchange()
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
    assert.equal(await write({ exchangeId, grantId }), 'ok')
    assert.equal(await endedWhy(exchangeId), 'open:null')
    assert.equal(await endedWhy(due.exchangeId), 'open:null', 'another exchange’s receipt did not end it')
    assert.equal(await write(due), 'ok')
    assert.equal(await endedWhy(due.exchangeId), 'ended:deadline', 'its own receipt did, under its lock')
  })
})
