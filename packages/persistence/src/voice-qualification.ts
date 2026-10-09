// Voice qualification evidence (migration 0046; docs/plans/voice-qualification-g7.md, sophia.voice-qualification.v1).
// Off unless the migration owner grants it. The bridge's receipts carry counts, booleans, ids, timings and SHA-256
// chains over PCM it forwarded or played: never a transcript, a caption, typed words or audio.
import type pg from 'pg'
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
 * The exchange a bound voice tool call ran in, under the key its command is admitted with (live:<exchange>:...): the
 * canonical join from a native task to the exchange that asked for it. Call inside withService, after toolSpeaker.
 */
export async function recordLiveCall(
  c: pg.PoolClient,
  call: { exchangeId: string; inputEpoch: number; actorId: string; key: string },
): Promise<void> {
  await c.query(`SELECT sophia.media_record_live_call($1,$2,$3,$4)`, [
    call.exchangeId,
    call.inputEpoch,
    call.actorId,
    call.key,
  ])
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
