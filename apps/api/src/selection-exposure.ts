// The capacity-exposure adapter (INC04-R07 C4/C5 W1, migration 0114; docs/plans/capacity-exposure-wiring.md). A pure
// mapping from one API candidate's server-internal exposure facts to ONE restrictive effect on the kernel's existing
// capacity input. It runs the accepted pure module (@sophia/domain capacityExposure, unchanged) server-side, reads no
// clock (the snapshot's instant), network or storage, and never logs.
//
// Guarantees: only more restrictive, never less. Unchanged keeps 0107's capacity exactly; any uncertainty maps to the
// kernel's existing capacity_unproven; a proven-over window or exactly zero headroom maps to the kernel's existing
// capacity_exhausted (limitation unavailable_now), never weakened to unknown. Unknown is never zero: an unattributed
// effect, an unmapped, conflicted, contradictory or unreported count, a missing bound, an unresolved finality, an
// incomplete effect set or a structurally invalid fact all leave q, a count or a ceiling unknown. Counts are reported
// lower bounds (so_far) unless a qualified finality fold gives a final total; money, ended_at and terminals are never
// finality. No number, unit, window, issuer, evidence, digest or id from here reaches the wire or a log: the kernel's
// own codes are the only trace. Does not guarantee: anything about a provider, issuer, clock or mapping (custody only).
import { capacityExposure as cx, type Candidate } from '@sophia/domain'
import type {
  ExposureAttributionFacts,
  ExposureEffectFacts,
  ExposureMappingFacts,
  ExposureTruthFacts,
  ExposureWindowFacts,
  SelectionExposure,
} from '@sophia/persistence'

/** What W1 does to one candidate's capacity: nothing, unproven, or exhausted (each the kernel's existing state). */
export type ExposureOutcome = 'unchanged' | 'unproven' | 'exhausted'

/** One bound window's verdict, with its private projection kept for server-side assertions only. */
export interface WindowVerdict {
  readonly windowRef: string
  readonly outcome: ExposureOutcome
  readonly why: string
  readonly projection: cx.Projection | null
}

export interface ExposureEffect {
  readonly outcome: ExposureOutcome
  readonly exhaustedRefs: readonly string[]
  readonly windows: readonly WindowVerdict[]
}

const UNCHANGED: ExposureEffect = { outcome: 'unchanged', exhaustedRefs: [], windows: [] }
const RESTRICTED: ExposureEffect = { outcome: 'unproven', exhaustedRefs: [], windows: [] }

// ---- per-effect facts ---------------------------------------------------------------------------------------------

/** A reported count only when its class is known: unknown and no_separate_reported_class are absent, never 0. */
const known = (cls: string, v: number | null): number | null => (cls === 'known' ? v : null)

/** One reported count by its mapped source field, or null when that field is not a known count. */
function sourceValue(t: ExposureTruthFacts, field: string): number | null {
  const nonCached = known(t.noncachedInputClass, t.noncachedInput)
  const cacheRead = known(t.cacheReadClass, t.cacheRead)
  const values: Readonly<Record<string, number | null>> = {
    noncached_input: nonCached,
    cache_read: cacheRead,
    output: known(t.outputClass, t.output),
    raw_input_total: t.rawInputTotal,
    raw_cache_read: t.rawCacheRead,
    raw_output: t.rawOutput,
    input_total_from_parts: nonCached !== null && cacheRead !== null ? nonCached + cacheRead : null,
  }
  return values[field] ?? null
}

interface Reported {
  readonly value: number | null
  readonly unresolved: boolean
}

/**
 * The reported so-far count of one effect for the window's dimension through its applicable mappings: two mapped
 * sources must agree, a conflicted or full truth or history, or a conflicted mapping, is unresolved; no mapping, no
 * truth or no known source is absent (never 0).
 */
function reported(e: ExposureEffectFacts, mappings: readonly ExposureMappingFacts[]): Reported {
  const mine = mappings.filter((m) => m.provider === e.provider && m.routeId === e.routeId && m.contract === e.contract)
  const t = e.truth
  if (mine.some((m) => m.conflict)) return { value: null, unresolved: true }
  if (t === null || mine.length === 0) return { value: null, unresolved: false }
  if (t.conflict || t.historyFull || t.historyConflict) return { value: null, unresolved: true }
  const values = mine.map((m) => sourceValue(t, m.sourceField)).filter((v): v is number => v !== null)
  if (new Set(values).size > 1) return { value: null, unresolved: true }
  const value = values[0] ?? null
  return { value: value !== null && Number.isSafeInteger(value) ? value : null, unresolved: false }
}

/** The finality appends of one effect, folded by the accepted FG fold. */
function finalityOf(e: ExposureEffectFacts, dimension: cx.Dimension): ReturnType<typeof cx.effectKnowledge> {
  const appends: cx.FinalityAppend[] = e.finality.map((f) => ({
    subject: { projectId: e.projectId, reservationId: e.reservationId, dimension },
    payloadDigest: f.payloadDigest,
    basis: f.basis,
    finalAt: f.finalAt,
    countKind: f.countKind,
    finalCount: f.finalCount,
    evidenceDigest: f.evidenceDigest,
    approvalRefDigest: f.approvalRefDigest,
    issuerId: f.issuerId,
    issuerQualRevision: f.issuerQualRevision,
  }))
  return cx.effectKnowledge(cx.foldFinality(appends).state)
}

interface ItemFacts {
  readonly item: cx.EffectItem
  readonly unresolved: boolean
}

const itemKey = (e: { projectId: string; reservationId: string }) => `${e.projectId}/${e.reservationId}`

/**
 * One effect as the pure module's item: a valid final total only with qualified finality; a reported count is so_far;
 * anything unresolved (a finality conflict, a reported count above its final total, conflicted truth) carries neither,
 * so it adds nothing known, and marks the set incomplete. The bound is null: C2 is not here.
 */
function effectItem(
  e: ExposureEffectFacts,
  dimension: cx.Dimension,
  mappings: readonly ExposureMappingFacts[],
): ItemFacts {
  const base = { key: itemKey(e), projectId: e.projectId, reservationId: e.reservationId, dimension }
  const bare: cx.EffectItem = { ...base, createdAt: e.createdAt, count: null, finality: null, bound: null, n1: null }
  const fin = finalityOf(e, dimension)
  const so = reported(e, mappings)
  const final = fin.count?.kind === 'final_total' ? fin.count.value : null
  if (fin.conflict || so.unresolved || (final !== null && so.value !== null && so.value > final)) {
    return { item: bare, unresolved: true }
  }
  const count: cx.Count | null =
    final !== null
      ? { kind: 'final_total', value: final }
      : so.value === null
        ? null
        : { kind: 'so_far', value: so.value }
  return { item: { ...bare, count, finality: fin.finality }, unresolved: false }
}

const attributionOf = (a: ExposureAttributionFacts): cx.Attribution => ({
  itemKey: itemKey(a),
  observationId: a.observationId,
  coverage: a.coverage,
  q: a.q,
  n1: a.n1,
  conflict: a.conflict,
  issuerQualified: a.issuerQualified,
  evidenceDigest: a.evidenceDigest,
})

// ---- one bound window -----------------------------------------------------------------------------------------------

const isDimension = (d: string): d is cx.Dimension => Object.hasOwn(cx.UNIT_OF_DIMENSION, d)

/** The registration as the pure module's, or null when its semantics or unit are not qualified (restrictive). */
function registrationOf(w: ExposureWindowFacts): cx.WindowRegistration | null {
  const r = w.registration
  if (!isDimension(r.dimension) || cx.UNIT_OF_DIMENSION[r.dimension] !== r.unit) return null
  if (r.semantics !== 'fixed_epoch' && r.semantics !== 'rolling') return null
  if (r.measurementBasis !== 'issuer_local' && r.measurementBasis !== 'shared_qualified') return null
  return {
    windowKey: r.windowKey,
    scopeId: r.scopeId,
    qualRevision: r.qualRevision,
    dimension: r.dimension,
    unit: cx.UNIT_OF_DIMENSION[r.dimension],
    start: r.start,
    end: r.end,
    semantics: r.semantics,
    measurementBasis: r.measurementBasis,
  }
}

/** The highest earlier validated q per item in this partition (fixed-epoch regression check only, never carried as q). */
function priorQOf(w: ExposureWindowFacts, asOf: number): Map<string, number> {
  const earlier = new Set(w.observations.filter((o) => o.asOf < asOf).map((o) => o.id))
  const prior = new Map<string, number>()
  for (const a of w.attributions) {
    if (!earlier.has(a.observationId) || a.conflict || !a.issuerQualified || a.q === null) continue
    prior.set(itemKey(a), Math.max(prior.get(itemKey(a)) ?? 0, a.q))
  }
  return prior
}

const verdict = (w: ExposureWindowFacts, outcome: ExposureOutcome, why: string, p: cx.Projection | null = null) => ({
  windowRef: w.windowRef,
  outcome,
  why,
  projection: p,
})

/** Remaining capacity: proven over or exactly zero headroom is exhausted; only a complete, positive floor is unchanged. */
function remainingOutcome(p: cx.Projection, complete: boolean): [ExposureOutcome, string] {
  if (p.effectiveCeiling !== undefined && p.effectiveCeiling <= 0) return ['exhausted', 'no_headroom']
  if (!complete) return ['unproven', 'effects_incomplete']
  if (p.reasons.length > 0 || p.flags.length > 0 || p.coverageComplete === false) return ['unproven', 'diagnostics']
  if (p.status !== 'exact' && p.status !== 'bounded') return ['unproven', p.status]
  const floor = p.effectiveFloor ?? null
  return floor !== null && floor > 0 ? ['unchanged', 'positive'] : ['unproven', 'floor']
}

/** Consumption in the window: unchanged only when complete and consistent with the reading. */
function consumedOutcome(p: cx.Projection, complete: boolean): [ExposureOutcome, string] {
  if (p.factConflict === true) return ['unproven', 'fact_conflict']
  if (!complete || p.attributedIsLowerBound === true || p.coverageComplete === false) return ['unproven', 'incomplete']
  return p.reasons.length > 0 || p.flags.length > 0 ? ['unproven', 'diagnostics'] : ['unchanged', 'consistent']
}

function classify(p: cx.Projection, complete: boolean): [ExposureOutcome, string] {
  if (p.status === 'scope_unqualified' || p.status === 'verdict_only' || p.status === 'range_unsupported') {
    return ['unproven', p.status]
  }
  if (!p.usableCurrent) return ['unproven', `not_current:${p.freshness}`]
  return p.status === 'consumed' ? consumedOutcome(p, complete) : remainingOutcome(p, complete)
}

interface Partition {
  readonly reg: cx.WindowRegistration
  readonly observations: cx.RegisteredObservation[]
  readonly perObservation: Map<string, cx.ObservationEffects>
  readonly complete: boolean
}

function partitionOf(w: ExposureWindowFacts, reg: cx.WindowRegistration): Partition {
  const facts = w.effects.map((e) => effectItem(e, reg.dimension, w.mappings))
  const items = facts.map((f) => f.item)
  const complete = !w.truncated && !w.unrepresented && facts.every((f) => !f.unresolved)
  const observations = w.observations.map((o) => ({
    id: o.id,
    issuerId: o.issuerId,
    windowKey: reg.windowKey,
    qualRevision: reg.qualRevision,
    kind: w.kind,
    asOf: o.asOf,
    freshUntil: o.freshUntil,
    value: o.value,
    measurementId: o.measurementId,
  }))
  const perObservation = new Map(
    w.observations.map((o) => [
      o.id,
      { items, attributions: w.attributions.filter((a) => a.observationId === o.id).map(attributionOf) },
    ]),
  )
  return { reg, observations, perObservation, complete }
}

/** The current reading's projection with the earlier fixed-epoch q, so a coverage regression is never missed. */
function currentProjection(w: ExposureWindowFacts, part: Partition, id: string, now: number): cx.Projection {
  const o = part.observations.find((x) => x.id === id)
  const eff = part.perObservation.get(id)
  if (o === undefined || eff === undefined)
    throw new cx.CapacityInputError('no_current', 'the current reading is absent')
  return cx.projectObservation({
    observation: {
      id,
      kind: o.kind,
      value: o.value,
      window: { start: part.reg.start, end: part.reg.end },
      asOf: o.asOf,
      freshUntil: o.freshUntil,
      semantics: part.reg.semantics,
      dimension: part.reg.dimension,
    },
    items: eff.items,
    attributions: eff.attributions,
    now,
    scopeQualified: true,
    priorQ: priorQOf(w, o.asOf),
  })
}

/** One bound window → its restrictive verdict, from the accepted reconciliation and projection. */
function windowVerdict(w: ExposureWindowFacts, now: number): WindowVerdict {
  const reg = registrationOf(w)
  if (reg === null) return verdict(w, 'unproven', 'registration_unqualified')
  if (w.partitionConflict) return verdict(w, 'unproven', 'partition_conflict')
  const current = w.observations.find((o) => o.current)
  if (current === undefined) return verdict(w, 'unproven', 'current_unbound')
  const part = partitionOf(w, reg)
  const rec = cx.reconcileObservations({
    observations: part.observations,
    registry: new Map([[reg.windowKey, reg]]),
    now,
    scopeQualified: true,
    perObservation: part.perObservation,
  })
  const sel = rec.current
  if (sel.status === 'unknown') return verdict(w, 'unproven', sel.reason)
  if (sel.status === 'tie_bounded') {
    const over = sel.effectiveCeiling !== null && sel.effectiveCeiling <= 0
    return verdict(w, over ? 'exhausted' : 'unproven', sel.reason)
  }
  if (!sel.observations.includes(current.id)) return verdict(w, 'unproven', 'current_not_selected')
  const p = currentProjection(w, part, current.id, now)
  const [outcome, why] = classify(p, part.complete)
  return verdict(w, outcome, why, p)
}

/** A window's verdict; a structurally refused fact (the pure module's CapacityInputError) is unproven, never repaired. */
function safeVerdict(w: ExposureWindowFacts, now: number): WindowVerdict {
  try {
    return windowVerdict(w, now)
  } catch (err: unknown) {
    if (err instanceof cx.CapacityInputError) return verdict(w, 'unproven', `input_refused:${err.code}`)
    throw err
  }
}

/**
 * The W1 effect of one API candidate's exposure facts: none without them (switch off, or no recorded reading),
 * unchanged for a never-bound reading (0107's baseline), unproven for a restricted one (never the never-bound fallback),
 * else the combination of its bound windows: any exhausted wins, then any unproven, else unchanged.
 */
export function exposureEffect(e: SelectionExposure | null | undefined): ExposureEffect | null {
  if (e === undefined || e === null) return null
  if (e.state === 'never_bound') return UNCHANGED
  if (e.state === 'restricted') return RESTRICTED
  const windows = e.windows.map((w) => safeVerdict(w, e.now))
  const exhaustedRefs = windows.filter((v) => v.outcome === 'exhausted').map((v) => v.windowRef)
  const outcome: ExposureOutcome =
    exhaustedRefs.length > 0
      ? 'exhausted'
      : windows.some((v) => v.outcome === 'unproven') || windows.length === 0
        ? 'unproven'
        : 'unchanged'
  return { outcome, exhaustedRefs, windows }
}

// ---- the kernel's capacity input, restricted ---------------------------------------------------------------------------

/** 0107's own unproven shape: basis none, no policy, no window (the kernel's capacity_unproven). */
const UNPROVEN: Candidate['capacity'] = { basis: 'none', limits: { witness: 'unknown' }, windows: [], policy: null }

/** Whether 0107's capacity is a witness that already shows a window exhausted (the kernel's capacity_exhausted). */
const provesExhausted = (c: Candidate['capacity']): boolean =>
  c.basis !== 'none' && c.windows.some((w) => w.verdict === 'exhausted')

/**
 * The candidate's capacity after W1: only ever more restrictive than `base` (0107's mapping), and never weaker than the
 * strongest refusal it already justifies. Exhausted marks each exhausted window of 0107's witness as exhausted (the
 * kernel's capacity_exhausted). Uncertainty (unproven, restricted) becomes the unproven shape, EXCEPT over a witness that
 * already proves a window exhausted (W1-F02): that refusal is kept as it is, never replaced by capacity_unproven.
 * Without a witness the base is already non-admitting and stays as it is; no exhausted verdict is ever made up.
 */
export function restrictCapacity(base: Candidate['capacity'], effect: ExposureEffect | null): Candidate['capacity'] {
  if (effect === null || effect.outcome === 'unchanged') return base
  if (effect.outcome === 'exhausted' && base.basis !== 'none') {
    const refs = new Set(effect.exhaustedRefs)
    if (base.windows.some((w) => refs.has(w.windowRef))) {
      return { ...base, windows: base.windows.map((w) => (refs.has(w.windowRef) ? { ...w, verdict: 'exhausted' } : w)) }
    }
  }
  if (provesExhausted(base)) return base
  return base.basis === 'none' ? base : UNPROVEN
}
