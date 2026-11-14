/**
 * Provider-reported model evidence for one native run (INC04-S03b B2, migration 0108; docs/plans/
 * owner-runner-source-authority.md "Reported models"): the one pure check every hop uses, from a patched T3's read to
 * the worker. The producer is the carried patch for the T3 pin (patches/t3code/ade47301-provider-reported-models.patch,
 * docs/SOURCE_MAP.md §2p): an optional `providerReportedModels` per run of `t3_thread_read`, keyed by `evidence`.
 *
 * What it is: what the provider reported for the run's own attempts, as one read collected it. It is not what an
 * adapter accepted, not an effort, not a final or complete record, and never the requested selection. An unpatched T3
 * sends no field; the host then sends no report at all, and the worker records `absent` from the operation's own ids.
 *
 * Every report is checked against the producer's contract and relations, rebuilt in one canonical key order and bounded
 * as a whole: thread and run ids, every wrapper field and every attempt, at most REPORT_MAX_BYTES of compact UTF-8 JSON.
 * Anything else, including an identifier PostgreSQL cannot hold (NUL, a lone surrogate) and an oversized report, is
 * `malformed` with a fixed reason and no content. Nothing is rewritten, truncated or taken from elsewhere, and a report
 * never changes the run's checked status.
 * @module @sophia/coordination/runner-model-report
 */

/** The compact canonical report's bound, in UTF-8 bytes, wrapper and ids included. */
export const REPORT_MAX_BYTES = 32768
/** A model id's bound, in UTF-16 code units (the producer's). */
export const MODEL_ID_MAX_UNITS = 200
/** The producer's attempt and model limits per run and attempt. */
export const REPORT_MAX_ATTEMPTS = 8
export const REPORT_MAX_MODELS = 8

const ATTEMPT_REASONS = ['initial', 'steering_restart', 'retry', 'provider_recovery'] as const
const ATTEMPT_STATUSES = [
  'pending',
  'running',
  'completed',
  'interrupted',
  'failed',
  'cancelled',
  'superseded',
] as const
export const UNAVAILABLE_REASONS = [
  'attempts_not_loaded',
  'provider_turns_not_loaded',
  'provider_turns_load_failed',
] as const
/** The pin's ProviderInstanceId: a slug of at most 64 characters. */
const SLUG = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/

export interface ReportedAttempt {
  readonly attemptId: string
  readonly attemptOrdinal: number
  readonly reason: (typeof ATTEMPT_REASONS)[number]
  readonly status: (typeof ATTEMPT_STATUSES)[number]
  readonly active: boolean
  readonly providerInstanceId: string
  readonly rootTurns: number
  readonly terminalRootTurns: number
  readonly reportingRootTurns: number
  readonly unboundTurns: number
  readonly modelEvidence: 'reported' | 'unknown'
  readonly models: readonly string[]
  readonly modelsOmitted: number
  readonly excludedModelValues: number
}

/** What a host may send about one run, beside its checked status. `threadId` and `runId` are the receipt's. */
export type RunnerModelReport =
  | {
      readonly state: 'collected'
      readonly threadId: string
      readonly runId: string
      readonly collectedAt: string
      readonly activeAttemptId: string | null
      readonly attemptPolicy: 'latest_by_attempt_ordinal'
      readonly attemptLimit: number
      readonly attemptsOwned: number
      readonly attemptsOmitted: number
      readonly attempts: readonly ReportedAttempt[]
    }
  | {
      readonly state: 'unavailable'
      readonly threadId: string
      readonly runId: string
      readonly reason: (typeof UNAVAILABLE_REASONS)[number]
      readonly collectedAt: string
    }
  /** No content and no ids: the database records it against the operation's own ids. */
  | { readonly state: 'malformed'; readonly reason: 'invalid' | 'oversize' }

/** What the worker records: a report, or `absent` when the observation carried none (an unpatched producer). */
export type RunnerModelEvidence = RunnerModelReport | { readonly state: 'absent' }

const INVALID: RunnerModelReport = { state: 'malformed', reason: 'invalid' }
const OVERSIZE: RunnerModelReport = { state: 'malformed', reason: 'oversize' }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const sameKeys = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).toSorted().join(',') === keys.toSorted().join(',')
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v)

/** Order by UTF-16 code unit (JavaScript's `<`), as the producer sorts; never a collation. */
export const codeUnitOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Whether a string has a NUL or an unpaired surrogate: neither can be held by PostgreSQL text or jsonb. */
function unrepresentable(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i)
    if (u === 0) return true
    if (u >= 0xd800 && u <= 0xdbff) {
      const next = s.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      i++
    } else if (u >= 0xdc00 && u <= 0xdfff) return true
  }
  return false
}

/** Any string the database can hold: `collectedAt` (the producer's IsoDateTime is a plain string). */
export const isText = (v: unknown): v is string => typeof v === 'string' && !unrepresentable(v)

/**
 * An attempt id (the pin's RunAttemptId, a TrimmedNonEmptyString): non-empty and equal to its own trim, unbounded but
 * for the report's whole bound. Controls other than NUL are data, as at the pin.
 */
export const isAttemptId = (v: unknown): v is string => isText(v) && v.length > 0 && v.trim() === v

/** A thread or run id as the receipt holds it (t3-port-mapping entityId): a non-blank string the database can hold. */
export const isNativeId = (v: unknown): v is string => isText(v) && v.trim().length > 0

/**
 * A model id exactly as the producer admits it (providerReportedModels.ts isValidReportedModelId): 1-200 UTF-16
 * units, equal to its trim, no C0 or C1 control, no lone surrogate.
 */
export function isModelId(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0 || v.length > MODEL_ID_MAX_UNITS || v.trim() !== v) return false
  for (let i = 0; i < v.length; i++) {
    const u = v.charCodeAt(i)
    if (u <= 0x1f || (u >= 0x7f && u <= 0x9f)) return false
  }
  return !unrepresentable(v)
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const isPositive = (v: unknown): v is number => isCount(v) && v >= 1

const ATTEMPT_KEYS = [
  'attemptId',
  'attemptOrdinal',
  'reason',
  'status',
  'active',
  'providerInstanceId',
  'rootTurns',
  'terminalRootTurns',
  'reportingRootTurns',
  'unboundTurns',
  'modelEvidence',
  'models',
  'modelsOmitted',
  'excludedModelValues',
] as const

type AttemptIdentity = Pick<
  ReportedAttempt,
  'attemptId' | 'attemptOrdinal' | 'reason' | 'status' | 'active' | 'providerInstanceId' | 'modelEvidence'
>
type AttemptCounts = Pick<
  ReportedAttempt,
  'rootTurns' | 'terminalRootTurns' | 'reportingRootTurns' | 'unboundTurns' | 'modelsOmitted' | 'excludedModelValues'
>

/** An attempt's identity, enums and flags, or null. */
function identityOf(v: Record<string, unknown>): AttemptIdentity | null {
  const { attemptId, attemptOrdinal, reason, status, active, providerInstanceId, modelEvidence } = v
  if (!isAttemptId(attemptId) || !isPositive(attemptOrdinal)) return null
  if (!oneOf(reason, ATTEMPT_REASONS) || !oneOf(status, ATTEMPT_STATUSES) || typeof active !== 'boolean') return null
  if (typeof providerInstanceId !== 'string' || !SLUG.test(providerInstanceId)) return null
  if (!oneOf(modelEvidence, ['reported', 'unknown'] as const)) return null
  return { attemptId, attemptOrdinal, reason, status, active, providerInstanceId, modelEvidence }
}

/** An attempt's counters: safe non-negative integers, or null. */
function countsOf(v: Record<string, unknown>): AttemptCounts | null {
  const { rootTurns, terminalRootTurns, reportingRootTurns, unboundTurns, modelsOmitted, excludedModelValues } = v
  if (!isCount(rootTurns) || !isCount(terminalRootTurns) || !isCount(reportingRootTurns)) return null
  if (!isCount(unboundTurns) || !isCount(modelsOmitted) || !isCount(excludedModelValues)) return null
  return { rootTurns, terminalRootTurns, reportingRootTurns, unboundTurns, modelsOmitted, excludedModelValues }
}

/** At most 8 model ids, each valid, distinct and in code-unit order (as the producer emits them); or null. */
function modelsOf(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > REPORT_MAX_MODELS) return null
  const ids: string[] = []
  for (const id of v as unknown[]) {
    if (!isModelId(id)) return null
    const prev = ids.at(-1)
    if (prev !== undefined && codeUnitOrder(prev, id) >= 0) return null
    ids.push(id)
  }
  return ids
}

/** The producer's relations within one attempt. */
function consistent(i: AttemptIdentity, c: AttemptCounts, models: readonly string[], active: string | null): boolean {
  if (c.terminalRootTurns > c.rootTurns || c.reportingRootTurns > c.terminalRootTurns) return false
  const reported = i.modelEvidence === 'reported'
  if (reported !== models.length > 0 || reported !== c.reportingRootTurns > 0) return false
  if (c.modelsOmitted > 0 && models.length !== REPORT_MAX_MODELS) return false
  return i.active === (active !== null && i.attemptId === active)
}

/** One attempt, rebuilt in canonical key order, or null when it breaks the producer's contract or relations. */
function attemptOf(v: unknown, activeAttemptId: string | null): ReportedAttempt | null {
  if (!isRecord(v) || !sameKeys(v, ATTEMPT_KEYS)) return null
  const identity = identityOf(v)
  const counts = countsOf(v)
  const models = modelsOf(v.models)
  if (!identity || !counts || !models || !consistent(identity, counts, models, activeAttemptId)) return null
  return {
    attemptId: identity.attemptId,
    attemptOrdinal: identity.attemptOrdinal,
    reason: identity.reason,
    status: identity.status,
    active: identity.active,
    providerInstanceId: identity.providerInstanceId,
    rootTurns: counts.rootTurns,
    terminalRootTurns: counts.terminalRootTurns,
    reportingRootTurns: counts.reportingRootTurns,
    unboundTurns: counts.unboundTurns,
    modelEvidence: identity.modelEvidence,
    models,
    modelsOmitted: counts.modelsOmitted,
    excludedModelValues: counts.excludedModelValues,
  }
}

/**
 * The producer's attempt order: ordinal descending, then id ascending by UTF-16 code unit. Every pair strictly
 * ordered and every id distinct (the pin's store also makes `(run, ordinal)` unique, so ties do not occur there).
 */
function ordered(attempts: readonly ReportedAttempt[]): boolean {
  if (new Set(attempts.map((a) => a.attemptId)).size !== attempts.length) return false
  return attempts.every((b, i) => {
    const a = attempts[i - 1]
    if (!a) return true
    if (a.attemptOrdinal !== b.attemptOrdinal) return a.attemptOrdinal > b.attemptOrdinal
    return codeUnitOrder(a.attemptId, b.attemptId) < 0
  })
}

interface CollectedHeader {
  readonly collectedAt: string
  readonly activeAttemptId: string | null
  readonly attemptLimit: number
  readonly attemptsOwned: number
  readonly attemptsOmitted: number
  readonly attempts: readonly unknown[]
}

/** The producer's selection: at most `limit` (and 8) returned, the rest of the owned counted as omitted. */
function selectionOk(returned: number, limit: number, owned: number, omitted: number): boolean {
  if (returned > REPORT_MAX_ATTEMPTS || returned > limit || omitted !== owned - returned) return false
  return omitted === 0 || returned === limit
}

/** The collected evidence's run-level fields and their relations, or null. */
function headerOf(v: Record<string, unknown>): CollectedHeader | null {
  const { collectedAt, activeAttemptId, attemptPolicy, attemptLimit, attemptsOwned, attemptsOmitted, attempts } = v
  if (!isText(collectedAt) || !(activeAttemptId === null || isAttemptId(activeAttemptId))) return null
  if (attemptPolicy !== 'latest_by_attempt_ordinal' || !isPositive(attemptLimit)) return null
  if (!isCount(attemptsOwned) || !isCount(attemptsOmitted) || !Array.isArray(attempts)) return null
  const list = attempts as unknown[]
  if (!selectionOk(list.length, attemptLimit, attemptsOwned, attemptsOmitted)) return null
  return { collectedAt, activeAttemptId, attemptLimit, attemptsOwned, attemptsOmitted, attempts: list }
}

/** The collected evidence's fields (both the producer's and the wire's), checked and rebuilt, or null. */
function collectedOf(v: Record<string, unknown>, threadId: string, runId: string): RunnerModelReport | null {
  const header = headerOf(v)
  if (!header) return null
  const attempts: ReportedAttempt[] = []
  for (const a of header.attempts) {
    const checked = attemptOf(a, header.activeAttemptId)
    if (!checked) return null
    attempts.push(checked)
  }
  if (!ordered(attempts)) return null
  return {
    state: 'collected',
    threadId,
    runId,
    collectedAt: header.collectedAt,
    activeAttemptId: header.activeAttemptId,
    attemptPolicy: 'latest_by_attempt_ordinal',
    attemptLimit: header.attemptLimit,
    attemptsOwned: header.attemptsOwned,
    attemptsOmitted: header.attemptsOmitted,
    attempts,
  }
}

/** The whole report's compact canonical UTF-8 size, wrapper and ids included. */
export const reportBytes = (r: RunnerModelEvidence): number => Buffer.byteLength(JSON.stringify(r), 'utf8')

const bounded = (r: RunnerModelReport): RunnerModelReport => (reportBytes(r) > REPORT_MAX_BYTES ? OVERSIZE : r)

const PRODUCER_COLLECTED_KEYS = [
  'evidence',
  'collectedAt',
  'activeAttemptId',
  'attemptPolicy',
  'attemptLimit',
  'attemptsOwned',
  'attemptsOmitted',
  'attempts',
] as const
const WIRE_COLLECTED_KEYS = [
  'state',
  'threadId',
  'runId',
  ...PRODUCER_COLLECTED_KEYS.filter((k) => k !== 'evidence'),
] as const

/** An unavailable report bound to these ids, when `v` carries exactly `keys` with a known reason; or null. */
function unavailableOf(
  v: Record<string, unknown>,
  keys: readonly string[],
  threadId: string,
  runId: string,
): RunnerModelReport | null {
  if (!sameKeys(v, keys) || !oneOf(v.reason, UNAVAILABLE_REASONS) || !isText(v.collectedAt)) return null
  return { state: 'unavailable', threadId, runId, reason: v.reason, collectedAt: v.collectedAt }
}

/** One checked report, bounded; `malformed/invalid` for null. */
const settle = (r: RunnerModelReport | null): RunnerModelReport => (r ? bounded(r) : INVALID)

/**
 * The report for one run, from the producer's `providerReportedModels` value as the T3 read carried it (keyed by
 * `evidence`), bound to the receipt's thread and run. Called only when the run carried the field.
 */
export function reportFromProducer(raw: unknown, threadId: string, runId: string): RunnerModelReport {
  if (!isNativeId(threadId) || !isNativeId(runId) || !isRecord(raw)) return INVALID
  if (raw.evidence === 'unavailable')
    return settle(unavailableOf(raw, ['evidence', 'reason', 'collectedAt'], threadId, runId))
  if (raw.evidence !== 'collected' || !sameKeys(raw, PRODUCER_COLLECTED_KEYS)) return INVALID
  return settle(collectedOf(raw, threadId, runId))
}

/** A host's own `malformed` report: kept only in its exact fixed form. */
function malformedOf(v: Record<string, unknown>): RunnerModelReport {
  return sameKeys(v, ['state', 'reason']) && v.reason === 'oversize' ? OVERSIZE : INVALID
}

/** A report as a host sent it (keyed by `state`), checked again on Sophia's side, or `malformed`. */
export function checkReport(raw: unknown): RunnerModelReport {
  if (!isRecord(raw)) return INVALID
  if (raw.state === 'malformed') return malformedOf(raw)
  const { threadId, runId } = raw
  if (!isNativeId(threadId) || !isNativeId(runId)) return INVALID
  if (raw.state === 'unavailable')
    return settle(unavailableOf(raw, ['state', 'threadId', 'runId', 'reason', 'collectedAt'], threadId, runId))
  if (raw.state !== 'collected' || !sameKeys(raw, WIRE_COLLECTED_KEYS)) return INVALID
  return settle(collectedOf(raw, threadId, runId))
}
