/**
 * The Sophia control bridge: application commands <-> the public dsh Agent API.
 *
 * It is a transport adapter, not a second loop. The native loop, inbox,
 * history, compaction and persistence stay dsh's; the bridge only
 *
 * - creates/resumes Agents through `ctx.agents` and owns their handles,
 * - records each command's correlation in the session log and flushes it
 *   before acknowledging delivery (so redelivery is answered, not re-run),
 * - enforces Hold/Stop with work fences at `agent/pre-step` and a monotonic
 *   tool guard, set BEFORE native cancellation (native cancel is not a latch),
 * - forwards durable session events, keyed by (runtime unit, session, seq).
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
import type { RuntimeCommand, RuntimeReceipt, ReceiptStage } from './protocol.js'
import { roleOf } from './role-registry.js'
import type { RolePreset } from './role-registry.js'
import { foldLog, Journal } from './session-events.js'
import type { DeliveryTarget, FenceState, StashedMessage } from './session-events.js'
import { ServiceTransport } from './transport.js'
import type { HelloReply, Observation, ServiceBinding } from './transport.js'

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
  /** Serializes command execution for this attempt. */
  queue: Promise<void>
}

const ATTEMPT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

/** Readiness as reported to the Sophia service and to the startup log. */
export type BridgeReadiness = { state: 'ready' } | { state: 'not_ready'; reason: string }

export class ControlBridge {
  private readonly attempts = new Map<string, AttemptState>()
  private readonly bySession = new Map<string, AttemptState>()
  private readonly transport: ServiceTransport | null
  private readonly journal: Journal
  private readonly stopping = new AbortController()
  private readonly instanceId = randomUUID()
  private observationBuffer: Observation[] = []
  private observationFlush: Promise<void> | null = null
  private cursor = 0
  readiness: BridgeReadiness = { state: 'not_ready', reason: 'starting' }

  constructor(private readonly ctx: Context, private readonly settings: BridgeSettings) {
    this.journal = new Journal(settings.journalDir)
    this.transport = settings.service
      ? new ServiceTransport({ ...settings.service, runtimeUnitId: settings.runtimeUnitId, bridgeInstanceId: this.instanceId })
      : null
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
      await this.flushObservations()
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
    for (const binding of hello.bindings) await this.reconcile(binding)
    // Tell the service first, so the startup line a supervisor keys on
    // implies the service has heard it too. A refused report is not ready.
    try {
      await this.transport.ready('ready', null)
    } catch (error) {
      this.setReadiness({ state: 'not_ready', reason: `Sophia service did not accept the ready report: ${(error as Error).message}` })
      return
    }
    this.setReadiness({ state: 'ready' })
    await this.pollLoop()
  }

  private setReadiness(next: BridgeReadiness): void {
    this.readiness = next
    this.settings.log(next.state === 'ready' ? 'readiness=ready' : `readiness=not_ready reason="${next.reason}"`)
  }

  private async pollLoop(): Promise<void> {
    const transport = this.transport!
    while (!this.stopping.signal.aborted) {
      let batch: { commands: { seq: number; command: unknown }[]; cursor: number }
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
      if (typeof record.commandId === 'string') {
        void this.send(this.receipt(String(record.binding?.attemptId ?? ''), record.commandId, 'rejected', null, null, (error as Error).message))
      }
      return
    }
    const attempt = this.attempts.get(command.binding.attemptId)
    const run = () => this.execute(command).then((receipts) => this.send(...receipts))
    if (attempt) {
      attempt.queue = attempt.queue.then(run, run).catch((error: Error) => this.settings.log(`command ${command.commandId} failed: ${error.stack ?? error.message}`))
    } else {
      void run().catch((error: Error) => this.settings.log(`command ${command.commandId} failed: ${error.stack ?? error.message}`))
    }
  }

  private receipt(attemptId: string, commandId: string, stage: ReceiptStage, sessionId: string | null, seq: number | null, reason: string | null, evidence: string[] = []): RuntimeReceipt {
    return { commandId, attemptId, stage, nativeSessionId: sessionId, nativeSequence: seq, evidenceRefs: evidence, observedAt: new Date().toISOString(), reason }
  }

  private async send(...receipts: RuntimeReceipt[]): Promise<void> {
    if (!this.transport || receipts.length === 0) return
    try {
      await this.transport.receipts(receipts)
    } catch (error) {
      this.settings.log(`receipt delivery failed (the service reconciles from the log on redelivery): ${(error as Error).message}`)
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
    if (attempt?.fence === 'stopped') return reject('the attempt is stopped; a stopped native session is never resumed')

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
      queue: Promise.resolve(),
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
    const recorded = foldLog(this.journal.read(attempt.sessionId)).role
    const role = roleOf(recorded)
    if (!role) throw new ProtocolError(`the attempt's recorded role ${JSON.stringify(recorded)} is not defined in this runtime unit; refusing to resume`)
    attempt.role = role
    const handle = await this.ctx.agents.resume({ resumeSessionId: attempt.sessionId, agentOptions: this.agentOptions(), setup: this.setupFor(role) })
    this.adopt(attempt, handle.agent)
    return handle
  }

  /** Restore bridge state from the journal and the session's native history. */
  private adopt(attempt: AttemptState, agent: Agent): void {
    const logged = foldLog(this.journal.read(attempt.sessionId), agent.session.snapshotEvents())
    attempt.epoch = Math.max(attempt.epoch, logged.authorityEpoch)
    attempt.fence = logged.fence
    attempt.stash = [...logged.stash]
    for (const [commandId, entry] of logged.commands) {
      attempt.receipts.set(commandId, this.receipt(attempt.attemptId, commandId, 'delivered', attempt.sessionId, entry.nativeSeq, 'reconstructed from the bridge journal', this.evidence(attempt, entry.seq, entry.nativeSeq)))
      if (entry.messageId && !logged.incorporated.has(entry.messageId)) attempt.pendingIncorporation.set(entry.messageId, commandId)
    }
  }

  private evidence(attempt: AttemptState, journalSeq: number, nativeSeq: number | null): string[] {
    const refs = [`sophia-journal:${attempt.sessionId}#${journalSeq}`]
    if (nativeSeq !== null) refs.push(`dsh-session:${attempt.sessionId}#${nativeSeq}`)
    return refs
  }

  /** Journal the command (fsynced) before any native action. @returns the journal seq. */
  private append(attempt: AttemptState, command: RuntimeCommand, message: UserMessage | null, target: DeliveryTarget | null): number {
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

  /** Flush dsh's log, then journal the native seq the command's effect settled at. */
  private async settled(attempt: AttemptState, agent: Agent, command: RuntimeCommand): Promise<number | null> {
    await this.ctx.sessions.flush(agent.session)
    const nativeSeq = agent.session.snapshotEvents().at(-1)?.seq ?? null
    this.journal.append(attempt.sessionId, 'sophia/settled', { commandId: command.commandId, nativeSeq })
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
    if (existing) {
      return [this.receipt(attemptId, command.commandId, 'rejected', existing.sessionId, null, 'the attempt already has a native session; use `resume`')]
    }
    const role = roleOf(command.payload.role)
    if (!role) throw new ProtocolError(`create requires payload.role, one of this bundle's role presets; got ${JSON.stringify(command.payload.role)}`)
    const attempt = this.newAttempt(attemptId, authorityEpoch)
    attempt.role = role
    const live = this.ctx.agents.get(attempt.sessionId)
    if (live) {
      this.adopt(attempt, live)
    } else {
      try {
        attempt.handle = await this.ctx.agents.create({ sessionId: attempt.sessionId, meta: { cwd: this.settings.workspace }, agentOptions: this.agentOptions(), setup: this.setupFor(role) })
      } catch (error) {
        // A persisted session with this deterministic id means an earlier
        // create reached dsh before a crash: resume it instead of forking work.
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
      this.setFence(attempt, 'active', command)
      return [this.record(attempt, command, 'delivered', seq, await this.settled(attempt, agent, command))]
    }
    return this.deliverTo(attempt, agent, command, 'next-turn', text)
  }

  private async resume(command: RuntimeCommand): Promise<RuntimeReceipt[]> {
    const { attemptId, authorityEpoch } = command.binding
    let attempt = this.attempts.get(attemptId)
    if (!attempt) {
      attempt = this.newAttempt(attemptId, authorityEpoch)
      if (command.expectedNativeSessionId && command.expectedNativeSessionId !== attempt.sessionId) {
        throw new ProtocolError(`expected native session ${command.expectedNativeSessionId}, the attempt maps to ${attempt.sessionId}`)
      }
    }
    if (!attempt.handle && !this.ctx.agents.get(attempt.sessionId)) {
      attempt.handle = await this.resumeNative(attempt)
    }
    const agent = this.agentOf(attempt)
    if (attempt.fence === 'stopped') throw new ProtocolError('the attempt is stopped; a stopped native session is never resumed')
    const seq = this.append(attempt, command, null, null)
    if (attempt.fence === 'held') {
      this.setFence(attempt, 'active', command)
      this.redeliverStash(attempt, agent, command)
      this.rewakePending(agent)
    }
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

  private redeliverStash(attempt: AttemptState, agent: Agent, command: RuntimeCommand): void {
    if (attempt.stash.length === 0) return
    const stash = attempt.stash
    attempt.stash = []
    this.journal.append(attempt.sessionId, 'sophia/unstash', { attemptId: attempt.attemptId, commandId: command.commandId, messageIds: stash.map((m) => m.messageId) })
    for (const held of stash) {
      const message = createUserMessage({ content: [...held.content], source: { kind: 'user' } })
      const owner = [...attempt.pendingIncorporation].find(([id]) => id === held.messageId)?.[1]
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
    const nativeSeq = await this.settled(attempt, agent, command)
    return [this.record(attempt, command, idle ? 'checked' : 'outcome_unknown', seq, nativeSeq, idle ? 'held; the native driver is idle' : 'held; cancellation did not settle in time')]
  }

  private async stop(command: RuntimeCommand): Promise<RuntimeReceipt[]> {
    const attempt = this.attempts.get(command.binding.attemptId)
    if (!attempt) throw new ProtocolError('unknown attempt')
    const agent = this.agentOf(attempt)
    this.setFence(attempt, 'stopped', command)
    const seq = this.append(attempt, command, null, null)
    agent.cancel({ kind: 'hook', reason: 'sophia-stop' })
    const idle = await this.settle(agent)
    const nativeSeq = await this.settled(attempt, agent, command)
    const receipt = this.record(attempt, command, idle ? 'checked' : 'outcome_unknown', seq, nativeSeq, idle ? 'stopped; the native driver is idle and the handle is released' : 'stopped; cancellation did not settle in time')
    if (attempt.handle) {
      await attempt.handle.dispose()
      attempt.handle = null
    }
    return [receipt]
  }

  private inspect(command: RuntimeCommand): RuntimeReceipt[] {
    const attempt = this.attempts.get(command.binding.attemptId)
    if (!attempt) throw new ProtocolError('unknown attempt')
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
    return receipt
  }

  /** Keep claimed input of a held attempt out of the live inbox, durably. */
  private stashClaimed(attempt: AttemptState, agent: Agent, messages: readonly UserMessage[]): void {
    const held: StashedMessage[] = messages.map((m) => ({ messageId: m.id, target: attempt.targets.get(m.id) ?? 'next-step', content: [...m.content] }))
    attempt.stash.push(...held)
    this.journal.append(attempt.sessionId, 'sophia/stash', { attemptId: attempt.attemptId, messages: held })
  }

  /** On (re)connect: resume every binding the service expects, from its log. */
  private async reconcile(binding: ServiceBinding): Promise<void> {
    if (this.attempts.has(binding.attemptId) || !ATTEMPT_ID.test(binding.attemptId)) return
    const attempt = this.newAttempt(binding.attemptId, binding.authorityEpoch)
    if (binding.nativeSessionId !== attempt.sessionId) {
      this.settings.log(`binding ${binding.attemptId} names session ${binding.nativeSessionId}; this bridge maps it to ${attempt.sessionId}`)
    }
    if (binding.state === 'stopped') {
      attempt.fence = 'stopped'
      return
    }
    try {
      const live = this.ctx.agents.get(attempt.sessionId)
      if (live) {
        this.adopt(attempt, live)
      } else {
        attempt.handle = await this.resumeNative(attempt)
      }
      if (attempt.fence === 'stopped' && attempt.handle) {
        // The durable log outranks a stale service binding: a stopped session
        // is released again at once and never driven (the pre-step fence
        // already rejects any step in between).
        await attempt.handle.dispose()
        attempt.handle = null
      }
      this.settings.log(`reconciled ${binding.attemptId}: fence=${attempt.fence} commands=${attempt.receipts.size} stash=${attempt.stash.length}`)
    } catch (error) {
      this.settings.log(`reconcile ${binding.attemptId} failed: ${(error as Error).message}`)
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
        void this.send(this.receipt(attempt.attemptId, commandId, 'incorporation_observed', attempt.sessionId, event.seq, 'the message entered a native step', [`dsh-session:${attempt.sessionId}#${event.seq}`]))
      }
    }
    if (!this.transport) return
    this.observationBuffer.push({
      runtimeUnitId: this.settings.runtimeUnitId,
      attemptId: attempt.attemptId,
      nativeSessionId: attempt.sessionId,
      nativeSeq: event.seq,
      type: event.type,
      durable: true,
      data: summarize(event),
    })
    this.observationFlush ??= new Promise<void>((resolve) => setTimeout(resolve, 50)).then(() => this.flushObservations())
  }

  private async flushObservations(): Promise<void> {
    const batch = this.observationBuffer
    this.observationBuffer = []
    this.observationFlush = null
    if (!this.transport || batch.length === 0) return
    try {
      await this.transport.observations(batch)
    } catch (error) {
      this.settings.log(`observation delivery failed (${batch.length} events): ${(error as Error).message}`)
    }
  }
}

/** A bounded, model-free projection of one durable event for the service. */
function summarize(event: SessionEvent): unknown {
  switch (event.type) {
    case 'user/message': {
      const data = event.data as UserMessage
      return { id: data.id, text: textOf(data.content) }
    }
    case 'assistant/message':
    case 'assistant/attempt': {
      const data = event.data as { stream: Parameters<typeof expandAssistantStream>[0] }
      let text = ''
      for (const { chunk } of expandAssistantStream(data.stream)) if (chunk.type === 'text-delta') text += chunk.text
      return { text: text.slice(0, 4000) }
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
