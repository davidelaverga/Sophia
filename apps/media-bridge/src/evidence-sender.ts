// Sends the bridge's voice qualification receipts to the API (POST /v1/media/evidence-writes, A15), off the audio path:
// send() only queues, and one write is in flight at a time, in the order queued. The service numbers each receipt
// (0051; Codex P1 r4232908444): a write carries the bridge's own identity for it (writeId, a random UUID given when it is
// queued), never a number, and the answer says the number it was given. Each attempt has EVIDENCE_ATTEMPT_MS to be
// answered, its body read included; past it the request is cancelled (Codex P2 r4235355799). A lost or late answer, or a
// 5xx, is sent again with the same identity and the same body (the service answers a repeat with its own number), a
// bounded number of times; then the receipt is dropped and counted, and the next goes. A refusal (4xx) is not sent
// again: the same body would be refused again. Each drop is logged with its identity and kind, never its body. An
// answer that says the API's guard ended the exchange is passed on once.
import { randomUUID } from 'node:crypto'
import type { MediaEvidenceAck, MediaEvidenceWrite } from '@sophia/contracts'
import type { Receipt } from './qualification-recorder.ts'
import { type MediaService, ServiceError } from './service.ts'

/** Waits before a receipt whose answer was lost is sent again. */
export const EVIDENCE_RETRY_MS = [500, 2000, 5000]
/**
 * How long one attempt may take to be answered, its body read included (Codex P2 r4235355799): the reservation's own
 * attempt bound (qualification-ledger RESERVE_TIMEOUT_MS). A receipt is so given up within 4 x 3 s + 0.5 + 2 + 5 s =
 * 19.5 s, and the next one goes; a session's close waits for its receipts at most CLOSE_FLUSH_MS (3 s), then abandons
 * the rest, so the bound never holds a close past it.
 */
export const EVIDENCE_ATTEMPT_MS = 3000
/** Receipts waiting to be sent, at most: an API that does not answer cannot grow the queue without bound. */
const QUEUE_LIMIT = 1000

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface SenderDeps {
  exchangeId: string
  grantId: string
  record: MediaService['recordEvidence']
  retryMs: readonly number[]
  /** One attempt's bound (EVIDENCE_ATTEMPT_MS unless a test says otherwise). */
  attemptMs?: number
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
  /** The numbers the service gave the receipts it took, in the order answered. */
  readonly numbers: number[] = []

  constructor(deps: SenderDeps) {
    this.#deps = deps
  }

  /** Queue a receipt, with its identity; never waits. */
  send(receipt: Receipt): void {
    const writeId = randomUUID()
    if (this.#abandoned || this.#queue.length >= QUEUE_LIMIT) return this.#drop(writeId, receipt.kind, 'not_queued')
    this.#queue.push({ exchangeId: this.#deps.exchangeId, grantId: this.#deps.grantId, writeId, receipt })
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
      this.#drop(write.writeId, write.receipt.kind, 'abandoned')
  }

  /** One write at a time, oldest first. The pump stops in the same step that finds the queue empty. */
  async #pump(): Promise<void> {
    for (let write = this.#queue.shift(); write; write = this.#queue.shift()) await this.#deliver(write)
    this.#pumping = null
  }

  /** The same write (same identity, same body) until it is answered, refused, or its attempts run out. */
  async #deliver(write: MediaEvidenceWrite): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      const ack = await this.#attempt(write).catch((err: unknown) => this.#unanswered(write, attempt, err))
      if (ack === 'again') continue
      if (ack === null) return
      this.sent += 1
      this.numbers.push(ack.seq)
      return this.#acked(ack)
    }
  }

  /**
   * One attempt, answered within its bound or given up: its signal cancels the request (its socket closed), and the
   * attempt fails then whether or not the service honours the signal. Its timer is cleared either way.
   */
  async #attempt(write: MediaEvidenceWrite): Promise<MediaEvidenceAck> {
    const ms = this.#deps.attemptMs ?? EVIDENCE_ATTEMPT_MS
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const why = new Error(`no answer within ${String(ms)} ms`)
        controller.abort(why)
        reject(why)
      }, ms)
      // The bound never keeps a process alive by itself: the request's own socket does while it is open.
      timer.unref()
    })
    try {
      return await Promise.race([this.#deps.record(write, controller.signal), late])
    } finally {
      clearTimeout(timer)
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
    this.#drop(write.writeId, write.receipt.kind, why, err)
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

  /** A receipt dropped, logged by its write identity: any number the service gave it never reached the bridge. */
  #drop(writeId: string, kind: Receipt['kind'], why: string, err?: unknown): void {
    this.dropped += 1
    const error = err === undefined ? {} : { error: message(err) }
    const { exchangeId } = this.#deps
    this.#deps.log('evidence.dropped', { exchangeId, writeId, kind, why, dropped: this.dropped, ...error })
  }
}
