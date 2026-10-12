import assert from 'node:assert/strict'
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { describe, it, type TestContext } from 'node:test'
import {
  BACKUP_OBJECT_MAX_BYTES,
  BACKUP_WRITE_MS,
  ByteBackupError,
  diskByteBackup,
  hasDedicatedDiskMount,
} from './byte-backup.ts'
import { ByteStoreError, byteStoreFromEnv, memoryByteStore, withByteBackup, writeOnce } from './byte-store.ts'

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
    const writes = await Promise.allSettled([
      store.put(KEY, new Uint8Array([1]), MIME),
      store.put(KEY, new Uint8Array([2]), MIME),
    ])
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
    await assert.rejects(store.put(KEY, new Uint8Array([3]), MIME), /remote lost/u)
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
