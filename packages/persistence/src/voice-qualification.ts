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
