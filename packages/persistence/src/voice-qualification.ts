// Voice qualification evidence (migration 0046; docs/plans/voice-qualification-g7.md, sophia.voice-qualification.v1).
// Off unless the migration owner grants it. The bridge's receipts carry counts, booleans, ids, timings and SHA-256
// chains over PCM it forwarded or played: never a transcript, a caption, typed words or audio.
import type pg from 'pg'
import type { MediaToolResult } from '@sophia/contracts'
import { classifyDbError, pgError } from './errors.ts'
import { onlyRow } from './rows.ts'

export type QualificationReceiptKind = 'input_window' | 'input_turn' | 'provider' | 'output_reply' | 'session_closed'

export interface QualificationEvidenceWrite {
  exchangeId: string
  grantId: string
  seq: number
  kind: QualificationReceiptKind
  /** Already checked against its schema by the caller (the API's contract). */
  receipt: Record<string, unknown>
}

/** Whether the guard ended the exchange, and why (deadline, expired, revoked, connections, turns, usage). */
export interface QualificationEvidenceAck {
  ended: boolean
  reason: string | null
}

/**
 * End every exchange under a grant that is past its deadline, revoked, expired or over a limit. Call inside
 * withService, after the bridge's report or before reading its assignments. Returns how many it ended.
 */
export async function voiceQualificationGuard(c: pg.PoolClient): Promise<number> {
  const { rows } = await c.query<{ ended: number }>(`SELECT sophia.voice_qualification_guard() AS ended`)
  return onlyRow(rows, 'voice_qualification_guard').ended
}

/**
 * Maintenance, on the worker's login: delete the voice qualification receipts past their 24 hours (0046,
 * voice_evidence_expire). Run by the worker's periodic pass, so retention holds whether or not a bridge reports and
 * whatever the API's switch says. A database without 0046 holds none: nothing is asked of it, and it answers 0.
 */
export async function expireVoiceEvidence(pool: pg.Pool): Promise<number> {
  try {
    const present = await pool.query<{ ok: boolean }>(
      `SELECT to_regprocedure('sophia.voice_evidence_expire()') IS NOT NULL AS ok`,
    )
    if (!present.rows[0]?.ok) return 0
    const { rows } = await pool.query<{ n: number }>(`SELECT sophia.voice_evidence_expire() AS n`)
    return onlyRow(rows, 'voice_evidence_expire').n
  } catch (err: unknown) {
    throw classifyDbError(err)
  }
}

/**
 * What the bridge reserves before it spends on an exchange under a grant, or its own stop (0046, media_voice_reserve).
 */
export interface QualificationReserve {
  exchangeId: string
  grantId: string
  kind: 'connection' | 'generation' | 'unasked' | 'spend' | 'stop'
  /** The connection a generation or a top-up is charged to: a durable ordinal a 'connection' reservation returned. */
  ordinal?: number
  /**
   * A generation's worst case, with the text it sends and, for one input asked for, what fills its connection's input
   * allowance; or a top-up of that allowance ('spend', a charge only: it counts no turn).
   */
  charge?: number
}

/** Granted (with a connection's durable ordinal), or refused, and then the exchange has ended, and why. */
export interface QualificationReservation {
  ok: boolean
  ordinal: number | null
  stop: string | null
  ended: boolean
}

/**
 * Reserve a provider connection, a generation or a top-up of a connection's input allowance against the exchange's
 * durable bound, under the project's and the exchange's locks. A reservation that does not fit ends the exchange. Call
 * inside withService.
 */
export async function reserveQualification(
  c: pg.PoolClient,
  reserve: QualificationReserve,
): Promise<QualificationReservation> {
  const { rows } = await c.query<{ r: QualificationReservation }>(
    `SELECT sophia.media_voice_reserve($1,$2,$3,$4,$5) AS r`,
    [reserve.exchangeId, reserve.grantId, reserve.kind, reserve.ordinal ?? null, reserve.charge ?? null],
  )
  return onlyRow(rows, 'media_voice_reserve').r
}

/** A bridge receipt for an exchange under a grant. Call inside withService. */
export async function recordQualificationEvidence(
  c: pg.PoolClient,
  write: QualificationEvidenceWrite,
): Promise<QualificationEvidenceAck> {
  const { rows } = await c.query<{ ack: QualificationEvidenceAck }>(
    `SELECT sophia.media_record_evidence($1,$2,$3,$4,$5) AS ack`,
    [write.exchangeId, write.grantId, write.seq, write.kind, JSON.stringify(write.receipt)],
  )
  return onlyRow(rows, 'media_record_evidence').ack
}

/** What the grant's principal may read of an exchange their grant covered. Call inside withActor(..., 'read'). */
export async function readQualificationEvidence(c: pg.PoolClient, exchangeId: string): Promise<unknown> {
  const { rows } = await c.query<{ evidence: unknown }>(
    `SELECT sophia.voice_qualification_evidence_read($1) AS evidence`,
    [exchangeId],
  )
  return onlyRow(rows, 'voice_qualification_evidence_read').evidence
}

/** The grant a room token names for its principal while it is active, or null. Call inside withActor. */
export async function roomQualification(
  c: pg.PoolClient,
  roomId: string,
): Promise<{ grantId: string; runBindingSha256: string } | null> {
  const { rows } = await c.query<{ q: { grantId: string; runBindingSha256: string } | null }>(
    `SELECT sophia.voice_room_qualification($1) AS q`,
    [roomId],
  )
  return rows[0]?.q ?? null
}

/**
 * The exchange a bound voice tool call ran in, and the tool it named, under the key its command is admitted with
 * (live:<exchange>:...). Whether it is recorded: only a call of a grant's principal, in an exchange under that grant,
 * is. Call inside withService, after toolSpeaker.
 */
export async function recordLiveCall(
  c: pg.PoolClient,
  call: { exchangeId: string; inputEpoch: number; actorId: string; key: string; name: string },
): Promise<boolean> {
  const { rows } = await c.query<{ recorded: boolean }>(
    `SELECT sophia.media_record_live_call($1,$2,$3,$4,$5) AS recorded`,
    [call.exchangeId, call.inputEpoch, call.actorId, call.key, call.name],
  )
  return onlyRow(rows, 'media_record_live_call').recorded
}

/** A recorded call's answer, once it was answered: its outcome, the command it admitted and that command's task. */
export interface LiveCallAnswer {
  outcome: MediaToolResult['status']
  commandId: string | null
  taskId: string | null
}

/**
 * A recorded voice call's answer, if it was answered (0047, media_live_call_answer; Codex P1 r4234171899): a recorded
 * call once answered is terminal, and its repeat is answered from this, running nothing. Null for a call answered by
 * no one yet. withService, in the transaction that binds and records the call, after recordLiveCall said true.
 */
export async function liveCallAnswer(
  c: pg.PoolClient,
  call: { exchangeId: string; actorId: string; key: string },
): Promise<LiveCallAnswer | null> {
  const { rows } = await c.query<{ answer: LiveCallAnswer | null }>(
    `SELECT sophia.media_live_call_answer($1,$2,$3) AS answer`,
    [call.exchangeId, call.actorId, call.key],
  )
  return onlyRow(rows, 'media_live_call_answer').answer
}

/**
 * 0046's mark of a recorded call's answer, under no fence's generation: the API's path no longer calls it (0047
 * live_call_seal and media_mark_live_call write the answer under the fence's generation instead). withService.
 */
export async function answerLiveCall(
  c: pg.PoolClient,
  call: { exchangeId: string; actorId: string; key: string; outcome: string },
): Promise<void> {
  await c.query(`SELECT sophia.media_answer_live_call($1,$2,$3,$4)`, [
    call.exchangeId,
    call.actorId,
    call.key,
    call.outcome,
  ])
}

/**
 * The next generation of a call key's fence, for the attempt that now holds it (0047 media_fence_live_call; Codex P1
 * r4234782534): on the fence's own session, once its advisory lock is held, in a statement of its own. It waits for a
 * seal still holding the key's row. A bigint, as PostgreSQL returns it (text).
 */
export async function fenceLiveCall(c: pg.ClientBase, exchangeId: string, key: string): Promise<string> {
  const { rows } = await c.query<{ generation: string }>(`SELECT sophia.media_fence_live_call($1,$2) AS generation`, [
    exchangeId,
    key,
  ])
  return onlyRow(rows, 'media_fence_live_call').generation
}

/** A recorded call's answer under its attempt's fence: the outcome, and the generation that attempt took. */
export interface FencedAnswer {
  exchangeId: string
  key: string
  generation: string
  outcome: MediaToolResult['status']
}

/**
 * A recorded call's answer, sealed in the speaker's own transaction that writes what the call does (0047
 * live_call_seal): its last statement, so the write and the answer commit together, or neither does. Raises 'Fence
 * moved' (isFenceMoved) when another attempt took the call's fence since, and the transaction must not commit.
 */
export async function sealLiveCall(c: pg.PoolClient, call: FencedAnswer): Promise<void> {
  await c.query(`SELECT sophia.live_call_seal($1,$2,$3,$4)`, [call.exchangeId, call.key, call.generation, call.outcome])
}

/**
 * A recorded call that wrote nothing, answered under its attempt's fence (0047 media_mark_live_call). withService.
 * Raises 'Fence moved' (isFenceMoved) when another attempt took the call's fence since: nothing is marked.
 */
export async function markLiveCall(c: pg.PoolClient, call: FencedAnswer & { actorId: string }): Promise<void> {
  await c.query(`SELECT sophia.media_mark_live_call($1,$2,$3,$4,$5)`, [
    call.exchangeId,
    call.actorId,
    call.key,
    call.generation,
    call.outcome,
  ])
}

/** Whether a seal or a mark was refused because another attempt took the call's fence: the error, or its cause. */
export function isFenceMoved(err: unknown): boolean {
  const cause = err instanceof Error && err.cause !== undefined ? err.cause : err
  const { code, message } = pgError(cause)
  return code === '40001' && message.startsWith('Fence moved')
}

/**
 * The command this transaction admits under `key` is the recorded voice call's (0046 live_call_admits): it is linked to
 * the call as it is inserted, the canonical join from its task to the exchange. Call inside the speaker's own
 * withActor(..., 'write'), before the admission, only on a voice tool call's path with voice qualification on.
 */
export async function liveCallAdmits(c: pg.PoolClient, projectId: string, key: string): Promise<void> {
  await c.query(`SELECT sophia.live_call_admits($1,$2)`, [projectId, key])
}

/** A member's own voice tool calls in an exchange, in the order they were recorded (A15 ExchangeCalls). */
export interface ExchangeCalls {
  exchangeId: string
  readAt: string
  calls: Array<{
    seq: number
    recordedAt: string
    inputEpoch: number
    tool: string
    answeredAt: string | null
    outcome: string | null
    command: {
      commandId: string
      kind: string
      goalId: string | null
      authorityEpoch: number | null
      goalRevision: number | null
      state: string
      createdAt: string
    } | null
    taskId: string | null
  }>
}

/**
 * Call inside withActor(..., 'read'). With `after` (an earlier read's readAt), only calls whose recording began after
 * it. An exchange outside the caller's projects is not found.
 */
export async function readExchangeCalls(
  c: pg.PoolClient,
  exchangeId: string,
  after: string | null = null,
): Promise<ExchangeCalls> {
  const { rows } = await c.query<{ x: ExchangeCalls }>(`SELECT sophia.exchange_calls($1, $2::timestamptz) AS x`, [
    exchangeId,
    after,
  ])
  return onlyRow(rows, 'exchange_calls').x
}

/** The room as the bridge last saw it, for a member: only whether they are in it, the counts and the report's age. */
export interface LivePresence {
  roomId: string
  observed: boolean
  reportedAt: string | null
  fresh: boolean
  voice: 'connecting' | 'ready' | 'recovering' | 'unavailable' | null
  exchangeId: string | null
  selfPresent: boolean
  participants: number
  guests: number
  emptySince: string | null
}

/** Call inside withActor(..., 'read'). A room outside the caller's projects is not found. */
export async function readLivePresence(c: pg.PoolClient, roomId: string): Promise<LivePresence> {
  const { rows } = await c.query<{ p: LivePresence }>(`SELECT sophia.room_live_presence($1) AS p`, [roomId])
  return onlyRow(rows, 'room_live_presence').p
}

/**
 * The exchange each of these tasks was created in by a voice tool call (0046), for a member. A task no such call created
 * is absent from the map. Call inside withActor(..., 'read'), only with voice qualification on.
 */
export async function readTaskExchanges(
  c: pg.PoolClient,
  projectId: string,
  taskIds: readonly string[],
): Promise<Map<string, string>> {
  if (taskIds.length === 0) return new Map()
  const { rows } = await c.query<{ task_id: string; exchange_id: string }>(
    `SELECT task_id, exchange_id FROM sophia.native_task_exchanges($1, $2::uuid[])`,
    [projectId, [...taskIds]],
  )
  return new Map(rows.map((r) => [r.task_id, r.exchange_id]))
}

/**
 * The sources a research, design or review task drew on that are withdrawn now (0046, task_withdrawn_sources): its
 * attempt's consumed closure, computed live. Null for any other kind of task; a task the caller cannot see is not found.
 * Call inside withActor(..., 'read'), only with voice qualification on.
 */
export async function readWithdrawnSources(
  c: pg.PoolClient,
  projectId: string,
  taskId: string,
): Promise<string[] | null> {
  const { rows } = await c.query<{ ids: string[] | null }>(`SELECT sophia.task_withdrawn_sources($1, $2) AS ids`, [
    projectId,
    taskId,
  ])
  return onlyRow(rows, 'task_withdrawn_sources').ids
}
