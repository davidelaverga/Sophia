// The service numbers the bridge's voice qualification receipts (migration 0051; Codex P1 r4232908444 on PR #190;
// docs/plans/voice-qualification-g7.md), level: sql-run. The bridge's calls run on the sophia_api login with no actor;
// the grant, the clock moved back and expiry forced early are the migration owner's. 0046 is as written.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  createPool,
  readSnapshot,
  recordQualificationEvidenceWrite,
  reserveQualification,
  startExchange,
  voiceQualificationGuard,
  withActor,
  withService,
  type QualificationReceiptKind,
} from './index.ts'

const A = randomUUID() // admin
const P = randomUUID() // the synthetic principal, an editor
const RUN = 'ab'.repeat(32)

let db: TestDatabase
let pool: pg.Pool

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 12 })
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

/** A refusal's code and the database's words for it: which check refused it, not only how. */
async function refusalOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof DomainError ? `${err.code}: ${err.message}` : `raw:${String(err)}`
  }
}

/** A project, a grant for its principal, and an exchange the principal opened under it. */
async function exchange(limits: { connections?: number; seconds?: number } = {}) {
  const seeded = await seedProject(db.ownerUrl, { admin: A, editors: [P] })
  const { rows } = await owner((c) =>
    c.query<{ id: string }>(
      `SELECT (sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',$4,$5,20,1000,200000,3600)).id AS id`,
      [seeded.projectId, P, RUN, limits.seconds ?? 900, limits.connections ?? 3],
    ),
  )
  const grantId = rows[0]!.id
  const snap = await withActor(pool, P, 'read', (c) => readSnapshot(c, seeded.projectId))
  assert.ok(snap)
  const opened = await withActor(pool, P, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  return { projectId: seeded.projectId, grantId, exchangeId: opened.exchangeId }
}

const receipt = (grantId: string, kind: QualificationReceiptKind, extra: Record<string, unknown> = {}) => ({
  kind,
  schema: 'sophia.bridge.voice_qualification.v1',
  grantId,
  runBindingSha256: RUN,
  atMs: 1,
  ...extra,
})

/** A bridge write: its identity, and a session_closed receipt told apart by `atMs`, unless `as` says another kind. */
const write = (
  exchangeId: string,
  grantId: string,
  writeId: string,
  atMs: number,
  as: { kind?: QualificationReceiptKind; extra?: Record<string, unknown> } = {},
) =>
  withService(pool, (c) =>
    recordQualificationEvidenceWrite(c, {
      exchangeId,
      grantId,
      writeId,
      kind: as.kind ?? 'session_closed',
      receipt: receipt(grantId, as.kind ?? 'session_closed', { atMs, ...as.extra }),
    }),
  )

const reserve = (exchangeId: string, grantId: string, kind: 'connection' | 'generation' | 'spend', ordinal?: number) =>
  withService(pool, (c) =>
    reserveQualification(c, {
      exchangeId,
      grantId,
      kind,
      ...(ordinal === undefined ? {} : { ordinal, charge: 1000 }),
    }),
  )

/** What 0046 keeps of the exchange ([source, seq, atMs]), the identities 0051 keeps, and its counter. */
async function stateOf(exchangeId: string) {
  return owner(async (c) => {
    const kept = await c.query<{ source: string; seq: number; at: string }>(
      `SELECT source, seq, (receipt->>'atMs')::bigint AS at FROM sophia.voice_qualification_evidence
        WHERE exchange_id=$1 ORDER BY source, seq`,
      [exchangeId],
    )
    const writes = await c.query<{ seq: number }>(
      `SELECT seq FROM sophia.voice_evidence_writes WHERE exchange_id=$1 ORDER BY seq`,
      [exchangeId],
    )
    const mark = await c.query<{ high: number }>(
      `SELECT high_water AS high FROM sophia.voice_evidence_high_water WHERE exchange_id=$1`,
      [exchangeId],
    )
    return {
      kept: kept.rows.map((r) => [r.source, r.seq, Number(r.at)]),
      writes: writes.rows.map((r) => r.seq),
      high: mark.rows[0]?.high ?? null,
    }
  })
}

describe('the service numbers the bridge’s receipts (0051, Codex P1 r4232908444)', () => {
  it('a new write takes the exchange’s next number; the same write again its own, replayed, and is kept once', async () => {
    const { exchangeId, grantId } = await exchange()
    const [one, two] = [randomUUID(), randomUUID()]
    assert.deepEqual(await write(exchangeId, grantId, one, 1), { seq: 1, replayed: false, ended: false, reason: null })
    assert.deepEqual(await write(exchangeId, grantId, two, 2), { seq: 2, replayed: false, ended: false, reason: null })
    assert.deepEqual(await write(exchangeId, grantId, one, 1), { seq: 1, replayed: true, ended: false, reason: null })
    assert.deepEqual(await stateOf(exchangeId), {
      kept: [
        ['bridge', 1, 1],
        ['bridge', 2, 2],
      ],
      writes: [1, 2],
      high: 2,
    })
  })

  it('the same identity with another receipt is refused (23505) and spends no number', async () => {
    const { exchangeId, grantId } = await exchange()
    const one = randomUUID()
    await write(exchangeId, grantId, one, 1)
    assert.equal(
      await refusalOf(write(exchangeId, grantId, one, 99)),
      'idempotency_conflict: Idempotency key reused: this write identity holds another receipt',
      'refused by its identity, before 0046 is asked',
    )
    assert.equal((await write(exchangeId, grantId, randomUUID(), 2)).seq, 2, 'the next is 2: none was spent')
    assert.deepEqual((await stateOf(exchangeId)).kept, [
      ['bridge', 1, 1],
      ['bridge', 2, 2],
    ])
  })

  it('a receipt 0046 refuses rolls back with its number: an unreserved connection, another run, another grant, an unknown exchange', async () => {
    const { exchangeId, grantId } = await exchange()
    const unreserved = write(exchangeId, grantId, randomUUID(), 1, { kind: 'input_window', extra: { connection: 1 } })
    assert.equal(await codeOf(unreserved), 'invalid_request')
    const otherRun = withService(pool, (c) =>
      recordQualificationEvidenceWrite(c, {
        exchangeId,
        grantId,
        writeId: randomUUID(),
        kind: 'session_closed',
        receipt: receipt(grantId, 'session_closed', { runBindingSha256: 'ee'.repeat(32) }),
      }),
    )
    assert.equal(await codeOf(otherRun), 'invalid_request')
    assert.equal(await codeOf(write(exchangeId, randomUUID(), randomUUID(), 1)), 'forbidden')
    assert.equal(await codeOf(write(randomUUID(), grantId, randomUUID(), 1)), 'not_found')
    assert.deepEqual(await stateOf(exchangeId), { kept: [], writes: [], high: null }, 'nothing numbered')
    await reserve(exchangeId, grantId, 'connection')
    assert.equal(
      (await write(exchangeId, grantId, randomUUID(), 1, { kind: 'input_window', extra: { connection: 1 } })).seq,
      1,
    )
  })

  it('a member is never the service: refused (42501), nothing numbered', async () => {
    const { exchangeId, grantId } = await exchange()
    const asMember = withActor(pool, P, 'write', (c) =>
      recordQualificationEvidenceWrite(c, {
        exchangeId,
        grantId,
        writeId: randomUUID(),
        kind: 'session_closed',
        receipt: receipt(grantId, 'session_closed'),
      }),
    )
    assert.equal(await codeOf(asMember), 'forbidden')
    assert.deepEqual(await stateOf(exchangeId), { kept: [], writes: [], high: null })
  })

  it('the counter alone gives the numbers: with every receipt gone (expired early, as the test forces), the next is 3, never 1 again', async () => {
    const { exchangeId, grantId } = await exchange()
    await write(exchangeId, grantId, randomUUID(), 1)
    await write(exchangeId, grantId, randomUUID(), 2)
    const expired = await owner(async (c) => {
      await c.query(
        `UPDATE sophia.voice_qualification_evidence SET expires_at=now()-interval '1 second' WHERE exchange_id=$1`,
        [exchangeId],
      )
      return (await c.query<{ n: number }>(`SELECT sophia.voice_evidence_expire() AS n`)).rows[0]!.n
    })
    assert.ok(expired >= 2)
    assert.deepEqual(await stateOf(exchangeId), { kept: [], writes: [], high: 2 }, 'the identities went with them')
    assert.deepEqual(await write(exchangeId, grantId, randomUUID(), 3), {
      seq: 3,
      replayed: false,
      ended: false,
      reason: null,
    })
    assert.deepEqual((await stateOf(exchangeId)).kept, [['bridge', 3, 3]])
  })

  it('the idempotency horizon: writes are taken until 24 h less one minute after the first, then every one is refused, new or repeated, and nothing changes', async () => {
    const { exchangeId, grantId } = await exchange()
    const one = randomUUID()
    await write(exchangeId, grantId, one, 1)
    await write(exchangeId, grantId, randomUUID(), 2)
    const firstAt = (at: string) =>
      owner((c) =>
        c.query(
          `UPDATE sophia.voice_evidence_high_water SET first_at=clock_timestamp()-interval '${at}' WHERE exchange_id=$1`,
          [exchangeId],
        ),
      )
    // 30 s before the horizon: a repeat is answered with its own number, a new write takes the next.
    await firstAt('23 hours 58 minutes 30 seconds')
    assert.deepEqual(await write(exchangeId, grantId, one, 1), { seq: 1, replayed: true, ended: false, reason: null })
    assert.equal((await write(exchangeId, grantId, randomUUID(), 3)).seq, 3)
    const held = await stateOf(exchangeId)
    // 30 s past it: refused, never numbered again.
    await firstAt('23 hours 59 minutes 30 seconds')
    const horizon = "invalid_request: Past the exchange's evidence horizon: no write is numbered or answered again"
    assert.equal(await refusalOf(write(exchangeId, grantId, one, 1)), horizon, 'a repeat')
    assert.equal(await refusalOf(write(exchangeId, grantId, randomUUID(), 4)), horizon, 'a new write')
    assert.deepEqual(await stateOf(exchangeId), held, 'nothing changed')
    // Across expiry: every receipt and identity gone, the exchange still refuses; its numbers are never given again.
    await owner(async (c) => {
      await c.query(
        `UPDATE sophia.voice_qualification_evidence SET expires_at=now()-interval '1 second' WHERE exchange_id=$1`,
        [exchangeId],
      )
      await c.query(`SELECT sophia.voice_evidence_expire()`)
    })
    assert.equal(await refusalOf(write(exchangeId, grantId, one, 1)), horizon, 'its repeat, once expired')
    assert.equal(await refusalOf(write(exchangeId, grantId, randomUUID(), 5)), horizon)
    assert.deepEqual(await stateOf(exchangeId), { kept: [], writes: [], high: 3 })
  })

  it('past 99,999 a write is refused and nothing changes; a repeat of the last is still answered', async () => {
    const { exchangeId, grantId } = await exchange()
    await write(exchangeId, grantId, randomUUID(), 1)
    await owner((c) =>
      c.query(`UPDATE sophia.voice_evidence_high_water SET high_water=99998 WHERE exchange_id=$1`, [exchangeId]),
    )
    const last = randomUUID()
    assert.equal((await write(exchangeId, grantId, last, 2)).seq, 99_999)
    const held = await stateOf(exchangeId)
    assert.equal(
      await refusalOf(write(exchangeId, grantId, randomUUID(), 3)),
      "invalid_request: The exchange's receipt numbers are spent",
    )
    assert.deepEqual(await stateOf(exchangeId), held, 'nothing changed')
    assert.deepEqual(held.high, 99_999)
    assert.deepEqual(await write(exchangeId, grantId, last, 2), {
      seq: 99_999,
      replayed: true,
      ended: false,
      reason: null,
    })
  })

  it('the guard’s own receipt (service, seq 0) is not counted: the bridge’s numbers run from 1 beside it', async () => {
    const { exchangeId, grantId } = await exchange({ seconds: 60 })
    // Past the grant's 60 s (the grant made 3 minutes ago, the exchange opened under it 2 minutes ago): the guard ends
    // the exchange and keeps its receipt at the service's seq 0.
    await owner(async (c) => {
      await c.query(
        `UPDATE sophia.voice_qualification_grants SET created_at=created_at-interval '3 minutes',
                expires_at=expires_at-interval '3 minutes' WHERE id=$1`,
        [grantId],
      )
      await c.query(`UPDATE sophia.room_exchanges SET opened_at=opened_at-interval '2 minutes' WHERE id=$1`, [
        exchangeId,
      ])
    })
    assert.ok((await withService(pool, (c) => voiceQualificationGuard(c))) >= 1)
    assert.deepEqual(
      (await stateOf(exchangeId)).kept.map(([source, seq]) => [source, seq]),
      [['service', 0]],
    )
    // The session's close after the end: the bridge's first receipt is 1, its second 2.
    assert.equal((await write(exchangeId, grantId, randomUUID(), 1)).seq, 1)
    assert.equal((await write(exchangeId, grantId, randomUUID(), 2)).seq, 2)
    const { kept, high } = await stateOf(exchangeId)
    assert.deepEqual(
      kept.map(([source, seq]) => [source, seq]),
      [
        ['bridge', 1],
        ['bridge', 2],
        ['service', 0],
      ],
    )
    assert.equal(high, 2)
  })

  it('overlapping writers and reservations on one exchange, a repeat among them: one number each, dense, none twice, no deadlock (10 trials)', async () => {
    for (let trial = 0; trial < 10; trial += 1) {
      const { exchangeId, grantId } = await exchange({ connections: 3 })
      await reserve(exchangeId, grantId, 'connection')
      const twice = randomUUID()
      const writes = Array.from({ length: 6 }, (_, i) => write(exchangeId, grantId, randomUUID(), 10 + i))
      const repeats = [write(exchangeId, grantId, twice, 99), write(exchangeId, grantId, twice, 99)]
      const reservations = [
        reserve(exchangeId, grantId, 'connection'),
        reserve(exchangeId, grantId, 'generation', 1),
        reserve(exchangeId, grantId, 'spend', 1),
        reserve(exchangeId, grantId, 'generation', 1),
      ]
      const settled = await Promise.allSettled([...writes, ...repeats, ...reservations])
      const failed = settled.filter((r) => r.status === 'rejected').map((r) => String(r.reason))
      assert.deepEqual(failed, [], `trial ${String(trial)}: nothing refused, no deadlock`)
      const acks = await Promise.all([...writes, ...repeats])
      assert.deepEqual(
        [...new Set(acks.map((a) => a.seq))].toSorted((x, y) => x - y),
        [1, 2, 3, 4, 5, 6, 7],
        `trial ${String(trial)}: dense, none twice`,
      )
      const [r1, r2] = await Promise.all(repeats)
      assert.equal(r1?.seq, r2?.seq)
      assert.equal([r1?.replayed, r2?.replayed].filter((replayed) => replayed === true).length, 1, 'one a repeat')
      const state = await stateOf(exchangeId)
      assert.deepEqual(state.writes, [1, 2, 3, 4, 5, 6, 7])
      assert.equal(state.high, 7)
    }
  })
})
