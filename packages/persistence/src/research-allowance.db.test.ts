// SMC-M03 S3: research grants, allowances, reservations and source provenance (migration 0024), level: sql-run.
// The functions are the owner's (S4's authenticated runtime routes call them as definer); here they run as the table
// owner, and every read runs on the non-owner sophia_api login. Amounts are US dollars.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createTestDatabase, seedProject, type SeededProject, type TestDatabase } from '@sophia/test-support'
import { createPool, withActor } from './index.ts'

const A = randomUUID() // admin
const E = randomUUID() // editor
const C = randomUUID() // outsider

let db: TestDatabase
let pool: pg.Pool
let owner: pg.Client

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
})
after(async () => {
  await owner.end()
  await pool.end()
  await db.drop()
})

interface Allowance {
  id: string
  cap_usd: string
  headroom_usd: string
  reserved_usd: string
  spent_usd: string
  uncertain_usd: string
  max_searches: number
  max_reads: number
}
interface Reservation {
  id: string
  state: string
  reserved_usd: string
  settled_usd: string | null
}

const one = async <T>(sql: string, params: unknown[], client: pg.Client = owner): Promise<T> =>
  (await client.query(sql, params)).rows[0] as T

async function failure(sql: string, params: unknown[], client: pg.Client = owner): Promise<string> {
  try {
    await client.query(sql, params)
    return 'resolved'
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return `${e.code}: ${e.message}`
  }
}

const grant = (p: string, state: string, task: number, total: number) =>
  one(`SELECT sophia.set_research_grant($1, $2, $3, $4, 'web-pilot-v1', 'approval:test')`, [p, state, task, total])

async function job(p: string): Promise<string> {
  return (
    await one<{ id: string }>(
      `INSERT INTO sophia.jobs(project_id,kind,state) VALUES($1,'research','pending') RETURNING id`,
      [p],
    )
  ).id
}

const open = (p: string, rootJob: string, headroom = 0.5) =>
  one<Allowance>(`SELECT (a).* FROM (SELECT sophia.open_research_allowance($1, $2, $3) AS a) x`, [p, rootJob, headroom])

interface Call {
  key: string
  kind: 'model' | 'search' | 'read'
  amount: number
  headroom?: boolean
  client?: pg.Client
}

const reserve = (p: string, allowance: string, { key, kind, amount, headroom = false, client = owner }: Call) =>
  one<Reservation>(
    `SELECT (r).* FROM (SELECT sophia.reserve_research($1, $2, $3, $4, $5, $6, $7) AS r) x`,
    [
      p,
      allowance,
      key,
      kind,
      kind === 'model' ? 'openai-research' : kind === 'search' ? 'tavily' : 'jina',
      amount,
      headroom,
    ],
    client,
  )

const end = (p: string, reservation: string, outcome: string, cost: number | null) =>
  one<Reservation>(`SELECT (r).* FROM (SELECT sophia.end_research_reservation($1, $2, $3, $4, $5, $6) AS r) x`, [
    p,
    reservation,
    outcome,
    cost,
    cost === null ? null : { inputTokens: 1200 },
    'req_1',
  ])

const allowanceOf = (p: string, id: string) =>
  one<Allowance>(`SELECT * FROM sophia.research_allowances WHERE project_id=$1 AND id=$2`, [p, id])

const reserveSql = `SELECT sophia.reserve_research($1, $2, $3, 'model', 'openai-research', $4, false)`

let seed: SeededProject

describe('research allowance (0024)', () => {
  before(async () => {
    seed = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
  })

  it('opens no allowance and reserves nothing without a grant or with the gate closed; absent is never unlimited', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    const root = await job(p.projectId)
    assert.match(
      await failure(`SELECT sophia.open_research_allowance($1, $2, 0.5)`, [p.projectId, root]),
      /^55000: Research gate closed/,
    )
    await grant(p.projectId, 'disabled', 5, 40)
    assert.match(
      await failure(`SELECT sophia.open_research_allowance($1, $2, 0.5)`, [p.projectId, root]),
      /^55000: Research gate closed/,
    )
    await grant(p.projectId, 'enabled', 5, 40)
    const a = await open(p.projectId, root)
    await grant(p.projectId, 'disabled', 5, 40)
    assert.match(
      await failure(reserveSql, [p.projectId, a.id, 'k1', 1]),
      /^55000: Research gate closed/,
      'closing the gate stops new spend',
    )
  })

  it("copies the grant's task cap and the pilot's source limits into one allowance per research job", async () => {
    await grant(seed.projectId, 'enabled', 5, 40)
    const root = await job(seed.projectId)
    const a = await open(seed.projectId, root)
    assert.deepEqual([Number(a.cap_usd), Number(a.headroom_usd), a.max_searches, a.max_reads], [5, 0.5, 5, 8])
    assert.equal((await open(seed.projectId, root)).id, a.id, 'opening again returns the same allowance')
    await grant(seed.projectId, 'enabled', 3, 40)
    assert.equal(
      Number((await allowanceOf(seed.projectId, a.id)).cap_usd),
      5,
      'a later grant change does not move an open allowance',
    )
    await grant(seed.projectId, 'enabled', 5, 40)
    assert.match(await failure(`SELECT sophia.open_research_allowance($1, NULL, 0.5)`, [seed.projectId]), /^22023/)
    assert.match(
      await failure(`SELECT sophia.open_research_allowance($1, $2, 5)`, [seed.projectId, await job(seed.projectId)]),
      /research_allowances_check|check constraint/i,
      'headroom below the cap',
    )
  })

  it('reserves up to the cap less headroom; only the partial-result call may use the headroom', async () => {
    await grant(seed.projectId, 'enabled', 5, 40)
    const a = await open(seed.projectId, await job(seed.projectId))
    await reserve(seed.projectId, a.id, { key: 'model:1', kind: 'model', amount: 4 })
    assert.match(
      await failure(reserveSql, [seed.projectId, a.id, 'model:2', 0.6]),
      /^55000: Research allowance exhausted/,
    )
    await reserve(seed.projectId, a.id, { key: 'model:3', kind: 'model', amount: 0.5 })
    assert.match(
      await failure(reserveSql, [seed.projectId, a.id, 'model:4', 0.000001]),
      /^55000: Research allowance exhausted/,
      '4.5 is the ordinary limit',
    )
    const partial = await reserve(seed.projectId, a.id, {
      key: 'model:partial',
      kind: 'model',
      amount: 0.5,
      headroom: true,
    })
    assert.equal(partial.state, 'reserved')
    assert.match(
      await failure(`SELECT sophia.reserve_research($1, $2, 'model:5', 'model', 'openai-research', 0.000001, true)`, [
        seed.projectId,
        a.id,
      ]),
      /^55000: Research allowance exhausted/,
      'the headroom is a part of the cap, not more',
    )
    assert.match(
      await failure(reserveSql, [seed.projectId, a.id, 'model:6', 0]),
      /^22023/,
      'a reservation is a positive amount',
    )
  })

  it('serializes reservations: two concurrent calls that each fit alone cannot both pass, and exactly the cap does', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    await grant(p.projectId, 'enabled', 5, 40)
    const a = await open(p.projectId, await job(p.projectId))
    const clients = [new pg.Client({ connectionString: db.ownerUrl }), new pg.Client({ connectionString: db.ownerUrl })]
    await Promise.all(clients.map((c) => c.connect()))
    try {
      // Both transactions are open before either reserves; each commits (or rolls back) as soon as its own call ends.
      const race = async (amounts: number[], tag: string) => {
        await Promise.all(clients.map((c) => c.query('BEGIN')))
        return Promise.all(
          clients.map(async (c, i) => {
            try {
              await reserve(p.projectId, a.id, {
                key: `${tag}:${i}`,
                kind: 'model',
                amount: amounts[i] ?? 0,
                client: c,
              })
              await c.query('COMMIT')
              return 'fulfilled'
            } catch {
              await c.query('ROLLBACK')
              return 'rejected'
            }
          }),
        )
      }
      assert.deepEqual(
        (await race([3, 3], 'over')).toSorted(),
        ['fulfilled', 'rejected'],
        'one of two 3.00 reservations under a 4.50 limit',
      )
      const now = await allowanceOf(p.projectId, a.id)
      assert.equal(Number(now.reserved_usd), 3)
      assert.deepEqual(await race([0.75, 0.75], 'exact'), ['fulfilled', 'fulfilled'], 'exactly at the limit')
      assert.equal(Number((await allowanceOf(p.projectId, a.id)).reserved_usd), 4.5)
    } finally {
      await Promise.all(clients.map((c) => c.end()))
    }
  })

  it('caps every allowance under one grant together', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A })
    await grant(p.projectId, 'enabled', 5, 6)
    const first = await open(p.projectId, await job(p.projectId))
    const second = await open(p.projectId, await job(p.projectId))
    await reserve(p.projectId, first.id, { key: 'm', kind: 'model', amount: 4 })
    await reserve(p.projectId, second.id, { key: 'm', kind: 'model', amount: 2 })
    assert.match(await failure(reserveSql, [p.projectId, second.id, 'm2', 0.01]), /^55000: Research grant exhausted/)
  })

  it('is idempotent by key, and refuses a key reused for another call', async () => {
    await grant(seed.projectId, 'enabled', 5, 40)
    const a = await open(seed.projectId, await job(seed.projectId))
    const r1 = await reserve(seed.projectId, a.id, { key: 'sophia-x:call_1', kind: 'search', amount: 0.01 })
    const r2 = await reserve(seed.projectId, a.id, { key: 'sophia-x:call_1', kind: 'search', amount: 0.01 })
    assert.equal(r2.id, r1.id)
    assert.equal(Number((await allowanceOf(seed.projectId, a.id)).reserved_usd), 0.01, 'reserved once')
    assert.match(
      await failure(`SELECT sophia.reserve_research($1, $2, 'sophia-x:call_1', 'search', 'tavily', 0.02, false)`, [
        seed.projectId,
        a.id,
      ]),
      /^23505: Idempotency key reused/,
    )
  })

  it('holds the source policy: five searches and eight reads, where a released call does not count', async () => {
    await grant(seed.projectId, 'enabled', 5, 40)
    const a = await open(seed.projectId, await job(seed.projectId))
    const searches = []
    for (let i = 0; i < 5; i += 1)
      searches.push(await reserve(seed.projectId, a.id, { key: `s${i}`, kind: 'search', amount: 0.01 }))
    const sixth = `SELECT sophia.reserve_research($1, $2, 's5', 'search', 'tavily', 0.01, false)`
    assert.match(await failure(sixth, [seed.projectId, a.id]), /^55000: Research source policy limit reached: search/)
    await end(seed.projectId, searches[0]?.id ?? '', 'released', null)
    assert.equal(
      (await reserve(seed.projectId, a.id, { key: 's5', kind: 'search', amount: 0.01 })).state,
      'reserved',
      'a call that never left frees its slot',
    )
    for (let i = 0; i < 8; i += 1) await reserve(seed.projectId, a.id, { key: `r${i}`, kind: 'read', amount: 0.01 })
    const ninth = `SELECT sophia.reserve_research($1, $2, 'r8', 'read', 'jina', 0.01, false)`
    assert.match(await failure(ninth, [seed.projectId, a.id]), /^55000: Research source policy limit reached: read/)
  })

  it('ends a reservation as settled, released or uncertain, keeps the uncertain amount committed, and never reopens one', async () => {
    await grant(seed.projectId, 'enabled', 5, 40)
    const a = await open(seed.projectId, await job(seed.projectId))
    const settled = await reserve(seed.projectId, a.id, { key: 'm1', kind: 'model', amount: 1 })
    const released = await reserve(seed.projectId, a.id, { key: 'm2', kind: 'model', amount: 1 })
    const unknown = await reserve(seed.projectId, a.id, { key: 'm3', kind: 'model', amount: 1 })
    await end(seed.projectId, settled.id, 'settled', 0.42)
    await end(seed.projectId, settled.id, 'settled', 0.42)
    await end(seed.projectId, released.id, 'released', null)
    await end(seed.projectId, unknown.id, 'uncertain', null)
    let now = await allowanceOf(seed.projectId, a.id)
    assert.deepEqual(
      [Number(now.reserved_usd), Number(now.spent_usd), Number(now.uncertain_usd)],
      [0, 0.42, 1],
      'an abort is not a refund',
    )
    await end(seed.projectId, unknown.id, 'settled', 0.8)
    now = await allowanceOf(seed.projectId, a.id)
    assert.deepEqual(
      [Number(now.reserved_usd), Number(now.spent_usd), Number(now.uncertain_usd)],
      [0, 1.22, 0],
      'reconciled from usage',
    )
    const endSql = `SELECT sophia.end_research_reservation($1, $2, $3, $4, NULL, NULL)`
    assert.match(
      await failure(endSql, [seed.projectId, settled.id, 'released', null]),
      /^40001: Reservation already ended as settled/,
    )
    assert.match(
      await failure(endSql, [seed.projectId, settled.id, 'settled', 0.5]),
      /^40001/,
      'a settled cost does not change',
    )
    assert.match(await failure(endSql, [seed.projectId, released.id, 'settled', 0.1]), /^40001/)
    assert.match(await failure(endSql, [seed.projectId, settled.id, 'settled', null]), /^22023/)
    assert.match(await failure(endSql, [seed.projectId, settled.id, 'refunded', null]), /^22023/)
  })

  it('records provenance that a reader sees exactly when it sees the source, and a read must name its target', async () => {
    await grant(seed.projectId, 'enabled', 5, 40)
    const a = await open(seed.projectId, await job(seed.projectId))
    const text = (scope: string, eligible: boolean, body: string) =>
      one<{ id: string }>(
        `INSERT INTO sophia.source_objects(project_id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
         VALUES($1,$2,$3,encode(sha256(convert_to($4,'UTF8')),'hex'),'text/markdown',$5,length($4),$6,'ready') RETURNING id`,
        [seed.projectId, A, scope, body, `inline/${randomUUID()}`, eligible],
      )
    const results = await text('project', true, '[search results]')
    const page = await text('project', true, '# Hosts')
    const privatePage = await text('private', false, '# Private capture')
    const search = await reserve(seed.projectId, a.id, { key: 'prov:s', kind: 'search', amount: 0.01 })
    const read = await reserve(seed.projectId, a.id, { key: 'prov:r', kind: 'read', amount: 0.01 })
    await owner.query(
      `INSERT INTO sophia.source_provenance(project_id,source_id,kind,provider,reservation_id,requested_url,provider_http_status,
         provider_request_id,coverage) VALUES($1,$2,'search_results','tavily',$3,NULL,200,'req_1','complete')`,
      [seed.projectId, results.id, search.id],
    )
    for (const source of [page, privatePage]) {
      await owner.query(
        `INSERT INTO sophia.source_provenance(project_id,source_id,kind,provider,reservation_id,target_ref,parent_source_id,
           requested_url,provider_http_status,origin_http_status,reported_final_url,extraction,coverage,limitations)
         VALUES($1,$2,'web_read','jina',$3,$4,$5,'https://example.org/hosts',200,NULL,NULL,'jina-reader/markdown','complete',
           ARRAY['redirects: unverifiable'])`,
        [seed.projectId, source.id, read.id, `search:${results.id}#1`, results.id],
      )
    }
    const visible = (actor: string) =>
      withActor(pool, actor, 'read', async (c) =>
        (
          await c.query<{ source_id: string }>(`SELECT source_id FROM sophia.source_provenance ORDER BY retrieved_at`)
        ).rows.map((r) => r.source_id),
      )
    assert.deepEqual(new Set(await visible(E)), new Set([results.id, page.id]), 'not the private capture')
    assert.deepEqual(new Set(await visible(A)), new Set([results.id, page.id, privatePage.id]), 'its owner sees it')
    assert.deepEqual(await visible(C), [])
    const orphan = await text('project', true, '# Free URL read')
    const freeRead = `INSERT INTO sophia.source_provenance(project_id,source_id,kind,provider,reservation_id,coverage)
                      VALUES($1,$2,'web_read','jina',$3,'complete')`
    assert.match(
      await failure(freeRead, [seed.projectId, orphan.id, read.id]),
      /check constraint/,
      'a read with no target is refused',
    )
    const unpaid = `INSERT INTO sophia.source_provenance(project_id,source_id,kind,provider,target_ref,parent_source_id,coverage)
                    VALUES($1,$2,'web_read','jina',$3,$4,'complete')`
    assert.match(
      await failure(unpaid, [seed.projectId, orphan.id, `search:${results.id}#2`, results.id]),
      /check constraint/,
      'a paid read names its call',
    )
  })

  it("gives the API login reads only: no function, no write (SQLSTATE 42501, the domain's forbidden)", async () => {
    const asApi = async (sql: string, params: unknown[]) => {
      try {
        await withActor(pool, A, 'write', (c) => c.query(sql, params))
        return 'resolved'
      } catch (err) {
        return String((err as { code?: string }).code ?? err)
      }
    }
    const a = await open(seed.projectId, await job(seed.projectId))
    assert.equal(
      await asApi(`SELECT sophia.set_research_grant($1, 'enabled', 50, 500, 'web-pilot-v1', 'x')`, [seed.projectId]),
      'forbidden',
    )
    assert.equal(await asApi(reserveSql, [seed.projectId, a.id, 'api', 1]), 'forbidden')
    assert.equal(
      await asApi(`UPDATE sophia.research_allowances SET cap_usd=500 WHERE project_id=$1`, [seed.projectId]),
      'forbidden',
    )
    assert.equal(
      await asApi(
        `INSERT INTO sophia.research_grants(project_id,state,task_cap_usd,total_cap_usd,source_policy,approval_ref) VALUES($1,'enabled',1,1,'web-pilot-v1','x')`,
        [randomUUID()],
      ),
      'forbidden',
    )
    const seen = await withActor(
      pool,
      E,
      'read',
      async (c) =>
        (
          await c.query(`SELECT count(*)::int AS n FROM sophia.research_allowances WHERE project_id=$1`, [
            seed.projectId,
          ])
        ).rows[0] as { n: number },
    )
    assert.ok(seen.n > 0, "members read their project's allowances")
    const outsider = await withActor(
      pool,
      C,
      'read',
      async (c) => (await c.query(`SELECT count(*)::int AS n FROM sophia.research_grants`)).rows[0] as { n: number },
    )
    assert.equal(outsider.n, 0)
  })
})
