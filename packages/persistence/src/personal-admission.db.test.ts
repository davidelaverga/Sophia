// INC03-CC-003 A1 (migration 0101): Personal Answer admission, retry and cancel, through the API login and withActor
// on a disposable PostgreSQL. Every person, key, word, payer and profile is synthetic: no key, model, provider or
// network is called, and nothing here wakes or answers. The record-only automatic_v1 writer (0098) and the legacy
// Personal paths are characterized beside it.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import {
  claimPersonalReply,
  erasePersonalSpace,
  nextPersonalReply,
  readCompanionContext,
  readPersonalEpoch,
  retryPersonalTurn,
  sendPersonalTurn,
} from './personal.ts'
import { PERSONAL_AUTOMATIC_V1, isPersonalInputReceipt, sendPersonalInput } from './personal-inputs.ts'
import {
  PERSONAL_ANSWER_V1,
  cancelPersonalAnswerInput,
  isPersonalAnswerDecision,
  isPersonalAnswerProfile,
  isPersonalAnswerReceipt,
  readCurrentPersonalAnswerDecision,
  readPersonalAnswerDecisions,
  retryPersonalAnswerInput,
  sendPersonalAnswerInput,
  type PersonalAnswerDecision,
  type PersonalAnswerProfile,
  type PersonalAnswerReceipt,
} from './personal-admission.ts'
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
const invalidRequest = (err: unknown) => err instanceof DomainError && err.code === 'invalid_request'

function only<T>(rows: T[]): T {
  const [row] = rows
  assert.ok(row !== undefined && rows.length === 1)
  return row
}

/** A synthetic trusted profile for `person`, naming `payer` (admitted or not, as the test sets up). */
function profileFor(person: string, payer: string, change: Partial<PersonalAnswerProfile> = {}): PersonalAnswerProfile {
  return {
    version: 1,
    owner: person,
    payer,
    routeId: 'synthetic-route',
    roleDigest: `sha256:${'b'.repeat(64)}`,
    provider: 'synthetic-provider',
    model: 'synthetic-model',
    reasoningEffort: null,
    maxTokens: 512,
    prices: { input: 1, cacheRead: 0, cacheWrite: 0, output: 2 },
    ...change,
  }
}
/** A fresh payer name, admitted by "the operator" (the migration owner) for `person` when asked. */
async function payerFor(person: string, admitted: boolean): Promise<string> {
  const payer = `p-${randomUUID().slice(0, 8)}`
  if (admitted) await admit(person, payer)
  return payer
}
const admit = (person: string, payer: string) =>
  owner('INSERT INTO sophia.personal_companion_payers(payer,owner_id,allowance_micros) VALUES($1,$2,1000000)', [
    payer,
    person,
  ])

const send = (person: string, key: string, text: string, profile: PersonalAnswerProfile, epoch = 0) =>
  withActor(w.api, person, 'write', (c) =>
    sendPersonalAnswerInput(c, key, { contract: PERSONAL_ANSWER_V1, epoch, text, profile }),
  )
const retry = (person: string, key: string, inputId: string, expectedSeq: number, profile: PersonalAnswerProfile) =>
  withActor(w.api, person, 'write', (c) =>
    retryPersonalAnswerInput(c, key, { inputId, expectedSeq, epoch: 0, profile }),
  )
const cancel = (person: string, key: string, inputId: string, expectedSeq: number) =>
  withActor(w.api, person, 'write', (c) => cancelPersonalAnswerInput(c, key, { inputId, expectedSeq, epoch: 0 }))
const decisions = (person: string, inputId: string) =>
  withActor(w.api, person, 'read', (c) => readPersonalAnswerDecisions(c, inputId))

/** The turn as stored, read as the migration owner. */
async function turnOf(turnId: string) {
  return only(
    await owner<{ reply: string; asked_at: Date; created_at: Date; seq: string; body: string }>(
      'SELECT reply, asked_at, created_at, seq, body FROM sophia.personal_turns WHERE id=$1',
      [turnId],
    ),
  )
}
/** Rows anything that pays, answers, notes or dispatches would write: none may come from admission. */
async function effects(person: string) {
  return only(
    await owner<Record<string, number>>(
      `SELECT (SELECT count(*)::int FROM sophia.personal_companion_calls WHERE owner_id=$1) AS calls,
              (SELECT count(*)::int FROM sophia.personal_companion_usage WHERE owner_id=$1) AS usage,
              (SELECT count(*)::int FROM sophia.personal_answer_calls WHERE owner_id=$1) AS answer_calls,
              (SELECT count(*)::int FROM sophia.personal_suggestions WHERE owner_id=$1) AS suggestions,
              (SELECT count(*)::int FROM sophia.personal_notes WHERE owner_id=$1) AS notes,
              (SELECT count(*)::int FROM sophia.personal_greeting_claims WHERE owner_id=$1) AS greetings,
              (SELECT count(*)::int FROM sophia.personal_turns WHERE owner_id=$1 AND author='sophia') AS sophia,
              (SELECT count(*)::int FROM sophia.outbox) AS outbox,
              (SELECT count(*)::int FROM sophia.commands) AS commands`,
      [person],
    ),
  )
}

/** The backend a transaction runs in: the one a lock wait is read for. */
const backendPid = async (c: pg.PoolClient) =>
  only((await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows).pid

const RACE_BOUND_MS = 8000

/** `promise`, or an AssertionError naming `what` once the bound passes. */
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

/** Until backend `pid` waits on a lock (pg_stat_activity), within the bound: observed, never assumed from a pause. */
async function waitsOnLock(pid: number): Promise<void> {
  const deadline = Date.now() + RACE_BOUND_MS
  while (Date.now() < deadline) {
    const [row] = await owner<{ w: string | null }>('SELECT wait_event_type AS w FROM pg_stat_activity WHERE pid=$1', [
      pid,
    ])
    if (row?.w === 'Lock') return
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.fail(`backend ${String(pid)} never waited on a lock`)
}

/**
 * Hold a write transaction of `person` open after `first` ran in it, until released; meanwhile run `second` in another
 * transaction, observed waiting on a lock; then release. Whatever fails, the gate opens and both are drained.
 */
async function serialized<A, B>(
  person: string,
  first: (c: pg.PoolClient) => Promise<A>,
  second: (c: pg.PoolClient) => Promise<B>,
): Promise<[PromiseSettledResult<A>, PromiseSettledResult<B>]> {
  const gate = Promise.withResolvers<void>()
  const held = Promise.withResolvers<void>()
  const a = withActor(w.api, person, 'write', async (c) => {
    const r = await first(c)
    held.resolve()
    await gate.promise
    return r
  })
  a.catch(() => undefined)
  try {
    await within('the first transaction held its locks', Promise.race([held.promise, a.then(() => undefined)]))
    const pid = Promise.withResolvers<number>()
    const b = withActor(w.api, person, 'write', async (c) => {
      pid.resolve(await backendPid(c))
      return second(c)
    })
    b.catch(() => undefined)
    await waitsOnLock(await within('the second backend', pid.promise))
    gate.resolve()
    return await within('both ended', Promise.allSettled([a, b]))
  } finally {
    gate.resolve()
    await within('drained', Promise.allSettled([a]))
  }
}

before(async () => {
  const db = await createTestDatabase(undefined, { assembler: true })
  w = {
    db,
    owner: new pg.Pool({ connectionString: db.ownerUrl, max: 4 }),
    api: new pg.Pool({ connectionString: db.apiUrl, max: 8 }),
  }
})
after(async () => {
  await Promise.all([w.owner.end(), w.api.end()])
  await w.db.drop()
})

describe('E2 send decides at once', () => {
  it('admitted: decision seq 1, the turn pending since the decision, the input itself unchanged; durable intent only', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, true)
    const untouched = await effects(person)
    const r = await send(person, 'k-1', 'Answer me, please.', profileFor(person, payer))
    assert.ok(isPersonalAnswerReceipt(r))
    assert.equal(r.operation, 'send_answer_input')
    assert.deepEqual(
      { ...r.decision, admittedAt: typeof r.decision.admittedAt },
      {
        seq: 1,
        operation: 'send',
        outcome: 'admitted',
        reason: null,
        late: false,
        epoch: 0,
        admittedAt: 'string',
        policy: 'personal-default-answer',
        policyVersion: 1,
        family: 'answer',
        basis: 'personal_default_addressee',
      },
    )
    const t = await turnOf(r.turnId)
    const [d] = await decisions(person, r.inputId)
    assert.ok(d)
    assert.equal(t.reply, 'pending')
    assert.equal(t.body, 'Answer me, please.')
    assert.equal(Number(t.seq), r.seq)
    assert.equal(d.admittedAt, r.decision.admittedAt)
    const [asked] = await owner<{ same: boolean; after: boolean }>(
      `SELECT t.asked_at=d.admitted_at AS same, d.admitted_at>=t.created_at AS after FROM sophia.personal_turns t
         JOIN sophia.personal_input_decisions d ON d.turn_id=t.id WHERE t.id=$1`,
      [r.turnId],
    )
    assert.deepEqual(asked, { same: true, after: true })
    assert.deepEqual(d.profile, profileFor(person, payer))
    const input = only(
      await owner<{ state: string; idempotency_key: string; interaction_contract: string }>(
        'SELECT state, idempotency_key, interaction_contract FROM sophia.personal_inputs WHERE id=$1',
        [r.inputId],
      ),
    )
    assert.deepEqual(input, { state: 'recorded', idempotency_key: 'k-1', interaction_contract: 'automatic_v1' })
    // The pending turn is the durable intent the existing queue serves: nothing woke or answered it.
    assert.equal(await withActor(w.api, person, 'read', (c) => nextPersonalReply(c)), r.turnId)
    assert.deepEqual(await effects(person), untouched)
    const claim = await withActor(w.api, person, 'write', (c) => claimPersonalReply(c, r.turnId))
    assert.ok(claim, 'the admitted turn is claimable by the existing queue')
  })

  it('waiting: the payer is not admitted for this owner; the turn stays held and nothing offers it', async () => {
    const person = randomUUID()
    const payer = await payerFor(randomUUID(), true) // admitted, but for another owner
    const r = await send(person, 'k-w', 'Later.', profileFor(person, payer))
    assert.equal(r.decision.outcome, 'waiting')
    assert.equal(r.decision.reason, 'payer_unavailable')
    assert.equal(r.decision.admittedAt, null)
    assert.equal((await turnOf(r.turnId)).reply, 'recorded')
    assert.equal(await withActor(w.api, person, 'read', (c) => nextPersonalReply(c)), null)
    assert.equal(await withActor(w.api, person, 'write', (c) => claimPersonalReply(c, r.turnId)), null)
  })

  it('admitted words enter the companion context only once admitted; waiting words stay out of a later answer', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, true)
    const waiting = await send(person, 'k-hidden', 'Hidden words.', profileFor(person, `${payer}-x`))
    const legacy = await withActor(w.api, person, 'write', (c) => sendPersonalTurn(c, 'k-legacy', 'Legacy words.'))
    assert.ok(legacy.turnId)
    const claim = await withActor(w.api, person, 'write', (c) => claimPersonalReply(c, legacy.turnId ?? ''))
    assert.ok(claim)
    const context = await withActor(w.api, person, 'write', (c) => readCompanionContext(c, legacy.turnId ?? '', claim))
    assert.ok(context)
    const texts = context.history.map((h) => h.text)
    assert.ok(texts.includes('Legacy words.'))
    assert.ok(!texts.includes('Hidden words.'), 'a waiting input is never context')
    assert.equal(waiting.decision.outcome, 'waiting')
  })
})

describe('E2 every replay is its own operation’s receipt (V2-C01)', () => {
  it('send replay after a retry and a cancel is the seq 1 receipt; nothing is refreshed or written', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, false)
    const prof = profileFor(person, payer)
    const s = await send(person, 'k-s', 'Words.', prof)
    const r2 = await retry(person, 'k-r', s.inputId, 1, prof)
    const c3 = await cancel(person, 'k-c', s.inputId, 2)
    assert.deepEqual([r2.decision.seq, c3.decision.seq], [2, 3])
    const rows = await owner<{ n: number }>('SELECT count(*)::int AS n FROM sophia.personal_input_decisions')
    assert.deepEqual(await send(person, 'k-s', 'Words.', prof), s)
    assert.deepEqual(await retry(person, 'k-r', s.inputId, 1, prof), r2)
    assert.deepEqual(await cancel(person, 'k-c', s.inputId, 2), c3)
    assert.deepEqual(await owner('SELECT count(*)::int AS n FROM sophia.personal_input_decisions'), rows)
    assert.equal(
      (await withActor(w.api, person, 'read', (c) => readCurrentPersonalAnswerDecision(c, s.inputId)))?.seq,
      3,
    )
  })

  it('a lost-ACK replay under a changed current profile returns the original decision and keeps its profile', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, true)
    const s = await send(person, 'k-ack', 'Words.', profileFor(person, payer))
    const at = (await turnOf(s.turnId)).asked_at.toISOString()
    const other = await payerFor(person, true)
    const changed = profileFor(person, other, { model: 'synthetic-model-2', maxTokens: 64, reasoningEffort: 'low' })
    assert.deepEqual(await send(person, 'k-ack', 'Words.', changed), s)
    const [d] = await decisions(person, s.inputId)
    assert.deepEqual(d?.profile, profileFor(person, payer))
    assert.equal((await turnOf(s.turnId)).asked_at.toISOString(), at, 'asked_at is not refreshed by a replay')
    assert.equal((await decisions(person, s.inputId)).length, 1)
  })

  it('a retry replay after a later decision is its own (waiting) receipt, not the latest (admitted)', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, false)
    const prof = profileFor(person, payer)
    const s = await send(person, 'k-1', 'Words.', prof)
    const r2 = await retry(person, 'k-2', s.inputId, 1, prof)
    assert.equal(r2.decision.outcome, 'waiting')
    await admit(person, payer)
    const r3 = await retry(person, 'k-3', s.inputId, 2, prof)
    assert.equal(r3.decision.outcome, 'admitted')
    assert.deepEqual(await retry(person, 'k-2', s.inputId, 1, prof), r2)
    assert.deepEqual(
      (await decisions(person, s.inputId)).map((d) => [d.seq, d.operation, d.outcome]),
      [
        [1, 'send', 'waiting'],
        [2, 'retry', 'waiting'],
        [3, 'retry', 'admitted'],
      ],
    )
  })

  it('concurrent sends under one key give one input and one receipt', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, true)
    const prof = profileFor(person, payer)
    const [a, b] = await Promise.all([send(person, 'k-same', 'Same.', prof), send(person, 'k-same', 'Same.', prof)])
    assert.deepEqual(a, b)
    const [n] = await owner<{ n: number }>('SELECT count(*)::int AS n FROM sophia.personal_inputs WHERE owner_id=$1', [
      person,
    ])
    assert.equal(n?.n, 1)
  })
})

describe('E2 retry and cancel are explicit, sequenced and serialized (V2-C05)', () => {
  it('a payer admitted later changes nothing until an explicit retry; then the turn is pending from that decision', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, false)
    const prof = profileFor(person, payer)
    const s = await send(person, 'k-1', 'Words.', prof)
    await admit(person, payer)
    assert.equal((await turnOf(s.turnId)).reply, 'recorded')
    assert.equal((await decisions(person, s.inputId)).length, 1)
    const r = await retry(person, 'k-2', s.inputId, 1, prof)
    assert.equal(r.decision.outcome, 'admitted')
    const t = await turnOf(s.turnId)
    assert.equal(t.reply, 'pending')
    const [same] = await owner<{ same: boolean }>(
      'SELECT asked_at=(SELECT admitted_at FROM sophia.personal_input_decisions WHERE input_id=$2 AND seq=2) AS same FROM sophia.personal_turns WHERE id=$1',
      [s.turnId, s.inputId],
    )
    assert.equal(same?.same, true)
  })

  it('admitted_at is the decision’s own time, taken after the space lock it waited for (not its transaction start)', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, false)
    const prof = profileFor(person, payer)
    const s = await send(person, 'k-1', 'Words.', prof)
    await admit(person, payer)
    const gate = Promise.withResolvers<void>()
    const held = Promise.withResolvers<void>()
    // A holds the owner's space (the fence every writer takes first) and reads the clock just before it commits.
    const a = withActor(w.api, person, 'write', async (c) => {
      await c.query('SELECT sophia.personal_fence(0)')
      held.resolve()
      await gate.promise
      return only((await c.query<{ at: Date }>('SELECT clock_timestamp() AS at')).rows).at
    })
    a.catch(() => undefined)
    try {
      await within('A holds the space', held.promise)
      const pid = Promise.withResolvers<number>()
      const b = withActor(w.api, person, 'write', async (c) => {
        pid.resolve(await backendPid(c))
        return retryPersonalAnswerInput(c, 'k-2', { inputId: s.inputId, expectedSeq: 1, epoch: 0, profile: prof })
      })
      b.catch(() => undefined)
      await waitsOnLock(await within('B started', pid.promise))
      gate.resolve()
      const [released, r] = await within('both ended', Promise.all([a, b]))
      assert.equal(r.decision.outcome, 'admitted')
      const at = only(
        await owner<{ after: boolean }>(
          'SELECT admitted_at > $2::timestamptz AS after FROM sophia.personal_input_decisions WHERE input_id=$1 AND seq=2',
          [s.inputId, released],
        ),
      )
      assert.equal(at.after, true, 'admitted_at follows the moment the lock was released')
    } finally {
      gate.resolve()
      await within('drained', Promise.allSettled([a]))
    }
  })

  it('late: a retry after a newer person turn records late=true; the original decision keeps late=false', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, false)
    const prof = profileFor(person, payer)
    const s = await send(person, 'k-1', 'Old words.', prof)
    await withActor(w.api, person, 'write', (c) => sendPersonalTurn(c, 'k-newer', 'Newer words.'))
    await admit(person, payer)
    const r = await retry(person, 'k-2', s.inputId, 1, prof)
    assert.equal(r.decision.late, true)
    assert.equal(r.seq, s.seq, 'the input keeps its own seq')
    assert.deepEqual(
      (await decisions(person, s.inputId)).map((d) => d.late),
      [false, true],
    )
  })

  it('stale, decided, cancelled, record-only and foreign inputs are refused, and write nothing', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, true)
    const none = await payerFor(person, false)
    const prof = profileFor(person, none)
    const waiting = await send(person, 'k-w', 'Waiting.', prof)
    await assert.rejects(retry(person, 'k-stale', waiting.inputId, 2, prof), refusedWith('40001'))
    await assert.rejects(cancel(person, 'k-stale-c', waiting.inputId, 2), refusedWith('40001'))
    const admitted = await send(person, 'k-a', 'Admitted.', profileFor(person, payer))
    await assert.rejects(retry(person, 'k-ar', admitted.inputId, 1, prof), refusedWith('55000'))
    await assert.rejects(cancel(person, 'k-ac', admitted.inputId, 1), refusedWith('55000'))
    await cancel(person, 'k-c', waiting.inputId, 1)
    await assert.rejects(retry(person, 'k-cr', waiting.inputId, 2, prof), refusedWith('55000'))
    await assert.rejects(cancel(person, 'k-cc', waiting.inputId, 2), refusedWith('55000'))
    const held = await withActor(w.api, person, 'write', (c) =>
      sendPersonalInput(c, 'k-held', { contract: PERSONAL_AUTOMATIC_V1, epoch: 0, text: 'Record only.' }),
    )
    await assert.rejects(retry(person, 'k-hr', held.inputId, 1, profileFor(person, payer)), refusedWith('55000'))
    const stranger = randomUUID()
    await assert.rejects(
      retry(stranger, 'k-x', waiting.inputId, 1, profileFor(stranger, await payerFor(stranger, true))),
      refusedWith('22023'),
    )
    for (const seq of [0, 101, 1.5])
      await assert.rejects(retry(person, `k-bad-${String(seq)}`, waiting.inputId, seq, prof), invalidRequest)
    await assert.rejects(
      owner(`SELECT set_config('sophia.actor_id',$1,false)`, [person]).then(() =>
        owner(`SELECT sophia.cancel_personal_answer_input('k-sql', $1, 0, 0)`, [waiting.inputId]),
      ),
      refusedWith('22023'),
    )
    assert.deepEqual(
      (await decisions(person, waiting.inputId)).map((d) => [d.seq, d.outcome]),
      [
        [1, 'waiting'],
        [2, 'cancelled'],
      ],
    )
    assert.deepEqual(await decisions(person, held.inputId), [])
    assert.deepEqual(await decisions(stranger, waiting.inputId), [], 'another owner reads none of it')
  })

  it('a lost cancel ACK is reconciled by its same-key replay; only then a correction is sent, as a new input', async () => {
    const person = randomUUID()
    const prof = profileFor(person, await payerFor(person, false))
    const s = await send(person, 'k-1', 'First words.', prof)
    const c = await cancel(person, 'k-cancel', s.inputId, 1)
    // The reply was lost: the same key confirms the cancellation, unchanged.
    const confirmed = await cancel(person, 'k-cancel', s.inputId, 1)
    assert.deepEqual(confirmed, c)
    assert.equal(confirmed.decision.outcome, 'cancelled')
    const correction = await send(person, 'k-2', 'Corrected words.', prof)
    assert.notEqual(correction.inputId, s.inputId)
    assert.equal((await turnOf(s.turnId)).reply, 'recorded', 'the cancelled words stay held')
    assert.deepEqual(
      (await decisions(person, s.inputId)).map((d) => d.outcome),
      ['waiting', 'cancelled'],
    )
  })

  it('an unrelated new message leaves an earlier waiting input exactly as it was', async () => {
    const person = randomUUID()
    const prof = profileFor(person, await payerFor(person, false))
    const s = await send(person, 'k-1', 'Earlier.', prof)
    const earlier = await decisions(person, s.inputId)
    await send(person, 'k-2', 'Unrelated.', prof)
    await withActor(w.api, person, 'write', (c) => sendPersonalTurn(c, 'k-3', 'Legacy.'))
    assert.deepEqual(await decisions(person, s.inputId), earlier)
  })

  it('a retry and a cancel at the same expected seq: the second waits on the first, then is stale (both orders)', async () => {
    for (const order of ['retry-first', 'cancel-first'] as const) {
      const person = randomUUID()
      const payer = await payerFor(person, true)
      const prof = profileFor(person, payer)
      const none = profileFor(person, await payerFor(person, false))
      const s = await send(person, 'k-1', 'Race.', none)
      const doRetry = (c: pg.PoolClient) =>
        retryPersonalAnswerInput(c, 'k-r', { inputId: s.inputId, expectedSeq: 1, epoch: 0, profile: prof })
      const doCancel = (c: pg.PoolClient) =>
        cancelPersonalAnswerInput(c, 'k-c', { inputId: s.inputId, expectedSeq: 1, epoch: 0 })
      const [first, second] =
        order === 'retry-first'
          ? await serialized(person, doRetry, doCancel)
          : await serialized(person, doCancel, doRetry)
      assert.equal(first.status, 'fulfilled', order)
      assert.equal(second.status, 'rejected', order)
      assert.ok(second.status === 'rejected' && refusedWith('40001')(second.reason), order)
      assert.deepEqual(
        (await decisions(person, s.inputId)).map((d) => d.outcome),
        ['waiting', order === 'retry-first' ? 'admitted' : 'cancelled'],
        order,
      )
    }
  })
})

describe('E2 the trusted profile is closed and for the calling owner only', () => {
  it('malformed profiles are refused by the caller and by SQL; another owner is 42501; nothing is written', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, true)
    const good = profileFor(person, payer)
    const { owner: _owner, ...noOwner } = good
    const bad: unknown[] = [
      null,
      [],
      noOwner,
      { ...good, extra: 1 },
      { ...good, version: 2 },
      { ...good, owner: person.toUpperCase() },
      { ...good, payer: 'Not A Name' },
      { ...good, roleDigest: 'sha256:short' },
      { ...good, model: '' },
      { ...good, model: 'a\u0007b' },
      { ...good, reasoningEffort: 3 },
      { ...good, maxTokens: 0 },
      { ...good, maxTokens: 4097 },
      { ...good, maxTokens: 1.5 },
      { ...good, maxTokens: '512' },
      { ...good, prices: { input: 1 } },
      { ...good, prices: { ...good.prices, output: -1 } },
    ]
    const turns = async () =>
      (
        await owner<{ n: number }>('SELECT count(*)::int AS n FROM sophia.personal_turns WHERE owner_id=$1', [person])
      )[0]?.n
    for (const [i, profile] of bad.entries()) {
      assert.equal(isPersonalAnswerProfile(profile), false, String(i))
      await assert.rejects(
        withActor(w.api, person, 'write', (c) =>
          sendPersonalAnswerInput(c, `k-${String(i)}`, {
            contract: PERSONAL_ANSWER_V1,
            epoch: 0,
            text: 'x',
            // @ts-expect-error -- a caller typed elsewhere can still pass junk
            profile,
          }),
        ),
        invalidRequest,
        String(i),
      )
      await assert.rejects(
        withActor(w.api, person, 'write', (c) =>
          c.query(`SELECT sophia.send_personal_answer_input($1,'personal_answer_v1',0,'x',$2)`, [
            `k-sql-${String(i)}`,
            profile === null ? null : JSON.stringify(profile),
          ]),
        ),
        refusedWith('22023'),
        String(i),
      )
    }
    await assert.rejects(send(person, 'k-other', 'x', profileFor(randomUUID(), payer)), refusedWith('42501'))
    assert.equal(await turns(), 0)
  })
})

// A1-LOCAL-F01: SQL refuses a price JavaScript reads as Infinity, at the exact bound, and keeps refusing negatives. For
// these values the oracle is Node's own JSON.parse of the same JSON text (none is a negative that JavaScript reads as
// -0: that one recorded difference is in the plan). Values are JSON text, never JSON.stringify(Infinity) (null).
const PRICE_KEYS = ['input', 'cacheRead', 'cacheWrite', 'output'] as const
const OVERFLOW = (2n ** 1024n - 2n ** 970n).toString()
const PRICES = [
  '0',
  '2.5',
  '1e308',
  '1.7976931348623157e308',
  '1.7976931348623158e308',
  '1.7976931348623159e308',
  (2n ** 1024n - 2n ** 970n - 1n).toString(),
  OVERFLOW,
  '1e400',
  '1e-400',
  '-1',
]
/** What the typed guard and the live settings accept: the JavaScript number, finite and >= 0. */
function jsFinitePrice(json: string): boolean {
  const n: unknown = JSON.parse(json)
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
}
/** A profile's JSON text with one price written exactly as `json`. */
function profileText(profile: PersonalAnswerProfile, key: (typeof PRICE_KEYS)[number], json: string): string {
  const text = JSON.stringify({ ...profile, prices: { ...profile.prices, [key]: '__PRICE__' } })
  return text.replace('"__PRICE__"', json)
}
/** Everything a write could move in the owner's space, read as the migration owner. */
async function spaceState(person: string) {
  return only(
    await owner<Record<string, string | number | null>>(
      `SELECT (SELECT revision::text FROM sophia.personal_spaces WHERE owner_id=$1) AS revision,
              (SELECT turn_seq::text FROM sophia.personal_spaces WHERE owner_id=$1) AS turn_seq,
              (SELECT count(*)::int FROM sophia.personal_turns WHERE owner_id=$1) AS turns,
              (SELECT count(*)::int FROM sophia.personal_inputs WHERE owner_id=$1) AS inputs,
              (SELECT count(*)::int FROM sophia.personal_input_decisions WHERE owner_id=$1) AS decisions,
              (SELECT count(*)::int FROM sophia.personal_requests WHERE owner_id=$1) AS requests`,
      [person],
    ),
  )
}

describe('E2 prices are finite JavaScript numbers in SQL too (A1-LOCAL-F01)', () => {
  it('send: SQL refuses what JavaScript reads as Infinity, at and beside the exact bound, at all four keys; finite values stay', async () => {
    assert.deepEqual(
      PRICES.map(jsFinitePrice),
      [true, true, true, true, true, false, true, false, false, true, false],
      'the oracle itself, at each edge',
    )
    for (const key of PRICE_KEYS) {
      const person = randomUUID()
      const prof = profileFor(person, await payerFor(person, false))
      for (const [i, json] of PRICES.entries()) {
        const label = `${key}=${json.length > 40 ? `${json.slice(0, 12)}…(${String(json.length)})` : json}`
        const prior = await spaceState(person)
        const call = withActor(w.api, person, 'write', (c) =>
          c.query<{ r: unknown }>(
            `SELECT sophia.send_personal_answer_input($1,'personal_answer_v1',0,'Price.',$2::jsonb) AS r`,
            [`k-${key}-${String(i)}`, profileText(prof, key, json)],
          ),
        )
        if (!jsFinitePrice(json)) {
          await assert.rejects(call, refusedWith('22023'), label)
          assert.deepEqual(await spaceState(person), prior, `${label}: nothing written`)
          continue
        }
        const { rows } = await call
        const r = only(rows).r
        assert.ok(isPersonalAnswerReceipt(r), label)
        const [d] = await decisions(person, r.inputId)
        assert.ok(d?.profile, label)
        assert.equal(d.profile.prices[key], JSON.parse(json), `${label}: read back as JavaScript reads it`)
      }
    }
  })

  it('retry: a non-finite price at any key is refused with nothing appended; a large finite one is accepted', async () => {
    const person = randomUUID()
    const prof = profileFor(person, await payerFor(person, false))
    const s = await send(person, 'k-1', 'Waiting.', prof)
    for (const key of PRICE_KEYS)
      for (const json of ['1e400', OVERFLOW, '1.7976931348623159e308']) {
        const prior = await spaceState(person)
        await assert.rejects(
          withActor(w.api, person, 'write', (c) =>
            c.query(`SELECT sophia.retry_personal_answer_input($1,$2,1,0,$3::jsonb)`, [
              `k-r-${key}-${json.slice(0, 8)}`,
              s.inputId,
              profileText(prof, key, json),
            ]),
          ),
          refusedWith('22023'),
          `${key}=${json.slice(0, 24)}`,
        )
        assert.deepEqual(await spaceState(person), prior, `${key}: nothing appended`)
      }
    assert.equal((await decisions(person, s.inputId)).length, 1)
    const { rows } = await withActor(w.api, person, 'write', (c) =>
      c.query<{ r: unknown }>(`SELECT sophia.retry_personal_answer_input('k-r-ok',$1,1,0,$2::jsonb) AS r`, [
        s.inputId,
        profileText(prof, 'output', '1.7976931348623158e308'),
      ]),
    )
    const r = only(rows).r
    assert.ok(isPersonalAnswerReceipt(r))
    assert.equal(r.decision.seq, 2)
    const latest = await withActor(w.api, person, 'read', (c) => readCurrentPersonalAnswerDecision(c, s.inputId))
    assert.equal(latest?.profile?.prices.output, Number.MAX_VALUE)
  })

  it('a large finite price on an admitted send is kept exactly and read back by the typed projection', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, true)
    const prof = profileFor(person, payer, { prices: { input: 1e308, cacheRead: 0, cacheWrite: 2.5, output: 1e-300 } })
    const r = await send(person, 'k', 'Admitted.', prof)
    assert.equal(r.decision.outcome, 'admitted')
    const [d] = await decisions(person, r.inputId)
    assert.deepEqual(d?.profile, prof)
  })
})

describe('E2 one key namespace across operations', () => {
  it('a key is one operation: reuse by another operation or other words conflicts (23505)', async () => {
    const person = randomUUID()
    const prof = profileFor(person, await payerFor(person, false))
    const s = await send(person, 'k-send', 'Words.', prof)
    await withActor(w.api, person, 'write', (c) =>
      sendPersonalInput(c, 'k-held', { contract: PERSONAL_AUTOMATIC_V1, epoch: 0, text: 'Held.' }),
    )
    await withActor(w.api, person, 'write', (c) => sendPersonalTurn(c, 'k-legacy', 'Legacy.'))
    await retry(person, 'k-retry', s.inputId, 1, prof)
    const conflicts: Array<[string, () => Promise<unknown>]> = [
      ['held key by Answer send', () => send(person, 'k-held', 'Held.', prof)],
      [
        'Answer key by held send',
        () =>
          withActor(w.api, person, 'write', (c) =>
            sendPersonalInput(c, 'k-send', { contract: PERSONAL_AUTOMATIC_V1, epoch: 0, text: 'Words.' }),
          ),
      ],
      ['legacy key by Answer send', () => send(person, 'k-legacy', 'Legacy.', prof)],
      ['send key by retry', () => retry(person, 'k-send', s.inputId, 2, prof)],
      ['retry key by cancel', () => cancel(person, 'k-retry', s.inputId, 1)],
      ['retry key, other expected seq', () => retry(person, 'k-retry', s.inputId, 2, prof)],
      ['send key, other words', () => send(person, 'k-send', 'Other words.', prof)],
    ]
    for (const [what, call] of conflicts) await assert.rejects(call(), refusedWith('23505'), what)
    await assert.rejects(
      withActor(w.api, person, 'write', (c) =>
        c.query(`SELECT sophia.send_personal_answer_input('k-old','automatic_v1',0,'x',$1)`, [JSON.stringify(prof)]),
      ),
      refusedWith('22023'),
      'the record-only contract name is not the Answer operation',
    )
  })
})

describe('E2 erasure', () => {
  it('cascades inputs and decisions, refuses every older key and epoch, and keeps known usage', async () => {
    const person = randomUUID()
    const payer = await payerFor(person, true)
    const none = profileFor(person, await payerFor(person, false))
    const s = await send(person, 'k-s', 'Words.', none)
    await retry(person, 'k-r', s.inputId, 1, none)
    await cancel(person, 'k-c', s.inputId, 2)
    await send(person, 'k-a', 'Admitted.', profileFor(person, payer))
    // A known cost of an earlier call: no erasure refunds it.
    await owner(
      `INSERT INTO sophia.personal_companion_usage(call_id,owner_id,payer,route_id,epoch,state,reserved_micros)
       VALUES($1,$2,$3,'synthetic-route',0,'uncertain',10)`,
      [randomUUID(), person, payer],
    )
    await withActor(w.api, person, 'write', (c) => erasePersonalSpace(c, 'k-erase', 'delete'))
    const left = only(
      await owner<{ inputs: number; decisions: number; usage: number }>(
        `SELECT (SELECT count(*)::int FROM sophia.personal_inputs WHERE owner_id=$1) AS inputs,
                (SELECT count(*)::int FROM sophia.personal_input_decisions WHERE owner_id=$1) AS decisions,
                (SELECT count(*)::int FROM sophia.personal_companion_usage WHERE owner_id=$1) AS usage`,
        [person],
      ),
    )
    assert.deepEqual(left, { inputs: 0, decisions: 0, usage: 1 })
    const epoch = await withActor(w.api, person, 'read', (c) => readPersonalEpoch(c))
    assert.equal(epoch, 1)
    await assert.rejects(send(person, 'k-s', 'Words.', none, 1), refusedWith('40001'))
    await assert.rejects(
      withActor(w.api, person, 'write', (c) =>
        retryPersonalAnswerInput(c, 'k-r', { inputId: s.inputId, expectedSeq: 1, epoch: 1, profile: none }),
      ),
      refusedWith('40001'),
    )
    await assert.rejects(
      withActor(w.api, person, 'write', (c) =>
        cancelPersonalAnswerInput(c, 'k-c', { inputId: s.inputId, expectedSeq: 2, epoch: 1 }),
      ),
      refusedWith('40001'),
    )
    await assert.rejects(send(person, 'k-new', 'Words.', none, 0), refusedWith('40001'), 'an older epoch')
  })
})

/** Every function 0101 creates, and nothing else. */
const NEW_FUNCTIONS = [
  'cancel_personal_answer_input',
  'personal_answer_decide',
  'personal_answer_decision',
  'personal_answer_expected',
  'personal_answer_profile',
  'personal_answer_receipt',
  'personal_answer_waiting',
  'personal_input_decision_kept',
  'retry_personal_answer_input',
  'send_personal_answer_input',
]

describe('E1 installation', () => {
  it('three API-only security-definer writers with a fixed search path; private helpers; no worker or PUBLIC', async () => {
    const rows = await owner<{
      name: string
      definer: boolean
      config: string[] | null
      public: boolean
      api: boolean
      worker: boolean
    }>(
      `SELECT p.proname AS name, p.prosecdef AS definer, p.proconfig AS config,
              has_function_privilege('public', p.oid, 'EXECUTE') AS public,
              has_function_privilege('sophia_api', p.oid, 'EXECUTE') AS api,
              has_function_privilege('sophia_worker', p.oid, 'EXECUTE') AS worker
         FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace AND p.proname = ANY($1::text[])
        ORDER BY p.proname`,
      [NEW_FUNCTIONS],
    )
    const path = ['search_path=pg_catalog, sophia, pg_temp']
    const writer = { definer: true, config: path, public: false, api: true, worker: false }
    const helper = { definer: false, config: path, public: false, api: false, worker: false }
    assert.deepEqual(rows, [
      { name: 'cancel_personal_answer_input', ...writer },
      { name: 'personal_answer_decide', ...helper },
      { name: 'personal_answer_decision', ...helper },
      { name: 'personal_answer_expected', ...helper },
      { name: 'personal_answer_profile', ...helper },
      { name: 'personal_answer_receipt', ...helper },
      { name: 'personal_answer_waiting', ...helper },
      { name: 'personal_input_decision_kept', ...helper },
      { name: 'retry_personal_answer_input', ...writer },
      { name: 'send_personal_answer_input', ...writer },
    ])
    const table = only(
      await owner<Record<string, boolean>>(
        `SELECT (SELECT relrowsecurity FROM pg_class WHERE oid='sophia.personal_input_decisions'::regclass) AS rls,
                has_table_privilege('sophia_api','sophia.personal_input_decisions','SELECT') AS api_select,
                has_table_privilege('sophia_api','sophia.personal_input_decisions','INSERT') AS api_insert,
                has_table_privilege('sophia_api','sophia.personal_input_decisions','UPDATE') AS api_update,
                has_table_privilege('sophia_api','sophia.personal_input_decisions','DELETE') AS api_delete,
                has_table_privilege('sophia_worker','sophia.personal_input_decisions','SELECT') AS worker_select`,
      ),
    )
    assert.deepEqual(table, {
      rls: true,
      api_select: true,
      api_insert: false,
      api_update: false,
      api_delete: false,
      worker_select: false,
    })
  })

  it('the worker and the assembler can call no writer; the API cannot write the table or call a helper', async () => {
    const person = randomUUID()
    const prof = profileFor(person, await payerFor(person, false))
    const s = await send(person, 'k', 'Grants.', prof)
    for (const sql of [
      `INSERT INTO sophia.personal_input_decisions(owner_id,input_id,seq,turn_id,epoch,operation,outcome,reason,policy,policy_version,family,basis,late) VALUES('${person}','${s.inputId}',9,'${s.turnId}',0,'retry','waiting','payer_unavailable','personal-default-answer',1,'answer','personal_default_addressee',false)`,
      `UPDATE sophia.personal_input_decisions SET late=true WHERE owner_id='${person}'`,
      `DELETE FROM sophia.personal_input_decisions WHERE owner_id='${person}'`,
      `SELECT sophia.personal_answer_profile('{}'::jsonb)`,
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
          other.query(`SELECT sophia.cancel_personal_answer_input('k',$1,1,0)`, [s.inputId]),
          refusedWith('42501'),
        )
        await assert.rejects(other.query('SELECT * FROM sophia.personal_input_decisions'), refusedWith('42501'))
      } finally {
        await other.end()
      }
    }
  })

  it('a decision is never changed nor removed directly, even by the table owner; only the erasure cascades', async () => {
    const person = randomUUID()
    const s = await send(person, 'k', 'Kept.', profileFor(person, await payerFor(person, false)))
    await assert.rejects(
      owner('UPDATE sophia.personal_input_decisions SET late=NOT late WHERE input_id=$1', [s.inputId]),
      refusedWith('55000'),
    )
    await assert.rejects(
      owner('DELETE FROM sophia.personal_input_decisions WHERE input_id=$1', [s.inputId]),
      refusedWith('55000'),
    )
    assert.equal((await decisions(person, s.inputId)).length, 1)
  })

  it('0101 creates only new objects: no replaced function, no altered or dropped existing object', () => {
    const sql = readFileSync(
      new URL('../../../db/migrations/0101_personal_input_admission.sql', import.meta.url),
      'utf8',
    )
    assert.doesNotMatch(sql, /CREATE OR REPLACE/i)
    assert.doesNotMatch(sql, /\bDROP\b/i)
    const altered = [...sql.matchAll(/ALTER TABLE\s+([\w.]+)/gi)].map((m) => m[1])
    assert.deepEqual(altered, ['sophia.personal_input_decisions'])
  })
})

describe('E3 the record-only writer and the legacy paths are unchanged', () => {
  it('the record-only automatic_v1 send keeps its flat receipt and no decision', async () => {
    const person = randomUUID()
    const r = await withActor(w.api, person, 'write', (c) =>
      sendPersonalInput(c, 'k', { contract: PERSONAL_AUTOMATIC_V1, epoch: 0, text: 'Held.' }),
    )
    assert.ok(isPersonalInputReceipt(r))
    assert.equal((await turnOf(r.turnId)).reply, 'recorded')
    assert.equal(await withActor(w.api, person, 'read', (c) => readCurrentPersonalAnswerDecision(c, r.inputId)), null)
  })

  it('the legacy retry cannot re-ask a waiting automatic input (it is not failed)', async () => {
    const person = randomUUID()
    const s = await send(person, 'k', 'Waiting.', profileFor(person, await payerFor(person, false)))
    await assert.rejects(
      withActor(w.api, person, 'write', (c) => retryPersonalTurn(c, 'k-legacy-retry', s.turnId)),
      refusedWith('40001'),
    )
    assert.equal((await turnOf(s.turnId)).reply, 'recorded')
  })

  it('characterized for A2: an admitted turn left past two minutes reads failed, and the legacy retry re-asks it', async () => {
    // The A2 effect guard (not in this stage) must compare the decision's profile before any paid call on this path.
    const person = randomUUID()
    const s = await send(person, 'k', 'Admitted.', profileFor(person, await payerFor(person, true)))
    await owner(`UPDATE sophia.personal_turns SET asked_at=asked_at-interval '3 minutes' WHERE id=$1`, [s.turnId])
    assert.equal(await withActor(w.api, person, 'read', (c) => nextPersonalReply(c)), null, 'stale: failed')
    const r = await withActor(w.api, person, 'write', (c) => retryPersonalTurn(c, 'k-legacy-retry', s.turnId))
    assert.equal(r.operation, 'retry_turn')
    assert.equal((await turnOf(s.turnId)).reply, 'pending')
    assert.equal((await decisions(person, s.inputId)).length, 1, 'the legacy retry adds no decision')
  })
})

describe('the typed projections', () => {
  it('refuse a decision or receipt that is not exactly what 0101 writes', () => {
    const d: PersonalAnswerDecision = {
      seq: 1,
      operation: 'send',
      outcome: 'waiting',
      reason: 'payer_unavailable',
      late: false,
      epoch: 0,
      admittedAt: null,
      policy: 'personal-default-answer',
      policyVersion: 1,
      family: 'answer',
      basis: 'personal_default_addressee',
    }
    assert.equal(isPersonalAnswerDecision(d), true)
    for (const bad of [
      { ...d, seq: 2 },
      { ...d, outcome: 'admitted' },
      { ...d, reason: null },
      { ...d, late: 'no' },
      { ...d, extra: 1 },
      { ...d, operation: 'cancel' },
      { ...d, admittedAt: '2026-11-12T00:00:00Z' },
    ])
      assert.equal(isPersonalAnswerDecision(bad), false, JSON.stringify(bad))
    const r: PersonalAnswerReceipt = {
      operation: 'send_answer_input',
      revision: 2,
      turnId: randomUUID(),
      seq: 1,
      inputId: randomUUID(),
      answerContract: PERSONAL_ANSWER_V1,
      interactionContract: 'automatic_v1',
      contractVersion: 1,
      decision: d,
      suggestionId: null,
      noteId: null,
      releaseId: null,
      projectId: null,
      erased: null,
    }
    assert.equal(isPersonalAnswerReceipt(r), true)
    assert.equal(isPersonalAnswerReceipt({ ...r, operation: 'retry_answer_input' }), false, 'its own decision')
    assert.equal(isPersonalAnswerReceipt({ ...r, profile: {} }), false)
  })
})
