// INC04-S02a coherent: the worker's new-work installation hold on real PostgreSQL, with the worker's own login. Level:
// sql-run. The database is the earlier source's installation: this tree's migrations before 0109 except 0105 (0106,
// 0107 and 0108 included), a set no prefix can express; 0109 and later declare on 0105's objects, so that history never
// ran them without it. The rows come from the real producers: a research admission through the old
// same-signature SQL (as an earlier API binary would write it), and Stop commands (control.settle and native.stop,
// cleanup true). It shows:
// * a mixed batch: cleanup is dispatched, new work is held, its claimed state and lease kept as committed, with no
//   runtime command, reservation or recorded outcome, and a passing log line that says what happened;
// * the delayed recovery the existing SQL already gives: lease expiry (0004) → outcome_unknown → reconciliation (0053)
//   → pending a second later, only because no runtime command exists; then held again while 0105 stays missing;
// * a row that already has a runtime command (written by an earlier worker binary, then left outcome_unknown by a
//   SYNTHETIC fault the migration owner records) reconciles from that command and is never resent;
// * the real dispatcher loop over held work runs a bounded number of passes;
// * once the actual 0105 file is applied (its SQL directly, the old-SQL lifecycle; the API installation test owns the
//   real migrator's all-pending upgrade), the same held row is dispatched to its runtime.
// Everything is SYNTHETIC: no provider, account or route is qualified, and no real runtime runs.
// Fixture lifecycle (C15-F02): every pool is owned before its first use, and the database is dropped only after each
// client those pools connected has actually ended, a bounded wait after Pool.end() (which can resolve first).
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  admitGoalCommand,
  atomicAdmissionInstalled,
  claimRuntimeOutbox,
  createPool,
  dispatchRuntimeOutbox,
  recordRuntimeReady,
  runtimeHello,
  runtimeTokenHash,
  withActor,
  withService,
  type RuntimeCaller,
} from '@sophia/persistence'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import { dispatchOnce, RuntimeDispatcher } from './runtime-dispatch.ts'

const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations', import.meta.url))
const ATOMIC = '0105_contribution_atomic_admission.sql'
/** The end of the earlier source's history: 0109 is the first migration that declares on 0105's objects. */
const EARLIER_BOUNDARY = '0109'
const LEASE_SECONDS = 5 // the smallest lease claim_runtime_outbox accepts
const MD = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const QUESTION = { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] }

let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let owner: pg.Pool
// Teardown acts only on what setup actually made. A setup failure (a refused migration, say) is then the error
// reported, never masked by a teardown reading a handle it never created; every pool that exists is still ended, in
// order and with its own failure raised, before the database it was opened on is dropped.
let dir: string | undefined
let drop: (() => Promise<void>) | undefined
const opened: pg.Pool[] = []
const open = (pool: pg.Pool): pg.Pool => {
  opened.push(own(pool))
  return pool
}

/**
 * C15-F02: each owned pool's clients, by their actual end. At the pinned pg-pool 3.14.0, `Pool.end()` resolves once its
 * idle clients have left the pool's accounting, while each one's connection may still be closing (pg 8.23.0;
 * docs/SOURCE_MAP.md §2r); a FORCE drop in that window would terminate an owned backend. So a pool is registered before
 * its first use, through its public 'connect' event, and each client it connects records the promise of its own 'end'.
 */
const clientEnds = new WeakMap<pg.Pool, Promise<void>[]>()
function own(pool: pg.Pool): pg.Pool {
  const ends: Promise<void>[] = []
  pool.on('connect', (client) => {
    ends.push(new Promise((ended) => client.once('end', () => ended())))
  })
  clientEnds.set(pool, ends)
  return pool
}
/**
 * The fixture's release: end `pools` in order, wait at most `ms` for every client they connected to have actually ended,
 * then drop the database, then remove the directory. Nothing is caught: the first failure propagates (a client that
 * never ends fails it, loudly) and no later step runs, so the database is never dropped under a live owned client.
 */
async function releaseFixture(
  pools: pg.Pool[],
  dropDatabase: (() => Promise<void>) | undefined,
  linked: string | undefined,
  ms = 15_000,
): Promise<void> {
  for (const pool of pools) await pool.end()
  const ends = pools.map((pool) => {
    const recorded = clientEnds.get(pool)
    assert.ok(recorded, 'every pool released here was owned before its first use')
    return Promise.all(recorded)
  })
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      Promise.all(ends),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`the owned clients’ actual end: none within ${String(ms)} ms`)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
  if (dropDatabase !== undefined) await dropDatabase()
  if (linked !== undefined) rmSync(linked, { recursive: true, force: true })
}

before(async () => {
  const linked = mkdtempSync(join(tmpdir(), `sophia-before-${EARLIER_BOUNDARY}-without-0105-`))
  dir = linked
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql') && n < EARLIER_BOUNDARY && n !== ATOMIC))
    symlinkSync(join(MIGRATIONS, f), join(linked, f))
  db = await createTestDatabase(linked)
  drop = () => db.drop()
  api = open(createPool(db.apiUrl, { max: 4 }))
  worker = open(createPool(db.workerUrl, { max: 2 }))
  owner = open(new pg.Pool({ connectionString: db.ownerUrl, max: 2 }))
})
after(async () => {
  await releaseFixture(opened, drop, dir)
})

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> => (await owner.query(sql, params)).rows[0] as T
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A seeded project (its goal running, with no binding), an enabled research gate and a ready SYNTHETIC runtime. */
async function project() {
  const [ADMIN, EDIT] = [randomUUID(), randomUUID()]
  const seeded = await seedProject(db.ownerUrl, { admin: ADMIN, editors: [EDIT] })
  await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    seeded.projectId,
  ])
  const rt = await registerRuntime(db.ownerUrl, { projectId: seeded.projectId, admin: ADMIN })
  const who: RuntimeCaller = {
    tokenSha256: runtimeTokenHash(rt.token),
    runtimeUnitId: rt.runtimeUnitId,
    bridgeInstanceId: randomUUID(),
  }
  await withService(api, (c) =>
    runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] }),
  )
  await withService(api, (c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
  return { ...seeded, ADMIN, EDIT, who }
}
type Project = Awaited<ReturnType<typeof project>>

/** Research admitted through the old SQL directly, as an earlier API binary would (the maintained one refuses here). */
const admitOld = (p: Project) =>
  withActor(api, p.EDIT, 'write', async (c) => {
    const { rows } = await c.query<{ r: { taskId: string; goalId: string; attemptId: string } }>(
      `SELECT sophia.admit_research_task($1, $2, $3, $4, $5, $6) AS r`,
      [p.projectId, randomUUID(), randomUUID(), JSON.stringify(QUESTION), MD.id, MD.route],
    )
    return rows[0]!.r
  })

/** A Stop admitted by the project's admin on `goalId`, at the goal's current revision and epoch. */
async function stop(p: Project, goalId: string) {
  const g = await one<{ revision: string; authority_epoch: string }>(
    `SELECT revision, authority_epoch FROM sophia.goals WHERE project_id=$1 AND id=$2`,
    [p.projectId, goalId],
  )
  await withActor(api, p.ADMIN, 'write', (c) =>
    admitGoalCommand(c, p.projectId, randomUUID(), {
      kind: 'stop',
      goalId,
      expectedGoalRevision: Number(g.revision),
      expectedAuthorityEpoch: Number(g.authority_epoch),
      bodySourceId: null,
    }),
  )
}

type OutboxState = {
  id: string
  destination: string
  cleanup: boolean
  state: string
  lease_token: string | null
  leased: boolean
  attempts: number
  available_later: boolean
  commands: number
}
/** Every outbox row of a project, with its lease and the runtime commands written for it. */
const outbox = async (projectId: string) =>
  (
    await owner.query<OutboxState>(
      `SELECT o.id, o.destination, o.cleanup, o.state, o.lease_token::text, o.lease_until > clock_timestamp() AS leased,
              o.attempts, o.available_at > now() AS available_later,
              (SELECT count(*)::int FROM sophia.runtime_commands rc WHERE rc.project_id=o.project_id AND rc.outbox_id=o.id) AS commands
         FROM sophia.outbox o WHERE o.project_id=$1 ORDER BY o.created_at`,
      [projectId],
    )
  ).rows
const rowOf = async (projectId: string, id: string) => (await outbox(projectId)).find((r) => r.id === id)!
const reservationsOf = async (projectId: string) =>
  (
    await one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.research_reservations WHERE project_id=$1`, [
      projectId,
    ])
  ).n

/** Wait (bounded) until the row's lease has expired by the database's clock. */
async function untilLeaseExpired(projectId: string, id: string) {
  const deadline = Date.now() + (LEASE_SECONDS + 5) * 1000
  while ((await rowOf(projectId, id)).leased) {
    assert.ok(Date.now() < deadline, 'the lease expires within its seconds')
    await sleep(200)
  }
}

describe('the worker’s new-work hold where 0106 is installed without 0105 (coherent)', () => {
  let p: Project
  let held: string // the held create's outbox id
  const lines: string[] = []
  const pass = () =>
    dispatchOnce(worker, { workerId: 'coherent-worker', leaseSeconds: LEASE_SECONDS, log: (l) => lines.push(l) })

  it('dispatches cleanup and holds new work in one mixed batch, creating nothing for it', async () => {
    assert.equal(await atomicAdmissionInstalled(worker), false, 'the worker login reads 0105 missing')
    p = await project()
    const work = await admitOld(p) // new work: native.create, cleanup false
    const stopped = await admitOld(p)
    await stop(p, stopped.goalId) // native.stop for its binding (cleanup); its pending create is superseded
    await stop(p, p.goalId) // the seeded goal has no binding: control.settle (cleanup)
    const queued = await outbox(p.projectId)
    const pending = queued.filter((r) => r.state === 'pending')
    assert.deepEqual(
      pending.map((r) => `${r.destination}:${String(r.cleanup)}`).toSorted((x, y) => x.localeCompare(y)),
      ['control.settle:true', 'native.create:false', 'native.stop:true'],
      JSON.stringify(queued),
    )
    held = pending.find((r) => r.destination === 'native.create')!.id
    const initial = { reservations: await reservationsOf(p.projectId) }

    const result = await pass()
    assert.equal(result.held, 1)
    assert.equal(result.lost, 0, 'a hold is not a lost lease')
    const passed = await outbox(p.projectId)
    for (const r of passed.filter((x) => x.cleanup))
      assert.notEqual(r.state, 'dispatching', `cleanup ${r.destination} was dispatched and recorded: ${r.state}`)
    assert.equal(result.outcomes.length, 2, JSON.stringify(result.outcomes))
    const h = passed.find((r) => r.id === held)!
    assert.deepEqual(
      [h.state, h.lease_token !== null, h.leased, h.attempts, h.commands],
      ['dispatching', true, true, 1, 0],
      'held: the claim’s committed state and lease, and no runtime command',
    )
    assert.equal(await reservationsOf(p.projectId), initial.reservations, 'nothing reserved')
    const job = await one<{ state: string }>(`SELECT state FROM sophia.jobs WHERE id=$1`, [work.taskId])
    assert.equal(job.state, 'pending', 'the task never started')
    assert.ok(
      lines.some((l) => l.startsWith(`dispatch outbox ${held}: installation hold (0105 not installed)`)),
      lines.join('\n'),
    )
  })

  it('recovers only through the existing lifecycle: expiry, outcome_unknown, then pending because no command exists', async () => {
    await untilLeaseExpired(p.projectId, held)
    const result = await pass()
    assert.ok(result.expired >= 1, 'the expired lease was marked outcome_unknown')
    assert.ok(result.reconciled >= 1, 'and reconciled in the same pass')
    const r = await rowOf(p.projectId, held)
    assert.deepEqual(
      [r.state, r.lease_token, r.available_later, r.commands],
      ['pending', null, true, 0],
      'pending a second later, never resent: there is no command',
    )
    await sleep(1200)
    const again = await pass()
    assert.equal(again.held, 1, 'claimed again and held again while 0105 is missing')
    const r2 = await rowOf(p.projectId, held)
    assert.deepEqual([r2.state, r2.attempts, r2.commands], ['dispatching', 2, 0])
  })

  it('never resends a row that already has a runtime command: it reconciles from that command', async () => {
    const q = await project()
    await admitOld(q)
    // An earlier worker binary dispatched it (the old SQL, with no hold): one runtime command.
    for (const row of await claimRuntimeOutbox(worker, 'earlier-worker', 50, 30))
      if (row.project_id === q.projectId) await dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
    const [sent] = (await outbox(q.projectId)).filter((r) => r.destination === 'native.create')
    assert.ok(sent && sent.commands === 1, JSON.stringify(sent))
    // SYNTHETIC fault, recorded here: its result is left unknown, as a lease lost after the command was queued would.
    await owner.query(`UPDATE sophia.outbox SET state='outcome_unknown' WHERE project_id=$1 AND id=$2`, [
      q.projectId,
      sent.id,
    ])
    const result = await pass()
    assert.ok(result.reconciled >= 1)
    const r = await rowOf(q.projectId, sent.id)
    assert.deepEqual(
      [r.state, r.commands],
      ['acknowledged', 1],
      'reconciled from its command; nothing requeued or resent',
    )
  })

  it('runs a bounded number of real passes over held work: the loop waits instead of spinning', async () => {
    const window: string[] = []
    const dispatcher = new RuntimeDispatcher(worker, {
      workerId: 'coherent-loop',
      leaseSeconds: LEASE_SECONDS,
      idleMs: 200,
      log: (l) => window.push(l),
    })
    dispatcher.start()
    await sleep(7000)
    await dispatcher.stop()
    const holds = window.filter((l) => l.includes(`dispatch outbox ${held}: installation hold`)).length
    // One hold per lease cycle at most: within 7 s, a 5 s lease and its reconciliation allow two.
    assert.ok(holds <= 2, `${String(holds)} holds of ${held} in 7 s:\n${window.join('\n')}`)
    assert.equal((await rowOf(p.projectId, held)).commands, 0, 'never dispatched while 0105 is missing')
  })

  it('dispatches the same held row once the actual 0105 is installed, after its lease runs out', async () => {
    await owner.query(readFileSync(join(MIGRATIONS, ATOMIC), 'utf8'))
    assert.equal(await atomicAdmissionInstalled(worker), true)
    const deadline = Date.now() + 20_000
    while ((await rowOf(p.projectId, held)).commands === 0) {
      assert.ok(Date.now() < deadline, `dispatched within the lease and a reconciliation:\n${lines.join('\n')}`)
      await pass()
      await sleep(300)
    }
    const r = await rowOf(p.projectId, held)
    assert.deepEqual([r.state, r.commands], ['acknowledged', 1], 'one runtime command, queued once')
  })
})

/**
 * C15-R1-F03: a case's `body`, then always its one cleanup lifecycle (memoised by the case, so it never runs twice),
 * awaited before the case returns. The body's failure stays the reported error; a cleanup failure is never hidden:
 * alone it is thrown, beside a body failure both are thrown together, the body's failure as the cause.
 */
async function bodyThenCleanup(body: () => Promise<void>, cleanup: () => Promise<void>): Promise<void> {
  let failure: { error: unknown } | undefined
  try {
    await body()
  } catch (error) {
    failure = { error }
  }
  let cleanupFailure: { error: unknown } | undefined
  try {
    await cleanup()
  } catch (error) {
    cleanupFailure = { error }
  }
  if (cleanupFailure !== undefined) {
    if (failure === undefined || cleanupFailure.error === failure.error) throw cleanupFailure.error
    throw new AggregateError([failure.error, cleanupFailure.error], 'the case failed, and so did its cleanup', {
      cause: failure.error,
    })
  }
  if (failure !== undefined) throw failure.error
}
/** A pg.Client class whose end() waits for every `gate` (pg-pool's public `Client` option): a held owned client. */
function heldClient(...gates: Promise<void>[]) {
  return class HeldClient extends pg.Client {
    override end(): Promise<void>
    override end(callback: (err: Error) => void): void
    override end(callback?: (err: Error) => void): Promise<void> | undefined {
      const ended = Promise.all(gates).then(() => super.end())
      if (!callback) return ended
      void ended.then(() => (callback as () => void)())
      return undefined
    }
  }
}
interface CaseView {
  order: string[]
  marks: string[]
  pid: () => number | undefined
}

/**
 * A client whose end() is held, on this file's own database; the drop is recorded, not run, because the fixture still
 * needs it. The case's own release is started while the end is held, kept outside the body and awaited exactly once,
 * by the body or, after an early failure, by the cleanup after it opens the gate: the case never returns while that
 * client is alive, so the outer teardown cannot drop the database under it. `control` is for the F03 control only.
 */
async function heldEndCase(
  control: { failEarly?: boolean; hold?: Promise<void>; observe?: (view: CaseView) => void } = {},
): Promise<void> {
  const { promise: held, resolve: releaseHeld } = Promise.withResolvers<void>()
  const gates = control.hold === undefined ? [held] : [held, control.hold]
  const pool = own(new pg.Pool({ connectionString: db.ownerUrl, max: 1, Client: heldClient(...gates) }))
  const order: string[] = []
  const marks: string[] = []
  let pid: number | undefined
  control.observe?.({ order, marks, pid: () => pid })
  const end = pool.end.bind(pool)
  pool.end = async () => {
    await end()
    order.push('pool.end resolved')
  }
  const connected = async (backend: number) =>
    Number((await one<{ n: string }>('SELECT count(*) AS n FROM pg_stat_activity WHERE pid = $1', [backend])).n)
  let releasing: Promise<void> | undefined
  const release = () =>
    (releasing ??= releaseFixture(
      [pool],
      async () => {
        order.push(`drop with ${pid === undefined ? 'no' : String(await connected(pid))} owned backend`)
      },
      undefined,
    ).then(() => {
      order.push('released')
    }))
  await bodyThenCleanup(
    async () => {
      const client = await pool.connect()
      pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid
      client.release()
      assert.ok(pid)
      void release()
      const deadline = Date.now() + 5_000
      while (!order.includes('pool.end resolved')) {
        assert.ok(Date.now() < deadline, 'Pool.end resolves while its client’s end is held')
        await sleep(5)
      }
      if (control.failEarly === true) {
        marks.push('failed')
        throw new Error('SYNTHETIC early failure: while the release is in flight')
      }
      assert.equal(await connected(pid), 1, 'the owned backend is still connected')
      assert.deepEqual(order, ['pool.end resolved'], 'no drop, and the release has not finished')
      releaseHeld()
      await release()
      assert.deepEqual(order, ['pool.end resolved', 'drop with 0 owned backend', 'released'])
    },
    async () => {
      releaseHeld()
      await release()
    },
  )
}

describe('C15-F02: the fixture drops its database only after each owned client has actually ended', () => {
  it('Pool.end() resolves while a held client is still connected; the drop waits for that client’s actual end', async () => {
    await heldEndCase()
  })

  it('F03 control (SYNTHETIC): a held-end case failing mid-release does not return before the actual end', async () => {
    const { promise: hold, resolve: letGo } = Promise.withResolvers<void>()
    let view: CaseView | undefined
    let settled = false
    const running = heldEndCase({ failEarly: true, hold, observe: (v) => (view = v) }).finally(() => {
      settled = true
    })
    try {
      const deadline = Date.now() + 5_000
      while (view?.marks.includes('failed') !== true) {
        assert.ok(Date.now() < deadline, 'the case fails early')
        await sleep(5)
      }
      await sleep(200) // a bounded window in which an unsafe cleanup would have returned
      const v = view
      const pid = v.pid()
      assert.ok(pid)
      assert.equal(settled, false, 'the case has not returned while its owned client is held')
      assert.deepEqual(v.order, ['pool.end resolved'], 'no drop recorded yet')
      assert.equal(
        Number((await one<{ n: string }>('SELECT count(*) AS n FROM pg_stat_activity WHERE pid = $1', [pid])).n),
        1,
        'its owned backend is still connected',
      )
      letGo()
      await assert.rejects(running, /^Error: SYNTHETIC early failure: /, 'the original failure is the one reported')
      assert.deepEqual(v.order, ['pool.end resolved', 'drop with 0 owned backend', 'released'])
    } finally {
      letGo()
      await Promise.allSettled([running]) // the case's own outcome is asserted above; here it only must have finished
    }
  })

  it('a setup that made nothing releases nothing; a failing drop stays visible and no later step runs', async () => {
    await releaseFixture([], undefined, undefined)
    const linked = mkdtempSync(join(tmpdir(), 'sophia-c15-f02-drop-'))
    try {
      await assert.rejects(
        releaseFixture([], () => Promise.reject(new Error('SYNTHETIC drop failure')), linked),
        /^Error: SYNTHETIC drop failure$/,
      )
      assert.equal(existsSync(linked), true, 'the directory step after the failed drop did not run')
    } finally {
      rmSync(linked, { recursive: true, force: true })
    }
  })
})
