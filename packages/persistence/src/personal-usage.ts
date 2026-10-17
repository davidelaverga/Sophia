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
