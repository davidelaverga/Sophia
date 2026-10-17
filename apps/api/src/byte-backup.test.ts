import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  chmodSync,
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
import { setImmediate as nextTurn } from 'node:timers/promises'
import { describe, it, type TestContext } from 'node:test'
import { BroadcastChannel, setEnvironmentData } from 'node:worker_threads'
import {
  BACKUP_OBJECT_MAX_BYTES,
  BACKUP_WRITE_MS,
  ByteBackupError,
  diskByteBackup,
  hasDedicatedDiskMount,
} from './byte-backup.ts'
import { BACKUP_DIAGNOSTICS } from './byte-backup-quota.ts'
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

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex').slice(0, 16)
const sanitized = (text: string) => text.replace(/\/[^\s'"`]+/gu, '[path]').slice(0, 160)
/** A settled put as a failure report may say it: its outcome, the error's kind and codes, never a path or content. */
function settled(result: PromiseSettledResult<void>) {
  if (result.status === 'fulfilled') return 'fulfilled'
  const e: unknown = result.reason
  const fields: Record<string, unknown> = typeof e === 'object' && e !== null ? { ...e } : {}
  return {
    name: e instanceof Error ? e.name : typeof e,
    status: fields.status ?? null,
    code: fields.code ?? null,
    message: e instanceof Error ? sanitized(e.message) : null,
  }
}
const list = (dir: string) => {
  try {
    return readdirSync(dir)
  } catch {
    return null
  }
}
/** What two puts left on the volume, in the journal and at the remote: kinds, sizes and digests, never bytes. */
function leftBehind(root: string, remote: ReturnType<typeof memoryByteStore>) {
  const objects = list(join(root, 'objects', PROJECT))?.map((name) => {
    const bytes = readFileSync(join(root, 'objects', PROJECT, name))
    return { kind: name === SOURCE ? 'copy' : 'other', size: bytes.byteLength, sha256: digest(bytes) }
  })
  const budget = list(join(root, 'budget'))?.map((name) => ({ name, size: lstatSync(join(root, 'budget', name)).size }))
  let reservations: unknown = null
  try {
    const db = new DatabaseSync(join(root, 'budget', 'reservations.sqlite'), { readOnly: true })
    try {
      reservations = db.prepare('SELECT key=? AS this, bytes FROM reservations').all(KEY)
    } finally {
      db.close()
    }
  } catch (error) {
    reservations = { unreadable: error instanceof Error ? sanitized(error.message) : 'unknown' }
  }
  const held = remote.objects.get(KEY)
  return { objects, budget, reservations, remote: held ? { size: held.byteLength, sha256: digest(held) } : null }
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

  it('allows exactly one concurrent copy and upload without replacing the winning bytes', async (t) => {
    const root = volume(t)
    const remote = memoryByteStore()
    const store = withByteBackup(remote, backupAt(root))
    // Failure-only diagnostics (R-C3-BACKUP-01): the reservation stages this case's workers report, kept only to be
    // said if the puts do not leave exactly one winner. The assertions below are unchanged.
    const stages: unknown[] = []
    setEnvironmentData(BACKUP_DIAGNOSTICS, true)
    const channel = new BroadcastChannel(BACKUP_DIAGNOSTICS)
    channel.addEventListener('message', (event) => stages.push((event as MessageEvent).data))
    t.after(() => {
      channel.close()
      setEnvironmentData(BACKUP_DIAGNOSTICS, undefined)
    })
    const started = performance.now()
    const writes = await Promise.allSettled([
      store.put(KEY, new Uint8Array([1]), MIME),
      store.put(KEY, new Uint8Array([2]), MIME),
    ])
    const ms = Math.round(performance.now() - started)
    if (writes.filter((r) => r.status === 'fulfilled').length !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      const report = { ms, writes: writes.map(settled), stages, left: leftBehind(root, remote) }
      t.diagnostic(`R-C3-BACKUP-01 two-put failure: ${JSON.stringify(report)}`)
    }
    assert.equal(writes.filter((r) => r.status === 'fulfilled').length, 1)
    const rejected = writes.find((r) => r.status === 'rejected')
    assert.ok(rejected?.status === 'rejected' && (conflict(rejected.reason) || unavailable(rejected.reason)))
    // Separate quota workers may meet a busy or initializing journal: fail closed, then recognize the durable key.
    await assert.rejects(store.put(KEY, new Uint8Array([3]), MIME), conflict)
    assert.deepEqual(readFileSync(join(root, 'objects', PROJECT, SOURCE)), Buffer.from(await remote.get(KEY)))
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
