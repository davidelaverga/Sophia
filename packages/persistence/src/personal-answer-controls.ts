// The owner's control of an automatic Personal answer, and the launch fence of a live call (INC03-CC-003 A3, migration
// 0103, amendment A54; docs/plans/personal-answers.md, "A3"). Typed callers of 0103's functions, each run as the
// verified actor (withActor); the owner is never an argument.
// - Installation is read positively: personalAnswerControlsInstalled answers false only when 0103's marker is absent,
//   read without error. Any read error is thrown, never taken for "not installed" or for legacy.
// - A controlled reservation returns what its call must remember: its outcome, and the digest of the frozen execution
//   it was tagged with. Only beginPersonalAnswerLaunch answering 'granted' lets that call prepare, once.
// - A control or an admission returns its receipt and whether it was a replay of the same key: only a first, applied
//   one may wake the runner. Nothing here reads a flag or a profile of its own; the API passes them.
import type pg from 'pg'
import type { PersonalAnswerProfile } from './personal-admission.ts'
import type { PersonalAnswerEffect, PersonalAnswerSpend } from './personal-answer-effects.ts'
import { onlyRow } from './rows.ts'

/** 0103's marker, read so that only its proven absence means "not installed". */
const MARKER = `SELECT to_regprocedure('sophia.personal_answer_controls_protocol()') IS NOT NULL AS installed`

/** Whether 0103 is installed: false only when its marker is absent; a failed read throws. */
export async function personalAnswerControlsInstalled(c: pg.ClientBase | pg.Pool): Promise<boolean> {
  const { rows } = await c.query<{ installed: boolean }>(MARKER)
  return onlyRow(rows, 'personal_answer_controls_installed').installed
}

/**
 * Whether the calling owner has any controlled input: what an old, unversioned read cannot represent. False only when
 * 0103 is absent or the owner has none. Call inside withActor.
 */
export async function personalAnswerControlled(c: pg.ClientBase): Promise<boolean> {
  if (!(await personalAnswerControlsInstalled(c))) return false
  const { rows } = await c.query<{ controlled: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM sophia.personal_answer_controls WHERE owner_id = sophia.actor_id()) AS controlled`,
  )
  return onlyRow(rows, 'personal_answer_controlled').controlled
}

/**
 * A live call's frozen execution: the answer profile's shape, built from the live settings for this call (for a legacy
 * turn too), so its effort may be any string the settings allow.
 */
export interface PersonalAnswerExecution {
  version: 1
  owner: string
  payer: string
  routeId: string
  roleDigest: string
  provider: string
  model: string
  reasoningEffort: string | null
  maxTokens: number
  prices: { input: number; cacheRead: number; cacheWrite: number; output: number }
}

/** What a controlled reservation answers: 0102's outcomes, or 'withdrawn' (the input was withdrawn first). */
export type PersonalControlledEffect = PersonalAnswerEffect | 'withdrawn'

const CONTROLLED: readonly string[] = [
  'reserved',
  'not_admitted',
  'held',
  'exhausted',
  'not_current',
  'kept',
  'lost',
  'profile_mismatch',
  'profile_unsupported',
  'withdrawn',
]
const isControlled = (value: unknown): value is PersonalControlledEffect =>
  typeof value === 'string' && CONTROLLED.includes(value)

/** A controlled reservation's outcome, and the digest of the execution its call was tagged with. */
export interface PersonalControlledReservation {
  outcome: PersonalControlledEffect
  executionDigest: string
}

/**
 * Reserve the call `call.callId` to answer `call.turnId` under its claim through 0103's controlled entry (0102's guard
 * decides; a reserved call is tagged with `execution` in the same transaction).
 */
export async function reserveControlledPersonalAnswer(
  c: pg.PoolClient,
  call: { callId: string; turnId: string; claim: string },
  spend: PersonalAnswerSpend,
  execution: PersonalAnswerExecution,
): Promise<PersonalControlledReservation> {
  const { payer, routeId, micros, profile } = spend
  const { rows } = await c.query<{ r: { outcome?: unknown; executionDigest?: unknown } }>(
    'SELECT sophia.reserve_personal_answer_controlled($1, $2, $3, $4, $5, $6, $7, $8) AS r',
    [
      call.callId,
      payer,
      routeId,
      micros,
      call.turnId,
      call.claim,
      profile === null ? null : JSON.stringify(profile),
      JSON.stringify(execution),
    ],
  )
  const { outcome, executionDigest } = onlyRow(rows, 'reserve_personal_answer_controlled').r
  if (!isControlled(outcome) || typeof executionDigest !== 'string')
    throw new Error('reserve_personal_answer_controlled answered an unknown outcome')
  return { outcome, executionDigest }
}

/**
 * The launch intent's answer: 'granted' (fresh and committed: the only permission to prepare, once); anything else
 * never permits a call, a replay of a grant ('already_launched') included.
 */
export type PersonalAnswerLaunch = 'granted' | 'already_launched' | 'withdrawn' | 'refused' | 'not_tagged'
const LAUNCHES: readonly string[] = ['granted', 'already_launched', 'withdrawn', 'refused', 'not_tagged']
const isLaunch = (value: unknown): value is PersonalAnswerLaunch =>
  typeof value === 'string' && LAUNCHES.includes(value)

/** Ask to launch the tagged call `callId` under the turn's claim and the execution digest it was tagged with. */
export async function beginPersonalAnswerLaunch(
  c: pg.PoolClient,
  callId: string,
  claim: string,
  executionDigest: string,
): Promise<PersonalAnswerLaunch> {
  const { rows } = await c.query<{ launch: unknown }>(
    'SELECT sophia.begin_personal_answer_launch($1, $2, $3) AS launch',
    [callId, claim, executionDigest],
  )
  const { launch } = onlyRow(rows, 'begin_personal_answer_launch')
  if (!isLaunch(launch)) throw new Error('begin_personal_answer_launch answered an unknown outcome')
  return launch
}

/** The answer withheld for the caller's call (an answer of withdrawn work), or null. */
export async function readPersonalWithheldAnswer(
  c: pg.ClientBase,
  callId: string,
): Promise<{ text: string; suggestion: string | null } | null> {
  const { rows } = await c.query<{ answer: { text: string; suggestion: string | null } | null }>(
    'SELECT sophia.personal_withheld_answer($1) AS answer',
    [callId],
  )
  return onlyRow(rows, 'personal_withheld_answer').answer
}

/**
 * R1: keep the whole answer of the caller's own call privately when its cost could not be settled (it was stopped, or
 * its usage was not known) and its input was withdrawn: 'retained' (kept, or already kept identically), or
 * 'not_withdrawn' (not the granted original call of a withdrawn input at the current epoch: nothing is written). A
 * different answer already kept is refused (23505). Its money is never touched: the call stays held until reconciled.
 */
export async function retainPersonalWithheldAnswer(
  c: pg.ClientBase,
  callId: string,
  answer: { text: string; suggestion: string | null },
): Promise<'retained' | 'not_withdrawn'> {
  const { rows } = await c.query<{ outcome: unknown }>(
    'SELECT sophia.retain_personal_withheld_answer($1, $2, $3) AS outcome',
    [callId, answer.text, answer.suggestion],
  )
  const { outcome } = onlyRow(rows, 'retain_personal_withheld_answer')
  if (outcome !== 'retained' && outcome !== 'not_withdrawn')
    throw new Error('retain_personal_withheld_answer answered an unknown outcome')
  return outcome
}

export type PersonalAnswerControlAction = 'cancel' | 'replace'
export type PersonalAnswerControlState = 'active' | 'held' | 'withdrawn'
export type PersonalAnswerHeldReason =
  'prior_in_progress' | 'prior_cost_unresolved' | 'admission_off' | 'profile_unavailable' | 'payer_unavailable'
export type PersonalAnswerPhase =
  'before_reservation' | 'before_launch' | 'after_launch' | 'after_publication' | 'before_admission'

/** What a control or an admission remembers (A54 PersonalAnswerControlReceipt); a replay returns it unchanged. */
export interface PersonalAnswerControlReceipt {
  operation: 'control_answer_input' | 'admit_answer_input'
  controlContract: 'personal_answer_control_v1'
  revision: number
  epoch: number
  controlId: string
  controlSeq: number
  inputId: string
  turnId: string
  action: PersonalAnswerControlAction | 'admit'
  outcome: 'applied' | 'refused'
  revisionBefore: number
  revisionAfter: number
  phase: PersonalAnswerPhase | null
  prior: { financial: string; effect: string; answer: string }
  heldReason: PersonalAnswerHeldReason | null
  replacement: {
    inputId: string
    turnId: string
    seq: number
    state: 'active' | 'held'
    heldReason: PersonalAnswerHeldReason | null
    decision: unknown
  } | null
  decision?: unknown
}

/** A control's or an admission's result: its receipt, and whether this was a replay of the same key. */
export interface PersonalAnswerControlResult {
  replayed: boolean
  receipt: PersonalAnswerControlReceipt
}

/** A receipt as 0103 builds it: checked by its fixed fields, the rest as A54 types it (the route's schema serializes it). */
function isReceipt(value: unknown): value is PersonalAnswerControlReceipt {
  if (typeof value !== 'object' || value === null) return false
  const operation: unknown = Reflect.get(value, 'operation')
  const outcome: unknown = Reflect.get(value, 'outcome')
  return (
    (operation === 'control_answer_input' || operation === 'admit_answer_input') &&
    (outcome === 'applied' || outcome === 'refused') &&
    typeof Reflect.get(value, 'controlId') === 'string' &&
    typeof Reflect.get(value, 'revisionAfter') === 'number'
  )
}

const resultOf = (value: unknown, statement: string): PersonalAnswerControlResult => {
  if (typeof value !== 'object' || value === null) throw new Error(`${statement} answered no result`)
  const replayed: unknown = Reflect.get(value, 'replayed')
  const receipt: unknown = Reflect.get(value, 'receipt')
  if (typeof replayed !== 'boolean' || !isReceipt(receipt)) throw new Error(`${statement} answered no result`)
  return { replayed, receipt }
}

/** What the API passes to a control or an admission: the server's own profile and paid-admission gates, never a client's. */
export interface PersonalAnswerAuthority {
  /** The live companion's answer profile now, or null (none, or none 0101 accepts). */
  profile: PersonalAnswerProfile | null
  /** personalAnswers AND personalAnswerReplacementAdmission, and a live companion answering this owner. */
  admission: boolean
}

/** C1/C2/C4: cancel or replace the caller's input, expecting `expectedRevision`. */
export async function controlPersonalAnswerInput(
  c: pg.PoolClient,
  request: {
    key: string
    inputId: string
    action: PersonalAnswerControlAction
    expectedRevision: number
    epoch: number
    text: string | null
  },
  authority: PersonalAnswerAuthority,
): Promise<PersonalAnswerControlResult> {
  const { rows } = await c.query<{ r: unknown }>(
    'SELECT sophia.control_personal_answer_input($1, $2, $3, $4, $5, $6, $7, $8) AS r',
    [
      request.key,
      request.inputId,
      request.action,
      request.expectedRevision,
      request.epoch,
      request.text,
      authority.profile === null ? null : JSON.stringify(authority.profile),
      authority.admission,
    ],
  )
  return resultOf(onlyRow(rows, 'control_personal_answer_input').r, 'control_personal_answer_input')
}

/** C3/C3': admit the held replacement `inputId` that the caller's replace `controlId` created. */
export async function admitPersonalAnswerInput(
  c: pg.PoolClient,
  request: { key: string; inputId: string; controlId: string; expectedRevision: number; epoch: number },
  authority: PersonalAnswerAuthority,
): Promise<PersonalAnswerControlResult> {
  const { rows } = await c.query<{ r: unknown }>(
    'SELECT sophia.admit_personal_answer_input($1, $2, $3, $4, $5, $6, $7) AS r',
    [
      request.key,
      request.inputId,
      request.controlId,
      request.expectedRevision,
      request.epoch,
      authority.profile === null ? null : JSON.stringify(authority.profile),
      authority.admission,
    ],
  )
  return resultOf(onlyRow(rows, 'admit_personal_answer_input').r, 'admit_personal_answer_input')
}

/** The caller's input as it stands now (A54 PersonalAnswerControlView); 22023 when the caller has none. */
export async function readPersonalAnswerControl(c: pg.ClientBase, inputId: string): Promise<Record<string, unknown>> {
  const { rows } = await c.query<{ view: Record<string, unknown> }>(
    'SELECT sophia.personal_answer_control_view($1) AS view',
    [inputId],
  )
  return onlyRow(rows, 'personal_answer_control_view').view
}

/** How many control operations one page of the log holds. */
export const PERSONAL_ANSWER_CONTROL_PAGE = 100

/** The caller's control operations after `after` (a seq), oldest first, and where the next page starts. */
export async function readPersonalAnswerControlLog(
  c: pg.ClientBase,
  after: number,
  limit = PERSONAL_ANSWER_CONTROL_PAGE,
): Promise<{ items: Array<Record<string, unknown>>; next: number | null }> {
  const { rows } = await c.query<{ page: { items: Array<Record<string, unknown>>; next: number | null } }>(
    'SELECT sophia.personal_answer_control_log($1, $2) AS page',
    [after, limit],
  )
  return onlyRow(rows, 'personal_answer_control_log').page
}
