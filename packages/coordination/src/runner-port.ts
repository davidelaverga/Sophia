/**
 * The one SophiaRunnerPort (SOPHIA-INC-2026-11 contract C02; docs/plans/owner-runner-operations.md): what Sophia sends
 * an owner's native-runner gateway and what the gateway may answer. Sophia owns admission and current authority; the
 * gateway owns its journal and the native call. Nothing here grants authority: an envelope is the frozen result of
 * Sophia's admission and its recheck at send, and the gateway still checks it against its own owner profile.
 *
 * C02 operation -> this port:
 *   create_or_attach    send(kind 'create')            submit_input   send(kind 'input', always queued)
 *   request_control     send(kind 'stop') only          reconcile_operation  reconcile()
 *   read_execution / collect_result  observe() (run status only; no transcript)
 *   qualify_instance    not a port call: an operator record after a real owner-host qualification (INC01-CC-003)
 *   resolve_permission  unsupported (T3's t3_pending_request answers user_input questions only, never approvals)
 * Hold, Resume, permission approval and question answers are refused before any write (UNSUPPORTED_RUNNER_KINDS).
 * @module @sophia/coordination/runner-port
 */
import { createHash } from 'node:crypto'
import { canonicalJson } from './canonical.ts'

export const RUNNER_PROTOCOL_VERSION = 1
export const RUNNER_OPERATION_KINDS = ['create', 'input', 'stop'] as const
export type RunnerOperationKind = (typeof RUNNER_OPERATION_KINDS)[number]
/** Named, so a request for them is refused as unsupported rather than as malformed, and never emulated. */
export const UNSUPPORTED_RUNNER_KINDS = ['hold', 'resume', 'resolve_permission', 'answer_question'] as const
export const RUNNER_MESSAGE_MAX = 8000
export const RUNNER_TITLE_MAX = 120

/** What Sophia froze at admission and rechecked at send. Every field is from Sophia's records, none from a request. */
export interface RunnerEnvelope {
  readonly v: 1
  /** Sophia's operation id: global, so a key can never collide across projects in one native namespace. */
  readonly operationId: string
  readonly kind: RunnerOperationKind
  readonly projectId: string
  readonly ownerId: string
  readonly resourceId: string
  readonly bindingId: string
  readonly goalId: string
  readonly qualificationId: string
  readonly qualificationRevision: number
  readonly adapterPin: string
  readonly environmentRef: string
  readonly nativeProjectRef: string
  readonly profileId: string
  readonly profileRevision: number
  readonly accountKey: string
  readonly authorityEpoch: number
  /** create and input: the owner's text. stop: null. */
  readonly message: string | null
  /** create: the native thread's title. Otherwise null. */
  readonly title: string | null
  /** input and stop: the create operation whose native thread they target. create: null. */
  readonly targetOperationId: string | null
  /** input and stop: that thread, as its create operation's receipt recorded it. create: null. */
  readonly nativeThreadId: string | null
}

/** What a native receipt said was done. `received` is never accepted, applied or verified. */
export type RunnerDelivery = 'started' | 'queued' | 'stop_requested' | 'no_active_run' | 'already_ended'

/** The identities a native call carries, derived before it is made and kept with the operation. */
export interface NativeIdentity {
  readonly namespace: string
  readonly commandId: string
  /** The message a create or input carries; null for a stop. */
  readonly messageId: string | null
  /** The thread a create makes, or the one an input or stop targets. */
  readonly threadId: string
}

export type RunnerAnswer =
  | {
      readonly kind: 'received'
      readonly identity: NativeIdentity
      readonly runId: string | null
      readonly delivery: RunnerDelivery
    }
  /** A typed native refusal before any effect: nothing was accepted. */
  | { readonly kind: 'rejected'; readonly identity: NativeIdentity; readonly code: string; readonly reason: string }
  /** The gateway refused before journaling a possible send (scope, profile, shape, digest): nothing was sent. */
  | { readonly kind: 'refused'; readonly reason: string }
  /** The same operation id was journaled with another digest: a coordination error, nothing sent. */
  | { readonly kind: 'conflict'; readonly reason: string }
  /**
   * A send may have happened; nothing proves either way. Its identities, when derived, are the originals. `violation`:
   * an effect did happen, but not as admitted (a steered or restarted delivery when queue was asked); it stays unknown
   * for an operator and is never turned into a receipt by a later read.
   */
  | {
      readonly kind: 'unknown'
      readonly identity: NativeIdentity | null
      readonly reason: string
      readonly violation?: true
    }
  /**
   * Reconcile of a stop only: settlement PROVEN by a complete, decoded read of the exact thread (no active and no
   * unsettled run). Whether this request was delivered stays unproven.
   */
  | { readonly kind: 'settled'; readonly identity: NativeIdentity | null; readonly reason: string }

/** An observation: `terminal` and `no_active_run` only from a complete, decoded read of the exact thread (R1-F04). */
export type RunObservation =
  | { readonly kind: 'run'; readonly status: string; readonly terminal: boolean }
  | { readonly kind: 'no_active_run' }
  | { readonly kind: 'unknown'; readonly reason: string }

/**
 * What reconcile and observe are asked about: the operation's whole envelope, its send digest, and the journal Sophia
 * bound it to at prepare-send (r2, R1-F01). A gateway answers only for an envelope within its own profile, journaled in
 * THAT journal under that digest; for anything else, including a replaced or emptied journal, it says unknown.
 * No answer proves that a possibly-sent operation was not sent (r3, R2-F01): a journal's id names the file, not the
 * completeness of its history, so there is no `not_sent` answer at all.
 */
export interface RunnerIdentity {
  readonly envelope: RunnerEnvelope
  readonly digest: string
  readonly journalId: string
}

/** The single runner port. Implemented by the owner-host gateway (runner-gateway.ts); tests inject its transport. */
export interface SophiaRunnerPort {
  /** The durable identity of the journal this gateway writes; Sophia records it before the send. */
  readonly journalId: string
  /** Send once, through the journal Sophia bound the operation to (`journalId`); another journal answers unknown. */
  send(envelope: RunnerEnvelope, digest: string, journalId: string): Promise<RunnerAnswer>
  reconcile(identity: RunnerIdentity): Promise<RunnerAnswer>
  observe(identity: RunnerIdentity): Promise<RunObservation>
}

/** SHA-256 over the canonical JSON of a value: Sophia's admission digest and the envelope's send digest. */
export function digestOf(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const PIN = /^[0-9a-f]{40}$/
const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const KEYS: readonly (keyof RunnerEnvelope)[] = [
  'v',
  'operationId',
  'kind',
  'projectId',
  'ownerId',
  'resourceId',
  'bindingId',
  'goalId',
  'qualificationId',
  'qualificationRevision',
  'adapterPin',
  'environmentRef',
  'nativeProjectRef',
  'profileId',
  'profileRevision',
  'accountKey',
  'authorityEpoch',
  'message',
  'title',
  'targetOperationId',
  'nativeThreadId',
]

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isRevision = (v: unknown): v is number => Number.isSafeInteger(v) && typeof v === 'number' && v > 0
const isText = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max && !v.includes('\u0000')

const isKind = (v: unknown): v is RunnerOperationKind =>
  typeof v === 'string' && (RUNNER_OPERATION_KINDS as readonly string[]).includes(v)
const matches = (v: unknown, pattern: RegExp): boolean => typeof v === 'string' && pattern.test(v)

/** Why the envelope's own fields are malformed (keys, version, kind, ids, revisions, references), or null. */
function fieldRefusal(e: Record<string, unknown>): string | null {
  const extra = Object.keys(e).filter((k) => !(KEYS as readonly string[]).includes(k))
  if (extra.length > 0) return `unknown envelope field ${extra.toSorted().join(', ')}`
  const missing = KEYS.filter((k) => !(k in e))
  if (missing.length > 0) return `missing envelope field ${missing.join(', ')}`
  if (e.v !== RUNNER_PROTOCOL_VERSION) return 'unsupported protocol version'
  if (!isKind(e.kind)) return 'unsupported operation kind'
  const ids = ['operationId', 'projectId', 'ownerId', 'resourceId', 'bindingId', 'goalId', 'qualificationId']
  const badId = ids.find((k) => !matches(e[k], UUID))
  if (badId) return `${badId} is not an id`
  const badRevision = ['qualificationRevision', 'profileRevision', 'authorityEpoch'].find((k) => !isRevision(e[k]))
  if (badRevision) return `${badRevision} is not a revision`
  if (!matches(e.adapterPin, PIN)) return 'adapterPin is not a pin'
  const badRef = ['environmentRef', 'nativeProjectRef', 'profileId', 'accountKey'].find((k) => !matches(e[k], REF))
  return badRef ? `${badRef} is not a reference` : null
}

/** A create carries its message and title and targets no thread. */
function createRefusal(e: Record<string, unknown>): string | null {
  if (!isText(e.message, RUNNER_MESSAGE_MAX)) return 'a create needs its message'
  if (!isText(e.title, RUNNER_TITLE_MAX)) return 'a create needs its title'
  return e.targetOperationId !== null || e.nativeThreadId !== null ? 'a create targets no thread' : null
}

/** Why the fields that depend on the kind are wrong for it, or null. */
function kindRefusal(kind: RunnerOperationKind, e: Record<string, unknown>): string | null {
  if (kind === 'create') return createRefusal(e)
  if (kind === 'input' && !isText(e.message, RUNNER_MESSAGE_MAX)) return 'an input needs its message'
  if (kind === 'stop' && e.message !== null) return 'a stop carries no message'
  if (e.title !== null) return 'only a create has a title'
  if (!matches(e.targetOperationId, UUID)) return 'an input or stop needs its target operation'
  return isText(e.nativeThreadId, 400) ? null : 'an input or stop needs its native thread'
}

/**
 * The envelope, or why it is refused. Exactly the known keys: an extra one (a shell command, a tool name, a URL, a
 * native session id of the caller's choosing) is refused rather than ignored.
 */
export function checkEnvelope(value: unknown): { ok: true; envelope: RunnerEnvelope } | { ok: false; reason: string } {
  if (!isRecord(value)) return { ok: false, reason: 'the envelope is not an object' }
  const refusal =
    fieldRefusal(value) ?? (isKind(value.kind) ? kindRefusal(value.kind, value) : 'unsupported operation kind')
  if (refusal) return { ok: false, reason: refusal }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every key and type was checked above
  return { ok: true, envelope: value as unknown as RunnerEnvelope }
}
