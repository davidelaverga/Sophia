/**
 * One writer per gateway journal, across processes and instances (r2, R1-F02). Opening a journal creates
 * `<journal>.lock` with O_EXCL (owner-only) holding this process's pid, host, process start time and a fresh token.
 *
 * - Another process, or another instance in this same process, finds the lock and is refused while its holder lives.
 * - A stale lock (its holder's pid gone on this host, or reused by a process with another start time) is recovered by
 *   an atomic rename, so at most one recoverer wins. The renamed lock is kept beside the journal as evidence.
 * - A lock written on another host, or one whose content cannot be read, is never presumed stale: refused.
 * - The holder re-reads the lock before each append and fails closed unless it still holds its own token, so a lost
 *   recovery race ends in a refusal, never two writers.
 * - Repair 5 (NATIVE4-F01): the lock is created and read without following a symbolic link. A symlinked lock cannot be
 *   read, so it is refused, never presumed stale or recovered over. It lives in the journal's directory, which the
 *   journal proves private before taking it.
 * - Repair 6 (NATIVE5-F01): every read is also non-blocking, and only a regular file is read. A FIFO, socket, directory
 *   or other special file at the lock path is refused at once at acquisition, refuses an append at assertHeld, and is
 *   left in place by release: never waited on, consumed, unlinked or adopted.
 * Limits: the lock is per host (a journal on a shared network filesystem written from two hosts is out of scope);
 * where the process start time is unavailable (non-Linux), a live pid is always treated as a live holder.
 * @module @sophia/coordination/runner-journal-lock
 */
import { randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { hostname } from 'node:os'
import { dirname } from 'node:path'

export class JournalLocked extends Error {}

interface LockContent {
  readonly pid: number
  readonly host: string
  readonly start: string | null
  readonly token: string
  readonly journal: string
}

/** The process's start time from /proc (Linux), or null where it cannot be read. */
export function processStart(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? null
  } catch {
    return null
  }
}

function alive(content: LockContent): boolean {
  try {
    process.kill(content.pid, 0)
  } catch (err) {
    // EPERM: a live process of another user. Anything else (ESRCH): gone.
    return err instanceof Error && 'code' in err && err.code === 'EPERM'
  }
  const start = processStart(content.pid)
  return content.start === null || start === null || start === content.start
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * A lock file's text, read without following a symbolic link: null for a link or anything but a regular file. The one
 * reader of every lock read (acquisition and its stale re-read, assertHeld, release). Repair 6 (NATIVE5-F01): opened
 * O_NONBLOCK, so a FIFO or other special file opens (or fails) at once instead of waiting for a writer, and is closed
 * unread, nothing consumed. O_NONBLOCK has no effect on reading a regular file.
 */
function lockText(path: string): string | null {
  let fd: number
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch {
    return null
  }
  try {
    return fstatSync(fd).isFile() ? readFileSync(fd, 'utf8') : null
  } finally {
    closeSync(fd)
  }
}

function readLock(path: string): LockContent | null {
  try {
    const text = lockText(path)
    if (text === null) return null
    const r: unknown = JSON.parse(text)
    if (!isRecord(r)) return null
    if (typeof r.pid !== 'number' || typeof r.host !== 'string' || typeof r.token !== 'string') return null
    return {
      pid: r.pid,
      host: r.host,
      start: typeof r.start === 'string' ? r.start : null,
      token: r.token,
      journal: typeof r.journal === 'string' ? r.journal : '',
    }
  } catch {
    return null
  }
}

function syncDir(path: string): void {
  const fd = openSync(dirname(path), 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function create(path: string, content: LockContent): boolean {
  let fd: number
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'EEXIST') return false
    throw err
  }
  try {
    writeSync(fd, JSON.stringify(content))
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  syncDir(path)
  return true
}

export class JournalLock {
  private readonly path: string
  private readonly content: LockContent
  private released = false

  private constructor(path: string, content: LockContent) {
    this.path = path
    this.content = content
  }

  /** Take the journal's lock, recovering a provably stale one; refuse a live or unprovable holder. */
  static acquire(journalFile: string): JournalLock {
    const path = `${journalFile}.lock`
    const content: LockContent = {
      pid: process.pid,
      host: hostname(),
      start: processStart(process.pid),
      token: randomUUID(),
      journal: journalFile,
    }
    if (create(path, content)) return new JournalLock(path, content)
    const holder = readLock(path)
    if (!holder) throw new JournalLocked('the journal lock exists and cannot be read: refused, not presumed stale')
    if (holder.host !== content.host)
      throw new JournalLocked(`the journal is locked from another host (${holder.host})`)
    if (alive(holder)) throw new JournalLocked(`the journal is held by live process ${holder.pid}`)
    const stale = `${path}.stale.${randomUUID()}`
    try {
      renameSync(path, stale)
    } catch {
      throw new JournalLocked('another process is recovering the stale journal lock')
    }
    // The renamed lock must be the stale one read above; if another recoverer's fresh lock was taken, give it back.
    if (readLock(stale)?.token !== holder.token) {
      try {
        linkSync(stale, path)
      } catch {
        // A third process created a lock meanwhile; whichever holds `path` now is checked on its every append.
      }
      throw new JournalLocked('lost the race to recover the stale journal lock')
    }
    if (!create(path, content)) throw new JournalLocked('another process took the journal lock first')
    return new JournalLock(path, content)
  }

  /** Throws unless this instance still holds the lock: checked before every append. */
  assertHeld(): void {
    if (this.released) throw new JournalLocked('the journal lock was released')
    if (readLock(this.path)?.token !== this.content.token) throw new JournalLocked('the journal lock is no longer ours')
  }

  release(): void {
    if (this.released) return
    this.released = true
    if (readLock(this.path)?.token === this.content.token) unlinkSync(this.path)
  }
}
