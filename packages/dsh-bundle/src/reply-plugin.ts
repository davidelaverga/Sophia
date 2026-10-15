/**
 * CON reply-only durable event projection. Native prompt, reasoning, tool and compaction content stay in the
 * disposable child's governed home. The explicit factory helper creates a fresh agent; no route is activated
 * by importing this module, and scoped setup does not attest host cleanup.
 * The Cordis bootstrap requires explicit trusted accounting and launcher bindings; profile/route activation and
 * actual host containment remain separate qualifications.
 */
import { createUserMessage, expandAssistantStream } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, ReasoningEffortId, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import { closeSync, constants, fstatSync, fsyncSync, openSync, readSync, writeSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { RuntimeObservation } from './runtime-wire-types.generated.js'
import type { ReplyReserveLine, ReplySettleLine } from './reply-child.js'

export interface ReplyIdentity {
  readonly runtimeUnitId: string
  readonly attemptId: string
  readonly nativeSessionId: string
}

const ANSWER_LIMIT = 16_000
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const recordOf = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {}
const countOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const storable = (value: string): boolean => value.isWellFormed() && !value.includes('\u0000')
const labelOf = (value: unknown): string | null =>
  typeof value === 'string' && value.length <= 200 && storable(value) ? value : null

function checkIdentity(identity: ReplyIdentity, seq: number): void {
  for (const [value, limit] of [[identity.runtimeUnitId, 160], [identity.attemptId, 64], [identity.nativeSessionId, 160]] as const) {
    if (typeof value !== 'string' || !IDENTIFIER.test(value) || value.length > limit) throw new Error('reply_identity_invalid')
  }
  if (identity.nativeSessionId !== `sophia-${identity.attemptId}`) throw new Error('reply_identity_invalid')
  if (countOf(seq) === null) throw new Error('reply_sequence_invalid')
}

function ordinalOf(value: number | null): 1 | 2 {
  if (value !== 1 && value !== 2) throw new Error('reply_ordinal_invalid')
  return value
}

function usageOf(value: unknown): Record<string, number | null> {
  const usage = recordOf(value)
  const cacheRead = countOf(usage.cacheReadTokens)
  const cacheWrite = countOf(usage.cacheWriteTokens)
  return {
    inputTokens: countOf(usage.inputTokens),
    outputTokens: countOf(usage.outputTokens),
    ...(cacheRead === null ? {} : { cacheReadTokens: cacheRead }),
    ...(cacheWrite === null ? {} : { cacheWriteTokens: cacheWrite }),
  }
}

function assistantProjection(event: SessionEvent<'assistant/message'>, ordinal: number | null): unknown {
  let text = ''
  try {
    for (const { chunk } of expandAssistantStream(event.data.stream)) {
      if (chunk.type !== 'text-delta') continue
      if (typeof chunk.text !== 'string') throw new Error('reply_stream_invalid')
      text += chunk.text
    }
  } catch {
    // Native corruption must never place the malformed stream or its content in the parent error channel.
    throw new Error('reply_stream_invalid')
  }
  if (Object.hasOwn(event.data, 'interrupted') && typeof event.data.interrupted !== 'boolean') {
    throw new Error('reply_interrupted_invalid')
  }
  const length = [...text].length
  const oversize = length > ANSWER_LIMIT
  const invalidText = !storable(text)
  const source = recordOf(recordOf(event.data.message).source)
  return {
    text: oversize || invalidText ? null : text,
    oversize,
    invalidText,
    length,
    provider: labelOf(source.provider),
    model: labelOf(source.model),
    ...usageOf(event.data.usage),
    interrupted: event.data.interrupted === true,
    ordinal: ordinalOf(ordinal),
  }
}

function userProjection(event: SessionEvent<'user/message'>): unknown {
  const id = event.data.id
  if (typeof id !== 'string' || !IDENTIFIER.test(id) || id.length > 64) throw new Error('reply_identity_invalid')
  let length = 0
  for (const block of event.data.content) {
    if (block.type === 'text') length += [...block.text].length
  }
  return { id, length }
}

function compactionProjection(value: unknown, ordinal: number | null): unknown {
  const data = recordOf(value)
  return {
    compactionId: labelOf(data.compactionId),
    provider: labelOf(data.provider),
    model: labelOf(data.model),
    ...usageOf(data.usage),
    ordinal: ordinalOf(ordinal),
  }
}

function projectData(event: SessionEvent, ordinal: number | null): unknown {
  switch (event.type) {
    case 'assistant/message': return assistantProjection(event, ordinal)
    case 'user/message': return userProjection(event)
    case 'turn/start': return {}
    case 'turn/end': {
      const kind = event.data.reason.kind
      return { reason: { kind: ['completed', 'error', 'max-tokens', 'blocked'].includes(kind) ? kind : 'error' } }
    }
    default: return String(event.type) === 'compaction/summary' ? compactionProjection(event.data, ordinal) : null
  }
}

/** Project before journaling or relay. Only the five governed durable event kinds may leave the child. */
export function projectReplyEvent(identity: ReplyIdentity, event: SessionEvent, ordinal: number | null): RuntimeObservation | null {
  checkIdentity(identity, event.seq)
  const data = projectData(event, ordinal)
  return data === null ? null : { ...identity, nativeSeq: event.seq, type: event.type, durable: true, data }
}

/** A position in the child's contained journal, never a second parent-side content store. */
export interface ReplyJournalPosition { readonly offset: number; readonly length: number }

/**
 * A new attempt creates one file exclusively. Each full JSONL entry and its original directory entry are durable
 * before the caller can emit that line. Recovery never constructs this writer or truncates an existing journal.
 */
export class ReplyJournal {
  private fd: number | null
  private offset = 0

  constructor(path: string) {
    if (!isAbsolute(path)) throw new Error('reply_journal_path_invalid')
    let fd: number | null = null
    try {
      fd = openSync(path, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      fsyncSync(fd)
      const directory = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
      try { fsyncSync(directory) } finally { closeSync(directory) }
    } catch {
      // Creation already failed. A cleanup error must not expose a filesystem path or turn this into success.
      if (fd !== null) { try { closeSync(fd) } catch { /* The failed creation remains unresolved. */ } }
      throw new Error('reply_journal_create_failed')
    }
    this.fd = fd
  }

  append(value: unknown, maxBytes: number): ReplyJournalPosition {
    if (this.fd === null || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2 * 1024 * 1024) throw new Error('reply_journal_unavailable')
    let bytes: Buffer
    try { bytes = Buffer.from(JSON.stringify(value) + '\n') } catch { throw new Error('reply_journal_invalid') }
    if (bytes.length >= maxBytes || bytes.toString() === 'undefined\n') throw new Error('reply_journal_invalid')
    const position = { offset: this.offset, length: bytes.length }
    try {
      let written = 0
      while (written < bytes.length) {
        const size = writeSync(this.fd, bytes, written, bytes.length - written, this.offset + written)
        if (size === 0) throw new Error('reply_journal_write_failed')
        written += size
      }
      fsyncSync(this.fd)
      this.offset += bytes.length
      return position
    } catch {
      // A partially written or unflushed entry stays unresolved. No later append may overwrite or emit it.
      try { this.close() } catch { /* The write remains unresolved even when closing its descriptor also fails. */ }
      throw new Error('reply_journal_write_failed')
    } finally { bytes.fill(0) }
  }

  read(position: ReplyJournalPosition): Buffer {
    if (this.fd === null || countOf(position.offset) === null ||
        !Number.isSafeInteger(position.length) || position.length < 1 || position.length >= 2 * 1024 * 1024 ||
        position.offset + position.length > this.offset) throw new Error('reply_journal_position_invalid')
    const bytes = Buffer.alloc(position.length)
    try {
      let received = 0
      while (received < bytes.length) {
        const size = readSync(this.fd, bytes, received, bytes.length - received, position.offset + received)
        if (size === 0) throw new Error('reply_journal_read_failed')
        received += size
      }
      return bytes
    } catch { bytes.fill(0); throw new Error('reply_journal_read_failed') }
  }

  close(): void {
    const fd = this.fd
    this.fd = null
    if (fd !== null) {
      try { closeSync(fd) } catch { throw new Error('reply_journal_close_failed') }
    }
  }
}

export interface ReplyControlScope {
  readonly attemptId: string
  readonly nonce: string
  readonly route: { readonly provider: string; readonly model: string; readonly reasoningEffort: string | null }
  readonly maxTokens: number
}
export type ReplyControl =
  { readonly t: 'start'; readonly attemptId: string; readonly sessionId: string; readonly epoch: number;
    readonly nonce: string; readonly route: ReplyControlScope['route']; readonly maxTokens: number; readonly prompt: string } |
  { readonly t: 'go' | 'stop' } |
  { readonly t: 'reserved' | 'settled' | 'settle_unknown'; readonly n: number } |
  { readonly t: 'refused'; readonly n: number; readonly code: string }

const controlInvalid = (): never => { throw new Error('reply_control_invalid') }
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))

function controlPrompt(value: unknown): value is string {
  return typeof value === 'string' && storable(value) && value.trim().length > 0 && [...value].length <= 200_000
}

function controlRouteMatches(value: unknown, route: ReplyControlScope['route']): boolean {
  return isRecord(value) && exactKeys(value, ['provider', 'model', 'reasoningEffort']) &&
    value.provider === route.provider && value.model === route.model && value.reasoningEffort === route.reasoningEffort
}

function startControl(value: Record<string, unknown>, scope: ReplyControlScope): ReplyControl {
  if (!exactKeys(value, ['t', 'attemptId', 'sessionId', 'epoch', 'nonce', 'route', 'maxTokens', 'prompt']) ||
      value.attemptId !== scope.attemptId || value.sessionId !== `sophia-${scope.attemptId}` || value.nonce !== scope.nonce ||
      !positiveBounded(value.epoch, Number.MAX_SAFE_INTEGER) || value.maxTokens !== scope.maxTokens ||
      !controlPrompt(value.prompt) || !controlRouteMatches(value.route, scope.route)) return controlInvalid()
  return { t: 'start', attemptId: scope.attemptId, sessionId: `sophia-${scope.attemptId}`, epoch: value.epoch,
    nonce: scope.nonce, route: scope.route, maxTokens: scope.maxTokens, prompt: value.prompt }
}

function parseControl(value: unknown, scope: ReplyControlScope): ReplyControl {
  if (!isRecord(value)) return controlInvalid()
  if (value.t === 'start') return startControl(value, scope)
  if ((value.t === 'go' || value.t === 'stop') && exactKeys(value, ['t'])) return { t: value.t }
  return parseAccountingAnswer(value)
}

function parseAccountingAnswer(value: Record<string, unknown>): ReplyControl {
  if (!positiveBounded(value.n, Number.MAX_SAFE_INTEGER)) return controlInvalid()
  if (exactKeys(value, ['t', 'n']) &&
      (value.t === 'reserved' || value.t === 'settled' || value.t === 'settle_unknown')) return { t: value.t, n: value.n }
  if (value.t === 'refused' && exactKeys(value, ['t', 'n', 'code']) && typeof value.code === 'string' &&
      /^[a-z][a-z0-9_]{0,199}$/.test(value.code)) return { t: 'refused', n: value.n, code: value.code }
  return controlInvalid()
}

function checkControlScope(scope: ReplyControlScope): void {
  if (typeof scope.attemptId !== 'string' || !IDENTIFIER.test(scope.attemptId) || scope.attemptId.length > 64 ||
      typeof scope.nonce !== 'string' || !/^[a-f0-9]+$/.test(scope.nonce) || scope.nonce.length > 200 ||
      !positiveBounded(scope.maxTokens, Number.MAX_SAFE_INTEGER) || !validControlRoute(scope.route)) return controlInvalid()
}

function validControlRoute(route: unknown): boolean {
  return isRecord(route) && nonemptyLabel(route.provider) && nonemptyLabel(route.model) &&
    (route.reasoningEffort === null || nonemptyLabel(route.reasoningEffort))
}

/**
 * Bounded child-side control decoder. The owner wires stop/EOF/error to cancellation and exit, and matches each
 * accounting answer to a pending ordinal. This component creates no agent and grants no model execution itself.
 */
export class ReplyControlReader {
  private readonly scope: ReplyControlScope
  private readonly receive: (control: ReplyControl) => void
  private readonly buffer = Buffer.alloc(2 * 1024 * 1024)
  private size = 0
  private phase: 'awaiting_start' | 'started' | 'ready' | 'running' | 'stopped' | 'failed' = 'awaiting_start'

  constructor(scope: ReplyControlScope, receive: (control: ReplyControl) => void) {
    checkControlScope(scope)
    this.scope = { ...scope, route: { ...scope.route } }
    this.receive = receive
  }

  get state(): string { return this.phase }

  /** Native setup must have finished before ready is emitted and go can be accepted. */
  ready(): void {
    if (this.phase !== 'started') return this.fail()
    this.phase = 'ready'
  }

  feed(bytes: Uint8Array): void {
    if (this.phase === 'stopped' || this.phase === 'failed') return
    try {
      for (const byte of bytes) {
        if (!this.byte(byte)) return
      }
    } catch { return this.fail() }
  }

  private byte(byte: number): boolean {
    const limit = this.phase === 'awaiting_start' ? this.buffer.length : 4096
    if (this.size + 1 >= limit) return this.fail()
    if (byte === 10) this.line()
    else this.buffer[this.size++] = byte
    return this.phase !== 'stopped'
  }

  end(): void {
    if (this.phase === 'stopped' || this.phase === 'failed') return
    if (this.size !== 0) return this.fail()
    this.phase = 'stopped'
    this.buffer.fill(0)
  }

  private line(): void {
    let value: unknown
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(this.buffer.subarray(0, this.size))) }
    finally { this.buffer.fill(0, 0, this.size); this.size = 0 }
    const control = parseControl(value, this.scope)
    if (control.t === 'start' && this.phase === 'awaiting_start') this.phase = 'started'
    else if (control.t === 'go' && this.phase === 'ready') this.phase = 'running'
    else if (control.t === 'stop' && this.phase !== 'awaiting_start') this.phase = 'stopped'
    else if (control.t === 'start' || control.t === 'go' || this.phase !== 'running') return this.fail()
    this.receive(control)
  }

  private fail(): never {
    this.phase = 'failed'
    this.buffer.fill(0)
    this.size = 0
    return controlInvalid()
  }
}

/**
 * The global stream hook must run this check before reserving or reaching its adapter. It checks the actual
 * assembled options, not a setup flag. Tool visibility/execution guards and native composition remain required.
 */
export function checkReplyCall(options: GenerateOptions, scope: ReplyControlScope, running: boolean): void {
  if (!running || options.signal?.aborted || options.sessionId !== `sophia-${scope.attemptId}` ||
      !callRouteMatches(options, scope.route) ||
      !positiveBounded(options.maxTokens, Number.MAX_SAFE_INTEGER) || options.maxTokens > scope.maxTokens ||
      !noReplyTools(options) ||
      (options.purpose !== undefined && options.purpose !== 'compaction')) throw new Error('reply_call_refused')
}

function callRouteMatches(options: GenerateOptions, route: ReplyControlScope['route']): boolean {
  return options.provider === route.provider && options.model === route.model &&
    (options.reasoningEffort ?? null) === route.reasoningEffort
}

function noReplyTools(options: GenerateOptions): boolean {
  return (options.tools === undefined || (Array.isArray(options.tools) && options.tools.length === 0)) &&
    (options.toolHistory === undefined || emptyReplyToolHistory(options.toolHistory))
}

function emptyReplyToolHistory(value: unknown): boolean {
  // In-history adapters can restore historical declarations even when the current tools array is empty.
  return isRecord(value) && exactKeys(value, ['tools', 'updates']) &&
    Array.isArray(value.tools) && value.tools.length === 0 && Array.isArray(value.updates) && value.updates.length === 0
}

type AccountingAnswer = Extract<ReplyControl, { readonly n: number }>
type AccountingLine = ReplyReserveLine | ReplySettleLine
export interface ReplyAccountingIO {
  /** Synchronous durability before emitting a request or resolving an answer. The implementation is contained. */
  journal(line: AccountingLine | AccountingAnswer): void
  send(line: AccountingLine): Promise<void>
}
interface AccountingWait {
  readonly kind: 'reserve' | 'settle'
  readonly timer: ReturnType<typeof setTimeout>
  readonly resolve: (answer: AccountingAnswer) => void
  readonly reject: (error: Error) => void
}

/**
 * Child-side ordinal correlation only. No retries, provider invocation, service credentials or allowance reset.
 * Fencing ends local waits; the parent's shared deadline and durable ledger remain authoritative for settlement.
 */
export class ReplyAccounting {
  private readonly io: ReplyAccountingIO
  private readonly waitMs: number
  private phase: 'gated' | 'running' | 'fenced' = 'gated'
  private nextOrdinal = 1
  private active: number | null = null
  private readonly reserved = new Set<number>()
  private readonly settlements = new Set<number>()
  private readonly waits = new Map<number, AccountingWait>()

  constructor(io: ReplyAccountingIO, waitMs: number) {
    if (!Number.isSafeInteger(waitMs) || waitMs < 1 || waitMs > 120_000) throw new Error('reply_accounting_bound_invalid')
    this.io = io
    this.waitMs = waitMs
  }

  get state(): string { return this.phase }

  go(): void {
    if (this.phase !== 'gated') throw new Error('reply_accounting_state_invalid')
    this.phase = 'running'
  }

  async reserve(tokens: number, priceMicros: number): Promise<1 | 2> {
    if (this.phase !== 'running' || this.active !== null || countOf(tokens) === null || countOf(priceMicros) === null ||
        (this.nextOrdinal !== 1 && this.nextOrdinal !== 2)) throw new Error('reply_call_refused')
    const n = this.nextOrdinal
    this.nextOrdinal++
    this.active = n
    const answer = await this.request({ t: 'reserve', n, tokens, priceMicros })
    if (answer.t !== 'reserved') { this.fence(); throw new Error('reply_call_refused') }
    this.reserved.add(n)
    if (this.phase !== 'running') throw new Error('reply_call_refused')
    return n
  }

  async settle(n: number, usage: { readonly inputTokens: number; readonly outputTokens: number;
    readonly cacheReadTokens?: number; readonly cacheWriteTokens?: number } | null, priceMicros: number | null): Promise<'settled' | 'settle_unknown'> {
    if (!this.reserved.has(n) || this.active !== n || this.settlements.has(n)) throw new Error('reply_settlement_invalid')
    const line = this.settleLine(n, usage, priceMicros)
    this.settlements.add(n)
    if (this.phase === 'fenced') {
      // A stopped caller may still persist and emit its final accounting. Emission is never acknowledgement.
      try { this.io.journal(line); await this.sendBounded(line) } catch { throw new Error('reply_accounting_unconfirmed') }
      return 'settle_unknown'
    }
    const answer = await this.request(line)
    this.active = null
    if (answer.t !== 'settled' || line.outcome === 'uncertain') { this.fence(); return 'settle_unknown' }
    return 'settled'
  }

  answer(answer: AccountingAnswer): void {
    const pending = this.waits.get(answer.n)
    const matching = pending?.kind === 'reserve' ? answer.t === 'reserved' || answer.t === 'refused' :
      pending?.kind === 'settle' && (answer.t === 'settled' || answer.t === 'settle_unknown')
    if (!pending || !matching) { this.fence(); throw new Error('reply_accounting_correlation_invalid') }
    try { this.io.journal(answer) } catch { this.fence(); throw new Error('reply_accounting_unconfirmed') }
    clearTimeout(pending.timer)
    this.waits.delete(answer.n)
    pending.resolve(answer)
  }

  fence(): void {
    this.phase = 'fenced'
    for (const pending of this.waits.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('reply_accounting_unconfirmed'))
    }
    this.waits.clear()
  }

  private request(line: AccountingLine): Promise<AccountingAnswer> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fence(), this.waitMs)
      const pending = { kind: line.t, timer, resolve, reject }
      this.waits.set(line.n, pending)
      try {
        this.io.journal(line)
        void this.io.send(line).catch(() => { if (this.waits.get(line.n) === pending) this.fence() })
      } catch { this.fence() }
    })
  }

  private sendBounded(line: AccountingLine): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('reply_accounting_unconfirmed')), this.waitMs)
      try {
        void this.io.send(line).then(() => { clearTimeout(timer); resolve() }, () => {
          clearTimeout(timer); reject(new Error('reply_accounting_unconfirmed'))
        })
      } catch { clearTimeout(timer); reject(new Error('reply_accounting_unconfirmed')) }
    })
  }

  private settleLine(n: number, usage: { readonly inputTokens: number; readonly outputTokens: number;
    readonly cacheReadTokens?: number; readonly cacheWriteTokens?: number } | null, priceMicros: number | null): ReplySettleLine {
    if (usage === null || priceMicros === null) return { t: 'settle', n, outcome: 'uncertain', used: null, usage: null }
    if (!isRecord(usage) || !['inputTokens', 'outputTokens'].every(key => Object.hasOwn(usage, key)) ||
        !Object.keys(usage).every(key => ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'].includes(key)) ||
        !Object.values(usage).every(value => countOf(value) !== null) || countOf(priceMicros) === null) throw new Error('reply_settlement_invalid')
    const tokens = Object.values(usage).reduce((total: number, value: number) => total + value, 0)
    if (countOf(tokens) === null) throw new Error('reply_settlement_invalid')
    return { t: 'settle', n, outcome: 'settled', used: { calls: 1, tokens, priceMicros }, usage: { ...usage } }
  }
}

interface ReplyEmission {
  readonly position: ReplyJournalPosition
  readonly promise: Promise<void>
  readonly resolve: () => void
  readonly reject: (error: Error) => void
}

/**
 * The synchronous native event observer journals first, then queues only positions here. One socket write is
 * active, and every emission waits for its callback and required drain. Overflow or I/O failure leaves the
 * contained journal for recovery; it never reports a successful delivery or deletion.
 */
export class ReplyEmitter {
  private readonly stream: Duplex
  private readonly journal: ReplyJournal
  private readonly waitMs: number
  private readonly queue: ReplyEmission[] = []
  private bytes = 0
  private writing = false
  private failed = false
  private abortWrite: (() => void) | null = null

  constructor(stream: Duplex, journal: ReplyJournal, waitMs: number) {
    if (!Number.isSafeInteger(waitMs) || waitMs < 1 || waitMs > 120_000) throw new Error('reply_emission_bound_invalid')
    this.stream = stream
    this.journal = journal
    this.waitMs = waitMs
    stream.on('error', () => this.fail())
    stream.on('close', () => this.fail())
  }

  send(position: ReplyJournalPosition): Promise<void> {
    if (this.failed) return Promise.reject(new Error('reply_emission_failed'))
    if (countOf(position.offset) === null || !Number.isSafeInteger(position.length) || position.length < 1 ||
        position.length >= 1024 * 1024 || this.queue.length >= 64 || this.bytes + position.length > 4 * 1024 * 1024) {
      this.fail()
      return Promise.reject(new Error('reply_emission_failed'))
    }
    const { promise, resolve, reject } = Promise.withResolvers<void>()
    this.queue.push({ position: { ...position }, promise, resolve, reject })
    this.bytes += position.length
    this.pump()
    return promise
  }

  isOpen(): boolean { return !this.failed }

  idle(): Promise<void> {
    return this.failed ? Promise.reject(new Error('reply_emission_failed')) : this.queue.at(-1)?.promise ?? Promise.resolve()
  }

  dispose(): void { this.fail() }

  private pump(): void {
    if (this.failed || this.writing) return
    const entry = this.queue[0]
    if (!entry) return
    let bytes: Buffer
    try { bytes = this.journal.read(entry.position) } catch { this.fail(); return }
    this.writing = true
    void this.write(bytes).then(() => {
      if (this.failed) return
      this.queue.shift(); this.bytes -= entry.position.length
      entry.resolve()
    }).catch(() => this.fail()).finally(() => { this.writing = false; this.pump() })
  }

  private write(bytes: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      let callbackDone = false
      let needDrain: boolean | null = null
      let drained = false
      let finished = false
      const finish = (error = false) => {
        if (finished || (!error && (!callbackDone || needDrain === null || (needDrain && !drained)))) return
        finished = true
        clearTimeout(timer); this.stream.off('drain', onDrain)
        if (this.abortWrite === abort) this.abortWrite = null
        if (error) reject(new Error('reply_emission_failed')); else resolve()
      }
      const onDrain = () => { drained = true; finish() }
      const abort = () => finish(true)
      const timer = setTimeout(() => finish(true), this.waitMs)
      this.abortWrite = abort
      this.stream.once('drain', onDrain)
      try {
        needDrain = !this.stream.write(bytes, error => {
          // The native write no longer references this buffer only after its callback, including after destroy.
          bytes.fill(0); callbackDone = true; finish(Boolean(error))
        })
        finish()
      } catch { bytes.fill(0); finish(true) }
    })
  }

  private fail(): void {
    if (this.failed) return
    this.failed = true
    this.abortWrite?.()
    for (const entry of this.queue) entry.reject(new Error('reply_emission_failed'))
    this.queue.length = 0; this.bytes = 0
    this.stream.destroy()
  }
}

/**
 * Create the one fresh agent through the pinned public factory, without a seed, role, prompt or step. The
 * caller already validated start, owns creation cancellation, and later drives only after go. Launcher
 * containment and a global stream guard are still required; this scoped setup is not isolation proof.
 */
export async function createReplyAgent(ctx: Context, start: Extract<ReplyControl, { readonly t: 'start' }>,
  workspace: string, signal: AbortSignal): Promise<AgentHandle> {
  if (!isAbsolute(workspace) || resolve(workspace) !== workspace || basename(workspace) !== 'work' ||
      basename(dirname(workspace)) !== start.attemptId || signal.aborted) throw new Error('reply_agent_setup_failed')
  let handle: AgentHandle
  try {
    handle = await ctx.agents.create({
      sessionId: brandString<SessionId>(start.sessionId),
      meta: { cwd: workspace },
      signal,
      agentOptions: {
        provider: start.route.provider,
        model: start.route.model,
        ...(start.route.reasoningEffort === null ? {} : { reasoningEffort: brandString<ReasoningEffortId>(start.route.reasoningEffort) }),
        maxTokens: start.maxTokens,
      },
      setup: agentCtx => {
        agentCtx.tools.restrict({ allow: [] })
        agentCtx.tools.guard(() => 'reply_read_only')
        const verify = () => {
          if (signal.aborted || agentCtx.tools.schemas().length !== 0) throw new Error('reply_agent_setup_failed')
        }
        verify()
        // The public factory runs commit after every setup await and immediately before publication.
        return { commit: verify }
      },
    })
  } catch { throw new Error('reply_agent_setup_failed') }
  // The factory's creation-only signal is detached before return. Cancellation can win that final await.
  if (signal.aborted) {
    try { await handle.dispose() } catch { throw new Error('reply_agent_cleanup_failed') }
    throw new Error('reply_agent_setup_failed')
  }
  return handle
}


export interface ReplyEventHooks {
  /** Go was committed; stays true while cancelled execution drains late usage before observer removal. */
  running(): boolean
  ordinal(): number | null
  /** Fence/cancel the owned execution. This callback must not throw or claim host cleanup. */
  failed(code: 'reply_observation_failed'): void
  /** The turn/end line drained; process exit and provider settlement remain separate. */
  ended(): void
}

/** Install before creating the agent. Native event dispatch is synchronous and never awaits listener promises. */
export function observeReplyEvents(ctx: Context, identity: ReplyIdentity, journal: ReplyJournal,
  emitter: ReplyEmitter, hooks: ReplyEventHooks): () => void {
  const own = { ...identity }
  checkIdentity(own, 0)
  let phase: 'observing' | 'ending' | 'failed' | 'disposed' = 'observing'
  let lastSequence = -1
  const fail = () => {
    if (phase === 'failed' || phase === 'disposed') return
    phase = 'failed'
    try { hooks.failed('reply_observation_failed') } catch {
      // A failing cancellation callback is not cleanup proof; do not leak its error through native logging.
    }
  }
  const listener = (session: Session, event: SessionEvent): void => {
    if (session.id !== own.nativeSessionId || phase === 'failed' || phase === 'disposed') return
    try {
      const observation = projectReplyEvent(own, event, hooks.ordinal())
      if (observation === null) return
      if (phase !== 'observing' || !hooks.running() || !emitter.isOpen() || event.seq <= lastSequence) {
        fail(); return
      }
      lastSequence = event.seq
      const ending = event.type === 'turn/end'
      if (ending) phase = 'ending'
      const position = journal.append({ t: 'obs', observation }, 1024 * 1024)
      const emitted = emitter.send(position)
      void emitted.then(() => {
        if (ending && phase === 'ending') hooks.ended()
      }).catch(fail)
      // Queue overflow closes the emitter synchronously. Fence now, before a native synchronous burst continues.
      if (!emitter.isOpen()) fail()
    } catch { fail() }
  }
  const off = ctx.on('session/event', listener)
  return () => { phase = 'disposed'; off() }
}


type ReplyCallUsage = { readonly inputTokens: number; readonly outputTokens: number;
  readonly cacheReadTokens?: number; readonly cacheWriteTokens?: number }
export interface ReplyCallMeasurement {
  /** The qualified selected route supplies this measurement; never infer subscription quota from prompt bytes. */
  request(options: GenerateOptions): { readonly tokens: number; readonly priceMicros: number }
  /** Null means unknown; zero is valid only when established by the selected route's accounting policy. */
  usage(usage: ReplyCallUsage): number | null
}

function callUsage(value: TokenUsage): ReplyCallUsage | null {
  if (!isRecord(value)) return null
  const inputTokens = countOf(value.inputTokens), outputTokens = countOf(value.outputTokens)
  if (inputTokens === null || outputTokens === null) return null
  const cacheReadTokens = value.cacheReadTokens === undefined ? undefined : countOf(value.cacheReadTokens)
  const cacheWriteTokens = value.cacheWriteTokens === undefined ? undefined : countOf(value.cacheWriteTokens)
  if (cacheReadTokens === null || cacheWriteTokens === null) return null
  return { inputTokens, outputTokens, ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }) }
}

interface CollectedReplyUsage { usage: ReplyCallUsage | null; ambiguous: boolean }

function collectReplyUsage(collected: CollectedReplyUsage, chunk: StreamChunk): void {
  if (chunk.type !== 'usage') return
  const incoming = callUsage(chunk.usage)
  if (incoming === null || (collected.usage !== null && JSON.stringify(collected.usage) !== JSON.stringify(incoming))) {
    collected.ambiguous = true
  }
  collected.usage = incoming
}

function measuredReplyPrice(collected: CollectedReplyUsage, measurement: ReplyCallMeasurement): number | null {
  if (collected.ambiguous || collected.usage === null) return null
  let price: number | null = null
  try { price = measurement.usage(collected.usage) } catch { /* Unknown accounting stays uncertain. */ }
  return countOf(price) === null ? null : price
}

/**
 * The actual llm/stream wrapper. It has no quota/pricing defaults and cannot enable a route. Keep the last admitted
 * ordinal until the next reservation: native assistant/compaction events are appended after stream settlement.
 * The lifecycle supplies cancellation, the qualified measurement policy and the parent's shared deadline.
 */
export class ReplyCallMeter {
  private readonly scope: ReplyControlScope
  private readonly accounts: ReplyAccounting
  private readonly measurement: ReplyCallMeasurement
  private lastOrdinal: 1 | 2 | null = null

  constructor(scope: ReplyControlScope, accounts: ReplyAccounting, measurement: ReplyCallMeasurement) {
    this.scope = { ...scope, route: { ...scope.route } }
    this.accounts = accounts
    this.measurement = measurement
  }

  get ordinal(): 1 | 2 | null { return this.lastOrdinal }

  install(ctx: Context): () => boolean {
    return ctx.on('llm/stream', (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) =>
      this.stream(options, next), { global: true, prepend: true })
  }

  async *stream(options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    const n = await this.reserveCall(options)
    this.lastOrdinal = n
    const collected: CollectedReplyUsage = { usage: null, ambiguous: false }
    try {
      // A Stop or caller cancellation can arrive while waiting for the reservation's durable answer.
      checkReplyCall(options, this.scope, this.accounts.state === 'running')
      for await (const chunk of next()) {
        collectReplyUsage(collected, chunk)
        yield chunk
      }
    } catch { throw new Error('reply_call_failed') }
    finally { await this.settleCall(n, collected) }
  }

  private async reserveCall(options: GenerateOptions): Promise<1 | 2> {
    try {
      checkReplyCall(options, this.scope, this.accounts.state === 'running')
      const amount = this.measurement.request(options)
      return await this.accounts.reserve(amount.tokens, amount.priceMicros)
    } catch { throw new Error('reply_call_refused') }
  }

  private async settleCall(n: 1 | 2, collected: CollectedReplyUsage): Promise<void> {
    const price = measuredReplyPrice(collected, this.measurement)
    try {
      const result = await this.accounts.settle(n, collected.ambiguous ? null : collected.usage, price)
      if (result !== 'settled') throw new Error('reply_accounting_unconfirmed')
    } catch {
      this.accounts.fence()
      throw new Error('reply_accounting_unconfirmed')
    }
  }
}


export interface ReplyChildRuntimeConfig {
  readonly identity: ReplyIdentity
  readonly scope: ReplyControlScope
  readonly workspace: string
  readonly stream: Duplex
  readonly journal: ReplyJournal
  readonly measurement: ReplyCallMeasurement
  readonly waitMs: number
}
export type ReplyChildResult = 'completed' | 'stopped' | 'failed' | 'unresolved'

/**
 * One child execution on an already-owned socket and journal. No fd opening, process signaling, credentials,
 * template loading or host deletion lives here. The launcher/parent supplies the overall deadline and containment.
 * An unresolved disposer keeps its observer/journal available for late usage until that owner settles the process.
 */
export class ReplyChildRuntime {
  readonly done: Promise<ReplyChildResult>
  private readonly ctx: Context
  private readonly config: ReplyChildRuntimeConfig
  private readonly reader: ReplyControlReader
  private readonly emitter: ReplyEmitter
  private readonly accounts: ReplyAccounting
  private readonly meter: ReplyCallMeter
  private readonly controller = new AbortController()
  private readonly resolveDone: (result: ReplyChildResult) => void
  private readonly offs: (() => void)[] = []
  private creation: Promise<void> | null = null
  private handle: AgentHandle | null = null
  private prompt: string | null = null
  private phase: 'waiting' | 'creating' | 'ready' | 'running' | 'settling' | 'closed' = 'waiting'
  private outcome: ReplyChildResult = 'completed'
  private went = false

  constructor(ctx: Context, config: ReplyChildRuntimeConfig) {
    checkIdentity(config.identity, 0)
    if (config.identity.attemptId !== config.scope.attemptId) throw new Error('reply_identity_invalid')
    this.ctx = ctx
    this.config = { ...config, identity: { ...config.identity }, scope: { ...config.scope, route: { ...config.scope.route } } }
    this.reader = new ReplyControlReader(this.config.scope, frame => this.receive(frame))
    this.emitter = new ReplyEmitter(config.stream, config.journal, config.waitMs)
    const positions = new WeakMap<object, ReplyJournalPosition>()
    this.accounts = new ReplyAccounting({
      journal: line => {
        const position = config.journal.append(line, 4096)
        if (line.t === 'reserve' || line.t === 'settle') positions.set(line, position)
      },
      send: line => {
        const position = positions.get(line)
        if (!position) return Promise.reject(new Error('reply_accounting_unconfirmed'))
        positions.delete(line)
        return this.emitter.send(position)
      },
    }, config.waitMs)
    this.meter = new ReplyCallMeter(this.config.scope, this.accounts, config.measurement)
    const completed = Promise.withResolvers<ReplyChildResult>()
    this.done = completed.promise; this.resolveDone = completed.resolve
    try {
      this.offs.push(this.meter.install(ctx))
      this.offs.push(observeReplyEvents(ctx, this.config.identity, config.journal, this.emitter, {
        running: () => this.went, ordinal: () => this.meter.ordinal,
        failed: () => this.finish('failed'),
        ended: () => { if (this.phase === 'running') this.finish(this.accounts.state === 'running' ? 'completed' : 'failed') },
      }))
      config.stream.on('data', this.data)
      config.stream.on('end', this.end)
      config.stream.on('error', this.error)
      config.stream.on('close', this.closed)
    } catch {
      for (const off of this.offs) off()
      this.accounts.fence(); this.emitter.dispose()
      throw new Error('reply_child_setup_failed')
    }
  }

  stop(): void { this.finish('stopped') }

  private readonly data = (bytes: Buffer): void => {
    if (this.phase === 'closed' || this.phase === 'settling') return
    try { this.reader.feed(bytes) } catch { this.finish('failed') }
  }
  private readonly end = (): void => {
    try { this.reader.end(); this.finish('stopped') } catch { this.finish('failed') }
  }
  private readonly error = (): void => { this.finish('failed') }
  private readonly closed = (): void => { if (this.phase !== 'closed') this.finish('failed') }

  private receive(frame: ReplyControl): void {
    if (frame.t === 'start') {
      this.phase = 'creating'
      this.config.journal.append(frame, 2 * 1024 * 1024)
      this.prompt = frame.prompt
      this.creation = this.create(frame)
      void this.creation.catch(() => { if (this.phase !== 'settling') this.finish('failed') })
    } else if (frame.t === 'go') this.go()
    else if (frame.t === 'stop') this.finish('stopped')
    else if ('n' in frame) this.accounts.answer(frame)
    else throw new Error('reply_child_state_invalid')
  }

  private async create(start: Extract<ReplyControl, { readonly t: 'start' }>): Promise<void> {
    this.handle = await createReplyAgent(this.ctx, start, this.config.workspace, this.controller.signal)
    if (this.phase !== 'creating') return
    this.reader.ready()
    this.phase = 'ready'
    const position = this.config.journal.append({ t: 'status', s: 'ready' }, 4096)
    await this.emitter.send(position)
  }

  private go(): void {
    if (this.phase !== 'ready' || this.handle === null || this.prompt === null) throw new Error('reply_child_state_invalid')
    this.accounts.go()
    this.went = true; this.phase = 'running'
    const prompt = this.prompt; this.prompt = null
    this.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }))
  }

  private finish(result: Exclude<ReplyChildResult, 'unresolved'>): void {
    if (this.phase === 'closed') return
    if (result === 'failed' || (result === 'stopped' && this.outcome === 'completed')) this.outcome = result
    if (this.phase === 'settling') return
    this.phase = 'settling'; this.prompt = null
    this.controller.abort(); this.accounts.fence()
    try { this.handle?.agent.cancel({ kind: 'hook', reason: 'sophia-reply-stop' }) } catch { this.outcome = 'unresolved' }
    void this.finalize()
  }

  private async finalize(): Promise<void> {
    try { await this.creation } catch (error) {
      if (error instanceof Error && error.message === 'reply_agent_cleanup_failed') this.outcome = 'unresolved'
    }
    let settled = this.outcome !== 'unresolved'
    if (this.handle !== null) {
      try { await this.handle.dispose(); this.handle = null } catch { settled = false }
    }
    if (!settled) {
      // Neither suppress late native usage nor attest cleanup when the owned Agent could still be alive.
      this.phase = 'closed'; this.resolveDone('unresolved'); return
    }
    // Agent disposal is the producer barrier; only now can the emitter's current tail mean the whole drain.
    try { await this.emitter.idle() } catch { this.outcome = 'unresolved' }
    for (const off of this.offs) {
      try { off() } catch { this.outcome = 'unresolved' }
    }
    this.config.stream.off('data', this.data); this.config.stream.off('end', this.end)
    this.config.stream.off('error', this.error); this.config.stream.off('close', this.closed)
    try { this.config.journal.close() } catch { this.outcome = 'unresolved' }
    this.phase = 'closed'
    this.emitter.dispose()
    this.resolveDone(this.outcome)
  }
}

/** The reply profile is separate from the goal bundle patch. Importing this entry starts nothing. */
export const name = 'sophia-reply-child'
export const inject = ['agents', 'sessions', 'tools', 'appReady', 'appExit']

interface ReplyBootstrapSettings {
  readonly identity: ReplyIdentity
  readonly scope: ReplyControlScope
  readonly workspace: string
  readonly journalPath: string
  readonly measurement: ReplyCallMeasurement
  readonly waitMs: number
}
interface ReplyBootstrapResources { readonly stream: Duplex; readonly journal: ReplyJournal }
interface ReplyBootstrapHost {
  ready(callback: () => void): () => void
  exit(code: number): void
}

const positiveBounded = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= limit
const nonemptyLabel = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && labelOf(value) === value

function bootstrapMeasurement(value: unknown): ReplyCallMeasurement {
  if (!isRecord(value) || !exactKeys(value, ['request', 'usage']) ||
      typeof value.request !== 'function' || typeof value.usage !== 'function') throw new Error('reply_bootstrap_invalid')
  const request = value.request, usage = value.usage
  return Object.freeze({
    request(options: GenerateOptions) {
      const result: unknown = request(options)
      if (!isRecord(result) || !exactKeys(result, ['tokens', 'priceMicros']) ||
          typeof result.tokens !== 'number' || typeof result.priceMicros !== 'number') throw new Error('reply_measurement_invalid')
      return { tokens: result.tokens, priceMicros: result.priceMicros }
    },
    usage(value: ReplyCallUsage) {
      const result: unknown = usage(value)
      return typeof result === 'number' && countOf(result) !== null ? result : null
    },
  })
}

function bootstrapRoute(value: unknown): ReplyControlScope['route'] {
  if (!isRecord(value) || !exactKeys(value, ['provider', 'model', 'reasoningEffort']) ||
      !nonemptyLabel(value.provider) || !nonemptyLabel(value.model)) throw new Error('reply_bootstrap_invalid')
  const effort = value.reasoningEffort
  if (effort !== null && !nonemptyLabel(effort)) throw new Error('reply_bootstrap_invalid')
  return Object.freeze({ provider: value.provider, model: value.model, reasoningEffort: effort })
}

function bootstrapPaths(env: Readonly<Record<string, string | undefined>>): { workspace: string; journalPath: string; attemptId: string } {
  const workspace = env.SOPHIA_WORKSPACE, tmp = env.TMPDIR
  if (!workspace || !isAbsolute(workspace) || resolve(workspace) !== workspace || basename(workspace) !== 'work' ||
      !tmp || !isAbsolute(tmp) || resolve(tmp) !== tmp) throw new Error('reply_bootstrap_invalid')
  const root = dirname(workspace), home = join(root, 'home'), dsh = join(root, 'dsh-home')
  if (env.HOME !== home || env.DSH_HOME !== dsh ||
      ![home, dsh, workspace].some(path => tmp === path || tmp.startsWith(path + '/'))) throw new Error('reply_bootstrap_invalid')
  // These are launcher contract checks, not a replacement for its kernel/path containment qualification.
  return { workspace, journalPath: join(dsh, 'sophia-reply.jsonl'), attemptId: basename(root) }
}

function bootstrapSettings(config: unknown, env: Readonly<Record<string, string | undefined>>): ReplyBootstrapSettings {
  if (!isRecord(config) || !exactKeys(config, ['route', 'maxTokens', 'waitMs', 'measurement']) ||
      !positiveBounded(config.maxTokens, Number.MAX_SAFE_INTEGER) || !positiveBounded(config.waitMs, 120_000) ||
      env.SOPHIA_REPLY_FD !== '3' || env.DSH_TELEMETRY_DISABLED !== '1') throw new Error('reply_bootstrap_invalid')
  const paths = bootstrapPaths(env), nonce = env.SOPHIA_REPLY_NONCE, unit = env.SOPHIA_RUNTIME_UNIT
  if (!nonce || !/^[a-f0-9]{1,200}$/.test(nonce) || !unit) throw new Error('reply_bootstrap_invalid')
  const identity = Object.freeze({ runtimeUnitId: unit, attemptId: paths.attemptId, nativeSessionId: `sophia-${paths.attemptId}` })
  try { checkIdentity(identity, 0) } catch { throw new Error('reply_bootstrap_invalid') }
  return Object.freeze({ identity, workspace: paths.workspace, journalPath: paths.journalPath,
    scope: Object.freeze({ attemptId: paths.attemptId, nonce, route: bootstrapRoute(config.route), maxTokens: config.maxTokens }),
    measurement: bootstrapMeasurement(config.measurement), waitMs: config.waitMs })
}

function bootstrapHost(ctx: Context): ReplyBootstrapHost {
  const ready: unknown = ctx.get('appReady'), exit: unknown = ctx.get('appExit')
  if (!isRecord(ready) || typeof ready.onReady !== 'function' || typeof exit !== 'function') throw new Error('reply_bootstrap_invalid')
  const onReady = ready.onReady
  return { ready(callback) {
    const cancel: unknown = onReady.call(ready, callback)
    if (typeof cancel !== 'function') throw new Error('reply_bootstrap_invalid')
    return () => { cancel() }
  }, exit: code => { exit(code) } }
}

function openReplyResources(settings: ReplyBootstrapSettings): ReplyBootstrapResources {
  // The launcher establishes AF_UNIX/SOCK_STREAM and passes exactly fd3; do not discover or open another fd.
  if (!fstatSync(3).isSocket()) throw new Error('reply_socket_invalid')
  const stream = new Socket({ fd: 3, readable: true, writable: true })
  try { return { stream, journal: new ReplyJournal(settings.journalPath) } }
  catch { stream.destroy(); throw new Error('reply_bootstrap_failed') }
}

function startReplyRuntime(ctx: Context, settings: ReplyBootstrapSettings,
  open: (settings: ReplyBootstrapSettings) => ReplyBootstrapResources): ReplyChildRuntime {
  const resources = open(settings)
  try { return new ReplyChildRuntime(ctx, { ...settings, ...resources }) }
  catch {
    resources.stream.destroy()
    try { resources.journal.close() } catch { /* Setup already failed; the launcher retains the home for reconciliation. */ }
    throw new Error('reply_bootstrap_failed')
  }
}

/**
 * Closed trusted composition seam. Measurement callbacks must be supplied by the separately qualified route;
 * config expressions may supply them, but ordinary JSON, an absent policy or a setup flag cannot enable calls.
 * Tests substitute only owned resources/native services. No environment mutation, credential read or deletion.
 */
export function bindReplyPlugin(ctx: Context, config: unknown, env: Readonly<Record<string, string | undefined>>,
  open: (settings: ReplyBootstrapSettings) => ReplyBootstrapResources = openReplyResources): void {
  const settings = bootstrapSettings(config, env), host = bootstrapHost(ctx)
  ctx.effect(() => {
    let disposed = false, started = false, runtime: ReplyChildRuntime | null = null
    const requestExit = (code: number) => { queueMicrotask(() => { if (!disposed) host.exit(code) }) }
    const cancel = host.ready(() => {
      if (disposed || started) return
      started = true
      try {
        runtime = startReplyRuntime(ctx, settings, open)
        void runtime.done.then(result => {
          // appExit disposes the real Cordis tree, removing event hooks even when this runtime retained them.
          // An unconfirmed producer therefore stays under the parent's existing absolute settlement bound.
          if (result !== 'unresolved') requestExit(result === 'failed' ? 1 : 0)
        })
      } catch { requestExit(1) }
    })
    return async () => {
      disposed = true; cancel()
      runtime?.stop()
      if (runtime !== null) await runtime.done
      // An unresolved Agent keeps its hooks/journal until the bounded host shutdown settles the actual process.
      // Neither this disposer nor appExit constitutes a retirement or erasure receipt.
    }
  })
}

export function apply(ctx: Context, config: unknown): void { bindReplyPlugin(ctx, config, process.env) }
export default { name, inject, apply }
