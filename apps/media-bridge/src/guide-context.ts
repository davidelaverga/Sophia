// What the bridge tracks for the M01 guide in one exchange (SMC-M01 binding §4.3, §5, §6). Pure: the room session
// feeds it and acts on its answers.
//  - Utterances: the holder utterances forwarded in the current provider session. A tool call carries the count, so
//    the database can bind a decision to an answer given after the proposal was put. A cold start begins again at 0.
//  - Freshness: the ledger revision the model last saw (its project_status read, its own write receipts). When the
//    assignment shows a newer one and no write of this session is in flight, the next tool result says the records
//    changed, so the model reads them again. Nothing is spoken unprompted.
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
  /** The newest ledger revision the model has seen: its status read or its own write receipts. */
  private known: number
  /** The newest ledger revision the assignments have shown. */
  private latest: number
  private eligibility: number
  private writes = 0
  private changed = false
  private restored = false

  constructor(start: Revisions) {
    this.known = start.ledgerRevision
    this.latest = start.ledgerRevision
    this.eligibility = start.eligibilityRevision
  }

  /** Newer records the model has not seen, and no write of its own in flight that could explain them. */
  private refresh(): void {
    if (this.writes === 0 && this.latest > this.known) this.changed = true
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
    if (ledger !== null) this.known = Math.max(this.known, ledger)
    this.refresh()
    if (name === 'project_status' && result.status === 'ok') {
      this.changed = false
      return { ...result, output: { ...result.output, connection: { restoredWithoutHistory: this.restored } } }
    }
    return this.changed ? { ...result, output: { ...result.output, recordsChanged: RECORDS_CHANGED } } : result
  }
}
