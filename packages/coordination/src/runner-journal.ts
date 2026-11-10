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
 * @module @sophia/coordination/runner-journal
 */
import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from 'node:fs'
import { dirname } from 'node:path'
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

export class RunnerJournal {
  private readonly entries = new Map<string, JournalEntry>()
  private seq = 0
  private length = 0
  private journalId = ''
  private readonly file: string
  private readonly lock: JournalLock

  /** Opens (or creates) the journal, holding its lock until close(). Throws JournalLocked or a corruption error. */
  constructor(file: string) {
    this.file = file
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    this.lock = JournalLock.acquire(file)
    try {
      if (existsSync(file) && readFileSync(file).length > 0) this.load()
      else this.create()
    } catch (err) {
      this.lock.release()
      throw err
    }
  }

  /** This journal's durable identity, from its header. */
  get id(): string {
    return this.journalId
  }

  private create(): void {
    this.journalId = randomUUID()
    const header = { seq: 0, time: Date.now(), type: 'header', journalId: this.journalId, version: JOURNAL_VERSION }
    const fd = openSync(this.file, 'w', 0o600)
    try {
      writeSync(fd, `${JSON.stringify(header)}\n`)
      fsyncSync(fd)
      this.length = fstatSync(fd).size
    } finally {
      closeSync(fd)
    }
    const dir = openSync(dirname(this.file), 'r')
    try {
      fsyncSync(dir)
    } finally {
      closeSync(dir)
    }
    this.seq = 1
  }

  private load(): void {
    const bytes = readFileSync(this.file)
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
        length = bytes.length - Buffer.byteLength(line)
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
    const fd = openSync(this.file, 'r+')
    try {
      ftruncateSync(fd, length)
      if (suffix) writeSync(fd, suffix, length)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
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
    const fd = openSync(this.file, 'a', 0o600)
    try {
      if (fstatSync(fd).size !== this.length) throw new Error('runner journal was written by another writer')
      writeSync(fd, line)
      fsyncSync(fd)
      this.length += Buffer.byteLength(line)
    } finally {
      closeSync(fd)
    }
    this.seq += 1
    this.entries.set(operationId, next)
  }

  /** Release the lock. The journal stays on disk; reopening it reloads and revalidates every record. */
  close(): void {
    this.lock.release()
  }
}
