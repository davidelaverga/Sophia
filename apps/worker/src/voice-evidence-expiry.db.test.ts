// Voice qualification receipts are deleted 24 h after they are written by the worker's periodic pass (0046,
// voice_evidence_expire; Codex P2 on PR #190), level: sql-run. Before, only the API's guard deleted them, and the API
// runs the guard only on bridge traffic and only with SOPHIA_VOICE_QUALIFICATION=on: with the switch turned off after a
// run, or no traffic, receipts and their digest chains stayed stored past the 24 h promised. Nothing here builds the
// API or runs the guard: the worker's own pass, on its own login, is the only actor. The same pass deletes the claimed
// keys of voice tool calls an hour after their exchange ended (0047, live_call_keys_expire; prodrev-r3 F3 on PR #190).
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  claimLiveCall,
  controlExchange,
  createPool,
  readSnapshot,
  recordQualificationEvidenceWrite,
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
/** The digest the API claims a call with no arguments and no context under (0047, callSha256). */
const A_CALL = createHash('sha256').update('{"args":{},"guide":null,"inputMode":null,"utterance":null}').digest('hex')

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

/** An exchange under a grant with two bridge receipts (numbered 1 and 2 by the service, 0051), as the API writes them. */
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
      recordQualificationEvidenceWrite(c, {
        exchangeId,
        grantId,
        writeId: randomUUID(),
        kind: 'input_turn',
        receipt: { ...receipt, atMs: seq },
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

describe('a voice tool call’s key is deleted an hour after its exchange ended, by the same pass (0047; prodrev-r3 F3)', () => {
  /** An exchange P opened in a fresh project, and the key of one bound call in it, claimed as the API claims it. */
  async function claimed(): Promise<{ exchangeId: string; key: string }> {
    const seeded = await seedProject(db.ownerUrl, { admin: A, editors: [P] })
    const snap = await withActor(api, P, 'read', (c) => readSnapshot(c, seeded.projectId))
    assert.ok(snap)
    const { exchangeId } = await withActor(api, P, 'write', (c) =>
      startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
    )
    const key = `live:${exchangeId}:1:k-1`
    await withService(api, (c) =>
      claimLiveCall(c, { exchangeId, inputEpoch: 1, actorId: P, key, name: 'project_status', callSha256: A_CALL }),
    )
    return { exchangeId, key }
  }
  const keyOf = async (exchangeId: string): Promise<string[]> =>
    (
      await owner((c) =>
        c.query<{ key: string }>(`SELECT idempotency_key AS key FROM sophia.live_call_keys WHERE exchange_id=$1`, [
          exchangeId,
        ]),
      )
    ).rows.map((r) => r.key)
  /** End the exchange as its member would, then move its end back by `ago`. */
  async function ended(exchangeId: string, ago: string): Promise<void> {
    await withActor(api, P, 'write', (c) => controlExchange(c, exchangeId, 'end'))
    await owner((c) =>
      c.query(`UPDATE sophia.room_exchanges SET ended_at=ended_at-$2::interval WHERE id=$1`, [exchangeId, ago]),
    )
  }

  it('only keys of exchanges that ended over an hour ago go: an open exchange’s, or one ended within the hour, stay', async () => {
    const open = await claimed()
    const recent = await claimed()
    const old = await claimed()
    await ended(recent.exchangeId, '59 minutes')
    await ended(old.exchangeId, '61 minutes')
    const lines: string[] = []
    const pass = await dispatchOnce(worker, { workerId: 'test-worker', log: (line) => lines.push(line) })
    assert.deepEqual(
      [await keyOf(open.exchangeId), await keyOf(recent.exchangeId), await keyOf(old.exchangeId)],
      [[open.key], [recent.key], []],
    )
    assert.equal(pass.liveCallKeysExpired, 1)
    assert.deepEqual(lines, [], 'nothing failed')
    assert.equal((await dispatchOnce(worker, { workerId: 'test-worker' })).liveCallKeysExpired, 0, 'once')
  })

  it('a late call under a deleted key claims nothing: its exchange ended, so its bind refuses it and the claim rolls back', async () => {
    const old = await claimed()
    await ended(old.exchangeId, '61 minutes')
    await dispatchOnce(worker, { workerId: 'test-worker' })
    assert.deepEqual(await keyOf(old.exchangeId), [])
    const c = await api.connect()
    let refused = 'ok'
    try {
      await c.query('BEGIN')
      // As the API's bind transaction (executeToolCall): the claim, then the speaker's bind.
      await claimLiveCall(c, {
        exchangeId: old.exchangeId,
        inputEpoch: 1,
        actorId: P,
        key: old.key,
        name: 'project_status',
        callSha256: A_CALL,
      })
      await c.query(`SELECT sophia.media_tool_speaker($1,1,$2)`, [old.exchangeId, P])
      await c.query('COMMIT')
    } catch (err: unknown) {
      refused = (err as { code?: string }).code ?? 'error'
      await c.query('ROLLBACK')
    } finally {
      c.release()
    }
    assert.equal(refused, '40001', 'the exchange has ended')
    assert.deepEqual(await keyOf(old.exchangeId), [], 'no key again')
  })

  it('on a database without 0047 the pass deletes no key and logs nothing', async () => {
    const lines: string[] = []
    const pass = await dispatchOnce(worker0045, { workerId: 'test-worker', log: (line) => lines.push(line) })
    assert.equal(pass.liveCallKeysExpired, 0)
    assert.deepEqual(lines, [])
  })

  it('is the worker’s alone: a member, the API’s login and an actor on the worker’s login get 42501', async () => {
    const expire = 'SELECT sophia.live_call_keys_expire()'
    assert.equal(await sqlstate(api, expire, P), '42501', 'a member')
    assert.equal(await sqlstate(api, expire), '42501', 'the API’s login (PUBLIC has no EXECUTE either)')
    assert.equal(await sqlstate(worker, expire, P), '42501', 'a member identity on the worker’s login')
    assert.equal(await sqlstate(worker, expire), 'ok', 'the worker itself')
    const { rows } = await owner((c) =>
      c.query<{ definer: boolean; config: string[] }>(
        `SELECT prosecdef AS definer, proconfig AS config FROM pg_proc
          WHERE oid=to_regprocedure('sophia.live_call_keys_expire()')`,
      ),
    )
    assert.deepEqual(rows, [{ definer: true, config: ['search_path=pg_catalog, sophia'] }], 'a fixed search_path')
  })
})
