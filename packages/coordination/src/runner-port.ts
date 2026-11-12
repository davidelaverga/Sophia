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
 *
 * Two envelope versions (INC01-CC-005, migration 0096; docs/plans/owner-runner-source-authority.md). v1 (A47) carries
 * its text inline and is frozen byte for byte: existing rows, journals, digests and identities never change. v2 is a
 * create or input under source authority: CONTENT-FREE (its instruction's digest, its context's digest, the requested
 * base, write scope and settings), with the instruction itself passed beside it as a payload whose SHA-256 must be the
 * envelope's `payloadSha256`. A Stop is always v1: it carries no content.
 * @module @sophia/coordination/runner-port
 */
import { createHash } from 'node:crypto'
import { canonicalJson } from './canonical.ts'

export const RUNNER_PROTOCOL_VERSION = 1
/** The source-authority envelope (0096): a create or input whose instruction travels as a hash-checked payload. */
export const RUNNER_SOURCE_PROTOCOL_VERSION = 2
export const RUNNER_OPERATION_KINDS = ['create', 'input', 'stop'] as const
export type RunnerOperationKind = (typeof RUNNER_OPERATION_KINDS)[number]
/** Named, so a request for them is refused as unsupported rather than as malformed, and never emulated. */
export const UNSUPPORTED_RUNNER_KINDS = ['hold', 'resume', 'resolve_permission', 'answer_question'] as const
export const RUNNER_MESSAGE_MAX = 8000
export const RUNNER_TITLE_MAX = 120

/** The identity and route fields both envelope versions carry, from Sophia's frozen records. */
interface RunnerEnvelopeCommon {
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
  /** input and stop: the create operation whose native thread they target. create: null. */
  readonly targetOperationId: string | null
  /** input and stop: that thread, as its create operation's receipt recorded it. create: null. */
  readonly nativeThreadId: string | null
}

/** What Sophia froze at admission and rechecked at send. Every field is from Sophia's records, none from a request. */
export interface RunnerEnvelopeV1 extends RunnerEnvelopeCommon {
  readonly v: 1
  /** create and input: the owner's text. stop: null. */
  readonly message: string | null
  /** create: the native thread's title. Otherwise null. */
  readonly title: string | null
}

/**
 * Requested settings: the T3 pin's ModelSelection (packages/contracts/src/modelSelection.ts:9-50) as Sophia admits it,
 * every option the route's declared policy names for the model, sorted by id. A request: never what an adapter accepted
 * or what a run used.
 */
export interface RunnerSettings {
  readonly instanceId: string
  readonly model: string
  readonly options: readonly { readonly id: string; readonly value: string | boolean }[]
}

/** What a qualified profile may be asked for (0096 owner_runner_policy_refusal): declared by an operator, never a request. */
export interface RunnerSourcePolicy {
  readonly v: 1
  readonly instanceId: string
  readonly models: readonly {
    readonly model: string
    readonly options: readonly { readonly id: string; readonly values: readonly (string | boolean)[] }[]
  }[]
}

/**
 * A create or input under source authority (0096 owner_runner_envelope v2): the v1 identity and route fields, no text.
 * Its instruction is the payload whose SHA-256 is `payloadSha256`; its context (selected sources, revisions, base,
 * scope, settings) is the private manifest whose SHA-256 is `manifestSha256`.
 */
export interface RunnerEnvelopeV2 extends RunnerEnvelopeCommon {
  readonly v: 2
  readonly kind: 'create' | 'input'
  readonly payloadSha256: string
  readonly manifestSha256: string
  /** The requested repository base: a full commit. Requested, never proof of a checkout. */
  readonly baseCommit: string
  readonly writeScope: 'read_only'
  readonly settings: RunnerSettings
}

/**
 * Either version, as ONE structural type: what the port, the journal and the channel carry. checkEnvelope guarantees at
 * runtime that a checked envelope is exactly a RunnerEnvelopeV1 or a RunnerEnvelopeV2 (its own keys, no other); code
 * that needs a version's fields narrows with envelopeV2. One type rather than a union keeps every v1 caller, fixture and
 * journal reader unchanged.
 */
export interface RunnerEnvelope extends RunnerEnvelopeCommon {
  readonly v: 1 | 2
  readonly message?: string | null
  readonly title?: string | null
  readonly payloadSha256?: string
  readonly manifestSha256?: string
  readonly baseCommit?: string
  readonly writeScope?: 'read_only'
  readonly settings?: RunnerSettings
}

/** A checked envelope as v2, or null for v1. Only for an envelope checkEnvelope accepted. */
export function envelopeV2(e: RunnerEnvelope): RunnerEnvelopeV2 | null {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- checkEnvelope admitted exactly the v2 keys and types
  return e.v === RUNNER_SOURCE_PROTOCOL_VERSION ? (e as RunnerEnvelopeV2) : null
}

/** A v2 instruction, as its payload's canonical JSON holds it: an input has no title. */
export interface RunnerPayload {
  readonly message: string
  readonly title: string | null
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
  /**
   * Send once, through the journal Sophia bound the operation to (`journalId`); another journal answers unknown. A v2
   * envelope's instruction is `payload` (its canonical JSON, hash-checked against `payloadSha256`); it is never
   * journaled and never needed again by reconcile or observe.
   */
  send(envelope: RunnerEnvelope, digest: string, journalId: string, payload?: string): Promise<RunnerAnswer>
  reconcile(identity: RunnerIdentity): Promise<RunnerAnswer>
  observe(identity: RunnerIdentity): Promise<RunObservation>
}

/** SHA-256 over the canonical JSON of a value: Sophia's admission digest and the envelope's send digest. */
export function digestOf(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

/** SHA-256 over a text's UTF-8 bytes, as 0096 owner_runner_sha256: a payload's digest binds its exact bytes. */
export const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const PIN = /^[0-9a-f]{40}$/
const HEX64 = /^[0-9a-f]{64}$/
const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const KEYS: readonly (keyof RunnerEnvelopeV1)[] = [
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
/** Code points, as SQL length() and JSON Schema maxLength count characters (repair 1, CC005-E7-F03). */
const characters = (v: string): number => {
  let n = 0
  for (const _ of v) n += 1
  return n
}
/** A message or title: non-blank (as trim() and 0096 owner_runner_blank agree), at most `max` characters, no NUL. */
const isChars = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && characters(v) <= max && !v.includes('\u0000')

const isKind = (v: unknown): v is RunnerOperationKind =>
  typeof v === 'string' && (RUNNER_OPERATION_KINDS as readonly string[]).includes(v)
const matches = (v: unknown, pattern: RegExp): boolean => typeof v === 'string' && pattern.test(v)

/** Why the envelope has other keys than `keys`, or null. */
function keyRefusal(e: Record<string, unknown>, keys: readonly string[]): string | null {
  const extra = Object.keys(e).filter((k) => !keys.includes(k))
  if (extra.length > 0) return `unknown envelope field ${extra.toSorted().join(', ')}`
  const missing = keys.filter((k) => !(k in e))
  return missing.length > 0 ? `missing envelope field ${missing.join(', ')}` : null
}

/** Why the envelope's own fields are malformed (keys, version, kind, ids, revisions, references), or null. */
function fieldRefusal(e: Record<string, unknown>): string | null {
  const keys = keyRefusal(e, KEYS)
  if (keys) return keys
  if (e.v !== RUNNER_PROTOCOL_VERSION) return 'unsupported protocol version'
  if (!isKind(e.kind)) return 'unsupported operation kind'
  return routeRefusal(e)
}

/** Why the identity and route fields both versions share are malformed, or null. */
function routeRefusal(e: Record<string, unknown>): string | null {
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
  if (!isChars(e.message, RUNNER_MESSAGE_MAX)) return 'a create needs its message'
  if (!isChars(e.title, RUNNER_TITLE_MAX)) return 'a create needs its title'
  return e.targetOperationId !== null || e.nativeThreadId !== null ? 'a create targets no thread' : null
}

/** Why the fields that depend on the kind are wrong for it, or null. */
function kindRefusal(kind: RunnerOperationKind, e: Record<string, unknown>): string | null {
  if (kind === 'create') return createRefusal(e)
  if (kind === 'input' && !isChars(e.message, RUNNER_MESSAGE_MAX)) return 'an input needs its message'
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
  if (value.v === RUNNER_SOURCE_PROTOCOL_VERSION) return checkEnvelopeV2(value)
  const refusal =
    fieldRefusal(value) ?? (isKind(value.kind) ? kindRefusal(value.kind, value) : 'unsupported operation kind')
  if (refusal) return { ok: false, reason: refusal }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every key and type was checked above
  return { ok: true, envelope: value as unknown as RunnerEnvelope }
}

// ---- v2: source authority (0096) ----

const V2_KEYS: readonly (keyof RunnerEnvelopeV2)[] = [
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
  'payloadSha256',
  'manifestSha256',
  'baseCommit',
  'writeScope',
  'settings',
  'targetOperationId',
  'nativeThreadId',
]

/** The pin's ProviderInstanceId slug (packages/contracts/src/providerInstance.ts:7-15). */
const INSTANCE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/
/** An option id Sophia admits: an identifier, like the pin's reasoningEffort (Codex) and effort (Claude). */
const OPTION_ID = /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/
/**
 * A non-blank text with no surrounding space, as 0096 checks a model name or option value: at most `max` code points,
 * as the published schema and SQL count them (repair 13, NATIVE12-F02), and equal to its own trim().
 */
const trimmed = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && characters(v) <= max && v.trim() === v

const sameKeys = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).toSorted().join(',') === keys.toSorted().join(',')

/** Why settings are not exactly {instanceId, model, options: [{id, value}]} sorted by id, each once; or null. */
export function settingsShapeRefusal(v: unknown): string | null {
  if (!isRecord(v) || !sameKeys(v, ['instanceId', 'model', 'options']) || !Array.isArray(v.options))
    return 'settings are {instanceId, model, options}'
  if (!matches(v.instanceId, INSTANCE)) return 'instanceId is not a provider instance id'
  if (!trimmed(v.model, 200)) return 'model is not a model name'
  return optionsRefusal(v.options)
}

/** Why options are not at most ten {id, value}, sorted by id, each once; or null. */
function optionsRefusal(options: unknown[]): string | null {
  if (options.length > 10) return 'too many options'
  const ids: string[] = []
  for (const o of options) {
    if (!isRecord(o) || !sameKeys(o, ['id', 'value']) || !matches(o.id, OPTION_ID)) return 'an option is {id, value}'
    if (!(typeof o.value === 'boolean' || trimmed(o.value, 200))) return 'an option value is a text or a boolean'
    ids.push(String(o.id))
  }
  const sorted = ids.toSorted()
  return sorted.every((id, i) => id === ids[i] && id !== sorted[i - 1]) ? null : 'options are sorted by id, each once'
}

/**
 * Why requested settings are not allowed by a profile's declared policy, or null (as 0096 owner_runner_settings_refusal):
 * the policy's provider instance, a declared model, and exactly that model's declared options, each with one of its
 * declared values. No policy allows nothing; nothing has a default.
 */
export function settingsRefusal(policy: RunnerSourcePolicy | undefined, settings: unknown): string | null {
  if (!policy) return 'no source policy is declared for this host'
  const shape = settingsShapeRefusal(settings)
  if (shape) return shape
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- its every key and type was checked just above
  const s = settings as RunnerSettings
  if (s.instanceId !== policy.instanceId) return "its provider instance is not the profile's"
  const model = policy.models.find((m) => m.model === s.model)
  if (!model) return 'its model is not declared for the profile'
  const declared = model.options.map((o) => o.id).toSorted()
  if (declared.join('\u0000') !== s.options.map((o) => o.id).join('\u0000'))
    return "its options are not exactly the model's declared options"
  const undeclared = s.options.find((o) => !model.options.find((d) => d.id === o.id)?.values.includes(o.value))
  return undeclared ? `the value of ${undeclared.id} is not declared for the profile` : null
}

/** A v2 create targets no thread; an input targets its create's. A Stop is never v2. */
function v2KindRefusal(e: Record<string, unknown>): string | null {
  if (e.kind === 'create')
    return e.targetOperationId !== null || e.nativeThreadId !== null ? 'a create targets no thread' : null
  if (e.kind !== 'input') return 'only a create or an input is a v2 envelope'
  if (!matches(e.targetOperationId, UUID)) return 'an input needs its target operation'
  return isText(e.nativeThreadId, 400) ? null : 'an input needs its native thread'
}

function checkEnvelopeV2(
  e: Record<string, unknown>,
): { ok: true; envelope: RunnerEnvelope } | { ok: false; reason: string } {
  const refusal =
    keyRefusal(e, V2_KEYS) ??
    routeRefusal(e) ??
    (!matches(e.payloadSha256, HEX64) || !matches(e.manifestSha256, HEX64)
      ? 'a v2 envelope needs its digests'
      : null) ??
    (matches(e.baseCommit, PIN) ? null : 'baseCommit is not a full commit') ??
    (e.writeScope === 'read_only' ? null : 'writeScope is not read_only') ??
    settingsShapeRefusal(e.settings) ??
    v2KindRefusal(e)
  if (refusal) return { ok: false, reason: refusal }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every key and type was checked above
  return { ok: true, envelope: e as unknown as RunnerEnvelope }
}

/** At most this many bytes of payload: the 8000-character message and 120-character title, JSON-escaped. */
export const RUNNER_PAYLOAD_MAX = 65_536

/**
 * A v2 envelope's payload, or why it is refused: exactly the text whose SHA-256 is `payloadSha256`, in Sophia's
 * canonical JSON, with exactly `message` and `title`, a title for a create and none for an input.
 */
export function checkPayload(
  envelope: RunnerEnvelopeV2,
  payload: unknown,
): { ok: true; payload: RunnerPayload } | { ok: false; reason: string } {
  if (typeof payload !== 'string' || payload.length > RUNNER_PAYLOAD_MAX)
    return { ok: false, reason: 'a v2 send needs its payload' }
  if (sha256Hex(payload) !== envelope.payloadSha256)
    return { ok: false, reason: 'the payload does not match its digest' }
  let value: unknown
  try {
    value = JSON.parse(payload)
  } catch {
    return { ok: false, reason: 'the payload is not JSON' }
  }
  if (!isRecord(value) || !sameKeys(value, ['message', 'title']) || canonicalJson(value) !== payload)
    return { ok: false, reason: 'the payload is not exactly {message, title} in canonical JSON' }
  if (!isChars(value.message, RUNNER_MESSAGE_MAX)) return { ok: false, reason: 'the payload has no message' }
  if (envelope.kind === 'create' ? !isChars(value.title, RUNNER_TITLE_MAX) : value.title !== null)
    return { ok: false, reason: 'a create has its title and an input none' }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- its keys and types were checked above
  return { ok: true, payload: value as unknown as RunnerPayload }
}
