// INC04-R07-C2B-DURABLE-001 (0110) over RETAINED 0109 evidence, level: sql-run on real PostgreSQL. A database is migrated
// only up to 0109 (the tree's own files, linked), a tracked v1 reservation is reserved and settled there through the real
// runtime functions, then 0110 is applied the way test-support applies every migration file. No retained identity, truth
// or history row is rewritten: their digests, receipts and bindings stay byte-identical, a retained v1 call never takes an
// observation, and only a NEW reservation can opt in. Project, runtime and token are SYNTHETIC; no provider is called.
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { ResearchSettleRequest, RuntimeCommand, RuntimeRole } from '@sophia/contracts'
import {
  createTestDatabase,
  registerRuntime,
  seedProject,
  withClusterMigrationLock,
  type TestDatabase,
} from '@sophia/test-support'
import {
  admitResearchTask,
  claimRuntimeOutbox,
  createPool,
  dispatchRuntimeOutbox,
  recordRuntimeReady,
  recordRuntimeReceipts,
  runtimeHello,
  runtimePoll,
  runtimeResearchReserve,
  runtimeResearchSettle,
  runtimeTokenHash,
  withActor,
  withService,
  type RuntimeCaller,
} from './index.ts'

const MD: RuntimeRole = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const PENDING = '0110_research_call_observed_facts.sql'
let dir: string
let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let owner: pg.Pool

/** The tree's own migrations before 0110, linked into a fresh directory. */
function before0110(): string {
  const d = mkdtempSync(join(tmpdir(), 'sophia-before-0110-'))
  const migrations = resolve('db/migrations')
  for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql') && n < '0110')) {
    symlinkSync(join(migrations, f), join(d, f))
  }
  return d
}

before(async () => {
  dir = before0110()
  db = await createTestDatabase(dir)
  api = createPool(db.apiUrl, { max: 4 })
  worker = createPool(db.workerUrl, { max: 2 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
})
after(async () => {
  await api.end()
  await worker.end()
  await owner.end()
  await db.drop()
  rmSync(dir, { recursive: true, force: true })
})

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> => (await owner.query(sql, params)).rows[0] as T
const service = <T>(fn: (c: pg.PoolClient) => Promise<T>) => withService(api, fn)
type At = { attemptId: string; nativeSessionId: string }

/** A project-funded research attempt delivered to its (legacy, account-null) runtime. */
async function attempt(): Promise<{ who: RuntimeCaller; at: At }> {
  const admin = randomUUID()
  const editor = randomUUID()
  const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [] })
  await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  const rt = await registerRuntime(db.ownerUrl, { projectId, admin })
  const who: RuntimeCaller = {
    tokenSha256: runtimeTokenHash(rt.token),
    runtimeUnitId: rt.runtimeUnitId,
    bridgeInstanceId: randomUUID(),
  }
  await service((c) => runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] }))
  await service((c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
  const r = await withActor(api, editor, 'write', (c) =>
    admitResearchTask(c, projectId, {
      key: randomUUID(),
      exchangeId: randomUUID(),
      request: { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] },
      specialist: { role: MD.id, route: MD.route },
    }),
  )
  assert.ok('admitted' in r, JSON.stringify(r))
  for (const row of await claimRuntimeOutbox(worker, 'c2b-0110', 50, 30))
    await dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
  const create = (await service((c) => runtimePoll(c, who, 0))).commands
    .map((q) => q.command as RuntimeCommand)
    .find((cmd) => cmd.binding.attemptId === r.admitted.attemptId)
  assert.ok(create, 'the create reached its runtime')
  const at = { attemptId: r.admitted.attemptId, nativeSessionId: `sophia-${r.admitted.attemptId}` }
  await service((c) =>
    recordRuntimeReceipts(c, who, [
      {
        commandId: create.commandId,
        attemptId: at.attemptId,
        stage: 'delivered',
        nativeSessionId: at.nativeSessionId,
        nativeSequence: 1,
        evidenceRefs: [],
        observedAt: new Date().toISOString(),
        reason: null,
      },
    ]),
  )
  return { who, at }
}

const TRACKED = {
  mode: 'tracked_v1' as const,
  contract: 'c1p_complete_report' as const,
  declared: { routeId: 'research-sol-medium-v1', model: 'gpt-6.1-sol', reasoningEffort: 'medium' },
}
const reserve = (who: RuntimeCaller, at: At, callId: string, extra: object = {}) =>
  service((c) =>
    runtimeResearchReserve(c, who, {
      ...at,
      callId,
      kind: 'model',
      provider: 'openai-research',
      amountUsd: 0.1,
      ...TRACKED,
      ...extra,
    }),
  )
type Observed = NonNullable<NonNullable<ResearchSettleRequest['evidence']>['observed']>
const complete = (at: At, reservationId: string, observed?: Observed): ResearchSettleRequest => ({
  ...at,
  reservationId,
  outcome: 'settled',
  costUsd: 0.01,
  usage: { inputTokens: 5, outputTokens: 4 },
  evidence: {
    contract: 'c1p_complete_report',
    report: 'complete_report',
    counts: {
      nonCachedInput: { class: 'known', value: 3 },
      cacheRead: { class: 'known', value: 2 },
      cacheWrite: { class: 'no_separate_reported_class' },
      output: { class: 'known', value: 4 },
    },
    ending: 'stream_completed',
    responseId: { status: 'supported', value: 'resp_retained' },
    ...(observed ? { observed } : {}),
  },
})
/** Every retained row of a reservation's evidence, as the table holds it (the 0110 columns aside). */
const retained = async (reservationId: string) => ({
  identity: await one<{ j: unknown }>(
    `SELECT to_jsonb(i) AS j FROM sophia.research_call_identities i WHERE reservation_id=$1`,
    [reservationId],
  ),
  truth: await one<{ j: unknown }>(
    `SELECT to_jsonb(t) AS j FROM sophia.research_call_truth t WHERE reservation_id=$1`,
    [reservationId],
  ),
  history: (
    await owner.query<{ j: unknown }>(
      `SELECT to_jsonb(h) AS j FROM sophia.research_call_history h WHERE reservation_id=$1 ORDER BY ordinal`,
      [reservationId],
    )
  ).rows,
})
/** A row's object without the keys 0110 added. */
const without = (row: unknown, keys: readonly string[]) =>
  Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([k]) => !keys.includes(k)))
const TRUTH_0110 = [
  'delivery',
  'sent',
  'http_status',
  'n1_status',
  'n1',
  'n1_reason',
  'n1_sources',
  'header_id',
  'header_id_reason',
  'header_id_sources',
  'raw_input_total',
  'raw_cache_read',
  'raw_output',
  'w_n1',
  'w_n2',
  'w_http_status',
  'w_provider_terminal',
  'w_input_total',
  'w_cache_read',
  'w_output',
  'w_cross_c1p',
] as const

describe('C2B 0110 over retained 0109 evidence: nothing retained is rewritten; only a new reservation opts in', () => {
  it('keeps every retained identity, truth and history row, its digest, receipt and binding; a retained v1 call takes no observation', async () => {
    assert.equal(
      (await one<{ n: string }>(`SELECT count(*) AS n FROM pg_proc WHERE proname='research_call_observed'`)).n,
      '0',
      'staged before 0110',
    )
    const { who, at } = await attempt()
    const r = await reserve(who, at, 'llm-retained')
    const first = await service((c) => runtimeResearchSettle(c, who, complete(at, r.reservationId)))
    assert.equal(first.evidence?.disposition, 'accepted')
    const prior = await retained(r.reservationId)
    // 0110, pending, applied as every migration file is.
    await withClusterMigrationLock(async () => {
      const c = new pg.Client({ connectionString: db.ownerUrl })
      await c.connect()
      try {
        await c.query(readFileSync(resolve('db/migrations', PENDING), 'utf8'))
      } finally {
        await c.end()
      }
    })
    const after0110 = await retained(r.reservationId)
    assert.deepEqual(without(after0110.identity.j, ['facts_version']), prior.identity.j, 'the identity, unchanged')
    assert.equal((after0110.identity.j as { facts_version: number }).facts_version, 1)
    assert.deepEqual(without(after0110.truth.j, TRUTH_0110), prior.truth.j, 'the truth and its digest, unchanged')
    assert.deepEqual(
      after0110.history.map((h) => without(h.j, ['observed'])),
      prior.history.map((h) => h.j),
      'the history, unchanged',
    )
    assert.deepEqual(
      after0110.history.map((h) => (h.j as { observed: unknown }).observed),
      [null],
    )
    // The retained call answers exactly as before: its reserve replay, its settlement replay and its receipt digest.
    const again = await reserve(who, at, 'llm-retained')
    assert.deepEqual(again, { ...r, state: 'settled' }, 'the reply and its binding, byte-identical (no facts)')
    const replay = await service((c) => runtimeResearchSettle(c, who, complete(at, r.reservationId)))
    assert.deepEqual(replay, { ...first, evidence: { ...first.evidence, replay: true } })
    // A retained (v1) call never takes an observation; another opt-in under its key is another reservation.
    const observed: Observed = { deliveryUnknownReason: 'none', sent: 'observable_transport_response' }
    await assert.rejects(service((c) => runtimeResearchSettle(c, who, complete(at, r.reservationId, observed))))
    await assert.rejects(reserve(who, at, 'llm-retained', { facts: 'observed_v1' }))
    assert.deepEqual(await retained(r.reservationId), after0110, 'refusals change nothing')
    // A NEW reservation of the same attempt opts in and settles its observation.
    const o = await reserve(who, at, 'llm-new', { facts: 'observed_v1' })
    assert.equal(o.binding?.facts, 'observed_v1')
    const s = await service((c) => runtimeResearchSettle(c, who, complete(at, o.reservationId, observed)))
    assert.equal(s.evidence?.disposition, 'accepted')
  })
})
