// INC03-CC-003 A2 crossing (level: sql-run): Personal answers end to end on a disposable PostgreSQL, through the real
// API (buildApp, the restricted API role), the real CompanionRunner and the real live companion (liveCompanion), whose
// model service is a counting FAKE PersonalLlm here: no provider, network, account or credential exists. Every person,
// payer, route, model and price is synthetic. Plan: docs/plans/personal-answers.md (A2-P01..P07).
// Admitted automatic turns are made with 0101's SQL writer directly where a test needs one waiting without a wake (a
// turn left by an earlier process); every state no writer reaches is forged as the migration owner and says so.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
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
import { rehearsalCompanion } from './companion-rehearsal.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'

let db: TestDatabase
let pool: pg.Pool
let ownerPool: pg.Pool
const apps: FastifyInstance[] = []

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

/** The model service's preparation boundary, faked: counts every preparation and answers each call with `text`. */
class FakeLlm implements PersonalLlm {
  prepared = 0
  readonly prompts: string[] = []
  private readonly text: string
  constructor(text = 'A synthetic answer.') {
    this.text = text
  }
  prepareCall(
    config: LlmCallConfig,
  ): Promise<{ config: LlmCallConfig; stream(o: GenerateOptions): AsyncIterable<StreamChunk> }> {
    this.prepared += 1
    const { text, prompts } = this
    return Promise.resolve({
      config,
      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        const [message] = options.messages
        const [part] = message?.content ?? []
        prompts.push(part && 'text' in part ? part.text : '')
        await Promise.resolve()
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    })
  }
}

/** The live settings an operator writes, for `person` and `payer`, with any change of call or prices. */
interface Change {
  model?: string
  reasoningEffort?: string | null
  maxTokens?: number
  routeId?: string
  output?: number
}
const CALL = { provider: 'synthetic-provider', model: 'synthetic-model', reasoningEffort: 'medium', maxTokens: 256 }
const PRICES = { input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 }

type Request = readonly ['GET' | 'POST', string]

function rawSettings(person: string, payer: string, change: Change = {}) {
  return {
    routeId: change.routeId ?? 'personal-synthetic',
    payer,
    owner: person,
    roleDigest: PERSONAL_ROLE_DIGEST,
    call: {
      ...CALL,
      ...(change.model === undefined ? {} : { model: change.model }),
      ...(change.reasoningEffort === undefined ? {} : { reasoningEffort: change.reasoningEffort }),
      ...(change.maxTokens === undefined ? {} : { maxTokens: change.maxTokens }),
    },
    prices: { ...PRICES, ...(change.output === undefined ? {} : { output: change.output }) },
    profile: { apiKeyEnv: 'SOPHIA_SYNTHETIC_NOT_A_KEY' },
  }
}

/** The trusted A1 profile those settings make, written out here (as 0101 keeps it), independently of the API's. */
function profileOf(person: string, payer: string, change: Change = {}) {
  const raw = rawSettings(person, payer, change)
  return {
    version: 1,
    owner: person,
    payer,
    routeId: raw.routeId,
    roleDigest: PERSONAL_ROLE_DIGEST,
    provider: raw.call.provider,
    model: raw.call.model,
    reasoningEffort: raw.call.reasoningEffort,
    maxTokens: raw.call.maxTokens,
    prices: raw.prices,
  }
}

/** A person and the payer the operator enrolled for them (0073: one owner per payer). */
async function enrolled(): Promise<{ person: string; payer: string }> {
  const person = randomUUID()
  const payer = `p-${randomUUID().slice(0, 8)}`
  await owner(
    'INSERT INTO sophia.personal_companion_payers(payer,owner_id,allowance_micros) VALUES($1,$2,1000000000)',
    [payer, person],
  )
  return { person, payer }
}

function live(person: string, payer: string, llm: FakeLlm, change: Change = {}): Companion {
  return liveCompanion(liveSettings(JSON.stringify(rawSettings(person, payer, change))), llm, pool)
}

function api(companion: Companion | null, extra: Partial<AppDeps> = {}): FastifyInstance {
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const app = buildApp({ pool, verifyActor, companion, ...extra })
  apps.push(app)
  return app
}

/** One request as `as`: a write carries a key (fresh unless given) and the space's current epoch. */
async function call(app: FastifyInstance, [method, url]: Request, as: string, body?: unknown, key?: string) {
  const epoch = await epochOf(as)
  const res = await app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${await token(as)}`,
      ...(method === 'POST'
        ? { 'idempotency-key': key ?? randomUUID(), 'x-sophia-personal-epoch': String(epoch) }
        : {}),
    },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  })
  return {
    status: res.statusCode,
    body: res.body,
    json: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : null,
  }
}

async function epochOf(person: string): Promise<number> {
  const [row] = await owner<{ epoch: string }>('SELECT epoch FROM sophia.personal_spaces WHERE owner_id=$1', [person])
  return Number(row?.epoch ?? 0)
}

/** An Answer input decided by 0101's own SQL writer, as an earlier process left it: nothing is woken. */
async function admitted(
  person: string,
  profile: unknown,
  text = 'Automatic words',
): Promise<{ turnId: string; inputId: string; outcome: string }> {
  const epoch = await epochOf(person)
  const r = await withActor(pool, person, 'write', async (c) => {
    const { rows } = await c.query<{ r: { turnId: string; inputId: string; decision: { outcome: string } } }>(
      'SELECT sophia.send_personal_answer_input($1,$2,$3,$4,$5) AS r',
      [randomUUID(), 'personal_answer_v1', epoch, text, JSON.stringify(profile)],
    )
    const [row] = rows
    assert.ok(row)
    return row.r
  })
  return { turnId: r.turnId, inputId: r.inputId, outcome: r.decision.outcome }
}

interface TurnRow {
  reply: string
  seq: string
  body: string
}
const turn = async (id: string): Promise<TurnRow> => {
  const [row] = await owner<TurnRow>('SELECT reply, seq::text, body FROM sophia.personal_turns WHERE id=$1', [id])
  assert.ok(row)
  return row
}
/** Sophia's reply to a turn, or null. */
const answerOf = async (id: string): Promise<string | null> =>
  (
    await owner<{ body: string }>(`SELECT body FROM sophia.personal_turns WHERE reply_to=$1 AND author='sophia'`, [id])
  )[0]?.body ?? null

/** The turn's reply once it is no longer pending (answered or failed), within `ms`. */
async function settled(id: string, ms = 15_000): Promise<string> {
  const end = Date.now() + ms
  for (;;) {
    const { reply } = await turn(id)
    if (reply !== 'pending') return reply
    if (Date.now() > end) assert.fail(`turn ${id} still pending after ${String(ms)} ms`)
    await new Promise((r) => setTimeout(r, 50))
  }
}

const usage = async (person: string) =>
  owner<{ state: string; reason: string | null }>(
    'SELECT state, reason FROM sophia.personal_companion_usage WHERE owner_id=$1 ORDER BY reserved_at',
    [person],
  )

/** The refusal diagnostics kept for the person (0102), read as the migration owner; [] where the table is absent. */
async function refusals(person: string) {
  const [exists] = await owner<{ t: boolean }>(
    `SELECT to_regclass('sophia.personal_answer_effect_refusals') IS NOT NULL AS t`,
  )
  if (!exists?.t) return []
  return owner<{ reason: string; fields: string[]; attempts: number; decision_seq: number; input_id: string }>(
    'SELECT reason, fields, attempts, decision_seq, input_id FROM sophia.personal_answer_effect_refusals WHERE owner_id=$1 ORDER BY first_at',
    [person],
  )
}

/** A turn whose claim lapsed with the process answering it (forged: two minutes back), so it reads as failed. */
const lapse = (id: string) =>
  owner(
    `UPDATE sophia.personal_turns SET asked_at=now()-interval '3 minutes',
      answering_since=CASE WHEN answering_since IS NULL THEN NULL ELSE now()-interval '3 minutes' END WHERE id=$1`,
    [id],
  )

/** As an earlier process left it: the turn claimed, a call reserved through 0080, then `then` (keep or hold). */
async function earlierCall(person: string, payer: string, turnId: string, then: 'keep' | 'hold'): Promise<void> {
  await withActor(pool, person, 'write', async (c) => {
    const claim = (await c.query<{ k: string }>('SELECT sophia.claim_personal_reply($1) AS k', [turnId])).rows[0]?.k
    assert.ok(claim)
    const callId = randomUUID()
    await c.query('SELECT sophia.begin_companion_call($1)', [callId])
    const reserved = await c.query<{ o: string }>(
      `SELECT sophia.reserve_personal_answer($1,$2,'personal-synthetic',100,$3,$4) AS o`,
      [callId, payer, turnId, claim],
    )
    assert.equal(reserved.rows[0]?.o, 'reserved')
    if (then === 'keep')
      await c.query(
        `SELECT sophia.settle_personal_companion_answer($1,7,'{"inputTokens":1,"outputTokens":1}','Kept words',NULL)`,
        [callId],
      )
    else await c.query(`SELECT sophia.hold_personal_companion($1,'usage_unknown')`, [callId])
    await c.query('SELECT sophia.end_companion_call($1)', [callId])
  })
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 12 })
  ownerPool = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
})
after(async () => {
  for (const app of apps) await app.close()
  await pool.end()
  await ownerPool.end()
  await db.drop()
})

describe('A2 positives: a matched automatic answer and a legacy answer are each paid once', () => {
  it('Answer send (flag on) is admitted, resumed after commit and answered through the guard; a legacy send too', async () => {
    const { person, payer } = await enrolled()
    const llm = new FakeLlm()
    const app = api(live(person, payer, llm), { personalAnswers: true })
    const sent = await call(app, ['POST', '/api/v1/personal/answers'], person, {
      answerContract: 'personal_answer_v1',
      text: 'Please answer',
    })
    assert.equal(sent.status, 202, sent.body)
    const receipt = wire.parsePersonalAnswerReceipt(sent.json)
    assert.equal(receipt.decision.outcome, 'admitted')
    assert.equal(await settled(receipt.turnId), 'answered')
    assert.equal(await answerOf(receipt.turnId), 'A synthetic answer.')
    assert.equal(llm.prepared, 1)
    const legacy = await call(app, ['POST', '/api/v1/personal/turns'], person, { text: 'And a legacy one' })
    assert.equal(legacy.status, 202, legacy.body)
    assert.equal(await settled(String(legacy.json?.turnId)), 'answered')
    assert.equal(llm.prepared, 2)
    assert.deepEqual(
      (await usage(person)).map((u) => u.state),
      ['settled', 'settled'],
    )
    assert.deepEqual(await refusals(person), [])
  })
})

describe('A2 changed supported configurations refuse before the provider (flag off: the guard is not switched)', () => {
  it('R2: a legacy send wakes the oldest waiting automatic turn, refused under a changed price; the queue then answers the legacy turn', async () => {
    const { person, payer } = await enrolled()
    const llm = new FakeLlm()
    const app = api(live(person, payer, llm, { output: 0.75 }))
    // Ready (R1 finds nothing) before the automatic turn waits: only the send's wake (R2) can reach it.
    await app.ready()
    const auto = await admitted(person, profileOf(person, payer))
    assert.equal(auto.outcome, 'admitted')
    const sent = await call(app, ['POST', '/api/v1/personal/turns'], person, { text: 'Legacy hello' }, 'k-r2')
    assert.equal(sent.status, 202, sent.body)
    const legacyTurn = String(sent.json?.turnId)
    // The oldest waiting turn first: the automatic one is refused, never answered.
    assert.equal(await settled(auto.turnId), 'failed')
    assert.equal(await answerOf(auto.turnId), null)
    assert.equal(await settled(legacyTurn), 'answered')
    // Fresh paid effects: only the legacy turn's, and its prompt is the legacy words, never the automatic ones.
    assert.equal(llm.prepared, 1)
    assert.ok(llm.prompts[0]?.includes('Legacy hello'))
    assert.equal((await usage(person)).length, 1)
    assert.deepEqual(
      (await refusals(person)).map((r) => [r.reason, r.fields, r.attempts, r.decision_seq]),
      [['profile_mismatch', ['prices.output'], 1, 1]],
    )
    // A valid replay of the send wakes again after its commit: nothing waits, nothing more is paid or kept.
    const replay = await call(app, ['POST', '/api/v1/personal/turns'], person, { text: 'Legacy hello' }, 'k-r2')
    assert.equal(replay.body, sent.body)
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(llm.prepared, 1)
    assert.deepEqual(
      (await refusals(person)).map((r) => r.attempts),
      [1],
    )
  })

  it("the same owner's legacy retry of a failed automatic turn under a changed model is refused, bounded; the admitted configuration answers it", async () => {
    const { person, payer } = await enrolled()
    const auto = await admitted(person, profileOf(person, payer))
    // As a refusal or an earlier failure left it (forged: the companion failed it).
    await owner(`UPDATE sophia.personal_turns SET reply='failed' WHERE id=$1`, [auto.turnId])
    const changed = new FakeLlm()
    const app = api(live(person, payer, changed, { model: 'synthetic-model-2' }))
    for (const n of [1, 2]) {
      const retried = await call(app, ['POST', `/api/v1/personal/turns/${auto.turnId}/retry`], person, undefined)
      assert.equal(retried.status, 202, retried.body)
      assert.equal(await settled(auto.turnId), 'failed')
      assert.equal(changed.prepared, 0)
      assert.deepEqual(
        (await refusals(person)).map((r) => [r.reason, r.fields, r.attempts]),
        [['profile_mismatch', ['model'], n]],
      )
    }
    assert.equal((await usage(person)).length, 0)
    const same = new FakeLlm()
    const back = api(live(person, payer, same))
    assert.equal((await call(back, ['POST', `/api/v1/personal/turns/${auto.turnId}/retry`], person)).status, 202)
    assert.equal(await settled(auto.turnId), 'answered')
    assert.equal(same.prepared, 1)
  })

  it('R1: a restart under a changed route or effort refuses the waiting automatic turn; under the admitted configuration it is answered, in order', async () => {
    const { person, payer } = await enrolled()
    const first = await admitted(person, profileOf(person, payer), 'First automatic')
    const changed = new FakeLlm()
    await api(live(person, payer, changed, { routeId: 'personal-elsewhere' })).ready()
    assert.equal(await settled(first.turnId), 'failed')
    assert.equal(changed.prepared, 0)
    assert.deepEqual(
      (await refusals(person)).map((r) => r.fields),
      [['routeId']],
    )
    // Two waiting turns, then a restart under the admitted configuration: both answered, oldest first (queue chaining).
    const second = await admitted(person, profileOf(person, payer), 'Second automatic')
    const third = await admitted(person, profileOf(person, payer), 'Third automatic')
    const same = new FakeLlm()
    await api(live(person, payer, same)).ready()
    assert.equal(await settled(second.turnId), 'answered')
    assert.equal(await settled(third.turnId), 'answered')
    assert.equal(same.prepared, 2)
    assert.ok(same.prompts[0]?.includes('Second automatic') && same.prompts[1]?.includes('Third automatic'))
    // An effort the admission did not freeze is refused too (null vs medium).
    const fourth = await admitted(person, profileOf(person, payer), 'Fourth automatic')
    const effort = new FakeLlm()
    await api(live(person, payer, effort, { reasoningEffort: null })).ready()
    assert.equal(await settled(fourth.turnId), 'failed')
    assert.equal(effort.prepared, 0)
  })

  it('an unsupported live profile (an empty effort 0101 would refuse) refuses an automatic turn explicitly; legacy turns are answered', async () => {
    const { person, payer } = await enrolled()
    const llm = new FakeLlm()
    const app = api(live(person, payer, llm, { reasoningEffort: '' }))
    await app.ready()
    const auto = await admitted(person, profileOf(person, payer))
    const sent = await call(app, ['POST', '/api/v1/personal/turns'], person, { text: 'Legacy under it' })
    assert.equal(await settled(auto.turnId), 'failed')
    assert.equal(await settled(String(sent.json?.turnId)), 'answered')
    assert.equal(llm.prepared, 1)
    assert.deepEqual(
      (await refusals(person)).map((r) => [r.reason, r.fields]),
      [['profile_unsupported', []]],
    )
  })
})

describe('A2 kept, lost and stale outcomes come first and stay as they were', () => {
  it('a kept answer is written with no call under a changed or an unsupported configuration', async () => {
    for (const change of [{ model: 'synthetic-model-2' }, { reasoningEffort: '' }] satisfies Change[]) {
      const { person, payer } = await enrolled()
      const auto = await admitted(person, profileOf(person, payer))
      await earlierCall(person, payer, auto.turnId, 'keep')
      await lapse(auto.turnId)
      const llm = new FakeLlm()
      const app = api(live(person, payer, llm, change))
      assert.equal((await call(app, ['POST', `/api/v1/personal/turns/${auto.turnId}/retry`], person)).status, 202)
      assert.equal(await settled(auto.turnId), 'answered')
      assert.equal(await answerOf(auto.turnId), 'Kept words')
      assert.equal(llm.prepared, 0)
      assert.deepEqual(
        (await usage(person)).map((u) => u.state),
        ['settled'],
      )
      assert.deepEqual(await refusals(person), [])
    }
  })

  it('an uncertain earlier call stays lost: no call, no refusal, the ledger unchanged', async () => {
    const { person, payer } = await enrolled()
    const auto = await admitted(person, profileOf(person, payer))
    await earlierCall(person, payer, auto.turnId, 'hold')
    await lapse(auto.turnId)
    const llm = new FakeLlm()
    const app = api(live(person, payer, llm, { maxTokens: 128 }))
    assert.equal((await call(app, ['POST', `/api/v1/personal/turns/${auto.turnId}/retry`], person)).status, 202)
    assert.equal(await settled(auto.turnId), 'failed')
    assert.equal(llm.prepared, 0)
    assert.deepEqual(await usage(person), [{ state: 'uncertain', reason: 'usage_unknown' }])
    assert.deepEqual(await refusals(person), [])
  })
})

describe('A2 the rehearsal never answers an automatic turn', () => {
  it('a legacy send under the rehearsal fails the waiting automatic turn without answering it, and answers the legacy one', async () => {
    const { person, payer } = await enrolled()
    const auto = await admitted(person, profileOf(person, payer))
    const app = api(rehearsalCompanion(0))
    const sent = await call(app, ['POST', '/api/v1/personal/turns'], person, { text: 'Rehearse this' })
    assert.equal(await settled(auto.turnId), 'failed')
    assert.equal(await answerOf(auto.turnId), null)
    assert.equal(await settled(String(sent.json?.turnId)), 'answered')
    assert.equal((await usage(person)).length, 0)
  })
})

describe('A2 concurrency: claims, processes and erasure', () => {
  it('two processes resuming the same waiting turn pay for it once; under a changed configuration neither does', async () => {
    const { person, payer } = await enrolled()
    const auto = await admitted(person, profileOf(person, payer))
    const [a, b] = [new FakeLlm(), new FakeLlm()]
    const other = createPool(db.apiUrl, { max: 4 })
    try {
      const first = new CompanionRunner(pool, live(person, payer, a), () => undefined)
      const second = new CompanionRunner(
        other,
        liveCompanion(liveSettings(JSON.stringify(rawSettings(person, payer))), b, other),
        () => undefined,
      )
      await Promise.all([first.resume(person), second.resume(person)])
      assert.equal(await settled(auto.turnId), 'answered')
      assert.equal(a.prepared + b.prepared, 1)
      assert.equal((await usage(person)).length, 1)

      const next = await admitted(person, profileOf(person, payer))
      const [c, d] = [new FakeLlm(), new FakeLlm()]
      const third = new CompanionRunner(pool, live(person, payer, c, { output: 9 }), () => undefined)
      const fourth = new CompanionRunner(
        other,
        liveCompanion(liveSettings(JSON.stringify(rawSettings(person, payer, { output: 9 }))), d, other),
        () => undefined,
      )
      await Promise.all([third.resume(person), fourth.resume(person)])
      assert.equal(await settled(next.turnId), 'failed')
      assert.equal(c.prepared + d.prepared, 0)
      assert.deepEqual(
        (await refusals(person)).map((r) => r.attempts),
        [1],
      )
      await Promise.all([first.close(), second.close(), third.close(), fourth.close()])
    } finally {
      await other.end()
    }
  })

  it('an erasure waits for a guard holding the space, then deletes its refusal; a guard after an erasure finds nothing current', async () => {
    const { person, payer } = await enrolled()
    const auto = await admitted(person, profileOf(person, payer))
    const guarded = await pool.connect()
    const eraser = await pool.connect()
    try {
      await guarded.query('BEGIN')
      await guarded.query(`SELECT set_config('sophia.actor_id',$1,true)`, [person])
      const claim = (await guarded.query<{ k: string }>('SELECT sophia.claim_personal_reply($1) AS k', [auto.turnId]))
        .rows[0]?.k
      const callId = randomUUID()
      await guarded.query('SELECT sophia.begin_companion_call($1)', [callId])
      const outcome = await guarded.query<{ o: string }>(
        `SELECT sophia.reserve_personal_answer_guarded($1,$2,'personal-synthetic',100,$3,$4,$5) AS o`,
        [callId, payer, auto.turnId, claim, JSON.stringify(profileOf(person, payer, { model: 'other' }))],
      )
      assert.equal(outcome.rows[0]?.o, 'profile_mismatch')
      // The erasure, as the owner asks it, waits on the space the guard's transaction holds.
      await eraser.query('BEGIN')
      await eraser.query(`SELECT set_config('sophia.actor_id',$1,true)`, [person])
      const erasing = eraser.query(`SELECT sophia.erase_personal_space('k-erase','delete')`)
      const waited = async () =>
        (
          await owner<{ n: string }>(
            `SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%erase_personal_space%'`,
          )
        )[0]?.n === '1'
      for (let i = 0; i < 100 && !(await waited()); i += 1) await new Promise((r) => setTimeout(r, 20))
      assert.ok(await waited(), 'the erasure did not wait for the space')
      await guarded.query('COMMIT')
      await erasing
      await eraser.query('COMMIT')
      assert.deepEqual(await refusals(person), [])
      assert.equal((await usage(person)).length, 0)
    } finally {
      guarded.release()
      eraser.release()
    }
    // After the erasure: a new automatic turn's stale claim is not_current before anything is compared.
    const again = await admitted(person, profileOf(person, payer))
    const outcome = await withActor(pool, person, 'write', async (c) => {
      const callId = randomUUID()
      await c.query('SELECT sophia.begin_companion_call($1)', [callId])
      return (
        await c.query<{ o: string }>(
          `SELECT sophia.reserve_personal_answer_guarded($1,$2,'personal-synthetic',100,$3,$4,NULL) AS o`,
          [callId, payer, again.turnId, randomUUID()],
        )
      ).rows[0]?.o
    })
    assert.equal(outcome, 'not_current')
    assert.deepEqual(await refusals(person), [])
  })
})

describe('A2 shutdown and wake discipline', () => {
  it('no read or call after shutdown; a write that did not commit wakes nothing', async () => {
    const { person, payer } = await enrolled()
    const llm = new FakeLlm()
    const app = api(live(person, payer, llm))
    await app.ready()
    const auto = await admitted(person, profileOf(person, payer))
    const runner = new CompanionRunner(pool, live(person, payer, llm), () => undefined)
    await runner.close()
    await runner.resume(person)
    assert.equal(await turn(auto.turnId).then((t) => t.reply), 'pending')
    assert.equal(llm.prepared, 0)
    // A legacy send against a stale epoch is refused (409) before anything commits: nothing is woken.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/personal/turns',
      headers: {
        authorization: `Bearer ${await token(person)}`,
        'idempotency-key': randomUUID(),
        'x-sophia-personal-epoch': '7',
      },
      payload: { text: 'Too late' },
    })
    assert.equal(res.statusCode, 409, res.body)
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(await turn(auto.turnId).then((t) => t.reply), 'pending')
    assert.equal(llm.prepared, 0)
  })

  it("R1 is for the live companion's one owner only: a rehearsal start, and another owner, resume nothing", async () => {
    const { person, payer } = await enrolled()
    const legacyTurn = await withActor(pool, person, 'write', async (c) =>
      String(
        (
          await c.query<{ r: { turnId: string } }>(`SELECT sophia.send_personal_turn($1,'Waiting') AS r`, [
            randomUUID(),
          ])
        ).rows[0]?.r.turnId,
      ),
    )
    await api(rehearsalCompanion(0)).ready()
    const other = await enrolled()
    const llm = new FakeLlm()
    await api(live(other.person, other.payer, llm)).ready()
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(await turn(legacyTurn).then((t) => t.reply), 'pending')
    assert.equal(llm.prepared, 0)
    void payer
  })
})

describe('A2 the Answer HTTP surface (A53)', () => {
  it('is off by default (404), and on only with a live companion whose profile 0101 accepts', async () => {
    const { person, payer } = await enrolled()
    const off = api(live(person, payer, new FakeLlm()))
    for (const [method, url, body] of [
      ['POST', '/api/v1/personal/answers', { answerContract: 'personal_answer_v1', text: 'x' }],
      ['POST', `/api/v1/personal/answers/${randomUUID()}/retry`, { expectedSeq: 1 }],
      ['POST', `/api/v1/personal/answers/${randomUUID()}/cancel`, { expectedSeq: 1 }],
      ['GET', `/api/v1/personal/answers/${randomUUID()}/decisions`, undefined],
    ] as const)
      assert.equal((await call(off, [method, url], person, body)).status, 404)
    assert.equal(
      (await withActor(pool, person, 'read', (c) => c.query('SELECT 1 FROM sophia.personal_inputs'))).rowCount,
      0,
    )
    const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
    for (const companion of [null, rehearsalCompanion(0), live(person, payer, new FakeLlm(), { reasoningEffort: '' })])
      assert.throws(() => buildApp({ pool, verifyActor, companion, personalAnswers: true }), /personalAnswers requires/)
  })

  it('closed requests, foreign owners, replays, waiting, retry, cancel and the effect-free decision read', async () => {
    const { person, payer } = await enrolled()
    const llm = new FakeLlm()
    const app = api(live(person, payer, llm), { personalAnswers: true })
    const url = '/api/v1/personal/answers'
    for (const body of [
      { text: 'x' },
      { answerContract: 'automatic_v1', text: 'x' },
      { answerContract: 'personal_answer_v1', text: '' },
      { answerContract: 'personal_answer_v1', text: 'x'.repeat(4001) },
      { answerContract: 'personal_answer_v1', text: 'x', profile: profileOf(person, payer) },
      { answerContract: 'personal_answer_v1', text: 'x', payer },
      { answerContract: 'personal_answer_v1', text: 'x', routeId: 'personal-synthetic' },
      { answerContract: 'personal_answer_v1', text: 'x', interactionContract: 'automatic_v1' },
    ])
      assert.equal((await call(app, ['POST', url], person, body)).status, 422, JSON.stringify(body))
    // Someone the companion does not answer live: 503, nothing kept, nothing of the enrolled owner said.
    const stranger = randomUUID()
    const refused = await call(app, ['POST', url], stranger, { answerContract: 'personal_answer_v1', text: 'Hi' })
    assert.equal(refused.status, 503)
    assert.ok(!refused.body.includes(person) && !refused.body.includes(payer))
    assert.equal((await owner('SELECT 1 FROM sophia.personal_inputs WHERE owner_id=$1', [stranger])).length, 0)

    // Waiting while the payer is not admitted for the owner (the operator moved it away), then retried once it is.
    await owner('UPDATE sophia.personal_companion_payers SET owner_id=$2 WHERE payer=$1', [payer, randomUUID()])
    const waiting = await call(
      app,
      ['POST', url],
      person,
      { answerContract: 'personal_answer_v1', text: 'Later' },
      'k-wait',
    )
    assert.equal(waiting.status, 202, waiting.body)
    const w = wire.parsePersonalAnswerReceipt(waiting.json)
    assert.equal(w.decision.outcome, 'waiting')
    assert.equal(
      (await call(app, ['POST', url], person, { answerContract: 'personal_answer_v1', text: 'Later' }, 'k-wait')).body,
      waiting.body,
    )
    const cancelled = await call(app, ['POST', url], person, {
      answerContract: 'personal_answer_v1',
      text: 'Never mind',
    })
    const x = wire.parsePersonalAnswerReceipt(cancelled.json)
    await owner('UPDATE sophia.personal_companion_payers SET owner_id=$2 WHERE payer=$1', [payer, person])
    assert.equal((await call(app, ['POST', `${url}/${w.inputId}/retry`], person, { expectedSeq: 2 })).status, 409)
    const retried = await call(app, ['POST', `${url}/${w.inputId}/retry`], person, { expectedSeq: 1 })
    assert.equal(retried.status, 202, retried.body)
    assert.equal(wire.parsePersonalAnswerReceipt(retried.json).decision.outcome, 'admitted')
    assert.equal(await settled(w.turnId), 'answered')
    assert.equal(llm.prepared, 1)

    // Cancel: terminal, wakes nothing; again is a state the client caused (409), in our words.
    const c1 = await call(app, ['POST', `${url}/${x.inputId}/cancel`], person, { expectedSeq: 1 })
    assert.equal(wire.parsePersonalAnswerReceipt(c1.json).decision.outcome, 'cancelled')
    const c2 = await call(app, ['POST', `${url}/${x.inputId}/cancel`], person, { expectedSeq: 2 })
    assert.equal(c2.status, 409)
    assert.equal(c2.json?.code, 'invalid_state')
    assert.ok(!c2.body.includes('cancelled') && !c2.body.includes('sophia.'))

    // The decision read: in order, no profile, payer, route or model; another owner's and an unknown id read alike.
    const effectsBefore = { usage: (await usage(person)).length, prepared: llm.prepared }
    const read = await call(app, ['GET', `${url}/${w.inputId}/decisions`], person)
    assert.equal(read.status, 200, read.body)
    const list = wire.parsePersonalAnswerDecisionList(read.json)
    assert.deepEqual(
      list.decisions.map((d) => [d.decision.seq, d.decision.outcome]),
      [
        [1, 'waiting'],
        [2, 'admitted'],
      ],
    )
    for (const secret of ['profile', payer, 'personal-synthetic', 'synthetic-model', 'prices'])
      assert.ok(!read.body.includes(secret), secret)
    const foreign = await call(app, ['GET', `${url}/${w.inputId}/decisions`], stranger)
    const unknown = await call(app, ['GET', `${url}/${randomUUID()}/decisions`], person)
    assert.deepEqual([foreign.status, foreign.json?.code], [unknown.status, unknown.json?.code])
    assert.equal(foreign.json?.code, 'not_found')
    assert.deepEqual({ usage: (await usage(person)).length, prepared: llm.prepared }, effectsBefore)
  })

  it("A52's record-only input keeps its body and flat receipt whatever the Answer switch, and is never answered", async () => {
    const { person, payer } = await enrolled()
    const llm = new FakeLlm()
    const off = api(live(person, payer, llm), { personalInputs: true })
    const on = api(live(person, payer, llm), { personalInputs: true, personalAnswers: true })
    const body = { interactionContract: 'automatic_v1', text: 'Held words' }
    const first = await call(off, ['POST', '/api/v1/personal/inputs'], person, body, 'k-a52')
    assert.equal(first.status, 202, first.body)
    const again = await call(on, ['POST', '/api/v1/personal/inputs'], person, body, 'k-a52')
    assert.equal(again.body, first.body)
    assert.deepEqual(Object.keys(first.json ?? {}).toSorted(), ['input', 'revision', 'turn'])
    await call(on, ['POST', '/api/v1/personal/turns'], person, { text: 'After it' })
    await new Promise((r) => setTimeout(r, 300))
    const held = (first.json?.turn as { id: string } | undefined)?.id ?? ''
    assert.equal(await turn(held).then((t) => t.reply), 'recorded')
    assert.equal(llm.prompts.filter((p) => p.endsWith('Held words')).length, 0)
  })

  it('/ready requires 0101 and 0102 only with the switch on', async () => {
    const { person, payer } = await enrolled()
    const on = api(live(person, payer, new FakeLlm()), { personalAnswers: true })
    const offApp = api(live(person, payer, new FakeLlm()))
    await owner('ALTER TABLE sophia.personal_answer_effect_refusals RENAME TO personal_answer_effect_refusals_absent')
    try {
      assert.equal((await on.inject({ method: 'GET', url: '/ready' })).statusCode, 503)
      assert.equal((await offApp.inject({ method: 'GET', url: '/ready' })).statusCode, 200)
    } finally {
      await owner('ALTER TABLE sophia.personal_answer_effect_refusals_absent RENAME TO personal_answer_effect_refusals')
    }
    assert.equal((await on.inject({ method: 'GET', url: '/ready' })).statusCode, 200)
  })
})

/** The spellings A53's `format: uuid` accepts for one id: lowercase, uppercase, and with the URN prefix. */
const spellings = (id: string) => ({
  lower: id,
  upper: id.toUpperCase(),
  urn: `urn:uuid:${id}`,
  URN: `URN:UUID:${id.toUpperCase()}`,
})

describe('A2-F01 the declared UUID language (format uuid) on the three input routes', () => {
  const decisionCount = async (inputId: string) =>
    Number(
      (
        await owner<{ n: string }>('SELECT count(*) AS n FROM sophia.personal_input_decisions WHERE input_id=$1', [
          inputId,
        ])
      )[0]?.n,
    )

  it('reads, retries and cancels one input under every accepted spelling, and replays one receipt across them', async () => {
    const { person, payer } = await enrolled()
    const llm = new FakeLlm()
    const app = api(live(person, payer, llm), { personalAnswers: true })
    const url = '/api/v1/personal/answers'
    // Fresh waiting inputs (the payer moved away by the operator): three to retry, three to cancel.
    await owner('UPDATE sophia.personal_companion_payers SET owner_id=$2 WHERE payer=$1', [payer, randomUUID()])
    const waitingInput = async (text: string) => {
      const r = await call(app, ['POST', url], person, { answerContract: 'personal_answer_v1', text })
      assert.equal(r.status, 202, r.body)
      const receipt = wire.parsePersonalAnswerReceipt(r.json)
      assert.equal(receipt.decision.outcome, 'waiting')
      return receipt.inputId
    }
    const forms = ['lower', 'upper', 'urn'] as const
    const toRetry = [
      await waitingInput('Retry lower'),
      await waitingInput('Retry upper'),
      await waitingInput('Retry urn'),
    ]
    const toCancel = [
      await waitingInput('Cancel lower'),
      await waitingInput('Cancel upper'),
      await waitingInput('Cancel urn'),
    ]

    // GET: every spelling reads the same list, named by its one canonical id.
    const [first] = toRetry
    assert.ok(first)
    const reads = await Promise.all(
      Object.values(spellings(first)).map((id) => call(app, ['GET', `${url}/${id}/decisions`], person)),
    )
    for (const read of reads) {
      assert.equal(read.status, 200, read.body)
      assert.equal(read.body, reads[0]?.body)
      assert.equal(wire.parsePersonalAnswerDecisionList(read.json).inputId, first)
    }

    // Cancel at the correct current seq (1) under each spelling: each actually cancelled, nothing woken or paid.
    const cancels: { key: string; body: string; inputId: string }[] = []
    for (const [i, form] of forms.entries()) {
      const inputId = toCancel[i] ?? ''
      const key = `k-cancel-${form}`
      const r = await call(app, ['POST', `${url}/${spellings(inputId)[form]}/cancel`], person, { expectedSeq: 1 }, key)
      assert.equal(r.status, 202, `${form}: ${r.body}`)
      const receipt = wire.parsePersonalAnswerReceipt(r.json)
      assert.deepEqual([receipt.inputId, receipt.decision.seq, receipt.decision.outcome], [inputId, 2, 'cancelled'])
      cancels.push({ key, body: r.body, inputId })
    }
    assert.equal(llm.prepared, 0)

    // Retry at the correct current seq once the payer is admitted again: admitted under each spelling, then answered.
    await owner('UPDATE sophia.personal_companion_payers SET owner_id=$2 WHERE payer=$1', [payer, person])
    const retries: { key: string; body: string; inputId: string; turnId: string }[] = []
    for (const [i, form] of forms.entries()) {
      const inputId = toRetry[i] ?? ''
      const key = `k-retry-${form}`
      const r = await call(app, ['POST', `${url}/${spellings(inputId)[form]}/retry`], person, { expectedSeq: 1 }, key)
      assert.equal(r.status, 202, `${form}: ${r.body}`)
      const receipt = wire.parsePersonalAnswerReceipt(r.json)
      assert.deepEqual([receipt.inputId, receipt.decision.seq, receipt.decision.outcome], [inputId, 2, 'admitted'])
      retries.push({ key, body: r.body, inputId, turnId: receipt.turnId })
    }
    for (const r of retries) assert.equal(await settled(r.turnId), 'answered')
    assert.equal(llm.prepared, 3)
    const paid = (await usage(person)).length

    // Same key and expected seq under every other spelling: the identical receipt, no second decision or effect.
    for (const done of [
      ...cancels.map((c) => ({ ...c, op: 'cancel' })),
      ...retries.map((r) => ({ ...r, op: 'retry' })),
    ]) {
      for (const id of Object.values(spellings(done.inputId))) {
        const again = await call(app, ['POST', `${url}/${id}/${done.op}`], person, { expectedSeq: 1 }, done.key)
        assert.equal(again.status, 202, again.body)
        assert.equal(again.body, done.body)
      }
      assert.equal(await decisionCount(done.inputId), 2)
    }
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(llm.prepared, 3)
    assert.equal((await usage(person)).length, paid)

    // A different input under a used key is still a conflict, whatever its spelling.
    const conflict = await call(
      app,
      ['POST', `${url}/${spellings(toCancel[1] ?? '').upper}/cancel`],
      person,
      { expectedSeq: 1 },
      'k-cancel-lower',
    )
    assert.deepEqual([conflict.status, conflict.json?.code], [409, 'idempotency_conflict'])
  })

  it("still refuses what format uuid refuses, and reads another owner's or an unknown input alike in any spelling", async () => {
    const { person, payer } = await enrolled()
    const llm = new FakeLlm()
    const app = api(live(person, payer, llm), { personalAnswers: true })
    const url = '/api/v1/personal/answers'
    const id = randomUUID()
    for (const bad of [
      'not-a-uuid',
      id.slice(1),
      `${id}0`,
      `{${id}}`,
      `urn:uuid:${id.slice(1)}`,
      `urn:${id}`,
      id.replaceAll('-', ''),
      `${id.slice(0, 8)}_${id.slice(9)}`,
    ]) {
      const path = encodeURIComponent(bad)
      assert.equal((await call(app, ['GET', `${url}/${path}/decisions`], person)).status, 422, bad)
      assert.equal((await call(app, ['POST', `${url}/${path}/retry`], person, { expectedSeq: 1 })).status, 422, bad)
      assert.equal((await call(app, ['POST', `${url}/${path}/cancel`], person, { expectedSeq: 1 })).status, 422, bad)
    }
    const sent = await call(app, ['POST', url], person, { answerContract: 'personal_answer_v1', text: 'Mine' })
    const mine = wire.parsePersonalAnswerReceipt(sent.json).inputId
    await settled(wire.parsePersonalAnswerReceipt(sent.json).turnId)
    const stranger = randomUUID()
    const unknown = await call(app, ['GET', `${url}/${randomUUID().toUpperCase()}/decisions`], person)
    for (const form of Object.values(spellings(mine))) {
      const foreign = await call(app, ['GET', `${url}/${form}/decisions`], stranger)
      assert.deepEqual([foreign.status, foreign.json?.code], [unknown.status, unknown.json?.code])
      assert.equal(foreign.json?.code, 'not_found')
    }
    // A stranger's cancel of the owner's input, in any spelling, finds no input of theirs.
    const cancel = await call(app, ['POST', `${url}/${spellings(mine).urn}/cancel`], stranger, { expectedSeq: 1 })
    assert.equal(cancel.json?.code, 'not_found')
    assert.equal(await decisionCount(mine), 1)
  })
})
