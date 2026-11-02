// 0091 across a live database (level: sql-run): a source review proposed before 0091, by 0042's own code, keeps its v1
// manifest, its receipt, its task statement and its plan byte for byte once 0091 is applied, and its key still returns
// that receipt; a review proposed after it is v2. A manifest of any other version is refused. The database is migrated
// through 0090 exactly as written, then 0091 as written, as the owner; proposals use the API login with its actor.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { createPool, proposeSourceReview, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'

const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations', import.meta.url))
const REQUEST_CONTEXT = '0091_research_scope_review_context.sql'
const A = randomUUID()
const E = randomUUID()
const ROUTE = {
  role: 'sophia-source-review-v1',
  id: 'source-review-luna-high-v1',
  provider: 'openai-review',
  model: 'gpt-6-luna',
  reasoningEffort: 'high',
  maxTokens: 16000,
  priceUnit: 'usd_per_million_tokens',
  prices: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
} as const

let dir: string
let db: TestDatabase
let pool: pg.Pool

async function asOwner<T>(work: (c: pg.Client) => Promise<T>): Promise<T> {
  const owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
  try {
    return await work(owner)
  } finally {
    await owner.end()
  }
}

/** A project enrolled for review (both grants) with one text source. */
async function enrolled() {
  const { projectId, goalId } = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
  const sourceId = await asOwner(async (o) => {
    await o.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
      projectId,
    ])
    await o.query(`SELECT sophia.set_coordination_grant($1, 'enabled', 2, 'company-a', 'pc-a', 'approval:test')`, [
      projectId,
    ])
    const { rows } = await o.query<{ id: string }>(
      `SELECT (sophia.put_text_source($1, $2, 'text/markdown', '# Launch brief\n\nThe launch is on 3 March.')).id`,
      [projectId, A],
    )
    return rows[0]?.id ?? ''
  })
  return { projectId, goalId, sourceId }
}

const request = (goalId: string, sourceId: string) => ({
  goalId,
  goalRevision: 1,
  sourceIds: [sourceId],
  allowanceUsd: 0.5,
})

/** What a stored proposal holds: its manifest's exact text, the statement it gives a runtime, and its plan. */
const stored = (projectId: string, manifestSourceId: string) =>
  asOwner(async (o) => {
    const { rows } = await o.query<{ body: string; statement: string; plan: unknown }>(
      `SELECT t.body, sophia.source_review_statement(t.body::jsonb) AS statement,
         (SELECT to_jsonb(p) FROM sophia.work_plans p WHERE p.project_id=$1 AND p.manifest_source_id=$2) AS plan
         FROM sophia.source_texts t WHERE t.project_id=$1 AND t.source_id=$2`,
      [projectId, manifestSourceId],
    )
    const row = rows[0]
    assert.ok(row)
    return row
  })

before(async () => {
  // The migrations before 0091, exactly as written: a database as it stands when 0091 is applied.
  dir = mkdtempSync(join(tmpdir(), 'sophia-0090-'))
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && f < REQUEST_CONTEXT))
    copyFileSync(join(MIGRATIONS, file), join(dir, file))
  db = await createTestDatabase(dir)
  pool = createPool(db.apiUrl, { max: 2 })
})

after(async () => {
  await pool.end()
  await db.drop()
  rmSync(dir, { recursive: true, force: true })
})

describe('a review proposed before 0091 keeps what it was given (0091)', () => {
  it('its manifest, receipt, statement and plan are unchanged by 0091, and its key returns its first receipt', async () => {
    const w = await enrolled()
    const key = randomUUID()
    const before091 = await withActor(pool, E, 'write', (c) =>
      proposeSourceReview(c, w.projectId, key, request(w.goalId, w.sourceId), ROUTE),
    )
    const old = await stored(w.projectId, before091.manifestSourceId)
    const manifest: unknown = JSON.parse(old.body)
    assert.ok(typeof manifest === 'object' && manifest !== null && 'schema' in manifest)
    assert.equal(manifest.schema, 'sophia.source-review-manifest.v1')
    assert.ok(!('requestContext' in manifest))

    await asOwner((o) => o.query(readFileSync(join(MIGRATIONS, REQUEST_CONTEXT), 'utf8')))

    const kept = await stored(w.projectId, before091.manifestSourceId)
    assert.equal(kept.body, old.body, 'the manifest, byte for byte')
    assert.equal(kept.statement, old.statement, 'the task statement 0042 wrote, byte for byte')
    assert.deepEqual(kept.plan, old.plan, 'the plan as it was')
    const again = await withActor(pool, E, 'write', (c) =>
      proposeSourceReview(c, w.projectId, key, request(w.goalId, w.sourceId), ROUTE),
    )
    assert.deepEqual(again, before091, 'the same key: the first receipt, nothing new frozen')
  })

  it('a review proposed after 0091 is v2: its source no research wrote has no request, and says so', async () => {
    const w = await enrolled()
    const after091 = await withActor(pool, E, 'write', (c) =>
      proposeSourceReview(c, w.projectId, randomUUID(), request(w.goalId, w.sourceId), ROUTE),
    )
    const row = await stored(w.projectId, after091.manifestSourceId)
    const manifest: unknown = JSON.parse(row.body)
    assert.ok(typeof manifest === 'object' && manifest !== null && 'schema' in manifest && 'requestContext' in manifest)
    assert.equal(manifest.schema, 'sophia.source-review-manifest.v2')
    assert.deepEqual(manifest.requestContext, {
      version: 'sophia.source-review-manifest.v2',
      requests: [],
      unavailable: [{ sourceRef: 'S1', reason: 'not_research' }],
    })
    assert.ok(row.statement.endsWith('S1: no originating request (not a research report).'))
  })

  it('a manifest of another version is refused, never read as one it is not', async () => {
    await asOwner(async (o) => {
      for (const schema of ['sophia.source-review-manifest.v9', null]) {
        await assert.rejects(
          o.query('SELECT sophia.source_review_statement($1::jsonb)', [JSON.stringify({ schema, goal: {} })]),
          { code: '22023' },
          String(schema),
        )
      }
    })
  })
})
