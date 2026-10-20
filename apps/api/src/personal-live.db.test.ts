// FND-B3-PERSONAL-LIVE-01 crossing (level: sql-run): the live personal companion over real HTTP, the real API on its
// restricted role and PostgreSQL (0073), its model service composed from the installed dsh packages (cordis, dsh-llm,
// the pinned pi-ai adapter) and its one route pointed at a LOCAL TEST DOUBLE of the provider's endpoint
// (tests/support/mock-responses.mjs). No provider, network, account or real credential: the route's credential reference
// names a variable this test process sets to a fake value, and nothing leaves 127.0.0.1.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import { parsePersonalReceipt, parsePersonalSpace, parsePersonalTurnPage } from '@sophia/contracts/validate'
import { createPool, withActor } from '@sophia/persistence'
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
  /reserve_personal_(companion|answer)/.test(typeof sql === 'string' ? sql : JSON.stringify(sql ?? ''))

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
    ('settled-payer', $1, 1000000), ('erased-payer', $1, 1000000),
    ('stale-payer', $1, 1000000), ('retry-payer', $1, 1000000)`,
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
    let asked: { id: string; reply?: string | null } | undefined
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
      asked = failed.turns.find((t) => t.author === 'person')
      assert.equal(asked?.reply, 'failed')
    } finally {
      await owner(`DROP TRIGGER IF EXISTS b76_refuse_reply ON sophia.personal_turns`)
      await owner(`DROP FUNCTION IF EXISTS sophia.b76_refuse_reply()`)
    }
    assert.ok(asked)
    // Asked again through another API and runner (as after a restart): nothing of the first lives in its memory.
    // Nothing is scripted for a second request: the double is shared with the other cases, and none is due here.
    const fresh = await liveApi('settled-payer', DEV, false)
    await write(fresh, `/api/v1/personal/turns/${asked.id}/retry`, DEV, {})
    for (let i = 0; i < 60 && recorded().length - sentBefore < 2; i++)
      await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(recorded().length - sentBefore, 1, 'one provider request for the one answer requested')
    assert.deepEqual(
      (await usage('settled-payer')).map((r) => r.state),
      ['settled'],
      'one settled cost',
    )
    const page = await settled(fresh, DEV)
    assert.deepEqual(
      page.turns.filter((t) => t.author === 'sophia').map((t) => t.text),
      ['The one answer.'],
      'the answer paid for, written once',
    )
    assert.deepEqual(
      await owner(`SELECT 1 FROM sophia.personal_settled_answers WHERE owner_id=$1`, [DEV]),
      [],
      'nothing kept once written',
    )
  })

  // R-B77-S1-P1: the turn's claim is replaced while the settlement waits (another runner took the lapsed turn). The
  // turn is still the person's and live: its answer must be kept with the cost, and asked again (another runner, as
  // after a restart) it is written, never asked for again. FIXTURE: a test-only trigger replaces the claim inside the
  // settlement, before the answer is kept.
  it('a settled answer is kept for its live turn even when the turn’s claim changed meanwhile', async () => {
    const STA = randomUUID()
    const at = await liveApi('stale-payer', STA)
    const sentBefore = recorded().length
    await owner(`CREATE OR REPLACE FUNCTION sophia.b77_replace_claim() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE sophia.personal_turns SET answering_claim=gen_random_uuid()
         WHERE owner_id=NEW.owner_id AND author='person' AND reply='pending';
        RETURN NEW;
      END $$`)
    await owner(`CREATE TRIGGER b77_replace_claim BEFORE UPDATE ON sophia.personal_companion_usage FOR EACH ROW
      WHEN (OLD.state = 'reserved' AND NEW.state = 'settled' AND NEW.owner_id = '${STA}')
      EXECUTE FUNCTION sophia.b77_replace_claim()`)
    let asked: { id: string; reply?: string | null } | undefined
    try {
      double.script({ text: 'The kept answer.', usage: { input_tokens: 10, output_tokens: 5 } })
      await write(at, '/api/v1/personal/turns', STA, { text: 'Answer me while the claim moves.' })
      for (let i = 0; i < 100 && (await usage('stale-payer')).length === 0; i++)
        await new Promise((resolve) => setTimeout(resolve, 50))
      for (let i = 0; i < 100 && (await usage('stale-payer'))[0]?.state !== 'settled'; i++)
        await new Promise((resolve) => setTimeout(resolve, 50))
      assert.deepEqual(
        (await usage('stale-payer')).map((r) => r.state),
        ['settled'],
      )
      await new Promise((resolve) => setTimeout(resolve, 1500)) // the first runner's write, under its old claim
      await owner(
        `UPDATE sophia.personal_turns SET answering_since=now()-interval '10 minutes', asked_at=now()-interval '10 minutes'
         WHERE owner_id=$1 AND author='person'`,
        [STA],
      )
      const failed = await settled(at, STA)
      asked = failed.turns.find((t) => t.author === 'person')
      assert.equal(asked?.reply, 'failed', 'its claim lapsed, nothing written')
    } finally {
      await owner(`DROP TRIGGER IF EXISTS b77_replace_claim ON sophia.personal_companion_usage`)
      await owner(`DROP FUNCTION IF EXISTS sophia.b77_replace_claim()`)
    }
    assert.ok(asked)
    const fresh = await liveApi('stale-payer', STA, false)
    await write(fresh, `/api/v1/personal/turns/${asked.id}/retry`, STA, {})
    for (let i = 0; i < 60 && recorded().length - sentBefore < 2; i++)
      await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(recorded().length - sentBefore, 1, 'one provider request for the one answer requested')
    const page = await settled(fresh, STA)
    assert.deepEqual(
      page.turns.filter((t) => t.author === 'sophia').map((t) => t.text),
      ['The kept answer.'],
    )
    assert.deepEqual(
      (await usage('stale-payer')).map((r) => r.state),
      ['settled'],
    )
  })

  // R-B77-F-P1: a normal retry (sophia.retry_personal_turn: the claim cleared, asked_at now) commits before the first
  // call's settlement does. The turn is still the person's and live: its answer is kept with the cost, and asked again
  // through another runner it is written, never asked for again. FIXTURE: a test-only trigger runs the real retry inside
  // the settlement, before the answer is kept (as one committed just before it).
  it('a settled answer is kept for its turn even when a normal retry came first', async () => {
    const RTY = randomUUID()
    const at = await liveApi('retry-payer', RTY)
    const sentBefore = recorded().length
    await owner(`CREATE OR REPLACE FUNCTION sophia.b77_retry_first() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE t uuid;
      BEGIN
        SELECT id INTO t FROM sophia.personal_turns
         WHERE owner_id=NEW.owner_id AND author='person' AND reply='pending' ORDER BY seq DESC LIMIT 1;
        UPDATE sophia.personal_turns SET answering_since=now()-interval '10 minutes', asked_at=now()-interval '10 minutes'
         WHERE owner_id=NEW.owner_id AND id=t;
        PERFORM sophia.retry_personal_turn('b77-retry-first-0001', t);
        RETURN NEW;
      END $$`)
    await owner(`CREATE TRIGGER b77_retry_first BEFORE UPDATE ON sophia.personal_companion_usage FOR EACH ROW
      WHEN (OLD.state = 'reserved' AND NEW.state = 'settled' AND NEW.owner_id = '${RTY}')
      EXECUTE FUNCTION sophia.b77_retry_first()`)
    try {
      double.script({ text: 'The answer paid for.', usage: { input_tokens: 10, output_tokens: 5 } })
      await write(at, '/api/v1/personal/turns', RTY, { text: 'Answer me though I asked again.' })
      for (let i = 0; i < 100 && (await usage('retry-payer'))[0]?.state !== 'settled'; i++)
        await new Promise((resolve) => setTimeout(resolve, 50))
      assert.deepEqual(
        (await usage('retry-payer')).map((r) => r.state),
        ['settled'],
        'the first call settled, after the retry',
      )
      await new Promise((resolve) => setTimeout(resolve, 1500)) // the first runner's write, under its cleared claim
    } finally {
      await owner(`DROP TRIGGER IF EXISTS b77_retry_first ON sophia.personal_companion_usage`)
      await owner(`DROP FUNCTION IF EXISTS sophia.b77_retry_first()`)
    }
    await owner(
      `UPDATE sophia.personal_turns SET answering_since=now()-interval '10 minutes', asked_at=now()-interval '10 minutes'
       WHERE owner_id=$1 AND author='person'`,
      [RTY],
    )
    const asked = (await settled(at, RTY)).turns.find((t) => t.author === 'person')
    assert.ok(asked)
    const fresh = await liveApi('retry-payer', RTY, false)
    await write(fresh, `/api/v1/personal/turns/${asked.id}/retry`, RTY, {})
    for (let i = 0; i < 60 && recorded().length - sentBefore < 2; i++)
      await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(recorded().length - sentBefore, 1, 'one provider request for the one answer requested')
    const page = await settled(fresh, RTY)
    assert.deepEqual(
      page.turns.filter((t) => t.author === 'sophia').map((t) => t.text),
      ['The answer paid for.'],
    )
    assert.deepEqual(
      (await usage('retry-payer')).map((r) => r.state),
      ['settled'],
    )
  })

  // B77: the answer kept with its settled cost is the person's: an erasure takes it, the cost stays (content-free).
  it('an erasure takes a kept answer whose reply was not written; its settled cost stays', async () => {
    const ERA = randomUUID()
    const at = await liveApi('erased-payer', ERA)
    const sentBefore = recorded().length
    await owner(`CREATE OR REPLACE FUNCTION sophia.b77_refuse_reply() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'b77: the database is away'; END $$`)
    await owner(`CREATE TRIGGER b77_refuse_reply BEFORE INSERT ON sophia.personal_turns FOR EACH ROW
      WHEN (NEW.author = 'sophia' AND NEW.owner_id = '${ERA}') EXECUTE FUNCTION sophia.b77_refuse_reply()`)
    try {
      double.script({ text: 'Words to be erased.', usage: { input_tokens: 10, output_tokens: 5 } })
      await write(at, '/api/v1/personal/turns', ERA, { text: 'Keep this private.' })
      for (let i = 0; i < 100 && (await usage('erased-payer')).length === 0; i++)
        await new Promise((resolve) => setTimeout(resolve, 50))
      for (let i = 0; i < 60; i++) {
        const kept = await owner(`SELECT 1 FROM sophia.personal_settled_answers WHERE owner_id=$1`, [ERA])
        if (kept.length > 0) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      assert.equal(
        (await owner(`SELECT 1 FROM sophia.personal_settled_answers WHERE owner_id=$1`, [ERA])).length,
        1,
        'the answer is kept with its cost',
      )
      await new Promise((resolve) => setTimeout(resolve, 3000)) // the reply's writes tried and failed
      await owner(`UPDATE sophia.personal_turns SET answering_since=now()-interval '10 minutes' WHERE owner_id=$1`, [
        ERA,
      ])
      await write(at, '/api/v1/personal/erasure', ERA, { confirm: 'delete' })
    } finally {
      await owner(`DROP TRIGGER IF EXISTS b77_refuse_reply ON sophia.personal_turns`)
      await owner(`DROP FUNCTION IF EXISTS sophia.b77_refuse_reply()`)
    }
    assert.deepEqual(
      await owner(`SELECT 1 FROM sophia.personal_settled_answers WHERE owner_id=$1`, [ERA]),
      [],
      'nothing kept after the erasure',
    )
    assert.deepEqual(
      (await usage('erased-payer')).map((r) => r.state),
      ['settled'],
      'its cost stays',
    )
    assert.equal(recorded().length - sentBefore, 1, 'one provider request')
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

    // An operator settles the uncertain call from the provider's record. FND-C62 (R2-B85-P1-UNCERTAIN), the policy
    // changed here: an unknown usage is not proof that nothing was made, and a cost-only reconciliation is no consent to
    // pay again, so a retry of THIS turn is refused (fenced), asking nothing; a new turn is still answered.
    const [held] = await owner<{ call_id: string }>(
      `SELECT call_id FROM sophia.personal_companion_usage WHERE payer='held-payer' AND state='uncertain'`,
    )
    assert.ok(held)
    await owner(`SELECT sophia.reconcile_personal_companion($1, 0, '{"inputTokens":0,"outputTokens":0}')`, [
      held.call_id,
    ])
    await write(at, `/api/v1/personal/turns/${asked.id}/retry`, BEA, {})
    const fenced = await settled(at, BEA)
    assert.equal(fenced.turns.find((t) => t.id === asked.id)?.reply, 'failed', 'the reconciled turn stays fenced')
    assert.equal(recorded().length, sentBefore + 1, 'no second paid generation for that turn')
    double.script({ text: 'Here now.' })
    await write(at, '/api/v1/personal/turns', BEA, { text: 'A new question' })
    const answered = await settled(at, BEA)
    assert.equal(answered.turns.find((t) => t.author === 'sophia')?.text, 'Here now.')
    assert.deepEqual(
      (await usage('held-payer')).map((r) => r.state),
      ['settled', 'settled'],
    )
    assert.equal(recorded().length, sentBefore + 2, 'the new turn asked once')
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

// FND-C55 (test only, on the sealed ADC): the durable boundaries B's run did not execute, through the same live path.
describe('the live companion without 0078 (FND-C55)', () => {
  it('a live API whose database lacks 0078 is not ready and answers no turn: nothing reserved, no provider request', async () => {
    // FIXTURE, labelled: 0078's installation is read from its binding table (personalSettledAnswersInstalled); the
    // owner moves that table aside for this case only and puts it back. Not a whole old schema: a second installation
    // in this cluster is refused by design (0070, Q13), so a fresh 0078-less database cannot sit beside this file's.
    const ANA = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('old-payer', $1, 1000000)`,
      [ANA],
    )
    await owner(`ALTER TABLE sophia.personal_answer_calls RENAME TO personal_answer_calls_c55_absent`)
    try {
      const at = await liveApi('old-payer', ANA)
      const ready = await fetch(`${at}/ready`)
      assert.equal(ready.status, 503, await ready.text())
      const sentBefore = recorded().length
      const { epoch } = await space(at, ANA)
      const turn = await call(at, '/api/v1/personal/turns', ANA, { text: 'Without 0078.' }, epoch)
      const page = await settled(at, ANA)
      assert.equal(recorded().length, sentBefore, `no provider request (the turn answered ${String(turn.status)})`)
      assert.equal(page.turns.filter((t) => t.author === 'sophia').length, 0, 'no answer')
      assert.deepEqual(await usage('old-payer'), [], 'nothing reserved')
    } finally {
      await owner(`ALTER TABLE sophia.personal_answer_calls_c55_absent RENAME TO personal_answer_calls`)
    }
  })
})

type CommitFault = 'fail_before_commit' | 'lose_commit_ack'

/**
 * FIXTURE (C55): the companion's own pool on the restricted role. Once a client has sent the settlement statement, its
 * next COMMIT is either refused before it is sent (the settlement's transaction never commits) or sent and its answer
 * replaced by an error (it committed; the acknowledgement is lost). Every other statement goes as it is. `witness`
 * records what happened, so a case is never satisfied by a timeout or an unrelated failure.
 */
function commitFaultPool(mode: CommitFault, witness: string[], faults = Number.POSITIVE_INFINITY): pg.Pool {
  let left = faults
  const own = createPool(db.apiUrl, { max: 4 })
  gatedPools.push(own)
  const wrap = (client: pg.PoolClient): pg.PoolClient => {
    if (gatedClients.has(client)) return client
    gatedClients.add(client)
    const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>
    let armed = false
    return Object.assign(client, {
      query: async (...args: unknown[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0] ?? '')
        if (/settle_personal_companion_answer/.test(sql)) {
          armed = true
          const answer = await query(...args)
          witness.push('settle statement answered in its transaction')
          return answer
        }
        if (!armed || !/^\s*COMMIT\b/i.test(sql)) return query(...args)
        armed = false
        if (left <= 0) return query(...args)
        left -= 1
        if (mode === 'fail_before_commit') {
          // B84 erratum to C55: the transaction is really rolled back (C55 threw with it still open on the client).
          await query('ROLLBACK')
          witness.push('COMMIT refused before it was sent; ROLLBACK sent')
          throw new Error('C55 fixture: the settlement transaction failed before COMMIT')
        }
        await query(...args)
        witness.push('COMMIT sent and answered; acknowledgement replaced by an error')
        throw new Error('C55 fixture: the COMMIT acknowledgement was lost')
      },
    })
  }
  const connect = own.connect.bind(own) as (
    callback?: (err: Error | undefined, client: pg.PoolClient | undefined, release: (e?: unknown) => void) => void,
  ) => Promise<pg.PoolClient> | undefined
  Object.assign(own, {
    connect: (
      callback?: (err: Error | undefined, client: pg.PoolClient | undefined, release: (e?: unknown) => void) => void,
    ) =>
      callback
        ? connect((err, client, release) => callback(err, client && wrap(client), release))
        : connect()?.then((client) => wrap(client)),
  })
  return own
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('the live companion’s settlement, its COMMIT failed or its acknowledgement lost (FND-C55)', () => {
  it('a settlement whose transaction fails before COMMIT settles nothing, keeps nothing, and asks the provider no more', async () => {
    const EVE = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('c55-fail-payer', $1, 1000000)`,
      [EVE],
    )
    const witness: string[] = []
    const at = await liveApi('c55-fail-payer', EVE, true, commitFaultPool('fail_before_commit', witness))
    const sentBefore = recorded().length
    double.script({ text: 'Answer before a failed commit.', usage: { input_tokens: 10, output_tokens: 5 } })
    await write(at, '/api/v1/personal/turns', EVE, { text: 'Settle me.' })
    for (let i = 0; i < 100 && witness.length < 2; i++) await pause(50)
    assert.deepEqual(witness.slice(0, 2), [
      'settle statement answered in its transaction',
      'COMMIT refused before it was sent; ROLLBACK sent',
    ])
    await pause(2500) // anything the runner would do next has had its time, its settlement's retries included
    // B84: the same answer's settlement is tried again (never the provider); here every attempt is refused.
    assert.ok(witness.filter((w) => w.startsWith('COMMIT refused')).length > 1, 'the settlement was tried again')
    assert.equal(recorded().length - sentBefore, 1, 'one provider request, none again')
    const rows = await usage('c55-fail-payer')
    assert.equal(rows.length, 1, 'one reservation')
    assert.notEqual(rows[0]?.state, 'settled', 'not settled: the settlement never committed')
    assert.equal(rows[0]?.used_micros, null, 'no used cost recorded, no zero, no refund')
    assert.deepEqual(
      await owner(`SELECT 1 FROM sophia.personal_settled_answers WHERE owner_id=$1`, [EVE]),
      [],
      'nothing kept',
    )
    const page = parsePersonalTurnPage((await call(at, '/api/v1/personal/turns?after=0', EVE)).json)
    assert.equal(page.turns.filter((t) => t.author === 'sophia').length, 0, 'no answer shown')
    witness.push(`usage state after: ${rows[0]?.state ?? 'none'}`)
  })

  it('a settlement whose transaction fails once before COMMIT is tried again with the same answer: one request, settled once, the answer shown (4320198389)', async () => {
    const GUS = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('b84-once-payer', $1, 1000000)`,
      [GUS],
    )
    const witness: string[] = []
    const at = await liveApi('b84-once-payer', GUS, true, commitFaultPool('fail_before_commit', witness, 1))
    const sentBefore = recorded().length
    double.script({ text: 'Answer kept on the second try.', usage: { input_tokens: 10, output_tokens: 5 } })
    await write(at, '/api/v1/personal/turns', GUS, { text: 'Settle me again.' })
    let shown: string[] = []
    for (let i = 0; i < 100 && shown.length === 0; i++) {
      await pause(50)
      const page = parsePersonalTurnPage((await call(at, '/api/v1/personal/turns?after=0', GUS)).json)
      shown = page.turns.filter((t) => t.author === 'sophia').map((t) => t.text)
    }
    assert.equal(witness[1], 'COMMIT refused before it was sent; ROLLBACK sent', 'the first settlement really failed')
    assert.deepEqual(shown, ['Answer kept on the second try.'], 'the answer the provider gave, shown once')
    assert.equal(recorded().length - sentBefore, 1, 'one provider request: the settlement was retried, not the call')
    const rows = await usage('b84-once-payer')
    assert.deepEqual(
      rows.map((r) => r.state),
      ['settled'],
      'one cost, settled once',
    )
    assert.deepEqual(
      await owner(`SELECT 1 FROM sophia.personal_settled_answers WHERE owner_id=$1`, [GUS]),
      [],
      'the kept answer let go once written',
    )
  })

  it('an answer lost with every settlement rolled back is not asked for again after its cost is reconciled; a new turn still is (4320198389, 0079)', async () => {
    const HAL = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('b85-lost-payer', $1, 1000000)`,
      [HAL],
    )
    const witness: string[] = []
    // Every try of the first call's settlement is rolled back (B84 tries it four times); later calls settle.
    const at = await liveApi('b85-lost-payer', HAL, true, commitFaultPool('fail_before_commit', witness, 4))
    const sentBefore = recorded().length
    double.script({ text: 'First paid answer.', usage: { input_tokens: 10, output_tokens: 5 } })
    await write(at, '/api/v1/personal/turns', HAL, { text: 'Lose my answer.' })
    const failed = await settled(at, HAL)
    const asked = failed.turns.find((t) => t.author === 'person')
    assert.ok(asked)
    assert.equal(asked.reply, 'failed')
    assert.equal(witness.filter((w) => w === 'COMMIT refused before it was sent; ROLLBACK sent').length, 4)
    assert.equal(recorded().length - sentBefore, 1, 'one provider request')
    assert.deepEqual(
      (await usage('b85-lost-payer')).map((r) => r.state),
      ['reserved'],
    )
    // The call's registration goes; an operator settles its cost from the provider's record (cost only, no answer).
    let left: unknown[] = ['?']
    for (let i = 0; i < 60 && left.length > 0; i++) {
      left = await owner(
        `SELECT 1 FROM sophia.personal_companion_calls c JOIN sophia.personal_companion_usage u USING (call_id) WHERE u.payer='b85-lost-payer'`,
      )
      if (left.length > 0) await pause(100)
    }
    assert.deepEqual(left, [], 'no registration left')
    const [held] = await owner<{ call_id: string }>(
      `SELECT call_id FROM sophia.personal_companion_usage WHERE payer='b85-lost-payer'`,
    )
    assert.ok(held)
    assert.deepEqual(
      await owner(`SELECT sophia.reconcile_personal_companion($1, 15, '{"inputTokens":10,"outputTokens":5}') AS r`, [
        held.call_id,
      ]),
      [{ r: true }],
    )
    // Asked again: the answer is gone, and the turn is not paid for twice. Nothing is scripted: a request would be
    // answered by the double's default and counted below.
    await write(at, `/api/v1/personal/turns/${asked.id}/retry`, HAL, {})
    const again = await settled(at, HAL)
    assert.equal(again.turns.find((t) => t.id === asked.id)?.reply, 'failed', 'its answer stays unavailable')
    assert.deepEqual(
      again.turns.filter((t) => t.author === 'sophia').map((t) => t.text),
      [],
      'no answer made up',
    )
    assert.equal(recorded().length - sentBefore, 1, 'the provider is not asked again for that turn')
    assert.deepEqual(
      (await usage('b85-lost-payer')).map((r) => r.state),
      ['settled'],
      'its cost settled once, no refund',
    )
    // A new turn is a new question: it is answered.
    double.script({ text: 'A new answer.', usage: { input_tokens: 10, output_tokens: 5 } })
    await write(at, '/api/v1/personal/turns', HAL, { text: 'Something new.' })
    let shown: string[] = []
    for (let i = 0; i < 100 && shown.length === 0; i++) {
      await pause(50)
      shown = parsePersonalTurnPage((await call(at, '/api/v1/personal/turns?after=0', HAL)).json)
        .turns.filter((t) => t.author === 'sophia')
        .map((t) => t.text)
    }
    assert.deepEqual(shown, ['A new answer.'])
    assert.equal(recorded().length - sentBefore, 2)
  })

  it('a settlement that committed but whose acknowledgement was lost is kept once; a later retry writes it, asking nothing', async () => {
    const FAY = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('c55-ack-payer', $1, 1000000)`,
      [FAY],
    )
    const witness: string[] = []
    const at = await liveApi('c55-ack-payer', FAY, true, commitFaultPool('lose_commit_ack', witness))
    const sentBefore = recorded().length
    double.script({
      text: 'The answer whose commit was not acknowledged.',
      usage: { input_tokens: 10, output_tokens: 5 },
    })
    await write(at, '/api/v1/personal/turns', FAY, { text: 'Keep me once.' })
    for (let i = 0; i < 100 && witness.length < 2; i++) await pause(50)
    assert.deepEqual(witness, [
      'settle statement answered in its transaction',
      'COMMIT sent and answered; acknowledgement replaced by an error',
    ])
    await pause(1500)
    assert.equal(recorded().length - sentBefore, 1, 'one provider request')
    assert.deepEqual(
      (await usage('c55-ack-payer')).map((r) => r.state),
      ['settled'],
      'one settled cost, committed',
    )
    // Its claim lapsed (as after two minutes) unless the reply was written already; then a normal retry elsewhere.
    await owner(
      `UPDATE sophia.personal_turns SET answering_since=now()-interval '10 minutes', asked_at=now()-interval '10 minutes'
       WHERE owner_id=$1 AND author='person'`,
      [FAY],
    )
    const first = await settled(at, FAY)
    const asked = first.turns.find((t) => t.author === 'person')
    assert.ok(asked)
    if (first.turns.every((t) => t.author !== 'sophia')) {
      const fresh = await liveApi('c55-ack-payer', FAY, false)
      await write(fresh, `/api/v1/personal/turns/${asked.id}/retry`, FAY, {})
      await settled(fresh, FAY)
    }
    await pause(500)
    assert.equal(
      recorded().length - sentBefore,
      1,
      'still one provider request: the kept answer was written, not asked again',
    )
    assert.deepEqual(
      (await usage('c55-ack-payer')).map((r) => r.state),
      ['settled'],
      'still one settled cost, no second reservation',
    )
    const page = parsePersonalTurnPage((await call(at, '/api/v1/personal/turns?after=0', FAY)).json)
    assert.deepEqual(
      page.turns.filter((t) => t.author === 'sophia').map((t) => t.text),
      ['The answer whose commit was not acknowledged.'],
      'the original answer, once',
    )
  })
})

// R-B77-FOCUSED-CLOSURE-01 left untested: a stale runner released AFTER another runner wrote the reply and its kept
// answer was let go. Runner 1 has read «nothing kept» (its read committed) and waits at its reservation statement,
// holding no lock (only its transaction's BEGIN was sent); runner 2 takes the lapsed turn by a normal retry and answers
// it; then runner 1 goes on. Expected of the boundary: no second provider request and no second settled cost.
/** FIXTURE (C55 control 5): while `stalled.on`, this pool's claim renewals fail before reaching the database. */
function renewalsStalled(own: pg.Pool, stalled: { on: boolean; refused: number }): pg.Pool {
  const wrapped = new WeakSet<pg.PoolClient>()
  const wrap = (client: pg.PoolClient): pg.PoolClient => {
    if (wrapped.has(client)) return client
    wrapped.add(client)
    const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>
    return Object.assign(client, {
      query: async (...args: unknown[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0] ?? '')
        if (stalled.on && /renew_personal_reply/.test(sql)) {
          stalled.refused += 1
          throw new Error('C55 fixture: runner 1 is stalled; its renewal did not reach the database')
        }
        return query(...args)
      },
    })
  }
  const connect = own.connect.bind(own) as (
    callback?: (err: Error | undefined, client: pg.PoolClient | undefined, release: (e?: unknown) => void) => void,
  ) => Promise<pg.PoolClient> | undefined
  Object.assign(own, {
    connect: (
      callback?: (err: Error | undefined, client: pg.PoolClient | undefined, release: (e?: unknown) => void) => void,
    ) =>
      callback
        ? connect((err, client, release) => callback(err, client && wrap(client), release))
        : connect()?.then((client) => wrap(client)),
  })
  return own
}

describe('a stale runner released after another wrote the reply (FND-C55, control 5)', () => {
  it('asks the provider nothing more and pays nothing more once another runner has answered the turn', async () => {
    const GUS = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('c55-stale-payer', $1, 1000000)`,
      [GUS],
    )
    const held = gate()
    // FIXTURE, labelled: runner 1 is stalled as a whole while held. Its claim renewals (the watch, every 2 s) do not
    // reach the database (the watch ignores a failed renewal); left to renew, its claim never lapses and a normal retry
    // is refused «it is pending» (C55 log 30-…GUARD: the upstream guard, witnessed).
    const stalled = { on: false, refused: 0 }
    // Runner 1's own API: its runner's pool renews (stalled here), its companion's pool reserves (held at the gate).
    await owner(`UPDATE sophia.personal_companion_payers SET owner_id=$2 WHERE payer=$1`, ['c55-stale-payer', GUS])
    const runnerPool = createPool(db.apiUrl, { max: 4 })
    gatedPools.push(runnerPool)
    const configured = await personalCompanionFrom(env('c55-stale-payer', GUS), gatedPool(held))
    companions.push(configured)
    const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
    const runner1 = buildApp({
      pool: renewalsStalled(runnerPool, stalled),
      verifyActor,
      companion: configured.companion,
    })
    apps.push(runner1)
    await runner1.listen({ port: 0, host: '127.0.0.1' })
    const first = `http://127.0.0.1:${String((runner1.server.address() as AddressInfo).port)}`
    const sentBefore = recorded().length
    await write(first, '/api/v1/personal/turns', GUS, { text: 'Answer me once, whoever does.' })
    await within(10_000, 'runner 1 at its reservation', held.reached)
    assert.equal(held.delegated, 1, 'runner 1 read nothing kept and waits at its one reservation statement')
    stalled.on = true // from here runner 1 is stalled as a whole: its context was read, its reservation is held
    try {
      for (let i = 0; i < 80 && stalled.refused === 0; i++) await pause(50) // one renewal refused: the stall is real
      // Runner 2: the claim lapsed (as after two minutes), a normal retry through another API and runner.
      await owner(
        `UPDATE sophia.personal_turns SET answering_since=now()-interval '10 minutes', asked_at=now()-interval '10 minutes'
         WHERE owner_id=$1 AND author='person'`,
        [GUS],
      )
      const asked = (await settled(first, GUS)).turns.find((t) => t.author === 'person')
      assert.ok(asked)
      double.script({ text: 'Answered by runner 2.', usage: { input_tokens: 10, output_tokens: 5 } })
      const second = await liveApi('c55-stale-payer', GUS, false)
      await write(second, `/api/v1/personal/turns/${asked.id}/retry`, GUS, {})
      const answered = await settled(second, GUS)
      assert.deepEqual(
        answered.turns.filter((t) => t.author === 'sophia').map((t) => t.text),
        ['Answered by runner 2.'],
      )
      assert.equal(recorded().length - sentBefore, 1, 'runner 2 asked once')
      assert.deepEqual(
        (await usage('c55-stale-payer')).map((r) => r.state),
        ['settled'],
      )
      assert.deepEqual(
        await owner(`SELECT 1 FROM sophia.personal_settled_answers WHERE owner_id=$1`, [GUS]),
        [],
        'its kept answer let go',
      )
    } finally {
      stalled.on = false
      held.open()
    }
    assert.ok(stalled.refused > 0, 'runner 1 tried to renew while stalled')
    // Runner 1 goes on from its reservation statement.
    for (let i = 0; i < 60 && held.outcome.length < 1; i++) await pause(50)
    await pause(2000)
    const states = (await usage('c55-stale-payer')).map((r) => r.state)
    const outcome = JSON.stringify(held.outcome)
    assert.equal(
      recorded().length - sentBefore,
      1,
      `no second provider request (runner 1's reservation: ${outcome}; costs ${JSON.stringify(states)})`,
    )
    assert.equal(
      states.filter((st) => st === 'settled').length,
      1,
      `one settled cost (costs ${JSON.stringify(states)})`,
    )
    assert.deepEqual(
      parsePersonalTurnPage((await call(first, '/api/v1/personal/turns?after=0', GUS)).json)
        .turns.filter((t) => t.author === 'sophia')
        .map((t) => t.text),
      ['Answered by runner 2.'],
      'one reply',
    )
  })
})

// FND-C62 (R2-B85 P1s): the three fence gaps, through the same live path. FIXTURES are labelled in each case.
const migration = (name: string) => readFileSync(new URL(`../../../db/migrations/${name}`, import.meta.url), 'utf8')

/** 0078's own reserve_personal_answer, as a database through 0078 has it (FIXTURE: 0079 absent for this case only). */
function reserve0078(): string {
  const sql = migration('0078_personal_settled_reply_recovery.sql')
  const start = sql.indexOf('CREATE FUNCTION sophia.reserve_personal_answer(')
  const end = sql.indexOf('END $$;', start) + 'END $$;'.length
  return sql.slice(start, end).replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
}

describe('the completed-call fence’s gaps (FND-C62)', () => {
  it('F1: on a database through 0078 without 0079 the live API is not ready and asks nothing', async () => {
    const HAL = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('c62-f1-payer', $1, 1000000)`,
      [HAL],
    )
    await owner(reserve0078())
    try {
      const at = await liveApi('c62-f1-payer', HAL)
      assert.equal((await fetch(`${at}/ready`)).status, 503, 'not ready without 0079')
      const sentBefore = recorded().length
      await write(at, '/api/v1/personal/turns', HAL, { text: 'Without 0079.' })
      const page = await settled(at, HAL)
      assert.equal(recorded().length, sentBefore, 'no provider request')
      assert.equal(page.turns.filter((t) => t.author === 'sophia').length, 0)
      assert.deepEqual(await usage('c62-f1-payer'), [], 'nothing reserved')
    } finally {
      await owner(migration('0079_personal_completed_call_fence.sql'))
      await owner(migration('0080_personal_unusable_completion_fence.sql')) // the latest reservation again
    }
  })

  it('F3: a bound call settled before 0079 with no reason and no answer is fenced after the upgrade; a new turn is not', async () => {
    const IVY = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('c62-f3-payer', $1, 1000000)`,
      [IVY],
    )
    const at = await liveApi('c62-f3-payer', IVY)
    const sentBefore = recorded().length
    double.script({ status: 500 })
    await write(at, '/api/v1/personal/turns', IVY, { text: 'Lost before 0079.' })
    const asked = (await settled(at, IVY)).turns.find((t) => t.author === 'person')
    assert.ok(asked && asked.reply === 'failed')
    // FIXTURE, labelled: the state a reconciliation under 0073/0078 (before 0079) left for a bound call: settled, cost
    // recorded, no reason; no answer kept. Then the upgrade: 0079 applied (its backfill classifies such rows).
    await owner(
      `UPDATE sophia.personal_companion_usage SET state='settled', reason=NULL, used_micros=0,
         usage='{"inputTokens":0,"outputTokens":0}', settled_at=now() WHERE payer='c62-f3-payer'`,
    )
    // 0079 applied over that row: its backfill classifies it 'settled_before_fence'. Re-running 0079 also replaces the
    // latest reservation, so 0080 is restored before any API check (and in finally): 0080's backfill touches only rows
    // with no reason, so this one keeps 0079's reason (FND-B101, R2-C67 item 1).
    const reasonOf = async () =>
      (
        await owner<{ reason: string | null }>(
          `SELECT reason FROM sophia.personal_companion_usage WHERE payer='c62-f3-payer'`,
        )
      ).map((r) => r.reason)
    try {
      await owner(migration('0079_personal_completed_call_fence.sql'))
      assert.deepEqual(await reasonOf(), ['settled_before_fence'], '0079 classifies the legacy row')
      await owner(migration('0080_personal_unusable_completion_fence.sql'))
      assert.deepEqual(await reasonOf(), ['settled_before_fence'], '0080 leaves an already-reasoned row as it is')
      assert.equal((await fetch(`${at}/ready`)).status, 200, 'ready again with 0080')
      await write(at, `/api/v1/personal/turns/${asked.id}/retry`, IVY, {})
      const fenced = await settled(at, IVY)
      assert.equal(recorded().length, sentBefore + 1, 'no second generation for the old turn')
      assert.equal(fenced.turns.find((t) => t.id === asked.id)?.reply, 'failed')
      assert.equal((await usage('c62-f3-payer')).length, 1, 'cost history kept, nothing new reserved')
      double.script({ text: 'A new answer.' })
      await write(at, '/api/v1/personal/turns', IVY, { text: 'Something new' })
      const page = await settled(at, IVY)
      assert.deepEqual(
        page.turns.filter((t) => t.author === 'sophia').map((t) => t.text),
        ['A new answer.'],
      )
    } finally {
      await owner(migration('0079_personal_completed_call_fence.sql'))
      await owner(migration('0080_personal_unusable_completion_fence.sql')) // the latest reservation again
    }
  })
})

// FND-C64 (finding 4321054353): the server's own shutdown order (server.ts: app.close, then the model service's
// dispose, then pool.end, then exit) while an accepted turn's answer is mid-stream with no HTTP request left open.
describe('shutting down while an accepted answer is mid-stream (FND-C64)', () => {
  it('finishes the accepted answer, its cost and its reply before the model service and the pool close', async () => {
    const JO = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('c64-payer', $1, 1000000)`,
      [JO],
    )
    await owner(`UPDATE sophia.personal_companion_payers SET owner_id=$2 WHERE payer=$1`, ['c64-payer', JO])
    // FIXTURE: this case's own app and pools (closed here, as the server closes its own).
    const apiPool = createPool(db.apiUrl, { max: 4 })
    const configured = await personalCompanionFrom(env('c64-payer', JO), apiPool)
    const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
    const app = buildApp({ pool: apiPool, verifyActor, companion: configured.companion })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const at = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
    const sentBefore = recorded().length
    double.script({ text: 'Answered before shutdown.', usage: { input_tokens: 10, output_tokens: 5 }, delayMs: 1200 })
    const order: string[] = []
    await write(at, '/api/v1/personal/turns', JO, { text: 'Answer me, then stop.' })
    order.push('POST 202 answered')
    // Witness: the provider request is in flight (the double holds its stream) and the call is reserved.
    for (let i = 0; i < 100 && recorded().length === sentBefore; i++) await pause(20)
    assert.equal(recorded().length - sentBefore, 1, 'the provider stream is active')
    const [reserved] = await owner<{ n: number }>(
      `SELECT count(*)::int n FROM sophia.personal_companion_usage WHERE payer='c64-payer' AND state='reserved'`,
    )
    assert.equal(reserved?.n, 1, 'the call is reserved')
    const replies = async () =>
      (
        await owner<{ n: number }>(
          `SELECT count(*)::int n FROM sophia.personal_turns WHERE owner_id=$1 AND author='sophia'`,
          [JO],
        )
      )[0]?.n ?? 0
    // The server's shutdown, in its order (process.exit itself is not called in a test).
    await app.close()
    order.push(`app.close (replies ${String(await replies())})`)
    await configured.dispose()
    order.push('service.dispose')
    await apiPool.end()
    order.push('pool.end')
    await pause(1600) // past the double's hold: anything left running after the pool closed has had its time
    const usageNow = (await usage('c64-payer')).map((r) => r.state)
    const witness = { order, usage: usageNow, replies: await replies(), requests: recorded().length - sentBefore }
    console.log(`C64 witness ${JSON.stringify(witness)}`)
    assert.equal(
      order[1],
      'app.close (replies 1)',
      `the reply was written before app.close resolved: ${JSON.stringify(witness)}`,
    )
    assert.deepEqual(usageNow, ['settled'], 'its cost settled, not left reserved')
    assert.equal(witness.requests, 1, 'one provider request, none again')
  })
})

/** FIXTURE (C65): a pool whose final reply write (record_personal_reply) waits at `at` before it is sent. */
function replyGatedPool(at: Gate): pg.Pool {
  const own = createPool(db.apiUrl, { max: 4 })
  const wrapped = new WeakSet<pg.PoolClient>()
  const wrap = (client: pg.PoolClient): pg.PoolClient => {
    if (wrapped.has(client)) return client
    wrapped.add(client)
    const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>
    return Object.assign(client, {
      query: async (...args: unknown[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0] ?? '')
        if (/record_personal_(settled_)?reply/.test(sql)) {
          at.delegated += 1
          await at.arrive()
        }
        return query(...args)
      },
    })
  }
  const connect = own.connect.bind(own) as (
    callback?: (err: Error | undefined, client: pg.PoolClient | undefined, release: (e?: unknown) => void) => void,
  ) => Promise<pg.PoolClient> | undefined
  Object.assign(own, {
    connect: (
      callback?: (err: Error | undefined, client: pg.PoolClient | undefined, release: (e?: unknown) => void) => void,
    ) =>
      callback
        ? connect((err, client, release) => callback(err, client && wrap(client), release))
        : connect()?.then((client) => wrap(client)),
  })
  return own
}

describe('shutting down between the provider’s result and the final reply write (FND-C65)', () => {
  it('close waits for the final reply write after the cost is settled and the answer kept; one request', async () => {
    await c65Episode('c65-payer')
  })

  // FND-B102 (R2-B101 item 3): the episode's own app, pools and gate are released even when its witness fails early.
  it('a witness that fails right after the barrier is reached still opens the gate and closes its app and pools', async () => {
    const owned: Owned = {}
    await assert.rejects(
      c65Episode('b102-early-payer', { failAfterReached: true, owned }),
      /synthetic early witness failure/,
    )
    assert.equal(owned.opened, true, 'the gate was opened')
    assert.equal(owned.app?.server.listening, false, 'its app is closed')
    assert.equal(owned.apiPool?.ended, true, 'its API pool ended')
    assert.equal(owned.companionPool?.ended, true, 'its companion pool ended')
    assert.equal(owned.disposed, true, 'its model service disposed')
  })
})

/** What a C65 episode owns, for a check of its cleanup (FND-B102). */
interface Owned {
  app?: FastifyInstance
  apiPool?: pg.Pool
  companionPool?: pg.Pool
  opened?: boolean
  disposed?: boolean
}

/**
 * The C65 barrier episode: the final reply write held, close observed while it waits, then released. Whatever fails
 * (the write, the barrier, the observation, close, a witness), its gate is opened and its app, model service and pools
 * are closed in finally; a cleanup failure is reported with the witness failure, never instead of it (FND-B102).
 */
async function c65Episode(payer: string, opts: { failAfterReached?: boolean; owned?: Owned } = {}) {
  const KAI = randomUUID()
  const owned = opts.owned ?? {}
  await owner(
    `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ($1, $2, 1000000)`,
    [payer, KAI],
  )
  const held = gate()
  const apiPool = replyGatedPool(held)
  const companionPool = createPool(db.apiUrl, { max: 4 })
  owned.apiPool = apiPool
  owned.companionPool = companionPool
  const configured = await personalCompanionFrom(env(payer, KAI), companionPool)
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const app = buildApp({ pool: apiPool, verifyActor, companion: configured.companion })
  owned.app = app
  let witnessError: unknown
  try {
    await app.listen({ port: 0, host: '127.0.0.1' })
    const at = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
    const sentBefore = recorded().length
    double.script({ text: 'Kept before the reply.', usage: { input_tokens: 10, output_tokens: 5 } })
    await write(at, '/api/v1/personal/turns', KAI, { text: 'Answer, then I stop.' })
    await within(10_000, 'the final reply write reached', held.reached)
    if (opts.failAfterReached) throw new Error('synthetic early witness failure')
    const atBarrier = {
      usage: (await usage(payer)).map((r) => r.state),
      reasons: (await usage(payer)).map((r) => r.reason),
      kept: (
        await owner<{ n: number }>(`SELECT count(*)::int n FROM sophia.personal_settled_answers WHERE owner_id=$1`, [
          KAI,
        ])
      )[0]?.n,
    }
    let closed = false
    const closing = app.close().then(() => {
      closed = true
    })
    await pause(300) // an observation window, not a gate: close must still be waiting on the held write
    const closedWhileHeld = closed
    held.open()
    owned.opened = true
    await within(15_000, 'app.close after the reply', closing)
    const replies = (
      await owner<{ n: number }>(
        `SELECT count(*)::int n FROM sophia.personal_turns WHERE owner_id=$1 AND author='sophia'`,
        [KAI],
      )
    )[0]?.n
    const witness = {
      atBarrier,
      closedWhileHeld,
      replies,
      usage: (await usage(payer)).map((r) => r.state),
      requests: recorded().length - sentBefore,
    }
    console.log(`C65 barrier witness ${JSON.stringify(witness)}`)
    assert.deepEqual(atBarrier.usage, ['settled'], 'at the barrier the cost is settled')
    assert.equal(atBarrier.kept, 1, 'and the answer kept')
    // A usable answer, kept: its cost carries no without-answer class, nor after the final write (FND-B101, 0080).
    assert.deepEqual(atBarrier.reasons, [null], 'kept answer: reason NULL at the barrier')
    assert.deepEqual(
      (await usage(payer)).map((r) => [r.state, r.reason]),
      [['settled', null]],
      'and after the final write',
    )
    assert.equal(
      (
        await owner<{ n: number }>(`SELECT count(*)::int n FROM sophia.personal_settled_answers WHERE owner_id=$1`, [
          KAI,
        ])
      )[0]?.n,
      0,
      'the kept answer let go once written',
    )
    assert.equal(closedWhileHeld, false, 'close waits for the final reply write')
    assert.equal(replies, 1, 'the reply written before close resolved')
    assert.equal(witness.requests, 1, 'one provider request')
  } catch (err) {
    witnessError = err
  } finally {
    await releaseEpisode({ held, app, configured, pools: [apiPool, companionPool], owned }, witnessError)
  }
  if (witnessError !== undefined)
    throw witnessError instanceof Error
      ? witnessError
      : new Error('C65 episode witness failed', { cause: witnessError })
}

/**
 * A C65 episode's own resources released, whatever happened: its gate opened, its app closed, its model service
 * disposed and its pools ended. A cleanup failure is thrown with the witness failure, never instead of it (FND-B102).
 */
async function releaseEpisode(
  r: { held: Gate; app: FastifyInstance; configured: ConfiguredCompanion; pools: pg.Pool[]; owned: Owned },
  witnessError: unknown,
) {
  const cleanup: unknown[] = []
  r.held.open()
  r.owned.opened = true
  await r.app.close().catch((e: unknown) => cleanup.push(e))
  await r.configured.dispose().then(
    () => (r.owned.disposed = true),
    (e: unknown) => cleanup.push(e),
  )
  for (const each of r.pools) if (!each.ended) await each.end().catch((e: unknown) => cleanup.push(e))
  if (cleanup.length > 0)
    throw new AggregateError(
      witnessError === undefined ? cleanup : [witnessError, ...cleanup],
      'C65 episode cleanup failed',
    )
}

/** A free loopback port (FIXTURE: picked, then given to the server it starts). */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })

describe('the actual server process: SIGTERM, then SIGINT, while an accepted answer is mid-stream (FND-C65)', () => {
  it('finishes the accepted answer, chains no queued turn, and exits 0 once, after one provider request', async () => {
    const LEO = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('c65-srv-payer', $1, 1000000)`,
      [LEO],
    )
    const port = await freePort()
    // The actual entry point (apps/api/src/server.ts), its own pool and live companion; the double in this process.
    const child = spawn(process.execPath, ['apps/api/src/server.ts'], {
      env: {
        PATH: process.env.PATH ?? '',
        HOST: '127.0.0.1',
        PORT: String(port),
        SOPHIA_API_DATABASE_URL: db.apiUrl,
        SUPABASE_JWT_ISSUER: ISSUER,
        SUPABASE_JWT_SECRET: SECRET,
        ...env('c65-srv-payer', LEO),
      },
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
      child.once('exit', (code, signal) => resolve({ code, signal })),
    )
    const at = `http://127.0.0.1:${String(port)}`
    try {
      for (let i = 0; i < 150; i++) {
        const up = await fetch(`${at}/health`).then(
          (r) => r.ok,
          () => false,
        )
        if (up) break
        await pause(100)
      }
      const sentBefore = recorded().length
      // A timed hold (the double has no manual gate): its stream stays open 2.5 s after it starts.
      double.script({ text: 'Answered across SIGTERM.', usage: { input_tokens: 10, output_tokens: 5 }, delayMs: 2500 })
      await write(at, '/api/v1/personal/turns', LEO, { text: 'First, answered.' })
      for (let i = 0; i < 100 && recorded().length === sentBefore; i++) await pause(20)
      assert.equal(recorded().length - sentBefore, 1, 'the first answer’s stream is active')
      const [reserved] = await owner<{ n: number }>(
        `SELECT count(*)::int n FROM sophia.personal_companion_usage WHERE payer='c65-srv-payer' AND state='reserved'`,
      )
      assert.equal(reserved?.n, 1, 'its call is reserved')
      await write(at, '/api/v1/personal/turns', LEO, { text: 'Second, queued.' })
      child.kill('SIGTERM')
      await pause(200)
      child.kill('SIGINT') // repeated while the stream is held: one shutdown
      const sentinel = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 20_000))
      const end = await Promise.race([exited, sentinel])
      if (end === 'timeout') child.kill('SIGKILL') // bounded cleanup of this test's own child only
      const turns = await owner<{ author: string; reply: string | null }>(
        `SELECT author, reply FROM sophia.personal_turns WHERE owner_id=$1 ORDER BY seq`,
        [LEO],
      )
      const witness = {
        exit: end,
        requests: recorded().length - sentBefore,
        usage: (await usage('c65-srv-payer')).map((r) => r.state),
        turns: turns.map((t) => `${t.author}:${t.reply ?? '-'}`),
      }
      console.log(`C65 server witness ${JSON.stringify(witness)}`)
      assert.deepEqual(end, { code: 0, signal: null }, `a normal exit: ${JSON.stringify(witness)}`)
      assert.equal(witness.requests, 1, 'one provider request: the queued turn was not chained into a paid call')
      assert.deepEqual(witness.usage, ['settled'], 'the first answer’s cost settled before exit')
      assert.equal(turns.filter((t) => t.author === 'sophia').length, 1, 'the first answer’s reply written before exit')
      assert.equal(
        turns.filter((t) => t.author === 'person' && t.reply === 'pending').length,
        1,
        'the queued turn stays pending',
      )
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
  })
})

// FND-C67 (finding 4321368164): a call that completed with known usage but no storable reply (here a U+0000 body).
describe('a completed call with known usage and no usable reply (FND-C67)', () => {
  it('fences its turn: a same-turn retry asks and pays nothing more; a new turn is answered once', async () => {
    const MAY = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('c67-payer', $1, 1000000)`,
      [MAY],
    )
    const at = await liveApi('c67-payer', MAY)
    const sentBefore = recorded().length
    double.script({ text: 'Bad\u0000body', usage: { input_tokens: 10, output_tokens: 5 } })
    await write(at, '/api/v1/personal/turns', MAY, { text: 'Answer me.' })
    const asked = (await settled(at, MAY)).turns.find((t) => t.author === 'person')
    assert.ok(asked)
    const kept = async () =>
      (
        await owner<{ n: number }>(`SELECT count(*)::int n FROM sophia.personal_settled_answers WHERE owner_id=$1`, [
          MAY,
        ])
      )[0]?.n
    const firstRows = await usage('c67-payer')
    const first = {
      reply: asked.reply,
      usage: firstRows.map((r) => [r.state, r.reason, r.used_micros]),
      kept: await kept(),
      requests: recorded().length - sentBefore,
    }
    // The same turn asked again, a fresh key; the double would answer it validly.
    double.script({ text: 'A valid second answer.', usage: { input_tokens: 10, output_tokens: 5 } })
    await write(at, `/api/v1/personal/turns/${asked.id}/retry`, MAY, {})
    const again = await settled(at, MAY)
    for (let i = 0; i < 40 && recorded().length - sentBefore < 2; i++) await pause(50)
    const retried = {
      reply: again.turns.find((t) => t.id === asked.id)?.reply,
      sophia: again.turns.filter((t) => t.author === 'sophia').length,
      usage: (await usage('c67-payer')).map((r) => [r.state, r.reason, r.used_micros]),
      requests: recorded().length - sentBefore,
    }
    console.log(`C67 witness ${JSON.stringify({ first, retried })}`)
    assert.deepEqual(
      [first.reply, first.kept, first.requests],
      ['failed', 0, 1],
      'the unusable completion: failed, none kept',
    )
    assert.equal(first.usage.length, 1, 'its known cost settled once')
    assert.equal(retried.requests, 1, 'no second generation for the same turn')
    assert.equal(retried.usage.length, 1, 'no second reservation or cost')
    assert.equal(retried.sophia, 0, 'no reply made up')
    assert.equal(retried.reply, 'failed', 'the same turn stays failed')
    // Its known cost, as first settled, unchanged by the retry: amount and token counts (FND-B101, R2-C67 item 2).
    assert.deepEqual(
      (await usage('c67-payer')).map((r) => [r.state, r.reason, r.used_micros, r.usage]),
      firstRows.map((r) => [r.state, 'settled_without_answer', r.used_micros, r.usage]),
    )
    assert.ok(Number(firstRows[0]?.used_micros ?? 0) > 0, 'a known, nonzero cost')
    // Asked again through a fresh API instance and runner: still nothing asked, reserved or paid.
    const second = await liveApi('c67-payer', MAY)
    await write(second, `/api/v1/personal/turns/${asked.id}/retry`, MAY, {})
    await settled(second, MAY)
    await pause(1000)
    assert.equal(recorded().length - sentBefore, 1, 'a fresh runner asks nothing for that turn')
    assert.equal((await usage('c67-payer')).length, 1, 'and reserves nothing')
    // The same retry sent twice under one Idempotency-Key: the second replays the first's receipt; nothing asked.
    const { epoch } = await space(at, MAY)
    const replayKey = randomUUID()
    const retryPath = `/api/v1/personal/turns/${asked.id}/retry`
    const once = await call(at, retryPath, MAY, {}, { epoch, key: replayKey })
    await settled(at, MAY)
    const twice = await call(at, retryPath, MAY, {}, { epoch, key: replayKey })
    assert.equal(once.status, 202, JSON.stringify(once.json))
    assert.equal(twice.status, 202, JSON.stringify(twice.json))
    assert.deepEqual(twice.json, once.json, 'the same key replays the receipt')
    await pause(1000)
    assert.equal(recorded().length - sentBefore, 1, 'a replayed retry asks nothing')
    assert.equal((await usage('c67-payer')).length, 1, 'and pays nothing')
    // A genuinely new turn is answered, once, under its own admission (the queued valid step above).
    await write(at, '/api/v1/personal/turns', MAY, { text: 'Something new.' })
    const fresh = await settled(at, MAY)
    assert.equal(fresh.turns.filter((t) => t.author === 'sophia').length, 1)
    assert.equal(recorded().length - sentBefore, 2, 'the new turn asked once')
    // The usable answer's cost carries no without-answer class: kept, then written (R2 v2 ledger control).
    assert.deepEqual(
      (await usage('c67-payer')).map((r) => [r.state, r.reason]),
      [
        ['settled', 'settled_without_answer'],
        ['settled', null],
      ],
    )
  })

  it('a tool call with known usage is fenced the same way: its turn is not asked again (FND-B101)', async () => {
    const NED = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('b101-tool-payer', $1, 1000000)`,
      [NED],
    )
    const at = await liveApi('b101-tool-payer', NED)
    const sentBefore = recorded().length
    double.script({
      toolCall: { name: 'synthetic_tool', arguments: {} },
      usage: { input_tokens: 10, output_tokens: 5 },
    })
    await write(at, '/api/v1/personal/turns', NED, { text: 'Use a tool.' })
    const asked = (await settled(at, NED)).turns.find((t) => t.author === 'person')
    assert.ok(asked)
    assert.equal(asked.reply, 'failed')
    assert.equal(recorded().length - sentBefore, 1)
    assert.deepEqual(
      (await usage('b101-tool-payer')).map((r) => [r.state, r.reason]),
      [['settled', 'settled_without_answer']],
    )
    await write(at, `/api/v1/personal/turns/${asked.id}/retry`, NED, {})
    await settled(at, NED)
    await pause(1000)
    assert.equal(recorded().length - sentBefore, 1, 'no second generation for that turn')
    assert.equal((await usage('b101-tool-payer')).length, 1)
  })
})

// FND-B101 (R2-C67 item 3): 0080's backfill and the versions around it, on the live path's own rows.
describe('0080 over costs settled before it, and the versions around it (FND-B101)', () => {
  it('classifies failed and pending bound turns with no answer kept; leaves answered and held rows; amounts and times unchanged', async () => {
    const OLA = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('b101-backfill-payer', $1, 1000000)`,
      [OLA],
    )
    const at = await liveApi('b101-backfill-payer', OLA)
    const known = { input_tokens: 10, output_tokens: 5 }
    double.script({ text: 'Bad\u0000one', usage: known })
    await write(at, '/api/v1/personal/turns', OLA, { text: 'One.' })
    await settled(at, OLA)
    double.script({ text: 'Fine.', usage: known })
    await write(at, '/api/v1/personal/turns', OLA, { text: 'Two.' })
    await settled(at, OLA)
    double.script({ text: 'Bad\u0000three', usage: known })
    await write(at, '/api/v1/personal/turns', OLA, { text: 'Three.' })
    await settled(at, OLA)
    double.script({ status: 500 })
    await write(at, '/api/v1/personal/turns', OLA, { text: 'Four.' })
    const page = await settled(at, OLA)
    const turns = page.turns.filter((t) => t.author === 'person')
    assert.deepEqual(
      turns.map((t) => t.reply),
      ['failed', 'answered', 'failed', 'failed'],
    )
    const rows = () =>
      owner<{
        turn_id: string | null
        state: string
        reason: string | null
        used_micros: string | null
        usage: unknown
        settled_at: string | null
        reserved_at: string
      }>(
        `SELECT b.turn_id, u.state, u.reason, u.used_micros, u.usage, u.settled_at::text, u.reserved_at::text
           FROM sophia.personal_companion_usage u LEFT JOIN sophia.personal_answer_calls b USING (call_id)
          WHERE u.payer='b101-backfill-payer' ORDER BY u.reserved_at`,
      )
    // FIXTURE, labelled: rows as settled before 0080 (no reason), and turn three left pending by a retry.
    await owner(
      `UPDATE sophia.personal_companion_usage SET reason=NULL WHERE payer='b101-backfill-payer' AND state='settled'`,
    )
    await owner(`UPDATE sophia.personal_turns SET reply='pending', answering_claim=NULL WHERE id=$1`, [turns[2]?.id])
    const was = await rows()
    assert.deepEqual(
      was.map((r) => [r.state, r.reason]),
      [
        ['settled', null],
        ['settled', null],
        ['settled', null],
        ['uncertain', 'usage_unknown'],
      ],
    )
    await owner(migration('0080_personal_unusable_completion_fence.sql'))
    const now = await rows()
    assert.deepEqual(
      now.map((r) => [r.turn_id, r.state, r.reason]),
      [
        [turns[0]?.id, 'settled', 'settled_without_answer'],
        [turns[1]?.id, 'settled', null],
        [turns[2]?.id, 'settled', 'settled_without_answer'],
        [turns[3]?.id, 'uncertain', 'usage_unknown'],
      ],
      'failed and pending classified; answered and held untouched',
    )
    assert.deepEqual(
      now.map((r) => [r.used_micros, r.usage, r.settled_at, r.reserved_at]),
      was.map((r) => [r.used_micros, r.usage, r.settled_at, r.reserved_at]),
      'amounts, counts and times unchanged',
    )
  })

  it('a database whose reservation is 0079 alone is not ready for this API and reserves nothing; 0080 keeps 0079 marker and signature', async () => {
    const PIA = randomUUID()
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ('b101-mixed-payer', $1, 1000000)`,
      [PIA],
    )
    try {
      await owner(migration('0079_personal_completed_call_fence.sql')) // the reservation as 0079 wrote it
      const at = await liveApi('b101-mixed-payer', PIA)
      assert.equal((await fetch(`${at}/ready`)).status, 503, 'not ready with 0079 alone')
      const sentBefore = recorded().length
      await write(at, '/api/v1/personal/turns', PIA, { text: 'Without 0080.' })
      await settled(at, PIA)
      assert.equal(recorded().length, sentBefore, 'no provider request')
      assert.deepEqual(await usage('b101-mixed-payer'), [], 'nothing reserved')
    } finally {
      await owner(migration('0079_personal_completed_call_fence.sql'))
      await owner(migration('0080_personal_unusable_completion_fence.sql')) // the latest reservation again
    }
    // FUNCTION-LEVEL compatibility, not an older API process: 261's readiness query looks for 0079's marker in the
    // reservation, and calls it with the same six arguments; 0080's reservation keeps both.
    const [proc] = await owner<{ has79: boolean; has80: boolean; args: string }>(
      `SELECT position('0079 completed-call fence' IN p.prosrc) > 0 AS has79,
              position('0080 unusable-completion fence' IN p.prosrc) > 0 AS has80,
              pg_get_function_identity_arguments(p.oid) AS args
         FROM pg_catalog.pg_proc p WHERE p.pronamespace='sophia'::regnamespace AND p.proname='reserve_personal_answer'`,
    )
    assert.deepEqual(proc, {
      has79: true,
      has80: true,
      args: 'p_call uuid, p_payer text, p_route text, p_micros bigint, p_turn uuid, p_claim uuid',
    })
  })
})

// FND-B102 (R2-B101 items 1 and 2): 0080's backfill beside the rows it must leave, and the 261 API's own calls against it.
describe('0080 beside protected rows, and the 261 API calls against it (FND-B102)', () => {
  it('backfill: a failed bound turn with no answer kept is classified; kept, unbound, other-epoch, reserved, released and answered rows are not', async () => {
    const QUN = randomUUID()
    const payer = 'b102-protected-payer'
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ($1, $2, 1000000)`,
      [payer, QUN],
    )
    const at = await liveApi(payer, QUN)
    const known = { input_tokens: 10, output_tokens: 5 }
    const names = ['positive', 'kept', 'unbound', 'epoch', 'reserved', 'released', 'answered'] as const
    for (const name of names) {
      double.script(name === 'answered' ? { text: 'Fine.', usage: known } : { text: `Bad\u0000${name}`, usage: known })
      await write(at, '/api/v1/personal/turns', QUN, { text: `Turn ${name}.` })
      await settled(at, QUN)
    }
    const calls = await owner<{ call_id: string; turn_id: string }>(
      `SELECT b.call_id, b.turn_id FROM sophia.personal_answer_calls b JOIN sophia.personal_companion_usage u USING (call_id)
        WHERE u.payer=$1 ORDER BY u.reserved_at`,
      [payer],
    )
    assert.equal(calls.length, names.length)
    const callOf = (name: (typeof names)[number]) => calls[names.indexOf(name)]?.call_id ?? ''
    const turn = (name: (typeof names)[number]) => calls[names.indexOf(name)]?.turn_id ?? ''
    // FIXTURES, labelled: every settled row back to no reason (as before 0080), then each protected shape.
    await owner(`UPDATE sophia.personal_companion_usage SET reason=NULL WHERE payer=$1 AND state='settled'`, [payer])
    await owner(
      `INSERT INTO sophia.personal_settled_answers(owner_id, turn_id, call_id, epoch, body)
       SELECT owner_id, turn_id, call_id, epoch, 'Kept words.' FROM sophia.personal_answer_calls WHERE call_id=$1`,
      [callOf('kept')],
    )
    await owner(`DELETE FROM sophia.personal_answer_calls WHERE call_id=$1`, [callOf('unbound')])
    await owner(`UPDATE sophia.personal_answer_calls SET epoch=epoch+1 WHERE call_id=$1`, [callOf('epoch')])
    await owner(
      `UPDATE sophia.personal_companion_usage SET state='reserved', used_micros=NULL, usage=NULL, settled_at=NULL WHERE call_id=$1`,
      [callOf('reserved')],
    )
    await owner(
      `UPDATE sophia.personal_companion_usage SET state='released', reason='not_prepared', used_micros=NULL, usage=NULL, settled_at=NULL WHERE call_id=$1`,
      [callOf('released')],
    )
    const rows = async () =>
      new Map(
        (
          await owner<{
            call_id: string
            state: string
            reason: string | null
            used_micros: string | null
            usage: unknown
            settled_at: string | null
            reserved_at: string
          }>(
            `SELECT call_id, state, reason, used_micros, usage, settled_at::text, reserved_at::text
               FROM sophia.personal_companion_usage WHERE payer=$1`,
            [payer],
          )
        ).map((r) => [r.call_id, r]),
      )
    const was = await rows()
    await owner(migration('0080_personal_unusable_completion_fence.sql'))
    const now = await rows()
    assert.deepEqual(
      names.map((n) => [n, now.get(callOf(n))?.state, now.get(callOf(n))?.reason]),
      [
        ['positive', 'settled', 'settled_without_answer'],
        ['kept', 'settled', null],
        ['unbound', 'settled', null],
        ['epoch', 'settled', null],
        ['reserved', 'reserved', null],
        ['released', 'released', 'not_prepared'],
        ['answered', 'settled', null],
      ],
    )
    for (const n of names) {
      const prior = was.get(callOf(n))
      const later = now.get(callOf(n))
      assert.deepEqual(
        [later?.used_micros, later?.usage, later?.settled_at, later?.reserved_at],
        [prior?.used_micros, prior?.usage, prior?.settled_at, prior?.reserved_at],
        `${n}: amounts, counts and times unchanged`,
      )
    }
    assert.ok(turn('positive'))
  })

  it('FUNCTION-LEVEL, as the API role: the 261 API readiness and calls, exact SQL from its source, against 0080', async () => {
    // Not an older API process: the statements 261's persistence sends, read from its immutable source, run as the
    // API's restricted role for an enrolled owner. Shared calling code beyond them is source-equivalent, not run here.
    const old = execFileSync(
      'git',
      ['show', '261be63f91c6b3649bc40f15be1f447719b4fb81:packages/persistence/src/personal-usage.ts'],
      {
        encoding: 'utf8',
      },
    )
    const installed =
      /`(SELECT to_regclass\('sophia\.personal_answer_calls'\)[\s\S]*?AS installed)`/.exec(old)?.[1] ?? ''
    const SQL = {
      reserve: 'SELECT sophia.reserve_personal_answer($1, $2, $3, $4, $5, $6) AS outcome',
      keep: 'SELECT sophia.settle_personal_companion_answer($1, $2, $3, $4, $5) AS outcome',
      settle: 'SELECT sophia.settle_personal_companion($1, $2, $3) AS done',
      write: 'SELECT sophia.record_personal_settled_reply($1, $2) AS receipt',
    }
    assert.ok(installed.includes('0079 completed-call fence'), "261's readiness query, by its marker")
    for (const q of Object.values(SQL)) assert.ok(old.includes(q), `261 sends: ${q}`)
    const RHO = randomUUID()
    const payer = 'b102-native-payer'
    await owner(
      `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ($1, $2, 1000000)`,
      [payer, RHO],
    )
    const apiRole = createPool(db.apiUrl, { max: 2 })
    try {
      const as = <T>(work: (c: pg.PoolClient) => Promise<T>) => withActor(apiRole, RHO, 'write', work)
      const one = async <T>(sql: string, args: unknown[]) =>
        (await as((c) => c.query<Record<string, T>>(sql, args))).rows[0] ?? {}
      assert.deepEqual(await one(installed, []), { installed: true }, '261 readiness: ready against 0080')
      const counts = '{"inputTokens":10,"outputTokens":5}'
      const turnOf = async (text: string) => {
        await one('SELECT sophia.send_personal_turn($1, $2) AS receipt', [randomUUID(), text])
        const [t] = await owner<{ id: string }>(
          `SELECT id FROM sophia.personal_turns WHERE owner_id=$1 AND author='person' ORDER BY created_at DESC LIMIT 1`,
          [RHO],
        )
        const claim = (await one<string>('SELECT sophia.claim_personal_reply($1) AS claim', [t?.id])).claim
        return { id: t?.id ?? '', claim }
      }
      // Each call registered first, as the runner does (personal.ts begin_companion_call, unchanged since 261).
      const begin = (id: string) => one('SELECT sophia.begin_companion_call($1) AS epoch', [id])
      const reasons = async () => (await usage(payer)).map((r) => [r.state, r.reason, r.used_micros])
      // A usable answer: reserved, settled and kept, then written; its cost has no reason throughout.
      const usable = await turnOf('Usable.')
      const c1 = randomUUID()
      await begin(c1)
      assert.deepEqual(await one(SQL.reserve, [c1, payer, 'personal-test', 1000, usable.id, usable.claim]), {
        outcome: 'reserved',
      })
      assert.deepEqual(await one(SQL.keep, [c1, 4, counts, 'Usable words.', null]), { outcome: 'kept' })
      assert.deepEqual(await reasons(), [['settled', null, '4']])
      assert.notEqual((await one(SQL.write, [usable.id, usable.claim])).receipt ?? null, null, 'the reply written')
      assert.deepEqual(await reasons(), [['settled', null, '4']])
      // An unusable completion: the base settlement classifies it; the same turn reserved again is refused 'lost'.
      const unusable = await turnOf('Unusable.')
      const c2 = randomUUID()
      await begin(c2)
      assert.deepEqual(await one(SQL.reserve, [c2, payer, 'personal-test', 1000, unusable.id, unusable.claim]), {
        outcome: 'reserved',
      })
      assert.deepEqual(await one(SQL.settle, [c2, 4, counts]), { done: true })
      assert.deepEqual(await reasons(), [
        ['settled', null, '4'],
        ['settled', 'settled_without_answer', '4'],
      ])
      const c3 = randomUUID()
      await begin(c3)
      assert.deepEqual(await one(SQL.reserve, [c3, payer, 'personal-test', 1000, unusable.id, unusable.claim]), {
        outcome: 'lost',
      })
      assert.equal((await usage(payer)).length, 2, 'no extra reservation or cost')
    } finally {
      await apiRole.end()
    }
  })
})
