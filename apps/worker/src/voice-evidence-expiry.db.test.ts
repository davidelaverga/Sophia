// Voice qualification receipts are deleted 24 h after they are written by the worker's periodic pass (0046,
// voice_evidence_expire; Codex P2 on PR #190), level: sql-run. Before, only the API's guard deleted them, and the API
// runs the guard only on bridge traffic and only with SOPHIA_VOICE_QUALIFICATION=on: with the switch turned off after a
// run, or no traffic, receipts and their digest chains stayed stored past the 24 h promised. Nothing here builds the
// API or runs the guard: the worker's own pass, on its own login, is the only actor.
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  createPool,
  readSnapshot,
  recordQualificationEvidence,
  startExchange,
  withActor,
  withService,
} from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { dispatchOnce } from './runtime-dispatch.ts'

const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations', import.meta.url))
const A = randomUUID() // admin
const P = randomUUID() // the synthetic principal, an editor
const RUN = 'ab'.repeat(32)

let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
/** A database migrated through 0045 only: an API and a worker with voice qualification never applied. */
let dir: string
let before0046: TestDatabase
let worker0045: pg.Pool

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 2 })
  worker = createPool(db.workerUrl, { max: 2 })
  dir = mkdtempSync(join(tmpdir(), 'sophia-0045-'))
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && f < '0046'))
    copyFileSync(join(MIGRATIONS, file), join(dir, file))
  before0046 = await createTestDatabase(dir)
  worker0045 = createPool(before0046.workerUrl, { max: 2 })
})
after(async () => {
  await api.end()
  await worker.end()
  await worker0045.end()
  await db.drop()
  await before0046.drop()
  rmSync(dir, { recursive: true, force: true })
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

/** One statement on a login, as the service (no actor) or as a member: 'ok' or its SQLSTATE. */
async function sqlstate(pool: pg.Pool, sql: string, actor: string | null = null): Promise<string> {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    if (actor) await c.query(`SELECT set_config('sophia.actor_id', $1, true)`, [actor])
    await c.query(sql)
    await c.query('COMMIT')
    return 'ok'
  } catch (err: unknown) {
    await c.query('ROLLBACK').catch(() => undefined)
    return (err as { code?: string }).code ?? 'error'
  } finally {
    c.release()
  }
}

/** An exchange under a grant with two bridge receipts (seq 1 and 2), written through the bridge's own route. */
async function withReceipts(): Promise<string> {
  const seeded = await seedProject(db.ownerUrl, { admin: A, editors: [P] })
  const grantId = await owner(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `SELECT (sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',900,3,20,1000,200000,3600)).id AS id`,
      [seeded.projectId, P, RUN],
    )
    return rows[0]?.id ?? ''
  })
  const snap = await withActor(api, P, 'read', (c) => readSnapshot(c, seeded.projectId))
  assert.ok(snap)
  const { exchangeId } = await withActor(api, P, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  for (const seq of [1, 2]) {
    const receipt = {
      kind: 'input_turn',
      schema: 'sophia.bridge.voice_qualification.v1',
      grantId,
      runBindingSha256: RUN,
    }
    await withService(api, (c) =>
      recordQualificationEvidence(c, {
        exchangeId,
        grantId,
        seq,
        kind: 'input_turn',
        receipt: { ...receipt, atMs: 1 },
      }),
    )
  }
  return exchangeId
}

const keptOf = async (exchangeId: string): Promise<number[]> =>
  (
    await owner((c) =>
      c.query<{ seq: number }>(
        `SELECT seq FROM sophia.voice_qualification_evidence WHERE exchange_id=$1 AND source='bridge' ORDER BY seq`,
        [exchangeId],
      ),
    )
  ).rows.map((r) => r.seq)

describe('voice qualification receipts expire from the worker’s periodic pass (0046; Codex P2 on PR #190)', () => {
  it('a receipt past its 24 hours is deleted by the next pass, with no guard run and no API at all', async () => {
    const exchangeId = await withReceipts()
    await owner((c) =>
      c.query(
        `UPDATE sophia.voice_qualification_evidence SET expires_at=now()-interval '1 second'
          WHERE exchange_id=$1 AND seq=1`,
        [exchangeId],
      ),
    )
    const lines: string[] = []
    const pass = await dispatchOnce(worker, { workerId: 'test-worker', log: (line) => lines.push(line) })
    assert.deepEqual(await keptOf(exchangeId), [2], 'the expired receipt is gone; the one within its 24 hours stays')
    assert.equal(pass.voiceEvidenceExpired, 1)
    assert.deepEqual(lines, [], 'nothing failed')
    const again = await dispatchOnce(worker, { workerId: 'test-worker' })
    assert.equal(again.voiceEvidenceExpired, 0, 'once')
  })

  it('on a database without 0046 the pass runs as before and expires nothing', async () => {
    const lines: string[] = []
    const pass = await dispatchOnce(worker0045, { workerId: 'test-worker', log: (line) => lines.push(line) })
    assert.equal(pass.voiceEvidenceExpired, 0)
    assert.deepEqual(lines, [], 'nothing of 0046 was asked for, so nothing failed')
  })

  it('is the worker’s alone: a member, the API’s login and an actor on the worker’s login get 42501', async () => {
    const expire = 'SELECT sophia.voice_evidence_expire()'
    assert.equal(await sqlstate(api, expire, P), '42501', 'a member')
    assert.equal(await sqlstate(api, expire), '42501', 'the API’s login (PUBLIC has no EXECUTE either)')
    assert.equal(await sqlstate(worker, expire, P), '42501', 'a member identity on the worker’s login')
    assert.equal(await sqlstate(worker, expire), 'ok', 'the worker itself')
    const { rows } = await owner((c) =>
      c.query<{ definer: boolean; config: string[] }>(
        `SELECT prosecdef AS definer, proconfig AS config FROM pg_proc
          WHERE oid=to_regprocedure('sophia.voice_evidence_expire()')`,
      ),
    )
    assert.deepEqual(rows, [{ definer: true, config: ['search_path=pg_catalog, sophia'] }], 'a fixed search_path')
  })

  it('a sweep that fails never holds back the pass: it is logged, and dispatch goes on', async () => {
    await owner((c) => c.query(`REVOKE EXECUTE ON FUNCTION sophia.voice_evidence_expire() FROM sophia_worker`))
    try {
      const lines: string[] = []
      const pass = await dispatchOnce(worker, { workerId: 'test-worker', log: (line) => lines.push(line) })
      assert.equal(pass.voiceEvidenceExpired, 0)
      assert.equal(lines.length, 1)
      assert.match(lines[0] ?? '', /^voice evidence expiry failed: /)
    } finally {
      await owner((c) => c.query(`GRANT EXECUTE ON FUNCTION sophia.voice_evidence_expire() TO sophia_worker`))
    }
  })
})
