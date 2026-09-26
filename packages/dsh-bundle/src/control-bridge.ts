/**
 * The Sophia control bridge: application commands <-> the public dsh Agent API.
 *
 * It is a transport adapter, not a second loop. The native loop, inbox,
 * history, compaction and persistence stay dsh's; the bridge only
 *
 * - creates/resumes Agents through `ctx.agents` and owns their handles,
 * - journals each command before acting and acknowledges delivery only after
 *   dsh flushed its effect: a settled command's redelivery is answered, an
 *   unsettled one (a restart cut it short) is re-executed without repeating
 *   what dsh already holds,
 * - enforces Hold/Stop with work fences at `agent/pre-step` and a monotonic
 *   tool guard, set BEFORE native cancellation (native cancel is not a latch),
 * - forwards durable session events, keyed by (runtime unit, session, seq),
 *   retaining them until the service acknowledges them (and replaying the
 *   unacknowledged ones after a restart).
 *
 * Cross-store exactly-once is not claimed: Sophia's database and the dsh log
 * are two stores. The log-first ordering bounds the window; the fixture and
 * S1-02's outbox redeliver, and the log answers duplicates.
 * [02_DSH_BOOTSTRAP §3–§5; DSH-08, DSH-10, DSH-11]
 * @module @sophia/dsh-bundle/control-bridge
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentOptions, AgentSetup } from '@deepseek-ai/dsh-agent'
// Type-only: brings the `ctx.agentDefaultModel` Context augmentation into scope.
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createUserMessage, expandAssistantStream } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, UserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
// Type-only: brings the `ctx.tools` Context augmentation into scope.
import type { ToolGuard } from '@deepseek-ai/dsh-tools'
import { commandText, parseCommand, ProtocolError } from './protocol.js'
import { wire } from './runtime-wire.generated.js'
import type { RuntimeCommand, RuntimeReceipt, ReceiptStage } from './protocol.js'
import { roleOf } from './role-registry.js'
import type { RolePreset } from './role-registry.js'
import { foldLog, Journal, strongestFence } from './session-events.js'
import type { CommandEntry, DeliveryTarget, FenceState, StashedMessage } from './session-events.js'
import { ServiceTransport } from './transport.js'
import type { HelloReply, Observation, ServiceBinding, UnrecoveredBinding } from './transport.js'
import type { RuntimeCommandBatch } from './runtime-wire-types.generated.js'

/** Row config plus the resolved environment the bridge runs with. */
export interface BridgeSettings {
  readonly protocolVersion: 1
  readonly bundle: string
  readonly dshVersion: string
  readonly runtimeUnitId: string
  /** Absent: no Sophia service is bound, and the bridge stays `not_ready`. */
  readonly service: { readonly baseUrl: string; readonly token: string } | null
  /** Working directory new Agents start in (the isolated project workspace). */
  readonly workspace: string
  /** Directory of the bridge's fsynced journal (inside the project's Harness home). */
  readonly journalDir: string
  readonly pollWaitMs: number
  /** Upper bound for cancellation to settle before a Hold/Stop receipt reports `outcome_unknown`. */
  readonly settleTimeoutMs: number
  readonly log: (line: string) => void
}

/** Live and durable state the bridge keeps for one attempt. */
interface AttemptState {
  readonly attemptId: string
  readonly sessionId: SessionId
  handle: AgentHandle | null
  /** Role preset the attempt runs under; fixed at create. */
  role: RolePreset | null
  epoch: number
  fence: FenceState
  /** Command id -> the receipt already sent for it. */
  readonly receipts: Map<string, RuntimeReceipt>
  /** Message id -> command id, for delivered input not yet seen entering a step. */
  readonly pendingIncorporation: Map<string, string>
  /** Message id -> where it was routed. */
  readonly targets: Map<string, DeliveryTarget>
  stash: StashedMessage[]
  /** Journaled commands whose native effect a restart may have cut short; redelivery re-executes them. */
  readonly unsettled: Map<string, CommandEntry>
  /** Why reconciliation could not restore this attempt; null once it is live. */
  unrecovered: string | null
  /** The service binds this attempt to a different native session: nothing may resume it here. */
  identityMismatch: boolean
}

/**
 * In-order delivery to the service that keeps every item until the service
 * acknowledges it, retrying with bounded backoff. The service deduplicates
 * (receipts by command and stage, observations by native seq).
 */
class RetainedQueue<T> {
  private items: T[] = []
  private running: Promise<void> | null = null
  private backoffMs = 0

  constructor(
    private readonly label: string,
    private readonly deliver: (batch: T[]) => Promise<void>,
    private readonly options: { readonly delayMs: number; readonly signal: AbortSignal; readonly log: (line: string) => void; readonly onAck?: (batch: T[]) => void },
  ) {}

  push(...items: T[]): void {
    if (items.length === 0) return
    this.items.push(...items)
    this.schedule(this.options.delayMs)
  }

  private schedule(delayMs: number): void {
    this.running ??= new Promise<void>((resolve) => setTimeout(resolve, delayMs)).then(() => this.drain())
  }

  private async drain(): Promise<void> {
    const batch = this.items.slice(0, 500)
    try {
      await this.deliver(batch)
      this.items.splice(0, batch.length)
      this.backoffMs = 0
      try {
        this.options.onAck?.(batch)
      } catch (error) {
        this.options.log(`${this.label} acknowledgement bookkeeping failed: ${(error as Error).message}`)
      }
    } catch (error) {
      this.backoffMs = Math.min(Math.max(1000, this.backoffMs * 2), 10_000)
      this.options.log(`${this.label} delivery failed (${batch.length} kept, retry in ${this.backoffMs} ms): ${(error as Error).message}`)
    }
    this.running = null
    if (this.items.length > 0 && !this.options.signal.aborted) this.schedule(this.backoffMs || this.options.delayMs)
  }

  /** Best effort on shutdown: wait for the current attempt, then try once more. */
  async flush(): Promise<void> {
    await this.running
    if (this.items.length > 0) await this.drain()
  }
}

const ATTEMPT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
/** The contract's id shape (A04): a command id the service could not have sent is not answered. */
const WIRE_ID = ATTEMPT_ID
/** Observation types the contract carries; anything else stays in the native log only. */
const OBSERVATION_TYPE = /^[a-z][a-z0-9_/.-]{0,63}$/
/** Upper bound of a receipt reason on the wire (A04). */
const REASON_LIMIT = 16_000

/** Readiness as reported to the Sophia service and to the startup log. */
export type BridgeReadiness = { state: 'ready' } | { state: 'not_ready'; reason: string }

export class ControlBridge {
  private readonly attempts = new Map<string, AttemptState>()
  /**
   * Serializes command execution per attempt id, including the command that
   * creates the attempt: it exists before any AttemptState does.
   */
  private readonly queues = new Map<string, Promise<void>>()
  private readonly bySession = new Map<string, AttemptState>()
  private readonly transport: ServiceTransport | null
  private readonly journal: Journal
  private readonly stopping = new AbortController()
  private readonly instanceId = randomUUID()
  private readonly receiptQueue: RetainedQueue<RuntimeReceipt>
  private readonly observationQueue: RetainedQueue<Observation>
  private cursor = 0
  readiness: BridgeReadiness = { state: 'not_ready', reason: 'starting' }

  constructor(private readonly ctx: Context, private readonly settings: BridgeSettings) {
    this.journal = new Journal(settings.journalDir)
    this.transport = settings.service
      ? new ServiceTransport({ ...settings.service, runtimeUnitId: settings.runtimeUnitId, bridgeInstanceId: this.instanceId })
      : null
    const common = { signal: this.stopping.signal, log: settings.log }
    this.receiptQueue = new RetainedQueue('receipt', (batch) => this.transport!.receipts(batch), {
      ...common,
      delayMs: 0,
      onAck: (batch) => this.receiptsAcknowledged(batch),
    })
    this.observationQueue = new RetainedQueue('observation', (batch) => this.transport!.observations(batch), {
      ...common,
      delayMs: 50,
      onAck: (batch) => this.acknowledged(batch),
    })
  }

  /** Install fences and observers, then connect. Returns the disposer. */
  start(): () => Promise<void> {
    const ctx = this.ctx
    const offPreStep = ctx.on('agent/pre-step', async (payload, next) => {
      const attempt = this.bySession.get(payload.agent.id)
      if (!attempt || attempt.fence === 'active') return next()
      // The claimed batch would be dropped by a rejected step. Held input is
      // kept durably (never re-queued, which would spin the driver); stopped
      // input is retired with the stopped epoch.
      if (attempt.fence === 'held' && payload.messages.length > 0) {
        this.stashClaimed(attempt, payload.agent, payload.messages)
      }
      return { kind: 'reject' }
    })
    // Monotonic: evaluated for every root and nested execution, including tools
    // run by child agents a `workflow` program spawns. Those resolve to the
    // attempt that owns them, so a role cannot be escaped through a child.
    const attemptGuard: ToolGuard = (execution) => {
      const attempt = this.attemptFor(execution.agent ?? ctx.agents.currentInitiator())
      if (!attempt) return undefined
      if (attempt.fence !== 'active') return `Sophia work is ${attempt.fence}; no tool may run until an explicit Resume.`
      if (!attempt.role) return 'This Sophia attempt has no role; no native tool may run.'
      if (!attempt.role.nativeTools.has(execution.name)) return `Tool "${execution.name}" is not permitted for role ${attempt.role.id}.`
      return undefined
    }
    const offGuard = ctx.tools.guard(attemptGuard)
    const offEvent = ctx.on('session/event', (session: Session, event: SessionEvent) => this.observe(session, event))
    void this.connect()
    return async () => {
      this.stopping.abort()
      offPreStep()
      offGuard()
      offEvent()
      await Promise.all([this.receiptQueue.flush(), this.observationQueue.flush()])
    }
  }

  private async connect(): Promise<void> {
    if (!this.transport) {
      this.setReadiness({ state: 'not_ready', reason: 'no Sophia service binding (SOPHIA_BRIDGE_URL / SOPHIA_BRIDGE_TOKEN unset)' })
      return
    }
    let hello: HelloReply
    try {
      hello = await this.transport.hello({ bundle: this.settings.bundle, protocolVersion: this.settings.protocolVersion, dshVersion: this.settings.dshVersion })
    } catch (error) {
      this.setReadiness({ state: 'not_ready', reason: `Sophia service hello failed: ${(error as Error).message}` })
      return
    }
    this.cursor = hello.cursor
    const unrecovered: UnrecoveredBinding[] = []
    for (const binding of hello.bindings) {
      const failure = await this.reconcile(binding)
      if (failure) unrecovered.push(failure)
    }
    // Tell the service first, so the startup line a supervisor keys on
    // implies the service has heard it too. A refused report is not ready.
    // Bindings that could not be restored are named in the report itself:
    // the service accepts readiness only together with them.
    try {
      await this.transport.ready('ready', null, unrecovered)
    } catch (error) {
      this.setReadiness({ state: 'not_ready', reason: `Sophia service did not accept the ready report: ${(error as Error).message}` })
      return
    }
    this.setReadiness({ state: 'ready' }, unrecovered)
    await this.pollLoop()
  }

  private setReadiness(next: BridgeReadiness, unrecovered: readonly UnrecoveredBinding[] = []): void {
    this.readiness = next
    const failed = unrecovered.length > 0 ? ` unrecovered=${unrecovered.map((u) => u.attemptId).join(',')}` : ''
    this.settings.log(next.state === 'ready' ? `readiness=ready${failed}` : `readiness=not_ready reason="${next.reason}"`)
  }

  private async pollLoop(): Promise<void> {
    const transport = this.transport!
    while (!this.stopping.signal.aborted) {
      let batch: RuntimeCommandBatch
      try {
        batch = await transport.poll(this.cursor, this.settings.pollWaitMs, this.stopping.signal)
      } catch (error) {
        if (this.stopping.signal.aborted) return
        this.settings.log(`poll failed: ${(error as Error).message}; retrying`)
        await new Promise((resolve) => setTimeout(resolve, 1000))
        continue
      }
      for (const { seq, command } of batch.commands) {
        this.cursor = Math.max(this.cursor, seq)
        this.dispatch(command)
      }
      this.cursor = Math.max(this.cursor, batch.cursor)
    }
  }

  /**
   * The bound attempt an Agent works for: itself, or the attempt whose Agent
   * (transitively) owns it at runtime, as for workflow/subagent children.
   */
  private attemptFor(agent: Agent | undefined): AttemptState | undefined {
    let current = agent
    for (let depth = 0; current && depth < 32; depth += 1) {
      const attempt = this.bySession.get(current.id)
      if (attempt) return attempt
      const child: Agent = current
      current = this.ctx.agents.list().find((candidate) => candidate.id !== child.id && this.ctx.agents.isOwnedBy(child.id, candidate))
    }
    return undefined
  }

  /**
   * Create-time scoped setup: hide every visible native tool the role does
   * not allow. The guard enforces the same set at execution; visibility only
   * keeps the model from being offered what it may not run.
   */
  private setupFor(role: RolePreset): AgentSetup {
    return (agentCtx) => {
      const visible = this.ctx.tools.schemas().map((schema) => schema.name)
      const deny = visible.filter((name) => !role.nativeTools.has(name))
      if (deny.length > 0) agentCtx.tools.restrict({ deny })
    }
  }

  /** Validate and enqueue one wire command on its attempt's serial queue. */
  dispatch(raw: unknown): void {
    let command: RuntimeCommand
    try {
      command = parseCommand(raw)
    } catch (error) {
      const record = (raw ?? {}) as { commandId?: unknown; binding?: { attemptId?: unknown } }
      // Answer only what the service could correlate; a malformed id cannot be named in a valid receipt.
      if (typeof record.commandId === 'string' && WIRE_ID.test(record.commandId)) {
        const attemptId = typeof record.binding?.attemptId === 'string' && ATTEMPT_ID.test(record.binding.attemptId) ? record.binding.attemptId : ''
        this.send(this.receipt(attemptId, record.commandId, 'rejected', null, null, (error as Error).message))
      } else {
        this.settings.log(`dropped a command without a valid commandId: ${(error as Error).message}`)
      }
      return
    }
    const { attemptId } = command.binding
    const run = () => this.execute(command).then((receipts) => this.send(...receipts))
    const next = (this.queues.get(attemptId) ?? Promise.resolve())
      .then(run)
      .catch((error: Error) => this.settings.log(`command ${command.commandId} failed: ${error.stack ?? error.message}`))
    this.queues.set(attemptId, next)
  }

  private receipt(attemptId: string, commandId: string, stage: ReceiptStage, sessionId: string | null, seq: number | null, reason: string | null, evidence: string[] = []): RuntimeReceipt {
    const bounded = reason !== null && reason.length > REASON_LIMIT ? `${reason.slice(0, REASON_LIMIT - 1)}…` : reason
    return { commandId, attemptId, stage, nativeSessionId: sessionId, nativeSequence: seq, evidenceRefs: evidence, observedAt: new Date().toISOString(), reason: bounded }
  }

  /**
   * Queue receipts for delivery. Each is checked against the contract here,
   * not at send time: the queue retries until acknowledged, so an invalid
   * item would otherwise block every receipt behind it.
   */
  private send(...receipts: RuntimeReceipt[]): void {
    if (!this.transport) return
    for (const receipt of receipts) {
      const { commandId } = receipt
      if (wire.RuntimeReceipt(receipt)) this.receiptQueue.push(receipt)
      else this.settings.log(`dropped a receipt for ${commandId} that breaks the runtime contract`)
    }
  }

  /** Execute one command; always resolves to the receipts it produced. */
  async execute(command: RuntimeCommand): Promise<RuntimeReceipt[]> {
    const { attemptId } = command.binding
    const reject = (reason: string) => [this.receipt(attemptId, command.commandId, 'rejected', null, null, reason)]
    if (command.binding.runtimeUnitId !== this.settings.runtimeUnitId) {
      return reject(`command targets runtime unit ${command.binding.runtimeUnitId}; this runtime is ${this.settings.runtimeUnitId}`)
    }
    if (!ATTEMPT_ID.test(attemptId)) return reject('attemptId must match [A-Za-z0-9][A-Za-z0-9_-]{0,63}')

    const attempt = this.attempts.get(attemptId)
    const prior = attempt?.receipts.get(command.commandId)
    if (prior) return [{ ...prior, observedAt: new Date().toISOString(), reason: prior.reason ?? 'duplicate delivery answered from the session log' }]
    if (attempt && command.binding.authorityEpoch < attempt.epoch) {
      return reject(`stale authority epoch ${command.binding.authorityEpoch}; current epoch is ${attempt.epoch}`)
    }
    if (attempt?.fence === 'stopped') {
      // A Stop redelivered after a restart cut it short: the fence stands; finish it.
      if (command.kind === 'stop') return await this.restop(attempt, command)
      return reject('the attempt is stopped; a stopped native session is never resumed')
    }
    const retryable = command.kind === 'resume' && !attempt?.identityMismatch
    if (attempt?.unrecovered && !retryable && command.kind !== 'inspect' && command.kind !== 'stop') {
      return reject(`the attempt was not recovered after restart (${attempt.unrecovered}); send \`resume\``)
    }

    try {
      switch (command.kind) {
        case 'create': return await this.create(command)
        case 'resume': return await this.resume(command)
        case 'input': return await this.deliver(command, 'next-turn')
        case 'steer': return await this.deliver(command, 'next-step')
        case 'hold': return await this.hold(command)
        case 'stop': return await this.stop(command)
        case 'inspect': return this.inspect(command)
      }
    } catch (error) {
      if (error instanceof ProtocolError) return reject(error.message)
      return [this.receipt(attemptId, command.commandId, 'failed', attempt?.sessionId ?? null, null, (error as Error).message)]
    }
  }

  /**
   * The composition's default model selection. `ctx.agents` does not apply it
   * on its own: entry points read it at creation (and resume) time. This is
   * the route the runtime unit records and the gate checks.
   */
  private agentOptions(): AgentOptions {
    const { provider, model, reasoningEffort } = this.ctx.agentDefaultModel.currentSelection()
    return reasoningEffort === undefined ? { provider, model } : { provider, model, reasoningEffort }
  }

  private sessionIdFor(attemptId: string): SessionId {
    // Deterministic per attempt: a duplicate `create` after a crash finds the
    // same session instead of starting a second one.
    return brandString<SessionId>(`sophia-${attemptId}`)
  }

  private newAttempt(attemptId: string, epoch: number): AttemptState {
    const state: AttemptState = {
      attemptId,
      sessionId: this.sessionIdFor(attemptId),
      handle: null,
      role: null,
      epoch,
      fence: 'active',
      receipts: new Map(),
      pendingIncorporation: new Map(),
      targets: new Map(),
      stash: [],
      unsettled: new Map(),
      unrecovered: null,
      identityMismatch: false,
    }
    this.attempts.set(attemptId, state)
    this.bySession.set(state.sessionId, state)
    return state
  }

  private agentOf(attempt: AttemptState): Agent {
    const agent = attempt.handle?.agent ?? this.ctx.agents.get(attempt.sessionId)
    if (!agent) throw new ProtocolError('the attempt has no live native session; send `resume` first')
    return agent
  }

  /**
   * Resume a persisted session under the role its create recorded. A bundle
   * that no longer defines that role refuses: a historical session never
   * silently resumes under a different permission composition.
   */
  private async resumeNative(attempt: AttemptState): Promise<AgentHandle> {
    const logged = foldLog(this.journal.read(attempt.sessionId))
    const role = roleOf(logged.role)
    if (!role) throw new ProtocolError(`the attempt's recorded role ${JSON.stringify(logged.role)} is not defined in this runtime unit; refusing to resume`)
    attempt.role = role
    // Fence before dsh loads the session: retained inbox or goal work must
    // meet the journaled (or service-held) fence at its first pre-step.
    attempt.fence = strongestFence(attempt.fence, logged.fence)
    attempt.epoch = Math.max(attempt.epoch, logged.authorityEpoch)
    const handle = await this.ctx.agents.resume({ resumeSessionId: attempt.sessionId, agentOptions: this.agentOptions(), setup: this.setupFor(role) })
    this.adopt(attempt, handle.agent)
    attempt.unrecovered = null
    return handle
  }

  /** Ids of every message dsh holds for the Agent: its history and its live inbox. */
  private nativeMessageIds(agent: Agent): Set<string> {
    const ids = new Set<string>()
    for (const event of agent.session.snapshotEvents()) {
      if (event.type === 'user/message') ids.add((event.data as { id: string }).id)
    }
    for (const message of [...agent.inbox.nextStep, ...agent.inbox.nextTurn]) ids.add(message.id)
    return ids
  }

  /**
   * Restore bridge state from the journal and the session's native history.
   * Settled commands are answered from the journal; unsettled ones wait for
   * their redelivery to re-execute. Held input a Resume sent but dsh never
   * received returns to the stash. Durable events the service has not
   * acknowledged are observed again.
   */
  private adopt(attempt: AttemptState, agent: Agent): void {
    const events = agent.session.snapshotEvents()
    const logged = foldLog(this.journal.read(attempt.sessionId), events)
    const present = this.nativeMessageIds(agent)
    attempt.epoch = Math.max(attempt.epoch, logged.authorityEpoch)
    attempt.fence = strongestFence(attempt.fence, logged.fence)
    const lost = logged.unstashed.filter((m) => !present.has(m.messageId))
    if (lost.length > 0) this.journal.append(attempt.sessionId, 'sophia/stash', { attemptId: attempt.attemptId, messages: lost })
    attempt.stash = [...logged.stash, ...lost]
    const incorporatedAt = new Map<string, number>()
    for (const event of events) {
      if (event.type === 'user/message') incorporatedAt.set((event.data as { id: string }).id, event.seq)
    }
    for (const [commandId, entry] of logged.commands) {
      if (entry.settled) {
        attempt.receipts.set(commandId, this.receipt(attempt.attemptId, commandId, entry.stage ?? 'delivered', attempt.sessionId, entry.nativeSeq, entry.reason ?? 'reconstructed from the bridge journal', this.evidence(attempt, entry.seq, entry.nativeSeq)))
      } else {
        attempt.unsettled.set(commandId, entry)
      }
      if (!entry.messageId) continue
      attempt.targets.set(entry.messageId, entry.target ?? 'next-turn')
      const seq = incorporatedAt.get(entry.messageId)
      if (seq === undefined) {
        if (present.has(entry.messageId)) attempt.pendingIncorporation.set(entry.messageId, commandId)
      } else if (!logged.incorporationReceipted.has(commandId)) {
        // Its own acknowledgement, not the observation cursor, decides a receipt's replay.
        this.send(this.incorporationReceipt(attempt, commandId, seq))
      }
    }
    for (const event of events) {
      if (event.seq > logged.observedSeq) this.enqueueObservation(attempt, event)
    }
  }

  private evidence(attempt: AttemptState, journalSeq: number, nativeSeq: number | null): string[] {
    const refs = [`sophia-journal:${attempt.sessionId}#${journalSeq}`]
    if (nativeSeq !== null) refs.push(`dsh-session:${attempt.sessionId}#${nativeSeq}`)
    return refs
  }

  /**
   * Journal the command (fsynced) before any native action, and advance the
   * attempt to the command's authority epoch so no older grant runs after it.
   * @returns the journal seq.
   */
  private append(attempt: AttemptState, command: RuntimeCommand, message: { readonly id: string; readonly content: readonly ContentBlock[] } | null, target: DeliveryTarget | null): number {
    attempt.epoch = Math.max(attempt.epoch, command.binding.authorityEpoch)
    return this.journal.append(attempt.sessionId, 'sophia/command', {
      commandId: command.commandId,
      kind: command.kind,
      attemptId: attempt.attemptId,
      authorityEpoch: command.binding.authorityEpoch,
      messageId: message ? message.id : null,
      target,
      content: message ? [...message.content] : null,
      nativeSeq: null,
      role: command.kind === 'create' ? attempt.role?.id ?? null : null,
    }).seq
  }

  /**
   * Flush dsh's log, then journal the native seq the command's effect settled
   * at together with the receipt it earned (recovery answers with the same).
   */
  private async settled(attempt: AttemptState, agent: Agent | null, command: RuntimeCommand, stage: ReceiptStage = 'delivered', reason: string | null = null): Promise<number | null> {
    let nativeSeq: number | null = null
    if (agent) {
      await this.ctx.sessions.flush(agent.session)
      nativeSeq = agent.session.snapshotEvents().at(-1)?.seq ?? null
    }
    this.journal.append(attempt.sessionId, 'sophia/settled', { commandId: command.commandId, nativeSeq, stage, reason })
    return nativeSeq
  }

  private setFence(attempt: AttemptState, state: FenceState, command: RuntimeCommand): number {
    attempt.fence = state
    attempt.epoch = Math.max(attempt.epoch, command.binding.authorityEpoch)
    return this.journal.append(attempt.sessionId, 'sophia/fence', { attemptId: attempt.attemptId, authorityEpoch: attempt.epoch, state, commandId: command.commandId }).seq
  }

  private async create(command: RuntimeCommand): Promise<RuntimeReceipt[]> {
    const { attemptId, authorityEpoch } = command.binding
    const existing = this.attempts.get(attemptId)
    // Only the redelivery of a create that a restart cut short may meet its own attempt.
    if (existing && !existing.unsettled.has(command.commandId)) {
      return [this.receipt(attemptId, command.commandId, 'rejected', existing.sessionId, null, 'the attempt already has a native session; use `resume`')]
    }
    const role = roleOf(command.payload.role)
    if (!role) throw new ProtocolError(`create requires payload.role, one of this bundle's role presets; got ${JSON.stringify(command.payload.role)}`)
    const attempt = existing ?? this.newAttempt(attemptId, authorityEpoch)
    attempt.role ??= role
    const live = existing ? null : this.ctx.agents.get(attempt.sessionId)
    if (existing) {
      // Reconciled from its binding already; its session is live.
    } else if (live) {
      this.adopt(attempt, live)
    } else {
      try {
        attempt.handle = await this.ctx.agents.create({ sessionId: attempt.sessionId, meta: { cwd: this.settings.workspace }, agentOptions: this.agentOptions(), setup: this.setupFor(role) })
      } catch (error) {
        // A persisted session with this deterministic id means an earlier
        // create reached dsh before a crash: resume it instead of forking work,
        // under the journaled fence from its first step.
        attempt.fence = strongestFence(attempt.fence, foldLog(this.journal.read(attempt.sessionId)).fence)
        attempt.handle = await this.ctx.agents.resume({ resumeSessionId: attempt.sessionId, agentOptions: this.agentOptions(), setup: this.setupFor(role) }).catch(() => { throw error })
        this.adopt(attempt, attempt.handle.agent)
      }
    }
    const agent = this.agentOf(attempt)
    const prior = attempt.receipts.get(command.commandId)
    if (prior) return [prior]
    const text = commandText(command)
    if (!text) {
      const seq = this.append(attempt, command, null, null)
      // A re-executed create never lifts a fence the attempt carries.
      if (!existing) this.setFence(attempt, 'active', command)
      return [this.record(attempt, command, 'delivered', seq, await this.settled(attempt, agent, command))]
    }
    return this.deliverTo(attempt, agent, command, 'next-turn', text)
  }

  private async resume(command: RuntimeCommand): Promise<RuntimeReceipt[]> {
    const { attemptId, authorityEpoch } = command.binding
    const expected = command.expectedNativeSessionId
    if (expected && expected !== this.sessionIdFor(attemptId)) {
      throw new ProtocolError(`expected native session ${expected}, the attempt maps to ${this.sessionIdFor(attemptId)}`)
    }
    const attempt = this.attempts.get(attemptId) ?? this.newAttempt(attemptId, authorityEpoch)
    if (!attempt.handle && !this.ctx.agents.get(attempt.sessionId)) {
      attempt.handle = await this.resumeNative(attempt)
    }
    const agent = this.agentOf(attempt)
    if (attempt.fence === 'stopped') throw new ProtocolError('the attempt is stopped; a stopped native session is never resumed')
    const seq = this.append(attempt, command, null, null)
    const wasHeld = attempt.fence === 'held'
    if (wasHeld) this.setFence(attempt, 'active', command)
    // Also completes a Resume that a restart cut short after lifting the fence.
    this.redeliverStash(attempt, agent, command.commandId)
    if (wasHeld) this.rewakePending(agent)
    return [this.record(attempt, command, 'delivered', seq, await this.settled(attempt, agent, command))]
  }

  /**
   * Input kept in the live inbox across a Hold (`keepInbox`) has no wake of
   * its own. Re-send each pending message, same identity, with a wake so the
   * driver runs it now that the fence is lifted.
   */
  private rewakePending(agent: Agent): void {
    const pending: [UserMessage, DeliveryTarget][] = [
      ...agent.inbox.nextStep.map((m): [UserMessage, DeliveryTarget] => [m, 'next-step']),
      ...agent.inbox.nextTurn.map((m): [UserMessage, DeliveryTarget] => [m, 'next-turn']),
    ]
    for (const [message, target] of pending) {
      if (!agent.inbox.remove(message.id)) continue
      agent.send(message, target, true)
    }
  }

  /**
   * Send held input back to dsh. The journal names the replacement messages
   * first, so a restart before dsh flushed them puts them back in the stash.
   */
  private redeliverStash(attempt: AttemptState, agent: Agent, commandId: string): void {
    if (attempt.stash.length === 0) return
    const stash = attempt.stash
    attempt.stash = []
    const sent = stash.map((held) => ({ held, message: createUserMessage({ content: [...held.content], source: { kind: 'user' } }) }))
    this.journal.append(attempt.sessionId, 'sophia/unstash', {
      attemptId: attempt.attemptId,
      commandId,
      messageIds: stash.map((m) => m.messageId),
      messages: sent.map(({ held, message }) => ({ messageId: message.id, target: held.target, content: [...held.content] })),
    })
    for (const { held, message } of sent) {
      const owner = attempt.pendingIncorporation.get(held.messageId)
      if (owner) {
        attempt.pendingIncorporation.delete(held.messageId)
        attempt.pendingIncorporation.set(message.id, owner)
      }
      attempt.targets.set(message.id, held.target)
      if (held.target === 'next-step') agent.steer(message)
      else agent.followup(message)
    }
  }

  private async deliver(command: RuntimeCommand, target: DeliveryTarget): Promise<RuntimeReceipt[]> {
    const attempt = this.attempts.get(command.binding.attemptId)
    if (!attempt) throw new ProtocolError('unknown attempt; send `create` or `resume` first')
    if (attempt.fence === 'held') throw new ProtocolError('the attempt is held; send `resume` before new input')
    const text = commandText(command)
    if (!text) throw new ProtocolError(`${command.kind} requires payload.text`)
    return this.deliverTo(attempt, this.agentOf(attempt), command, target, text)
  }

  private async deliverTo(attempt: AttemptState, agent: Agent, command: RuntimeCommand, target: DeliveryTarget, text: string): Promise<RuntimeReceipt[]> {
    const replay = attempt.unsettled.get(command.commandId)
    if (replay?.messageId) {
      if (this.nativeMessageIds(agent).has(replay.messageId)) {
        // Re-execution after a restart: dsh already holds the message. Settle; never send it twice.
        const seq = this.append(attempt, command, { id: replay.messageId, content: replay.content ?? [] }, replay.target)
        return [this.record(attempt, command, 'delivered', seq, await this.settled(attempt, agent, command), 'redelivered after a restart; dsh already held the message')]
      }
      attempt.pendingIncorporation.delete(replay.messageId)
    }
    const content: ContentBlock[] = [{ type: 'text', text }]
    const message = createUserMessage({ content, source: { kind: 'user' } })
    // Journal first (fsynced), then hand to the native inbox, then flush its
    // splice: the receipt says `delivered` only once both are durable.
    const seq = this.append(attempt, command, message, target)
    attempt.targets.set(message.id, target)
    attempt.pendingIncorporation.set(message.id, command.commandId)
    if (target === 'next-step') agent.steer(message)
    else agent.followup(message)
    return [this.record(attempt, command, 'delivered', seq, await this.settled(attempt, agent, command))]
  }

  private async settle(agent: Agent): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), this.settings.settleTimeoutMs) })
    try {
      return await Promise.race([agent.whenIdle().then(() => true), timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  private async hold(command: RuntimeCommand): Promise<RuntimeReceipt[]> {
    const attempt = this.attempts.get(command.binding.attemptId)
    if (!attempt) throw new ProtocolError('unknown attempt')
    const agent = this.agentOf(attempt)
    this.setFence(attempt, 'held', command)
    const seq = this.append(attempt, command, null, null)
    agent.cancel({ kind: 'hook', reason: 'sophia-hold' }, { keepInbox: true })
    const idle = await this.settle(agent)
    const stage: ReceiptStage = idle ? 'checked' : 'outcome_unknown'
    const reason = idle ? 'held; the native driver is idle' : 'held; cancellation did not settle in time'
    const nativeSeq = await this.settled(attempt, agent, command, stage, reason)
    return [this.record(attempt, command, stage, seq, nativeSeq, reason)]
  }

  private async stop(command: RuntimeCommand): Promise<RuntimeReceipt[]> {
    const attempt = this.attempts.get(command.binding.attemptId)
    if (!attempt) throw new ProtocolError('unknown attempt')
    this.setFence(attempt, 'stopped', command)
    // Stop is always honored: without a live session the durable fence is the whole effect.
    const agent = attempt.handle?.agent ?? this.ctx.agents.get(attempt.sessionId)
    if (!agent) return this.restop(attempt, command)
    const seq = this.append(attempt, command, null, null)
    agent.cancel({ kind: 'hook', reason: 'sophia-stop' })
    const idle = await this.settle(agent)
    const stage: ReceiptStage = idle ? 'checked' : 'outcome_unknown'
    const reason = idle ? 'stopped; the native driver is idle and the handle is released' : 'stopped; cancellation did not settle in time'
    const nativeSeq = await this.settled(attempt, agent, command, stage, reason)
    const receipt = this.record(attempt, command, stage, seq, nativeSeq, reason)
    if (attempt.handle) {
      await attempt.handle.dispose()
      attempt.handle = null
    }
    return [receipt]
  }

  private inspect(command: RuntimeCommand): RuntimeReceipt[] {
    const attempt = this.attempts.get(command.binding.attemptId)
    if (!attempt) throw new ProtocolError('unknown attempt')
    if (command.binding.authorityEpoch > attempt.epoch) {
      // An accepted command retires older grants even when it changes nothing else.
      attempt.epoch = command.binding.authorityEpoch
      this.journal.append(attempt.sessionId, 'sophia/epoch', { attemptId: attempt.attemptId, authorityEpoch: attempt.epoch })
    }
    const agent = attempt.handle?.agent ?? this.ctx.agents.get(attempt.sessionId)
    const summary = {
      fence: attempt.fence,
      role: attempt.role?.id ?? null,
      epoch: attempt.epoch,
      live: Boolean(agent),
      status: agent?.status ?? null,
      inbox: agent ? { nextTurn: agent.inbox.nextTurn.length, nextStep: agent.inbox.nextStep.length } : null,
      stash: attempt.stash.length,
      pendingIncorporation: [...attempt.pendingIncorporation.values()],
      lastSeq: agent ? agent.session.snapshotEvents().at(-1)?.seq ?? null : null,
    }
    return [this.receipt(attempt.attemptId, command.commandId, 'checked', attempt.sessionId, summary.lastSeq, JSON.stringify(summary))]
  }

  private record(attempt: AttemptState, command: RuntimeCommand, stage: ReceiptStage, journalSeq: number, nativeSeq: number | null, reason: string | null = null): RuntimeReceipt {
    const receipt = this.receipt(attempt.attemptId, command.commandId, stage, attempt.sessionId, nativeSeq, reason, this.evidence(attempt, journalSeq, nativeSeq))
    attempt.receipts.set(command.commandId, receipt)
    attempt.unsettled.delete(command.commandId)
    return receipt
  }

  /** Finish a Stop on an attempt already fenced stopped (idempotent). */
  private async restop(attempt: AttemptState, command: RuntimeCommand): Promise<RuntimeReceipt[]> {
    const seq = this.append(attempt, command, null, null)
    const agent = attempt.handle?.agent ?? this.ctx.agents.get(attempt.sessionId) ?? null
    const reason = 'stopped; the stopped epoch stands'
    const nativeSeq = await this.settled(attempt, agent, command, 'checked', reason)
    if (attempt.handle) {
      await attempt.handle.dispose()
      attempt.handle = null
    }
    return [this.record(attempt, command, 'checked', seq, nativeSeq, reason)]
  }

  /** Keep claimed input of a held attempt out of the live inbox, durably. */
  private stashClaimed(attempt: AttemptState, agent: Agent, messages: readonly UserMessage[]): void {
    const held: StashedMessage[] = messages.map((m) => ({ messageId: m.id, target: attempt.targets.get(m.id) ?? 'next-step', content: [...m.content] }))
    attempt.stash.push(...held)
    this.journal.append(attempt.sessionId, 'sophia/stash', { attemptId: attempt.attemptId, messages: held })
  }

  /**
   * On (re)connect: resume every binding the service expects, from its log.
   * The fence is the stronger of the binding's and the journal's, applied
   * before dsh loads the session.
   * @returns the failure, when the binding could not be restored.
   */
  private async reconcile(binding: ServiceBinding): Promise<UnrecoveredBinding | null> {
    if (this.attempts.has(binding.attemptId)) return null
    if (!ATTEMPT_ID.test(binding.attemptId)) return { attemptId: binding.attemptId, reason: 'attemptId must match [A-Za-z0-9][A-Za-z0-9_-]{0,63}' }
    const attempt = this.newAttempt(binding.attemptId, binding.authorityEpoch)
    if (binding.nativeSessionId !== attempt.sessionId) {
      // Never infer a replacement identity: resuming another session would run commands against different history.
      attempt.identityMismatch = true
      attempt.unrecovered = `the binding names native session ${binding.nativeSessionId}; this runtime maps the attempt to ${attempt.sessionId}`
      this.settings.log(`reconcile ${binding.attemptId} failed: ${attempt.unrecovered}`)
      return { attemptId: binding.attemptId, reason: attempt.unrecovered }
    }
    if (binding.state === 'stopped') {
      attempt.fence = 'stopped'
      return null
    }
    attempt.fence = binding.state as FenceState
    try {
      const live = this.ctx.agents.get(attempt.sessionId)
      if (live) {
        this.adopt(attempt, live)
      } else {
        attempt.handle = await this.resumeNative(attempt)
      }
      const agent = this.agentOf(attempt)
      if (attempt.fence === 'stopped' && attempt.handle) {
        // The durable log outranks a stale service binding: a stopped session
        // is released again at once and never driven (the pre-step fence
        // already rejects any step in between).
        await attempt.handle.dispose()
        attempt.handle = null
      } else if (attempt.fence === 'active' && attempt.stash.length > 0) {
        // A Resume lifted the fence, then a restart cut it short before dsh
        // held the redelivered input: finish it.
        this.redeliverStash(attempt, agent, 'restart-reconcile')
        this.rewakePending(agent)
        await this.ctx.sessions.flush(agent.session)
      }
      this.settings.log(`reconciled ${binding.attemptId}: fence=${attempt.fence} commands=${attempt.receipts.size} unsettled=${attempt.unsettled.size} stash=${attempt.stash.length}`)
      return null
    } catch (error) {
      attempt.unrecovered = (error as Error).message
      this.settings.log(`reconcile ${binding.attemptId} failed: ${attempt.unrecovered}`)
      return { attemptId: binding.attemptId, reason: attempt.unrecovered }
    }
  }

  /** Durable session events of bound sessions, batched to the service. */
  private observe(session: Session, event: SessionEvent): void {
    const attempt = this.bySession.get(session.id)
    if (!attempt) return
    if (event.type === 'user/message') {
      const commandId = attempt.pendingIncorporation.get((event.data as { id: string }).id)
      if (commandId) {
        attempt.pendingIncorporation.delete((event.data as { id: string }).id)
        this.send(this.incorporationReceipt(attempt, commandId, event.seq))
      }
    }
    this.enqueueObservation(attempt, event)
  }

  private incorporationReceipt(attempt: AttemptState, commandId: string, seq: number): RuntimeReceipt {
    return this.receipt(attempt.attemptId, commandId, 'incorporation_observed', attempt.sessionId, seq, 'the message entered a native step', [`dsh-session:${attempt.sessionId}#${seq}`])
  }

  private enqueueObservation(attempt: AttemptState, event: SessionEvent): void {
    if (!this.transport || !OBSERVATION_TYPE.test(event.type)) return
    const observation: Observation = {
      runtimeUnitId: this.settings.runtimeUnitId,
      attemptId: attempt.attemptId,
      nativeSessionId: attempt.sessionId,
      nativeSeq: event.seq,
      type: event.type,
      durable: true,
      data: summarize(event),
    }
    // Checked before queueing, for the same reason as receipts.
    if (!wire.RuntimeObservation(observation)) {
      this.settings.log(`dropped observation ${attempt.sessionId}#${event.seq} that breaks the runtime contract`)
      return
    }
    this.observationQueue.push(observation)
  }

  /** Journal acknowledged incorporation receipts, so a restart re-sends only the ones the service lacks. */
  private receiptsAcknowledged(batch: readonly RuntimeReceipt[]): void {
    for (const r of batch) {
      if (r.stage === 'incorporation_observed' && r.nativeSessionId) {
        this.journal.append(r.nativeSessionId, 'sophia/receipted', { commandId: r.commandId, stage: 'incorporation_observed' })
      }
    }
  }

  /** Journal each session's acknowledged observation cursor, so a restart replays only what the service lacks. */
  private acknowledged(batch: readonly Observation[]): void {
    const highest = new Map<string, number>()
    for (const o of batch) highest.set(o.nativeSessionId, Math.max(highest.get(o.nativeSessionId) ?? -1, o.nativeSeq))
    for (const [sessionId, nativeSeq] of highest) this.journal.append(sessionId, 'sophia/observed', { nativeSeq })
  }
}

/** Upper bound of a step's assistant text forwarded to the service (a drafted brief fits well within it). */
const ASSISTANT_TEXT_LIMIT = 120_000

type AssistantEventData = {
  stream: Parameters<typeof expandAssistantStream>[0]
  message?: { source?: { provider?: unknown; model?: unknown } }
  usage?: { inputTokens?: unknown; outputTokens?: unknown }
  interrupted?: true
}

const count = (value: unknown): number | null => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null)
const label = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value.slice(0, 200) : null)

/**
 * A bounded, model-free projection of one durable event for the service. An
 * assistant message also names the provider and model that produced it and
 * the usage the adapter reported (null when it reported none), so the
 * service keeps the actual model identity with a captured result.
 */
function summarize(event: SessionEvent): unknown {
  switch (event.type) {
    case 'user/message': {
      const data = event.data as UserMessage
      return { id: data.id, text: textOf(data.content) }
    }
    case 'assistant/message':
    case 'assistant/attempt': {
      const data = event.data as AssistantEventData
      let text = ''
      for (const { chunk } of expandAssistantStream(data.stream)) if (chunk.type === 'text-delta') text += chunk.text
      if (event.type === 'assistant/attempt') return { text: text.slice(0, 4000) }
      return {
        text: text.slice(0, ASSISTANT_TEXT_LIMIT),
        truncated: text.length > ASSISTANT_TEXT_LIMIT,
        provider: label(data.message?.source?.provider),
        model: label(data.message?.source?.model),
        inputTokens: count(data.usage?.inputTokens),
        outputTokens: count(data.usage?.outputTokens),
        interrupted: data.interrupted === true,
      }
    }
    case 'turn/start':
    case 'turn/end':
    case 'step/start':
    case 'step/end':
      return event.data
    default:
      return null
  }
}

function textOf(content: readonly ContentBlock[]): string {
  return content.map((block) => (block.type === 'text' ? block.text : `[${block.type}]`)).join('').slice(0, 4000)
}
