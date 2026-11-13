// INC04-S03a (0107): operator custody of scoped capacity readings on real PostgreSQL with the production role split.
// The recorder runs as the migration owner (its only executor); the application logins are shown unable to. Every
// account, connection, qualification and reading is SYNTHETIC: nothing here qualifies a real account, route, provider or
// telemetry source, or passes an AC-04 case.
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
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
  const qualify = async () => {
    const q = await qualifyApiAccount(ownerPool, {
      connectionId: conn.connectionId,
      operations: ['research'],
      verification: 'operator_verified_call',
      evidenceRef: 'synthetic: not live evidence',
      observedAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
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
})
