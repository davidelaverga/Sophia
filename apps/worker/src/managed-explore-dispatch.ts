// Execute one claimed Explore step. Storage owns admission, session ordering,
// one-time send preparation, and lease-fenced persistence.
import { createHash } from 'node:crypto'
import { ManagedExploreProviderError } from './managed-explore-provider.ts'
import type {
  ManagedExplorePrototype,
  ManagedExploreProvider,
  ManagedExploreRootTurn,
  ManagedExploreSession,
} from './managed-explore-provider.ts'

export interface ManagedExploreDispatchScope {
  workerId: string
  routeId: string
  credentialGeneration: number
  providerOrg: string
  providerProject: string
  leaseSeconds: number
  allowSend: boolean
}

type EnvironmentStatus = Awaited<ReturnType<ManagedExploreProvider['readEnvironment']>>['value']['status']
type RootStatus = ManagedExploreRootTurn['status']
type ProviderUsage = NonNullable<ManagedExploreRootTurn['usage']>
type TurnKind = 'text' | 'directions' | 'prototype' | 'revision'
const OUTPUT_READBACK_WINDOW_MS = 5 * 60 * 1000
// Match the authenticated reply-size constraint in the durable dispatch settlement.
const REPLY_MAX_BYTES = 65_536
const MAX_PASS_STEPS = 6
const DEFER_SECONDS = 5

export interface ManagedExploreDispatchIdentity {
  projectId: string
  turnId: string
  leaseToken: string
}

// The worker only consumes the fields needed to fence and settle one step.
export interface ManagedExploreDispatchLease extends ManagedExploreDispatchIdentity {
  turnKind: TurnKind
  leaseUntil: string
  allowSend: boolean
  model: string
  sessionLimitCents: number
  createOperationId: string
  createPossibleAt: string | null
  providerSessionId: string | null
  environmentId: string | null
  environmentStatus: EnvironmentStatus | null
  submissionId: string
  eventPossibleAt: string | null
  previousRootId: string | null
  rootId: string | null
  rootStatus: RootStatus | null
  rootCompletedSeenAt: string | null
  payloadSha256: string | null
}

type Action = { kind: 'create' } | { kind: 'event'; predecessorRootId: string | null }

interface EventIdentity {
  providerSessionId: string
  submissionId: string
  payloadSha256: string
  previousRootId: string | null
}

type Prepared =
  | { kind: 'create'; operationId: string; model: string; sessionLimitCents: number; leaseUntil: string }
  | ({ kind: 'event'; instruction: string; leaseUntil: string } & EventIdentity)
  | { kind: 'observe' | 'blocked' | 'denied' }

const REASONS = [
  'authorization',
  'model_unavailable',
  'credit_exhausted',
  'budget_exceeded',
  'billing_unavailable',
  'declined',
] as const
type ProviderReason = (typeof REASONS)[number] | 'provider_failed' | 'cancelled'
type OutputRejection = 'output_invalid' | 'output_missing'

type Observation =
  | {
      kind: 'created'
      operationId: string
      providerSessionId: string
      environmentId: string
      model: string
      sessionLimitCents: number
      networkAccess: 'disabled'
      requestId: string | null
    }
  | { kind: 'createRejected'; operationId: string; reason: ProviderReason; requestId: string | null }
  | { kind: 'environment'; providerSessionId: string; environmentId: string; status: EnvironmentStatus }
  | ({ kind: 'eventAccepted'; requestId: string | null } & EventIdentity)
  | ({ kind: 'eventRejected'; reason: ProviderReason; requestId: string | null } & EventIdentity)
  | ({ kind: 'root'; rootId: string; status: RootStatus; usage: ProviderUsage | null } & EventIdentity)
  | ({
      kind: 'settle'
      rootId: string
      status: 'completed' | 'failed' | 'cancelled'
      reply?: string
      reason?: ProviderReason
    } & EventIdentity)
  | ({ kind: 'outputRejected'; rootId: string; reason: OutputRejection } & EventIdentity)
  | { kind: 'defer'; delaySeconds: number }

export interface ManagedExploreDispatchStore {
  claimManagedExploreDispatch(scope: ManagedExploreDispatchScope): Promise<ManagedExploreDispatchLease | null>

  // Only the caller that commits a new possible-send fence receives a send
  // authorization. Repeat calls or claims must observe the original effect.
  prepareManagedExploreDispatch(identity: ManagedExploreDispatchIdentity, action: Action): Promise<Prepared>
  recordManagedExploreDispatch(identity: ManagedExploreDispatchIdentity, observation: Observation): Promise<void>
}

export interface ManagedExploreDispatchContinuationStore extends ManagedExploreDispatchStore {
  readManagedExploreDispatch(identity: ManagedExploreDispatchIdentity): Promise<ManagedExploreDispatchLease>
}

type Output = {
  event: EventIdentity
  root: ManagedExploreRootTurn
  environmentId: string
  rootRequestId: string | null
  outputRequestId: string | null
} & ({ kind: 'directions'; text: string } | { kind: 'prototype' | 'revision'; artifact: ManagedExplorePrototype })

export type ManagedExploreRetentionCallback = (
  identity: ManagedExploreDispatchIdentity,
  output: Output,
) => Promise<'settled' | 'pending' | 'invalid' | 'missing'>

type Provider = Pick<
  ManagedExploreProvider,
  | 'createSession'
  | 'findSessionByOperation'
  | 'readSession'
  | 'readEnvironment'
  | 'submitText'
  | 'listRootTurns'
  | 'readRootTurn'
  | 'readTurnInputDigest'
  | 'readTurnText'
  | 'downloadPrototype'
>

type Step = 'idle' | 'waiting' | 'unknown' | 'progressed' | 'settled' | 'retention_pending'
type ProviderResult<T> = { value: T; requestId: string | null }

interface Dependencies {
  provider: Provider
  store: ManagedExploreDispatchStore
  instructions: string
  // The receiver must validate and finalize the retained output atomically
  // under this lease before returning settled. Missing retention leaves the job pending.
  retainOutput?: ManagedExploreRetentionCallback
  /** The local outbound gate closes immediately when the worker starts draining. */
  maySend?: () => boolean
  now?: () => number
}

function providerReason(value: unknown): ProviderReason {
  return REASONS.find((reason) => reason === value) ?? 'provider_failed'
}

function isSettled(root: ManagedExploreRootTurn): boolean {
  return root.status === 'completed' || root.status === 'failed' || root.status === 'cancelled'
}

function isEnvironmentReady(status: EnvironmentStatus | null): boolean {
  return status === 'ready' || status === 'connected'
}

function hashInput(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function eventIdentity(claim: ManagedExploreDispatchLease): EventIdentity | null {
  if (!claim.providerSessionId || !claim.payloadSha256) return null
  return {
    providerSessionId: claim.providerSessionId,
    submissionId: claim.submissionId,
    payloadSha256: claim.payloadSha256,
    previousRootId: claim.previousRootId,
  }
}

function preparedEventMatches(
  prepared: EventIdentity & { instruction: string },
  claim: ManagedExploreDispatchLease,
): boolean {
  return (
    prepared.providerSessionId === claim.providerSessionId &&
    prepared.submissionId === claim.submissionId &&
    prepared.previousRootId === claim.previousRootId &&
    prepared.payloadSha256 === hashInput(prepared.instruction)
  )
}

function sendRejection(error: unknown): { reason: ProviderReason; requestId: string | null } | null {
  if (!(error instanceof ManagedExploreProviderError) || error.disposition !== 'terminal') return null
  return { reason: providerReason(error.code), requestId: error.requestId }
}

function outputRejection(error: unknown): OutputRejection | null {
  if (!(error instanceof ManagedExploreProviderError)) return null
  if (error.code === 'artifact_missing') return 'output_missing'
  if (error.disposition === 'terminal' && (error.code === 'artifact_invalid' || error.code === 'invalid_response')) {
    return 'output_invalid'
  }
  return null
}

class ExploreStep {
  readonly #claim: ManagedExploreDispatchLease
  readonly #dependencies: Dependencies

  constructor(claim: ManagedExploreDispatchLease, dependencies: Dependencies) {
    this.#claim = claim
    this.#dependencies = dependencies
  }

  get #provider() {
    return this.#dependencies.provider
  }

  #now(): number {
    return (this.#dependencies.now ?? Date.now)()
  }

  #leaseCurrent(leaseUntil = this.#claim.leaseUntil): boolean {
    return Date.parse(leaseUntil) > this.#now()
  }

  async #record(observation: Observation, result: Step): Promise<Step> {
    if (!this.#leaseCurrent()) return 'waiting'
    await this.#dependencies.store.recordManagedExploreDispatch(this.#claim, observation)
    return result
  }

  #defer(result: 'waiting' | 'unknown' | 'retention_pending'): Promise<Step> {
    return this.#record({ kind: 'defer', delaySeconds: DEFER_SECONDS }, result)
  }

  async #read<T>(action: () => Promise<ProviderResult<T>>): Promise<ProviderResult<T> | null> {
    // A failed read only defers reconciliation. A store or retention error
    // propagates independently and the fence remains durable.
    try {
      return await action()
    } catch {
      return null
    }
  }

  #sameSession(session: ManagedExploreSession): boolean {
    const claim = this.#claim
    return (
      session.operationId === claim.createOperationId &&
      session.model === claim.model &&
      session.spendControl?.limitCents === claim.sessionLimitCents
    )
  }

  #recordSession({ value, requestId }: ProviderResult<ManagedExploreSession>): Promise<Step> {
    if (!this.#sameSession(value)) return this.#defer('unknown')
    return this.#record(
      {
        kind: 'created',
        operationId: this.#claim.createOperationId,
        providerSessionId: value.id,
        environmentId: value.environmentId,
        model: value.model,
        sessionLimitCents: this.#claim.sessionLimitCents,
        networkAccess: 'disabled',
        requestId,
      },
      'progressed',
    )
  }

  async #recoverSession(): Promise<Step> {
    const operationId = this.#claim.createOperationId
    const found = await this.#read(() => this.#provider.findSessionByOperation(operationId))
    if (!found?.value) return this.#defer('unknown')
    const listed = found.value
    const exact = await this.#read(() => this.#provider.readSession(listed.id))
    if (!exact || exact.value.id !== listed.id || exact.value.environmentId !== listed.environmentId) {
      return this.#defer('unknown')
    }
    return this.#recordSession(exact)
  }

  #maySend(): boolean {
    return this.#dependencies.maySend?.() ?? true
  }

  async #create(): Promise<Step> {
    if (!this.#maySend()) return this.#defer('waiting')
    const claim = this.#claim
    const prepared = await this.#dependencies.store.prepareManagedExploreDispatch(claim, { kind: 'create' })
    if (prepared.kind !== 'create') return 'waiting'
    if (!this.#leaseCurrent(prepared.leaseUntil)) return 'waiting'
    if (
      prepared.operationId !== claim.createOperationId ||
      prepared.model !== claim.model ||
      prepared.sessionLimitCents !== claim.sessionLimitCents
    ) {
      return this.#defer('unknown')
    }
    if (!this.#maySend()) return this.#defer('unknown')
    let receipt: ProviderResult<ManagedExploreSession>
    try {
      receipt = await this.#provider.createSession({
        operationId: prepared.operationId,
        instructions: this.#dependencies.instructions,
        model: prepared.model,
        sessionLimitCents: prepared.sessionLimitCents,
      })
    } catch (error: unknown) {
      const rejected = sendRejection(error)
      if (!rejected) return this.#defer('unknown')
      return this.#record({ kind: 'createRejected', operationId: prepared.operationId, ...rejected }, 'settled')
    }
    return this.#recordSession(receipt)
  }

  async #ready(providerSessionId: string, environmentId: string): Promise<Step | null> {
    const session = await this.#read(() => this.#provider.readSession(providerSessionId))
    if (!session) return this.#defer('unknown')
    const { value } = session
    if (!this.#sameSession(value) || value.id !== providerSessionId || value.environmentId !== environmentId) {
      return this.#defer('unknown')
    }
    if (value.status !== 'idle') return this.#defer('waiting')
    const environment = await this.#read(() => this.#provider.readEnvironment(environmentId))
    if (!environment || environment.value.id !== environmentId) return this.#defer('unknown')
    const { status } = environment.value
    if (status !== this.#claim.environmentStatus) {
      const result = status === 'expired' || status === 'failed' ? 'settled' : 'progressed'
      return this.#record({ kind: 'environment', providerSessionId, environmentId, status }, result)
    }
    return isEnvironmentReady(status) ? null : this.#defer('waiting')
  }

  async #readExactRoot(
    providerSessionId: string,
    rootId: string,
  ): Promise<ProviderResult<ManagedExploreRootTurn> | null> {
    const receipt = await this.#read(() => this.#provider.readRootTurn(providerSessionId, rootId))
    if (receipt?.value.id !== rootId || receipt.value.sessionId !== providerSessionId) return null
    return receipt
  }

  async #predecessor(providerSessionId: string): Promise<Step | null> {
    const previous = this.#claim.previousRootId
    if (previous) {
      const exact = await this.#readExactRoot(providerSessionId, previous)
      if (!exact) return this.#defer('unknown')
      if (!isSettled(exact.value)) return this.#defer('waiting')
    }
    const newer = await this.#read(() => this.#provider.listRootTurns(providerSessionId, previous ?? undefined))
    return !newer || newer.value.length ? this.#defer('unknown') : null
  }

  async #send(providerSessionId: string, environmentId: string): Promise<Step> {
    const ready = await this.#ready(providerSessionId, environmentId)
    if (ready) return ready
    const blocked = await this.#predecessor(providerSessionId)
    if (blocked) return blocked
    if (!this.#maySend()) return this.#defer('waiting')
    const claim = this.#claim
    const prepared = await this.#dependencies.store.prepareManagedExploreDispatch(claim, {
      kind: 'event',
      predecessorRootId: claim.previousRootId,
    })
    if (prepared.kind !== 'event') return 'waiting'
    if (!this.#leaseCurrent(prepared.leaseUntil)) return 'waiting'
    if (!preparedEventMatches(prepared, claim)) return this.#defer('unknown')
    const { providerSessionId: sessionId, submissionId, payloadSha256, previousRootId, instruction } = prepared
    const identity = { providerSessionId: sessionId, submissionId, payloadSha256, previousRootId }
    if (!this.#maySend()) return this.#defer('unknown')
    let receipt: ProviderResult<'accepted'>
    try {
      receipt = await this.#provider.submitText({ sessionId, idempotencyKey: submissionId, text: instruction })
    } catch (error: unknown) {
      const rejected = sendRejection(error)
      if (!rejected) return this.#defer('unknown')
      return this.#record({ kind: 'eventRejected', ...identity, ...rejected }, 'settled')
    }
    return this.#record({ kind: 'eventAccepted', ...identity, requestId: receipt.requestId }, 'progressed')
  }

  async #rootId(event: EventIdentity): Promise<string | null> {
    if (this.#claim.rootId) return this.#claim.rootId
    const found = await this.#read(() =>
      this.#provider.listRootTurns(event.providerSessionId, event.previousRootId ?? undefined),
    )
    const candidate = found?.value[0]
    if (found?.value.length !== 1 || candidate?.sessionId !== event.providerSessionId) return null
    return candidate.id
  }

  async #observe(event: EventIdentity, environmentId: string): Promise<Step> {
    const rootId = await this.#rootId(event)
    if (!rootId || rootId === event.previousRootId) return this.#defer('unknown')
    const exact = await this.#readExactRoot(event.providerSessionId, rootId)
    if (!exact) return this.#defer('unknown')
    const root = exact.value
    const input = await this.#read(() => this.#provider.readTurnInputDigest(root.sessionId, root.id))
    if (input?.value !== event.payloadSha256) return this.#defer('unknown')
    if (this.#claim.rootStatus !== root.status || this.#claim.rootId !== root.id) {
      return this.#record({ kind: 'root', ...event, rootId, status: root.status, usage: root.usage }, 'progressed')
    }
    if (root.status === 'cancelled') {
      return this.#record({ kind: 'settle', ...event, rootId, status: 'cancelled', reason: 'cancelled' }, 'settled')
    }
    if (root.status === 'failed') {
      return this.#record(
        { kind: 'settle', ...event, rootId, status: 'failed', reason: providerReason(root.failure) },
        'settled',
      )
    }
    if (root.status !== 'completed') return this.#defer('waiting')
    return this.#collect(event, exact, environmentId)
  }

  async #readOutput<T>(
    action: () => Promise<ProviderResult<T>>,
  ): Promise<{ receipt: ProviderResult<T>; reason: null } | { receipt: null; reason: OutputRejection | null }> {
    try {
      return { receipt: await action(), reason: null }
    } catch (error: unknown) {
      return { receipt: null, reason: outputRejection(error) }
    }
  }

  #rejectOutput(event: EventIdentity, rootId: string, reason: OutputRejection | null): Promise<Step> {
    if (!reason) return this.#defer('unknown')
    if (reason === 'output_missing') {
      // The provider timestamp may skew or predate our first opportunity to read output.
      const recorded = this.#claim.rootCompletedSeenAt
      const seenAt = recorded ? Date.parse(recorded) : NaN
      if (!Number.isFinite(seenAt) || this.#now() - seenAt < OUTPUT_READBACK_WINDOW_MS) {
        return this.#defer('unknown')
      }
    }
    return this.#record({ kind: 'outputRejected', ...event, rootId, reason }, 'settled')
  }

  #collect(event: EventIdentity, root: ProviderResult<ManagedExploreRootTurn>, environmentId: string): Promise<Step> {
    const { turnKind } = this.#claim
    return turnKind === 'text' || turnKind === 'directions'
      ? this.#collectText(event, root, environmentId, turnKind)
      : this.#collectArtifact(event, root, environmentId, turnKind)
  }

  async #collectText(
    event: EventIdentity,
    { value: root, requestId: rootRequestId }: ProviderResult<ManagedExploreRootTurn>,
    environmentId: string,
    turnKind: 'text' | 'directions',
  ): Promise<Step> {
    const { receipt, reason } = await this.#readOutput(() => this.#provider.readTurnText(root.sessionId, root.id))
    if (!receipt) return this.#rejectOutput(event, root.id, reason)
    const { value: text, requestId: outputRequestId } = receipt
    if (!text?.trim()) return this.#rejectOutput(event, root.id, 'output_missing')
    if (turnKind === 'text') {
      if (Buffer.byteLength(text) > REPLY_MAX_BYTES) return this.#rejectOutput(event, root.id, 'output_invalid')
      return this.#record({ kind: 'settle', ...event, rootId: root.id, status: 'completed', reply: text }, 'settled')
    }
    return this.#retain({ kind: 'directions', event, root, environmentId, rootRequestId, outputRequestId, text })
  }

  async #collectArtifact(
    event: EventIdentity,
    { value: root, requestId: rootRequestId }: ProviderResult<ManagedExploreRootTurn>,
    environmentId: string,
    turnKind: 'prototype' | 'revision',
  ): Promise<Step> {
    const { receipt, reason } = await this.#readOutput(() =>
      this.#provider.downloadPrototype(root.sessionId, root.id, environmentId),
    )
    if (!receipt) return this.#rejectOutput(event, root.id, reason)
    const { value: artifact, requestId: outputRequestId } = receipt
    if (
      artifact.turnId !== root.id ||
      artifact.sessionId !== root.sessionId ||
      artifact.environmentId !== environmentId
    ) {
      return this.#defer('unknown')
    }
    return this.#retain({ kind: turnKind, event, root, environmentId, rootRequestId, outputRequestId, artifact })
  }

  async #retain(output: Output): Promise<Step> {
    const retain = this.#dependencies.retainOutput
    if (!retain || !this.#leaseCurrent()) return this.#defer('retention_pending')
    const retained = await retain(this.#claim, output)
    if (retained === 'invalid' || retained === 'missing') {
      return this.#rejectOutput(
        output.event,
        output.root.id,
        retained === 'invalid' ? 'output_invalid' : 'output_missing',
      )
    }
    return retained === 'settled' ? 'settled' : this.#defer('retention_pending')
  }

  run(allowSend: boolean): Promise<Step> {
    const claim = this.#claim
    if (!this.#leaseCurrent()) return Promise.resolve('waiting')
    const canSend = allowSend && claim.allowSend
    const { providerSessionId, environmentId } = claim
    if (!providerSessionId && claim.createPossibleAt) return this.#recoverSession()
    if (!providerSessionId) return canSend ? this.#create() : this.#defer('waiting')
    if (!environmentId) return this.#defer('unknown')
    if (!claim.eventPossibleAt) return canSend ? this.#send(providerSessionId, environmentId) : this.#defer('waiting')
    const event = eventIdentity(claim)
    return event ? this.#observe(event, environmentId) : this.#defer('unknown')
  }
}

export async function dispatchManagedExploreOnce(
  scope: ManagedExploreDispatchScope,
  dependencies: Dependencies,
): Promise<Step> {
  const claim = await dependencies.store.claimManagedExploreDispatch(scope)
  if (!claim) return 'idle'
  return new ExploreStep(claim, dependencies).run(scope.allowSend)
}

function sameLease(left: ManagedExploreDispatchIdentity, right: ManagedExploreDispatchIdentity): boolean {
  return left.projectId === right.projectId && left.turnId === right.turnId && left.leaseToken === right.leaseToken
}

/** A pass claims one job and continues only from committed progress on the same lease. */
export async function dispatchManagedExplorePass(
  scope: ManagedExploreDispatchScope,
  dependencies: Dependencies & { store: ManagedExploreDispatchContinuationStore },
): Promise<Step> {
  const { store, now = Date.now } = dependencies
  const first = await store.claimManagedExploreDispatch(scope)
  if (!first) return 'idle'
  const { projectId, turnId, leaseToken } = first
  const identity = { projectId, turnId, leaseToken }
  const allowSend = scope.allowSend && first.allowSend
  let claim = first
  for (let steps = 1; steps <= MAX_PASS_STEPS; steps += 1) {
    const result = await new ExploreStep(claim, dependencies).run(allowSend)
    if (result !== 'progressed') return result
    if (Date.parse(claim.leaseUntil) <= now()) return 'waiting'
    if (steps === MAX_PASS_STEPS) break
    const refreshed = await store.readManagedExploreDispatch(identity)
    if (!sameLease(identity, refreshed)) return 'waiting'
    claim = refreshed
  }
  // Progress records keep the lease. Yield it explicitly at the step limit.
  await store.recordManagedExploreDispatch(identity, { kind: 'defer', delaySeconds: DEFER_SECONDS })
  return 'progressed'
}
