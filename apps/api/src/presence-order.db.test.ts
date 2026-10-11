// The bridge's presence reports through the API's real route, POST /v1/media/presence (item 7 C of the PR #190 review;
// migration 0052 and the presence-order amendment, provisional numbers), level: sql-run, on the real API and PostgreSQL.
// A report held at the project's lock is a real Lock wait of the API's own connection, read from pg_stat_activity; the
// order the reports take the lock is the order they waited in. No sleeps.
import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import { createPool, readSnapshot, startExchange, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const MEDIA_TOKEN = 'media-bridge-capability-for-tests-0123456789'
const A = randomUUID() // the admin, a member in the room
const G = randomUUID() // a guest
const member = { identity: A, standing: 'admin' }
const guest = { identity: G, standing: 'guest' }

let db: TestDatabase
let pool: pg.Pool
let owner: pg.Pool
let app: FastifyInstance
/** The same API with voice qualification on: its guard runs in every presence report's transaction. */
let voiced: FastifyInstance

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const mediaBridgeTokenSha256 = createHash('sha256').update(MEDIA_TOKEN, 'utf8').digest()
  app = buildApp({ pool, verifyActor, mediaBridgeTokenSha256 })
  voiced = buildApp({ pool, verifyActor, mediaBridgeTokenSha256, voiceQualification: true })
  await app.ready()
  await voiced.ready()
})
after(async () => {
  await app.close()
  await voiced.close()
  await pool.end()
  await owner.end()
  await db.drop()
})

/** Operator transactions a test opened and has not finished: rolled back after each test, whatever its outcome. */
const unfinished: Array<() => Promise<void>> = []
afterEach(async () => {
  for (let end = unfinished.pop(); end; end = unfinished.pop()) await end()
})

/** The operator holds the project's lock in a transaction of its own until `release()`. */
async function holdProject(projectId: string) {
  const c = await owner.connect()
  await c.query('BEGIN')
  await c.query(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`, [projectId])
  let done = false
  const finish = async (how: 'COMMIT' | 'ROLLBACK') => {
    if (done) return
    done = true
    try {
      await c.query(how)
    } finally {
      c.release()
    }
  }
  unfinished.push(() => finish('ROLLBACK').catch(() => undefined))
  return { release: () => finish('COMMIT') }
}

/** How many of the API's connections wait on a lock inside media_report_presence, once that is `n` (within 5 s). */
async function waiting(n: number): Promise<number> {
  const deadline = Date.now() + 5000
  let seen = -1
  while (Date.now() < deadline) {
    const { rows } = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%media_report_presence%'`,
    )
    seen = rows[0]?.n ?? 0
    if (seen === n) return seen
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return seen
}

/** A project, its room and an exchange the admin opened; how the bridge reports for it, and what the room is now. */
async function fixture() {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A })
  const snap = await withActor(pool, A, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  const roomId = snap.room.id
  const { exchangeId } = await withActor(pool, A, 'write', (c) =>
    startExchange(c, roomId, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  const body = (instance: string, seq: unknown, saw: Record<string, unknown> = {}) => ({
    roomId,
    exchangeId,
    bridgeInstanceId: instance,
    voice: 'ready',
    reason: null,
    participants: [member],
    ...saw,
    ...(seq === null ? {} : { reportSeq: seq }),
  })
  /** POST /v1/media/presence with the bridge's capability: its status. */
  const post = async (b: Record<string, unknown>, api = app) =>
    (
      await api.inject({
        method: 'POST',
        url: '/v1/media/presence',
        headers: { authorization: `Bearer ${MEDIA_TOKEN}` },
        payload: b,
      })
    ).statusCode
  const state = async () => {
    const presence = await owner.query(
      `SELECT voice, guests_present, participants, reported_at::text, empty_since::text
         FROM sophia.room_ai_presence WHERE room_id=$1`,
      [roomId],
    )
    const processes = await owner.query(
      // 0052's columns read through to_jsonb, so a database without them answers null rather than an error.
      `SELECT bridge_instance, reported_at::text, to_jsonb(r)->>'last_seq' AS last_seq,
              to_jsonb(r)->'guests_present' AS guests_present, to_jsonb(r)->>'guests_at' AS guests_at
         FROM sophia.room_bridge_reports r WHERE room_id=$1 ORDER BY bridge_instance`,
      [roomId],
    )
    const exchange = await owner.query(
      `SELECT state, pause_reason, revision::text FROM sophia.room_exchanges WHERE id=$1`,
      [exchangeId],
    )
    const events = await owner.query<{ code: string }>(
      `SELECT summary_code AS code FROM sophia.project_events WHERE project_id=$1 ORDER BY sequence`,
      [projectId],
    )
    return {
      presence: presence.rows[0] as Record<string, unknown> | undefined,
      processes: processes.rows as Array<Record<string, unknown>>,
      exchange: exchange.rows[0] as Record<string, unknown> | undefined,
      events: events.rows.map((e) => e.code),
    }
  }
  /** What a member's snapshot says of Sophia. */
  const sophia = async () => {
    const now = await withActor(pool, A, 'read', (c) => readSnapshot(c, projectId))
    return { voice: now?.room.sophia.voice, exchange: now?.room.sophia.exchange, pause: now?.room.sophia.pauseReason }
  }
  return { projectId, roomId, exchangeId, body, post, state, sophia }
}

describe('POST /v1/media/presence applies a process’s reports in its sequence’s order (0052)', () => {
  it('N+1 takes the project’s lock first and N waits behind it: N+1 applies, N is answered 204 and changes nothing (lock order 1)', async () => {
    const f = await fixture()
    assert.equal(await f.post(f.body('bridge-a', 1, { voice: 'connecting' })), 204)
    const op = await holdProject(f.projectId)
    const n1 = f.post(f.body('bridge-a', 3, { participants: [member, guest] }))
    assert.equal(await waiting(1), 1, 'N+1 waits for the operator’s lock')
    const n = f.post(f.body('bridge-a', 2, { voice: 'recovering', participants: [] }))
    assert.equal(await waiting(2), 2, 'N waits behind it')
    await op.release()
    assert.deepEqual([await n1, await n], [204, 204])
    const s = await f.state()
    assert.deepEqual(
      [s.presence?.voice, s.presence?.guests_present, s.presence?.participants, s.processes[0]?.last_seq],
      ['ready', true, [member, guest], '3'],
      'the room as N+1 saw it',
    )
    assert.deepEqual([s.exchange?.state, s.exchange?.pause_reason], ['paused', 'guest'])
    assert.ok(!s.events.includes('room.sophia_recovering'), 'no event of N’s')
    assert.deepEqual(await f.sophia(), { voice: 'ready', exchange: 'paused', pause: 'guest' })
  })

  it('N takes the lock first and N+1 waits behind it: both apply, in that order; the room is N+1’s (lock order 2)', async () => {
    const f = await fixture()
    assert.equal(await f.post(f.body('bridge-a', 1, { voice: 'connecting' })), 204)
    const op = await holdProject(f.projectId)
    const n = f.post(f.body('bridge-a', 2, { voice: 'recovering', participants: [] }))
    assert.equal(await waiting(1), 1)
    const n1 = f.post(f.body('bridge-a', 3, { participants: [member, guest] }))
    assert.equal(await waiting(2), 2)
    await op.release()
    assert.deepEqual([await n, await n1], [204, 204])
    const s = await f.state()
    assert.deepEqual([s.presence?.voice, s.presence?.guests_present, s.processes[0]?.last_seq], ['ready', true, '3'])
    assert.ok(s.events.includes('room.sophia_recovering'), 'N applied first')
    assert.equal(s.events.at(-1), 'room.sophia_ready', 'then N+1')
  })

  it('N released after N+1 was answered (the bridge cut it) is answered 204 and changes nothing, voice qualification on or off', async () => {
    for (const api of [app, voiced]) {
      const f = await fixture()
      assert.equal(await f.post(f.body('bridge-a', 5, { participants: [member, guest] }), api), 204)
      const untouched = await f.state()
      const seen = await f.sophia()
      assert.equal(await f.post(f.body('bridge-a', 4, { voice: 'unavailable', participants: [] }), api), 204)
      assert.equal(await f.post(f.body('bridge-a', 5, { participants: [member] }), api), 204)
      assert.deepEqual(await f.state(), untouched, 'no presence, liveness, assertion, pause, end, empty_since or event')
      assert.deepEqual(await f.sophia(), seen)
    }
  })

  it('another process’s report never clears a guest the first one still sees, through the route', async () => {
    const f = await fixture()
    assert.equal(await f.post(f.body('bridge-a', 1, { participants: [member, guest] })), 204)
    assert.equal(await f.post(f.body('bridge-b', 1, { participants: [member] })), 204)
    assert.deepEqual(await f.sophia(), { voice: 'ready', exchange: 'paused', pause: 'guest' })
    assert.equal((await f.state()).presence?.guests_present, true)
    assert.equal(await f.post(f.body('bridge-a', 2, { participants: [member] })), 204)
    assert.equal((await f.state()).presence?.guests_present, false, 'its own process clears it')
  })

  it('a report without reportSeq (a bridge before the amendment) is still taken; a malformed one is refused (422) and changes nothing', async () => {
    const f = await fixture()
    assert.equal(await f.post(f.body('bridge-old', null, { voice: 'recovering' })), 204)
    assert.equal((await f.state()).presence?.voice, 'recovering')
    const untouched = await f.state()
    for (const bad of [0, -3, 1.5, 9007199254740992, '7', null]) {
      const b = { ...f.body('bridge-old', null), reportSeq: bad }
      assert.equal(await f.post(b), 422, JSON.stringify(bad))
    }
    assert.deepEqual(await f.state(), untouched)
    assert.equal(await f.post(f.body('bridge-old', 9007199254740991)), 204, 'the bound itself')
  })
})
