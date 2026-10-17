// One bounded SQLite transaction reserves payload and inode growth before any copy. Reservations are never erased
// on failure. Missing journals beside existing objects, uncertain initialization, corruption and contention refuse.
// This synchronous filesystem/SQLite code runs only in a worker; it must never block the API event loop.
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  realpathSync,
  statfsSync,
} from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import {
  backupDiagnostic,
  isBackupReservation,
  type BackupReservation,
  type BackupQuotaStatus,
} from './byte-backup-quota.ts'

function privatePath(path: string, directory: boolean): void {
  const stat = lstatSync(path)
  if ((directory ? !stat.isDirectory() : !stat.isFile()) || stat.isSymbolicLink()) throw new Error('wrong kind')
  if (stat.uid !== process.geteuid?.() || (stat.mode & 0o077) !== 0) throw new Error('not private')
  if (!directory && stat.size > 8 * 1024 * 1024) throw new Error('oversized journal')
}

function flushDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function createBudgetDirectory(root: string): boolean {
  try {
    mkdirSync(join(root, 'budget'), { mode: 0o700 })
    return true
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'EEXIST') throw error
    return false
  }
}

function journalPath(root: string): { path: string; fresh: boolean } {
  if (!isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root) throw new Error('noncanonical root')
  const fresh = createBudgetDirectory(root)
  const directory = join(root, 'budget')
  const path = join(directory, 'reservations.sqlite')
  privatePath(directory, true)
  privatePath(join(root, 'objects'), true)
  if (fresh) {
    // A journal is initialized only on an empty volume; never forget earlier copies or unknown charges.
    if (readdirSync(join(root, 'objects')).length !== 0) throw new Error('untracked objects')
    const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    closeSync(fd)
  }
  privatePath(path, false)
  if (existsSync(`${path}-journal`)) privatePath(`${path}-journal`, false)
  if (existsSync(`${path}-wal`) || existsSync(`${path}-shm`)) throw new Error('unexpected journal mode')
  return { path, fresh }
}

function initialize(db: DatabaseSync, fresh: boolean): void {
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL; PRAGMA max_page_count=2048;')
  if (fresh) {
    db.exec(`PRAGMA journal_mode=DELETE;
      BEGIN IMMEDIATE;
      CREATE TABLE reservations (
        key TEXT PRIMARY KEY, project TEXT NOT NULL, job TEXT, bytes INTEGER NOT NULL CHECK(bytes >= 0)
      ) STRICT;
      CREATE INDEX by_project ON reservations(project);
      CREATE INDEX by_job ON reservations(job);
      PRAGMA user_version=1;
      COMMIT;`)
  }
  const version = db.prepare('PRAGMA user_version').get()
  const mode = db.prepare('PRAGMA journal_mode').get()
  const pageSize = db.prepare('PRAGMA page_size').get()
  if (version?.user_version !== 1 || mode?.journal_mode !== 'delete' || pageSize?.page_size !== 4096) {
    throw new Error('unqualified journal')
  }
  const integrity = db.prepare('PRAGMA quick_check').get()
  if (integrity?.quick_check !== 'ok') throw new Error('corrupt journal')
}

function usage(db: DatabaseSync, column?: 'project' | 'job', id?: string): { bytes: number; count: number } {
  const statement = db.prepare(
    `SELECT coalesce(sum(bytes),0) AS bytes, count(*) AS count FROM reservations${column ? ` WHERE ${column}=?` : ''}`,
  )
  const row = column && id ? statement.get(id) : statement.get()
  if (typeof row?.bytes !== 'number' || typeof row.count !== 'number') throw new Error('invalid usage')
  return { bytes: row.bytes, count: row.count }
}

function fits(used: { bytes: number; count: number }, bytes: number, byteLimit: number, countLimit: number): boolean {
  return used.bytes + bytes <= byteLimit && used.count < countLimit
}

function withinBudget(db: DatabaseSync, request: BackupReservation): boolean {
  const { root, project, job, bytes, limits } = request
  const total = usage(db)
  if (!fits(total, bytes, limits.globalBytes, limits.globalCount)) return false
  if (!fits(usage(db, 'project', project), bytes, limits.projectBytes, limits.projectCount)) return false
  if (job && !fits(usage(db, 'job', job), bytes, limits.jobBytes, limits.jobCount)) return false
  const space = statfsSync(root, { bigint: true })
  // Charge all earlier reservations against currently free space too, conservatively covering copies still in flight
  // across processes. Completed copies are double-counted: admission may stop before the nominal payload cap.
  return space.bavail * space.bsize - BigInt(total.bytes + bytes) >= BigInt(limits.freeBytes)
}

function reserve(db: DatabaseSync, request: BackupReservation): BackupQuotaStatus {
  db.exec('BEGIN IMMEDIATE')
  if (db.prepare('SELECT key FROM reservations WHERE key=?').get(request.key)) {
    db.exec('ROLLBACK')
    return 409
  }
  if (!withinBudget(db, request)) {
    db.exec('ROLLBACK')
    return 503
  }
  db.prepare('INSERT INTO reservations(key,project,job,bytes) VALUES(?,?,?,?)').run(
    request.key,
    request.project,
    request.job,
    request.bytes,
  )
  db.exec('COMMIT')
  return 200
}

function run(request: BackupReservation): BackupQuotaStatus {
  const { path, fresh } = journalPath(request.root)
  const db = new DatabaseSync(path, { timeout: 0, allowExtension: false, enableDoubleQuotedStringLiterals: false })
  let status: BackupQuotaStatus
  try {
    initialize(db, fresh)
    status = reserve(db, request)
  } finally {
    db.close()
  }
  flushDirectory(join(request.root, 'budget'))
  flushDirectory(request.root)
  return status
}

if (!isMainThread) {
  let status: BackupQuotaStatus = 503
  try {
    const request: unknown = workerData
    if (isBackupReservation(request)) status = run(request)
  } catch (error) {
    // A busy, full, corrupt or uncertain journal is unavailable; no path, content or database error leaves the worker.
    // Only a test that asks sees why, through its own channel (backupDiagnostic; R-C3-BACKUP-01).
    backupDiagnostic('worker-caught', error)
  }
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node MessagePort, not a browser window.
  parentPort?.postMessage(status)
}
