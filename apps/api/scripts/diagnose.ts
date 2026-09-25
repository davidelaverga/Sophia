// S1-05A production diagnosis for the operator (Codex), returned to the implementer as evidence.
// Read only. Each database section runs inside a READ ONLY transaction (a section that fails is rolled back and the
// next one starts a new READ ONLY transaction); the LiveKit part only lists rooms and participants.
// Public output is an explicit allowlist (apps/api/src/diagnostics/sanitize.ts): every column has a declared kind,
// ids pass as 8 hex characters, free text passes only as a known system code or a `redacted:<hash8>` reference,
// enumerations and system codes only from their field's own vocabulary, and undeclared columns are dropped. LiveKit
// rooms appear as counts and Sophia's own state, never a person. Review the JSON before posting anyway.
//
//   SOPHIA_DIAGNOSE_DATABASE_URL=<a login that can read the sophia schema, verify-full TLS>
//   [LIVEKIT_URL=… LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=…]      also list LiveKit rooms and who is in them
//   node apps/api/scripts/diagnose.ts [--project <uuid>] [--limit 20]
import { parseArgs } from 'node:util'
import { RoomServiceClient } from 'livekit-server-sdk'
import pg from 'pg'
import {
  EVENT_TYPES,
  field,
  OUTBOX_DESTINATIONS,
  RECEIPT_STAGES,
  roomSummary,
  type RowSchema,
  sanitizeRow,
  shortId,
  sqlState,
  SUMMARY_CODES,
} from '../src/diagnostics/sanitize.ts'

const { values } = parseArgs({ options: { project: { type: 'string' }, limit: { type: 'string' } } })
const limit = Math.min(Math.max(Number(values.limit ?? 20) || 20, 1), 200)
const project = values.project && /^[0-9a-f-]{36}$/.test(values.project) ? values.project : null
const scope = (column = 'project_id') => (project ? `WHERE ${column} = $1` : 'WHERE true')
const params = () => (project ? [project] : [])

const TASK_STATES = ['pending', 'running', 'succeeded', 'failed', 'cancelled', 'outcome_unknown'] as const
const PHASES = [
  'queued',
  'dispatched',
  'running',
  'result_ready',
  'holding',
  'held',
  'stopping',
  'stopped',
  'denied',
  'failed',
  'outcome_unknown',
] as const

interface Section {
  name: string
  sql: () => string
  schema: RowSchema
}

const SECTIONS: readonly Section[] = [
  {
    name: 'migrations',
    sql: () => `SELECT version, filename, sha256, applied_at FROM sophia_meta.schema_migrations ORDER BY version`,
    schema: { version: 'version', filename: 'migration', sha256: 'sha256', applied_at: 'time' },
  },
  {
    name: 'runtimes',
    sql: () => `SELECT project_id, id, runtime_unit_id, state, lease_epoch, bridge_instance_id, hello_at, ready_state,
                       ready_reason, ready_at, seen_at, jsonb_array_length(unrecovered) AS unrecovered, command_sequence
                  FROM sophia.runtime_instances ${scope()} ORDER BY created_at DESC LIMIT ${limit}`,
    schema: {
      project_id: 'id',
      id: 'id',
      runtime_unit_id: 'digest',
      state: { enum: ['active', 'revoked'] },
      lease_epoch: 'int',
      bridge_instance_id: 'digest',
      hello_at: 'time',
      ready_state: { enum: ['ready', 'not_ready'] },
      ready_reason: 'text',
      ready_at: 'time',
      seen_at: 'time',
      unrecovered: 'int',
      command_sequence: 'int',
    },
  },
  {
    name: 'native_tasks',
    sql: () => `SELECT project_id, id, goal_id, state, phase, reason, created_at, result_source_id IS NOT NULL AS has_result
                  FROM sophia.native_task_view ${scope()} ORDER BY created_at DESC LIMIT ${limit}`,
    schema: {
      project_id: 'id',
      id: 'id',
      goal_id: 'id',
      state: { enum: TASK_STATES },
      phase: { enum: PHASES },
      reason: 'text',
      created_at: 'time',
      has_result: 'bool',
    },
  },
  {
    name: 'native_outbox',
    sql: () => `SELECT project_id, id, destination, state, attempts, outcome_reason, available_at, created_at
                  FROM sophia.outbox ${scope()} AND (destination LIKE 'native.%' OR destination = 'control.settle')
                 ORDER BY created_at DESC LIMIT ${limit}`,
    schema: {
      project_id: 'id',
      id: 'id',
      destination: { codes: OUTBOX_DESTINATIONS },
      state: {
        enum: ['pending', 'dispatching', 'acknowledged', 'outcome_unknown', 'settled', 'superseded', 'denied'],
      },
      attempts: 'int',
      outcome_reason: 'text',
      available_at: 'time',
      created_at: 'time',
    },
  },
  {
    name: 'runtime_commands',
    sql: () => `SELECT c.project_id, c.runtime_id, c.seq, c.kind, c.answered_stage, c.created_at,
                       (SELECT array_agg(r.stage ORDER BY r.recorded_at) FROM sophia.runtime_receipts r
                         WHERE r.project_id = c.project_id AND r.runtime_command_id = c.id) AS receipts
                  FROM sophia.runtime_commands c ${scope('c.project_id')} ORDER BY c.created_at DESC LIMIT ${limit}`,
    schema: {
      project_id: 'id',
      runtime_id: 'id',
      seq: 'int',
      kind: { enum: ['create', 'resume', 'input', 'steer', 'hold', 'stop', 'inspect'] },
      answered_stage: { enum: RECEIPT_STAGES },
      receipts: { each: { enum: RECEIPT_STAGES } },
      created_at: 'time',
    },
  },
  {
    name: 'exchanges',
    sql: () => `SELECT e.project_id, e.room_id, e.id, e.state, e.pause_reason, e.allow_vision, e.input_epoch,
                       i.actor_id AS holder, e.playback_epoch, e.observation_epoch, e.look_source, e.opened_at, e.ended_at
                  FROM sophia.room_exchanges e
                  LEFT JOIN sophia.exchange_inputs i ON i.exchange_id = e.id AND i.input_epoch = e.input_epoch
                  ${scope('e.project_id')} ORDER BY e.opened_at DESC LIMIT ${limit}`,
    schema: {
      project_id: 'id',
      room_id: 'id',
      id: 'id',
      state: { enum: ['open', 'paused', 'ended'] },
      pause_reason: { enum: ['guest', 'holder_left'] },
      allow_vision: 'bool',
      input_epoch: 'int',
      holder: 'id',
      playback_epoch: 'int',
      observation_epoch: 'int',
      look_source: { enum: ['screen', 'camera'] },
      opened_at: 'time',
      ended_at: 'time',
    },
  },
  {
    name: 'presence',
    sql: () => `SELECT project_id, room_id, exchange_id, bridge_instance, voice, reason, guests_present,
                       (SELECT count(*) FROM jsonb_array_elements(participants))::int AS participants,
                       (SELECT count(*) FROM jsonb_array_elements(participants) p
                         WHERE p->>'standing' IN ('guest','unknown'))::int AS guest_like,
                       reported_at, extract(epoch FROM now() - reported_at) AS age_seconds
                  FROM sophia.room_ai_presence ${scope()}`,
    schema: {
      project_id: 'id',
      room_id: 'id',
      exchange_id: 'id',
      bridge_instance: 'digest',
      voice: { enum: ['connecting', 'ready', 'recovering', 'unavailable'] },
      reason: 'text',
      guests_present: 'bool',
      participants: 'int',
      guest_like: 'int',
      reported_at: 'time',
      age_seconds: 'seconds',
    },
  },
  {
    name: 'quiesce_requests',
    sql: () => `SELECT project_id, exchange_id, id, requested_at, acked_at, acked_by
                  FROM sophia.room_quiesce_requests ${scope()} ORDER BY requested_at DESC LIMIT ${limit}`,
    schema: {
      project_id: 'id',
      exchange_id: 'id',
      id: 'id',
      requested_at: 'time',
      acked_at: 'time',
      acked_by: 'digest',
    },
  },
  {
    name: 'announcements',
    sql: () => `SELECT project_id, exchange_id, job_id, result_revision, announced_at
                  FROM sophia.exchange_announcements ${scope()} ORDER BY announced_at DESC LIMIT ${limit}`,
    schema: { project_id: 'id', exchange_id: 'id', job_id: 'id', result_revision: 'int', announced_at: 'time' },
  },
  {
    name: 'removals',
    sql: () => `SELECT project_id, room_id, lobby_entry_id, reason, state, attempts, last_error, next_attempt_at,
                       guard_until, created_at, settled_at
                  FROM sophia.room_removals ${scope()} ORDER BY created_at DESC LIMIT ${limit}`,
    schema: {
      project_id: 'id',
      room_id: 'id',
      lobby_entry_id: 'id',
      reason: { enum: ['denied', 'blocked'] },
      state: { enum: ['pending', 'removed', 'absent', 'cancelled'] },
      attempts: 'int',
      last_error: 'text',
      next_attempt_at: 'time',
      guard_until: 'time',
      created_at: 'time',
      settled_at: 'time',
    },
  },
  {
    name: 'lobby',
    sql: () => `SELECT project_id, status, count(*)::int AS entries FROM sophia.room_lobby ${scope()}
                 GROUP BY project_id, status ORDER BY project_id, status`,
    schema: {
      project_id: 'id',
      status: { enum: ['waiting', 'admitted', 'denied', 'left', 'blocked'] },
      entries: 'int',
    },
  },
  {
    name: 'events',
    sql: () => `SELECT project_id, sequence, type, summary_code, occurred_at FROM sophia.project_events ${scope()}
                 ORDER BY occurred_at DESC LIMIT ${limit}`,
    schema: {
      project_id: 'id',
      sequence: 'int',
      type: { codes: EVENT_TYPES },
      summary_code: { codes: SUMMARY_CODES },
      occurred_at: 'time',
    },
  },
]

/** A failed section says only which Postgres error class it hit (e.g. 42P01: that migration is not applied). */
const failure = (err: unknown) => ({
  error: sqlState(typeof err === 'object' && err !== null && 'code' in err ? err.code : null),
})

async function database(url: string): Promise<Record<string, unknown>> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  const out: Record<string, unknown> = {}
  try {
    for (const section of SECTIONS) {
      await client.query('BEGIN READ ONLY')
      try {
        const { rows } = await client.query<Record<string, unknown>>(section.sql(), params())
        out[section.name] = rows.map((row) => sanitizeRow(row, section.schema))
      } catch (err: unknown) {
        out[section.name] = failure(err)
      } finally {
        await client.query('ROLLBACK')
      }
    }
  } finally {
    await client.end()
  }
  return out
}

const epochTime = (seconds: bigint) => field('time', new Date(Number(seconds) * 1000))

async function livekit(): Promise<unknown> {
  const url = process.env.LIVEKIT_URL
  const key = process.env.LIVEKIT_API_KEY
  const secret = process.env.LIVEKIT_API_SECRET
  if (!url || !key || !secret) return 'not requested (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET unset)'
  const client = new RoomServiceClient(url.replace(/^ws(s?):\/\//, 'http$1://'), key, secret)
  // Rooms are named by the project's room id; all live rooms are listed (a handful at most).
  const rooms = await client.listRooms()
  // A room's trace is found in LiveKit by its name (the Sophia room id); its session id passes only as a digest.
  return Promise.all(
    rooms.slice(0, limit).map(async (r) => ({
      room: shortId(r.name),
      session: field('digest', r.sid),
      created: epochTime(r.creationTime),
      participants: roomSummary(await client.listParticipants(r.name)),
    })),
  )
}

const url = process.env.SOPHIA_DIAGNOSE_DATABASE_URL
const report = {
  generatedAt: new Date().toISOString(),
  scope: project ? shortId(project) : 'all projects',
  database: url ? await database(url) : 'not requested (SOPHIA_DIAGNOSE_DATABASE_URL unset)',
  livekit: await livekit().catch(() => ({ error: 'livekit_request_failed' })),
}
console.log(JSON.stringify(report, null, 2))
