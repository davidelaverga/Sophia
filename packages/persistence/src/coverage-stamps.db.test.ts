// T4 (0051; root's GO): coverage stamps follow the project's lock, level: sql-run. An exchange's opened_at, a grant's
// created_at and expires_at, and a superseded or revoked grant's revoked_at are one clock reading taken right after the
// writer holds the project's lock, so which grant covers an exchange (voice_grant_of(project, opened_at)) is the order
// the writers ran in. Each interleaving is forced with explicit transactions and a wait on pg_stat_activity (Lock),
// never a sleep; every consumer of coverage (the grant itself, the room token, the assignment, a reservation and the
// guard) is asked. Assumed, not claimed: the database's wall clock does not step backward between lock holders.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  authorizeRoomJoin,
  createPool,
  mediaAssignments,
  readSnapshot,
  reserveQualification,
  roomQualification,
  voiceQualificationGuard,
  withActor,
  withService,
} from './index.ts'

const RUN = 'ab'.repeat(32)
const GRANT = `SELECT (sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',900,3,20,1000,200000,3600)).id AS id`

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

/**
 * Transactions a test opened and has not finished: ended after each test, whatever its outcome, newest first, so a
 * failing assertion never leaves a lock held or a connection open (a run that cannot exit, or a database left behind).
 */
const unfinished: Array<() => Promise<void>> = []
afterEach(async () => {
  for (let end = unfinished.pop(); end; end = unfinished.pop()) await end()
})

/** A transaction begun now on `c`, its pid and its now(); `commit()` ends it, and an unfinished one is rolled back. */
async function begun(c: pg.ClientBase, release: () => Promise<void> | void, actor: string | null) {
  await c.query('BEGIN')
  if (actor) await c.query(`SELECT set_config('sophia.actor_id', $1, true)`, [actor])
  const r = await c.query<{ pid: number; now: Date }>('SELECT pg_backend_pid() AS pid, now()')
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
  return {
    c,
    pid: r.rows[0]!.pid,
    now: r.rows[0]!.now,
    commit: () => finish('COMMIT'),
    rollback: () => finish('ROLLBACK'),
  }
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

/** A project with its principal P, and what each consumer of coverage says of an exchange in it. */
async function fixture() {
  const A = randomUUID()
  const P = randomUUID()
  const seeded = await seedProject(db.ownerUrl, { admin: A, editors: [P] })
  const { projectId, goalId } = seeded
  const snapOf = async () => {
    const s = await withActor(pool, P, 'read', (c) => readSnapshot(c, projectId))
    assert.ok(s)
    return s
  }
  const roomId = (await snapOf()).room.id
  const grant = () =>
    owner(async (c) => String((await c.query<{ id: string }>(GRANT, [projectId, P, RUN])).rows[0]?.id))
  const coveredBy = (x: string) =>
    owner(
      async (c) =>
        (
          await c.query<{ g: string | null }>(
            `SELECT (sophia.voice_grant_of(e.project_id,e.opened_at)).id AS g FROM sophia.room_exchanges e WHERE e.id=$1`,
            [x],
          )
        ).rows[0]?.g ?? null,
    )
  const token = async () => {
    const s = await snapOf()
    return withActor(pool, P, 'read', async (c) => {
      assert.ok(await authorizeRoomJoin(c, projectId, roomId, s.audienceRevision), 'P may join')
      return (await roomQualification(c, roomId))?.grantId ?? null
    })
  }
  const assignment = async (x: string) => {
    const mine = (await withService(pool, (c) => mediaAssignments(c))).find((a) => a.exchangeId === x)
    if (!mine) return 'not assigned'
    return (Reflect.get(mine, 'qualification') as { grantId: string } | undefined)?.grantId ?? null
  }
  const guarded = async (x: string) => {
    await withService(pool, (c) => voiceQualificationGuard(c))
    return owner(async (c) => {
      const r = (
        await c.query<{ state: string; reason: string | null }>(
          `SELECT e.state, q.ended_reason AS reason FROM sophia.room_exchanges e
            LEFT JOIN sophia.voice_qualification_exchanges q ON q.exchange_id=e.id WHERE e.id=$1`,
          [x],
        )
      ).rows[0]
      return `${String(r?.state)}${r?.reason ? `:${r.reason}` : ''}`
    })
  }
  const reservation = async (x: string, g: string) => {
    const r = await withService(pool, (c) =>
      reserveQualification(c, { exchangeId: x, grantId: g, kind: 'connection' }),
    ).then(
      (ok) => (ok.ok ? 'granted' : `refused:${String(ok.stop)}`),
      (err: unknown) => (err instanceof DomainError ? err.code : String(err)),
    )
    return r
  }
  /** Coverage as every consumer reads it, the guard last but one and a reservation (which may end it) last. */
  const views = async (x: string, g: string) => ({
    coveredBy: await coveredBy(x),
    token: await token(),
    assignment: await assignment(x),
    guard: await guarded(x),
    reservation: await reservation(x, g),
  })
  /** P's transaction on the API's login (the actor set as withActor sets it), begun now: its now() is fixed. */
  const memberTx = async () => {
    const c = await pool.connect()
    return begun(c, () => c.release(), P)
  }
  /** The operator's transaction (the migration owner), begun now. */
  const ownerTx = async () => {
    const c = new pg.Client({ connectionString: db.ownerUrl })
    await c.connect()
    return begun(c, () => c.end(), null)
  }
  const startIn = async (c: pg.ClientBase, key = randomUUID()) => {
    const s = await snapOf()
    const r = await c.query<{ receipt: { exchangeId: string } }>(
      `SELECT sophia.start_exchange($1,$2,false,$3) AS receipt`,
      [roomId, s.room.revision, key],
    )
    return r.rows[0]!.receipt.exchangeId
  }
  return { A, P, projectId, goalId, roomId, grant, coveredBy, token, assignment, views, memberTx, ownerTx, startIn }
}

/** Whether backend `pid` waits on a lock (pg_stat_activity), within 5 s: the interleaving is real, not assumed. */
async function blocked(pid: number): Promise<boolean> {
  const until = Date.now() + 5000
  while (Date.now() < until) {
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

const grantOf = (c: pg.ClientBase, f: { projectId: string; P: string }) =>
  c.query<{ id: string }>(GRANT, [f.projectId, f.P, RUN]).then((r) => String(r.rows[0]?.id))

describe('T4: who covers an exchange is the order its writers took the project’s lock in (0051)', () => {
  it('I1: the exchange’s transaction began first, the grant took the lock and committed, then the exchange opened: it is under the grant, everywhere', async () => {
    const f = await fixture()
    const e = await f.memberTx()
    const g = await f.ownerTx()
    const grantId = await grantOf(g.c, f)
    const opening = f.startIn(e.c)
    assert.equal(await blocked(e.pid), true, 'the exchange waited for the grant’s lock')
    await g.commit()
    const x = await opening
    await e.commit()
    assert.deepEqual(await f.views(x, grantId), {
      coveredBy: grantId,
      token: grantId,
      assignment: grantId,
      guard: 'open',
      reservation: 'granted',
    })
  })

  it('I1b: an operator’s transaction already held the project’s lock when the exchange asked to open, and granted only then: the exchange is under the grant (its stamp is taken once it holds the lock, never before)', async () => {
    const f = await fixture()
    const e = await f.memberTx()
    const g = await f.ownerTx()
    await g.c.query(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`, [f.projectId])
    const opening = f.startIn(e.c)
    assert.equal(await blocked(e.pid), true, 'the exchange asked to open, and waits for the lock')
    const grantId = await grantOf(g.c, f)
    await g.commit()
    const x = await opening
    await e.commit()
    assert.deepEqual(await f.views(x, grantId), {
      coveredBy: grantId,
      token: grantId,
      assignment: grantId,
      guard: 'open',
      reservation: 'granted',
    })
  })

  it('I2: a grant g0 is open; the new grant’s transaction began first, the exchange took the lock and opened, then the grant superseded g0: the exchange stays under g0, and the supersession ends it', async () => {
    const f = await fixture()
    const g0 = await f.grant()
    const g = await f.ownerTx()
    const e = await f.memberTx()
    const x = await f.startIn(e.c)
    const granting = grantOf(g.c, f)
    assert.equal(await blocked(g.pid), true, 'the grant waited for the exchange’s lock')
    await e.commit()
    const grantId = await granting
    await g.commit()
    assert.notEqual(grantId, g0)
    assert.deepEqual(await f.views(x, grantId), {
      coveredBy: g0,
      token: null,
      assignment: null,
      guard: 'ended:revoked',
      reservation: 'forbidden',
    })
  })

  it('I3: a grant is open; the revocation’s transaction began first, the exchange opened and committed, then the revocation: the exchange was under the grant, and the guard ends it', async () => {
    const f = await fixture()
    const grantId = await f.grant()
    const r = await f.ownerTx()
    const e = await f.memberTx()
    const x = await f.startIn(e.c)
    await e.commit()
    await r.c.query(`SELECT sophia.voice_qualification_revoke($1,$2,'probe')`, [f.projectId, grantId])
    await r.commit()
    assert.deepEqual(await f.views(x, grantId), {
      coveredBy: grantId,
      token: null,
      assignment: null,
      guard: 'ended:revoked',
      reservation: 'invalid_state',
    })
  })

  it('I4: a grant is open; the exchange’s transaction began first, the revocation committed, then the exchange opened: it is under no grant, and the guard leaves an ordinary exchange alone', async () => {
    const f = await fixture()
    const grantId = await f.grant()
    const e = await f.memberTx()
    await owner((c) => c.query(`SELECT sophia.voice_qualification_revoke($1,$2,'probe')`, [f.projectId, grantId]))
    const x = await f.startIn(e.c)
    await e.commit()
    assert.deepEqual(await f.views(x, grantId), {
      coveredBy: null,
      token: null,
      assignment: null,
      guard: 'open',
      reservation: 'forbidden',
    })
  })

  it('I5: a revocation asked while an exchange’s transaction holds the project’s lock waits for it, and the exchange it waited for is the grant’s', async () => {
    const f = await fixture()
    const grantId = await f.grant()
    const e = await f.memberTx()
    const x = await f.startIn(e.c)
    const r = await f.ownerTx()
    const revoking = r.c.query(`SELECT sophia.voice_qualification_revoke($1,$2,'probe')`, [f.projectId, grantId])
    assert.equal(await blocked(r.pid), true, 'the revocation waited for the exchange’s lock')
    await e.commit()
    await revoking
    await r.commit()
    assert.equal(await f.coveredBy(x), grantId)
    assert.equal((await f.views(x, grantId)).guard, 'ended:revoked')
  })

  it('C (control, the Lab’s order): the grant committed, then the exchange opened: under the grant, everywhere', async () => {
    const f = await fixture()
    const grantId = await f.grant()
    const e = await f.memberTx()
    const x = await f.startIn(e.c)
    await e.commit()
    assert.deepEqual(await f.views(x, grantId), {
      coveredBy: grantId,
      token: grantId,
      assignment: grantId,
      guard: 'open',
      reservation: 'granted',
    })
  })
})

describe('T4: what the three writers keep as they were (0051)', () => {
  it('a replayed start_exchange keeps its opened_at and its receipt', async () => {
    const f = await fixture()
    const key = randomUUID()
    const first = await f.memberTx()
    const x = await f.startIn(first.c, key)
    await first.commit()
    const openedAt = () =>
      owner(
        async (c) =>
          (await c.query<{ t: string }>(`SELECT opened_at::text AS t FROM sophia.room_exchanges WHERE id=$1`, [x]))
            .rows[0]?.t,
      )
    const before0 = await openedAt()
    const again = await f.memberTx()
    const replayed = await f.startIn(again.c, key).catch(() => 'refused')
    await again.rollback()
    // The replay of the same key answers the stored receipt (its room revision may have moved since: the key decides).
    assert.equal(replayed, x)
    assert.equal(await openedAt(), before0, 'never stamped again')
  })

  it('a supersession’s two stamps are one reading: the old grant’s revoked_at is the new grant’s created_at', async () => {
    const f = await fixture()
    const g1 = await f.grant()
    const g2 = await f.grant()
    const rows = await owner(
      async (c) =>
        (
          await c.query<{ id: string; created: string; revoked: string | null; reason: string | null }>(
            `SELECT id, created_at::text AS created, revoked_at::text AS revoked, revoke_reason AS reason
               FROM sophia.voice_qualification_grants WHERE id = ANY($1)`,
            [[g1, g2]],
          )
        ).rows,
    )
    const old = rows.find((r) => r.id === g1)
    const fresh = rows.find((r) => r.id === g2)
    assert.ok(old && fresh)
    assert.equal(old.revoked, fresh.created, 'contiguous: no gap and no overlap between the two windows')
    assert.equal(old.reason, 'superseded')
  })

  it('a grant’s TTL is exact from its created_at, its bounds unchanged; its CHECK holds', async () => {
    const f = await fixture()
    const g = await f.grant()
    const span = await owner(
      async (c) =>
        (
          await c.query<{ s: string }>(
            `SELECT extract(epoch FROM expires_at-created_at)::text AS s FROM sophia.voice_qualification_grants WHERE id=$1`,
            [g],
          )
        ).rows[0]?.s,
    )
    assert.equal(span, '3600.000000', 'expires_at is created_at + the TTL, both from one reading')
    for (const ttl of [59, 7201]) {
      const refused = await owner((c) =>
        c
          .query(`SELECT sophia.voice_qualification_grant($1,$2,$3,'a',900,3,20,1000,200000,$4)`, [
            f.projectId,
            f.P,
            RUN,
            ttl,
          ])
          .then(
            () => 'resolved',
            (err: unknown) => String((err as { code?: string }).code),
          ),
      )
      assert.equal(refused, '22023', `ttl ${String(ttl)}`)
    }
  })

  it('a revocation: P0002 without an open grant; 42501 for a member (the operator’s alone)', async () => {
    const f = await fixture()
    const g = await f.grant()
    const asMember = await pool.connect()
    try {
      await asMember.query('BEGIN')
      await asMember.query(`SELECT set_config('sophia.actor_id', $1, true)`, [f.P])
      const member = await asMember.query(`SELECT sophia.voice_qualification_revoke($1,$2,'x')`, [f.projectId, g]).then(
        () => 'resolved',
        (err: unknown) => String((err as { code?: string }).code),
      )
      assert.equal(member, '42501')
    } finally {
      await asMember.query('ROLLBACK')
      asMember.release()
    }
    const revoke = () =>
      owner((c) =>
        c.query(`SELECT sophia.voice_qualification_revoke($1,$2,'operator_kill')`, [f.projectId, g]).then(
          () => 'resolved',
          (err: unknown) => String((err as { code?: string }).code),
        ),
      )
    assert.equal(await revoke(), 'resolved')
    assert.equal(await revoke(), 'P0002', 'no open grant any more')
  })
})

/** A task job with its attempt and command, as admission writes them (0012's shape). */
async function task(c: pg.ClientBase, projectId: string, goalId: string, actor: string) {
  const src = async (mime: string, body: string) =>
    (
      await c.query<{ id: string }>(`SELECT (s).id FROM (SELECT sophia.put_text_source($1,$2,$3,$4) AS s) x`, [
        projectId,
        actor,
        mime,
        body,
      ])
    ).rows[0]!.id
  const context = await src('application/json', '{"sources":[]}')
  const instruction = await src('text/plain', `Research ${randomUUID()}`)
  const attempt = (
    await c.query<{ id: string }>(
      `INSERT INTO sophia.work_attempts(project_id,goal_id,goal_revision,authority_epoch,context_source_id,state)
       VALUES($1,$2,1,1,$3,'admitted') RETURNING id`,
      [projectId, goalId, context],
    )
  ).rows[0]!.id
  const command = (
    await c.query<{ id: string }>(
      `INSERT INTO sophia.commands(project_id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,
         semantic_request,body_source_id,state) VALUES($1,$2,$3,1,1,'native_task',$4,'{}',$5,'admitted') RETURNING id`,
      [projectId, actor, goalId, randomUUID(), instruction],
    )
  ).rows[0]!.id
  const job = (
    await c.query<{ id: string }>(
      `INSERT INTO sophia.jobs(project_id,kind,input_source_id,command_id,attempt_id,state)
       VALUES($1,'research',$2,$3,$4,'pending') RETURNING id`,
      [projectId, context, command, attempt],
    )
  ).rows[0]!.id
  return job
}
/** The job succeeds with a result written now (its source's created_at: this transaction's start). */
const succeed = async (c: pg.ClientBase, projectId: string, job: string, actor: string) => {
  const result = (
    await c.query<{ id: string; created: Date }>(
      `SELECT (s).id, (s).created_at AS created FROM (SELECT sophia.put_text_source($1,$2,'text/markdown',$3) AS s) x`,
      [projectId, actor, `# Result ${job}`],
    )
  ).rows[0]!
  await c.query(
    `UPDATE sophia.jobs SET state='succeeded', result_source_id=$3, result_revision=1 WHERE project_id=$1 AND id=$2`,
    [projectId, job, result.id],
  )
  return result.created
}

describe('T4: results announced since an exchange opened use the serialized opening (0051)', () => {
  it('a result written while the exchange waited for the project’s lock is not announced to it; one written after it opened is (control)', async () => {
    const f = await fixture()
    const [during, laterJob] = await owner(async (c) => [
      await task(c, f.projectId, f.goalId, f.A),
      await task(c, f.projectId, f.goalId, f.A),
    ])
    const e = await f.memberTx()
    // The result's writer holds the project's lock while the exchange asks to open.
    const r = await f.ownerTx()
    await r.c.query(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`, [f.projectId])
    const writtenAt = await succeed(r.c, f.projectId, during, f.A)
    const opening = f.startIn(e.c)
    assert.equal(await blocked(e.pid), true, 'the exchange waits for the lock the result’s writer holds')
    await r.commit()
    const x = await opening
    await e.commit()
    const openedAt = await owner(
      async (c) =>
        (await c.query<{ t: Date }>(`SELECT opened_at AS t FROM sophia.room_exchanges WHERE id=$1`, [x])).rows[0]!.t,
    )
    assert.ok(e.now < writtenAt, 'the result was written after the exchange’s transaction began (the old boundary)')
    assert.ok(writtenAt < openedAt, 'and before the exchange opened (the serialized opening)')
    const results = async () =>
      ((await withService(pool, (c) => mediaAssignments(c))).find((a) => a.exchangeId === x)?.results ?? []).map(
        (res) => res.taskId,
      )
    assert.deepEqual(await results(), [], 'not announced: it was there before the exchange opened')
    await owner((c) => succeed(c, f.projectId, laterJob, f.A))
    assert.deepEqual(await results(), [laterJob], 'a result written after the opening is announced (control)')
  })
})
