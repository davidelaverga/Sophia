// INC01-COHERENT-001: the composed API on one disposable PostgreSQL (0001–0100), level: sql-run through buildApp.
// Only what no single slice could check: the per-feature switch rules side by side, per-feature readiness (including
// 0100 for contributions), and that the regenerated contract (A48, A49, A51, A52 on the native A47/A50) serializes
// exactly what persistence returns. Actors are synthetic test identities; no provider, model, native host or network.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import { openapi } from '@sophia/contracts'
import { parsePersonalSpace } from '@sophia/contracts/validate'
import { createPool, readMyContributions, readProjectNativeResources, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp, type AppDeps } from './app.ts'
import type { Actor, VerifyActor } from './auth.ts'

let db: TestDatabase
let pool: pg.Pool
let owner: pg.Pool
const apps: FastifyInstance[] = []
const verifyActor: VerifyActor = (authorization) => {
  const id = /^Bearer test-actor:([0-9a-f-]{36})$/.exec(authorization ?? '')?.[1]
  if (!id) return Promise.reject(new Error('no test actor'))
  const actor: Actor = { id, name: null, contact: null, anonymous: false }
  return Promise.resolve(actor)
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 8 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
})
after(async () => {
  for (const built of apps) await built.close()
  await pool.end()
  await owner.end()
  await db.drop()
})

async function app(deps: Partial<AppDeps> = {}): Promise<FastifyInstance> {
  const a = buildApp({ pool, verifyActor, ...deps })
  await a.ready()
  apps.push(a)
  return a
}
async function call(
  a: FastifyInstance,
  as: string,
  method: 'GET' | 'POST',
  url: string,
  { body, extra = {} }: { body?: unknown; extra?: Record<string, string> } = {},
) {
  const res = await a.inject({
    method,
    url,
    headers: {
      authorization: `Bearer test-actor:${as}`,
      ...(method === 'POST' ? { 'idempotency-key': randomUUID() } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  })
  const json: Record<string, unknown> | null = res.body ? (JSON.parse(res.body) as Record<string, unknown>) : null
  return { status: res.statusCode, json }
}
const count = async (table: string) =>
  Number((await owner.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n)
/** The required properties of a component schema of the regenerated contract. */
function required(name: string): string[] {
  const r = openapi.components.schemas[name]?.required
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : []
}

async function project() {
  const [ADMIN, EDITOR] = [randomUUID(), randomUUID()]
  const { projectId } = await seedProject(db.ownerUrl, { admin: ADMIN, editors: [EDITOR] })
  await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','inc01-coherent-api-test')", [projectId])
  return { projectId, ADMIN, EDITOR }
}

describe('the composed switches, each by its own rule', () => {
  it('by default the three writers are absent (404, nothing written), while the native and resource reads stay', async () => {
    const a = await app()
    const p = await project()
    const counted = [
      await count('sophia.api_accounts'),
      await count('sophia.saved_conversation_inputs'),
      await count('sophia.personal_inputs'),
    ]
    assert.equal(
      (await call(a, p.EDITOR, 'POST', '/api/v1/me/api-accounts', { body: { label: 'x', totalCapUsd: 1 } })).status,
      404,
    )
    assert.equal(
      (
        await call(a, p.EDITOR, 'POST', `/api/v1/projects/${p.projectId}/conversation-inputs`, {
          body: { interactionContract: 'automatic_v1', title: 'T', text: 'Words.' },
        })
      ).status,
      404,
    )
    assert.equal(
      (
        await call(a, p.EDITOR, 'POST', '/api/v1/personal/inputs', {
          body: { interactionContract: 'automatic_v1', text: 'Words.' },
          extra: { 'x-sophia-personal-epoch': '0' },
        })
      ).status,
      404,
    )
    assert.deepEqual(
      [
        await count('sophia.api_accounts'),
        await count('sophia.saved_conversation_inputs'),
        await count('sophia.personal_inputs'),
      ],
      counted,
      'nothing written',
    )
    // Native new admission is off by default, but its reads stay served; the resource member read is always mounted.
    assert.equal((await call(a, p.ADMIN, 'GET', `/api/v1/projects/${p.projectId}/runner-operations`)).status, 200)
    assert.equal((await call(a, p.EDITOR, 'GET', `/api/v1/projects/${p.projectId}/native-resources`)).status, 200)
  })

  it('automatic conversation inputs require conversations; the resource read stays mounted with native admission on', async () => {
    assert.throws(
      () => buildApp({ pool, verifyActor, conversationInputs: true }),
      /conversationInputs requires conversations/,
    )
    const a = await app({ ownerRunnerAdmissions: 'admit' })
    const p = await project()
    assert.equal((await call(a, p.EDITOR, 'GET', `/api/v1/projects/${p.projectId}/native-resources`)).status, 200)
  })
})

describe('readiness is per feature, and contributions on require 0100', () => {
  it('/ready needs only what each switch on uses; without 0100, an API with contributions on is not ready', async () => {
    const plain = await app()
    const contributions = await app({ apiContributions: true })
    const inputs = await app({ conversations: true, conversationInputs: true })
    const native = await app({ ownerRunnerAdmissions: 'admit' })
    for (const a of [plain, contributions, inputs, native])
      assert.equal((await a.inject({ method: 'GET', url: '/ready' })).statusCode, 200)
    // Stand in for a database without 0100 (the migration is one transaction: installed whole or not at all).
    await owner.query(
      'ALTER FUNCTION sophia.contribution_lineage_unbound(uuid,uuid) RENAME TO contribution_lineage_unbound_hidden',
    )
    try {
      const ready = await contributions.inject({ method: 'GET', url: '/ready' })
      assert.equal(ready.statusCode, 503)
      assert.deepEqual(JSON.parse(ready.body), { ready: false, reason: 'schema' })
      for (const a of [plain, inputs, native])
        assert.equal(
          (await a.inject({ method: 'GET', url: '/ready' })).statusCode,
          200,
          'other features are unaffected',
        )
    } finally {
      await owner.query(
        'ALTER FUNCTION sophia.contribution_lineage_unbound_hidden(uuid,uuid) RENAME TO contribution_lineage_unbound',
      )
    }
    assert.equal((await contributions.inject({ method: 'GET', url: '/ready' })).statusCode, 200)
  })
})

describe('the regenerated contract serializes exactly what persistence returns', () => {
  it('A48, A49, A51 and A52 responses, through the generated schemas and the canonical Personal parser', async () => {
    const a = await app({ apiContributions: true, conversations: true, conversationInputs: true, personalInputs: true })
    const p = await project()
    // A48: the owner's resources, as persistence reads them; a path id in another accepted spelling reads the same.
    const created = await call(a, p.EDITOR, 'POST', '/api/v1/me/api-accounts', {
      body: { label: 'My API', totalCapUsd: 5 },
    })
    assert.equal(created.status, 201, JSON.stringify(created.json))
    assert.deepEqual(Object.keys(created.json!).toSorted(), required('ApiAccountReceipt').toSorted())
    const mine = await call(a, p.EDITOR, 'GET', '/api/v1/me/api-resources')
    assert.equal(mine.status, 200)
    assert.deepEqual(
      mine.json,
      JSON.parse(JSON.stringify(await withActor(pool, p.EDITOR, 'read', readMyContributions))),
    )
    const lower = await call(a, p.EDITOR, 'GET', `/api/v1/projects/${p.projectId}/api-contributions`)
    const upper = await call(a, p.EDITOR, 'GET', `/api/v1/projects/${p.projectId.toUpperCase()}/api-contributions`)
    assert.equal(lower.status, 200)
    assert.deepEqual(upper, lower)
    // A49: a started conversation input carries every required field of its schema.
    const started = await call(a, p.EDITOR, 'POST', `/api/v1/projects/${p.projectId}/conversation-inputs`, {
      body: { interactionContract: 'automatic_v1', title: 'Inputs', text: 'Opening words.' },
    })
    assert.equal(started.status, 202, JSON.stringify(started.json))
    for (const k of required('ConversationInputStarted')) assert.ok(k in started.json!, k)
    // A51: the member read is exactly persistence's page (a native resource with a recorded qualification of its owner).
    const conn = randomUUID()
    await owner.query(
      `INSERT INTO sophia.execution_connections(id, owner_id, upstream_origin, upstream_subject, state)
       VALUES ($1, $2, 'synthetic', 'synthetic-subject', 'linked')`,
      [conn, p.EDITOR],
    )
    const res = randomUUID()
    await owner.query(
      `INSERT INTO sophia.executor_resources(project_id, id, owner_id, connection_id, harness, label, repository_root, state)
       VALUES ($1, $2, $3, $4, 'claude-native', 'synthetic', '/synthetic', 'active')`,
      [p.projectId, res, p.EDITOR, conn],
    )
    await owner.query(
      `SELECT sophia.qualify_owner_runner($1, $2, 'ade473018d32003658b7d38693e083ee2e314bd8', 'env-owner-1',
         'project-sophia', 'read-only-v1', 1, 'gateway_enforced', 'acct-synthetic', ARRAY['create','stop'], 5,
         now() + interval '1 day', 'synthetic evidence')`,
      [p.projectId, res],
    )
    const page = await call(a, p.EDITOR, 'GET', `/api/v1/projects/${p.projectId}/native-resources`)
    assert.equal(page.status, 200)
    const read = JSON.parse(
      JSON.stringify(await withActor(pool, p.EDITOR, 'read', (c) => readProjectNativeResources(c, p.projectId, null))),
    ) as Record<string, unknown>
    // Each read stamps its own clock; every other field is the same.
    for (const at of [page.json!.observedAt, read.observedAt])
      assert.match(String(at), /^\d{4}-\d{2}-\d{2}T.*(Z|\+00:00)$/)
    assert.deepEqual({ ...page.json, observedAt: null }, { ...read, observedAt: null })
    // A52: a held Personal input; every Personal read lists its turn as `recorded`, through the canonical parser.
    const space = parsePersonalSpace((await call(a, p.EDITOR, 'GET', '/api/v1/personal')).json)
    const held = await call(a, p.EDITOR, 'POST', '/api/v1/personal/inputs', {
      body: { interactionContract: 'automatic_v1', text: 'Kept, not asked yet.' },
      extra: { 'x-sophia-personal-epoch': String(space.epoch) },
    })
    assert.equal(held.status, 202, JSON.stringify(held.json))
    const later = parsePersonalSpace((await call(a, p.EDITOR, 'GET', '/api/v1/personal')).json)
    assert.ok(
      later.turns.some((t) => t.reply === 'recorded'),
      'the A10 PersonalTurn reply carries the A52 value',
    )
  })
})
