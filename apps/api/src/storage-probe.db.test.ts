// SDD-01 P1: the operator's write-once probe (storage-probe.ts, WBC-02-CC-0010 §8) against a stand-in provider that
// behaves as Supabase Storage's S3 PutObject does in the pinned source (it replaces whatever is at its key and ignores
// If-None-Match), and the real claim (0044) on PostgreSQL through the API's login. The probe holds there, fails a
// store not written once, stops at once on an unknown write without trying it again, and writes nothing without its
// preconditions.
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import { writeOnceStore } from './app.ts'
import { ByteStoreError, byteStoreFromEnv } from './byte-store.ts'
import { countingFetch, probeWriteOnce, PROBE_PROJECT, runStorageProbe, type ProviderCall } from './storage-probe.ts'

const SETTINGS = {
  SOPHIA_STORAGE_S3_ENDPOINT: 'https://provider.invalid/storage/v1/s3',
  SOPHIA_STORAGE_S3_REGION: 'us-east-1',
  SOPHIA_STORAGE_S3_ACCESS_KEY_ID: 'synthetic-access-key',
  SOPHIA_STORAGE_S3_SECRET_ACCESS_KEY: 'synthetic-secret-key',
  SOPHIA_STORAGE_BUCKET: 'sophia-report-bytes',
}

/** The stand-in provider: objects by path; a PUT replaces; `failPuts` makes PUTs fail as a lost connection does. */
function provider() {
  const objects = new Map<string, Buffer>()
  const state = { puts: 0, failPuts: false }
  const fetchImpl: typeof fetch = (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname
    const method = init?.method ?? 'GET'
    if (method === 'HEAD') return Promise.resolve(new Response(null, { status: objects.has(path) ? 200 : 404 }))
    if (method === 'PUT') {
      state.puts += 1
      if (state.failPuts) return Promise.reject(new TypeError('fetch failed'))
      objects.set(path, Buffer.from(init?.body as Uint8Array))
      return Promise.resolve(new Response(null, { status: 200 }))
    }
    const held = objects.get(path)
    return Promise.resolve(held ? new Response(held, { status: 200 }) : new Response('missing', { status: 404 }))
  }
  return { objects, state, fetchImpl }
}

const done = (log: object[]) =>
  log.find((r) => Reflect.get(r, 'event') === 'STORAGE_PROBE_DONE') as Record<string, unknown>

let db: TestDatabase
before(async () => {
  db = await createTestDatabase()
})
after(async () => {
  await db.drop()
})

describe('the write-once probe (storage-probe.ts)', () => {
  it('holds on a provider that replaces: one PUT per key, the first bytes kept, eight racers one write', async () => {
    const stand = provider()
    const log: object[] = []
    const exit = await runStorageProbe(
      { SOPHIA_API_DATABASE_URL: db.apiUrl, ...SETTINGS },
      { fetchImpl: stand.fetchImpl, log: (r) => log.push(r) },
    )
    assert.equal(exit, 0, JSON.stringify(log))
    assert.equal(done(log).ok, true)
    assert.equal(stand.state.puts, 2, 'one PUT for each of the two keys')
    assert.equal(stand.objects.size, 2)
    for (const path of stand.objects.keys()) assert.match(path, new RegExp(`/sophia-report-bytes/${PROBE_PROJECT}/`))
    const text = JSON.stringify(log)
    for (const secret of [
      SETTINGS.SOPHIA_STORAGE_S3_SECRET_ACCESS_KEY,
      SETTINGS.SOPHIA_STORAGE_S3_ACCESS_KEY_ID,
      'X-Amz',
    ])
      assert.equal(text.includes(secret), false, `${secret} is never printed`)
  })

  it('fails a store that is not written once: its own HEAD and a race let a second write reach the provider', async () => {
    const stand = provider()
    const calls: ProviderCall[] = []
    const fetchImpl = countingFetch(calls, stand.fetchImpl)
    const raw = byteStoreFromEnv(SETTINGS, fetchImpl)
    assert.ok(raw)
    const log: object[] = []
    // The S3 adapter alone: its HEAD refuses the sequential write only after a request to the provider.
    assert.equal(await probeWriteOnce({ store: raw, racing: raw, calls, fetchImpl, log: (r) => log.push(r) }), 1)
    assert.match(String(done(log).reason), /only after reaching the provider/u)
    // Past the sequential key, racers each pass the HEAD and PUT.
    const racingLog: object[] = []
    const pool = createPool(db.apiUrl, { max: 2 })
    try {
      const once = writeOnceStore(pool, raw)
      assert.ok(once)
      const exit = await probeWriteOnce({ store: once, racing: raw, calls, fetchImpl, log: (r) => racingLog.push(r) })
      assert.equal(exit, 1, JSON.stringify(racingLog))
      assert.match(String(done(racingLog).reason), /PUTs for one key/u)
    } finally {
      await pool.end()
    }
  })

  it('stops at once on a write whose outcome is unknown, never tries it again, and its key stays claimed', async () => {
    const stand = provider()
    stand.state.failPuts = true
    const calls: ProviderCall[] = []
    const fetchImpl = countingFetch(calls, stand.fetchImpl)
    const raw = byteStoreFromEnv(SETTINGS, fetchImpl)
    assert.ok(raw)
    const pool = createPool(db.apiUrl, { max: 2 })
    try {
      const once = writeOnceStore(pool, raw)
      assert.ok(once)
      const log: object[] = []
      assert.equal(await probeWriteOnce({ store: once, racing: once, calls, fetchImpl, log: (r) => log.push(r) }), 3)
      const ended = done(log)
      assert.match(String(ended.reason), /first write's outcome is unknown/u)
      assert.equal(stand.state.puts, 1, 'one PUT, never sent again')
      // A later write of that key is refused before the provider, whatever the provider holds.
      stand.state.failPuts = false
      await assert.rejects(
        once.put(String(ended.key), Buffer.from('again'), 'application/octet-stream'),
        (e: unknown) => e instanceof ByteStoreError && e.status === 409,
      )
      assert.equal(stand.state.puts, 1)
    } finally {
      await pool.end()
    }
  })

  it('writes nothing without its preconditions: the settings, the API’s login (never an owner’s) and 0044', async () => {
    const stand = provider()
    const quiet = { fetchImpl: stand.fetchImpl, log: () => undefined }
    assert.equal(await runStorageProbe({ SOPHIA_API_DATABASE_URL: db.apiUrl }, quiet), 2, 'no store')
    assert.equal(await runStorageProbe({ ...SETTINGS }, quiet), 2, 'no database')
    assert.equal(await runStorageProbe({ SOPHIA_API_DATABASE_URL: db.ownerUrl, ...SETTINGS }, quiet), 2, 'an owner')
    // A database migrated through 0043 only: no claim to make.
    const migrations = fileURLToPath(new URL('../../../db/migrations', import.meta.url))
    const dir = mkdtempSync(join(tmpdir(), 'sophia-0043-'))
    for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql') && f < '0044'))
      copyFileSync(join(migrations, file), join(dir, file))
    const before0044 = await createTestDatabase(dir)
    try {
      const log: object[] = []
      const exit = await runStorageProbe(
        { SOPHIA_API_DATABASE_URL: before0044.apiUrl, ...SETTINGS },
        { fetchImpl: stand.fetchImpl, log: (r) => log.push(r) },
      )
      assert.equal(exit, 2, JSON.stringify(log))
      assert.match(String(done(log).reason), /no write claim \(0044\)/u)
    } finally {
      await before0044.drop()
      rmSync(dir, { recursive: true, force: true })
    }
    assert.equal(stand.state.puts, 0)
    assert.equal(stand.objects.size, 0)
  })
})
