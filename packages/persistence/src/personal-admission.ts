// Personal Answer admission (INC03-CC-003 A1, migration 0101): typed callers of the NEW versioned operation
// `personal_answer_v1` beside 0098's record-only automatic_v1 writer, and the owner's read of an input's decisions.
// What it guarantees:
// - The owner is the transaction's verified actor (withActor). The trusted answer profile is checked here and again in
//   SQL (closed; for that same owner only, 42501 otherwise); it never names the actor.
// - Send decides at once (seq 1): admitted when an operator admitted the profile's payer for the owner (a plain read,
//   no reservation), the turn then pending; otherwise waiting, the turn still held. Retry and cancel are separately
//   keyed and name the seq they expect. Every replay returns the receipt that mutation remembered.
// What it does not do: wake, answer, reserve, call a provider, or route. Nothing calls it from a request, and the
// package index does not export it (docs/plans/personal-admission.md). Call inside withActor(..., 'write').
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { onlyRow } from './rows.ts'

/** The only operation contract the Answer writers accept (the input itself is still kept as automatic_v1). */
export const PERSONAL_ANSWER_V1 = 'personal_answer_v1'
export type PersonalAnswerContract = typeof PERSONAL_ANSWER_V1

/** The most decisions one input can have (send, then retries and at most one cancel). */
export const PERSONAL_ANSWER_DECISION_LIMIT = 100

/** USD per million tokens, as the live route's prices are written. */
export interface PersonalAnswerPrices {
  input: number
  cacheRead: number
  cacheWrite: number
  output: number
}

/**
 * The trusted answer profile: the live companion's own settings, without its credential reference or provider profile.
 * Supplied by the server (A2, later), never by a client or a model; kept with each send and retry decision so a later
 * call can be compared with it before anything is paid.
 */
export interface PersonalAnswerProfile {
  version: 1
  /** Lowercase UUID; must be the calling owner. */
  owner: string
  payer: string
  routeId: string
  roleDigest: string
  provider: string
  model: string
  reasoningEffort: string | null
  maxTokens: number
  prices: PersonalAnswerPrices
}

export type PersonalAnswerOperation = 'send' | 'retry' | 'cancel'
export type PersonalAnswerOutcome = 'admitted' | 'waiting' | 'cancelled'
export type PersonalAnswerReason = 'payer_unavailable' | 'cancelled_by_owner' | null

/** A decision as a receipt carries it (no profile). */
export interface PersonalAnswerDecision {
  seq: number
  operation: PersonalAnswerOperation
  outcome: PersonalAnswerOutcome
  reason: PersonalAnswerReason
  late: boolean
  epoch: number
  /** UTC with microseconds; non-null exactly when admitted. */
  admittedAt: string | null
  policy: 'personal-default-answer'
  policyVersion: 1
  family: 'answer'
  basis: 'personal_default_addressee'
}

/** A decision as the owner reads it: the receipt fields, the frozen profile (null for a cancel) and when it was made. */
export interface PersonalAnswerDecisionRecord extends PersonalAnswerDecision {
  inputId: string
  turnId: string
  profile: PersonalAnswerProfile | null
  createdAt: string
}

export type PersonalAnswerReceiptOperation = 'send_answer_input' | 'retry_answer_input' | 'cancel_answer_input'

/** What an Answer mutation remembers and every replay of it returns. */
export interface PersonalAnswerReceipt {
  operation: PersonalAnswerReceiptOperation
  revision: number
  turnId: string
  seq: number
  inputId: string
  answerContract: PersonalAnswerContract
  interactionContract: 'automatic_v1'
  contractVersion: 1
  decision: PersonalAnswerDecision
  suggestionId: null
  noteId: null
  releaseId: null
  projectId: null
  erased: null
}

const NAME = /^[a-z][a-z0-9-]{0,62}[a-z0-9]$/
const OWNER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const NO_CONTROL = (max: number) => new RegExp(`^[^\\u0000-\\u001f\\u007f-\\u009f]{1,${String(max)}}$`, 'u')
const MODEL = NO_CONTROL(200)
const EFFORT = NO_CONTROL(64)
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0
const isEpoch = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const isName = (v: unknown): v is string => typeof v === 'string' && NAME.test(v)
const isPrice = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const isMicros = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v) && !Number.isNaN(Date.parse(v))
const hasExactly = (r: Record<string, unknown>, keys: readonly string[]): boolean => {
  const own = Object.keys(r).toSorted()
  const want = [...keys].toSorted()
  return own.length === want.length && own.every((k, i) => k === want[i])
}

const PROFILE_KEYS = [
  'version',
  'owner',
  'payer',
  'routeId',
  'roleDigest',
  'provider',
  'model',
  'reasoningEffort',
  'maxTokens',
  'prices',
] as const
const PRICE_KEYS = ['input', 'cacheRead', 'cacheWrite', 'output'] as const

/** Each profile field and what it must be (0101's language, types before values). */
const PROFILE_FIELDS: Record<(typeof PROFILE_KEYS)[number], (v: unknown) => boolean> = {
  version: (v) => v === 1,
  owner: (v) => typeof v === 'string' && OWNER.test(v),
  payer: isName,
  routeId: isName,
  provider: isName,
  roleDigest: (v) => typeof v === 'string' && DIGEST.test(v),
  model: (v) => typeof v === 'string' && MODEL.test(v),
  reasoningEffort: (v) => v === null || (typeof v === 'string' && EFFORT.test(v)),
  maxTokens: (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 && v <= 4096,
  prices: (v) => isRecord(v) && hasExactly(v, PRICE_KEYS) && PRICE_KEYS.every((k) => isPrice(v[k])),
}

/** The profile exactly as 0101 accepts it; the owner is compared with the actor in SQL. */
export function isPersonalAnswerProfile(value: unknown): value is PersonalAnswerProfile {
  return isRecord(value) && hasExactly(value, PROFILE_KEYS) && PROFILE_KEYS.every((k) => PROFILE_FIELDS[k](value[k]))
}

const DECISION_FIELDS: Record<string, (v: unknown) => boolean> = {
  seq: (v) => isCount(v) && v <= PERSONAL_ANSWER_DECISION_LIMIT,
  operation: (v) => v === 'send' || v === 'retry' || v === 'cancel',
  outcome: (v) => v === 'admitted' || v === 'waiting' || v === 'cancelled',
  reason: (v) => v === null || v === 'payer_unavailable' || v === 'cancelled_by_owner',
  late: (v) => typeof v === 'boolean',
  epoch: isEpoch,
  admittedAt: (v) => v === null || isMicros(v),
  policy: (v) => v === 'personal-default-answer',
  policyVersion: (v) => v === 1,
  family: (v) => v === 'answer',
  basis: (v) => v === 'personal_default_addressee',
}

const REASON_OF: Record<string, string | null> = {
  admitted: null,
  waiting: 'payer_unavailable',
  cancelled: 'cancelled_by_owner',
}

/** The pairings 0101's checks require: send is seq 1, cancel cancels, the reason follows the outcome. */
function coherent(d: Record<string, unknown>): boolean {
  if ((d.operation === 'send') !== (d.seq === 1)) return false
  if ((d.operation === 'cancel') !== (d.outcome === 'cancelled')) return false
  if ((d.outcome === 'admitted') !== (d.admittedAt !== null)) return false
  return typeof d.outcome === 'string' && d.reason === REASON_OF[d.outcome]
}

/** A decision exactly as a receipt carries it: closed, typed and coherent. */
export function isPersonalAnswerDecision(value: unknown): value is PersonalAnswerDecision {
  if (!isRecord(value) || !hasExactly(value, Object.keys(DECISION_FIELDS))) return false
  if (!Object.entries(DECISION_FIELDS).every(([k, ok]) => ok(value[k]))) return false
  return coherent(value)
}

const RECEIPT_FIELDS: Record<string, (v: unknown) => boolean> = {
  operation: (v) => v === 'send_answer_input' || v === 'retry_answer_input' || v === 'cancel_answer_input',
  revision: isCount,
  turnId: isId,
  seq: isCount,
  inputId: isId,
  answerContract: (v) => v === PERSONAL_ANSWER_V1,
  interactionContract: (v) => v === 'automatic_v1',
  contractVersion: (v) => v === 1,
  decision: isPersonalAnswerDecision,
  suggestionId: (v) => v === null,
  noteId: (v) => v === null,
  releaseId: (v) => v === null,
  projectId: (v) => v === null,
  erased: (v) => v === null,
}

/** The receipt exactly as 0101 remembers it, its decision made by its own operation; anything else is a bug. */
export function isPersonalAnswerReceipt(value: unknown): value is PersonalAnswerReceipt {
  if (!isRecord(value) || !hasExactly(value, Object.keys(RECEIPT_FIELDS))) return false
  if (!Object.entries(RECEIPT_FIELDS).every(([k, ok]) => ok(value[k]))) return false
  const made: Record<string, string> = {
    send_answer_input: 'send',
    retry_answer_input: 'retry',
    cancel_answer_input: 'cancel',
  }
  const decision = value.decision
  return isRecord(decision) && typeof value.operation === 'string' && decision.operation === made[value.operation]
}

const invalid = () => new DomainError('invalid_request', 'Invalid request')

function epochOf(epoch: unknown): number {
  if (!isEpoch(epoch)) throw invalid()
  return epoch
}
function expectedOf(seq: unknown): number {
  if (!isCount(seq) || seq > PERSONAL_ANSWER_DECISION_LIMIT) throw invalid()
  return seq
}
function profileOf(profile: unknown): PersonalAnswerProfile {
  if (!isPersonalAnswerProfile(profile)) throw invalid()
  return profile
}
function inputOf(inputId: unknown): string {
  if (!isId(inputId)) throw invalid()
  return inputId
}

async function remembered(
  c: pg.PoolClient,
  fn: string,
  sql: string,
  params: unknown[],
): Promise<PersonalAnswerReceipt> {
  const { rows } = await c.query<{ receipt: unknown }>(sql, params)
  const value = onlyRow(rows, fn).receipt
  if (!isPersonalAnswerReceipt(value)) throw new Error(`${fn} returned an unexpected receipt`)
  return value
}

export interface PersonalAnswerSend {
  contract: PersonalAnswerContract
  /** The space's epoch the caller last read: a write made against another one is refused (40001). */
  epoch: number
  text: string
  profile: PersonalAnswerProfile
}

/** A Personal message under the Answer operation, kept and decided at once (seq 1), under the caller's own key. */
export async function sendPersonalAnswerInput(
  c: pg.PoolClient,
  key: string,
  write: PersonalAnswerSend,
): Promise<PersonalAnswerReceipt> {
  const { contract }: { contract: unknown } = write
  if (contract !== PERSONAL_ANSWER_V1) throw invalid()
  const epoch = epochOf(write.epoch)
  const profile = profileOf(write.profile)
  return remembered(
    c,
    'send_personal_answer_input',
    'SELECT sophia.send_personal_answer_input($1,$2,$3,$4,$5) AS receipt',
    [key, PERSONAL_ANSWER_V1, epoch, write.text, JSON.stringify(profile)],
  )
}

export interface PersonalAnswerRetry {
  inputId: string
  /** The latest decision seq the caller saw; another one is refused (40001). */
  expectedSeq: number
  epoch: number
  profile: PersonalAnswerProfile
}

/** An explicit retry of a waiting input, under its own key: one new decision, admitted or still waiting. */
export async function retryPersonalAnswerInput(
  c: pg.PoolClient,
  key: string,
  retry: PersonalAnswerRetry,
): Promise<PersonalAnswerReceipt> {
  const params = [key, inputOf(retry.inputId), expectedOf(retry.expectedSeq), epochOf(retry.epoch)]
  const profile = profileOf(retry.profile)
  return remembered(
    c,
    'retry_personal_answer_input',
    'SELECT sophia.retry_personal_answer_input($1,$2,$3,$4,$5) AS receipt',
    [...params, JSON.stringify(profile)],
  )
}

export interface PersonalAnswerCancel {
  inputId: string
  expectedSeq: number
  epoch: number
}

/**
 * An explicit cancel of a waiting input, under its own key: terminal, the words still held. A correction is a new input,
 * sent only once this receipt (or its same-key replay) confirms the cancel; nothing here sends it.
 */
export async function cancelPersonalAnswerInput(
  c: pg.PoolClient,
  key: string,
  cancel: PersonalAnswerCancel,
): Promise<PersonalAnswerReceipt> {
  return remembered(
    c,
    'cancel_personal_answer_input',
    'SELECT sophia.cancel_personal_answer_input($1,$2,$3,$4) AS receipt',
    [key, inputOf(cancel.inputId), expectedOf(cancel.expectedSeq), epochOf(cancel.epoch)],
  )
}

interface DecisionRow {
  input_id: string
  turn_id: string
  seq: number
  operation: string
  outcome: string
  reason: string | null
  late: boolean
  epoch: string
  admitted_at: string | null
  policy: string
  policy_version: number
  family: string
  basis: string
  profile: unknown
  created_at: string
}

function recordOf(r: DecisionRow): PersonalAnswerDecisionRecord {
  const decision: unknown = {
    seq: r.seq,
    operation: r.operation,
    outcome: r.outcome,
    reason: r.reason,
    late: r.late,
    epoch: Number(r.epoch),
    admittedAt: r.admitted_at,
    policy: r.policy,
    policyVersion: r.policy_version,
    family: r.family,
    basis: r.basis,
  }
  if (!isPersonalAnswerDecision(decision)) throw new Error('personal_input_decisions holds an unexpected decision')
  const profile: unknown = r.profile
  let kept: PersonalAnswerProfile | null = null
  if (decision.operation === 'cancel') {
    if (profile !== null) throw new Error('personal_input_decisions holds a profile on a cancel')
  } else {
    if (!isPersonalAnswerProfile(profile)) throw new Error('personal_input_decisions holds an unexpected profile')
    kept = profile
  }
  return { ...decision, inputId: r.input_id, turnId: r.turn_id, profile: kept, createdAt: r.created_at }
}

/**
 * Every decision for one of the caller's own inputs, in order: the current one is the last. Owner-only by its filter and
 * by RLS; an input that is not the caller's, or kept without an answer admission, has none. Call inside withActor.
 */
export async function readPersonalAnswerDecisions(
  c: pg.PoolClient,
  inputId: string,
): Promise<PersonalAnswerDecisionRecord[]> {
  const { rows } = await c.query<DecisionRow>(
    `SELECT input_id, turn_id, seq, operation, outcome, reason, late, epoch::text AS epoch,
            to_char(admitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS admitted_at,
            policy, policy_version, family, basis, profile,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
       FROM sophia.personal_input_decisions
      WHERE owner_id = sophia.actor_id() AND input_id = $1
      ORDER BY seq`,
    [inputOf(inputId)],
  )
  return rows.map(recordOf)
}

/** The current decision for one of the caller's inputs (its latest), or null when it has none. */
export async function readCurrentPersonalAnswerDecision(
  c: pg.PoolClient,
  inputId: string,
): Promise<PersonalAnswerDecisionRecord | null> {
  return (await readPersonalAnswerDecisions(c, inputId)).at(-1) ?? null
}
