// S1-02 race suite required by docs/pack/db/README.md ("Before declaring S1-02 complete…"):
// two competing publishers, cross-project composite keys, lease expiry during an actual HTTP call,
// grant revocation while queued and source-withdrawal races. Two real connections wherever the
// race needs them (level: sql-run).
import { createHash, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { GoalCommand } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type SeededProject, type TestDatabase } from '@sophia/test-support'
import {
  admitGoalCommand,
  claimOutbox,
  createPool,
  expireDispatchLeases,
  recordDispatchResult,
  withActor,
} from './index.ts'

const A = randomUUID() // admin
const B = randomUUID() // editor

let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const review = (s: SeededProject, over: Partial<GoalCommand> = {}): GoalCommand => ({
  kind: 'request_review',
  goalId: s.goalId,
  expectedGoalRevision: 1,
  expectedAuthorityEpoch: 1,
  bodySourceId: null,
  ...over,
})
const admit = (actor: string, s: SeededProject, cmd: GoalCommand) =>
  withActor(api, actor, 'write', (c) => admitGoalCommand(c, s.projectId, randomUUID(), cmd))
const claimedFor = async (projectId: string) =>
  (await claimOutbox(worker, `w-${randomUUID()}`, 50, 60)).filter((r) => r.project_id === projectId)
const stateOf = (projectId: string, id: string) =>
  owner((c) => c.query(`SELECT state FROM sophia.outbox WHERE project_id = $1 AND id = $2`, [projectId, id])).then(
    (r) => r.rows[0].state as string,
  )

const withdraw = (c: pg.ClientBase, s: SeededProject) =>
  c.query(`UPDATE sophia.source_objects SET eligible = false WHERE project_id = $1 AND id = $2`, [
    s.projectId,
    s.sourceId,
  ])
const publish = (c: pg.ClientBase, s: SeededProject, version: string, expectedStable: string | null) =>
  c.query(`SELECT sophia.publish_candidate($1, $2, $3, 1, 1) AS id`, [s.projectId, version, expectedStable])

/** A pooled API connection, or a dedicated migration-owner connection when `pool` is null. */
async function connect(pool: pg.Pool | null): Promise<{ c: pg.ClientBase; done: () => Promise<void> }> {
  if (pool) {
    const c = await pool.connect()
    return {
      c,
      done: () => {
        c.release()
        return Promise.resolve()
      },
    }
  }
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  return { c, done: () => c.end() }
}

/** A connection holding an open transaction as `actor` (or as the owner when actor is null). */
async function openTx(pool: pg.Pool | null, actor: string | null) {
  const { c, done } = await connect(pool)
  await c.query('BEGIN')
  if (actor) await c.query("SELECT set_config('sophia.actor_id', $1, true)", [actor])
  const close = async (sql: 'COMMIT' | 'ROLLBACK') => {
    await c.query(sql)
    await done()
  }
  return { c, commit: () => close('COMMIT'), rollback: () => close('ROLLBACK') }
}

/** Resolve `p` while recording whether it was still pending after `ms` (proves it was blocked). */
async function blockedFor<T>(p: Promise<T>, ms = 300): Promise<{ wasBlocked: boolean; result: Promise<T> }> {
  let settled = false
  const result = p.finally(() => {
    settled = true
  })
  result.catch(() => undefined)
  await sleep(ms)
  return { wasBlocked: !settled, result }
}

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, 6)
  worker = createPool(db.workerUrl, 3)
})
after(async () => {
  await api?.end()
  await worker?.end()
  await db?.drop()
})

describe('grant revocation while queued', () => {
  it('does not dispatch a queued command after its author loses edit rights', async () => {
    const s = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    await admit(B, s, review(s))
    await owner((c) =>
      c.query(`UPDATE sophia.project_members SET active = false WHERE project_id = $1 AND actor_id = $2`, [
        s.projectId,
        B,
      ]),
    )
    assert.deepEqual(await claimedFor(s.projectId), [])
    // Control: the same row is claimable once the grant is back, so membership was the only gate.
    await owner((c) =>
      c.query(`UPDATE sophia.project_members SET active = true WHERE project_id = $1 AND actor_id = $2`, [
        s.projectId,
        B,
      ]),
    )
    assert.deepEqual(
      (await claimedFor(s.projectId)).map((r) => r.destination),
      ['lead.review'],
    )
  })

  it('still dispatches cleanup (Stop) from a revoked author, so stopping is never blocked', async () => {
    const s = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    await admit(B, s, { ...review(s), kind: 'stop' })
    await owner((c) =>
      c.query(`UPDATE sophia.project_members SET active = false WHERE project_id = $1 AND actor_id = $2`, [
        s.projectId,
        B,
      ]),
    )
    assert.deepEqual(
      (await claimedFor(s.projectId)).map((r) => [r.destination, r.cleanup]),
      [['control.settle', true]],
    )
  })
})

describe('source withdrawal', () => {
  it('never dispatches a queued steer whose brief source was withdrawn', async () => {
    const s = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    await admit(A, s, review(s, { kind: 'steer', bodySourceId: s.sourceId }))
    await owner((c) => withdraw(c, s))
    assert.deepEqual(await claimedFor(s.projectId), [])
  })

  it('never dispatches a steer admitted while an unlocked withdrawal was committing', async () => {
    const s = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    const w = await openTx(null, null)
    await withdraw(w.c, s) // row-locks the source only, not the project (breaks the lock order)
    const receipt = await admit(A, s, review(s, { kind: 'steer', bodySourceId: s.sourceId })) // sees the committed "eligible" state
    await w.commit()
    assert.equal(receipt.stage, 'admitted') // the admission itself slipped through the race…
    assert.deepEqual(await claimedFor(s.projectId), []) // …but its dispatch is refused
  })

  it('serializes a withdrawal that follows the project lock order: the admission waits, then fails', async () => {
    const s = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    const w = await openTx(null, null)
    await w.c.query(`SELECT 1 FROM sophia.projects WHERE id = $1 FOR UPDATE`, [s.projectId])
    await withdraw(w.c, s)
    const pending = await blockedFor(admit(A, s, review(s, { kind: 'steer', bodySourceId: s.sourceId })))
    assert.equal(pending.wasBlocked, true)
    await w.commit()
    assert.equal(await codeOf(pending.result), 'source_ineligible')
  })
})

describe('lease expiry during an actual HTTP call', () => {
  let slow: Server
  let url: string
  before(async () => {
    // Stand-in for a native endpoint that answers after the lease has expired.
    slow = createServer((_req, res) => setTimeout(() => res.end('ok'), 6500))
    await new Promise<void>((r) => slow.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(slow.address() as AddressInfo).port}/send`
  })
  after(() => new Promise<void>((r) => slow.close(() => r())))

  it(
    'turns the row into outcome_unknown, never re-dispatches it, and refuses the late result',
    { timeout: 20_000 },
    async () => {
      const s = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
      await admit(A, s, review(s))
      const [row] = (await claimOutbox(worker, 'worker-1', 50, 5)).filter((r) => r.project_id === s.projectId)
      assert.equal(row?.state, 'dispatching')

      const call = fetch(url, { method: 'POST' }) // the real HTTP call outlives the 5 s lease
      await sleep(5500)
      assert.ok((await expireDispatchLeases(worker)) >= 1)
      assert.equal(await stateOf(s.projectId, row!.id), 'outcome_unknown')
      assert.deepEqual(await claimedFor(s.projectId), []) // no blind retry of an unknown effect

      assert.equal((await call).status, 200) // the native side may well have acted…
      assert.equal(
        await codeOf(recordDispatchResult(worker, s.projectId, row!.id, row!.lease_token!, 'acknowledged')),
        'invalid_state',
      )
      assert.equal(await stateOf(s.projectId, row!.id), 'outcome_unknown') // …so it stays unknown until reconciled
    },
  )

  it('records a result only once, and only with the token that holds the live lease', async () => {
    const s = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    await admit(A, s, review(s))
    const [row] = (await claimOutbox(worker, 'worker-2', 50, 60)).filter((r) => r.project_id === s.projectId)
    assert.equal(
      await codeOf(recordDispatchResult(worker, s.projectId, row!.id, randomUUID(), 'acknowledged')),
      'invalid_state',
    )
    assert.equal(
      await recordDispatchResult(worker, s.projectId, row!.id, row!.lease_token!, 'acknowledged'),
      'acknowledged',
    )
    assert.equal(
      await codeOf(recordDispatchResult(worker, s.projectId, row!.id, row!.lease_token!, 'denied')),
      'invalid_state',
    )
    assert.equal(await stateOf(s.projectId, row!.id), 'acknowledged')
  })

  it('records outcome_unknown when the lease expired but was not yet swept', { timeout: 15_000 }, async () => {
    const s = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    await admit(A, s, review(s))
    const [row] = (await claimOutbox(worker, 'worker-3', 50, 5)).filter((r) => r.project_id === s.projectId)
    await sleep(5300)
    assert.equal(
      await recordDispatchResult(worker, s.projectId, row!.id, row!.lease_token!, 'acknowledged'),
      'outcome_unknown',
    )
  })

  it('keeps the API role away from worker functions', async () => {
    assert.equal(await codeOf(claimOutbox(api, 'api-pretending', 1, 60)), 'forbidden')
  })
})

describe('two competing publishers', () => {
  async function seedCandidates(s: SeededProject) {
    return owner(async (c) => {
      const artifact = randomUUID()
      await c.query(`INSERT INTO sophia.artifacts(project_id, id, title, format) VALUES ($1, $2, 'Prototype', 'ui')`, [
        s.projectId,
        artifact,
      ])
      const source = async (name: string) => {
        const id = randomUUID()
        const sha = createHash('sha256')
          .update(name + id)
          .digest('hex')
        await c.query(
          `INSERT INTO sophia.source_objects(project_id, id, owner_id, scope, sha256, mime, storage_key, byte_length, eligible, state)
           VALUES ($1, $2, $3, 'project', $4, 'text/plain', $5, 1, true, 'ready')`,
          [s.projectId, id, A, sha, `synthetic/${id}`],
        )
        return { id, sha }
      }
      const validation = await source('report')
      const version = async (name: string) => {
        const src = await source(name)
        const id = randomUUID()
        await c.query(
          `INSERT INTO sophia.artifact_versions(project_id, id, artifact_id, source_id, source_hash, goal_id, goal_revision, authority_epoch, state, validation_source_id, checks_passed)
           VALUES ($1, $2, $3, $4, $5, $6, 1, 1, 'validated', $7, true)`,
          [s.projectId, id, artifact, src.id, src.sha, s.goalId, validation.id],
        )
        return id
      }
      return { artifact, v1: await version('one'), v2: await version('two') }
    })
  }

  it('lets exactly one of two concurrent publishers move the stable head', async () => {
    const s = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    const { artifact, v1, v2 } = await seedCandidates(s)
    const first = await openTx(api, A)
    await publish(first.c, s, v1, null)
    const second = await blockedFor(withActor(api, B, 'write', (c) => publish(c, s, v2, null)))
    assert.equal(second.wasBlocked, true)
    await first.commit()
    assert.equal(await codeOf(second.result), 'stale_revision') // "Stable head changed"
    const head = await owner((c) =>
      c.query(`SELECT stable_version_id FROM sophia.artifacts WHERE project_id = $1 AND id = $2`, [
        s.projectId,
        artifact,
      ]),
    )
    assert.equal(head.rows[0].stable_version_id, v1)
    // With the head it actually saw, the second publisher succeeds: a proper compare-and-set.
    await withActor(api, B, 'write', (c) => publish(c, s, v2, v1))
  })
})

describe('cross-project composite keys', () => {
  it('rejects a goal, a brief source or a candidate that belongs to another project', async () => {
    const p1 = await seedProject(db.ownerUrl, { admin: A })
    const p2 = await seedProject(db.ownerUrl, { admin: A })
    assert.equal(await codeOf(admit(A, p1, review(p1, { goalId: p2.goalId }))), 'not_found')
    assert.equal(
      await codeOf(admit(A, p1, review(p1, { kind: 'steer', bodySourceId: p2.sourceId }))),
      'source_ineligible',
    )
    assert.equal(
      await codeOf(
        withActor(api, A, 'write', (c) =>
          c.query(`SELECT sophia.publish_candidate($1, $2, NULL, 1, 1)`, [p1.projectId, randomUUID()]),
        ),
      ),
      'not_found',
    )
  })

  it('makes the schema itself refuse mixed-project rows, even for the owner', async () => {
    const p1 = await seedProject(db.ownerUrl, { admin: A })
    const p2 = await seedProject(db.ownerUrl, { admin: A })
    const receipt = await admit(A, p1, review(p1))
    const fkError = (sql: string, params: unknown[]) =>
      owner((c) => c.query(sql, params)).then(
        () => 'inserted',
        (e: unknown) => (e as { code?: string }).code,
      )
    assert.equal(
      await fkError(
        `INSERT INTO sophia.outbox(project_id, command_id, destination, destination_key, goal_id, authority_epoch) VALUES ($1, $2, 'lead.review', 'x', $3, 1)`,
        [p1.projectId, receipt.commandId, p2.goalId],
      ),
      '23503',
    )
    assert.equal(
      await fkError(
        `INSERT INTO sophia.work_attempts(project_id, goal_id, goal_revision, authority_epoch, state, context_source_id) VALUES ($1, $2, 1, 1, 'admitted', $3)`,
        [p1.projectId, p1.goalId, p2.sourceId],
      ),
      '23503',
    )
  })
})
