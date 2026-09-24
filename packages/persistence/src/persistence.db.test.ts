// S1-02 SQL evidence (level: sql-run). Runs against a disposable PostgreSQL through the same
// non-owner sophia_api login and transaction-local actor the API uses.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { GoalCommand } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type SeededProject, type TestDatabase } from '@sophia/test-support'
import {
  admitGoalCommand,
  checkRoleSafety,
  classifyDbError,
  createPool,
  createProject,
  listenForProjectEvents,
  readEventFrames,
  readSnapshot,
  withActor,
} from './index.ts'

const A = randomUUID() // admin (founder 1)
const B = randomUUID() // editor (founder 2)
const V = randomUUID() // viewer
const C = randomUUID() // outsider

let db: TestDatabase
let pool: pg.Pool
let seed: SeededProject

const cmd = (over: Partial<GoalCommand> = {}): GoalCommand => ({
  kind: 'request_review',
  goalId: seed.goalId,
  expectedGoalRevision: 1,
  expectedAuthorityEpoch: 1,
  bodySourceId: null,
  ...over,
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

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, 4)
  seed = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
})

after(async () => {
  await pool?.end()
  await db?.drop()
})

describe('database role', () => {
  it('accepts the sophia_api login and refuses the migration owner', async () => {
    assert.equal(await checkRoleSafety(pool), undefined)
    const ownerPool = createPool(db.ownerUrl, 1)
    await assert.rejects(checkRoleSafety(ownerPool), { code: 'unavailable' })
    await ownerPool.end()
  })

  it('denies direct DML: writes only go through the checked functions', async () => {
    const code = await codeOf(
      withActor(pool, A, 'write', (c) =>
        c.query(`INSERT INTO sophia.project_members(project_id, actor_id, role) VALUES ($1, $2, 'admin')`, [
          seed.projectId,
          C,
        ]),
      ),
    )
    assert.equal(code, 'forbidden')
  })
})

describe('snapshot scope', () => {
  it('shows the same project to both members and nothing to an outsider', async () => {
    const a = await withActor(pool, A, 'read', (c) => readSnapshot(c, seed.projectId))
    const b = await withActor(pool, B, 'read', (c) => readSnapshot(c, seed.projectId))
    const outsider = await withActor(pool, C, 'read', (c) => readSnapshot(c, seed.projectId))
    assert.notEqual(a, null)
    assert.deepEqual(b, a)
    assert.equal(a!.goals.length, 1)
    assert.equal(outsider, null)
  })

  it('never lets a pooled connection inherit the previous actor', async () => {
    const single = createPool(db.apiUrl, 1)
    await withActor(single, A, 'read', (c) => readSnapshot(c, seed.projectId))
    const c = await single.connect()
    try {
      const { rows } = await c.query(
        `SELECT sophia.actor_id() AS actor, (SELECT count(*) FROM sophia.projects)::int AS visible`,
      )
      assert.deepEqual(rows[0], { actor: null, visible: 0 })
    } finally {
      c.release()
      await single.end()
    }
  })
})

describe('command admission', () => {
  it('returns the same receipt for the same key and payload, with one command row', async () => {
    const key = `same-${randomUUID()}`
    const first = await withActor(pool, A, 'write', (c) => admitGoalCommand(c, seed.projectId, key, cmd()))
    const again = await withActor(pool, A, 'write', (c) => admitGoalCommand(c, seed.projectId, key, cmd()))
    assert.deepEqual(again, first)
    assert.equal(first.stage, 'admitted')
    const rows = await owner((c) =>
      c.query(`SELECT count(*)::int AS n FROM sophia.commands WHERE idempotency_key = $1`, [key]),
    )
    assert.equal(rows.rows[0].n, 1)
  })

  it('rejects the same key with a different payload', async () => {
    const key = `conflict-${randomUUID()}`
    await withActor(pool, A, 'write', (c) => admitGoalCommand(c, seed.projectId, key, cmd()))
    const code = await codeOf(
      withActor(pool, A, 'write', (c) =>
        admitGoalCommand(c, seed.projectId, key, cmd({ kind: 'steer', bodySourceId: seed.sourceId })),
      ),
    )
    assert.equal(code, 'idempotency_conflict')
  })

  it('serializes two concurrent duplicates into one command (two real connections)', async () => {
    const key = `race-${randomUUID()}`
    const c1 = await pool.connect()
    await c1.query('BEGIN')
    await c1.query("SELECT set_config('sophia.actor_id', $1, true)", [A])
    const r1 = await admitGoalCommand(c1, seed.projectId, key, cmd())
    // c1 holds the project lock uncommitted; the duplicate must wait, then find c1's command.
    let settled = false
    const second = withActor(pool, A, 'write', (c) => admitGoalCommand(c, seed.projectId, key, cmd())).finally(() => {
      settled = true
    })
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(settled, false)
    await c1.query('COMMIT')
    c1.release()
    assert.deepEqual(await second, r1)
    const rows = await owner((c) =>
      c.query(`SELECT count(*)::int AS n FROM sophia.commands WHERE idempotency_key = $1`, [key]),
    )
    assert.equal(rows.rows[0].n, 1)
  })

  it('lets only one of two concurrent holds win the epoch; the other is stale', async () => {
    const fresh = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    const hold = {
      kind: 'hold' as const,
      goalId: fresh.goalId,
      expectedGoalRevision: 1,
      expectedAuthorityEpoch: 1,
      bodySourceId: null,
    }
    const c1 = await pool.connect()
    await c1.query('BEGIN')
    await c1.query("SELECT set_config('sophia.actor_id', $1, true)", [A])
    const won = await admitGoalCommand(c1, fresh.projectId, `hold-a-${randomUUID()}`, hold)
    const lost = codeOf(
      withActor(pool, B, 'write', (c) => admitGoalCommand(c, fresh.projectId, `hold-b-${randomUUID()}`, hold)),
    )
    await new Promise((r) => setTimeout(r, 300))
    await c1.query('COMMIT')
    c1.release()
    assert.equal(won.authorityEpoch, 2)
    assert.equal(await lost, 'stale_revision')
  })

  it('rejects a stale expected revision', async () => {
    const code = await codeOf(
      withActor(pool, A, 'write', (c) =>
        admitGoalCommand(c, seed.projectId, `stale-${randomUUID()}`, cmd({ expectedGoalRevision: 7 })),
      ),
    )
    assert.equal(code, 'stale_revision')
  })

  it('denies viewers and outsiders', async () => {
    assert.equal(
      await codeOf(withActor(pool, V, 'write', (c) => admitGoalCommand(c, seed.projectId, `v-${randomUUID()}`, cmd()))),
      'forbidden',
    )
    assert.equal(
      await codeOf(withActor(pool, C, 'write', (c) => admitGoalCommand(c, seed.projectId, `c-${randomUUID()}`, cmd()))),
      'forbidden',
    )
  })
})

describe('events', () => {
  it('replays admitted commands in order and covers hidden events with cursor.advanced', async () => {
    const fresh = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    const key = `ev-${randomUUID()}`
    const receipt = await withActor(pool, A, 'write', (c) =>
      admitGoalCommand(c, fresh.projectId, key, { ...cmd(), goalId: fresh.goalId }),
    )
    // A private event visible only to B (e.g. an owner-only native notice), written by the owner.
    await owner(async (c) => {
      await c.query(`UPDATE sophia.projects SET event_sequence = event_sequence + 1 WHERE id = $1`, [fresh.projectId])
      await c.query(
        `INSERT INTO sophia.project_events(project_id, sequence, type, entity_type, entity_id, entity_revision, summary_code, visibility_owner)
         SELECT id, event_sequence, 'notice.private', 'notice', gen_random_uuid(), 1, 'notice', $2 FROM sophia.projects WHERE id = $1`,
        [fresh.projectId, B],
      )
    })

    const forA = await withActor(pool, A, 'read', (c) => readEventFrames(c, fresh.projectId, 0n))
    assert.deepEqual(
      forA.frames.map((f) => [f.type, f.sequence]),
      [
        ['command.admitted', receipt.cursor],
        ['cursor.advanced', '2'],
      ],
    )
    assert.equal(forA.cursor, '2')

    const forB = await withActor(pool, B, 'read', (c) => readEventFrames(c, fresh.projectId, 0n))
    assert.deepEqual(
      forB.frames.map((f) => f.type),
      ['command.admitted', 'notice.private'],
    )

    const outsider = await withActor(pool, C, 'read', (c) => readEventFrames(c, fresh.projectId, 0n))
    assert.equal(outsider.visible, false)
  })

  it('notifies followers on commit and never on rollback', async () => {
    const seen: string[] = []
    const stop = await listenForProjectEvents(
      pool,
      (p) => seen.push(p),
      () => undefined,
    )
    try {
      const rolledBack = await pool.connect()
      await rolledBack.query('BEGIN')
      await rolledBack.query("SELECT set_config('sophia.actor_id', $1, true)", [A])
      await admitGoalCommand(rolledBack, seed.projectId, `rb-${randomUUID()}`, cmd())
      await rolledBack.query('ROLLBACK')
      rolledBack.release()
      await new Promise((r) => setTimeout(r, 200))
      assert.deepEqual(seen, [])

      await withActor(pool, A, 'write', (c) => admitGoalCommand(c, seed.projectId, `nt-${randomUUID()}`, cmd()))
      await new Promise((r) => setTimeout(r, 200))
      assert.deepEqual(seen, [seed.projectId])
    } finally {
      await stop()
    }
  })
})

describe('project creation (migration 0006)', () => {
  const countByKey = (key: string) =>
    owner((c) =>
      c.query(`SELECT count(*)::int AS n FROM sophia.project_creations WHERE idempotency_key = $1`, [key]),
    ).then((r) => r.rows[0].n as number)
  const projectsTitled = (title: string) =>
    owner((c) => c.query(`SELECT count(*)::int AS n FROM sophia.projects WHERE title = $1`, [title])).then(
      (r) => r.rows[0].n as number,
    )

  it('creates the project with the creator as admin and returns the same receipt on retry', async () => {
    const key = `create-${randomUUID()}`
    const title = `Idempotent ${key}`
    const first = await withActor(pool, A, 'write', (c) => createProject(c, key, { title }))
    const again = await withActor(pool, A, 'write', (c) => createProject(c, key, { title }))
    assert.deepEqual(again, first)
    assert.equal(first.cursor, '0')
    assert.equal(await projectsTitled(title), 1)
    const snap = await withActor(pool, A, 'read', (c) => readSnapshot(c, first.projectId))
    assert.equal(snap?.title, title)
    assert.equal(await withActor(pool, B, 'read', (c) => readSnapshot(c, first.projectId)), null)
  })

  it('rejects the same key with a different title', async () => {
    const key = `create-conflict-${randomUUID()}`
    await withActor(pool, A, 'write', (c) => createProject(c, key, { title: 'First title' }))
    assert.equal(
      await codeOf(withActor(pool, A, 'write', (c) => createProject(c, key, { title: 'Other title' }))),
      'idempotency_conflict',
    )
  })

  it('scopes keys per actor: the same key from two people makes two projects', async () => {
    const key = `shared-${randomUUID()}`
    const a = await withActor(pool, A, 'write', (c) => createProject(c, key, { title: 'Same words' }))
    const b = await withActor(pool, B, 'write', (c) => createProject(c, key, { title: 'Same words' }))
    assert.notEqual(a.projectId, b.projectId)
  })

  it('serializes two concurrent creations with one key into one project (two real connections)', async () => {
    const key = `create-race-${randomUUID()}`
    const title = `Race ${key}`
    const c1 = await pool.connect()
    await c1.query('BEGIN')
    await c1.query("SELECT set_config('sophia.actor_id', $1, true)", [A])
    const r1 = await createProject(c1, key, { title })
    let settled = false
    const second = withActor(pool, A, 'write', (c) => createProject(c, key, { title })).finally(() => {
      settled = true
    })
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(settled, false) // blocked on the key, not racing ahead
    await c1.query('COMMIT')
    c1.release()
    assert.deepEqual(await second, r1)
    assert.equal(await projectsTitled(title), 1)
    assert.equal(await countByKey(key), 1)
  })

  it('lets the waiting duplicate create the project when the first attempt rolls back', async () => {
    const key = `create-rollback-${randomUUID()}`
    const title = `Rollback ${key}`
    const c1 = await pool.connect()
    await c1.query('BEGIN')
    await c1.query("SELECT set_config('sophia.actor_id', $1, true)", [A])
    await createProject(c1, key, { title })
    const second = withActor(pool, A, 'write', (c) => createProject(c, key, { title }))
    await new Promise((r) => setTimeout(r, 300))
    await c1.query('ROLLBACK')
    c1.release()
    const created = await second
    assert.match(created.projectId, /^[0-9a-f-]{36}$/)
    assert.equal(await projectsTitled(title), 1)
  })

  it('refuses the old non-idempotent function to the API role', async () => {
    const code = await codeOf(withActor(pool, A, 'write', (c) => c.query(`SELECT sophia.create_project('No key')`)))
    assert.equal(code, 'forbidden')
  })

  it('validates title and key inside the function too', async () => {
    assert.equal(
      await codeOf(withActor(pool, A, 'write', (c) => createProject(c, `k-${randomUUID()}`, { title: '' }))),
      'invalid_request',
    )
    assert.equal(
      await codeOf(withActor(pool, A, 'write', (c) => createProject(c, '', { title: 'Fine' }))),
      'invalid_request',
    )
  })
})

describe('error classification', () => {
  it('maps an unknown SQL failure to a non-retryable unavailable error', () => {
    assert.equal(classifyDbError({ code: 'XX000', message: 'boom' }).code, 'unavailable')
  })
})
