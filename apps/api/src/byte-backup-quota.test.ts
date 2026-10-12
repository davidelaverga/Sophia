import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, it, type TestContext } from 'node:test'
import { Worker } from 'node:worker_threads'
import { BACKUP_LIMITS, quotaAdmission, reserveBackupBytes, type BackupReservation } from './byte-backup-quota.ts'
import { diskByteBackup } from './byte-backup.ts'
import { ByteStoreError, memoryByteStore, withByteBackup, writeOnce } from './byte-store.ts'

const PROJECT = randomUUID()
const JOB = randomUUID()
const limits = {
  globalBytes: 30,
  projectBytes: 20,
  jobBytes: 10,
  globalCount: 8,
  projectCount: 6,
  jobCount: 3,
  freeBytes: 1,
}

function volume(t: TestContext): string {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'sophia-byte-quota-'))
  mkdirSync(join(root, 'objects'), { mode: 0o700 })
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

const request = (root: string, bytes = 1, changes: Partial<BackupReservation> = {}): BackupReservation => ({
  root,
  project: PROJECT,
  key: `${PROJECT}/${randomUUID()}`,
  job: JOB,
  bytes,
  limits,
  ...changes,
})
const reserve = (root: string, bytes: number, changes: Partial<BackupReservation> = {}) =>
  reserveBackupBytes(request(root, bytes, changes))

function recorded(root: string): { bytes: number; count: number } {
  const db = new DatabaseSync(join(root, 'budget', 'reservations.sqlite'), { readOnly: true })
  try {
    const row = db.prepare('SELECT coalesce(sum(bytes),0) AS bytes, count(*) AS count FROM reservations').get()
    assert.equal(typeof row?.bytes, 'number')
    assert.equal(typeof row?.count, 'number')
    return { bytes: Number(row?.bytes), count: Number(row?.count) }
  } finally {
    db.close()
  }
}

async function beforeSentinel<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const LOST = Symbol('sentinel')
  const result = await Promise.race([
    promise,
    new Promise<typeof LOST>((resolve) => (timer = setTimeout(() => resolve(LOST), 10_000))),
  ]).finally(() => clearTimeout(timer))
  if (result === LOST) assert.fail('quota operation finishes before the sentinel')
  return result
}

describe('durable byte-backup admission', () => {
  it('bounds repeated captures with fresh source keys by job, project and global bytes', async (t) => {
    const root = volume(t)
    assert.equal(await reserve(root, 6), 200)
    assert.equal(await reserve(root, 5), 503, 'fresh source under the same leased job cannot bypass its cap')
    assert.equal(await reserve(root, 4), 200, 'the exact job ceiling is accepted')
    assert.equal(await reserve(root, 1), 503)
    assert.equal(await reserve(root, 10, { job: randomUUID() }), 200)
    assert.equal(await reserve(root, 1, { job: null }), 503, 'ordinary uploads share the project cap')
    const other = randomUUID()
    assert.equal(await reserve(root, 10, { project: other, key: `${other}/${randomUUID()}`, job: null }), 200)
    const third = randomUUID()
    assert.equal(await reserve(root, 1, { project: third, key: `${third}/${randomUUID()}`, job: null }), 503)
    assert.deepEqual(recorded(root), { bytes: 30, count: 4 }, 'refusals add no journal rows')
    assert.deepEqual(readdirSync(join(root, 'objects')), [], 'reservations create no copies or project directories')
  })

  it('bounds zero-byte/tiny-file metadata by job, project and global counts', async (t) => {
    const root = volume(t)
    for (let i = 0; i < 3; i += 1) assert.equal(await reserve(root, 0), 200)
    assert.equal(await reserve(root, 0), 503)
    for (let i = 0; i < 3; i += 1) assert.equal(await reserve(root, 0, { job: null }), 200)
    assert.equal(await reserve(root, 0, { job: null }), 503)
    const other = randomUUID()
    for (let i = 0; i < 2; i += 1) {
      assert.equal(await reserve(root, 0, { project: other, key: `${other}/${randomUUID()}`, job: null }), 200)
    }
    assert.equal(await reserve(root, 0, { project: other, key: `${other}/${randomUUID()}`, job: null }), 503)
    assert.deepEqual(recorded(root), { bytes: 0, count: 8 })
  })

  it('refuses duplicate keys and invalid context without extra charges', async (t) => {
    const root = volume(t)
    const first = request(root, 3)
    assert.equal(await reserveBackupBytes(first), 200)
    assert.equal(await reserveBackupBytes({ ...first, job: randomUUID() }), 409)
    assert.equal(await reserve(root, 1, { job: '../job' }), 503)
    assert.equal(await reserve(root, 1, { limits: { ...limits, jobBytes: BACKUP_LIMITS.jobBytes + 1 } }), 503)
    assert.deepEqual(recorded(root), { bytes: 3, count: 1 })
  })

  it('serializes independent processes at a byte boundary and preserves the charge after restart', async (t) => {
    const root = volume(t)
    assert.equal(await reserve(root, 4), 200)
    const script = `import { reserveBackupBytes } from ${JSON.stringify(new URL('./byte-backup-quota.ts', import.meta.url).href)};
      console.log(await reserveBackupBytes(JSON.parse(process.argv[2])));`
    const scriptPath = join(root, 'quota-child.mjs')
    writeFileSync(scriptPath, script, { mode: 0o600 })
    const child = (input: BackupReservation) => {
      const process = spawn(globalThis.process.execPath, [scriptPath, JSON.stringify(input)])
      let output = ''
      process.stdout.on('data', (data: Buffer) => (output += data.toString()))
      return beforeSentinel(once(process, 'close')).then(([code]) => {
        assert.equal(code, 0)
        return Number(output.trim())
      })
    }
    const results = await beforeSentinel(Promise.all([child(request(root, 6)), child(request(root, 6))]))
    const accepted = results.filter((r) => r === 200).length
    assert.ok(accepted <= 1, 'concurrent contenders never both cross the byte boundary')
    assert.ok(
      results.every((r) => r === 200 || r === 503),
      'contention refuses safely',
    )
    assert.ok(results.includes(503))
    if (accepted === 0)
      assert.equal(await child(request(root, 6)), 200, 'both contended: the uncharged capacity remains')
    assert.deepEqual(recorded(root), { bytes: 10, count: 2 })
    assert.equal(await child(request(root, 1)), 503, 'a third process observes the durable job ceiling')
  })

  it('fails closed for missing, partial, corrupt, public and untracked journals', async (t) => {
    const missing = volume(t)
    mkdirSync(join(missing, 'budget'), { mode: 0o700 })
    assert.equal(await reserve(missing, 1), 503)
    const partial = volume(t)
    mkdirSync(join(partial, 'budget'), { mode: 0o700 })
    writeFileSync(join(partial, 'budget', 'reservations.sqlite'), '', { mode: 0o600 })
    assert.equal(await reserve(partial, 1), 503)
    const corrupt = volume(t)
    assert.equal(await reserve(corrupt, 1), 200)
    writeFileSync(join(corrupt, 'budget', 'reservations.sqlite'), 'not a database')
    assert.equal(await reserve(corrupt, 1), 503)
    const publicRoot = volume(t)
    assert.equal(await reserve(publicRoot, 1), 200)
    chmodSync(join(publicRoot, 'budget', 'reservations.sqlite'), 0o644)
    assert.equal(await reserve(publicRoot, 1), 503)
    const orphan = volume(t)
    mkdirSync(join(orphan, 'objects', PROJECT), { mode: 0o700 })
    assert.equal(await reserve(orphan, 1), 503)
    assert.equal(await reserve(orphan, 1), 503, 'a later request cannot reinitialize the refused directory')
  })

  it('retains charges across copy/upload failure and forwards stable job identity through every wrapper', async (t) => {
    const root = volume(t)
    const remote = memoryByteStore()
    const mount = `1 0 8:1 / ${root} rw - ext4 /dev/disk rw`
    const backup = diskByteBackup(root, mount, limits)
    const failed = { ...remote, put: () => Promise.reject(new Error('uncertain upload')) }
    const store = writeOnce(withByteBackup(failed, backup), () => Promise.resolve(true))
    await assert.rejects(
      store.put(`${PROJECT}/${randomUUID()}`, new Uint8Array(10), 'image/png', { rendererJobId: JOB }),
    )
    assert.deepEqual(recorded(root), { bytes: 10, count: 1 })
    const refused = writeOnce(withByteBackup(remote, diskByteBackup(root, mount, limits)), () => Promise.resolve(true))
    await assert.rejects(
      refused.put(`${PROJECT}/${randomUUID()}`, new Uint8Array(1), 'image/png', { rendererJobId: JOB }),
      (error: unknown) => error instanceof ByteStoreError && error.status === 503,
    )
    assert.equal(remote.objects.size, 0, 'quota refusal performs no remote operation')
    assert.equal(readdirSync(join(root, 'objects', PROJECT)).length, 1, 'no refused copy or temp file')
    const other = randomUUID()
    const broken = request(root, 1, { project: other, key: `${other}/${randomUUID()}`, job: randomUUID() })
    // Charge first, then make the project path unwritable without relying on filesystem permission enforcement as root.
    writeFileSync(join(root, 'objects', other), 'not a directory', { mode: 0o600 })
    await assert.rejects(backup(broken.key, new Uint8Array(1), { rendererJobId: String(broken.job) }))
    assert.deepEqual(recorded(root), { bytes: 11, count: 2 }, 'failed copy keeps its reservation')
    assert.equal(await reserveBackupBytes(broken), 409)
  })

  it('requires worker success and clean exit, bounds admission, and refuses late success after its deadline', async (t) => {
    const root = volume(t)
    const workers: Worker[] = []
    const terminate: (() => Promise<number>)[] = []
    t.after(async () => Promise.all(terminate.map((stop) => stop())))
    const admission = quotaAdmission(() => {
      const worker = new Worker(
        new URL(
          `data:text/javascript,${encodeURIComponent(
            'import {parentPort} from "node:worker_threads"; parentPort.postMessage(200); setInterval(()=>{},10000);',
          )}`,
        ),
      )
      workers.push(worker)
      terminate.push(worker.terminate.bind(worker))
      // Model delayed OS termination: admission must remain occupied until an actual exit event.
      worker.terminate = () => Promise.resolve(0)
      return worker
    })
    const accepted = Array.from({ length: 8 }, () => admission(request(root)))
    await beforeSentinel(Promise.all(workers.map((worker) => once(worker, 'message'))))
    assert.equal(await admission(request(root)), 503, 'a ninth worker is refused without a waiting queue')
    assert.deepEqual(
      await beforeSentinel(Promise.all(accepted)),
      Array.from({ length: 8 }, () => 503),
      'success without exit times out',
    )
    assert.equal(await admission(request(root)), 503, 'timed-out workers retain their slots until they really exit')
    await Promise.all(terminate.map((stop) => stop()))
    assert.deepEqual(readdirSync(join(root, 'objects')), [])
  })
})
