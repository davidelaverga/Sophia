import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setImmediate as nextTurn, setTimeout as sleep } from 'node:timers/promises'
import { describe, it, type TestContext } from 'node:test'
import {
  BACKUP_OBJECT_MAX_BYTES,
  BACKUP_WRITE_MS,
  ByteBackupError,
  diskByteBackup,
  hasDedicatedDiskMount,
  type ByteBackup,
} from './byte-backup.ts'
import { BACKUP_QUOTA_MS } from './byte-backup-quota.ts'
import {
  BACKUP_ACTIVE_BYTES,
  ByteStoreError,
  byteStoreFromEnv,
  memoryByteStore,
  withByteBackup,
  writeOnce,
} from './byte-store.ts'

const PROJECT = '00000000-0000-4000-8000-000000000044'
const SOURCE = '00000000-0000-4000-8000-000000000001'
const KEY = `${PROJECT}/${SOURCE}`
const MIME = 'application/pdf'
const unavailable = (error: unknown) => error instanceof ByteStoreError && error.status === 503
const conflict = (error: unknown) => error instanceof ByteStoreError && error.status === 409

function volume(t: TestContext): string {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'sophia-byte-backup-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

// A labelled mount-table fixture, not a mounted-volume or provider persistence test. File I/O itself is real.
const mounted = (root: string) => `1 0 0:1 / / rw - overlay overlay rw\n2 1 8:1 / ${root} rw - ext4 /dev/disk rw`
const backupAt = (root: string) => diskByteBackup(root, mounted(root))

/** A rejection's stage, from the store's own messages; never the message itself (it names the key). */
function stageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  const stages: [RegExp, string][] = [
    [/was already written/, 'outer claim 409'],
    [/already reserved/, 'inner reservation 409'],
    [/already exists/, 'inner copy or remote 409'],
    [/capacity unavailable/, 'inner quota 503'],
    [/timed out/, 'deadline 503'],
    [/busy/, 'memory admission 503'],
  ]
  return stages.find(([pattern]) => pattern.test(message))?.[1] ?? 'other'
}

/** Each put's outcome and timing, kept to say what happened when an assertion fails. No bytes, path or secret. */
function outcomes(puts: Promise<void>[]) {
  const started = performance.now()
  const ms = () => Math.round(performance.now() - started)
  return Promise.all(
    puts.map((put) =>
      put.then(
        () => ({ fulfilled: true, stage: 'fulfilled', ms: ms() }),
        (error: unknown) => ({ fulfilled: false, stage: stageOf(error), ms: ms() }),
      ),
    ),
  )
}

/** A caller's own 100 ms deadline, as the API's renderer routes hand one in. */
const callerDeadline100ms = () => ({ signal: new AbortController().signal, deadline: performance.now() + 100 })

/** What the journal, the disk and the remote hold for one key, and the journal's whole accounting. */
function afterState(root: string, key: string, remote: { objects: Map<string, Uint8Array> }) {
  const path = join(root, 'budget', 'reservations.sqlite')
  if (!existsSync(path)) return { journal: 'absent', remote: remote.objects.has(key) }
  const journal = new DatabaseSync(path, { readOnly: true })
  try {
    const mine = journal.prepare('SELECT count(*) AS n FROM reservations WHERE key = ?').get(key)
    const all = journal.prepare('SELECT count(*) AS n, coalesce(sum(bytes), 0) AS bytes FROM reservations').get()
    const [project, source] = key.split('/')
    const directory = join(root, 'objects', String(project))
    const entries = existsSync(directory) ? readdirSync(directory) : []
    return {
      reservedForKey: Number(mine?.n),
      journal: { count: Number(all?.n), bytes: Number(all?.bytes) },
      copy: entries.includes(String(source)),
      temporaries: entries.filter((e) => e.endsWith('.tmp')).length,
      remote: remote.objects.has(key),
    }
  } finally {
    journal.close()
  }
}

describe('private immutable report-byte copies', () => {
  it('flushes the exact bytes before remote upload and retains them across a new store instance', async (t) => {
    const root = volume(t)
    const remote = memoryByteStore()
    const bytes = new Uint8Array([1, 2, 3])
    const file = join(root, 'objects', PROJECT, SOURCE)
    let uploads = 0
    const store = withByteBackup(
      {
        ...remote,
        put: async (key, uploaded, mime) => {
          assert.deepEqual(readFileSync(file), Buffer.from(uploaded))
          uploads += 1
          await remote.put(key, uploaded, mime)
        },
      },
      backupAt(root),
    )
    await store.put(KEY, bytes, MIME)
    assert.equal(uploads, 1)
    assert.deepEqual(readFileSync(file), Buffer.from(bytes))
    assert.equal(lstatSync(file).mode & 0o777, 0o600)
    assert.equal(lstatSync(join(root, 'objects')).mode & 0o777, 0o700)
    assert.equal(lstatSync(join(root, 'objects', PROJECT)).mode & 0o777, 0o700)
    await assert.rejects(withByteBackup(remote, backupAt(root)).put(KEY, new Uint8Array([9]), MIME), conflict)
    assert.deepEqual(readFileSync(file), Buffer.from(bytes))
    assert.deepEqual(await remote.get(KEY), bytes)
    assert.deepEqual(await readdir(join(root, 'objects', PROJECT)), [SOURCE])
  })

  it('admits exactly one of two concurrent puts of one fresh key through the write-once claim, with the winning bytes', async (t) => {
    // The shipped composition: writeOnce's claim first (in the API, the 0044 database claim), then the real backup
    // wrapper, disk copy, quota worker and file system, then the remote. The claim here is a LABELLED TEST FIXTURE:
    // atomic in this process (its check and its mark run in one turn, after a yield so both callers are in flight). It
    // stands in for the database claim; it is not a PostgreSQL concurrency test.
    const root = volume(t)
    const remote = memoryByteStore()
    const disk = backupAt(root)
    const counts = { claims: 0, granted: 0, backups: 0, uploads: 0 }
    const counted: ByteBackup = (key, bytes, context) => {
      counts.backups += 1
      return disk(key, bytes, context)
    }
    const claimed = new Set<string>()
    const claim = async (path: string) => {
      counts.claims += 1
      await nextTurn()
      const fresh = !claimed.has(path)
      claimed.add(path)
      if (fresh) counts.granted += 1
      return fresh
    }
    const uploading = {
      ...remote,
      put: (key: string, bytes: Uint8Array, mime: string) => {
        counts.uploads += 1
        return remote.put(key, bytes, mime)
      },
    }
    const store = writeOnce(withByteBackup(uploading, counted), claim)
    const payloads = [new Uint8Array([1]), new Uint8Array([2])]
    const settled = await outcomes(payloads.map((bytes) => store.put(KEY, bytes, MIME)))
    const record = () => JSON.stringify({ settled, counts, after: afterState(root, KEY, remote) })
    assert.deepEqual(
      settled.map((s) => s.stage).toSorted(),
      ['fulfilled', 'outer claim 409'],
      `two callers: one admitted, one refused by the claim; ${record()}`,
    )
    assert.deepEqual(counts, { claims: 2, granted: 1, backups: 1, uploads: 1 }, record())
    const winner = payloads[settled.findIndex((s) => s.fulfilled)] ?? new Uint8Array()
    const file = join(root, 'objects', PROJECT, SOURCE)
    assert.deepEqual(readFileSync(file), Buffer.from(winner), record())
    assert.deepEqual(await remote.get(KEY), winner, record())
    assert.equal(lstatSync(file).mode & 0o777, 0o600)
    assert.equal(lstatSync(join(root, 'objects', PROJECT)).mode & 0o777, 0o700)
    const held = { reservedForKey: 1, journal: { count: 1, bytes: 1 }, copy: true, temporaries: 0, remote: true }
    assert.deepEqual(afterState(root, KEY, remote), held, record())
    // A later put of the same key is refused at the claim: nothing replaced, nothing more charged or uploaded.
    await assert.rejects(store.put(KEY, new Uint8Array([3]), MIME), conflict)
    assert.deepEqual(counts, { claims: 3, granted: 1, backups: 1, uploads: 1 }, record())
    assert.deepEqual(readFileSync(file), Buffer.from(winner))
    assert.deepEqual(await remote.get(KEY), winner)
    assert.deepEqual(afterState(root, KEY, remote), held, record())
  })

  it('refuses a put whose journal another connection holds, uncharged and untouched, then admits it once', async (t) => {
    // The DIRECT inner path (no outer claim), on a healthy journal a first put initialized. The competing lock is
    // INJECTED by a separate connection and held until the put under test has settled, then released in `finally`:
    // the base worker refuses contention at once (fail closed), and nothing of the refused put may remain.
    const root = volume(t)
    const remote = memoryByteStore()
    const store = withByteBackup(remote, backupAt(root))
    await store.put(`${PROJECT}/00000000-0000-4000-8000-0000000000aa`, new Uint8Array([9]), MIME)
    const before = afterState(root, KEY, remote)
    const lock = new DatabaseSync(join(root, 'budget', 'reservations.sqlite'), { timeout: 0 })
    t.after(() => lock.close())
    const untouched = { ...before, reservedForKey: 0, copy: false, temporaries: 0, remote: false }
    const holding = async (begin: 'BEGIN' | 'BEGIN IMMEDIATE', put: () => Promise<void>, hold = 0) => {
      lock.exec(begin)
      // SHARED is taken by a read inside the transaction; RESERVED by BEGIN IMMEDIATE itself.
      if (begin === 'BEGIN') lock.prepare('SELECT count(*) AS n FROM reservations').get()
      const started = performance.now()
      try {
        const [settled] = await outcomes([put()])
        // The base 100 ms caller / 300 ms lock control holds for 300 ms. A put the caller's deadline refused before its
        // worker refused may still have a worker running: hold on past that worker's own bound before releasing.
        const left = settled?.stage === 'deadline 503' ? BACKUP_QUOTA_MS + 500 : hold
        await sleep(Math.max(0, left - (performance.now() - started)))
        return settled
      } finally {
        lock.exec(begin === 'BEGIN' ? 'COMMIT' : 'ROLLBACK')
      }
    }
    const cases = [
      ['SHARED', await holding('BEGIN', () => store.put(KEY, new Uint8Array([1]), MIME))],
      ['RESERVED', await holding('BEGIN IMMEDIATE', () => store.put(KEY, new Uint8Array([2]), MIME))],
      [
        '100 ms caller, 300 ms lock',
        await holding(
          'BEGIN IMMEDIATE',
          () => store.put(KEY, new Uint8Array([3]), MIME, undefined, callerDeadline100ms()),
          300,
        ),
      ],
    ] as const
    for (const [held, settled] of cases) {
      const record = JSON.stringify({ held, settled, after: afterState(root, KEY, remote) })
      assert.equal(settled?.fulfilled, false, record)
      assert.ok(settled?.stage === 'inner quota 503' || settled?.stage === 'deadline 503', record)
      assert.deepEqual(afterState(root, KEY, remote), untouched, record)
    }
    assert.equal(cases[2][1]?.stage === 'inner quota 503' ? (cases[2][1]?.ms ?? 0) < 100 : true, true)
    // Released: the refused key was never charged, so one declared put now goes through, and it is immutable after.
    await store.put(KEY, new Uint8Array([4]), MIME)
    await assert.rejects(store.put(KEY, new Uint8Array([5]), MIME), conflict)
    assert.deepEqual(readFileSync(join(root, 'objects', PROJECT, SOURCE)), Buffer.from([4]))
    assert.deepEqual(await remote.get(KEY), new Uint8Array([4]))
    const after = afterState(root, KEY, remote)
    assert.deepEqual(after, { ...before, reservedForKey: 1, journal: { count: 2, bytes: 2 }, copy: true, remote: true })
  })

  it('retains the copy and the write-once claim after an uncertain remote upload', async (t) => {
    const root = volume(t)
    const remote = memoryByteStore()
    let uploads = 0
    const failed = {
      ...remote,
      put: () => {
        uploads += 1
        return Promise.reject(new Error('remote lost'))
      },
    }
    const claims = new Set<string>()
    const store = writeOnce(withByteBackup(failed, backupAt(root)), (key) => {
      if (claims.has(key)) return Promise.resolve(false)
      claims.add(key)
      return Promise.resolve(true)
    })
    await assert.rejects(store.put(KEY, new Uint8Array([3]), MIME), unavailable)
    await assert.rejects(store.put(KEY, new Uint8Array([3]), MIME), conflict)
    assert.equal(uploads, 1)
    assert.equal(claims.size, 1)
    assert.deepEqual(readFileSync(join(root, 'objects', PROJECT, SOURCE)), Buffer.from([3]))
    assert.equal(remote.objects.size, 0)
  })

  it('refuses traversal, noncanonical keys and excessive bytes before any remote operation', async (t) => {
    const root = volume(t)
    const remote = memoryByteStore()
    const store = withByteBackup(remote, backupAt(root))
    for (const key of [`../${SOURCE}`, `${PROJECT}/../${SOURCE}`, `${PROJECT}/${SOURCE}/extra`, 'objects/a/b']) {
      await assert.rejects(store.put(key, new Uint8Array([1]), MIME), unavailable)
    }
    await assert.rejects(store.put(KEY, new Uint8Array(BACKUP_OBJECT_MAX_BYTES + 1), MIME), unavailable)
    assert.equal(remote.objects.size, 0)
    assert.deepEqual(await readdir(join(root, 'objects')), [])
  })

  it('never follows a substituted project directory or exposes a public copy directory', async (t) => {
    const root = volume(t)
    const outside = volume(t)
    const remote = memoryByteStore()
    const store = withByteBackup(remote, backupAt(root))
    symlinkSync(outside, join(root, 'objects', PROJECT), 'dir')
    await assert.rejects(store.put(KEY, new Uint8Array([1]), MIME), unavailable)
    assert.deepEqual(await readdir(outside), [])
    assert.equal(remote.objects.size, 0)
    chmodSync(join(root, 'objects'), 0o755)
    await assert.rejects(store.put(KEY, new Uint8Array([2]), MIME), unavailable)
    assert.equal(remote.objects.size, 0)
  })

  it('requires an existing canonical root and refuses a symlink or public objects directory', (t) => {
    const root = volume(t)
    assert.throws(() => backupAt(join(root, 'missing')))
    assert.throws(() => backupAt('relative'), ByteBackupError)
    const alias = join(root, 'alias')
    symlinkSync(root, alias, 'dir')
    assert.throws(() => backupAt(alias), ByteBackupError)
    mkdirSync(join(root, 'objects'), { mode: 0o755 })
    assert.throws(() => backupAt(root), ByteBackupError)
  })

  it('refuses a missing mount, the root filesystem, volatile storage and an unrelated mount', () => {
    assert.equal(hasDedicatedDiskMount('/reports', mounted('/reports')), true)
    assert.equal(hasDedicatedDiskMount('/reports', mounted('/different')), false)
    assert.equal(hasDedicatedDiskMount('/', mounted('/reports')), false)
    assert.equal(hasDedicatedDiskMount('/reports', mounted('/reports').replace('ext4', 'tmpfs')), false)
    assert.throws(() => diskByteBackup('/reports', mounted('/different')), ByteBackupError)
    assert.equal(hasDedicatedDiskMount('/a b', mounted('/a\\040b')), true)
  })

  it('does not send a late upload after a backup timeout', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const remote = memoryByteStore()
    let finish: (() => void) | undefined
    const backup = () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
    const store = withByteBackup(remote, backup)
    const rejected = assert.rejects(store.put(KEY, new Uint8Array([1]), MIME), unavailable)
    t.mock.timers.tick(BACKUP_WRITE_MS)
    assert.equal(await Promise.race([rejected.then(() => 'rejected'), nextTurn('sentinel')]), 'rejected')
    finish?.()
    await nextTurn()
    assert.equal(remote.objects.size, 0)
  })

  it('keeps the durable claim and refuses remote I/O when the copy fails', async () => {
    const remote = memoryByteStore()
    let claimed = false
    const store = writeOnce(
      withByteBackup(remote, () => Promise.reject(new Error('/private/backup/path'))),
      () => {
        if (claimed) return Promise.resolve(false)
        claimed = true
        return Promise.resolve(true)
      },
    )
    await assert.rejects(
      store.put(KEY, new Uint8Array([1]), MIME),
      (error: unknown) =>
        unavailable(error) && error instanceof Error && !error.message.includes('/private/backup/path'),
    )
    await assert.rejects(store.put(KEY, new Uint8Array([1]), MIME), conflict)
    assert.equal(claimed, true)
    assert.equal(remote.objects.size, 0)
  })

  it('keeps backup and remote bytes identical if the caller changes its buffer during the copy', async () => {
    const remote = memoryByteStore()
    for (const input of [new Uint8Array([1]), Buffer.from([1])]) {
      let copied: Uint8Array | undefined
      const store = withByteBackup(remote, (_key, bytes) => {
        copied = Uint8Array.from(bytes)
        input[0] = 9
        return Promise.resolve()
      })
      await store.put(KEY, input, MIME)
      assert.deepEqual(copied, new Uint8Array([1]))
      assert.deepEqual(await remote.get(KEY), copied)
      assert.deepEqual(await store.get(KEY), copied)
      assert.equal(await store.signedUrl(KEY, 10, 'report.pdf'), await remote.signedUrl(KEY, 10, 'report.pdf'))
      remote.objects.clear()
    }
  })

  it('admits bytes before snapshotting and holds a shared permit through slow remote completion', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const remote = memoryByteStore()
    let finish: (() => void) | undefined
    const slow = withByteBackup(
      {
        ...remote,
        put: () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      },
      () => Promise.resolve(),
    )
    const other = withByteBackup(remote, () => Promise.resolve())
    const first = assert.rejects(slow.put(KEY, new Uint8Array(BACKUP_ACTIVE_BYTES), MIME), unavailable)
    await nextTurn()
    assert.ok(finish, 'the remote write started')
    let snapshots = 0
    const refused = new Uint8Array([2])
    refused[Symbol.iterator] = () => {
      snapshots += 1
      return [2].values()
    }
    await assert.rejects(other.put('other', refused, MIME), unavailable)
    assert.equal(snapshots, 0, 'capacity is checked before making another payload copy')
    t.mock.timers.tick(BACKUP_WRITE_MS)
    assert.equal(await Promise.race([first.then(() => 'refused'), nextTurn('sentinel')]), 'refused')
    await assert.rejects(other.put('other', refused, MIME), unavailable)
    assert.equal(snapshots, 0, 'a timeout does not release bytes still held by remote I/O')
    finish()
    await nextTurn()
    await other.put('other', refused, MIME)
    assert.equal(snapshots, 1, 'actual settlement releases capacity')
  })

  it('holds the count cap across backup timeouts and never starts remote writes on late copies', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const remote = memoryByteStore()
    const completions: (() => void)[] = []
    const backup = () =>
      new Promise<void>((resolve) => {
        completions.push(resolve)
      })
    const store = withByteBackup(remote, backup)
    const first = assert.rejects(store.put('first', new Uint8Array(), MIME), unavailable)
    const second = assert.rejects(store.put('second', new Uint8Array(), MIME), unavailable)
    assert.equal(completions.length, 2)
    await assert.rejects(withByteBackup(remote, backup).put('third', new Uint8Array(), MIME), unavailable)
    assert.equal(completions.length, 2, 'a refused write starts no backup')
    t.mock.timers.tick(BACKUP_WRITE_MS)
    assert.equal(
      await Promise.race([Promise.all([first, second]).then(() => 'refused'), nextTurn('sentinel')]),
      'refused',
    )
    await assert.rejects(store.put('third', new Uint8Array(), MIME), unavailable)
    for (const complete of completions) complete()
    await nextTurn()
    assert.equal(remote.objects.size, 0, 'late backups never continue to S3')
    await withByteBackup(remote, () => Promise.resolve()).put('third', new Uint8Array(), MIME)
    assert.equal(remote.objects.size, 1)
  })

  it('releases admission after a failed backup or remote write', async () => {
    const bytes = new Uint8Array(BACKUP_ACTIVE_BYTES)
    const remote = memoryByteStore()
    await assert.rejects(
      withByteBackup(remote, () => Promise.reject(new Error('disk failed'))).put(KEY, bytes, MIME),
      unavailable,
    )
    const failedRemote = { ...remote, put: () => Promise.reject(new Error('remote failed')) }
    await assert.rejects(withByteBackup(failedRemote, () => Promise.resolve()).put(KEY, bytes, MIME), unavailable)
    await withByteBackup(remote, () => Promise.resolve()).put(KEY, bytes, MIME)
    assert.equal(remote.objects.size, 1)
  })

  it('honors incoming controls and releases admission if expiry occurs during snapshot allocation', async (t) => {
    let now = 0
    t.mock.method(performance, 'now', () => now)
    let copies = 0
    const remote = memoryByteStore()
    const store = withByteBackup(remote, () => {
      copies += 1
      return Promise.resolve()
    })
    const cancelled = new AbortController()
    cancelled.abort()
    await assert.rejects(
      store.put(KEY, new Uint8Array([1]), MIME, undefined, { signal: cancelled.signal, deadline: 10 }),
      unavailable,
    )
    assert.equal(copies, 0)
    for (let i = 0; i < 2; i += 1) {
      now = 0
      const bytes = new Uint8Array([1])
      bytes[Symbol.iterator] = () => {
        now = 2
        return [1].values()
      }
      await assert.rejects(
        store.put(KEY, bytes, MIME, undefined, { signal: new AbortController().signal, deadline: 1 }),
        unavailable,
      )
    }
    assert.equal(copies, 0, 'pre-start expiry copies nothing to disk or S3')
    now = 0
    await assert.doesNotReject(store.put(KEY, new Uint8Array([1]), MIME), 'unstarted permits were released')
    assert.equal(copies, 1, 'both unstarted permits were released')
  })

  it('uses an earlier caller deadline and retains the permit until a late backup settles', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    t.mock.method(performance, 'now', () => 0)
    const remote = memoryByteStore()
    let finish: (() => void) | undefined
    const store = withByteBackup(
      remote,
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const first = assert.rejects(
      store.put(KEY, new Uint8Array(BACKUP_ACTIVE_BYTES), MIME, undefined, {
        signal: new AbortController().signal,
        deadline: 10,
      }),
      unavailable,
    )
    t.mock.timers.tick(10)
    assert.equal(await Promise.race([first.then(() => 'refused'), nextTurn('sentinel')]), 'refused')
    await assert.rejects(
      withByteBackup(remote, () => Promise.resolve()).put('other', new Uint8Array([1]), MIME),
      unavailable,
    )
    assert.ok(finish)
    finish()
    await nextTurn()
    assert.equal(remote.objects.size, 0)
    await withByteBackup(remote, () => Promise.resolve()).put('other', new Uint8Array([1]), MIME)
  })

  it('requires complete S3 settings and does not activate disk copying when its setting is absent', () => {
    assert.equal(byteStoreFromEnv({}), null)
    assert.throws(() => byteStoreFromEnv({ SOPHIA_STORAGE_BACKUP_ROOT: '/missing' }), /requires the S3/u)
    assert.throws(() => byteStoreFromEnv({ SOPHIA_STORAGE_S3_ENDPOINT: 'https://storage.invalid' }), /set together/u)
    let requests = 0
    const store = byteStoreFromEnv(
      {
        SOPHIA_STORAGE_S3_ENDPOINT: 'https://storage.invalid',
        SOPHIA_STORAGE_S3_REGION: 'test-region',
        SOPHIA_STORAGE_S3_ACCESS_KEY_ID: 'synthetic-access',
        SOPHIA_STORAGE_S3_SECRET_ACCESS_KEY: 'synthetic-secret',
        SOPHIA_STORAGE_BUCKET: 'synthetic-reports',
      },
      () => {
        requests += 1
        return Promise.reject(new Error('unexpected remote I/O'))
      },
    )
    assert.ok(store)
    assert.equal(requests, 0)
  })
})
