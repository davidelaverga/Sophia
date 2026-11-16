// INC03-CC-002 P1 (migration 0098): a Personal message retained as an automatic_v1 input, held (`recorded`), with no
// effect, through the API login and withActor on a disposable PostgreSQL, and the real CompanionRunner with a stub
// companion. Every person, key and word is synthetic; no model, provider or network is called. The current Personal
// reads are characterized, not presumed unchanged: a recorded turn is visible there (plan, "Integration").
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { CompanionRunner, type Companion } from '../../../apps/api/src/companion.ts'
import { readNeeds } from './needs.ts'
import {
  claimPersonalReply,
  erasePersonalSpace,
  nextPersonalReply,
  readPersonalEpoch,
  readPersonalExport,
  readPersonalSpace,
  readPersonalTurnsAfter,
  recordPersonalReply,
  retryPersonalTurn,
  sendPersonalTurn,
} from './personal.ts'
import {
  PERSONAL_AUTOMATIC_V1,
  PERSONAL_INPUT_PAGE_LIMIT,
  isPersonalInputReceipt,
  isPersonalInputRecord,
  readPersonalInputs,
  recordPersonalInput,
  sendPersonalInput,
  type PersonalInputReceipt,
} from './personal-inputs.ts'
import { withActor } from './tx.ts'

interface World {
  db: TestDatabase
  owner: pg.Pool
  api: pg.Pool
}
let w: World

async function owner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await w.owner.query<T>(sql, params)).rows
}

function sqlstate(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined
  const source: unknown = err.cause ?? err
  return typeof source === 'object' && source !== null && 'code' in source && typeof source.code === 'string'
    ? source.code
    : undefined
}
const refusedWith = (code: string) => (err: unknown) => sqlstate(err) === code

/** What the companion is given to answer one turn (the runner's own type, unexported). */
type CompanionContext = Parameters<Companion['answer']>[0]

/** The only row a query answers. */
function only<T>(rows: T[]): T {
  const [row] = rows
  assert.ok(row !== undefined && rows.length === 1)
  return row
}

const epochOf = (person: string) => withActor(w.api, person, 'read', (c) => readPersonalEpoch(c))
const hold = (person: string, key: string, text: string, epoch = 0) =>
  withActor(w.api, person, 'write', (c) => sendPersonalInput(c, key, { contract: PERSONAL_AUTOMATIC_V1, epoch, text }))
const legacy = (person: string, key: string, text: string) =>
  withActor(w.api, person, 'write', (c) => sendPersonalTurn(c, key, text))

/** What the person's space holds, read as the migration owner. */
async function stored(person: string) {
  const [row] = await owner<{ turns: number; recorded: number; inputs: number; requests: number; sophia: number }>(
    `SELECT (SELECT count(*)::int FROM sophia.personal_turns WHERE owner_id=$1) AS turns,
       (SELECT count(*)::int FROM sophia.personal_turns WHERE owner_id=$1 AND reply='recorded') AS recorded,
       (SELECT count(*)::int FROM sophia.personal_inputs WHERE owner_id=$1) AS inputs,
       (SELECT count(*)::int FROM sophia.personal_requests WHERE owner_id=$1) AS requests,
       (SELECT count(*)::int FROM sophia.personal_turns WHERE owner_id=$1 AND author='sophia') AS sophia`,
    [person],
  )
  assert.ok(row)
  return row
}

/** The backend a transaction runs in: the one a lock wait is read for. */
const backendPid = async (c: pg.PoolClient) =>
  only((await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows).pid

/**
 * Until backend `pid` waits on a lock (pg_stat_activity), within a deadline: the interleaving is observed, not assumed
 * from a pause. Fails past the deadline.
 */
async function waitsOnLock(pid: number, deadline = Date.now() + 8000): Promise<void> {
  while (Date.now() < deadline) {
    const [row] = await observed(
      `the lock observation of backend ${String(pid)}`,
      owner<{ w: string | null }>('SELECT wait_event_type AS w FROM pg_stat_activity WHERE pid=$1', [pid]),
    )
    if (row?.w === 'Lock') return
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.fail(`backend ${String(pid)} never waited on a lock`)
}

/** How long any one step of a causal race may take: an announcement, an observation, a commit, the drain. */
const RACE_BOUND_MS = 8000

/** `promise`, or an AssertionError naming `what` once the bound passes: every wait in a race is an asserted bound. */
async function within<T>(what: string, promise: Promise<T>, ms = RACE_BOUND_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const bound = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new assert.AssertionError({ message: `${what}: not within ${String(ms)} ms` })), ms)
  })
  try {
    return await Promise.race([promise, bound])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The announcement a transaction makes once it holds what the race needs (it wrote, it erased, its backend), or an
 * AssertionError naming `what` as soon as the transaction ends without making it (a setup failure), or at the bound.
 */
async function announced<T>(what: string, announcement: Promise<T>, op: Promise<unknown>): Promise<T> {
  const ended = op.then(
    () => {
      throw new assert.AssertionError({ message: `${what}: ended without announcing` })
    },
    (cause: unknown) => {
      throw new assert.AssertionError({ message: `${what}: failed before announcing: ${String(cause)}` })
    },
  )
  ended.catch(() => undefined)
  return within(what, Promise.race([announcement, ended]))
}

/** One observation of the race (a lock-wait read): bounded, and a failure of it is an assertion naming what failed. */
async function observed<T>(what: string, query: Promise<T>): Promise<T> {
  try {
    return await within(what, query)
  } catch (cause) {
    if (cause instanceof assert.AssertionError) throw cause
    throw new assert.AssertionError({ message: `${what} failed: ${String(cause)}` })
  }
}

/** What a causal race's body is given: release gates for its held transactions, and the operations to drain. */
interface Race {
  /** A gate a held transaction waits on: `open()` releases it; it opens anyway when the race ends. */
  gate(): { wait: Promise<void>; open: () => void }
  /** An operation of the race: drained before the race ends, whatever happened; its rejection stays the body's. */
  track<T>(op: Promise<T>): Promise<T>
}

/**
 * A causal race with a bounded, clean end (PERS-P2-F01): whatever the body does or fails at (an observer that times
 * out or rejects, a setup failure before it), every gate is opened and every operation drained within the bound, so no
 * transaction keeps the space and the pools can end. The body's own failure is the one reported; a drain that could
 * not finish is reported only when the body passed.
 */
async function race(body: (r: Race) => Promise<void>): Promise<void> {
  const gates: Array<() => void> = []
  const ops: Array<Promise<unknown>> = []
  let passed = false
  try {
    await body({
      gate: () => {
        const g = Promise.withResolvers<void>()
        const open = () => g.resolve()
        gates.push(open)
        return { wait: g.promise, open }
      },
      track: (op) => {
        op.catch(() => undefined)
        ops.push(op)
        return op
      },
    })
    passed = true
  } finally {
    for (const open of gates) open()
    const drained = await within('the race drained after its release', Promise.allSettled(ops)).then(
      () => true,
      () => false,
    )
    if (!drained && passed) assert.fail('a race operation did not end within its bound after its release')
  }
}

/**
 * The pools end within the bound, then the database is dropped. Should a pool not end (a transaction no test could
 * release), the database is dropped all the same (its drop ends every backend, and its logins go) and the run fails
 * with an assertion saying so: it always ends and leaves no database or login behind. (A pool with a client never
 * released does not end even once its backend is gone, so this does not wait for it.)
 */
async function endWithin(pools: readonly pg.Pool[], drop: () => Promise<void>): Promise<void> {
  const ended = Promise.all(pools.map((p) => p.end()))
  ended.catch(() => undefined)
  const closed = await within('the pools ended', ended).then(
    () => true,
    () => false,
  )
  await drop()
  if (!closed) assert.fail('a pool did not end within its bound: a transaction was never released (database dropped)')
}

/** A stub companion that answers and counts what it was asked, so a call is attributable to its turn. */
function stubCompanion(): { companion: Companion; asked: CompanionContext[] } {
  const asked: CompanionContext[] = []
  const companion: Companion = {
    mode: 'rehearsal',
    answer: (context) => {
      asked.push(context)
      return Promise.resolve({ text: 'Synthetic answer.', suggestion: null })
    },
    greet: () => Promise.resolve('Synthetic welcome.'),
  }
  return { companion, asked }
}

before(async () => {
  const db = await createTestDatabase(undefined, { assembler: true })
  w = {
    db,
    owner: new pg.Pool({ connectionString: db.ownerUrl, max: 3 }),
    api: new pg.Pool({ connectionString: db.apiUrl, max: 6 }),
  }
})
after(async () => {
  await endWithin([w.owner, w.api], () => w.db.drop())
})

describe('a held Personal input is recorded once, with metadata only', () => {
  it('keeps the words once as a recorded person turn and the input as metadata; the receipt says nothing follows', async () => {
    const person = randomUUID()
    const text = `Held words ${randomUUID()}`
    const r = await hold(person, 'k-1', text)
    assert.ok(isPersonalInputReceipt(r))
    assert.deepEqual(
      [r.operation, r.interactionContract, r.contractVersion, r.input, r.effect],
      ['send_input', 'automatic_v1', 1, 'recorded', 'none'],
    )
    const [turn] = await owner<Record<string, unknown>>(
      'SELECT author, body, reply, reply_to, asked_at IS NOT NULL AS has_asked_at, answering_claim FROM sophia.personal_turns WHERE owner_id=$1 AND id=$2',
      [person, r.turnId],
    )
    assert.deepEqual(turn, {
      author: 'person',
      body: text,
      reply: 'recorded',
      reply_to: null,
      has_asked_at: true,
      answering_claim: null,
    })
    const { n } = only(
      await owner<{ n: number }>('SELECT count(*)::int AS n FROM sophia.personal_turns WHERE body=$1', [text]),
    )
    assert.equal(n, 1, 'the words are kept once')
    const [row] = await owner<{ row: Record<string, unknown> }>(
      'SELECT to_jsonb(i) AS row FROM sophia.personal_inputs i WHERE owner_id=$1 AND id=$2',
      [person, r.inputId],
    )
    assert.ok(row)
    assert.deepEqual(Object.keys(row.row).toSorted(), [
      'addressing_basis',
      'audience',
      'contract_version',
      'created_at',
      'id',
      'idempotency_key',
      'interaction_contract',
      'origin',
      'owner_id',
      'state',
      'turn_id',
    ])
    assert.ok(!JSON.stringify(row.row).includes(text))
    const read = await withActor(w.api, person, 'read', (c) => readPersonalInputs(c))
    assert.equal(read.next, null)
    assert.deepEqual(
      read.inputs.map((i) => ({ ...i, createdAt: 'x' })),
      [
        {
          id: r.inputId,
          turnId: r.turnId,
          seq: r.seq,
          interactionContract: 'automatic_v1',
          contractVersion: 1,
          origin: 'text',
          audience: 'personal_owner',
          addressingBasis: 'personal_default',
          state: 'recorded',
          createdAt: 'x',
        },
      ],
    )
  })

  it('the same key and words return the same input and turn, also after later turns; nothing is written twice', async () => {
    const person = randomUUID()
    const first = await hold(person, 'k-1', 'Once.')
    await legacy(person, 'k-2', 'A legacy turn after it.')
    await hold(person, 'k-3', 'Another held input.')
    const was = await stored(person)
    const again = await hold(person, 'k-1', 'Once.')
    assert.deepEqual(again, first)
    assert.deepEqual(await stored(person), was)
  })

  it('another person and a project admin read none of it', async () => {
    const person = randomUUID()
    const admin = randomUUID()
    await seedProject(w.db.ownerUrl, { admin, editors: [person] })
    await hold(person, 'k-1', 'Mine alone.')
    for (const reader of [admin, randomUUID()]) {
      const rows = await withActor(w.api, reader, 'read', async (c) => [
        ...(await readPersonalInputs(c)).inputs,
        ...(await c.query<Record<string, unknown>>('SELECT * FROM sophia.personal_inputs')).rows,
        ...(await c.query<Record<string, unknown>>("SELECT * FROM sophia.personal_turns WHERE body='Mine alone.'"))
          .rows,
      ])
      assert.deepEqual(rows, [], reader)
    }
  })
})

describe('keys, contracts and concurrency', () => {
  it('other words, the legacy send or the other contract under one key conflict (23505), in either order', async () => {
    const person = randomUUID()
    await hold(person, 'held', 'Held.')
    await legacy(person, 'asked', 'Asked.')
    const was = await stored(person)
    await assert.rejects(hold(person, 'held', 'Other words.'), refusedWith('23505'))
    await assert.rejects(hold(person, 'asked', 'Asked.'), refusedWith('23505'))
    await assert.rejects(legacy(person, 'held', 'Held.'), refusedWith('23505'))
    assert.deepEqual(await stored(person), was)
  })

  it('a missing, null or other contract is refused before anything is written, in SQL and in the caller', async () => {
    const person = randomUUID()
    for (const contract of [null, '', 'automatic', 'legacy_explicit_ask', 'AUTOMATIC_V1'])
      await assert.rejects(
        withActor(w.api, person, 'write', (c) =>
          c.query('SELECT sophia.send_personal_input($1,$2,$3,$4)', [randomUUID(), contract, 0, 'x']),
        ),
        refusedWith('22023'),
        String(contract),
      )
    for (const contract of [undefined, null, 'automatic'])
      await assert.rejects(
        withActor(w.api, person, 'write', (c) =>
          sendPersonalInput(c, randomUUID(), { contract, epoch: 0, text: 'x' } as never),
        ),
        /Invalid request/,
      )
    await assert.rejects(
      withActor(w.api, person, 'write', (c) =>
        c.query('SELECT sophia.send_personal_input($1,$2,$3,$4)', [randomUUID(), 'automatic_v1', 0, '   ']),
      ),
      refusedWith('22023'),
    )
    const { turns } = only(
      await owner<{ turns: number }>('SELECT count(*)::int AS turns FROM sophia.personal_turns WHERE owner_id=$1', [
        person,
      ]),
    )
    assert.equal(turns, 0)
  })

  it('concurrent requests under one key: the same words give one turn and one receipt; other words conflict', async () => {
    const person = randomUUID()
    await hold(person, 'warm', 'Space exists.')
    const same = await Promise.all([1, 2, 3].map(() => hold(person, 'race', 'Together.')))
    assert.deepEqual(same[1], same[0])
    assert.deepEqual(same[2], same[0])
    const was = await stored(person)
    assert.equal(was.inputs, 2)
    const mixed = await Promise.allSettled([hold(person, 'mix', 'One.'), hold(person, 'mix', 'Two.')])
    assert.deepEqual(mixed.map((m) => m.status).toSorted(), ['fulfilled', 'rejected'])
    const failed = mixed.find((m) => m.status === 'rejected')
    assert.ok(failed && refusedWith('23505')(failed.reason))
    assert.equal((await stored(person)).inputs, 3)
  })
})

describe('epoch fence and erasure', () => {
  it('a write against another epoch is refused (40001) and writes nothing', async () => {
    const person = randomUUID()
    await assert.rejects(hold(person, 'k', 'Wrong epoch.', 7), refusedWith('40001'))
    assert.equal((await stored(person)).turns, 0)
  })

  it('erasure deletes the turn and its input; older keys and older epochs never bring them back', async () => {
    const person = randomUUID()
    const kept = await hold(person, 'before', 'Before erasure.')
    await withActor(w.api, person, 'write', (c) => erasePersonalSpace(c, 'erase', 'delete'))
    assert.deepEqual(
      { ...(await stored(person)), requests: 0 },
      { turns: 0, recorded: 0, inputs: 0, requests: 0, sophia: 0 },
    )
    const [tomb] = await owner<{ semantic_request: unknown }>(
      'SELECT semantic_request FROM sophia.personal_requests WHERE owner_id=$1 AND idempotency_key=$2',
      [person, 'before'],
    )
    assert.deepEqual(tomb?.semantic_request, { redacted: true })
    const epoch = await epochOf(person)
    assert.equal(epoch, 1)
    await assert.rejects(hold(person, 'before', 'Before erasure.', epoch), refusedWith('40001'), 'old key')
    await assert.rejects(hold(person, 'after', 'New key, old epoch.', 0), refusedWith('40001'), 'old epoch')
    assert.equal((await stored(person)).turns, 0)
    const fresh = await hold(person, 'after', 'New key, current epoch.', epoch)
    assert.notEqual(fresh.turnId, kept.turnId)
    assert.equal((await stored(person)).inputs, 1)
  })

  it('an erasure racing a held write, in both orders, by the backend each waits in: nothing written before it survives', async () => {
    const person = randomUUID()
    await hold(person, 'warm', 'Warm.')
    // (1) A held write holds the space in an open transaction; the erasure, on its own backend, waits on that lock.
    let racingTurn = ''
    await race(async (r) => {
      const release = r.gate()
      const wrote = Promise.withResolvers<void>()
      const writing = r.track(
        withActor(w.api, person, 'write', async (c) => {
          const got = await sendPersonalInput(c, 'racing', {
            contract: PERSONAL_AUTOMATIC_V1,
            epoch: 0,
            text: 'Racing.',
          })
          wrote.resolve()
          await release.wait
          return got
        }),
      )
      await announced('the held write wrote', wrote.promise, writing)
      const erasePid = Promise.withResolvers<number>()
      const erasing = r.track(
        withActor(w.api, person, 'write', async (c) => {
          erasePid.resolve(await backendPid(c))
          return erasePersonalSpace(c, 'erase-race', 'delete')
        }),
      )
      await waitsOnLock(await announced('the erasure named its backend', erasePid.promise, erasing))
      release.open()
      racingTurn = (await within('the held write committed', writing)).turnId
      await within('the erasure committed', erasing)
    })
    assert.deepEqual(
      [(await stored(person)).inputs, (await stored(person)).turns],
      [0, 0],
      'the erasure took the held write it waited for',
    )
    await assert.rejects(hold(person, 'racing', 'Racing.', 1), refusedWith('40001'), 'its key does not bring it back')
    assert.equal(
      (await owner('SELECT 1 FROM sophia.personal_turns WHERE owner_id=$1 AND id=$2', [person, racingTurn])).length,
      0,
    )
    // (2) An erasure holds the space; a held write made against the old epoch waits on it, then is refused (40001).
    await hold(person, 'second', 'Second.', 1)
    await race(async (r) => {
      const release = r.gate()
      const erased = Promise.withResolvers<void>()
      const erase2 = r.track(
        withActor(w.api, person, 'write', async (c) => {
          await erasePersonalSpace(c, 'erase-2', 'delete')
          erased.resolve()
          await release.wait
        }),
      )
      await announced('the erasure erased', erased.promise, erase2)
      const latePid = Promise.withResolvers<number>()
      const late = r.track(
        withActor(w.api, person, 'write', async (c) => {
          latePid.resolve(await backendPid(c))
          return sendPersonalInput(c, 'late', { contract: PERSONAL_AUTOMATIC_V1, epoch: 1, text: 'Issued before.' })
        }),
      )
      await waitsOnLock(await announced('the late write named its backend', latePid.promise, late))
      release.open()
      await within('the erasure committed', erase2)
      await assert.rejects(within('the late write ended', late), refusedWith('40001'))
    })
    assert.deepEqual([(await stored(person)).turns, (await stored(person)).inputs], [0, 0])
  })

  it('a race releases and drains its held transaction when its observation fails, and reports that failure', async () => {
    const person = randomUUID()
    await hold(person, 'warm-2', 'Warm.')
    const failed = race(async (r) => {
      const release = r.gate()
      const wrote = Promise.withResolvers<void>()
      const writing = r.track(
        withActor(w.api, person, 'write', async (c) => {
          await sendPersonalInput(c, 'held-open', { contract: PERSONAL_AUTOMATIC_V1, epoch: 0, text: 'Held open.' })
          wrote.resolve()
          await release.wait
        }),
      )
      await announced('the held write wrote', wrote.promise, writing)
      // The observer fails (as one that never saw the lock would): the gate is still the race's to open.
      throw new assert.AssertionError({ message: 'observer failed' })
    })
    await assert.rejects(
      failed,
      (err: unknown) => err instanceof assert.AssertionError && err.message === 'observer failed',
    )
    assert.equal(w.api.totalCount - w.api.idleCount, 0, 'no client is held after the race')
    assert.equal((await stored(person)).inputs, 2, 'the released write committed')
    // Nothing keeps the space: a write right after it goes through at once.
    await within('a write after the race', hold(person, 'after-race', 'After.'))
  })

  it('a setup failure before an announcement is an assertion naming it, at once; within rejects at its bound', async () => {
    const person = randomUUID()
    const started = Date.now()
    await assert.rejects(
      race(async (r) => {
        const wrote = Promise.withResolvers<void>()
        const writing = r.track(
          withActor(w.api, person, 'write', async (c) => {
            await sendPersonalInput(c, 'bad-epoch', { contract: PERSONAL_AUTOMATIC_V1, epoch: 7, text: 'Never.' })
            wrote.resolve()
          }),
        )
        await announced('the held write wrote', wrote.promise, writing)
      }),
      (err: unknown) =>
        err instanceof assert.AssertionError &&
        err.message.startsWith('the held write wrote: failed before announcing'),
    )
    assert.ok(Date.now() - started < RACE_BOUND_MS, 'reported at once, not at the bound')
    // `within` rejects at its bound: checked against a timer of its own, so a `within` that never rejects fails here.
    const outcome = await Promise.race([
      within('a wait that never ends', new Promise(() => undefined), 50).then(
        () => 'resolved',
        (err: unknown) => err,
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('no rejection'), 2000)),
    ])
    assert.ok(outcome instanceof assert.AssertionError, String(outcome))
    assert.equal(outcome.message, 'a wait that never ends: not within 50 ms')
  })

  it('a failed observation is an assertion naming it, its cause kept in the message', async () => {
    await assert.rejects(
      observed('the lock observation of backend 1', Promise.reject(new Error('observer down'))),
      (err: unknown) =>
        err instanceof assert.AssertionError &&
        err.message === 'the lock observation of backend 1 failed: Error: observer down',
    )
  })

  it('a pool a transaction keeps open still lets the run end: its database goes, and the end fails saying so', async () => {
    const extra = new pg.Pool({ connectionString: w.db.apiUrl, max: 1 })
    const c = await extra.connect()
    c.on('error', () => undefined)
    await c.query('BEGIN')
    const pid = await backendPid(c)
    // The client is never released: only the bounded end can finish. Its "drop" here ends that one backend.
    const outcome = await Promise.race([
      endWithin([extra], async () => {
        await owner('SELECT pg_terminate_backend($1)', [pid])
      }).then(
        () => 'ended',
        (err: unknown) => err,
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('still waiting'), RACE_BOUND_MS + 4000)),
    ])
    assert.ok(outcome instanceof assert.AssertionError, String(outcome))
    assert.match(outcome.message, /^a pool did not end within its bound/)
    const [left] = await owner<{ n: number }>('SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = $1', [pid])
    assert.equal(left?.n, 0, 'its backend is gone')
  })
})

describe('no reply is asked for, and the companion never answers a recorded turn', () => {
  it('next, claim, the reply writer and retry pass a recorded turn by', async () => {
    const person = randomUUID()
    const r = await hold(person, 'k', 'Held, not asked.')
    await withActor(w.api, person, 'write', async (c) => {
      assert.equal(await nextPersonalReply(c), null)
      assert.equal(await claimPersonalReply(c, r.turnId), null)
      await recordPersonalReply(c, r.turnId, randomUUID(), 'An answer nobody asked for.', null)
    })
    await owner("UPDATE sophia.personal_turns SET asked_at=now()-interval '1 hour' WHERE owner_id=$1", [person])
    await assert.rejects(
      withActor(w.api, person, 'write', (c) => retryPersonalTurn(c, 'retry', r.turnId)),
      refusedWith('40001'),
    )
    const s = await stored(person)
    assert.deepEqual([s.recorded, s.sophia], [1, 0])
  })

  it('the real runner asked for a recorded turn calls nothing when no legacy turn is pending', async () => {
    const person = randomUUID()
    const r = await hold(person, 'k', 'Held only.')
    const { companion, asked } = stubCompanion()
    const runner = new CompanionRunner(w.api, companion, () => undefined)
    await runner.answer(person, r.turnId)
    await runner.close()
    assert.equal(asked.length, 0)
    assert.deepEqual((await stored(person)).sophia, 0)
  })

  it('beside a pending legacy turn, only the legacy turn is answered; the recorded one is untouched', async () => {
    const person = randomUUID()
    const asked1 = await legacy(person, 'asked', 'Please answer this.')
    const held = await hold(person, 'held', 'Held beside it.')
    const { companion, asked } = stubCompanion()
    const runner = new CompanionRunner(w.api, companion, () => undefined)
    // Asked to answer the recorded turn, the runner takes nothing for it and goes on to the pending legacy turn.
    await runner.answer(person, held.turnId)
    await runner.close()
    assert.deepEqual(
      asked.map((c) => c.asked.id),
      [asked1.turnId ?? 'missing'],
    )
    const [h] = await owner<{ reply: string }>('SELECT reply FROM sophia.personal_turns WHERE owner_id=$1 AND id=$2', [
      person,
      held.turnId,
    ])
    assert.equal(h?.reply, 'recorded')
    const replies = await owner<{ reply_to: string }>(
      "SELECT reply_to FROM sophia.personal_turns WHERE owner_id=$1 AND author='sophia'",
      [person],
    )
    assert.deepEqual(
      replies.map((x) => x.reply_to),
      [asked1.turnId ?? 'missing'],
    )
  })
})

describe('the current Personal reads list a recorded turn (shown to its owner, not hidden)', () => {
  it('space, poll and export list it with reply "recorded"; needs are unchanged', async () => {
    const person = randomUUID()
    const needsOf = async () => ({ ...(await withActor(w.api, person, 'read', (c) => readNeeds(c))), readAt: 'x' })
    const needsBefore = await needsOf()
    const r = await hold(person, 'k', 'Visible in reads.')
    const space = await withActor(w.api, person, 'read', (c) => readPersonalSpace(c))
    const turn = space.turns.find((t) => t.id === r.turnId)
    assert.deepEqual([turn?.author, turn?.text, turn?.reply], ['person', 'Visible in reads.', 'recorded'])
    const page = await withActor(w.api, person, 'read', (c) => readPersonalTurnsAfter(c, 0))
    assert.equal(page.turns.find((t) => t.id === r.turnId)?.reply, 'recorded')
    const exported = await withActor(w.api, person, 'read', (c) => readPersonalExport(c))
    assert.ok(JSON.stringify(exported).includes('Visible in reads.'))
    assert.deepEqual(await needsOf(), needsBefore, 'a recorded person turn adds no need')
  })

  it("the companion's history for a later legacy turn leaves the held words out (P2, 0099); the legacy turn is in it", async () => {
    const person = randomUUID()
    await hold(person, 'held', 'Recorded words in history.')
    const later = await legacy(person, 'asked', 'Now answer me.')
    assert.ok(later.turnId)
    const { companion, asked } = stubCompanion()
    const runner = new CompanionRunner(w.api, companion, () => undefined)
    await runner.answer(person, later.turnId)
    await runner.close()
    assert.equal(asked.length, 1)
    assert.deepEqual(
      asked[0]?.history.map((h: { author: string; text: string }) => [h.author, h.text]),
      [['person', 'Now answer me.']],
    )
    assert.equal(JSON.stringify(asked).includes('Recorded words in history.'), false)
  })
})

describe('grants: one checked writer, nothing else', () => {
  it('the API cannot write the table or call the internal append; the worker and assembler cannot call the writer', async () => {
    const person = randomUUID()
    const r: PersonalInputReceipt = await hold(person, 'k', 'Grants.')
    for (const sql of [
      `INSERT INTO sophia.personal_inputs(owner_id,turn_id,idempotency_key,interaction_contract,contract_version,origin,audience,addressing_basis) VALUES('${person}','${r.turnId}','x','automatic_v1',1,'text','personal_owner','personal_default')`,
      `UPDATE sophia.personal_inputs SET state='recorded' WHERE owner_id='${person}'`,
      `DELETE FROM sophia.personal_inputs WHERE owner_id='${person}'`,
      "SELECT sophia.personal_append_recorded('x')",
    ])
      await assert.rejects(
        withActor(w.api, person, 'write', (c) => c.query(sql)),
        refusedWith('42501'),
        sql,
      )
    for (const url of [w.db.workerUrl, w.db.assemblerUrl]) {
      assert.ok(url)
      const other = new pg.Client({ connectionString: url })
      await other.connect()
      try {
        await assert.rejects(
          other.query("SELECT sophia.send_personal_input('k','automatic_v1',0,'x')"),
          refusedWith('42501'),
        )
        await assert.rejects(other.query('SELECT * FROM sophia.personal_inputs'), refusedWith('42501'))
      } finally {
        await other.end()
      }
    }
  })

  it('the writer is a security-definer function with a fixed search path; PUBLIC executes neither new function', async () => {
    const rows = await owner<{
      name: string
      definer: boolean
      config: string[] | null
      public: boolean
      api: boolean
    }>(
      `SELECT p.proname AS name, p.prosecdef AS definer, p.proconfig AS config,
              has_function_privilege('public', p.oid, 'EXECUTE') AS public,
              has_function_privilege('sophia_api', p.oid, 'EXECUTE') AS api
         FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
          AND p.proname IN ('send_personal_input','personal_append_recorded') ORDER BY p.proname`,
    )
    assert.deepEqual(rows, [
      {
        name: 'personal_append_recorded',
        definer: true,
        config: ['search_path=pg_catalog, sophia, pg_temp'],
        public: false,
        api: false,
      },
      {
        name: 'send_personal_input',
        definer: true,
        config: ['search_path=pg_catalog, sophia, pg_temp'],
        public: false,
        api: true,
      },
    ])
    const [rls] = await owner<{ rls: boolean }>(
      "SELECT relrowsecurity AS rls FROM pg_class WHERE oid='sophia.personal_inputs'::regclass",
    )
    assert.equal(rls?.rls, true)
  })
})

// INC03-CC-002 P2: what the route answers, and the bounded metadata read.
describe('the exact receipt: the held turn, read in the write', () => {
  const record = (person: string, key: string, text: string, epoch = 0) =>
    withActor(w.api, person, 'write', (c) =>
      recordPersonalInput(c, key, { contract: PERSONAL_AUTOMATIC_V1, epoch, text }),
    )

  it('is the turn every read shows and the input, recorded with no effect; its replay is the same', async () => {
    const person = randomUUID()
    const got = await record(person, 'k', 'Exact turn.')
    assert.deepEqual(Object.keys(got).toSorted(), ['input', 'revision', 'turn'])
    const space = await withActor(w.api, person, 'read', (c) => readPersonalSpace(c))
    assert.deepEqual(got.turn, space.turns.at(-1))
    assert.deepEqual(
      [got.turn.author, got.turn.text, got.turn.reply, got.turn.replyTo, got.turn.suggestion],
      ['person', 'Exact turn.', 'recorded', null, null],
    )
    assert.deepEqual(Object.keys(got.input).toSorted(), [
      'contractVersion',
      'effect',
      'id',
      'interactionContract',
      'state',
    ])
    assert.deepEqual(
      [got.input.interactionContract, got.input.contractVersion, got.input.state, got.input.effect],
      ['automatic_v1', 1, 'recorded', 'none'],
    )
    assert.equal(got.revision, space.revision)
    assert.deepEqual(await record(person, 'k', 'Exact turn.'), got)
    assert.equal((await stored(person)).turns, 1)
  })
})

describe('the held inputs, a bounded page at a time', () => {
  /** Held inputs `n` for `person`, then every one stamped with the same instant (as one batch could be). */
  async function many(person: string, n: number) {
    const turns: number[] = []
    for (let i = 1; i <= n; i += 1) turns.push((await hold(person, `p-${String(i)}`, `Page words ${String(i)}.`)).seq)
    await owner("UPDATE sophia.personal_inputs SET created_at='2026-11-01T00:00:00Z' WHERE owner_id=$1", [person])
    return turns
  }
  const page = (person: string, p: { before?: number | null; limit?: number }) =>
    withActor(w.api, person, 'read', (c) => readPersonalInputs(c, p))

  it('reads every input once across pages, newest first, though all share one instant', async () => {
    const person = randomUUID()
    const seqs = await many(person, 7)
    await legacy(person, 'legacy-between', 'A legacy turn among them.')
    const seen: number[] = []
    let cursor: number | null = null
    for (let i = 0; i < 10; i += 1) {
      const got = await page(person, { before: cursor, limit: 3 })
      assert.ok(got.inputs.length <= 3)
      for (const r of got.inputs) assert.ok(isPersonalInputRecord(r))
      seen.push(...got.inputs.map((r) => r.seq))
      cursor = got.next
      if (cursor === null) break
    }
    assert.deepEqual(seen, seqs.toReversed())
    assert.ok(new Set(seen).size === 7)
    assert.ok(
      (await page(person, {})).inputs.every((r) => r.createdAt === '2026-11-01T00:00:00.000Z'),
      'one instant, still read once each',
    )
  })

  it('is bounded: at most 100 a page, the default; a limit or cursor outside it is refused', async () => {
    const person = randomUUID()
    await many(person, 2)
    assert.equal(PERSONAL_INPUT_PAGE_LIMIT, 100)
    for (const bad of [
      { limit: 0 },
      { limit: 101 },
      { limit: 1.5 },
      { limit: Number.NaN },
      { before: 0 },
      { before: -1 },
      { before: 2 ** 60 },
    ])
      await assert.rejects(
        page(person, bad),
        (err: unknown) => err instanceof Error && /Invalid request/.test(err.message),
      )
    await assert.rejects(
      withActor(w.api, person, 'read', (c) => readPersonalInputs(c, { limit: '5' as unknown as number })),
      /Invalid request/,
    )
    const exact = await page(person, { limit: 2 })
    assert.deepEqual([exact.inputs.length, exact.next], [2, null])
    const one = await page(person, { limit: 1 })
    assert.deepEqual([one.inputs.length, one.next], [1, one.inputs[0]?.seq])
  })

  it("reads the owner's own only, and no words", async () => {
    const person = randomUUID()
    const other = randomUUID()
    await many(person, 2)
    await many(other, 3)
    const mine = await page(person, {})
    assert.equal(mine.inputs.length, 2)
    assert.equal(JSON.stringify(mine).includes('Page words'), false)
    assert.equal((await page(randomUUID(), {})).inputs.length, 0)
  })

  it('a projection that is not exactly the record is refused', () => {
    const good = {
      id: randomUUID(),
      turnId: randomUUID(),
      seq: 3,
      interactionContract: 'automatic_v1',
      contractVersion: 1,
      origin: 'text',
      audience: 'personal_owner',
      addressingBasis: 'personal_default',
      state: 'recorded',
      createdAt: '2026-11-01T00:00:00.000Z',
    }
    assert.ok(isPersonalInputRecord(good))
    for (const bad of [
      { ...good, text: 'words' },
      { ...good, seq: 0 },
      { ...good, seq: '3' },
      { ...good, state: 'admitted' },
      { ...good, audience: 'project' },
      { ...good, createdAt: 'yesterday' },
      { ...good, interactionContract: 'legacy_explicit_ask' },
      (({ seq: _s, ...rest }) => rest)(good),
      null,
      [good],
    ])
      assert.equal(isPersonalInputRecord(bad), false, JSON.stringify(bad))
  })
})
