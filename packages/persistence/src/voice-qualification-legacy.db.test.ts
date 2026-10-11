// 0046's bridge receipts on a database migrated through 0047 only (the state before 0051), level: sql-run. Two things
// are kept here and nowhere else:
// - 0046's own per-number coverage. Since 0051 the API's login may not call media_record_evidence: its receipts are
//   numbered by the service (voice-evidence-numbering.db.test.ts). On a database before 0051, 0046 behaves as written.
// - 0051's precondition (root's C2): it applies only from the pre-activation state. A bridge receipt already kept by
//   0046's bridge-numbered path makes it refuse (55000) and change nothing. The guard's own receipts (service, seq 0)
//   do not, and once 0051 is applied the direct path is closed (42501) while the service's numbering works. Its count
//   comes after the evidence table's lock (root's correction): an old writer's receipt not yet committed is waited
//   for, then counted. This shows the lock's effect on a writer already writing; it is not a claim that 0051 may run
//   beside online old writers (the rollout requires quiescence: see 0051's header).
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  createPool,
  readQualificationEvidence,
  readSnapshot,
  recordQualificationEvidenceWrite,
  startExchange,
  voiceQualificationGuard,
  withActor,
  withService,
} from './index.ts'

const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations', import.meta.url))
const NUMBERING = '0051_voice_evidence_numbering.sql'
const A = randomUUID() // admin
const P = randomUUID() // the synthetic principal, an editor
const RUN = 'ab'.repeat(32)

/** db/migrations through 0047, as a database was before 0051. */
let dir: string
let legacy: TestDatabase
let pool: pg.Pool

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sophia-0047-'))
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && f < '0048'))
    copyFileSync(join(MIGRATIONS, file), join(dir, file))
  legacy = await createTestDatabase(dir)
  pool = createPool(legacy.apiUrl, { max: 4 })
})
after(async () => {
  await pool.end()
  await legacy.drop()
  rmSync(dir, { recursive: true, force: true })
})

async function on<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url })
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
    return err instanceof DomainError ? err.code : `raw:${String((err as { code?: string }).code ?? err)}`
  }
}

/** A project, a grant for P and an exchange P opened under it, on `db` (its pool `api`). */
async function exchange(db: TestDatabase, api: pg.Pool) {
  const seeded = await seedProject(db.ownerUrl, { admin: A, editors: [P] })
  const grantId = await on(db.ownerUrl, async (c) =>
    String(
      (
        await c.query<{ id: string }>(
          `SELECT (sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',900,3,20,1000,200000,3600)).id AS id`,
          [seeded.projectId, P, RUN],
        )
      ).rows[0]?.id,
    ),
  )
  const snap = await withActor(api, P, 'read', (c) => readSnapshot(c, seeded.projectId))
  assert.ok(snap)
  const opened = await withActor(api, P, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  return { projectId: seeded.projectId, grantId, exchangeId: opened.exchangeId }
}

const receipt = (grantId: string, kind: string, extra: Record<string, unknown> = {}) => ({
  kind,
  schema: 'sophia.bridge.voice_qualification.v1',
  grantId,
  runBindingSha256: RUN,
  atMs: 1,
  ...extra,
})

/** 0046's own path, as the API took it before 0051: the bridge's number, on the API's login. `kind` defaults to the body's. */
const legacyRecord = (
  api: pg.Pool,
  at: { exchangeId: string; grantId: string; seq: number },
  body: Record<string, unknown>,
  kind = String(body.kind),
) =>
  withService(api, async (c) => {
    const { rows } = await c.query<{ ack: { ended: boolean; reason: string | null } }>(
      `SELECT sophia.media_record_evidence($1,$2,$3,$4,$5) AS ack`,
      [at.exchangeId, at.grantId, at.seq, kind, JSON.stringify(body)],
    )
    return rows[0]?.ack
  })

/**
 * 0051 as written, started as the owner on a connection of its own: its backend's pid, and its outcome, 'applied' or
 * its SQLSTATE and message. The connection ends with it.
 */
async function applying(db: TestDatabase) {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  const pid = (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
  const run = async () => {
    try {
      await c.query(readFileSync(join(MIGRATIONS, NUMBERING), 'utf8'))
      return 'applied'
    } catch (err) {
      const { code, message } = err as { code?: string; message?: string }
      await c.query('ROLLBACK').catch(() => undefined)
      return `${String(code)}: ${String(message)}`
    } finally {
      await c.end()
    }
  }
  return { pid, outcome: run() }
}

/** Apply 0051 as written, as the owner: 'applied', or its SQLSTATE and message. */
const apply0051 = async (db: TestDatabase) => (await applying(db)).outcome

const has0051 = (db: TestDatabase) =>
  on(db.ownerUrl, async (c) => {
    const { rows } = await c.query<{ fn: boolean; counter: boolean; writes: boolean }>(
      `SELECT to_regprocedure('sophia.media_record_evidence_write(uuid,uuid,uuid,text,jsonb)') IS NOT NULL AS fn,
              to_regclass('sophia.voice_evidence_high_water') IS NOT NULL AS counter,
              to_regclass('sophia.voice_evidence_writes') IS NOT NULL AS writes`,
    )
    return rows[0]
  })

const apiExecutes = (db: TestDatabase) =>
  on(db.ownerUrl, async (c) => {
    const { rows } = await c.query<{ group: boolean; login: boolean }>(
      `SELECT has_function_privilege('sophia_api','sophia.media_record_evidence(uuid,uuid,integer,text,jsonb)','EXECUTE') AS group,
              has_function_privilege($1,'sophia.media_record_evidence(uuid,uuid,integer,text,jsonb)','EXECUTE') AS login`,
      [db.apiRole],
    )
    return rows[0]
  })

/** The functions 0051 replaces (the room token's, and T4's three), as their definitions' digests. */
const REPLACED = [
  'sophia.voice_room_qualification(uuid)',
  'sophia.start_exchange(uuid,bigint,boolean,text)',
  'sophia.voice_qualification_grant(uuid,uuid,text,text,integer,integer,integer,integer,bigint,integer)',
  'sophia.voice_qualification_revoke(uuid,uuid,text)',
]

/**
 * What 0051 changes or must leave as it was: its own objects, who may execute 0046's path (and its ACL), the
 * definitions it replaces, and the exchange's bridge receipts.
 */
async function stateOf(db: TestDatabase, exchangeId: string) {
  const objects = await has0051(db)
  const executes = await apiExecutes(db)
  const rest = await on(db.ownerUrl, async (c) => {
    const { rows } = await c.query<{ acl: string; replaced: string[]; bridge: number[] }>(
      `SELECT (SELECT proacl::text FROM pg_proc
                WHERE oid='sophia.media_record_evidence(uuid,uuid,integer,text,jsonb)'::regprocedure) AS acl,
              (SELECT array_agg(md5(pg_get_functiondef(f::regprocedure)) ORDER BY o) FROM unnest($1::text[]) WITH ORDINALITY u(f,o)) AS replaced,
              coalesce((SELECT array_agg(seq ORDER BY seq) FROM sophia.voice_qualification_evidence
                         WHERE exchange_id=$2 AND source='bridge'), '{}') AS bridge`,
      [REPLACED, exchangeId],
    )
    return rows[0]!
  })
  return { ...objects, executes, ...rest }
}

/**
 * An old writer that has not finished: on the API's login, as 0046's path ran, a transaction begun and a bridge receipt
 * kept by media_record_evidence under the bridge's own number, not yet committed.
 */
async function oldWriter(db: TestDatabase, at: { exchangeId: string; grantId: string; seq: number }) {
  const c = new pg.Client({ connectionString: db.apiUrl })
  await c.connect()
  await c.query('BEGIN')
  await c.query(`SELECT sophia.media_record_evidence($1,$2,$3,'input_turn',$4)`, [
    at.exchangeId,
    at.grantId,
    at.seq,
    JSON.stringify(receipt(at.grantId, 'input_turn', { turnOrdinal: 1 })),
  ])
  let open = true
  const end = async (how: 'COMMIT' | 'ROLLBACK') => {
    if (!open) return
    open = false
    try {
      await c.query(how)
    } finally {
      await c.end()
    }
  }
  return { commit: () => end('COMMIT'), rollback: () => end('ROLLBACK') }
}

/**
 * The lock backend `pid` waits for, within 5 s: a relation lock not granted (pg_locks) while pg_stat_activity shows a
 * Lock wait. Null if it never waits.
 */
async function waitsFor(db: TestDatabase, pid: number) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const waiting = await on(
      db.ownerUrl,
      async (c) =>
        (
          await c.query<{ evidence: boolean; mode: string }>(
            `SELECT l.relation='sophia.voice_qualification_evidence'::regclass AS evidence, l.mode
               FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
              WHERE l.pid=$1 AND NOT l.granted AND l.locktype='relation' AND a.wait_event_type='Lock'`,
            [pid],
          )
        ).rows[0],
    )
    if (waiting) return waiting
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return null
}

/**
 * A fresh database through 0047 with an exchange under a grant; an old writer's bridge receipt (seq 7) not yet
 * committed; and 0051 started beside it, shown waiting for the evidence table's lock. `end()` finishes whatever is left.
 */
async function migrationWaitingOnAWriter() {
  const fresh = await createTestDatabase(dir)
  const api = createPool(fresh.apiUrl, { max: 2 })
  let writer: Awaited<ReturnType<typeof oldWriter>> | undefined
  let migration: Awaited<ReturnType<typeof applying>> | undefined
  // The writer first (an open writer holds the migration back), then the migration's own end, then the database.
  const end = async () => {
    await writer?.rollback().catch(() => undefined)
    await migration?.outcome
    await api.end()
    await fresh.drop()
  }
  try {
    const { grantId, exchangeId } = await exchange(fresh, api)
    const untouched = await stateOf(fresh, exchangeId)
    writer = await oldWriter(fresh, { exchangeId, grantId, seq: 7 })
    migration = await applying(fresh)
    const waiting = await waitsFor(fresh, migration.pid)
    return { fresh, exchangeId, untouched, writer, migration, waiting, end }
  } catch (err) {
    await end()
    throw err
  }
}

describe('0046’s bridge receipts before 0051 (a database migrated through 0047)', () => {
  it('are bound to the exchange’s grant and run, once per sequence number', async () => {
    const { grantId: g, exchangeId: x } = await exchange(legacy, pool)
    assert.equal(
      await codeOf(
        legacyRecord(
          pool,
          { exchangeId: x, grantId: g, seq: 0 },
          { ...receipt(g, 'input_turn'), runBindingSha256: 'cd'.repeat(32) },
        ),
      ),
      'invalid_request',
      'another run’s binding',
    )
    const other = randomUUID()
    assert.equal(
      await codeOf(legacyRecord(pool, { exchangeId: x, grantId: other, seq: 0 }, receipt(other, 'input_turn'))),
      'forbidden',
      'a grant that does not cover the exchange',
    )
    assert.equal(
      await codeOf(legacyRecord(pool, { exchangeId: x, grantId: g, seq: 0 }, receipt(g, 'provider'), 'input_turn')),
      'invalid_request',
      'a kind its body does not say',
    )
    assert.equal(
      await codeOf(legacyRecord(pool, { exchangeId: x, grantId: g, seq: 0 }, receipt(g, 'input_turn'), 'guard')),
      'invalid_request',
      'the guard’s own receipt is the service’s',
    )
    assert.equal(
      (await legacyRecord(pool, { exchangeId: x, grantId: g, seq: 0 }, receipt(g, 'input_turn', { turnOrdinal: 1 })))
        ?.ended,
      false,
    )
    assert.equal(
      (await legacyRecord(pool, { exchangeId: x, grantId: g, seq: 0 }, receipt(g, 'input_turn', { turnOrdinal: 1 })))
        ?.ended,
      false,
      'the same again: a no-op',
    )
    assert.equal(
      await codeOf(
        legacyRecord(pool, { exchangeId: x, grantId: g, seq: 0 }, receipt(g, 'input_turn', { turnOrdinal: 2 })),
      ),
      'idempotency_conflict',
      'another receipt under the same number',
    )
    const asMember = withActor(pool, P, 'write', (c) =>
      c.query(`SELECT sophia.media_record_evidence($1,$2,9,'input_turn',$3)`, [
        x,
        g,
        JSON.stringify(receipt(g, 'input_turn')),
      ]),
    )
    assert.equal(await codeOf(asMember), 'forbidden', 'a member is never the bridge')
  })

  it('are read by the grant’s principal in their numbers’ order', async () => {
    const { grantId: g, exchangeId: x } = await exchange(legacy, pool)
    await legacyRecord(pool, { exchangeId: x, grantId: g, seq: 1 }, receipt(g, 'input_turn', { turnOrdinal: 1 }))
    await legacyRecord(pool, { exchangeId: x, grantId: g, seq: 0 }, receipt(g, 'input_window', { windowSeq: 1 }))
    const evidence = (await withActor(pool, P, 'read', (c) => readQualificationEvidence(c, x))) as {
      receipts: Array<Record<string, unknown>>
    }
    assert.deepEqual(
      evidence.receipts.map((r) => [r.seq, r.kind]),
      [
        [0, 'input_window'],
        [1, 'input_turn'],
      ],
    )
  })
})

describe('0051 applies only from the pre-activation state (root’s C2)', () => {
  it('a bridge receipt already kept by 0046’s own numbering: 0051 refuses (55000), says why, and changes nothing', async () => {
    const { grantId: g, exchangeId: x } = await exchange(legacy, pool)
    await legacyRecord(pool, { exchangeId: x, grantId: g, seq: 7 }, receipt(g, 'input_turn', { turnOrdinal: 1 }))
    const before0051 = await apiExecutes(legacy)
    const result = await apply0051(legacy)
    assert.match(result, /^55000: 0051 refused: \d+ bridge receipt\(s\) numbered by the bridge \(0046\) are kept/)
    assert.deepEqual(await has0051(legacy), { fn: false, counter: false, writes: false }, 'nothing of 0051 exists')
    assert.deepEqual(await apiExecutes(legacy), before0051, '0046’s grant as it was')
    assert.deepEqual(before0051, { group: true, login: true })
    const kept = await on(legacy.ownerUrl, (c) =>
      c.query<{ seq: number }>(
        `SELECT seq FROM sophia.voice_qualification_evidence WHERE exchange_id=$1 AND source='bridge'`,
        [x],
      ),
    )
    assert.deepEqual(
      kept.rows.map((r) => r.seq),
      [7],
      'the receipt is kept as it was: never renumbered',
    )
  })

  it('with only the guard’s own receipts (service, seq 0), 0051 applies; the direct path is then closed and the service numbers from 1 (control)', async () => {
    const fresh = await createTestDatabase(dir)
    const api = createPool(fresh.apiUrl, { max: 2 })
    try {
      const { projectId, grantId: g, exchangeId: x } = await exchange(fresh, api)
      await on(fresh.ownerUrl, (c) =>
        c.query(`SELECT sophia.voice_qualification_revoke($1,$2,'operator_kill')`, [projectId, g]),
      )
      await withService(api, (c) => voiceQualificationGuard(c))
      const guarded = await on(fresh.ownerUrl, (c) =>
        c.query<{ source: string; seq: number }>(
          `SELECT source, seq FROM sophia.voice_qualification_evidence WHERE exchange_id=$1`,
          [x],
        ),
      )
      assert.deepEqual(guarded.rows, [{ source: 'service', seq: 0 }])
      assert.equal(await apply0051(fresh), 'applied')
      assert.deepEqual(await has0051(fresh), { fn: true, counter: true, writes: true })
      assert.deepEqual(await apiExecutes(fresh), { group: false, login: false }, 'no login executes 0046’s path')
      assert.equal(
        await codeOf(legacyRecord(api, { exchangeId: x, grantId: g, seq: 1 }, receipt(g, 'session_closed'))),
        'forbidden',
        'the direct call is refused (42501)',
      )
      // The ended exchange still takes the session's close, numbered by the service from 1, beside the guard's 0.
      const ack = await withService(api, (c) =>
        recordQualificationEvidenceWrite(c, {
          exchangeId: x,
          grantId: g,
          writeId: randomUUID(),
          kind: 'session_closed',
          receipt: receipt(g, 'session_closed'),
        }),
      )
      assert.equal(ack.seq, 1)
    } finally {
      await api.end()
      await fresh.drop()
    }
  })
})

describe('0051’s check waits for an old writer’s uncommitted receipt (root’s correction to C2: the table lock)', () => {
  it('an old writer has kept a bridge receipt and not committed; 0051 waits on the evidence table’s lock; the writer commits; 0051 refuses (55000) and changes nothing', async () => {
    const t = await migrationWaitingOnAWriter()
    try {
      assert.deepEqual(
        t.waiting,
        { evidence: true, mode: 'ShareRowExclusiveLock' },
        '0051 waits (a Lock wait) for the evidence table while the writer’s receipt is uncommitted',
      )
      assert.deepEqual(t.untouched.bridge, [], 'no bridge receipt was committed before 0051 started')
      await t.writer.commit()
      const outcome = await t.migration.outcome
      assert.deepEqual(
        { outcome: outcome.split(':')[0], ...(await stateOf(t.fresh, t.exchangeId)) },
        { outcome: '55000', ...t.untouched, bridge: [7] },
        'refused, and nothing of 0051: no tables, no wrapper, no revoke (0046’s grant and ACL as they were), the room function and the stamping functions as they were; the committed receipt kept as seq 7',
      )
      assert.match(outcome, /^55000: 0051 refused: 1 bridge receipt\(s\) numbered by the bridge \(0046\) are kept/)
    } finally {
      await t.end()
    }
  })

  it('the writer rolls back instead: 0051, which waited the same way, applies (control)', async () => {
    const t = await migrationWaitingOnAWriter()
    try {
      assert.deepEqual(t.waiting, { evidence: true, mode: 'ShareRowExclusiveLock' }, 'the same wait')
      await t.writer.rollback()
      assert.equal(await t.migration.outcome, 'applied')
      const applied = await stateOf(t.fresh, t.exchangeId)
      assert.deepEqual(
        {
          fn: applied.fn,
          counter: applied.counter,
          writes: applied.writes,
          executes: applied.executes,
          bridge: applied.bridge,
        },
        { fn: true, counter: true, writes: true, executes: { group: false, login: false }, bridge: [] },
        '0051 applied: its tables and wrapper, the revoke; no bridge receipt',
      )
      assert.deepEqual(
        applied.replaced.map((digest, i) => digest !== t.untouched.replaced[i]),
        [true, true, true, true],
        'the room function and the three stamping functions are 0051’s',
      )
    } finally {
      await t.end()
    }
  })
})
