// The bridge's own spend bound for an exchange under a voice qualification grant (sophia.voice-qualification.v1, its
// guard; docs/plans/voice-qualification-g7.md). The API ends such an exchange once the usage the bridge reports reaches
// the grant's budget, but that alone bounds nothing in time:
// - Gemini Live reports usage now and then, never ahead, and every generation bills the whole context again;
// - transcription is billed as output text, which the reported total may not include;
// - a reconnection opens another provider session, whose first generation bills the resumed context again;
// - a generation can start without the bridge asking: the provider's own turn detection while input flows, a tool
//   response's continuation (WHEN_IDLE), a second tool round, a notice; and two can overlap;
// - the project's spend cap acts minutes late.
// So before anything that can start a generation, the bridge asks whether the worst case of one more still fits under
// the budget: what was reported, what it has itself sent and received since, every transcription, and a full reserve
// for each generation still open. A generation that starts unasked takes its reserve as it starts. When nothing more
// fits, the bridge sends nothing more and closes the provider. A generation's output is reserved at the grant's per-turn
// cap; the provider is configured with that cap too, but nothing here relies on it being honoured: what the bridge
// receives is counted, and a generation past the cap is cut. The rates are assumptions, refreshed at batch time; a rate
// too high only ends an exchange earlier.

/** The grant's limits the bridge enforces itself (the API's guard enforces them again, from what is reported). */
export interface ReserveLimits {
  /** Provider tokens for the whole exchange, every connection and generation together. */
  usageTokens: number
  /** One generation's output: its audio and its transcription each reserved at this. */
  outputTokensPerTurn: number
  /** Provider generations, whatever started them. */
  turns: number
  /** Provider connections, the first included. */
  connections: number
}

/** Tokens per unit, as billed: assumptions to refresh at batch time, never measured here. */
export interface TokenRates {
  audioInPerSecond: number
  audioOutPerSecond: number
  perFrame: number
  charsPerToken: number
  /** The most context one generation bills again: the session's compression trigger (live-session.ts). */
  context: number
}

export const ASSUMED_RATES: TokenRates = {
  audioInPerSecond: 32,
  audioOutPerSecond: 32,
  perFrame: 258,
  charsPerToken: 3,
  context: 25_000,
}

const INPUT_RATE = 16_000
const OUTPUT_RATE = 24_000

/** Why the bridge stops: the budget would be passed, the generations or connections are spent, or a turn ran over. */
export type Stop = 'usage' | 'turns' | 'connections' | 'output'

export type Verdict = { ok: true } | { ok: false; stop: Stop }

interface Open {
  connection: number
  reserved: number
  /** Audio received, in tokens. */
  output: number
  /**
   * Output text received, in tokens: Sophia's transcribed words and the function calls' payload (names and arguments),
   * both billed output text. Never the holder's words: those are input's transcription, not this generation's output.
   */
  text: number
  /** Of that text, what the session owed from the connection's allowance: every chunk this generation took. */
  owed: number
}

export class QualificationReserve {
  readonly #limits: ReserveLimits
  readonly #rates: TokenRates
  /** Each connection's highest reported total (cumulative within its provider session). */
  readonly #reported = new Map<number, number>()
  /** Each connection's generations that ended since its last report, at their reserve. */
  readonly #unreported = new Map<number, number>()
  readonly #connections = new Set<number>()
  #open: Open[] = []
  #input = 0
  #transcribed = 0
  #generations = 0
  #stopped: Stop | null = null
  #unpaid = 0

  constructor(limits: ReserveLimits, rates: TokenRates = ASSUMED_RATES) {
    this.#limits = limits
    this.#rates = rates
  }

  /** Why the bridge stopped, or null while it may go on. Once stopped, it stays stopped. */
  get stopped(): Stop | null {
    return this.#stopped
  }

  /**
   * What the last output received() was given left unpaid, when it stopped (Codex r4234649836): the tokens its
   * generation billed beyond its reserve (its output twice the per-turn cap: audio and text) and beyond what the session
   * already owed for it from the connection's allowance. Zero when the output was taken: the session owes its text in
   * full, as before.
   */
  get unpaid(): number {
    return this.#unpaid
  }

  /** Every token the exchange may have cost or may still cost for what is under way. */
  get committed(): number {
    let sum = this.#input + this.#transcribed
    for (const total of this.#reported.values()) sum += total
    for (const estimate of this.#unreported.values()) sum += estimate
    for (const open of this.#open) sum += Math.max(open.reserved, this.#generationCost(open.output))
    return sum
  }

  /** A provider connection opens (a reconnection or resumption included). */
  connected(connection: number): Verdict {
    this.#connections.add(connection)
    if (this.#connections.size > this.#limits.connections) return this.#stop('connections')
    return this.#fits(0)
  }

  /** The provider's usage report: the total of its session on this connection, so far. */
  reported(connection: number, total: number): void {
    this.#reported.set(connection, Math.max(this.#reported.get(connection) ?? 0, total))
    // What ended before the report is in it; what is still open keeps its reserve.
    this.#unreported.delete(connection)
  }

  /** Input sent: 16 kHz samples, a video frame, or text (a notice, a typed message, a tool response). */
  sentAudio(samples: number): Verdict {
    this.#input += (samples / INPUT_RATE) * this.#rates.audioInPerSecond
    return this.#fits(0)
  }

  sentFrame(): Verdict {
    this.#input += this.#rates.perFrame
    return this.#fits(0)
  }

  sentText(chars: number): Verdict {
    this.#input += Math.ceil(chars / this.#rates.charsPerToken)
    return this.#fits(0)
  }

  /** A transcription arrived (the holder's words or Sophia's): billed as output text, never assumed reported. */
  transcribed(chars: number): Verdict {
    this.#transcribed += Math.ceil(chars / this.#rates.charsPerToken)
    return this.#fits(0)
  }

  /**
   * Before anything that can start a generation: opening input after a turn ended, a tool response, a notice, a typed
   * message. Fitting, the generation's reserve is taken now; not fitting, nothing may be sent.
   */
  reserve(connection: number): Verdict {
    if (this.#stopped) return { ok: false, stop: this.#stopped }
    if (this.#generations >= this.#limits.turns) return this.#stop('turns')
    const reserve = this.#reserveFor()
    const fits = this.#fits(reserve)
    if (!fits.ok) return fits
    this.#take(connection, reserve)
    return fits
  }

  /**
   * Output arrived on a connection: audio (24 kHz samples) and output text (`text`, in tokens: Sophia's transcribed
   * words, or a function call's name and arguments). A generation nobody reserved takes its reserve now; one whose
   * audio, or whose text, passes the per-turn cap is cut (its reserve holds each at the cap). The text adds nothing more
   * to what is committed: the reserve holds it, and Sophia's words are counted once, as transcribed().
   */
  received(connection: number, samples = 0, text = 0): Verdict {
    this.#unpaid = 0
    if (this.#stopped) return { ok: false, stop: this.#stopped }
    const audio = (samples / OUTPUT_RATE) * this.#rates.audioOutPerSecond
    const reserved = 2 * this.#limits.outputTokensPerTurn
    let open = this.#open.find((o) => o.connection === connection)
    if (!open) {
      // Its generation is charged (unasked) at its worst case: what this output bills beyond that is unpaid.
      const beyond = Math.max(0, audio + text - reserved)
      if (this.#generations >= this.#limits.turns) {
        this.#unpaid = beyond
        return this.#stop('turns')
      }
      const reserve = this.#reserveFor()
      const fits = this.#fits(reserve)
      open = this.#take(connection, reserve)
      if (!fits.ok) {
        this.#unpaid = beyond
        return fits
      }
    }
    open.output += audio
    open.text += text
    const cap = this.#limits.outputTokensPerTurn
    if (open.output > cap || open.text > cap) {
      this.#unpaid = Math.max(0, open.output + open.text - reserved - open.owed)
      return this.#stop('output')
    }
    open.owed += text
    return this.#fits(0)
  }

  /**
   * The provider's turn on this connection ended, completed or interrupted: the one generation that ended is retired,
   * the oldest still open there, the one received() counts output against. Generations reserved after it on the same
   * connection stay open for their own turn ends (Codex r4233559261: two tool responses reserved before either
   * continuation ended; retiring both at the first end made the second continuation look unasked, one generation too
   * many). A lost connection (`lost`) retires every generation open on it. What is retired stays counted at its cost
   * until a report covers it.
   */
  ended(connection: number, lost = false): void {
    const open = this.#open.filter((o) => o.connection === connection)
    const ending = lost ? open : open.slice(0, 1)
    this.#open = this.#open.filter((o) => !ending.includes(o))
    const cost = ending.reduce((sum, o) => sum + Math.max(o.reserved, this.#generationCost(o.output)), 0)
    if (cost > 0) this.#unreported.set(connection, (this.#unreported.get(connection) ?? 0) + cost)
  }

  /** One generation's worst case: the whole context again, the input since, and its output twice (audio, text). */
  #reserveFor(): number {
    return this.#rates.context + 2 * this.#limits.outputTokensPerTurn
  }

  #generationCost(output: number): number {
    return this.#rates.context + 2 * output
  }

  #take(connection: number, reserved: number): Open {
    this.#generations += 1
    // The input so far is now part of the context this generation bills.
    const open = { connection, reserved: reserved + this.#input, output: 0, text: 0, owed: 0 }
    this.#input = 0
    this.#open.push(open)
    return open
  }

  #fits(more: number): Verdict {
    if (this.#stopped) return { ok: false, stop: this.#stopped }
    return this.committed + more > this.#limits.usageTokens ? this.#stop('usage') : { ok: true }
  }

  #stop(stop: Stop): Verdict {
    this.#stopped ??= stop
    return { ok: false, stop: this.#stopped }
  }
}
