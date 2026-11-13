// RuntimeDispatcher shutdown against a LABELLED FAKE pool whose connections always fail: the database is down from
// startup, so the first LISTEN never happens. Review of PR #15: stop() must still return, and end the listener's
// retries, or the worker never reaches pool.end() and exits only when the platform kills it.
//
// INC04-S02a coherent: the new-work installation hold, against a LABELLED FAKE pool that answers each query of a pass by
// its SQL (the real query text of the persistence functions, not a mocked dispatcher). It shows what dispatchOnce does
// with the rows a claim returns: cleanup rows always go to the dispatch SQL; new work does only where 0105's catalog
// proof answers true; a failed proof lookup holds new work without ending the pass; and a held row is never counted as
// progress, so the loop waits instead of spinning. Real SQL (lease expiry, reconciliation, commands) is in
// contribution-installation.db.test.ts.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type pg from 'pg'
import { dispatchOnce, RuntimeDispatcher } from './runtime-dispatch.ts'

function downPool(): { pool: pg.Pool; attempts: () => number } {
  let attempts = 0
  const pool = {
    connect: () => {
      attempts += 1
      return Promise.reject(new Error('connect ECONNREFUSED'))
    },
  } as unknown as pg.Pool
  return { pool, attempts: () => attempts }
}

const within = <T>(ms: number, p: Promise<T>): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`not settled within ${ms} ms`)), ms).unref()),
  ])

it('stops while the first LISTEN is still being retried, and ends the retries', async () => {
  const { pool, attempts } = downPool()
  const dispatcher = new RuntimeDispatcher(pool, { workerId: 'test-worker', idleMs: 50 })
  dispatcher.start()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(attempts(), 1, 'the listener tried to connect')

  await within(500, dispatcher.stop())

  // The listener's first retry is due 1 s after its failure: none may follow a stop.
  await new Promise((resolve) => setTimeout(resolve, 1200))
  assert.equal(attempts(), 1, 'no LISTEN retry after stop()')
})

/** A claimed outbox row as claim_runtime_outbox returns it (o.*): the database's own cleanup flag. */
const row = (id: string, cleanup: boolean, destination: string) => ({
  project_id: 'p1',
  id,
  command_id: `c-${id}`,
  destination,
  goal_id: 'g1',
  state: 'dispatching',
  cleanup,
  lease_owner: 'test-worker',
  lease_token: `lease-${id}`,
  attempts: 1,
  conversation_reply_id: cleanup ? null : `reply-${id}`,
})
type Row = ReturnType<typeof row>

/**
 * A LABELLED FAKE pool. `proof` is what 0105's catalog proof answers: true, false, or 'throws' (a failed lookup). It
 * records every dispatch call and every proof lookup; a LISTEN client is offered so RuntimeDispatcher can run.
 */
function fakePool(claim: () => Row[], proof: boolean | 'throws') {
  const dispatched: string[] = []
  let proofLookups = 0
  let claims = 0
  const answer = (sql: string, params: unknown[]) => {
    if (sql.includes('api_contribution_claims')) {
      proofLookups += 1
      if (proof === 'throws') throw new Error('synthetic: the catalog lookup failed')
      return { rows: [{ ok: proof }] }
    }
    if (sql.includes('IS NOT NULL AS ok')) return { rows: [{ ok: false }] } // the retention sweeps' own presence checks
    if (sql.includes('expire_dispatch_leases')) return { rows: [{ n: 0 }] }
    if (sql.includes('reconcile_runtime_outbox')) return { rows: [{ n: 0 }] }
    if (sql.includes('claim_runtime_outbox')) {
      claims += 1
      return { rows: claim() }
    }
    if (sql.includes('dispatch_runtime_outbox')) {
      const id = String(params[1])
      dispatched.push(id)
      return {
        rows: [
          {
            outcome: id.startsWith('settle')
              ? { result: 'settled' }
              : { result: 'enqueued', runtimeId: 'rt', seq: dispatched.length, runtimeCommandId: `cmd-${id}` },
          },
        ],
      }
    }
    if (sql.startsWith('LISTEN') || sql.startsWith('UNLISTEN')) return { rows: [] }
    throw new Error(`unexpected query in the fake pool: ${sql.slice(0, 60)}`)
  }
  /**
   * Like pg: every answer, a failure included, arrives as a promise after a turn of the event loop (I/O), so timers still
   * fire even under a loop that never waits (which would otherwise starve them and hang the test).
   */
  const query = (sql: string, params: unknown[] = []) =>
    new Promise<void>((resolve) => setImmediate(resolve)).then(() => answer(sql, params))
  const pool = {
    query,
    connect: () => Promise.resolve({ on: () => undefined, off: () => undefined, query, release: () => undefined }),
  } as unknown as pg.Pool
  return { pool, dispatched, proofLookups: () => proofLookups, claims: () => claims }
}

const MIXED = () => [
  row('stop-1', true, 'native.stop'),
  row('settle-1', true, 'control.settle'),
  row('create-1', false, 'native.create'),
  row('create-2', false, 'native.create'),
]

describe('the new-work installation hold (INC04-S02a coherent; LABELLED FAKE pool)', () => {
  for (const proof of [false, 'throws'] as const) {
    it(`with the 0105 proof ${proof === false ? 'false' : 'lookup failing'}: cleanup is dispatched, new work is held, and the pass ends normally`, async () => {
      const f = fakePool(MIXED, proof)
      const lines: string[] = []
      const pass = await dispatchOnce(f.pool, {
        workerId: 'test-worker',
        log: (line) => lines.push(line),
        // An assembler login is set: a held reply create must still never reach assembly.
        assemblerUrl: 'postgres://synthetic-not-a-server.invalid/none',
      })
      assert.deepEqual(f.dispatched, ['stop-1', 'settle-1'], 'only the cleanup rows reached the dispatch SQL')
      assert.deepEqual(
        pass.outcomes.map((o) => o.result),
        ['enqueued', 'settled'],
        'no outcome is made up for held rows',
      )
      assert.equal(pass.held, 2)
      assert.equal(pass.lost, 0, 'a held row is not a lost lease')
      assert.equal(f.proofLookups(), 1, 'asked once per pass, only because new work was claimed')
      assert.equal(lines.filter((l) => l.includes('installation hold')).length, 2, lines.join('\n'))
      assert.ok(
        lines.every((l) => !l.startsWith('assembly for reply')),
        'nothing was assembled for a held reply create',
      )
      if (proof === 'throws')
        assert.ok(
          lines.some((l) => l.startsWith('installation check failed: synthetic')),
          lines.join('\n'),
        )
    })
  }

  it('with the 0105 proof true, new work is dispatched exactly as before', async () => {
    const f = fakePool(MIXED, true)
    const pass = await dispatchOnce(f.pool, { workerId: 'test-worker' })
    assert.deepEqual(f.dispatched, ['stop-1', 'settle-1', 'create-1', 'create-2'])
    assert.deepEqual([pass.held, pass.lost, pass.outcomes.length], [0, 0, 4])
    assert.equal(f.proofLookups(), 1)
  })

  it('asks nothing of 0105 when a pass claims only cleanup, even where the lookup would fail', async () => {
    const f = fakePool(() => [row('stop-1', true, 'native.stop')], 'throws')
    const pass = await dispatchOnce(f.pool, { workerId: 'test-worker' })
    assert.deepEqual([f.dispatched, pass.held, f.proofLookups()], [['stop-1'], 0, 0])
  })

  it('does not spin on held work: a pass that only holds waits idleMs like an idle one', async () => {
    // Every claim returns one held new-work row (proof false). A loop that counted it as progress would run a pass per
    // event-loop turn; the existing loop waits idleMs (50 ms) after each such pass.
    const f = fakePool(() => [row('create-1', false, 'native.create')], false)
    const lines: string[] = []
    const dispatcher = new RuntimeDispatcher(f.pool, { workerId: 'test-worker', idleMs: 50, log: (l) => lines.push(l) })
    dispatcher.start()
    await new Promise((resolve) => setTimeout(resolve, 600))
    await within(1000, dispatcher.stop())
    const passes = f.claims()
    assert.ok(passes >= 2, `the loop kept running passes (${String(passes)})`)
    assert.ok(passes <= 15, `bounded by the idle wait: ${String(passes)} passes in 600 ms at idleMs 50`)
    assert.deepEqual(f.dispatched, [], 'nothing held was ever dispatched')
    assert.equal(lines.filter((l) => l.includes('installation hold')).length, passes)
  })
})
