/**
 * The owner-host agent (INC01-CC-003 S1a; docs/plans/owner-host-transport.md "Owner-host agent"): a bounded consumer of
 * the owner-host channel on the owner's own machine. hello, poll, GO, gateway, answer, sleep. It is not a scheduler,
 * an agent loop or a continuation owner: it never chooses work, writes model input, starts a child mission, retries a
 * provider, answers a permission, or holds, resumes or steers anything. Paperclip stays the continuation owner.
 *
 * A send reaches the gateway only after a GO granted by Sophia immediately before it (`authority`: fail closed). GO
 * denied: if an earlier GO was granted (a crash after it), the answer is the gateway's reconcile, from its journal or a
 * read-back, never a new send; otherwise `refused`, since the gateway never saw it. Reconcile and observe go straight to
 * the gateway: they are reads that start no turn. After a restart it reopens the SAME journal file (its lock keeps a
 * second writer out), and a redelivered send is answered from that journal.
 *
 * A v2 send (0096) reaches the gateway with the payload its GO carried, and with nothing else: the agent never reads,
 * keeps or logs an instruction, and a GO without one leaves the gateway to refuse the send before journaling it.
 * @module @sophia/coordination/owner-host-agent
 */
import {
  checkExchangeRequest,
  helloRefusal,
  redact,
  type Delivered,
  type HostChannel,
  type HostHello,
} from './owner-host-channel.ts'
import type { RunnerJournal } from './runner-journal.ts'
import type { RunnerAnswer, RunObservation, SophiaRunnerPort } from './runner-port.ts'

export interface OwnerHostAgentOptions {
  readonly channel: HostChannel
  /** The owner's gateway (RunnerGateway over this host's journal and its T3 transport). */
  readonly gateway: SophiaRunnerPort
  /** The gateway's journal, read only to know whether it holds an operation. */
  readonly journal: Pick<RunnerJournal, 'id' | 'entry'>
  readonly hello: HostHello
  readonly pollLimit?: number
  readonly redeliverSeconds?: number
  readonly idleMs?: number
  readonly log?: (line: string) => void
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** The host's last hello differed from its bound identity: it serves nothing until it pairs again as a new host. */
export class HelloConflict extends Error {
  readonly changed: readonly string[]
  constructor(changed: readonly string[]) {
    super(`the owner host's identity changed (${changed.join(', ')}): pair again as a new host`)
    this.name = 'HelloConflict'
    this.changed = changed
  }
}

export type Served = 'answered' | 'refused' | 'skipped' | 'failed'

const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
  })

export class OwnerHostAgent {
  private readonly o: OwnerHostAgentOptions
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  private greeted = false

  constructor(options: OwnerHostAgentOptions) {
    const refusal = helloRefusal(options.hello)
    if (refusal) throw new Error(`the host's hello is malformed: ${refusal}`)
    if (options.gateway.journalId !== options.journal.id || options.hello.journalId !== options.journal.id)
      throw new Error('the hello, the gateway and the journal must name one journal')
    this.o = options
    this.sleep = options.sleep ?? pause
  }

  private log(line: string) {
    this.o.log?.(redact(line, 400))
  }

  /** Say hello. A conflict throws: nothing is delivered to a host whose identity changed. */
  async greet(): Promise<void> {
    const result = await this.o.channel.hello(this.o.hello)
    if (result.result === 'conflict') throw new HelloConflict(result.changed)
    this.greeted = true
  }

  /** One poll, each delivered exchange served in order. Returns what happened to each. */
  async serveOnce(): Promise<Served[]> {
    if (!this.greeted) await this.greet()
    const delivered = await this.o.channel.poll(this.o.pollLimit ?? 5, this.o.redeliverSeconds ?? 15)
    const served: Served[] = []
    for (const exchange of delivered) served.push(await this.serve(exchange))
    return served
  }

  /** Until the signal aborts: serve, and sleep when there was nothing. A hello conflict ends the loop. */
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      let served: Served[] = []
      try {
        served = await this.serveOnce()
      } catch (err) {
        if (err instanceof HelloConflict) throw err
        this.greeted = false
        this.log(`owner host: poll failed: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (served.length === 0) await this.sleep(this.o.idleMs ?? 2000, signal)
    }
  }

  private async serve(exchange: Delivered): Promise<Served> {
    try {
      return await this.serveExchange(exchange)
    } catch (err) {
      // Left to the channel: it is redelivered, or its deadline passes and the GO ledger decides.
      this.log(`owner host: exchange ${exchange.exchangeId}: ${err instanceof Error ? err.message : String(err)}`)
      return 'failed'
    }
  }

  private async serveExchange(exchange: Delivered): Promise<Served> {
    const checked = checkExchangeRequest(exchange.request)
    const journalId = this.o.journal.id
    if (!checked.ok || checked.request.kind !== exchange.kind || checked.request.journalId !== journalId) {
      const reason = checked.ok ? 'the exchange is not for this journal' : checked.reason
      this.log(`owner host: exchange ${exchange.exchangeId}: refused: ${reason}`)
      // Never handed to the gateway. A send may be answered refused; a read is left to lapse as unknown.
      if (exchange.kind !== 'send') return 'skipped'
      await this.o.channel.answer(exchange.exchangeId, { kind: 'refused', reason: `the owner host refused: ${reason}` })
      return 'refused'
    }
    const { envelope, digest } = checked.request
    const identity = { envelope, digest, journalId }
    let answer: RunnerAnswer | RunObservation
    if (exchange.kind === 'reconcile') answer = await this.o.gateway.reconcile(identity)
    else if (exchange.kind === 'observe') answer = await this.o.gateway.observe(identity)
    else {
      const sent = await this.sendWithGo(exchange.exchangeId, identity)
      if (sent === null) return 'skipped'
      answer = sent
    }
    const stored = await this.o.channel.answer(exchange.exchangeId, answer)
    if (stored.result === 'conflict') this.log(`owner host: exchange ${exchange.exchangeId}: another answer was kept`)
    return answer.kind === 'refused' ? 'refused' : 'answered'
  }

  /** GO, then the gateway; or, GO denied, what the journal proves. null: nothing honest to answer. */
  private async sendWithGo(
    exchangeId: string,
    identity: { envelope: Parameters<SophiaRunnerPort['send']>[0]; digest: string; journalId: string },
  ): Promise<RunnerAnswer | null> {
    let go
    try {
      go = await this.o.channel.go(exchangeId)
    } catch (err) {
      // Fail closed: an unreachable GO is no GO, and nothing is sent.
      this.log(`owner host: exchange ${exchangeId}: no GO: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
    if (go.result === 'go')
      return this.o.gateway.send(identity.envelope, identity.digest, identity.journalId, go.payload)
    if (go.grantedBefore) return this.o.gateway.reconcile(identity)
    if (this.o.journal.entry(identity.envelope.operationId)) {
      // The journal holds an operation Sophia never granted: the ledgers disagree. Nothing is claimed either way.
      this.log(`owner host: exchange ${exchangeId}: the journal holds an operation with no GO recorded`)
      return null
    }
    return { kind: 'refused', reason: `no GO: ${go.reason}`.slice(0, 500) }
  }
}
