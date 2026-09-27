// The room's exchange with Sophia (db/migrations/0013, contract amendment A06). Member calls run inside
// withActor; the media bridge's calls inside withService, where the sophia.media_* functions refuse a member
// identity. What the snapshot says about Sophia is what the bridge last observed, and nothing more.
import type pg from 'pg'
import type {
  ExchangeReceipt,
  ExchangeRequest,
  ExchangeState,
  MediaAssignment,
  SophiaPresence,
} from '@sophia/contracts'
import { safeInt } from './bigint.ts'
import { onlyRow } from './rows.ts'

/** A bridge that has not reported for this long is not heard: its voice is `unavailable`. */
export const PRESENCE_FRESH_SECONDS = 20

export type ExchangeAction = 'end' | 'stop_speaking' | 'look' | 'stop_looking' | 'resume'

/** startExchange. Call inside withActor(..., "write"). */
export async function startExchange(
  c: pg.PoolClient,
  roomId: string,
  idempotencyKey: string,
  req: ExchangeRequest,
): Promise<ExchangeReceipt> {
  const { rows } = await c.query<{ receipt: ExchangeReceipt }>(
    `SELECT sophia.start_exchange($1, $2, $3, $4) AS receipt`,
    [roomId, req.expectedRoomRevision, req.allowVision, idempotencyKey],
  )
  return onlyRow(rows, 'start_exchange').receipt
}

/** End, Stop Speaking, Show Sophia this, Stop Looking or Resume. Call inside withActor(..., "write"). */
export async function controlExchange(
  c: pg.PoolClient,
  exchangeId: string,
  action: ExchangeAction,
  source: 'screen' | 'camera' | null = null,
): Promise<ExchangeState> {
  const { rows } = await c.query<{ state: ExchangeState }>(`SELECT sophia.control_exchange($1, $2, $3) AS state`, [
    exchangeId,
    action,
    source,
  ])
  return onlyRow(rows, 'control_exchange').state
}

interface ExchangeRow {
  id: string
  state: 'open' | 'paused'
  pause_reason: SophiaPresence['pauseReason']
  input_epoch: string
  playback_epoch: string
  observation_epoch: string
  allow_vision: boolean
  look_identity: string | null
  look_source: 'screen' | 'camera' | null
  input_actor: string | null
}

interface PresenceRow {
  exchange_id: string | null
  voice: 'connecting' | 'ready' | 'recovering' | 'unavailable'
  reason: string | null
  reported_at: Date
  fresh: boolean
}

const NOT_CONNECTED: SophiaPresence = {
  exchangeId: null,
  exchange: 'none',
  pauseReason: null,
  voice: 'not_connected',
  inputActorId: null,
  inputEpoch: null,
  playbackEpoch: null,
  observationEpoch: null,
  allowVision: false,
  looking: null,
  reason: null,
  reportedAt: null,
}

/** Voice as observed: the bridge's report for this exchange while it is fresh, else unavailable. */
function voiceOf(exchangeId: string, presence: PresenceRow | undefined): Pick<SophiaPresence, 'voice' | 'reason'> {
  if (!presence?.fresh) return { voice: 'unavailable', reason: 'Sophia’s voice service is not reporting' }
  if (presence.exchange_id !== exchangeId) return { voice: 'connecting', reason: null }
  return { voice: presence.voice, reason: presence.reason }
}

/** Sophia in this room, for the snapshot. Call inside withActor(..., "read"). */
export async function readSophia(c: pg.PoolClient, roomId: string): Promise<SophiaPresence> {
  const exchanges = await c.query<ExchangeRow>(
    `SELECT e.id, e.state, e.pause_reason, e.input_epoch, e.playback_epoch, e.observation_epoch, e.allow_vision,
            e.look_identity, e.look_source, i.actor_id AS input_actor
       FROM sophia.room_exchanges e
       LEFT JOIN sophia.exchange_inputs i ON i.exchange_id = e.id AND i.input_epoch = e.input_epoch
      WHERE e.room_id = $1 AND e.state <> 'ended'`,
    [roomId],
  )
  const e = exchanges.rows[0]
  if (!e) return NOT_CONNECTED
  const presence = await c.query<PresenceRow>(
    `SELECT exchange_id, voice, reason, reported_at, reported_at > now() - make_interval(secs => $2) AS fresh
       FROM sophia.room_ai_presence WHERE room_id = $1`,
    [roomId, PRESENCE_FRESH_SECONDS],
  )
  const reported = presence.rows[0]
  return {
    exchangeId: e.id,
    exchange: e.state,
    pauseReason: e.pause_reason,
    ...voiceOf(e.id, reported),
    inputActorId: e.input_actor,
    inputEpoch: safeInt(e.input_epoch, 'inputEpoch'),
    playbackEpoch: safeInt(e.playback_epoch, 'playbackEpoch'),
    observationEpoch: safeInt(e.observation_epoch, 'observationEpoch'),
    allowVision: e.allow_vision,
    looking: e.look_identity && e.look_source ? { participantIdentity: e.look_identity, source: e.look_source } : null,
    reportedAt: reported ? reported.reported_at.toISOString() : null,
  }
}

/** What the bridge must serve, without room tokens (the API adds those). Call inside withService. */
export async function mediaAssignments(c: pg.PoolClient): Promise<Array<Omit<MediaAssignment, 'roomToken'>>> {
  const { rows } = await c.query<{ list: Array<Omit<MediaAssignment, 'roomToken'>> }>(
    `SELECT sophia.media_assignments() AS list`,
  )
  return onlyRow(rows, 'media_assignments').list
}

export interface PresenceReport {
  roomId: string
  exchangeId: string | null
  bridgeInstanceId: string
  voice: 'connecting' | 'ready' | 'recovering' | 'unavailable'
  reason: string | null
  participants: ReadonlyArray<{ identity: string; standing: string }>
}

export async function reportPresence(c: pg.PoolClient, report: PresenceReport): Promise<void> {
  await c.query(`SELECT sophia.media_report_presence($1)`, [JSON.stringify(report)])
}

/** A guest asks for their token: pause a live exchange and open a quiesce request (null: no exchange). */
export async function requestGuestQuiesce(c: pg.PoolClient, entryId: string): Promise<string | null> {
  const { rows } = await c.query<{ r: { requestId: string | null } }>(`SELECT sophia.request_guest_quiesce($1) AS r`, [
    entryId,
  ])
  return onlyRow(rows, 'request_guest_quiesce').r.requestId
}

export async function quiesceAcked(c: pg.PoolClient, requestId: string): Promise<boolean> {
  const { rows } = await c.query<{ acked: boolean | null }>(`SELECT sophia.quiesce_acked($1) AS acked`, [requestId])
  return rows[0]?.acked === true
}

export async function ackQuiesce(c: pg.PoolClient, requestId: string, bridgeInstanceId: string): Promise<void> {
  await c.query(`SELECT sophia.media_ack_quiesce($1, $2)`, [requestId, bridgeInstanceId])
}

/** The holder left or stayed gone: 'paused', 'cleared', or 'stale' when the floor or epoch moved on. */
export async function holderEvent(
  c: pg.PoolClient,
  event: { exchangeId: string; actorId: string; inputEpoch: number; event: 'left' | 'gone' },
): Promise<'paused' | 'cleared' | 'stale'> {
  const { rows } = await c.query<{ outcome: 'paused' | 'cleared' | 'stale' }>(
    `SELECT sophia.media_holder_event($1, $2, $3, $4) AS outcome`,
    [event.exchangeId, event.actorId, event.inputEpoch, event.event],
  )
  return onlyRow(rows, 'media_holder_event').outcome
}

/** The project a tool call acts in, when its speaker is bound to its input epoch; otherwise it raises. */
export async function toolSpeaker(
  c: pg.PoolClient,
  exchangeId: string,
  inputEpoch: number,
  actorId: string,
): Promise<{ projectId: string; roomId: string; currentEpoch: number }> {
  const { rows } = await c.query<{ s: { projectId: string; roomId: string; currentEpoch: number } }>(
    `SELECT sophia.media_tool_speaker($1, $2, $3) AS s`,
    [exchangeId, inputEpoch, actorId],
  )
  return onlyRow(rows, 'media_tool_speaker').s
}

/** The bridge announced a finished result in this exchange; recorded once. Call inside withService. */
export async function recordAnnounced(
  c: pg.PoolClient,
  event: { exchangeId: string; taskId: string; resultRevision: number },
): Promise<void> {
  await c.query(`SELECT sophia.media_record_announced($1, $2, $3)`, [
    event.exchangeId,
    event.taskId,
    event.resultRevision,
  ])
}
