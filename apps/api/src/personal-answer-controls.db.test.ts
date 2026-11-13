// INC03-CC-003 A3 crossing (level: sql-run): the owner's control of an automatic Personal answer end to end on a
// disposable PostgreSQL, through the real API (buildApp, the restricted API role), the real CompanionRunner and the real
// live companion (liveCompanion), whose model service is a counting FAKE PersonalLlm: no provider, network, account or
// credential exists. Every person, payer, route, model and price is synthetic. Plan: docs/plans/personal-answers.md
// ("A3"). Races are made deterministic with barriers on the companion's own connections, placed before a named
// statement or before the COMMIT that follows it (never after a control's space fence while a reservation is expected
// to commit): a control then runs, or waits on the space lock (observed in pg_locks), and the barrier is released.
// Admitted originals are made with 0101's own SQL writer where a test needs one waiting without a wake.
// Every latch and every pending answer or control a test starts is registered when it is made; the test's own teardown
// (run after it returned or failed, never before its race) opens every latch, then waits a bounded time for that work,
// so a failed assertion cannot leave a call or a transaction held. A cleanup failure is reported beside the test's own.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it, type TestContext } from 'node:test'
import type { GenerateOptions, LlmCallConfig, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import * as wire from '@sophia/contracts/validate'
import { createPool, withActor } from '@sophia/persistence'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import { buildApp, type AppDeps } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { CompanionRunner, type Companion } from './companion.ts'
import { liveCompanion, liveSettings, PERSONAL_ROLE_DIGEST, type PersonalLlm } from './companion-live.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'

let db: TestDatabase
let pool: pg.Pool
let ownerPool: pg.Pool
const apps: FastifyInstance[] = []
const runners: CompanionRunner[] = []

async function owner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await ownerPool.query<T>(sql, params)).rows
}

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated', email: `${sub.slice(0, 8)}@sophia.test` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

/** Every latch not yet opened, and every registered pending work: what the file's teardown releases and waits for. */
const unopened = new Set<() => void>()
const pendingWork = new Set<Promise<unknown>>()
const DRAIN_MS = 30_000
const REACH_MS = 10_000

/** A release a test holds: `wait` until `open()`. Registered until opened. */
function latch(): { wait: Promise<void>; open: () => void } {
  const { promise, resolve } = Promise.withResolvers<void>()
  const open = () => {
    unopened.delete(open)
    resolve()
  }
  unopened.add(open)
  return { wait: promise, open }
}

/** `p`, or a failure naming `what` after `ms` (its timer always cleared). */
async function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}: not within ${String(ms)} ms`)), ms)
  })
  try {
    return await Promise.race([p, late])
  } finally {
    clearTimeout(timer)
  }
}

/** Waits, bounded, until every promise has settled; a rejection is the test's own result, not the drain's. */
const drain = (work: Iterable<Promise<unknown>>, what: string) =>
  within(Promise.allSettled(work), DRAIN_MS, `${what}: pending work`)

/**
 * What one test holds: its latches (gates included) and its pending work, each registered when made. Its teardown runs
 * only after the test returned or failed: it opens every latch first, then drains the work, bounded.
 */
function held(t: TestContext) {
  const latches: Array<() => void> = []
  const work: Array<Promise<unknown>> = []
  t.after(async () => {
    for (const open of latches) open()
    try {
      await drain(work, t.name)
    } catch (err) {
      t.diagnostic(`cleanup failure: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
  })
  return {
    latch() {
      const l = latch()
      latches.push(l.open)
      return l
    },
    track<T>(p: Promise<T>): Promise<T> {
      work.push(p)
      pendingWork.add(p)
      const done = () => pendingWork.delete(p)
      p.then(done, done)
      return p
    },
    gated(base: pg.Pool, at: string, how: 'before' | 'commit' | 'lostAck') {
      const g = gated(base, at, how)
      latches.push(g.release)
      return g
    },
  }
}

/** An AbortError, as a stopped stream ends. */
const aborted = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })

/** Until `gate` opens or `signal` aborts (then an AbortError); the abort listener is always removed. */
async function untilOpenOrAborted(gate: Promise<void>, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return gate
  if (signal.aborted) throw aborted()
  const { promise, reject } = Promise.withResolvers<never>()
  const onAbort = () => reject(aborted())
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    await Promise.race([gate, promise])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

type Prepare = 'ok' | 'throw' | 'mismatch' | 'wait_for_stop'

/**
 * The model service's preparation boundary, faked: counts every preparation and every stream asked (`asked`), and can
 * fail, change the route, wait to be stopped, or hold its stream at a latch.
 */
class FakeLlm implements PersonalLlm {
  prepared = 0
  asked = 0
  readonly prompts: string[] = []
  mode: Prepare = 'ok'
  streamGate: Promise<void> | null = null
  private readonly text: string
  constructor(text = 'A synthetic answer.') {
    this.text = text
  }
  async prepareCall(
    config: LlmCallConfig,
    signal?: AbortSignal,
  ): Promise<{ config: LlmCallConfig; stream(o: GenerateOptions): AsyncIterable<StreamChunk> }> {
    this.prepared += 1
    if (this.mode === 'throw') throw new Error('synthetic preparation failure')
    if (this.mode === 'wait_for_stop' && signal && !signal.aborted) {
      const stopped = Promise.withResolvers<void>()
      const onAbort = () => stopped.resolve()
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        await stopped.promise
      } finally {
        signal.removeEventListener('abort', onAbort)
      }
    }
    const resolved = this.mode === 'mismatch' ? { ...config, model: 'another-model' } : config
    const gate = this.streamGate
    const { text, prompts } = this
    const counted = () => {
      this.asked += 1
    }
    return {
      config: resolved,
      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        counted()
        const [message] = options.messages
        const [part] = message?.content ?? []
        prompts.push(part && 'text' in part ? part.text : '')
        if (gate) await untilOpenOrAborted(gate, options.signal)
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
  }
}

const CALL = { provider: 'synthetic-provider', model: 'synthetic-model', reasoningEffort: 'medium', maxTokens: 256 }
const PRICES = { input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 }

const rawSettings = (person: string, payer: string) => ({
  routeId: 'personal-synthetic',
  payer,
  owner: person,
  roleDigest: PERSONAL_ROLE_DIGEST,
  call: CALL,
  prices: PRICES,
  profile: { apiKeyEnv: 'SOPHIA_SYNTHETIC_NOT_A_KEY' },
})
const profileOf = (person: string, payer: string) => ({
  version: 1,
  owner: person,
  payer,
  routeId: 'personal-synthetic',
  roleDigest: PERSONAL_ROLE_DIGEST,
  ...CALL,
  prices: PRICES,
})

async function enrolled(): Promise<{ person: string; payer: string }> {
  const person = randomUUID()
  const payer = `p-${randomUUID().slice(0, 8)}`
  await owner(
    'INSERT INTO sophia.personal_companion_payers(payer,owner_id,allowance_micros) VALUES($1,$2,1000000000)',
    [payer, person],
  )
  return { person, payer }
}

const live = (person: string, payer: string, llm: FakeLlm, companionPool: pg.Pool = pool): Companion =>
  liveCompanion(liveSettings(JSON.stringify(rawSettings(person, payer))), llm, companionPool)

function api(companion: Companion | null, extra: Partial<AppDeps> = {}): FastifyInstance {
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const app = buildApp({ pool, verifyActor, companion, ...extra })
  apps.push(app)
  return app
}

/** The runner a test drives directly (watchMs small unless given, so a lost claim stops a call at once). */
function runner(companion: Companion, errors: unknown[] = [], watchMs = 100): CompanionRunner {
  const r = new CompanionRunner(pool, companion, (err) => errors.push(err), 15_000, watchMs)
  runners.push(r)
  return r
}

async function epochOf(person: string): Promise<number> {
  const [row] = await owner<{ epoch: string }>('SELECT epoch FROM sophia.personal_spaces WHERE owner_id=$1', [person])
  return Number(row?.epoch ?? 0)
}

/** One request as `as`: a write carries a key (fresh unless given) and the space's current epoch. */
async function call(
  app: FastifyInstance,
  method: 'GET' | 'POST',
  url: string,
  as: string,
  { body, key }: { body?: unknown; key?: string | undefined } = {},
) {
  const epoch = await epochOf(as)
  const res = await app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${await token(as)}`,
      'x-sophia-personal-epoch': String(epoch),
      ...(method === 'POST' ? { 'idempotency-key': key ?? randomUUID() } : {}),
    },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  })
  return {
    status: res.statusCode,
    body: res.body,
    json: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : null,
  }
}

const control = (app: FastifyInstance, as: string, inputId: string, body: Record<string, unknown>, key?: string) =>
  call(app, 'POST', `/api/v1/personal/answers/${inputId}/control`, as, {
    body: {
      controlContract: 'personal_answer_control_v1',
      ...body,
    },
    key,
  })
const admit = (
  app: FastifyInstance,
  as: string,
  inputId: string,
  { controlId, expectedRevision }: { controlId: string; expectedRevision: number },
  key?: string,
) =>
  call(app, 'POST', `/api/v1/personal/answers/${inputId}/control/admit`, as, {
    body: { controlContract: 'personal_answer_control_v1', controlId, expectedRevision },
    key,
  })

/** An Answer input decided by 0101's own SQL writer, as an earlier process left it: nothing is woken. */
async function admitted(person: string, payer: string, text = 'Automatic words') {
  const epoch = await epochOf(person)
  return withActor(pool, person, 'write', async (c) => {
    const { rows } = await c.query<{ r: { turnId: string; inputId: string; decision: { outcome: string } } }>(
      'SELECT sophia.send_personal_answer_input($1,$2,$3,$4,$5) AS r',
      [randomUUID(), 'personal_answer_v1', epoch, text, JSON.stringify(profileOf(person, payer))],
    )
    const r = rows[0]?.r
    assert.ok(r && r.decision.outcome === 'admitted')
    return { turnId: r.turnId, inputId: r.inputId }
  })
}

const reply = async (turnId: string) =>
  (await owner<{ reply: string }>('SELECT reply FROM sophia.personal_turns WHERE id=$1', [turnId]))[0]?.reply
const answers = async (turnId: string) =>
  Number(
    (await owner<{ n: string }>(`SELECT count(*) AS n FROM sophia.personal_turns WHERE reply_to=$1`, [turnId]))[0]?.n,
  )
const usage = (person: string) =>
  owner<{ call_id: string; state: string; reason: string | null }>(
    'SELECT call_id, state, reason FROM sophia.personal_companion_usage WHERE owner_id=$1 ORDER BY reserved_at',
    [person],
  )
const launches = (person: string) =>
  owner<{ state: string }>('SELECT state FROM sophia.personal_answer_launches WHERE owner_id=$1 ORDER BY tagged_at', [
    person,
  ])
const withheld = (person: string) =>
  owner<{ body: string; source: string }>(
    'SELECT body, source FROM sophia.personal_withheld_results WHERE owner_id=$1',
    [person],
  )

/**
 * Until the control's own session waits on a lock held by `blocker` (the companion's connection held at its barrier):
 * a control queued behind that COMMIT, observed as that waiter and that blocker, not as any lock wait.
 */
async function lockWaiter(blocker: number, ms = REACH_MS): Promise<void> {
  const end = Date.now() + ms
  for (;;) {
    const [row] = await owner<{ n: string }>(
      `SELECT count(*) AS n FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE '%sophia.control_personal_answer_input(%' AND $1 = ANY(pg_blocking_pids(pid))`,
      [blocker],
    )
    if (Number(row?.n) > 0) return
    if (Date.now() > end) assert.fail(`the control did not wait on the lock held by ${String(blocker)}`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

/**
 * The companion's own pool, with one barrier on its connections: before the first statement matching `at` (`before`),
 * or before the COMMIT of the transaction that ran it (`commit`); or, `lostAck`, that COMMIT succeeds and its
 * acknowledgement is lost (an error after it committed). `reached` resolves, bounded, when the barrier is met, with
 * the backend pid of the connection held there. The gate is a registered latch.
 */
function gated(
  base: pg.Pool,
  at: string,
  how: 'before' | 'commit' | 'lostAck',
): { pool: pg.Pool; reached: () => Promise<number>; release: () => void } {
  const reached = Promise.withResolvers<number>()
  const gate = latch()
  let used = false
  const wrap = (client: pg.PoolClient): pg.PoolClient => {
    let ran = false
    const pid: unknown = Reflect.get(client, 'processID')
    const backend = typeof pid === 'number' ? pid : -1
    const query = async (...args: unknown[]): Promise<unknown> => {
      const [first] = args
      const text = typeof first === 'string' ? first : ((first as { text?: string } | undefined)?.text ?? '')
      const run = () => (client.query as (...a: unknown[]) => Promise<unknown>)(...args)
      if (!used && text.includes(at)) {
        if (how === 'before') {
          used = true
          reached.resolve(backend)
          await gate.wait
        } else ran = true
      }
      if (!used && ran && text === 'COMMIT') {
        used = true
        if (how === 'commit') {
          reached.resolve(backend)
          await gate.wait
          return run()
        }
        await run()
        reached.resolve(backend)
        throw Object.assign(new Error('synthetic lost acknowledgement'), { code: '08006' })
      }
      return run()
    }
    return new Proxy(client, {
      get(target, key) {
        if (key === 'query') return query
        const value: unknown = Reflect.get(target, key)
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value
      },
    })
  }
  const proxied = new Proxy(base, {
    get(target, key) {
      if (key === 'connect') return async () => wrap(await target.connect())
      const value: unknown = Reflect.get(target, key)
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value
    },
  })
  return {
    pool: proxied,
    reached: () => within(reached.promise, REACH_MS, `the barrier at ${at} (${how})`),
    release: gate.open,
  }
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 16 })
  ownerPool = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
})
// Every latch still unopened is opened and every registered work drained first, then the runners (which wait for their
// running work: close is not an abort), the apps, the pools and the database; each step bounded. The first failure is
// rethrown after every later step was still attempted.
after(async () => {
  const failures: unknown[] = []
  const step = async (what: string, run: () => Promise<unknown>) => {
    try {
      await within(run(), DRAIN_MS, what)
    } catch (err) {
      failures.push(err)
    }
  }
  for (const open of unopened) open()
  await step('pending work', () => drain(pendingWork, 'file'))
  await step('runners', () => Promise.all(runners.map((r) => r.close())))
  await step('apps', () => Promise.all(apps.map((a) => a.close())))
  await step('api pool', () => pool.end())
  await step('owner pool', () => ownerPool.end())
  await step('database', () => db.drop())
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'file teardown')
})

describe('A3 the launch fence: a control before, between and after reservation and launch', () => {
  it('a control before the reservation: nothing is reserved or prepared', async (t) => {
    const s = held(t)
    const { person, payer } = await enrolled()
    const llm = new FakeLlm()
    const g = s.gated(pool, 'reserve_personal_answer_controlled', 'before')
    const r = runner(live(person, payer, llm, g.pool))
    const app = api(null)
    const x = await admitted(person, payer)
    const answering = s.track(r.answer(person, x.turnId))
    await g.reached()
    const c = await control(app, person, x.inputId, { action: 'cancel', expectedRevision: 0 })
    assert.equal(c.status, 202, c.body)
    assert.equal(wire.parsePersonalAnswerControlReceipt(c.json).phase, 'before_reservation')
    g.release()
    await answering
    assert.equal(llm.prepared, 0)
    assert.deepEqual(await usage(person), [])
    assert.equal(await reply(x.turnId), 'withdrawn')
    assert.equal(await answers(x.turnId), 0)
  })

  it('bound but not launched: the tag is denied and its reservation released; nothing is prepared', async (t) => {
    const s = held(t)
    const { person, payer } = await enrolled()
    const llm = new FakeLlm()
    const g = s.gated(pool, 'begin_personal_answer_launch', 'before')
    const r = runner(live(person, payer, llm, g.pool))
    const app = api(null)
    const x = await admitted(person, payer)
    const answering = s.track(r.answer(person, x.turnId))
    await g.reached()
    const c = await control(app, person, x.inputId, { action: 'cancel', expectedRevision: 0 })
    assert.equal(wire.parsePersonalAnswerControlReceipt(c.json).phase, 'before_launch')
    g.release()
    await answering
    assert.equal(llm.prepared, 0, 'a denied call never prepares')
    assert.deepEqual(
      (await usage(person)).map((u) => [u.state, u.reason]),
      [['released', 'withdrawn_before_launch']],
    )
    assert.deepEqual(
      (await launches(person)).map((l) => l.state),
      ['denied'],
    )
    assert.equal(await reply(x.turnId), 'withdrawn')
  })

  it('launched first, the control waiting on its COMMIT: at most the one granted call runs; its answer is withheld', async (t) => {
    const s = held(t)
    const { person, payer } = await enrolled()
    const llm = new FakeLlm('Words that came late')
    const g = s.gated(pool, 'begin_personal_answer_launch', 'commit')
    const r = runner(live(person, payer, llm, g.pool))
    const app = api(null)
    const x = await admitted(person, payer)
    const answering = s.track(r.answer(person, x.turnId))
    const blocker = await g.reached()
    const pending = s.track(control(app, person, x.inputId, { action: 'cancel', expectedRevision: 0 }))
    await lockWaiter(blocker)
    g.release()
    const c = await pending
    const receipt = wire.parsePersonalAnswerControlReceipt(c.json)
    assert.equal(receipt.phase, 'after_launch')
    assert.equal(receipt.prior.effect, 'possible')
    await answering
    assert.ok(llm.asked <= 1, 'never more than the one granted call')
    assert.deepEqual(
      (await launches(person)).map((l) => l.state),
      ['launching'],
    )
    assert.equal(await reply(x.turnId), 'withdrawn')
    assert.equal(await answers(x.turnId), 0, 'nothing written for withdrawn work')
    const [u] = await usage(person)
    if (llm.asked === 1 && u?.state === 'settled')
      assert.deepEqual(await withheld(person), [{ body: 'Words that came late', source: 'late_settlement' }])
    else assert.ok(u && u.state !== 'released', 'an asked or possibly asked call is never released')
  })

  it('a lost launch acknowledgement: nothing is prepared; the call stays possible, its replacement held', async (t) => {
    const s = held(t)
    const { person, payer } = await enrolled()
    const llm = new FakeLlm()
    const g = s.gated(pool, 'begin_personal_answer_launch', 'lostAck')
    const errors: unknown[] = []
    const r = runner(live(person, payer, llm, g.pool), errors)
    const app = api(null)
    const x = await admitted(person, payer)
    await s.track(r.answer(person, x.turnId))
    assert.equal(llm.prepared, 0, 'an unacknowledged grant never prepares')
    assert.deepEqual(
      (await launches(person)).map((l) => l.state),
      ['launching'],
    )
    const [u] = await usage(person)
    assert.equal(u?.state, 'reserved', 'not released: it may have launched')
    const c = await control(app, person, x.inputId, { action: 'replace', expectedRevision: 0, text: 'Instead this' })
    const receipt = wire.parsePersonalAnswerControlReceipt(c.json)
    assert.equal(receipt.phase, 'after_launch')
    assert.equal(receipt.prior.financial, 'unresolved')
    assert.equal(receipt.replacement?.state, 'held')
    assert.equal(receipt.replacement?.heldReason, 'prior_cost_unresolved')
  })
})

describe('A3 after the grant: preparing may be external', () => {
  it('a failed, mismatched or stopped preparation is held uncertain, never released; pre-0103 calls as before', async (t) => {
    const s = held(t)
    for (const [mode, reason] of [
      ['throw', 'prepare_unknown'],
      ['mismatch', 'prepare_unknown'],
    ] as const) {
      const { person, payer } = await enrolled()
      const llm = new FakeLlm()
      llm.mode = mode
      const r = runner(live(person, payer, llm))
      const x = await admitted(person, payer)
      await s.track(r.answer(person, x.turnId))
      assert.equal(llm.prepared, 1)
      assert.equal(llm.asked, 0)
      assert.deepEqual(
        (await usage(person)).map((u) => [u.state, u.reason]),
        [['uncertain', reason]],
        `${mode}: held`,
      )
    }
    // Stopped while preparing (the owner withdrew it: the claim went, the watch stopped the call): held, not released.
    {
      const { person, payer } = await enrolled()
      const llm = new FakeLlm()
      llm.mode = 'wait_for_stop'
      const r = runner(live(person, payer, llm))
      const app = api(null)
      const x = await admitted(person, payer)
      const answering = s.track(r.answer(person, x.turnId))
      for (let i = 0; i < 200 && llm.prepared === 0; i += 1) await new Promise((res) => setTimeout(res, 20))
      assert.equal(llm.prepared, 1)
      await s.track(control(app, person, x.inputId, { action: 'cancel', expectedRevision: 0 }))
      await answering
      assert.equal(llm.asked, 0)
      assert.deepEqual(
        (await usage(person)).map((u) => [u.state, u.reason]),
        [['uncertain', 'stopped_after_launch']],
      )
    }
    // Positively without 0103 (marker renamed): b760's release on a failed preparation, and no launch fence.
    const { person, payer } = await enrolled()
    const llm = new FakeLlm()
    llm.mode = 'throw'
    const r = runner(live(person, payer, llm))
    await owner(
      'ALTER FUNCTION sophia.personal_answer_controls_protocol() RENAME TO personal_answer_controls_protocol_absent',
    )
    try {
      const turn = await withActor(
        pool,
        person,
        'write',
        async (c) =>
          (
            await c.query<{ r: { turnId: string } }>(`SELECT sophia.send_personal_turn($1,'Legacy words') AS r`, [
              randomUUID(),
            ])
          ).rows[0]?.r.turnId,
      )
      assert.ok(turn)
      await s.track(r.answer(person, turn))
      assert.deepEqual(
        (await usage(person)).map((u) => [u.state, u.reason]),
        [['released', 'not_prepared']],
      )
      assert.deepEqual(await launches(person), [])
    } finally {
      await owner(
        'ALTER FUNCTION sophia.personal_answer_controls_protocol_absent() RENAME TO personal_answer_controls_protocol',
      )
    }
  })

  it('a late answer is withheld even when its settlement acknowledgement is lost, and is not reported unknown', async (t) => {
    const s = held(t)
    const { person, payer } = await enrolled()
    const llm = new FakeLlm('Late but whole')
    const stream = s.latch()
    llm.streamGate = stream.wait
    const g = s.gated(pool, 'settle_personal_companion_answer', 'lostAck')
    const errors: unknown[] = []
    // A long watch: the held stream must complete (its answer whole), not be stopped by the withdrawn claim.
    const r = runner(live(person, payer, llm, g.pool), errors, 60_000)
    const app = api(null)
    const x = await admitted(person, payer)
    const answering = s.track(r.answer(person, x.turnId))
    for (let i = 0; i < 200 && llm.asked === 0; i += 1) await new Promise((res) => setTimeout(res, 20))
    const c = await control(app, person, x.inputId, { action: 'cancel', expectedRevision: 0 })
    assert.equal(wire.parsePersonalAnswerControlReceipt(c.json).phase, 'after_launch')
    stream.open()
    await answering
    assert.deepEqual(await withheld(person), [{ body: 'Late but whole', source: 'late_settlement' }])
    assert.equal(await answers(x.turnId), 0)
    assert.ok(
      !errors.some((e) => e instanceof Error && e.message.includes('outcome is not known')),
      'the withheld answer of its own call is recognized',
    )
  })
})

describe('A3 controls survive paid admission off; replay; races; erasure', () => {
  it('cancel, held replace and refused admission with both paid gates off and no profile; replayed byte for byte', async () => {
    const { person, payer } = await enrolled()
    const off = api(null)
    const x = await admitted(person, payer)
    const replaceKey = randomUUID()
    const replaced = await control(
      off,
      person,
      x.inputId,
      { action: 'replace', expectedRevision: 0, text: 'Instead' },
      replaceKey,
    )
    assert.equal(replaced.status, 202, replaced.body)
    const receipt = wire.parsePersonalAnswerControlReceipt(replaced.json)
    assert.equal(receipt.replacement?.state, 'held')
    assert.equal(receipt.replacement?.heldReason, 'admission_off')
    const y = receipt.replacement.inputId
    const admitKey = randomUUID()
    const refused = await admit(off, person, y, { controlId: receipt.controlId, expectedRevision: 1 }, admitKey)
    assert.equal(refused.status, 202)
    assert.equal(wire.parsePersonalAnswerControlReceipt(refused.json).outcome, 'refused')

    const llm = new FakeLlm()
    const on = api(live(person, payer, llm), { personalAnswers: true, personalAnswerReplacementAdmission: true })
    const replay = await admit(on, person, y, { controlId: receipt.controlId, expectedRevision: 1 }, admitKey)
    assert.equal(replay.status, refused.status)
    assert.equal(replay.body, refused.body, 'a refused admission replays as it was, flags and profile notwithstanding')
    assert.equal(
      (await control(on, person, x.inputId, { action: 'replace', expectedRevision: 0, text: 'Instead' }, replaceKey))
        .body,
      replaced.body,
    )
    const applied = await admit(on, person, y, { controlId: receipt.controlId, expectedRevision: 1 })
    const ok = wire.parsePersonalAnswerControlReceipt(applied.json)
    assert.equal(ok.outcome, 'applied')
    assert.equal((ok.decision as { outcome?: string } | null)?.outcome, 'admitted')
    const yTurn = receipt.replacement.turnId
    for (let i = 0; i < 300 && (await reply(yTurn)) === 'pending'; i += 1)
      await new Promise((res) => setTimeout(res, 20))
    assert.equal(await reply(yTurn), 'answered', 'the admitted replacement is answered, once')
    assert.equal(llm.prepared, 1)
  })

  it('held admit and cancel race at one revision: exactly one wins; the path and the owner are bound', async () => {
    const { person, payer } = await enrolled()
    const off = api(null)
    const x = await admitted(person, payer)
    const r = wire.parsePersonalAnswerControlReceipt(
      (await control(off, person, x.inputId, { action: 'replace', expectedRevision: 0, text: 'Held' })).json,
    )
    const y = r.replacement?.inputId
    assert.ok(y)
    const other = await enrolled()
    assert.equal((await call(off, 'GET', `/api/v1/personal/answers/${y}/control`, other.person)).status, 422)
    assert.equal(
      (await admit(off, person, y, { controlId: randomUUID(), expectedRevision: 1 })).status,
      422,
      'another control id names no replacement',
    )
    assert.equal(
      (await admit(off, person, x.inputId, { controlId: r.controlId, expectedRevision: 1 })).status,
      422,
      'the path must be the replacement',
    )
    const [a, c] = await Promise.all([
      admit(off, person, y, { controlId: r.controlId, expectedRevision: 1 }),
      control(off, person, y, { action: 'cancel', expectedRevision: 1 }),
    ])
    const outcomes = [a, c].map((res) =>
      res.status === 202 ? wire.parsePersonalAnswerControlReceipt(res.json).outcome : res.status,
    )
    // Admission off: the admit, if first, is a refusal (no revision change) and the cancel then applies; if the cancel
    // is first, the admit then sees a withdrawn replacement (409).
    assert.ok(
      (outcomes[0] === 'refused' && outcomes[1] === 'applied') || (outcomes[0] === 409 && outcomes[1] === 'applied'),
      JSON.stringify(outcomes),
    )
    assert.equal((await control(off, person, y, { action: 'cancel', expectedRevision: 1 })).status, 409, 'stale')
  })

  it('an erasure refuses every older key; nothing of the controls is left', async () => {
    const { person, payer } = await enrolled()
    const off = api(null)
    const x = await admitted(person, payer)
    const key = randomUUID()
    assert.equal((await control(off, person, x.inputId, { action: 'cancel', expectedRevision: 0 }, key)).status, 202)
    assert.equal(
      (await call(off, 'POST', '/api/v1/personal/erasure', person, { body: { confirm: 'delete' } })).status,
      202,
    )
    const again = await control(off, person, x.inputId, { action: 'cancel', expectedRevision: 0 }, key)
    assert.equal(again.status, 409)
    assert.equal((again.json as { code?: string }).code, 'request_erased')
    assert.deepEqual(await owner('SELECT 1 FROM sophia.personal_answer_controls WHERE owner_id=$1', [person]), [])
  })
})

describe('A3 versioned owner reads and the old-reader boundary', () => {
  it('old unversioned reads refuse a controlled owner, an answered input and another pending turn included', async (t) => {
    const s = held(t)
    const { person, payer } = await enrolled()
    const llm = new FakeLlm('Published words')
    const r = runner(live(person, payer, llm))
    const off = api(null)
    const x = await admitted(person, payer, 'Answered then withdrawn')
    await s.track(r.answer(person, x.turnId))
    assert.equal(await reply(x.turnId), 'answered')
    const c = wire.parsePersonalAnswerControlReceipt(
      (await control(off, person, x.inputId, { action: 'cancel', expectedRevision: 0 })).json,
    )
    assert.equal(c.phase, 'after_publication')
    // Another, unrelated turn, still pending (nothing answers it here).
    await withActor(pool, person, 'write', (cl) =>
      cl.query(`SELECT sophia.send_personal_turn($1,'Still waiting')`, [randomUUID()]),
    )
    for (const url of [
      '/api/v1/personal',
      '/api/v1/personal/turns?after=0',
      '/api/v1/personal/turns/earlier?before=999',
      '/api/v1/personal/export',
    ]) {
      const res = await call(off, 'GET', url, person)
      assert.equal(res.status, 503, `${url}: ${res.body}`)
      assert.equal((res.json as { code?: string }).code, 'projection_unavailable')
    }
    const page = wire.parsePersonalControlledTurnPage(
      (await call(off, 'GET', '/api/v1/personal/answer-controls/turns', person)).json,
    )
    assert.equal(page.pending, true)
    const xTurn = page.turns.find((turn) => turn.id === x.turnId)
    assert.equal(xTurn?.reply, 'answered')
    assert.equal(xTurn?.input?.control, 'withdrawn')
    assert.equal(xTurn?.prompt, 'excluded')
    assert.equal(page.turns.find((turn) => turn.replyTo === x.turnId)?.prompt, 'excluded')
    const exported = wire.parsePersonalControlledExport(
      (await call(off, 'GET', '/api/v1/personal/answer-controls/export', person)).json,
    )
    assert.equal(exported.inputs.length, 1)
    assert.equal(exported.inputs[0]?.control.state, 'withdrawn')
    assert.equal(exported.inputs[0]?.route?.routeId, 'personal-synthetic')
    const view = wire.parsePersonalAnswerControlView(
      (await call(off, 'GET', `/api/v1/personal/answers/${x.inputId.toUpperCase()}/control`, person)).json,
    )
    assert.equal(view.prior.answer, 'published')
    // An owner without controls reads as before.
    const plain = await enrolled()
    await admitted(plain.person, plain.payer)
    assert.equal((await call(off, 'GET', '/api/v1/personal', plain.person)).status, 200)
  })

  it('answers 503 projection_unavailable without 0103, and unavailable when installation cannot be read', async () => {
    const { person, payer } = await enrolled()
    const x = await admitted(person, payer)
    await owner(
      'ALTER FUNCTION sophia.personal_answer_controls_protocol() RENAME TO personal_answer_controls_protocol_absent',
    )
    try {
      const fresh = api(null)
      const res = await call(fresh, 'GET', `/api/v1/personal/answers/${x.inputId}/control`, person)
      assert.equal(res.status, 503)
      assert.equal((res.json as { code?: string }).code, 'projection_unavailable')
      assert.equal((await call(fresh, 'GET', '/api/v1/personal', person)).status, 200, 'old reads as before')
    } finally {
      await owner(
        'ALTER FUNCTION sophia.personal_answer_controls_protocol_absent() RENAME TO personal_answer_controls_protocol',
      )
    }
  })

  it('pages the log by owner: another owner is a hole, never listed', async () => {
    const a = await enrolled()
    const b = await enrolled()
    const off = api(null)
    const xa1 = await admitted(a.person, a.payer)
    const xb = await admitted(b.person, b.payer)
    const xa2 = await admitted(a.person, a.payer)
    for (const [who, input] of [
      [a.person, xa1.inputId],
      [b.person, xb.inputId],
      [a.person, xa2.inputId],
    ] as const)
      assert.equal((await control(off, who, input, { action: 'cancel', expectedRevision: 0 })).status, 202)
    const log = wire.parsePersonalAnswerControlLog(
      (await call(off, 'GET', '/api/v1/personal/answer-controls/log', a.person)).json,
    )
    assert.deepEqual(
      log.items.map((i) => i.inputId),
      [xa1.inputId, xa2.inputId],
    )
    assert.ok((log.items[1]?.controlSeq ?? 0) - (log.items[0]?.controlSeq ?? 0) >= 2, "b's seq is a hole between them")
    const rest = wire.parsePersonalAnswerControlLog(
      (
        await call(
          off,
          'GET',
          `/api/v1/personal/answer-controls/log?after=${String(log.items[0]?.controlSeq)}`,
          a.person,
        )
      ).json,
    )
    assert.deepEqual(
      rest.items.map((i) => i.inputId),
      [xa2.inputId],
    )
  })
})
