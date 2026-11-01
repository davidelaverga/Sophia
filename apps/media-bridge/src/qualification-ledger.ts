// The exchange's durable bound under a voice qualification grant, held by the API (POST
// /v1/media/qualification-reserve; migration 0085, media_voice_reserve), never by a bridge session: a session that
// replaces a lost one, or a restarted bridge, reserves against the exchange's true counts. Before the bridge opens a
// provider connection it reserves one, and gets the connection's durable ordinal, which its receipts name; before it
// sends what can start a generation it reserves the generation, charged at its worst case; a generation that started
// unasked is charged as its output arrives; before it sends input its allowance does not cover, it tops the allowance
// up (spend). A reservation that does not fit ends the exchange on the API.
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
/** Refused, with what of the charge the API kept nonetheless (R2-G7-INTERIM-F1): 0 when it kept nothing, or no answer came. */
export type LedgerAnswer = { ok: true; ordinal: number | null } | { ok: false; stop: LedgerStop; kept: number }

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
    return answer.ok && answer.ordinal === null ? { ok: false, stop: 'unconfirmed', kept: 0 } : answer
  }

  /**
   * A generation on a reserved connection: before it is asked for, or (unasked) once its output arrived. `owed` of a
   * reserved one's charge is a debt already spent, kept even if it is refused (an unasked one's whole charge is).
   */
  generation(ordinal: number, charge: number, unasked = false, owed = 0): Promise<LedgerAnswer> {
    if (unasked) return this.#reserve({ kind: 'unasked', ordinal, charge })
    return this.#reserve({ kind: 'generation', ordinal, charge, ...(owed > 0 ? { owed } : {}) })
  }

  /**
   * A top-up of a reserved connection's input allowance, before what it pays for is sent: a charge only, counting no
   * generation. Refused as a generation would be when, charged, the exchange's next turn could reach the budget; `owed`
   * of it, a debt already spent, is kept all the same.
   */
  spend(ordinal: number, charge: number, owed = 0): Promise<LedgerAnswer> {
    return this.#reserve({ kind: 'spend', ordinal, charge, ...(owed > 0 ? { owed } : {}) })
  }

  /**
   * Every charge for what this bridge spent on a connection landed (0085's 'settle'): until it says so, a connection the
   * exchange asks for next ends it (unsettled). `stopped`: the session's bound stopped it, so the settlement ends the
   * exchange too, in the same transaction (R2-G7-42CD-P1). The API's answer.
   */
  settle(ordinal: number, stopped = false): Promise<LedgerAnswer> {
    return this.#reserve({ kind: 'settle', ordinal, ...(stopped ? { stopped } : {}) })
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
        if (answer.ok) return { ok: true, ordinal: answer.ordinal }
        return { ok: false, stop: answer.stop ?? 'unconfirmed', kept: answer.kept ?? 0 }
      } catch (err: unknown) {
        const refused = err instanceof ServiceError && err.status < 500
        const wait = retryMs[attempt]
        this.#deps.log('qualification.reserve_failed', { exchangeId, kind: request.kind, attempt, error: message(err) })
        if (refused || wait === undefined) return { ok: false, stop: 'unconfirmed', kept: 0 }
        await sleep(wait)
      }
    }
  }
}
