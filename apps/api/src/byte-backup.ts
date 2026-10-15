// A private, immutable copy of each report object on the API's persistent disk, before its remote upload. Render's
// daily disk snapshots protect these copies separately from Supabase's database backups. This is not a second
// reader or an automatic restore: recovery must match the restored ledger's path and SHA-256. The operator verifies
// the configured root is the actual mounted volume; an absent root is never created as an ephemeral fallback.
import { constants, lstatSync, mkdirSync, readFileSync, realpathSync, type Stats } from 'node:fs'
import { link, lstat, mkdir, open, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join, resolve } from 'node:path'
import { BACKUP_LIMITS, reserveBackupBytes, type BackupLimits } from './byte-backup-quota.ts'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const OBJECT_KEY = new RegExp(`^(${UUID})/(${UUID})$`, 'u')
export const BACKUP_OBJECT_MAX_BYTES = 32 * 1024 * 1024
export const BACKUP_WRITE_MS = 10_000

/** A copy failure is safe to report without exposing its filesystem path or the report's content. */
export class ByteBackupError extends Error {
  readonly status: 409 | 503

  constructor(status: 409 | 503, message: string) {
    super(message)
    this.name = 'ByteBackupError'
    this.status = status
  }
}

export interface ByteWriteContext {
  /** Only the API's validated renderer lease routes provide this stable job identity. */
  rendererJobId: string
}
export interface ByteWriteControl {
  signal: AbortSignal
  deadline: number
}
export function byteWriteExpired(
  control: ByteWriteControl | undefined,
  deadline = control?.deadline ?? Infinity,
): boolean {
  return Boolean(control?.signal.aborted) || performance.now() >= deadline
}
export type ByteBackup = (key: string, bytes: Uint8Array, context?: ByteWriteContext) => Promise<void>

/** Mount presence is a misconfiguration guard; the provider volume identity and restart persistence remain live checks. */
export function hasDedicatedDiskMount(root: string, mountInfo: string): boolean {
  const volatile = new Set(['overlay', 'tmpfs', 'ramfs', 'devtmpfs', 'proc', 'sysfs'])
  return (
    root !== '/' &&
    mountInfo.split('\n').some((line) => {
      const [before, after] = line.split(' - ')
      const point = before
        ?.split(' ')[4]
        ?.replace(/\\(040|011|012|134)/gu, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
      const filesystem = after?.split(' ')[0]
      return point === root && filesystem !== undefined && !volatile.has(filesystem)
    })
  )
}

const hasCode = (error: unknown, code: string) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code

function checkPrivateDirectory(stat: Stats): void {
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== process.geteuid?.()) {
    throw new ByteBackupError(503, 'report backup directory is not private')
  }
}

function privateDirectory(path: string): void {
  try {
    mkdirSync(path, { mode: 0o700 })
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) throw error
  }
  checkPrivateDirectory(lstatSync(path))
}

async function privateDirectoryAsync(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 })
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) throw error
  }
  checkPrivateDirectory(await lstat(path))
}

async function syncDirectory(path: string): Promise<void> {
  const dir = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    await dir.sync()
  } finally {
    await dir.close()
  }
}

async function removeTemporary(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error
  }
}

async function commitCopy(directory: string, name: string, bytes: Uint8Array): Promise<void> {
  const temporary = join(directory, `.${randomUUID()}.tmp`)
  // A failed exclusive open owns nothing and must not unlink a file another writer created.
  const file = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  )
  try {
    await file.writeFile(bytes)
    await file.sync()
    // link, unlike rename, refuses an existing destination. Every byte is flushed before this name becomes visible.
    await link(temporary, join(directory, name))
    await syncDirectory(directory)
  } catch (error) {
    if (hasCode(error, 'EEXIST')) throw new ByteBackupError(409, 'report backup already exists')
    throw error
  } finally {
    try {
      await file.close()
    } finally {
      await removeTemporary(temporary)
    }
  }
}

/** The configured disk must already exist. Only the API's private child directory is made here. */
export function diskByteBackup(
  root: string,
  mountInfo: string = readFileSync('/proc/self/mountinfo', 'utf8'),
  limits: BackupLimits = BACKUP_LIMITS,
): ByteBackup {
  if (!hasDedicatedDiskMount(root, mountInfo)) {
    throw new ByteBackupError(503, 'report backup root is not a dedicated disk mount')
  }
  if (!isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root) {
    throw new ByteBackupError(503, 'report backup root must be an existing canonical absolute directory')
  }
  const stat = lstatSync(root)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new ByteBackupError(503, 'report backup root is not a directory')
  }
  const objects = join(root, 'objects')
  privateDirectory(objects)
  return async (key, bytes, context) => {
    const match = OBJECT_KEY.exec(key)
    const project = match?.[1]
    const source = match?.[2]
    if (!project || !source || bytes.byteLength > BACKUP_OBJECT_MAX_BYTES) {
      throw new ByteBackupError(503, 'report backup requires a canonical source key and at most 32 MiB')
    }
    await privateDirectoryAsync(objects)
    const status = await reserveBackupBytes({
      root,
      key,
      project,
      job: context?.rendererJobId ?? null,
      bytes: bytes.byteLength,
      limits,
    })
    if (status !== 200) {
      throw new ByteBackupError(
        status,
        status === 409 ? 'report backup already reserved' : 'report backup capacity unavailable',
      )
    }
    const directory = join(objects, project)
    await privateDirectoryAsync(directory)
    // Persist new directory entries as well as the file: a source is never published on an unflushed copy.
    await syncDirectory(root)
    await syncDirectory(objects)
    await commitCopy(directory, source, bytes)
  }
}

/** A late filesystem completion may leave a private orphan, but can never continue to the remote upload. */
export async function boundedByteBackup(
  backup: ByteBackup,
  key: string,
  bytes: Uint8Array,
  context?: ByteWriteContext,
  control?: ByteWriteControl,
): Promise<void> {
  const deadline = Math.min(performance.now() + BACKUP_WRITE_MS, control?.deadline ?? Infinity)
  const timedOut = () => new ByteBackupError(503, 'report backup timed out')
  if (byteWriteExpired(control, deadline)) throw timedOut()
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(timedOut()), Math.max(0, deadline - performance.now()))
    abort = () => reject(timedOut())
    control?.signal.addEventListener('abort', abort, { once: true })
  })
  try {
    await Promise.race([backup(key, bytes, context), expired])
    if (byteWriteExpired(control, deadline)) throw timedOut()
  } catch (error) {
    if (error instanceof ByteBackupError) throw error
    throw new ByteBackupError(503, 'report backup unavailable')
  } finally {
    clearTimeout(timer)
    if (abort) control?.signal.removeEventListener('abort', abort)
  }
}
