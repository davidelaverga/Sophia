// INC04-S03A-R07-C2A (amendment A57): the private research-call evidence shapes, as the API validates them. The four
// research reserve and settle components are shared by the research, design and source-review runtime routes, so each
// check below covers all three. A legacy request and reply validate exactly as before; a tracked one is closed; a
// response id is a supported raw id only when it is 1..8192 well-formed characters with no NUL; an adverse value is
// refused without its value being echoed; and the whole worst-case settlement body fits the tightest route (256 KiB).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Ajv, type ErrorObject } from 'ajv'
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
  return (value: unknown): { ok: boolean; errors: ErrorObject[] } => {
    const ok = v(value) === true
    return { ok, errors: v.errors ?? [] }
  }
}
const reserve = validator('ResearchReserveRequest')
const reservation = validator('ResearchReservation')
const settle = validator('ResearchSettleRequest')
const settlement = validator('ResearchSettlement')

const ids = { attemptId: 'att-1', nativeSessionId: 'sophia-att-1' }
const RESERVE = {
  ...ids,
  callId: 'llm-1',
  kind: 'model',
  provider: 'openai-research',
  amountUsd: 0.17,
  purpose: 'call',
}
const TRACKED = {
  ...RESERVE,
  mode: 'tracked_v1',
  contract: 'c1p_complete_report',
  declared: {
    routeId: 'research-sol-medium-v1',
    model: 'gpt-6.1-sol',
    reasoningEffort: 'medium',
    prices: { input: 2, cacheRead: 0.1, cacheWrite: 2.5, output: 10 },
  },
}
const LEGACY_REPLY = {
  reservationId: '00000000-0000-4000-8000-000000000001',
  state: 'reserved',
  kind: 'model',
  purpose: 'call',
  amountUsd: 0.17,
  target: null,
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
  // REPAIR-001 (F03): the executor resource the binding froze; required (the loop below drops each key in turn).
  resourceId: '22222222-2222-4222-8222-222222222222',
}
const known = (value: number) => ({ class: 'known', value })
const evidence = (responseId: unknown) => ({
  contract: 'c1p_complete_report',
  report: 'complete_report',
  counts: {
    nonCachedInput: known(3),
    cacheRead: known(2),
    cacheWrite: { class: 'no_separate_reported_class' },
    output: known(3),
  },
  ending: 'stream_completed',
  responseId,
})
const SETTLE = {
  ...ids,
  reservationId: LEGACY_REPLY.reservationId,
  outcome: 'settled',
  costUsd: 0.0001,
  usage: { inputTokens: 3, outputTokens: 3 },
}

describe('A57: the tracked reserve and its closed call binding', () => {
  it('keeps a legacy request and reply valid exactly as before', () => {
    assert.equal(reserve(RESERVE).ok, true)
    assert.equal(reservation(LEGACY_REPLY).ok, true)
    assert.equal(settle(SETTLE).ok, true)
    assert.equal(
      settlement({ reservationId: LEGACY_REPLY.reservationId, state: 'settled', settledUsd: 0.0001 }).ok,
      true,
    )
  })

  it('accepts a tracked request and a reply carrying the whole binding, and refuses any open or partial shape', () => {
    assert.equal(reserve(TRACKED).ok, true)
    assert.equal(reservation({ ...LEGACY_REPLY, binding: BINDING }).ok, true)
    assert.equal(reserve({ ...TRACKED, mode: 'tracked_v2' }).ok, false, 'an unknown mode')
    assert.equal(reserve({ ...TRACKED, contract: 'partial_report' }).ok, false, 'no invented partial contract')
    assert.equal(
      reserve({ ...TRACKED, declared: { ...TRACKED.declared, apiKey: 'x' } }).ok,
      false,
      'closed declared metadata',
    )
    for (const key of Object.keys(BINDING)) {
      const partial: Record<string, unknown> = { ...BINDING }
      delete partial[key]
      assert.equal(reservation({ ...LEGACY_REPLY, binding: partial }).ok, false, `a binding without ${key}`)
    }
    assert.equal(
      reservation({ ...LEGACY_REPLY, binding: { ...BINDING, token: 'secret' } }).ok,
      false,
      'no other field in the binding',
    )
    assert.equal(reservation({ ...LEGACY_REPLY, binding: { ...BINDING, evidenceId: 'not-a-uuid' } }).ok, false)
    assert.equal(
      reservation({ ...LEGACY_REPLY, binding: { ...BINDING, resourceId: '../escape' } }).ok,
      false,
      'a resource id is closed',
    )
  })
})

describe('A57: the tracked settlement evidence', () => {
  it('accepts the closed facts, each count known, unknown or no separate class, and the three id statuses', () => {
    assert.equal(settle({ ...SETTLE, evidence: evidence({ status: 'supported', value: 'resp_1' }) }).ok, true)
    assert.equal(settle({ ...SETTLE, evidence: evidence({ status: 'unknown' }) }).ok, true)
    assert.equal(
      settle({
        ...SETTLE,
        evidence: evidence({ status: 'identity_unsupported', reason: 'over_bound', correlation: 'a'.repeat(64) }),
      }).ok,
      true,
    )
    const none = {
      ...evidence({ status: 'unknown' }),
      report: 'not_complete',
      counts: {
        nonCachedInput: { class: 'unknown' },
        cacheRead: { class: 'unknown' },
        cacheWrite: { class: 'unknown' },
        output: { class: 'unknown' },
      },
    }
    assert.equal(
      settle({ ...ids, reservationId: LEGACY_REPLY.reservationId, outcome: 'uncertain', evidence: none }).ok,
      true,
    )
    assert.equal(
      settlement({
        reservationId: LEGACY_REPLY.reservationId,
        state: 'settled',
        settledUsd: 0.0001,
        evidence: { disposition: 'accepted', replay: false, capped: false, digest: 'b'.repeat(64) },
      }).ok,
      true,
    )
  })

  it('refuses an unsafe or fractional count, an unknown class, a header id, a raw id with its reason, and an unknown disposition', () => {
    const bad = (patch: Record<string, unknown>) =>
      settle({ ...SETTLE, evidence: { ...evidence({ status: 'unknown' }), ...patch } }).ok
    assert.equal(bad({ counts: { ...evidence(null).counts, output: { class: 'known', value: 1.5 } } }), false)
    assert.equal(bad({ counts: { ...evidence(null).counts, output: { class: 'known', value: -1 } } }), false)
    assert.equal(bad({ counts: { ...evidence(null).counts, output: { class: 'known', value: 2 ** 53 } } }), false)
    assert.equal(
      bad({ counts: { ...evidence(null).counts, output: { class: 'partial' } } }),
      false,
      'no invented partial knowledge',
    )
    assert.equal(bad({ headerId: 'req_1' }), false, 'the request header id is not carried (C2B)')
    assert.equal(bad({ providerTerminal: 'failed' }), false, 'no invented provider terminal kind')
    assert.equal(
      bad({ responseId: { status: 'identity_unsupported', reason: 'nul', value: 'x' } }),
      false,
      'an unsupported id carries no value',
    )
    assert.equal(
      settlement({
        reservationId: LEGACY_REPLY.reservationId,
        state: 'settled',
        settledUsd: 0,
        evidence: { disposition: 'refunded', replay: false, capped: false, digest: 'b'.repeat(64) },
      }).ok,
      false,
    )
  })

  it('keeps a supported id to 1..8192 well-formed characters with no NUL, and never echoes the refused value', () => {
    const supported = (value: string) => settle({ ...SETTLE, evidence: evidence({ status: 'supported', value }) })
    assert.equal(supported('x'.repeat(8192)).ok, true, 'exactly at the bound')
    assert.equal(supported('😀'.repeat(2048)).ok, true, 'paired surrogates are well formed (4096 code units)')
    for (const [what, value] of [
      ['empty', ''],
      ['one over the bound', 'x'.repeat(8193)],
      ['NUL', 'resp\u0000secret-tail-123'],
      ['an unpaired high surrogate', 'resp\uD800secret-tail-123'],
      ['an unpaired low surrogate', 'resp\uDC00secret-tail-123'],
    ] as const) {
      const r = supported(value)
      assert.equal(r.ok, false, what)
      assert.equal(JSON.stringify(r.errors).includes('secret-tail-123'), false, `${what}: the refusal names no value`)
    }
  })

  it('fits the whole worst-case settlement (a supported id of 8192 escape-heavy characters) under the 256 KiB route', () => {
    const id = '\u0001'.repeat(8192)
    const body = {
      ...SETTLE,
      usage: { inputTokens: 3, outputTokens: 3, provider: 'openai-review', model: 'gpt-6-luna' },
      evidence: evidence({ status: 'supported', value: id }),
    }
    assert.equal(settle(body).ok, true)
    const bytes = Buffer.byteLength(JSON.stringify(body), 'utf8')
    assert.equal(Buffer.byteLength(JSON.stringify(id), 'utf8'), 49154, 'the worst escaped supported id')
    assert.ok(bytes < 256 * 1024, `${String(bytes)} bytes`)
  })
})
