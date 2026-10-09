// /ready across a migration (Codex on #107): an API on a database that a migration its routes call hasn't reached takes
// no traffic. On a database migrated through 0042 only, the capture routes of 0043 (#117) would fail on undefined
// functions: not ready. Once 0043 is applied, ready. The previous API requires nothing of 0043, so during a rolling
// deployment it stays ready on either database. An API given a byte store also requires 0044's write claim
// (writeOnce): not ready without it, and an API without a store requires nothing of 0044. An API with voice
// qualification on (A15) requires 0046's functions; off, its default, it requires nothing of 0046. Every API requires
// 0047's call-key claim (the tool-call path claims each call's key, voice qualification on or off); 0047 needs nothing
// of 0046, so the staged database below has it from the start, and a database through 0046 alone is not ready.
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

let dir: string
let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
let stored: FastifyInstance
let voiced: FastifyInstance

before(async () => {
  // The migrations before 0043, exactly as written, and 0047 (it needs none of 0043-0046).
  dir = mkdtempSync(join(tmpdir(), 'sophia-0042-'))
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && (f < DELIVERY || f === KEYS)))
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

  it('with voice qualification on, is not ready until 0046; off, its default, needs none of 0046', async () => {
    for (const file of [DELIVERY, WRITE_ONCE, REQUEUE]) if (!applied.has(file)) await migrate(file)
    assert.deepEqual(await ready(voiced), [503, { ready: false, reason: 'schema' }], 'voice on, no 0046')
    assert.deepEqual(await ready(), [200, { ready: true }], 'voice off, no 0046')
    await migrate(VOICE)
    assert.deepEqual(await ready(voiced), [200, { ready: true }], 'voice on, with 0046')
    assert.deepEqual(await ready(), [200, { ready: true }], 'voice off, with 0046')
  })
})

describe('readiness across 0047', () => {
  it('is not ready on a database through 0046 without 0047, voice qualification on or off; ready with it', async () => {
    const through = mkdtempSync(join(tmpdir(), 'sophia-0046-'))
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && f < KEYS))
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
      assert.deepEqual(await ready(on), [200, { ready: true }], 'voice on, with 0047')
    } finally {
      await off.close()
      await on.close()
      await pool0046.end()
      await before0047.drop()
      rmSync(through, { recursive: true, force: true })
    }
  })
})
