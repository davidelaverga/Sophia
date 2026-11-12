/**
 * The owner gateway's durable journal: one append-only JSONL file, each record fsynced before the call that depends on
 * it. The pattern is the dsh bridge's session journal (packages/dsh-bundle/src/session-events.ts), not its schema.
 *
 * r2 (independent review INC01-CC-002-r1):
 * - Identity (R1-F01): the file starts with a header carrying its `journalId`, written once at creation. Sophia binds an
 *   operation to it at prepare-send; only this journal, by this id, speaks for that operation. It never proves that a
 *   possibly-sent operation was not sent (r3, R2-F01): an id names the file, not the completeness of its history.
 * - One writer (R1-F02): opening takes the cross-process lock (runner-journal-lock.ts); every append first checks that
 *   the lock is still ours and that the file is exactly as long as this writer left it.
 * - Validation (R1-F03, R2-F03): every complete record is validated with its legal transition, its derived identity
 *   and its follow-up target (runner-journal-records.ts), on load and before each append;
 *   anything else stops the journal from opening. Only a final line without its newline that does not parse is cut as
 *   torn (a crash mid-append); a complete final record whose newline was cut is validated, then terminated.
 * - Privacy: the directory is created 0700 and the journal and lock files 0600. Records hold the envelope (the owner's
 *   message) and identities only: no credential, transcript or home path.
 * - Its private path (repair 5, NATIVE4-F01): before anything is read or written, the journal's real directory must be
 *   this uid's and writable by no one else, and every ancestor this uid's or root's and not writable by others unless
 *   sticky. The file is opened once without following a symbolic link and must be a regular file of this uid, with no
 *   group or other permission and one link. Otherwise it is refused, never chmodded, truncated or rewritten. Every
 *   read, torn-line repair and append goes through that one descriptor, and each append first checks that the path
 *   still names it. Limits: POSIX hosts only (O_NOFOLLOW, getuid); this uid and root are trusted; ancestors are judged
 *   once, at opening; no filesystem's isolation is qualified by this.
 * - Whole bytes (repair 13, NATIVE12-F01 and F01-A3): every write of the header, a record or a terminating newline
 *   writes all of its UTF-8 bytes before its fsync, or throws; nothing advances (the journal's id, seq, length or an
 *   entry) until the whole write and its fsync are done. A torn final line is cut at its first raw byte, never by the
 *   length of its decoded text. No power-loss, filesystem or kernel guarantee beyond the fsyncs is claimed.
 * @module @sophia/coordination/runner-journal
 */
import { randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
  writeSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { JournalLock } from './runner-journal-lock.ts'
import {
  checkTarget,
  JOURNAL_VERSION,
  recordOf,
  transition,
  type JournalEntry,
  type JournalRecord,
} from './runner-journal-records.ts'

export type { JournalEntry, JournalRecord } from './runner-journal-records.ts'
export { JournalCorrupt } from './runner-journal-records.ts'
export { JournalLocked } from './runner-journal-lock.ts'

type OperationRecord = Exclude<JournalRecord, { type: 'header' }>
type Body<T extends OperationRecord['type']> = Omit<
  Extract<OperationRecord, { type: T }>,
  'seq' | 'time' | 'type' | 'operationId'
>

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))
const codeOf = (error: unknown) => (error instanceof Error && 'code' in error ? String(error.code) : '')
/** A refusal to use the journal's path. It names no path: what is wrong, never where. */
const unsafe = (why: string, options?: ErrorOptions) => new Error(`runner journal path is unsafe: ${why}`, options)

/** This process's uid. Without one, or without O_NOFOLLOW (not POSIX), the journal does not open. */
function ownUid(): number {
  if (typeof process.getuid !== 'function' || typeof constants.O_NOFOLLOW !== 'number')
    throw unsafe('this platform cannot open a file without following links or name its owner')
  return process.getuid()
}

const othersWrite = (mode: number) => (mode & 0o022) !== 0
const sticky = (mode: number) => (mode & 0o1000) !== 0

/**
 * The journal's real path, once its directory is proven private: created 0700 when missing, then a directory of this
 * uid that no one else can write, under ancestors of this uid or root that no one else can write unless sticky. Nothing
 * is changed to make it so: an unsafe directory is refused before a lock or a journal is created in it.
 */
function privatePath(file: string, uid: number): string {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const dir = realpathSync(dirname(file))
  const own = statSync(dir)
  if (!own.isDirectory()) throw unsafe('its directory is not a directory')
  if (own.uid !== uid) throw unsafe("its directory is another user's")
  if (othersWrite(own.mode)) throw unsafe('its directory is writable by others')
  for (let at = dirname(dir); ; at = dirname(at)) {
    const up = statSync(at)
    if (up.uid !== uid && up.uid !== 0) throw unsafe("an ancestor directory is another user's")
    if (othersWrite(up.mode) && !sticky(up.mode)) throw unsafe('an ancestor directory is writable by others')
    if (dirname(at) === at) break
  }
  return join(dir, basename(file))
}

/** The open journal must be a regular file of this uid, private to it, with this one name. */
function checkDescriptor(fd: number, uid: number): void {
  const st = fstatSync(fd)
  if (!st.isFile()) throw unsafe('it is not a regular file')
  if (st.uid !== uid) throw unsafe("it is another user's file")
  if ((st.mode & 0o077) !== 0) throw unsafe('others may read or write it')
  if (st.nlink !== 1) throw unsafe('it has another name (a hard link)')
}

/** Open the journal once, never through a symbolic link: an existing file as it is, a missing one created 0600. */
function openPrivate(file: string, uid: number): number {
  const { O_RDWR, O_CREAT, O_EXCL, O_NOFOLLOW } = constants
  let fd: number
  try {
    fd = openSync(file, O_RDWR | O_NOFOLLOW)
  } catch (err) {
    if (codeOf(err) === 'ELOOP') throw unsafe('it is a symbolic link', { cause: err })
    if (codeOf(err) !== 'ENOENT') throw err
    try {
      fd = openSync(file, O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
    } catch (created) {
      if (codeOf(created) === 'EEXIST') throw unsafe('it is a symbolic link, or appeared while it was created')
      throw created
    }
  }
  try {
    checkDescriptor(fd, uid)
  } catch (err) {
    closeSync(fd)
    throw err
  }
  return fd
}

/**
 * Write every UTF-8 byte of `text` at `position`, continuing after any positive short write (repair 13, NATIVE12-F01).
 * Progress that is not a whole number of bytes in 1..remaining (zero, negative, NaN, fractional, too many) throws, so
 * every call either advances or ends the write. A thrown call is never retried, rewound or taken as written: the caller
 * fails closed, and a later opening cuts a torn tail. Returns the number of bytes written.
 */
function writeWhole(fd: number, text: string, position: number): number {
  const bytes = Buffer.from(text, 'utf8')
  let done = 0
  while (done < bytes.length) {
    const left = bytes.length - done
    const n = writeSync(fd, bytes, done, left, position + done)
    if (!Number.isSafeInteger(n) || n < 1 || n > left) throw new Error('runner journal: a write made no valid progress')
    done += n
  }
  return bytes.length
}

/** Every byte of the open file. */
function readAll(fd: number): Buffer {
  const bytes = Buffer.alloc(fstatSync(fd).size)
  let at = 0
  while (at < bytes.length) {
    const n = readSync(fd, bytes, at, bytes.length - at, at)
    if (n === 0) throw new Error('runner journal changed while it was read')
    at += n
  }
  return bytes
}

export class RunnerJournal {
  private readonly entries = new Map<string, JournalEntry>()
  private seq = 0
  private length = 0
  private journalId = ''
  private readonly file: string
  private readonly uid: number
  private readonly lock: JournalLock
  private fd = -1

  /**
   * Opens (or creates) the journal, holding its lock and its one descriptor until close(). Throws on an unsafe path
   * (before anything is read or written), JournalLocked, or a corruption error.
   */
  constructor(file: string) {
    this.uid = ownUid()
    this.file = privatePath(file, this.uid)
    this.lock = JournalLock.acquire(this.file)
    try {
      this.fd = openPrivate(this.file, this.uid)
      if (fstatSync(this.fd).size > 0) this.load()
      else this.create()
    } catch (err) {
      this.closeFile()
      this.lock.release()
      throw err
    }
  }

  /** This journal's durable identity, from its header. */
  get id(): string {
    return this.journalId
  }

  private create(): void {
    const journalId = randomUUID()
    const header = { seq: 0, time: Date.now(), type: 'header', journalId, version: JOURNAL_VERSION }
    // Only ever an empty file: a new one, or one whose torn header was cut to nothing.
    if (fstatSync(this.fd).size !== 0) throw new Error('runner journal: a header is written only to an empty file')
    const size = writeWhole(this.fd, `${JSON.stringify(header)}\n`, 0)
    fsyncSync(this.fd)
    if (fstatSync(this.fd).size !== size) throw new Error('runner journal: its header was not written whole')
    const dir = openSync(dirname(this.file), 'r')
    try {
      fsyncSync(dir)
    } finally {
      closeSync(dir)
    }
    // Repair 13: the id becomes this journal's only once its whole header and directory entry are durable.
    this.length = size
    this.journalId = journalId
    this.seq = 1
  }

  private load(): void {
    const bytes = readAll(this.fd)
    const text = bytes.toString('utf8')
    const lines = text.split('\n')
    const complete = text.endsWith('\n')
    let length = bytes.length
    for (const [index, line] of lines.entries()) {
      const last = index === lines.length - 1
      if (line.length === 0) {
        if (!last) throw new Error(`runner journal is corrupt at line ${index + 1}: an empty line`)
        continue
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch (error) {
        // Only a final line without its newline is a torn append; a complete line that does not parse is corruption.
        if (!last || complete)
          throw new Error(`runner journal is corrupt at line ${index + 1}: ${describe(error)}`, { cause: error })
        // Repair 13 (NATIVE12-F01-A3): cut at the torn line's first raw byte, just after the last newline byte. Its
        // decoded text is no measure: an incomplete UTF-8 character decodes to U+FFFD, longer than its bytes.
        length = bytes.lastIndexOf(0x0a) + 1
        this.truncate(length, '')
        continue
      }
      this.apply(parsed, index + 1)
      if (last && !complete) {
        this.truncate(bytes.length, '\n')
        length = bytes.length + 1
      }
    }
    // Only a header torn while the file was being created leaves nothing: no id was ever handed out, so start afresh.
    if (this.seq === 0 && length === 0) return this.create()
    if (this.seq === 0) throw new Error('runner journal is corrupt: it has no header')
    this.length = length
  }

  private apply(parsed: unknown, line: number): void {
    let record: JournalRecord
    try {
      record = recordOf(parsed, this.seq)
      if (record.type === 'header') this.journalId = record.journalId
      else this.entries.set(record.operationId, this.next(record))
    } catch (error) {
      throw new Error(`runner journal is corrupt at line ${line}: ${describe(error)}`, { cause: error })
    }
    this.seq += 1
  }

  /** The operation's entry after `record`: its transition, and an input or Stop intent's target (R2-F03). */
  private next(record: OperationRecord): JournalEntry {
    checkTarget(this.entries, record)
    return transition(this.entries.get(record.operationId), record)
  }

  private truncate(length: number, suffix: string): void {
    ftruncateSync(this.fd, length)
    if (suffix) writeWhole(this.fd, suffix, length)
    fsyncSync(this.fd)
  }

  /** The configured path must still name this open file, unchanged in kind, owner and privacy: else nothing is written. */
  private assertSamePath(): void {
    if (this.fd < 0) throw new Error('runner journal is closed')
    checkDescriptor(this.fd, this.uid)
    const open = fstatSync(this.fd)
    let named: ReturnType<typeof lstatSync>
    try {
      named = lstatSync(this.file)
    } catch (err) {
      throw unsafe('its path no longer names this journal', { cause: err })
    }
    if (named.isSymbolicLink() || named.dev !== open.dev || named.ino !== open.ino)
      throw unsafe('its path no longer names this journal')
  }

  entry(operationId: string): JournalEntry | undefined {
    return this.entries.get(operationId)
  }

  /**
   * Append one record and fsync it before returning. Fails closed unless this writer still holds the lock and the file
   * is exactly as long as it left it; the record's transition is checked before anything is written.
   */
  append<T extends OperationRecord['type']>(type: T, operationId: string, body: Body<T>): void {
    this.lock.assertHeld()
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the discriminant and body are typed together by Body<T>
    const record = { seq: this.seq, time: Date.now(), type, operationId, ...body } as unknown as OperationRecord
    const line = `${JSON.stringify(record)}\n`
    // The same validation a reload applies, so nothing is written that would stop the journal from opening.
    const checked = recordOf(JSON.parse(line), this.seq)
    if (checked.type === 'header') throw new Error('runner journal: a header cannot be appended')
    const next = this.next(checked)
    this.assertSamePath()
    if (fstatSync(this.fd).size !== this.length) throw new Error('runner journal was written by another writer')
    // Repair 13: the whole line, then its fsync, before the length, seq or entry advance.
    const size = writeWhole(this.fd, line, this.length)
    fsyncSync(this.fd)
    this.length += size
    this.seq += 1
    this.entries.set(operationId, next)
  }

  /** Close the file and release the lock. The journal stays on disk; reopening it reloads and revalidates it. */
  close(): void {
    this.closeFile()
    this.lock.release()
  }

  private closeFile(): void {
    if (this.fd < 0) return
    const fd = this.fd
    this.fd = -1
    closeSync(fd)
  }
}
