// The bridge's presence reports in its processes' order, and each process's own guest assertion (item 7 C of the PR #190
// review; root's option (b), refined; migration 0052 and the presence-order amendment, provisional numbers), level:
// sql-run. The bridge's calls run on the API's login with no actor, as withService runs them. Interleavings are driven by
// explicit transactions on separate connections, and each wait is a real Lock wait read from pg_stat_activity: there are
// no sleeps. A process's 30 s of silence is simulated by moving its assertion's time back, as the owner.
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  controlExchange,
  createPool,
  readLivePresence,
  readSnapshot,
  reportPresence,
  startExchange,
  withActor,
  withService,
  type PresenceReport,
} from './index.ts'

let db: TestDatabase
let pool: pg.Pool

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 8 })
})
after(async () => {
  await pool.end()
  await db.drop()
})

/** Transactions a test opened and has not finished: rolled back after each test, newest first, whatever its outcome. */
const unfinished: Array<() => Promise<void>> = []
afterEach(async () => {
  for (let end = unfinished.pop(); end; end = unfinished.pop()) await end()
})

/** A time as fixed-width UTC text to the microsecond, so that text order is time order. */
const T = (x: string) => `to_char((${x}) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')`

/** A transaction begun now on `c`: its pid and its now(); `commit()` ends it, and an unfinished one is rolled back. */
async function begun<C extends pg.ClientBase>(c: C, release: () => Promise<void> | void) {
  await c.query('BEGIN')
  const r = await c.query<{ pid: number; now: string }>(`SELECT pg_backend_pid() AS pid, ${T('now()')} AS now`)
  let done = false
  const finish = async (how: 'COMMIT' | 'ROLLBACK') => {
    if (done) return
    done = true
    try {
      await c.query(how)
    } finally {
      await release()
    }
  }
  unfinished.push(() => finish('ROLLBACK').catch(() => undefined))
  return { c, pid: r.rows[0]!.pid, now: r.rows[0]!.now, commit: () => finish('COMMIT') }
}

async function owner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

const ownerQuery = (sql: string, params: unknown[]) => owner((c) => c.query(sql, params))

/** Whether backend `pid` waits on a lock (pg_stat_activity), within 5 s: the interleaving is real, not assumed. */
async function blocked(pid: number): Promise<boolean> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const w = await owner(
      async (c) =>
        (await c.query<{ w: string | null }>(`SELECT wait_event_type AS w FROM pg_stat_activity WHERE pid=$1`, [pid]))
          .rows[0]?.w,
    )
    if (w === 'Lock') return true
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return false
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof DomainError ? err.code : `raw:${String(err)}`
  }
}

const A = randomUUID() // the admin, a member in the room
const G = randomUUID() // a guest
const member = { identity: A, standing: 'admin' }
const guest = { identity: G, standing: 'guest' }

/** A project with its room and an exchange the admin opened, and how to report for that room. */
async function fixture() {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A })
  const snap = await withActor(pool, A, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  const roomId = snap.room.id
  const { exchangeId } = await withActor(pool, A, 'write', (c) =>
    startExchange(c, roomId, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  /** Process `instance`'s report: reportSeq `seq` (null: none, as a bridge before 0052), and what it saw. */
  const report = (
    instance: string,
    seq: number | null,
    saw: Partial<Pick<PresenceReport, 'voice' | 'participants' | 'exchangeId'>> = {},
  ): PresenceReport => ({
    roomId,
    exchangeId,
    bridgeInstanceId: instance,
    voice: 'ready',
    reason: null,
    participants: [member],
    ...saw,
    ...(seq === null ? {} : { reportSeq: seq }),
  })
  const send = (r: PresenceReport) => withService(pool, (c) => reportPresence(c, r))
  /** A bridge's transaction on the API's login, begun now (no actor, as withService). */
  const serviceTx = async () => {
    const c = await pool.connect()
    return begun(c, () => c.release())
  }
  /** The operator's transaction (the migration owner), begun now. */
  const ownerTx = async () => {
    const c = new pg.Client({ connectionString: db.ownerUrl })
    await c.connect()
    return begun(c, () => c.end())
  }
  /** Everything a report may change, as the owner reads it (times as text, to the microsecond). */
  const state = () =>
    owner(async (c) => {
      const presence = await c.query(
        `SELECT exchange_id, bridge_instance, voice, reason, guests_present, participants,
                ${T('reported_at')} AS reported_at, ${T('empty_since')} AS empty_since
           FROM sophia.room_ai_presence WHERE room_id=$1`,
        [roomId],
      )
      const processes = await c.query(
        // 0052's columns read through to_jsonb, so a database without them answers null rather than an error.
        `SELECT bridge_instance, ${T('reported_at')} AS reported_at, to_jsonb(r)->>'last_seq' AS last_seq,
                to_jsonb(r)->'guests_present' AS guests_present,
                ${T("(to_jsonb(r)->>'guests_at')::timestamptz")} AS guests_at
           FROM sophia.room_bridge_reports r WHERE room_id=$1 ORDER BY bridge_instance`,
        [roomId],
      )
      const exchange = await c.query(
        `SELECT state, pause_reason, revision::text, ${T('ended_at')} AS ended_at FROM sophia.room_exchanges WHERE id=$1`,
        [exchangeId],
      )
      const events = await c.query<{ summary_code: string }>(
        `SELECT summary_code FROM sophia.project_events WHERE project_id=$1 ORDER BY sequence`,
        [projectId],
      )
      return {
        presence: presence.rows[0] as Record<string, unknown> | undefined,
        processes: processes.rows as Array<Record<string, unknown>>,
        exchange: exchange.rows[0] as Record<string, unknown> | undefined,
        events: events.rows.map((e) => e.summary_code),
      }
    })
  const processRow = async (instance: string) => (await state()).processes.find((p) => p.bridge_instance === instance)
  /** Move process `instance`'s guest assertion back by `age` (a SQL interval): its silence since. */
  const silentFor = (instance: string, age: string) =>
    ownerQuery(
      `UPDATE sophia.room_bridge_reports SET guests_at=guests_at-$3::interval WHERE room_id=$1 AND bridge_instance=$2`,
      [roomId, instance, age],
    )
  const emptyFor = (age: string) =>
    ownerQuery(`UPDATE sophia.room_ai_presence SET empty_since=now()-$2::interval WHERE room_id=$1`, [roomId, age])
  const resume = () => codeOf(withActor(pool, A, 'write', (c) => controlExchange(c, exchangeId, 'resume', null)))
  /** What a member sees: the snapshot's Sophia and the room's live presence. */
  const seen = async () => {
    const now = await withActor(pool, A, 'read', (c) => readSnapshot(c, projectId))
    const live = await withActor(pool, A, 'read', (c) => readLivePresence(c, roomId))
    return {
      voice: now?.room.sophia.voice,
      exchange: now?.room.sophia.exchange,
      pauseReason: now?.room.sophia.pauseReason,
      participants: live.participants,
      guests: live.guests,
    }
  }
  return {
    projectId,
    roomId,
    exchangeId,
    report,
    send,
    serviceTx,
    ownerTx,
    state,
    processRow,
    silentFor,
    emptyFor,
    resume,
    seen,
  }
}

describe('a process’s reports apply in its sequence’s order (0052)', () => {
  it('N+1 holds the project’s lock and N waits for it: once N+1 commits, N changes nothing (lock order 1)', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-a', 1, { voice: 'connecting' }))
    const n1 = await f.serviceTx()
    await reportPresence(n1.c, f.report('bridge-a', 3, { participants: [member, guest] }))
    const n1Read = (await n1.c.query<{ t: string }>(`SELECT ${T('clock_timestamp()')} AS t`)).rows[0]!.t
    const n = await f.serviceTx()
    const late = reportPresence(n.c, f.report('bridge-a', 2, { voice: 'recovering', participants: [] }))
    assert.equal(await blocked(n.pid), true, 'N waits for the lock N+1 holds')
    await n1.commit()
    await late
    await n.commit()
    const s = await f.state()
    assert.deepEqual(
      [s.presence?.voice, s.presence?.guests_present, s.presence?.participants, s.presence?.empty_since],
      ['ready', true, [member, guest], null],
      'the room as N+1 saw it',
    )
    const a = s.processes.find((p) => p.bridge_instance === 'bridge-a')
    assert.equal(a?.last_seq, '3', 'last_seq is N+1’s')
    assert.equal(s.presence?.reported_at, a?.reported_at, 'one reading')
    assert.ok(String(a?.reported_at) < n1Read, 'N+1’s own reading, from before it committed: N stamped nothing')
    assert.deepEqual([s.exchange?.state, s.exchange?.pause_reason], ['paused', 'guest'])
    assert.ok(!s.events.includes('room.sophia_recovering'), 'no event of N’s')
    assert.deepEqual(await f.seen(), {
      voice: 'ready',
      exchange: 'paused',
      pauseReason: 'guest',
      participants: 2,
      guests: 1,
    })
  })

  it('N holds the lock and N+1 waits: N applies, then N+1 does; the room is N+1’s (lock order 2)', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-a', 1, { voice: 'connecting' }))
    const n = await f.serviceTx()
    await reportPresence(n.c, f.report('bridge-a', 2, { voice: 'recovering', participants: [] }))
    const n1 = await f.serviceTx()
    const next = reportPresence(n1.c, f.report('bridge-a', 3, { participants: [member, guest] }))
    assert.equal(await blocked(n1.pid), true, 'N+1 waits for the lock N holds')
    await n.commit()
    await next
    await n1.commit()
    const s = await f.state()
    assert.deepEqual(
      [s.presence?.voice, s.presence?.guests_present, s.presence?.participants],
      ['ready', true, [member, guest]],
    )
    assert.equal(s.processes.find((p) => p.bridge_instance === 'bridge-a')?.last_seq, '3')
    assert.ok(s.events.includes('room.sophia_recovering'), 'N applied first, as it held the lock')
    assert.equal(s.events.at(-1), 'room.sophia_ready', 'then N+1')
  })

  it('N released after N+1 committed (the bridge cut N’s request) changes nothing at all; nor does N+1 sent again', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-a', 2, { voice: 'connecting', participants: [] }))
    await f.send(f.report('bridge-a', 3, { participants: [member, guest] }))
    const before3 = await f.state()
    const seen3 = await f.seen()
    await f.send(f.report('bridge-a', 2, { voice: 'recovering', participants: [] }))
    assert.deepEqual(await f.state(), before3, 'N: no presence, liveness, assertion, pause, end, empty_since, event')
    await f.send(f.report('bridge-a', 3, { voice: 'recovering', participants: [member] }))
    assert.deepEqual(await f.state(), before3, 'the same number again: nothing either')
    assert.deepEqual(await f.seen(), seen3, 'what a member sees is N+1’s')
  })

  it('a stale report neither pauses, clears a guest, nor ends an empty room; a fresh one does (control)', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-a', 5))
    let untouched = await f.state()
    await f.send(f.report('bridge-a', 4, { participants: [member, guest] }))
    assert.deepEqual(await f.state(), untouched, 'no pause, no guest')
    assert.equal(untouched.exchange?.state, 'open')

    await f.send(f.report('bridge-a', 6, { participants: [] }))
    await f.emptyFor('10 minutes')
    untouched = await f.state()
    await f.send(f.report('bridge-a', 6, { participants: [] }))
    assert.deepEqual(await f.state(), untouched, 'no end, empty_since as it was')
    await f.send(f.report('bridge-a', 7, { participants: [] }))
    assert.equal((await f.state()).exchange?.state, 'ended', 'control: the next number ends it')

    const g = await fixture()
    await g.send(g.report('bridge-a', 2, { participants: [member, guest] }))
    untouched = await g.state()
    await g.send(g.report('bridge-a', 1, { participants: [member] }))
    assert.deepEqual(await g.state(), untouched, 'the guest is not cleared')
    assert.equal(await g.resume(), 'invalid_state', 'and Sophia does not resume')
  })
})

describe('one clock reading per accepted report, after the project’s lock (0052)', () => {
  it('the report’s stamps are one reading, taken once it holds the lock: never its transaction’s start', async () => {
    const f = await fixture()
    const r = await f.serviceTx()
    const op = await f.ownerTx()
    await op.c.query(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`, [f.projectId])
    const waiting = reportPresence(r.c, f.report('bridge-a', 1, { participants: [] }))
    assert.equal(await blocked(r.pid), true, 'the report waits for the operator’s lock')
    const released = (await op.c.query<{ t: string }>(`SELECT ${T('clock_timestamp()')} AS t`)).rows[0]!.t
    await op.commit()
    await waiting
    await r.commit()
    const s = await f.state()
    const a = s.processes.find((p) => p.bridge_instance === 'bridge-a')
    assert.deepEqual(
      [s.presence?.reported_at, a?.guests_at, s.presence?.empty_since],
      [a?.reported_at, a?.reported_at, a?.reported_at],
      'reported_at, the assertion’s time and the empty count’s start are one reading',
    )
    assert.ok(String(a?.reported_at) > released, 'taken after the lock was released')
    assert.ok(String(a?.reported_at) > r.now, 'not the transaction’s start')
  })

  it('the 30 s guest horizon is measured from that reading, not from the transaction’s start', async () => {
    for (const [age, expected] of [
      ['30 seconds', false],
      ['29 seconds', true],
    ] as const) {
      const f = await fixture()
      await f.send(f.report('bridge-a', 1, { participants: [member, guest] }))
      assert.equal((await f.processRow('bridge-a'))?.guests_present, true, 'A asserted its guest')
      const b = await f.serviceTx()
      const op = await f.ownerTx()
      await op.c.query(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`, [f.projectId])
      const waiting = reportPresence(b.c, f.report('bridge-b', 1))
      assert.equal(await blocked(b.pid), true)
      // A's assertion is now `age` old: older than 30 s at B's reading, but not at B's transaction's start (for 30 s).
      await op.c.query(
        `UPDATE sophia.room_bridge_reports SET guests_at=clock_timestamp()-$3::interval
          WHERE room_id=$1 AND bridge_instance=$2`,
        [f.roomId, 'bridge-a', age],
      )
      await op.commit()
      await waiting
      await b.commit()
      assert.equal((await f.state()).presence?.guests_present, expected, `A’s assertion ${age} old at B’s reading`)
    }
  })
})

describe('each process’s own guest assertion (root’s option (b), refined)', () => {
  it('A, B and C overlap: B and C never clear, refresh or extend A’s assertion; A’s own later report clears it', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-a', 1, { participants: [member, guest] }))
    const a = await f.processRow('bridge-a')
    assert.deepEqual([a?.guests_present, (await f.state()).exchange?.state], [true, 'paused'])
    await f.send(f.report('bridge-b', 1, { participants: [member] }))
    await f.send(f.report('bridge-c', 7, { participants: [member] }))
    await f.send(f.report('bridge-b', 2, { participants: [] }))
    const s = await f.state()
    assert.deepEqual(
      s.processes.find((p) => p.bridge_instance === 'bridge-a'),
      a,
      'A’s row exactly as A left it',
    )
    assert.deepEqual(
      [s.presence?.guests_present, s.presence?.empty_since, s.exchange?.state],
      [true, null, 'paused'],
      'the room still has A’s guest: not empty, still paused',
    )
    assert.equal(await f.resume(), 'invalid_state', 'and Sophia does not resume')
    await f.send(f.report('bridge-a', 2, { participants: [member] }))
    assert.equal((await f.state()).presence?.guests_present, false, 'A’s own report cleared it; B and C see none')
    assert.equal(await f.resume(), 'resolved', 'member-only again: she resumes')
  })

  it('a third process: either process’s own guest holds the room until that process clears it', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-a', 1, { participants: [member, guest] }))
    await f.send(f.report('bridge-b', 1, { participants: [guest] }))
    await f.send(f.report('bridge-a', 2, { participants: [member] }))
    assert.equal((await f.state()).presence?.guests_present, true, 'B still sees its guest')
    await f.send(f.report('bridge-c', 1, { participants: [] }))
    assert.equal((await f.state()).presence?.guests_present, true, 'C cannot clear B’s')
    await f.send(f.report('bridge-b', 2, { participants: [] }))
    assert.equal((await f.state()).presence?.guests_present, false, 'B cleared its own')
  })

  it('an assertion stops counting 30 s after it was made: a process gone silent stops holding the room', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-a', 1, { participants: [member, guest] }))
    assert.equal((await f.processRow('bridge-a'))?.guests_present, true, 'A asserted its guest')
    await f.silentFor('bridge-a', '29 seconds')
    const a = await f.processRow('bridge-a')
    await f.send(f.report('bridge-b', 1))
    assert.equal((await f.state()).presence?.guests_present, true, '29 s: still fresh')
    assert.deepEqual(await f.processRow('bridge-a'), a, 'B did not extend it')
    await f.silentFor('bridge-a', '2 seconds')
    await f.send(f.report('bridge-b', 2))
    assert.equal((await f.state()).presence?.guests_present, false, '31 s: expired, and the room is member-only')
    assert.equal(await f.resume(), 'resolved')
  })

  it('the guest aggregate keeps an empty report from counting, or ending, the room while another process sees a guest', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-a', 1, { participants: [member, guest] }))
    assert.equal((await f.processRow('bridge-a'))?.guests_present, true, 'A asserted its guest')
    await f.send(f.report('bridge-b', 1, { participants: [] }))
    assert.equal((await f.state()).presence?.empty_since, null, 'not empty: A sees a guest')
    await f.emptyFor('10 minutes')
    await f.send(f.report('bridge-b', 2, { participants: [] }))
    const s = await f.state()
    assert.deepEqual([s.exchange?.state, s.presence?.empty_since], ['paused', null], 'not ended')
    await f.silentFor('bridge-a', '31 seconds')
    await f.send(f.report('bridge-b', 3, { participants: [] }))
    assert.notEqual(
      (await f.state()).presence?.empty_since,
      null,
      'control: once A’s assertion expired, the count starts',
    )
    await f.emptyFor('10 minutes')
    await f.send(f.report('bridge-b', 4, { participants: [] }))
    assert.equal((await f.state()).exchange?.state, 'ended', 'and an empty room ends')
  })
})

describe('reports without reportSeq (a bridge before 0052): applied as before, within bounds', () => {
  it('a process that never sent a sequence: each report applied in arrival order, its assertion its own', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-old', null, { participants: [member, guest] }))
    await f.send(f.report('bridge-old', null, { voice: 'recovering', participants: [member, guest] }))
    let s = await f.state()
    assert.deepEqual([s.presence?.voice, s.presence?.guests_present], ['recovering', true])
    assert.equal(s.processes.find((p) => p.bridge_instance === 'bridge-old')?.last_seq, null)
    await f.send(f.report('bridge-new', 1, { participants: [member] }))
    assert.equal((await f.state()).presence?.guests_present, true, 'a sequenced process cannot clear its guest')
    await f.send(f.report('bridge-old', null, { participants: [member] }))
    s = await f.state()
    assert.equal(s.presence?.guests_present, false, 'its own later report clears it')
  })

  it('once a process has sent a sequence, a report of its without one changes nothing', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-a', 1, { participants: [member, guest] }))
    const untouched = await f.state()
    await f.send(f.report('bridge-a', null, { voice: 'unavailable', participants: [] }))
    assert.deepEqual(await f.state(), untouched)
  })

  it('a process may start numbering its reports: its first sequenced report applies, at any number', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-a', null, { voice: 'connecting' }))
    await f.send(f.report('bridge-a', 41))
    const s = await f.state()
    assert.deepEqual(
      [s.presence?.voice, s.processes.find((p) => p.bridge_instance === 'bridge-a')?.last_seq],
      ['ready', '41'],
    )
  })
})

describe('authority and validation (0052)', () => {
  it('a member is never the bridge: refused, and nothing changes', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-a', 1))
    const untouched = await f.state()
    assert.equal(
      await codeOf(
        withActor(pool, A, 'write', (c) => reportPresence(c, f.report('bridge-a', 2, { participants: [] }))),
      ),
      'forbidden',
    )
    assert.deepEqual(await f.state(), untouched)
  })

  it('reportSeq is an integer from 1 to 9007199254740991; anything else is refused (22023) and changes nothing', async () => {
    const f = await fixture()
    await f.send(f.report('bridge-a', 1))
    const untouched = await f.state()
    for (const bad of [0, -1, 1.5, 9007199254740992, '2', null, true]) {
      const sent = { ...f.report('bridge-a', null), reportSeq: bad } as unknown as PresenceReport
      assert.equal(await codeOf(f.send(sent)), 'invalid_request', JSON.stringify(bad))
    }
    assert.deepEqual(await f.state(), untouched)
    await f.send(f.report('bridge-a', 9007199254740991))
    assert.equal((await f.processRow('bridge-a'))?.last_seq, '9007199254740991', 'the bound itself is a number')
    await f.send(f.report('bridge-a', 9007199254740991, { participants: [] }))
    assert.equal((await f.state()).presence?.empty_since, null, 'and nothing is above it')
  })

  it('the aggregate and each process’s assertion are the service’s: neither the API’s login nor PUBLIC reads them', async () => {
    const rights = await owner(
      async (c) =>
        (
          await c.query<{ group: boolean; login: boolean; pub: boolean; rows: boolean }>(
            `SELECT has_function_privilege('sophia_api',to_regprocedure('sophia.room_guests_asserted(uuid,timestamptz)'),'EXECUTE') AS group,
                    has_function_privilege($1,to_regprocedure('sophia.room_guests_asserted(uuid,timestamptz)'),'EXECUTE') AS login,
                    NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('sophia.room_guests_asserted(uuid,timestamptz)'))
                     OR EXISTS(SELECT 1 FROM pg_proc, aclexplode(coalesce(proacl, acldefault('f', proowner))) x
                            WHERE oid=to_regprocedure('sophia.room_guests_asserted(uuid,timestamptz)')
                              AND x.grantee=0) AS pub,
                    has_table_privilege($1,'sophia.room_bridge_reports','SELECT') AS rows`,
            [db.apiRole],
          )
        ).rows[0],
    )
    assert.deepEqual(rights, { group: false, login: false, pub: false, rows: false })
  })
})

describe('at the migration: 0052 applied to a database that already has reports', () => {
  it('the room’s last reporting process keeps its assertion, at its own report’s time, never refreshed; another has none until it reports', async () => {
    const migrations = fileURLToPath(new URL('../../../db/migrations', import.meta.url))
    const presenceOrder = '0052_presence_order.sql'
    const dir = mkdtempSync(join(tmpdir(), 'sophia-no-0052-'))
    for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql') && f !== presenceOrder))
      copyFileSync(join(migrations, file), join(dir, file))
    const before0052 = await createTestDatabase(dir)
    const api = createPool(before0052.apiUrl, { max: 2 })
    const asOwner = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => {
      const c = new pg.Client({ connectionString: before0052.ownerUrl })
      await c.connect()
      try {
        return (await c.query<T>(sql, params)).rows
      } finally {
        await c.end()
      }
    }
    try {
      const { projectId } = await seedProject(before0052.ownerUrl, { admin: A })
      const snap = await withActor(api, A, 'read', (c) => readSnapshot(c, projectId))
      assert.ok(snap)
      const roomId = snap.room.id
      const { exchangeId } = await withActor(api, A, 'write', (c) =>
        startExchange(c, roomId, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
      )
      const legacy = (instance: string, participants: PresenceReport['participants'], reportSeq?: number) =>
        withService(api, (c) =>
          reportPresence(c, {
            roomId,
            exchangeId,
            bridgeInstanceId: instance,
            voice: 'ready',
            reason: null,
            participants,
            ...(reportSeq === undefined ? {} : { reportSeq }),
          }),
        )
      await legacy('bridge-b', [member])
      await legacy('bridge-a', [member, guest])
      const [last] = await asOwner<{ at: string }>(
        `SELECT ${T('reported_at')} AS at FROM sophia.room_ai_presence WHERE room_id=$1`,
        [roomId],
      )
      await asOwner(readFileSync(join(migrations, presenceOrder), 'utf8'))
      const rows = await asOwner(
        `SELECT bridge_instance, guests_present, ${T('guests_at')} AS guests_at, last_seq
           FROM sophia.room_bridge_reports WHERE room_id=$1 ORDER BY bridge_instance`,
        [roomId],
      )
      assert.deepEqual(rows, [
        { bridge_instance: 'bridge-a', guests_present: true, guests_at: last?.at, last_seq: null },
        { bridge_instance: 'bridge-b', guests_present: null, guests_at: null, last_seq: null },
      ])
      await legacy('bridge-b', [member], 1)
      const [room] = await asOwner<{ guests: boolean }>(
        `SELECT guests_present AS guests FROM sophia.room_ai_presence WHERE room_id=$1`,
        [roomId],
      )
      assert.equal(room?.guests, true, 'B, now numbering its reports, cannot clear the guest A asserted before 0052')
    } finally {
      await api.end()
      await before0052.drop()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
