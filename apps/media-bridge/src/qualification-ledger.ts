// The exchange's durable bound under a voice qualification grant, held by the API (POST
// /v1/media/qualification-reserve; migration 0046, media_voice_reserve), never by a bridge session: a session that
// replaces a lost one, or a restarted bridge, reserves against the exchange's true counts. Before the bridge opens a
// provider connection it reserves one, and gets the connection's durable ordinal, which its receipts name; before it
// sends what can start a generation it reserves the generation, charged at its worst case; a generation that started
// unasked is charged as its output arrives. A reservation that does not fit ends the exchange on the API.
//
// Fails closed: an answer refused (4xx) or still missing after a bounded number of attempts, each with its own time
// limit, is a refusal ('unconfirmed'), and the session stops. A lost answer is asked again, which may count the same
// reservation twice: the bound only ends an exchange earlier for it.
import type { MediaQualificationReserve, MediaQualificationReservation } from '@sophia/contracts'
import { type MediaService, ServiceError } from './service.ts'

/** Waits before a reservation whose answer was lost is asked again. */
export const RESERVE_RETRY_MS = [250, 1000]
/** How long one attempt may wait for its answer. */
export const RESERVE_TIMEOUT_MS = 3000

/** Why the API refused: a guard reason, or no answer that could be trusted. */
export type LedgerStop = NonNullable<MediaQualificationReservation['stop']> | 'unconfirmed'
export type LedgerAnswer = { ok: true; ordinal: number | null } | { ok: false; stop: LedgerStop }

export interface LedgerDeps {
  exchangeId: string
  grantId: string
  reserve: MediaService['reserveQualification']
  retryMs: readonly number[]
  timeoutMs: number
  log: (event: string, detail?: Record<string, unknown>) => void
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class QualificationLedger {
  readonly #deps: LedgerDeps

  constructor(deps: LedgerDeps) {
    this.#deps = deps
  }

  /** A provider connection, before it opens: its durable ordinal, or why not. */
  async connection(): Promise<LedgerAnswer> {
    const answer = await this.#reserve({ kind: 'connection' })
    return answer.ok && answer.ordinal === null ? { ok: false, stop: 'unconfirmed' } : answer
  }

  /** A generation on a reserved connection: before it is asked for, or (unasked) once its output arrived. */
  generation(ordinal: number, charge: number, unasked = false): Promise<LedgerAnswer> {
    return this.#reserve({ kind: unasked ? 'unasked' : 'generation', ordinal, charge })
  }

  /**
   * The bridge stopped the session itself (its bound or the deadline): the API ends the exchange, whoever holds the
   * floor and whatever was recorded. Asked again while its answer is lost; an exchange already ended answers it too.
   */
  async stop(): Promise<boolean> {
    return (await this.#reserve({ kind: 'stop' })).ok
  }

  async #reserve(request: Omit<MediaQualificationReserve, 'exchangeId' | 'grantId'>): Promise<LedgerAnswer> {
    const { exchangeId, grantId, retryMs, timeoutMs } = this.#deps
    for (let attempt = 0; ; attempt += 1) {
      try {
        const answer = await this.#deps.reserve({ exchangeId, grantId, ...request }, AbortSignal.timeout(timeoutMs))
        return answer.ok ? { ok: true, ordinal: answer.ordinal } : { ok: false, stop: answer.stop ?? 'unconfirmed' }
      } catch (err: unknown) {
        const refused = err instanceof ServiceError && err.status < 500
        const wait = retryMs[attempt]
        this.#deps.log('qualification.reserve_failed', { exchangeId, kind: request.kind, attempt, error: message(err) })
        if (refused || wait === undefined) return { ok: false, stop: 'unconfirmed' }
        await sleep(wait)
      }
    }
  }
}
