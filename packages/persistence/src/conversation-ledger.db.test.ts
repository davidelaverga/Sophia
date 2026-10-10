// CON-01 G2-S2, the reply ledger: a review-only candidate (db/candidates/con01-s2-conversation-reply-ledger.sql,
// BINDING_MAP §8.7.1), applied here after every migration to a disposable database. Level: sql-run. Its number waits
// for the final census; nothing calls it and nothing is granted. A reply is put `running` by the owner here because no
// dispatch exists yet; that is this test's setup, not a path the candidate offers.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { createPool, startConversation, withActor } from './index.ts'

const CANDIDATE = new URL('../../../db/candidates/con01-s2-conversation-reply-ledger.sql', import.meta.url)
const TABLES = [
  'conversation_grants',
  'conversation_grant_subjects',
  'conversation_reply_allowances',
  'conversation_reservations',
]
const A = randomUUID() // admin
const E = randomUUID() // editor who asks
const F = randomUUID() // another editor

let db: TestDatabase
let pool: pg.Pool

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  await owner(readFileSync(CANDIDATE, 'utf8'))
})
after(async () => {
  await pool.end()
  await db.drop()
})

async function owner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await c.end()
  }
}

/** The error a call ends with (its message is the ledger's code), or `resolved`. */
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/** A project with conversations on, and a running reply asked by `asker`. */
async function setup(asker = E): Promise<{ projectId: string; reply: () => Promise<string> }> {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E, F] })
  await owner(`SELECT sophia.set_conversation_settings($1, 'enabled', 'CON-01 S2 test')`, [projectId])
  const reply = async () => {
    const r = await withActor(pool, asker, 'write', (c) =>
      startConversation(c, projectId, randomUUID(), { title: 'Ask', text: 'Words', askSophia: true }, 'Asker'),
    )
    assert.ok(r.replyId)
    await owner(`UPDATE sophia.conversation_replies SET state='running', reason=NULL, settled_at=NULL WHERE id=$1`, [
      r.replyId,
    ])
    return r.replyId
  }
  return { projectId, reply }
}

const later = (ms: number) => new Date(Date.now() + ms).toISOString()
const tokensGrant = (over: Record<string, unknown> = {}) => ({
  unit: 'calls_tokens',
  routeId: 'route-a',
  credentialRef: 'cred-a',
  ownerResourceRef: 'owner-a',
  approvalRef: 'approval-1',
  expiresAt: later(3_600_000),
  maxCallsPerReply: 2,
  totalCallCap: 10,
  replyTokenCap: 1000,
  totalTokenCap: 5000,
  subjects: [E],
  ...over,
})
const tokensCall = (tokens: number, over: Record<string, unknown> = {}) => ({
  routeId: 'route-a',
  credentialRef: 'cred-a',
  ownerResourceRef: 'owner-a',
  unit: 'calls_tokens',
  tokens,
  priceMicros: 0,
  ...over,
})

const newLineage = (projectId: string, spec: unknown) =>
  owner(`SELECT sophia.conversation_new_lineage($1, $2) AS g`, [projectId, JSON.stringify(spec)])
const setGrant = (projectId: string, spec: unknown) =>
  owner(`SELECT sophia.conversation_set_grant($1, $2) AS g`, [projectId, JSON.stringify(spec)])
const reserve = async (projectId: string, reply: string, ordinal: number, call: unknown) =>
  (
    await owner<{ r: Record<string, unknown> }>(`SELECT sophia.conversation_reserve($1, $2, $3, $4) AS r`, [
      projectId,
      reply,
      ordinal,
      JSON.stringify(call),
    ])
  )[0]?.r
const settle = (projectId: string, reply: string, ordinal: number, used: unknown) =>
  owner(`SELECT sophia.conversation_settle($1, $2, $3, $4) AS r`, [projectId, reply, ordinal, JSON.stringify(used)])
const uncertain = async (projectId: string, reply: string) =>
  (await owner<{ n: number }>(`SELECT sophia.conversation_mark_uncertain($1, $2) AS n`, [projectId, reply]))[0]?.n

interface Counters {
  reserved_calls: string
  reserved_tokens: string
  reserved_price_micros: string
  spent_calls: string
  spent_tokens: string
  spent_price_micros: string
  uncertain_calls: string
  uncertain_tokens: string
  uncertain_price_micros: string
}
/** A lineage's counters (the current one by default). */
async function counters(projectId: string, lineage?: string): Promise<Counters | undefined> {
  const rows = await owner<Counters>(
    `SELECT reserved_calls, reserved_tokens, reserved_price_micros, spent_calls, spent_tokens, spent_price_micros,
            uncertain_calls, uncertain_tokens, uncertain_price_micros
       FROM sophia.conversation_grants WHERE project_id=$1 AND ${lineage ? 'lineage_id=$2' : 'current'}`,
    lineage ? [projectId, lineage] : [projectId],
  )
  return rows[0]
}
const counted = (o: Partial<Counters>): Counters => ({
  reserved_calls: '0',
  reserved_tokens: '0',
  reserved_price_micros: '0',
  spent_calls: '0',
  spent_tokens: '0',
  spent_price_micros: '0',
  uncertain_calls: '0',
  uncertain_tokens: '0',
  uncertain_price_micros: '0',
  ...o,
})

describe('the S2 candidate as installed', () => {
  it('inserts no row and is closed to every login: no table or function grant, row security on', async () => {
    for (const t of TABLES) {
      assert.deepEqual(await owner(`SELECT count(*)::int AS n FROM sophia.${t}`), [{ n: 0 }], t)
    }
    const tableGrants = await owner(
      `SELECT table_name, grantee FROM information_schema.role_table_grants
        WHERE table_schema='sophia' AND table_name = ANY($1) AND grantee <> current_user`,
      [TABLES],
    )
    assert.deepEqual(tableGrants, [])
    const rls = await owner<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='sophia'::regnamespace AND relname = ANY($1)
        ORDER BY relname`,
      [TABLES],
    )
    assert.ok(rls.length === 4 && rls.every((r) => r.relrowsecurity))
    const functions = await owner<{ proname: string; open: boolean }>(
      `SELECT p.proname,
              has_function_privilege('sophia_api', p.oid, 'EXECUTE')
              OR has_function_privilege('sophia_worker', p.oid, 'EXECUTE')
              OR p.proacl IS NULL
              OR EXISTS(SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0) AS open
         FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
          AND (p.proname LIKE 'conversation\\_ledger%' OR p.proname LIKE 'conversation\\_reservation%'
               OR p.proname IN ('conversation_grant_subjects_set','conversation_new_lineage','conversation_set_grant',
                 'conversation_reserve','conversation_settle','conversation_mark_uncertain','conversation_release',
                 'conversation_reconcile'))
        ORDER BY 1`,
    )
    assert.equal(functions.length, 11)
    assert.deepEqual(
      functions.filter((f) => f.open),
      [],
    )
    const api = await codeOf(
      withActor(pool, E, 'write', (c) =>
        c.query(`SELECT sophia.conversation_reserve($1, $2, 1, '{}')`, [randomUUID(), randomUUID()]),
      ),
    )
    // The database refuses (42501), which the persistence layer names «Not permitted».
    assert.match(api, /not permitted|permission denied/i)
  })

  it('holds no free text: its text columns are enumerations or pattern-checked references', async () => {
    const text = await owner<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema='sophia' AND table_name = ANY($1) AND data_type='text' ORDER BY table_name, column_name`,
      [TABLES],
    )
    assert.deepEqual(
      text.map((c) => `${c.table_name}.${c.column_name}`),
      [
        'conversation_grants.approval_ref',
        'conversation_grants.credential_ref',
        'conversation_grants.owner_resource_ref',
        'conversation_grants.route_id',
        'conversation_grants.state',
        'conversation_grants.unit',
        'conversation_reply_allowances.unit',
        'conversation_reservations.credential_ref',
        'conversation_reservations.owner_resource_ref',
        'conversation_reservations.proof_kind',
        'conversation_reservations.route_id',
        'conversation_reservations.state',
        'conversation_reservations.unit',
      ],
    )
    const p = await setup()
    assert.match(
      await codeOf(newLineage(p.projectId, tokensGrant({ credentialRef: 'sk-live A secret with spaces' }))),
      /check constraint/,
    )
  })
})

describe('reservations: keys, replay and the fingerprint', () => {
  it('an exact replay returns its receipt after expiry and after disable; a changed call under the key is refused', async () => {
    const p = await setup()
    await newLineage(p.projectId, tokensGrant({ expiresAt: later(1500) }))
    const reply = await p.reply()
    const first = await reserve(p.projectId, reply, 1, tokensCall(100))
    assert.equal(first?.state, 'reserved')
    const counted0 = await counters(p.projectId)
    await delay(1600)
    assert.deepEqual(await reserve(p.projectId, reply, 1, tokensCall(100)), first)
    await setGrant(p.projectId, { state: 'disabled' })
    assert.deepEqual(await reserve(p.projectId, reply, 1, tokensCall(100)), first)
    for (const changed of [
      tokensCall(101),
      tokensCall(100, { routeId: 'route-b' }),
      tokensCall(100, { credentialRef: 'cred-b' }),
      tokensCall(100, { unit: 'usd', tokens: 0, priceMicros: 5 }),
    ]) {
      assert.equal(await codeOf(reserve(p.projectId, reply, 1, changed)), 'key_reused')
    }
    assert.deepEqual(await counters(p.projectId), counted0)
    // A new key after expiry is refused.
    const second = await p.reply()
    await setGrant(p.projectId, { state: 'enabled', expiresAt: later(3_600_000) })
    await setGrant(p.projectId, { expiresAt: later(800) })
    await delay(900)
    assert.equal(await codeOf(reserve(p.projectId, second, 1, tokensCall(10))), 'grant_expired')
  })

  it('the fingerprint, a lineage’s unit and the ledger’s rows never change or go, even for the owner', async () => {
    const p = await setup()
    await newLineage(p.projectId, tokensGrant())
    const reply = await p.reply()
    await reserve(p.projectId, reply, 1, tokensCall(100))
    assert.equal(
      await codeOf(owner(`UPDATE sophia.conversation_reservations SET amount_tokens=1 WHERE reply_id=$1`, [reply])),
      'fingerprint_fixed',
    )
    assert.equal(
      await codeOf(owner(`UPDATE sophia.conversation_grants SET unit='usd' WHERE project_id=$1`, [p.projectId])),
      'unit_is_fixed',
    )
    assert.equal(
      await codeOf(owner(`DELETE FROM sophia.conversation_reservations WHERE reply_id=$1`, [reply])),
      'ledger_kept',
    )
    assert.equal(
      await codeOf(owner(`DELETE FROM sophia.conversation_reply_allowances WHERE reply_id=$1`, [reply])),
      'ledger_kept',
    )
  })
})

describe('the setter, renewal, route change and a new lineage', () => {
  it('a setter keeps lineage, unit and counters; another unit is refused; an outstanding call keeps its fingerprint', async () => {
    const p = await setup()
    const made = (await newLineage(p.projectId, tokensGrant()))[0]?.g as { lineageId: string; grantRevision: number }
    const reply = await p.reply()
    const first = await reserve(p.projectId, reply, 1, tokensCall(100))
    const kept = await counters(p.projectId)
    const renewed = (await setGrant(p.projectId, { expiresAt: later(7_200_000), routeId: 'route-b' }))[0]?.g as {
      lineageId: string
      grantRevision: number
    }
    assert.equal(renewed.lineageId, made.lineageId)
    assert.equal(renewed.grantRevision, made.grantRevision + 1)
    assert.deepEqual(await counters(p.projectId), kept)
    assert.equal(await codeOf(setGrant(p.projectId, { unit: 'usd' })), 'unit_is_fixed')
    // The exact replay after the renewal is the original receipt, with its original revision.
    const replay = await reserve(p.projectId, reply, 1, tokensCall(100))
    assert.deepEqual(replay, first)
    assert.equal(replay?.grantRevision, made.grantRevision)
    // It settles against what it was made under, though the grant's route moved on.
    await settle(p.projectId, reply, 1, { calls: 1, tokens: 90, priceMicros: 0 })
    assert.deepEqual(await counters(p.projectId), counted({ spent_calls: '1', spent_tokens: '90' }))
    const [row] = await owner<{ route_id: string }>(
      `SELECT route_id FROM sophia.conversation_reservations WHERE reply_id=$1`,
      [reply],
    )
    assert.equal(row?.route_id, 'route-a')
  })

  it('a new lineage only with nothing outstanding and a new approval; a reply stays on its own lineage', async () => {
    const p = await setup()
    const l1 = (await newLineage(p.projectId, tokensGrant()))[0]?.g as { lineageId: string }
    const reply = await p.reply()
    await reserve(p.projectId, reply, 1, tokensCall(100))
    assert.equal(await codeOf(newLineage(p.projectId, tokensGrant({ approvalRef: 'approval-2' }))), 'outstanding')
    await settle(p.projectId, reply, 1, { calls: 1, tokens: 100, priceMicros: 0 })
    assert.equal(await codeOf(newLineage(p.projectId, tokensGrant())), 'approval_reused')
    const l2 = (await newLineage(p.projectId, tokensGrant({ approvalRef: 'approval-2' })))[0]?.g as {
      lineageId: string
    }
    assert.notEqual(l2.lineageId, l1.lineageId)
    const l1Counters = await counters(p.projectId, l1.lineageId)
    assert.deepEqual(l1Counters, counted({ spent_calls: '1', spent_tokens: '100' }))
    // Call 2 of the same logical reply: never served by L2, nothing reset or reserved.
    assert.equal(await codeOf(reserve(p.projectId, reply, 2, tokensCall(50))), 'lineage_changed')
    const [n] = await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM sophia.conversation_reservations WHERE reply_id=$1`,
      [reply],
    )
    assert.equal(n?.n, 1)
    assert.deepEqual(await counters(p.projectId, l1.lineageId), l1Counters)
    assert.deepEqual(await counters(p.projectId), counted({}))
    // A renewal or a route change between a reply's calls doesn't refuse its second.
    const other = await p.reply()
    await reserve(p.projectId, other, 1, tokensCall(10))
    await settle(p.projectId, other, 1, { calls: 1, tokens: 10, priceMicros: 0 })
    await setGrant(p.projectId, { expiresAt: later(7_200_000), routeId: 'route-b' })
    assert.equal((await reserve(p.projectId, other, 2, tokensCall(10, { routeId: 'route-b' })))?.state, 'reserved')
  })
})

describe('dimensions and the counters’ transitions', () => {
  it('a usd lineage counts price only; an amount in the other unit’s dimension is refused', async () => {
    const p = await setup()
    await newLineage(p.projectId, {
      ...tokensGrant({ unit: 'usd', replyTokenCap: undefined, totalTokenCap: undefined }),
      replyPriceCapMicros: 50_000,
      totalPriceCapMicros: 200_000,
    })
    const reply = await p.reply()
    const usd = (price: number, tokens = 0) => tokensCall(tokens, { unit: 'usd', priceMicros: price })
    assert.equal(await codeOf(reserve(p.projectId, reply, 1, usd(1000, 10))), 'invalid_amount')
    assert.equal(await codeOf(reserve(p.projectId, reply, 1, tokensCall(10))), 'unit_mismatch')
    await reserve(p.projectId, reply, 1, usd(1000))
    assert.deepEqual(await counters(p.projectId), counted({ reserved_calls: '1', reserved_price_micros: '1000' }))
    assert.equal(
      await codeOf(settle(p.projectId, reply, 1, { calls: 1, tokens: 5, priceMicros: 900 })),
      'invalid_amount',
    )
  })

  it('each transition moves exactly its amounts; an overrun is what it used; replays move nothing', async () => {
    const p = await setup()
    await newLineage(p.projectId, tokensGrant())
    const reply = await p.reply()
    await reserve(p.projectId, reply, 1, tokensCall(100))
    assert.deepEqual(await counters(p.projectId), counted({ reserved_calls: '1', reserved_tokens: '100' }))
    await settle(p.projectId, reply, 1, { calls: 1, tokens: 150, priceMicros: 0 })
    const settled = counted({ spent_calls: '1', spent_tokens: '150' })
    assert.deepEqual(await counters(p.projectId), settled)
    await settle(p.projectId, reply, 1, { calls: 1, tokens: 150, priceMicros: 0 })
    assert.deepEqual(await counters(p.projectId), settled)
    assert.equal(
      await codeOf(settle(p.projectId, reply, 1, { calls: 1, tokens: 140, priceMicros: 0 })),
      'outcome_conflict',
    )
    await reserve(p.projectId, reply, 2, tokensCall(70))
    assert.equal(await uncertain(p.projectId, reply), 1)
    const marked = counted({ spent_calls: '1', spent_tokens: '150', uncertain_calls: '1', uncertain_tokens: '70' })
    assert.deepEqual(await counters(p.projectId), marked)
    assert.equal(await uncertain(p.projectId, reply), 0)
    assert.deepEqual(await counters(p.projectId), marked)
    assert.equal(
      await codeOf(settle(p.projectId, reply, 2, { calls: 1, tokens: 70, priceMicros: 0 })),
      'outcome_conflict',
    )
  })

  it('release and reconcile refuse every call until their proofs are wired; an uncertain call stays counted', async () => {
    const p = await setup()
    await newLineage(p.projectId, tokensGrant())
    const reply = await p.reply()
    await reserve(p.projectId, reply, 1, tokensCall(100))
    const proof = JSON.stringify({ kind: 'never_claimed', id: randomUUID() })
    assert.equal(
      await codeOf(owner(`SELECT sophia.conversation_release($1, $2, 1, $3)`, [p.projectId, reply, proof])),
      'no_proof_source',
    )
    await uncertain(p.projectId, reply)
    assert.equal(
      await codeOf(
        owner(`SELECT sophia.conversation_reconcile($1, $2, 1, $3, $4)`, [
          p.projectId,
          reply,
          JSON.stringify({ calls: 1, tokens: 100, priceMicros: 0 }),
          proof,
        ]),
      ),
      'no_proof_source',
    )
    assert.deepEqual(await counters(p.projectId), counted({ uncertain_calls: '1', uncertain_tokens: '100' }))
  })
})

describe('ordinals, the reply’s ceilings and the total', () => {
  it('ordinals run 1, 2 in order, within the lineage’s maximum, and an ended one only replays', async () => {
    const p = await setup()
    await newLineage(p.projectId, tokensGrant({ maxCallsPerReply: 1 }))
    const reply = await p.reply()
    assert.equal(await codeOf(reserve(p.projectId, reply, 0, tokensCall(10))), 'invalid_ordinal')
    assert.equal(await codeOf(reserve(p.projectId, reply, 3, tokensCall(10))), 'invalid_ordinal')
    assert.equal(await codeOf(reserve(p.projectId, reply, 2, tokensCall(10))), 'calls_exhausted')
    await setGrant(p.projectId, { maxCallsPerReply: 2 })
    assert.equal(await codeOf(reserve(p.projectId, reply, 2, tokensCall(10))), 'ordinal_out_of_order')
    const first = await reserve(p.projectId, reply, 1, tokensCall(10))
    await uncertain(p.projectId, reply)
    assert.deepEqual(await reserve(p.projectId, reply, 1, tokensCall(10)), { ...first, state: 'uncertain' })
    assert.equal(await codeOf(reserve(p.projectId, reply, 1, tokensCall(20))), 'key_reused')
  })

  it('a reply’s own sum holds its cap, wherever its calls ran', async () => {
    const p = await setup()
    await newLineage(p.projectId, tokensGrant({ replyTokenCap: 150 }))
    const reply = await p.reply()
    await reserve(p.projectId, reply, 1, tokensCall(100))
    await settle(p.projectId, reply, 1, { calls: 1, tokens: 100, priceMicros: 0 })
    assert.equal(await codeOf(reserve(p.projectId, reply, 2, tokensCall(60))), 'limit_reached')
    assert.equal((await reserve(p.projectId, reply, 2, tokensCall(50)))?.state, 'reserved')
  })

  it('two asks for the last allowance: one reserves, the other is refused', async () => {
    const p = await setup()
    await newLineage(p.projectId, tokensGrant({ totalCallCap: 1 }))
    const [r1, r2] = [await p.reply(), await p.reply()]
    const results = await Promise.all([r1, r2].map((r) => codeOf(reserve(p.projectId, r, 1, tokensCall(10)))))
    assert.deepEqual(results.toSorted(), ['limit_reached', 'resolved'])
    assert.deepEqual(await counters(p.projectId), counted({ reserved_calls: '1', reserved_tokens: '10' }))
  })

  it('a reserve waiting on the grant’s lock as it expires is refused when it gets the lock', async () => {
    const p = await setup()
    await newLineage(p.projectId, tokensGrant({ expiresAt: later(2500) }))
    const reply = await p.reply()
    const holder = new pg.Client({ connectionString: db.ownerUrl })
    await holder.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM sophia.conversation_grants WHERE project_id=$1 AND current FOR UPDATE`, [
        p.projectId,
      ])
      const waiting = codeOf(reserve(p.projectId, reply, 1, tokensCall(10)))
      let seen = false
      for (let i = 0; i < 50 && !seen; i += 1) {
        await delay(50)
        const rows = await owner(
          `SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%conversation_reserve%'`,
        )
        seen = rows.length > 0
      }
      assert.ok(seen, 'the reserve waits on the grant lock')
      await delay(2700)
      await holder.query('COMMIT')
      assert.equal(await waiting, 'grant_expired')
    } finally {
      await holder.end()
    }
  })

  it('an asker the lineage doesn’t lend to is refused, and so is a reply of another project', async () => {
    const p = await setup()
    await newLineage(p.projectId, tokensGrant({ subjects: [F] }))
    const reply = await p.reply()
    assert.equal(await codeOf(reserve(p.projectId, reply, 1, tokensCall(10))), 'asker_not_authorized')
    const q = await setup()
    await newLineage(q.projectId, tokensGrant())
    assert.equal(await codeOf(reserve(q.projectId, reply, 1, tokensCall(10))), 'no_reply')
  })
})
