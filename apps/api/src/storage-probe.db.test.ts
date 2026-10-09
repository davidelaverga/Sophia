// SDD-01 P1: the operator's write-once probe (storage-probe.ts, WBC-02-CC-0010 §8) against a stand-in provider that
// behaves as Supabase Storage's S3 PutObject does in the pinned source (it replaces whatever is at its key and ignores
// If-None-Match), and the real claim (0044) on PostgreSQL through the API's login. The probe holds there, fails a
// store not written once, stops at once on an unknown write without trying it again, and writes nothing without its
// preconditions. Run from the API's start command, it ends within its deadline whatever the database does.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createServer, type AddressInfo, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import { writeOnceStore } from './app.ts'
import { ByteStoreError, byteStoreFromEnv } from './byte-store.ts'
import { randomUUID } from 'node:crypto'
import {
  countingFetch,
  probeWriteOnce,
  PROBE_PROJECT,
  runKeys,
  runStorageProbe,
  type ProviderCall,
} from './storage-probe.ts'

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
    // Its first line binds the evidence to the physical namespace written in, and names no credential.
    assert.deepEqual(Reflect.get(log[0] ?? {}, 'namespace'), {
      endpoint: SETTINGS.SOPHIA_STORAGE_S3_ENDPOINT,
      region: SETTINGS.SOPHIA_STORAGE_S3_REGION,
      bucket: SETTINGS.SOPHIA_STORAGE_BUCKET,
    })
    assert.equal(Reflect.get(log[0] ?? {}, 'event'), 'STORAGE_PROBE_START')
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

  it('is one-shot under a run id: the same id again, as a restarted start command runs it, writes nothing', async () => {
    const stand = provider()
    const env = { SOPHIA_API_DATABASE_URL: db.apiUrl, ...SETTINGS }
    const runId = randomUUID()
    const first: object[] = []
    assert.equal(await runStorageProbe(env, { fetchImpl: stand.fetchImpl, log: (r) => first.push(r), runId }), 0)
    const [sequentialKey, racingKey] = runKeys(runId)
    assert.deepEqual(runKeys(runId.toUpperCase()), [sequentialKey, racingKey], 'the same id in capitals')
    assert.deepEqual(
      [...stand.objects.keys()].toSorted(),
      [
        `/storage/v1/s3/sophia-report-bytes/${sequentialKey}`,
        `/storage/v1/s3/sophia-report-bytes/${racingKey}`,
      ].toSorted(),
      'the run id’s own two keys',
    )
    assert.equal(stand.state.puts, 2)
    const again: object[] = []
    assert.equal(await runStorageProbe(env, { fetchImpl: stand.fetchImpl, log: (r) => again.push(r), runId }), 2)
    assert.match(String(done(again).reason), /run id was used before: nothing written/u)
    assert.equal(stand.state.puts, 2, 'no PUT the second time')
    const capitals: object[] = []
    const upper = { fetchImpl: stand.fetchImpl, log: (r: object) => capitals.push(r), runId: runId.toUpperCase() }
    assert.equal(await runStorageProbe(env, upper), 2, 'the same id in capitals is the same run')
    assert.equal(stand.state.puts, 2)
    assert.equal(
      await runStorageProbe(env, { fetchImpl: stand.fetchImpl, log: () => undefined, runId: 'not-a-uuid' }),
      2,
    )
    assert.equal(stand.state.puts, 2)
  })

  it('ends within its deadline when the database never answers, its preconditions included', async () => {
    // A database that accepts a connection and never answers: the probe's first query, a precondition, waits on it.
    const sockets = new Set<Socket>()
    const silent = createServer((socket) => sockets.add(socket))
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve))
    const { port } = silent.address() as AddressInfo
    const stand = provider()
    const log: object[] = []
    const LOST = Symbol('the sentinel')
    let sentinel: NodeJS.Timeout | undefined
    try {
      // 200 ms to its deadline, then at most 5 s closing connections that never opened: well within the sentinel.
      const ended = await Promise.race([
        runStorageProbe(
          { SOPHIA_API_DATABASE_URL: `postgres://sophia_api@127.0.0.1:${String(port)}/sophia`, ...SETTINGS },
          { fetchImpl: stand.fetchImpl, log: (r) => log.push(r), probeMs: 200 },
        ),
        new Promise<typeof LOST>((resolve) => (sentinel = setTimeout(() => resolve(LOST), 10_000))),
      ])
      assert.equal(ended, 3, 'the probe ends, uncertain, before the sentinel')
      assert.match(String(done(log).reason), /past 200 ms/u)
      assert.equal(log.filter((r) => Reflect.get(r, 'event') === 'STORAGE_PROBE_DONE').length, 1, 'its last line')
      assert.equal(stand.state.puts, 0)
    } finally {
      clearTimeout(sentinel)
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => silent.close(resolve))
    }
  })

  it('past its deadline sends nothing more, and its last line names its keys', async () => {
    // A provider whose first answer is held until the deadline's line is out: the store then goes on to its PUT. The
    // deadline is well past the preconditions and the first claim, however slowly the database answers them.
    const stand = provider()
    const sent: string[] = []
    let answerFirst: (() => void) | undefined
    const held = new Promise<void>((resolve) => (answerFirst = resolve))
    const late: typeof fetch = async (input, init) => {
      sent.push(init?.method ?? 'GET')
      await held
      return stand.fetchImpl(input, init)
    }
    const runId = randomUUID()
    const log: object[] = []
    const record = (r: object) => {
      log.push(r)
      if (Reflect.get(r, 'event') === 'STORAGE_PROBE_DONE') answerFirst?.()
    }
    const LOST = Symbol('the sentinel')
    let sentinel: NodeJS.Timeout | undefined
    const ended = await Promise.race([
      runStorageProbe(
        { SOPHIA_API_DATABASE_URL: db.apiUrl, ...SETTINGS },
        { fetchImpl: late, log: record, runId, probeMs: 2000 },
      ),
      new Promise<typeof LOST>((resolve) => (sentinel = setTimeout(() => resolve(LOST), 15_000))),
    ]).finally(() => {
      clearTimeout(sentinel)
      answerFirst?.()
    })
    assert.equal(ended, 3, 'uncertain, before the sentinel')
    const last = done(log)
    assert.match(String(last.reason), /past 2000 ms/u)
    assert.deepEqual(last.keys, runKeys(runId), 'the keys the operator looks for')
    assert.equal(last.providerRequests, 1, 'the first HEAD, held')
    // The held answer is in: the store's next request is refused before it is sent.
    await new Promise((resolve) => setTimeout(resolve, 500))
    assert.deepEqual(sent, ['HEAD'], 'nothing sent after the deadline')
    assert.equal(stand.state.puts, 0)
    assert.equal(log.at(-1), last, 'the deadline’s line is the last')
  })

  it('the operator’s command takes nothing or exactly `--run <uuid>`: anything else writes nothing', () => {
    const script = fileURLToPath(new URL('../../../scripts/storage-write-once-probe.ts', import.meta.url))
    const env = { ...process.env, SOPHIA_API_DATABASE_URL: db.apiUrl, ...SETTINGS }
    for (const args of [[`--run=${randomUUID()}`], ['--run'], ['--rnu', randomUUID()], ['--run', randomUUID(), 'x']]) {
      const run = spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8', timeout: 30_000 })
      assert.equal(run.status, 2, `${args.join(' ')}: ${run.stdout}${run.stderr}`)
      assert.match(run.stdout, /usage: storage-write-once-probe\.ts \[--run <uuid>\]/u)
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
