// The capacity-exposure adapter (INC04-R07 C4/C5 W1, 0114): unit level, over synthetic server-internal facts. The
// worked partial reflection (Root86: V 800, c 1000), the restrictive mapping of every uncertainty, the strongest existing
// refusal for proven-over and zero headroom, count eligibility and the monotonic restriction property. The private
// numbers are asserted here only; nothing of them is a wire value. Every fact is SYNTHETIC.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Candidate } from '@sophia/domain'
import type {
  ExposureAttributionFacts,
  ExposureEffectFacts,
  ExposureFinalityFacts,
  ExposureTruthFacts,
  ExposureWindowFacts,
  SelectionExposure,
} from '@sophia/persistence'
import { exposureEffect, restrictCapacity, type ExposureEffect } from './selection-exposure.ts'

const H = (c: string) => c.repeat(64).slice(0, 64)
const MIN = 60_000_000
const NOW = 1_800_000_000_000_000
const P1 = 'a1000000-0000-4000-8000-000000000001'
const P2 = 'a1000000-0000-4000-8000-000000000002'
const E1 = 'e1000000-0000-4000-8000-000000000001'
const E2 = 'e1000000-0000-4000-8000-000000000002'
const OBS = '0b000000-0000-4000-8000-000000000001'
const OBS0 = '0b000000-0000-4000-8000-000000000000'
const ISSUER = '15000000-0000-4000-8000-000000000001'

const finality = (over: Partial<ExposureFinalityFacts> = {}): ExposureFinalityFacts => ({
  payloadDigest: H('f'),
  basis: 'provider_terminal_known',
  finalAt: NOW - 25 * MIN,
  countKind: 'final_total',
  finalCount: 1000,
  evidenceDigest: H('e'),
  approvalRefDigest: H('a'),
  issuerId: ISSUER,
  issuerQualRevision: 1,
  ...over,
})
const truth = (over: Partial<ExposureTruthFacts> = {}): ExposureTruthFacts => ({
  report: 'complete_report',
  noncachedInputClass: 'known',
  noncachedInput: 300,
  cacheReadClass: 'known',
  cacheRead: 100,
  outputClass: 'known',
  output: 700,
  rawInputTotal: null,
  rawCacheRead: null,
  rawOutput: null,
  conflict: false,
  historyFull: false,
  historyConflict: false,
  ...over,
})
const effect = (over: Partial<ExposureEffectFacts> = {}): ExposureEffectFacts => ({
  projectId: P1,
  reservationId: E1,
  createdAt: NOW - 30 * MIN,
  provider: 'openai',
  routeId: 'research-sol-medium-v1',
  contract: 'c1p_complete_report',
  truth: null,
  finality: [finality()],
  ...over,
})
const att = (q: number | null, over: Partial<ExposureAttributionFacts> = {}): ExposureAttributionFacts => ({
  observationId: OBS,
  projectId: P1,
  reservationId: E1,
  coverage: q === null ? 'not_reflected' : 'reflected',
  q,
  n1: null,
  evidenceDigest: H('d'),
  issuerQualified: true,
  conflict: false,
  ...over,
})
const OUTPUT_MAPPING = {
  provider: 'openai',
  routeId: 'research-sol-medium-v1',
  contract: 'c1p_complete_report',
  sourceField: 'output',
  conflict: false,
}

/** One bound remaining_at window, V 800 by default, with one in-scope effect (c 1000) and its attribution. */
const win = (over: Partial<ExposureWindowFacts> = {}): ExposureWindowFacts => ({
  windowRef: 'tokens-day',
  kind: 'remaining_at',
  registration: {
    windowKey: H('k'),
    scopeId: '5c000000-0000-4000-8000-000000000001',
    qualRevision: 1,
    dimension: 'openai.output_tokens',
    unit: 'tokens',
    start: NOW - 120 * MIN,
    end: NOW + 22 * 60 * MIN,
    semantics: 'fixed_epoch',
    measurementBasis: 'issuer_local',
  },
  observations: [
    {
      id: OBS,
      issuerId: ISSUER,
      asOf: NOW - 10 * MIN,
      freshUntil: NOW + 10 * MIN,
      value: 800,
      measurementId: null,
      current: true,
    },
  ],
  partitionConflict: false,
  effects: [effect()],
  truncated: false,
  unrepresented: false,
  attributions: [att(400)],
  mappings: [],
  ...over,
})
const bound = (...windows: ExposureWindowFacts[]): SelectionExposure => ({ v: 1, state: 'bound', now: NOW, windows })
const one = (w: ExposureWindowFacts): ExposureEffect => {
  const e = exposureEffect(bound(w))
  assert.ok(e !== null)
  return e
}
const projection = (w: ExposureWindowFacts) => {
  const p = one(w).windows[0]?.projection
  assert.ok(p, 'a projection')
  return p
}

describe('the worked partial reflection (Root86: V 800, c 1000, private numbers)', () => {
  it('q 400 (0 < q < c): X 600, effective 200, unchanged', () => {
    const p = projection(win())
    assert.deepEqual(
      [p.status, p.xFloor, p.xCeiling, p.effectiveCeiling, p.effectiveFloor],
      ['exact', 600, 600, 200, 200],
    )
    assert.equal(one(win()).outcome, 'unchanged')
  })
  it('q 800 (doubled): X 200, effective 600, unchanged; a causally different private value', () => {
    const p = projection(win({ attributions: [att(800)] }))
    assert.deepEqual([p.xFloor, p.effectiveFloor], [200, 600])
    assert.equal(one(win({ attributions: [att(800)] })).outcome, 'unchanged')
  })
  it('q 1000 (full reflection): X 0, effective 800, unchanged', () => {
    const p = projection(win({ attributions: [att(1000)] }))
    assert.deepEqual([p.xFloor, p.effectiveFloor], [0, 800])
    assert.equal(one(win({ attributions: [att(1000)] })).outcome, 'unchanged')
  })
  it('q removed: unknown ceiling, never 0 and never available: unproven', () => {
    const e = one(win({ attributions: [] }))
    assert.equal(e.outcome, 'unproven')
    assert.equal(e.windows[0]?.projection?.status, 'bounded_unknown_ceiling')
    assert.equal(e.windows[0]?.projection?.xCeiling, null)
  })
  it('q 0: proven over by 200, the strongest existing refusal (exhausted), not unknown', () => {
    const e = one(win({ attributions: [att(0)] }))
    assert.equal(e.windows[0]?.projection?.provenOverBy, 200)
    assert.deepEqual([e.outcome, e.exhaustedRefs], ['exhausted', ['tokens-day']])
  })
  it('q 200: exactly zero headroom is restrictive in its own right (exhausted), never free', () => {
    const e = one(win({ attributions: [att(200)] }))
    assert.equal(e.windows[0]?.projection?.effectiveCeiling, 0)
    assert.equal(e.windows[0]?.projection?.provenOverBy, undefined)
    assert.equal(e.outcome, 'exhausted')
  })
  it('consumed_in_window: S 400, U 8600 complete is unchanged; S above V is a fact conflict (unproven)', () => {
    const consumed = (v: number) =>
      win({
        kind: 'consumed_in_window',
        observations: [{ ...win().observations[0]!, value: v }],
      })
    const ok = one(consumed(9000))
    assert.deepEqual([ok.windows[0]?.projection?.attributed, ok.windows[0]?.projection?.unattributed], [400, 8600])
    assert.equal(ok.outcome, 'unchanged')
    const over = one(consumed(300))
    assert.equal(over.windows[0]?.projection?.factConflict, true)
    assert.equal(over.outcome, 'unproven')
  })
})

describe('exposure states', () => {
  it('no facts (switch off, or no recorded reading) changes nothing; never bound is the 0107 baseline', () => {
    assert.equal(exposureEffect(undefined), null)
    assert.equal(exposureEffect(null), null)
    assert.equal(exposureEffect({ v: 1, state: 'never_bound' })?.outcome, 'unchanged')
  })
  it('a restricted binding (revoked, conflicted) is unproven, never the never-bound fallback', () => {
    assert.equal(exposureEffect({ v: 1, state: 'restricted' })?.outcome, 'unproven')
  })
  it('a bound reading without windows is unproven', () => {
    assert.equal(exposureEffect(bound())?.outcome, 'unproven')
  })
  it('any exhausted window wins over an unproven one; any unproven over unchanged', () => {
    const other = { ...win({ attributions: [] }), windowRef: 'tokens-hour' }
    assert.equal(exposureEffect(bound(win(), other))?.outcome, 'unproven')
    const over = exposureEffect(bound(other, win({ attributions: [att(0)] })))
    assert.deepEqual([over?.outcome, over?.exhaustedRefs], ['exhausted', ['tokens-day']])
  })
})

describe('restrictive uncertainty', () => {
  const unproven = (w: ExposureWindowFacts, label: string) => assert.equal(one(w).outcome, 'unproven', label)
  it('a partition conflict, an unqualified registration, a missing current binding', () => {
    unproven(win({ partitionConflict: true }), 'partition conflict')
    unproven(win({ registration: { ...win().registration, semantics: 'unknown' } }), 'unknown semantics')
    unproven(win({ registration: { ...win().registration, unit: 'requests' } }), 'unit')
    unproven(win({ observations: [{ ...win().observations[0]!, current: false }] }), 'current not bound')
  })
  it('stale, historical, not yet open, and verdict-only readings', () => {
    const o = win().observations[0]!
    unproven(win({ observations: [{ ...o, freshUntil: NOW }] }), 'stale')
    unproven(win({ registration: { ...win().registration, end: NOW } }), 'historical')
    unproven(win({ registration: { ...win().registration, start: NOW + MIN } }), 'not open')
    unproven(win({ kind: 'verdict_only', observations: [{ ...o, value: null }] }), 'verdict only')
  })
  it('an incomplete effect set (unrepresented, truncated) is unproven, but a proven-over floor stays exhausted', () => {
    unproven(win({ unrepresented: true }), 'unrepresented')
    unproven(win({ truncated: true }), 'truncated')
    assert.equal(one(win({ unrepresented: true, attributions: [att(0)] })).outcome, 'exhausted')
  })
  it('an attribution conflict, an unqualified issuer, or q of another observation is unknown, never zero', () => {
    unproven(win({ attributions: [att(400, { conflict: true })] }), 'att conflict')
    unproven(win({ attributions: [att(400, { issuerQualified: false })] }), 'issuer')
    unproven(win({ attributions: [att(400, { observationId: OBS0 })] }), 'other observation')
  })
  it('a fixed-epoch regression across two readings, and a coverage regression of q, are unproven', () => {
    const o = win().observations[0]!
    const earlier = { ...o, id: OBS0, asOf: o.asOf - MIN, value: 700, current: false }
    unproven(win({ observations: [earlier, o] }), 'remaining rose in a fixed epoch')
    const regressed = win({
      observations: [{ ...earlier, value: 900 }, o],
      attributions: [att(600, { observationId: OBS0 }), att(400)],
    })
    unproven(regressed, 'q fell in a fixed epoch')
    assert.equal(
      one(
        win({
          observations: [{ ...earlier, value: 900 }, o],
          attributions: [att(300, { observationId: OBS0 }), att(400)],
        }),
      ).outcome,
      'unchanged',
      'an earlier smaller q is not a regression',
    )
  })
  it('an incomparable equal-as-of tie is bounded: unproven, or exhausted only when every ceiling is spent', () => {
    const o = win().observations[0]!
    const twin = { ...o, id: OBS0, issuerId: '15000000-0000-4000-8000-000000000009', value: 900, measurementId: 'm2' }
    const tie = win({
      observations: [
        { ...o, measurementId: 'm1' },
        { ...twin, current: false },
      ],
    })
    unproven(tie, 'tie')
  })
})

describe('count eligibility (so_far, finality, mappings)', () => {
  const soFar = (t: Partial<ExposureTruthFacts>, mappings = [OUTPUT_MAPPING], fin: ExposureFinalityFacts[] = []) =>
    win({ effects: [effect({ truth: truth(t), finality: fin })], mappings, attributions: [att(0)] })
  it('a reported known count is a so_far lower bound: it can prove over, never cap (unknown ceiling)', () => {
    const over = one(soFar({ output: 1000 }))
    assert.equal(over.windows[0]?.projection?.xFloor, 1000)
    assert.equal(over.outcome, 'exhausted')
    const under = one(soFar({ output: 100 }))
    assert.equal(under.windows[0]?.projection?.xCeiling, null)
    assert.equal(under.outcome, 'unproven')
  })
  it('unknown and no_separate_reported_class are absent, never 0; no mapping row is absent', () => {
    assert.equal(one(soFar({ outputClass: 'unknown', output: null })).windows[0]?.projection?.xFloor, 0)
    assert.equal(one(soFar({}, [])).windows[0]?.projection?.xFloor, 0)
    const cacheWrite = { ...OUTPUT_MAPPING, sourceField: 'cache_write' }
    assert.equal(one(soFar({}, [cacheWrite])).windows[0]?.projection?.xFloor, 0, 'cache_write is never a count')
  })
  it('two mapped sources: agreeing is a so_far count, disagreeing is unresolved (no max or min)', () => {
    const input = (f: string) => ({ ...OUTPUT_MAPPING, sourceField: f })
    const w = (raw: number) =>
      win({
        registration: { ...win().registration, dimension: 'openai.input_tokens' },
        effects: [effect({ truth: truth({ rawInputTotal: raw }), finality: [] })],
        mappings: [input('raw_input_total'), input('input_total_from_parts')],
        attributions: [att(0)],
      })
    assert.equal(one(w(400)).windows[0]?.projection?.xFloor, 400)
    const disagree = one(w(999))
    assert.equal(disagree.windows[0]?.projection?.xFloor, 0)
    assert.equal(disagree.outcome, 'unproven')
  })
  it('a conflicted truth row, a full or conflicted history, or a conflicted mapping is unresolved', () => {
    for (const t of [{ conflict: true }, { historyFull: true }, { historyConflict: true }]) {
      const e = one(soFar({ ...t, output: 5000 }))
      assert.equal(e.windows[0]?.projection?.xFloor, 0, JSON.stringify(t))
      assert.equal(e.outcome, 'unproven', JSON.stringify(t))
    }
    assert.equal(one(soFar({ output: 5000 }, [{ ...OUTPUT_MAPPING, conflict: true }])).outcome, 'unproven')
  })
  it('a reported count above its qualified final total is a contradiction: unresolved, no max chosen', () => {
    const contradiction = one(soFar({ output: 1200 }, [OUTPUT_MAPPING], [finality()]))
    assert.deepEqual([contradiction.outcome, contradiction.windows[0]?.projection?.xFloor], ['unproven', 0])
    const consistent = one(win({ effects: [effect({ truth: truth({ output: 900 }) })], mappings: [OUTPUT_MAPPING] }))
    assert.deepEqual([consistent.outcome, consistent.windows[0]?.projection?.xFloor], ['unchanged', 600])
  })
  it('finality: none→known extends; a count conflict or a terminal conflict is unresolved; replay is one payload', () => {
    const none = finality({ payloadDigest: H('1'), countKind: 'none', finalCount: null })
    const known = finality({ payloadDigest: H('2') })
    assert.equal(one(win({ effects: [effect({ finality: [none, known] })] })).outcome, 'unchanged')
    const count = finality({ payloadDigest: H('3'), finalCount: 900 })
    assert.equal(one(win({ effects: [effect({ finality: [known, count] })] })).outcome, 'unproven')
    const terminal = finality({ payloadDigest: H('4'), finalAt: NOW - 24 * MIN })
    assert.equal(one(win({ effects: [effect({ finality: [known, terminal] })] })).outcome, 'unproven')
    const provenance = finality({ payloadDigest: H('5'), evidenceDigest: H('9') })
    assert.equal(one(win({ effects: [effect({ finality: [known, provenance] })] })).outcome, 'unchanged')
  })
  it('a final_total claim without qualified finality never caps; never-left release is a final 0', () => {
    const noFinality = one(win({ effects: [effect({ finality: [] })] }))
    assert.equal(noFinality.outcome, 'unproven')
    const neverLeft = finality({ basis: 'never_left_release', finalCount: 0 })
    assert.equal(one(win({ effects: [effect({ finality: [neverLeft] })], attributions: [] })).outcome, 'unchanged')
  })
  it('effects of every project on the account count (cross-project)', () => {
    const second = effect({ projectId: P2, reservationId: E2 })
    const both = win({
      effects: [effect(), second],
      attributions: [att(400), att(1000, { projectId: P2, reservationId: E2 })],
    })
    assert.equal(projection(both).xFloor, 600)
    assert.equal(one(win({ effects: [effect(), second] })).outcome, 'unproven', 'the second effect unattributed')
  })
  it('a structurally invalid fact is refused by the pure module and maps to unproven, never repaired', () => {
    assert.equal(one(win({ observations: [{ ...win().observations[0]!, value: -1 }] })).outcome, 'unproven')
  })
})

describe('the kernel capacity input is only ever restricted', () => {
  const window = (ref: string, verdict: 'admits' | 'exhausted') => ({
    windowRef: ref,
    scope: 'account' as const,
    unit: 'tokens',
    provenanceRef: OBS,
    observedAt: '2026-11-13T11:50:00.000000Z',
    freshUntil: '2026-11-13T12:10:00.000000Z',
    applicability: 'known' as const,
    verdict,
    resetAt: null,
  })
  const policy = { proof: null as never, verdict: 'admits' as const }
  const witness: Candidate['capacity'] = {
    basis: 'conservative_policy',
    limits: { witness: 'covered', requiredWindowRefs: ['tokens-day', 'tokens-hour'] },
    windows: [window('tokens-day', 'admits'), window('tokens-hour', 'admits')],
    policy,
  }
  /** A valid current 0107 witness whose tokens-day window is already exhausted (the kernel's capacity_exhausted). */
  const exhaustedWitness: Candidate['capacity'] = {
    ...witness,
    windows: [window('tokens-day', 'exhausted'), window('tokens-hour', 'admits')],
  }
  const none: Candidate['capacity'] = { basis: 'none', limits: { witness: 'unknown' }, windows: [], policy: null }
  const baseline: Candidate['capacity'] = {
    basis: 'conservative_policy',
    limits: { witness: 'unknown' },
    windows: [],
    policy,
  }
  const effects: (ExposureEffect | null)[] = [
    null,
    { outcome: 'unchanged', exhaustedRefs: [], windows: [] },
    { outcome: 'unproven', exhaustedRefs: [], windows: [] },
    { outcome: 'exhausted', exhaustedRefs: ['tokens-day'], windows: [] },
    { outcome: 'exhausted', exhaustedRefs: ['no-such-window'], windows: [] },
  ]
  it('unchanged keeps the base exactly; unproven is basis none; exhausted marks only its windows', () => {
    assert.equal(restrictCapacity(witness, effects[1]!), witness)
    assert.deepEqual(restrictCapacity(witness, effects[2]!), none)
    const ex = restrictCapacity(witness, effects[3]!)
    assert.deepEqual(
      ex.windows.map((w) => [w.windowRef, w.verdict]),
      [
        ['tokens-day', 'exhausted'],
        ['tokens-hour', 'admits'],
      ],
    )
    assert.deepEqual(restrictCapacity(witness, effects[4]!), none, 'no witness window is made up')
  })
  it('W1-F02: uncertainty never discards a witness that already proves a window exhausted', () => {
    for (const e of [effects[2], effects[4], { outcome: 'unproven' as const, exhaustedRefs: [], windows: [] }]) {
      assert.equal(restrictCapacity(exhaustedWitness, e ?? null), exhaustedWitness, 'the existing refusal stands')
    }
    const both = restrictCapacity(exhaustedWitness, {
      outcome: 'exhausted',
      exhaustedRefs: ['tokens-hour'],
      windows: [],
    })
    assert.deepEqual(
      both.windows.map((w) => w.verdict),
      ['exhausted', 'exhausted'],
    )
    // Never made up: an admitting witness under uncertainty is unproven, not exhausted.
    assert.deepEqual(restrictCapacity(witness, effects[2] ?? null), none)
  })
  it('property: for every base and effect, nothing becomes more admitting', () => {
    for (const base of [witness, exhaustedWitness, none, baseline]) {
      for (const e of effects) {
        const out = restrictCapacity(base, e)
        if (base.basis === 'none') assert.deepEqual(out, base)
        // Unconditionally, whatever the output's basis: every window the base already proves exhausted stays exhausted.
        for (const before of base.windows.filter((w) => w.verdict === 'exhausted')) {
          const after = out.windows.find((w) => w.windowRef === before.windowRef)
          assert.equal(after?.verdict, 'exhausted', `${before.windowRef} kept exhausted`)
        }
        if (out.basis !== 'none') {
          assert.equal(out.basis, base.basis)
          assert.deepEqual(out.limits, base.limits)
          assert.equal(out.policy, base.policy)
          out.windows.forEach((w, i) => {
            const before = base.windows[i]
            assert.ok(before && before.windowRef === w.windowRef, 'the same windows, in order')
            if (before.verdict === 'exhausted') assert.equal(w.verdict, 'exhausted')
          })
        }
      }
    }
  })
})
