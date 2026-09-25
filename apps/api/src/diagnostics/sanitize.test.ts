// The diagnostic's public allowlist against hostile values (coordination review findings CX-0001 and CX-0007).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  digest,
  EVENT_TYPES,
  field,
  OUTBOX_DESTINATIONS,
  RECEIPT_STAGES,
  roomSummary,
  sanitizeRow,
  sophiaAttributes,
  sqlState,
  standing,
  SUMMARY_CODES,
  text,
} from './sanitize.ts'

const UUID = '3fc469f4-1a2b-4c3d-8e4f-0123456789ab'

/** A member as LiveKit lists them: an active participant with a signed role and a stray attribute. */
const member = (id: string, role: string, tracks: Array<{ source: number; muted: boolean }> = []) => ({
  identity: id,
  metadata: JSON.stringify({ role }),
  state: 2,
  tracks,
  attributes: { 'sophia.voice': 'ready', note: 'Luis at home' },
})

describe('diagnostic sanitizer', () => {
  it('passes ids only as the first 8 characters of a UUID', () => {
    assert.equal(field('id', UUID), '3fc469f4')
    assert.equal(field('id', 'luis@example.com'), 'other')
    assert.equal(field('id', 'guest-Ana'), 'other')
    assert.equal(field('id', null), null)
  })

  it('never publishes free text: known system phrases become codes, anything else a digest', () => {
    assert.equal(text("waiting for Sophia's runtime to report ready"), 'runtime_not_ready')
    const leaky = 'connect ECONNREFUSED https://lk.example.com/twirp?access_token=eyJhbGciOi.secret'
    assert.equal(text(leaky), `redacted:${digest(leaky)}`)
    assert.doesNotMatch(String(text(leaky)), /token|example|eyJ/)
    const joined = 'Sophia could not join the room: 401 invalid token eyJhbGciOi.secret'
    assert.equal(text(joined), 'room_join_failed', 'the phrase passes, never the provider message after it')
    assert.equal(text(42), 'invalid')
  })

  it('passes enumerations only as their own values', () => {
    const state = { enum: ['open', 'paused', 'ended'] } as const
    assert.equal(field(state, 'open'), 'open')
    assert.equal(field(state, 'open; DROP TABLE'), 'invalid')
    assert.equal(field('version', '0014'), '0014')
    assert.equal(field('version', 'secret_abc123'), 'invalid')
    assert.equal(field('migration', '0014_room_removals.sql'), '0014_room_removals.sql')
    assert.equal(field('migration', '../../etc/passwd'), 'invalid')
    assert.equal(field('sha256', 'a'.repeat(64)), 'a'.repeat(64))
    assert.equal(field('sha256', 'secret'), 'invalid')
  })

  it('passes a system code only from its own field’s vocabulary, however code-like the value looks', () => {
    const summary = { codes: SUMMARY_CODES }
    assert.equal(field(summary, 'room.exchange_stop_speaking'), 'room.exchange_stop_speaking')
    assert.equal(field(summary, 'native_task.max-tokens'), 'native_task.max-tokens')
    for (const secret of ['secret_abc123', 'sk_live.abc123', 'room.exchange_changed']) {
      assert.equal(field(summary, secret), `redacted:${digest(secret)}`, secret)
    }
    assert.equal(field({ codes: EVENT_TYPES }, 'room.exchange_changed'), 'room.exchange_changed')
    assert.equal(
      field({ codes: EVENT_TYPES }, 'room.exchange_stop_speaking'),
      `redacted:${digest('room.exchange_stop_speaking')}`,
    )
    assert.equal(field({ codes: OUTBOX_DESTINATIONS }, 'native.create'), 'native.create')
    assert.equal(field({ codes: OUTBOX_DESTINATIONS }, 'api_key_live'), `redacted:${digest('api_key_live')}`)
    assert.equal(field({ codes: EVENT_TYPES }, 7), 'invalid')
    assert.equal(sqlState('42P01'), 'pg_42p01')
    assert.equal(sqlState('secret_abc123'), 'failed')
  })

  it('reports every receipt stage in order, each from the stage list', () => {
    const receipts = { each: { enum: RECEIPT_STAGES } }
    assert.deepEqual(field(receipts, ['delivered', 'incorporation_observed', 'checked']), [
      'delivered',
      'incorporation_observed',
      'checked',
    ])
    assert.deepEqual(field(receipts, ['delivered', 'secret_abc123']), ['delivered', 'invalid'])
    assert.equal(field(receipts, 'delivered,checked'), 'invalid')
    assert.equal(field(receipts, null), null)
  })

  it('knows every event type and summary the migrations write', () => {
    const dir = new URL('../../../../db/migrations/', import.meta.url)
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(new URL(f, dir), 'utf8'))
      .join('\n')
    const literals = new Set(
      [...sql.matchAll(/'((?:command|room|project|contribution|native_task|runtime|goal)\.[a-z_-]*)'/g)].map(
        (m) => m[1] ?? '',
      ),
    )
    const known = [...EVENT_TYPES, ...SUMMARY_CODES]
    // A literal ending in `.` or `_` is the prefix of a computed code (e.g. 'room.exchange_'||p_action).
    const unknown = [...literals].filter((l) =>
      /[._]$/.test(l) ? !known.some((k) => k.startsWith(l)) : !known.includes(l),
    )
    assert.ok(literals.size > 30, 'the migrations were read')
    assert.deepEqual(unknown, [])
  })

  it('reads durations and counts whether the driver returns numbers or decimal strings', () => {
    assert.equal(field('seconds', '3761.23'), 3761)
    assert.equal(field('seconds', 12.6), 13)
    assert.equal(field('seconds', '1 day'), null)
    assert.equal(field('int', '42'), 42)
    assert.equal(field('int', '4.2'), null)
  })

  it('references host-like values by digest, never by value', () => {
    assert.equal(field('digest', 'prod-vm-7.internal-1234'), `ref:${digest('prod-vm-7.internal-1234')}`)
  })

  it('drops columns the schema does not declare', () => {
    const row = { id: UUID, state: 'open', token_sha256: Buffer.from('x'), body: 'raw brief text', email: 'a@b.c' }
    assert.deepEqual(sanitizeRow(row, { id: 'id', state: { enum: ['open'] } }), { id: '3fc469f4', state: 'open' })
  })

  it('describes a LiveKit room as counts and Sophia’s own state, never a person', () => {
    const summary = roomSummary([
      member(UUID, 'admin', [
        { source: 2, muted: false },
        { source: 3, muted: false },
      ]),
      member('Davide Laverga', 'editor', [{ source: 2, muted: true }]),
      {
        identity: 'guest-Ana',
        metadata: '{"guest":true}',
        state: 1,
        tracks: [{ source: 1, muted: false }],
        attributes: {},
      },
      member('sophia', 'editor'),
      {
        identity: 'sophia',
        metadata: '{"sophia":true}',
        state: 2,
        tracks: [{ source: 2, muted: false }],
        attributes: { 'sophia.voice': 'ready', 'sophia.output': 'playing', 'sophia.note': 'private' },
      },
    ])
    assert.deepEqual(summary, {
      people: 4,
      standing: { admin: 1, editor: 2, guest: 1 },
      publishing: { microphone: 1, screen_share: 1, camera: 1 },
      sophia: { state: 'active', 'sophia.voice': 'ready', 'sophia.output': 'playing' },
    })
    assert.doesNotMatch(JSON.stringify(summary), /3fc469f4|Davide|Ana|Luis|private/)
    assert.deepEqual(roomSummary([]), { people: 0, standing: {}, publishing: {}, sophia: 'absent' })
  })

  it('passes only the bridge’s own attribute keys and values', () => {
    assert.deepEqual(
      sophiaAttributes({
        'sophia.voice': 'ready',
        'sophia.input': 'admitted; also a secret',
        'sophia.inputEpoch': '3',
        'sophia.note': 'private text',
        other: 'x',
      }),
      { 'sophia.voice': 'ready', 'sophia.input': 'invalid', 'sophia.inputEpoch': 3 },
    )
  })

  it('reads standing from signed metadata only, never a display name', () => {
    assert.deepEqual(
      ['{"role":"editor"}', '{"guest":true}', '{"sophia":true}', '{"role":"owner"}', 'Luis'].map(standing),
      ['editor', 'guest', 'sophia', 'unknown', 'unknown'],
    )
  })
})
