// Synthetic, bounded normal-entry lock regressions. No production barriers or lock framework.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { before, after, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import { secretDigest, collectionExchangeRequest } from '@sophia/coordination/owner-host-channel'
import { digestOf } from '@sophia/coordination/runner-port'
import { runnerDispatchOnce } from '../../../apps/worker/src/runner-dispatch.ts'
import { resultVersionKey } from '../../../apps/worker/src/runner-results.ts'
import {
  claimRunnerResult,
  RunnerResultExchangeStore,
  withActor,
  readRunnerResult,
  admitRunnerOperation,
} from './index.ts'
import {
  resultWorld,
  admitResultOperation,
  requestResult,
  withResultResources,
  pause,
  serveUntil,
  type ResultWorld,
  type ResultResources,
} from './runner-results.db.test.ts'

const pids = new WeakMap<pg.Client, number>()
let db: TestDatabase
before(async () => {
  db = await createTestDatabase()
})
after(async () => {
  await db?.drop()
})
type Outcome =
  { ok: true; value: pg.QueryResult<{ r: unknown }> } | { ok: false; code: string | undefined; message: string }

async function scenario(body: (s: Room) => Promise<void>) {
  await withResultResources(async (resources) => {
    const s = new Room(resources)
    const failures: unknown[] = []
    try {
      await body(s)
    } catch (error) {
      failures.push(error)
    }
    // All-attempt cleanup: unblock and join every pending query before LIFO
    // trigger/client/pool/database teardown, retaining primary + cleanup errors.
    try {
      await s.release()
    } catch (error) {
      failures.push(error)
    }
    try {
      await Promise.all(s.pending)
    } catch (error) {
      failures.push(error)
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length) throw new AggregateError(failures, 'Lock scenario and cleanup failed')
  })
}
class Room {
  pending: Promise<Outcome>[] = []
  gates: pg.Client[] = []
  resources: ResultResources
  constructor(resources: ResultResources) {
    this.resources = resources
  }
  async client(name: string, actor?: string, owner = false, worker = false) {
    const c = new pg.Client({
      connectionString: owner ? db.ownerUrl : worker ? db.workerUrl : db.apiUrl,
      application_name: name,
    })
    this.resources.add(() => c.end())
    await c.connect()
    pids.set(c, (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number)
    await c.query("SET statement_timeout='7000ms'; SET lock_timeout='6000ms'")
    if (owner) await c.query("SET deadlock_timeout='100ms'")
    if (actor) await c.query("SELECT set_config('sophia.actor_id',$1,false)", [actor])
    return c
  }
  async world(shared?: ResultWorld) {
    const w = await resultWorld(db, shared ? { shared } : {})
    this.resources.add(() => w.close())
    return w
  }
  run(c: pg.Client, sql: string, args: unknown[] = []) {
    const pending: Promise<Outcome> = c.query<{ r: unknown }>(sql, args).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, code: (error as { code?: string }).code, message: String(error) }),
    )
    void pending.then((outcome) =>
      console.log(
        'R3 query settled',
        JSON.stringify({
          at: new Date().toISOString(),
          pid: pids.get(c),
          ok: outcome.ok,
          code: outcome.ok ? undefined : outcome.code,
        }),
      ),
    )
    this.pending.push(pending)
    return pending
  }
  async gate(key: number) {
    const c = await this.client(`r3-gate-${key}`, undefined, true)
    await c.query('SELECT pg_advisory_lock($1)', [key])
    this.gates.push(c)
    return c
  }
  async release() {
    const errors: unknown[] = []
    for (const c of this.gates.splice(0)) {
      try {
        await c.query('SELECT pg_advisory_unlock_all()')
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Barrier release failed')
  }
  async waitPid(observer: pg.Client, backend: number, blocker?: pg.Client) {
    const expected = blocker ? pids.get(blocker) : undefined
    for (let n = 0; n < 800; n++) {
      const r = await observer.query<{ blockers: number[] }>(
        `SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers
        FROM pg_stat_activity WHERE pid=$1`,
        [backend],
      )
      const row = r.rows[0]
      if (row?.blockers.length && (expected === undefined || row.blockers.includes(expected))) {
        const locks = await observer.query(
          `SELECT pid,locktype,relation::regclass::text AS relation,page,tuple,transactionid::text,mode,granted
          FROM pg_locks WHERE pid=ANY($1::int[]) AND (NOT granted OR locktype='tuple')`,
          [[backend, ...row.blockers]],
        )
        console.log('R3 actual wait', JSON.stringify({ ...row, locks: locks.rows }))
        return
      }
      await pause(5)
    }
    assert.fail(`no observed lock wait for backend ${backend}`)
  }
}
function pid(c: pg.Client) {
  const value = pids.get(c)
  assert.ok(value)
  return value
}
type FunctionResult = { result: string; fenced: number; sourceId: string; resultId: string; length: number }
function success(outcome: Outcome): FunctionResult {
  console.log('R3 outcome', JSON.stringify(outcome.ok ? { ok: true, rows: outcome.value.rowCount } : outcome))
  assert.equal(outcome.ok, true, 'normal entry completed without deadlock/cancellation/timeout')
  // SQL returns heterogeneous JSON (including arrays/null); each owning case
  // asserts its concrete result before using the fields relevant to that case.
  return outcome.value.rows[0]?.r as FunctionResult
}
async function host(w: ResultWorld) {
  return (
    await w.owner.query('SELECT id FROM sophia.owner_hosts WHERE capability_sha256=$1', [secretDigest(w.capability)])
  ).rows[0].id as string
}
async function prepared(w: ResultWorld, target?: string, settle = false) {
  const op = await admitResultOperation(w, target)
  if (settle) {
    await serveUntil(
      w.agent,
      runnerDispatchOnce(w.worker, {
        workerId: 'r3-observe',
        runner: { ownerId: w.who, environmentRef: 'env-result' },
        port: w.port,
        sends: false,
        followupMinAgeSeconds: 0,
      }),
    )
    const row = (
      await w.owner.query('SELECT state,revision FROM sophia.owner_runner_operations WHERE project_id=$1 AND id=$2', [
        w.projectId,
        op.operationId,
      ])
    ).rows[0]
    assert.equal(row.state, 'settled', 'real fake-host terminal observation releases account before next assignment')
    op.revision = Number(row.revision)
  }
  await requestResult(w, op)
  const claim = await claimRunnerResult(w.worker)
  assert.ok(claim)
  const store = new RunnerResultExchangeStore(w.worker, claim)
  const identity = { envelope: claim.envelope, digest: digestOf(claim.envelope), journalId: claim.journalId }
  const options = { v: 1 as const, maxPages: claim.maxPages, maxBytes: claim.maxBytes }
  const request = collectionExchangeRequest(identity, options)
  return {
    op,
    claim,
    store,
    identity,
    options,
    request,
    input: {
      ownerId: claim.ownerId,
      environmentRef: claim.environmentRef,
      journalId: claim.journalId,
      key: `collect:${op.operationId}:${randomUUID()}`,
      deadlineMs: 1000,
      request,
    },
  }
}
async function queued(w: ResultWorld) {
  const p = await prepared(w)
  const q = await p.store.enqueue(p.input)
  assert.equal(q.result, 'queued')
  if (q.result !== 'queued') throw new Error('not queued')
  // Give bounded concurrency controls room, without changing delivery/reservation semantics.
  await w.owner.query(
    "UPDATE sophia.owner_runner_collections SET deadline_at=clock_timestamp()+interval '60 seconds' WHERE id=$1",
    [p.claim.collectionId],
  )
  await w.owner.query(
    "UPDATE sophia.owner_host_exchanges SET deadline_at=clock_timestamp()+interval '60 seconds' WHERE id=$1",
    [q.exchangeId],
  )
  return { ...p, exchangeId: q.exchangeId }
}
async function barrier(s: Room, w: ResultWorld, table: string, predicate: string, key: number) {
  const event = table === 'source_objects' || predicate.includes('r3-enqueue') ? 'INSERT' : 'UPDATE'
  assert.ok(['owner_hosts', 'owner_host_exchanges', 'source_objects'].includes(table))
  await w.owner.query(`CREATE OR REPLACE FUNCTION public.r3_barrier() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF ${predicate} THEN PERFORM pg_advisory_xact_lock(${key}); END IF; RETURN NEW; END $$;
    CREATE TRIGGER r3_barrier BEFORE ${event} ON sophia.${table} FOR EACH ROW EXECUTE FUNCTION public.r3_barrier()`)
  s.resources.add(() => removeBarrier(w, table))
}
async function removeBarrier(w: ResultWorld, table: string) {
  await w.owner.query(`DROP TRIGGER IF EXISTS r3_barrier ON sophia.${table}`)
}
const pollSql = 'SELECT sophia.owner_host_poll($1,20,1) AS r'
async function control(w: ResultWorld) {
  // External fail-before driver supplies exact, pinned 7031 function bodies only.
  if (process.env.R3_CONTROL_SQL) await w.owner.query(readFileSync(process.env.R3_CONTROL_SQL, 'utf8'))
}

it('R3 revoke-first actual host UPDATE: committed revocation refuses polling without delivery', async () => {
  await scenario(async (s) => {
    const w = await s.world()
    const q = await queued(w)
    await control(w)
    const revoke = await s.client('r3-revoke', w.who)
    const poll = await s.client('r3-poll')
    const observer = await s.client('r3-observer', undefined, true)
    const rp = pid(revoke),
      pp = pid(poll)
    const gate = await s.gate(73101)
    await barrier(s, w, 'owner_hosts', "current_setting('application_name')='r3-revoke' AND NEW.state='revoked'", 73101)
    {
      const r = s.run(revoke, 'SELECT sophia.owner_host_revoke($1) AS r', [await host(w)])
      await s.waitPid(observer, rp, gate)
      const p = s.run(poll, pollSql, [secretDigest(w.capability)])
      await s.waitPid(observer, pp, revoke)
      await s.release()
      assert.equal(success(await r).result, 'revoked')
      const denied = await p
      console.log('R3 refused poll', JSON.stringify(denied))
      assert.equal(denied.ok, false)
      if (!denied.ok) assert.equal(denied.code, '42501')
      const x = (
        await w.owner.query('SELECT state,delivery_count FROM sophia.owner_host_exchanges WHERE id=$1', [q.exchangeId])
      ).rows[0]
      assert.deepEqual(x, { state: 'cancelled', delivery_count: 0 })
    }
  })
})
it('R3 poll-first actual delivery UPDATE: revoke waits and preserves possibly delivered reservation', async () => {
  await scenario(async (s) => {
    const w = await s.world()
    const q = await queued(w)
    await control(w)
    const poll = await s.client('r3-poll')
    const revoke = await s.client('r3-revoke', w.who)
    const observer = await s.client('r3-observer', undefined, true)
    const pp = pid(poll),
      rp = pid(revoke)
    const gate = await s.gate(73102)
    await barrier(
      s,
      w,
      'owner_host_exchanges',
      "current_setting('application_name')='r3-poll' AND NEW.kind='collect' AND NEW.state='delivered'",
      73102,
    )
    {
      const p = s.run(poll, pollSql, [secretDigest(w.capability)])
      await s.waitPid(observer, pp, gate)
      const r = s.run(revoke, 'SELECT sophia.owner_host_revoke($1) AS r', [await host(w)])
      await s.waitPid(observer, rp, poll)
      await s.release()
      assert.equal(success(await p).length, 1)
      assert.equal(success(await r).result, 'revoked')
      const x = (
        await w.owner.query(
          `SELECT x.state,x.delivery_count,c.reserved_pages FROM sophia.owner_host_exchanges x
        JOIN sophia.owner_runner_collections c ON c.exchange_id=x.id WHERE x.id=$1`,
          [q.exchangeId],
        )
      ).rows[0]
      assert.deepEqual(x, { state: 'cancelled', delivery_count: 1, reserved_pages: 8 })
      const p2 = await s.run(poll, pollSql, [secretDigest(w.capability)])
      assert.equal(p2.ok, false)
      if (!p2.ok) assert.equal(p2.code, '42501')
      const answer = await s.run(poll, 'SELECT sophia.owner_host_answer($1,$2,$3::jsonb) AS r', [
        secretDigest(w.capability),
        q.exchangeId,
        JSON.stringify({ v: 1, kind: 'collection_unavailable', reason: 'unavailable' }),
      ])
      assert.equal(answer.ok, false)
      if (!answer.ok) assert.equal(answer.code, '42501')
    }
  })
})
it('R3 enqueue FK boundary: project-first poll completes while naive host-first cycles', async () => {
  await scenario(async (s) => {
    const w = await s.world()
    const first = await prepared(w)
    const next = await prepared(w, first.op.operationId)
    assert.equal((await first.store.enqueue(first.input)).result, 'queued')
    await w.owner.query(
      "UPDATE sophia.owner_runner_collections SET deadline_at=clock_timestamp()+interval '60 seconds' WHERE project_id=$1",
      [w.projectId],
    )
    await w.owner.query(
      "UPDATE sophia.owner_host_exchanges SET deadline_at=clock_timestamp()+interval '60 seconds' WHERE project_id=$1 AND kind='collect'",
      [w.projectId],
    )
    await control(w)
    const enqueue = await s.client('r3-enqueue', undefined, false, true)
    const poll = await s.client('r3-poll')
    const observer = await s.client('r3-observer', undefined, true)
    const ep = pid(enqueue),
      pp = pid(poll)
    const gate = await s.gate(73103)
    await barrier(
      s,
      w,
      'owner_host_exchanges',
      "current_setting('application_name')='r3-enqueue' AND NEW.kind='collect'",
      73103,
    )
    {
      const e = s.run(enqueue, 'SELECT sophia.enqueue_runner_result($1,$2,$3,$4::jsonb,$5,$6) AS r', [
        w.projectId,
        next.claim.collectionId,
        next.claim.permit,
        JSON.stringify(next.request),
        digestOf(next.claim.envelope),
        next.input.key,
      ])
      await s.waitPid(observer, ep, gate)
      const p = s.run(poll, pollSql, [secretDigest(w.capability)])
      await s.waitPid(observer, pp, enqueue)
      await s.release()
      if (process.env.R3_CONTROL_SQL?.includes('naive')) await s.waitPid(observer, ep, poll)
      const outcomes = await Promise.all([e, p])
      console.log('R3 FK outcomes', JSON.stringify(outcomes.map((x) => (x.ok ? { ok: true } : x))))
      assert.equal(success(outcomes[0]).result, 'queued')
      assert.equal(success(outcomes[1]).length, 1)
      assert.equal((await w.channel.poll(20, 1)).length, 1, 'new frozen-out candidate waits for next poll')
      const rows = await w.owner.query(
        "SELECT delivery_count FROM sophia.owner_host_exchanges WHERE kind='collect' AND project_id=$1 ORDER BY id",
        [w.projectId],
      )
      assert.deepEqual(
        rows.rows.map((x: { delivery_count: number }) => x.delivery_count),
        [1, 1],
      )
    }
  })
})

it('R3 opposite creation order: two hosts lock both projects in UUID order before delivery', async () => {
  await scenario(async (s) => {
    const a = await s.world()
    const ap1 = await prepared(a, undefined, true)
    const a2 = await prepared(a, ap1.op.operationId, true)
    const b = await s.world(a)
    const bp1 = await prepared(b, undefined, true)
    const b2 = await prepared(b, bp1.op.operationId, true)
    const ah = await host(a),
      bh = await host(b)
    await a.owner.query("UPDATE sophia.owner_hosts SET bound_at=clock_timestamp()+interval '1 second' WHERE id=$1", [
      ah,
    ])
    const a1q = await ap1.store.enqueue(ap1.input),
      aq = await a2.store.enqueue(a2.input)
    await b.owner.query("UPDATE sophia.owner_hosts SET bound_at=clock_timestamp()+interval '2 seconds' WHERE id=$1", [
      bh,
    ])
    const b1q = await bp1.store.enqueue(bp1.input),
      bq = await b2.store.enqueue(b2.input)
    if (a1q.result !== 'queued' || b1q.result !== 'queued' || aq.result !== 'queued' || bq.result !== 'queued')
      throw new Error('four exchanges not queued')
    const a1 = { ...ap1, exchangeId: a1q.exchangeId },
      b1 = { ...bp1, exchangeId: b1q.exchangeId }
    // a1->host A/project A, a2->host A/project A currently: assign the second
    // exchanges cross-host with matching immutable hello identities.
    await a.owner.query('UPDATE sophia.owner_host_exchanges SET host_id=$1 WHERE id=$2', [bh, aq.exchangeId])
    await a.owner.query('UPDATE sophia.owner_host_exchanges SET host_id=$1 WHERE id=$2', [ah, bq.exchangeId])
    await a.owner.query(
      `UPDATE sophia.owner_host_exchanges SET created_at=CASE WHEN id=ANY($1::uuid[]) THEN now()-interval '2 seconds' ELSE now()-interval '1 second' END,
      deadline_at=clock_timestamp()+interval '60 seconds' WHERE id=ANY($2::uuid[])`,
      [
        [a1.exchangeId, b1.exchangeId],
        [a1.exchangeId, b1.exchangeId, aq.exchangeId, bq.exchangeId],
      ],
    )
    await a.owner.query(
      "UPDATE sophia.owner_runner_collections SET deadline_at=clock_timestamp()+interval '60 seconds' WHERE project_id=ANY($1::uuid[])",
      [[a.projectId, b.projectId]],
    )
    const valid = await a.owner.query(
      "SELECT bool_and(sophia.runner_result_exchange_ok(x)) AS ok FROM sophia.owner_host_exchanges x WHERE kind='collect' AND project_id=ANY($1::uuid[])",
      [[a.projectId, b.projectId]],
    )
    assert.equal(valid.rows[0].ok, true, 'all four synthetic candidates retain actual authority')
    await control(a)
    const pa = await s.client('r3-poll-a'),
      pb = await s.client('r3-poll-b'),
      observer = await s.client('r3-observer', undefined, true)
    const ap = pid(pa),
      bp = pid(pb)
    const gate = await s.gate(73104)
    await barrier(
      s,
      a,
      'owner_host_exchanges',
      `current_setting('application_name')='r3-poll-a' AND NEW.id='${a1.exchangeId}'::uuid AND NEW.state='delivered'`,
      73104,
    )
    {
      const first = s.run(pa, pollSql, [secretDigest(a.capability)])
      await s.waitPid(observer, ap, gate)
      const second = s.run(pb, pollSql, [secretDigest(b.capability)])
      await s.waitPid(observer, bp, pa)
      // Old B has already delivered project B and waits on A. New B waits on
      // the sorted project phase without delivering anything. Same real gate.
      await s.release()
      const outcomes = await Promise.all([first, second])
      console.log('R3 multiproject outcomes', JSON.stringify(outcomes.map((x) => (x.ok ? { ok: true } : x))))
      assert.equal(success(outcomes[0]).length, 2)
      assert.equal(success(outcomes[1]).length, 2)
      const rows = await a.owner.query(
        `SELECT x.delivery_count,c.reserved_pages FROM sophia.owner_host_exchanges x
        JOIN sophia.owner_runner_collections c ON c.exchange_id=x.id WHERE x.id=ANY($1::uuid[])`,
        [[a1.exchangeId, b1.exchangeId, aq.exchangeId, bq.exchangeId]],
      )
      assert.equal(rows.rowCount, 4)
      assert.ok(rows.rows.every((x) => x.delivery_count === 1 && x.reserved_pages === 8))
      assert.deepEqual(await a.channel.poll(20, 1), [])
      assert.deepEqual(await b.channel.poll(20, 1), [])
    }
  })
})
it('R3 revoke target drift after project wait refuses before any cancellation, then complete retry succeeds', async () => {
  await scenario(async (s) => {
    const a = await s.world()
    const first = await prepared(a, undefined, true),
      next = await prepared(a, first.op.operationId, true)
    const b = await s.world(a)
    const added = await prepared(b, undefined, true)
    const ah = await host(a)
    await a.owner.query("UPDATE sophia.owner_hosts SET bound_at=clock_timestamp()+interval '2 seconds' WHERE id=$1", [
      ah,
    ])
    assert.equal((await first.store.enqueue(first.input)).result, 'queued')
    const enqueue = await s.client('r3-enqueue', undefined, false, true),
      revoke = await s.client('r3-revoke', a.who),
      observer = await s.client('r3-observer', undefined, true)
    const ep = pid(enqueue),
      rp = pid(revoke),
      gate = await s.gate(73105)
    await barrier(
      s,
      a,
      'owner_host_exchanges',
      "current_setting('application_name')='r3-enqueue' AND NEW.kind='collect'",
      73105,
    )
    {
      const e = s.run(enqueue, 'SELECT sophia.enqueue_runner_result($1,$2,$3,$4::jsonb,$5,$6) AS r', [
        a.projectId,
        next.claim.collectionId,
        next.claim.permit,
        JSON.stringify(next.request),
        digestOf(next.claim.envelope),
        next.input.key,
      ])
      await s.waitPid(observer, ep, gate)
      const r = s.run(revoke, 'SELECT sophia.owner_host_revoke($1) AS r', [ah])
      await s.waitPid(observer, rp, enqueue)
      assert.equal(
        (await added.store.enqueue(added.input)).result,
        'queued',
        'new project committed after revoke froze targets',
      )
      await s.release()
      assert.equal(success(await e).result, 'queued')
      const refused = await r
      console.log('R3 target drift', JSON.stringify(refused))
      assert.equal(refused.ok, false)
      if (!refused.ok) assert.equal(refused.code, '40001')
      assert.equal(
        (await a.owner.query('SELECT state FROM sophia.owner_hosts WHERE id=$1', [ah])).rows[0].state,
        'active',
      )
      assert.equal(
        (
          await a.owner.query(
            "SELECT count(*)::int AS n FROM sophia.owner_host_exchanges WHERE host_id=$1 AND kind='collect' AND state='cancelled'",
            [ah],
          )
        ).rows[0].n,
        0,
      )
      assert.deepEqual(success(await s.run(revoke, 'SELECT sophia.owner_host_revoke($1) AS r', [ah])), {
        result: 'revoked',
        fenced: 3,
      })
    }
  })
})

function answerBarrier(ordering: string) {
  if (ordering === 'revoke-before-answer')
    return {
      table: 'owner_hosts',
      predicate: "current_setting('application_name')='r3-revoke' AND NEW.state='revoked'",
    }
  if (ordering === 'answer-before-revoke')
    return {
      table: 'owner_host_exchanges',
      predicate: "current_setting('application_name')='r3-answer' AND NEW.kind='collect' AND NEW.state='answered'",
    }
  return {
    table: 'source_objects',
    predicate: "current_setting('application_name')='r3-consume' AND NEW.scope='private'",
  }
}

for (const ordering of ['revoke-before-answer', 'answer-before-revoke', 'consume-before-revoke'] as const) {
  it(`R3 ${ordering}: current capability fences fresh staging/consume; retained reads keep their rights`, async () => {
    await scenario(async (s) => {
      const w = await s.world(),
        q = await queued(w)
      await control(w)
      assert.equal((await w.channel.poll(20, 1)).length, 1)
      const result = await w.gateway.collect(q.identity, q.options)
      assert.equal(result.kind, 'collected')
      if (result.kind !== 'collected') throw new Error('no result')
      const answer = await s.client('r3-answer'),
        revoke = await s.client('r3-revoke', w.who),
        consumer = await s.client('r3-consume', undefined, false, true),
        observer = await s.client('r3-observer', undefined, true)
      const ap = pid(answer),
        rp = pid(revoke),
        cp = pid(consumer),
        gate = await s.gate(73106)
      const answerArgs = [secretDigest(w.capability), q.exchangeId, JSON.stringify(result)]
      const consumeArgs = [
        w.projectId,
        q.claim.collectionId,
        q.claim.permit,
        q.exchangeId,
        result.textSha256,
        resultVersionKey(q.claim, result),
      ]
      const answerSql = 'SELECT sophia.owner_host_answer($1,$2,$3::jsonb) AS r',
        consumeSql = 'SELECT sophia.consume_runner_result($1,$2,$3,$4,$5,$6) AS r'
      const { table, predicate } = answerBarrier(ordering)
      if (ordering === 'consume-before-revoke')
        assert.equal(success(await s.run(answer, answerSql, answerArgs)).result, 'ok')
      await barrier(s, w, table, predicate, 73106)
      {
        if (ordering === 'revoke-before-answer') {
          const r = s.run(revoke, 'SELECT sophia.owner_host_revoke($1) AS r', [await host(w)])
          await s.waitPid(observer, rp, gate)
          const a = s.run(answer, answerSql, answerArgs)
          await s.waitPid(observer, ap, revoke)
          await s.release()
          assert.equal(success(await r).result, 'revoked')
          const denied = await a
          console.log('R3 answer refusal', JSON.stringify(denied))
          assert.equal(denied.ok, false)
          if (!denied.ok) assert.equal(denied.code, '42501')
          assert.equal(success(await s.run(consumer, consumeSql, consumeArgs)), null)
        } else {
          const first =
            ordering === 'answer-before-revoke'
              ? s.run(answer, answerSql, answerArgs)
              : s.run(consumer, consumeSql, consumeArgs)
          await s.waitPid(observer, ordering === 'answer-before-revoke' ? ap : cp, gate)
          const r = s.run(revoke, 'SELECT sophia.owner_host_revoke($1) AS r', [await host(w)])
          await s.waitPid(observer, rp, ordering === 'answer-before-revoke' ? answer : consumer)
          await s.release()
          const value = success(await first)
          assert.equal(success(await r).result, 'revoked')
          if (ordering === 'answer-before-revoke') {
            assert.equal(value.result, 'ok')
            assert.equal(success(await s.run(consumer, consumeSql, consumeArgs)), null)
          } else {
            assert.ok(value.sourceId)
            const current = await withActor(w.api, w.who, 'read', (c) =>
              readRunnerResult(c, w.projectId, value.resultId),
            )
            assert.equal(current.result.sourceId, value.sourceId)
            assert.equal(
              success(await s.run(consumer, consumeSql, consumeArgs)).sourceId,
              value.sourceId,
              'idempotent retained consume',
            )
          }
        }
        const count = (
          await w.owner.query('SELECT count(*)::int AS n FROM sophia.owner_runner_results WHERE project_id=$1', [
            w.projectId,
          ])
        ).rows[0].n
        assert.equal(count, ordering === 'consume-before-revoke' ? 1 : 0)
        const budget = (
          await w.owner.query('SELECT reserved_pages FROM sophia.owner_runner_collections WHERE id=$1', [
            q.claim.collectionId,
          ])
        ).rows[0].reserved_pages
        assert.equal(budget, 8, 'revocation neither settles native work nor refunds collection budget')
      }
    })
  })
}
it('R3 enqueue rechecks current host after FK waits behind empty-target revocation', async () => {
  await scenario(async (s) => {
    const w = await s.world(),
      q = await prepared(w)
    await control(w)
    const enqueue = await s.client('r3-enqueue', undefined, false, true),
      revoke = await s.client('r3-revoke', w.who),
      observer = await s.client('r3-observer', undefined, true)
    const ep = pid(enqueue),
      rp = pid(revoke),
      gate = await s.gate(73107)
    await barrier(s, w, 'owner_hosts', "current_setting('application_name')='r3-revoke' AND NEW.state='revoked'", 73107)
    {
      const r = s.run(revoke, 'SELECT sophia.owner_host_revoke($1) AS r', [await host(w)])
      await s.waitPid(observer, rp, gate)
      const e = s.run(enqueue, 'SELECT sophia.enqueue_runner_result($1,$2,$3,$4::jsonb,$5,$6) AS r', [
        w.projectId,
        q.claim.collectionId,
        q.claim.permit,
        JSON.stringify(q.request),
        digestOf(q.claim.envelope),
        q.input.key,
      ])
      await s.waitPid(observer, ep, revoke)
      await s.release()
      assert.deepEqual(success(await r), { result: 'revoked', fenced: 0 })
      const denied = await e
      console.log('R3 enqueue current host refusal', JSON.stringify(denied))
      assert.equal(denied.ok, false)
      if (!denied.ok) assert.equal(denied.code, '42501')
      assert.equal(
        (
          await w.owner.query(
            "SELECT count(*)::int AS n FROM sophia.owner_host_exchanges WHERE project_id=$1 AND kind='collect'",
            [w.projectId],
          )
        ).rows[0].n,
        0,
      )
      assert.equal(
        (
          await w.owner.query('SELECT exchange_id FROM sophia.owner_runner_collections WHERE id=$1', [
            q.claim.collectionId,
          ])
        ).rows[0].exchange_id,
        null,
      )
    }
  })
})
it('R3 ordinary send, retirement, Stop, and empty/invalid collection heartbeat keep normal semantics', async () => {
  await scenario(async (s) => {
    const w = await s.world(),
      q = await queued(w),
      h = await host(w)
    const revoke = await s.client('r3-management', w.who)
    const original = (
      await w.owner.query(
        "SELECT delivery_count,go_count FROM sophia.owner_host_exchanges WHERE project_id=$1 AND kind='send'",
        [w.projectId],
      )
    ).rows[0]
    assert.ok(original.delivery_count >= 1 && original.go_count >= 1, 'ordinary create really delivered and granted GO')
    assert.equal(success(await s.run(revoke, 'SELECT sophia.owner_host_retire($1) AS r', [h])).result, 'retired')
    assert.equal((await w.channel.poll(20, 1)).length, 1, 'retired host can collect its existing journal work')
    const stop = await withActor(w.api, w.who, 'write', (c) =>
      admitRunnerOperation(c, w.projectId, randomUUID(), {
        kind: 'stop',
        resourceId: w.resourceId,
        targetOperationId: q.op.operationId,
      }),
    )
    await serveUntil(
      w.agent,
      runnerDispatchOnce(w.worker, {
        workerId: 'r3-stop',
        runner: { ownerId: w.who, environmentRef: 'env-result' },
        port: w.port,
        sends: true,
        followupMinAgeSeconds: 3600,
      }),
    )
    const stopped = (
      await w.owner.query(
        "SELECT x.delivery_count,x.go_count FROM sophia.owner_host_exchanges x WHERE x.project_id=$1 AND x.operation_id=$2 AND x.kind='send'",
        [w.projectId, stop.operationId],
      )
    ).rows[0]
    assert.ok(stopped.delivery_count >= 1 && stopped.go_count >= 1, 'ordinary Stop delivered through retired host')
    await w.owner.query("UPDATE sophia.owner_hosts SET last_seen_at=now()-interval '1 day' WHERE id=$1", [h])
    assert.deepEqual(await w.channel.poll(20, 1), [])
    assert.equal(
      (
        await w.owner.query(
          "SELECT last_seen_at>now()-interval '1 minute' AS fresh FROM sophia.owner_hosts WHERE id=$1",
          [h],
        )
      ).rows[0].fresh,
      true,
    )
    const invalid = await s.run(revoke, 'SELECT sophia.owner_host_poll($1,0,1) AS r', [secretDigest(w.capability)])
    assert.equal(invalid.ok, false)
    if (!invalid.ok) assert.equal(invalid.code, '22023')
    const budgetBefore = (
      await w.owner.query('SELECT reserved_pages FROM sophia.owner_runner_collections WHERE id=$1', [
        q.claim.collectionId,
      ])
    ).rows[0].reserved_pages
    assert.equal(budgetBefore, 8)
    assert.equal(success(await s.run(revoke, 'SELECT sophia.owner_host_revoke($1) AS r', [h])).result, 'revoked')
    const budgetAfter = (
      await w.owner.query('SELECT reserved_pages FROM sophia.owner_runner_collections WHERE id=$1', [
        q.claim.collectionId,
      ])
    ).rows[0].reserved_pages
    assert.equal(budgetAfter, budgetBefore)
  })
})
