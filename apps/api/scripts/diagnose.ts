// S1-05A production diagnosis for the operator (Codex), returned to the implementer as sanitized evidence.
// Read only: every database query runs in one READ ONLY transaction, and the LiveKit part only lists rooms and
// participants. The output is JSON meant to be pasted into the coordination thread: ids shortened to 8 characters,
// no tokens, no names or emails, no discussion or brief text, reasons cut to 200 characters.
//
//   SOPHIA_DIAGNOSE_DATABASE_URL=<a login that can read the sophia schema, e.g. the migration owner, verify-full TLS>
//   [LIVEKIT_URL=… LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=…]      also list LiveKit rooms and who is in them
//   node apps/api/scripts/diagnose.ts [--project <uuid>] [--limit 20]
import { parseArgs } from 'node:util'
import { RoomServiceClient } from 'livekit-server-sdk'
import pg from 'pg'

const { values } = parseArgs({ options: { project: { type: 'string' }, limit: { type: 'string' } } })
const limit = Math.min(Math.max(Number(values.limit ?? 20) || 20, 1), 200)
const project = values.project && /^[0-9a-f-]{36}$/.test(values.project) ? values.project : null

/** Ids shortened for a public thread; enough to correlate with logs and LiveKit traces. */
const short = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v) ? v.slice(0, 8) : v)
const cut = (v: unknown) => (typeof v === 'string' ? v.slice(0, 200) : v)
const ID_KEYS = new Set(['id', 'project', 'room', 'exchange', 'actor', 'runtime', 'entry', 'job', 'goal', 'holder'])
const TEXT_KEYS = new Set(['reason', 'last_error', 'outcome_reason', 'ready_reason'])

function sanitize(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, ID_KEYS.has(k) ? short(v) : TEXT_KEYS.has(k) ? cut(v) : v]),
  )
}

const scope = (column = 'project_id') => (project ? `WHERE ${column} = $1` : 'WHERE true')
const params = () => (project ? [project] : [])

/** Each section: a name and a SELECT (sanitized per row). Nothing here writes. */
const SECTIONS: ReadonlyArray<[string, () => string]> = [
  [
    'migrations',
    () => `SELECT version, filename, sha256, applied_at FROM sophia_meta.schema_migrations ORDER BY version`,
  ],
  [
    'runtimes',
    () => `SELECT project_id AS project, id, runtime_unit_id, state, lease_epoch, bridge_instance_id, protocol_version,
                  dsh_version, hello_at, ready_state, ready_reason, ready_at, jsonb_array_length(unrecovered) AS unrecovered,
                  command_sequence FROM sophia.runtime_instances ${scope()} ORDER BY created_at DESC LIMIT ${limit}`,
  ],
  [
    'native_tasks',
    () => `SELECT project_id AS project, id, goal_id AS goal, state, phase, reason, created_at, result_source_id IS NOT NULL AS has_result
             FROM sophia.native_task_view ${scope()} ORDER BY created_at DESC LIMIT ${limit}`,
  ],
  [
    'native_outbox',
    () => `SELECT project_id AS project, id, destination, state, attempts, outcome_reason, available_at, created_at
             FROM sophia.outbox ${scope()} AND (destination LIKE 'native.%' OR destination = 'control.settle')
            ORDER BY created_at DESC LIMIT ${limit}`,
  ],
  [
    'runtime_commands',
    () => `SELECT c.project_id AS project, c.runtime_id AS runtime, c.seq, c.kind, c.answered_stage, c.created_at,
                  (SELECT array_agg(r.stage ORDER BY r.recorded_at) FROM sophia.runtime_receipts r
                    WHERE r.project_id = c.project_id AND r.runtime_command_id = c.id) AS receipts
             FROM sophia.runtime_commands c ${scope('c.project_id')} ORDER BY c.created_at DESC LIMIT ${limit}`,
  ],
  [
    'exchanges',
    () => `SELECT e.project_id AS project, e.room_id AS room, e.id, e.state, e.pause_reason, e.allow_vision, e.input_epoch,
                  i.actor_id AS holder, e.playback_epoch, e.observation_epoch, e.look_source, e.opened_at, e.ended_at
             FROM sophia.room_exchanges e LEFT JOIN sophia.exchange_inputs i ON i.exchange_id = e.id AND i.input_epoch = e.input_epoch
             ${scope('e.project_id')} ORDER BY e.opened_at DESC LIMIT ${limit}`,
  ],
  [
    'presence',
    () => `SELECT project_id AS project, room_id AS room, exchange_id AS exchange, bridge_instance, voice, reason, guests_present,
                  (SELECT jsonb_agg(jsonb_build_object('standing', p->>'standing')) FROM jsonb_array_elements(participants) p) AS participants,
                  reported_at, now() - reported_at AS age FROM sophia.room_ai_presence ${scope()}`,
  ],
  [
    'quiesce_requests',
    () => `SELECT project_id AS project, exchange_id AS exchange, id, requested_at, acked_at, acked_by
             FROM sophia.room_quiesce_requests ${scope()} ORDER BY requested_at DESC LIMIT ${limit}`,
  ],
  [
    'announcements',
    () => `SELECT project_id AS project, exchange_id AS exchange, job_id AS job, result_revision, announced_at
             FROM sophia.exchange_announcements ${scope()} ORDER BY announced_at DESC LIMIT ${limit}`,
  ],
  [
    'removals',
    () => `SELECT project_id AS project, room_id AS room, lobby_entry_id AS entry, reason, state, attempts, last_error,
                  next_attempt_at, guard_until, created_at, settled_at FROM sophia.room_removals ${scope()}
            ORDER BY created_at DESC LIMIT ${limit}`,
  ],
  [
    'lobby',
    () => `SELECT project_id AS project, status, count(*)::int AS entries FROM sophia.room_lobby ${scope()}
            GROUP BY project_id, status ORDER BY project_id, status`,
  ],
  [
    'events',
    () => `SELECT project_id AS project, sequence, type, summary_code, occurred_at FROM sophia.project_events ${scope()}
            ORDER BY occurred_at DESC LIMIT ${limit}`,
  ],
]

async function database(url: string): Promise<Record<string, unknown>> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  const out: Record<string, unknown> = {}
  try {
    await client.query('BEGIN READ ONLY')
    for (const [name, sql] of SECTIONS) {
      try {
        const { rows } = await client.query<Record<string, unknown>>(sql(), params())
        out[name] = rows.map(sanitize)
      } catch (err: unknown) {
        // A missing table means that migration is not applied: say so and carry on.
        out[name] = { error: err instanceof Error ? cut(err.message) : 'query failed' }
        await client.query('ROLLBACK')
        await client.query('BEGIN READ ONLY')
      }
    }
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    await client.end()
  }
  return out
}

// LiveKit's protocol enums, named for a reader of the thread.
const PARTICIPANT_STATE = ['joining', 'joined', 'active', 'disconnected']
const TRACK_SOURCE = ['unknown', 'camera', 'microphone', 'screen_share', 'screen_share_audio']
const TRACK_TYPE = ['audio', 'video', 'data']
const named = (names: readonly string[], n: number) => names[n] ?? String(n)

/** Only what the room shows about standing and state: never names, metadata beyond standing, or tokens. */
function standing(metadata: string | undefined): string {
  try {
    const v: unknown = JSON.parse(metadata ?? 'null')
    if (typeof v !== 'object' || v === null) return 'unknown'
    if ('sophia' in v && v.sophia === true) return 'sophia'
    if ('guest' in v && v.guest === true) return 'guest'
    return 'role' in v && typeof v.role === 'string' ? v.role : 'unknown'
  } catch {
    return 'unknown'
  }
}

async function livekit(): Promise<unknown> {
  const url = process.env.LIVEKIT_URL
  const key = process.env.LIVEKIT_API_KEY
  const secret = process.env.LIVEKIT_API_SECRET
  if (!url || !key || !secret) return 'not requested (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET unset)'
  const client = new RoomServiceClient(url.replace(/^ws(s?):\/\//, 'http$1://'), key, secret)
  // Rooms are named by the project's room id; all live rooms are listed (a handful at most).
  const rooms = await client.listRooms()
  return Promise.all(
    rooms.slice(0, limit).map(async (r) => ({
      room: short(r.name),
      sid: r.sid,
      created: new Date(Number(r.creationTime) * 1000).toISOString(),
      participants: (await client.listParticipants(r.name)).map((p) => ({
        identity: p.identity === 'sophia' ? 'sophia' : short(p.identity),
        standing: standing(p.metadata),
        state: named(PARTICIPANT_STATE, p.state),
        joinedAt: new Date(Number(p.joinedAt) * 1000).toISOString(),
        tracks: p.tracks.map((t) => ({
          source: named(TRACK_SOURCE, t.source),
          type: named(TRACK_TYPE, t.type),
          muted: t.muted,
        })),
        sophia: Object.fromEntries(Object.entries(p.attributes).filter(([k]) => k.startsWith('sophia.'))),
      })),
    })),
  )
}

const url = process.env.SOPHIA_DIAGNOSE_DATABASE_URL
const report = {
  generatedAt: new Date().toISOString(),
  scope: project ? short(project) : 'all projects',
  database: url ? await database(url) : 'not requested (SOPHIA_DIAGNOSE_DATABASE_URL unset)',
  livekit: await livekit().catch((err: unknown) => ({ error: err instanceof Error ? cut(err.message) : 'failed' })),
}
console.log(JSON.stringify(report, (_k, v: unknown) => (typeof v === 'bigint' ? Number(v) : v), 2))
