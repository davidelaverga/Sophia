#!/usr/bin/env node
// Verifies the built packages (scripts/paperclip-build.mjs) against the pinned Paperclip, before any install:
//   SOPHIA_DISPOSABLE_DATABASE_URL=postgres://... node scripts/paperclip-verify.mjs --paperclip <checkout> [--dist <dir>]
// The built plugin worker runs under the pin's own plugin test harness (createTestHarness: its issue service, origin
// kind rules, wakeup rules, managed agents and capability checks), with the plugin's namespace migration applied to a
// throwaway database on the given server (the harness keeps no tables). A signed commission creates one issue; a
// resend finds it; a forged envelope changes nothing; Hold, Resume and Stop reach it; the settle job the manifest
// schedules runs through the harness and settles a stale write. Every statement the worker sends
// to ctx.db passes the pin's own runtime validators first (server/src/services/plugin-database.ts:
// validatePluginRuntimeQuery/Execute, with the built manifest's coreReadTables), as the real host would apply them. The
// migration's install check runs in scripts/paperclip-host-probe.mjs, through the pin's own loader.
// The harness's requestWakeup ignores its idempotency key (packages/plugins/sdk/src/testing.ts), so wake
// deduplication is not claimed here; the plugin reconciles wakes itself (coordination.ts, wakeOnce). The built
// adapter loads through createServerAdapter() and refuses to run without its endpoint. Synthetic data only; nothing
// is installed anywhere. Needs the pin's SDK built (pnpm --filter @paperclipai/plugin-sdk build) and its db package
// (pnpm --filter @paperclipai/db build), whose sources the validators import.
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import assert from 'node:assert/strict'
import pg from 'pg'
import { signEnvelope } from '../packages/coordination/src/envelope.ts'

const { values } = parseArgs({ options: { paperclip: { type: 'string' }, dist: { type: 'string' } } })
const checkout = resolve(values.paperclip ?? process.env.PAPERCLIP_SOURCE ?? '')
const dist = resolve(values.dist ?? join(import.meta.dirname, '../deploy/paperclip/dist'))
const admin = process.env.SOPHIA_DISPOSABLE_DATABASE_URL
if (!admin) throw new Error('SOPHIA_DISPOSABLE_DATABASE_URL is required')

// The pin's workspace packages point their `exports` at TypeScript sources for its own dev loop; the harness runs on
// their built output (pnpm --filter @paperclipai/plugin-sdk build builds @paperclipai/shared too).
const built = {
  '@paperclipai/shared': pathToFileURL(join(checkout, 'packages/shared/dist/index.js')).href,
  '@paperclipai/db': pathToFileURL(join(checkout, 'packages/db/dist/index.js')).href,
}
register(
  `data:text/javascript,${encodeURIComponent(
    `export async function resolve(spec, context, next) { return next(${JSON.stringify(built)}[spec] ?? spec, context) }`,
  )}`,
)
const load = (path) => import(pathToFileURL(path).href)
const { validatePluginRuntimeQuery, validatePluginRuntimeExecute } = await load(
  join(checkout, 'server/src/services/plugin-database.ts'),
)
const { createTestHarness } = await load(join(checkout, 'packages/plugins/sdk/dist/testing.js'))
const manifest = (await load(join(dist, 'sophia-coordination-plugin/dist/manifest.js'))).default
const plugin = (await load(join(dist, 'sophia-coordination-plugin/dist/worker.js'))).default
const { createServerAdapter } = await load(join(dist, 'sophia-dsh-adapter/dist/index.js'))

const name = `sophia_pcv_${randomBytes(5).toString('hex')}`
const server = new pg.Client({ connectionString: admin })
await server.connect()
await server.query(`CREATE DATABASE ${name}`)
const url = new URL(admin)
url.pathname = `/${name}`
const db = new pg.Client({ connectionString: url.toString() })
await db.connect()

const NAMESPACE = 'plugin_sophia_coordination_00c896da3d'
const statements = { query: 0, execute: 0 }
const COMPANY = randomUUID()
const PROJECT = randomUUID()
const SOPHIA_PROJECT = randomUUID()
const INTEGRATION_USER = 'user-sophia-integration'
const sophia = generateKeyPairSync('ed25519')
const forger = generateKeyPairSync('ed25519')

try {
  await db.query('CREATE TABLE public.issues (id uuid PRIMARY KEY)')
  // The columns of the pin's heartbeat_runs the plugin reads (packages/db/src/schema/heartbeat_runs.ts).
  await db.query(
    'CREATE TABLE public.heartbeat_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, context_snapshot jsonb, created_at timestamptz NOT NULL DEFAULT now())',
  )
  await db.query(`CREATE SCHEMA ${NAMESPACE}`)
  // Applied as written to stand up the namespace; the host's own install check of these raw bytes is in
  // scripts/paperclip-host-probe.mjs (pluginLoader.installPlugin), not here (WBC-02-CX-0010).
  const migration = readFileSync(join(dist, 'sophia-coordination-plugin/migrations/001_sophia_coordination.sql'), 'utf8')
  await db.query(migration)

  const harness = createTestHarness({
    manifest,
    config: {
      signingPublicKey: sophia.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      integrationUserId: INTEGRATION_USER,
      projects: [{ sophiaProjectId: SOPHIA_PROJECT, companyId: COMPANY, paperclipProjectId: PROJECT }],
    },
  })
  harness.seed({
    companies: [{ id: COMPANY, name: 'Synthetic company' }],
    projects: [{ id: PROJECT, companyId: COMPANY, name: 'Synthetic project' }],
  })
  // The pin's issue service creates the issue; its foreign key in the namespace needs the id in public.issues.
  const create = harness.ctx.issues.create.bind(harness.ctx.issues)
  const issues = {
    ...harness.ctx.issues,
    create: async (input) => {
      const issue = await create(input)
      await db.query('INSERT INTO public.issues (id) VALUES ($1)', [issue.id])
      return issue
    },
  }
  const ctx = {
    ...harness.ctx,
    issues,
    db: {
      namespace: NAMESPACE,
      query: async (sql, params) => {
        validatePluginRuntimeQuery(sql, NAMESPACE, manifest.database.coreReadTables ?? [])
        statements.query += 1
        return (await db.query(sql, params)).rows
      },
      execute: async (sql, params) => {
        validatePluginRuntimeExecute(sql, NAMESPACE)
        statements.execute += 1
        return { rowCount: (await db.query(sql, params)).rowCount ?? 0 }
      },
    },
  }
  await plugin.definition.setup(ctx)

  const workId = randomUUID()
  const key = `sophia-wbc02-${workId}`
  const now = Math.floor(Date.now() / 1000)
  const sign = (op, body, deliveryKey, privateKey = sophia.privateKey) =>
    signEnvelope(
      {
        op,
        companyId: COMPANY,
        paperclipProjectId: PROJECT,
        sophiaProjectId: SOPHIA_PROJECT,
        workId,
        commissionKey: key,
        deliveryKey,
        initiator: { kind: 'member', id: randomUUID() },
        nonce: randomUUID(),
        iat: now,
        exp: now + 120,
      },
      body,
      privateKey,
    )
  const commission = {
    key,
    sophiaProjectId: SOPHIA_PROJECT,
    paperclipProjectId: PROJECT,
    workId,
    title: 'Source review: synthetic',
    description: 'A synthetic commission. Source text stays in Sophia.',
    initialStatus: 'todo',
    wake: true,
  }
  const actor = { actorType: 'user', actorId: INTEGRATION_USER, userId: INTEGRATION_USER }
  const call = (routeKey, body, params = {}) =>
    plugin.definition.onApiRequest({
      routeKey,
      method: 'POST',
      path: '/',
      params,
      query: {},
      body,
      actor,
      companyId: COMPANY,
      headers: {},
    })
  const commissioned = (privateKey) =>
    call('commission', {
      companyId: COMPANY,
      envelope: sign('commission', commission, `commission-${workId}`, privateKey),
      commission,
    })

  const forged = await commissioned(forger.privateKey)
  assert.equal(forged.status, 403, JSON.stringify(forged.body))
  const first = await commissioned()
  assert.equal(first.status, 200, JSON.stringify(first.body))
  assert.equal(first.body.outcome, 'created')
  assert.equal(first.body.wakeQueued, true)
  const issue = await harness.ctx.issues.get(first.body.issueId, COMPANY)
  assert.equal(issue.originKind, 'plugin:sophia.coordination:commission')
  assert.equal(issue.originId, key)
  assert.ok(issue.assigneeAgentId, 'assigned to the managed source reviewer')
  const again = await commissioned()
  assert.deepEqual([again.body.outcome, again.body.issueId], ['existing', first.body.issueId])
  for (const [op, status] of [
    ['hold', 'blocked'],
    ['resume', 'todo'],
    ['stop', 'cancelled'],
  ]) {
    const control = { op, key: `${op}-1`, commissionKey: key, sophiaProjectId: SOPHIA_PROJECT, workId }
    const res = await call(
      'control',
      { envelope: sign(op, control, control.key), control },
      { issueId: first.body.issueId },
    )
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal((await harness.ctx.issues.get(first.body.issueId, COMPANY)).status, status)
  }
  // The settle job, registered by the worker and run by the pin's harness: a Hold write whose worker died mid-call
  // (recorded, never answered, now stale) that landed after the Stop is undone, and settled.
  await db.query(
    `INSERT INTO ${NAMESPACE}.effects (effect_id, commission_key, status, started_at) VALUES ($1, $2, 'blocked', now() - interval '3 minutes')`,
    [randomUUID(), key],
  )
  await harness.ctx.issues.update(first.body.issueId, { status: 'blocked' }, COMPANY)
  await harness.runJob(manifest.jobs[0].jobKey)
  assert.equal((await harness.ctx.issues.get(first.body.issueId, COMPANY)).status, 'cancelled', 'the Stop stands')
  const open = await db.query(`SELECT 1 FROM ${NAMESPACE}.effects WHERE settled_at IS NULL`)
  assert.equal(open.rowCount, 0, 'every write settled')

  const adapter = createServerAdapter()
  assert.equal(adapter.type, 'sophia_dsh')
  const env = await adapter.testEnvironment({ companyId: COMPANY, adapterType: 'sophia_dsh', config: {} })
  if (!process.env.SOPHIA_COORDINATION_URL) assert.equal(env.status, 'fail', 'no endpoint, no pass')
  console.log(
    `verified against the pinned plugin harness: commission, resend, forged refusal, hold/resume/stop, the settle job; ${statements.query} queries and ${statements.execute} executes passed the pin's ctx.db validators; adapter loads`,
  )
} finally {
  await db.end()
  await server.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
  await server.end()
}
