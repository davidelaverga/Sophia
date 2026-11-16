/**
 * The owner gateway journal's record schema and its legal transitions (r2, R1-F03). Every complete record is validated
 * at runtime before it is used: known type, required fields and their types, contiguous `seq` from the header, the
 * operation id, the intent's digest over its checked envelope and the identities, and the transition it makes for its
 * operation. Anything else throws: the journal fails closed rather than fold a record it cannot trust, so a corrupt or
 * inconsistent history can never become a proof that nothing was sent.
 *
 * r3 (R2-F03): the native identities are bound to their operation, not only shaped. An intent's identity must be exactly
 * `deriveIdentity(envelope, identity.namespace)` (the pinned T3 derivation); an input or Stop must target a create
 * journaled earlier in the same journal, with a received answer, on that receipt's thread and with every lineage field
 * of the create; an answer carries its intent's identity and fits its operation's kind. The target check needs the
 * other operations' entries, so the journal applies it (followupTargetError) on load and on append.
 * @module @sophia/coordination/runner-journal-records
 */
import {
  checkEnvelope,
  digestOf,
  type NativeIdentity,
  type RunnerAnswer,
  type RunnerDelivery,
  type RunnerEnvelope,
  type RunnerOperationKind,
} from './runner-port.ts'
import { deriveIdentity } from './t3-port-mapping.ts'

export const JOURNAL_VERSION = 1

export type JournalRecord =
  | { seq: number; time: number; type: 'header'; journalId: string; version: number }
  | {
      seq: number
      time: number
      type: 'intent'
      operationId: string
      digest: string
      envelope: RunnerEnvelope
      identity: NativeIdentity
    }
  | { seq: number; time: number; type: 'possible_send'; operationId: string }
  | { seq: number; time: number; type: 'answer'; operationId: string; answer: RunnerAnswer }
  | { seq: number; time: number; type: 'unknown'; operationId: string; reason: string }
  | { seq: number; time: number; type: 'refused'; operationId: string; digest: string; reason: string }

/** What the journal holds for one operation, folded from its records. */
export interface JournalEntry {
  readonly digest: string
  readonly envelope: RunnerEnvelope | null
  readonly identity: NativeIdentity | null
  readonly possibleSend: boolean
  /** The final answer, once journaled: a receipt, a native refusal, a violated delivery, or a proven settlement. */
  readonly answer: RunnerAnswer | null
  readonly refused: string | null
  readonly unknownNotes: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HEX64 = /^[0-9a-f]{64}$/
const DELIVERIES = new Set(['started', 'queued', 'stop_requested', 'no_active_run', 'already_ended'])

class JournalCorrupt extends Error {}
const corrupt = (why: string): never => {
  throw new JournalCorrupt(why)
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 2000
const isNullableText = (v: unknown): v is string | null => v === null || isText(v)

function keysExactly(r: Record<string, unknown>, keys: readonly string[], what: string): void {
  const actual = Object.keys(r).toSorted().join(',')
  if (actual !== [...keys].toSorted().join(',')) corrupt(`${what} has fields ${actual}`)
}

function identityOf(v: unknown): NativeIdentity {
  if (!isRecord(v)) return corrupt('an identity is not an object')
  keysExactly(v, ['namespace', 'commandId', 'messageId', 'threadId'], 'an identity')
  if (!isText(v.namespace) || !isText(v.commandId) || !isNullableText(v.messageId) || !isText(v.threadId)) {
    return corrupt('an identity has a malformed field')
  }
  return { namespace: v.namespace, commandId: v.commandId, messageId: v.messageId, threadId: v.threadId }
}

const hex64 = (v: unknown): v is string => typeof v === 'string' && HEX64.test(v)
const isDelivery = (v: unknown): v is RunnerDelivery => typeof v === 'string' && DELIVERIES.has(v)
const required = (identity: NativeIdentity | null, what: string): NativeIdentity =>
  identity ?? corrupt(`${what} has no identity`)

/** Each final answer kind, with exactly its fields. */
const ANSWERS: Record<string, (v: Record<string, unknown>, identity: NativeIdentity | null) => RunnerAnswer> = {
  received: (v, identity) => {
    keysExactly(v, ['kind', 'identity', 'runId', 'delivery'], 'a received answer')
    if (!isNullableText(v.runId) || !isDelivery(v.delivery)) return corrupt('a received answer is malformed')
    return { kind: 'received', identity: required(identity, 'a received answer'), runId: v.runId, delivery: v.delivery }
  },
  rejected: (v, identity) => {
    keysExactly(v, ['kind', 'identity', 'code', 'reason'], 'a rejected answer')
    if (!isText(v.code) || !isText(v.reason)) return corrupt('a rejected answer is malformed')
    return { kind: 'rejected', identity: required(identity, 'a rejected answer'), code: v.code, reason: v.reason }
  },
  unknown: (v, identity) => {
    keysExactly(v, ['kind', 'identity', 'reason', 'violation'], 'a final unknown answer')
    if (!isText(v.reason) || v.violation !== true) return corrupt('a final unknown answer is malformed')
    return {
      kind: 'unknown',
      identity: required(identity, 'a final unknown answer'),
      reason: v.reason,
      violation: true,
    }
  },
  settled: (v, identity) => {
    keysExactly(v, ['kind', 'identity', 'reason'], 'a settled answer')
    if (!isText(v.reason)) return corrupt('a settled answer is malformed')
    return { kind: 'settled', identity, reason: v.reason }
  },
}

/** A journaled answer: only the final kinds, each with exactly its fields. */
function answerOf(v: unknown): RunnerAnswer {
  if (!isRecord(v)) return corrupt('an answer is not an object')
  const decode = typeof v.kind === 'string' && Object.hasOwn(ANSWERS, v.kind) ? ANSWERS[v.kind] : undefined
  if (!decode) return corrupt(`an answer of unknown kind ${String(v.kind)}`)
  return decode(v, 'identity' in v && v.identity !== null ? identityOf(v.identity) : null)
}

const IDENTITY_FIELDS = ['namespace', 'commandId', 'messageId', 'threadId'] as const
const sameIdentity = (a: NativeIdentity | null, b: NativeIdentity | null) =>
  a !== null && b !== null && IDENTITY_FIELDS.every((k) => a[k] === b[k])

/** The identity an intent may carry: exactly the pinned derivation of its envelope under its own namespace (R2-F03). */
export function derivedIdentityError(envelope: RunnerEnvelope, identity: NativeIdentity): string | null {
  let derived: NativeIdentity
  try {
    derived = deriveIdentity(envelope, identity.namespace)
  } catch {
    return 'its identity cannot be derived from its envelope'
  }
  return sameIdentity(derived, identity) ? null : 'its identity is not the derivation of its envelope'
}

function intentBody(r: Record<string, unknown>): Record<string, unknown> {
  keysExactly(r, ['seq', 'time', 'type', 'operationId', 'digest', 'envelope', 'identity'], 'an intent')
  const checked = checkEnvelope(r.envelope)
  if (!checked.ok) return corrupt(`an intent's envelope is invalid: ${checked.reason}`)
  if (checked.envelope.operationId !== r.operationId) corrupt("an intent's envelope names another operation")
  if (!hex64(r.digest) || digestOf(checked.envelope) !== r.digest)
    corrupt("an intent's digest does not bind its envelope")
  const identity = identityOf(r.identity)
  const underived = derivedIdentityError(checked.envelope, identity)
  if (underived) corrupt(`an intent: ${underived}`)
  return { digest: r.digest, envelope: checked.envelope, identity }
}

/** The lineage a follow-up must share with the create whose thread it targets (R1-F07, R2-F03). */
export const LINEAGE: readonly (keyof RunnerEnvelope)[] = [
  'ownerId',
  'projectId',
  'resourceId',
  'bindingId',
  'qualificationId',
  'qualificationRevision',
  'adapterPin',
  'environmentRef',
  'nativeProjectRef',
  'profileId',
  'profileRevision',
  'accountKey',
]

/**
 * Why an input or Stop may not target `target` (the journal's entry for its targetOperationId), or null: the target must
 * be a create of this journal with a received answer, on the thread the follow-up names, with the same lineage.
 */
export function followupTargetError(target: JournalEntry | undefined, e: RunnerEnvelope): string | null {
  const created = target?.envelope
  const received = target?.answer?.kind === 'received' ? target.answer : null
  if (!created || created.kind !== 'create') return 'its target is not a create journaled here'
  if (!received) return 'its target create has no receipt here'
  if (received.identity.threadId !== e.nativeThreadId) return "its thread is not its target create's"
  const moved = LINEAGE.find((k) => created[k] !== e[k])
  return moved ? `its ${moved} is not its target create's` : null
}

/** Each record type's own fields, exactly. */
const BODIES: Record<string, (r: Record<string, unknown>) => Record<string, unknown>> = {
  header: (r) => {
    keysExactly(r, ['seq', 'time', 'type', 'journalId', 'version'], 'a header')
    if (typeof r.journalId !== 'string' || !UUID.test(r.journalId) || r.version !== JOURNAL_VERSION)
      corrupt('the header is malformed')
    return { journalId: r.journalId, version: r.version }
  },
  intent: intentBody,
  possible_send: (r) => {
    keysExactly(r, ['seq', 'time', 'type', 'operationId'], 'a possible send')
    return {}
  },
  answer: (r) => {
    keysExactly(r, ['seq', 'time', 'type', 'operationId', 'answer'], 'an answer record')
    return { answer: answerOf(r.answer) }
  },
  unknown: (r) => {
    keysExactly(r, ['seq', 'time', 'type', 'operationId', 'reason'], 'an unknown note')
    if (!isText(r.reason)) corrupt('an unknown note has no reason')
    return { reason: r.reason }
  },
  refused: (r) => {
    keysExactly(r, ['seq', 'time', 'type', 'operationId', 'digest', 'reason'], 'a refusal')
    if (!hex64(r.digest) || !isText(r.reason)) corrupt('a refusal is malformed')
    return { digest: r.digest, reason: r.reason }
  },
}

function bodyOf(r: Record<string, unknown>, type: string): Record<string, unknown> {
  const decode = Object.hasOwn(BODIES, type) ? BODIES[type] : undefined
  return decode ? decode(r) : corrupt(`a record of unknown type ${type}`)
}

/** One parsed line, validated as the record expected at `seq` (the header at 0, an operation's record after it). */
export function recordOf(value: unknown, seq: number): JournalRecord {
  if (!isRecord(value)) return corrupt('a record is not an object')
  if (value.seq !== seq) return corrupt(`record seq ${String(value.seq)} where ${seq} was expected`)
  if (typeof value.time !== 'number' || !Number.isFinite(value.time)) return corrupt('a record has no time')
  const type = typeof value.type === 'string' ? value.type : ''
  if ((seq === 0) !== (type === 'header')) return corrupt('the header must be the first record, and only the first')
  if (type !== 'header' && (typeof value.operationId !== 'string' || !UUID.test(value.operationId))) {
    return corrupt('a record names no operation')
  }
  const body = bodyOf(value, type)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every field of this type was validated by bodyOf
  return {
    seq,
    time: value.time,
    type,
    ...(type === 'header' ? {} : { operationId: value.operationId }),
    ...body,
  } as JournalRecord
}

const EMPTY: JournalEntry = {
  digest: '',
  envelope: null,
  identity: null,
  possibleSend: false,
  answer: null,
  refused: null,
  unknownNotes: 0,
}

type OperationRecord = Exclude<JournalRecord, { type: 'header' }>
const finished = (e: JournalEntry) => e.answer !== null || e.refused !== null

/** The deliveries a receipt may name for each operation kind. */
const RECEIPT_DELIVERIES: Record<RunnerOperationKind, ReadonlySet<RunnerDelivery>> = {
  create: new Set(['started']),
  input: new Set(['started', 'queued']),
  stop: new Set(['stop_requested', 'no_active_run', 'already_ended']),
}

const named = (kind: RunnerOperationKind) => (kind === 'input' ? 'an input' : `a ${kind}`)

/** Why an answer does not fit its operation's kind (R2-F03), or null. */
function answerKindError(kind: RunnerOperationKind, answer: RunnerAnswer): string | null {
  if (answer.kind === 'received' && !RECEIPT_DELIVERIES[kind].has(answer.delivery))
    return `${named(kind)} received as ${answer.delivery}`
  if (answer.kind === 'unknown' && kind !== 'input') return `a violated delivery of ${named(kind)}`
  if (answer.kind === 'settled' && kind !== 'stop') return `${named(kind)} settled by observation`
  return null
}

function afterAnswer(base: JournalEntry, answer: RunnerAnswer): JournalEntry {
  if (!base.possibleSend || finished(base) || !base.envelope)
    corrupt('an answer without a possible send, or a second answer')
  const identity = 'identity' in answer ? answer.identity : null
  if (!sameIdentity(identity, base.identity)) corrupt("an answer with identities other than its intent's")
  const misfit = base.envelope ? answerKindError(base.envelope.kind, answer) : 'an answer without an intent'
  if (misfit) corrupt(`an answer that does not fit its operation: ${misfit}`)
  return { ...base, answer }
}

function afterRefusal(prior: JournalEntry | undefined, digest: string, reason: string): JournalEntry {
  if (prior) corrupt('a refusal after the operation was already journaled')
  return { ...EMPTY, digest, refused: reason }
}

/** One intent per operation, first (r3): the gateway never sends an operation it holds any record of. */
function afterIntent(prior: JournalEntry | undefined, r: Extract<OperationRecord, { type: 'intent' }>): JournalEntry {
  if (prior) corrupt('an intent after the operation was already journaled')
  return { ...EMPTY, digest: r.digest, envelope: r.envelope, identity: r.identity }
}

function afterPossibleSend(base: JournalEntry): JournalEntry {
  if (!base.envelope || base.possibleSend || finished(base)) corrupt('a possible send without a fresh intent')
  return { ...base, possibleSend: true }
}

function afterUnknown(base: JournalEntry): JournalEntry {
  if (!base.possibleSend || finished(base)) corrupt('an unknown note without a possible send, or after an answer')
  return { ...base, unknownNotes: base.unknownNotes + 1 }
}

/** Throws unless an input or Stop intent targets a create of `entries` on its thread and lineage (R2-F03). */
export function checkTarget(entries: ReadonlyMap<string, JournalEntry>, record: OperationRecord): void {
  if (record.type !== 'intent' || record.envelope.kind === 'create') return
  const target = entries.get(record.envelope.targetOperationId ?? '')
  const error = followupTargetError(target, record.envelope)
  if (error) corrupt(`${named(record.envelope.kind)} intent: ${error}`)
}

/** The operation's entry after `record`, or a throw if the transition is not legal from `prior`. */
export function transition(prior: JournalEntry | undefined, record: OperationRecord): JournalEntry {
  switch (record.type) {
    case 'refused':
      return afterRefusal(prior, record.digest, record.reason)
    case 'intent':
      return afterIntent(prior, record)
    case 'possible_send':
      return afterPossibleSend(prior ?? EMPTY)
    case 'answer':
      return afterAnswer(prior ?? EMPTY, record.answer)
    case 'unknown':
      return afterUnknown(prior ?? EMPTY)
    default:
      return corrupt('a record of unknown type')
  }
}

export { JournalCorrupt }
