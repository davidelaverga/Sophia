/** CON reply lifecycle and bounded checker ownership. No provider activation or physical retirement authority. */
import { Duplex, Writable } from 'node:stream'
import { createHash, randomBytes } from 'node:crypto'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import { constants as fsFlags } from 'node:fs'
import type { BigIntStats, Dir } from 'node:fs'
import { open as openReplyFile, lstat as statReplyPath, opendir as openReplyDirectory,
  unlink as unlinkReplyPath, rmdir as removeReplyDirectory } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { wire } from './runtime-wire.generated.js'
import { ServiceTransport, TransportError } from './transport.js'
import type { RuntimeCommand, RuntimeReceipt, RuntimeObservation, RuntimeConversationAcknowledgedRequest, RuntimeConversationAcknowledgement,
  RuntimeConversationSettleRequest, RuntimeConversationSettlement, RuntimeConversationClaimRequest,
  RuntimeConversationClaimReply, RuntimeConversationGoReply, RuntimeConversationReserveRequest, RuntimeConversationReservation } from './runtime-wire-types.generated.js'
import { ReplyControlReader } from './reply-plugin.js'
import type { ReplyIdentity, ReplyControlScope } from './reply-plugin.js'

const LINE_BYTES = 1024 * 1024
const QUEUE_BYTES = 4 * LINE_BYTES
const QUEUE_ITEMS = 64
const COUNT_KEYS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const storable = (value: string): boolean => value.isWellFormed() && !value.includes('\u0000')
const label = (value: unknown): boolean => value === null || (typeof value === 'string' && value.length <= 200 && storable(value))
const closed = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean =>
  required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key))
const invalid = (): never => { throw new Error('relay_invalid') }

function validUsage(data: Record<string, unknown>): boolean {
  return COUNT_KEYS.every(key => !Object.hasOwn(data, key) || data[key] === null || count(data[key])) &&
    ['provider', 'model', 'compactionId'].every(key => !Object.hasOwn(data, key) || label(data[key]))
}

function validAssistant(data: Record<string, unknown>): boolean {
  if (!closed(data, ['text', 'oversize', 'invalidText', 'length', 'provider', 'model', 'inputTokens', 'outputTokens', 'interrupted', 'ordinal'], ['cacheReadTokens', 'cacheWriteTokens'])) return false
  if (!count(data.length) || typeof data.oversize !== 'boolean' || typeof data.invalidText !== 'boolean' || typeof data.interrupted !== 'boolean') return false
  if (data.oversize !== (data.length > 16_000)) return false
  return validAssistantText(data)
}

function validAssistantText(data: Record<string, unknown>): boolean {
  return data.text === null ? data.oversize === true || data.invalidText === true :
    typeof data.text === 'string' && storable(data.text) && !data.oversize && !data.invalidText && [...data.text].length === data.length
}

function validProjection(type: string, data: Record<string, unknown>): boolean {
  if (!validUsage(data)) return false
  if (['assistant/message', 'compaction/summary'].includes(type) && data.ordinal !== 1 && data.ordinal !== 2) return false
  switch (type) {
    case 'assistant/message': return validAssistant(data)
    case 'compaction/summary': return closed(data, ['compactionId', 'provider', 'model', 'inputTokens', 'outputTokens', 'ordinal'], ['cacheReadTokens', 'cacheWriteTokens'])
    case 'user/message': return validUserProjection(data)
    case 'turn/start': return closed(data, [])
    case 'turn/end': return validTurnEnd(data)
    default: return false
  }
}

function validUserProjection(data: Record<string, unknown>): boolean {
  return closed(data, ['id', 'length']) && typeof data.id === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(data.id) && count(data.length)
}

function validTurnEnd(data: Record<string, unknown>): boolean {
  return closed(data, ['reason']) && isRecord(data.reason) && closed(data.reason, ['kind']) &&
    ['completed', 'error', 'max-tokens', 'blocked'].includes(String(data.reason.kind)) && typeof data.reason.kind === 'string'
}

/** The native side may send only complete original projections. Reduction is the parent's own operation. */
export function parseReplyObservation(value: unknown, identity: ReplyIdentity): RuntimeObservation {
  return parseDeliveryObservation(value, identity, false)
}

function validReducedProjection(type: string, data: Record<string, unknown>): boolean {
  if (!['assistant/message', 'compaction/summary', 'user/message', 'turn/start', 'turn/end'].includes(type)) return false
  const required = ['scrubbed']
  if (type === 'assistant/message' || type === 'compaction/summary') required.push('ordinal')
  if (type === 'assistant/message' || type === 'user/message') required.push('textLength')
  return data.scrubbed === true && closed(data, required, ['provider', 'model', ...COUNT_KEYS, 'ordinal', 'textLength']) &&
    validUsage(data) && validReducedCounts(data)
}

function validReducedCounts(data: Record<string, unknown>): boolean {
  return (!Object.hasOwn(data, 'ordinal') || data.ordinal === 1 || data.ordinal === 2) &&
    (!Object.hasOwn(data, 'textLength') || count(data.textLength))
}

function parseDeliveryObservation(value: unknown, identity: ReplyIdentity, allowReduced: boolean): RuntimeObservation {
  if (!wire.RuntimeObservation(value) || !isRecord(value.data) || value.durable !== true ||
      value.runtimeUnitId !== identity.runtimeUnitId || value.attemptId !== identity.attemptId ||
      value.nativeSessionId !== identity.nativeSessionId || !count(value.nativeSeq) ||
      !(validProjection(value.type, value.data) || (allowReduced && validReducedProjection(value.type, value.data)))) return invalid()
  return value
}

/** Keep only the exact reduced schema accepted by CON-OBS-REPLY, retaining nullable usage as unknown. */
export function reduceReplyObservation(observation: RuntimeObservation): RuntimeObservation {
  if (!isRecord(observation.data)) return invalid()
  const original = observation.data
  const data: Record<string, unknown> = { scrubbed: true }
  for (const key of ['provider', 'model', ...COUNT_KEYS, 'ordinal']) {
    if (Object.hasOwn(original, key)) data[key] = original[key]
  }
  if (observation.type === 'assistant/message' || observation.type === 'user/message') data.textLength = original.length ?? original.textLength
  return { ...observation, data }
}

export interface ReplyReserveLine { readonly t: 'reserve'; readonly n: number; readonly tokens: number; readonly priceMicros: number }
export interface ReplySettleLine {
  readonly t: 'settle'
  readonly n: number
  readonly outcome: 'settled' | 'uncertain'
  /** Unknown usage is null, never invented zero; an uncertain line cannot invoke the settled-only API. */
  readonly used: { readonly calls: 1; readonly tokens: number; readonly priceMicros: number } | null
  readonly usage: Record<string, unknown> | null
}
type ReplyFrame = { readonly t: 'obs'; readonly observation: RuntimeObservation } |
  { readonly t: 'status'; readonly s: 'ready' } |
  { readonly t: 'status'; readonly s: 'failed'; readonly code: 'containment_unavailable' | 'profile_mismatch' | 'home_exists' } |
  ReplyReserveLine | ReplySettleLine

function parseSettle(raw: Record<string, unknown>): ReplySettleLine {
  if (!closed(raw, ['t', 'n', 'outcome', 'used', 'usage']) || !count(raw.n) || raw.n < 1) return invalid()
  if (raw.outcome === 'uncertain' && raw.used === null && raw.usage === null) return { t: 'settle', n: raw.n, outcome: 'uncertain', used: null, usage: null }
  if (raw.outcome !== 'settled') return invalid()
  return parseSettled(raw, raw.n)
}

function parseSettled(raw: Record<string, unknown>, ordinal: number): ReplySettleLine {
  if (!isRecord(raw.used) || !closed(raw.used, ['calls', 'tokens', 'priceMicros']) ||
      raw.used.calls !== 1 || !count(raw.used.tokens) || !count(raw.used.priceMicros) || !isRecord(raw.usage) ||
      !closed(raw.usage, ['inputTokens', 'outputTokens'], ['cacheReadTokens', 'cacheWriteTokens']) ||
      !Object.values(raw.usage).every(count)) return invalid()
  const tokens = Object.values(raw.usage).reduce<number>((sum, value) => sum + (count(value) ? value : 0), 0)
  if (!count(tokens) || tokens !== raw.used.tokens) return invalid()
  return { t: 'settle', n: ordinal, outcome: 'settled', used: { calls: 1, tokens: raw.used.tokens, priceMicros: raw.used.priceMicros }, usage: raw.usage }
}

function parseFrame(raw: unknown, identity: ReplyIdentity): ReplyFrame {
  if (!isRecord(raw)) return invalid()
  if (raw.t === 'obs' && closed(raw, ['t', 'observation'])) return { t: 'obs', observation: parseReplyObservation(raw.observation, identity) }
  if (raw.t === 'reserve') return parseReserve(raw)
  if (raw.t === 'settle') return parseSettle(raw)
  if (raw.t === 'status') return parseStatus(raw)
  return invalid()
}

function parseReserve(raw: Record<string, unknown>): ReplyReserveLine {
  if (!closed(raw, ['t', 'n', 'tokens', 'priceMicros']) || !count(raw.n) || raw.n < 1 || !count(raw.tokens) || !count(raw.priceMicros)) return invalid()
  return { t: 'reserve', n: raw.n, tokens: raw.tokens, priceMicros: raw.priceMicros }
}

function parseStatus(raw: Record<string, unknown>): ReplyFrame {
  if (raw.s === 'ready' && closed(raw, ['t', 's'])) return { t: 'status', s: 'ready' }
  if (raw.s === 'failed' && closed(raw, ['t', 's', 'code']) &&
      (raw.code === 'containment_unavailable' || raw.code === 'profile_mismatch' || raw.code === 'home_exists')) return { t: 'status', s: 'failed', code: raw.code }
  return invalid()
}

export interface ReplyRelayOperations {
  observe(observation: RuntimeObservation, signal: AbortSignal): Promise<void>
  reserve(line: ReplyReserveLine, signal: AbortSignal): Promise<{ readonly allowed: boolean; readonly code?: string }>
  settle(line: ReplySettleLine): Promise<'settled' | 'settle_unknown'>
  status(status: 'ready' | 'failed', code?: string): void
  fenced(code: 'relay_invalid' | 'child_exited'): void
  completed?(): void
}

export interface ReplyDeliveryOperations {
  observations(values: readonly RuntimeObservation[], signal: AbortSignal): Promise<void>
  conversationReserve(body: RuntimeConversationReserveRequest, signal: AbortSignal): Promise<RuntimeConversationReservation>
}
type ReserveAnswer = { readonly allowed: boolean; readonly code?: string }

/**
 * Parent-owned delivery from the validated original create snapshot. No prompt, persistent copy, claim,
 * go, receipt or cleanup lives here. The relay must enforce its go/fence ordering before calling this class.
 * Retries and duplicate reserves cannot replace identity, enlarge bounds or grant a settled call again.
 */
export class ReplyDelivery {
  private readonly binding: RecoveryBinding
  private readonly identity: ReplyIdentity
  private readonly replyId: string
  private readonly source: { readonly routeId: string; readonly credentialRef: string; readonly ownerResourceRef: string; readonly unit: 'calls_tokens' | 'usd' }
  private readonly policy: ReplySettlementPolicy
  private readonly pending = new Map<number, { fingerprint: string; result: Promise<ReserveAnswer>; signal: AbortSignal }>()

  constructor(command: unknown, leaseId: string, policy: ReplySettlementPolicy,
      private readonly operations: ReplyDeliveryOperations, private readonly clock: ReplyStopClock = monotonicReplyClock) {
    if (!wire.RuntimeCommand(command) || command.kind !== 'create' || !('conversationReplyId' in command.binding) ||
        !('conversation' in command.payload)) throw new Error('reply_delivery_invalid')
    const binding = { attemptId: command.binding.attemptId, commandId: command.commandId,
      authorityEpoch: command.binding.authorityEpoch, leaseId }
    if (!wire.RuntimeConversationClaimRequest(binding) || !validRetryPolicy(policy, clock)) throw new Error('reply_delivery_invalid')
    this.binding = Object.freeze(binding)
    this.replyId = command.binding.conversationReplyId
    this.identity = Object.freeze({ runtimeUnitId: command.binding.runtimeUnitId,
      attemptId: binding.attemptId, nativeSessionId: `sophia-${binding.attemptId}` })
    // The reservation's source names exactly these; the payload's pinned execution tuple (A35) is not part of a call.
    const { credentialRef, ownerResourceRef, unit } = command.payload.conversation
    this.source = Object.freeze({ routeId: command.payload.route, credentialRef, ownerResourceRef, unit })
    this.policy = Object.freeze({ ...policy })
  }

  async observe(value: RuntimeObservation, signal: AbortSignal): Promise<void> {
    const observation = structuredClone(parseDeliveryObservation(value, this.identity, true))
    await this.request(child => this.operations.observations([observation], child), signal)
  }

  reserve(value: ReplyReserveLine, signal: AbortSignal): Promise<ReserveAnswer> {
    const frame = parseFrame(value, this.identity)
    if (frame.t !== 'reserve' || (frame.n !== 1 && frame.n !== 2)) throw new Error('reply_delivery_invalid')
    const fingerprint = JSON.stringify([frame.tokens, frame.priceMicros])
    const prior = this.pending.get(frame.n)
    if (prior && prior.fingerprint !== fingerprint) throw new Error('reply_delivery_conflict')
    // A cached reservation is historical evidence, not permission past the caller's current fence.
    if (signal.aborted || this.clock.now() >= this.policy.deadlineAt) return Promise.resolve({ allowed: false, code: 'reserve_unconfirmed' })
    if (prior) return prior.signal === signal ? prior.result : this.forCaller(prior.result, signal)
    return this.beginReserve(frame, fingerprint, signal)
  }

  private beginReserve(frame: ReplyReserveLine, fingerprint: string, signal: AbortSignal): Promise<ReserveAnswer> {
    const call = Object.freeze({ ...this.source, tokens: this.source.unit === 'calls_tokens' ? frame.tokens : 0,
      priceMicros: this.source.unit === 'usd' ? frame.priceMicros : 0 })
    const body = Object.freeze({ ...this.binding, ordinal: frame.n, call })
    if (!wire.RuntimeConversationReserveRequest(body)) throw new Error('reply_delivery_invalid')
    // Defer caller entry until the immutable replay record exists, including reentrant callbacks.
    const result = Promise.resolve().then(() => this.reserveOnce(body, signal))
    this.pending.set(frame.n, { fingerprint, result, signal })
    return result
  }

  private forCaller(result: Promise<ReserveAnswer>, signal: AbortSignal): Promise<ReserveAnswer> {
    return new Promise(resolve => {
      const finish = (answer: ReserveAnswer): void => {
        signal.removeEventListener('abort', abort)
        resolve(signal.aborted || this.clock.now() >= this.policy.deadlineAt ? { allowed: false, code: 'reserve_unconfirmed' } : answer)
      }
      const abort = (): void => finish({ allowed: false, code: 'reserve_unconfirmed' })
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      void result.then(finish, abort)
    })
  }

  private async reserveOnce(body: RuntimeConversationReserveRequest, signal: AbortSignal): Promise<ReserveAnswer> {
    try {
      const value = await this.request(child => this.operations.conversationReserve(body, child), signal)
      if (!wire.RuntimeConversationReservation(value) || value.replyId !== this.replyId || value.ordinal !== body.ordinal ||
          value.state !== 'reserved' || value.unit !== this.source.unit || value.used !== null || value.amount.calls !== 1 ||
          value.amount.tokens !== body.call.tokens || value.amount.priceMicros !== body.call.priceMicros) {
        return { allowed: false, code: 'reserve_unconfirmed' }
      }
      return { allowed: true }
    } catch { return { allowed: false, code: 'reserve_unconfirmed' } }
  }

  private assertLive(signal: AbortSignal): void {
    if (signal.aborted || this.clock.now() >= this.policy.deadlineAt) throw new Error('reply_delivery_unconfirmed')
  }

  private async request<T>(operation: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    for (let attempt = 0; attempt < this.policy.maxAttempts; attempt++) {
      this.assertLive(signal)
      try { return await this.attempt(operation, signal) }
      catch (error: unknown) {
        this.assertLive(signal)
        if (isPermanentRefusal(error)) throw new Error('reply_delivery_refused')
        if (attempt + 1 < this.policy.maxAttempts) await this.backoff(signal)
      }
    }
    throw new Error('reply_delivery_unconfirmed')
  }

  private async attempt<T>(operation: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    const controller = new AbortController()
    const abort = (): void => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    let cancel = (): void => {}
    let remove = (): void => {}
    try {
      this.assertLive(signal)
      const aborted = new Promise<never>((_resolve, reject) => {
        const fail = (): void => reject(new Error('reply_delivery_unconfirmed'))
        controller.signal.addEventListener('abort', fail, { once: true })
        remove = () => controller.signal.removeEventListener('abort', fail)
      })
      cancel = this.clock.after(Math.min(this.policy.requestWaitMs, this.policy.deadlineAt - this.clock.now()), abort)
      const value = await Promise.race([operation(controller.signal), aborted])
      this.assertLive(signal)
      if (controller.signal.aborted) throw new Error('reply_delivery_unconfirmed')
      return value
    } finally { cancel(); remove(); signal.removeEventListener('abort', abort); controller.abort() }
  }

  private backoff(signal: AbortSignal): Promise<void> {
    this.assertLive(signal)
    return new Promise(resolve => {
      let cancel = (): void => {}
      const done = (): void => { cancel(); signal.removeEventListener('abort', done); resolve() }
      signal.addEventListener('abort', done, { once: true })
      cancel = this.clock.after(Math.min(this.policy.retryWaitMs, this.policy.deadlineAt - this.clock.now()), done)
    })
  }
}
interface QueuedFrame { frame: ReplyFrame; readonly bytes: number }
export type ReplyRelayState = 'live' | 'draining' | 'fenced' | 'closed'

/**
 * One ordered fd3 reader. The queue includes its in-flight head, so an outage cannot grow a hidden second queue.
 * The caller supplies bounded transport retries and the single shared settlement deadline. No retries start here.
 */
export class ReplyRelay {
  private readonly stream: Duplex
  private readonly identity: ReplyIdentity
  private readonly operations: ReplyRelayOperations
  private queue: QueuedFrame[] = []
  private held: QueuedFrame | null = null
  private queueBytes = 0
  private readonly lineBuffer = Buffer.alloc(LINE_BYTES)
  private lineBytes = 0
  private reading = false
  private readScheduled = false
  private processing = false
  private blocked = false
  private invalidLine = false
  private eof = false
  private pipeClosed = false
  private goWritten = false
  private ready = false
  private statusSeen = false
  private nextOrdinal = 1
  private reserved = new Set<number>()
  private settling = new Set<number>()
  private pendingSettles = new Set<Promise<void>>()
  private settleFailed = false
  private active: AbortController | null = null
  private mode: ReplyRelayState = 'live'
  private completed = false
  private completionClassified = false
  private turnEnded = false
  private intactAnswer = false
  private lastSequence = -1
  private exit: { readonly clean: boolean; readonly reapedAfterTurn: boolean } | null = null

  constructor(stream: Duplex, identity: ReplyIdentity, operations: ReplyRelayOperations) {
    this.stream = stream
    this.identity = identity
    this.operations = operations
    stream.on('readable', () => this.read())
    stream.on('end', () => this.ended())
    stream.on('close', () => { this.pipeClosed = true; this.maybeClosed() })
    stream.on('error', () => { if (!this.completionClassified) this.fail() })
  }

  get state(): ReplyRelayState { return this.mode }
  inspect() {
    return { state: this.mode, items: this.queue.length, bytes: this.queueBytes, held: this.held !== null,
      lineBytes: this.lineBytes, eof: this.eof, pipeClosed: this.pipeClosed, blocked: this.blocked,
      invalidLine: this.invalidLine, pendingSettles: this.pendingSettles.size, settleFailed: this.settleFailed, go: this.goWritten,
      ordinals: { reserved: [...this.reserved].sort(), settling: [...this.settling].sort() } }
  }

  /** Called only after the API's committed go. It cannot open a fenced or unready child. */
  async go(): Promise<void> {
    if (!this.ready || this.mode !== 'live' || this.goWritten || this.eof) return invalid()
    this.goWritten = true
    await this.write({ t: 'go' })
  }

  /** Stop never waits for delivery before the owner starts its escalation clock. */
  stop(): Promise<void> { this.fence(); return this.write({ t: 'stop' }) }

  /** Exit does not clear the unread fd3 tail. Classification waits for EOF and this exact exit evidence. */
  exited(clean: boolean, reapedAfterTurn = false): void {
    this.exit = { clean, reapedAfterTurn }
    this.classify()
  }

  fence(): void {
    if (this.mode === 'closed' || this.mode === 'fenced') return
    this.mode = 'fenced'
    for (const item of this.queue) this.reduce(item)
    if (this.held) this.reduce(this.held)
    this.active?.abort()
    this.blocked = false
    this.pump()
  }

  /** Explicit retry of retained delivery, called by the owner's bounded retry policy. */
  retry(): void { this.blocked = false; this.pump() }

  private reduce(item: QueuedFrame): void {
    if (item.frame.t === 'obs') item.frame = { t: 'obs', observation: reduceReplyObservation(item.frame.observation) }
  }

  private read(): void {
    if (this.reading || this.invalidLine || this.held || this.eof) return
    this.reading = true
    let consumed = 0
    try {
      while (!this.held && !this.invalidLine && this.stream.readableLength > 0 && consumed < 64 * 1024) {
        const chunk: unknown = this.stream.read(Math.min(16 * 1024, this.stream.readableLength))
        if (!Buffer.isBuffer(chunk)) return this.fail()
        consumed += chunk.length
        this.consume(chunk)
      }
    } finally { this.reading = false }
    this.scheduleRead()
    this.pump()
  }

  private scheduleRead(): void {
    if (!this.held && !this.invalidLine && this.stream.readableLength === 0) this.stream.read(0)
    else if (!this.held && !this.invalidLine && !this.readScheduled) {
      this.readScheduled = true
      setImmediate(() => { this.readScheduled = false; this.read() })
    }
  }

  private consume(chunk: Buffer): void {
    let offset = 0
    while (offset < chunk.length && !this.held && !this.invalidLine) {
      const newline = chunk.indexOf(10, offset)
      const end = newline < 0 ? chunk.length : newline
      const length = end - offset
      if (this.lineBytes + length >= LINE_BYTES) { this.fail(); break }
      chunk.copy(this.lineBuffer, this.lineBytes, offset, end)
      this.lineBytes += length
      offset = newline < 0 ? end : end + 1
      if (newline >= 0) this.line()
    }
    // The stream, not a second relay buffer, owns the unread tail while the one crossing item is held.
    if (offset < chunk.length) this.stream.unshift(chunk.subarray(offset))
  }

  private line(): void {
    try {
      const encoded = this.lineBuffer.subarray(0, this.lineBytes)
      const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(encoded))
      encoded.fill(0); this.lineBytes = 0
      const frame = parseFrame(raw, this.identity)
      this.accept(frame)
      // Accounting must be able to finish after turn/end while that publication item awaits EOF/exit.
      // Only these already-reserved ordinals bypass delivery; a new reserve stays behind every prior observation.
      if (frame.t === 'settle') { this.settle(frame); return }
      const item = { frame, bytes: Buffer.byteLength(JSON.stringify(frame)) + 1 }
      if (this.mode === 'fenced') this.reduce(item)
      if (this.queue.length === QUEUE_ITEMS || this.queueBytes + item.bytes > QUEUE_BYTES) {
        this.held = item
        this.stream.pause()
      } else this.enqueue(item)
    } catch { this.fail() }
  }

  private accept(frame: ReplyFrame): void {
    if (frame.t === 'status') {
      if (this.statusSeen || this.goWritten) return invalid()
      this.statusSeen = true
    }
    if ((frame.t === 'obs' || frame.t === 'reserve' || frame.t === 'settle') && !this.goWritten) return invalid()
    if (frame.t !== 'obs') return
    this.acceptObservation(frame.observation)
  }

  private acceptObservation(observation: RuntimeObservation): void {
    if (observation.nativeSeq <= this.lastSequence || this.turnEnded) return invalid()
    this.lastSequence = observation.nativeSeq
    if (!isRecord(observation.data)) return invalid()
    if (observation.type === 'assistant/message' || observation.type === 'compaction/summary') {
      const ordinal = observation.data.ordinal
      if (typeof ordinal !== 'number' || !this.reserved.has(ordinal)) return invalid()
    }
    this.acceptTurnState(observation.type, observation.data)
  }

  private acceptTurnState(type: string, data: Record<string, unknown>): void {
    if (type === 'assistant/message') {
      this.intactAnswer = typeof data.text === 'string' && data.interrupted === false &&
        data.oversize === false && data.invalidText === false
    }
    if (type === 'turn/end') {
      this.turnEnded = true
      this.completed = isRecord(data.reason) && data.reason.kind === 'completed'
    }
  }

  private enqueue(item: QueuedFrame): void {
    this.queue.push(item)
    this.queueBytes += item.bytes
  }

  private refill(): void {
    if (this.held && this.queue.length < QUEUE_ITEMS && this.queueBytes + this.held.bytes <= QUEUE_BYTES) {
      this.enqueue(this.held)
      this.held = null
      // readable-mode consumption resumes without switching to flowing mode, which would discard unread bytes.
      this.read()
    }
  }

  private pump(): void {
    if (this.processing || this.blocked || this.queue.length === 0) { this.maybeClosed(); return }
    const item = this.queue[0]
    if (!item) return
    // Publication is held until both the complete fd3 tail and the exit are classified.
    if (item.frame.t === 'obs' && item.frame.observation.type === 'turn/end' && this.mode === 'live') return
    this.processing = true
    void this.deliver(item).then(() => {
      this.queue.shift(); this.queueBytes -= item.bytes
    }).catch(() => { this.blocked = true }).finally(() => {
      this.processing = false
      this.refill()
      this.pump()
    })
  }

  private async deliver(item: QueuedFrame): Promise<void> {
    const frame = item.frame
    switch (frame.t) {
      case 'obs': return this.deliverObservation(frame.observation)
      case 'status':
        if (this.ready || this.goWritten) return invalid()
        this.ready = frame.s === 'ready'
        this.operations.status(frame.s, frame.s === 'failed' ? frame.code : undefined)
        return
      case 'reserve': return this.reserve(frame)
      case 'settle': return this.settle(frame)
    }
  }

  private async deliverObservation(observation: RuntimeObservation): Promise<void> {
    if (!this.goWritten) { this.fail(); return invalid() }
    const controller = new AbortController()
    this.active = controller
    try { await this.operations.observe(observation, controller.signal) }
    catch {
      if (controller.signal.aborted && this.mode === 'fenced') {
        // A lost live upload can have committed. Resend its same key reduced, never its previous text.
        await this.operations.observe(reduceReplyObservation(observation), new AbortController().signal)
      } else throw new Error('relay_delivery_failed')
    }
    finally { if (this.active === controller) this.active = null }
  }

  private async reserve(line: ReplyReserveLine): Promise<void> {
    if (!this.goWritten || line.n !== this.nextOrdinal) { this.fail(); return invalid() }
    this.nextOrdinal += 1
    if (this.mode === 'fenced' || line.n > 2) { await this.write({ t: 'refused', n: line.n, code: line.n > 2 ? 'invalid_ordinal' : 'reply_fenced' }); return }
    const controller = new AbortController()
    this.active = controller
    let result: { readonly allowed: boolean; readonly code?: string }
    try { result = await this.operations.reserve(line, controller.signal) }
    catch { result = { allowed: false, code: 'reserve_unconfirmed' } }
    finally { if (this.active === controller) this.active = null }
    if (controller.signal.aborted) { await this.write({ t: 'refused', n: line.n, code: 'reply_fenced' }); return }
    if (result.allowed) this.reserved.add(line.n)
    const code = this.refusalCode(result.code)
    await this.write(result.allowed ? { t: 'reserved', n: line.n } : { t: 'refused', n: line.n, code })
  }

  private refusalCode(code: string | undefined): string {
    return code && /^[a-z][a-z0-9_]{0,63}$/.test(code) ? code : 'reserve_refused'
  }

  private settle(line: ReplySettleLine): void {
    if (!this.reserved.has(line.n) || this.settling.has(line.n)) { this.fail(); return invalid() }
    this.settling.add(line.n)
    // Both ordinals may wait in parallel under the caller's one shared deadline; neither blocks the fd3 tail.
    const pending = this.operations.settle(line).then(async t => {
      if (this.eof || this.stream.destroyed || this.stream.writableEnded) return
      try { await this.write({ t, n: line.n }) }
      catch { this.fence() } // API accounting succeeded; loss of its child-side notification cannot undo it.
    }).catch(() => {
      this.settleFailed = true
    }).finally(() => { this.pendingSettles.delete(pending); this.maybeClosed() })
    this.pendingSettles.add(pending)
  }

  private async write(value: unknown): Promise<void> {
    const data = JSON.stringify(value) + '\n'
    if (Buffer.byteLength(data) > 4096 || this.stream.destroyed || this.stream.writableEnded) return invalid()
    await new Promise<void>((resolve, reject) => this.stream.write(data, error => error ? reject(new Error('relay_write_failed')) : resolve()))
  }

  private ended(): void {
    this.eof = true
    if (this.lineBytes !== 0) this.fail()
    this.classify()
  }

  private classify(): void {
    if (!this.eof || !this.exit) return
    if (this.mode === 'live') {
      if (this.completed && this.intactAnswer && (this.exit.clean || this.exit.reapedAfterTurn)) {
        this.mode = 'draining'
        this.completionClassified = true
        try { this.operations.completed?.() } catch { /* Notification cannot interrupt completed capture. */ }
      }
      else { this.fence(); this.operations.fenced('child_exited') }
    }
    this.pump()
  }

  private fail(): void {
    if (this.invalidLine) return
    this.invalidLine = true
    this.lineBuffer.fill(0); this.lineBytes = 0
    this.stream.pause()
    this.fence()
    this.operations.fenced('relay_invalid')
  }

  private drainComplete(): boolean {
    return !this.invalidLine && this.eof && this.queue.length === 0 && !this.held && !this.processing &&
      this.pendingSettles.size === 0 && !this.blocked && !this.settleFailed
  }

  private maybeClosed(): void {
    if (this.mode === 'live' || this.mode === 'closed' || !this.drainComplete()) return
    if (!this.stream.writableEnded) this.stream.end()
    if (this.pipeClosed) this.mode = 'closed'
  }
}

export interface ReplyRecoveryScope {
  readonly identity: ReplyIdentity
  readonly control: ReplyControlScope
  /** Original create epoch supplied by trusted recovery metadata, never the current cancellation epoch. */
  readonly createEpoch: number
}
function journalScopeKey(scope: ReplyRecoveryScope): string {
  const { identity, control } = scope
  return JSON.stringify([identity.runtimeUnitId, identity.attemptId, identity.nativeSessionId, scope.createEpoch,
    control.attemptId, control.nonce, control.route.provider, control.route.model, control.route.reasoningEffort, control.maxTokens])
}

export interface ReplyRecoveredCall {
  readonly reserve: ReplyReserveLine
  readonly admission: 'pending' | 'reserved' | 'refused'
  readonly settlement: ReplySettleLine | null
  readonly acknowledgement: 'pending' | 'settled' | 'settle_unknown'
}

/**
 * Incremental journal validation only. The caller owns the trusted, bounded descriptor read and deadline.
 * Observations leave this parser reduced, but are provisional until end() succeeds. No network operation,
 * settlement replay, native execution or cleanup permission follows from a parsed prefix or a complete file.
 * At most two accounting records and one bounded line are retained; prompts and answer text are not returned.
 */
export class ReplyRecoveryReader {
  private readonly scope: ReplyRecoveryScope
  private readonly observe: (observation: RuntimeObservation) => void
  private readonly buffer = Buffer.alloc(2 * LINE_BYTES)
  private size = 0
  private phase: 'start' | 'records' | 'complete' | 'invalid' = 'start'
  private ready = false
  private lastSequence = -1
  private turnEnd = false
  private readonly calls = new Map<number, ReplyRecoveredCall>()

  constructor(scope: ReplyRecoveryScope, observe: (observation: RuntimeObservation) => void) {
    if (!count(scope.createEpoch) || scope.createEpoch < 1 || scope.identity.attemptId !== scope.control.attemptId ||
        scope.identity.nativeSessionId !== `sophia-${scope.control.attemptId}`) throw new Error('reply_recovery_invalid')
    this.scope = { identity: { ...scope.identity }, createEpoch: scope.createEpoch,
      control: { ...scope.control, route: { ...scope.control.route } } }
    this.observe = observe
  }

  feed(bytes: Uint8Array): void {
    if (this.phase === 'complete' || this.phase === 'invalid') return this.fail()
    try {
      for (const byte of bytes) {
        const limit = this.phase === 'start' ? this.buffer.length : LINE_BYTES
        if (this.size + 1 >= limit) return this.fail()
        if (byte === 10) this.line()
        else this.buffer[this.size++] = byte
      }
    } catch { return this.fail() }
  }

  end(): { readonly calls: readonly ReplyRecoveredCall[]; readonly hasTurnEnd: boolean } {
    if (this.phase !== 'records' || this.size !== 0) return this.fail()
    this.phase = 'complete'
    this.buffer.fill(0)
    return { calls: structuredClone([...this.calls.values()]), hasTurnEnd: this.turnEnd }
  }

  private line(): void {
    if (this.phase === 'start') {
      const reader = new ReplyControlReader(this.scope.control, control => {
        if (control.t !== 'start' || control.epoch !== this.scope.createEpoch) return this.fail()
      })
      try {
        reader.feed(this.buffer.subarray(0, this.size))
        reader.feed(Uint8Array.of(10))
        if (reader.state !== 'started') return this.fail()
      } finally { reader.end(); this.buffer.fill(0, 0, this.size); this.size = 0 }
      this.phase = 'records'
      return
    }
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(this.buffer.subarray(0, this.size))) }
    finally { this.buffer.fill(0, 0, this.size); this.size = 0 }
    if (!isRecord(raw)) return this.fail()
    if (['reserved', 'refused', 'settled', 'settle_unknown'].includes(String(raw.t))) return this.answer(raw)
    this.record(parseFrame(raw, this.scope.identity))
  }

  private record(frame: ReplyFrame): void {
    if (frame.t === 'status') {
      if (frame.s !== 'ready' || this.ready) return this.fail()
      this.ready = true
      return
    }
    if (!this.ready) return this.fail()
    if (frame.t === 'obs') return this.recordObservation(frame.observation)
    if (frame.t === 'reserve') return this.recordReserve(frame)
    const call = this.calls.get(frame.n)
    if (!call || call.admission !== 'reserved' || call.settlement !== null) return this.fail()
    this.calls.set(frame.n, { ...call, settlement: frame })
  }

  private recordObservation(observation: RuntimeObservation): void {
    if (observation.nativeSeq <= this.lastSequence) return this.fail()
    const ordinal = isRecord(observation.data) ? observation.data.ordinal : undefined
    if (ordinal !== undefined && (typeof ordinal !== 'number' || this.calls.get(ordinal)?.admission !== 'reserved')) return this.fail()
    this.lastSequence = observation.nativeSeq
    this.turnEnd ||= observation.type === 'turn/end'
    this.observe(reduceReplyObservation(observation))
  }

  private recordReserve(frame: ReplyReserveLine): void {
    const previous = this.calls.get(this.calls.size)
    if (frame.n !== this.calls.size + 1 || frame.n > 2 || (previous && previous.acknowledgement !== 'settled')) return this.fail()
    this.calls.set(frame.n, { reserve: frame, admission: 'pending', settlement: null, acknowledgement: 'pending' })
  }

  private answer(raw: Record<string, unknown>): void {
    if (!count(raw.n)) return this.fail()
    const call = this.calls.get(raw.n)
    if (!call || !closed(raw, raw.t === 'refused' ? ['t', 'n', 'code'] : ['t', 'n'])) return this.fail()
    if (raw.t === 'reserved' || raw.t === 'refused') {
      if (!this.validAdmissionAnswer(call, raw)) return this.fail()
      this.calls.set(raw.n, { ...call, admission: raw.t })
      return
    }
    this.answerSettlement(call, raw.t, raw.n)
  }

  private answerSettlement(call: ReplyRecoveredCall, kind: unknown, ordinal: number): void {
    if (!call.settlement || call.acknowledgement !== 'pending' ||
        (kind !== 'settled' && kind !== 'settle_unknown') ||
        (kind === 'settled' && call.settlement.outcome !== 'settled')) return this.fail()
    this.calls.set(ordinal, { ...call, acknowledgement: kind })
  }

  private validAdmissionAnswer(call: ReplyRecoveredCall, raw: Record<string, unknown>): boolean {
    return call.admission === 'pending' && (raw.t !== 'refused' ||
      (typeof raw.code === 'string' && /^[a-z][a-z0-9_]{0,199}$/.test(raw.code)))
  }

  dispose(): void {
    this.phase = 'invalid'
    this.buffer.fill(0)
    this.size = 0
    this.calls.clear()
  }

  private fail(): never {
    this.dispose()
    throw new Error('reply_recovery_invalid')
  }
}

type RecoveryKeys = RuntimeConversationAcknowledgedRequest['keys']
type RecoveryBinding = Omit<RuntimeConversationAcknowledgedRequest, 'keys'>
export interface ReplyRecoveryOperations {
  /** Caller-owned sealed journal descriptor; return at most64KiB per read. Ownership/proof are external. */
  read(signal: AbortSignal): Promise<Uint8Array | null>
  acknowledged(body: RuntimeConversationAcknowledgedRequest, signal: AbortSignal): Promise<RuntimeConversationAcknowledgement>
  observe(observation: RuntimeObservation, signal: AbortSignal): Promise<void>
  settle(body: RuntimeConversationSettleRequest, signal: AbortSignal): Promise<RuntimeConversationSettlement>
}
export interface ReplyRecoveryOptions {
  readonly scope: ReplyRecoveryScope
  readonly binding: RecoveryBinding
  readonly replyId: string
  /** Original trusted create unit, or null after erasure; then correlated immutable ACK rows supply each ordinal. */
  readonly unit: 'calls_tokens' | 'usd' | null
  readonly timeoutMs: number
  readonly maxObservations: number
  readonly signal?: AbortSignal
}
export interface ReplyRecoveryResult {
  readonly journalComplete: true
  readonly accountingVerified: boolean
  /** Database predicates only. Never proof of a settled/closed process, relay or home. */
  readonly databaseBarrier: boolean
  readonly acknowledgement: RuntimeConversationAcknowledgement
}

/**
 * One recovery pass, with one deadline across reads and API calls. There is no automatic retry or execution.
 * The owner must settle caller-owned I/O after cancellation and prove no live/future writer independently.
 * Prefix observations are always scrubbed; settlement waits for a fully validated EOF. Key collection is
 * bounded so the final acknowledgement can check the complete set atomically, not a series of partial sets.
 */
export async function recoverReplyJournal(options: ReplyRecoveryOptions, operations: ReplyRecoveryOperations): Promise<ReplyRecoveryResult> {
  const recovery = new ReplyJournalRecovery(options, { kind: 'recover', operations })
  return recovery.run()
}

/** Read-only journal/API evidence. Requires a caller-owned sealed descriptor and correlated original accounting authority.
 * Each pass needs its own descriptor/cursor. Never repairs missing observations/accounting, proves
 * process settlement, deletes or grants cleanup. Stop/receipt proof revalidation remains the caller’s duty.
 */
export async function verifyReplyJournal(options: ReplyRecoveryOptions,
    operations: Pick<ReplyRecoveryOperations, 'read' | 'acknowledged'>): Promise<ReplyRecoveryResult> {
  const verifier = new ReplyJournalRecovery(options, { kind: 'verify', operations: {
    read: signal => operations.read(signal), acknowledged: (body, signal) => operations.acknowledged(body, signal),
  } })
  return verifier.run()
}

type ReplyJournalMode = { readonly kind: 'recover'; readonly operations: ReplyRecoveryOperations } |
  { readonly kind: 'verify'; readonly operations: Pick<ReplyRecoveryOperations, 'read' | 'acknowledged'> }

class ReplyJournalRecovery {
  private readonly options: ReplyRecoveryOptions
  private readonly operations: Pick<ReplyRecoveryOperations, 'read' | 'acknowledged'>
  private readonly controller = new AbortController()
  private readonly reader: ReplyRecoveryReader
  private pending: RuntimeObservation | null = null
  private readonly observations: string[] = []
  private readonly usage: { providerCallId: string; ordinal: 1 | 2 }[] = []
  private readonly units = new Map<number, 'calls_tokens' | 'usd'>()
  private keyBytes = 0

  constructor(options: ReplyRecoveryOptions, private readonly mode: ReplyJournalMode) {
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 120_000 ||
        !Number.isSafeInteger(options.maxObservations) || options.maxObservations < 1 || options.maxObservations > 4096 ||
        options.binding.attemptId !== options.scope.identity.attemptId ||
        options.binding.authorityEpoch !== options.scope.createEpoch ||
        (options.unit !== null && options.unit !== 'calls_tokens' && options.unit !== 'usd')) throw new Error('reply_recovery_invalid')
    this.options = { ...options, binding: { ...options.binding } }
    this.operations = mode.operations
    this.reader = new ReplyRecoveryReader(options.scope, observation => {
      if (this.pending !== null) throw new Error('reply_recovery_invalid')
      this.pending = observation
    })
  }

  async run(): Promise<ReplyRecoveryResult> {
    const abort = (): void => this.controller.abort()
    const timer = setTimeout(abort, this.options.timeoutMs)
    this.options.signal?.addEventListener('abort', abort, { once: true })
    if (this.options.signal?.aborted) abort()
    try {
      await this.ack({ observations: [], usage: [], ordinals: [], hasTurnEnd: false })
      await this.read()
      const journal = this.reader.end()
      const ordinals = journal.calls.filter(call => call.admission === 'reserved').map(call => this.ordinal(call.reserve.n))
      const keys: RecoveryKeys = { observations: this.observations, usage: this.usage, ordinals, hasTurnEnd: journal.hasTurnEnd }
      const before = await this.ack(keys)
      if (this.mode.kind === 'verify') {
        const accountingVerified = this.finalAccounting(journal.calls, before)
        return { journalComplete: true, accountingVerified, databaseBarrier: accountingVerified &&
          Object.values(before.predicates).every(predicate => predicate.met), acknowledgement: before }
      }
      let accountingVerified = before.predicates.reservations.states.every(row => journal.calls.some(call => call.reserve.n === row.ordinal))
      for (const call of journal.calls) {
        if (!await this.reconcile(call, before)) accountingVerified = false
      }
      const acknowledgement = await this.ack(keys)
      accountingVerified &&= this.finalAccounting(journal.calls, acknowledgement)
      return { journalComplete: true, accountingVerified,
        databaseBarrier: accountingVerified && Object.values(acknowledgement.predicates).every(predicate => predicate.met), acknowledgement }
    } finally {
      clearTimeout(timer)
      this.options.signal?.removeEventListener('abort', abort)
      this.controller.abort()
      this.reader.dispose()
      this.pending = null
    }
  }

  private async read(): Promise<void> {
    for (;;) {
      const bytes = await this.bounded(signal => this.operations.read(signal))
      if (bytes === null) return
      if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 65_536) throw new Error('reply_recovery_invalid')
      let offset = 0
      while (offset < bytes.length) {
        const newline = bytes.indexOf(10, offset)
        const end = newline < 0 ? bytes.length : newline + 1
        this.reader.feed(bytes.subarray(offset, end))
        offset = end
        const observation = this.pending
        this.pending = null
        if (observation) await this.deliver(observation)
        if (this.controller.signal.aborted) throw new Error('reply_recovery_unconfirmed')
      }
    }
  }

  private async deliver(observation: RuntimeObservation): Promise<void> {
    const key = `${observation.runtimeUnitId}:${observation.nativeSessionId}:${observation.nativeSeq}`
    const ordinal = isRecord(observation.data) ? observation.data.ordinal : undefined
    const usage = ordinal === undefined ? [] : [{ providerCallId: `${observation.nativeSessionId}#${observation.nativeSeq}`, ordinal: this.ordinal(ordinal) }]
    this.keyBytes += Buffer.byteLength(key) + usage.reduce((sum, item) => sum + Buffer.byteLength(item.providerCallId), 0)
    if (this.observations.length >= this.options.maxObservations || this.keyBytes > 4 * LINE_BYTES) throw new Error('reply_recovery_bound')
    this.observations.push(key)
    this.usage.push(...usage)
    if (this.mode.kind === 'verify') return // Inventory only; no per-item API query or replay before complete EOF.
    const keys: RecoveryKeys = { observations: [key], usage, ordinals: [], hasTurnEnd: observation.type === 'turn/end' }
    const answer = await this.ack(keys)
    if (!answer.predicates.observations.met || !answer.predicates.usage.met) {
      const operations = this.mode.operations
      await this.bounded(signal => operations.observe(observation, signal))
    }
  }

  private async ack(keys: RecoveryKeys): Promise<RuntimeConversationAcknowledgement> {
    const request = { ...this.options.binding, keys }
    if (!wire.RuntimeConversationAcknowledgedRequest(request)) throw new Error('reply_recovery_invalid')
    const answer = await this.bounded(signal => this.operations.acknowledged(request, signal))
    if (!wire.RuntimeConversationAcknowledgement(answer)) throw new Error('reply_recovery_ack_invalid')
    this.validateAckKeys(answer, keys)
    const predicates = answer.predicates
    const states = predicates.reservations.states
    if (states.length > 2 || new Set(states.map(state => state.ordinal)).size !== states.length) throw new Error('reply_recovery_ack_invalid')
    if (!predicates.terminalState.met || ['pending', 'running'].includes(predicates.terminalState.state)) throw new Error('reply_recovery_not_terminal')
    this.retainUnits(states)
    return answer
  }

  private validateAckKeys(answer: RuntimeConversationAcknowledgement, keys: RecoveryKeys): void {
    const predicates = answer.predicates
    if (predicates.terminalState.replyId !== this.options.replyId ||
        predicates.createAnswered.commandId !== this.options.binding.commandId ||
        predicates.payloadScrubbed.commandId !== this.options.binding.commandId ||
        JSON.stringify(predicates.observations.keys) !== JSON.stringify(keys.observations) ||
        predicates.usage.keys.length !== keys.usage.length ||
        predicates.usage.keys.some((key, index) => key.providerCallId !== keys.usage[index]?.providerCallId ||
          key.ordinal !== keys.usage[index]?.ordinal)) throw new Error('reply_recovery_ack_invalid')
  }

  private retainUnits(states: RuntimeConversationAcknowledgement['predicates']['reservations']['states']): void {
    for (const row of states) {
      const known = this.units.get(row.ordinal) ?? this.options.unit
      if (known !== null && known !== row.unit) throw new Error('reply_recovery_unit_conflict')
      this.units.set(row.ordinal, row.unit)
    }
  }

  private async reconcile(call: ReplyRecoveredCall, ack: RuntimeConversationAcknowledgement): Promise<boolean> {
    const row = ack.predicates.reservations.states.find(row => row.ordinal === call.reserve.n)
    const state = row?.state
    if (call.admission !== 'reserved') return state === undefined || state === 'released'
    if (state === 'uncertain') return true // The final API predicate still requires recorded usage; no settle here.
    if (row?.state === 'settled') return this.sameUsed(call, row.used, row.unit)
    if (row?.state !== 'reserved' || call.settlement?.outcome !== 'settled' || call.settlement.used === null) return false
    const used = this.normalizedUsed(call.settlement.used, row.unit)
    const request: RuntimeConversationSettleRequest = { ...this.options.binding, ordinal: this.ordinal(call.reserve.n), used }
    return this.replaySettlement(request)
  }

  private normalizedUsed(used: { tokens: number; priceMicros: number }, unit: 'calls_tokens' | 'usd'): RuntimeConversationSettleRequest['used'] {
    return { calls: 1, tokens: unit === 'calls_tokens' ? used.tokens : 0,
      priceMicros: unit === 'usd' ? used.priceMicros : 0 }
  }

  private async replaySettlement(request: RuntimeConversationSettleRequest): Promise<boolean> {
    const used = request.used
    if (this.mode.kind !== 'recover') throw new Error('reply_recovery_read_only')
    const operations = this.mode.operations
    const receipt = await this.bounded(signal => operations.settle(request, signal))
    if (!wire.RuntimeConversationSettlement(receipt) || receipt.replyId !== this.options.replyId ||
        receipt.ordinal !== request.ordinal || receipt.unit !== this.units.get(request.ordinal) || receipt.state !== 'settled' ||
        receipt.used?.calls !== used.calls || receipt.used.tokens !== used.tokens || receipt.used.priceMicros !== used.priceMicros) throw new Error('reply_recovery_settle_unconfirmed')
    return true
  }

  private sameUsed(call: ReplyRecoveredCall, used: { calls: 1; tokens: number; priceMicros: number }, unit: 'calls_tokens' | 'usd'): boolean {
    if (call.admission !== 'reserved' || call.settlement?.outcome !== 'settled' || call.settlement.used === null) return false
    const expected = call.settlement.used
    return used.calls === 1 && used.tokens === (unit === 'calls_tokens' ? expected.tokens : 0) &&
      used.priceMicros === (unit === 'usd' ? expected.priceMicros : 0)
  }

  private finalAccounting(calls: readonly ReplyRecoveredCall[], ack: RuntimeConversationAcknowledgement): boolean {
    const states = ack.predicates.reservations.states
    if (calls.some(call => call.admission === 'reserved' && !states.some(row => row.ordinal === call.reserve.n))) return false
    return states.every(row => {
      const call = calls.find(value => value.reserve.n === row.ordinal)
      if (!call) return false
      if (row.state === 'settled') return this.sameUsed(call, row.used, row.unit)
      if (row.state === 'uncertain') return call.admission === 'reserved'
      return row.state === 'released' && call.admission !== 'reserved'
    })
  }

  private ordinal(value: unknown): 1 | 2 {
    if (value !== 1 && value !== 2) throw new Error('reply_recovery_invalid')
    return value
  }

  private async bounded<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const signal = this.controller.signal
    if (signal.aborted) throw new Error('reply_recovery_unconfirmed')
    let abort = (): void => {}
    const stopped = new Promise<never>((_resolve, reject) => {
      abort = (): void => reject(new Error('reply_recovery_unconfirmed'))
      signal.addEventListener('abort', abort, { once: true })
    })
    try { return await Promise.race([operation(signal), stopped]) }
    catch { throw new Error('reply_recovery_unconfirmed') }
    finally { signal.removeEventListener('abort', abort) }
  }
}

export interface ReplyStopBounds {
  readonly deadlineMs: number
  readonly graceMs: number
  readonly killMs: number
  readonly exitWaitMs: number
  readonly settleWaitMs: number
}
export interface ReplyStopClock {
  now(): number
  after(milliseconds: number, callback: () => void): () => void
}
export interface ReplyExitEvidence {
  readonly nonce: string
  readonly stopStartedAt: number | null
  readonly exit: { readonly code: number | null; readonly signal: NodeJS.Signals | null; readonly observedAt: number } | null
  /** Only this launcher's exit class. The exact home/nonce and no-future-writer checks are still mandatory. */
  readonly settledExit: boolean
  readonly settlementDeadline: number | null
  /** Fixed notification failure only; never a relay-closed acknowledgement. */
  readonly relayExitFailed: boolean
}
const monotonicReplyClock: ReplyStopClock = {
  now: () => performance.now(),
  after: (milliseconds, callback) => { const timer = setTimeout(callback, milliseconds); return () => clearTimeout(timer) },
}

function validateReplyStop(spawn: { readonly nonce: string; readonly startedAt: number }, bounds: ReplyStopBounds,
    clock: ReplyStopClock): void {
  if (!/^[a-f0-9]{1,200}$/.test(spawn.nonce) || !Number.isFinite(spawn.startedAt) || spawn.startedAt < 0 || spawn.startedAt > clock.now() ||
      ![bounds.deadlineMs, bounds.graceMs, bounds.killMs, bounds.exitWaitMs, bounds.settleWaitMs].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 120_000) ||
      bounds.deadlineMs < 1 || bounds.exitWaitMs < 1 || bounds.settleWaitMs < 1 || bounds.killMs < bounds.graceMs) throw new Error('reply_stop_bounds_invalid')
}

/**
 * One stop clock for a caller-owned launcher. Only control-pipe writes and the launcher's 'exit' are used;
 * never numeric signals, ChildProcess.kill, 'close' as exit proof, receipts, accounting or home deletion.
 * A late exit can improve a replay's evidence, but cannot move the original settlement deadline.
 */
type ReplyStopRelay = Pick<ReplyRelay, 'stop' | 'exited'> & { failed?(reason: 'timeout' | 'child_exited'): void }

export class ReplyChildStop {
  private readonly launcher: ChildProcess
  private readonly relay: ReplyStopRelay
  private readonly spawn: { readonly nonce: string; readonly startedAt: number }
  private readonly bounds: ReplyStopBounds
  private readonly clock: ReplyStopClock
  private readonly timers = new Map<string, () => void>()
  private stopStartedAt: number | null = null
  private settlementDeadline: number | null = null
  private exit: ReplyExitEvidence['exit'] = null
  private stopping: Promise<ReplyExitEvidence> | null = null
  private resolveStop: ((evidence: ReplyExitEvidence) => void) | null = null
  private cutoffReached = false
  private disposed = false
  private termSent = false
  private killSent = false
  private relayExitFailed = false

  constructor(launcher: ChildProcess, relay: ReplyStopRelay,
      spawn: { readonly nonce: string; readonly startedAt: number }, bounds: ReplyStopBounds,
      clock: ReplyStopClock = monotonicReplyClock) {
    validateReplyStop(spawn, bounds, clock)
    this.launcher = launcher
    this.relay = relay
    this.spawn = { ...spawn }
    this.bounds = { ...bounds }
    this.clock = clock
    launcher.on('exit', this.onExit)
    launcher.on('error', this.onError)
    launcher.stdin?.on('error', this.onControlError)
    this.schedule('deadline', spawn.startedAt + bounds.deadlineMs, () => { this.fail('timeout') })
    if (launcher.exitCode !== null || launcher.signalCode !== null) this.onExit(launcher.exitCode, launcher.signalCode)
  }

  inspect(): ReplyExitEvidence {
    const exit = this.exit === null ? null : { ...this.exit }
    return { nonce: this.spawn.nonce, stopStartedAt: this.stopStartedAt, exit,
      settledExit: !this.disposed && exit !== null && exit.signal === null && exit.code !== null &&
        [0, 69, 72, 73, 75, 76, 77].includes(exit.code), settlementDeadline: this.settlementDeadline, relayExitFailed: this.relayExitFailed }
  }

  stop(): Promise<ReplyExitEvidence> {
    if (this.disposed) return Promise.resolve(this.inspect())
    if (this.exit !== null) {
      if (this.stopStartedAt === null) {
        this.stopStartedAt = this.clock.now()
        try { void this.relay.stop().catch(() => {}) } catch { /* The exited process still has an independently owned relay tail. */ }
      }
      return Promise.resolve(this.inspect())
    }
    if (this.cutoffReached) return Promise.resolve(this.inspect())
    if (this.stopping) return this.stopping
    this.stopping = new Promise(resolve => { this.resolveStop = resolve })
    this.stopStartedAt = this.clock.now()
    this.cancel('deadline')
    // Timers are armed before writing fd3: a slow callback or backpressure must not postpone escalation.
    this.schedule('term', this.stopStartedAt + this.bounds.graceMs, () => this.control('TERM'))
    this.schedule('kill', this.stopStartedAt + this.bounds.killMs, () => this.control('KILL'))
    this.schedule('cutoff', this.stopStartedAt + this.bounds.killMs + this.bounds.exitWaitMs, () => {
      this.cutoffReached = true
      this.settlementDeadline ??= this.stopStartedAt === null ? null :
        this.stopStartedAt + this.bounds.killMs + this.bounds.exitWaitMs + this.bounds.settleWaitMs
      this.finish()
    })
    try { void this.relay.stop().catch(() => { /* The original pipe escalation remains armed. */ }) }
    catch { /* A synchronous relay failure cannot postpone the process deadline. */ }
    return this.stopping
  }

  /** Disposal is cancellation only. No receipt or settlement evidence is created by it. */
  dispose(): void {
    if (this.disposed) return
    void this.stop()
    this.control('TERM')
    this.disposed = true
    this.finish()
    try { this.launcher.stdin?.end() } catch { /* Unconfirmed pipe closure is not settlement. */ }
    this.launcher.off('exit', this.onExit)
    // Retain error consumers on the owned process/pipe until their lifetime ends; late errors prove nothing.
  }

  private readonly onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
    if (this.exit !== null || this.disposed) return
    const observedAt = this.clock.now()
    this.exit = { code, signal, observedAt }
    const cutoff = this.stopStartedAt === null ? observedAt : this.stopStartedAt + this.bounds.killMs + this.bounds.exitWaitMs
    this.settlementDeadline ??= Math.min(observedAt, cutoff) + this.bounds.settleWaitMs
    try { this.relay.exited(code === 0 && signal === null) }
    catch { this.relayExitFailed = true }
    finally { this.finish() }
  }
  private readonly onError = (): void => { this.fail('child_exited') }
  private readonly onControlError = (): void => { this.fail('child_exited') }

  private fail(reason: 'timeout' | 'child_exited'): void {
    // Exit already fixed the process evidence; late diagnostics cannot fence its draining capture.
    if (this.disposed || this.exit !== null) return
    try { this.relay.failed?.(reason) } catch { /* Diagnostics cannot cancel the original Stop clock. */ }
    void this.stop()
  }

  private control(command: 'TERM' | 'KILL'): void {
    if (this.exit !== null || this.disposed || (command === 'TERM' ? this.termSent : this.killSent)) return
    if (command === 'TERM') this.termSent = true
    else this.killSent = true
    try { this.launcher.stdin?.write(`${command}\n`, () => { /* Exit, not a write callback, is evidence. */ }) }
    catch { /* No numeric signal fallback. The existing cutoff remains authoritative. */ }
  }

  private schedule(name: string, at: number, callback: () => void): void {
    this.timers.set(name, this.clock.after(Math.max(0, at - this.clock.now()), () => { this.timers.delete(name); callback() }))
  }
  private cancel(name: string): void { this.timers.get(name)?.(); this.timers.delete(name) }
  private finish(): void {
    for (const cancel of this.timers.values()) cancel()
    this.timers.clear()
    this.resolveStop?.(this.inspect())
    this.resolveStop = null
  }
}

export interface ReplySettlementPolicy {
  readonly deadlineAt: number
  readonly requestWaitMs: number
  readonly retryWaitMs: number
  readonly maxAttempts: number
}
function validRetryPolicy(policy: ReplySettlementPolicy, clock: ReplyStopClock): boolean {
  return Number.isFinite(policy.deadlineAt) && policy.deadlineAt >= 0 && policy.deadlineAt <= clock.now() + 360_000 &&
    [policy.requestWaitMs, policy.retryWaitMs].every(value => Number.isSafeInteger(value) && value > 0 && value <= 120_000) &&
    Number.isSafeInteger(policy.maxAttempts) && policy.maxAttempts >= 1 && policy.maxAttempts <= 8
}

function isPermanentRefusal(error: unknown): boolean {
  return error instanceof TransportError && error.status !== undefined && error.status >= 400 && error.status < 500 &&
    error.status !== 408 && error.status !== 429
}

interface ReplyPendingSettlement {
  state: 'pending' | 'settled' | 'settle_unknown'
  readonly fingerprint: string
  readonly result: Promise<'settled' | 'settle_unknown'>
}

/**
 * Reply-only API settlement barrier. Callers must close admission after the bounded relay tail, then await
 * close() before posting a terminal receipt. This class never posts that receipt or proves physical settlement.
 * Retries keep the exact original body; deadline tightening, fresh calls and duplicate delivery cannot reset it.
 */
export class ReplySettlements {
  private readonly binding: RecoveryBinding
  private readonly replyId: string
  private readonly unit: 'calls_tokens' | 'usd'
  private readonly policy: ReplySettlementPolicy
  private readonly operation: ReplyRecoveryOperations['settle']
  private readonly clock: ReplyStopClock
  private readonly controller = new AbortController()
  private readonly pending = new Map<number, ReplyPendingSettlement>()
  private readonly unconfirmed = new Set<number>()
  private deadlineAt: number
  private cancelDeadline: () => void = () => {}
  private sealed = false
  private disposed = false
  private closing: Promise<{ readonly unconfirmed: readonly number[] }> | null = null

  constructor(binding: RecoveryBinding, target: { readonly replyId: string; readonly unit: 'calls_tokens' | 'usd' },
      policy: ReplySettlementPolicy, operation: ReplyRecoveryOperations['settle'], clock: ReplyStopClock = monotonicReplyClock) {
    if (!wire.RuntimeConversationSettleRequest({ ...binding, ordinal: 1, used: { calls: 1, tokens: 0, priceMicros: 0 } }) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(target.replyId) ||
        (target.unit !== 'calls_tokens' && target.unit !== 'usd') ||
        !validRetryPolicy(policy, clock)) throw new Error('reply_settlement_policy_invalid')
    this.binding = { ...binding }
    this.replyId = target.replyId
    this.unit = target.unit
    this.policy = { ...policy }
    this.operation = operation
    this.clock = clock
    this.deadlineAt = policy.deadlineAt
    this.armDeadline()
  }

  /** A process exit/stop cutoff may shorten the original upper bound, never extend it. */
  tighten(deadlineAt: number): void {
    if (!Number.isFinite(deadlineAt) || deadlineAt < 0) throw new Error('reply_settlement_policy_invalid')
    if (deadlineAt >= this.deadlineAt || this.controller.signal.aborted) return
    this.deadlineAt = deadlineAt
    this.armDeadline()
  }

  settle(value: ReplySettleLine): Promise<'settled' | 'settle_unknown'> {
    if (!isRecord(value)) throw new Error('reply_settlement_invalid')
    const line = parseSettle(value)
    if (line.n !== 1 && line.n !== 2) throw new Error('reply_settlement_invalid')
    const fingerprint = JSON.stringify({ ...line, usage: line.usage === null ? null :
      COUNT_KEYS.map(key => [key, line.usage?.[key] ?? null]) })
    const prior = this.pending.get(line.n)
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new Error('reply_settlement_conflict')
      return prior.result
    }
    if (this.sealed || this.expired()) { this.unconfirmed.add(line.n); return Promise.resolve('settle_unknown') }
    // Begin on a microtask so a synchronously re-entering transport sees the same retained promise.
    const result = Promise.resolve().then(() => this.run(line)).then(result => {
      if (result !== 'settled') this.unconfirmed.add(line.n)
      const entry = this.pending.get(line.n)
      if (entry) entry.state = result
      return result
    })
    this.pending.set(line.n, { fingerprint, result, state: 'pending' })
    return result
  }

  /** Local acknowledgement state only; never a fresh authoritative reservation inventory. */
  inspect() {
    const ordinals = [...new Set([...this.pending.keys(), ...this.unconfirmed])].sort()
    return { sealed: this.sealed, disposed: this.disposed, ordinals: ordinals.map(ordinal => ({ ordinal,
      state: this.unconfirmed.has(ordinal) ? 'settle_unknown' : this.pending.get(ordinal)?.state ?? 'settle_unknown' })) }
  }

  close(): Promise<{ readonly unconfirmed: readonly number[] }> {
    if (this.closing) return this.closing
    this.sealed = true
    this.closing = Promise.all([...this.pending.values()].map(item => item.result)).then(async () => {
      // Retry exhaustion is not a server answer: an aborted dispatch may still be committing.
      // Conservatively hold every unconfirmed outcome until the original (or shortened) bound.
      if (this.unconfirmed.size > 0) await this.waitForDeadline()
      if (this.disposed) throw new Error('reply_settlement_disposed')
      this.cancelDeadline()
      this.controller.abort()
      return { unconfirmed: [...this.unconfirmed].sort() }
    })
    return this.closing
  }

  /** Cancellation remains unconfirmed; no terminal receipt or release is performed here. */
  dispose(): void { this.disposed = true; this.sealed = true; this.cancelDeadline(); this.controller.abort() }

  private async waitForDeadline(): Promise<void> {
    const signal = this.controller.signal
    if (!signal.aborted && this.clock.now() < this.deadlineAt) {
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
    }
    if (this.disposed) throw new Error('reply_settlement_disposed')
    if (this.clock.now() < this.deadlineAt) throw new Error('reply_settlement_unconfirmed')
  }

  private expired(): boolean { return this.controller.signal.aborted || this.clock.now() >= this.deadlineAt }
  private armDeadline(): void {
    this.cancelDeadline()
    if (this.clock.now() >= this.deadlineAt) { this.controller.abort(); return }
    this.cancelDeadline = this.clock.after(this.deadlineAt - this.clock.now(), () => this.controller.abort())
  }

  private async run(line: ReplySettleLine): Promise<'settled' | 'settle_unknown'> {
    if (line.outcome !== 'settled' || line.used === null || (line.n !== 1 && line.n !== 2)) return 'settle_unknown'
    const used = Object.freeze({ calls: 1 as const, tokens: this.unit === 'calls_tokens' ? line.used.tokens : 0,
      priceMicros: this.unit === 'usd' ? line.used.priceMicros : 0 })
    const body = Object.freeze({ ...this.binding, ordinal: line.n, used })
    for (let attempt = 0; attempt < this.policy.maxAttempts && !this.expired(); attempt++) {
      const result = await this.request(body)
      if (result === 'settled') return 'settled'
      if (result === 'settle_unknown') return result
      if (attempt + 1 < this.policy.maxAttempts) await this.backoff()
    }
    return 'settle_unknown'
  }

  private async request(body: RuntimeConversationSettleRequest): Promise<'settled' | 'settle_unknown' | 'retry'> {
    const controller = new AbortController()
    const abort = (): void => controller.abort()
    const parent = this.controller.signal
    parent.addEventListener('abort', abort, { once: true })
    let cancelRequest = (): void => {}
    let cancelAbort = (): void => {}
    try {
      if (this.expired()) return 'settle_unknown'
      const stopped = new Promise<never>((_resolve, reject) => {
        const rejectAbort = (): void => reject(new Error('reply_settlement_unconfirmed'))
        controller.signal.addEventListener('abort', rejectAbort, { once: true })
        cancelAbort = () => controller.signal.removeEventListener('abort', rejectAbort)
      })
      cancelRequest = this.clock.after(Math.min(this.policy.requestWaitMs, this.deadlineAt - this.clock.now()), abort)
      const receipt = await Promise.race([this.operation(body, controller.signal), stopped])
      if (this.expired() || controller.signal.aborted) return 'settle_unknown'
      return this.validReceipt(receipt, body) ? 'settled' : 'settle_unknown'
    } catch (error: unknown) {
      if (this.expired()) return 'settle_unknown'
      if (isPermanentRefusal(error)) return 'settle_unknown'
      return 'retry'
    } finally {
      cancelRequest(); cancelAbort(); parent.removeEventListener('abort', abort); controller.abort()
    }
  }

  private validReceipt(value: unknown, body: RuntimeConversationSettleRequest): boolean {
    return wire.RuntimeConversationSettlement(value) && value.replyId === this.replyId && value.ordinal === body.ordinal &&
      value.state === 'settled' && value.unit === this.unit && value.used !== null && value.used.calls === body.used.calls &&
      value.used.tokens === body.used.tokens && value.used.priceMicros === body.used.priceMicros
  }

  private backoff(): Promise<void> {
    const signal = this.controller.signal
    if (this.expired()) return Promise.resolve()
    return new Promise(resolve => {
      let cancel = (): void => {}
      const finish = (): void => { cancel(); signal.removeEventListener('abort', finish); resolve() }
      signal.addEventListener('abort', finish, { once: true })
      cancel = this.clock.after(Math.min(this.policy.retryWaitMs, this.deadlineAt - this.clock.now()), finish)
    })
  }
}

export interface ReplyChildOptions {
  readonly launcher: ChildProcess
  readonly stream: Duplex
  readonly identity: ReplyIdentity
  readonly spawn: { readonly nonce: string; readonly startedAt: number }
  readonly binding: RecoveryBinding
  readonly target: { readonly replyId: string; readonly unit: 'calls_tokens' | 'usd' }
  readonly bounds: ReplyStopBounds
  readonly settlement: Omit<ReplySettlementPolicy, 'deadlineAt'>
}
export interface ReplyChildOperations extends Omit<ReplyRelayOperations, 'settle'> {
  settle: ReplyRecoveryOperations['settle']
}

/**
 * Parent-side composition for one already-owned launcher. Claim, spawn, start/go authorization, bounded
 * observation/reserve transport, scoped home proof and actual receipts remain the caller's responsibilities.
 * A receipt barrier waits for the parsed fd3 tail or the one settlement deadline before sealing intake.
 * It reports unresolved relay/process evidence honestly; it never asserts cleanup or physical containment.
 */
type ReplyTerminalCause = 'completed' | 'stopped' | 'disposed' | 'timeout' | 'relay_invalid' | 'child_exited'

export class ReplyChild {
  private readonly binding: RecoveryBinding
  private readonly nonce: string
  private readonly preparationDeadline: number
  private readonly journalTarget: ReplyChildOptions['target']
  private readonly journalIdentity: ReplyIdentity
  private journalScope: ReplyRecoveryScope | null = null
  private terminalCause: ReplyTerminalCause | null = null
  private terminalWake: (() => void) | null = null
  private terminalPending: ReturnType<ReplyChild['finishTerminal']> | null = null
  private cancelTailDeadline: () => void = () => {}
  private preparationStarted = false
  private readiness: 'waiting' | 'ready' | 'failed' = 'waiting'
  private readonly readinessListeners = new Set<() => void>()
  private readonly stream: Duplex
  private readonly relay: ReplyRelay
  private stopping: ReplyChildStop | null = null
  private readonly settlements: ReplySettlements
  private readonly launcher: ChildProcess
  private readonly clock: ReplyStopClock
  private readonly controller = new AbortController()
  private deadlineAt: number
  private disposed = false

  constructor(options: ReplyChildOptions, operations: ReplyChildOperations, clock: ReplyStopClock = monotonicReplyClock) {
    // Refuse invalid configuration before adopting streams or installing any timer/listener.
    validateReplyStop(options.spawn, options.bounds, clock)
    if (options.identity.attemptId !== options.binding.attemptId ||
        options.identity.nativeSessionId !== `sophia-${options.binding.attemptId}` ||
        !wire.RuntimeObservation({ ...options.identity, nativeSeq: 0, durable: true, type: 'turn/start', data: {} })) {
      throw new Error('reply_child_identity_invalid')
    }
    this.binding = Object.freeze({ ...options.binding })
    this.journalTarget = Object.freeze({ ...options.target })
    this.journalIdentity = Object.freeze({ ...options.identity })
    this.nonce = options.spawn.nonce
    this.preparationDeadline = options.spawn.startedAt + options.bounds.deadlineMs
    this.stream = options.stream
    this.launcher = options.launcher
    this.clock = clock
    this.deadlineAt = options.spawn.startedAt + options.bounds.deadlineMs + options.bounds.killMs +
      options.bounds.exitWaitMs + options.bounds.settleWaitMs
    this.settlements = new ReplySettlements(options.binding, options.target,
      { ...options.settlement, deadlineAt: this.deadlineAt }, operations.settle, clock)
    this.relay = new ReplyRelay(options.stream, { ...options.identity }, {
      observe: (observation, signal) => operations.observe(observation, signal),
      reserve: (line, signal) => operations.reserve(line, signal),
      settle: line => this.settlements.settle(line),
      status: (status, code) => {
        this.readiness = status
        try { operations.status(status, code) }
        catch { this.readiness = 'failed'; this.markTerminal('child_exited'); void this.stopping?.stop() }
        this.notifyReadiness()
      },
      completed: () => this.markTerminal('completed'),
      fenced: code => {
        this.markTerminal(code)
        this.readiness = 'failed'
        this.notifyReadiness()
        try { operations.fenced(code) } catch { /* Diagnostics cannot interrupt cancellation. */ }
        void this.stopping?.stop()
      },
    })
    try { this.stopping = new ReplyChildStop(options.launcher, {
      stop: () => this.relay.stop(), exited: clean => this.relay.exited(clean), failed: reason => this.markTerminal(reason),
    }, options.spawn, options.bounds, clock) }
    catch (error: unknown) { this.settlements.dispose(); this.relay.fence(); throw error }
    this.launcher.on('exit', this.onExit)
    this.onExit() // An already-exited launcher is observed during ReplyChildStop construction.
  }

  /** One validated start frame, then actual parsed ready. This never grants API-go or dispatches a prompt. */
  async prepare(start: unknown, scope: ReplyControlScope, signal: AbortSignal): Promise<void> {
    this.assertLive()
    if (this.preparationStarted || this.readiness !== 'waiting' || signal.aborted ||
        this.clock.now() >= this.preparationDeadline || this.stopController().inspect().exit !== null) throw new Error('reply_prepare_invalid')
    const data = this.startData(start, scope)
    this.journalScope = structuredClone({ identity: this.journalIdentity, control: scope, createEpoch: this.binding.authorityEpoch })
    this.preparationStarted = true
    try {
      await this.sendAndAwaitReady(data, signal)
      if (signal.aborted || !this.canRelease()) throw new Error('reply_prepare_unconfirmed')
    }
    catch { void this.stopController().stop(); throw new Error('reply_prepare_unconfirmed') }
  }

  /** Source-owned launch location plus settled local lifecycle; not lease, journal or deletion proof. */
  liveRetirementScope(): ReplyLiveRetirementScope | null {
    const provenance = childLaunchProvenance.get(this), evidence = this.stopController().inspect()
    if (!provenance || this.disposed || !this.journalScope || this.relay.state !== 'closed' ||
        !evidence.settledExit || evidence.nonce !== provenance.nonce || evidence.relayExitFailed ||
        this.launcher !== provenance.launcher || this.stream !== provenance.stream ||
        this.launcher.pid !== provenance.pid || this.nonce !== provenance.nonce) return null
    return Object.freeze({ root: provenance.root, pid: provenance.pid, nonce: provenance.nonce,
      scope: structuredClone(this.journalScope), binding: this.binding, target: this.journalTarget })
  }

  /** Actual validated start identity and local relay closure only; never physical home proof. */
  matchesJournalScope(scope: ReplyRecoveryScope, target: ReplyChildOptions['target']): boolean {
    return this.journalTarget.replyId === target.replyId && this.journalTarget.unit === target.unit &&
      !this.disposed && this.relay.state === 'closed' && this.journalScope !== null &&
      journalScopeKey(this.journalScope) === journalScopeKey(scope)
  }

  private startData(start: unknown, scope: ReplyControlScope): string {
    if (scope.attemptId !== this.binding.attemptId || scope.nonce !== this.nonce) throw new Error('reply_prepare_invalid')
    let epoch: number | null = null
    const reader = new ReplyControlReader(scope, frame => { if (frame.t === 'start') epoch = frame.epoch })
    try {
      const data = JSON.stringify(start) + '\n'
      if (Buffer.byteLength(data) >= 2 * LINE_BYTES) throw new Error('reply_prepare_invalid')
      reader.feed(Buffer.from(data))
      if (reader.state !== 'started' || epoch !== this.binding.authorityEpoch) throw new Error('reply_prepare_invalid')
      return data
    } catch { throw new Error('reply_prepare_invalid') }
    finally { reader.end() }
  }

  private sendAndAwaitReady(data: string, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      let written = false, finished = false
      let cancel = (): void => {}
      const finish = (ok: boolean): void => {
        if (finished) return
        finished = true
        cancel()
        this.readinessListeners.delete(check)
        signal.removeEventListener('abort', fail)
        this.controller.signal.removeEventListener('abort', fail)
        this.launcher.off('exit', fail)
        if (ok) resolve(); else reject(new Error('reply_prepare_unconfirmed'))
      }
      const fail = (): void => finish(false)
      const check = (): void => {
        if (signal.aborted || this.disposed || this.readiness === 'failed' ||
            this.clock.now() >= this.preparationDeadline || this.relay.state !== 'live') fail()
        else if (written && this.readiness === 'ready') finish(true)
      }
      this.readinessListeners.add(check)
      signal.addEventListener('abort', fail, { once: true })
      this.controller.signal.addEventListener('abort', fail, { once: true })
      this.launcher.once('exit', fail)
      cancel = this.clock.after(Math.max(0, this.preparationDeadline - this.clock.now()), fail)
      check()
      if (finished) return
      try {
        if (this.stream.destroyed || this.stream.writableEnded) return fail()
        this.stream.write(data, error => { if (error) fail(); else { written = true; check() } })
      } catch { fail() }
    })
  }

  private notifyReadiness(): void { for (const notify of this.readinessListeners) notify() }

  /** The caller must first obtain the API's committed go for this original create identity. */
  go(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('reply_child_disposed'))
    if (!this.canRelease()) return Promise.reject(new Error('reply_child_not_ready'))
    return this.relay.go()
  }
  private canRelease(): boolean {
    return !this.disposed && this.readiness === 'ready' && this.relay.state === 'live' &&
      this.stopController().inspect().exit === null && this.clock.now() < this.preparationDeadline
  }
  matchesBinding(binding: RuntimeConversationClaimRequest): boolean {
    return binding.attemptId === this.binding.attemptId && binding.commandId === this.binding.commandId &&
      binding.authorityEpoch === this.binding.authorityEpoch && binding.leaseId === this.binding.leaseId
  }
  retryDelivery(): void { if (!this.disposed) this.relay.retry() }
  inspect() { return { process: this.stopController().inspect(), relay: this.relay.inspect() } }

  /** Fixed local facts for a content-free receipt; omit nonce, paths, deadlines and provider data. */
  status() {
    const process = this.stopController().inspect()
    return { readiness: this.readiness, process: { exit: process.exit, settledExit: process.settledExit,
      relayExitFailed: process.relayExitFailed }, relay: this.relay.inspect(), settlements: this.settlements.inspect() }
  }

  async stopForReceipt() {
    this.assertLive()
    this.markTerminal('stopped')
    this.readiness = 'failed'
    this.notifyReadiness()
    await this.stopController().stop()
    this.assertLive()
    this.onExit()
    // EOF means all frames have been parsed, including settlements that bypass blocked observations.
    // An invalid or unreadable tail instead consumes the same bound and keeps the relay unresolved.
    while (!this.relay.inspect().eof && this.clock.now() < this.deadlineAt) await this.waitForTail()
    this.assertLive()
    const settlements = await this.settlements.close()
    this.assertLive()
    return { ...this.inspect(), settlements }
  }

  /** First cause is retained before go; completion never fences valid answer capture or sends Stop. */
  terminal() {
    this.terminalPending ??= this.finishTerminal()
    return this.terminalPending
  }

  private async finishTerminal() {
    if (this.terminalCause === null) await new Promise<void>(resolve => { this.terminalWake = resolve })
    this.assertLive()
    const outcome = this.terminalCause
    if (outcome === 'stopped') return { outcome, evidence: null }
    if (outcome === 'completed') {
      const settlements = await this.settlements.close()
      this.assertLive()
      return { outcome, evidence: { ...this.inspect(), settlements } }
    }
    if (outcome === null || outcome === 'disposed') throw new Error('reply_terminal_unconfirmed')
    const evidence = await this.stopForReceipt()
    return { outcome, evidence }
  }

  private markTerminal(cause: ReplyTerminalCause): void {
    if (this.terminalCause !== null) return
    this.terminalCause = cause
    this.cancelTailDeadline()
    this.terminalWake?.()
    this.terminalWake = null
  }

  /** Cancellation only; callers must not convert disposal into a receipt or deletion acknowledgement. */
  dispose(): void {
    if (this.disposed) return
    this.markTerminal('disposed')
    this.disposed = true
    this.controller.abort()
    this.stopping?.dispose()
    this.settlements.dispose()
    this.relay.fence()
    this.stream.destroy()
    this.launcher.off('exit', this.onExit)
  }

  private readonly onExit = (): void => {
    const deadline = this.stopping?.inspect().settlementDeadline
    if (deadline === null || deadline === undefined || deadline >= this.deadlineAt) return
    this.deadlineAt = deadline
    this.settlements.tighten(deadline)
    if (this.terminalCause === null) {
      this.cancelTailDeadline()
      this.cancelTailDeadline = this.clock.after(Math.max(0, deadline - this.clock.now()), () => {
        this.markTerminal('timeout')
        void this.stopping?.stop()
      })
    }
  }
  private assertLive(): void { if (this.disposed) throw new Error('reply_child_disposed') }
  private stopController(): ReplyChildStop {
    if (this.stopping === null) throw new Error('reply_child_uninitialized')
    return this.stopping
  }
  private waitForTail(): Promise<void> {
    const signal = this.controller.signal
    if (signal.aborted) return Promise.reject(new Error('reply_child_disposed'))
    return new Promise(resolve => {
      let cancel = (): void => {}
      const finish = (): void => { cancel(); signal.removeEventListener('abort', finish); resolve() }
      signal.addEventListener('abort', finish, { once: true })
      cancel = this.clock.after(Math.min(10, Math.max(0, this.deadlineAt - this.clock.now())), finish)
    })
  }
}

export interface ReplyAdmissionOperations {
  /** Release retained input on every terminal/cancellation path; authority snapshots remain content-free. */
  releaseInput?(): void
  claim(binding: RuntimeConversationClaimRequest, signal: AbortSignal): Promise<RuntimeConversationClaimReply>
  authorize(binding: RuntimeConversationClaimRequest, signal: AbortSignal): Promise<RuntimeConversationGoReply>
  /** Synchronous ownership transfer; the launcher must not execute a prompt before child.go(). */
  spawn(binding: RuntimeConversationClaimRequest): ReplyChild
  /** Send the trusted start packet and await this child's parsed ready; no provider dispatch here. */
  prepare(child: ReplyChild, signal: AbortSignal): Promise<void>
}
export type ReplyAdmissionState = 'idle' | 'claiming' | 'preparing' | 'authorizing' | 'released' | 'refused' | 'unresolved' | 'stopped'
type ReplyAdmissionPoint = 'not_started' | 'claim' | 'spawn' | 'prepare' | 'authorize' | 'dispatch' | 'released'
type ReplyCreateDecision = { readonly stage: 'delivered' | 'rejected' | 'outcome_unknown'; readonly reason: string | null }
function createReplyReceipt(binding: RuntimeConversationClaimRequest, decision: ReplyCreateDecision | { stage: 'checked'; reason: string | null } | { stage: 'failed'; reason: string }, sessionId: string | null): RuntimeReceipt {
  const receipt = { ...decision, commandId: binding.commandId, attemptId: binding.attemptId,
    nativeSessionId: sessionId, nativeSequence: null, evidenceRefs: Object.freeze<string[]>([]), observedAt: new Date().toISOString() }
  if (!wire.RuntimeReceipt(receipt)) throw new Error('reply_receipt_invalid')
  return Object.freeze(receipt)
}

type ReplyAdmissionCleanup = { readonly result: 'observed'; readonly evidence: Awaited<ReturnType<ReplyChild['stopForReceipt']>> } |
  { readonly result: 'unresolved' }

/**
 * One local create admission, one claim and one launch. The API supplies durable cross-restart exclusion.
 * A lost claim/go reply never retries or dispatches. Callers retain this object for local replays, and must
 * await cleanup separately before considering a receipt. It proves neither physical containment nor deletion.
 * Trusted launch/start wiring is supplied by the owner; this class does not construct it or enable a profile.
 */
export class ReplyAdmission {
  private readonly binding: RuntimeConversationClaimRequest
  private readonly controller = new AbortController()
  private child: ReplyChild | null = null
  private phase: ReplyAdmissionState = 'idle'
  private pending: Promise<ReplyAdmissionState> | null = null
  private cleanup: Promise<ReplyAdmissionCleanup> | null = null
  private point: ReplyAdmissionPoint = 'not_started'
  private refusal: string | null = null
  private receiptPending: Promise<RuntimeReceipt> | null = null
  private terminalPending: Promise<RuntimeReceipt | null> | null = null
  private disposed = false

  constructor(binding: RuntimeConversationClaimRequest, private readonly timeoutMs: number,
      private readonly operations: ReplyAdmissionOperations, private readonly clock: ReplyStopClock = monotonicReplyClock) {
    if (!wire.RuntimeConversationClaimRequest(binding) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
      throw new Error('reply_admission_invalid')
    }
    this.binding = Object.freeze({ ...binding })
  }

  get state(): ReplyAdmissionState { return this.phase }
  status() {
    return { state: this.phase, launchEntered: !this.neverLaunched(), spawnFenced: this.stopEvidence().spawnFenced,
      child: this.child?.status() ?? null }
  }
  matchesBinding(binding: RuntimeConversationClaimRequest): boolean {
    return this.binding.attemptId === binding.attemptId && this.binding.commandId === binding.commandId &&
      this.binding.authorityEpoch === binding.authorityEpoch && this.binding.leaseId === binding.leaseId
  }
  settlement(): Promise<ReplyAdmissionCleanup> | null { return this.cleanup }
  liveRetirementScope(): ReplyLiveRetirementScope | null {
    return this.disposed ? null : this.child?.liveRetirementScope() ?? null
  }

  /** Current owned-handle state only; never a physical home/descendant proof. */
  stopEvidence() {
    const process = this.child?.inspect().process ?? null
    const launchNeverEntered = this.neverLaunched()
    const noPendingSpawn = this.child !== null || launchNeverEntered
    return { process, launchNeverEntered, recoveryRequired: this.child === null && this.point !== 'not_started',
      spawnFenced: !this.disposed && this.phase === 'stopped' && this.controller.signal.aborted &&
      noPendingSpawn && (this.child === null || process?.exit !== null) }
  }

  private neverLaunched(): boolean { return this.point === 'not_started' || this.point === 'claim' }

  matchesJournalScope(scope: ReplyRecoveryScope, target: ReplyChildOptions['target']): boolean {
    return !this.disposed && this.child?.matchesJournalScope(scope, target) === true
  }

  run(): Promise<ReplyAdmissionState> {
    // Replays return the original admission outcome; current Stop evidence is state + settlement().
    // Schedule once before entering caller code, which may reenter run().
    this.pending ??= Promise.resolve().then(() => this.admit())
    return this.pending
  }

  /** A validated receipt candidate only. No transport, persistent acknowledgement or cleanup authority. */
  createReceipt(): Promise<RuntimeReceipt> {
    this.receiptPending ??= Promise.resolve().then(() => this.buildReceipt())
    return this.receiptPending
  }

  /** Historical delivered admission only; unresolved accounting never becomes a fallback receipt. */
  terminalReceipt(): Promise<RuntimeReceipt | null> {
    this.terminalPending ??= Promise.resolve().then(() => this.buildTerminalReceipt())
    return this.terminalPending
  }

  private async buildTerminalReceipt(): Promise<RuntimeReceipt | null> {
    if (await this.run() !== 'released') return null
    const terminal = await this.ownedChild().terminal()
    if (this.disposed) throw new Error('reply_admission_disposed')
    if (this.phase === 'stopped' || terminal.outcome === 'completed' || terminal.outcome === 'stopped') return null
    return createReplyReceipt(this.binding, { stage: 'failed', reason: terminal.outcome }, `sophia-${this.binding.attemptId}`)
  }

  stop(): void {
    this.phase = 'stopped'
    this.controller.abort()
    this.stopChild()
    this.releaseInput()
  }

  /** Owner shutdown, not Stop settlement: close the owned child without fabricating cleanup proof. */
  dispose(): void {
    this.disposed = true
    this.stop()
    this.child?.dispose()
  }

  private async admit(): Promise<ReplyAdmissionState> {
    const cancel = this.clock.after(this.timeoutMs, () => this.controller.abort())
    try {
      this.phase = this.controller.signal.aborted ? 'stopped' : 'claiming'
      this.assertLive()
      this.point = 'claim'
      const claim = await this.bounded(signal => this.operations.claim(this.binding, signal))
      if (!wire.RuntimeConversationClaimReply(claim)) throw new Error('reply_admission_invalid')
      if (claim.result !== 'first') { this.refusal = claim.code; this.phase = 'refused'; return this.phase }
      this.assertLive()
      this.point = 'spawn'
      this.child = this.operations.spawn(this.binding)
      // A synchronous ownership transfer can reenter disposal before returning its handle.
      if (this.disposed) this.child.dispose()
      this.assertLive()
      if (!this.child.matchesBinding(this.binding)) throw new Error('reply_admission_binding_mismatch')
      this.phase = 'preparing'
      this.point = 'prepare'
      await this.bounded(signal => this.operations.prepare(this.ownedChild(), signal))
      this.phase = 'authorizing'
      this.point = 'authorize'
      const go = await this.bounded(signal => this.operations.authorize(this.binding, signal))
      if (!wire.RuntimeConversationGoReply(go)) throw new Error('reply_admission_invalid')
      if (go.result !== 'go') { this.refusal = go.code; this.phase = 'refused'; this.stopChild(); return this.phase }
      this.point = 'dispatch'
      await this.bounded(() => this.ownedChild().go())
      this.point = 'released'
      this.phase = 'released'
    } catch {
      if (this.phase !== 'stopped') this.phase = 'unresolved'
      this.controller.abort()
      this.stopChild()
    } finally { cancel(); this.releaseInput() }
    return this.phase
  }

  private releaseInput(): void {
    try { this.operations.releaseInput?.() }
    catch {
      this.refusal = 'input_release_unconfirmed'
      this.phase = 'unresolved'
      this.controller.abort()
      this.stopChild()
    }
  }

  private async buildReceipt(): Promise<RuntimeReceipt> {
    const outcome = await this.run()
    // A historical delivered result survives later Stop. Terminal failures wait for the original barrier.
    const cleanup = outcome === 'released' ? null : await this.cleanup
    const decision = outcome === 'released' ? { stage: 'delivered' as const, reason: null } : this.failureDecision(cleanup)
    return createReplyReceipt(this.binding, decision, this.child === null ? null : `sophia-${this.binding.attemptId}`)
  }

  private refusalReason(fallback: string): string { return this.refusal ?? fallback }

  private failureDecision(cleanup: ReplyAdmissionCleanup | null): ReplyCreateDecision {
    const unknown = (reason: string): ReplyCreateDecision => ({ stage: 'outcome_unknown', reason })
    if (this.point === 'not_started') return { stage: 'rejected', reason: 'cancelled_before_claim' }
    if (this.point === 'claim') return unknown(this.refusalReason('claim_unconfirmed'))
    if (this.point === 'spawn') return unknown('spawn_unconfirmed')
    if (cleanup?.result !== 'observed') return unknown('cleanup_unconfirmed')
    if (cleanup.evidence.process.exit === null) return unknown('process_unconfirmed')
    if (cleanup.evidence.process.exit.code === 71) return unknown('home_exists')
    if (this.point === 'dispatch' || this.point === 'released') return unknown('go_write_unconfirmed')
    return { stage: 'rejected', reason: this.point === 'authorize' ? this.refusalReason('go_unconfirmed') : 'setup_unconfirmed' }
  }

  private ownedChild(): ReplyChild {
    if (this.child === null) throw new Error('reply_admission_unowned')
    return this.child
  }
  private assertLive(): void {
    if (this.controller.signal.aborted) throw new Error('reply_admission_stopped')
  }
  private stopChild(): void {
    if (this.child === null || this.cleanup !== null) return
    this.cleanup = this.child.stopForReceipt().then(
      evidence => ({ result: 'observed', evidence }), () => ({ result: 'unresolved' }))
  }
  private async bounded<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const signal = this.controller.signal
    this.assertLive()
    let abort = (): void => {}
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new Error('reply_admission_stopped'))
      signal.addEventListener('abort', abort, { once: true })
    })
    try {
      const value = await Promise.race([operation(signal), cancelled])
      this.assertLive()
      return value
    } finally { signal.removeEventListener('abort', abort) }
  }
}


export interface ReplyRegistryOwner {
  readonly projectId: string
  readonly resourceId: string
  readonly runtimeUnitId: string
  readonly leaseId: string
}
export interface ReplyHomeCheckScope extends ReplyRegistryOwner {
  readonly repliesDir: string
  readonly currentRoot: string
  readonly attemptId: string
}
export interface ReplyHomeVerification {
  readonly repliesDir: string
  readonly currentRoot: string
  readonly waitMs: number
  /** Future qualified launcher adapter: scan all roots, drain admissions and verify locks/process identities.
   * Synthetic callbacks are L1 only. Return only after checker exit and complete bounded stdout capture. */
  readonly check: (scope: ReplyHomeCheckScope, signal: AbortSignal) => Promise<unknown>
}
export interface ReplyCheckerOptions {
  readonly python: string
  readonly launcher: string
  readonly repliesDir: string
  readonly currentRoot: string
  readonly waitMs: number
}
function checkerPath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && !value.includes('\0') &&
    isAbsolute(value) && resolve(value) === value
}
function checkerOptions(value: ReplyCheckerOptions): Readonly<ReplyCheckerOptions> {
  if (![value.python, value.launcher, value.repliesDir, value.currentRoot].every(checkerPath) ||
      !canonicalReplyRoot(value.currentRoot, value.repliesDir) || !basename(value.currentRoot).startsWith('gen-') ||
      !Number.isSafeInteger(value.waitMs) || value.waitMs < 1 || value.waitMs > 120_000) {
    throw new Error('reply_checker_options_invalid')
  }
  return Object.freeze({ ...value })
}

/** A checker owns only its pipes. Abort refuses proof, never numeric-signals a process or abandons ownership. */
class ReplyCheckerProcess {
  private invalid = false
  private stdoutBytes = 0
  private stderrBytes = 0
  private readonly chunks: Buffer[] = []
  private stdoutEnded = false
  private stderrEnded = false
  private readonly abort = () => { this.invalid = true }
  constructor(private readonly child: ChildProcess, private readonly signal: AbortSignal) {}

  result(): Promise<unknown> {
    this.signal.addEventListener('abort', this.abort, { once: true })
    if (this.signal.aborted) this.abort()
    return new Promise(resolve => {
      this.child.on('error', this.abort)
      this.child.stdout?.on('error', this.abort)
      this.child.stderr?.on('error', this.abort)
      this.child.stdout?.on('data', (chunk: Buffer) => this.stdout(chunk))
      this.child.stderr?.on('data', (chunk: Buffer) => this.stderr(chunk))
      this.child.stdout?.once('end', () => { this.stdoutEnded = true })
      this.child.stderr?.once('end', () => { this.stderrEnded = true })
      // close follows actual exit AND stdio closure, including failed-spawn close.
      this.child.once('close', (code, signal) => {
        this.signal.removeEventListener('abort', this.abort)
        resolve(this.closed(code, signal))
      })
    })
  }
  private stdout(chunk: Buffer): void {
    this.stdoutBytes += chunk.length
    if (this.stdoutBytes > 65_536) { this.invalid = true; this.chunks.length = 0 }
    else if (!this.invalid) this.chunks.push(chunk)
  }
  private stderr(chunk: Buffer): void {
    this.stderrBytes += chunk.length
    if (this.stderrBytes > 8192) { this.invalid = true; this.chunks.length = 0 }
  }
  private closed(code: number | null, signal: NodeJS.Signals | null): unknown {
    if (this.invalid || this.signal.aborted || !this.stdoutEnded || !this.stderrEnded || code !== 0 || signal !== null) {
      this.chunks.length = 0
      return { code: 74, signal: null, stdout: '' }
    }
    try {
      const stdout = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(this.chunks))
      return { code, signal, stdout }
    } catch { return { code: 74, signal: null, stdout: '' } }
    finally { this.chunks.length = 0 }
  }
}

/** Explicit fixed launch configuration; active ownership outlives an outer timeout until close/EOF. */
export function replyHomeVerification(value: ReplyCheckerOptions): ReplyHomeVerification {
  const options = checkerOptions(value), active = new Map<string, Promise<unknown>>()
  const check = (scope: ReplyHomeCheckScope, signal: AbortSignal): Promise<unknown> => {
    const attemptId = scope.attemptId
    if (scope.repliesDir !== options.repliesDir || scope.currentRoot !== options.currentRoot ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(attemptId) ||
        signal.aborted || active.has(attemptId) || active.size >= 2) {
      return Promise.reject(new Error('reply_checker_scope_unavailable'))
    }
    const operation = Promise.resolve().then(() => {
      if (signal.aborted) throw new Error('reply_checker_aborted')
      const child = spawn(options.python, ['-I', '-B', options.launcher, 'check', '--replies', options.repliesDir,
        '--attempt', attemptId], { cwd: '/', env: { SOPHIA_REPLY_ROOT: options.currentRoot },
        stdio: ['ignore', 'pipe', 'pipe'], shell: false })
      return new ReplyCheckerProcess(child, signal).result()
    }).finally(() => { active.delete(attemptId) })
    active.set(attemptId, operation)
    return operation
  }
  return Object.freeze({ repliesDir: options.repliesDir, currentRoot: options.currentRoot, waitMs: options.waitMs, check })
}

function canonicalReplyRoot(root: unknown, repliesDir: string): root is string {
  return typeof root === 'string' && isAbsolute(root) && resolve(root) === root && dirname(root) === repliesDir &&
    /^(gen|sealed)-[A-Za-z0-9_-]{1,100}$/.test(basename(root))
}
function homeCheckLines(value: unknown): string[] | null {
  if (!isRecord(value) || !closed(value, ['code', 'signal', 'stdout']) || value.code !== 0 || value.signal !== null ||
      typeof value.stdout !== 'string' || Buffer.byteLength(value.stdout) > 65_536 || !value.stdout.endsWith('\n')) return null
  const lines = value.stdout.slice(0, -1).split('\n')
  return lines.length <= 256 ? lines : null
}
interface ReplyHomeReport { readonly root: string; readonly state: string; readonly reason: unknown }
function homeCheckReport(line: string, scope: ReplyHomeCheckScope): ReplyHomeReport | null {
  const report: unknown = JSON.parse(line)
  if (!isRecord(report) || !closed(report, ['attemptId', 'root', 'state', 'reason']) ||
      report.attemptId !== scope.attemptId || !canonicalReplyRoot(report.root, scope.repliesDir) ||
      typeof report.state !== 'string' || !['gone', 'absent', 'empty'].includes(report.state) || !label(report.reason)) return null
  return Object.freeze({ root: report.root, state: report.state, reason: report.reason })
}
function homeCheckReports(value: unknown, scope: ReplyHomeCheckScope): readonly ReplyHomeReport[] | null {
  const lines = homeCheckLines(value)
  if (lines === null) return null
  const roots = new Set<string>(), reports: ReplyHomeReport[] = []
  let homes = 0
  for (const line of lines) {
    const report = homeCheckReport(line, scope)
    if (report === null || roots.has(report.root)) return null
    roots.add(report.root); reports.push(report)
    if (report.state !== 'absent') homes++
  }
  return roots.has(scope.currentRoot) && homes <= 1 ? Object.freeze(reports) : null
}

/** Bounded fresh checks, retaining timed-out I/O until actual settlement so replay cannot overlap it. */
class ReplyHomeChecks {
  private readonly options: ReplyHomeVerification
  private readonly active = new Map<string, AbortController>()
  private disposed = false
  constructor(options: ReplyHomeVerification, private readonly clock: ReplyStopClock) {
    if (!isAbsolute(options.repliesDir) || resolve(options.repliesDir) !== options.repliesDir ||
        !canonicalReplyRoot(options.currentRoot, options.repliesDir) || !basename(options.currentRoot).startsWith('gen-') ||
        !Number.isSafeInteger(options.waitMs) || options.waitMs < 1 || options.waitMs > 120_000 || typeof options.check !== 'function') {
      throw new Error('reply_home_verification_invalid')
    }
    this.options = Object.freeze({ ...options })
  }
  async check(owner: ReplyRegistryOwner, attemptId: string): Promise<boolean> {
    return await this.report(owner, attemptId) !== null
  }
  report(owner: ReplyRegistryOwner, attemptId: string): Promise<readonly ReplyHomeReport[] | null> {
    if (this.disposed || this.active.has(attemptId)) return Promise.resolve(null)
    const controller = new AbortController()
    this.active.set(attemptId, controller)
    const scope = Object.freeze({ ...owner, attemptId, repliesDir: this.options.repliesDir, currentRoot: this.options.currentRoot })
    return this.run(scope, controller)
  }
  dispose(): void { this.disposed = true; for (const controller of this.active.values()) controller.abort() }
  private async run(scope: ReplyHomeCheckScope, controller: AbortController): Promise<readonly ReplyHomeReport[] | null> {
    let cancel = (): void => {}, abort = (): void => {}
    const timeout = new Promise<readonly ReplyHomeReport[] | null>(resolve => {
      abort = () => resolve(null)
      controller.signal.addEventListener('abort', abort, { once: true })
      cancel = this.clock.after(this.options.waitMs, () => controller.abort())
    })
    const operation = Promise.resolve().then(async () => {
      if (controller.signal.aborted) return null
      const result = await this.options.check(scope, controller.signal)
      return !controller.signal.aborted && !this.disposed ? homeCheckReports(result, scope) : null
    }).catch(() => null).finally(() => { this.active.delete(scope.attemptId) })
    try { return await Promise.race([operation, timeout]) }
    finally { cancel(); controller.signal.removeEventListener('abort', abort) }
  }
}

type ReplyOwnedCommand = Extract<RuntimeCommand, { binding: { conversationReplyId: string } }>
function isReplyOwnedCommand(value: unknown): value is ReplyOwnedCommand {
  return wire.RuntimeCommand(value) && 'conversationReplyId' in value.binding
}
type ReplyRegistryResult = ReplyAdmissionState | 'runtime_busy' | 'containment_unavailable'
interface ReplyRegistryEntry {
  readonly fingerprint: string
  readonly replyId: string
  readonly binding: RuntimeConversationClaimRequest
  readonly pending: Promise<ReplyRegistryResult>
  readonly unit: 'calls_tokens' | 'usd'
  admission: ReplyAdmission | null
  factoryEntered: boolean
  accepted: boolean
  receipt: Promise<RuntimeReceipt> | null
  epoch: number
  stopped: boolean
  state: ReplyAdmissionState | 'queued'
}

interface ReplyRetiredAdmission {
  readonly fingerprint: string
  readonly pending: Promise<ReplyRegistryResult>
  readonly receipt: Promise<RuntimeReceipt>
}
export interface ReplyRegistryDelivery {
  readonly waitMs: number
  readonly requestWaitMs: number
  readonly retryWaitMs: number
  readonly maxAttempts: number
  readonly receipts: (values: readonly RuntimeReceipt[]) => Promise<void>
  readonly acknowledged?: ReplyRecoveryOperations['acknowledged']
}
function snapshotRegistryDelivery(delivery: ReplyRegistryDelivery | null, clock: ReplyStopClock): ReplyRegistryDelivery | null {
  if (delivery === null) return null
  if (!Number.isSafeInteger(delivery.waitMs) || delivery.waitMs < 1 || delivery.waitMs > 120_000 ||
      typeof delivery.receipts !== 'function' || !validRetryPolicy({ ...delivery, deadlineAt: clock.now() + delivery.waitMs }, clock)) {
    throw new Error('reply_registry_delivery_invalid')
  }
  return Object.freeze({ ...delivery })
}
interface ReplyControlRecord {
  readonly fingerprint: string
  readonly attemptId: string
  readonly kind: 'stop' | 'inspect' | 'retire'
}
export type ReplyStopDeliveryResult = 'retained' | 'unresolved'
interface ReplyStopDeliveryEntry {
  evaluation: number
  readonly replyId: string
  readonly binding: RuntimeConversationClaimRequest
  readonly stages: Map<string, { delivery: ReplyReceiptDelivery; failed: boolean }>
  pending: Promise<ReplyStopDeliveryResult> | null
  lastStage: RuntimeReceipt['stage'] | null
  unresolved: boolean
}
interface ReplyRetireEntry {
  live: ReplyLiveRetirement | null
  readonly fingerprint: string
  readonly attemptId: string
  readonly controller: AbortController
  readonly deadlineAt: number
  pending: Promise<ReplyStopDeliveryResult> | null
  delivery: ReplyReceiptDelivery | null
  completed: boolean
}
interface ReplyCreateDeliveryEntry {
  readonly fingerprint: string
  readonly replyId: string
  readonly binding: RuntimeConversationClaimRequest
  readonly pending: Promise<void>
  delivery: ReplyReceiptDelivery | null
  failed: boolean
  terminalDelivery: ReplyReceiptDelivery | null
  terminalState: 'not_started' | 'waiting' | 'no_failure' | 'retained' | 'unresolved' | 'cancelled'
}

export interface ReplyReceiptBarrierResult {
  readonly result: ReplyReceiptOutcome
  readonly count: number
}
interface ReplyReceiptSnapshot {
  readonly attemptId: string
  readonly replyId: string
  readonly epoch: number
  readonly stopped: boolean
  readonly terminalState: ReplyCreateDeliveryEntry['terminalState']
  readonly senders: readonly ReplyReceiptDelivery[]
  readonly excludedTerminal: ReplyReceiptDelivery | null
  readonly evaluations: readonly { record: ReplyStopDeliveryEntry; generation: number }[]
}

function sameReceiptSnapshot(a: ReplyReceiptSnapshot, b: ReplyReceiptSnapshot): boolean {
  return a.attemptId === b.attemptId && a.replyId === b.replyId && a.epoch === b.epoch && a.stopped === b.stopped &&
    a.terminalState === b.terminalState && a.excludedTerminal === b.excludedTerminal &&
    a.senders.length === b.senders.length && a.senders.every((sender, index) => sender === b.senders[index]) &&
    a.evaluations.length === b.evaluations.length && a.evaluations.every((item, index) =>
      item.record === b.evaluations[index]?.record && item.generation === b.evaluations[index]?.generation)
}

/**
 * Local reply ownership/admission registry, reserving capacity before entering any caller operation.
 * It retains failed/uncertain/stopped entries: exit or an API acknowledgement alone never frees a slot.
 * Create command execution retains its own receipt delivery without blocking Stop on its HTTP waiter.
 * Physical retirement, hello reconciliation and Stop/retire receipt proof remain external.
 * The factory constructs an idle admission only; it must not spawn or dispatch before admission.run().
 * Only a digest of the create is retained here; the factory owns release of its prompt-bearing input.
 */
export class ReplyChildren {
  private readonly owner: ReplyRegistryOwner
  private readonly entries = new Map<string, ReplyRegistryEntry>()
  private readonly retiredAdmissions = new Map<string, ReplyRetiredAdmission>()
  private readonly deliveries = new Map<string, ReplyCreateDeliveryEntry>()
  private readonly controls = new Map<string, ReplyControlRecord>()
  private readonly stopDeliveries = new Map<string, ReplyStopDeliveryEntry>()
  private readonly retirements = new Map<string, ReplyRetireEntry>()
  private readonly inspections = new Map<string, { readonly attemptId: string; readonly delivery: ReplyReceiptDelivery }>()
  private readonly journalPasses = new Map<string, ReplyJournalPass>()
  private readonly receiptProofs = new WeakMap<object, ReplyReceiptSnapshot>()
  private readonly lifecycle = new AbortController()
  private readonly homeChecks: ReplyHomeChecks | null
  private readonly deliveryOptions: ReplyRegistryDelivery | null
  private disposed = false

  constructor(owner: ReplyRegistryOwner,
      private readonly factory: ((command: RuntimeCommand, binding: RuntimeConversationClaimRequest) => ReplyAdmission) | null,
      delivery: ReplyRegistryDelivery | null = null, private readonly clock: ReplyStopClock = monotonicReplyClock,
      verification: ReplyHomeVerification | null = null) {
    if (![owner.projectId, owner.resourceId].every(value =>
      typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) ||
      typeof owner.runtimeUnitId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(owner.runtimeUnitId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(owner.leaseId)) {
      throw new Error('reply_registry_invalid')
    }
    this.owner = Object.freeze({ ...owner })
    this.deliveryOptions = snapshotRegistryDelivery(delivery, clock)
    this.homeChecks = verification === null ? null : new ReplyHomeChecks(verification, clock)
  }

  /** Retain before admission; resolve once delivery is owned, not once its HTTP response arrives. */
  executeCreate(value: unknown): Promise<void> {
    const command = this.command(value, 'create'), fingerprint = this.fingerprint(command)
    const prior = this.deliveries.get(command.commandId)
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new Error('reply_registry_conflict')
      return prior.pending
    }
    if ([...this.deliveries.values()].some(entry => entry.binding.attemptId === command.binding.attemptId)) {
      throw new Error('reply_registry_conflict')
    }
    if (this.disposed || this.deliveryOptions === null) throw new Error('reply_registry_delivery_unavailable')
    // No eviction from an uncertain command or a home not yet physically retired. Refuse before any effect.
    if (this.deliveries.size >= 64) throw new Error('reply_registry_delivery_capacity')
    const commandId = command.commandId
    // Reserve admission synchronously too: a Stop in this same turn must see and fence the queued child.
    // createReceipt enters no caller callback until a microtask, after the delivery record below is installed.
    const candidate = this.createReceipt(structuredClone(command))
    const pending = Promise.resolve().then(() => this.deliverCreate(commandId, candidate))
    this.deliveries.set(commandId, { fingerprint, replyId: command.binding.conversationReplyId,
      binding: Object.freeze(this.claimBinding(command)), pending, delivery: null, failed: false, terminalDelivery: null, terminalState: 'not_started' })
    return pending
  }

  /** Snapshot once; the retained sender joins later retirement barriers even when its response is lost. */
  executeInspect(value: unknown): Promise<ReplyStopDeliveryResult> {
    const command = structuredClone(this.command(value, 'inspect'))
    if (this.inspections.has(command.commandId)) return Promise.resolve('retained')
    const entry = this.entry(command), options = this.deliveryOptions
    if (this.disposed || !entry || !options) return Promise.resolve('unresolved')
    this.retainControl(command, entry)
    const summary = { state: entry.admission?.state ?? entry.state, authorityEpoch: entry.epoch,
      stopped: entry.stopped, local: entry.admission?.status() ?? null }
    const binding = this.claimBinding(command)
    const receipt = createReplyReceipt(binding, { stage: 'checked', reason: JSON.stringify(summary) }, null)
    const delivery = new ReplyReceiptDelivery(binding, receipt,
      { ...options, deadlineAt: this.clock.now() + options.waitMs }, values => options.receipts(values), this.clock)
    this.inspections.set(command.commandId, { attemptId: entry.binding.attemptId, delivery })
    void delivery.send().catch(() => {}) // Original sender retains failure/late ACK; inspection never retries it afresh.
    return Promise.resolve('retained')
  }

  /** Fresh Stop decisions, immutable per-stage delivery. Unresolved accounting never becomes a POST. */
  executeStop(value: unknown): Promise<ReplyStopDeliveryResult> {
    const command = this.command(value, 'stop'), owned = this.entry(command)
    if (this.disposed || !owned) return Promise.resolve('unresolved')
    this.stopReply(command) // Fence synchronously even when receipt delivery is unavailable.
    let record = this.stopDeliveries.get(command.commandId)
    if (!record) {
      record = { evaluation: 0, replyId: command.binding.conversationReplyId, binding: Object.freeze(this.claimBinding(command)),
        stages: new Map(), pending: null, lastStage: null, unresolved: false }
      this.stopDeliveries.set(command.commandId, record)
    }
    if (record.pending !== null) return record.pending
    return this.scheduleStop(structuredClone(command), record)
  }

  /** Original settled live ownership or never-launched absence; never restart reconstruction. */
  executeRetire(value: unknown): Promise<ReplyStopDeliveryResult> {
    const command = structuredClone(this.command(value, 'retire')), fingerprint = this.fingerprint(command)
    const prior = this.retirements.get(command.commandId)
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new Error('reply_registry_conflict')
      if (prior.completed) return Promise.resolve('retained')
      if (prior.pending && !prior.live?.canRetry()) return prior.pending
    }
    const entry = this.entry(command), options = this.deliveryOptions
    if (this.disposed || !entry || !options?.acknowledged) return Promise.resolve('unresolved')
    return this.retireOwned(command, entry, options)
  }

  private retireOwned(command: ReplyOwnedCommand, entry: ReplyRegistryEntry,
      options: ReplyRegistryDelivery): Promise<ReplyStopDeliveryResult> {
    const occupied = [...this.retirements.values()].find(item => item.attemptId === entry.binding.attemptId && item.live && !item.live.canRetry())
    if (occupied) return occupied.pending ?? Promise.resolve('unresolved')
    const scope = entry.admission?.liveRetirementScope() ?? null
    if (entry.admission && !entry.admission.stopEvidence().launchNeverEntered) {
      return scope === null ? Promise.resolve('unresolved') : this.startLiveRetirement(command, entry, scope)
    }
    if (!this.homeChecks) return Promise.resolve('unresolved')
    this.retainControl(command, entry)
    this.fenceForRetirement(entry)
    const record: ReplyRetireEntry = { live: null, fingerprint: this.fingerprint(command), attemptId: entry.binding.attemptId, controller: new AbortController(),
      deadlineAt: this.clock.now() + options.waitMs, pending: null, delivery: null, completed: false }
    this.retirements.set(command.commandId, record)
    record.pending = Promise.resolve().then(() => this.retireAbsent(command, entry, record))
      .finally(() => { record.pending = null })
    return record.pending
  }

  private startLiveRetirement(command: ReplyOwnedCommand, entry: ReplyRegistryEntry,
      scope: ReplyLiveRetirementScope): Promise<ReplyStopDeliveryResult> {
    const options = this.deliveryOptions
    if (!options?.acknowledged || !entry.admission?.matchesBinding(scope.binding) ||
        !entry.admission.matchesJournalScope(scope.scope, { replyId: entry.replyId, unit: entry.unit })) return Promise.resolve('unresolved')
    const journal = this.journalPasses.get(entry.binding.attemptId)
    if (journal) { journal.abort(); return Promise.resolve('unresolved') }
    this.retainControl(command, entry)
    const record: ReplyRetireEntry = { live: null, fingerprint: this.fingerprint(command), attemptId: entry.binding.attemptId,
      controller: new AbortController(), deadlineAt: this.clock.now() + options.waitMs, pending: null, delivery: null, completed: false }
    this.retirements.set(command.commandId, record)
    record.live = new ReplyLiveRetirement(scope, record, {
      clock: this.clock, acknowledged: options.acknowledged,
      receipts: () => this.awaitReceiptAcknowledgements(command, options.waitMs, record.controller.signal),
      current: proof => {
        const actual = entry.admission?.liveRetirementScope()
        return !this.disposed && this.entries.get(record.attemptId) === entry && entry.accepted &&
          this.retirements.get(command.commandId) === record && command.binding.authorityEpoch === entry.epoch &&
          !this.journalPasses.has(record.attemptId) && actual !== null && actual !== undefined &&
          liveRetirementKey(actual) === liveRetirementKey(scope) && this.receiptAcknowledgementsCurrent(command, proof)
      },
      complete: () => this.completeRetirement(command, entry, record, 'home_deleted'),
    })
    record.pending = record.live.pending
    return record.pending
  }

  private fenceForRetirement(entry: ReplyRegistryEntry): void {
    this.journalPasses.get(entry.binding.attemptId)?.abort()
    entry.stopped = true; entry.state = 'stopped'; entry.admission?.stop()
    const primary = this.deliveries.get(entry.binding.commandId)
    if (primary) this.cancelTerminal(primary)
  }

  private assertAbsentCurrent(command: ReplyOwnedCommand, entry: ReplyRegistryEntry, record: ReplyRetireEntry): void {
    const evidence = entry.admission?.stopEvidence()
    if (this.disposed || record.controller.signal.aborted || this.clock.now() >= record.deadlineAt ||
        this.entries.get(record.attemptId) !== entry || command.binding.authorityEpoch !== entry.epoch ||
        !entry.stopped || !entry.accepted || !evidence?.launchNeverEntered || !evidence.spawnFenced) {
      throw new Error('reply_retirement_unconfirmed')
    }
  }

  private async retireAbsent(command: ReplyOwnedCommand, entry: ReplyRegistryEntry,
      record: ReplyRetireEntry): Promise<ReplyStopDeliveryResult> {
    const cancel = this.clock.after(Math.max(0, record.deadlineAt - this.clock.now()), () => record.controller.abort())
    try {
      await entry.pending
      this.assertAbsentCurrent(command, entry, record)
      const proof = await this.awaitReceiptAcknowledgements(command,
        Math.max(1, Math.floor(record.deadlineAt - this.clock.now())), record.controller.signal)
      this.assertAbsentProof(command, entry, record, proof)
      await this.requireAbsent(entry)
      this.assertAbsentProof(command, entry, record, proof)
      await this.absentAcknowledgement(entry, record.controller.signal)
      this.assertAbsentProof(command, entry, record, proof)
      await this.requireAbsent(entry)
      this.assertAbsentProof(command, entry, record, proof)
      this.completeRetirement(command, entry, record, 'home_absent')
      return 'retained'
    } catch { return 'unresolved' }
    finally { cancel(); record.controller.abort() }
  }

  private assertAbsentProof(command: ReplyOwnedCommand, entry: ReplyRegistryEntry,
      record: ReplyRetireEntry, proof: ReplyReceiptBarrierResult): void {
    this.assertAbsentCurrent(command, entry, record)
    if (proof.result !== 'acknowledged' || !this.receiptAcknowledgementsCurrent(command, proof)) {
      throw new Error('reply_retirement_receipts_unconfirmed')
    }
  }

  private async requireAbsent(entry: ReplyRegistryEntry): Promise<void> {
    const reports = await this.homeChecks?.report(this.owner, entry.binding.attemptId)
    if (!reports || !reports.every(row => row.state === 'absent' && row.reason === 'home_absent')) {
      throw new Error('reply_retirement_absence_unconfirmed')
    }
  }

  private async absentAcknowledgement(entry: ReplyRegistryEntry, signal: AbortSignal): Promise<void> {
    const request = { ...entry.binding, keys: { observations: [], usage: [], ordinals: [], hasTurnEnd: false } }
    const acknowledged = this.deliveryOptions?.acknowledged
    if (!acknowledged) throw new Error('reply_retirement_ack_unavailable')
    const answer = await acknowledged(request, signal)
    if (!wire.RuntimeConversationAcknowledgement(answer)) throw new Error('reply_retirement_ack_invalid')
    this.validateAbsentAck(answer, entry)
  }

  private validateAbsentAck(answer: RuntimeConversationAcknowledgement, entry: ReplyRegistryEntry): void {
    const p = answer.predicates
    if (!Object.values(p).every(item => item.met) || p.terminalState.replyId !== entry.replyId ||
        ['pending', 'running'].includes(p.terminalState.state) || p.createAnswered.commandId !== entry.binding.commandId ||
        p.payloadScrubbed.commandId !== entry.binding.commandId || p.observations.keys.length !== 0 ||
        p.usage.keys.length !== 0 || p.reservations.states.length !== 0 || p.capture.outcome !== 'none' || p.capture.key !== null) {
      throw new Error('reply_retirement_ack_unconfirmed')
    }
  }

  private completeRetirement(command: ReplyOwnedCommand, entry: ReplyRegistryEntry, record: ReplyRetireEntry,
      reason: 'home_absent' | 'home_deleted'): void {
    const options = this.deliveryOptions
    if (!options || entry.receipt === null) throw new Error('reply_registry_delivery_unavailable')
    const binding = this.claimBinding(command)
    const receipt = createReplyReceipt(binding, { stage: 'checked', reason }, null)
    record.delivery = new ReplyReceiptDelivery(binding, receipt,
      { ...options, deadlineAt: this.clock.now() + options.waitMs }, values => options.receipts(values), this.clock)
    this.retiredAdmissions.set(entry.binding.attemptId, { fingerprint: entry.fingerprint, pending: entry.pending, receipt: entry.receipt })
    record.completed = true
    this.entries.delete(entry.binding.attemptId) // Original create delivery and retire tombstone remain replay guards.
    void record.delivery.send().catch(() => {}) // Sender retains unconfirmed/late ACK; no new allowance on replay.
  }

  stopDeliveryStatus(value: unknown) {
    const command = this.command(value, 'inspect')
    const records = [...this.stopDeliveries.values()].filter(record => record.binding.attemptId === command.binding.attemptId)
    if (records.some(record => record.replyId !== command.binding.conversationReplyId)) throw new Error('reply_registry_conflict')
    return records.map(record => ({ commandId: record.binding.commandId, evaluating: record.pending !== null,
      unresolved: record.unresolved, lastStage: record.lastStage, disposed: this.disposed,
      stages: [...record.stages].map(([stage, item]) => ({ stage, failed: item.failed, acknowledgement: item.delivery.inspect() })) }))
  }

  private scheduleStop(command: ReplyOwnedCommand, record: ReplyStopDeliveryEntry): Promise<ReplyStopDeliveryResult> {
    this.journalPasses.get(record.binding.attemptId)?.abort()
    record.evaluation++
    const pending = Promise.resolve().then(() => this.deliverStop(command, record))
      .finally(() => { record.pending = null })
    record.pending = pending // Install before entering checker/transport callbacks that may reenter.
    return pending
  }

  private async deliverStop(command: ReplyOwnedCommand, record: ReplyStopDeliveryEntry): Promise<ReplyStopDeliveryResult> {
    try {
      if (this.disposed || this.deliveryOptions === null) throw new Error('reply_registry_delivery_unavailable')
      const receipt = await this.stopReceipt(command)
      const entry = this.entry(command)
      if (!entry) throw new Error('reply_registry_recovery_required')
      this.assertStopCurrent(command, entry)
      this.retainStopStage(record, receipt)
      record.unresolved = false
      record.lastStage = receipt.stage
      return 'retained'
    } catch {
      // No generic rejected/failed/outcome_unknown fallback: it could outrun the accounting barrier.
      record.unresolved = true
      record.lastStage = null
      return 'unresolved'
    }
  }

  private retainStopStage(record: ReplyStopDeliveryEntry, receipt: RuntimeReceipt): void {
    const options = this.deliveryOptions
    if (!options || (receipt.stage !== 'checked' && receipt.stage !== 'outcome_unknown')) throw new Error('reply_stop_receipt_invalid')
    if (record.stages.has(receipt.stage)) return // Keep original body, retry allowance, deadline and ACK state.
    const item = { delivery: new ReplyReceiptDelivery(record.binding, receipt,
      { ...options, deadlineAt: this.clock.now() + options.waitMs }, values => options.receipts(values), this.clock), failed: false }
    record.stages.set(receipt.stage, item)
    void item.delivery.send().catch(() => { item.failed = true })
  }

  /** Content-free delivery facts. A positive ACK is not proof of process, home or journal cleanup. */
  deliveryStatus(value: unknown) {
    const command = this.command(value, 'inspect')
    const records = [...this.deliveries.values()].filter(entry => entry.binding.attemptId === command.binding.attemptId)
    if (records.some(entry => entry.replyId !== command.binding.conversationReplyId)) throw new Error('reply_registry_conflict')
    return records.map(entry => ({ commandId: entry.binding.commandId, enqueued: entry.delivery !== null,
      failed: entry.failed, disposed: this.disposed, acknowledgement: entry.delivery?.inspect() ?? null,
      terminal: { state: entry.terminalState, acknowledgement: entry.terminalDelivery?.inspect() ?? null } }))
  }

  /** Caller owns a distinct sealed descriptor per pass. Serializes observation, never deletion or pruning. */
  preflightJournal(value: unknown, options: ReplyRecoveryOptions,
      operations: Pick<ReplyRecoveryOperations, 'read' | 'acknowledged'>): Promise<ReplyRecoveryResult> {
    const command = structuredClone(this.command(value, 'inspect')), entry = this.entry(command)
    this.assertJournalOwner(command, entry, options)
    if (options.unit === null) throw new Error('reply_preflight_invalid')
    if ([...this.retirements.values()].some(item => item.attemptId === command.binding.attemptId && item.live && !item.live.canRetry())) {
      throw new Error('reply_preflight_busy')
    }
    const attemptId = command.binding.attemptId, prior = this.journalPasses.get(attemptId)
    if (prior) {
      if (!prior.matches(options, operations)) throw new Error('reply_preflight_busy')
      return prior.pending
    }
    const scope = structuredClone(options.scope), timeoutMs = options.timeoutMs
    const target = { replyId: options.replyId, unit: options.unit }
    const pass = new ReplyJournalPass(options, operations, {
      clock: this.clock,
      receipts: signal => this.awaitReceiptAcknowledgements(command, timeoutMs, signal),
      current: proof => this.receiptAcknowledgementsCurrent(command, proof) &&
        entry?.admission?.matchesJournalScope(scope, target) === true,
      release: () => { if (this.journalPasses.get(attemptId) === pass) this.journalPasses.delete(attemptId) },
    })
    this.journalPasses.set(attemptId, pass) // Before any caller I/O or reentrant callback.
    return pass.pending
  }
  private assertJournalOwner(command: ReplyOwnedCommand, entry: ReplyRegistryEntry | undefined, options: ReplyRecoveryOptions): void {
    const binding = options.binding
    if (this.disposed || !entry || command.binding.authorityEpoch !== entry.epoch ||
        !entry.admission?.matchesJournalScope(options.scope, { replyId: entry.replyId, unit: entry.unit }) || options.replyId !== entry.replyId || options.unit !== entry.unit ||
        binding.attemptId !== entry.binding.attemptId || binding.commandId !== entry.binding.commandId ||
        binding.authorityEpoch !== entry.binding.authorityEpoch || binding.leaseId !== entry.binding.leaseId) {
      throw new Error('reply_preflight_scope_invalid')
    }
  }

  /** Observe only: never sends, retries or changes any receipt's original allowance. Not cleanup authority. */
  async awaitReceiptAcknowledgements(value: unknown, waitMs: number, signal?: AbortSignal): Promise<ReplyReceiptBarrierResult> {
    const command = structuredClone(this.barrierCommand(value))
    if (!Number.isSafeInteger(waitMs) || waitMs < 1 || waitMs > 120_000) throw new Error('reply_receipt_wait_invalid')
    const deadline = this.clock.now() + waitMs
    while (!this.disposed && !signal?.aborted && this.clock.now() < deadline) {
      const snapshot = this.receiptSnapshot(command)
      if (snapshot) {
        const proof = Object.freeze({ result: 'acknowledged' as const, count: snapshot.senders.length })
        this.receiptProofs.set(proof, snapshot)
        return proof
      }
      await this.waitReceiptObservation(deadline, signal)
    }
    return Object.freeze({ result: 'unconfirmed', count: 0 })
  }

  /** A clone or another registry's token is invalid. Recheck after every await before later cleanup. */
  receiptAcknowledgementsCurrent(value: unknown, proof: unknown): boolean {
    const command = this.barrierCommand(value)
    if (typeof proof !== 'object' || proof === null) return false
    const original = this.receiptProofs.get(proof), current = this.receiptSnapshot(command)
    return original !== undefined && current !== null && sameReceiptSnapshot(original, current)
  }

  private barrierCommand(value: unknown): ReplyOwnedCommand {
    if (!isReplyOwnedCommand(value) || (value.kind !== 'inspect' && value.kind !== 'retire')) throw new Error('reply_registry_invalid')
    return this.command(value, value.kind)
  }

  private receiptSnapshot(command: ReplyOwnedCommand): ReplyReceiptSnapshot | null {
    const owner = this.receiptOwner(command)
    if (!owner) return null
    const { owned, primary, first } = owner
    if (primary.terminalState === 'waiting' || primary.terminalState === 'unresolved') return null
    const stops = [...this.stopDeliveries.values()].filter(record => record.binding.attemptId === owned.binding.attemptId)
    if (stops.some(record => record.pending !== null || record.unresolved)) return null
    const senders = [first, ...stops.flatMap(record => [...record.stages.values()].map(item => item.delivery))]
    const excludedTerminal = this.neverPostedTerminal(owned, primary) ? primary.terminalDelivery : null
    if (primary.terminalDelivery && !excludedTerminal) senders.push(primary.terminalDelivery)
    for (const row of this.inspections.values()) if (row.attemptId === owned.binding.attemptId) senders.push(row.delivery)
    if (senders.some(sender => !sender.inspect().acknowledged)) return null
    return { attemptId: owned.binding.attemptId, replyId: owned.replyId, epoch: owned.epoch, stopped: owned.stopped,
      terminalState: primary.terminalState, senders, excludedTerminal,
      evaluations: stops.map(record => ({ record, generation: record.evaluation })) }
  }

  private receiptOwner(command: ReplyOwnedCommand) {
    const owned = this.entry(command), primary = owned ? this.deliveries.get(owned.binding.commandId) : null
    if (this.disposed || !owned || owned.epoch !== command.binding.authorityEpoch || !primary?.delivery || primary.failed) return null
    return { owned, primary, first: primary.delivery }
  }

  private neverPostedTerminal(owned: ReplyRegistryEntry, primary: ReplyCreateDeliveryEntry): boolean {
    const delivery = primary.terminalDelivery?.inspect()
    // This is an abandoned candidate, not a synthetic ACK. Primary and Stop stages are never excluded.
    return owned.stopped && primary.terminalState === 'cancelled' && delivery !== undefined &&
      delivery.disposed && delivery.attempts === 0 && !delivery.inFlight
  }

  private waitReceiptObservation(deadline: number, signal?: AbortSignal): Promise<void> {
    const lifetime = this.lifecycle.signal
    if (lifetime.aborted || signal?.aborted) return Promise.resolve()
    return new Promise(resolve => {
      let cancel = (): void => {}
      const finish = (): void => {
        cancel(); lifetime.removeEventListener('abort', finish); signal?.removeEventListener('abort', finish); resolve()
      }
      lifetime.addEventListener('abort', finish, { once: true })
      signal?.addEventListener('abort', finish, { once: true })
      cancel = this.clock.after(Math.min(10, Math.max(0, deadline - this.clock.now())), finish)
    })
  }

  private async deliverCreate(commandId: string, candidate: Promise<RuntimeReceipt>): Promise<void> {
    const entry = this.deliveries.get(commandId), options = this.deliveryOptions
    try {
      const receipt = await candidate
      if (!entry || !options || this.disposed) return // Disposal never publishes, including late settlement.
      entry.delivery = new ReplyReceiptDelivery(entry.binding, receipt,
        { ...options, deadlineAt: this.clock.now() + options.waitMs }, values => options.receipts(values), this.clock)
      void entry.delivery.send().catch(() => { entry.failed = true }) // Unexpected waiter failure stays unconfirmed.
      if (receipt.stage === 'delivered') {
        entry.terminalState = 'waiting'
        void this.deliverTerminal(entry).catch(() => { entry.terminalState = 'unresolved' })
      }
    } catch (error: unknown) { if (entry) entry.failed = true; if (!this.disposed) throw error }
  }

  private terminalCurrent(record: ReplyCreateDeliveryEntry): boolean {
    const owned = this.entries.get(record.binding.attemptId)
    return !this.disposed && owned !== undefined && !owned.stopped && owned.accepted &&
      owned.epoch === record.binding.authorityEpoch && owned.admission?.state === 'released'
  }

  private async deliverTerminal(record: ReplyCreateDeliveryEntry): Promise<void> {
    const admission = this.entries.get(record.binding.attemptId)?.admission, options = this.deliveryOptions
    if (!admission || !options || !record.delivery) throw new Error('reply_terminal_unowned')
    const receipt = await admission.terminalReceipt()
    if (!this.terminalCurrent(record)) { record.terminalState = 'cancelled'; return }
    if (receipt === null) { record.terminalState = 'no_failure'; return }
    // Retain the failed body's original bound before waiting for the earlier stage's durable ACK.
    record.terminalDelivery = new ReplyReceiptDelivery(record.binding, receipt,
      { ...options, deadlineAt: this.clock.now() + options.waitMs }, values => this.postTerminal(record, values), this.clock)
    await record.delivery.send()
    if (!this.terminalCurrent(record)) { this.cancelTerminal(record); return }
    if (!record.delivery.inspect().acknowledged) { record.terminalState = 'unresolved'; return }
    record.terminalState = 'retained'
    const result = await record.terminalDelivery.send()
    if (!this.terminalCurrent(record)) this.cancelTerminal(record)
    else if (result !== 'acknowledged') record.terminalState = 'unresolved'
  }

  private postTerminal(record: ReplyCreateDeliveryEntry, receipts: readonly RuntimeReceipt[]): Promise<void> {
    // A queued transport microtask or retry must still respect Stop/supersession after the ACK check.
    if (!this.terminalCurrent(record) || !record.delivery?.inspect().acknowledged || !this.deliveryOptions) {
      this.cancelTerminal(record)
      throw new Error('reply_terminal_superseded')
    }
    return this.deliveryOptions.receipts(receipts)
  }

  private cancelTerminal(record: ReplyCreateDeliveryEntry): void {
    record.terminalDelivery?.dispose()
    record.terminalState = 'cancelled'
  }

  createReply(value: unknown): Promise<ReplyRegistryResult> {
    const command = this.command(value, 'create')
    if (!('conversation' in command.payload)) throw new Error('reply_registry_invalid')
    const binding = this.claimBinding(command)
    const fingerprint = this.fingerprint(command)
    const prior = this.entries.get(binding.attemptId) ?? this.retiredAdmissions.get(binding.attemptId)
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new Error('reply_registry_conflict')
      return prior.pending
    }
    if (this.disposed) throw new Error('reply_registry_disposed')
    if (this.factory === null) return Promise.resolve('containment_unavailable')
    if (this.entries.size >= 2) return Promise.resolve('runtime_busy')
    const snapshot = structuredClone(command)
    const pending = Promise.resolve().then(() => this.admit(snapshot, binding.attemptId))
    // Install before invoking the factory or a claim, including synchronous reentrant callers.
    this.entries.set(binding.attemptId, { fingerprint, replyId: command.binding.conversationReplyId,
      binding: Object.freeze(binding), unit: command.payload.conversation.unit, pending, admission: null, factoryEntered: false, accepted: false, receipt: null, epoch: binding.authorityEpoch, stopped: false, state: 'queued' })
    return pending
  }

  /** Revalidates owner/body before replay; terminal candidates join the original settlement barrier. */
  createReceipt(value: unknown): Promise<RuntimeReceipt> {
    const command = this.command(value, 'create')
    const binding = this.claimBinding(command)
    const result = this.createReply(command)
    const entry = this.entries.get(binding.attemptId)
    const retired = this.retiredAdmissions.get(binding.attemptId)
    if (retired) return retired.receipt
    if (!entry) return result.then(outcome => this.unadmittedReceipt(binding, outcome))
    entry.receipt ??= Promise.resolve().then(() => this.entryReceipt(entry))
    return entry.receipt
  }

  private unadmittedReceipt(binding: RuntimeConversationClaimRequest, outcome: ReplyRegistryResult): RuntimeReceipt {
    if (outcome !== 'runtime_busy' && outcome !== 'containment_unavailable') throw new Error('reply_registry_invalid')
    // No slot, factory or claim was entered. These immutable configuration/cap denials retain no prompt.
    return createReplyReceipt(binding, { stage: 'rejected', reason: outcome }, null)
  }

  private async entryReceipt(entry: ReplyRegistryEntry): Promise<RuntimeReceipt> {
    await entry.pending
    if (entry.accepted && entry.admission !== null) return entry.admission.createReceipt()
    if (!entry.factoryEntered) return createReplyReceipt(entry.binding, { stage: 'rejected', reason: 'cancelled_before_claim' }, null)
    // A factory may have crossed a boundary before throwing or handing back an invalid active handle.
    // Stop the owned handle (in admit's catch), await its original barrier, and never infer no execution.
    await entry.admission?.settlement()
    return createReplyReceipt(entry.binding, { stage: 'outcome_unknown', reason: 'factory_unconfirmed' }, null)
  }

  stopReply(value: unknown): Promise<ReplyAdmissionCleanup> | null {
    const command = this.command(value, 'stop')
    const entry = this.entry(command)
    if (!entry) return null // Unknown is not evidence of absence or cleanup.
    this.retainControl(command, entry)
    for (const record of this.retirements.values()) if (record.attemptId === entry.binding.attemptId) record.controller.abort()
    this.journalPasses.get(entry.binding.attemptId)?.abort()
    entry.stopped = true
    entry.state = 'stopped'
    const delivery = this.deliveries.get(entry.binding.commandId)
    if (delivery) this.cancelTerminal(delivery)
    entry.admission?.stop()
    return entry.admission?.settlement() ?? null
  }

  /** Candidate only: original accounting barrier first, then fresh check. No delivery or home deletion. */
  async stopReceipt(value: unknown): Promise<RuntimeReceipt> {
    const command = structuredClone(this.command(value, 'stop'))
    if (this.disposed) throw new Error('reply_registry_disposed')
    const entry = this.entry(command)
    if (!entry) throw new Error('reply_registry_recovery_required')
    this.stopReply(command)
    await this.stopAccounting(entry)
    this.assertStopCurrent(command, entry)
    const before = this.stopState(entry)
    const checked = await this.homeChecks?.check(this.owner, command.binding.attemptId) ?? false
    this.assertStopCurrent(command, entry)
    const after = this.stopState(entry)
    const decision = checked && before.fenced && after.fenced ? { stage: 'checked' as const, reason: null } :
      { stage: 'outcome_unknown' as const, reason: 'physical_settlement_unconfirmed' }
    return createReplyReceipt(this.claimBinding(command), decision, after.sessionId)
  }
  private async stopAccounting(entry: ReplyRegistryEntry): Promise<void> {
    await entry.pending
    const cleanup = await entry.admission?.settlement()
    if (cleanup?.result === 'unresolved') throw new Error('reply_registry_settlement_unconfirmed')
    if (entry.factoryEntered && (!entry.accepted || entry.admission?.stopEvidence().recoveryRequired)) {
      throw new Error('reply_registry_recovery_required')
    }
  }
  private stopState(entry: ReplyRegistryEntry) {
    const evidence = entry.admission?.stopEvidence()
    return { fenced: !entry.factoryEntered || (entry.accepted && evidence?.spawnFenced === true),
      sessionId: evidence?.process ? `sophia-${entry.binding.attemptId}` : null }
  }
  private assertStopCurrent(command: ReplyOwnedCommand, entry: ReplyRegistryEntry): void {
    if (this.disposed) throw new Error('reply_registry_disposed')
    if (!entry.stopped || command.binding.authorityEpoch !== entry.epoch) throw new Error('reply_registry_stale_epoch')
  }

  inspectReply(value: unknown) {
    const command = this.command(value, 'inspect'), entry = this.entry(command)
    if (entry) this.retainControl(command, entry)
    return entry ? { state: entry.admission?.state ?? entry.state, authorityEpoch: entry.epoch,
      cleanup: entry.admission?.settlement() !== null && entry.admission !== null ? 'pending_or_observed' : 'not_started' } : null
  }

  dispose(): void {
    this.disposed = true
    this.lifecycle.abort()
    for (const record of this.retirements.values()) { record.controller.abort(); record.delivery?.dispose() }
    for (const row of this.inspections.values()) row.delivery.dispose()
    for (const pass of this.journalPasses.values()) pass.abort()
    for (const entry of this.entries.values()) {
      entry.stopped = true
      entry.state = 'stopped'
      entry.admission?.dispose()
    }
    for (const entry of this.deliveries.values()) { entry.delivery?.dispose(); this.cancelTerminal(entry) }
    for (const record of this.stopDeliveries.values()) for (const item of record.stages.values()) item.delivery.dispose()
    this.homeChecks?.dispose()
  }

  private async admit(command: RuntimeCommand, attemptId: string): Promise<ReplyRegistryResult> {
    const entry = this.entries.get(attemptId)
    if (!entry) throw new Error('reply_registry_invalid')
    if (entry.stopped || this.disposed) return 'stopped'
    try {
      entry.factoryEntered = true
      const admission = this.adopt(command, entry)
      entry.accepted = true
      if (this.disposed) admission.dispose()
      else if (entry.stopped) admission.stop()
      const result = await admission.run()
      entry.state = admission.state
      return result
    } catch {
      entry.state = entry.stopped ? 'stopped' : 'unresolved'
      if (this.disposed) entry.admission?.dispose()
      else entry.admission?.stop()
      return entry.state
    }
  }

  private adopt(command: RuntimeCommand, entry: ReplyRegistryEntry): ReplyAdmission {
    const admission = this.factory?.(command, { ...entry.binding })
    if (!admission || !admission.matchesBinding(entry.binding)) throw new Error('reply_registry_binding_mismatch')
    // A matching handle stays owned even when the factory violated the idle-only contract.
    entry.admission = admission
    if (admission.state !== 'idle') throw new Error('reply_registry_active_factory')
    return admission
  }

  private command(value: unknown, kind: 'create' | 'stop' | 'inspect' | 'retire') {
    if (!isReplyOwnedCommand(value) || value.kind !== kind ||
        value.binding.projectId !== this.owner.projectId || value.binding.resourceId !== this.owner.resourceId ||
        value.binding.runtimeUnitId !== this.owner.runtimeUnitId ||
        (value.expectedNativeSessionId !== null && value.expectedNativeSessionId !== `sophia-${value.binding.attemptId}`)) {
      throw new Error('reply_registry_invalid')
    }
    this.claimBinding(value)
    this.assertCommandIdentity(value)
    return value
  }
  /** Control identity is shared with both direct create admission and retained create delivery. */
  private assertCommandIdentity(command: ReplyOwnedCommand): void {
    const fingerprint = this.fingerprint(command)
    const existing = this.controls.get(command.commandId) ?? this.deliveries.get(command.commandId) ??
      [...this.entries.values()].find(entry => entry.binding.commandId === command.commandId)
    if (existing && existing.fingerprint !== fingerprint) throw new Error('reply_registry_conflict')
  }

  private exclusiveControl(kind: string): boolean { return kind === 'stop' || kind === 'retire' }

  private retainControl(command: ReplyOwnedCommand, entry: ReplyRegistryEntry): void {
    if (command.kind !== 'stop' && command.kind !== 'inspect' && command.kind !== 'retire') throw new Error('reply_registry_invalid')
    if (command.binding.authorityEpoch < entry.epoch) throw new Error('reply_registry_stale_epoch')
    const prior = this.controls.get(command.commandId)
    if (!prior) {
      const sameKind = [...this.controls.values()].filter(record => record.kind === command.kind)
      if (this.exclusiveControl(command.kind) && sameKind.some(record => record.attemptId === command.binding.attemptId)) {
        throw new Error('reply_registry_conflict') // One canonical Stop per attempt; replay still evaluates settlement.
      }
      // Only known attempts enter here. Their Stop slots cannot be consumed by inspection or create denials.
      if (command.kind === 'inspect' && sameKind.length >= 64) throw new Error('reply_registry_control_capacity')
      this.controls.set(command.commandId, { fingerprint: this.fingerprint(command),
        attemptId: command.binding.attemptId, kind: command.kind })
    }
    if (entry.epoch !== command.binding.authorityEpoch) this.journalPasses.get(entry.binding.attemptId)?.abort()
    entry.epoch = command.binding.authorityEpoch
  }
  private claimBinding(command: RuntimeCommand): RuntimeConversationClaimRequest {
    const binding = { attemptId: command.binding.attemptId, commandId: command.commandId,
      authorityEpoch: command.binding.authorityEpoch, leaseId: this.owner.leaseId }
    if (!wire.RuntimeConversationClaimRequest(binding)) throw new Error('reply_registry_invalid')
    return binding
  }
  private entry(command: ReturnType<ReplyChildren['command']>): ReplyRegistryEntry | undefined {
    const entry = this.entries.get(command.binding.attemptId)
    if (entry && entry.replyId !== command.binding.conversationReplyId) throw new Error('reply_registry_conflict')
    return entry
  }
  private fingerprint(command: RuntimeCommand): string {
    const binding = command.binding
    const conversation = 'conversation' in command.payload ? command.payload.conversation : null
    return createHash('sha256').update(JSON.stringify([command.schema, command.commandId, command.kind,
      binding.projectId, binding.attemptId, binding.resourceId, binding.authorityEpoch, binding.runtimeUnitId,
      'conversationReplyId' in binding ? binding.conversationReplyId : null,
      command.expectedNativeSessionId, command.contextPacketId, command.payload.role, command.payload.route,
      command.payload.text, conversation?.credentialRef, conversation?.ownerResourceRef, conversation?.unit])).digest('hex')
  }
}

type ReplyJournalReadOperations = Pick<ReplyRecoveryOperations, 'read' | 'acknowledged'>
interface ReplyJournalPassOwner {
  readonly clock: ReplyStopClock
  receipts(signal: AbortSignal): Promise<ReplyReceiptBarrierResult>
  current(proof: ReplyReceiptBarrierResult): boolean
  release(): void
}
function journalOptionsKey(options: ReplyRecoveryOptions): string {
  return JSON.stringify([journalScopeKey(options.scope), options.binding.attemptId, options.binding.commandId,
    options.binding.authorityEpoch, options.binding.leaseId, options.replyId, options.unit, options.timeoutMs, options.maxObservations])
}

/** A timed-out observer retains its slot while any original caller I/O is still outstanding. */
class ReplyJournalPass {
  readonly pending: Promise<ReplyRecoveryResult>
  private readonly controller = new AbortController()
  private readonly options: ReplyRecoveryOptions
  private readonly key: string
  private readonly read: ReplyJournalReadOperations['read']
  private readonly acknowledged: ReplyJournalReadOperations['acknowledged']
  private readonly deadline: number
  private inFlight = 0
  private ended = false
  private proof: ReplyReceiptBarrierResult | null = null
  constructor(options: ReplyRecoveryOptions, private readonly operations: ReplyJournalReadOperations,
      private readonly owner: ReplyJournalPassOwner) {
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 120_000) {
      throw new Error('reply_preflight_invalid')
    }
    this.key = journalOptionsKey(options)
    this.read = operations.read; this.acknowledged = operations.acknowledged
    this.deadline = owner.clock.now() + options.timeoutMs
    this.options = { ...structuredClone({ ...options, signal: undefined }), signal: options.signal }
    this.pending = Promise.resolve().then(() => this.run())
  }
  matches(options: ReplyRecoveryOptions, operations: ReplyJournalReadOperations): boolean {
    return this.operations === operations && this.read === operations.read && this.acknowledged === operations.acknowledged && this.options.signal === options.signal && this.key === journalOptionsKey(options)
  }
  abort(): void { this.controller.abort() }
  private assertCurrent(): void {
    if (this.controller.signal.aborted || this.owner.clock.now() >= this.deadline || this.proof === null || !this.owner.current(this.proof)) {
      throw new Error('reply_preflight_unconfirmed')
    }
  }
  private async run(): Promise<ReplyRecoveryResult> {
    const abort = (): void => this.abort()
    const cancel = this.owner.clock.after(Math.max(0, this.deadline - this.owner.clock.now()), abort)
    this.options.signal?.addEventListener('abort', abort, { once: true })
    if (this.options.signal?.aborted) this.abort()
    try {
      this.proof = await this.owner.receipts(this.controller.signal)
      this.assertCurrent()
      const remaining = Math.floor(this.deadline - this.owner.clock.now())
      if (remaining < 1) throw new Error('reply_preflight_unconfirmed')
      const result = await verifyReplyJournal({ ...this.options, timeoutMs: remaining, signal: this.controller.signal }, {
        read: signal => this.track(() => this.read.call(this.operations, signal)),
        acknowledged: (body, signal) => this.track(() => this.acknowledged.call(this.operations, body, signal)),
      })
      this.assertCurrent()
      return result
    } finally {
      cancel(); this.options.signal?.removeEventListener('abort', abort)
      this.abort(); this.ended = true; this.release()
    }
  }
  private async track<T>(operation: () => Promise<T>): Promise<T> {
    this.assertCurrent()
    this.inFlight++
    try { const value = await operation(); this.assertCurrent(); return value }
    finally { this.inFlight--; this.release() }
  }
  private release(): void { if (this.ended && this.inFlight === 0) this.owner.release() }
}

interface ReplyLiveRetirementOwner {
  readonly clock: ReplyStopClock
  readonly acknowledged: ReplyRecoveryOperations['acknowledged']
  receipts(): Promise<ReplyReceiptBarrierResult>
  current(proof: ReplyReceiptBarrierResult): boolean
  complete(): void
}
function liveRetirementKey(scope: ReplyLiveRetirementScope): string {
  return JSON.stringify([scope.root, scope.pid, scope.nonce, journalScopeKey(scope.scope),
    scope.binding.attemptId, scope.binding.commandId, scope.binding.authorityEpoch, scope.binding.leaseId,
    scope.target.replyId, scope.target.unit])
}

/** One retained physical operation. A bounded waiter never abandons descriptors or uncertain I/O. */
class ReplyLiveRetirement {
  readonly pending: Promise<ReplyStopDeliveryResult>
  private readonly io = new Set<Promise<unknown>>()
  private home: ReplyLiveHome | null = null
  private proof: ReplyReceiptBarrierResult | null = null
  private active = true
  private removalStarted = false
  private closeFailed = false
  constructor(private readonly scope: ReplyLiveRetirementScope, private readonly record: ReplyRetireEntry,
      private readonly owner: ReplyLiveRetirementOwner) {
    // Defer all callbacks until the registry retains this owner and its public waiter.
    const owned = Promise.resolve().then(() => this.run())
    this.pending = new Promise(resolve => {
      const abort = (): void => resolve('unresolved')
      record.controller.signal.addEventListener('abort', abort, { once: true })
      if (record.controller.signal.aborted) abort()
      void owned.then(resolve, () => resolve('unresolved')).finally(() => record.controller.signal.removeEventListener('abort', abort))
    })
  }
  canRetry(): boolean { return !this.active && !this.removalStarted && !this.closeFailed }
  private current(): void {
    if (this.record.controller.signal.aborted || this.owner.clock.now() >= this.record.deadlineAt ||
        this.proof === null || !this.owner.current(this.proof)) throw new Error('reply_retirement_unconfirmed')
  }
  private async run(): Promise<ReplyStopDeliveryResult> {
    const cancel = this.owner.clock.after(Math.max(0, this.record.deadlineAt - this.owner.clock.now()), () => this.record.controller.abort())
    try {
      this.proof = await this.owner.receipts()
      this.current()
      this.home = ReplyLiveHome.create(this.scope, () => this.current())
      await this.home.open()
      await this.verifyJournal(this.home)
      await this.home.verify()
      this.current(); this.removalStarted = true
      await this.home.remove()
      await this.home.close()
      this.current(); this.owner.complete()
      return 'retained'
    } catch { return 'unresolved' }
    finally {
      await Promise.allSettled([...this.io])
      try { await this.home?.close() } catch { this.closeFailed = true }
      cancel(); this.active = false
    }
  }
  private async verifyJournal(home: ReplyLiveHome): Promise<void> {
    const result = await verifyReplyJournal({ scope: this.scope.scope, binding: this.scope.binding,
      replyId: this.scope.target.replyId, unit: this.scope.target.unit, maxObservations: 4096,
      timeoutMs: Math.max(1, Math.floor(this.record.deadlineAt - this.owner.clock.now())), signal: this.record.controller.signal }, {
      read: () => this.track(() => home.read()),
      acknowledged: (body, signal) => this.track(() => this.owner.acknowledged(body, signal)),
    })
    this.current()
    if (!result.accountingVerified || !result.databaseBarrier) throw new Error('reply_retirement_unconfirmed')
  }
  private track<T>(operation: () => Promise<T>): Promise<T> {
    this.current()
    const pending = Promise.resolve().then(() => { this.current(); return operation() })
      .then(value => { this.current(); return value })
    this.io.add(pending)
    void pending.finally(() => this.io.delete(pending)).catch(() => {})
    return pending
  }
}

export type ReplyReceiptOutcome = 'acknowledged' | 'unconfirmed'
type ReplyReceiptAttempt = ReplyReceiptOutcome | 'retry'

/**
 * One immutable command/stage delivery. The controller must retain this object until physical retirement.
 * A bounded waiter does not cancel receipts(), which has no AbortSignal. A late positive POST is recorded
 * separately from that waiter's outcome; it proves stage acknowledgement, never exact stored body or cleanup.
 * This component neither creates a receipt nor decides when settlement permits its publication.
 */
export class ReplyReceiptDelivery {
  private readonly receipt: RuntimeReceipt
  private readonly policy: ReplySettlementPolicy
  private readonly controller = new AbortController()
  private pending: Promise<ReplyReceiptOutcome> | null = null
  private positiveAck = false
  private inFlight = false
  private attempts = 0
  private disposed = false

  constructor(binding: RuntimeConversationClaimRequest, receipt: unknown, policy: ReplySettlementPolicy,
      private readonly operation: (receipts: readonly RuntimeReceipt[]) => Promise<void>,
      private readonly clock: ReplyStopClock = monotonicReplyClock) {
    if (!wire.RuntimeConversationClaimRequest(binding) || !wire.RuntimeReceipt(receipt) ||
        receipt.commandId !== binding.commandId || receipt.attemptId !== binding.attemptId ||
        (receipt.nativeSessionId !== null && receipt.nativeSessionId !== `sophia-${binding.attemptId}`) ||
        !validRetryPolicy(policy, clock) || typeof operation !== 'function') throw new Error('reply_receipt_delivery_invalid')
    this.receipt = Object.freeze({ ...receipt, evidenceRefs: Object.freeze([...receipt.evidenceRefs]) })
    this.policy = Object.freeze({ ...policy })
  }

  /** Duplicate and reentrant sends join the original bounded waiter, even after a late acknowledgement. */
  send(): Promise<ReplyReceiptOutcome> {
    this.pending ??= Promise.resolve().then(() => this.run())
    return this.pending
  }

  inspect() {
    return { commandId: this.receipt.commandId, attemptId: this.receipt.attemptId, stage: this.receipt.stage,
      acknowledged: this.positiveAck, inFlight: this.inFlight, attempts: this.attempts, disposed: this.disposed }
  }

  /** Local cancellation only. An already dispatched POST may still commit or acknowledge. */
  dispose(): void { this.disposed = true; this.controller.abort() }

  private expired(): boolean { return this.disposed || this.clock.now() >= this.policy.deadlineAt }

  private async run(): Promise<ReplyReceiptOutcome> {
    while (this.attempts < this.policy.maxAttempts && !this.expired()) {
      const result = await this.request()
      if (this.expired()) return 'unconfirmed'
      if (result !== 'retry') return result
      if (this.attempts < this.policy.maxAttempts && !this.expired()) {
        await this.bounded(new Promise<ReplyReceiptAttempt>(() => {}), this.policy.retryWaitMs)
      }
    }
    return 'unconfirmed'
  }

  private request(): Promise<ReplyReceiptAttempt> {
    if (this.expired() || this.inFlight) return Promise.resolve('unconfirmed')
    this.attempts++
    this.inFlight = true
    // Schedule before entering transport so throws and synchronous reentry have the same retained identity.
    const posted = Promise.resolve().then(() => {
      if (this.expired()) { this.inFlight = false; return 'unconfirmed' as const }
      return this.operation(Object.freeze([this.receipt])).then(() => {
        this.inFlight = false
        this.positiveAck = true
        return 'acknowledged' as const
      })
    }).catch((error: unknown): ReplyReceiptAttempt => {
      this.inFlight = false
      return isPermanentRefusal(error) ? 'unconfirmed' : 'retry'
    })
    // A timeout ends retries: the original unsignalled HTTP request is still potentially in flight.
    return this.bounded(posted, this.policy.requestWaitMs)
  }

  private bounded(operation: Promise<ReplyReceiptAttempt>, waitMs: number): Promise<ReplyReceiptAttempt> {
    if (this.expired()) return Promise.resolve('unconfirmed')
    return new Promise(resolve => {
      let finished = false, cancel = (): void => {}
      const signal = this.controller.signal
      const finish = (result: ReplyReceiptAttempt): void => {
        if (finished) return
        finished = true; cancel(); signal.removeEventListener('abort', abort); resolve(result)
      }
      const abort = (): void => finish('unconfirmed')
      signal.addEventListener('abort', abort, { once: true })
      cancel = this.clock.after(Math.min(waitMs, this.policy.deadlineAt - this.clock.now()), abort)
      void operation.then(finish, () => finish('unconfirmed'))
    })
  }
}


interface ReplyHomeNode {
  readonly handle: FileHandle
  readonly path: string
  readonly signature: BigIntStats
  readonly directory: boolean
}
interface ReplyRemovalEntry { readonly path: string; readonly signature: BigIntStats; readonly parent: FileHandle }
interface ReplyRemovalInventory {
  readonly directories: { readonly node: ReplyHomeNode; readonly entry: ReplyRemovalEntry; readonly depth: number }[]
  readonly leaves: ReplyRemovalEntry[]
  count: number
}
function replyRemovalName(name: string): void {
  if (!storable(name) || !name || name === '.' || name === '..' || name.includes('/') || name.includes('�') ||
      Buffer.byteLength(name) > 255) replyHomeRefusal()
}
function replyInode(info: BigIntStats): string { return `${info.dev}:${info.ino}` }
function replyRemovalIdentity(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.uid === b.uid &&
    (a.isDirectory() ? b.isDirectory() : a.nlink === b.nlink && a.size === b.size &&
      a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs)
}
const REPLY_LEASE_BYTES = 65_536
const REPLY_JOURNAL_BYTES = (4096 + 16) * LINE_BYTES
function replyHomeRefusal(): never { throw new Error('reply_live_home_unconfirmed') }
function replyDescriptorPath(fd: number, name: string): string { return `/proc/self/fd/${fd}/${name}` }
function replyFileIdentity(a: BigIntStats, b: BigIntStats, directory: boolean): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.uid === b.uid &&
    (directory ? b.isDirectory() : b.isFile() && a.nlink === b.nlink && a.size === b.size &&
      a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs)
}
function replyPrivateMetadata(info: BigIntStats, directory: boolean, limit: number): void {
  if (typeof process.geteuid !== 'function' || info.uid !== BigInt(process.geteuid()) ||
      (info.mode & 0o7777n) !== (directory ? 0o700n : 0o600n) ||
      (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1n || info.size < 1n || info.size > BigInt(limit))) {
    replyHomeRefusal()
  }
}
function replyLeaseRecord(line: string): Record<string, unknown> {
  let value: unknown
  try { value = JSON.parse(line) } catch { return replyHomeRefusal() }
  if (!isRecord(value) || value.version !== 1) return replyHomeRefusal()
  // The concrete writer emits compact ensure_ascii JSON. Refuse duplicate keys and non-writer encodings.
  const encoded = JSON.stringify(value).replace(/[^\x00-\x7e]/g, character =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
  if (encoded !== line) return replyHomeRefusal()
  return value
}
function replyLeaseProcessFields(value: Record<string, unknown>): void {
  if (!count(value.pid) || value.pid < 1 || value.pid > 2_147_483_647 || typeof value.startTime !== 'string' ||
      !/^(0|[1-9][0-9]{0,19})$/.test(value.startTime) || BigInt(value.startTime) > 18_446_744_073_709_551_615n ||
      typeof value.bootId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.bootId) ||
      typeof value.nonce !== 'string' || !/^[0-9a-f]{64}$/.test(value.nonce)) replyHomeRefusal()
}
function replyLeaseExecutable(path: unknown): void {
  if (typeof path !== 'string' || !storable(path) || !isAbsolute(path) || path === '/' ||
      path.split('/').slice(1).some(part => !part || part === '.' || part === '..') || Buffer.byteLength(path) > 4096) {
    replyHomeRefusal()
  }
}
function replyLeaseIdentity(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !closed(value, ['pid', 'startTime', 'bootId', 'executable', 'nonce'])) return replyHomeRefusal()
  replyLeaseProcessFields(value)
  replyLeaseExecutable(value.executable)
  return value
}
function replyLeaseRoles(launcher: Record<string, unknown>, fork: Record<string, unknown>, child: Record<string, unknown>, nonce: string): void {
  if (!closed(launcher, ['version', 'kind', 'identity']) || launcher.kind !== 'launcher' ||
      !closed(fork, ['version', 'kind', 'nonce']) || fork.kind !== 'fork' || fork.nonce !== nonce ||
      !closed(child, ['version', 'kind', 'identity']) || child.kind !== 'child') replyHomeRefusal()
}
function verifyReplyLiveLease(bytes: Uint8Array, scope: Pick<ReplyLiveRetirementScope, 'pid' | 'nonce'>): void {
  if (bytes.length > REPLY_LEASE_BYTES) return replyHomeRefusal()
  let lines: string[]
  try { lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\n') } catch { return replyHomeRefusal() }
  if (lines.length !== 4 || lines[3] !== '') return replyHomeRefusal()
  const launcher = replyLeaseRecord(lines[0]), fork = replyLeaseRecord(lines[1]), child = replyLeaseRecord(lines[2])
  replyLeaseRoles(launcher, fork, child, scope.nonce)
  const first = replyLeaseIdentity(launcher.identity), second = replyLeaseIdentity(child.identity)
  if (first.pid !== scope.pid || first.nonce !== scope.nonce || second.nonce !== scope.nonce ||
      second.bootId !== first.bootId || second.pid === first.pid) replyHomeRefusal()
}

/** Retained descriptors and bounded removal, never process settlement, lease locking or API authority.
 * The module-private caller must supply its original live-child scope and complete every barrier first.
 * Linux kernel fd anchors are intentional; every data component itself is opened O_NOFOLLOW.
 * Target qualification must exclude submounts: st_dev rejects other devices, not same-device bind mounts.
 */
class ReplyLiveHome {
  private readonly nodes: ReplyHomeNode[] = []
  private readonly handles: FileHandle[] = []
  private readonly directoryReaders = new Set<Dir>()
  private readonly removed = new Set<string>()
  private home: ReplyHomeNode | null = null
  private homeParent: ReplyHomeNode | null = null
  private boundaryLength = 0
  private removalStarted = false
  private failed = false
  private started = false
  private journal: ReplyHomeNode | null = null
  private offset = 0
  private active: Promise<unknown> | null = null
  private closing: Promise<void> | null = null
  private closed = false
  private constructor(private readonly scope: ReplyLiveRetirementScope, private readonly checkpoint: () => void) {}

  /** Ownership is handed back before I/O; even failed acquisition/close remains owned by the caller. */
  static create(scope: ReplyLiveRetirementScope, checkpoint: () => void): ReplyLiveHome {
    if (process.platform !== 'linux' || !isAbsolute(scope.root) || resolve(scope.root) !== scope.root ||
        !/^gen-[A-Za-z0-9_-]+$/.test(basename(scope.root)) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(scope.binding.attemptId)) replyHomeRefusal()
    return new ReplyLiveHome(structuredClone(scope), checkpoint)
  }

  open(): Promise<void> {
    if (this.started) return Promise.reject(new Error('reply_live_home_unavailable'))
    this.started = true
    return this.exclusive(() => this.acquire())
  }

  read(): Promise<Uint8Array | null> {
    if (this.removalStarted) return Promise.reject(new Error('reply_live_home_unavailable'))
    return this.exclusive(async () => {
      await this.verifyNodes()
      const journal = this.journal
      if (!journal) return replyHomeRefusal()
      if (this.offset === Number(journal.signature.size)) return null
      const bytes = Buffer.alloc(Math.min(65_536, Number(journal.signature.size) - this.offset))
      try {
        const result = await journal.handle.read(bytes, 0, bytes.length, this.offset)
        this.current()
        if (result.bytesRead !== bytes.length) return replyHomeRefusal()
        await this.verifyNodes()
        this.offset += bytes.length
        return bytes
      } catch { bytes.fill(0); return replyHomeRefusal() }
    })
  }

  verify(): Promise<void> {
    if (this.removalStarted) return Promise.reject(new Error('reply_live_home_unavailable'))
    return this.exclusive(() => this.verifyNodes())
  }

  close(): Promise<void> {
    this.closed = true
    this.closing ??= this.closeOwned()
    return this.closing
  }
  private async closeOwned(): Promise<void> {
    await this.active?.catch(() => {})
    let readerFailed = false
    for (const directory of [...this.directoryReaders]) {
      try { await directory.close(); this.directoryReaders.delete(directory) } catch { readerFailed = true }
    }
    const unresolved: FileHandle[] = []
    for (const handle of [...this.handles].reverse()) {
      try { await handle.close() } catch { unresolved.push(handle) }
    }
    this.handles.splice(0, this.handles.length, ...unresolved)
    this.nodes.length = 0; this.journal = null
    if (readerFailed || unresolved.length !== 0) replyHomeRefusal()
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed || this.active !== null) return Promise.reject(new Error('reply_live_home_unavailable'))
    const pending = Promise.resolve().then(async () => {
      try { this.current(); const result = await operation(); this.current(); return result }
      catch { this.failed = true; return replyHomeRefusal() }
    })
    this.active = pending
    void pending.finally(() => { if (this.active === pending) this.active = null }).catch(() => {})
    return pending
  }
  private current(): void { if (this.closed || this.failed) replyHomeRefusal(); this.checkpoint() }

  private async acquire(): Promise<void> {
    const parts = this.scope.root.split('/').slice(1)
    if (parts.length > 64 || parts.some(part => !part || part === '.' || part === '..')) replyHomeRefusal()
    let directory = await this.acquireNode('/', true)
    for (const part of parts) directory = await this.acquireNode(replyDescriptorPath(directory.handle.fd, part), true)
    replyPrivateMetadata(directory.signature, true, 0)
    const home = await this.acquireNode(replyDescriptorPath(directory.handle.fd, this.scope.binding.attemptId), true)
    replyPrivateMetadata(home.signature, true, 0)
    if (home.signature.dev !== directory.signature.dev) replyHomeRefusal()
    this.home = home; this.homeParent = directory
    const lease = await this.acquireNode(replyDescriptorPath(home.handle.fd, 'lease.json'), false)
    replyPrivateMetadata(lease.signature, false, REPLY_LEASE_BYTES)
    await this.readLease(lease)
    const dsh = await this.acquireNode(replyDescriptorPath(home.handle.fd, 'dsh-home'), true)
    replyPrivateMetadata(dsh.signature, true, 0)
    this.journal = await this.acquireNode(replyDescriptorPath(dsh.handle.fd, 'sophia-reply.jsonl'), false)
    replyPrivateMetadata(this.journal.signature, false, REPLY_JOURNAL_BYTES)
    this.boundaryLength = this.nodes.length
    await this.verifyNodes()
  }

  private async acquireNode(path: string, directory: boolean): Promise<ReplyHomeNode> {
    this.current()
    const flags = fsFlags.O_RDONLY | fsFlags.O_NOFOLLOW | fsFlags.O_NONBLOCK | (directory ? fsFlags.O_DIRECTORY : 0)
    const handle = await openReplyFile(path, flags)
    // Retain before stat/checkpoint: an acquisition that settles after cancellation still needs closing.
    this.handles.push(handle)
    this.current()
    const signature = await handle.stat({ bigint: true })
    this.current()
    const node = { handle, path, signature, directory }
    this.nodes.push(node)
    if (directory ? !signature.isDirectory() : !signature.isFile()) return replyHomeRefusal()
    return node
  }

  private async readLease(node: ReplyHomeNode): Promise<void> {
    const bytes = Buffer.alloc(Number(node.signature.size))
    try {
      this.current()
      const result = await node.handle.read(bytes, 0, bytes.length, 0)
      this.current()
      if (result.bytesRead !== bytes.length) return replyHomeRefusal()
      verifyReplyLiveLease(bytes, this.scope)
    } finally { bytes.fill(0) }
  }

  private async verifyNodes(): Promise<void> {
    if (!this.journal) replyHomeRefusal()
    for (const node of this.nodes) await this.verifyNode(node)
  }
  private async verifyNode(node: ReplyHomeNode): Promise<void> {
    if (this.removed.has(replyInode(node.signature))) return
    this.current()
    const descriptor = await node.handle.stat({ bigint: true })
    this.current()
    const named = await statReplyPath(node.path, { bigint: true })
    this.current()
    if (!replyFileIdentity(node.signature, descriptor, node.directory) ||
        !replyFileIdentity(node.signature, named, node.directory)) replyHomeRefusal()
  }
  private async verifyBoundary(): Promise<void> {
    for (const node of this.nodes.slice(0, this.boundaryLength)) await this.verifyNode(node)
  }

  /** Caller owes current own-receipt/journal/API proof in checkpoint; this method never constructs it. */
  remove(): Promise<void> {
    if (this.removalStarted) return Promise.reject(new Error('reply_live_home_unavailable'))
    this.removalStarted = true
    return this.exclusive(async () => {
      const home = this.home, parent = this.homeParent
      if (!home || !parent || !this.journal || this.offset !== Number(this.journal.signature.size)) replyHomeRefusal()
      const tree: ReplyRemovalInventory = { directories: [{ node: home, entry: { ...home, parent: parent.handle }, depth: 0 }], leaves: [], count: 0 }
      await this.verifyNodes()
      for (const directory of tree.directories) await this.scanRemovalDirectory(directory, tree)
      await this.verifyNodes()
      // Journal/lease remain until other content leaves. Any partial failure still retains the slot.
      tree.leaves.sort((a, b) => this.removalOrder(a.path) - this.removalOrder(b.path))
      for (const leaf of tree.leaves) await this.removeEntry(leaf)
      for (const directory of [...tree.directories].reverse()) await this.removeEntry(directory.entry)
      await this.verifyBoundary()
      await this.requireHomeGone(home)
    })
  }
  private removalOrder(path: string): number {
    return path.endsWith('/lease.json') ? 2 : path.endsWith('/sophia-reply.jsonl') ? 1 : 0
  }
  private async scanRemovalDirectory(directory: ReplyRemovalInventory['directories'][number], tree: ReplyRemovalInventory): Promise<void> {
    this.current()
    const reader = await openReplyDirectory(replyDescriptorPath(directory.node.handle.fd, '.'), { bufferSize: 32 })
    this.directoryReaders.add(reader)
    try {
      for (;;) {
        this.current()
        const item = await reader.read()
        this.current()
        if (item === null) break
        await this.addRemovalEntry(directory, tree, item.name)
      }
    } finally {
      await reader.close()
      this.directoryReaders.delete(reader)
    }
    this.current()
  }
  private async addRemovalEntry(directory: ReplyRemovalInventory['directories'][number], tree: ReplyRemovalInventory, name: string): Promise<void> {
    replyRemovalName(name)
    if (++tree.count > 4096) replyHomeRefusal()
    const path = replyDescriptorPath(directory.node.handle.fd, name)
    this.current()
    const signature = await statReplyPath(path, { bigint: true })
    this.current()
    if (typeof process.geteuid !== 'function' || signature.uid !== BigInt(process.geteuid()) ||
        signature.dev !== this.home?.signature.dev) replyHomeRefusal()
    if (!signature.isDirectory()) {
      if (signature.nlink !== 1n) replyHomeRefusal()
      tree.leaves.push({ path, signature, parent: directory.node.handle })
      return
    }
    if (directory.depth >= 32 || tree.directories.length >= 64) replyHomeRefusal()
    const node = this.nodes.find(item => item.directory && replyInode(item.signature) === replyInode(signature)) ??
      await this.acquireNode(path, true)
    if (!replyRemovalIdentity(signature, node.signature)) replyHomeRefusal()
    tree.directories.push({ node, entry: { path, signature, parent: directory.node.handle }, depth: directory.depth + 1 })
  }
  private async removeEntry(entry: ReplyRemovalEntry): Promise<void> {
    // An open nested directory can be renamed outside the home; retain and recheck its entire name chain.
    await this.verifyNodes()
    this.current()
    const named = await statReplyPath(entry.path, { bigint: true })
    this.current()
    if (!replyRemovalIdentity(entry.signature, named)) replyHomeRefusal()
    if (entry.signature.isDirectory()) await removeReplyDirectory(entry.path)
    else await unlinkReplyPath(entry.path) // A symlink is a leaf; its target is never opened or traversed.
    this.current()
    await entry.parent.sync()
    this.current()
    this.removed.add(replyInode(entry.signature))
  }
  private async requireHomeGone(home: ReplyHomeNode): Promise<void> {
    this.current()
    try { await statReplyPath(home.path, { bigint: true }) }
    catch (error: unknown) {
      this.current()
      if (isRecord(error) && error.code === 'ENOENT') return
      return replyHomeRefusal()
    }
    return replyHomeRefusal()
  }

}

interface ReplyLaunchProvenance {
  readonly root: string
  readonly runtimeUnitId: string
  readonly attemptId: string
  readonly nonce: string
  readonly pid: number
  readonly launcher: ChildProcess
  readonly stream: Duplex
}
interface ReplyLiveRetirementScope {
  readonly root: string
  readonly pid: number
  readonly nonce: string
  readonly scope: ReplyRecoveryScope
  readonly binding: RecoveryBinding
  readonly target: ReplyChildOptions['target']
}
// Tokens never come from an object's fields. Each concrete acquisition transfers once.
const launchProvenance = new WeakMap<object, Readonly<ReplyLaunchProvenance>>()
const adoptedLaunchProvenance = new WeakMap<ReplyOwnedLaunch, Readonly<ReplyLaunchProvenance>>()
const childLaunchProvenance = new WeakMap<ReplyChild, Readonly<ReplyLaunchProvenance>>()
const consumedLaunches = new WeakSet<object>()
function transferLaunchProvenance(value: unknown, owned: ReplyOwnedLaunch, scope: ReplyControlScope, unit: string): void {
  if (typeof value !== 'object' || value === null) return
  if (consumedLaunches.has(value)) throw new Error('reply_launch_reused')
  const proof = launchProvenance.get(value)
  if (!proof) return // Injected launches can exercise the relay but never authorize physical retirement.
  consumedLaunches.add(value); launchProvenance.delete(value)
  if (proof.launcher !== owned.launcher || proof.stream !== owned.stream || proof.pid !== owned.launcher.pid ||
      proof.attemptId !== scope.attemptId || proof.nonce !== scope.nonce || proof.runtimeUnitId !== unit) {
    throw new Error('reply_launch_scope_changed')
  }
  adoptedLaunchProvenance.set(owned, proof)
}
function adoptLaunchProvenance(owned: ReplyOwnedLaunch, child: ReplyChild): void {
  const proof = adoptedLaunchProvenance.get(owned)
  adoptedLaunchProvenance.delete(owned)
  if (proof) childLaunchProvenance.set(child, proof)
}

/** Trusted source/test launch boundary. It supplies handles, never identity or API authority. */
export interface ReplyOwnedLaunch {
  readonly launcher: ChildProcess
  readonly stream: Duplex
}
function acquiredInstance<T>(value: unknown, type: abstract new (...args: never[]) => T): T | null {
  try { return value instanceof type ? value : null }
  catch { return null } // A proxy must not prevent retaining another valid acquired handle.
}
interface ReplyAcquiredLaunch {
  readonly launcher: ChildProcess | null
  readonly stream: Duplex | null
  readonly control: Writable | null
}
export interface ReplyControllerSettings {
  readonly routeId: string
  readonly route: ReplyControlScope['route']
  readonly maxTokens: number
  readonly admissionWaitMs: number
  readonly bounds: ReplyStopBounds
  readonly retry: Omit<ReplySettlementPolicy, 'deadlineAt'>
  readonly receiptWaitMs: number
  readonly verification: ReplyHomeVerification | null
  readonly launch: (scope: Readonly<ReplyControlScope>) => ReplyLaunchAcquisition
}
export interface ReplyControllerOwner {
  readonly projectId: string
  readonly runtimeUnitId: string
  readonly leaseId: string
}

function controllerSettings(value: ReplyControllerSettings, clock: ReplyStopClock): ReplyControllerSettings {
  const route = Object.freeze({ ...value.route }), bounds = Object.freeze({ ...value.bounds })
  const retry = Object.freeze({ ...value.retry })
  const probe = new ReplyControlReader({ attemptId: 'validation', nonce: 'a', route, maxTokens: value.maxTokens }, () => {})
  probe.end()
  validateReplyStop({ nonce: 'a', startedAt: clock.now() }, bounds, clock)
  if (!storable(value.routeId) || value.routeId.length < 1 || value.routeId.length > 200 ||
      ![value.admissionWaitMs, value.receiptWaitMs].every(n => Number.isSafeInteger(n) && n > 0 && n <= 120_000) ||
      !validRetryPolicy({ ...retry, deadlineAt: clock.now() + value.receiptWaitMs }, clock) ||
      bounds.deadlineMs + bounds.killMs + bounds.exitWaitMs + bounds.settleWaitMs > 360_000 ||
      typeof value.launch !== 'function') throw new Error('reply_controller_settings_invalid')
  return Object.freeze({ ...value, route, bounds, retry,
    verification: value.verification === null ? null : Object.freeze({ ...value.verification }) })
}

/** Concrete authority composition. Production configuration remains disabled until host qualification. */
export class ReplyController {
  private readonly owner: ReplyControllerOwner
  private readonly settings: ReplyControllerSettings | null
  private registry: ReplyChildren | null = null
  private resourceId: string | null = null
  private recoveryRequired = false
  private disposed = false
  private readonly pending = new Set<Promise<unknown>>()
  private readonly launches = new Set<ReplyAcquiredLaunch>()
  private readonly failures = new Set<string>()

  constructor(owner: ReplyControllerOwner, settings: ReplyControllerSettings | null,
      private readonly transport: ServiceTransport, private readonly clock: ReplyStopClock = monotonicReplyClock) {
    // Reuse the registry's exact owner validation before any external work.
    new ReplyChildren({ ...owner, resourceId: 'validation' }, null).dispose()
    this.owner = Object.freeze({ ...owner })
    this.settings = settings === null ? null : controllerSettings(settings, clock)
  }

  unrecovered(): void { this.recoveryRequired = true }

  execute(value: unknown): RuntimeReceipt[] {
    if (!isReplyOwnedCommand(value)) throw new Error('reply_controller_invalid')
    const command = structuredClone(value)
    const refusal = this.refusal(command)
    if (refusal !== null) return this.refuse(command, refusal)
    try {
      const registry = this.registryFor(command)
      const work = command.kind === 'create' ? registry.executeCreate(command) :
        command.kind === 'retire' ? registry.executeRetire(command) :
        command.kind === 'inspect' ? registry.executeInspect(command) : registry.executeStop(command)
      this.retain(work)
      return []
    } catch { this.failures.add('reply_command_unconfirmed'); return [] }
  }

  private refusal(command: ReplyOwnedCommand): string | null {
    if (command.binding.projectId !== this.owner.projectId || command.binding.runtimeUnitId !== this.owner.runtimeUnitId ||
        (this.resourceId !== null && command.binding.resourceId !== this.resourceId)) return 'reply_owner_mismatch'
    if (this.disposed) return 'reply_controller_disposed'
    if (this.recoveryRequired) return 'reply_recovery_required'
    if (!this.settings) return 'containment_unavailable'
    if (!['create', 'stop', 'retire', 'inspect'].includes(command.kind)) return 'reply_command_unqualified'
    return this.routeRefusal(command)
  }

  private routeRefusal(command: ReplyOwnedCommand): string | null {
    if (command.kind !== 'create') return null
    return !('conversation' in command.payload) || command.payload.route !== this.settings?.routeId ? 'reply_route_mismatch' : null
  }

  inspect() {
    return { disposed: this.disposed, recoveryRequired: this.recoveryRequired, pending: this.pending.size,
      launches: this.launches.size, failures: [...this.failures] }
  }

  dispose(): void {
    this.disposed = true
    try { this.registry?.dispose() } catch { this.failures.add('reply_registry_dispose_unconfirmed') }
    for (const owned of this.launches) this.closeAcquired(owned)
  }

  private closeAcquired(owned: ReplyAcquiredLaunch): void {
    // EOF is cancellation, not process settlement. Each acquired resource is attempted independently.
    try { owned.control?.end() } catch { this.failures.add('reply_control_close_unconfirmed') }
    try { owned.stream?.destroy() } catch { this.failures.add('reply_stream_close_unconfirmed') }
  }

  private returnedHandle(value: object, key: string): unknown {
    // Accessors are not ownership transfer; never execute caller getters while recovering partial handles.
    try { return Object.getOwnPropertyDescriptor(value, key)?.value }
    catch { return null }
  }

  private acquire(value: unknown, scope: ReplyControlScope): ReplyOwnedLaunch {
    const raw = isRecord(value) ? value : {}
    const returnedLauncher = this.returnedHandle(raw, 'launcher'), returnedStream = this.returnedHandle(raw, 'stream')
    const launcher = acquiredInstance(returnedLauncher, ChildProcess)
    const stream = acquiredInstance(returnedStream, Duplex)
    const returnedControl = launcher === null ? null : this.returnedHandle(launcher, 'stdin')
    const control = acquiredInstance(returnedControl, Writable)
    const acquired = Object.freeze({ launcher, stream, control })
    this.launches.add(acquired) // Keep valid partial ownership even when the other returned handle is malformed.
    if (launcher === null || stream === null || control === null) {
      this.closeAcquired(acquired)
      throw new Error('reply_launch_handles_invalid')
    }
    const owned = Object.freeze({ launcher, stream })
    try { transferLaunchProvenance(value, owned, scope, this.owner.runtimeUnitId) }
    catch { this.closeAcquired(acquired); throw new Error('reply_launch_provenance_invalid') }
    return owned
  }

  private refuse(command: ReplyOwnedCommand, reason: string): RuntimeReceipt[] {
    // Cleanup uncertainty must never become a rejected/checked cleanup acknowledgement.
    if (command.kind === 'stop' || command.kind === 'retire') { this.failures.add(reason); return [] }
    const stage = reason === 'reply_recovery_required' || reason === 'reply_controller_disposed' ? 'outcome_unknown' : 'rejected'
    return [createReplyReceipt(this.binding(command), { stage, reason }, null)]
  }

  private binding(command: ReplyOwnedCommand): RuntimeConversationClaimRequest {
    return { attemptId: command.binding.attemptId, commandId: command.commandId,
      authorityEpoch: command.binding.authorityEpoch, leaseId: this.owner.leaseId }
  }

  private registryFor(command: ReplyOwnedCommand): ReplyChildren {
    if (this.registry !== null) return this.registry
    const settings = this.settings
    if (settings === null) throw new Error('reply_controller_disabled')
    this.resourceId = command.binding.resourceId
    this.registry = new ReplyChildren({ ...this.owner, resourceId: this.resourceId },
      (create, binding) => this.admission(create, binding), {
        ...settings.retry, waitMs: settings.receiptWaitMs,
        receipts: values => this.transport.receipts(values),
        acknowledged: (body, signal) => this.transport.conversationAcknowledged(body, signal),
      }, this.clock, settings.verification)
    return this.registry
  }

  private retain(work: Promise<unknown>): void {
    if (this.pending.has(work)) return
    this.pending.add(work)
    void work.catch(() => { this.failures.add('reply_work_unconfirmed') }).finally(() => this.pending.delete(work))
  }

  private admission(value: RuntimeCommand, binding: RuntimeConversationClaimRequest): ReplyAdmission {
    const settings = this.settings
    if (!settings || !isReplyOwnedCommand(value) || !('conversation' in value.payload)) throw new Error('reply_controller_invalid')
    const command = structuredClone(value)
    const scope = Object.freeze({ attemptId: binding.attemptId, nonce: randomBytes(32).toString('hex'),
      route: settings.route, maxTokens: settings.maxTokens })
    return new ReplyAdmission(binding, settings.admissionWaitMs, {
      releaseInput: () => { command.payload = { ...command.payload, text: undefined } },
      claim: (body, signal) => this.transport.conversationClaim(body, signal),
      authorize: (body, signal) => this.transport.conversationGo(body, signal),
      spawn: body => this.launch(command, body, scope),
      prepare: (child, signal) => child.prepare({ t: 'start', ...scope, sessionId: `sophia-${binding.attemptId}`,
        epoch: binding.authorityEpoch, prompt: command.payload.text }, scope, signal),
    }, this.clock)
  }

  private launch(command: ReplyOwnedCommand, binding: RuntimeConversationClaimRequest, scope: ReplyControlScope): ReplyChild {
    const settings = this.settings
    if (!settings || this.disposed || !('conversation' in command.payload)) throw new Error('reply_controller_unavailable')
    const startedAt = this.clock.now()
    const delivery = new ReplyDelivery(command, this.owner.leaseId,
      { ...settings.retry, deadlineAt: startedAt + settings.bounds.deadlineMs }, this.transport, this.clock)
    const owned = this.acquire(settings.launch(scope), scope)
    try { return this.adoptChild(owned, command, binding, { scope, startedAt, delivery, settings }) }
    catch {
      const acquired = [...this.launches].find(item => item.launcher === owned.launcher && item.stream === owned.stream)
      if (acquired) this.closeAcquired(acquired)
      throw new Error('reply_launch_adoption_unconfirmed')
    }
  }

  private adoptChild(owned: ReplyOwnedLaunch, command: ReplyOwnedCommand, binding: RuntimeConversationClaimRequest,
      plan: { scope: ReplyControlScope; startedAt: number; delivery: ReplyDelivery; settings: ReplyControllerSettings }): ReplyChild {
    if (!('conversation' in command.payload)) throw new Error('reply_controller_invalid')
    const { scope, startedAt, delivery, settings } = plan
    const child = new ReplyChild({ ...owned, identity: { runtimeUnitId: this.owner.runtimeUnitId,
      attemptId: binding.attemptId, nativeSessionId: `sophia-${binding.attemptId}` },
      spawn: { nonce: scope.nonce, startedAt }, binding,
      target: { replyId: command.binding.conversationReplyId, unit: command.payload.conversation.unit },
      bounds: settings.bounds, settlement: settings.retry }, {
        observe: (value, signal) => delivery.observe(value, signal),
        reserve: (value, signal) => delivery.reserve(value, signal),
        settle: (body, signal) => this.transport.conversationSettle(body, signal),
        status: () => {}, fenced: () => {},
      }, this.clock)
    adoptLaunchProvenance(owned, child)
    if (this.disposed) { child.dispose(); this.dispose() }
    return child
  }
}


export interface ReplyLaunchAcquisition {
  readonly launcher: ChildProcess
  readonly stream: Duplex | null
}
export interface ReplyLauncherOptions {
  readonly python: string
  readonly launcher: string
  readonly root: string
  readonly node: string
  readonly entry: string
  readonly runtimeDir: string
  readonly template: string
  readonly templateDigest: string
  readonly profileName: string
  readonly runtimeUnitId: string
}
function launcherOptions(value: ReplyLauncherOptions): Readonly<ReplyLauncherOptions> {
  const options = Object.freeze({ ...value })
  if (![options.python, options.launcher, options.root, options.node, options.entry, options.runtimeDir, options.template]
      .every(path => checkerPath(path) && path !== '/') ||
      !/^gen-[A-Za-z0-9_-]{1,100}$/.test(basename(options.root)) ||
      !options.entry.startsWith(options.runtimeDir + '/') ||
      ![options.templateDigest, options.profileName, options.runtimeUnitId].every(item => typeof item === 'string') ||
      !/^sophia-reply-tree-v1:sha256:[a-f0-9]{64}$/.test(options.templateDigest) ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(options.profileName) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(options.runtimeUnitId)) {
    throw new Error('reply_launcher_options_invalid')
  }
  return options
}
type ReplyLaunchIdentity = Readonly<Pick<ReplyControlScope, 'attemptId' | 'nonce'>>
function launcherScope(scope: Readonly<ReplyControlScope>): ReplyLaunchIdentity {
  const { attemptId, nonce } = scope
  if (typeof attemptId !== 'string' || typeof nonce !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(attemptId) ||
      !/^[a-f0-9]{64}$/.test(nonce)) throw new Error('reply_launcher_scope_invalid')
  return Object.freeze({ attemptId, nonce })
}
function launcherArguments(options: ReplyLauncherOptions, scope: ReplyLaunchIdentity): string[] {
  const { attemptId, nonce } = scope
  return ['-I', '-B', options.launcher, 'run', '--root', options.root, '--attempt', attemptId,
    '--parent', String(process.pid), '--nonce', nonce, '--node', options.node, '--entry', options.entry,
    '--runtime-dir', options.runtimeDir, '--template', options.template, '--template-digest', options.templateDigest,
    '--profile-name', options.profileName, '--unit', options.runtimeUnitId]
}

/** Fixed noncredential process acquisition. Only a controller may adopt its handles; no host qualification is implied. */
export function replyOwnedLauncher(value: ReplyLauncherOptions): ReplyControllerSettings['launch'] {
  const options = launcherOptions(value)
  return scope => {
    const identity = launcherScope(scope)
    const launcher = spawn(options.python, launcherArguments(options, identity), {
      cwd: '/', env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
      stdio: ['pipe', 'ignore', 'ignore', 'pipe'], shell: false,
    })
    const fd3 = launcher.stdio[3]
    // Hand partial acquisition back too: the controller retains/cancels it before refusing adoption.
    const acquired = Object.freeze({ launcher, stream: fd3 instanceof Duplex ? fd3 : null })
    if (acquired.stream && Number.isSafeInteger(launcher.pid) && launcher.pid !== undefined && launcher.pid > 0) {
      launchProvenance.set(acquired, Object.freeze({ root: options.root, runtimeUnitId: options.runtimeUnitId,
        attemptId: identity.attemptId, nonce: identity.nonce, pid: launcher.pid, launcher, stream: acquired.stream }))
    }
    return acquired
  }
}
