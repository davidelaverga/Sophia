// The bridge's bounded posts against a lock held in PostgreSQL (Codex P1 r4238081302 on PR #190), level: sql-run, on the
// real API (listening on a port) and the bridge's real HTTP client and MediaBridge, with LABELLED FAKES only for LiveKit
// and Gemini Live. The bridge gives an attempt up at its bound and its socket closes; the API's transaction for that
// attempt must not outlive it, or a lock held for longer piles the attempts' transactions up until the API's pool is
// exhausted. Each wait here is on a state read from PostgreSQL (pg_stat_activity) or on the bridge's own log, never on
// a sleep; samples are taken every 10 ms while a lock is held.
import { createHash, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import type { MediaPresenceReport } from '@sophia/contracts'
import * as bridgeApi from '@sophia/media-bridge'
import {
  DECLARED_NAMES,
  httpMediaService,
  loadMissionGuide,
  MediaBridge,
  ServiceError,
  type LiveEvents,
  type LiveLink,
  type MediaService,
  type RoomEvents,
  type RoomLink,
  type RoomPerson,
} from '@sophia/media-bridge'
import * as persistence from '@sophia/persistence'
import { createPool, readSnapshot, startExchange, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import * as mediaRoutes from './routes/media.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const MEDIA_TOKEN = 'media-bridge-capability-for-tests-0123456789'
const LIVEKIT = { url: 'ws://127.0.0.1:9', apiKey: 'devkey', apiSecret: 'livekit-test-secret-at-least-32-bytes!!' }
const RUN = 'ab'.repeat(32)
/**
 * The bridge's own bound for one attempt of each post here: POST_ATTEMPT_MS (presence, holder, quiesce acknowledgement,
 * announcement record), EVIDENCE_ATTEMPT_MS (receipts) and RESERVE_TIMEOUT_MS (reservations), all 3 s; the attempts
 * below apply it as the bridge does, through its real client, by aborting the request's signal.
 */
const CLIENT_BOUND_MS = 3000
/**
 * The most acquisitions a bounded post may have waiting on the API's pool at once, per pool (the API's admission bound,
 * BOUNDED_ACQUISITIONS_MAX): past it, a bounded post is refused at once and never enqueued.
 */
const ACQUISITIONS_BOUND = 4
/** The API's pool: small, so a pile-up of abandoned transactions exhausts it within a few attempts. */
const POOL_MAX = 4

const A = randomUUID() // admin
const E = randomUUID() // the editor who opens the exchange and holds its floor
const P = randomUUID() // a grant's principal, an editor
const member: RoomPerson = { identity: E, standing: 'editor' }
const guest: RoomPerson = { identity: 'guest-1', standing: 'guest' }

let db: TestDatabase
let pool: pg.Pool
let owner: pg.Pool
let app: FastifyInstance
/** The same API with voice qualification on: its presence route runs the grant's guard; it serves receipts and reservations. */
let voiced: FastifyInstance
let base: string
let voicedBase: string

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: POOL_MAX })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const mediaBridgeTokenSha256 = createHash('sha256').update(MEDIA_TOKEN, 'utf8').digest()
  app = buildApp({ pool, verifyActor, mediaBridgeTokenSha256, livekit: LIVEKIT })
  voiced = buildApp({ pool, verifyActor, mediaBridgeTokenSha256, livekit: LIVEKIT, voiceQualification: true })
  await app.listen({ port: 0, host: '127.0.0.1' })
  await voiced.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  voicedBase = `http://127.0.0.1:${String((voiced.server.address() as AddressInfo).port)}`
})

after(async () => {
  await app.close()
  await voiced.close()
  await pool.end()
  await owner.end()
  await db.drop()
})

/** Locks a test holds and has not released: released after each test, whatever its outcome. */
const unfinished: Array<() => Promise<void>> = []
afterEach(async () => {
  for (let end = unfinished.pop(); end; end = unfinished.pop()) await end()
})

/** Until `check` holds; past `ms` the test fails on an assertion naming what it waited for. */
async function until(what: string, check: () => boolean | Promise<boolean>, ms = 20_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/** The operator holds a row lock (`sql` takes it) in a transaction of its own until `release()`. */
async function hold(sql: string, params: unknown[]) {
  const c = await owner.connect()
  await c.query('BEGIN')
  await c.query(sql, params)
  let done = false
  const end = async (how: 'COMMIT' | 'ROLLBACK') => {
    if (done) return
    done = true
    try {
      await c.query(how)
    } finally {
      c.release()
    }
  }
  unfinished.push(() => end('ROLLBACK').catch(() => undefined))
  return { release: () => end('COMMIT') }
}
const holdProject = (projectId: string) => hold(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`, [projectId])

/** The API's transactions running `fn` (a sophia.* function's name) now, waiting or not. */
async function running(fn: string): Promise<number> {
  const { rows } = await owner.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid() AND state<>'idle' AND query LIKE $1`,
    [`%sophia.${fn}(%`],
  )
  return rows[0]?.n ?? 0
}

/** Whether a transaction running `fn` waits on a lock now. */
async function waitsOnLock(fn: string): Promise<boolean> {
  const { rows } = await owner.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE $1`,
    [`%sophia.${fn}(%`],
  )
  return (rows[0]?.n ?? 0) > 0
}

/**
 * Sampled every 10 ms until `stop()`: the most transactions running `fn` at once, and the most connections the API's pool
 * had open and callers it had waiting for one.
 */
function sample(fn: string) {
  const most = { transactions: 0, connections: 0, waiting: 0 }
  const state = { stopped: false }
  const loop = (async () => {
    while (!state.stopped) {
      most.transactions = Math.max(most.transactions, await running(fn))
      most.connections = Math.max(most.connections, pool.totalCount)
      most.waiting = Math.max(most.waiting, pool.waitingCount)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  })()
  return async () => {
    state.stopped = true
    await loop
    return most
  }
}

/**
 * Every connection the API's pool can give, taken and held: its idle ones, and new ones up to its max (one may be the
 * notification hub's LISTEN connection, already out). Taking none that would make it wait.
 */
async function saturate(): Promise<pg.PoolClient[]> {
  const held: pg.PoolClient[] = []
  while (pool.idleCount > 0 || pool.totalCount < POOL_MAX) held.push(await pool.connect())
  return held
}

/** One attempt as the bridge makes it: its real client, given up at CLIENT_BOUND_MS (the request's socket closed). */
async function attempt(run: (signal: AbortSignal) => Promise<unknown>) {
  const started = performance.now()
  try {
    const value = await run(AbortSignal.timeout(CLIENT_BOUND_MS))
    return { answer: 'ok' as const, value, ms: performance.now() - started }
  } catch (err: unknown) {
    const answer = err instanceof ServiceError ? err.status : 'no answer'
    return { answer, value: err instanceof Error ? err.message : String(err), ms: performance.now() - started }
  }
}

const media = () => httpMediaService(base, MEDIA_TOKEN)
const voicedMedia = () => httpMediaService(voicedBase, MEDIA_TOKEN)

/** A project with an exchange `opener` opened (holding its floor, input epoch 1); `first` runs before it opens (a grant). */
async function exchangeIn(opener = E, first?: (projectId: string) => Promise<unknown>) {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E, P] })
  const granted = await first?.(projectId)
  const snap = await withActor(pool, opener, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  const { exchangeId } = await withActor(pool, opener, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  return { projectId, roomId: snap.room.id, exchangeId, granted }
}

async function grantIn(projectId: string): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    `SELECT (sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',900,3,20,1000,200000,3600)).id AS id`,
    [projectId, P, RUN],
  )
  assert.ok(rows[0])
  return rows[0].id
}

/** What a report changed of a room, as the owner reads it. */
async function roomState(roomId: string, exchangeId: string, since: number) {
  const presence = await owner.query<{ guests: boolean; participants: RoomPerson[] }>(
    `SELECT guests_present AS guests, participants FROM sophia.room_ai_presence WHERE room_id=$1`,
    [roomId],
  )
  const processes = await owner.query<{ seq: string | null; guests: boolean | null }>(
    `SELECT to_jsonb(r)->>'last_seq' AS seq, (to_jsonb(r)->>'guests_present')::boolean AS guests
       FROM sophia.room_bridge_reports r WHERE room_id=$1 AND bridge_instance='bridge-bound'`,
    [roomId],
  )
  const exchange = await owner.query<{ state: string; pause: string | null }>(
    `SELECT state, pause_reason AS pause FROM sophia.room_exchanges WHERE id=$1`,
    [exchangeId],
  )
  const events = await owner.query<{ code: string }>(
    `SELECT summary_code AS code FROM sophia.project_events e JOIN sophia.room_exchanges x ON x.project_id=e.project_id
      WHERE x.id=$1 AND e.sequence>$2 ORDER BY e.sequence`,
    [exchangeId, since],
  )
  return {
    guests: presence.rows[0]?.guests,
    participants: presence.rows[0]?.participants,
    lastSeq:
      processes.rows[0]?.seq === null || processes.rows[0]?.seq === undefined ? null : Number(processes.rows[0].seq),
    processGuests: processes.rows[0]?.guests ?? null,
    exchange: [exchange.rows[0]?.state, exchange.rows[0]?.pause],
    events: events.rows.map((e) => e.code),
  }
}

const lastEvent = async (projectId: string) =>
  Number(
    (
      await owner.query<{ n: string }>(
        `SELECT coalesce(max(sequence),0)::text AS n FROM sophia.project_events WHERE project_id=$1`,
        [projectId],
      )
    ).rows[0]?.n ?? 0,
  )

/** A session_closed receipt under `grantId` (A15), as the bridge sends one: no connection named. */
const sessionClosed = (grantId: string) => ({
  kind: 'session_closed' as const,
  schema: 'sophia.bridge.voice_qualification.v1' as const,
  grantId,
  runBindingSha256: RUN,
  atMs: 1_800_000_000_000,
  providerClosed: true,
  windows: 0,
  turns: 0,
  replies: 0,
  toolCalls: 0,
  typedMessages: 0,
  transcriptRetained: false as const,
  reason: 'lost' as const,
})

/** Until the presence report waiting on a lock has waited `ms` by the server's clock. */
const waitedOnLock = (ms: number) =>
  until(`the report has waited ${String(ms)} ms for its lock`, async () => {
    const { rows } = await owner.query<{ ms: number }>(
      `SELECT coalesce(max(extract(epoch FROM clock_timestamp()-query_start)*1000),0)::float8 AS ms
         FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE '%sophia.media_report_presence(%'`,
    )
    return (rows[0]?.ms ?? 0) >= ms
  })

/** FAKE LiveKit room: whoever the test says is in it. */
class FakeRoom implements RoomLink {
  present: RoomPerson[] = [member]
  readonly events: RoomEvents
  constructor(events: RoomEvents) {
    this.events = events
  }
  people = () => this.present
  play = () => Promise.resolve()
  clearPlayback = () => undefined
  watch = () => undefined
  setState = () => Promise.resolve()
  close = () => Promise.resolve()
  set(people: RoomPerson[]): void {
    this.present = people
    this.events.people(people)
  }
}

/** FAKE Gemini Live connection. */
class FakeLive implements LiveLink {
  readonly events: LiveEvents
  constructor(events: LiveEvents) {
    this.events = events
  }
  sendAudio = () => undefined
  sendAudioStreamEnd = () => undefined
  sendFrame = () => undefined
  sendToolResponses = () => undefined
  sendNotice = () => undefined
  close = () => undefined
}

describe('the bridge’s bounds against the API’s (r4238081302)', () => {
  it('each bound the API holds a bridge post’s transaction to is below the bridge’s own bound for that post', () => {
    const server = Reflect.get(mediaRoutes, 'BRIDGE_POST_BOUND_MS') as unknown
    const clients = ['POST_ATTEMPT_MS', 'EVIDENCE_ATTEMPT_MS', 'RESERVE_TIMEOUT_MS'].map(
      (name) => Reflect.get(bridgeApi, name) as unknown,
    )
    assert.deepEqual(clients, [CLIENT_BOUND_MS, CLIENT_BOUND_MS, CLIENT_BOUND_MS], 'the bridge’s bounds, as used here')
    assert.ok(typeof server === 'number' && server > 0 && server < CLIENT_BOUND_MS, `the API’s: ${String(server)}`)
  })
})

describe('presence under a held project lock, through the real MediaBridge (r4238081302)', () => {
  it('at most one presence transaction at a time, the pool never waits, other routes answer; once released, only the latest report counts, and an abandoned one left nothing', async () => {
    const { projectId, roomId, exchangeId } = await exchangeIn()
    const sent: Array<{ seq: number | undefined; guest: boolean }> = []
    const real = media()
    const service: MediaService = {
      ...real,
      // The real client, observed: what each report carried. The request, its signal and its abort are the client's own.
      presence: (report: MediaPresenceReport, signal?: AbortSignal) => {
        sent.push({ seq: report.reportSeq, guest: report.participants.some((p) => p.standing === 'guest') })
        return real.presence(report, signal)
      },
    }
    const logs: Array<[string, Record<string, unknown>]> = []
    const rooms: FakeRoom[] = []
    const lives: FakeLive[] = []
    const bridge = new MediaBridge({
      service,
      joinRoom: async (_access, events) => {
        await Promise.resolve()
        const r = new FakeRoom(events)
        rooms.push(r)
        return r
      },
      connectLive: async (_options, events) => {
        await Promise.resolve()
        const l = new FakeLive(events)
        lives.push(l)
        return l
      },
      apiKey: 'fake',
      model: 'fake',
      guide: loadMissionGuide(DECLARED_NAMES),
      bridgeInstanceId: 'bridge-bound',
      now: Date.now,
      log: (event, detail) => logs.push([event, detail ?? {}]),
    })
    const loop = bridge.run()
    const failures = () => logs.filter(([event]) => event === 'presence.report_failed')
    try {
      await until('the bridge joined', () => rooms.length === 1 && lives.length === 1)
      lives[0]?.events.setupComplete()
      await until('a report applied', async () => (await roomState(roomId, exchangeId, 0)).lastSeq !== null)
      const room = rooms[0]!
      const since = await lastEvent(projectId)
      const lock = await holdProject(projectId)
      const stop = sample('media_report_presence')
      // While the lock is held, a guest joins: each report now says so, and none may ever count.
      room.set([member, guest])
      await until('three reports not taken', () => failures().length >= 3)
      const withGuest = new Set(sent.filter((s) => s.guest).map((s) => s.seq))
      room.set([member])
      const settled = failures().length
      await until('two more, made after the guest left', () => failures().length >= settled + 2)
      const started = performance.now()
      const ready = await fetch(`${base}/ready`, { signal: AbortSignal.timeout(1500) }).then(
        (res) => res.status,
        () => 'no answer',
      )
      const readyMs = performance.now() - started
      const most = await stop()
      // Evidence for the log: what was sampled while the lock was held.
      console.log(
        JSON.stringify({ heldLock: { ...most, poolMax: POOL_MAX, ready, readyMs, notTaken: failures().length } }),
      )
      assert.deepEqual(
        { presenceTransactions: most.transactions <= 1, poolWaiting: most.waiting, ready },
        { presenceTransactions: true, poolWaiting: 0, ready: 200 },
        `while the lock was held: ${JSON.stringify({ ...most, readyMs })}`,
      )
      assert.ok(
        most.connections < POOL_MAX,
        `the pool never filled: ${String(most.connections)} of ${String(POOL_MAX)}`,
      )
      assert.ok(readyMs < 1000, `another route answered in ${String(readyMs)} ms`)
      // Each report not taken was answered by the API (its bound), not given up by the bridge.
      for (const [, detail] of failures()) assert.match(String(detail.error), /POST \/v1\/media\/presence: 503 /)

      await lock.release()
      const seqs: Array<number | null> = []
      const lastWithGuest = Math.max(...[...withGuest].map((n) => n ?? 0))
      await until('a report made after the guest left applied, and no presence transaction left', async () => {
        const s = await roomState(roomId, exchangeId, since)
        seqs.push(s.lastSeq)
        return (s.lastSeq ?? 0) > lastWithGuest && (await running('media_report_presence')) === 0
      })
      const s = await roomState(roomId, exchangeId, since)
      console.log(JSON.stringify({ released: { seqs: [...new Set(seqs)], withGuest: [...withGuest], state: s } }))
      assert.deepEqual(
        {
          guests: s.guests,
          processGuests: s.processGuests,
          participants: s.participants,
          exchange: s.exchange,
          events: s.events,
        },
        { guests: false, processGuests: false, participants: [member], exchange: ['open', null], events: [] },
        'no report carrying the guest counted: no guest, no pause, no event',
      )
      assert.ok(
        seqs.every((n) => n === null || !withGuest.has(n)),
        `no number of a report not taken was ever kept: ${JSON.stringify(seqs)}`,
      )
      assert.ok(
        seqs.every((n, i) => i === 0 || (n ?? 0) >= (seqs[i - 1] ?? 0)),
        `last_seq never went back: ${JSON.stringify(seqs)}`,
      )
    } finally {
      for (const end of unfinished.splice(0).toReversed()) await end()
      await bridge.stop()
      await loop
    }
  })
})

/** A presence report of process bridge-bound, numbered `seq`. */
const report = (roomId: string, exchangeId: string, seq: number, participants = [member]): MediaPresenceReport => ({
  roomId,
  exchangeId,
  bridgeInstanceId: 'bridge-bound',
  voice: 'ready',
  reason: null,
  participants,
  reportSeq: seq,
})

describe('a presence report under the API’s bound (r4238081302)', () => {
  it('control: with nothing held, a report is taken at once', async () => {
    const { roomId, exchangeId } = await exchangeIn()
    const r = await attempt((signal) => media().presence(report(roomId, exchangeId, 1), signal))
    assert.equal(r.answer, 'ok')
    assert.equal((await roomState(roomId, exchangeId, 0)).lastSeq, 1)
  })

  it('control: a lock released within the bound, while the report waits for it: the report is taken', async () => {
    const { projectId, roomId, exchangeId } = await exchangeIn()
    const lock = await holdProject(projectId)
    const pending = attempt((signal) => media().presence(report(roomId, exchangeId, 1), signal))
    await until('the report waits for the lock', () => waitsOnLock('media_report_presence'), 5000)
    await lock.release()
    assert.equal((await pending).answer, 'ok')
    assert.equal((await roomState(roomId, exchangeId, 0)).lastSeq, 1)
  })

  it('past the bound: 503 unavailable, retry safe_read, before the bridge’s own bound; the transaction ended then, and left nothing', async () => {
    const { projectId, roomId, exchangeId } = await exchangeIn()
    const lock = await holdProject(projectId)
    const started = performance.now()
    const res = await fetch(`${base}/v1/media/presence`, {
      method: 'POST',
      headers: { authorization: `Bearer ${MEDIA_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(report(roomId, exchangeId, 7, [member, guest])),
      signal: AbortSignal.timeout(CLIENT_BOUND_MS),
    }).then(
      async (r): Promise<{ status: number | string; body: Record<string, unknown> }> => ({
        status: r.status,
        body: (await r.json()) as Record<string, unknown>,
      }),
      () => ({ status: 'no answer', body: {} as Record<string, unknown> }),
    )
    const ms = performance.now() - started
    console.log(JSON.stringify({ boundAnswer: { ...res, ms } }))
    assert.deepEqual(
      [res.status, res.body.code, res.body.message, res.body.retry, typeof res.body.requestId],
      [503, 'unavailable', 'Not done within its time bound; nothing of it was kept', 'safe_read', 'string'],
      JSON.stringify(res.body),
    )
    assert.ok(ms < CLIENT_BOUND_MS, `answered in ${String(ms)} ms`)
    assert.equal(await running('media_report_presence'), 0, 'its transaction ended with the answer')
    const viaClient = await attempt((signal) => media().presence(report(roomId, exchangeId, 8), signal))
    assert.equal(viaClient.answer, 503, 'the bridge’s client sees a 5xx: the session reports again, numbered anew')
    await lock.release()
    const s = await roomState(roomId, exchangeId, 0)
    assert.deepEqual(
      [s.lastSeq, s.guests, s.processGuests, s.exchange],
      [null, undefined, null, ['open', null]],
      'rolled back: no last_seq, no guest, no pause',
    )
  })

  it('the bound is the transaction’s own: the connection goes back to the pool with no limit left on it', async () => {
    const one = createPool(db.apiUrl, { max: 1 })
    const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
    const mediaBridgeTokenSha256 = createHash('sha256').update(MEDIA_TOKEN, 'utf8').digest()
    const single = buildApp({ pool: one, verifyActor, mediaBridgeTokenSha256 })
    try {
      const { projectId, roomId, exchangeId } = await exchangeIn()
      await single.listen({ port: 0, host: '127.0.0.1' })
      const at = `http://127.0.0.1:${String((single.server.address() as AddressInfo).port)}`
      const lock = await holdProject(projectId)
      const refused = await attempt((signal) =>
        httpMediaService(at, MEDIA_TOKEN).presence(report(roomId, exchangeId, 1), signal),
      )
      await lock.release()
      const taken = await attempt((signal) =>
        httpMediaService(at, MEDIA_TOKEN).presence(report(roomId, exchangeId, 2), signal),
      )
      const { rows } = await one.query<{ t: string; l: string }>(
        `SELECT current_setting('statement_timeout') AS t, current_setting('lock_timeout') AS l`,
      )
      assert.deepEqual([refused.answer, taken.answer, rows[0]?.t, rows[0]?.l], [503, 'ok', '0', '0'])
    } finally {
      await single.close()
      await one.end()
    }
  })
})

/**
 * An exchange under a grant, past the grant's deadline (opened under it, then 20 minutes back, the grant 21: past its
 * 900 s, as voice-qualification.db.test.ts): the guard ends it on the next presence report it runs in.
 */
async function pastDeadline() {
  const { projectId, roomId, exchangeId, granted } = await exchangeIn(P, grantIn)
  await owner.query(
    `UPDATE sophia.voice_qualification_grants SET created_at=created_at-interval '21 minutes',
            expires_at=expires_at-interval '21 minutes' WHERE id=$1`,
    [String(granted)],
  )
  await owner.query(`UPDATE sophia.room_exchanges SET opened_at=now()-interval '20 minutes' WHERE id=$1`, [exchangeId])
  const ended = async () =>
    (
      await owner.query<{ state: string; reason: string | null }>(
        `SELECT e.state, q.ended_reason AS reason FROM sophia.room_exchanges e
           LEFT JOIN sophia.voice_qualification_exchanges q ON q.exchange_id=e.id WHERE e.id=$1`,
        [exchangeId],
      )
    ).rows[0]
  const principalReport = (seq: number): MediaPresenceReport => ({
    roomId,
    exchangeId,
    bridgeInstanceId: 'bridge-bound',
    voice: 'ready',
    reason: null,
    participants: [{ identity: P, standing: 'editor' }],
    reportSeq: seq,
  })
  return { projectId, roomId, exchangeId, ended, principalReport }
}

describe('the voice qualification guard in a bounded presence transaction (r4238081302)', () => {
  it('the guard’s own statement has only what is left of the bound: a guard still waiting then rolls the whole report back (503), never half-applied', async () => {
    const { projectId, roomId, exchangeId, granted } = await exchangeIn(P, grantIn)
    const grantId = String(granted)
    const written = await attempt((signal) =>
      voicedMedia().recordEvidence(
        { exchangeId, grantId, writeId: randomUUID(), receipt: sessionClosed(grantId) },
        signal,
      ),
    )
    assert.equal(written.answer, 'ok')
    // That receipt, expired, its row held: the guard's expiry (voice_evidence_expire) waits for it.
    await owner.query(
      `UPDATE sophia.voice_qualification_evidence SET expires_at=now()-interval '1 second' WHERE exchange_id=$1`,
      [exchangeId],
    )
    const row = await hold(`SELECT 1 FROM sophia.voice_qualification_evidence WHERE exchange_id=$1 FOR UPDATE`, [
      exchangeId,
    ])
    // The report itself first waits a second for the project's lock: the guard then has only about a second left.
    const lock = await holdProject(projectId)
    const started = performance.now()
    const pending = attempt((signal) =>
      voicedMedia().presence(
        {
          roomId,
          exchangeId,
          bridgeInstanceId: 'bridge-bound',
          voice: 'ready',
          reason: null,
          participants: [{ identity: P, standing: 'editor' }],
          reportSeq: 1,
        },
        signal,
      ),
    )
    await waitedOnLock(1000)
    await lock.release()
    const answer = await pending
    const ms = performance.now() - started
    const serverBound = Reflect.get(mediaRoutes, 'BRIDGE_POST_BOUND_MS') as unknown
    console.log(JSON.stringify({ guardCut: { answer, ms } }))
    assert.equal(answer.answer, 503, String(answer.value))
    assert.match(
      answer.value,
      /"code":"unavailable","message":"Not done within its time bound; nothing of it was kept"/,
    )
    assert.ok(typeof serverBound === 'number' && ms < serverBound + 300, `answered in ${String(ms)} ms`)
    await row.release()
    const kept = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM sophia.voice_qualification_evidence WHERE exchange_id=$1`,
      [exchangeId],
    )
    assert.deepEqual(
      [(await roomState(roomId, exchangeId, 0)).lastSeq, kept.rows[0]?.n],
      [null, 1],
      'rolled back whole: no presence, and the guard deleted nothing',
    )
  })

  it('a report past the bound applies neither its presence nor the guard; the next one, taken, applies both', async () => {
    const { projectId, roomId, exchangeId, ended, principalReport } = await pastDeadline()
    const lock = await holdProject(projectId)
    const refused = await attempt((signal) => voicedMedia().presence(principalReport(1), signal))
    assert.equal(refused.answer, 503, refused.value as string)
    assert.deepEqual(
      [await ended(), (await roomState(roomId, exchangeId, 0)).lastSeq],
      [{ state: 'open', reason: null }, null],
      'while held: neither half',
    )
    await lock.release()
    await until('no presence transaction left', async () => (await running('media_report_presence')) === 0, 5000)
    assert.deepEqual(
      [await ended(), (await roomState(roomId, exchangeId, 0)).lastSeq],
      [{ state: 'open', reason: null }, null],
      'released: the report given up left nothing, and nothing of it ran late',
    )
    const taken = await attempt((signal) => voicedMedia().presence(principalReport(2), signal))
    assert.equal(taken.answer, 'ok')
    assert.deepEqual(
      [await ended(), (await roomState(roomId, exchangeId, 0)).lastSeq],
      [{ state: 'ended', reason: 'deadline' }, 2],
      'taken: its presence and the guard, in one transaction',
    )
  })
})

describe('the bridge’s other bounded posts under a held lock (r4238081302 audit)', () => {
  /**
   * Two attempts as the bridge makes them (the second its retry) while `lock` is held: each must be answered (the API's
   * bound) with no transaction of `fn` left behind it. Then released, the post is taken.
   */
  async function underLock(
    fn: string,
    lock: { release: () => Promise<void> },
    post: (signal: AbortSignal) => Promise<unknown>,
  ) {
    const first = await attempt(post)
    const afterFirst = await running(fn)
    const second = await attempt(post)
    const afterSecond = await running(fn)
    assert.deepEqual(
      [first.answer, afterFirst, second.answer, afterSecond],
      [503, 0, 503, 0],
      `answered, and nothing left running: ${JSON.stringify([first, second])}`,
    )
    await lock.release()
    await until(`no ${fn} left`, async () => (await running(fn)) === 0, 5000)
    const taken = await attempt(post)
    assert.equal(taken.answer, 'ok', String(taken.value))
    return taken.value
  }

  it('holder: refused twice under the project lock, then taken once: one pause, nothing of the refused attempts', async () => {
    const { projectId, exchangeId } = await exchangeIn()
    const lock = await holdProject(projectId)
    await underLock('media_holder_event', lock, (signal) =>
      media().holder({ exchangeId, actorId: E, inputEpoch: 1, event: 'left' }, signal),
    )
    const { rows } = await owner.query<{ state: string; pause: string; revision: string }>(
      `SELECT state, pause_reason AS pause, revision::text FROM sophia.room_exchanges WHERE id=$1`,
      [exchangeId],
    )
    assert.deepEqual([rows[0]?.state, rows[0]?.pause, rows[0]?.revision], ['paused', 'holder_left', '2'])
  })

  it('quiesce acknowledgement: refused twice under its request’s row lock, then taken: acknowledged once', async () => {
    const { projectId, roomId, exchangeId } = await exchangeIn()
    const request = (
      await owner.query<{ id: string }>(
        `INSERT INTO sophia.room_quiesce_requests(project_id,room_id,exchange_id) VALUES($1,$2,$3) RETURNING id`,
        [projectId, roomId, exchangeId],
      )
    ).rows[0]!.id
    const lock = await hold(`SELECT 1 FROM sophia.room_quiesce_requests WHERE id=$1 FOR UPDATE`, [request])
    await underLock('media_ack_quiesce', lock, (signal) =>
      media().ackQuiesce(
        { requestId: request, bridgeInstanceId: 'bridge-bound', inputClosed: true, outputCleared: true },
        signal,
      ),
    )
    const { rows } = await owner.query<{ acked: boolean; acks: number }>(
      `SELECT acked_at IS NOT NULL AS acked, (SELECT count(*)::int FROM sophia.room_quiesce_acks WHERE request_id=$1) AS acks
         FROM sophia.room_quiesce_requests WHERE id=$1`,
      [request],
    )
    assert.deepEqual(rows[0], { acked: true, acks: 1 })
  })

  it('announcement record: refused twice under the exchange’s row lock, then taken: recorded once', async () => {
    const { projectId, exchangeId } = await exchangeIn()
    const job = (
      await owner.query<{ id: string }>(
        `INSERT INTO sophia.jobs(project_id,kind,state) VALUES($1,'research','pending') RETURNING id`,
        [projectId],
      )
    ).rows[0]!.id
    const lock = await hold(`SELECT 1 FROM sophia.room_exchanges WHERE id=$1 FOR UPDATE`, [exchangeId])
    await underLock('media_record_announced', lock, (signal) =>
      media().announced({ exchangeId, taskId: job, resultRevision: 1, heard: true }, signal),
    )
    const { rows } = await owner.query<{ n: number; heard: boolean }>(
      `SELECT count(*)::int AS n, bool_and(heard) AS heard FROM sophia.exchange_announcements WHERE exchange_id=$1`,
      [exchangeId],
    )
    assert.deepEqual(rows[0], { n: 1, heard: true })
  })

  it('reservation (voice on): refused twice under the project lock, then taken: ordinal 1, one connection reserved, the refused ones spent nothing', async () => {
    const { projectId, exchangeId, granted } = await exchangeIn(P, grantIn)
    const grantId = String(granted)
    const lock = await holdProject(projectId)
    const value = await underLock('media_voice_reserve', lock, (signal) =>
      voicedMedia().reserveQualification({ exchangeId, grantId, kind: 'connection' }, signal),
    )
    assert.deepEqual(value, { ok: true, ordinal: 1, stop: null, ended: false })
    const { rows } = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM sophia.voice_qualification_connections WHERE exchange_id=$1`,
      [exchangeId],
    )
    assert.equal(rows[0]?.n, 1)
  })

  it('receipt (voice on): refused twice under the project lock, then numbered 1; the same write again is its own 1 (replayed); the refused ones spent no number', async () => {
    const { projectId, exchangeId, granted } = await exchangeIn(P, grantIn)
    const grantId = String(granted)
    const writeId = randomUUID()
    const receipt = sessionClosed(grantId)
    const lock = await holdProject(projectId)
    const write = (signal: AbortSignal) =>
      voicedMedia().recordEvidence({ exchangeId, grantId, writeId, receipt }, signal)
    const first = await underLock('media_record_evidence_write', lock, write)
    const again = await attempt(write)
    assert.deepEqual(
      [first, again.value],
      [
        { seq: 1, replayed: false, ended: false, reason: null },
        { seq: 1, replayed: true, ended: false, reason: null },
      ],
    )
    const { rows } = await owner.query<{ high: number }>(
      `SELECT high_water AS high FROM sophia.voice_evidence_high_water WHERE exchange_id=$1`,
      [exchangeId],
    )
    assert.equal(rows[0]?.high, 1)
  })
})

describe('the bound covers the whole span: the pool’s connection, every statement, and COMMIT (r4238081302)', () => {
  it('the pool is saturated: the report waits for a connection only until its bound (503), and the connection handed over later goes straight back, unused: no report, no guard', async () => {
    const { roomId, exchangeId, ended, principalReport } = await pastDeadline()
    const held = await saturate()
    try {
      const waiting = attempt((signal) => voicedMedia().presence(principalReport(1), signal))
      await until('the report waits for a connection', () => pool.waitingCount === 1, 5000)
      const answer = await waiting
      console.log(JSON.stringify({ saturated: { answer, waiting: pool.waitingCount, total: pool.totalCount } }))
      assert.equal(answer.answer, 503, String(answer.value))
      assert.match(
        answer.value,
        /"code":"unavailable","message":"Not done within its time bound; nothing of it was kept","retry":"safe_read"/,
      )
      assert.ok(answer.ms < CLIENT_BOUND_MS, `answered in ${String(answer.ms)} ms`)
      // Only now does a connection come free: the pool hands it to the waiter the abandoned report left.
      held.pop()?.release()
      await until('the connection given back, unused', () => pool.waitingCount === 0 && pool.idleCount === 1, 5000)
      assert.deepEqual(
        [(await roomState(roomId, exchangeId, 0)).lastSeq, await ended()],
        [null, { state: 'open', reason: null }],
        'nothing of the abandoned report ran on it: no presence, no guard',
      )
    } finally {
      for (const c of held.splice(0)) c.release()
    }
    const taken = await attempt((signal) => voicedMedia().presence(principalReport(2), signal))
    assert.equal(taken.answer, 'ok')
    assert.deepEqual(
      [(await roomState(roomId, exchangeId, 0)).lastSeq, await ended()],
      [2, { state: 'ended', reason: 'deadline' }],
    )
  })

  it('a COMMIT that does not finish within the bound is outcome_unknown (503, retry same_admission_key), never a known rollback; COMMIT has only what was left', async () => {
    const { projectId, roomId, exchangeId } = await exchangeIn()
    // A test-only deferred constraint trigger: COMMIT waits for a row the test holds, so it is COMMIT the bound cuts.
    await owner.query(
      `CREATE TABLE sophia.test_commit_gate(id integer PRIMARY KEY); INSERT INTO sophia.test_commit_gate VALUES (1)`,
    )
    await owner.query(`CREATE FUNCTION sophia.test_commit_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path=pg_catalog,sophia AS $$ BEGIN PERFORM 1 FROM sophia.test_commit_gate WHERE id=1 FOR UPDATE; RETURN NULL; END $$`)
    await owner.query(`CREATE CONSTRAINT TRIGGER test_commit_gate AFTER INSERT OR UPDATE ON sophia.room_ai_presence
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sophia.test_commit_gate()`)
    const gate = await hold(`SELECT 1 FROM sophia.test_commit_gate WHERE id=1 FOR UPDATE`, [])
    // The report first waits a second for the project's lock, so its COMMIT has only about a second left of its bound.
    const lock = await holdProject(projectId)
    try {
      const started = performance.now()
      const pending = fetch(`${base}/v1/media/presence`, {
        method: 'POST',
        headers: { authorization: `Bearer ${MEDIA_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify(report(roomId, exchangeId, 1)),
        signal: AbortSignal.timeout(CLIENT_BOUND_MS),
      }).then(
        async (r): Promise<{ status: number | string; body: Record<string, unknown> }> => ({
          status: r.status,
          body: (await r.json()) as Record<string, unknown>,
        }),
        () => ({ status: 'no answer', body: {} as Record<string, unknown> }),
      )
      await waitedOnLock(1000)
      await lock.release()
      const res = await pending
      const ms = performance.now() - started
      console.log(JSON.stringify({ commitCut: { ...res, ms } }))
      assert.deepEqual(
        [res.status, res.body.code, res.body.message, res.body.retry],
        [503, 'outcome_unknown', 'Commit outcome unknown', 'same_admission_key'],
        JSON.stringify(res.body),
      )
      const serverBound = Reflect.get(mediaRoutes, 'BRIDGE_POST_BOUND_MS') as unknown
      assert.ok(
        typeof serverBound === 'number' && ms < serverBound + 300,
        `answered in ${String(ms)} ms: the COMMIT had only what was left of the bound`,
      )
      const viaClient = await attempt((signal) => media().presence(report(roomId, exchangeId, 2), signal))
      assert.equal(viaClient.answer, 503, 'the bridge’s client sees a 5xx: the session reports again, numbered anew')
    } finally {
      // The gate first: a COMMIT still waiting on it must end before its trigger can be dropped.
      await lock.release()
      await gate.release()
      await until('no presence transaction left', async () => (await running('media_report_presence')) === 0, 10_000)
      await owner.query(
        `DROP TRIGGER test_commit_gate ON sophia.room_ai_presence; DROP FUNCTION sophia.test_commit_gate(); DROP TABLE sophia.test_commit_gate`,
      )
    }
    // Here it did not commit (its deferred trigger was cut): unknown to the client, which therefore reports again.
    assert.equal((await roomState(roomId, exchangeId, 0)).lastSeq, null)
    const taken = await attempt((signal) => media().presence(report(roomId, exchangeId, 3), signal))
    assert.equal(taken.answer, 'ok')
    assert.equal((await roomState(roomId, exchangeId, 0)).lastSeq, 3)
  })

  it('sustained saturation: every client held throughout, many bridge retries over several bound periods; the pool’s waiters stay within the admission bound; released, nothing abandoned runs late, the pool drains, and presence recovers', async () => {
    const { roomId, exchangeId, ended, principalReport } = await pastDeadline()
    const limit = Reflect.get(persistence, 'BOUNDED_ACQUISITIONS_MAX') as unknown
    const serverBound = Reflect.get(mediaRoutes, 'BRIDGE_POST_BOUND_MS') as unknown
    const bound = typeof serverBound === 'number' ? serverBound : 2000
    const ownCount = () => {
      const count = Reflect.get(persistence, 'boundedAcquisitions') as unknown
      return typeof count === 'function' ? (count as (p: pg.Pool) => number)(pool) : -1
    }
    const census = { waiting: 0, total: 0, idle: 0, own: 0, samples: 0 }
    const state = { stopped: false }
    const held = await saturate()
    const heldCount = held.length
    const sampler = (async () => {
      while (!state.stopped) {
        census.waiting = Math.max(census.waiting, pool.waitingCount)
        census.total = Math.max(census.total, pool.totalCount)
        census.idle = Math.max(census.idle, pool.idleCount)
        census.own = Math.max(census.own, ownCount())
        census.samples += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    })()
    const answers: Array<Awaited<ReturnType<typeof attempt>>> = []
    let seq = 0
    try {
      const began = performance.now()
      // The bridge's retries: each sent once the one before was answered, as a session does on its next tick.
      while (answers.length < 3 * POOL_MAX || performance.now() - began < 3 * bound) {
        seq += 1
        const n = seq
        answers.push(await attempt((signal) => voicedMedia().presence(principalReport(n), signal)))
      }
    } finally {
      state.stopped = true
      await sampler
      console.log(
        JSON.stringify({
          saturatedCensus: { ...census, limit, poolMax: POOL_MAX, attempts: answers.length },
          answers: answers.map((a) => [a.answer, Math.round(a.ms)]),
        }),
      )
      for (const c of held.splice(0)) c.release()
    }
    assert.ok(
      answers.every((a) => a.answer === 503 && a.ms < CLIENT_BOUND_MS),
      'each answered by the API before the bridge’s own bound',
    )
    assert.deepEqual(
      {
        waiting: census.waiting <= ACQUISITIONS_BOUND,
        own: census.own <= ACQUISITIONS_BOUND,
        total: census.total,
        idle: census.idle,
      },
      { waiting: true, own: true, total: POOL_MAX, idle: 0 },
      `the census while every client was held, within the bound throughout: ${JSON.stringify(census)}`,
    )
    assert.equal(limit, ACQUISITIONS_BOUND, 'the API’s admission bound, as stated here')
    // Released: whatever the pool hands the abandoned acquisitions goes straight back; none of them runs anything.
    const late = { presence: 0, guard: 0 }
    await until('the pool drained to idle', async () => {
      late.presence = Math.max(late.presence, await running('media_report_presence'))
      late.guard = Math.max(late.guard, await running('voice_qualification_guard'))
      return pool.waitingCount === 0 && pool.idleCount >= heldCount && ownCount() <= 0
    })
    assert.deepEqual(
      [late, (await roomState(roomId, exchangeId, 0)).lastSeq, await ended()],
      [{ presence: 0, guard: 0 }, null, { state: 'open', reason: null }],
      'no late callback: no report, no guard',
    )
    const fresh = await attempt((signal) => voicedMedia().presence(principalReport(seq + 1), signal))
    assert.equal(fresh.answer, 'ok')
    assert.deepEqual(
      [(await roomState(roomId, exchangeId, 0)).lastSeq, await ended()],
      [seq + 1, { state: 'ended', reason: 'deadline' }],
    )
  })
})
