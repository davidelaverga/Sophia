/**
 * The owner-host channel (INC01-CC-003 S1a, migration 0093; docs/plans/owner-host-transport.md): what passes between
 * Sophia's worker and an owner's own host, and how each side checks it. The worker never calls the owner's gateway: it
 * queues an EXCHANGE (a send, reconcile or observe of one 0092 operation) and reads its outcome. The host polls for
 * exchanges with a capability it generated itself, asks for GO immediately before its gateway acts on a send, and
 * answers. Both sides reach the channel through these interfaces only: in this slice the database functions, later a
 * route. Nothing here grants authority; the host capability authenticates the channel and nothing else.
 *
 * Source authority (INC01-CC-005, 0096): an exchange carries Sophia's envelope exactly, and a v2 envelope is
 * content-free. A v2 send's instruction never sits in an exchange or a poll: it is returned only with a GO that Sophia
 * granted after its last recheck (`GoResult.payload`), and the host's gateway checks it against the envelope's digest.
 * @module @sophia/coordination/owner-host-channel
 */
import { createHash, randomBytes } from 'node:crypto'
import {
  checkEnvelope,
  digestOf,
  type NativeIdentity,
  type RunnerAnswer,
  type RunnerEnvelope,
  type RunnerOperationKind,
  type RunObservation,
} from './runner-port.ts'
import { checkReport } from './runner-model-report.ts'
import { runState } from './t3-port-mapping.ts'

export const OWNER_HOST_PROTOCOL_VERSION = 1
export const EXCHANGE_KINDS = ['send', 'reconcile', 'observe'] as const
export type ExchangeKind = (typeof EXCHANGE_KINDS)[number]
/** The database's bounds (0093): an exchange's deadline, in milliseconds. */
export const EXCHANGE_DEADLINE_MIN_MS = 1000
export const EXCHANGE_DEADLINE_MAX_MS = 120_000
/** At most this many bytes of JSON in a request or an answer (0093 stores at most 64 KiB). */
export const EXCHANGE_BYTES_MAX = 65_536
/** A pairing lives at most this long (0093). */
export const PAIRING_TTL_MAX_SECONDS = 600

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const PIN = /^[0-9a-f]{40}$/
const HEX64 = /^[0-9a-f]{64}$/
/** T3's request namespace for an outside agent at the pin: `client:<auth session id>` (McpOAuth.ts). */
const NAMESPACE = /^client:[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
/** A secret: 32 random bytes, base64url without padding. */
const SECRET = /^[A-Za-z0-9_-]{43}$/

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const matches = (v: unknown, p: RegExp): v is string => typeof v === 'string' && p.test(v)
const sameKeys = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).toSorted().join(',') === keys.toSorted().join(',')

// ---- secrets: a pairing code (made by Sophia, shown once) and a host capability (made on the host) ----

/** A fresh secret: 256 bits, base64url. Only its SHA-256 is ever stored or sent to Sophia's database. */
export const newSecret = (): string => randomBytes(32).toString('base64url')

export const isSecret = (v: unknown): v is string => matches(v, SECRET)

/** The SHA-256 of a secret's text: what 0093 stores and compares. Throws on anything that is not a secret. */
export function secretDigest(secret: string): Buffer {
  if (!isSecret(secret)) throw new Error('not a well-formed owner-host secret')
  return createHash('sha256').update(secret, 'utf8').digest()
}

// ---- hello: the host's identity, bound once at its first hello and never changed ----

export interface HostHello {
  readonly v: 1
  /** The durable id of the host's gateway journal (RunnerJournal header). */
  readonly journalId: string
  /** The T3 environment the host's MCP session is bound to. */
  readonly environmentRef: string
  readonly adapterPin: string
  readonly profileId: string
  readonly profileRevision: number
  readonly accountKey: string
  /**
   * T3's request namespace for this host's sign-in: declared in the host's configuration and persistent, never derived
   * from an MCP session id. A new T3 sign-in is a new namespace and needs a new host identity.
   */
  readonly t3Namespace: string
}

const HELLO_KEYS = [
  'v',
  'journalId',
  'environmentRef',
  'adapterPin',
  'profileId',
  'profileRevision',
  'accountKey',
  't3Namespace',
] as const

/** Why a hello is malformed, or null. Exactly the known keys. */
export function helloRefusal(v: unknown): string | null {
  if (!isRecord(v) || !sameKeys(v, HELLO_KEYS)) return 'a hello has exactly its known fields'
  if (v.v !== OWNER_HOST_PROTOCOL_VERSION) return 'unsupported hello version'
  if (!matches(v.journalId, UUID)) return 'journalId is not an id'
  if (!matches(v.adapterPin, PIN)) return 'adapterPin is not a pin'
  const badRef = (['environmentRef', 'profileId', 'accountKey'] as const).find((k) => !matches(v[k], REF))
  if (badRef) return `${badRef} is not a reference`
  if (!Number.isSafeInteger(v.profileRevision) || Number(v.profileRevision) <= 0) return 'profileRevision is not one'
  return matches(v.t3Namespace, NAMESPACE) ? null : 't3Namespace is not a T3 client namespace'
}

export type HelloResult =
  | { readonly result: 'ok'; readonly hostId: string; readonly state: string; readonly first: boolean }
  /** The hello differs from the bound identity: nothing is adopted and nothing is delivered until a matching one. */
  | { readonly result: 'conflict'; readonly hostId: string; readonly changed: readonly string[] }

// ---- exchanges ----

/** What an exchange carries: the operation's whole RunnerIdentity, and where it belongs. */
export interface ExchangeRequest {
  readonly v: 1
  readonly kind: ExchangeKind
  readonly journalId: string
  readonly projectId: string
  readonly operationId: string
  /** digestOf(envelope): the send digest. */
  readonly digest: string
  /** Sophia's own envelope for the operation (0092 owner_runner_envelope), exactly. */
  readonly envelope: RunnerEnvelope
}

export function exchangeRequest(kind: ExchangeKind, envelope: RunnerEnvelope, journalId: string): ExchangeRequest {
  return {
    v: OWNER_HOST_PROTOCOL_VERSION,
    kind,
    journalId,
    projectId: envelope.projectId,
    operationId: envelope.operationId,
    digest: digestOf(envelope),
    envelope,
  }
}

const REQUEST_KEYS = ['v', 'kind', 'journalId', 'projectId', 'operationId', 'digest', 'envelope'] as const

/** Why a request's own fields are malformed (keys, version, kind, ids, digest), or null. */
function requestFieldRefusal(v: unknown): string | null {
  if (!isRecord(v) || !sameKeys(v, REQUEST_KEYS)) return 'a request has exactly its known fields'
  if (v.v !== OWNER_HOST_PROTOCOL_VERSION) return 'unsupported request version'
  if (!(EXCHANGE_KINDS as readonly unknown[]).includes(v.kind)) return 'unknown exchange kind'
  if (![v.journalId, v.projectId, v.operationId].every((id) => matches(id, UUID)))
    return 'a request names its journal, project and operation by id'
  return matches(v.digest, HEX64) ? null : 'the digest is not a SHA-256'
}

/** A delivered request as the host checks it: its shape, its envelope, and that the digest binds the envelope. */
export function checkExchangeRequest(
  v: unknown,
): { ok: true; request: ExchangeRequest } | { ok: false; reason: string } {
  const refusal = requestFieldRefusal(v)
  if (refusal || !isRecord(v)) return { ok: false, reason: refusal ?? 'not a request' }
  const checked = checkEnvelope(v.envelope)
  if (!checked.ok) return { ok: false, reason: `the envelope is refused: ${checked.reason}` }
  const e = checked.envelope
  if (e.operationId !== v.operationId || e.projectId !== v.projectId)
    return { ok: false, reason: 'the envelope is of another operation' }
  if (digestOf(e) !== v.digest) return { ok: false, reason: 'the digest does not bind the envelope' }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every key and type was checked above
  return { ok: true, request: v as unknown as ExchangeRequest }
}

/** An exchange's key: a send is keyed by its operation (one per operation, ever); a read by a fresh id. */
export const sendKey = (operationId: string): string => `send:${operationId}`
export const readKey = (kind: 'reconcile' | 'observe', operationId: string, fresh: string): string =>
  `${kind}:${operationId}:${fresh}`

export type ExchangeState = 'queued' | 'delivered' | 'go_granted' | 'answered' | 'denied' | 'lapsed' | 'cancelled'

export type EnqueueResult =
  | { readonly result: 'queued' | 'existing'; readonly exchangeId: string; readonly state: ExchangeState }
  /** The same key with another payload. */
  | { readonly result: 'conflict'; readonly exchangeId: string }
  /** No host of the owner is bound to this journal and environment in a state that may take the exchange. */
  | { readonly result: 'no_host' }

export interface ExchangeView {
  readonly exchangeId: string
  readonly state: ExchangeState
  readonly goCount: number
  readonly answer: unknown
  readonly reason: string | null
  readonly deadlinePassed: boolean
}

export type SettleResult =
  | { readonly result: 'answered'; readonly answer: unknown }
  /** GO was granted and no answer came: a send may have happened. */
  | { readonly result: 'possible'; readonly reason: string }
  /** No GO was ever granted: the host's gateway was never allowed to act. */
  | { readonly result: 'not_sent'; readonly state: ExchangeState; readonly reason: string }

/** The worker's side of the channel (sophia_worker). */
export interface ExchangeStore {
  enqueue(input: {
    readonly ownerId: string
    readonly environmentRef: string
    readonly journalId: string
    readonly key: string
    readonly request: ExchangeRequest
    readonly deadlineMs: number
  }): Promise<EnqueueResult>
  exchange(ownerId: string, exchangeId: string): Promise<ExchangeView | null>
  /** Stop waiting: what was granted GO stays a possible send; what was not can no longer be sent. */
  settle(ownerId: string, exchangeId: string): Promise<SettleResult>
}

export interface Delivered {
  readonly exchangeId: string
  readonly kind: ExchangeKind
  readonly request: unknown
  readonly deadlineAt: string
}

/**
 * GO, or not. A granted GO for a v2 send carries its instruction (`payload`: the canonical text whose SHA-256 is the
 * envelope's payloadSha256), read by Sophia under the same recheck; a v1 send's GO carries none. A refusal never does.
 */
export type GoResult =
  | { readonly result: 'go'; readonly payload?: string }
  | { readonly result: 'denied'; readonly reason: string; readonly grantedBefore: boolean }

export type AnswerResult = { readonly result: 'ok' } | { readonly result: 'conflict' }

/** The host's side of the channel, authenticated by its capability. It authorizes nothing but the channel. */
export interface HostChannel {
  hello(hello: HostHello): Promise<HelloResult>
  poll(limit: number, redeliverSeconds: number): Promise<Delivered[]>
  /** Asked immediately before the gateway acts on a send. Rechecked every time; fail closed on anything but `go`. */
  go(exchangeId: string): Promise<GoResult>
  answer(exchangeId: string, answer: RunnerAnswer | RunObservation): Promise<AnswerResult>
}

// ---- answers, as the worker checks what a host said ----

const DELIVERIES = new Set(['started', 'queued', 'stop_requested', 'no_active_run', 'already_ended'])
const text = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max

function identityOf(v: unknown): NativeIdentity | null | undefined {
  if (v === null) return null
  if (!isRecord(v) || !sameKeys(v, ['namespace', 'commandId', 'messageId', 'threadId'])) return undefined
  const ok =
    text(v.namespace, 400) &&
    text(v.commandId, 1000) &&
    text(v.threadId, 1000) &&
    (v.messageId === null || text(v.messageId, 1000))
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every key and type was checked above
  return ok ? (v as unknown as NativeIdentity) : undefined
}

type Fields = Record<string, unknown>
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- each checker below checks every key and type first
const asAnswer = (v: Fields): RunnerAnswer => v as unknown as RunnerAnswer

const received = (v: Fields): RunnerAnswer | null =>
  sameKeys(v, ['kind', 'identity', 'runId', 'delivery']) &&
  identityOf(v.identity) &&
  (v.runId === null || text(v.runId, 400)) &&
  DELIVERIES.has(String(v.delivery))
    ? asAnswer(v)
    : null

const rejected = (v: Fields): RunnerAnswer | null =>
  sameKeys(v, ['kind', 'identity', 'code', 'reason']) && identityOf(v.identity) && text(v.code, 100) && text(v.reason)
    ? asAnswer(v)
    : null

const reasonOnly =
  (kind: 'refused' | 'conflict') =>
  (v: Fields): RunnerAnswer | null =>
    sameKeys(v, ['kind', 'reason']) && text(v.reason) ? { kind, reason: v.reason } : null

function unknownAnswer(v: Fields): RunnerAnswer | null {
  const violation = 'violation' in v
  const id = identityOf(v.identity)
  const keys = violation ? ['kind', 'identity', 'reason', 'violation'] : ['kind', 'identity', 'reason']
  if (!sameKeys(v, keys) || id === undefined || !text(v.reason) || (violation && v.violation !== true)) return null
  return violation
    ? { kind: 'unknown', identity: id, reason: v.reason, violation: true }
    : { kind: 'unknown', identity: id, reason: v.reason }
}

function settledAnswer(v: Fields): RunnerAnswer | null {
  const id = identityOf(v.identity)
  return sameKeys(v, ['kind', 'identity', 'reason']) && id !== undefined && text(v.reason)
    ? { kind: 'settled', identity: id, reason: v.reason }
    : null
}

const ANSWER_CHECKS: Readonly<Record<RunnerAnswer['kind'], (v: Fields) => RunnerAnswer | null>> = {
  received,
  rejected,
  refused: reasonOnly('refused'),
  conflict: reasonOnly('conflict'),
  unknown: unknownAnswer,
  settled: settledAnswer,
}

/** A RunnerAnswer of exactly its kind's fields, or null. `not_sent` and any other kind are not answers. */
export function checkRunnerAnswer(v: unknown): RunnerAnswer | null {
  if (!isRecord(v) || typeof v.kind !== 'string' || !Object.hasOwn(ANSWER_CHECKS, v.kind)) return null
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an own key of ANSWER_CHECKS, checked above
  return ANSWER_CHECKS[v.kind as RunnerAnswer['kind']](v)
}

const STOP_DELIVERIES = new Set(['stop_requested', 'no_active_run', 'already_ended'])
/** A run identity: a non-empty, non-blank string. Nothing else names a run. */
const isRunId = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 400

/** Why a `received` answer does not prove what its operation needs, or null when it does. */
function receiptGap(kind: RunnerEnvelope['kind'], a: Extract<RunnerAnswer, { kind: 'received' }>): string | null {
  if (kind === 'input') {
    if (!isRunId(a.runId)) return 'an input receipt names no valid run'
    return a.delivery === 'queued' || a.delivery === 'started' ? null : `an input cannot be ${a.delivery}`
  }
  if (kind === 'stop' && !STOP_DELIVERIES.has(a.delivery)) return `a stop cannot be ${a.delivery}`
  if (kind === 'create') {
    // Sophia always launches with a message, so a create's receipt names its run, as the accepted backend requires
    // (runner-gateway.ts receiptError). r4, CC003-S1A-STUDY-R2-F01.
    if (!isRunId(a.runId)) return 'a create receipt names no valid run'
    return a.delivery === 'started' ? null : `a create cannot be ${a.delivery}`
  }
  // Only a stop may acknowledge with no run (nothing was running); never with a blank or malformed one.
  return a.runId === null || isRunId(a.runId) ? null : 'its run identity is malformed'
}

/**
 * The answer, unless it is a `received` that does not prove what its operation needs (r2, CC003-S1A-STUDY-F01). Then it
 * is `unknown` with the same identity: a send may have happened, and it is reconciled by its original identity. The
 * answer is never turned into refused, rejected or "not sent", and no run is invented. A GO or a well-formed identity
 * is not proof of native acceptance.
 */
export function checkReceipt(envelope: RunnerEnvelope, answer: RunnerAnswer): RunnerAnswer {
  if (answer.kind !== 'received') return answer
  const gap = receiptGap(envelope.kind, answer)
  if (gap === null) return answer
  return { kind: 'unknown', identity: answer.identity, reason: `no receipt: ${gap}; a send may have happened` }
}

/** A run status as the mapping reads it (t3-port-mapping runState): terminal, still going, or no evidence. */
function statusState(status: string): 'terminal' | 'running' | 'unknown' {
  const read = {
    threadId: '',
    activeRunId: null,
    runCount: 1,
    runs: new Map([['run', status]]),
    messages: new Map(),
    nextPosition: null,
  }
  return runState(read, 'run')
}

/**
 * An observation that proves what ITS operation needs, or null (r5, HOST-S1A-R4-F01). It is the gateway's own vocabulary
 * per operation (runner-gateway observed), never a host's free choice:
 *   stop          `no_active_run` only: settlement proven by a complete, decoded read of the exact thread. A run
 *                 summary, whatever its status, is not that proof.
 *   create, input its own recorded run: a status the mapping knows, with `terminal` exactly as the mapping reads it.
 *                 Absence of an active run in the thread is not its run's state. INC04-S03b B2 (0108): it may carry
 *                 one more key, `reportedModels`, checked on its own (runner-model-report checkReport): a malformed
 *                 or oversized report becomes `malformed` with no content and never changes the checked status.
 *   any           `unknown`, with a reason.
 * A malformed, contradictory or operation-mismatched observation is null: the caller keeps it unknown. Nothing is
 * inferred from it, no native state is asserted, and the raw answer stays the exchange's evidence.
 */
export function checkObservation(v: unknown, kind: RunnerOperationKind): RunObservation | null {
  if (!isRecord(v)) return null
  if (v.kind === 'unknown')
    return sameKeys(v, ['kind', 'reason']) && text(v.reason) ? { kind: 'unknown', reason: v.reason } : null
  if (kind === 'stop') return v.kind === 'no_active_run' && sameKeys(v, ['kind']) ? { kind: 'no_active_run' } : null
  return ownRun(v)
}

/** A create's or input's own run: a status the mapping knows, with `terminal` exactly as the mapping reads it. */
function ownRun(v: Fields): RunObservation | null {
  const reported = Object.hasOwn(v, 'reportedModels')
  if (v.kind !== 'run' || !sameKeys(v, ['kind', 'status', 'terminal', ...(reported ? ['reportedModels'] : [])]))
    return null
  if (!text(v.status, 40) || typeof v.terminal !== 'boolean') return null
  const state = statusState(v.status)
  if (state === 'unknown' || (state === 'terminal') !== v.terminal) return null
  const run = { kind: 'run', status: v.status, terminal: v.terminal } as const
  return reported ? { ...run, reportedModels: checkReport(v.reportedModels) } : run
}

/** A short reason with no secret-shaped text: secrets, bearer tokens and long opaque runs are masked. */
export function redact(reason: string, max = 300): string {
  return reason
    .replace(/bearer\s+\S+/gi, 'bearer [redacted]')
    .replace(/[A-Za-z0-9_\-+/=.]{32,}/g, '[redacted]')
    .slice(0, max)
}
