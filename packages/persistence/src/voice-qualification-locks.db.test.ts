// Voice qualification under concurrency (migration 0046), level: sql-run. A receipt or a reservation holds its own
// exchange and checks only that one; the guard skips a row another transaction holds and ends it on a later run; all of
// them lock a project before its exchange (0003), as control_exchange does. The calls are raw SQL on the sophia_api
// login, so a deadlock (40P01) shows as itself.
import { createHash, randomUUID } from 'node:crypto'
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
/** The clients a transaction holds open across statements (opened, started) and has not given back yet. */
const checkedOut = new Set<pg.PoolClient>()

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 10 })
})
after(async () => {
  // pool.end() waits for every client checked out: one a failed test never gave back would hold it forever. Such a
  // client is destroyed instead, which ends its backend and rolls its transaction back.
  for (const c of checkedOut) c.release(true)
  checkedOut.clear()
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

/**
 * A project with a grant whose exchanges may last 60 s, and an exchange opened 61 s ago: due at the deadline. With
 * `connection`, a provider connection (ordinal 1) was reserved while it was not due yet, so a top-up may name it.
 */
async function dueExchange(
  due = true,
  connection = false,
): Promise<{ projectId: string; exchangeId: string; grantId: string }> {
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
  if (connection) assert.equal(await reserve({ exchangeId, grantId }), 'ok')
  if (due)
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
/** A top-up of connection 1's input allowance (spend). */
const spend = (x: { exchangeId: string; grantId: string }) =>
  run(`SELECT sophia.media_voice_reserve($1,$2,'spend',1,4000)`, [x.exchangeId, x.grantId])
const guard = () => run(`SELECT sophia.voice_qualification_guard()`, [])
const E = randomUUID() // another member, a peer of the principal's
/** The digest of a call's arguments as the API claims it (0047): SHA-256 over their canonical JSON. */
const argsSha256 = (canonical: string) => createHash('sha256').update(canonical).digest('hex')
/** A call with no arguments ('{}'). */
const NO_ARGS = argsSha256('{}')
/**
 * The API's claim of a bound tool call's key (0047), for a speaker, and an epoch, a tool and its arguments' digest
 * (by default 1, project_status and no arguments).
 */
const claim = (
  x: { exchangeId: string },
  actor: string,
  key: string,
  { tool = 'project_status', epoch = 1, args = NO_ARGS }: { tool?: string; epoch?: number; args?: string } = {},
) => run(`SELECT sophia.media_claim_live_call($1,$2,$3,$4,$5,$6)`, [x.exchangeId, epoch, actor, key, tool, args])
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

/** A statement in its own transaction, started now: its backend at once, its outcome ('ok' or SQLSTATE) when it ends. */
async function started(sql: string, params: unknown[], actor: string | null = null) {
  const c = await pool.connect()
  checkedOut.add(c)
  await c.query('BEGIN')
  if (actor) await c.query(`SELECT set_config('sophia.actor_id', $1, true)`, [actor])
  await c.query(`SET LOCAL lock_timeout = '10s'`)
  const pid = Number((await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid)
  let settled = false
  const done = c
    .query(sql, params)
    .then(
      async () => {
        await c.query('COMMIT')
        return 'ok'
      },
      async (err: unknown) => {
        await c.query('ROLLBACK').catch(() => undefined)
        return (err as { code?: string }).code ?? 'error'
      },
    )
    .finally(() => {
      settled = true
      if (checkedOut.delete(c)) c.release()
    })
  return { pid, done, settled: () => settled }
}

/** Until the statement either ended or waits for a lock (pg_stat_activity), whichever comes first. */
async function untilBlocked(s: { pid: number; settled: () => boolean }): Promise<'done' | 'waiting'> {
  for (let looked = 0; looked < 500; looked += 1) {
    if (s.settled()) return 'done'
    const { rows } = await owner((c) =>
      c.query<{ w: string | null }>(`SELECT wait_event_type AS w FROM pg_stat_activity WHERE pid=$1`, [s.pid]),
    )
    if (rows[0]?.w === 'Lock') return 'waiting'
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`backend ${String(s.pid)} neither ended nor waited`)
}

/**
 * A project with the principal and a peer (Davide, E, bound at epoch 2), with or without the principal's grant, and an
 * exchange the principal opened (epoch 1).
 */
async function peerExchange(granted: boolean): Promise<{ projectId: string; exchangeId: string }> {
  const seeded = await seedProject(db.ownerUrl, { admin: A, editors: [P, E] })
  if (granted)
    await owner((c) =>
      c.query(`SELECT sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',900,3,20,1000,200000,3600)`, [
        seeded.projectId,
        P,
        RUN,
      ]),
    )
  const snap = await withActor(pool, P, 'read', (c) => readSnapshot(c, seeded.projectId))
  assert.ok(snap)
  const { exchangeId } = await withActor(pool, P, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  await owner((c) =>
    c.query(`INSERT INTO sophia.exchange_inputs(project_id,exchange_id,input_epoch,actor_id) VALUES($1,$2,2,$3)`, [
      seeded.projectId,
      exchangeId,
      E,
    ]),
  )
  return { projectId: seeded.projectId, exchangeId }
}

/** An open transaction on the API's login, as the service, and its backend. */
async function opened(): Promise<{ c: pg.PoolClient; pid: number }> {
  const c = await pool.connect()
  checkedOut.add(c)
  await c.query('BEGIN')
  await c.query(`SET LOCAL lock_timeout = '10s'`)
  const pid = Number((await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid)
  return { c, pid }
}

/** A statement sent on an open transaction: whether it settled yet, and its outcome ('ok' or SQLSTATE) when it does. */
function sent(t: { c: pg.PoolClient; pid: number }, sql: string, params: unknown[]) {
  let settled = false
  const done = t.c
    .query(sql, params)
    .then(
      () => 'ok',
      (err: unknown) => (err as { code?: string }).code ?? 'error',
    )
    .finally(() => {
      settled = true
    })
  return { pid: t.pid, done, settled: () => settled }
}

/** Commit what went on, roll back what did not, and give the connection back; once, whoever calls it first. */
async function finish(t: { c: pg.PoolClient }, outcome: string): Promise<void> {
  if (!checkedOut.delete(t.c)) return
  await t.c.query(outcome === 'ok' ? 'COMMIT' : 'ROLLBACK').catch(() => undefined)
  t.c.release()
}

/** The principal's own recorded calls in an exchange, as they read them. */
async function callsOf(exchangeId: string): Promise<unknown[]> {
  const { rows } = await withActor(pool, P, 'read', (c) =>
    c.query<{ r: { calls: unknown[] } }>(`SELECT sophia.exchange_calls($1) AS r`, [exchangeId]),
  )
  return rows[0]?.r.calls ?? []
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

  it('a member’s control racing a receipt, a reservation, a top-up or the guard that ends the exchange: no deadlock', async () => {
    const outcomes: string[] = []
    const all: string[] = []
    for (let trial = 0; trial < TRIALS; trial += 1) {
      const [a, b, c, d] = [
        await dueExchange(),
        await dueExchange(),
        await dueExchange(),
        await dueExchange(true, true),
      ]
      all.push(a.exchangeId, b.exchangeId, c.exchangeId, d.exchangeId)
      const results = await Promise.all([
        stopSpeaking(a),
        write(a),
        stopSpeaking(b),
        reserve(b),
        stopSpeaking(c),
        guard(),
        stopSpeaking(d),
        spend(d),
        write(d, 2),
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
        const since = Date.now()
        assert.equal(await guard(), 'ok', `the guard did not wait on the held ${lock}`)
        assert.ok(Date.now() - since < 4000, `the guard did not wait on the held ${lock}`)
        assert.equal(await endedWhy(x.exchangeId), 'open:null', 'skipped while held')
      } finally {
        await release()
      }
      assert.equal(await guard(), 'ok')
      assert.equal(await endedWhy(x.exchangeId), 'ended:deadline', `ended once the ${lock} was free`)
    }
  })

  it('a top-up is taken under the project’s and the exchange’s locks: it waits for either one another holds', async () => {
    for (const lock of ['project', 'exchange'] as const) {
      const x = await dueExchange(false, true)
      const release = await holding(
        lock === 'exchange'
          ? `SELECT 1 FROM sophia.room_exchanges WHERE id=$1 FOR UPDATE`
          : `SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`,
        [lock === 'exchange' ? x.exchangeId : x.projectId],
      )
      let held = true
      try {
        const topUp = await started(`SELECT sophia.media_voice_reserve($1,$2,'spend',1,4000)`, [
          x.exchangeId,
          x.grantId,
        ])
        assert.equal(await untilBlocked(topUp), 'waiting', `the top-up waits for the held ${lock}`)
        await release()
        held = false
        assert.equal(await topUp.done, 'ok', `granted once the ${lock} is free`)
      } finally {
        if (held) await release()
      }
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

  describe('a bound tool call’s key is one call, whoever speaks (0047; root’s ruling on PR #190)', () => {
    it('the same call again is a no-op; another speaker, epoch, tool or arguments under the key is refused; a member never claims', async () => {
      const x = await dueExchange(false)
      const key = `live:${x.exchangeId}:1:c-1`
      assert.equal(await claim(x, P, key), 'ok')
      assert.equal(await claim(x, P, key), 'ok', 'the bridge’s retry of a lost answer')
      assert.equal(await claim(x, E, key), '23505', 'another speaker')
      assert.equal(await claim(x, P, key, { epoch: 2 }), '23505', 'another epoch')
      assert.equal(await claim(x, P, key, { tool: 'control_work' }), '23505', 'another tool')
      // Codex P1 r4233409532: the same speaker, epoch and tool with other arguments is another call, not a retry.
      const other = argsSha256('{"verbose":true}')
      assert.equal(await claim(x, P, key, { args: other }), '23505', 'other arguments')
      const held = `live:${x.exchangeId}:1:c-4`
      assert.equal(await claim(x, P, held, { args: other }), 'ok', 'a call with arguments')
      assert.equal(await claim(x, P, held, { args: other }), 'ok', 'its retry, the same digest')
      assert.equal(await claim(x, P, held), '23505', 'the same id with no arguments')
      assert.equal(await claim(x, P, `live:${x.exchangeId}:1:c-5`, { args: 'x' }), '23514', 'no digest')
      assert.equal(
        await run(
          `SELECT sophia.media_claim_live_call($1,1,$2,$3,'project_status','${NO_ARGS}')`,
          [x.exchangeId, P, `live:x:1:c-2`],
          P,
        ),
        '42501',
        'a member is never the service',
      )
      assert.equal(await claim(x, P, `live:${randomUUID()}:1:c-3`), '22023', 'a key naming another exchange')
      const { rows } = await owner((c) =>
        c.query<{ key: string; actor: string; epoch: string; tool: string; args: string }>(
          `SELECT idempotency_key AS key, actor_id AS actor, input_epoch AS epoch, tool, args_sha256 AS args
             FROM sophia.live_call_keys WHERE exchange_id=$1 ORDER BY idempotency_key`,
          [x.exchangeId],
        ),
      )
      assert.deepEqual(
        rows,
        [
          { key, actor: P, epoch: '1', tool: 'project_status', args: NO_ARGS },
          { key: held, actor: P, epoch: '1', tool: 'project_status', args: other },
        ],
        'one claim per key, as first made: its digest, never its arguments',
      )
      const columns = await owner((c) =>
        c.query<{ name: string }>(
          `SELECT column_name AS name FROM information_schema.columns
            WHERE table_schema='sophia' AND table_name='live_call_keys' ORDER BY ordinal_position`,
        ),
      )
      assert.deepEqual(
        columns.rows.map((r) => r.name),
        ['idempotency_key', 'exchange_id', 'actor_id', 'input_epoch', 'tool', 'args_sha256'],
        'no column holds the arguments',
      )
      assert.equal(await run(`SELECT count(*) FROM sophia.live_call_keys`, []), '42501', 'the API’s login reads none')
    })

    it('two speakers at once under one key: the second waits, and is refused once the first commits (or holds it if not)', async () => {
      for (const first of ['commit', 'rollback'] as const) {
        const x = await dueExchange(false)
        const key = `live:${x.exchangeId}:1:race`
        const c = new pg.Client({ connectionString: db.ownerUrl })
        await c.connect()
        try {
          await c.query('BEGIN')
          await c.query(`SELECT sophia.media_claim_live_call($1,1,$2,$3,'project_status','${NO_ARGS}')`, [
            x.exchangeId,
            P,
            key,
          ])
          const second = await started(
            `SELECT sophia.media_claim_live_call($1,1,$2,$3,'project_status','${NO_ARGS}')`,
            [x.exchangeId, E, key],
          )
          assert.equal(await untilBlocked(second), 'waiting', 'the second claim waits on the first')
          await c.query(first === 'commit' ? 'COMMIT' : 'ROLLBACK')
          assert.equal(await second.done, first === 'commit' ? '23505' : 'ok', `the first ${first}s`)
        } finally {
          await c.end()
        }
      }
    })

    it('an open claim locks neither its project nor its exchange: either can be taken FOR UPDATE at once (prodrev-r3 F1)', async () => {
      const x = await peerExchange(true)
      const t = await opened()
      try {
        await t.c.query(`SELECT sophia.media_claim_live_call($1,1,$2,$3,'project_status','${NO_ARGS}')`, [
          x.exchangeId,
          P,
          `live:${x.exchangeId}:1:open`,
        ])
        const nowait = (sql: string, id: string) =>
          owner((o) =>
            o.query(sql, [id]).then(
              () => 'ok',
              (err: unknown) => (err as { code?: string }).code ?? 'error',
            ),
          )
        assert.deepEqual(
          [
            await nowait(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE NOWAIT`, x.projectId),
            await nowait(`SELECT 1 FROM sophia.room_exchanges WHERE id=$1 FOR UPDATE NOWAIT`, x.exchangeId),
          ],
          ['ok', 'ok'],
          'no row lock of either is held (a foreign key would hold both FOR KEY SHARE: 55P03)',
        )
      } finally {
        await finish(t, 'rollback')
      }
    })

    it('two calls of one project under distinct keys, each claimed, bound and recorded in its own transaction: the second waits for the first, no deadlock (prodrev-r3 F1)', async () => {
      // The API's order in one transaction per call: claim, bind (media_tool_speaker), record (media_record_live_call,
      // which takes the project FOR UPDATE, with or without a grant). Both claims and both binds go first; each
      // transaction is finished as soon as its own recording settles.
      const cases = [
        { name: 'the principal twice, under a grant', granted: true, peer: P, epoch: 1 },
        { name: 'the principal and Davide, under a grant', granted: true, peer: E, epoch: 2 },
        { name: 'the principal twice, no grant (voice qualification on)', granted: false, peer: P, epoch: 1 },
      ]
      const seen: Record<string, unknown> = {}
      const exchanges: string[] = []
      for (const k of cases) {
        const x = await peerExchange(k.granted)
        exchanges.push(x.exchangeId)
        const a = await opened()
        const b = await opened()
        try {
          const keyA = `live:${x.exchangeId}:1:a`
          const keyB = `live:${x.exchangeId}:1:b`
          const claimSql = `SELECT sophia.media_claim_live_call($1,$2,$3,$4,'project_status','${NO_ARGS}')`
          const bindSql = `SELECT sophia.media_tool_speaker($1,$2,$3)`
          const recordSql = `SELECT sophia.media_record_live_call($1,$2,$3,$4,'project_status')`
          await a.c.query(claimSql, [x.exchangeId, 1, P, keyA])
          await b.c.query(claimSql, [x.exchangeId, k.epoch, k.peer, keyB])
          await a.c.query(bindSql, [x.exchangeId, 1, P])
          await b.c.query(bindSql, [x.exchangeId, k.epoch, k.peer])
          const first = sent(a, recordSql, [x.exchangeId, 1, P, keyA])
          const firstWaited = await untilBlocked(first)
          const second = sent(b, recordSql, [x.exchangeId, k.epoch, k.peer, keyB])
          const secondWaited = await untilBlocked(second)
          const one = await first.done
          await finish(a, one)
          const two = await second.done
          await finish(b, two)
          seen[k.name] = { first: [firstWaited, one], second: [secondWaited, two] }
        } finally {
          // A statement that threw first leaves both transactions open: rolled back and given back, so none is leaked.
          await finish(a, 'rollback')
          await finish(b, 'rollback')
        }
      }
      assert.deepEqual(
        seen,
        Object.fromEntries(cases.map((k) => [k.name, { first: ['done', 'ok'], second: ['waiting', 'ok'] }])),
        'the first records at once; the second waits for its project lock, then records: [ok, ok], never 40P01',
      )
      const { rows } = await owner((c) =>
        c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM sophia.live_call_keys WHERE exchange_id = ANY($1::uuid[])`,
          [exchanges],
        ),
      )
      assert.equal(rows[0]?.n, 6, 'every claim committed with its call, one per call')
    })
  })

  describe('an End and a voice call being recorded serialize (C5): End is a durable boundary for the calls', () => {
    const record = (x: { exchangeId: string }, key: string) =>
      started(`SELECT sophia.media_record_live_call($1,1,$2,$3,'control_work')`, [x.exchangeId, P, key])
    const end = (x: { exchangeId: string }) =>
      started(`SELECT sophia.control_exchange($1,'end',NULL)`, [x.exchangeId], P)

    it('a recording that passed its checks first: End waits for it, and the call is listed, not yet answered', async () => {
      const x = await dueExchange(false)
      // Root's schedule: the owner's SHARE lock on live_tool_calls holds the recording at its insert.
      const gate = await holding(`LOCK TABLE sophia.live_tool_calls IN SHARE MODE`, [])
      let release = gate
      try {
        const recording = await record(x, `live:${x.exchangeId}:1:c-1`)
        assert.equal(await untilBlocked(recording), 'waiting', 'the recording is in flight, held at its insert')
        const ending = await end(x)
        assert.equal(await untilBlocked(ending), 'waiting', 'End waits behind the recording')
        assert.equal(await endedWhy(x.exchangeId), 'open:null')
        assert.deepEqual(await callsOf(x.exchangeId), [], 'nothing committed yet')
        await gate()
        release = () => Promise.resolve()
        assert.deepEqual([await recording.done, await ending.done], ['ok', 'ok'])
      } finally {
        await release()
      }
      const calls = (await callsOf(x.exchangeId)) as Array<{ tool: string; answeredAt: string | null }>
      assert.deepEqual(
        calls.map((c) => [c.tool, c.answeredAt]),
        [['control_work', null]],
      )
      assert.equal((await endedWhy(x.exchangeId)).split(':')[0], 'ended')
    })

    it('End committed first: a recording after it is refused (40001), and nothing is listed', async () => {
      const x = await dueExchange(false)
      assert.equal(await (await end(x)).done, 'ok')
      assert.equal(await (await record(x, `live:${x.exchangeId}:1:c-1`)).done, '40001')
      assert.deepEqual(await callsOf(x.exchangeId), [])
    })

    /** One bound call as the API makes it, in one transaction: claim its key, bind its speaker, record it. */
    const bound = async (x: { exchangeId: string }, key: string): Promise<string> => {
      const t = await opened()
      let outcome = 'ok'
      try {
        await t.c.query(`SELECT sophia.media_claim_live_call($1,1,$2,$3,'project_status','${NO_ARGS}')`, [
          x.exchangeId,
          P,
          key,
        ])
        await t.c.query(`SELECT sophia.media_tool_speaker($1,1,$2)`, [x.exchangeId, P])
        await t.c.query(`SELECT sophia.media_record_live_call($1,1,$2,$3,'project_status')`, [x.exchangeId, P, key])
      } catch (err: unknown) {
        outcome = (err as { code?: string }).code ?? 'error'
      }
      await finish(t, outcome)
      return outcome
    }

    it('a recording racing End, Stop Speaking, a receipt, a reservation, a top-up, two speakers’ claims of one key, two bound calls under distinct keys and the guard: no deadlock in 20 trials', async () => {
      const outcomes: string[] = []
      for (let trial = 0; trial < TRIALS; trial += 1) {
        const x = await dueExchange(true, true)
        const recorded = await record(x, `live:${x.exchangeId}:1:race-${String(trial)}`)
        const ending = await end(x)
        const key = `live:${x.exchangeId}:1:claim-${String(trial)}`
        const results = await Promise.all([
          recorded.done,
          ending.done,
          stopSpeaking(x),
          write(x),
          reserve(x),
          spend(x),
          claim(x, P, key),
          claim(x, E, key),
          guard(),
          bound(x, `live:${x.exchangeId}:1:bound-a-${String(trial)}`),
          bound(x, `live:${x.exchangeId}:1:bound-b-${String(trial)}`),
        ])
        const claims = results.slice(6, 8)
        assert.deepEqual(claims.toSorted(), ['23505', 'ok'], 'of two speakers under one key, exactly one claims it')
        // A recording, a reservation or Stop Speaking after the exchange ended is refused as such (40001); the claim the
        // other speaker lost is refused as such (23505).
        outcomes.push(...results.filter((r) => r !== '40001' && r !== '23505'))
      }
      assert.deepEqual(
        outcomes.filter((o) => o !== 'ok'),
        [],
        'no deadlock (40P01) and no wait past the lock timeout (55P03)',
      )
    })

    it('a call recorded before End is still answered after it', async () => {
      const x = await dueExchange(false)
      const key = `live:${x.exchangeId}:1:c-1`
      assert.equal(await (await record(x, key)).done, 'ok')
      assert.equal(await (await end(x)).done, 'ok')
      const answer = await started(`SELECT sophia.media_answer_live_call($1,$2,$3,'ok')`, [x.exchangeId, P, key])
      assert.equal(await answer.done, 'ok')
      const calls = (await callsOf(x.exchangeId)) as Array<{ outcome: string | null; answeredAt: string | null }>
      assert.deepEqual(
        calls.map((c) => [c.outcome, c.answeredAt !== null]),
        [['ok', true]],
      )
    })
  })
})
