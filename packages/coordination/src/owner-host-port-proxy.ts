/**
 * The SophiaRunnerPort on Sophia's side of the owner-host channel (INC01-CC-003 S1a, 0093;
 * docs/plans/owner-host-transport.md): the worker's dispatcher calls it exactly as it calls a gateway, and it turns
 * each call into one durable exchange for the owner's host, then waits, bounded, for its outcome.
 *
 * Its answers are honest about what the channel proves (the plan's "Proxy outcome for a send"):
 *   answered                                  the host's answer, checked; an identity not derived under the host's
 *                                             bound namespace is unknown, and so is a receipt that does not prove
 *                                             what its operation needs (an input names a valid run: checkReceipt)
 *   never granted GO (denied, cancelled, no
 *   host, or the deadline passed without GO)  refused: the host may call its gateway only after a GO granted in the
 *                                             same database, so nothing was sent
 *   granted GO, no answer by the deadline     unknown: a send may have happened; reconciled by the original identity
 *   another payload under the key             conflict
 * An observation is checked for its own operation (r5, checkObservation): a stop's settlement needs the complete
 * exact-thread proof, a create's or input's its own run's known status; anything else is unknown.
 * A possible send that was granted GO is never turned into refused or rejected, never re-sent and never given a fresh
 * key. Reconcile and observe are reads: with no host or no answer they are unknown, never refused.
 * @module @sophia/coordination/owner-host-port-proxy
 */
import { randomUUID } from 'node:crypto'
import {
  checkObservation,
  checkReceipt,
  checkRunnerAnswer,
  EXCHANGE_DEADLINE_MAX_MS,
  EXCHANGE_DEADLINE_MIN_MS,
  exchangeRequest,
  readKey,
  redact,
  sendKey,
  type ExchangeKind,
  type ExchangeStore,
  type ExchangeView,
} from './owner-host-channel.ts'
import {
  digestOf,
  type RunnerAnswer,
  type RunnerEnvelope,
  type RunnerIdentity,
  type RunObservation,
  type SophiaRunnerPort,
} from './runner-port.ts'
import { deriveIdentity } from './t3-port-mapping.ts'

export interface OwnerHostProxyOptions {
  readonly store: ExchangeStore
  /** The owner runner served: its owner and native environment. */
  readonly ownerId: string
  readonly environmentRef: string
  /** The bound host journal this proxy speaks for (0093 owner_hosts.journal_id). */
  readonly journalId: string
  /** That host's bound T3 namespace: a received identity must be derived under it. */
  readonly namespace: string
  /** How long a host has to act on an exchange. */
  readonly deadlineMs?: number
  /** How often the exchange's state is read while waiting. */
  readonly pollMs?: number
  readonly sleep?: (ms: number) => Promise<void>
  readonly log?: (line: string) => void
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
const TERMINAL = new Set(['answered', 'denied', 'lapsed', 'cancelled'])

export class OwnerHostPortProxy implements SophiaRunnerPort {
  private readonly o: OwnerHostProxyOptions
  private readonly deadlineMs: number
  private readonly pollMs: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: OwnerHostProxyOptions) {
    const deadlineMs = options.deadlineMs ?? 30_000
    if (
      !Number.isSafeInteger(deadlineMs) ||
      deadlineMs < EXCHANGE_DEADLINE_MIN_MS ||
      deadlineMs > EXCHANGE_DEADLINE_MAX_MS
    )
      throw new Error('the exchange deadline is out of bounds')
    this.o = options
    this.deadlineMs = deadlineMs
    this.pollMs = Math.max(10, options.pollMs ?? 250)
    this.sleep = options.sleep ?? wait
  }

  get journalId(): string {
    return this.o.journalId
  }

  private enqueue(kind: ExchangeKind, key: string, envelope: RunnerEnvelope) {
    return this.o.store.enqueue({
      ownerId: this.o.ownerId,
      environmentRef: this.o.environmentRef,
      journalId: this.o.journalId,
      key,
      request: exchangeRequest(kind, envelope, this.o.journalId),
      deadlineMs: this.deadlineMs,
    })
  }

  /** Read the exchange until it ends or its deadline passes. A little past the deadline the waiting ends regardless. */
  private async await(exchangeId: string): Promise<ExchangeView | null> {
    const until = Date.now() + this.deadlineMs + 2 * this.pollMs + 1000
    for (;;) {
      const view = await this.o.store.exchange(this.o.ownerId, exchangeId)
      if (!view || TERMINAL.has(view.state) || view.deadlinePassed || Date.now() >= until) return view
      await this.sleep(this.pollMs)
    }
  }

  async send(envelope: RunnerEnvelope, digest: string, journalId: string): Promise<RunnerAnswer> {
    if (journalId !== this.o.journalId) return { kind: 'unknown', identity: null, reason: 'bound to another journal' }
    // Nothing is queued for a digest that does not bind its envelope, so nothing can be sent for it.
    if (digestOf(envelope) !== digest) return { kind: 'refused', reason: 'the digest does not bind the envelope' }
    const queued = await this.enqueue('send', sendKey(envelope.operationId), envelope)
    if (queued.result === 'no_host') {
      // Nothing was created: no host could have been granted GO for it.
      return { kind: 'refused', reason: 'no owner host bound to this journal may take new work now' }
    }
    if (queued.result === 'conflict')
      return { kind: 'conflict', reason: 'this operation was queued with another payload' }
    const view = await this.await(queued.exchangeId)
    if (view?.state === 'answered') return this.sendAnswer(envelope, view.answer)
    // Not answered: the database decides, under its lock, what the GO ledger proves.
    const settled = await this.o.store.settle(this.o.ownerId, queued.exchangeId)
    if (settled.result === 'answered') return this.sendAnswer(envelope, settled.answer)
    if (settled.result === 'possible') return { kind: 'unknown', identity: null, reason: settled.reason }
    return { kind: 'refused', reason: `the owner host was never granted GO: ${settled.reason}`.slice(0, 500) }
  }

  /** The host's answer for a send, checked against the identity it must carry under the host's bound namespace. */
  private sendAnswer(envelope: RunnerEnvelope, raw: unknown): RunnerAnswer {
    const answer = checkRunnerAnswer(raw)
    if (!answer) return { kind: 'unknown', identity: null, reason: 'the owner host answered malformed' }
    return checkReceipt(envelope, this.withBoundIdentity(envelope, answer))
  }

  /**
   * An identity must be the one the gateway derives under the host's bound namespace (t3-port-mapping deriveIdentity);
   * anything else is no receipt, it stays unknown for reconciliation by the original identity.
   */
  private withBoundIdentity(envelope: RunnerEnvelope, answer: RunnerAnswer): RunnerAnswer {
    if (!('identity' in answer) || answer.identity === null) return answer
    const expected = deriveIdentity(envelope, this.o.namespace)
    const got = answer.identity
    const same =
      got.namespace === expected.namespace &&
      got.commandId === expected.commandId &&
      got.messageId === expected.messageId &&
      got.threadId === expected.threadId
    if (same) return answer
    this.o.log?.(`owner host exchange: ${envelope.operationId}: an identity not derived under the bound namespace`)
    return { kind: 'unknown', identity: null, reason: 'the owner host answered with identities of another namespace' }
  }

  private async read(kind: 'reconcile' | 'observe', identity: RunnerIdentity): Promise<unknown> {
    if (identity.journalId !== this.o.journalId) return null
    const queued = await this.enqueue(
      kind,
      readKey(kind, identity.envelope.operationId, randomUUID()),
      identity.envelope,
    )
    if (queued.result !== 'queued' && queued.result !== 'existing') return null
    const view = await this.await(queued.exchangeId)
    return view?.state === 'answered' ? view.answer : null
  }

  async reconcile(identity: RunnerIdentity): Promise<RunnerAnswer> {
    let raw: unknown
    try {
      raw = await this.read('reconcile', identity)
    } catch (err) {
      return { kind: 'unknown', identity: null, reason: `the owner host was not reached: ${redact(String(err))}` }
    }
    if (raw === null) return { kind: 'unknown', identity: null, reason: 'no answer from an owner host of this journal' }
    const answer = checkRunnerAnswer(raw)
    if (!answer) return { kind: 'unknown', identity: null, reason: 'the owner host answered malformed' }
    return checkReceipt(identity.envelope, this.withBoundIdentity(identity.envelope, answer))
  }

  async observe(identity: RunnerIdentity): Promise<RunObservation> {
    let raw: unknown
    try {
      raw = await this.read('observe', identity)
    } catch (err) {
      return { kind: 'unknown', reason: `the owner host was not reached: ${redact(String(err))}` }
    }
    if (raw === null) return { kind: 'unknown', reason: 'no answer from an owner host of this journal' }
    // Checked for ITS operation (r5): a stop settles only from the complete exact-thread proof; a create or input only
    // from its own run's known status. Anything else stays unknown; the raw answer is kept in the exchange row.
    const kind = identity.envelope.kind
    const checked = checkObservation(raw, kind)
    if (checked) return checked
    this.o.log?.(`owner host exchange: ${identity.envelope.operationId}: an observation that does not prove a ${kind}`)
    return {
      kind: 'unknown',
      reason: `the owner host answered an observation that does not prove ${kind === 'input' ? 'an input' : `a ${kind}`}'s state`,
    }
  }
}
