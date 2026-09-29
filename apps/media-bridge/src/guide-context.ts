// What the bridge tracks for the M01 guide in one exchange (SMC-M01 binding §4.3, §5, §6). Pure: the room session
// feeds it and acts on its answers.
//  - Utterances: the holder utterances forwarded in the current provider session. A tool call carries the count, so
//    the database can bind a decision to an answer given after the proposal was put. A cold start begins again at 0.
//  - Freshness: the ledger revision the model last read in full (its project_status), and the revisions its own
//    writes made (their receipts). Every mission write moves the ledger by one, so any revision since that read that
//    is not one of its own is someone else's. Once no write of this session is in flight, the next tool result says
//    the records changed, so the model reads them again. Nothing is spoken unprompted.
//  - Narrowing: a newer eligibility revision means something the provider context may hold was withdrawn: the
//    session must rebuild that context cold, with the same static instruction and none of the old history.
import type { MediaToolResult } from '@sophia/contracts'

export interface Revisions {
  ledgerRevision: number
  eligibilityRevision: number
}

const RECORDS_CHANGED =
  'The project record changed outside this conversation. Read project_status before relying on earlier notes or decisions.'

const numberField = (output: object, key: string): number | null => {
  const value: unknown = Object.entries(output).find(([k]) => k === key)?.[1]
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

export class GuideContext {
  private heard = 0
  /** The ledger revision the model last read in full (its project_status), or the session's start. */
  private read: number
  /** Revisions after `read` that the model's own writes made, from their receipts. */
  private readonly own = new Set<number>()
  /** The newest ledger revision the assignments have shown. */
  private latest: number
  private eligibility: number
  private writes = 0
  private changed = false
  private restored = false

  constructor(start: Revisions) {
    this.read = start.ledgerRevision
    this.latest = start.ledgerRevision
    this.eligibility = start.eligibilityRevision
  }

  /**
   * A revision since the model's last full read that none of its own receipts explains, once no write of its own is in
   * flight (an unconfirmed one could still explain a revision).
   */
  private refresh(): void {
    if (this.writes > 0) return
    const mine = [...this.own].filter((r) => r > this.read && r <= this.latest).length
    if (this.latest - this.read > mine) this.changed = true
  }

  /** A provider session starts. A cold one after an earlier ready connection lost the conversation's history. */
  sessionStarted(cold: boolean, restoredWithoutHistory: boolean): void {
    if (!cold) return
    this.heard = 0
    this.restored = restoredWithoutHistory
  }

  /** The holder began a new utterance (the first words since the model's last turn). */
  utteranceHeard(): void {
    this.heard += 1
  }

  get utterance(): number {
    return this.heard
  }

  /** A newer assignment. True when eligibility narrowed: the provider context must be rebuilt before it speaks again. */
  observe(next: Revisions): boolean {
    this.latest = Math.max(this.latest, next.ledgerRevision)
    this.refresh()
    if (next.eligibilityRevision <= this.eligibility) return false
    this.eligibility = next.eligibilityRevision
    return true
  }

  writeStarted(): void {
    this.writes += 1
  }

  writeSettled(): void {
    this.writes = Math.max(0, this.writes - 1)
  }

  /** The tool result the model receives: continuity facts on a status read, a freshness flag on anything else. */
  annotate(name: string, result: MediaToolResult): MediaToolResult {
    const ledger = numberField(result.output, 'ledgerRevision')
    if (name === 'project_status' && result.status === 'ok') {
      this.read = Math.max(this.read, ledger ?? this.read)
      for (const r of this.own) if (r <= this.read) this.own.delete(r)
      this.changed = false
      return { ...result, output: { ...result.output, connection: { restoredWithoutHistory: this.restored } } }
    }
    // A write's receipt: the revision it made is the model's own, and says nothing about anyone else's.
    if (ledger !== null && (result.status === 'committed' || result.status === 'proposed')) this.own.add(ledger)
    this.refresh()
    return this.changed ? { ...result, output: { ...result.output, recordsChanged: RECORDS_CHANGED } } : result
  }
}
