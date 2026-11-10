/**
 * The owner gateway behind the SophiaRunnerPort: the only code that calls T3 for Sophia. It is a transport consumer,
 * never an agent loop or a scheduler: it sends what Sophia admitted and rechecked, once, and answers what it knows.
 *
 * send: the operation must be bound to THIS journal (Sophia recorded its id at prepare-send) and lie within this host's
 * profile: owner, environment, adapter pin, native project, account, profile and revision, operation. An input or stop
 * must target a thread this gateway itself received from a create of the same binding, account, profile and
 * qualification. Then journal the intent and the identities derived under the current namespace, journal the possible
 * send, call once, and journal the final answer. A replay is answered from the journal: the same digest returns the
 * outcome, another digest conflicts, an uncertain one is reconciled, never sent again. An operation it holds ANY record
 * of (even an intent alone) is never sent by it again (r3).
 *
 * reconcile (r2 R1-F01, r3 R2-F01): only the journal the operation is bound to speaks for it, and it never proves that
 * nothing was sent. A journal's id names the file, not the completeness of its history: a restored valid prefix keeps
 * the id. So no record, or an intent without its possible send, is unknown, never "not sent". A possible send without
 * an answer is read back by its ORIGINAL identities in decoded reads of the exact thread; not found stays unknown.
 *
 * receipts (integrated r3, F01): a create's or input's receipt needs a valid run id, from a send reply or a read of its
 * exact message; a missing, null or malformed run keeps it unknown, and the gateway checks every receipt itself
 * (receiptError) before journaling or returning it.
 *
 * settlement (R1-F04): a Stop settles, and a run counts as ended, only on a complete, decoded read of the exact thread
 * (t3-port-mapping.ts stopSettled, runState). An acknowledgement, a malformed or foreign read, a truncated run list or
 * an unknown status is no evidence.
 * @module @sophia/coordination/runner-gateway
 */
import {
  checkEnvelope,
  digestOf,
  type NativeIdentity,
  type RunnerAnswer,
  type RunnerEnvelope,
  type RunnerIdentity,
  type RunnerOperationKind,
  type RunObservation,
  type SophiaRunnerPort,
} from './runner-port.ts'
import type { JournalEntry, RunnerJournal } from './runner-journal.ts'
import { followupTargetError } from './runner-journal-records.ts'
import {
  callFor,
  classifyReply,
  decodeThreadRead,
  deriveIdentity,
  readCall,
  runState,
  stopSettled,
  type T3Reply,
  type T3Transport,
  type ThreadRead,
} from './t3-port-mapping.ts'

/** What this owner host was qualified for. Set by the host's own configuration, never by an envelope. */
export interface GatewayProfile {
  readonly ownerId: string
  /** The T3 environment id this host's MCP session is bound to. */
  readonly environmentRef: string
  readonly adapterPin: string
  readonly nativeProjectRefs: ReadonlySet<string>
  /** The native account this host's sign-in funds, and its qualified profile (R1-F07). */
  readonly accountKey: string
  readonly profileId: string
  readonly profileRevision: number
  readonly operations: ReadonlySet<RunnerOperationKind>
}

export interface GatewayOptions {
  readonly journal: RunnerJournal
  readonly transport: T3Transport
  readonly profile: GatewayProfile
  /** At most this many thread pages per reconcile or observation (100 items each). */
  readonly maxReadPages?: number
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** A malformed envelope's id, when it has a well-formed one: its refusal is journaled under it. */
function idOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('operationId' in value)) return null
  const id = value.operationId
  return typeof id === 'string' && UUID.test(id) ? id : null
}

const UNPROVEN_ABSENCE =
  'no possible send is journaled here, which proves nothing: a restored prefix of this journal would look the same. ' +
  'It stays unknown for an operator; it is never sent again.'

/**
 * The gateway's own receipt check (integrated r3, F01), applied to every answer it journals or returns, whatever produced
 * it: a create's or input's receipt needs a run id (a trimmed, non-blank string, as RunId at the pin); a Stop's may name
 * none (null) but never a malformed one. Why a receipt is not one, or null when it is (or when it is no receipt).
 */
export function receiptError(kind: string, answer: RunnerAnswer): string | null {
  if (answer.kind !== 'received') return null
  const runId: unknown = answer.runId
  const isRun = typeof runId === 'string' && runId.trim().length > 0
  if (kind === 'stop') return runId === null || isRun ? null : 'a stop acknowledgement with a malformed run'
  return isRun ? null : `a ${kind} receipt names no valid run: no accepted run is proven`
}

/** The answer itself, or unknown when it is a receipt the check refuses: never a receipt without its evidence. */
function admitted(kind: string, answer: RunnerAnswer): RunnerAnswer {
  const error = receiptError(kind, answer)
  return error && answer.kind === 'received' ? { kind: 'unknown', identity: answer.identity, reason: error } : answer
}

type Read =
  | { kind: 'read'; read: ThreadRead; found: boolean; runId: string | null; pages: number }
  | { kind: 'error'; reason: string }

export class RunnerGateway implements SophiaRunnerPort {
  private readonly journal: RunnerJournal
  private readonly transport: T3Transport
  private readonly profile: GatewayProfile
  private readonly maxReadPages: number
  /** One call per operation at a time in this process; other processes are excluded by the journal's lock. */
  private readonly inFlight = new Map<string, Promise<RunnerAnswer>>()

  constructor(options: GatewayOptions) {
    this.journal = options.journal
    this.transport = options.transport
    this.profile = options.profile
    this.maxReadPages = options.maxReadPages ?? 5
  }

  get journalId(): string {
    return this.journal.id
  }

  /** Release the journal's lock. */
  close(): void {
    this.journal.close()
  }

  async send(envelope: RunnerEnvelope, digest: string, journalId: string): Promise<RunnerAnswer> {
    // Bound to another journal: this one can neither send it nor speak for it.
    if (journalId !== this.journal.id) return { kind: 'unknown', identity: null, reason: 'bound to another journal' }
    const checked = checkEnvelope(envelope)
    if (!checked.ok) return this.refuse(idOf(envelope), digest, checked.reason)
    const id = checked.envelope.operationId
    const running = this.inFlight.get(id)
    if (running) {
      await running.catch(() => undefined)
      return this.answerFromJournal(id, digest)
    }
    const work = this.sendOnce(checked.envelope, digest)
    this.inFlight.set(id, work)
    try {
      return await work
    } finally {
      this.inFlight.delete(id)
    }
  }

  /**
   * Only called for an operation bound to this journal. Its absence here proves nothing (r3, R2-F01): a restored
   * prefix of this same journal would look exactly like it. It stays unknown, for an operator to settle.
   */
  private async answerFromJournal(operationId: string, digest: string): Promise<RunnerAnswer> {
    const entry = this.journal.entry(operationId)
    if (!entry) return { kind: 'unknown', identity: null, reason: UNPROVEN_ABSENCE }
    if (entry.digest !== digest) return { kind: 'conflict', reason: 'this operation was journaled with another digest' }
    return this.reconcileEntry(entry)
  }

  private refuse(operationId: string | null, digest: string, reason: string): RunnerAnswer {
    // Journaled for a well-formed id, so a replay after a lost answer is refused the same way and never sent.
    if (operationId !== null && !this.journal.entry(operationId))
      this.journal.append('refused', operationId, { digest, reason })
    return { kind: 'refused', reason }
  }

  /** Whether the envelope is outside this host's qualified owner, environment, adapter, project, account and profile. */
  private outsideProfile(e: RunnerEnvelope): boolean {
    const p = this.profile
    return (
      e.ownerId !== p.ownerId ||
      e.environmentRef !== p.environmentRef ||
      e.adapterPin !== p.adapterPin ||
      !p.nativeProjectRefs.has(e.nativeProjectRef) ||
      e.accountKey !== p.accountKey ||
      e.profileId !== p.profileId ||
      e.profileRevision !== p.profileRevision
    )
  }

  /** An input or stop must target a thread this gateway received from a create of the same lineage. */
  private foreignThread(e: RunnerEnvelope): boolean {
    const target = e.targetOperationId ? this.journal.entry(e.targetOperationId) : undefined
    return followupTargetError(target, e) !== null
  }

  private scopeRefusal(e: RunnerEnvelope): string | null {
    if (this.outsideProfile(e))
      return 'an owner, environment, adapter, project, account or profile this host was not qualified for'
    if (!this.profile.operations.has(e.kind)) return `an operation this host was not qualified for (${e.kind})`
    if (e.kind !== 'create' && this.foreignThread(e))
      return 'a native thread this gateway did not create for this binding and lineage'
    return null
  }

  private async sendOnce(envelope: RunnerEnvelope, digest: string): Promise<RunnerAnswer> {
    if (digestOf(envelope) !== digest)
      return this.refuse(envelope.operationId, digest, 'the digest does not bind the envelope')
    const prior = this.journal.entry(envelope.operationId)
    // Journaled before, in any state: answered from the journal, or reconciled. Never sent again (r3).
    if (prior && prior.digest !== digest)
      return { kind: 'conflict', reason: 'this operation was journaled with another digest' }
    if (prior) return this.reconcileEntry(prior)
    const scope = this.scopeRefusal(envelope)
    if (scope) return this.refuse(envelope.operationId, digest, `refused: ${scope}`)
    let identity: NativeIdentity
    try {
      identity = deriveIdentity(envelope, this.transport.namespace())
    } catch (err) {
      return this.refuse(envelope.operationId, digest, `no native session: ${errorText(err)}`)
    }
    this.journal.append('intent', envelope.operationId, { digest, envelope, identity })
    return this.callOnce(envelope, identity)
  }

  /** Journal the possible send, make the one call, and journal what it proved. */
  private async callOnce(envelope: RunnerEnvelope, identity: NativeIdentity): Promise<RunnerAnswer> {
    this.journal.append('possible_send', envelope.operationId, {})
    let reply: T3Reply
    try {
      reply = await this.transport.call(callFor(envelope, this.profile.environmentRef))
    } catch (err) {
      reply = { kind: 'transport_error', reason: errorText(err) }
    }
    const answer = admitted(envelope.kind, classifyReply(envelope, identity, reply))
    // Definite answers, and a violated delivery, are final; anything else stays to be reconciled.
    const final =
      answer.kind === 'received' || answer.kind === 'rejected' || (answer.kind === 'unknown' && answer.violation)
    if (final) this.journal.append('answer', envelope.operationId, { answer })
    else
      this.journal.append('unknown', envelope.operationId, {
        reason: answer.kind === 'unknown' ? answer.reason : answer.kind,
      })
    return answer
  }

  /** Why this gateway cannot speak for the operation at all, or null. */
  private foreign({ envelope, digest, journalId }: RunnerIdentity): string | null {
    if (journalId !== this.journal.id) return 'it is bound to another journal; this one proves nothing about it'
    const checked = checkEnvelope(envelope)
    if (!checked.ok) return checked.reason
    if (digestOf(checked.envelope) !== digest) return 'the digest does not bind the envelope'
    return this.outsideProfile(checked.envelope) ? 'this gateway does not run this operation' : null
  }

  async reconcile(identity: RunnerIdentity): Promise<RunnerAnswer> {
    const foreign = this.foreign(identity)
    if (foreign) return { kind: 'unknown', identity: null, reason: `not answerable here: ${foreign}` }
    const id = identity.envelope.operationId
    const running = this.inFlight.get(id)
    if (running) await running.catch(() => undefined)
    return this.answerFromJournal(id, identity.digest)
  }

  /** What the journal alone answers: its final answer, its refusal, unknown, or null to read T3. */
  private settledInJournal(entry: JournalEntry): RunnerAnswer | null {
    if (entry.answer && entry.envelope && receiptError(entry.envelope.kind, entry.answer)) {
      return { kind: 'unknown', identity: entry.identity, reason: 'its journaled receipt names no valid run' }
    }
    if (entry.answer) return entry.answer
    if (entry.refused !== null) return { kind: 'refused', reason: entry.refused }
    // A validated journal never holds a possible send without its intent; if it somehow did, nothing is proved.
    if (entry.possibleSend && (!entry.envelope || !entry.identity)) {
      return { kind: 'unknown', identity: null, reason: 'its journal entry is incomplete; nothing is proved' }
    }
    if (entry.possibleSend) return null
    // An intent without its possible send: this may be a restored prefix of a history that went on to send (R2-F01).
    return { kind: 'unknown', identity: null, reason: UNPROVEN_ABSENCE }
  }

  private async reconcileEntry(entry: JournalEntry): Promise<RunnerAnswer> {
    const known = this.settledInJournal(entry)
    if (known) return known
    if (!entry.envelope || !entry.identity) return { kind: 'unknown', identity: null, reason: 'nothing is proved' }
    const { envelope, identity } = entry
    const found = await this.readThread(identity.threadId, identity.messageId)
    if (found.kind === 'error') return { kind: 'unknown', identity, reason: found.reason }
    if (envelope.kind === 'stop') return this.reconcileStop(envelope, identity, found.read)
    if (!found.found) {
      return {
        kind: 'unknown',
        identity,
        reason: `not found by its original identity in ${found.pages} page(s); absence is not proof`,
      }
    }
    // The exact message with no run (integrated r3, F01): no accepted run is proven, so nothing is received.
    if (found.runId === null) {
      return { kind: 'unknown', identity, reason: 'its message is in the read with no run; no accepted run is proven' }
    }
    const queued = envelope.kind === 'input' && found.read.runs.get(found.runId) === 'queued'
    const answer = admitted(envelope.kind, {
      kind: 'received',
      identity,
      runId: found.runId,
      delivery: queued ? 'queued' : 'started',
    })
    if (answer.kind === 'received') this.journal.append('answer', envelope.operationId, { answer })
    return answer
  }

  /** Whether this stop was delivered stays unproven; settlement is journaled only when positively proven. */
  private reconcileStop(envelope: RunnerEnvelope, identity: NativeIdentity, read: ThreadRead): RunnerAnswer {
    if (!stopSettled(read)) {
      return {
        kind: 'unknown',
        identity,
        reason: "settlement is not proven by the read; this stop's delivery is unproven",
      }
    }
    const answer: RunnerAnswer = {
      kind: 'settled',
      identity,
      reason: "proven: no active and no unsettled run; this request's delivery is unproven",
    }
    this.journal.append('answer', envelope.operationId, { answer })
    return answer
  }

  /** One page read and decoded against the exact thread, or why it is no evidence. */
  private async readPage(threadId: string, after: number | undefined): Promise<ThreadRead | { error: string }> {
    let reply: T3Reply
    try {
      reply = await this.transport.call(readCall(this.profile.environmentRef, threadId, after))
    } catch (err) {
      reply = { kind: 'transport_error', reason: errorText(err) }
    }
    if (reply.kind === 'failure') return { error: `read failed with ${reply.code}; absence is not proof` }
    if (reply.kind === 'transport_error') return { error: reply.reason }
    return decodeThreadRead(reply.body, threadId)
  }

  /** Bounded pages of one exact thread, looking for one exact message id. */
  private async readThread(threadId: string, messageId: string | null): Promise<Read> {
    let after: number | undefined
    let last: ThreadRead | null = null
    for (let pages = 1; pages <= this.maxReadPages; pages++) {
      const page = await this.readPage(threadId, after)
      if ('error' in page) return { kind: 'error', reason: page.error }
      last = page
      if (messageId !== null && page.messages.has(messageId)) {
        return { kind: 'read', read: page, found: true, runId: page.messages.get(messageId) ?? null, pages }
      }
      if (page.nextPosition === null) return { kind: 'read', read: page, found: false, runId: null, pages }
      after = page.nextPosition
    }
    return last
      ? { kind: 'read', read: last, found: false, runId: null, pages: this.maxReadPages }
      : { kind: 'error', reason: 'nothing was read' }
  }

  async observe(identity: RunnerIdentity): Promise<RunObservation> {
    const foreign = this.foreign(identity)
    if (foreign) return { kind: 'unknown', reason: `not answerable here: ${foreign}` }
    const entry = this.journal.entry(identity.envelope.operationId)
    const receipt = entry && entry.digest === identity.digest ? receiptOf(entry) : null
    if (!entry?.envelope || !receipt) return { kind: 'unknown', reason: 'no receipt to observe' }
    const found = await this.readThread(receipt.threadId, null)
    if (found.kind === 'error') return { kind: 'unknown', reason: found.reason }
    return observed(entry.envelope.kind, found.read, receipt.runId)
  }
}

/** What a decoded read proves about one operation: a stop's settlement, or its own run's state. */
function observed(kind: RunnerOperationKind, read: ThreadRead, runId: string | null): RunObservation {
  if (kind === 'stop') {
    return stopSettled(read)
      ? { kind: 'no_active_run' }
      : { kind: 'unknown', reason: 'settlement is not proven by the read' }
  }
  if (!runId) return { kind: 'unknown', reason: 'its receipt names no run' }
  const state = runState(read, runId)
  if (state === 'unknown') return { kind: 'unknown', reason: 'its run is not in the read with a known status' }
  return { kind: 'run', status: read.runs.get(runId) ?? '', terminal: state === 'terminal' }
}

/** The thread and run a journaled receipt (or a proven stop settlement) names, or null. */
function receiptOf(entry: JournalEntry): { threadId: string; runId: string | null } | null {
  const answer = entry.answer
  if (answer?.kind === 'received') return { threadId: answer.identity.threadId, runId: answer.runId }
  if (answer?.kind === 'settled' && answer.identity) return { threadId: answer.identity.threadId, runId: null }
  return null
}
