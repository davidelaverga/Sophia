import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type pg from 'pg'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  admitManagedExploreTurn,
  createPool,
  readManagedExplorePreflight,
  readManagedExploreSession,
  recordManagedExploreWorkerReadiness,
  recordMissionEntry,
  startManagedExplore,
  withActor,
} from './index.ts'
import {
  claimManagedExploreDispatch,
  prepareManagedExploreDispatch,
  recordManagedExploreDispatch,
} from './managed-explore-dispatch.ts'

const MIGRATION = '0143_managed_explore_pilot_budget.sql'
const scope = {
  routeId: 'budget-fixture',
  providerOrg: 'synthetic-org',
  providerProject: 'synthetic-project',
  credentialGeneration: 1,
  workerId: 'allowance-fixture',
  leaseSeconds: 60,
  allowSend: true,
}
const sessionMicros = 500_000
const aggregateMicros = 100_000_000

function clients(db: TestDatabase) {
  const owner = createPool(db.ownerUrl)
  const api = createPool(db.apiUrl)
  const worker = createPool(db.workerUrl)
  return { owner, api, worker, close: () => Promise.all([owner.end(), api.end(), worker.end()]) }
}

function ready(worker: pg.Pool, workerScope = scope) {
  return recordManagedExploreWorkerReadiness(worker, workerScope, randomUUID(), true)
}

async function fixture(
  database: TestDatabase,
  { owner, api, worker }: ReturnType<typeof clients>,
  currency = 'USD',
  workerScope = scope,
  allowance = sessionMicros,
) {
  const founder = randomUUID()
  const { routeId, providerOrg, providerProject } = workerScope
  const { projectId } = await seedProject(database.ownerUrl, { admin: founder })
  const turnMicros = Math.min(Math.floor(allowance / 2), 10_000)
  await owner.query(
    `INSERT INTO sophia.managed_explore_grants(project_id,founder_id,route_id,provider_org,provider_project,
      credential_generation,model,currency,per_turn_micros,per_session_micros,environment_micros,funding_evidence_ref,
      grant_only_verified,enabled,expires_at,credential_expires_at)
      VALUES ($1,$2,$3,$4,$5,1,'synthetic-model',$6,$8,$7,$8,'disposable-budget-proof',
       true,true,now()+interval '1 hour',now()+interval '1 hour')`,
    [projectId, founder, routeId, providerOrg, providerProject, currency, allowance, turnMicros],
  )
  await ready(worker, workerScope)
  const principal = { projectId, founder }
  return { ...principal, ...(await brief(api, principal, routeId)) }
}

async function brief(api: pg.Pool, { projectId, founder }: { projectId: string; founder: string }, routeId: string) {
  const note = await withActor(api, founder, 'write', (c) =>
    recordMissionEntry(c, projectId, randomUUID(), {
      kind: 'expectation',
      epistemic: 'reported',
      text: 'Fictional brief.',
    }),
  )
  assert.ok(note.entryId)
  const seedEntryId = note.entryId
  const request = { seedEntryId, expectedSeedRevision: note.ledgerRevision, routeId }
  const key = randomUUID()
  return {
    start: () => withActor(api, founder, 'write', (c) => startManagedExplore(c, projectId, key, request)),
    preflight: () =>
      withActor(api, founder, 'read', (c) =>
        readManagedExplorePreflight(c, projectId, seedEntryId, note.ledgerRevision, true),
      ),
  }
}

async function setCap(owner: pg.Pool, micros: number) {
  await owner.query('UPDATE sophia.managed_explore_pilot_budget SET cap_micros=$1 WHERE singleton', [micros])
}

async function budget(owner: pg.Pool) {
  const result = await owner.query<{ ceiling: number; reserved: number }>(
    'SELECT cap_micros::int AS ceiling,reserved_micros::int AS reserved FROM sophia.managed_explore_pilot_budget',
  )
  return result.rows[0]
}

async function workCounts(owner: pg.Pool, projectId: string) {
  const { rows } = await owner.query<{ sessions: number; turns: number; commands: number; outbox: number }>(
    `SELECT (SELECT count(*)::int FROM sophia.managed_explore_sessions WHERE project_id=$1) AS sessions,
       (SELECT count(*)::int FROM sophia.managed_explore_turns WHERE project_id=$1) AS turns,
       (SELECT count(*)::int FROM sophia.commands WHERE project_id=$1 AND kind='managed_explore.turn') AS commands,
       (SELECT count(*)::int FROM sophia.outbox WHERE project_id=$1 AND destination='managed_explore.turn') AS outbox`,
    [projectId],
  )
  return rows[0]
}

async function checkQueueBackstop(owner: pg.Pool, projectId: string, sessionId: string) {
  const client = await owner.connect()
  try {
    await client.query('BEGIN')
    // Exercise the same internal enqueue used by a caller already past the higher-level budget check.
    await assert.rejects(
      client.query(
        `SELECT sophia.enqueue_managed_explore_turn(s,2,'text','Another synthetic turn',
          encode(sha256(convert_to('Another synthetic turn','UTF8')),'hex'),10000,NULL,NULL,NULL)
         FROM sophia.managed_explore_sessions s WHERE (s.project_id,s.id)=($1,$2)`,
        [projectId, sessionId],
      ),
      { code: '55000', message: 'Managed Explore pilot funding unavailable' },
    )
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
}

async function waitForBudgetLocks(owner: pg.Pool) {
  const deadline = performance.now() + 1500
  while (performance.now() < deadline) {
    const { rows } = await owner.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
     WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT sophia.start_managed_explore%'`,
    )
    if (rows[0]?.waiting === 2) return
    await delay(10)
  }
  assert.fail('both different projects must wait on the shared pilot budget row')
}

async function concurrentStarts(
  owner: pg.Pool,
  first: Awaited<ReturnType<typeof fixture>>,
  second: Awaited<ReturnType<typeof fixture>>,
) {
  const lock = await owner.connect()
  try {
    await lock.query('BEGIN')
    await lock.query('SELECT 1 FROM sophia.managed_explore_pilot_budget WHERE singleton FOR UPDATE')
    const results = Promise.allSettled([first.start(), second.start()])
    await waitForBudgetLocks(owner)
    await lock.query('COMMIT')
    return await results
  } finally {
    await lock.query('ROLLBACK')
    lock.release()
  }
}

describe('configured pilot budget', () => {
  let db: TestDatabase
  let use: ReturnType<typeof clients>

  before(async () => {
    db = await createTestDatabase(undefined, { assembler: false })
    use = clients(db)
  })

  after(async () => {
    await use?.close()
    await db?.drop()
  })

  it('defaults to closed, rejects foreign currency and keeps budget writes with the schema owner', async () => {
    const { owner, api, worker } = use
    assert.deepEqual(await budget(owner), { ceiling: 0, reserved: 0 })
    const usd = await fixture(db, use)
    await assert.rejects(usd.preflight(), { code: 'unavailable' })
    await assert.rejects(usd.start(), { code: 'unavailable' })
    await assert.rejects(setCap(api, sessionMicros), { code: '42501' })
    await assert.rejects(setCap(worker, sessionMicros), { code: '42501' })
    await assert.rejects(setCap(owner, aggregateMicros + 1), { code: '23514' })
    await setCap(owner, sessionMicros)
    const foreign = await fixture(db, use, 'EUR')
    await assert.rejects(foreign.preflight(), { code: 'unavailable' })
    await assert.rejects(foreign.start(), { code: 'unavailable' })
    assert.deepEqual(await budget(owner), { ceiling: sessionMicros, reserved: 0 })
  })

  it('serializes starts across projects, books the full session once and keeps prior exact receipts readable', async () => {
    const { owner } = use
    await setCap(owner, sessionMicros)
    const first = await fixture(db, use)
    const second = await fixture(db, use)
    const results = await concurrentStarts(owner, first, second)
    const index = results.findIndex(({ status }) => status === 'fulfilled')
    assert.ok(index === 0 || index === 1)
    const [winner, loser] = index === 0 ? [first, second] : [second, first]
    const success = results[index]
    assert.ok(success?.status === 'fulfilled')
    assert.equal(results[1 - index]?.status, 'rejected')
    assert.deepEqual(await budget(owner), { ceiling: sessionMicros, reserved: sessionMicros })
    assert.deepEqual(await winner.start(), success.value)
    assert.equal((await winner.preflight()).sessionId, success.value.sessionId)
    await assert.rejects(loser.preflight(), { code: 'unavailable' })
    await assert.rejects(loser.start(), { code: 'unavailable' })
    const { rows } = await owner.query(
      `SELECT project_id,reserved_micros::int AS initial
     FROM sophia.managed_explore_sessions WHERE project_id=ANY($1)`,
      [[first.projectId, second.projectId]],
    )
    assert.deepEqual(rows, [{ project_id: winner.projectId, initial: 20_000 }])
  })

  it('refuses fresh follow-ups below the committed ceiling and keeps exact prior receipts', async () => {
    const { owner, api, worker } = use
    const old = await budget(owner)
    assert.ok(old)
    const covered = old.reserved + sessionMicros
    await setCap(owner, covered)
    const workerScope = { ...scope, routeId: 'budget-closed-followup' }
    const member = await fixture(db, use, 'USD', workerScope)
    const { projectId, founder } = member
    const { sessionId } = await member.start()
    const first = await claimManagedExploreDispatch(worker, workerScope)
    assert.equal(first?.sessionId, sessionId)
    const read = () => withActor(api, founder, 'read', (c) => readManagedExploreSession(c, projectId, sessionId))
    const request = {
      kind: 'text',
      instruction: 'A saved follow-up.',
      expectedSessionRevision: (await read()).revision,
    } as const
    const admitTurn = (key: string, expectedSessionRevision: number) =>
      withActor(api, founder, 'write', (c) =>
        admitManagedExploreTurn(c, projectId, sessionId, key, { ...request, expectedSessionRevision }),
      )
    const key = randomUUID()
    const receipt = await admitTurn(key, request.expectedSessionRevision)
    const saved = await read()
    const countOutbox = () =>
      owner
        .query<{ count: number }>(
          "SELECT count(*)::int FROM sophia.outbox WHERE project_id=$1 AND destination='managed_explore.turn'",
          [projectId],
        )
        .then(({ rows }) => rows[0]?.count)
    assert.equal(await countOutbox(), 2)

    await setCap(owner, covered - 1)
    await assert.rejects(admitTurn(randomUUID(), saved.revision), { code: 'unavailable' })
    assert.deepEqual(await admitTurn(key, request.expectedSessionRevision), receipt)
    assert.deepEqual(await read(), saved)
    assert.equal(await countOutbox(), 2)
    assert.deepEqual(await budget(owner), { ceiling: covered - 1, reserved: covered })
  })

  it('rejects an internal continuation insert when the operator closes the pilot', async () => {
    const { owner, worker } = use
    const previous = await budget(owner)
    assert.ok(previous)
    await setCap(owner, previous.reserved + sessionMicros)
    const workerScope = { ...scope, routeId: 'budget-closed-insert-fixture' }
    const member = await fixture(db, use, 'USD', workerScope)
    const { sessionId } = await member.start()
    const lease = await claimManagedExploreDispatch(worker, workerScope)
    assert.equal(lease?.sessionId, sessionId)
    assert.deepEqual(await workCounts(owner, member.projectId), { sessions: 1, turns: 1, commands: 1, outbox: 1 })

    await setCap(owner, 0)
    await checkQueueBackstop(owner, member.projectId, sessionId)
    assert.deepEqual(await workCounts(owner, member.projectId), { sessions: 1, turns: 1, commands: 1, outbox: 1 })
    assert.deepEqual(await member.start(), { sessionId })
    assert.deepEqual(await budget(owner), { ceiling: 0, reserved: previous.reserved + sessionMicros })
  })

  it('refuses a sub-cent USD grant without writes and accepts the first provider cent', async () => {
    const { owner, worker } = use
    const previous = await budget(owner)
    assert.ok(previous)
    const ceiling = previous.reserved + 10_000
    await setCap(owner, ceiling)
    const belowMinimum = await fixture(db, use, 'USD', scope, 9_999)
    await assert.rejects(belowMinimum.preflight(), { code: 'unavailable' })
    await assert.rejects(belowMinimum.start(), { code: 'unavailable' })
    assert.deepEqual(await workCounts(owner, belowMinimum.projectId), { sessions: 0, turns: 0, commands: 0, outbox: 0 })
    assert.deepEqual(await budget(owner), { ceiling, reserved: previous.reserved })

    const centScope = { ...scope, routeId: 'budget-first-cent-fixture' }
    const exact = await fixture(db, use, 'USD', centScope, 10_000)
    assert.equal((await exact.preflight()).sessionId, null)
    const { sessionId } = await exact.start()
    assert.deepEqual(await workCounts(owner, exact.projectId), { sessions: 1, turns: 1, commands: 1, outbox: 1 })
    const lease = await claimManagedExploreDispatch(worker, centScope)
    assert.ok(lease)
    assert.equal(lease.sessionId, sessionId)
    const prepared = await prepareManagedExploreDispatch(worker, lease, { kind: 'create' })
    assert.equal(prepared.kind, 'create')
    assert.equal(prepared.sessionLimitCents, 1)
    assert.deepEqual(await budget(owner), { ceiling, reserved: ceiling })
  })

  it('keeps reservations through per-turn admission, uncertain effects, terminal rejection and grant rotation', async () => {
    const { owner, api, worker } = use
    const previous = await budget(owner)
    assert.ok(previous)
    const remaining = previous.reserved + sessionMicros
    await setCap(owner, remaining)
    const workerScope = { ...scope, routeId: 'budget-lifecycle-fixture' }
    const founder = await fixture(db, use, 'USD', workerScope)
    const started = await founder.start()
    const initial = await claimManagedExploreDispatch(worker, workerScope)
    assert.ok(initial)
    assert.equal(initial.sessionId, started.sessionId)
    const session = await withActor(api, founder.founder, 'read', (c) =>
      readManagedExploreSession(c, founder.projectId, started.sessionId),
    )
    await withActor(api, founder.founder, 'write', (c) =>
      admitManagedExploreTurn(c, founder.projectId, started.sessionId, randomUUID(), {
        kind: 'text',
        instruction: 'An independently admitted follow-up.',
        expectedSessionRevision: session.revision,
      }),
    )
    assert.deepEqual(await budget(owner), { ceiling: remaining, reserved: remaining })
    const prepared = await prepareManagedExploreDispatch(worker, initial, { kind: 'create' })
    assert.equal(prepared.kind, 'create')
    assert.equal(prepared.sessionLimitCents, sessionMicros / 10_000)
    await recordManagedExploreDispatch(worker, initial, { kind: 'defer', delaySeconds: 5 })
    const nextBrief = await brief(api, founder, workerScope.routeId)
    await assert.rejects(nextBrief.start(), { code: 'unavailable' })
    assert.deepEqual(await budget(owner), { ceiling: remaining, reserved: remaining })

    await owner.query('UPDATE sophia.outbox SET available_at=clock_timestamp() WHERE id=$1', [initial.outboxId])
    const recovered = await claimManagedExploreDispatch(worker, { ...workerScope, allowSend: false })
    assert.ok(recovered)
    assert.equal(recovered.turnId, initial.turnId)
    assert.equal(recovered.turnStatus, 'outcome_unknown')
    await recordManagedExploreDispatch(worker, recovered, {
      kind: 'createRejected',
      operationId: recovered.createOperationId,
      reason: 'authorization',
    })
    await assert.rejects(nextBrief.start(), { code: 'unavailable' })
    await assert.rejects(
      owner.query(
        'UPDATE sophia.managed_explore_grants SET per_session_micros=per_session_micros+10000 WHERE project_id=$1',
        [founder.projectId],
      ),
      { code: '40001' },
    )

    await owner.query(
      `UPDATE sophia.managed_explore_grants
     SET revision=revision+1,credential_generation=2,per_session_micros=20000 WHERE project_id=$1`,
      [founder.projectId],
    )
    await ready(worker, { ...workerScope, credentialGeneration: 2 })
    await assert.rejects(nextBrief.start(), { code: 'unavailable' })
    assert.deepEqual(await founder.start(), started)
    assert.deepEqual(await budget(owner), { ceiling: remaining, reserved: remaining })
  })
})

async function createLegacyDatabase() {
  const directory = await mkdtemp(join(tmpdir(), 'sx-budget-'))
  try {
    const source = 'db/migrations'
    const prior = (await readdir(source)).filter((name) => name.endsWith('.sql') && name < MIGRATION)
    await Promise.all(prior.map((name) => copyFile(join(source, name), join(directory, name))))
    return await createTestDatabase(directory, { assembler: false })
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

for (const history of ['proven', 'unknown', 'oversized'] as const) {
  it(`gates an upgrade with ${history} historical commitments and preserves original possible effects`, async () => {
    const legacy = await createLegacyDatabase()
    const old = clients(legacy)
    try {
      const amount = history === 'oversized' ? aggregateMicros + 10_000 : sessionMicros
      const previous = await fixture(legacy, old, 'USD', scope, amount)
      const started = await previous.start()
      const possible = await claimManagedExploreDispatch(old.worker, scope)
      assert.ok(possible)
      assert.equal(possible.sessionId, started.sessionId)
      assert.equal((await prepareManagedExploreDispatch(old.worker, possible, { kind: 'create' })).kind, 'create')
      if (history === 'unknown') {
        await old.owner.query(
          `UPDATE sophia.managed_explore_grants
           SET revision=revision+1,credential_generation=2,per_session_micros=10000,environment_micros=10000
           WHERE project_id=$1`,
          [previous.projectId],
        )
      }

      const otherScope = { ...scope, routeId: 'legacy-untouched' }
      const unsent = await fixture(legacy, old, 'USD', otherScope)
      const pending = await unsent.start()
      await old.owner.query(await readFile(join('db/migrations', MIGRATION), 'utf8'))
      const reserved = history === 'proven' ? 2 * sessionMicros : aggregateMicros
      assert.deepEqual(await budget(old.owner), { ceiling: 0, reserved })
      const result = await old.owner.query('SELECT historical_hold FROM sophia.managed_explore_pilot_budget')
      assert.deepEqual(result.rows, [{ historical_hold: history !== 'proven' }])
      assert.deepEqual(await prepareManagedExploreDispatch(old.worker, possible, { kind: 'create' }), {
        kind: 'observe',
      })

      await setCap(old.owner, reserved)
      const fresh = await fixture(legacy, old)
      await assert.rejects(fresh.start(), { code: 'unavailable' })
      const lease = await claimManagedExploreDispatch(old.worker, otherScope)
      assert.ok(lease)
      assert.equal(lease.sessionId, pending.sessionId)
      const preparation = await prepareManagedExploreDispatch(old.worker, lease, { kind: 'create' })
      if (history === 'proven') assert.equal(preparation.kind, 'create')
      else assert.deepEqual(preparation, { kind: 'denied', reason: 'funding_unavailable' })
      assert.deepEqual(await budget(old.owner), { ceiling: reserved, reserved })
    } finally {
      await old.close()
      await legacy.drop()
    }
  })
}
