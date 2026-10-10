// /ready across a migration (Codex on #107): an API on a database that a migration its routes call hasn't reached takes
// no traffic. On a database migrated through 0042 only, the capture routes of 0043 (#117) would fail on undefined
// functions: not ready. Once 0043 is applied, ready. The previous API requires nothing of 0043, so during a rolling
// deployment it stays ready on either database. An API given a byte store also requires 0044's write claim
// (writeOnce): not ready without it, and an API without a store requires nothing of 0044. An API with voice
// qualification on (A15) requires 0046's functions; off, its default, it requires nothing of 0046. Every API requires
// 0047's call-key claim (the tool-call path claims each call's key, voice qualification on or off); 0047 needs nothing
// of 0046, so the staged database below has it from the start, and a database through 0046 alone is not ready. With
// voice qualification on, the API numbers the bridge's receipts (0051): not ready without it; off, it needs none of 0051.
// Every API also requires 0052 (provisional number): it accepts the presence reports' reportSeq, so it needs the last
// sequence per room and process (a column, read from pg_attribute) and the guest aggregate (a function); 0052 needs only
// 0013 and 0017, so the staged databases below have it from the start, and a database without it is not ready.
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { memoryByteStore } from './byte-store.ts'

const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations', import.meta.url))
const DELIVERY = '0043_design_delivery.sql'
const WRITE_ONCE = '0044_object_write_once.sql'
const REQUEUE = '0045_render_requeue_output.sql'
const VOICE = '0046_voice_qualification.sql'
const KEYS = '0047_live_call_keys.sql'
const NUMBERING = '0051_voice_evidence_numbering.sql'
const PRESENCE = '0052_presence_order.sql'

let dir: string
let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
let stored: FastifyInstance
let voiced: FastifyInstance

before(async () => {
  // The migrations before 0043, exactly as written, and 0047 and 0052 (they need none of 0043-0046).
  dir = mkdtempSync(join(tmpdir(), 'sophia-0042-'))
  const early = (f: string) => f < DELIVERY || f === KEYS || f === PRESENCE
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && early(f)))
    copyFileSync(join(MIGRATIONS, file), join(dir, file))
  db = await createTestDatabase(dir)
  pool = createPool(db.apiUrl, { max: 2 })
  const verifyActor = createActorVerifier({
    issuer: 'https://synthetic.supabase.test/auth/v1',
    audience: 'authenticated',
    secret: 'synthetic-test-secret-at-least-32-bytes-long!!',
  })
  app = buildApp({ pool, verifyActor })
  stored = buildApp({ pool, verifyActor, byteStore: memoryByteStore() })
  voiced = buildApp({ pool, verifyActor, voiceQualification: true })
})

after(async () => {
  await app.close()
  await stored.close()
  await voiced.close()
  await pool.end()
  await db.drop()
  rmSync(dir, { recursive: true, force: true })
})

const ready = async (api = app): Promise<unknown[]> => {
  const res = await api.inject({ method: 'GET', url: '/ready' })
  return [res.statusCode, res.json()]
}

/** The migrations applied by a test, so each test can run alone (`--test-name-pattern`). */
const applied = new Set<string>()

/** Apply one migration as written, as the owner. */
async function migrate(file: string) {
  applied.add(file)
  const owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
  try {
    await owner.query(readFileSync(join(MIGRATIONS, file), 'utf8'))
  } finally {
    await owner.end()
  }
}

describe('readiness across 0043', () => {
  it('is not ready on a database migrated through 0042, and ready once 0043 is applied', async () => {
    assert.ok(readdirSync(dir).includes('0042_source_review_coordination.sql'), 'migrated through 0042')
    assert.ok(!readdirSync(dir).includes(DELIVERY))
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0043')
    await migrate(DELIVERY)
    assert.deepEqual(await ready(), [200, { ready: true }], 'with 0043')
  })

  it('with a byte store, is not ready until 0044 lets every write claim its key; without one, needs no 0044', async () => {
    assert.ok(!readdirSync(dir).includes(WRITE_ONCE))
    if (!applied.has(DELIVERY)) await migrate(DELIVERY)
    assert.deepEqual(await ready(stored), [503, { ready: false, reason: 'schema' }], 'a store, no 0044')
    assert.deepEqual(await ready(), [200, { ready: true }], 'no store, no 0044')
    await migrate(WRITE_ONCE)
    assert.deepEqual(await ready(stored), [200, { ready: true }], 'a store, with 0044')
    assert.deepEqual(await ready(), [200, { ready: true }], 'no store, with 0044')
  })

  it('with voice qualification on, is not ready until 0046 and 0051; off, its default, needs none of them', async () => {
    for (const file of [DELIVERY, WRITE_ONCE, REQUEUE]) if (!applied.has(file)) await migrate(file)
    assert.deepEqual(await ready(voiced), [503, { ready: false, reason: 'schema' }], 'voice on, no 0046')
    assert.deepEqual(await ready(), [200, { ready: true }], 'voice off, no 0046')
    await migrate(VOICE)
    assert.deepEqual(
      await ready(voiced),
      [503, { ready: false, reason: 'schema' }],
      'voice on, with 0046 but not 0051: the bridge’s receipts would not be numbered',
    )
    assert.deepEqual(await ready(), [200, { ready: true }], 'voice off, with 0046, no 0051')
    await migrate(NUMBERING)
    assert.deepEqual(await ready(voiced), [200, { ready: true }], 'voice on, with 0046 and 0051')
    assert.deepEqual(await ready(), [200, { ready: true }], 'voice off, with 0046 and 0051')
  })
})

describe('readiness across 0047', () => {
  it('is not ready on a database through 0046 without 0047, voice qualification on or off; ready with it', async () => {
    const through = mkdtempSync(join(tmpdir(), 'sophia-0046-'))
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && (f < KEYS || f === PRESENCE)))
      copyFileSync(join(MIGRATIONS, file), join(through, file))
    const before0047 = await createTestDatabase(through)
    const pool0046 = createPool(before0047.apiUrl, { max: 2 })
    const verifyActor = createActorVerifier({
      issuer: 'https://synthetic.supabase.test/auth/v1',
      audience: 'authenticated',
      secret: 'synthetic-test-secret-at-least-32-bytes-long!!',
    })
    const off = buildApp({ pool: pool0046, verifyActor })
    const on = buildApp({ pool: pool0046, verifyActor, voiceQualification: true })
    try {
      assert.deepEqual(await ready(off), [503, { ready: false, reason: 'schema' }], 'voice off, no 0047')
      assert.deepEqual(await ready(on), [503, { ready: false, reason: 'schema' }], 'voice on, no 0047')
      const owner = new pg.Client({ connectionString: before0047.ownerUrl })
      await owner.connect()
      try {
        await owner.query(readFileSync(join(MIGRATIONS, KEYS), 'utf8'))
      } finally {
        await owner.end()
      }
      assert.deepEqual(await ready(off), [200, { ready: true }], 'voice off, with 0047')
      assert.deepEqual(await ready(on), [503, { ready: false, reason: 'schema' }], 'voice on, with 0047, no 0051')
      const numbering = new pg.Client({ connectionString: before0047.ownerUrl })
      await numbering.connect()
      try {
        await numbering.query(readFileSync(join(MIGRATIONS, NUMBERING), 'utf8'))
      } finally {
        await numbering.end()
      }
      assert.deepEqual(await ready(off), [200, { ready: true }], 'voice off, with 0047 and 0051')
      assert.deepEqual(await ready(on), [200, { ready: true }], 'voice on, with 0047 and 0051')
    } finally {
      await off.close()
      await on.close()
      await pool0046.end()
      await before0047.drop()
      rmSync(through, { recursive: true, force: true })
    }
  })
})

describe('readiness across 0052 (provisional number)', () => {
  it('is not ready without 0052, voice qualification on or off; ready with it; and not ready if its column or its function is missing', async () => {
    const through = mkdtempSync(join(tmpdir(), 'sophia-no-0052-'))
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && f !== PRESENCE))
      copyFileSync(join(MIGRATIONS, file), join(through, file))
    const without = await createTestDatabase(through)
    const pool0052 = createPool(without.apiUrl, { max: 2 })
    const verifyActor = createActorVerifier({
      issuer: 'https://synthetic.supabase.test/auth/v1',
      audience: 'authenticated',
      secret: 'synthetic-test-secret-at-least-32-bytes-long!!',
    })
    const off = buildApp({ pool: pool0052, verifyActor })
    const on = buildApp({ pool: pool0052, verifyActor, voiceQualification: true })
    const asOwner = async (sql: string) => {
      const c = new pg.Client({ connectionString: without.ownerUrl })
      await c.connect()
      try {
        await c.query(sql)
      } finally {
        await c.end()
      }
    }
    try {
      assert.deepEqual(await ready(off), [503, { ready: false, reason: 'schema' }], 'voice off, no 0052')
      assert.deepEqual(await ready(on), [503, { ready: false, reason: 'schema' }], 'voice on, no 0052')
      await asOwner(readFileSync(join(MIGRATIONS, PRESENCE), 'utf8'))
      assert.deepEqual(await ready(off), [200, { ready: true }], 'voice off, with 0052')
      assert.deepEqual(await ready(on), [200, { ready: true }], 'voice on, with 0052')
      await asOwner(`ALTER FUNCTION sophia.room_guests_asserted(uuid,timestamptz) RENAME TO room_guests_asserted_gone`)
      assert.deepEqual(await ready(off), [503, { ready: false, reason: 'schema' }], 'the column without the function')
      await asOwner(`ALTER FUNCTION sophia.room_guests_asserted_gone(uuid,timestamptz) RENAME TO room_guests_asserted`)
      assert.deepEqual(await ready(off), [200, { ready: true }], 'both again')
      await asOwner(`ALTER TABLE sophia.room_bridge_reports DROP COLUMN last_seq`)
      assert.deepEqual(await ready(off), [503, { ready: false, reason: 'schema' }], 'the function without the column')
    } finally {
      await off.close()
      await on.close()
      await pool0052.end()
      await without.drop()
      rmSync(through, { recursive: true, force: true })
    }
  })
})
