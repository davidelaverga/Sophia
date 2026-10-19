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
import { PERSONAL_ROLE_DIGEST, PERSONAL_SYSTEM, personalPrompt, personalReply } from './companion-live.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const KEY_REF = 'SOPHIA_TEST_PERSONAL_ROUTE_KEY'
const FAKE_KEY = 'test-only-not-a-credential'

type Double = MockResponses
type Recorded = MockResponsesRequest

let db: TestDatabase
let pool: pg.Pool
let double: Double
/** FIXTURE: the gated companions' own pools, closed after. */
const gatedPools: pg.Pool[] = []
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
/** The owner a payer is enrolled for until a test enrolls its own (0073: one owner per payer). */
const NOBODY = randomUUID()

const settingsFor = (payer: string, extra: Record<string, unknown> = {}, ownerId: string = NOBODY) =>
  JSON.stringify({
    routeId: 'personal-test',
    payer,
    owner: ownerId,
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

const env = (payer: string, ownerId: string = NOBODY) => ({
  SOPHIA_COMPANION: 'live',
  SOPHIA_PERSONAL_COMPANION: settingsFor(payer, {}, ownerId),
  [KEY_REF]: FAKE_KEY,
})

/** An API on the restricted role with the live companion its configuration gives, listening on 127.0.0.1. */
async function liveApi(payer: string, ownerId: string, enroll = true, companionPool = pool): Promise<string> {
  // FIXTURE: the operator enrolls the payer for this test's owner (the only way an owner is pinned).
  if (enroll) await owner(`UPDATE sophia.personal_companion_payers SET owner_id=$2 WHERE payer=$1`, [payer, ownerId])
  const configured = await personalCompanionFrom(env(payer, ownerId), companionPool)
  companions.push(configured)
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const app = buildApp({ pool, verifyActor, companion: configured.companion })
  apps.push(app)
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}

/** A write's epoch, and its idempotency key when a test sends one again (else a fresh key). */
type Against = number | { epoch: number; key: string }

async function call(at: string, path: string, as: string, body?: unknown, against?: Against) {
  const epoch = typeof against === 'number' ? against : against?.epoch
  const key = typeof against === 'object' ? against.key : randomUUID()
  const res = await fetch(`${at}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${await token(as)}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json', 'idempotency-key': key }),
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

/** A gate the companion's reservation waits at: `reached` once it is there, and it goes on once `open` is called. */
interface Gate {
  reached: Promise<void>
  open: () => void
  arrive: () => Promise<void>
  /** Each reservation statement actually sent, once, in order: its ordinal and what it answered (or how it failed). */
  outcome: { ordinal: number; rows: unknown }[]
  /** How many reservation statements were sent through this gate. */
  delegated: number
}

function gate(): Gate {
  let arrived: (() => void) | undefined
  let opened: (() => void) | undefined
  const reached = new Promise<void>((resolve) => (arrived = resolve))
  const opening = new Promise<void>((resolve) => (opened = resolve))
  return {
    reached,
    outcome: [],
    delegated: 0,
    open: () => opened?.(),
    arrive: async () => {
      arrived?.()
      await opening
    },
  }
}

const reservesCall = (sql: unknown) =>
  (typeof sql === 'string' ? sql : JSON.stringify(sql ?? '')).includes('reserve_personal_companion')

/** The clients already gated: pg-pool hands the same idle client out again, and it is wrapped once, never twice. */
const gatedClients = new WeakSet<pg.PoolClient>()

/** A client whose reservation statement waits at the gate before it is sent; every other statement goes as it is. */
function gatedClient(client: pg.PoolClient, at: Gate): pg.PoolClient {
  if (gatedClients.has(client)) return client
  gatedClients.add(client)
  const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>
  return Object.assign(client, {
    query: async (...args: unknown[]) => {
      if (!reservesCall(args[0])) return query(...args)
      at.delegated += 1
      const ordinal = at.delegated
      await at.arrive()
      try {
        const answer = await query(...args)
        at.outcome.push({ ordinal, rows: (answer as { rows?: unknown[] }).rows ?? null })
        return answer
      } catch (err: unknown) {
        at.outcome.push({ ordinal, rows: `error: ${err instanceof Error ? err.message : String(err)}` })
        throw err
      }
    },
  })
}

/** A promise that settles within `ms`, or fails saying what did not happen. */
const within = async <T>(ms: number, what: string, p: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`not in ${ms} ms: ${what}`)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** The one epoch row, as a nonnegative integer: none, two, null or anything else is a failed witness, never a commit. */
function epochValue(rows: readonly { epoch: unknown }[]): number {
  if (rows.length !== 1) throw new Error(`epoch witness: ${rows.length} rows`)
  const value = Number(rows[0]?.epoch ?? Number.NaN)
  if (!Number.isInteger(value) || value < 0) throw new Error(`epoch witness: not an epoch: ${String(rows[0]?.epoch)}`)
  return value
}

/** Polls `read` until the epoch is exactly `from + 1`, or fails at the deadline (unchanged is a failure too). */
async function epochAdvance(read: () => Promise<number>, from: number, ms: number): Promise<number> {
  const until = Date.now() + ms
  for (;;) {
    const now = await read()
    if (now === from + 1) return now
    if (now !== from) throw new Error(`epoch witness: ${from} -> ${now}, not the one erasure`)
    if (Date.now() > until) throw new Error(`epoch witness: unchanged at ${from} after ${ms} ms`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/**
 * FIXTURE (erasure first): the companion's own pool on the restricted role (the API keeps the shared one). Its
 * clients hold the reservation statement at the gate. pg-pool's own query() acquires with connect(callback), so both
 * of connect's forms are kept: the callback is forwarded with the client, the promise resolves with it.
 */
function gatedPool(at: Gate): pg.Pool {
  const own = createPool(db.apiUrl, { max: 4 })
  gatedPools.push(own)
  const connect = own.connect.bind(own) as (
    callback?: (err: Error | undefined, client: pg.PoolClient | undefined, release: (e?: unknown) => void) => void,
  ) => Promise<pg.PoolClient> | undefined
  Object.assign(own, {
    connect: (
      callback?: (err: Error | undefined, client: pg.PoolClient | undefined, release: (e?: unknown) => void) => void,
    ) =>
      callback
        ? connect((err, client, release) => callback(err, client && gatedClient(client, at), release))
        : connect()?.then((client) => gatedClient(client, at)),
  })
  return own
}

/** A thrown value as an Error. */
const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

/**
 * FIXTURE (erasure first): the owner's turn goes in, its reservation waits at the gate, the erasure commits (its epoch
 * seen in the database, exactly one more) and only then does the gate open. The whole operation is owned: the gate always
 * opens, the erasure and the turn's work are joined within bounds, and a timeout is reported as the failure it is.
 */
async function erasureFirst(
  api: string,
  ownerId: string,
  at: Gate,
  o: { epochRead?: () => Promise<number>; witnessMs?: number; drainMs?: number } = {},
) {
  const marks: Record<string, number> = {}
  const rows = () => owner<{ epoch: unknown }>(`SELECT epoch FROM sophia.personal_spaces WHERE owner_id=$1`, [ownerId])
  const read = () => within(2_000, 'the epoch witness read', o.epochRead ? o.epochRead() : rows().then(epochValue))
  let erasing: Promise<{ status: number; json: unknown }> | undefined
  let failure: unknown
  let oldEpoch = -1
  let epochBefore = -1
  let epochAfter = -1
  try {
    oldEpoch = (await space(api, ownerId)).epoch
    await write(api, '/api/v1/personal/turns', ownerId, { text: 'Private words, erased first' })
    await within(10_000, 'the reservation reached the gate', at.reached)
    marks.reservationHeld = performance.now()
    epochBefore = await within(o.witnessMs ?? 2_000, 'the epoch witness read', read())
    erasing = call(api, '/api/v1/personal/erasure', ownerId, { confirm: 'delete' }, oldEpoch)
    epochAfter = await epochAdvance(read, epochBefore, o.witnessMs ?? 3_000)
    marks.erasureCommitted = performance.now()
  } catch (err: unknown) {
    failure = err
  } finally {
    at.open()
  }
  // Owned work joined within bounds: the erasure (it drains the call), else the turn's own reply.
  const drained = erasing
    ? await within(o.drainMs ?? 20_000, 'the erasure drained', erasing).then(
        (answer) => ({ answer }),
        (err: unknown) => ({ err }),
      )
    : await within(o.drainMs ?? 20_000, 'the turn settled', settled(api, ownerId)).then(
        () => ({ answer: undefined }),
        (err: unknown) => ({ err }),
      )
  // Both failures stay reported: a failed witness never hides a drain that did not settle (R-PERSONAL-AD7-WITNESS-01).
  if (failure && 'err' in drained)
    throw new AggregateError(
      [asError(failure), asError(drained.err)],
      'the witness failed and owned work did not settle',
    )
  if (failure) throw asError(failure)
  if ('err' in drained) throw asError(drained.err)
  return { marks, epochBefore, epochAfter, oldEpoch, erased: drained.answer }
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
  await owner(
    `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES
    ('test-payer', $1, 1000000), ('tight-payer', $1, 10), ('held-payer', $1, 1000000), ('stop-payer', $1, 1000000),
    ('prompt-payer', $1, 1000000), ('note-payer', $1, 1000000), ('owner-payer', $1, 1000000), ('first-payer', $1, 1000000), ('fay-payer', $1, 1000000),
    ('settled-payer', $1, 1000000)`,
    [NOBODY],
  )
})

after(async () => {
  for (const app of apps) await app.close()
  for (const c of companions) await c.dispose()
  for (const p of gatedPools) await p.end()
  await double.close()
  await pool.end()
  await db.drop()
  Reflect.deleteProperty(process.env, KEY_REF)
})

describe('the live personal companion (local provider double)', () => {
  it('answers one turn through the composed dsh route, from the owner’s context only, settled from its usage', async () => {
    const ANA = randomUUID()
    const at = await liveApi('test-payer', ANA)
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
    const BEA = randomUUID()
    const at = await liveApi('prompt-payer', BEA)
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
    const CAL = randomUUID()
    const at = await liveApi('note-payer', CAL)
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

  // #435 4304103151 (P's initial scope): one enrolled owner per payer. Two API instances on the same payer: the owner
  // is answered; anyone else is refused before anything is kept, reserved or sent, and cannot start another instance.
  it('answers only the payer’s enrolled owner; anyone else is refused before anything is kept, reserved or sent', async () => {
    const OWN = randomUUID()
    const STRANGER = randomUUID()
    const one = await liveApi('owner-payer', OWN)
    const two = await liveApi('owner-payer', OWN, false)
    await assert.rejects(
      liveApi('owner-payer', STRANGER, false),
      /not admitted for its owner/,
      'no implicit enrollment',
    )
    const start = recorded().length
    double.script({ text: 'For the owner.', usage: { input_tokens: 10, output_tokens: 5 } })
    await write(one, '/api/v1/personal/turns', OWN, { text: 'Owner asks.' })
    assert.equal((await settled(one, OWN)).turns.find((t) => t.author === 'sophia')?.text, 'For the owner.')
    for (const at of [one, two]) {
      const { epoch } = await space(at, STRANGER)
      const refused = await call(at, '/api/v1/personal/turns', STRANGER, { text: 'Stranger asks.' }, epoch)
      assert.equal(refused.status, 503, JSON.stringify(refused.json))
    }
    const page = parsePersonalTurnPage((await call(one, '/api/v1/personal/turns?after=0', STRANGER)).json)
    assert.deepEqual(page.turns, [], 'nothing of the stranger’s is kept')
    // #435 4304290370: live only to the owner; the stranger's own space reads as without a companion, and a welcome
    // back is not the companion's to write for them under a new key, even with a quiet hour behind their own turns.
    assert.equal((await space(one, OWN)).companion, 'live')
    assert.equal((await space(one, STRANGER)).companion, 'unavailable')
    const earlier = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_turns(owner_id,id,seq,author,body,reply,asked_at,created_at)
       VALUES($1,$2,1,'person','Earlier words.','answered',now()-interval '2 hours',now()-interval '2 hours')`,
      [STRANGER, earlier],
    )
    await owner(
      `INSERT INTO sophia.personal_turns(owner_id,seq,author,body,reply_to,created_at)
       VALUES($1,2,'sophia','An earlier answer.',$2,now()-interval '2 hours')`,
      [STRANGER, earlier],
    )
    // FIXTURE: the space's turn order moves past the two turns written directly above, as writing them would.
    await owner(`UPDATE sophia.personal_spaces SET turn_seq=2 WHERE owner_id=$1`, [STRANGER])
    const { epoch: strangerEpoch } = await space(one, STRANGER)
    const resumed = await call(one, '/api/v1/personal/resume', STRANGER, {}, strangerEpoch)
    assert.equal(resumed.status, 503, JSON.stringify(resumed.json))
    const kept = parsePersonalTurnPage((await call(one, '/api/v1/personal/turns?after=0', STRANGER)).json)
    assert.deepEqual(
      kept.turns.map((t) => t.author),
      ['person', 'sophia'],
      'no welcome written for the stranger',
    )
    // The owner's welcome back under one key, then that same key again (a retry after a lost reply): the receipt it
    // keeps, never a second welcome. The stranger under the owner's very key, on either API, gets nothing of the owner's.
    await owner(`UPDATE sophia.personal_turns SET created_at=now()-interval '2 hours' WHERE owner_id=$1`, [OWN])
    const ownEpoch = (await space(one, OWN)).epoch
    const resumeKey = randomUUID()
    const first = await call(one, '/api/v1/personal/resume', OWN, {}, { epoch: ownEpoch, key: resumeKey })
    assert.equal(first.status, 202, JSON.stringify(first.json))
    const again = await call(two, '/api/v1/personal/resume', OWN, {}, { epoch: ownEpoch, key: resumeKey })
    assert.equal(again.status, 202, JSON.stringify(again.json))
    assert.deepEqual(again.json, first.json, 'the same key replays its receipt')
    const ownTurns = parsePersonalTurnPage((await call(one, '/api/v1/personal/turns?after=0', OWN)).json).turns
    assert.equal(ownTurns.filter((t) => t.author === 'sophia' && t.text !== 'For the owner.').length, 1, 'one welcome')
    for (const at of [one, two]) {
      const crossed = await call(at, '/api/v1/personal/resume', STRANGER, {}, { epoch: strangerEpoch, key: resumeKey })
      assert.equal(crossed.status, 503, JSON.stringify(crossed.json))
      assert.ok(!JSON.stringify(crossed.json).includes('owner'), 'nothing of the owner’s in the answer')
    }
    // The stranger retries the owner's turn under the owner's own send key, on the second API: refused, nothing kept.
    const sendKey = randomUUID()
    double.script({ text: 'Second for the owner.', usage: { input_tokens: 10, output_tokens: 5 } })
    const sent = await call(
      one,
      '/api/v1/personal/turns',
      OWN,
      { text: 'Owner asks again.' },
      { epoch: ownEpoch, key: sendKey },
    )
    assert.equal(sent.status, 202, JSON.stringify(sent.json))
    const ownerTurns = (await settled(one, OWN)).turns
    const asked = ownerTurns.findLast((t) => t.author === 'person')
    assert.ok(asked)
    const retried = await call(
      two,
      `/api/v1/personal/turns/${asked.id}/retry`,
      STRANGER,
      {},
      { epoch: strangerEpoch, key: sendKey },
    )
    assert.equal(retried.status, 503, JSON.stringify(retried.json))
    assert.ok(!JSON.stringify(retried.json).includes('Owner asks again'), 'no owner words in the answer')
    assert.deepEqual(
      parsePersonalTurnPage((await call(one, '/api/v1/personal/turns?after=0', STRANGER)).json).turns.map(
        (t) => t.author,
      ),
      ['person', 'sophia'],
      'nothing new for the stranger',
    )
    assert.equal(recorded().length - start, 2, 'provider requests: the owner’s two only')
    const rows = await usage('owner-payer')
    assert.deepEqual(
      rows.map((r) => [r.owner_id, r.state]),
      [
        [OWN, 'settled'],
        [OWN, 'settled'],
      ],
      'no reservation for the stranger',
    )
  })

  // #435 4304097074 and 4304097082: the note list as sent stays within its bound, newest kept; a Note is a last line.
  it('keeps the note list as sent within 6000 bytes, newest first kept, and reads a Note only from a last line', () => {
    const notes = Array.from({ length: 1200 }, (_, i) => `n${String(i).padStart(3, '0')}`)
    // FIXTURE: only the asked turn's text is read.
    const asked = { text: 'Now.' } as Parameters<typeof personalPrompt>[0]['asked']
    const prompt = personalPrompt({ asked, history: [{ author: 'person', text: 'Now.' }], notes })
    const list = prompt.split('Notes the person keeps:\n')[1]?.split('\n\n')[0] ?? ''
    assert.ok(Buffer.byteLength(list) <= 6000, `the list as sent is ${Buffer.byteLength(list)} bytes`)
    assert.ok(list.endsWith('- n1199'), 'the newest note is kept')
    assert.ok(!list.includes('- n0000'), 'the oldest gave way')
    const multibyte = Array.from({ length: 900 }, (_, i) => `é${i}✓`)
    const wide = personalPrompt({
      asked,
      history: [{ author: 'person', text: 'Now.' }],
      notes: multibyte,
    })
    assert.ok(Buffer.byteLength(wide.split('Notes the person keeps:\n')[1]?.split('\n\n')[0] ?? '') <= 6000)
    assert.equal(wide.split('Now.').length - 1, 1, 'the asked turn once')
    assert.deepEqual(personalReply('Please remember this. Note: call tomorrow'), {
      text: 'Please remember this. Note: call tomorrow',
      suggestion: null,
    })
    assert.deepEqual(personalReply('See the Footnote: page two.'), {
      text: 'See the Footnote: page two.',
      suggestion: null,
    })
    assert.deepEqual(personalReply('Answer.\nNote: keep this'), { text: 'Answer.', suggestion: 'keep this' })
    assert.deepEqual(personalReply('Answer.\r\n   Note: indented  \r\n'), { text: 'Answer.', suggestion: 'indented' })
    assert.deepEqual(personalReply('Answer.\nNote: bad\u0000'), { text: 'Answer.', suggestion: null })
    assert.equal(personalReply('Bad\u0000body.'), null)
  })

  // B76 (4319508047): the provider completes and its cost is settled, then every write of the reply fails (the
  // database away). The turn reads as failed once its claim lapses; asked again, the payer must not pay twice for the
  // one answer requested. FIXTURE: a test-only trigger refuses Sophia's reply rows while it is installed.
  it('a settled answer whose reply could not be written is not paid for twice when asked again', async () => {
    const DEV = randomUUID()
    const at = await liveApi('settled-payer', DEV)
    const sentBefore = recorded().length
    await owner(`CREATE OR REPLACE FUNCTION sophia.b76_refuse_reply() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'b76: the database is away'; END $$`)
    await owner(`CREATE TRIGGER b76_refuse_reply BEFORE INSERT ON sophia.personal_turns FOR EACH ROW
      WHEN (NEW.author = 'sophia' AND NEW.owner_id = '${DEV}') EXECUTE FUNCTION sophia.b76_refuse_reply()`)
    try {
      double.script({ text: 'The one answer.', usage: { input_tokens: 10, output_tokens: 5 } })
      await write(at, '/api/v1/personal/turns', DEV, { text: 'Answer me once.' })
      for (let i = 0; i < 100 && (await usage('settled-payer')).length === 0; i++)
        await new Promise((resolve) => setTimeout(resolve, 50))
      assert.deepEqual(
        (await usage('settled-payer')).map((r) => r.state),
        ['settled'],
        'the call completed and its cost was settled',
      )
      await new Promise((resolve) => setTimeout(resolve, 3000)) // the reply's writes tried and failed
      // Its claim lapsed (as after two minutes): the turn reads as failed.
      await owner(
        `UPDATE sophia.personal_turns SET answering_since=now()-interval '10 minutes', asked_at=now()-interval '10 minutes'
         WHERE owner_id=$1 AND author='person'`,
        [DEV],
      )
      const failed = await settled(at, DEV)
      const asked = failed.turns.find((t) => t.author === 'person')
      assert.equal(asked?.reply, 'failed')
      // Nothing scripted for a second request: the double is shared with the other cases, and none is due here.
      await write(at, `/api/v1/personal/turns/${asked.id}/retry`, DEV, {})
      // Long enough for a second call to be asked and settled, were it made.
      for (let i = 0; i < 60 && recorded().length - sentBefore < 2; i++)
        await new Promise((resolve) => setTimeout(resolve, 50))
      await new Promise((resolve) => setTimeout(resolve, 500))
    } finally {
      await owner(`DROP TRIGGER IF EXISTS b76_refuse_reply ON sophia.personal_turns`)
      await owner(`DROP FUNCTION IF EXISTS sophia.b76_refuse_reply()`)
    }
    assert.equal(recorded().length - sentBefore, 1, 'one provider request for the one answer requested')
    assert.deepEqual(
      (await usage('settled-payer')).map((r) => r.state),
      ['settled'],
      'one settled cost',
    )
  })

  it('a provider refusal fails the turn, holds its unknown cost, and holds the payer until an operator reconciles', async () => {
    const BEA = randomUUID()
    const at = await liveApi('held-payer', BEA)
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

  // Erasure FIRST (#435 4304290365, composed): the owner's turn is kept, its call registered and context read; its
  // reservation waits at the companion's pool gate; the erasure commits (seen in the database: the epoch moved); then
  // the reservation goes on. It finds its call from before the erasure: nothing is reserved, the provider is asked
  // nothing, nothing of the erased words comes back. No answer is queued on the double: one asked for would show.
  it('an erasure that commits before a call reserves: nothing reserved, no provider request, nothing back', async () => {
    const EVE = randomUUID()
    const at = gate()
    const api = await liveApi('first-payer', EVE, true, gatedPool(at))
    const sentBefore = recorded().length
    const run = await erasureFirst(api, EVE, at)
    const { marks, epochBefore, epochAfter, oldEpoch } = run
    const erased = run.erased
    marks.erasureAnswered = performance.now()
    assert.equal(erased?.status, 202, JSON.stringify(erased?.json))
    assert.equal(epochAfter, epochBefore + 1)
    assert.ok((marks.reservationHeld ?? Infinity) < (marks.erasureCommitted ?? -Infinity), 'held, then committed')
    const turnsAfter = parsePersonalTurnPage((await call(api, '/api/v1/personal/turns?after=0', EVE)).json)
    assert.deepEqual(turnsAfter.turns, [], 'nothing of the erased words, no answer')
    assert.equal(recorded().length, sentBefore, 'the provider was asked nothing')
    assert.deepEqual(await usage('first-payer'), [], 'nothing reserved')
    // The branch taken, each reservation statement recorded once: one, after the erasure, answering not_current.
    assert.deepEqual(at.outcome, [{ ordinal: 1, rows: [{ outcome: 'not_current' }] }])
    assert.equal(at.delegated, 1)
    // After the erasure, the old epoch's write is refused and writes nothing; the new epoch writes as before.
    const stale = await call(api, '/api/v1/personal/resume', EVE, {}, oldEpoch)
    assert.ok(stale.status >= 400, `old epoch refused: ${stale.status} ${JSON.stringify(stale.json)}`)
    assert.ok(!JSON.stringify(stale.json).includes('erased first'), 'no erased words in the refusal')
    assert.deepEqual(
      parsePersonalTurnPage((await call(api, '/api/v1/personal/turns?after=0', EVE)).json).turns,
      [],
      'no new turn from the old epoch',
    )
    assert.equal(recorded().length, sentBefore, 'still no provider request')
    process.stdout.write(
      `ERASURE-FIRST ${JSON.stringify({ ...marks, epochBefore, epochAfter, staleStatus: stale.status, reservations: at.outcome })}\n`,
    )
  })

  // The fixture's own boundaries (R-PERSONAL-AD7-WITNESS-01, -POOL-02): a missing, null, malformed, doubled or
  // unchanged epoch never records a commit; the same pg client handed out twice is wrapped once, so one statement is
  // one record.
  // The lifecycle's failure boundary (R-PERSONAL-AD7-WITNESS-01): a witness read that never answers fails within its
  // bound; the gate still opens and the turn's own work and the erasure are joined, within bounds, before the failure
  // is reported, so nothing the test started is left held.
  it('the fixture: a never-answering witness read fails in bounds, with the gate opened and owned work joined', async () => {
    const GUS = randomUUID()
    const at = gate()
    const api = await liveApi('first-payer', GUS, true, gatedPool(at))
    const started = Date.now()
    await assert.rejects(
      erasureFirst(api, GUS, at, { epochRead: () => new Promise<number>(() => undefined), witnessMs: 500 }),
      /not in 500 ms: the epoch witness read/,
    )
    assert.ok(Date.now() - started < 30_000, 'bounded')
    assert.equal(at.delegated <= 1, true)
    const page = parsePersonalTurnPage((await call(api, '/api/v1/personal/turns?after=0', GUS)).json)
    assert.equal(page.pending, false, 'no reply left pending')
    await owner(
      `UPDATE sophia.personal_companion_usage SET state='released' WHERE payer='first-payer' AND state='reserved'`,
    )
  })

  // Both failures at once (R-PERSONAL-AD7-WITNESS-01 combined): the witness read never answers and the owned work is
  // given no time to settle; the report carries both, neither hiding the other.
  it('the fixture: a failed witness and an unsettled drain are reported together', async () => {
    const HAL = randomUUID()
    const at = gate()
    const api = await liveApi('first-payer', HAL, true, gatedPool(at))
    const thrown = await erasureFirst(api, HAL, at, {
      epochRead: () => new Promise<number>(() => undefined),
      witnessMs: 300,
      drainMs: 1,
    }).then(
      () => undefined,
      (err: unknown) => err,
    )
    assert.ok(thrown instanceof AggregateError, String(thrown))
    assert.deepEqual(
      thrown.errors.map((e: unknown) => (e instanceof Error ? e.message : String(e))),
      ['not in 300 ms: the epoch witness read', 'not in 1 ms: the turn settled'],
    )
    // The owned work, given its time after the report, settles: nothing is left pending.
    await within(20_000, 'the turn settled after the report', settled(api, HAL))
    await owner(
      `UPDATE sophia.personal_companion_usage SET state='released' WHERE payer='first-payer' AND state='reserved'`,
    )
  })

  it('the fixture: a bad or unchanged epoch is a failed witness; a reused client records each statement once', async () => {
    for (const rows of [[], [{ epoch: null }], [{ epoch: 'x' }], [{ epoch: '-1' }], [{ epoch: '1' }, { epoch: '2' }]])
      assert.throws(() => epochValue(rows), /epoch witness/)
    assert.equal(epochValue([{ epoch: '3' }]), 3)
    await assert.rejects(
      epochAdvance(() => Promise.resolve(5), 5, 50),
      /unchanged at 5/,
    )
    await assert.rejects(
      epochAdvance(() => Promise.resolve(7), 5, 50),
      /not the one erasure/,
    )
    assert.equal(await epochAdvance(() => Promise.resolve(6), 5, 50), 6)
    const at = gate()
    at.open()
    const own = gatedPool(at)
    const first = await own.connect()
    const pid = (await first.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid
    await first.query(`SELECT 'reserve_personal_companion'::text AS probe`)
    first.release()
    const again = await own.connect()
    assert.equal(
      (await again.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid,
      pid,
      'the same client',
    )
    await again.query(`SELECT 'reserve_personal_companion'::text AS probe`)
    again.release()
    assert.equal(at.delegated, 2)
    assert.deepEqual(
      at.outcome.map((o) => o.ordinal),
      [1, 2],
      'one record per statement',
    )
  })

  it('after an erasure, the old key on the other API, old epoch or new: refused, nothing kept or asked', async () => {
    const FAY = randomUUID()
    const one = await liveApi('fay-payer', FAY)
    const two = await liveApi('fay-payer', FAY, false)
    const oldEpoch = (await space(one, FAY)).epoch
    const key = randomUUID()
    double.script({ text: 'For Fay before the erasure.', usage: { input_tokens: 10, output_tokens: 5 } })
    const sent = await call(one, '/api/v1/personal/turns', FAY, { text: 'Words to forget' }, { epoch: oldEpoch, key })
    assert.equal(sent.status, 202, JSON.stringify(sent.json))
    const answered = await settled(one, FAY)
    const asked = answered.turns.find((t) => t.author === 'person')
    assert.ok(asked)
    const askedBefore = recorded().length
    const usageBefore = await usage('fay-payer')
    await write(one, '/api/v1/personal/erasure', FAY, { confirm: 'delete' })
    const newEpoch = (await space(two, FAY)).epoch
    assert.notEqual(newEpoch, oldEpoch, 'the erasure moved the epoch')
    const sameKeyOldEpoch = await call(
      two,
      '/api/v1/personal/turns',
      FAY,
      { text: 'Words to forget' },
      { epoch: oldEpoch, key },
    )
    const sameKeyNewEpoch = await call(
      two,
      '/api/v1/personal/turns',
      FAY,
      { text: 'Words to forget' },
      { epoch: newEpoch, key },
    )
    const retryOld = await call(
      two,
      `/api/v1/personal/turns/${asked.id}/retry`,
      FAY,
      {},
      { epoch: newEpoch, key: randomUUID() },
    )
    const answers = { sameKeyOldEpoch, sameKeyNewEpoch, retryOld }
    process.stdout.write(`POST-ERASURE ${JSON.stringify(answers)}\n`)
    assert.equal(sameKeyOldEpoch.status, 409, 'the old epoch is refused at the fence')
    assert.ok(
      sameKeyNewEpoch.status >= 400 || JSON.stringify(sameKeyNewEpoch.json).includes('redacted'),
      'the old key writes nothing',
    )
    assert.ok(retryOld.status >= 400, 'the erased turn has nothing to retry')
    for (const a of Object.values(answers))
      assert.ok(!JSON.stringify(a.json).includes('Words to forget'), 'no erased words')
    for (const at of [one, two])
      assert.deepEqual(
        parsePersonalTurnPage((await call(at, '/api/v1/personal/turns?after=0', FAY)).json).turns,
        [],
        'nothing kept',
      )
    assert.equal(recorded().length, askedBefore, 'no provider request after the erasure')
    assert.deepEqual(await usage('fay-payer'), usageBefore, 'no new usage')
  })

  it('an exhausted allowance asks the provider nothing', async () => {
    const CAL = randomUUID()
    const at = await liveApi('tight-payer', CAL)
    const sentBefore = recorded().length
    await write(at, '/api/v1/personal/turns', CAL, { text: 'Hello' })
    assert.equal((await settled(at, CAL)).turns.find((t) => t.author === 'person')?.reply, 'failed')
    assert.equal(recorded().length, sentBefore, 'no provider request')
    assert.deepEqual(await usage('tight-payer'), [], 'nothing reserved')
  })

  it('an erasure mid-answer stops the call: no late answer, its cost row survives without content', async () => {
    const DAN = randomUUID()
    const at = await liveApi('stop-payer', DAN)
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
    // #435 4304103151: an owner missing from the settings, or not the one the payer is enrolled for, never starts live.
    await assert.rejects(
      personalCompanionFrom(
        { ...base, SOPHIA_PERSONAL_COMPANION: settingsFor('test-payer', { owner: undefined }) },
        pool,
      ),
      /owner/,
    )
    await assert.rejects(personalCompanionFrom(env('test-payer', randomUUID()), pool), /not admitted for its owner/)
    await assert.rejects(
      personalCompanionFrom({ SOPHIA_COMPANION: 'rehearse', NODE_ENV: 'production' }, pool),
      /development only/,
      'production never runs the rehearsal',
    )
    await assert.rejects(personalCompanionFrom({ SOPHIA_COMPANION: 'on' }, pool), /rehearse, live or unset/)
  })
})
