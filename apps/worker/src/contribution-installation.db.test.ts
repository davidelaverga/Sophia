// INC04-S02a coherent: the worker's new-work installation hold on real PostgreSQL, with the worker's own login. Level:
// sql-run. The database is the earlier source's installation: every migration of this tree except 0105 (0106
// included), a set no prefix can express. The rows come from the real producers: a research admission through the old
// same-signature SQL (as an earlier API binary would write it), and Stop commands (control.settle and native.stop,
// cleanup true). It shows:
// * a mixed batch: cleanup is dispatched, new work is held, its claimed state and lease kept as committed, with no
//   runtime command, reservation or recorded outcome, and a passing log line that says what happened;
// * the delayed recovery the existing SQL already gives: lease expiry (0004) → outcome_unknown → reconciliation (0053)
//   → pending a second later, only because no runtime command exists; then held again while 0105 stays missing;
// * a row that already has a runtime command (written by an earlier worker binary, then left outcome_unknown by a
//   SYNTHETIC fault the migration owner records) reconciles from that command and is never resent;
// * the real dispatcher loop over held work runs a bounded number of passes;
// * once the actual 0105 file is applied, the same held row is dispatched to its runtime.
// Everything is SYNTHETIC: no provider, account or route is qualified, and no real runtime runs.
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
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
const LEASE_SECONDS = 5 // the smallest lease claim_runtime_outbox accepts
const MD = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const QUESTION = { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] }

let dir: string
let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let owner: pg.Pool

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sophia-without-0105-'))
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql') && n !== ATOMIC))
    symlinkSync(join(MIGRATIONS, f), join(dir, f))
  db = await createTestDatabase(dir)
  api = createPool(db.apiUrl, { max: 4 })
  worker = createPool(db.workerUrl, { max: 2 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
})
after(async () => {
  await api.end()
  await worker.end()
  await owner.end()
  await db.drop()
  rmSync(dir, { recursive: true, force: true })
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
