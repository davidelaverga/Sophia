// Sends the bridge's voice qualification receipts to the API (POST /v1/media/evidence, A15), off the audio path: send()
// only queues, and one write is in flight at a time, in sequence order. A receipt takes the exchange's next sequence
// number when it is queued. A lost answer or a 5xx is sent again, with the same number and the same body (the API keeps
// a receipt once per number and answers a repeat as the first), a bounded number of times; then the receipt is dropped
// and counted. A refusal (4xx) is not sent again: the same body would be refused again. Each drop is logged with its
// number and kind, never its body. An answer that says the API's guard ended the exchange is passed on once.
import type { MediaEvidenceAck, MediaEvidenceWrite } from '@sophia/contracts'
import type { Receipt } from './qualification-recorder.ts'
import { type MediaService, ServiceError } from './service.ts'

/** Waits before a receipt whose answer was lost is sent again. */
export const EVIDENCE_RETRY_MS = [500, 2000, 5000]
/** A15's sequence numbers run 1–99,999 per exchange; past them nothing more is sent. */
export const MAX_SEQ = 99_999
/** Receipts waiting to be sent, at most: an API that does not answer cannot grow the queue without bound. */
const QUEUE_LIMIT = 1000

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface SenderDeps {
  exchangeId: string
  grantId: string
  record: MediaService['recordEvidence']
  /** The exchange's next sequence number (shared by every session of the exchange in this process). */
  nextSeq: () => number
  retryMs: readonly number[]
  /** The API's guard ended the exchange: called once. */
  ended: (reason: MediaEvidenceAck['reason']) => void
  log: (event: string, detail?: Record<string, unknown>) => void
}

export class EvidenceSender {
  readonly #deps: SenderDeps
  readonly #queue: MediaEvidenceWrite[] = []
  #pumping: Promise<void> | null = null
  #ended = false
  #abandoned = false
  /** Receipts the API took, and receipts dropped (refused, unanswered, abandoned, or never queued). */
  sent = 0
  dropped = 0

  constructor(deps: SenderDeps) {
    this.#deps = deps
  }

  /** Queue a receipt; never waits. */
  send(receipt: Receipt): void {
    const seq = this.#deps.nextSeq()
    if (this.#abandoned || seq > MAX_SEQ || this.#queue.length >= QUEUE_LIMIT)
      return this.#drop(seq, receipt.kind, 'not_queued')
    this.#queue.push({ exchangeId: this.#deps.exchangeId, grantId: this.#deps.grantId, seq, receipt })
    this.#pumping ??= this.#pump()
  }

  /** Resolves once everything queued so far was sent or dropped, or after `ms`, whichever comes first. */
  async flush(ms: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const waited = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms)
    })
    await Promise.race([this.#pumping ?? Promise.resolve(), waited])
    clearTimeout(timer)
  }

  /**
   * The session closed and its wait is over: what is still queued is dropped and counted, and a write in flight is not
   * sent again, so nothing outlives the session but the answer to that one write.
   */
  abandon(): void {
    this.#abandoned = true
    for (let write = this.#queue.shift(); write; write = this.#queue.shift())
      this.#drop(write.seq, write.receipt.kind, 'abandoned')
  }

  /** One write at a time, oldest first. The pump stops in the same step that finds the queue empty. */
  async #pump(): Promise<void> {
    for (let write = this.#queue.shift(); write; write = this.#queue.shift()) await this.#deliver(write)
    this.#pumping = null
  }

  /** The same write (same number, same body) until it is answered, refused, or its attempts run out. */
  async #deliver(write: MediaEvidenceWrite): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      const ack = await this.#deps.record(write).catch((err: unknown) => this.#unanswered(write, attempt, err))
      if (ack === 'again') continue
      if (ack === null) return
      this.sent += 1
      return this.#acked(ack)
    }
  }

  /** A write the API did not take: sent again after its wait, or dropped (refused, its attempts spent, or closed). */
  async #unanswered(write: MediaEvidenceWrite, attempt: number, err: unknown): Promise<'again' | null> {
    const refused = err instanceof ServiceError && err.status < 500
    const wait = this.#deps.retryMs[attempt]
    if (!refused && wait !== undefined && !this.#isAbandoned()) {
      await sleep(wait)
      if (!this.#isAbandoned()) return 'again'
    }
    const why = refused ? 'refused' : this.#isAbandoned() ? 'abandoned' : 'unanswered'
    this.#drop(write.seq, write.receipt.kind, why, err)
    return null
  }

  /** Read anew after every wait: the session may have closed meanwhile. */
  #isAbandoned(): boolean {
    return this.#abandoned
  }

  #acked(ack: MediaEvidenceAck): void {
    if (!ack.ended || this.#ended) return
    this.#ended = true
    this.#deps.ended(ack.reason)
  }

  #drop(seq: number, kind: Receipt['kind'], why: string, err?: unknown): void {
    this.dropped += 1
    const error = err === undefined ? {} : { error: message(err) }
    const { exchangeId } = this.#deps
    this.#deps.log('evidence.dropped', { exchangeId, seq, kind, why, dropped: this.dropped, ...error })
  }
}
