// The diagnostic's public allowlist against hostile values (coordination review finding CX-0001).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { digest, field, identityClass, sanitizeRow, sophiaAttributes, standing, text } from './sanitize.ts'

const UUID = '3fc469f4-1a2b-4c3d-8e4f-0123456789ab'

describe('diagnostic sanitizer', () => {
  it('passes ids only as the first 8 characters of a UUID', () => {
    assert.equal(field('id', UUID), '3fc469f4')
    assert.equal(field('id', 'luis@example.com'), 'other')
    assert.equal(field('id', 'guest-Ana'), 'other')
    assert.equal(field('id', null), null)
    assert.equal(identityClass('sophia'), 'sophia')
    assert.equal(identityClass(UUID), '3fc469f4')
    assert.equal(identityClass('Davide Laverga'), 'other')
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

  it('passes enumerations and codes only as their own values', () => {
    const state = { enum: ['open', 'paused', 'ended'] } as const
    assert.equal(field(state, 'open'), 'open')
    assert.equal(field(state, 'open; DROP TABLE'), 'invalid')
    assert.equal(field('code', 'room.exchange_changed'), 'room.exchange_changed')
    assert.equal(field('code', 'room.exchange changed <script>'), 'invalid')
    assert.equal(field('migration', '0014_room_removals.sql'), '0014_room_removals.sql')
    assert.equal(field('migration', '../../etc/passwd'), 'invalid')
    assert.equal(field('sha256', 'a'.repeat(64)), 'a'.repeat(64))
    assert.equal(field('sha256', 'secret'), 'invalid')
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
