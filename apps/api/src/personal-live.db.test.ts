// FND-B3-PERSONAL-LIVE-01 crossing (level: sql-run): the live personal companion over real HTTP, the real API on its
// restricted role and PostgreSQL (0073), its model service composed from the installed dsh packages (cordis, dsh-llm,
// the pinned pi-ai adapter) and its one route pointed at a LOCAL TEST DOUBLE of the provider's endpoint
// (tests/support/mock-responses.mjs). No provider, network, account or real credential: the route's credential reference
// names a variable this test process sets to a fake value, and nothing leaves 127.0.0.1.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import { parsePersonalReceipt, parsePersonalSpace, parsePersonalTurnPage } from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  startMockResponses,
  type MockResponses,
  type MockResponsesRequest,
} from '../../../tests/support/mock-responses.mjs'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { personalCompanionFrom, type ConfiguredCompanion } from './companion-config.ts'
import { PERSONAL_ROLE_DIGEST, PERSONAL_SYSTEM } from './companion-live.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const KEY_REF = 'SOPHIA_TEST_PERSONAL_ROUTE_KEY'
const FAKE_KEY = 'test-only-not-a-credential'

type Double = MockResponses
type Recorded = MockResponsesRequest

let db: TestDatabase
let pool: pg.Pool
let double: Double
const apps: FastifyInstance[] = []
const companions: ConfiguredCompanion[] = []

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated', email: `${sub.slice(0, 8)}@sophia.test` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

/** The route's settings as an operator writes them (SOPHIA_PERSONAL_COMPANION), its provider the local double. */
const settingsFor = (payer: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    routeId: 'personal-test',
    payer,
    roleDigest: PERSONAL_ROLE_DIGEST,
    call: { provider: 'openai-personal-test', model: 'gpt-6-luna', reasoningEffort: 'high', maxTokens: 512 },
    prices: { input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 },
    profile: {
      displayName: 'Test double (personal)',
      apiKeyEnv: KEY_REF,
      api: 'openai-responses',
      baseURL: double.baseURL,
      defaultMaxTokens: 512,
      models: [
        {
          id: 'gpt-6-luna',
          name: 'GPT-6 Luna',
          contextWindow: 272000,
          maxTokens: 512,
          input: ['text'],
          reasoningEfforts: { low: 'low', medium: 'medium', high: 'high' },
          compat: { supportsStrictMode: false, supportsLongCacheRetention: false },
        },
      ],
    },
    ...extra,
  })

const env = (payer: string) => ({
  SOPHIA_COMPANION: 'live',
  SOPHIA_PERSONAL_COMPANION: settingsFor(payer),
  [KEY_REF]: FAKE_KEY,
})

/** An API on the restricted role with the live companion its configuration gives, listening on 127.0.0.1. */
async function liveApi(payer: string): Promise<string> {
  const configured = await personalCompanionFrom(env(payer), pool)
  companions.push(configured)
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const app = buildApp({ pool, verifyActor, companion: configured.companion })
  apps.push(app)
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}

async function call(at: string, path: string, as: string, body?: unknown, epoch?: number) {
  const res = await fetch(`${at}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${await token(as)}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json', 'idempotency-key': randomUUID() }),
      ...(epoch === undefined ? {} : { 'x-sophia-personal-epoch': String(epoch) }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  return { status: res.status, json: text ? (JSON.parse(text) as unknown) : null }
}

const space = async (at: string, as: string) => parsePersonalSpace((await call(at, '/api/v1/personal', as)).json)

/** A write as the Studio makes it: against the epoch it last read. */
async function write(at: string, path: string, as: string, body: unknown) {
  const { epoch } = await space(at, as)
  const r = await call(at, path, as, body, epoch)
  assert.equal(r.status, 202, JSON.stringify(r.json))
  return parsePersonalReceipt(r.json)
}

/** Poll as a client does until no reply is pending. */
async function settled(at: string, as: string) {
  for (let i = 0; i < 100; i++) {
    const page = parsePersonalTurnPage((await call(at, '/api/v1/personal/turns?after=0', as)).json)
    if (!page.pending) return page
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('the companion never settled')
}

/** As the migration owner: what no API role may do (admit a payer, reconcile), and reading 0073's rows. */
async function owner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await c.end()
  }
}

interface UsageRow {
  owner_id: string
  payer: string
  state: string
  reserved_micros: string
  used_micros: string | null
  usage: Record<string, number> | null
  reason: string | null
}
const usage = (payer: string) =>
  owner<UsageRow>(
    `SELECT owner_id, payer, state, reserved_micros, used_micros, usage, reason
     FROM sophia.personal_companion_usage WHERE payer=$1 ORDER BY reserved_at`,
    [payer],
  )

const recorded = (): Recorded[] => double.requests
const sentText = (r: Recorded) => JSON.stringify(r.body)

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 8 })
  double = await startMockResponses()
  // The fake credential lives in this test process only: the adapter resolves the reference from the environment.
  process.env[KEY_REF] = FAKE_KEY
  await owner(`INSERT INTO sophia.personal_companion_payers(payer, allowance_micros) VALUES
    ('test-payer', 1000000), ('tight-payer', 10), ('held-payer', 1000000), ('stop-payer', 1000000)`)
})

after(async () => {
  for (const app of apps) await app.close()
  for (const c of companions) await c.dispose()
  await double.close()
  await pool.end()
  await db.drop()
  Reflect.deleteProperty(process.env, KEY_REF)
})

describe('the live personal companion (local provider double)', () => {
  it('answers one turn through the composed dsh route, from the owner’s context only, settled from its usage', async () => {
    const at = await liveApi('test-payer')
    const ANA = randomUUID()
    const OUT = randomUUID()
    await seedProject(db.ownerUrl, { title: 'Project canary title', admin: ANA, editors: [] })
    // Another person's own space, and Ana's note: only Ana's may reach her answer.
    await write(at, '/api/v1/personal/notes', OUT, { text: 'out-of-space canary note' })
    await write(at, '/api/v1/personal/notes', ANA, { text: 'Ana keeps this note' })
    const sentBefore = recorded().length
    double.script({
      text: 'That sounds like a good plan.\nNote: Plan Thursday first',
      usage: { input_tokens: 120, output_tokens: 30 },
    })
    await write(at, '/api/v1/personal/turns', ANA, { text: 'I want to plan Thursday.' })
    const page = await settled(at, ANA)

    const reply = page.turns.find((t) => t.author === 'sophia')
    assert.equal(reply?.text, 'That sounds like a good plan.')
    assert.equal(reply.suggestion?.text, 'Plan Thursday first')
    assert.equal(reply.suggestion.state, 'open', 'a suggestion stays a suggestion until kept')
    assert.equal(page.turns.find((t) => t.author === 'person')?.reply, 'answered')

    // Exactly one provider request, on the pinned route, with the fixed instruction and no tools.
    const sent = recorded().slice(sentBefore)
    assert.equal(sent.length, 1)
    const [request] = sent
    assert.ok(request)
    assert.equal(request.body.model, 'gpt-6-luna')
    assert.equal(request.headers.authorization, `Bearer ${FAKE_KEY}`, 'the credential came by its reference')
    assert.ok(sentText(request).includes('I want to plan Thursday.'))
    assert.ok(sentText(request).includes('Ana keeps this note'))
    assert.ok(sentText(request).includes(JSON.stringify(PERSONAL_SYSTEM).slice(1, 60)))
    assert.ok(!sentText(request).includes('out-of-space canary note'), 'another person’s notes never reach it')
    assert.ok(!sentText(request).includes('Project canary title'), 'no project reaches it')
    assert.ok(!Array.isArray(request.body.tools) || request.body.tools.length === 0, 'no tools')

    // Reserved before, settled from the reported usage: 120 x 0.1 + 30 x 0.5 = 27 micro-USD.
    const rows = await usage('test-payer')
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.owner_id, ANA)
    assert.equal(rows[0]?.state, 'settled')
    assert.equal(rows[0]?.used_micros, '27')
    assert.deepEqual(rows[0]?.usage, { inputTokens: 120, outputTokens: 30 })
    assert.ok(Number(rows[0]?.reserved_micros) > 27, 'the reservation bounded the call')

    // The welcome back is the fixed one: it asks no model.
    const welcomed = recorded().length
    await owner(`UPDATE sophia.personal_turns SET created_at=now()-interval '2 hours' WHERE owner_id=$1`, [ANA])
    const resume = await write(at, '/api/v1/personal/resume', ANA, {})
    assert.equal(resume.operation, 'resume')
    assert.equal(recorded().length, welcomed, 'no provider request for a welcome')
  })

  // #435 4303867356: the turn being answered is sent once. History ends with it (it is read up to the asked turn), so
  // it is dropped from history by that guaranteed position, never by its text: an earlier identical message stays.
  it('sends the turn being answered once, and keeps an earlier identical message as history', async () => {
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, allowance_micros) VALUES ('prompt-payer', 1000000)`,
    )
    const at = await liveApi('prompt-payer')
    const BEA = randomUUID()
    const MARK = 'MARKER-5d3a-ask'
    const count = (r: Recorded) => sentText(r).split(MARK).length - 1
    const start = recorded().length
    double.script({ text: 'First answer.', usage: { input_tokens: 10, output_tokens: 5 } })
    await write(at, '/api/v1/personal/turns', BEA, { text: MARK })
    await settled(at, BEA)
    double.script({ text: 'Second answer.', usage: { input_tokens: 10, output_tokens: 5 } })
    await write(at, '/api/v1/personal/turns', BEA, { text: MARK })
    await settled(at, BEA)
    const sent = recorded().slice(start)
    assert.equal(sent.length, 2)
    assert.ok(
      sent[0] && sentText(sent[0]).includes('This is your first conversation.'),
      'the first turn has no history',
    )
    assert.equal(sent[0] && count(sent[0]), 1, 'the first turn is sent once')
    assert.equal(
      sent[1] && count(sent[1]),
      2,
      'the second: the earlier identical message as history, and the turn once',
    )
  })

  // #435 4303867360: a Note carrying U+0000 is not storable; the answer is kept without it, from one paid request.
  it('keeps the answer and drops a Note that carries U+0000, with one request and one settled cost', async () => {
    await owner(`INSERT INTO sophia.personal_companion_payers(payer, allowance_micros) VALUES ('note-payer', 1000000)`)
    const at = await liveApi('note-payer')
    const CAL = randomUUID()
    const start = recorded().length
    double.script({ text: 'The answer stands.\nNote: bad\u0000note', usage: { input_tokens: 12, output_tokens: 6 } })
    await write(at, '/api/v1/personal/turns', CAL, { text: 'Help me plan.' })
    const page = await settled(at, CAL)
    const reply = page.turns.find((t) => t.author === 'sophia')
    assert.equal(reply?.text, 'The answer stands.')
    assert.equal(reply.suggestion ?? null, null, 'no suggestion')
    assert.equal(page.turns.find((t) => t.author === 'person')?.reply, 'answered')
    // Reading again asks nothing more.
    await settled(at, CAL)
    assert.equal(recorded().length - start, 1, 'one provider request')
    const rows = await usage('note-payer')
    assert.deepEqual(
      rows.map((r) => r.state),
      ['settled'],
      'one settled cost',
    )
  })

  it('a provider refusal fails the turn, holds its unknown cost, and holds the payer until an operator reconciles', async () => {
    const at = await liveApi('held-payer')
    const BEA = randomUUID()
    const sentBefore = recorded().length
    double.script({ status: 500 })
    await write(at, '/api/v1/personal/turns', BEA, { text: 'First try' })
    const failed = await settled(at, BEA)
    const asked = failed.turns.find((t) => t.author === 'person')
    assert.equal(asked?.reply, 'failed')
    assert.equal(recorded().length, sentBefore + 1, 'one request, no hidden retry')
    assert.deepEqual(
      (await usage('held-payer')).map((r) => [r.state, r.reason]),
      [['uncertain', 'usage_unknown']],
    )

    // Asked again: the payer is held, so nothing is asked and the turn fails again.
    await write(at, `/api/v1/personal/turns/${asked.id}/retry`, BEA, {})
    assert.equal((await settled(at, BEA)).turns.find((t) => t.author === 'person')?.reply, 'failed')
    assert.equal(recorded().length, sentBefore + 1, 'a held payer asks the provider nothing')

    // An operator settles the uncertain call from the provider's record; then the retry answers, under a new call.
    const [held] = await owner<{ call_id: string }>(
      `SELECT call_id FROM sophia.personal_companion_usage WHERE payer='held-payer' AND state='uncertain'`,
    )
    assert.ok(held)
    await owner(`SELECT sophia.reconcile_personal_companion($1, 0, '{"inputTokens":0,"outputTokens":0}')`, [
      held.call_id,
    ])
    double.script({ text: 'Here now.' })
    await write(at, `/api/v1/personal/turns/${asked.id}/retry`, BEA, {})
    const answered = await settled(at, BEA)
    assert.equal(answered.turns.find((t) => t.author === 'sophia')?.text, 'Here now.')
    const rows = await usage('held-payer')
    assert.deepEqual(
      rows.map((r) => r.state),
      ['settled', 'settled'],
    )
    assert.equal(recorded().length, sentBefore + 2)
  })

  it('an exhausted allowance asks the provider nothing', async () => {
    const at = await liveApi('tight-payer')
    const CAL = randomUUID()
    const sentBefore = recorded().length
    await write(at, '/api/v1/personal/turns', CAL, { text: 'Hello' })
    assert.equal((await settled(at, CAL)).turns.find((t) => t.author === 'person')?.reply, 'failed')
    assert.equal(recorded().length, sentBefore, 'no provider request')
    assert.deepEqual(await usage('tight-payer'), [], 'nothing reserved')
  })

  it('an erasure mid-answer stops the call: no late answer, its cost row survives without content', async () => {
    const at = await liveApi('stop-payer')
    const DAN = randomUUID()
    const sentBefore = recorded().length
    double.script({ text: 'This must never be shown', delayMs: 3000 })
    await write(at, '/api/v1/personal/turns', DAN, { text: 'Erase me while you think' })
    for (let i = 0; i < 100 && double.active === 0; i++) await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(recorded().length, sentBefore + 1, 'the provider was asked')
    const erased = await write(at, '/api/v1/personal/erasure', DAN, { confirm: 'delete' })
    assert.equal(erased.operation, 'erase')
    const afterErasure = await space(at, DAN)
    assert.deepEqual(afterErasure.turns, [], 'no late answer')
    const rows = await usage('stop-payer')
    assert.equal(rows.length, 1, 'the cost row outlives the erasure')
    assert.deepEqual([rows[0]?.state, rows[0]?.reason], ['uncertain', 'stopped_usage_unknown'])
    assert.equal(rows[0]?.usage, null)
    const kept = await owner<{ content: string }>(
      `SELECT to_jsonb(u)::text AS content FROM sophia.personal_companion_usage u WHERE payer='stop-payer'`,
    )
    assert.ok(!kept[0]?.content.includes('Erase me'), 'no content is kept with the cost')
    await new Promise((resolve) => setTimeout(resolve, 3200))
    assert.deepEqual((await space(at, DAN)).turns, [], 'still no late answer once the provider finished')
  })
})

describe('the live companion’s configuration', () => {
  it('starts only with complete settings, its credential reference set and its payer admitted', async () => {
    const base = env('test-payer')
    assert.equal((await personalCompanionFrom({}, pool)).companion, null, 'unset: no companion, nothing composed')
    await assert.rejects(personalCompanionFrom({ SOPHIA_COMPANION: 'live' }, pool), /SOPHIA_PERSONAL_COMPANION/)
    await assert.rejects(
      personalCompanionFrom(
        { ...base, SOPHIA_PERSONAL_COMPANION: settingsFor('test-payer', { roleDigest: `sha256:${'0'.repeat(64)}` }) },
        pool,
      ),
      /roleDigest/,
    )
    await assert.rejects(
      personalCompanionFrom(
        { ...base, SOPHIA_PERSONAL_COMPANION: settingsFor('test-payer', { prices: { input: 0.1 } }) },
        pool,
      ),
      /prices/,
    )
    await assert.rejects(personalCompanionFrom({ ...base, [KEY_REF]: '' }, pool), /credential reference/)
    await assert.rejects(personalCompanionFrom(env('never-admitted'), pool), /not admitted/)
    await assert.rejects(
      personalCompanionFrom({ SOPHIA_COMPANION: 'rehearse', NODE_ENV: 'production' }, pool),
      /development only/,
      'production never runs the rehearsal',
    )
    await assert.rejects(personalCompanionFrom({ SOPHIA_COMPANION: 'on' }, pool), /rehearse, live or unset/)
  })
})
