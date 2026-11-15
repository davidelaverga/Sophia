// INC04-R07-C2B-DURABLE-001 (amendment A58): an opted-in tracked call's closed observed facts, as the API validates them.
// The research reserve and settle components are shared by the research, design and source-review runtime routes, so each
// check covers all three. Without the opt-in every A57 shape validates exactly as before; with it the binding echoes
// `facts`; `evidence.observed` is one closed object whose every nested member is closed, bounded and never null; a refusal
// names no value; and the full worst-case settlement (every A57 field, the A57 id and both new ids at their worst JSON
// escaping) still fits the tightest route (256 KiB). Duplicate sources or dimensions are refused by the service (SQL):
// the standalone wire validator carries no ajv runtime for uniqueItems.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Ajv } from 'ajv'
import { componentSchemas } from './index.ts'

/** The API's validator settings (apps/api/src/app.ts): nothing removed, coerced or defaulted. */
const ajv = new Ajv({
  removeAdditional: false,
  coerceTypes: false,
  useDefaults: false,
  strict: false,
  allErrors: false,
})
for (const schema of componentSchemas()) ajv.addSchema(schema)
const validator = (name: string) => {
  const v = ajv.getSchema(`${name}#`) ?? ajv.compile({ $ref: `${name}#` })
  return (value: unknown) => ({ ok: v(value) === true, errors: JSON.stringify(v.errors ?? []) })
}
const reserve = validator('ResearchReserveRequest')
const reservation = validator('ResearchReservation')
const settle = validator('ResearchSettleRequest')

const TRACKED = {
  attemptId: 'att-1',
  nativeSessionId: 'sophia-att-1',
  callId: 'llm-1',
  kind: 'model',
  provider: 'openai-research',
  amountUsd: 0.17,
  mode: 'tracked_v1',
  contract: 'c1p_complete_report',
}
const BINDING = {
  mode: 'tracked_v1',
  contract: 'c1p_complete_report',
  evidenceId: '00000000-0000-4000-8000-000000000002',
  callId: 'llm-1',
  attemptId: 'att-1',
  nativeSessionId: 'sophia-att-1',
  projectId: '11111111-1111-4111-8111-111111111111',
  runtimeUnitId: 'sophia-runtime-wbc02-dev',
  resourceId: '22222222-2222-4222-8222-222222222222',
}
const REPLY = {
  reservationId: '00000000-0000-4000-8000-000000000001',
  state: 'reserved',
  kind: 'model',
  purpose: 'call',
  amountUsd: 0.17,
  target: null,
}
const known = (value: number) => ({ class: 'known', value })
const A57 = (responseId: unknown) => ({
  contract: 'c1p_complete_report',
  report: 'complete_report',
  counts: {
    nonCachedInput: known(800),
    cacheRead: known(200),
    cacheWrite: { class: 'no_separate_reported_class' },
    output: known(50),
  },
  ending: 'stream_completed',
  responseId,
})
const SETTLE = {
  attemptId: 'att-1',
  nativeSessionId: 'sophia-att-1',
  reservationId: '00000000-0000-4000-8000-000000000001',
  outcome: 'settled',
  costUsd: 0.000046,
  usage: { inputTokens: 1000, outputTokens: 50 },
}
const DIMENSIONS = ['n1', 'n2', 'http_status', 'provider_terminal', 'input_total', 'cache_read', 'output', 'cross_c1p']
/** Every observed member populated. */
const FULL = (n1: string, n2: string) => ({
  sent: 'observable_transport_response',
  httpStatus: 200,
  n1: { id: { status: 'supported', value: n1 }, sources: ['created', 'completed', 'incomplete', 'failed'] },
  n2: { id: { status: 'supported', value: n2 }, sources: ['response_header', 'typed_error'] },
  providerTerminal: 'completed',
  rawCounts: { inputTotal: 1000, cacheRead: 200, output: 50 },
  conflicts: DIMENSIONS.map((dimension) => ({ dimension, witness: 'a'.repeat(64) })),
  deliveryUnknownReason: 'none',
})
/** A supported observed id seen on `completed`. */
const id = (value: unknown) => ({ id: { status: 'supported', value }, sources: ['completed'] })
const withObserved = (observed: unknown) => ({
  ...SETTLE,
  evidence: { ...A57({ status: 'supported', value: 'resp_A' }), observed },
})

describe('A58 opt-in: observed_v1 at reserve and in the closed binding only', () => {
  it('keeps the A57 request and binding valid without the opt-in, and takes facts observed_v1 only', () => {
    assert.equal(reserve(TRACKED).ok, true)
    assert.equal(reservation({ ...REPLY, binding: BINDING }).ok, true, 'a v1 binding has no facts')
    assert.equal(reserve({ ...TRACKED, facts: 'observed_v1' }).ok, true)
    assert.equal(reservation({ ...REPLY, binding: { ...BINDING, facts: 'observed_v1' } }).ok, true)
    for (const facts of ['observed_v2', null, 2, ['observed_v1'], '']) {
      assert.equal(reserve({ ...TRACKED, facts }).ok, false, JSON.stringify(facts))
      assert.equal(reservation({ ...REPLY, binding: { ...BINDING, facts } }).ok, false, JSON.stringify(facts))
    }
    for (const alias of ['factsVersion', 'c2b']) {
      assert.equal(reserve({ ...TRACKED, [alias]: 2 }).ok, false, `no ${alias} alias`)
      assert.equal(reservation({ ...REPLY, binding: { ...BINDING, [alias]: 2 } }).ok, false, `no ${alias} alias`)
    }
  })
})

describe('A58 evidence.observed: one closed object, every member bounded and never null', () => {
  it('accepts the delivery stage alone, each vector-shaped observation, and every member populated', () => {
    assert.equal(settle(withObserved({ deliveryUnknownReason: 'no_frame_delivered' })).ok, true)
    assert.equal(settle(withObserved(FULL('resp_A', 'req_X'))).ok, true)
    assert.equal(
      settle(
        withObserved({
          sent: 'observable_transport_response',
          httpStatus: 500,
          n2: { id: { status: 'identity_unsupported', reason: 'over_bound' }, sources: ['typed_error'] },
          deliveryUnknownReason: 'none',
        }),
      ).ok,
      true,
    )
    assert.equal(
      settle({ ...SETTLE, evidence: A57({ status: 'supported', value: 'resp_A' }) }).ok,
      true,
      'absent: A57 unchanged',
    )
  })

  it('refuses null, unknown keys, aliases, out-of-range or unsafe counts, invalid ids and cardinality, naming no value', () => {
    const canary = 'CANARY-a58-7f3e'
    const base = { deliveryUnknownReason: 'none' }
    const bad: [string, unknown][] = [
      ['null observation', null],
      ['no delivery stage', { sent: 'unknown' }],
      ['null delivery stage', { deliveryUnknownReason: null }],
      ['an ending as the stage', { deliveryUnknownReason: 'consumer_closed' }],
      ['an unknown key', { ...base, extra: canary }],
      ['a c2b alias', { ...base, c2b: {} }],
      ['a factsVersion alias', { ...base, factsVersion: 2 }],
      ['N3', { ...base, n3: id(canary) }],
      ['null sent', { ...base, sent: null }],
      ['status 99', { ...base, httpStatus: 99 }],
      ['status 600', { ...base, httpStatus: 600 }],
      ['status 200.5', { ...base, httpStatus: 200.5 }],
      ['status as text', { ...base, httpStatus: '200' }],
      ['null n1', { ...base, n1: null }],
      ['an empty id', { ...base, n1: id('') }],
      ['an 8193-character id', { ...base, n1: id(`${canary}${'x'.repeat(8193)}`) }],
      ['a NUL id', { ...base, n1: id(`${canary}\u0000`) }],
      ['an unpaired surrogate', { ...base, n1: id(`${canary}\uD800`) }],
      ['a numeric id', { ...base, n1: id(42) }],
      ['an unknown id status', { ...base, n1: { id: { status: 'unknown' }, sources: ['completed'] } }],
      [
        'an unsupported id with its value',
        {
          ...base,
          n1: { id: { status: 'identity_unsupported', reason: 'nul', value: canary }, sources: ['completed'] },
        },
      ],
      [
        'an unknown reason',
        { ...base, n1: { id: { status: 'identity_unsupported', reason: 'long' }, sources: ['completed'] } },
      ],
      ['no sources', { ...base, n1: { id: { status: 'supported', value: canary }, sources: [] } }],
      [
        'five N1 sources',
        {
          ...base,
          n1: {
            id: { status: 'supported', value: canary },
            sources: ['created', 'completed', 'incomplete', 'failed', 'created'],
          },
        },
      ],
      [
        'an N2 source on N1',
        { ...base, n1: { id: { status: 'supported', value: canary }, sources: ['response_header'] } },
      ],
      ['an N1 source on N2', { ...base, n2: { id: { status: 'supported', value: canary }, sources: ['completed'] } }],
      ['an extra id member', { ...base, n1: { ...id(canary), extra: 1 } }],
      ['a consumer ending as terminal', { ...base, providerTerminal: 'stream_completed' }],
      ['an unsafe count', { ...base, providerTerminal: 'completed', rawCounts: { inputTotal: 9007199254740992 } }],
      ['a negative count', { ...base, providerTerminal: 'completed', rawCounts: { output: -1 } }],
      ['a fractional count', { ...base, providerTerminal: 'completed', rawCounts: { cacheRead: 1.5 } }],
      ['a cacheWrite count', { ...base, providerTerminal: 'completed', rawCounts: { cacheWrite: 1 } }],
      ['a reasoning count', { ...base, providerTerminal: 'completed', rawCounts: { reasoning: 1 } }],
      ['a total count', { ...base, providerTerminal: 'completed', rawCounts: { total: 1 } }],
      ['null raw counts', { ...base, providerTerminal: 'completed', rawCounts: null }],
      ['an uppercase witness', { ...base, conflicts: [{ dimension: 'n1', witness: 'A'.repeat(64) }] }],
      ['a short witness', { ...base, conflicts: [{ dimension: 'n1', witness: canary }] }],
      ['an unknown dimension', { ...base, conflicts: [{ dimension: 'n3', witness: 'a'.repeat(64) }] }],
      [
        'nine conflicts',
        { ...base, conflicts: [...FULL('a', 'b').conflicts, { dimension: 'n1', witness: 'b'.repeat(64) }] },
      ],
      ['a function member', { ...base, sent: () => 'observable_transport_response' }],
      ['a toJSON member', { ...base, toJSON: () => ({ deliveryUnknownReason: 'none' }) }],
    ]
    for (const [what, observed] of bad) {
      const r = settle(withObserved(observed))
      assert.equal(r.ok, false, what)
      assert.equal(r.errors.includes('CANARY'), false, `${what}: the refusal names no value`)
    }
  })

  it('fits the full worst-case settlement: every A57 field, the A57 id and both new ids at their worst escaping, under 256 KiB', () => {
    // Each id: 8192 one-byte characters JSON escapes as \u00XX (6 bytes each). responseId and n1 are one namespace, so
    // a consistent report carries the same N1 in both; n2 is its own.
    const worstN1 = '\u0001'.repeat(8192)
    const worstN2 = '\u0002'.repeat(8192)
    const body = {
      ...SETTLE,
      usage: { inputTokens: 1000, outputTokens: 50, provider: 'openai-review', model: 'gpt-6-luna' },
      evidence: { ...A57({ status: 'supported', value: worstN1 }), observed: FULL(worstN1, worstN2) },
    }
    assert.equal(settle(body).ok, true)
    const bytes = Buffer.byteLength(JSON.stringify(body), 'utf8')
    for (const worstId of [worstN1, worstN2]) assert.equal(Buffer.byteLength(JSON.stringify(worstId), 'utf8'), 49154)
    assert.ok(bytes > 3 * 49152, `${String(bytes)} bytes: three worst ids`)
    assert.ok(bytes < 256 * 1024, `${String(bytes)} bytes under the review route's 256 KiB`)
  })
})
