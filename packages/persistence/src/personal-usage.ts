// What a live personal companion's model calls cost (0073): reserved before the provider is asked, settled from the
// usage it reported, held uncertain when that is unknown, released when it was never asked. Content-free: amounts and
// token counts only. Each runs as the calling owner (withActor), on the call 0021's begin_companion_call registered.
import type pg from 'pg'
import { onlyRow } from './rows.ts'

/** Why a call may (`reserved`) or may not be asked: unadmitted payer, a payer's call uncertain, allowance spent, stale call. */
export type PersonalReservation = 'reserved' | 'not_admitted' | 'held' | 'exhausted' | 'not_current'

/** The token counts a provider reported for one call, as kept. */
export interface PersonalUsageCounts {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

const RESERVATIONS: readonly PersonalReservation[] = ['reserved', 'not_admitted', 'held', 'exhausted', 'not_current']
const isReservation = (value: string): value is PersonalReservation => RESERVATIONS.some((r) => r === value)

export async function reservePersonalCompanion(
  c: pg.PoolClient,
  callId: string,
  payer: string,
  routeId: string,
  micros: number,
): Promise<PersonalReservation> {
  const { rows } = await c.query<{ outcome: string }>(
    'SELECT sophia.reserve_personal_companion($1, $2, $3, $4) AS outcome',
    [callId, payer, routeId, micros],
  )
  const { outcome } = onlyRow(rows, 'reserve_personal_companion')
  if (!isReservation(outcome)) throw new Error('reserve_personal_companion answered an unknown outcome')
  return outcome
}

export async function settlePersonalCompanion(
  c: pg.PoolClient,
  callId: string,
  usedMicros: number,
  usage: PersonalUsageCounts,
): Promise<boolean> {
  const { rows } = await c.query<{ done: boolean }>('SELECT sophia.settle_personal_companion($1, $2, $3) AS done', [
    callId,
    usedMicros,
    JSON.stringify(usage),
  ])
  return onlyRow(rows, 'settle_personal_companion').done
}

/** `reason` is a content-free code (lowercase letters and underscores), never a provider's message. */
export async function holdPersonalCompanion(c: pg.PoolClient, callId: string, reason: string): Promise<boolean> {
  const { rows } = await c.query<{ done: boolean }>('SELECT sophia.hold_personal_companion($1, $2) AS done', [
    callId,
    reason,
  ])
  return onlyRow(rows, 'hold_personal_companion').done
}

export async function releasePersonalCompanion(c: pg.PoolClient, callId: string, reason: string): Promise<boolean> {
  const { rows } = await c.query<{ done: boolean }>('SELECT sophia.release_personal_companion($1, $2) AS done', [
    callId,
    reason,
  ])
  return onlyRow(rows, 'release_personal_companion').done
}

export async function personalCompanionAdmitted(
  c: pg.ClientBase | pg.Pool,
  payer: string,
  owner: string,
): Promise<boolean> {
  const { rows } = await c.query<{ admitted: boolean }>(
    'SELECT sophia.personal_companion_admitted($1, $2) AS admitted',
    [payer, owner],
  )
  return onlyRow(rows, 'personal_companion_admitted').admitted
}

/** What a settlement with its answer did (0078): kept with the answer, settled with nothing kept, or not settled. */
export type PersonalSettledOutcome = 'kept' | 'settled' | 'not_settled'

/**
 * The call settles from its usage and its answer is kept for its live turn, in one transaction (0078, 4319508047):
 * bound by the call's usage row and the turn, not by a claim; after an erasure nothing is kept.
 */
export async function settlePersonalCompanionAnswer(
  c: pg.PoolClient,
  call: { callId: string; turnId: string },
  used: { micros: number; counts: PersonalUsageCounts },
  answer: { text: string; suggestion: string | null },
): Promise<PersonalSettledOutcome> {
  const { rows } = await c.query<{ outcome: string }>(
    'SELECT sophia.settle_personal_companion_answer($1, $2, $3, $4, $5, $6) AS outcome',
    [call.callId, call.turnId, used.micros, JSON.stringify(used.counts), answer.text, answer.suggestion],
  )
  const { outcome } = onlyRow(rows, 'settle_personal_companion_answer')
  if (outcome !== 'kept' && outcome !== 'settled' && outcome !== 'not_settled')
    throw new Error('settle_personal_companion_answer answered an unknown outcome')
  return outcome
}

/** The answer kept for one of the owner's turns (0078), or null: read only. */
export async function readPersonalSettledAnswer(
  c: pg.PoolClient,
  turnId: string,
): Promise<{ text: string; suggestion: string | null } | null> {
  const { rows } = await c.query<{ kept: { text: string; suggestion: string | null } | null }>(
    'SELECT sophia.personal_settled_answer($1) AS kept',
    [turnId],
  )
  return rows[0]?.kept ?? null
}

/** The turn's reply written from its kept answer under `claim`, the kept answer let go with it (0078); false if not. */
export async function recordPersonalSettledReply(c: pg.PoolClient, turnId: string, claim: string): Promise<boolean> {
  const { rows } = await c.query<{ receipt: unknown }>(
    'SELECT sophia.record_personal_settled_reply($1, $2) AS receipt',
    [turnId, claim],
  )
  return (rows[0]?.receipt ?? null) !== null
}

/** Whether 0078 is installed: a live call is not admitted without it, so no answer is paid for that can't be kept. */
export async function personalSettledAnswersInstalled(c: pg.ClientBase | pg.Pool): Promise<boolean> {
  const { rows } = await c.query<{ installed: boolean }>(
    `SELECT to_regprocedure('sophia.settle_personal_companion_answer(uuid,uuid,bigint,jsonb,text,text)') IS NOT NULL
      AS installed`,
  )
  return onlyRow(rows, 'personal_settled_answers_installed').installed
}
