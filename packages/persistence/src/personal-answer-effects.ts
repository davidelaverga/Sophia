// The Personal answer effect guard's typed callers (INC03-CC-003 A2, migration 0102; docs/plans/personal-answers.md).
// What it guarantees:
// - A fresh answer reservation of the live companion goes through 0102's guard when it is installed: 0080's kept, lost
//   and stale-claim outcomes first, then, for an automatic turn (a 0098 input), its admitted 0101 decision and the
//   server's fresh profile compared with the one that decision froze, before 0080 decides.
// - Without 0102 the origin is read positively: an automatic turn is refused (`not_installed`) unless its answer is
//   already kept ('kept', no spend); only a turn with no input (or a database without 0098's table) is legacy and
//   reserves through 0080 as before.
// - A failed or uncertain read throws: nothing falls back to 0080 on an error.
// Call inside withActor(..., 'write') (reservation) or withActor(..., 'read') (reads); the owner is the verified actor.
import type pg from 'pg'
import type { PersonalAnswerProfile } from './personal-admission.ts'
import { readPersonalSettledAnswer, reservePersonalAnswer, type PersonalReservation } from './personal-usage.ts'
import { onlyRow } from './rows.ts'

/**
 * What a guarded reservation answers: 0080's outcomes, or why a fresh automatic answer may not be paid for. An automatic
 * turn without a valid admission answers 'not_admitted'; a database without 0102 answers 'not_installed' for one.
 */
export type PersonalAnswerEffect =
  PersonalReservation | 'kept' | 'lost' | 'profile_mismatch' | 'profile_unsupported' | 'not_installed'

const EFFECTS: readonly string[] = [
  'reserved',
  'not_admitted',
  'held',
  'exhausted',
  'not_current',
  'kept',
  'lost',
  'profile_mismatch',
  'profile_unsupported',
]
const isEffect = (value: string): value is PersonalAnswerEffect => EFFECTS.includes(value)

/** Whether a turn's answer is the person's legacy turn or an automatic_v1 input's (0098). */
export type PersonalAnswerOrigin = 'legacy' | 'automatic'

/**
 * The guard's own signature, its name joined so this read is never taken for a reservation statement (the live tests'
 * pool gates count the statements naming the reservation).
 */
const GUARD = `'sophia.reserve_personal_' || 'answer_guarded(uuid,text,text,bigint,uuid,uuid,jsonb)'`

/** Whether 0102's guard is installed. */
export async function personalAnswerGuardInstalled(c: pg.ClientBase | pg.Pool): Promise<boolean> {
  const { rows } = await c.query<{ installed: boolean }>(`SELECT to_regprocedure(${GUARD}) IS NOT NULL AS installed`)
  return onlyRow(rows, 'personal_answer_guard_installed').installed
}

/**
 * The caller's turn's origin, positively: automatic when an automatic_v1 input (0098) keeps it, legacy only when none
 * does or the database has no such table. An error is thrown, never read as legacy.
 */
export async function readPersonalAnswerOrigin(c: pg.ClientBase, turnId: string): Promise<PersonalAnswerOrigin> {
  const table = await c.query<{ present: boolean }>(
    `SELECT to_regclass('sophia.personal_inputs') IS NOT NULL AS present`,
  )
  if (!onlyRow(table.rows, 'personal_inputs_installed').present) return 'legacy'
  const { rows } = await c.query<{ automatic: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM sophia.personal_inputs i WHERE i.owner_id = sophia.actor_id() AND i.turn_id = $1)
       AS automatic`,
    [turnId],
  )
  return onlyRow(rows, 'personal_answer_origin').automatic ? 'automatic' : 'legacy'
}

/** What a fresh answer would spend, and under which trusted profile. */
export interface PersonalAnswerSpend {
  payer: string
  routeId: string
  micros: number
  /** The server's own profile, built for this call from its live settings; null when they make none 0101 accepts. */
  profile: PersonalAnswerProfile | null
}

/**
 * The call reserved to answer `call.turnId` under its claim, through 0102's guard. A refusal is returned, its diagnostic
 * written in the caller's transaction; the caller throws only after it commits.
 */
export async function reserveGuardedPersonalAnswer(
  c: pg.PoolClient,
  call: { callId: string; turnId: string; claim: string },
  spend: PersonalAnswerSpend,
): Promise<PersonalAnswerEffect> {
  const { payer, routeId, micros, profile } = spend
  if (!(await personalAnswerGuardInstalled(c))) {
    if ((await readPersonalAnswerOrigin(c, call.turnId)) === 'legacy')
      return reservePersonalAnswer(c, call, payer, routeId, micros)
    // An automatic turn's answer already kept is still written (no spend); nothing new is reserved without the guard.
    return (await readPersonalSettledAnswer(c, call.turnId)) ? 'kept' : 'not_installed'
  }
  const { rows } = await c.query<{ outcome: string }>(
    'SELECT sophia.reserve_personal_answer_guarded($1, $2, $3, $4, $5, $6, $7) AS outcome',
    [call.callId, payer, routeId, micros, call.turnId, call.claim, profile === null ? null : JSON.stringify(profile)],
  )
  const { outcome } = onlyRow(rows, 'reserve_personal_answer_guarded')
  if (!isEffect(outcome)) throw new Error('reserve_personal_answer_guarded answered an unknown outcome')
  return outcome
}

export type PersonalAnswerRefusalReason =
  'no_decision' | 'waiting' | 'cancelled' | 'decision_stale' | 'profile_unsupported' | 'profile_mismatch'

/** One bounded diagnostic of a refused fresh answer: codes and field names only, never a value. */
export interface PersonalAnswerRefusal {
  inputId: string
  turnId: string
  /** The input's latest decision when refused; 0 when it had none. */
  decisionSeq: number
  epoch: number
  reason: PersonalAnswerRefusalReason
  fields: string[]
  attempts: number
  firstAt: string
  lastAt: string
}

interface RefusalRow {
  input_id: string
  turn_id: string
  decision_seq: number
  epoch: string
  reason: PersonalAnswerRefusalReason
  fields: string[]
  attempts: number
  first_at: string
  last_at: string
}

/** The caller's own refusal diagnostics (0102), oldest first: owner-only by its filter and by RLS. */
export async function readPersonalAnswerRefusals(c: pg.ClientBase): Promise<PersonalAnswerRefusal[]> {
  const { rows } = await c.query<RefusalRow>(
    `SELECT input_id, turn_id, decision_seq, epoch::text AS epoch, reason, fields, attempts,
            to_char(first_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS first_at,
            to_char(last_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_at
       FROM sophia.personal_answer_effect_refusals
      WHERE owner_id = sophia.actor_id()
      ORDER BY first_at, input_id, decision_seq`,
  )
  return rows.map((r) => ({
    inputId: r.input_id,
    turnId: r.turn_id,
    decisionSeq: r.decision_seq,
    epoch: Number(r.epoch),
    reason: r.reason,
    fields: r.fields,
    attempts: r.attempts,
    firstAt: r.first_at,
    lastAt: r.last_at,
  }))
}
