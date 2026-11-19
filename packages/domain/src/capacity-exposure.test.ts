// INC04-R07 C4/C5 pure mechanics checks. Every fixture is synthetic-not-AC-evidence. Expected values come only from the
// frozen copied vectors and transition witnesses in capacity-exposure.fixtures.json (never from this implementation);
// the adapters below only translate the frozen INPUT encoding (documented in the fixture's input_encoding).
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  appendFinality,
  CapacityInputError,
  checkObservationAppend,
  effectKnowledge,
  foldFinality,
  projectObservation,
  reconcileObservations,
  timeState,
  type Attribution,
  type CapacityObservation,
  type ClockBound,
  type Count,
  type EffectItem,
  type FinalityAppend,
  type FinalityState,
  type ObservationCandidate,
  type Projection,
  type ProjectionInput,
  type RegisteredObservation,
  type WindowRegistration,
} from './capacity-exposure.ts'

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
type Obj = { [k: string]: Json }

const fixture = JSON.parse(readFileSync(new URL('./capacity-exposure.fixtures.json', import.meta.url), 'utf8')) as Obj
const prov = fixture['provenance'] as Obj
const vectors = fixture['vectors'] as Obj[]
const witnesses = fixture['transition_witnesses'] as Obj
const digests = fixture['fg_synthetic_digests'] as Record<string, string>
const fgTime = fixture['fg_instant_encoding'] as Record<string, number>

const canonical = (x: Json): string =>
  x === null || typeof x !== 'object'
    ? JSON.stringify(x)
    : Array.isArray(x)
      ? `[${x.map(canonical).join(',')}]`
      : `{${Object.keys(x)
          .toSorted()
          .map((k) => `${JSON.stringify(k)}:${canonical(x[k] as Json)}`)
          .join(',')}}`
const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')
const vectorById = (id: string): Obj => {
  const v = vectors.find((x) => x['id'] === id)
  assert.ok(v, `frozen vector ${id}`)
  return v
}
const obj = (x: Json | undefined): Obj => x as Obj

// ---- frozen input adapters (encoding only) ---------------------------------------------------------------------------

const DIM = 'openai.output_tokens' as const
const ATT_EVIDENCE = digests['attribution-evidence:synthetic'] ?? ''
const QUALIFIED_FIXTURE_CLOCK = 'synthetic-qualified-fixture-clock'

function itemFrom(raw: Obj, truthN1: Obj | undefined): EffectItem {
  const name = raw['name'] as string
  const neverLeft = raw['state'] === 'released_never_left'
  const count = (raw['count'] as Count | undefined) ?? (neverLeft ? { kind: 'final_total' as const, value: 0 } : null)
  const finality =
    raw['final'] === true
      ? { basis: 'provider_terminal_known' as const, finalAt: raw['final_at'] as number }
      : neverLeft
        ? { basis: 'never_left_release' as const, finalAt: raw['created_at'] as number }
        : null
  return {
    key: name,
    projectId: 'synthetic-project',
    reservationId: name,
    dimension: DIM,
    createdAt: raw['created_at'] as number,
    count,
    finality,
    bound: (raw['bound'] as number | null | undefined) ?? null,
    n1: (truthN1?.[name] as string | undefined) ?? null,
  }
}

function attributionsFrom(atts: Obj | undefined, observationId: string): Attribution[] {
  return Object.entries(atts ?? {}).map(([name, a]) => {
    const r = obj(a)
    const reflected = r['coverage'] === 'reflected'
    return {
      itemKey: name,
      observationId,
      coverage: reflected ? ('reflected' as const) : ('not_reflected' as const),
      q: reflected ? (r['q'] as number) : null,
      n1: (r['n1'] as string | undefined) ?? null,
      conflict: r['conflict'] === true,
      issuerQualified: true,
      evidenceDigest: ATT_EVIDENCE,
    }
  })
}

function observationFrom(raw: Obj, id = 'obs'): CapacityObservation {
  return {
    id,
    kind: raw['kind'] as CapacityObservation['kind'],
    value: raw['value'] as number | null,
    window: obj(raw['window']) as unknown as CapacityObservation['window'],
    asOf: raw['as_of'] as number,
    freshUntil: raw['fresh_until'] as number,
    semantics: raw['semantics'] as CapacityObservation['semantics'],
    dimension: DIM,
  }
}

function projectionInputFrom(inp: Obj, obsKey = 'obs', attKey = 'atts'): ProjectionInput {
  const o = observationFrom(obj(inp[obsKey]))
  const truth = inp['truth_n1'] === undefined ? undefined : obj(inp['truth_n1'])
  const prior = inp['earlier_q'] === undefined ? undefined : obj(inp['earlier_q'])
  return {
    observation: o,
    items: ((inp['items'] as Obj[] | undefined) ?? []).map((r) => itemFrom(r, truth)),
    attributions: attributionsFrom(inp[attKey] as Obj | undefined, o.id),
    now: (inp['now'] as number | undefined) ?? o.asOf,
    scopeQualified: inp['scope_active'] !== false,
    ...(prior === undefined ? {} : { priorQ: new Map(Object.entries(prior).map(([k, v]) => [k, v as number])) }),
  }
}

function registryFrom(reg: Obj): Map<string, WindowRegistration> {
  return new Map(
    Object.entries(reg).map(([key, w]) => {
      const r = obj(w)
      return [
        key,
        {
          windowKey: key,
          scopeId: 'synthetic-scope',
          qualRevision: 1,
          dimension: r['dimension'] as typeof DIM,
          unit: r['unit'] as 'tokens',
          start: r['start'] as number,
          end: r['end'] as number,
          semantics: r['semantics'] as WindowRegistration['semantics'],
          measurementBasis: r['measurement_basis'] as WindowRegistration['measurementBasis'],
        },
      ]
    }),
  )
}

function registeredObservationsFrom(list: Obj[]): RegisteredObservation[] {
  return list.map((r) => ({
    id: r['id'] as string,
    issuerId: r['issuer'] as string,
    windowKey: r['window_key'] as string,
    qualRevision: r['qual_revision'] as number,
    kind: r['kind'] as RegisteredObservation['kind'],
    asOf: r['as_of'] as number,
    freshUntil: r['fresh_until'] as number,
    value: r['value'] as number | null,
    measurementId: (r['measurement_id'] as string | null | undefined) ?? null,
  }))
}

// ---- frozen expectation comparison (fixed name table; only frozen keys are asserted) ------------------------------------

const RESULT_FIELD: Record<string, keyof Projection> = {
  status: 'status',
  reasons: 'reasons',
  flags: 'flags',
  freshness: 'freshness',
  usable_current: 'usableCurrent',
  X_floor: 'xFloor',
  X_ceiling: 'xCeiling',
  effective_ceiling: 'effectiveCeiling',
  effective_floor: 'effectiveFloor',
  admits: 'admits',
  possible_over_by: 'possibleOverBy',
  proven_over_by: 'provenOverBy',
  attributed: 'attributed',
  unattributed: 'unattributed',
  coverage_complete: 'coverageComplete',
  attributed_is_lower_bound: 'attributedIsLowerBound',
  fact_conflict: 'factConflict',
}
const NON_PROJECTION_KEYS = new Set(['reservations_after', 'wallet_change', 'K3'])

function assertProjection(actual: Projection, expected: Obj, label: string): void {
  for (const [k, v] of Object.entries(expected)) {
    if (NON_PROJECTION_KEYS.has(k)) continue
    const field = RESULT_FIELD[k]
    assert.ok(field !== undefined, `${label}: no result field for frozen key ${k}`)
    const got = actual[field] ?? null
    assert.deepEqual(got, k === 'status' && v === 'consumed' ? 'consumed' : v, `${label}: ${k}`)
  }
}

function assertCurrent(
  actual: ReturnType<typeof reconcileObservations>['current'],
  expected: Obj,
  label: string,
): void {
  assert.equal(actual.status, expected['status'], `${label}: current.status`)
  if (actual.status === 'unknown') {
    assert.equal(actual.reason, expected['reason'], `${label}: current.reason`)
    return
  }
  assert.deepEqual([...actual.observations], expected['observations'], `${label}: current.observations`)
  if (actual.status === 'known') {
    assertProjection(actual.projection, obj(expected['projection']), `${label}: projection`)
    return
  }
  assert.equal(actual.reason, expected['reason'], `${label}: current.reason`)
  assert.equal(actual.effectiveFloor, expected['effective_floor'], `${label}: effective_floor`)
  assert.equal(actual.effectiveCeiling, expected['effective_ceiling'], `${label}: effective_ceiling`)
  for (const [id, p] of Object.entries(obj(expected['each_projection_retained']))) {
    const got = actual.eachProjectionRetained[id]
    assert.ok(got, `${label}: retained ${id}`)
    assertProjection(got, obj(p), `${label}: retained ${id}`)
  }
}

function deepCopy<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

// ---- 0. fixture integrity ---------------------------------------------------------------------------------------------

describe('frozen fixture integrity (copied, not generated)', () => {
  it('holds exactly the 64 frozen vectors and five FG witnesses with their recorded canonical digests', () => {
    assert.equal(vectors.length, 64)
    assert.equal(prov['vector_count'], 64)
    assert.equal(new Set(vectors.map((v) => v['id'])).size, 64)
    assert.equal(sha256(canonical(vectors as Json)), prov['vectors_canonical_sha256'])
    assert.equal(sha256(canonical(fixture['vectors_header'] as Json)), prov['vectors_header_canonical_sha256'])
    assert.equal(sha256(canonical(witnesses as Json)), prov['witnesses_canonical_sha256'])
    assert.deepEqual(
      (witnesses['cases'] as Obj[]).map((c) => c['id']),
      prov['witness_cases'],
    )
    assert.equal(
      obj(prov['vectors_source'])['sha256'],
      'ce226935c321f10daa887e14bb503009bdd5a67075ec201bcfb22d6b29b07e47',
    )
    assert.equal(
      obj(prov['witness_source'])['sha256'],
      'a6d6ec87cb5f56d425f8bde00091d04db61e62cf9b1316ac4b9713ac9cc93325',
    )
    assert.equal(obj(prov['addendum'])['sha256'], 'a306d9e1717966b75d542f77356e32af5be97bf1c116cf32e2b18a2cd10f6e77')
  })

  it('maps every superseded expectation explicitly', () => {
    const sup = fixture['supersession'] as Obj[]
    assert.ok(sup.some((s) => JSON.stringify(s['supersedes'] ?? null).includes('T-FINALITY-CONFLICT')))
    assert.ok(sup.some((s) => s['vector'] === 'P-SKEW-CURRENT'))
  })
})

// ---- 1. the 64 frozen vectors ------------------------------------------------------------------------------------------

const PROJECTION_IDS: string[] = []
const RECONCILE_IDS: string[] = []
const TIME_IDS: string[] = []
for (const v of vectors) {
  const inp = obj(v['inputs'])
  if ('observations' in inp) RECONCILE_IDS.push(v['id'] as string)
  else if ('window' in inp && 'as_of' in inp) TIME_IDS.push(v['id'] as string)
  else if ('obs' in inp && 'items' in inp) PROJECTION_IDS.push(v['id'] as string)
}

describe('frozen projection vectors (C4 reflection / C5 exposure)', () => {
  for (const id of PROJECTION_IDS) {
    it(id, () => {
      const v = vectorById(id)
      const inputs = obj(v['inputs'])
      const before = deepCopy(inputs)
      const pin = projectionInputFrom(inputs)
      const pinCopy = deepCopy({ ...pin, priorQ: [...(pin.priorQ ?? new Map<string, number>())] })
      const p = projectObservation(pin)
      assertProjection(p, obj(v['expected']), id)
      // Never mutates its inputs (frozen data and adapted input alike); results carry no money effect.
      assert.deepEqual(inputs, before)
      assert.deepEqual({ ...pin, priorQ: [...(pin.priorQ ?? new Map<string, number>())] }, pinCopy)
      assert.ok(Object.isFrozen(p))
      for (const k of Object.keys(p)) assert.ok(Object.values(RESULT_FIELD).includes(k as keyof Projection), k)
    })
  }

  it('V06 (fixed-epoch q regression) uses its own earlier q', () => {
    const v = vectorById('V06')
    assertProjection(
      projectObservation(projectionInputFrom(obj(v['inputs']), 'obs_t3', 'atts_t3')),
      obj(v['expected']),
      'V06',
    )
  })

  it('V07 keeps independent windows independent', () => {
    const v = vectorById('V07')
    for (const w of ['minute', 'day']) {
      assertProjection(
        projectObservation(projectionInputFrom(obj(obj(v['inputs'])[w]))),
        obj(obj(v['expected'])[w]),
        `V07 ${w}`,
      )
    }
  })

  it('V08 reserved -> settled keeps the attribution', () => {
    const v = vectorById('V08')
    for (const phase of ['before', 'after']) {
      assertProjection(
        projectObservation(projectionInputFrom(obj(obj(v['inputs'])[phase]))),
        obj(obj(v['expected'])[phase]),
        `V08 ${phase}`,
      )
    }
  })

  it('V13 new epoch holds the old reservation at its ceiling; nothing released (no money effect, inputs intact)', () => {
    const v = vectorById('V13')
    const inputs = obj(v['inputs'])
    const before = deepCopy(inputs)
    const p = projectObservation(projectionInputFrom(inputs))
    assertProjection(p, obj(v['expected']), 'V13')
    assert.deepEqual(obj(obj(v['expected'])['reservations_after']), { b: 'reserved' })
    assert.equal(obj(v['expected'])['wallet_change'], 0)
    assert.deepEqual(inputs, before)
    assert.ok(!('reservations' in p) && !('wallet' in p))
  })

  it('V16 withdrawn scope yields no capacity', () => {
    const v = vectorById('V16')
    const inp = obj(v['inputs'])
    const p = projectObservation({
      observation: observationFrom(obj(inp['obs'])),
      items: [],
      attributions: [],
      now: 600,
      scopeQualified: inp['scope_active'] !== false,
    })
    assertProjection(p, obj(v['expected']), 'V16')
    assert.equal(p.effectiveCeiling, undefined)
  })

  it('V24 an issuer of another scope is refused at append', () => {
    const v = vectorById('V24')
    const a = obj(obj(v['inputs'])['append'])
    const reg = new Map([['W', { ...registration('W', 0, 1440), scopeId: a['observation_scope'] as string }]])
    const code = checkObservationAppend(
      {
        ...candidateOn(reg.get('W') as WindowRegistration, 600, 1_000_000),
        issuer: { scopeId: a['issuer_scope'] as string, qualRevision: 1 },
      },
      reg,
      600,
    )
    assert.equal(code, obj(v['expected'])['code'])
    assert.equal(obj(v['expected'])['append'], 'refused')
  })
})

function registration(key: string, start: number, end: number): WindowRegistration {
  return {
    windowKey: key,
    scopeId: 'synthetic-scope',
    qualRevision: 1,
    dimension: DIM,
    unit: 'tokens',
    start,
    end,
    semantics: 'fixed_epoch',
    measurementBasis: 'issuer_local',
  }
}

function candidateOn(w: WindowRegistration, asOf: number, freshUntil: number): ObservationCandidate {
  return {
    windowKey: w.windowKey,
    dimension: w.dimension,
    unit: w.unit,
    start: w.start,
    end: w.end,
    semantics: w.semantics,
    asOf,
    freshUntil,
    issuer: { scopeId: w.scopeId, qualRevision: w.qualRevision },
  }
}

describe('frozen time-causality vectors (one predicate for append and projection)', () => {
  for (const id of TIME_IDS) {
    it(id, () => {
      const v = vectorById(id)
      const inp = obj(v['inputs'])
      const win = obj(inp['window']) as unknown as { start: number; end: number }
      const clock: ClockBound | undefined =
        inp['delta'] === undefined
          ? undefined
          : { delta: inp['delta'] as number, qualifiedBasis: QUALIFIED_FIXTURE_CLOCK }
      const asOf = inp['as_of'] as number
      const fresh = inp['fresh_until'] as number
      const now = inp['now'] as number
      const exp = obj(v['expected'])
      assert.equal(timeState(win, asOf, fresh, now, clock), exp['time_state'])
      const reg = new Map([['W', registration('W', win.start, win.end)]])
      const code = checkObservationAppend(candidateOn(reg.get('W') as WindowRegistration, asOf, fresh), reg, now, clock)
      assert.equal(code ?? 'accepted', exp['append'])
    })
  }

  it('P-SKEW-CURRENT (ADDENDUM clause 3): the frozen expectation holds only with a qualified clock basis', () => {
    const inp = obj(vectorById('P-SKEW-CURRENT')['inputs'])
    const win = obj(inp['window']) as unknown as { start: number; end: number }
    const args = [win, inp['as_of'] as number, inp['fresh_until'] as number, inp['now'] as number] as const
    assert.equal(timeState(...args, { delta: 5, qualifiedBasis: QUALIFIED_FIXTURE_CLOCK }), 'current')
    assert.throws(() => timeState(...args, { delta: 5, qualifiedBasis: ' ' }), isRefusal('clock_unqualified'))
    assert.equal(timeState(...args), 'future') // without a qualified offset the reading is from the future
  })
})

describe('frozen registration and unit vectors', () => {
  it('R1-CX-INCOMPATIBLE-WINDOW-BASIS: an inconsistent window is refused, so it is never compared', () => {
    const v = vectorById('R1-CX-INCOMPATIBLE-WINDOW-BASIS')
    const inp = obj(v['inputs'])
    const reg = registryFrom(obj(inp['registry']))
    const w = reg.get('W') as WindowRegistration
    const code = (k: string) => {
      const c = obj(inp[k])
      const [start, end] = c['window'] as [number, number]
      return (
        checkObservationAppend(
          { ...candidateOn(w, start, end), start, end, semantics: c['semantics'] as WindowRegistration['semantics'] },
          reg,
          start,
        ) ?? 'accepted'
      )
    }
    assert.equal(code('I1'), obj(v['expected'])['I1_append'])
    assert.equal(code('I2'), obj(v['expected'])['I2_append'])
  })

  for (const id of ['R1-CX-UNIT-DIMENSION', 'P-UNIT-MATCH']) {
    it(id, () => {
      const v = vectorById(id)
      const inp = obj(v['inputs'])
      const reg = new Map([['W', registration('W', 0, 1440)]])
      const c = {
        ...candidateOn(reg.get('W') as WindowRegistration, 600, 700),
        dimension: inp['dimension'] as string,
        unit: inp['unit'] as string,
      }
      assert.equal(checkObservationAppend(c, reg, 600) ?? 'accepted', obj(v['expected'])['append'])
    })
  }
})

describe('frozen comparability, regression and tie vectors', () => {
  for (const id of RECONCILE_IDS) {
    it(id, () => {
      const v = vectorById(id)
      const inp = obj(v['inputs'])
      const per = inp['per_observation'] === undefined ? undefined : obj(inp['per_observation'])
      const r = reconcileObservations({
        observations: registeredObservationsFrom(inp['observations'] as Obj[]),
        registry: registryFrom(obj(inp['registry'])),
        now: inp['now'] as number,
        scopeQualified: true,
        ...(per === undefined
          ? {}
          : {
              perObservation: new Map(
                Object.entries(per).map(([oid, e]) => [
                  oid,
                  {
                    items: ((obj(e)['items'] as Obj[] | undefined) ?? []).map((x) => itemFrom(x, undefined)),
                    attributions: attributionsFrom(obj(e)['atts'] as Obj | undefined, oid),
                  },
                ]),
              ),
            }),
      })
      const exp = obj(v['expected'])
      assert.deepEqual(
        r.conflicts.map((c) => [...c]),
        exp['conflicts'],
      )
      assert.deepEqual(
        r.regressions.map((c) => [...c]),
        exp['regressions'],
      )
      assertCurrent(r.current, obj(exp['current']), id)
      if (id === 'P-TIE-EQUIVALENT' && r.current.status === 'known') {
        // ADDENDUM boundary: equivalent numbers keep every candidate's projection and diagnostics.
        assert.deepEqual(Object.keys(r.current.eachProjectionRetained).toSorted(), ['m1o', 'm2o'])
        assert.equal(r.current.diagnostics.coverageComplete, true)
      }
    })
  }

  it('every one of the 64 frozen vectors is exercised by exactly one category', () => {
    const special = [
      'V06',
      'V07',
      'V08',
      'V16',
      'V24',
      'R1-CX-INCOMPATIBLE-WINDOW-BASIS',
      'R1-CX-UNIT-DIMENSION',
      'P-UNIT-MATCH',
    ]
    const covered = [...PROJECTION_IDS, ...RECONCILE_IDS, ...TIME_IDS, ...special]
    assert.equal(new Set(covered).size, covered.length)
    assert.deepEqual(covered.toSorted(), vectors.map((v) => v['id'] as string).toSorted())
  })
})

// ---- 2. FG01–FG05 finality fold (ADDENDUM clause 1) ------------------------------------------------------------------

const SUBJECT = {
  projectId: 'synthetic-original-project',
  reservationId: 'synthetic-original-reservation',
  dimension: DIM,
}
function finalityAppend(
  payload: string,
  evidence: string,
  facts: { countKind: 'final_total' | 'none'; finalCount: number | null; finalAt?: number },
): FinalityAppend {
  return {
    subject: SUBJECT,
    payloadDigest: digests[`payload:${payload}`] ?? '',
    basis: 'provider_terminal_known',
    finalAt: facts.finalAt ?? (fgTime['T1_final_at'] as number),
    countKind: facts.countKind,
    finalCount: facts.finalCount,
    evidenceDigest: digests[`evidence:${evidence}`] ?? '',
    approvalRefDigest: digests['approval:synthetic'] ?? '',
    issuerId: 'synthetic-issuer',
    issuerQualRevision: 1,
  }
}
const R1_NONE = finalityAppend('R1-none-E1', 'E1', { countKind: 'none', finalCount: null })
const R2_4000 = finalityAppend('R2-known4000-E2', 'E2', { countKind: 'final_total', finalCount: 4000 })
const R3_4000_E3 = finalityAppend('R3-known4000-E3', 'E3', { countKind: 'final_total', finalCount: 4000 })
const R4_4001 = finalityAppend('R4-known4001-E4', 'E4', { countKind: 'final_total', finalCount: 4001 })
const R5_T2 = finalityAppend('R5-terminalT2-E5', 'E5', {
  countKind: 'none',
  finalCount: null,
  finalAt: fgTime['T2_final_at'] as number,
})
const caseOf = (id: string): Obj => {
  const c = (witnesses['cases'] as Obj[]).find((x) => x['id'] === id)
  assert.ok(c, id)
  return c
}

function fg01Item(state: FinalityState | null): EffectItem {
  const k = effectKnowledge(state)
  const ex = obj(caseOf('FG01_NONE_TO_KNOWN')['capacity_example'])
  return {
    key: 'r',
    projectId: SUBJECT.projectId,
    reservationId: SUBJECT.reservationId,
    dimension: DIM,
    createdAt: fgTime['item_created_at'] as number,
    count: k.count ?? { kind: 'so_far', value: ex['so_far'] as number },
    finality: k.finality,
    bound: ex['qualified_bound'] as number,
    n1: null,
  }
}
function fg01Projection(state: FinalityState | null): Projection {
  const ex = obj(caseOf('FG01_NONE_TO_KNOWN')['capacity_example'])
  return projectObservation({
    observation: {
      id: 'obs',
      kind: 'remaining_at',
      value: ex['V'] as number,
      window: {
        start: (fgTime['window'] as unknown as number[])[0] ?? 0,
        end: (fgTime['window'] as unknown as number[])[1] ?? 0,
      },
      asOf: fgTime['observation_as_of'] as number,
      freshUntil: 1_000_000,
      semantics: 'fixed_epoch',
      dimension: DIM,
    },
    items: [fg01Item(state)],
    attributions: [
      {
        itemKey: 'r',
        observationId: 'obs',
        coverage: 'reflected',
        q: ex['q'] as number,
        n1: null,
        conflict: false,
        issuerQualified: true,
        evidenceDigest: ATT_EVIDENCE,
      },
    ],
    now: fgTime['now'] as number,
    scopeQualified: true,
  })
}

describe('FG01–FG05 immutable finality knowledge (design witnesses, required results)', () => {
  it('FG01 none -> qualified known extends knowledge with two immutable receipts', () => {
    const first = appendFinality(null, R1_NONE)
    const second = appendFinality(first.state, R2_4000)
    assert.equal(second.state.status, 'known')
    assert.deepEqual(
      second.state.receipts.map((r) => r.kind),
      ['established', 'extended'],
    )
    assert.equal(second.state.known.finalCount, 4000)
    assert.equal(second.state.known.finalAt, R1_NONE.finalAt) // existing finality fields remain exact
    assert.equal(second.state.competing.length, 0)
    assert.equal(first.state.known.finalCount, null) // the earlier state object is untouched
    assert.deepEqual(
      first.state.receipts.map((r) => r.seq),
      [1],
    )
  })

  it('FG01 capacity example: before X [1000,13000] / effective [37000,49000]; after [1000,1000] / [49000,49000]', () => {
    const ex = obj(caseOf('FG01_NONE_TO_KNOWN')['capacity_example'])
    const before = fg01Projection(appendFinality(null, R1_NONE).state)
    const after = fg01Projection(foldFinality([R1_NONE, R2_4000]).state)
    assert.deepEqual([before.xFloor, before.xCeiling], ex['before_X'])
    assert.deepEqual([before.effectiveFloor, before.effectiveCeiling], ex['before_effective'])
    assert.deepEqual([after.xFloor, after.xCeiling], ex['after_X'])
    assert.deepEqual([after.effectiveFloor, after.effectiveCeiling], ex['after_effective'])
  })

  it('FG02 exact replay after a lost reply returns the same receipt and adds nothing', () => {
    const { state, outcomes } = foldFinality([R1_NONE, R2_4000, R2_4000, R2_4000])
    assert.ok(state)
    assert.equal(state.receipts.length, 2)
    const [, committed, retry1, retry2] = outcomes
    assert.ok(committed && retry1 && retry2)
    assert.equal(committed.replay, false)
    assert.deepEqual([retry1.replay, retry2.replay], [true, true])
    assert.deepEqual(retry1.receipt, committed.receipt)
    assert.deepEqual(retry2.receipt, committed.receipt)
    assert.equal(outcomes[0]?.receipt.seq, 1) // the original none receipt stays immutable
  })

  it('FG03 the same known facts with new provenance add a receipt, not a conflict', () => {
    const { state } = foldFinality([R1_NONE, R2_4000, R3_4000_E3])
    assert.ok(state)
    assert.equal(state.status, 'known')
    assert.deepEqual(
      state.receipts.map((r) => r.kind),
      ['established', 'extended', 'provenance'],
    )
    assert.equal(state.competing.length, 0)
  })

  it('FG04 known 4000 vs qualified known 4001 is a sticky conflict keeping both; competing retry is stable', () => {
    const { state, outcomes } = foldFinality([R1_NONE, R2_4000, R4_4001, R4_4001, R3_4000_E3])
    assert.ok(state)
    assert.equal(state.status, 'conflict')
    assert.equal(state.known.finalCount, 4000) // first known truth retained
    assert.deepEqual(
      state.competing.map((c) => c.finalCount),
      [4001],
    )
    assert.deepEqual(outcomes[3]?.receipt, outcomes[2]?.receipt)
    assert.equal(outcomes[3]?.replay, true)
    assert.equal(state.status, 'conflict') // a later compatible record does not clear the conflict
    const k = effectKnowledge(state)
    assert.equal(k.finality, null) // affected reads are restrictive
    assert.deepEqual(k.count, { kind: 'so_far', value: 4001 })
  })

  it('FG05 incompatible known terminal time is a sticky conflict; unknown fields may still improve', () => {
    const { state } = foldFinality([R1_NONE, R5_T2, R2_4000])
    assert.ok(state)
    assert.equal(state.status, 'conflict')
    assert.equal(state.known.finalAt, R1_NONE.finalAt)
    assert.deepEqual(
      state.competing.map((c) => c.finalAt),
      [R5_T2.finalAt],
    )
    assert.equal(state.known.finalCount, 4000) // the unknown count improved without clearing the conflict
  })

  it('refuses inconsistent finality payloads instead of folding them', () => {
    assert.throws(() => appendFinality(null, { ...R2_4000, finalCount: null }), isRefusal('finality_count_invalid'))
    assert.throws(
      () => appendFinality(null, { ...R2_4000, basis: 'never_left_release', finalCount: 5 }),
      isRefusal('finality_count_invalid'),
    )
    const s = appendFinality(null, R2_4000).state
    assert.throws(
      () => appendFinality(s, { ...R2_4000, evidenceDigest: digests['evidence:E3'] ?? '' }),
      isRefusal('digest_collision'),
    )
    assert.throws(
      () => appendFinality(s, { ...R4_4001, subject: { ...SUBJECT, reservationId: 'other' } }),
      isRefusal('subject_mismatch'),
    )
  })
})

// ---- 3. mechanics the vectors do not isolate (synthetic, independently derived by hand) ------------------------------

function isRefusal(code: string) {
  return (e: unknown) => e instanceof CapacityInputError && e.code === code
}

const W0 = { start: 0, end: 1440 }
const baseObs = (over: Partial<CapacityObservation> = {}): CapacityObservation => ({
  id: 'o-e1',
  kind: 'remaining_at',
  value: 50_000,
  window: W0,
  asOf: 600,
  freshUntil: 1_000_000,
  semantics: 'fixed_epoch',
  dimension: DIM,
  ...over,
})
const item = (key: string, over: Partial<EffectItem> = {}): EffectItem => ({
  key,
  projectId: 'p1',
  reservationId: key,
  dimension: DIM,
  createdAt: 100,
  count: { kind: 'final_total', value: 1000 },
  finality: { basis: 'provider_terminal_known', finalAt: 120 },
  bound: null,
  n1: null,
  ...over,
})
const att = (itemKey: string, q: number | null, over: Partial<Attribution> = {}): Attribution => ({
  itemKey,
  observationId: 'o-e1',
  coverage: q === null ? 'not_reflected' : 'reflected',
  q,
  n1: null,
  conflict: false,
  issuerQualified: true,
  evidenceDigest: ATT_EVIDENCE,
  ...over,
})
const project = (items: EffectItem[], attributions: Attribution[], over: Partial<ProjectionInput> = {}): Projection =>
  projectObservation({ observation: baseObs(), items, attributions, now: 600, scopeQualified: true, ...over })

describe('unknown never becomes zero', () => {
  it('a missing attribution is unknown coverage, not q = 0, even long after the effect ended', () => {
    const p = project([item('a')], [])
    assert.deepEqual(p.reasons, ['coverage_unknown:#0'])
    assert.equal(p.xCeiling, null)
    assert.equal(p.effectiveFloor, null)
    assert.equal(p.coverageComplete, false)
  })

  it('a verdict-only reading yields no numeric capacity at all', () => {
    const p = project([item('a')], [att('a', 1000)], { observation: baseObs({ kind: 'verdict_only', value: null }) })
    assert.equal(p.status, 'verdict_only')
    assert.equal(p.effectiveCeiling, undefined)
    assert.equal(p.xFloor, undefined)
    assert.throws(
      () => project([], [], { observation: baseObs({ kind: 'verdict_only', value: 0 }) }),
      isRefusal('obs_value_invalid'),
    )
  })

  it('non-numeric or negative inputs are refused, never coerced to zero', () => {
    assert.throws(() => project([], [], { observation: baseObs({ value: Number.NaN }) }), isRefusal('invalid_number'))
    assert.throws(() => project([], [], { observation: baseObs({ value: null }) }), isRefusal('invalid_number'))
    assert.throws(() => project([item('a', { bound: -1 })], []), isRefusal('invalid_number'))
    assert.throws(() => project([item('a')], [att('a', 1.5)]), isRefusal('invalid_number'))
  })

  it('a reflected attribution without a well-formed evidence witness yields no q', () => {
    const p = project([item('a')], [att('a', 1000, { evidenceDigest: 'not-a-digest' })])
    assert.deepEqual(p.reasons, ['attribution_witness_invalid:#0'])
    assert.equal(p.coverageComplete, false)
  })

  it('an unqualified issuer yields no q', () => {
    assert.deepEqual(project([item('a')], [att('a', 1000, { issuerQualified: false })]).reasons, [
      'issuer_unqualified:#0',
    ])
  })
})

describe('N10 final precedence and so-far knowledge', () => {
  it('a valid final total above a contradicted bound wins and is flagged', () => {
    const p = project(
      [
        item('b', {
          count: { kind: 'final_total', value: 18_000 },
          bound: 16_000,
          createdAt: 300,
          finality: { basis: 'provider_terminal_known', finalAt: 400 },
        }),
      ],
      [att('b', 3000)],
    )
    assert.equal(p.status, 'exact')
    assert.deepEqual([p.xFloor, p.xCeiling], [15_000, 15_000])
    assert.deepEqual(p.flags, ['used_exceeds_bound:#0'])
  })

  it('a so-far count is lower-bound knowledge, never a ceiling', () => {
    const p = project(
      [item('b', { count: { kind: 'so_far', value: 4000 }, finality: null, bound: null, createdAt: 300 })],
      [att('b', 3000)],
    )
    assert.equal(p.xFloor, 1000)
    assert.equal(p.xCeiling, null)
    assert.equal(p.status, 'bounded_unknown_ceiling')
  })
})

describe('no double q: duplicates and aliases', () => {
  it('an exact duplicate entry is counted once', () => {
    const once = project([item('a')], [att('a', 400)])
    const twice = project([item('a'), item('a')], [att('a', 400)])
    assert.deepEqual(
      [twice.xFloor, twice.xCeiling, twice.effectiveFloor],
      [once.xFloor, once.xCeiling, once.effectiveFloor],
    )
    assert.deepEqual([once.xFloor, once.xCeiling], [600, 600])
  })

  it('an alias handle for the same original effect is merged, not added', () => {
    const p = project([item('a'), item('a-alias', { reservationId: 'a' })], [att('a', 400), att('a-alias', 400)])
    assert.deepEqual([p.xFloor, p.xCeiling], [600, 600])
    const consumed = project(
      [item('a'), item('a-alias', { reservationId: 'a' })],
      [att('a', 400), att('a-alias', 400)],
      {
        observation: baseObs({ kind: 'consumed_in_window', value: 9000 }),
      },
    )
    assert.equal(consumed.attributed, 400)
  })

  it('disagreeing alias witnesses make q unknown; differing facts for one effect are refused', () => {
    const p = project([item('a'), item('a-alias', { reservationId: 'a' })], [att('a', 400), att('a-alias', 500)])
    assert.deepEqual(p.reasons, ['att_conflict:#0'])
    assert.throws(
      () => project([item('a'), item('a2', { reservationId: 'a', bound: 5 })], []),
      isRefusal('item_conflict'),
    )
  })

  it('the same reservation in another project is a different effect (V17 K3: no alias merge)', () => {
    const p = project([item('a'), item('b', { projectId: 'p2', reservationId: 'a' })], [att('a', 400), att('b', 400)])
    assert.deepEqual([p.xFloor, p.xCeiling], [1200, 1200])
  })
})

const registeredAt = (id: string, windowKey: string, asOf: number): RegisteredObservation => ({
  id,
  issuerId: 'I1',
  windowKey,
  qualRevision: 1,
  kind: 'remaining_at',
  asOf,
  freshUntil: 1_000_000,
  value: 50_000,
  measurementId: null,
})

describe('partitions: epochs, windows and kinds never mix', () => {
  it('an attribution recorded for another observation (epoch) is never used here', () => {
    const p = project([item('a')], [att('a', 1000, { observationId: 'o-e0' })])
    assert.deepEqual(p.reasons, ['attribution_other_partition:#0'])
    assert.equal(p.xCeiling, null)
  })

  it('an effect of another dimension is refused', () => {
    assert.throws(() => project([item('a', { dimension: 'openai.input_tokens' })], []), isRefusal('partition_mismatch'))
  })

  it('reconciliation refuses observations of different windows, kinds or qualification revisions', () => {
    const reg = new Map([
      ['E1', registration('E1', 0, 1440)],
      ['E2', registration('E2', 1440, 2880)],
    ])
    assert.throws(
      () =>
        reconcileObservations({
          observations: [registeredAt('a', 'E1', 600), registeredAt('b', 'E2', 1500)],
          registry: reg,
          now: 1500,
          scopeQualified: true,
        }),
      isRefusal('mixed_partition'),
    )
    assert.throws(
      () =>
        reconcileObservations({
          observations: [registeredAt('a', 'E1', 600), { ...registeredAt('b', 'E1', 610), kind: 'consumed_in_window' }],
          registry: reg,
          now: 700,
          scopeQualified: true,
        }),
      isRefusal('mixed_partition'),
    )
  })
})

describe('resets and late obligations', () => {
  it('an open reservation from the previous epoch keeps its exposure in the new epoch (not dropped)', () => {
    const e2 = baseObs({ id: 'o-e2', window: { start: 1440, end: 2880 }, asOf: 1500 })
    const late = item('late', { createdAt: 1400, count: null, finality: null, bound: 2000 })
    const done = item('done', { createdAt: 100 })
    const p = projectObservation({
      observation: e2,
      items: [done, late],
      attributions: [att('late', null, { observationId: 'o-e2' })],
      now: 1500,
      scopeQualified: true,
    })
    assert.deepEqual([p.xFloor, p.xCeiling], [0, 2000])
    assert.equal(p.effectiveFloor, 48_000)
  })

  it('q reflected in the old epoch is not carried into the new epoch', () => {
    const e2 = baseObs({ id: 'o-e2', window: { start: 1440, end: 2880 }, asOf: 1500 })
    const late = item('late', { createdAt: 1400, count: null, finality: null, bound: 2000 })
    const p = projectObservation({
      observation: e2,
      items: [late],
      attributions: [att('late', 1500)],
      now: 1500,
      scopeQualified: true,
    })
    assert.deepEqual(p.reasons, ['attribution_other_partition:#0'])
    assert.equal(p.xCeiling, null)
  })
})

describe('immutability', () => {
  it('accepts deep-frozen inputs and returns fresh frozen results', () => {
    const items = Object.freeze([Object.freeze(item('a'))])
    const atts = Object.freeze([Object.freeze(att('a', 400))])
    const p = projectObservation(
      Object.freeze({
        observation: Object.freeze(baseObs()),
        items,
        attributions: atts,
        now: 600,
        scopeQualified: true,
      }),
    )
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.reasons))
    const s = appendFinality(null, R2_4000)
    assert.ok(Object.isFrozen(s.state) && Object.isFrozen(s.state.receipts))
  })
})

// ---- 4. R1 repairs (Root77): independent counterexamples and boundaries, derived by hand ---------------------------

// The largest safe integer, written out independently of the implementation.
const M = 9_007_199_254_740_991
const finalItem = (key: string, value: number, over: Partial<EffectItem> = {}): EffectItem =>
  item(key, { count: { kind: 'final_total', value }, ...over })
const openItem = (key: string, bound: number): EffectItem => item(key, { count: null, finality: null, bound })
const notReflected = (...keys: string[]): Attribution[] => keys.map((k) => att(k, null))
const remainingAt = (value: number): Partial<ProjectionInput> => ({ observation: baseObs({ value }) })
const consumedAt = (value: number): Partial<ProjectionInput> => ({
  observation: baseObs({ kind: 'consumed_in_window', value }),
})
const NO_NUMBERS = ['xFloor', 'xCeiling', 'effectiveCeiling', 'effectiveFloor', 'attributed', 'unattributed'] as const

function assertRangeUnsupported(p: Projection, reasons: readonly string[]): void {
  assert.equal(p.status, 'range_unsupported')
  assert.deepEqual(p.reasons, reasons)
  assert.equal(p.usableCurrent, false)
  for (const field of NO_NUMBERS) assert.equal(p[field], undefined, `${field} must be absent`)
}

describe('R1-F01 exact aggregate arithmetic (never a rounded number labelled exact)', () => {
  it('the constant is the largest safe integer', () => {
    assert.equal(M, Number.MAX_SAFE_INTEGER)
    assert.equal(Number.isSafeInteger(M + 1), false)
  })

  it('near-safe positive boundary: final totals M-2, 1, 1 with q 0 and V = M is exact effective 0', () => {
    const p = project([finalItem('a', M - 2), finalItem('b', 1), finalItem('c', 1)], notReflected('a', 'b', 'c'), {
      ...remainingAt(M),
    })
    assert.equal(p.status, 'exact')
    assert.deepEqual([p.xFloor, p.xCeiling, p.effectiveCeiling, p.effectiveFloor], [M, M, 0, 0])
    assert.deepEqual([p.provenOverBy, p.possibleOverBy, p.reasons], [undefined, undefined, []])
  })

  it('counterexample M, 1, 1 with q 0 and V = M is explicitly unsupported, never exact -1 (true value -2)', () => {
    const p = project([finalItem('a', M), finalItem('b', 1), finalItem('c', 1)], notReflected('a', 'b', 'c'), {
      ...remainingAt(M),
    })
    assertRangeUnsupported(p, ['aggregate_beyond_safe_range'])
    assert.notEqual(p.effectiveCeiling, -1)
  })

  it('a floor of exactly M + 1 (M-1, 1, 1) is also outside the supported range', () => {
    const p = project([finalItem('a', M - 1), finalItem('b', 1), finalItem('c', 1)], notReflected('a', 'b', 'c'), {
      ...remainingAt(M),
    })
    assertRangeUnsupported(p, ['aggregate_beyond_safe_range'])
  })

  it('attributed S: q M-1 and 1 against V = M is exact S = M, U = 0; q M and 1 is unsupported', () => {
    const ok = project([finalItem('a', M - 1), finalItem('b', 1)], [att('a', M - 1), att('b', 1)], consumedAt(M))
    assert.equal(ok.status, 'consumed')
    assert.deepEqual(
      [ok.attributed, ok.unattributed, ok.factConflict, ok.attributedIsLowerBound],
      [M, 0, undefined, false],
    )
    const over = project([finalItem('a', M), finalItem('b', 1)], [att('a', M), att('b', 1)], consumedAt(M))
    assertRangeUnsupported(over, ['aggregate_beyond_safe_range'])
  })

  it('partial coverage: an unknown third effect keeps the exact floor M; at M + 1 it is unsupported', () => {
    const items = (big: number): EffectItem[] => [finalItem('a', big), finalItem('b', 1), finalItem('u', 7)]
    const ok = project(items(M - 1), notReflected('a', 'b'), remainingAt(M))
    assert.equal(ok.status, 'bounded_unknown_ceiling')
    assert.deepEqual([ok.xFloor, ok.effectiveCeiling, ok.effectiveFloor, ok.admits], [M, 0, null, false])
    assert.deepEqual([ok.reasons, ok.coverageComplete], [['coverage_unknown:#2'], false])
    const over = project(items(M), notReflected('a', 'b'), remainingAt(M))
    assertRangeUnsupported(over, ['coverage_unknown:#2', 'aggregate_beyond_safe_range'])
    assert.equal(over.coverageComplete, false)
  })

  it('derived ceiling boundary: bounds M-1 + 1 stay bounded; M + 1 becomes an unknown ceiling, never rounded', () => {
    const ok = project([openItem('a', M - 1), openItem('b', 1)], notReflected('a', 'b'), remainingAt(5))
    assert.equal(ok.status, 'bounded')
    assert.deepEqual([ok.xFloor, ok.xCeiling, ok.effectiveCeiling, ok.effectiveFloor], [0, M, 5, 5 - M])
    assert.equal(ok.possibleOverBy, M - 5)
    const over = project([openItem('a', M), openItem('b', 1)], notReflected('a', 'b'), remainingAt(5))
    assert.equal(over.status, 'bounded_unknown_ceiling')
    assert.deepEqual([over.xFloor, over.xCeiling, over.effectiveCeiling, over.effectiveFloor], [0, null, 5, null])
    assert.deepEqual([over.admits, over.reasons], [false, ['ceiling_beyond_safe_range']])
  })

  it('small exact projections are unchanged by the checked conversion', () => {
    const p = project([finalItem('a', 1000), finalItem('b', 300)], [att('a', 400), att('b', 300)])
    assert.deepEqual([p.status, p.xFloor, p.xCeiling, p.effectiveCeiling], ['exact', 600, 600, 49_400])
  })

  it('time at the safe-instant boundary: shifted instants are compared exactly', () => {
    const w = { start: 0, end: M }
    const clock = (delta: number): ClockBound => ({ delta, qualifiedBasis: QUALIFIED_FIXTURE_CLOCK })
    assert.equal(timeState(w, 0, M, M - 2, clock(1)), 'current')
    assert.equal(timeState(w, 0, M, M - 2, clock(2)), 'historical')
    const wide = { start: -M, end: M }
    assert.equal(timeState(wide, M - 1, M, 0, clock(M - 1)), 'current')
    assert.equal(timeState(wide, M - 1, M, 0, clock(M - 2)), 'future')
    assert.equal(timeState(w, M - 1, M, 0, clock(M - 1)), 'not_open')
    const reg = registration('WM', -M, M)
    assert.equal(checkObservationAppend(candidateOn(reg, M - 1, M), new Map([['WM', reg]]), -1, clock(M)), null)
    const late = checkObservationAppend(candidateOn(reg, M - 1, M), new Map([['WM', reg]]), -2, clock(M))
    assert.equal(late, 'obs_from_future')
  })
})

const fixedW: WindowRegistration = registration('W', 0, 1440)
const rollingW: WindowRegistration = { ...fixedW, semantics: 'rolling' }
const reading = (
  id: string,
  asOf: number,
  value: number,
  kind: RegisteredObservation['kind'] = 'remaining_at',
): RegisteredObservation => ({
  id,
  issuerId: 'I1',
  windowKey: 'W',
  qualRevision: 1,
  kind,
  asOf,
  freshUntil: 1_000_000,
  value,
  measurementId: `m-${id}`,
})
const reconcileOn = (w: WindowRegistration, observations: readonly RegisteredObservation[]) =>
  reconcileObservations({ observations, registry: new Map([['W', w]]), now: 300, scopeQualified: true })

function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]]
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]))
}

/** Every input order gives the same reconciliation, which is returned. */
function invariantReconcile(w: WindowRegistration, observations: readonly RegisteredObservation[]) {
  const all = permutations(observations).map((perm) => reconcileOn(w, perm))
  const first = all[0]
  assert.ok(first)
  for (const r of all) assert.deepEqual(r, first)
  assert.equal(all.length, 6)
  return first
}

const REGRESSION = { status: 'unknown', reason: 'conflict_or_regression' }

describe('R1-F02 fixed-epoch regression over equal-as-of groups (complete strict-time relation)', () => {
  it('remaining 40/50 @100 then 45 @200 is a regression from 40, for both id assignments and every order', () => {
    for (const [first, second] of [
      [40, 50],
      [50, 40],
    ] as const) {
      const r = invariantReconcile(fixedW, [reading('A', 100, first), reading('B', 100, second), reading('C', 200, 45)])
      assert.deepEqual(r.current, REGRESSION)
      assert.deepEqual(r.conflicts, [])
      assert.deepEqual(r.regressions, [[first === 40 ? 'A' : 'B', 'C']])
    }
  })

  it('consumed 50/40 @100 then 45 @200 is a decrease from 50, for both id assignments and every order', () => {
    for (const [first, second] of [
      [50, 40],
      [40, 50],
    ] as const) {
      const obs = [reading('A', 100, first, 'consumed_in_window'), reading('B', 100, second, 'consumed_in_window')]
      const r = invariantReconcile(fixedW, [...obs, reading('C', 200, 45, 'consumed_in_window')])
      assert.deepEqual(r.current, REGRESSION)
      assert.deepEqual(r.regressions, [[first === 50 ? 'A' : 'B', 'C']])
    }
  })

  it('a later equal-as-of group is compared with every earlier reading too (40 @100, then 30/45 @200)', () => {
    const r = invariantReconcile(fixedW, [reading('A', 100, 40), reading('B', 200, 30), reading('C', 200, 45)])
    assert.deepEqual(r.regressions, [['A', 'C']])
    assert.deepEqual(r.current, REGRESSION)
  })

  it('non-regressing grouped readings stay known: remaining 40/50 -> 35 and consumed 40/50 -> 55', () => {
    const rem = invariantReconcile(fixedW, [reading('A', 100, 40), reading('B', 100, 50), reading('C', 200, 35)])
    assert.deepEqual([rem.regressions, rem.current.status], [[], 'known'])
    assert.ok(rem.current.status === 'known')
    assert.deepEqual([rem.current.observations, rem.current.projection.effectiveCeiling], [['C'], 35])
    const con = invariantReconcile(fixedW, [
      reading('A', 100, 40, 'consumed_in_window'),
      reading('B', 100, 50, 'consumed_in_window'),
      reading('C', 200, 55, 'consumed_in_window'),
    ])
    assert.deepEqual([con.regressions, con.current.status], [[], 'known'])
  })

  it('a rolling window may rise: 40/50 @100 -> 45 @200 is ordinary sequential', () => {
    const r = invariantReconcile(rollingW, [reading('A', 100, 40), reading('B', 100, 50), reading('C', 200, 45)])
    assert.deepEqual(r.regressions, [])
    assert.ok(r.current.status === 'known')
    assert.deepEqual(r.current.observations, ['C'])
  })

  it('an incomparable equal-as-of tie alone stays a bounded tie, not unknown', () => {
    const r = reconcileOn(fixedW, [reading('B', 100, 50), reading('A', 100, 40)])
    assert.deepEqual([r.conflicts, r.regressions], [[], []])
    assert.ok(r.current.status === 'tie_bounded')
    assert.deepEqual(
      [r.current.observations, r.current.effectiveFloor, r.current.effectiveCeiling],
      [['A', 'B'], 40, 50],
    )
  })
})

/** Aliases a and b of ONE original effect (project p1, reservation r), each final 1000 with current q 400. */
function aliasProjection(
  order: 'a-first' | 'b-first',
  prior: Record<string, number>,
  over: Partial<ProjectionInput> = {},
) {
  const a = item('a', { reservationId: 'r' })
  const b = item('b', { reservationId: 'r' })
  const items = order === 'a-first' ? [a, b] : [b, a]
  const atts = order === 'a-first' ? [att('a', 400), att('b', 400)] : [att('b', 400), att('a', 400)]
  return project(items, atts, { priorQ: new Map(Object.entries(prior)), ...over })
}
const BOTH_ORDERS = ['a-first', 'b-first'] as const

describe('R1-F03 prior q is the original effect knowledge, invariant under alias order', () => {
  it('prior 500 recorded only under b is a regression in both orders (equally restrictive)', () => {
    const [x, y] = BOTH_ORDERS.map((o) => aliasProjection(o, { b: 500 }))
    assert.deepEqual(x, y)
    assert.ok(x)
    assert.deepEqual(
      [x.status, x.reasons, x.coverageComplete],
      ['bounded_unknown_ceiling', ['coverage_regression:#0'], false],
    )
    assert.deepEqual([x.xFloor, x.xCeiling, x.effectiveFloor, x.admits], [0, null, null, false])
  })

  it('the higher earlier q of any alias wins (a 300, b 500), whichever handle comes first', () => {
    for (const o of BOTH_ORDERS)
      assert.deepEqual(aliasProjection(o, { a: 300, b: 500 }).reasons, ['coverage_regression:#0'])
  })

  it('prior 300 with current 400 stays a positive exact exposure of 600 under both alias orders', () => {
    for (const o of BOTH_ORDERS) {
      const p = aliasProjection(o, { b: 300 })
      assert.deepEqual([p.status, p.xFloor, p.xCeiling, p.reasons], ['exact', 600, 600, []])
    }
  })

  it('compatible duplicate prior records (a 300, b 300) are not summed into a false regression', () => {
    for (const o of BOTH_ORDERS) {
      const p = aliasProjection(o, { a: 300, b: 300, unrelated: 5000 })
      assert.deepEqual([p.status, p.xFloor, p.reasons], ['exact', 600, []])
    }
  })

  it('prior q is never carried as q, and a rolling window has no prior regression', () => {
    const missing = project([item('a', { reservationId: 'r' })], [], { priorQ: new Map([['a', 400]]) })
    assert.deepEqual(missing.reasons, ['coverage_unknown:#0'])
    const rolling = aliasProjection('a-first', { b: 500 }, { observation: baseObs({ semantics: 'rolling' }) })
    assert.deepEqual([rolling.status, rolling.xFloor], ['exact', 600])
  })
})

type Shape = [path: string, frozen: boolean, extensible: boolean, descriptors: string][]

/** Values plus, for every nested object, its frozen/extensible status and property descriptors (minus values). */
function shapeOf(x: unknown, path = '$', out: Shape = []): Shape {
  if (x === null || typeof x !== 'object') return out
  const descriptors = Object.entries(Object.getOwnPropertyDescriptors(x)).map(([k, d]) => [
    k,
    d.writable,
    d.enumerable,
    d.configurable,
  ])
  out.push([path, Object.isFrozen(x), Object.isExtensible(x), JSON.stringify(descriptors)])
  for (const [k, v] of Object.entries(x)) shapeOf(v, `${path}.${k}`, out)
  return out
}
const deeplyFrozen = (x: unknown): boolean => shapeOf(x).every(([, frozen]) => frozen)

/** A well-formed, non-frozen clone of an accepted state; its full shape and values before the call. */
function mutableClone(state: FinalityState | null): { clone: FinalityState; before: string } {
  assert.ok(state)
  const clone = structuredClone(state)
  assert.equal(deeplyFrozen(clone), false)
  return { clone, before: JSON.stringify([clone, shapeOf(clone)]) }
}

describe('R1 purity addendum: caller-owned finality state is never frozen or changed', () => {
  it('a compatible new append leaves a non-frozen conflict state (shared competing/payloads) untouched', () => {
    const { clone, before } = mutableClone(foldFinality([R1_NONE, R2_4000, R4_4001]).state)
    const next = appendFinality(clone, R3_4000_E3)
    assert.equal(JSON.stringify([clone, shapeOf(clone)]), before)
    assert.ok(deeplyFrozen(next))
    assert.deepEqual(
      next.state.receipts.map((r) => [r.seq, r.kind]),
      [
        [1, 'established'],
        [2, 'extended'],
        [3, 'conflict'],
        [4, 'provenance'],
      ],
    )
    assert.deepEqual(next.state.competing, clone.competing)
    assert.deepEqual(Object.keys(next.state.payloads).length, 4)
  })

  it('an extending append leaves a non-frozen known state untouched', () => {
    const { clone, before } = mutableClone(appendFinality(null, R1_NONE).state)
    const next = appendFinality(clone, R2_4000)
    assert.equal(JSON.stringify([clone, shapeOf(clone)]), before)
    assert.ok(deeplyFrozen(next))
    assert.equal(next.state.known.finalCount, 4000)
  })

  it('an exact replay against a non-frozen state returns the same receipt and leaves the state untouched', () => {
    const { clone, before } = mutableClone(foldFinality([R1_NONE, R2_4000, R4_4001]).state)
    const replay = appendFinality(clone, R4_4001)
    assert.equal(JSON.stringify([clone, shapeOf(clone)]), before)
    assert.equal(replay.outcome.replay, true)
    assert.deepEqual(replay.outcome.receipt, { seq: 3, payloadDigest: R4_4001.payloadDigest, kind: 'conflict' })
    assert.notEqual(replay.state, clone)
    assert.deepEqual(replay.state, clone)
    assert.ok(deeplyFrozen(replay))
  })

  it('a deeply frozen state produced here is safely reused on replay', () => {
    const { state } = foldFinality([R1_NONE, R2_4000])
    assert.ok(state)
    assert.equal(appendFinality(state, R2_4000).state, state)
  })
})

// ---- Equal-as-of ties are known only when their projections are identical (Codex review 5920809739, Root120) --------
// Inline synthetic fixtures (synthetic-not-AC-evidence) for the review's two inert witnesses and a flag-only case. The
// frozen vectors above are unchanged; P-TIE-EQUIVALENT remains their truly equal positive.

const TIE_DIGEST = 'a'.repeat(64)

/** The one effect "t" of every tie case: created at 100, inside the window. */
function tieItem(count: Count, finality: EffectItem['finality'], bound: number | null = null): EffectItem {
  return {
    key: 't',
    projectId: 'P',
    reservationId: 'R',
    dimension: DIM,
    createdAt: 100,
    count,
    finality,
    bound,
    n1: null,
  }
}

const tieAttribution = (observationId: string, q: number): Attribution => ({
  itemKey: 't',
  observationId,
  coverage: 'reflected',
  q,
  n1: null,
  conflict: false,
  issuerQualified: true,
  evidenceDigest: TIE_DIGEST,
})

/** Two current readings of 800 at the same as-of from different issuers and measurements (comparable to neither). */
const tieReading = (id: string, kind: RegisteredObservation['kind']): RegisteredObservation => ({
  id,
  issuerId: id === 'A' ? 'I1' : 'I2',
  windowKey: 'W',
  qualRevision: 1,
  kind,
  asOf: 600,
  freshUntil: 800,
  value: 800,
  measurementId: `M${id}`,
})

type TieEffects = { readonly items: readonly EffectItem[]; readonly attributions: readonly Attribution[] }
const TIE_KINDS = { remaining: 'remaining_at', consumed: 'consumed_in_window' } as const

function reconcileTie(
  kind: RegisteredObservation['kind'],
  effects: Record<string, TieEffects>,
  order: readonly string[],
) {
  return reconcileObservations({
    observations: order.map((id) => tieReading(id, kind)),
    registry: new Map([['W', registration('W', 0, 1440)]]),
    now: 700,
    scopeQualified: true,
    perObservation: new Map(Object.entries(effects)),
  })
}

/** The per-observation projection computed directly, without reconciliation. */
function directTieProjection(id: string, kind: RegisteredObservation['kind'], e: TieEffects): Projection {
  return projectObservation({
    observation: {
      id,
      kind,
      value: 800,
      window: { start: 0, end: 1440 },
      asOf: 600,
      freshUntil: 800,
      semantics: 'fixed_epoch',
      dimension: DIM,
    },
    items: e.items,
    attributions: e.attributions,
    now: 700,
    scopeQualified: true,
  })
}

interface MixedTie {
  readonly kind: RegisteredObservation['kind']
  /** The two readings' effects, given for the id that comes first and the id that comes second. */
  readonly effects: (first: string, second: string) => Record<string, TieEffects>
  readonly bounds: readonly [number | null, number | null]
}

const OPEN_1000 = tieItem({ kind: 'so_far', value: 1000 }, null)
const FINAL_COUNT: Count = { kind: 'final_total', value: 1000 }
const FINAL_AT_120: EffectItem['finality'] = { basis: 'provider_terminal_known', finalAt: 120 }
const FINAL_1000 = tieItem(FINAL_COUNT, FINAL_AT_120)

// Remaining witness: one reading has qualified q 1000, the other no attribution; same numbers, different coverage.
const REMAINING_WITNESS: MixedTie = {
  kind: TIE_KINDS.remaining,
  effects: (complete, missing) => ({
    [complete]: { items: [OPEN_1000], attributions: [tieAttribution(complete, 1000)] },
    [missing]: { items: [OPEN_1000], attributions: [] },
  }),
  bounds: [null, 800],
}

// Consumed witness: explicit q 0 (X 1000..1000, complete) against missing q (X 0..unknown, lower bound).
const CONSUMED_WITNESS: MixedTie = {
  kind: TIE_KINDS.consumed,
  effects: (complete, missing) => ({
    [complete]: { items: [FINAL_1000], attributions: [tieAttribution(complete, 0)] },
    [missing]: { items: [FINAL_1000], attributions: [] },
  }),
  bounds: [null, null],
}

// Flag-only difference: the same complete numbers, but one reading's effect exceeds its enforced bound.
const FLAG_ONLY: MixedTie = {
  kind: TIE_KINDS.remaining,
  effects: (plain, flagged) => ({
    [plain]: { items: [FINAL_1000], attributions: [tieAttribution(plain, 1000)] },
    [flagged]: { items: [tieItem(FINAL_COUNT, FINAL_AT_120, 900)], attributions: [tieAttribution(flagged, 1000)] },
  }),
  bounds: [800, 800],
}

const MIXED_TIES: Readonly<Record<string, MixedTie>> = {
  'remaining: complete q 1000 against missing q': REMAINING_WITNESS,
  'consumed: complete q 0 against missing q': CONSUMED_WITNESS,
  'remaining: equal exact numbers, a flag on only one reading': FLAG_ONLY,
}

describe('Root120: an equal-as-of tie is known only when its projections are identical', () => {
  for (const [label, tie] of Object.entries(MIXED_TIES)) {
    it(`${label}: a bounded tie for both id assignments and both input orders, every projection retained`, () => {
      const outcomes: unknown[] = []
      for (const [first, second] of [
        ['A', 'B'],
        ['B', 'A'],
      ] as const) {
        const effects = tie.effects(first, second)
        const direct = Object.fromEntries(
          Object.entries(effects).map(([id, e]) => [id, directTieProjection(id, tie.kind, e)]),
        )
        assert.notDeepEqual(direct['A'], direct['B'], `${label}: the two readings differ in what they know`)
        for (const order of permutations(['A', 'B'])) {
          const r = reconcileTie(tie.kind, effects, order)
          assert.deepEqual([r.conflicts, r.regressions], [[], []], `${label}: no conflict or regression`)
          const c = r.current
          assert.equal(
            c.status,
            'tie_bounded',
            `${label} (${first} first, order ${order.join('')}): not one known reading`,
          )
          assert.ok(c.status === 'tie_bounded')
          assert.deepEqual([...c.observations], ['A', 'B'])
          assert.deepEqual([c.effectiveFloor, c.effectiveCeiling], tie.bounds, `${label}: conservative bounds`)
          assert.deepEqual(c.eachProjectionRetained, direct, `${label}: each reading's own projection is retained`)
          outcomes.push([c.status, c.reason, c.effectiveFloor, c.effectiveCeiling])
        }
      }
      // Renaming which evidence sorts first, and permuting the input, never changes what is known.
      assert.equal(new Set(outcomes.map((o) => JSON.stringify(o))).size, 1, `${label}: id- and order-independent`)
    })
  }

  it('the remaining witness keeps the incomplete reading incomplete: no canonical projection claims more than it', () => {
    const r = reconcileTie(TIE_KINDS.remaining, REMAINING_WITNESS.effects('A', 'B'), ['B', 'A'])
    assert.ok(r.current.status === 'tie_bounded')
    assert.equal(r.current.eachProjectionRetained['A']?.coverageComplete, true)
    assert.equal(r.current.eachProjectionRetained['B']?.coverageComplete, false)
    assert.deepEqual(r.current.eachProjectionRetained['B']?.reasons, ['coverage_unknown:#0'])
  })

  it('the consumed witness keeps both exposure intervals and the lower bound: none is selected as complete', () => {
    const r = reconcileTie(TIE_KINDS.consumed, CONSUMED_WITNESS.effects('A', 'B'), ['A', 'B'])
    assert.ok(r.current.status === 'tie_bounded')
    const a = r.current.eachProjectionRetained['A']
    const b = r.current.eachProjectionRetained['B']
    assert.deepEqual(
      [a?.xFloor, a?.xCeiling, a?.attributedIsLowerBound, a?.coverageComplete],
      [1000, 1000, false, true],
    )
    assert.deepEqual([b?.xFloor, b?.xCeiling, b?.attributedIsLowerBound, b?.coverageComplete], [0, null, true, false])
    assert.deepEqual([a?.unattributed, b?.unattributed], [800, 800])
  })

  it('truly identical tied projections stay one known reading with complete diagnostics', () => {
    const effects = {
      A: { items: [OPEN_1000], attributions: [tieAttribution('A', 1000)] },
      B: { items: [OPEN_1000], attributions: [tieAttribution('B', 1000)] },
    }
    for (const order of permutations(['A', 'B'])) {
      const r = reconcileTie(TIE_KINDS.remaining, effects, order)
      assert.ok(r.current.status === 'known', 'identical projections are equivalent')
      assert.deepEqual([...r.current.observations], ['A', 'B'])
      assert.deepEqual(r.current.eachProjectionRetained['A'], r.current.eachProjectionRetained['B'])
      assert.deepEqual(r.current.projection, directTieProjection('A', TIE_KINDS.remaining, effects.A))
      assert.deepEqual(r.current.diagnostics, {
        reasons: ['A:ceiling_unknown:#0', 'B:ceiling_unknown:#0'],
        coverageComplete: true,
      })
    }
  })

  it('a tie neither mutates its inputs nor returns anything unfrozen', () => {
    for (const tie of Object.values(MIXED_TIES)) {
      const effects = tie.effects('A', 'B')
      const observations = ['B', 'A'].map((id) => tieReading(id, tie.kind))
      const before = JSON.stringify([effects, observations])
      const r = reconcileObservations({
        observations,
        registry: new Map([['W', registration('W', 0, 1440)]]),
        now: 700,
        scopeQualified: true,
        perObservation: new Map(Object.entries(effects)),
      })
      assert.equal(JSON.stringify([effects, observations]), before)
      assert.equal(deeplyFrozen(effects), false)
      assert.ok(deeplyFrozen(r))
    }
  })
})
