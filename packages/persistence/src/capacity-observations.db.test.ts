// INC04-S03a (0107): operator custody of scoped capacity readings on real PostgreSQL with the production role split.
// The recorder runs as the migration owner (its only executor); the application logins are shown unable to. Every
// account, connection, qualification and reading is SYNTHETIC: nothing here qualifies a real account, route, provider or
// telemetry source, or passes an AC-04 case.
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  createApiAccount,
  createApiConnection,
  qualifyApiAccount,
  registerContributionRuntime,
  revokeApiAccountQualification,
} from './api-contributions.ts'
import {
  recordCapacityObservation,
  revokeCapacityObservation,
  type CapacityObservationInput,
} from './capacity-observations.ts'
import { createPool, withActor } from './index.ts'

let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let ownerPool: pg.Pool
let routeQualificationId: string

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 4 })
  worker = createPool(db.workerUrl, { max: 2 })
  ownerPool = new pg.Pool({ connectionString: db.ownerUrl, max: 6 })
  // A SYNTHETIC global route qualification: a reading binds this exact row.
  const { rows } = await ownerPool.query<{ id: string }>(
    `SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: not a live qualification',now()+interval '1 day') AS id`,
  )
  routeQualificationId = String(rows[0]?.id)
})
after(async () => {
  await api.end()
  await worker.end()
  await ownerPool.end()
  await db.drop()
})

/** An owner with an account, a connection whose credential is registered once, and its live account qualification. */
async function world() {
  const OWNER = randomUUID()
  const project = await seedProject(db.ownerUrl, { admin: randomUUID(), editors: [OWNER] })
  const acc = await withActor(api, OWNER, 'write', (c) => createApiAccount(c, { label: 'My API', totalCapUsd: 10 }))
  const conn = await withActor(api, OWNER, 'write', (c) =>
    createApiConnection(c, acc.accountId, 'Research key', 'Operator host'),
  )
  const register = (rotate: boolean) =>
    registerContributionRuntime(ownerPool, {
      projectId: project.projectId,
      connectionId: conn.connectionId,
      runtimeUnitId: 'sophia-runtime-test',
      tokenSha256: createHash('sha256').update(randomUUID(), 'utf8').digest(),
      rotate,
    })
  await register(false)
  const qualify = async (validMs = 86400_000) => {
    const q = await qualifyApiAccount(ownerPool, {
      connectionId: conn.connectionId,
      operations: ['research'],
      verification: 'operator_verified_call',
      evidenceRef: 'synthetic: not live evidence',
      observedAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + validMs).toISOString(),
    })
    return q.qualificationId
  }
  return {
    OWNER,
    projectId: project.projectId,
    accountId: acc.accountId,
    connectionId: conn.connectionId,
    register,
    qualify,
  }
}
type World = Awaited<ReturnType<typeof world>>

const at = (ms: number) => new Date(Date.now() + ms).toISOString()
/** The account qualification's revision, and the first instant both it and the route qualification held. */
async function qualificationOf(qualificationId: string): Promise<{ revision: number; since: string }> {
  // As microsecond text: a Date would round the instant down, to before the qualification.
  const { rows } = await ownerPool.query<{ revision: string; since: string }>(
    `SELECT a.revision, to_char(greatest(a.observed_at, r.qualified_at) AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS since FROM sophia.api_account_qualifications a,
      sophia.api_route_qualifications r WHERE a.id=$1 AND r.id=$2`,
    [qualificationId, routeQualificationId],
  )
  return { revision: Number(rows[0]?.revision), since: String(rows[0]?.since) }
}
/** A SYNTHETIC complete reading: an account and a model window, both admitting, fresh for ten minutes. */
async function reading(
  w: World,
  qualificationId: string,
  over: Partial<CapacityObservationInput> = {},
): Promise<CapacityObservationInput> {
  const q = await qualificationOf(qualificationId)
  return {
    observationKey: `k-${randomUUID()}`,
    connectionId: w.connectionId,
    credentialRevision: 1,
    accountQualificationId: qualificationId,
    accountQualificationRevision: q.revision,
    routeQualificationId,
    operation: 'research',
    verification: 'operator_verified_console',
    evidenceRef: 'synthetic evidence held outside',
    sourceChannel: 'synthetic-console',
    windowSetRef: 'synthetic-limits',
    windowSetVersion: 'v1',
    coverage: 'complete',
    requiredWindowRefs: ['requests-per-day', 'tokens-per-minute'],
    reflection: 'unknown',
    // Observed once both qualifications held: a reading is never taken before its qualification.
    observedAt: q.since,
    freshUntil: at(600_000),
    windows: [
      { windowRef: 'requests-per-day', scope: 'account', unit: 'requests', verdict: 'admits', applicability: 'known' },
      {
        windowRef: 'tokens-per-minute',
        scope: 'model',
        modelSelector: 'gpt-6.1-sol',
        unit: 'tokens',
        value: 12.5,
        verdict: 'admits',
        applicability: 'known',
        resetAt: at(3_600_000),
      },
    ],
    ...over,
  }
}
const count = async (table: string) =>
  Number((await ownerPool.query<{ n: string }>(`SELECT count(*) AS n FROM sophia.${table}`)).rows[0]?.n)
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p
    return 'accepted'
  } catch (err: unknown) {
    return err instanceof DomainError ? err.code : String(err)
  }
}
/** What the read says for this connection's research grant settings at the database's clock. */
async function readFor(w: World) {
  const { rows } = await ownerPool.query<{ r: { state: string; observationId?: string } | null }>(
    `SELECT sophia.selection_capacity_observation_at(
       jsonb_populate_record(NULL::sophia.api_contribution_grants,
        '{"route_id":"research-sol-medium-v1","model":"gpt-6.1-sol","effort":"medium","operation":"research"}'),
       c, clock_timestamp()) AS r FROM sophia.api_connections c WHERE c.id=$1`,
    [w.connectionId],
  )
  return rows[0]?.r ?? null
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))
/** The reading, its windows reordered and a value respelled: canonically the same reading. */
const reordered = (r: CapacityObservationInput): CapacityObservationInput => ({
  ...r,
  windows: r.windows
    .toReversed()
    .map((w) => (w.value === undefined || w.value === null ? w : { ...w, value: Number(w.value.toFixed(3)) })),
})
const rows = async () => [
  await count('capacity_observations'),
  await count('capacity_observation_windows'),
  await count('capacity_observation_revocations'),
]

// R1 (CLI numbers): an operator's file is raw text. These fixtures write each number as a literal lexeme into the file,
// never through JSON.stringify of a number (which would hand the CLI an already rounded value and witness nothing).
const NUMBER_SLOTS = {
  revision: '@@credentialRevision@@',
  qualificationRevision: '@@accountQualificationRevision@@',
  sequence: '@@sourceSequence@@',
  value: '@@tokensPerMinuteValue@@',
} as const
type Lexemes = { [K in keyof typeof NUMBER_SLOTS]?: string | null }
/**
 * The reading as file text with its credential revision, account qualification revision, source sequence and model
 * window value written exactly as given (defaults 1, its revision, 0 and 0.3); null leaves the source sequence out.
 */
function fileText(r: CapacityObservationInput, given: Lexemes = {}): string {
  const lexemes: Required<Lexemes> = {
    revision: '1',
    qualificationRevision: String(r.accountQualificationRevision),
    sequence: '0',
    value: '0.3',
    ...given,
  }
  const shaped: Record<string, unknown> = {
    ...r,
    credentialRevision: NUMBER_SLOTS.revision,
    accountQualificationRevision: NUMBER_SLOTS.qualificationRevision,
    windows: r.windows.map((w) => (w.windowRef === 'tokens-per-minute' ? { ...w, value: NUMBER_SLOTS.value } : w)),
  }
  if (lexemes.sequence !== null) shaped.sourceSequence = NUMBER_SLOTS.sequence
  let text = JSON.stringify(shaped)
  for (const [slot, marker] of Object.entries(NUMBER_SLOTS)) {
    const lexeme = Reflect.get(lexemes, slot)
    if (typeof lexeme === 'string') text = text.replace(`"${marker}"`, lexeme)
  }
  assert.equal(text.includes('@@'), false, 'every number is written as its lexeme')
  return text
}
interface CliRun {
  code: number
  stdout: string
  stderr: string
}
/** `record` of this exact file text through the operator CLI, as the migration owner of the given database. */
async function cliRecord(text: string, url: string = db.ownerUrl): Promise<CliRun> {
  const file = join(mkdtempSync(join(tmpdir(), 'sophia-capacity-cli-')), 'reading.json')
  writeFileSync(file, text, { mode: 0o600 })
  try {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      ['scripts/record-capacity-observation.ts', 'record', file],
      { env: { ...process.env, SOPHIA_MIGRATION_DATABASE_URL: url } },
    )
    return { code: 0, stdout, stderr }
  } catch (err: unknown) {
    const field = (name: string): unknown => Reflect.get(Object(err), name)
    return { code: Number(field('code')), stdout: String(field('stdout')), stderr: String(field('stderr')) }
  }
}
const INEXACT = "A reading's numbers must be finite and keep their written value\n"
const unsafe = (field: string, least: number) =>
  `A reading's ${field} must be a safe integer of at least ${String(least)}\n`
const CLI_REFUSALS = new Set([
  INEXACT,
  unsafe('sourceSequence', 0),
  unsafe('credentialRevision', 1),
  unsafe('accountQualificationRevision', 1),
  'A reading file is JSON\n',
  'A reading is a JSON object\n',
])
/** A CLI refusal: exit 1, nothing printed but its fixed message (so no token is echoed). */
const refused = (run: CliRun, message: string, label: string) =>
  assert.deepEqual(run, { code: 1, stdout: '', stderr: message }, label)
const storedOf = async (observationId: string) =>
  (
    await ownerPool.query<{ sequence: string | null; value: string | null }>(
      `SELECT o.source_sequence::text AS sequence, w.value::text AS value FROM sophia.capacity_observations o
        JOIN sophia.capacity_observation_windows w ON w.observation_id=o.id AND w.window_ref='tokens-per-minute'
       WHERE o.id=$1`,
      [observationId],
    )
  ).rows[0]
const receiptId = (run: CliRun) => {
  const id = /observation ([0-9a-f-]{36})/u.exec(run.stdout)?.[1]
  assert.ok(id, JSON.stringify(run))
  return id
}

describe('operator custody of capacity readings (0107)', () => {
  it('replays one sealed reading under a concurrent same-key race, and conflicts on a changed payload', async () => {
    const w = await world()
    const q = await w.qualify()
    const r = await reading(w, q)
    const initial = [await count('capacity_observations'), await count('capacity_observation_windows')]
    const receipts = await Promise.all(Array.from({ length: 4 }, () => recordCapacityObservation(ownerPool, r)))
    assert.equal(new Set(receipts.map((x) => JSON.stringify(x))).size, 1, 'every racer gets the original receipt')
    assert.deepEqual(
      [await count('capacity_observations'), await count('capacity_observation_windows')],
      [initial[0]! + 1, initial[1]! + 2],
      'one reading, both windows, written once',
    )
    assert.equal(receipts[0]?.accountQualificationId, q)
    assert.equal(receipts[0]?.routeQualificationId, routeQualificationId)
    assert.equal(await codeOf(recordCapacityObservation(ownerPool, { ...r, reflection: 'all' })), 'invalid_state')
    assert.equal(JSON.stringify(receipts[0]).includes('synthetic evidence'), false, 'the receipt carries no evidence')
  })

  it('refuses every malformed or unbound reading before writing anything', async () => {
    const w = await world()
    const q = await w.qualify()
    const n = await count('capacity_observations')
    const base = await reading(w, q)
    const bad: [string, Partial<CapacityObservationInput>, string][] = [
      ['a future observation', { observedAt: at(3_600_000), freshUntil: at(7_200_000) }, 'invalid_request'],
      ['fresh past a reset (the epoch fence)', { freshUntil: at(7_200_000) }, 'invalid_request'],
      ['complete without a window', { requiredWindowRefs: ['requests-per-day'] }, 'invalid_request'],
      ['empty complete coverage', { requiredWindowRefs: [], windows: [] }, 'invalid_request'],
      ['a stale credential revision', { credentialRevision: 2 }, 'invalid_request'],
      ['another account qualification revision', { accountQualificationRevision: 9 }, 'invalid_request'],
      ['observed before its qualifications held', { observedAt: at(-3_600_000) }, 'invalid_request'],
      ['an unknown route qualification', { routeQualificationId: randomUUID() }, 'invalid_request'],
      ['an unknown connection', { connectionId: randomUUID() }, 'not_found'],
    ]
    for (const [name, over, code] of bad)
      assert.equal(await codeOf(recordCapacityObservation(ownerPool, { ...base, ...over })), code, name)
    assert.equal(await count('capacity_observations'), n, 'nothing was written')
  })

  it('is the migration owner’s alone: no application login may record, revoke or read', async () => {
    const w = await world()
    const r = await reading(w, await w.qualify())
    for (const pool of [api, worker]) {
      assert.match(await codeOf(recordCapacityObservation(pool, r)), /forbidden|unavailable/)
      assert.match(await codeOf(revokeCapacityObservation(pool, randomUUID(), 'x')), /forbidden|unavailable/)
      await assert.rejects(pool.query('SELECT count(*) FROM sophia.capacity_observations'), /permission denied/)
    }
  })

  it('binds the exact credential revision and qualification: rotation and requalification leave an old reading inapplicable', async () => {
    const w = await world()
    const q1 = await w.qualify()
    const old = await recordCapacityObservation(ownerPool, await reading(w, q1))
    assert.equal((await readFor(w))?.observationId, old.observationId, 'the paired positive is recorded')
    // Revoke and requalify under the SAME credential and settings: the old reading is unbound, never current.
    await revokeApiAccountQualification(ownerPool, q1, 'synthetic: requalify')
    const q2 = await w.qualify()
    assert.deepEqual(await readFor(w), { state: 'unbound' })
    // The replacement's reading in ANOTHER stream and window set: the old stream neither masks nor conflicts with it.
    const fresh = await recordCapacityObservation(
      ownerPool,
      await reading(w, q2, { sourceChannel: 'synthetic-headers', windowSetRef: 'synthetic-limits-2' }),
    )
    assert.equal((await readFor(w))?.observationId, fresh.observationId, 'a reading under the replacement applies')
    // A credential rotation: no reading speaks for the new revision until one is recorded for it.
    await w.register(true)
    assert.equal(await readFor(w), null)
    assert.equal(await codeOf(recordCapacityObservation(ownerPool, await reading(w, q2))), 'invalid_request')
  })

  it('records and replays through the operator CLI from a file, against this disposable database only', async () => {
    const w = await world()
    const r = await reading(w, await w.qualify())
    const dir = mkdtempSync(join(tmpdir(), 'sophia-capacity-cli-'))
    const file = join(dir, 'reading.json')
    writeFileSync(file, JSON.stringify(r), { mode: 0o600 })
    const run = () =>
      promisify(execFile)(process.execPath, ['scripts/record-capacity-observation.ts', 'record', file], {
        env: { ...process.env, SOPHIA_MIGRATION_DATABASE_URL: db.ownerUrl },
      })
    const first = await run()
    const again = await run()
    assert.match(first.stdout, /✓ capacity observation [0-9a-f-]{36} .* complete, 2 window\(s\)/)
    assert.equal(again.stdout, first.stdout, 'a replay prints the same receipt')
    assert.equal(first.stdout.includes('synthetic evidence'), false, 'no evidence is printed')
    const id = /observation ([0-9a-f-]{36})/.exec(first.stdout)?.[1]
    assert.ok(id)
    await promisify(execFile)(
      process.execPath,
      ['scripts/record-capacity-observation.ts', 'revoke', id, '--reason', 'synthetic'],
      {
        env: { ...process.env, SOPHIA_MIGRATION_DATABASE_URL: db.ownerUrl },
      },
    )
    assert.deepEqual(await readFor(w), { state: 'revoked' })
  })

  // R1 (C03): replaying the recorded receipt is separate from admitting a new reading.
  it('replays the original receipt after the account qualification expires, also racing a changed payload', async () => {
    const w = await world()
    const q = await w.qualify(1_500)
    const r = await reading(w, q)
    const original = await recordCapacityObservation(ownerPool, r)
    assert.equal((await readFor(w))?.observationId, original.observationId, 'the paired positive')
    await wait(1_700)
    const initial = await rows()
    assert.deepEqual(await recordCapacityObservation(ownerPool, r), original, 'the identical replay')
    assert.deepEqual(await recordCapacityObservation(ownerPool, reordered(r)), original, 'the canonically equal replay')
    const race = await Promise.allSettled([
      recordCapacityObservation(ownerPool, r),
      recordCapacityObservation(ownerPool, { ...r, reflection: 'all' }),
      recordCapacityObservation(ownerPool, r),
      recordCapacityObservation(ownerPool, { ...r, coverage: 'partial', requiredWindowRefs: null }),
      recordCapacityObservation(ownerPool, r),
    ])
    for (const i of [0, 2, 4]) {
      const x = race[i]
      assert.ok(x?.status === 'fulfilled', JSON.stringify(x))
      assert.deepEqual(x.value, original)
    }
    for (const i of [1, 3]) {
      const x = race[i]
      assert.ok(x?.status === 'rejected')
      assert.ok(x.reason instanceof DomainError && x.reason.code === 'invalid_state', String(x.reason))
    }
    // Changed caller-supplied qualification identities are changed payloads, never replaced by recorded facts.
    for (const changed of [
      { accountQualificationRevision: r.accountQualificationRevision + 1 },
      { accountQualificationId: randomUUID() },
      { routeQualificationId: randomUUID() },
    ])
      assert.equal(
        await codeOf(recordCapacityObservation(ownerPool, { ...r, ...changed })),
        'invalid_state',
        JSON.stringify(changed),
      )
    assert.equal(
      await codeOf(recordCapacityObservation(ownerPool, { ...r, observationKey: `k-${randomUUID()}` })),
      'invalid_request',
      'a new key is still refused by the expired qualification',
    )
    assert.deepEqual(await rows(), initial, 'no replay, conflict or refusal wrote anything')
    assert.deepEqual(await readFor(w), { state: 'unbound' }, 'the old reading is not made current')
  })

  it('replays the original receipt after its route qualification expires, and refuses a new key', async () => {
    const w = await world()
    const q = await w.qualify()
    const route = await ownerPool.query<{ id: string }>(
      `INSERT INTO sophia.api_route_qualifications(route_id,model,effort,evidence_ref,qualified_at,expires_at)
       VALUES('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: short-lived',now()-interval '1 day',
        now()+interval '1500 milliseconds') RETURNING id`,
    )
    const r = { ...(await reading(w, q)), routeQualificationId: String(route.rows[0]?.id) }
    const original = await recordCapacityObservation(ownerPool, r)
    await wait(1_700)
    const initial = await rows()
    assert.deepEqual(await recordCapacityObservation(ownerPool, r), original)
    assert.equal(await codeOf(recordCapacityObservation(ownerPool, { ...r, reflection: 'some' })), 'invalid_state')
    assert.equal(
      await codeOf(recordCapacityObservation(ownerPool, { ...r, observationKey: `k-${randomUUID()}` })),
      'invalid_request',
    )
    assert.deepEqual(await rows(), initial)
    assert.notEqual((await readFor(w))?.state, 'recorded', 'still restrictive')
  })

  it('replays through the operator CLI after a credential rotation, writing nothing', async () => {
    const w = await world()
    const r = await reading(w, await w.qualify())
    const dir = mkdtempSync(join(tmpdir(), 'sophia-capacity-cli-'))
    const file = join(dir, 'reading.json')
    writeFileSync(file, JSON.stringify(r), { mode: 0o600 })
    const run = () =>
      promisify(execFile)(process.execPath, ['scripts/record-capacity-observation.ts', 'record', file], {
        env: { ...process.env, SOPHIA_MIGRATION_DATABASE_URL: db.ownerUrl },
      })
    const first = await run()
    await w.register(true)
    const initial = await rows()
    const again = await run()
    assert.equal(again.stdout, first.stdout, 'the original receipt, after the rotation')
    assert.deepEqual(await rows(), initial)
    assert.equal(await readFor(w), null, 'no reading speaks for the new credential revision')
  })

  // R2: raw JSONB keeps a fractional zero, so these go to the recorder as text, never through JSON.stringify (which
  // writes 1.0 as 1 and cannot witness the spelling).
  it('canonicalizes integral credential-revision spellings as one revision, new and replayed after expiry', async () => {
    const w = await world()
    const q = await w.qualify(1_500)
    const r = await reading(w, q)
    const spelled = (revision: string, over: Partial<CapacityObservationInput> = {}) => {
      const text = JSON.stringify({ ...r, ...over })
      assert.ok(text.includes('"credentialRevision":1,'), 'the revision to respell')
      return text.replace('"credentialRevision":1,', `"credentialRevision":${revision},`)
    }
    const raw = async (text: string) => {
      try {
        const result = await ownerPool.query<{ r: unknown }>(
          'SELECT sophia.record_capacity_observation($1::jsonb) AS r',
          [text],
        )
        return { ok: true as const, receipt: result.rows[0]?.r }
      } catch (err: unknown) {
        return { ok: false as const, code: String(Reflect.get(Object(err), 'code')) }
      }
    }
    const first = await raw(spelled('1.0'))
    assert.ok(first.ok, JSON.stringify(first))
    assert.equal(Reflect.get(Object(first.receipt), 'credentialRevision'), 1, 'canonical revision 1')
    await wait(1_700)
    const initial = await rows()
    for (const revision of ['1', '1.00', '1e0'])
      assert.deepEqual(
        await raw(spelled(revision)),
        first,
        `the replay spelled ${revision}, after the qualification expired`,
      )
    assert.deepEqual(await raw(spelled('1.1')), { ok: false, code: '22023' }, 'never rounded into revision 1')
    assert.deepEqual(await raw(spelled('1.0', { reflection: 'all' })), { ok: false, code: '23505' }, 'changed payload')
    assert.deepEqual(await rows(), initial, 'nothing written')
    assert.deepEqual(await readFor(w), { state: 'unbound' }, 'still restrictive')
  })

  it('records and replays exact numbers through the operator CLI by value, whatever their spelling', async () => {
    const w = await world()
    const r = await reading(w, await w.qualify())
    const rev = String(r.accountQualificationRevision)
    const first = await cliRecord(fileText(r, { revision: '1.0', sequence: '0', value: '0.1' }))
    assert.equal(first.code, 0, JSON.stringify(first))
    const id = receiptId(first)
    assert.deepEqual(await storedOf(id), { sequence: '0', value: '0.1' }, 'a genuine 0 sequence and a fraction')
    const initial = await rows()
    for (const spelled of [
      { revision: '1' },
      { revision: '1e0' },
      { revision: '10e-1' },
      { revision: '0.1e1' },
      { qualificationRevision: `${rev}.0` },
      { qualificationRevision: `${rev}e0` },
      { sequence: '0.0' },
      { sequence: '-0' },
      { sequence: '0e5' },
      { value: '1e-1' },
      { value: '0.10' },
      { value: '100e-3' },
    ]) {
      const again = await cliRecord(fileText(r, { revision: '1.0', sequence: '0', value: '0.1', ...spelled }))
      assert.deepEqual(again, first, `the replay ${JSON.stringify(spelled)}`)
    }
    // A changed but exact payload still meets the database's conflict, never a CLI refusal.
    for (const changed of [{ sequence: '1' }, { value: '0.2' }, { value: '0.1000000000000001' }]) {
      const conflict = await cliRecord(fileText(r, { revision: '1.0', sequence: '0', value: '0.1', ...changed }))
      assert.equal(conflict.code, 1, JSON.stringify(changed))
      assert.equal(CLI_REFUSALS.has(conflict.stderr), false, `the database's conflict: ${JSON.stringify(changed)}`)
    }
    assert.deepEqual(await rows(), initial, 'replays and conflicts wrote nothing')
    // The largest safe sequence, and an exponent-written window value, cross exactly.
    const big = { ...r, observationKey: `k-${randomUUID()}` }
    const max = await cliRecord(fileText(big, { sequence: '9007199254740991', value: '1e21' }))
    assert.equal(max.code, 0, JSON.stringify(max))
    assert.deepEqual(await storedOf(receiptId(max)), { sequence: '9007199254740991', value: '1000000000000000000000' })
    for (const sequence of ['9.007199254740991e15', '9007199254740991.000'])
      assert.deepEqual(await cliRecord(fileText(big, { sequence, value: '1e21' })), max, sequence)
    // A null or absent source sequence, and a null window value.
    for (const given of [{ sequence: 'null', value: 'null' }, { sequence: null }]) {
      const other = { ...r, observationKey: `k-${randomUUID()}` }
      const run = await cliRecord(fileText(other, given))
      assert.equal(run.code, 0, JSON.stringify(run))
      assert.equal((await storedOf(receiptId(run)))?.sequence, null, JSON.stringify(given))
      assert.deepEqual(await cliRecord(fileText(other, given)), run, `the replay ${JSON.stringify(given)}`)
    }
  })

  it('refuses inexact, unsafe, overflowing and underflowing numbers, even where the rounded value would replay', async () => {
    const w = await world()
    const r = await reading(w, await w.qualify())
    const rev = r.accountQualificationRevision
    // Original A, recorded through the CLI with exact numbers.
    const a = await cliRecord(fileText(r))
    assert.equal(a.code, 0, JSON.stringify(a))
    // Original B, recorded through SQL as raw text: its sequence 2^53 is valid authority for the bigint column, but not a
    // safe integer, so the CLI could only ever reach it by rounding.
    const b = { ...r, observationKey: `k-${randomUUID()}` }
    await ownerPool.query('SELECT sophia.record_capacity_observation($1::jsonb)', [
      fileText(b, { sequence: '9007199254740992' }),
    ])
    const initial = await rows()
    const cases: { reading: CapacityObservationInput; given: Lexemes; message: string; rounds?: number }[] = [
      { reading: r, given: { revision: '1.00000000000000001' }, message: INEXACT, rounds: 1 },
      { reading: r, given: { revision: '9007199254740993' }, message: INEXACT },
      { reading: r, given: { revision: '1e999' }, message: INEXACT },
      { reading: r, given: { revision: '1.5' }, message: unsafe('credentialRevision', 1) },
      {
        reading: r,
        given: { qualificationRevision: `${String(rev)}.000000000000000001` },
        message: INEXACT,
        rounds: rev,
      },
      {
        reading: r,
        given: { qualificationRevision: `${String(rev)}.5` },
        message: unsafe('accountQualificationRevision', 1),
      },
      { reading: r, given: { qualificationRevision: '0' }, message: unsafe('accountQualificationRevision', 1) },
      { reading: r, given: { sequence: '1e-999' }, message: INEXACT, rounds: 0 },
      { reading: r, given: { sequence: '1e999' }, message: INEXACT },
      { reading: r, given: { sequence: '0.000000000000000000001' }, message: unsafe('sourceSequence', 0) },
      { reading: r, given: { sequence: '-1' }, message: unsafe('sourceSequence', 0) },
      { reading: r, given: { value: '0.30000000000000001' }, message: INEXACT, rounds: 0.3 },
      { reading: r, given: { value: '0.299999999999999999999' }, message: INEXACT, rounds: 0.3 },
      { reading: r, given: { value: '1e-999' }, message: INEXACT },
      { reading: r, given: { value: '1e400' }, message: INEXACT },
      { reading: r, given: { value: '123456789012345678901234567890' }, message: INEXACT },
      { reading: b, given: { sequence: '9007199254740993' }, message: INEXACT, rounds: 9007199254740992 },
      { reading: b, given: { sequence: '9.007199254740993e15' }, message: INEXACT, rounds: 9007199254740992 },
      {
        reading: b,
        given: { sequence: '9007199254740992' },
        message: unsafe('sourceSequence', 0),
        rounds: 9007199254740992,
      },
    ]
    for (const { reading: x, given, message, rounds } of cases) {
      const label = JSON.stringify(given)
      if (rounds !== undefined) {
        // The premise: JS reads this lexeme as exactly the recorded authority's number, so it would have replayed.
        const lexeme = Object.values(given)[0]
        assert.equal(typeof lexeme === 'string' && JSON.parse(lexeme), rounds, `rounds onto the authority: ${label}`)
      }
      refused(await cliRecord(fileText(x, given)), message, label)
    }
    assert.deepEqual(await rows(), initial, 'no refused file wrote anything')
    assert.deepEqual(await cliRecord(fileText(r)), a, 'the exact original still replays')
  })

  it('refuses an inexact file before contacting any database, where an exact one connects', async () => {
    // A SYNTHETIC boundary, not a database: it counts connection attempts and closes each at once.
    let connections = 0
    const boundary = createServer((socket) => {
      connections += 1
      socket.destroy()
    })
    await new Promise<void>((done) => boundary.listen(0, '127.0.0.1', done))
    try {
      const address = boundary.address()
      assert.ok(address !== null && typeof address === 'object')
      const fake = `postgres://synthetic@127.0.0.1:${String(address.port)}/synthetic`
      const w = await world()
      const r = await reading(w, await w.qualify())
      for (const [text, message] of [
        [fileText(r, { revision: '9007199254740993' }), INEXACT],
        [fileText(r, { revision: '1.00000000000000001' }), INEXACT],
        [fileText(r, { sequence: '1e-999' }), INEXACT],
        [fileText(r, { value: '1e400' }), INEXACT],
        [fileText(r, { qualificationRevision: '1.5' }), unsafe('accountQualificationRevision', 1)],
        [fileText(r, { sequence: '9007199254740992' }), unsafe('sourceSequence', 0)],
        ['{"windows": [', 'A reading file is JSON\n'],
        ['[1]', 'A reading is a JSON object\n'],
      ] as const) {
        refused(await cliRecord(text, fake), message, text.slice(0, 40))
        assert.equal(connections, 0, 'refused before any connection')
      }
      const control = await cliRecord(fileText(r), fake)
      assert.equal(control.code, 1)
      assert.equal(CLI_REFUSALS.has(control.stderr), false, 'an exact file passes the CLI checks')
      assert.ok(connections >= 1, 'and reaches the boundary, so the count can see a connection')
    } finally {
      await new Promise((done) => boundary.close(done))
    }
  })
})
