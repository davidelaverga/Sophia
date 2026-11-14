// The selection preview's pure assembler (INC04-S01b; INC04-S03a observations, 0107): synthetic snapshots through the
// real kernel and projection. These are source-logic checks of the mapping only; a synthetic record or reading never
// qualifies a live route, a telemetry source or provider capacity, and passes no AC-04 case.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DomainError, evaluateSelection, projectSelection } from '@sophia/domain'
import type {
  FullSelectionSnapshot,
  RecordedSelectionObservation,
  RestrictedSelectionSnapshot,
  SelectionApiFacts,
  SelectionNativeFacts,
  SelectionObservation,
  SelectionSnapshot,
} from '@sophia/persistence'
import { apiRef, assembleSelectionInput, nativeRef, previewSelection, requestRevisionOf } from './selection-snapshot.ts'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PROJECT = '33333333-3333-4333-8333-333333333333'
const NOW = '2026-11-13T12:00:00.000000+00:00'

function api(over: Partial<SelectionApiFacts> = {}): SelectionApiFacts {
  const grantId = over.grantId ?? '44444444-4444-4444-8444-444444444444'
  return {
    kind: 'api',
    grantId,
    grantRevision: 1,
    ownerId: ACTOR,
    accountId: `acc-${grantId.slice(0, 8)}`,
    accountRevision: 2,
    accountProvenance: 'owner_declared',
    provider: 'openai',
    connectionId: '55555555-5555-4555-8555-555555555555',
    connectionRevision: 2,
    connectionState: 'connected',
    operation: 'research',
    roleId: 'sophia-research-md-v1',
    route: 'research-sol-medium-v1',
    model: 'gpt-6.1-sol',
    effort: 'medium',
    expiresAt: '2026-12-13T12:00:00.000000+00:00',
    validFrom: '2026-11-01T12:00:00.000000+00:00',
    proofStatus: 'valid',
    unusable: [],
    ownerMember: true,
    requesterEligible: true,
    globalRoute: 'current',
    accountQualification: { state: 'current', operations: ['research'], revision: 1, id: 'q1' },
    runtimeReady: true,
    capacity: { admits: true, reasons: [] },
    slotsBusy: false,
    uncertainEffects: false,
    protection: { witness: 'none_applicable' },
    observation: null,
    ...over,
  }
}

function native(over: Partial<SelectionNativeFacts> = {}): SelectionNativeFacts {
  return {
    kind: 'native',
    resourceId: '66666666-6666-4666-8666-666666666666',
    resourceRevision: 1,
    ownerId: ACTOR,
    tool: 'codex',
    state: 'active',
    connectionState: 'linked',
    route: 'none',
    qualificationRevision: null,
    operations: [],
    sourcePolicy: null,
    accountKey: null,
    accountBusy: null,
    unsettledEffects: null,
    ...over,
  }
}

/** An evaluator's full snapshot (0106: only an admin or editor gets one). */
function snapshot(over: Partial<FullSelectionSnapshot> = {}): FullSelectionSnapshot {
  return {
    evaluation: 'full',
    evaluatedAt: NOW,
    projectId: PROJECT,
    actorId: ACTOR,
    member: { role: 'editor', active: true, revision: 1 },
    audienceRevision: 1,
    eligibilityRevision: 1,
    gate: { state: 'enabled', revision: 1 },
    projectBudget: true,
    pin: null,
    sources: [],
    complete: true,
    candidates: [api()],
    ...over,
  }
}

/** A current viewer's restricted snapshot (0106): the instant, the ids and their own membership, nothing else. */
const restricted: RestrictedSelectionSnapshot = {
  evaluation: 'restricted',
  evaluatedAt: NOW,
  projectId: PROJECT,
  actorId: ACTOR,
  member: { role: 'viewer', active: true, revision: 1 },
}
const RESTRICTED_VIEW = {
  contract: 'inc04.selection.input.v1',
  policyVersion: 'inc04-s01-policy-v1',
  disclosure: 'restricted',
} as const

type Shared = Extract<ReturnType<typeof previewSelection>, { disclosure: 'shared' }>
function shared(s: SelectionSnapshot): Shared {
  const v = previewSelection(s)
  assert.equal(v.disclosure, 'shared', JSON.stringify(v))
  if (v.disclosure !== 'shared') throw new Error('restricted')
  return v
}
const limitation = (v: Shared, ref: string) => v.candidates.find((c) => c.candidateRef === ref)?.limitation

describe('the selection preview assembler', () => {
  it('selects the owner’s own qualified, protected, funded grant and shows its owner everything of it', () => {
    const v = shared(snapshot())
    assert.equal(v.outcome, 'selected')
    assert.equal(v.mode, 'auto')
    assert.equal(v.strictSettings, null, 'no strict settings and no disclosure in this release')
    assert.ok(v.proposal && 'candidateRef' in v.proposal)
    assert.equal(v.proposal.candidateRef, apiRef(api().grantId))
    assert.equal(v.proposal.relation, 'owner')
    assert.deepEqual(v.proposal.codes, [])
    assert.equal(v.proposal.payerScopeRef, api().accountId)
    assert.deepEqual(v.proposal.seed, {
      providerInstanceRef: 'research-sol-medium-v1',
      model: 'gpt-6.1-sol',
      options: [{ id: 'effort', value: 'medium' }],
    })
  })

  it('selects another member’s grant for the requester without their payer or reason codes', () => {
    const v = shared(snapshot({ candidates: [api({ ownerId: OTHER })] }))
    assert.equal(v.outcome, 'selected')
    assert.ok(v.proposal && 'candidateRef' in v.proposal)
    assert.equal(v.proposal.relation, 'shared')
    assert.equal(v.proposal.payerScopeRef, undefined)
    assert.equal(v.proposal.codes, undefined)
    assert.equal(JSON.stringify(v).includes(api().accountId), false, 'the other owner’s account never appears')
  })

  it('fails closed on every missing owner, account or qualification fact, never as clear', () => {
    const ref = apiRef(api().grantId)
    const cases: [Partial<SelectionApiFacts>, string][] = [
      [{ protection: { witness: 'policy_absent' } }, 'not_verified'],
      [{ accountQualification: { state: 'none' } }, 'not_permitted_for_this_work'],
      [{ accountQualification: { state: 'stale' } }, 'not_permitted_for_this_work'],
      [{ globalRoute: 'none' }, 'not_permitted_for_this_work'],
      [{ unusable: ['owner_not_member'], ownerMember: false }, 'not_permitted_for_this_work'],
      [{ requesterEligible: false }, 'not_permitted_for_this_work'],
      [{ capacity: { admits: false, reasons: ['account_spend'] } }, 'unavailable_now'],
      [{ uncertainEffects: true }, 'unavailable_now'],
      [{ runtimeReady: false }, 'unavailable_now'],
      [{ proofStatus: 'stale', unusable: ['grant_paused'] }, 'not_verified'],
      [
        { protection: { witness: 'covered', dimensions: [{ ref: 'account_concurrency', verdict: 'would_violate' }] } },
        'unavailable_now',
      ],
    ]
    for (const [over, expected] of cases) {
      const v = shared(snapshot({ candidates: [api(over)] }))
      assert.notEqual(v.outcome, 'selected', JSON.stringify(over))
      assert.equal(limitation(v, ref), expected, JSON.stringify(over))
    }
  })

  it('money exhausted with free slots is busy, never admitted by the free slot', () => {
    const v = shared(snapshot({ candidates: [api({ capacity: { admits: false, reasons: ['grant_spend'] } })] }))
    assert.equal(v.outcome, 'waiting')
    assert.ok(v.proposal === null)
    const input = assembleSelectionInput(
      snapshot({ candidates: [api({ capacity: { admits: false, reasons: ['grant_spend'] } })] }),
    )
    const c = input.candidates[0]
    assert.ok(c && c.capacity.policy)
    assert.equal(c.capacity.policy.verdict, 'busy')
    assert.equal(c.commitments.accountGroupBusy, 'free', 'the slots are free; the money is not')
  })

  it('waits for a revoked Pin without falling back to another eligible grant', () => {
    const pinned = api({ unusable: ['grant_revoked', 'pin_stale'], proofStatus: 'revoked' })
    const other = api({ grantId: '77777777-7777-4777-8777-777777777777', ownerId: OTHER })
    const v = shared(snapshot({ pin: { grantId: pinned.grantId, grantRevision: 1 }, candidates: [pinned, other] }))
    assert.equal(v.mode, 'pin')
    assert.equal(v.outcome, 'denied')
    assert.deepEqual(v.globalCodes, ['pin_cannot_be_honored'])
    assert.equal(v.proposal, null)
    assert.equal(limitation(v, apiRef(other.grantId)), 'not_selected_by_policy')
  })

  it('keeps native resources out of research: own by the API default, others as owner-only', () => {
    const others = native({ resourceId: '88888888-8888-4888-8888-888888888888', ownerId: OTHER })
    const v = shared(snapshot({ candidates: [native(), others] }))
    assert.equal(v.outcome, 'denied')
    assert.equal(limitation(v, nativeRef(native().resourceId)), 'not_permitted_for_this_work')
    assert.equal(limitation(v, nativeRef(others.resourceId)), 'owner_only_native')
    const input = assembleSelectionInput(snapshot({ candidates: [native({ connectionState: null })] }))
    const c = input.candidates[0]
    assert.ok(c)
    assert.equal(c.qualification.host, 'unknown')
    assert.equal(c.qualification.connection, 'unknown')
    assert.deepEqual(c.capacity, { basis: 'none', limits: { witness: 'unknown' }, windows: [], policy: null })
    assert.deepEqual(c.protection, { witness: 'policy_absent' })
    assert.equal(c.commitments.accountGroupBusy, 'unknown')
  })

  it('blocks on a withdrawn or ineligible named source or a closed research gate, before any candidate', () => {
    for (const s of [
      snapshot({ sources: [{ id: 'f1', state: 'withdrawn', eligibilityRevision: null }] }),
      snapshot({ sources: [{ id: 'f1', state: 'missing', eligibilityRevision: null }] }),
      snapshot({ gate: { state: 'disabled', revision: 2 } }),
      snapshot({ gate: null }),
    ]) {
      const v = shared(s)
      assert.equal(v.outcome, 'blocked', JSON.stringify(s.sources))
      assert.ok(v.candidates.every((c) => c.limitation === 'not_evaluated'))
    }
  })

  it('gives a viewer and an inactive member the uniform restricted view', () => {
    const inactive: SelectionSnapshot = snapshot({ member: { role: 'editor', active: false, revision: 2 } })
    for (const s of [restricted, inactive]) assert.deepEqual(previewSelection(s), RESTRICTED_VIEW)
  })

  it('waits, explicitly, when there is no candidate at all', () => {
    const v = shared(snapshot({ candidates: [] }))
    assert.equal(v.outcome, 'waiting')
    assert.deepEqual(v.globalCodes, ['no_candidates'])
  })

  it('answers a current viewer the kernel’s restricted view from the restricted snapshot alone (R1, R2)', () => {
    // What the kernel itself projects for a member outside the summary audience, whatever the pool: an evaluator's
    // input with that one difference (cannot_edit, no summary viewer), at an empty and a full pool.
    const hidden = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        native({ resourceId: `66666666-6666-4666-8666-${String(i).padStart(12, '0')}`, ownerId: OTHER }),
      )
    for (const candidates of [[], hidden(200)]) {
      const input = assembleSelectionInput(snapshot({ candidates }))
      const outside = {
        ...input,
        control: { ...input.control, authority: 'cannot_edit' as const },
        summaryViewerRefs: [],
      }
      assert.deepEqual(projectSelection(evaluateSelection(outside), ACTOR), RESTRICTED_VIEW)
    }
    // The restricted snapshot has no pool, completeness, budget, Pin, gate or source to read: the view is decided
    // from its form, and it is exactly the kernel's.
    assert.deepEqual(Object.keys(restricted).toSorted(), [
      'actorId',
      'evaluatedAt',
      'evaluation',
      'member',
      'projectId',
    ])
    assert.deepEqual(previewSelection(restricted), RESTRICTED_VIEW)
    assert.deepEqual(
      previewSelection({ ...restricted, member: { ...restricted.member, revision: 9 } }),
      RESTRICTED_VIEW,
    )
  })

  it('never assembles or correlates a restricted snapshot: the type refuses it, and so does the assembler if forced', () => {
    // @ts-expect-error a restricted snapshot is not an evaluator's input
    assert.throws(() => assembleSelectionInput(restricted), /selection_pool_incomplete/)
    // @ts-expect-error nor is it a request to correlate
    assert.throws(() => requestRevisionOf(restricted), TypeError)
  })

  it('still refuses an editor’s pool above the bound as projection_unavailable, never a ranked subset', () => {
    assert.throws(
      () => previewSelection(snapshot({ complete: false, candidates: [] })),
      (e: unknown) => e instanceof DomainError && e.code === 'projection_unavailable',
    )
  })

  it('never ranks an incomplete pool', () => {
    assert.throws(
      () => assembleSelectionInput(snapshot({ complete: false, candidates: [] })),
      /selection_pool_incomplete/,
    )
  })

  it('keeps the correlation equal while commitments change the decision, and is deterministic', () => {
    const free = snapshot()
    const busy = snapshot({
      candidates: [api({ slotsBusy: true, capacity: { admits: false, reasons: ['account_slots'] } })],
    })
    assert.equal(requestRevisionOf(free), requestRevisionOf(busy))
    assert.equal(shared(free).requestRevision, shared(busy).requestRevision)
    assert.notEqual(shared(free).outcome, shared(busy).outcome)
    assert.deepEqual(previewSelection(snapshot()), previewSelection(snapshot()))
    const named = snapshot({ sources: [{ id: 'f1', state: 'eligible', eligibilityRevision: 3 }] })
    assert.equal(requestRevisionOf(named), 'v1.m1.a1.e1.r1.p0.s3')
  })

  it('takes nothing from a client: the input is the snapshot’s actor, project and closed profile only', () => {
    const input = assembleSelectionInput(snapshot())
    assert.equal(input.request.actorRef, ACTOR)
    assert.equal(input.request.projectRef, PROJECT)
    assert.deepEqual(
      [input.request.family, input.request.role, input.request.operationRef],
      ['explore', 'explorer', 'research'],
    )
    assert.equal(input.request.strictSettings, null)
    assert.equal(input.strictSettingsDisclosure, undefined)
    assert.deepEqual(input.policy, { scopes: [], routeOverrides: [] })
    assert.equal(input.evaluatedAt, NOW)
  })
})

// --- INC04-S03a: an API candidate's scoped reading (0107) -------------------------------------------------------------

const OBS = '99999999-9999-4999-8999-999999999999'
/** A SYNTHETIC recorded reading at NOW: fresh, complete, an account and a model window that both admit. */
function reading(over: Partial<RecordedSelectionObservation> = {}): RecordedSelectionObservation {
  return {
    state: 'recorded',
    observationId: OBS,
    observedAt: '2026-11-13T11:50:00.000000+00:00',
    freshUntil: '2026-11-13T12:10:00.000000+00:00',
    fresh: true,
    coverage: 'complete',
    requiredWindowRefs: ['requests-per-day', 'tokens-per-minute'],
    windows: [
      {
        windowRef: 'requests-per-day',
        windowEpoch: null,
        scope: 'account',
        unit: 'requests',
        verdict: 'admits',
        applicability: 'known',
        resetAt: null,
      },
      {
        windowRef: 'tokens-per-minute',
        windowEpoch: 'e7',
        scope: 'model',
        unit: 'tokens',
        verdict: 'admits',
        applicability: 'known',
        resetAt: '2026-11-13T13:00:00.000000+00:00',
      },
    ],
    ...over,
  }
}
const exhaustedModel = (): RecordedSelectionObservation => {
  const r = reading()
  return { ...r, windows: r.windows.map((w) => (w.scope === 'model' ? { ...w, verdict: 'exhausted' as const } : w)) }
}
/** The one candidate's input and its evaluated row, from a snapshot whose only candidate is `f`. */
function evaluated(f: SelectionApiFacts) {
  const input = assembleSelectionInput(snapshot({ candidates: [f] }))
  const c = input.candidates[0]
  const row = evaluateSelection(input).rows[0]
  assert.ok(c && row)
  return { c, codes: row.failures.map((x) => x.code), view: shared(snapshot({ candidates: [f] })) }
}

describe('the selection preview assembler with scoped observations (0107)', () => {
  const baseline = evaluated(api())

  it('keeps the no-reading baseline byte for byte: the conservative financial gate over the ledgers', () => {
    assert.deepEqual(baseline.c.capacity, {
      basis: 'conservative_policy',
      limits: { witness: 'unknown' },
      windows: [],
      policy: { proof: baseline.c.capacity.policy?.proof, verdict: 'admits' },
    })
    assert.equal(baseline.c.factsRevisionRef, 'g1.c2.a2.q1', 'no reading adds nothing to the facts revision')
    assert.equal(baseline.view.outcome, 'selected')
  })

  it('selects on a fresh, complete, admitting reading, with the same financial gate and its windows verbatim', () => {
    const { c, codes, view } = evaluated(api({ observation: reading() }))
    assert.equal(view.outcome, 'selected')
    assert.deepEqual(codes, [])
    assert.equal(c.capacity.basis, 'conservative_policy')
    assert.deepEqual(c.capacity.policy, baseline.c.capacity.policy, 'the grant proof and ledger verdict are unchanged')
    assert.deepEqual(c.capacity.limits, {
      witness: 'covered',
      requiredWindowRefs: ['requests-per-day', 'tokens-per-minute'],
    })
    assert.deepEqual(
      c.capacity.windows.map((w) => [w.windowRef, w.scope, w.unit, w.verdict, w.provenanceRef, w.resetAt]),
      [
        ['requests-per-day', 'account', 'requests', 'admits', OBS, null],
        ['tokens-per-minute', 'model', 'tokens', 'admits', OBS, '2026-11-13T13:00:00.000000+00:00'],
      ],
    )
    assert.equal(c.factsRevisionRef, `g1.c2.a2.q1.o${OBS}`)
    assert.deepEqual(c.authority, baseline.c.authority)
  })

  it('excludes on a fresh exhausted window even when the other limiting window admits', () => {
    const { codes, view } = evaluated(api({ observation: exhaustedModel() }))
    assert.notEqual(view.outcome, 'selected')
    assert.ok(codes.includes('capacity_exhausted'), codes.join())
    assert.equal(limitation(view, apiRef(api().grantId)), 'unavailable_now')
  })

  it('keeps the ledger gate: an admitting reading never overcomes busy money or slots', () => {
    const { codes, view } = evaluated(
      api({ observation: reading(), capacity: { admits: false, reasons: ['account_spend'] }, slotsBusy: true }),
    )
    assert.notEqual(view.outcome, 'selected')
    assert.ok(codes.includes('account_busy'), codes.join())
  })

  it('leaves every non-witnessing reading unproven (basis none, no policy) and never alters the grant proof', () => {
    const stale = reading({ fresh: false })
    const cases: [string, SelectionObservation][] = [
      ['stale, including a prior epoch whose reset has passed', stale],
      ['stale and exhausted before its reset', { ...exhaustedModel(), fresh: false }],
      ['partial', reading({ coverage: 'partial', requiredWindowRefs: null })],
      ['unavailable', reading({ coverage: 'unavailable', requiredWindowRefs: null, windows: [] })],
      [
        'a verdict the source did not state',
        reading({ windows: reading().windows.map((w) => ({ ...w, verdict: 'unknown' as const })) }),
      ],
      [
        'an applicability not known',
        reading({ windows: reading().windows.map((w) => ({ ...w, applicability: 'partial' as const })) }),
      ],
      ['a required window missing', reading({ requiredWindowRefs: ['requests-per-day'] })],
      ['complete but empty', reading({ requiredWindowRefs: [], windows: [] })],
      ['conflict', { state: 'conflict' }],
      ['revoked', { state: 'revoked' }],
      ['unbound by a requalification', { state: 'unbound' }],
    ]
    for (const [name, observation] of cases) {
      const { c, codes, view } = evaluated(api({ observation }))
      assert.notEqual(view.outcome, 'selected', name)
      assert.equal(c.capacity.basis, 'none', name)
      assert.equal(c.capacity.policy, null, name)
      assert.deepEqual(c.capacity.windows, [], name)
      assert.ok(codes.includes('capacity_unproven'), `${name}: ${codes.join()}`)
      assert.ok(!codes.includes('capacity_policy_unproven'), `${name}: the grant proof is not made stale`)
      assert.deepEqual(c.authority, baseline.c.authority, `${name}: the grant is untouched`)
    }
    const partial = evaluated(api({ observation: reading({ coverage: 'partial', requiredWindowRefs: null }) }))
    assert.deepEqual(partial.c.capacity.limits, { witness: 'partial' })
  })

  it('never lets a reading reach another candidate or a native resource', () => {
    const own = native()
    const input = assembleSelectionInput(snapshot({ candidates: [api({ observation: exhaustedModel() }), own] }))
    const n = input.candidates.find((c) => c.routeKind === 'native')
    assert.ok(n)
    assert.deepEqual(n.capacity, { basis: 'none', limits: { witness: 'unknown' }, windows: [], policy: null })
    assert.deepEqual(n.protection, { witness: 'policy_absent' })
  })

  it('projects no reading fact: no id, window, unit or verdict reaches the view', () => {
    for (const observation of [reading(), exhaustedModel(), { state: 'unbound' as const }]) {
      const text = JSON.stringify(previewSelection(snapshot({ candidates: [api({ observation })] })))
      for (const secret of [OBS, 'requests-per-day', 'tokens-per-minute', 'tokens', 'unbound', 'e7']) {
        assert.equal(text.includes(secret), false, secret)
      }
    }
    assert.deepEqual(previewSelection({ ...restricted }), RESTRICTED_VIEW)
  })
})
