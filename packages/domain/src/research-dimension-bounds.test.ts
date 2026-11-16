// INC04-R07-C2-DIMENSION-BOUNDS-CORE-001: the C2 codec, digest helpers, derived lifecycle and Rule K against the FROZEN
// synthetic fixtures. The database computes the same bytes (asserted by db/tests/0113 and the persistence DB test).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  APPEND_DOMAINS,
  authorizeSetDigest,
  digestOf,
  effective,
  frame,
  isInstant,
  knowledge,
  outboundDigest,
  policyItem,
  policySetDigest,
  policyState,
  profileState,
  validate,
  type AppendDomain,
  type KnowledgeInput,
  type LifecycleEvent,
  type OutboundPreimage,
} from './research-dimension-bounds.ts'

type HelperFixture = { name: string; digest: string | null } & (
  | { kind: 'outbound'; input: OutboundPreimage }
  | { kind: 'authorize_set'; input: { dispatchId: string; digests: string[] } }
  | { kind: 'policy_item'; input: { registerDigest: string; activateDigest: string } }
  | { kind: 'policy_set'; input: { dimension: string; items: string[] } }
)
interface Fixtures {
  positive: { name: string; domain: AppendDomain; payload: Record<string, unknown>; bytes: number; digest: string }[]
  helpers: HelperFixture[]
  refusals: { name: string; domain: AppendDomain; payload: unknown; code: string; stage: string }[]
  knowledge: { name: string; v: number; q: number; input: KnowledgeInput; knowledge: unknown; effective: unknown }[]
}
function helperDigest(h: HelperFixture): string | null {
  if (h.kind === 'outbound') return outboundDigest(h.input)
  if (h.kind === 'authorize_set') return authorizeSetDigest(h.input.dispatchId, h.input.digests)
  if (h.kind === 'policy_item') return policyItem(h.input.registerDigest, h.input.activateDigest)
  return policySetDigest(h.input.dimension, h.input.items)
}
const ev = (kind: LifecycleEvent['kind'], digest: string, target?: string): LifecycleEvent => ({
  kind,
  digest,
  targetEventDigest: target ?? null,
})
const F = JSON.parse(
  readFileSync(new URL('./research-dimension-bounds.fixtures.json', import.meta.url), 'utf8'),
) as Fixtures
const H = (ch: string) => ch.repeat(64)

describe('C2 codec: eight closed append domains', () => {
  it('has exactly the eight frozen append domains, every field typed', () => {
    assert.deepEqual(Object.keys(APPEND_DOMAINS).toSorted(), [
      'sophia.c2.bound.authorize.v1',
      'sophia.c2.bound.policy.event.v1',
      'sophia.c2.bound.policy.register.v1',
      'sophia.c2.bound.profile.event.v1',
      'sophia.c2.bound.profile.register.v1',
      'sophia.c2.dispatch.apply.v1',
      'sophia.c2.dispatch.claim.v1',
      'sophia.c2.dispatch.outcome.v1',
    ])
    assert.equal(F.positive.length, 12)
    assert.ok(new Set(F.positive.map((p) => p.domain)).size === 8, 'every domain has a frozen positive fixture')
  })
  it('reproduces every frozen positive identity (byte length and sha256)', () => {
    for (const p of F.positive) {
      const r = validate(p.domain, p.payload)
      assert.ok(r.ok, p.name)
      assert.equal(Buffer.byteLength(frame(p.domain, r.values)), p.bytes, p.name)
      assert.equal(digestOf(p.domain, r.values), p.digest, p.name)
    }
  })
  it('refuses every frozen refusal with its fixed code, key-set before grammar before cross-field', () => {
    assert.equal(F.refusals.length, 28)
    for (const r of F.refusals) assert.deepEqual(validate(r.domain, r.payload), { ok: false, code: r.code }, r.name)
    const order = Object.fromEntries(F.refusals.map((r) => [r.name, r]))
    assert.equal(order['missing-key-before-grammar']!.code, 'payload_incomplete')
    assert.equal(order['grammar-before-cross']!.code, 'payload_invalid') // usd would be bound_policy_unit_mismatch
    assert.equal(order['policy-usd']!.code, 'bound_policy_unit_mismatch')
  })
  it('carries no supplied single-send or retry flag (they are not fields of any domain)', () => {
    for (const fields of Object.values(APPEND_DOMAINS))
      for (const f of fields) assert.doesNotMatch(f, /single_send|sdk_retries|retries/)
  })
  it('keeps typed null distinct from every string, and the framing prefix-free (CX-NULL-SENTINEL, CX-DELIMITERS)', () => {
    const d = 'sophia.c2.test.v1'
    assert.notEqual(digestOf(d, [null]), digestOf(d, ['n']))
    assert.notEqual(digestOf(d, [null]), digestOf(d, ['']))
    assert.notEqual(digestOf(d, ['a', 'b']), digestOf(d, ['ab']))
    assert.notEqual(digestOf(d, ['s1:a']), digestOf(d, ['s', '1:a']))
    assert.notEqual(digestOf(d, ['a']), digestOf(`${d}x`, ['a']))
    assert.equal(frame(d, ['é', null]), 'd17:sophia.c2.test.v1k1:2s2:én')
  })
  it('validates the R2 calendar for real (Feb 30, hour 24, month 13 refused; leap day and year 0001 accepted)', () => {
    assert.ok(isInstant('2028-02-29T23:59:59.999999Z'))
    assert.ok(isInstant('0001-01-01T00:00:00.000000Z'))
    for (const bad of [
      '2026-02-29T00:00:00.000000Z',
      '2026-02-30T00:00:00.000000Z',
      '2026-11-16T24:00:00.000000Z',
      '2026-13-01T00:00:00.000000Z',
      '2026-11-16T00:00:60.000000Z',
      '2026-11-16T00:00:00.00000Z',
      '2026-11-16T00:00:00.000000+00:00',
      '0000-01-01T00:00:00.000000Z',
    ])
      assert.equal(isInstant(bad), false, bad)
  })
})

describe('C2 digest helpers', () => {
  it('reproduces the frozen helper identities', () => {
    for (const h of F.helpers) {
      const d = helperDigest(h)
      assert.equal(d, h.digest, h.name)
    }
  })
  it('authorize set: order never changes it; a duplicate, a missing or an extra row does', () => {
    const ds = [H('1'), H('2'), H('3'), H('4')]
    const base = authorizeSetDigest('d', ds)
    assert.equal(authorizeSetDigest('d', ds.toReversed()), base)
    assert.notEqual(authorizeSetDigest('d', [H('1'), H('1'), H('3'), H('4')]), base)
    assert.notEqual(authorizeSetDigest('d', ds.slice(0, 3)), base)
    assert.notEqual(authorizeSetDigest('d', [...ds, H('5')]), base)
  })
  it('policy set: none is typed null (no cap); several are one sorted set', () => {
    assert.equal(policySetDigest('openai.output_tokens', []), null)
    assert.equal(
      policySetDigest('openai.output_tokens', [H('a'), H('b')]),
      policySetDigest('openai.output_tokens', [H('b'), H('a')]),
    )
  })
  it('outbound preimage: dispatch_count contributes no item; any field change is another digest', () => {
    const p: OutboundPreimage = {
      provider: 'openai-research',
      endpoint: 'responses',
      model: 'gpt-6.1-sol',
      settingsDigest: H('a'),
      emitterIdentityDigest: H('b'),
      items: [['openai.output_tokens', 'max_output_tokens', '16000']],
    }
    const d = outboundDigest(p)
    for (const q of [
      { ...p, model: 'gpt-6.1-other' },
      { ...p, settingsDigest: H('c') },
      { ...p, emitterIdentityDigest: H('c') },
      { ...p, items: [['openai.output_tokens', 'max_output_tokens', '15999'] as const] },
      { ...p, items: [] },
    ])
      assert.notEqual(outboundDigest(q), d)
  })
})

describe('C2 derived lifecycle (R2E E1)', () => {
  it('unhold clears exactly its target: H1, H2, unhold(H1) is held; unhold(H2) is active', () => {
    const a = ev('activate', H('a'))
    const h1 = ev('hold', H('1'))
    const h2 = ev('hold', H('2'))
    assert.equal(profileState([a, h1, h2, ev('unhold', H('3'), H('1'))], false), 'held')
    assert.equal(profileState([a, h1, h2, ev('unhold', H('3'), H('1')), ev('unhold', H('4'), H('2'))], false), 'active')
  })
  it('precedence distrust > revoke > auto_hold > conflicted > held > active > inactive', () => {
    const a = ev('activate', H('a'))
    assert.equal(profileState([], false), 'inactive')
    assert.equal(profileState([a], false), 'active')
    assert.equal(profileState([a, ev('hold', H('1'))], false), 'held')
    assert.equal(profileState([a, ev('hold', H('1'))], true), 'conflicted')
    assert.equal(profileState([a, ev('auto_hold', H('2'))], true), 'auto_hold')
    assert.equal(profileState([a, ev('auto_hold', H('2')), ev('revoke', H('3'))], true), 'revoke')
    assert.equal(profileState([a, ev('revoke', H('3')), ev('distrust', H('4'))], true), 'distrust')
    assert.equal(profileState([a, ev('auto_hold', H('2')), ev('unhold', H('5'), H('2'))], false), 'auto_hold')
  })
  it('a policy is active only through an activate; revoke > conflicted > active', () => {
    assert.equal(policyState([], false), 'inactive')
    assert.equal(policyState([{ kind: 'activate' }], false), 'active')
    assert.equal(policyState([{ kind: 'activate' }], true), 'conflicted')
    assert.equal(policyState([{ kind: 'activate' }, { kind: 'revoke' }], true), 'revoke')
  })
})

/** R1 F07: the restrictive UNK of a jointly inconsistent final (its c_lo the largest known lower bound). */
const unknownFrom = (cLo: number) => ({
  cLo,
  cHi: null,
  contradicted: false,
  countFinalityInconsistent: true,
  restrictive: true,
})

describe('Rule K (K1-K4) with effective = V - X', () => {
  it('reproduces every frozen vector', () => {
    for (const v of F.knowledge) {
      const k = knowledge(v.input)
      assert.deepEqual(k, v.knowledge, v.name)
      assert.deepEqual(effective(v.v, v.q, k), v.effective, v.name)
    }
  })
  const V = 50000
  const q = 3000
  it('S1: so_far 4000, qualified b 16000 caps: X [1000, 13000], effective [37000, 49000]', () => {
    assert.deepEqual(effective(V, q, knowledge({ soFar: 4000, q, bound: { b: 16000, status: 'qualified' } })), {
      x: [1000, 13000],
      effective: [37000, 49000],
    })
  })
  it('K2: a valid final 17000 is exact (36000) although it contradicts b 16000', () => {
    const k = knowledge({
      finalTotal: { value: 17000, qualifiedFinality: true },
      q,
      bound: { b: 16000, status: 'qualified' },
    })
    assert.equal(k.cLo, 17000)
    assert.equal(k.cHi, 17000)
    assert.equal(k.contradicted, true)
    assert.deepEqual(effective(V, q, k).effective, [36000, 36000])
  })
  it('K3/N10: so_far 17000 never caps; the contradicted bound gives UNK, never an enlarged 17000', () => {
    const k = knowledge({ soFar: 17000, q, bound: { b: 16000, status: 'qualified' } })
    assert.equal(k.cHi, null)
    assert.equal(k.contradicted, true)
    assert.deepEqual(effective(V, q, k), { x: [14000, null], effective: [null, 36000] })
  })
  it('K1: a final without finality is held as so_far (count_finality_inconsistent); conflicting finals are restrictive', () => {
    const c = knowledge({
      finalTotal: { value: 17000, qualifiedFinality: false },
      q,
      bound: { b: 16000, status: 'qualified' },
    })
    assert.deepEqual([c.countFinalityInconsistent, c.cLo, c.cHi], [true, 17000, null])
    const d = knowledge({
      finalTotal: { value: 17000, qualifiedFinality: true },
      conflictingFinals: true,
      q,
      bound: { b: 16000, status: 'qualified' },
    })
    assert.deepEqual([d.restrictive, d.cHi], [true, null])
  })
  it('an unqualified or merely authorized bound never caps; a complete final 0 is 0 (not an unknown bound)', () => {
    for (const status of ['authorized_not_applied', 'applied_unqualified', 'contradicted'] as const)
      assert.equal(knowledge({ soFar: 4000, q, bound: { b: 16000, status } }).cHi, null, status)
    assert.deepEqual(knowledge({ finalTotal: { value: 0, qualifiedFinality: true } }), {
      cLo: 0,
      cHi: 0,
      contradicted: false,
      countFinalityInconsistent: false,
      restrictive: false,
    })
    assert.equal(knowledge({}).cHi, null)
  })
  it('S6: dispatch_count b 1 is an upper bound, never a known count of 1', () => {
    const k = knowledge({ soFar: 0, q: 0, bound: { b: 1, status: 'qualified' } })
    assert.deepEqual([k.cLo, k.cHi], [0, 1])
  })
  it('R1 F07: a final below a known lower bound (q, so_far, another known count) is restrictive UNK, never a negative X or credit', () => {
    const zeroWithQ = knowledge({ finalTotal: { value: 0, qualifiedFinality: true }, q: 1 })
    assert.deepEqual(zeroWithQ, unknownFrom(1))
    assert.deepEqual(effective(100, 1, zeroWithQ), { x: [0, null], effective: [null, 100] }, 'no negative X')
    assert.deepEqual(knowledge({ finalTotal: { value: 4, qualifiedFinality: true }, soFar: 5 }), unknownFrom(5))
    assert.deepEqual(knowledge({ finalTotal: { value: 4, qualifiedFinality: true }, otherKnown: [6] }), unknownFrom(6))
    // another known count is a lower bound without any final too, and still contradicts a bound it exceeds
    const other = knowledge({ otherKnown: [5000], q, bound: { b: 16000, status: 'qualified' } })
    assert.deepEqual([other.cLo, other.cHi, other.restrictive], [5000, 16000, false])
    const above = knowledge({ otherKnown: [17000], q, bound: { b: 16000, status: 'qualified' } })
    assert.deepEqual([above.cLo, above.cHi, above.contradicted], [17000, null, true])
    // the matched positives stay: a valid zero with q 0, a valid final above the bound (K2 exact), an ordinary partial
    assert.deepEqual(knowledge({ finalTotal: { value: 0, qualifiedFinality: true }, q: 0 }).cHi, 0)
    const k2 = knowledge({
      finalTotal: { value: 17000, qualifiedFinality: true },
      q,
      soFar: 9000,
      bound: { b: 16000, status: 'qualified' },
    })
    assert.deepEqual([k2.cLo, k2.cHi, k2.contradicted, k2.restrictive], [17000, 17000, true, false])
    assert.deepEqual(effective(V, q, k2).effective, [36000, 36000])
    assert.deepEqual(knowledge({ finalTotal: { value: 4000, qualifiedFinality: true }, q, soFar: 4000 }).cHi, 4000)
  })
})
