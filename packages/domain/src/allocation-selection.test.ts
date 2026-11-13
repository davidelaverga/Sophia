// INC04-S01a kernel checks. Every fixture here is synthetic-not-AC-evidence: these tests establish the pure kernel's
// local behaviour only, never an AC-04 case, a qualified resource or a real allocation.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  evaluateSelection,
  instantMicros,
  normalInstant,
  projectSelection,
  SELECTION_INPUT_CONTRACT,
  SELECTION_POLICY_VERSION,
  type Candidate,
  type Decision,
  type ResolvedProof,
  type Role,
  type SelectionInput,
} from './allocation-selection.ts'

const AT = '2026-11-13T08:00:00Z'
const ACTOR = 'actor-a'
const OTHER = 'actor-b'

const clone = <T>(v: T): T => structuredClone(v)

function candidate(ref: string, mutate: (c: Candidate) => void = () => {}): Candidate {
  const c: Candidate = {
    candidateRef: ref,
    factsRevisionRef: `rev-${ref}`,
    routeKind: 'native',
    providerRef: 'codex',
    ownerRef: ACTOR,
    payerScopeRef: `payer-${ref}`,
    accountGroup: { identity: 'operator_recorded', groupRef: `group-${ref}` },
    authority: { basis: 'owner_own_use' },
    nativeDelegation: 'not_applicable',
    sourceDisclosure: 'permitted',
    qualification: {
      route: 'current',
      operations: ['create'],
      capabilities: ['repo'],
      connection: 'linked',
      host: 'current',
    },
    settings: {
      declared: {
        providerInstanceRef: 'codex',
        models: [{ model: 'm1', options: [{ id: 'effort', values: ['high', 'low'] }] }],
      },
      defaultSeed: null,
    },
    capacity: {
      basis: 'observed',
      limits: { witness: 'covered', requiredWindowRefs: ['w1'] },
      windows: [
        {
          windowRef: 'w1',
          scope: 'account',
          unit: 'percent_used',
          provenanceRef: 'obs-1',
          observedAt: '2026-11-13T07:59:00Z',
          freshUntil: '2026-11-13T08:05:00Z',
          applicability: 'known',
          verdict: 'admits',
          resetAt: null,
        },
      ],
      policy: null,
    },
    protection: {
      witness: 'covered',
      requiredDimensionRefs: ['d1'],
      verdicts: [{ dimensionRef: 'd1', verdict: 'preserves_protected' }],
    },
    commitments: { unsettledEffects: 'none', accountGroupBusy: 'free' },
    session: { kind: 'new' },
    ranking: {
      suitabilityTier: { status: 'unknown' },
      availableAt: { status: 'unknown' },
      reliability: { status: 'unknown' },
      costLatencyTier: { status: 'unknown' },
    },
    share: [],
  }
  mutate(c)
  return c
}

function input(candidates: Candidate[], mutate: (i: SelectionInput) => void = () => {}): SelectionInput {
  const i: SelectionInput = {
    contract: SELECTION_INPUT_CONTRACT,
    policyVersion: SELECTION_POLICY_VERSION,
    requestRevision: 'req-1',
    evaluatedAt: AT,
    request: {
      actorRef: ACTOR,
      projectRef: 'proj-1',
      family: 'repository_execution',
      operationRef: 'op-create',
      role: 'worker',
      requiredOperations: ['create'],
      requiredCapabilities: ['repo'],
      strictSettings: null,
      newWork: { kind: 'new' },
      activeBindingRef: null,
    },
    control: {
      goalStatus: 'ready',
      missionStop: 'none',
      source: 'eligible',
      designHold: 'not_applicable',
      authority: 'current',
      operationRefusal: 'none',
    },
    independence: null,
    policy: { scopes: [], routeOverrides: [] },
    summaryViewerRefs: [ACTOR],
    candidates,
  }
  mutate(i)
  return i
}

function proof(
  proposition: ResolvedProof['proposition'],
  c: Candidate,
  over: Partial<ResolvedProof> = {},
): ResolvedProof {
  return {
    proposition,
    status: 'valid',
    issuer: 'owner',
    authorizerRef: c.ownerRef,
    scope: {
      projectRef: 'proj-1',
      ownerRef: c.ownerRef,
      accountGroupRef: null,
      payerScopeRef: c.payerScopeRef,
      fromPayerScopeRef: null,
      routeKind: c.routeKind,
      family: 'repository_execution',
      operationRef: 'op-create',
      roles: ['worker'],
    },
    effectiveRevisionRef: 'proof-rev-1',
    validFrom: '2026-11-01T00:00:00Z',
    validUntil: null,
    boundedUseRef: 'bound-1',
    ...over,
  }
}

const row = (d: Decision, ref: string) => {
  const r = d.rows.find((x) => x.candidateRef === ref)
  assert.ok(r, `row ${ref}`)
  return r
}
const codes = (d: Decision, ref: string) => row(d, ref).failures.map((x) => x.code)
const run = (cs: Candidate[], m?: (i: SelectionInput) => void) => evaluateSelection(input(cs, m))
const plain = (d: Decision) => ({ ...d, rows: d.rows.map((r) => ({ ...r })) })

const none = (c: Candidate) => {
  c.capacity.limits = { witness: 'none_applicable' }
  c.capacity.windows = []
}

const task = (i: SelectionInput) => {
  if (i.candidates[0]?.authority.basis === 'contribution_grant' && i.candidates[0].authority.grant) {
    i.candidates[0].authority.grant.operationRefs = ['op-create']
    i.candidates[0].authority.grant.roles = ['worker']
  }
}

const window = (over: Partial<Candidate['capacity']['windows'][number]>) => (c: Candidate) => {
  const w = c.capacity.windows[0]
  if (w) Object.assign(w, over)
}

const review =
  (authorSessionRefs: string[], authorAttemptRefs: string[] = []) =>
  (i: SelectionInput) => {
    i.request.role = 'reviewer'
    i.request.family = 'review'
    i.independence = { authorship: 'known', subjectRevisionRef: 'cand-1', authorSessionRefs, authorAttemptRefs }
  }
const existing =
  (sessionRef: string, attemptRefs: string[] = []) =>
  (c: Candidate) =>
    (c.session = { kind: 'existing', sessionRef, attemptRefs })

const tier = (n: number) => (c: Candidate) => (c.ranking.suitabilityTier = { status: 'known', value: n })

const frozen = (v: unknown): unknown => {
  if (typeof v === 'object' && v !== null) {
    for (const x of Object.values(v)) frozen(x)
    Object.freeze(v)
  }
  return v
}

describe('time and canonical structure', () => {
  it('normalizes offsets and fractions to one UTC instant', () => {
    assert.equal(instantMicros('2026-11-13T09:00:00+01:00'), instantMicros('2026-11-13T08:00:00.000000Z'))
    assert.equal(normalInstant(instantMicros('2026-11-13T09:00:00.5+01:00') ?? 0n), '2026-11-13T08:00:00.500000Z')
    assert.equal(normalInstant(instantMicros('0001-01-01T00:00:00Z') ?? 0n), '0001-01-01T00:00:00.000000Z')
  })

  it('refuses impossible dates, other spellings and years outside 1 to 9999', () => {
    for (const bad of [
      '2026-02-29T00:00:00Z',
      '2026-11-13 08:00:00Z',
      '2026-11-13T24:00:00Z',
      '2026-11-13T08:00:00.1234567Z',
      '0000-12-31T23:59:59Z',
      '0001-01-01T00:30:00+01:00',
      '9999-12-31T23:30:00-01:00',
      '2026-11-13T08:00:00',
    ]) {
      assert.equal(instantMicros(bad), null, bad)
    }
    assert.notEqual(instantMicros('2024-02-29T00:00:00Z'), null)
  })

  it('reports every structural error sorted, bounded, without guessing', () => {
    const many = Array.from({ length: 45 }, (_, n) =>
      candidate(`c${String(n).padStart(2, '0')}`, (c) => (c.ownerRef = 'bad ref')),
    )
    const d = run(many, (i) => (i.contract = 'other'))
    assert.equal(d.outcome, 'invalid_input')
    assert.equal(d.errors.length, 40)
    assert.equal(d.errorsTruncated, true)
    assert.deepEqual(d.errors[0], { code: 'contract_mismatch', path: '/contract' })
    assert.equal(d.proposedRef, null)
    assert.equal(d.rows.length, 0)
  })

  it('refuses a duplicate candidate instead of dropping one', () => {
    const d = run([candidate('a'), candidate('a')])
    assert.equal(d.outcome, 'invalid_input')
    assert.ok(d.errors.some((e) => e.code === 'duplicate_candidate'))
  })

  it('refuses more candidates than one catalog page', () => {
    const d = run(Array.from({ length: 201 }, (_, n) => candidate(`c${String(n)}`)))
    assert.ok(d.errors.some((e) => e.code === 'bound_exceeded' && e.path === '/candidates'))
  })

  it('treats a boolean and its string spelling as different option values', () => {
    const d = run([candidate('a')], (i) => {
      i.request.strictSettings = {
        providerInstanceRef: 'codex',
        model: 'm1',
        options: [
          { id: 'fast', value: true },
          { id: 'fast', value: 'true' },
        ],
      }
    })
    assert.equal(d.outcome, 'invalid_input')
    assert.ok(d.errors.some((e) => e.code === 'settings_key_conflict'))
  })

  it('canonicalizes an identical duplicate option', () => {
    const settings = { providerInstanceRef: 'codex', model: 'm1', options: [{ id: 'effort', value: 'high' }] }
    const d = run([candidate('a')], (i) => {
      i.request.strictSettings = { ...settings, options: [...settings.options, ...settings.options] }
    })
    assert.equal(d.outcome, 'selected')
  })
})

describe('active work and request-wide holds', () => {
  it('never evaluates active work', () => {
    const d = run([candidate('a')], (i) => (i.request.activeBindingRef = 'binding-1'))
    assert.equal(d.outcome, 'refused_active_work')
    assert.deepEqual(d.globalCodes, ['active_binding_immutable'])
    assert.equal(row(d, 'a').status, 'not_evaluated')
  })

  for (const [name, mutate, code] of [
    ['goal held', (i: SelectionInput) => (i.control.goalStatus = 'held'), 'goal_held'],
    ['goal unknown', (i: SelectionInput) => (i.control.goalStatus = 'unknown'), 'goal_unknown'],
    ['goal completed', (i: SelectionInput) => (i.control.goalStatus = 'completed'), 'goal_completed'],
    ['mission Stop', (i: SelectionInput) => (i.control.missionStop = 'requested'), 'mission_stop_requested'],
    ['source withdrawn', (i: SelectionInput) => (i.control.source = 'withdrawn'), 'source_withdrawn'],
    ['source unknown', (i: SelectionInput) => (i.control.source = 'unknown'), 'source_unknown'],
    ['design hold', (i: SelectionInput) => (i.control.designHold = 'held'), 'design_hold_held'],
    ['design hold unknown', (i: SelectionInput) => (i.control.designHold = 'unknown'), 'design_hold_unknown'],
    ['authority', (i: SelectionInput) => (i.control.authority = 'audience_changed'), 'authority_audience_changed'],
    ['operation refusal', (i: SelectionInput) => (i.control.operationRefusal = 'refused'), 'operation_refused_refused'],
    [
      'unsettled prior attempt',
      (i: SelectionInput) =>
        (i.request.newWork = { kind: 'settled_repair', priorAttemptRef: 'attempt-1', settlement: 'unknown' }),
      'prior_attempt_unknown',
    ],
  ] as const) {
    it(`a ${name} blocks even with a fully eligible spare account`, () => {
      const d = run([candidate('a'), candidate('b')], mutate)
      assert.equal(d.outcome, 'blocked')
      assert.deepEqual(d.globalCodes, [code])
      assert.equal(d.proposedRef, null)
      assert.ok(d.rows.every((r) => r.status === 'not_evaluated'))
    })
  }

  it('a settled repair may be selected', () => {
    const d = run([candidate('a')], (i) => {
      i.request.newWork = { kind: 'settled_repair', priorAttemptRef: 'attempt-1', settlement: 'settled' }
    })
    assert.equal(d.outcome, 'selected')
  })
})

describe('C01: completeness is proved independently of the lists checked', () => {
  it('a covered witness with no windows proves nothing', () => {
    const d = run([
      candidate('a', (c) => {
        c.capacity.limits = { witness: 'covered', requiredWindowRefs: [] }
        c.capacity.windows = []
      }),
    ])
    assert.equal(d.outcome, 'waiting')
    assert.deepEqual(codes(d, 'a'), ['capacity_unproven'])
  })

  it('a required limiting window missing from the observations is unproven', () => {
    const d = run([
      candidate('a', (c) => (c.capacity.limits = { witness: 'covered', requiredWindowRefs: ['w1', 'w2'] })),
    ])
    assert.deepEqual(codes(d, 'a'), ['capacity_unproven'])
  })

  it('partial or unknown coverage is unproven even with admitting windows', () => {
    for (const witness of ['partial', 'unknown'] as const) {
      const d = run([candidate('a', (c) => (c.capacity.limits = { witness }))])
      assert.deepEqual(codes(d, 'a'), ['capacity_unproven'], witness)
    }
  })

  it('a proven no-applicable-window case needs no observations, and contradicting ones conflict', () => {
    assert.equal(run([candidate('a', none)]).outcome, 'selected')
    const conflicting = run([candidate('a', (c) => (c.capacity.limits = { witness: 'none_applicable' }))])
    assert.deepEqual(codes(conflicting, 'a'), ['fact_conflict'])
  })

  for (const role of ['worker', 'project_manager', 'reviewer', 'tester'] as const satisfies readonly Role[]) {
    it(`protected capacity is required for a consuming ${role}`, () => {
      const forRole = (i: SelectionInput) => {
        i.request.role = role
        if (role === 'reviewer' || role === 'tester') {
          i.independence = {
            authorship: 'known',
            subjectRevisionRef: 'cand-1',
            authorSessionRefs: [],
            authorAttemptRefs: [],
          }
        }
      }
      const empty = run(
        [candidate('a', (c) => (c.protection = { witness: 'covered', requiredDimensionRefs: [], verdicts: [] }))],
        forRole,
      )
      assert.deepEqual(codes(empty, 'a'), ['reserve_unknown'])
      const absent = run([candidate('a', (c) => (c.protection = { witness: 'policy_absent' }))], forRole)
      assert.deepEqual(codes(absent, 'a'), ['reserve_policy_missing'])
      const violates = run(
        [
          candidate(
            'a',
            (c) =>
              (c.protection = {
                witness: 'covered',
                requiredDimensionRefs: ['d1'],
                verdicts: [{ dimensionRef: 'd1', verdict: 'would_violate' }],
              }),
          ),
        ],
        forRole,
      )
      assert.deepEqual(codes(violates, 'a'), ['reserve_protected'])
    })
  }

  it('a reserve verdict missing for a required dimension, or an extra one, conflicts', () => {
    const d = run([
      candidate('a', (c) => {
        c.protection = {
          witness: 'covered',
          requiredDimensionRefs: ['d1', 'd2'],
          verdicts: [{ dimensionRef: 'd1', verdict: 'preserves_protected' }],
        }
      }),
    ])
    assert.deepEqual(codes(d, 'a'), ['fact_conflict'])
  })

  it('a conservative no-reading policy admits only with protection proved', () => {
    assert.equal(run([conservativeCandidate('a')]).outcome, 'selected')
    const unprotected = conservativeCandidate('a')
    unprotected.protection = { witness: 'unknown' }
    assert.deepEqual(codes(run([unprotected]), 'a'), ['reserve_unknown'])
  })
})

function conservativeCandidate(ref: string, over: Partial<ResolvedProof> = {}, verdict: 'admits' | 'busy' = 'admits') {
  return candidate(ref, (c) => {
    const base = proof('conservative_capacity_policy', c)
    c.capacity = {
      basis: 'conservative_policy',
      limits: { witness: 'unknown' },
      windows: [],
      policy: {
        proof: { ...base, scope: { ...base.scope, accountGroupRef: c.accountGroup.groupRef }, ...over },
        verdict,
      },
    }
  })
}

describe('C02: resolved proofs bind the exact use and the evaluation instant', () => {
  it('a matching standing policy without expiry admits; busy waits', () => {
    assert.equal(run([conservativeCandidate('a')]).outcome, 'selected')
    assert.deepEqual(codes(run([conservativeCandidate('a', {}, 'busy')]), 'a'), ['account_busy'])
  })

  for (const [name, over] of [
    ['another owner issued it', { authorizerRef: OTHER }],
    ['it is revoked', { status: 'revoked' }],
    ['it is stale', { status: 'stale' }],
    ['its applicability is unknown', { status: 'unknown' }],
    ['it expired exactly now', { validUntil: AT }],
    ['it starts later', { validFrom: '2026-11-13T08:00:00.000001Z' }],
    ['the project issued it', { issuer: 'project' }],
  ] as const) {
    it(`no capacity when ${name}`, () => {
      assert.deepEqual(codes(run([conservativeCandidate('a', over)]), 'a'), ['capacity_policy_unproven'])
    })
  }

  it('a policy for another account group, operation or role does not apply', () => {
    for (const scopeOver of [
      { accountGroupRef: 'group-other' },
      { operationRef: 'op-other' },
      { roles: ['reviewer' as const] },
    ]) {
      const c = candidate('a', (x) => {
        const base = proof('conservative_capacity_policy', x)
        x.capacity = {
          basis: 'conservative_policy',
          limits: { witness: 'unknown' },
          windows: [],
          policy: {
            proof: { ...base, scope: { ...base.scope, accountGroupRef: x.accountGroup.groupRef, ...scopeOver } },
            verdict: 'admits',
          },
        }
      })
      assert.deepEqual(codes(run([c]), 'a'), ['capacity_policy_unproven'], JSON.stringify(scopeOver))
    }
  })

  it('a route override is owner-issued for the owner resource, and a project override needs project funding', () => {
    const api = candidate('a', (c) => (c.routeKind = 'api'))
    const owner = run([api], (i) => (i.policy.routeOverrides = [proof('route_override', api)]))
    assert.equal(owner.outcome, 'selected')
    const projectOverride = proof('route_override', api, {
      issuer: 'project',
      authorizerRef: 'project-admin',
      scope: { ...proof('route_override', api).scope, ownerRef: null },
    })
    const unrelated = run([api], (i) => (i.policy.routeOverrides = [projectOverride]))
    assert.deepEqual(codes(unrelated, 'a'), ['route_default_not_overridden'])
    const funded = candidate('a', (c) => {
      c.routeKind = 'api'
      c.authority = {
        basis: 'project_allowance',
        proof: proof('project_allowance', c, {
          issuer: 'project',
          authorizerRef: 'project-admin',
          scope: { ...proof('project_allowance', c).scope, ownerRef: null },
        }),
      }
    })
    const ok = run(
      [funded],
      (i) =>
        (i.policy.routeOverrides = [{ ...projectOverride, scope: { ...projectOverride.scope, routeKind: 'api' } }]),
    )
    assert.equal(ok.outcome, 'selected')
  })

  it('an override changes only the default: an unqualified operation stays excluded', () => {
    const api = candidate('a', (c) => {
      c.routeKind = 'api'
      c.qualification.operations = ['research']
    })
    const d = run([api], (i) => (i.policy.routeOverrides = [proof('route_override', api)]))
    assert.deepEqual(codes(d, 'a'), ['operation_not_qualified'])
  })

  it('an expired override is no override', () => {
    const api = candidate('a', (c) => (c.routeKind = 'api'))
    const d = run(
      [api],
      (i) => (i.policy.routeOverrides = [proof('route_override', api, { validUntil: '2026-11-13T07:59:59Z' })]),
    )
    assert.deepEqual(codes(d, 'a'), ['route_default_not_overridden'])
  })
})

function grantCandidate(ref: string, mutate: (c: Candidate) => void = () => {}) {
  return candidate(ref, (c) => {
    c.ownerRef = OTHER
    c.routeKind = 'api'
    c.authority = {
      basis: 'contribution_grant',
      grant: {
        grantRef: `grant-${ref}`,
        revisionRef: 'grant-rev-1',
        ownerRef: OTHER,
        projectRef: 'proj-1',
        expiresAt: '2026-12-01T00:00:00Z',
        unusable: [],
        requesterEligible: true,
        operationRefs: ['op-explore'],
        roles: ['explorer'],
        allowedSettings: [
          {
            providerInstanceRef: 'codex',
            models: [{ model: 'm1', options: [{ id: 'effort', values: ['high', 'low'] }] }],
          },
        ],
      },
    }
    mutate(c)
  })
}
const explore = (i: SelectionInput) => {
  i.request.family = 'explore'
  i.request.operationRef = 'op-explore'
  i.request.role = 'explorer'
}

describe('C03: derived cross-member use, grant applicability and request-wide refusals', () => {
  it('another member API contribution under a current grant is eligible', () => {
    assert.equal(run([grantCandidate('a')], explore).outcome, 'selected')
  })

  it('own-use authority on someone else resource is a contradiction, never sharing', () => {
    const d = run([candidate('a', (c) => (c.ownerRef = OTHER))])
    assert.ok(codes(d, 'a').includes('fact_conflict'))
    assert.equal(d.proposedRef, null)
  })

  it('cross-member native needs a qualified delegation, derived from the refs', () => {
    const shared = (delegation: Candidate['nativeDelegation']) =>
      grantCandidate('a', (c) => {
        c.routeKind = 'native'
        c.nativeDelegation = delegation
      })
    assert.ok(codes(run([shared('unqualified')], task), 'a').includes('cross_member_native_unqualified'))
    assert.ok(codes(run([shared('unknown')], task), 'a').includes('native_delegation_unknown'))
    assert.ok(codes(run([shared('not_applicable')], task), 'a').includes('fact_conflict'))
    assert.equal(run([shared('qualified')], task).outcome, 'selected')
  })

  it('a required grant that is null is missing, never not-applicable', () => {
    const d = run([grantCandidate('a', (c) => (c.authority = { basis: 'contribution_grant', grant: null }))], explore)
    assert.deepEqual(codes(d, 'a'), ['grant_missing'])
  })

  it('a grant for another owner or project conflicts', () => {
    const d = run(
      [
        grantCandidate(
          'a',
          (c) =>
            c.authority.basis === 'contribution_grant' &&
            c.authority.grant &&
            (c.authority.grant.projectRef = 'proj-2'),
        ),
      ],
      explore,
    )
    assert.deepEqual(codes(d, 'a'), ['fact_conflict'])
  })

  it('grant expiry is judged at the evaluation instant, exclusive', () => {
    const at = (expiresAt: string) =>
      run(
        [
          grantCandidate(
            'a',
            (c) =>
              c.authority.basis === 'contribution_grant' &&
              c.authority.grant &&
              (c.authority.grant.expiresAt = expiresAt),
          ),
        ],
        explore,
      )
    assert.deepEqual(codes(at(AT), 'a'), ['grant_expired'])
    assert.equal(at('2026-11-13T08:00:00.000001Z').outcome, 'selected')
  })

  it('the grant must cover the actual role, operation and strict settings', () => {
    const d = run([grantCandidate('a')], (i) => {
      explore(i)
      i.request.role = 'worker'
      i.request.strictSettings = {
        providerInstanceRef: 'codex',
        model: 'm1',
        options: [{ id: 'effort', value: 'high' }],
      }
    })
    assert.deepEqual(codes(d, 'a'), ['role_not_granted'])
    const settings = run(
      [
        grantCandidate(
          'a',
          (c) =>
            c.authority.basis === 'contribution_grant' && c.authority.grant && (c.authority.grant.allowedSettings = []),
        ),
      ],
      (i) => {
        explore(i)
        i.request.strictSettings = {
          providerInstanceRef: 'codex',
          model: 'm1',
          options: [{ id: 'effort', value: 'high' }],
        }
      },
    )
    assert.deepEqual(codes(settings, 'a'), ['settings_not_granted'])
  })

  it('0094 refusal codes pass through with paused as temporary', () => {
    const d = run(
      [
        grantCandidate(
          'a',
          (c) =>
            c.authority.basis === 'contribution_grant' &&
            c.authority.grant &&
            (c.authority.grant.unusable = ['grant_paused']),
        ),
        grantCandidate(
          'b',
          (c) =>
            c.authority.basis === 'contribution_grant' &&
            c.authority.grant &&
            (c.authority.grant.unusable = ['admin_disabled']),
        ),
      ],
      explore,
    )
    assert.equal(d.outcome, 'waiting')
    assert.deepEqual(row(d, 'a').failures, [{ code: 'grant_paused', cls: 'availability' }])
    assert.deepEqual(row(d, 'b').failures, [{ code: 'admin_disabled', cls: 'prohibition' }])
  })

  it('a project allowance needs a current, in-scope project proof', () => {
    const funded = (over: Partial<ResolvedProof>) =>
      candidate('a', (c) => {
        const p = proof('project_allowance', c, { issuer: 'project', authorizerRef: 'project-admin' })
        c.authority = { basis: 'project_allowance', proof: { ...p, scope: { ...p.scope, ownerRef: null }, ...over } }
      })
    assert.equal(run([funded({})]).outcome, 'selected')
    assert.deepEqual(codes(run([funded({ status: 'revoked' })]), 'a'), ['project_allowance_revoked'])
    assert.deepEqual(codes(run([funded({ status: 'stale' })]), 'a'), ['project_allowance_unproven'])
    assert.deepEqual(codes(run([funded({ issuer: 'owner' })]), 'a'), ['project_allowance_out_of_scope'])
  })

  it('unknown disclosure or authority fails closed', () => {
    assert.deepEqual(codes(run([candidate('a', (c) => (c.sourceDisclosure = 'unknown'))]), 'a'), [
      'source_disclosure_unknown',
    ])
    assert.deepEqual(codes(run([candidate('a', (c) => (c.authority = { basis: 'unknown' }))]), 'a'), [
      'authority_unknown',
    ])
  })
})

const scope = (
  mode: 'auto' | 'prefer' | 'pin',
  targetRef: string | null,
  over: Partial<SelectionInput['policy']['scopes'][number]> = {},
) => ({
  level: 'action' as const,
  mode,
  targetRef,
  settings: null,
  crossPayer: [],
  revisionRef: 'policy-rev-1',
  ...over,
})
const busy = (c: Candidate) => (c.commitments.accountGroupBusy = 'busy')

describe('C04: total Pin, Prefer and empty modes', () => {
  it('an empty pool waits explicitly', () => {
    const d = run([])
    assert.equal(d.outcome, 'waiting')
    assert.deepEqual(d.globalCodes, ['no_candidates'])
    assert.deepEqual(d.nextSteps, ['owner_resource_or_qualified_snapshot_required'])
  })

  it('an absent Prefer target waits and never guesses a payer fallback', () => {
    const d = run([candidate('b')], (i) => (i.policy.scopes = [scope('prefer', 'a')]))
    assert.equal(d.outcome, 'waiting')
    assert.deepEqual(d.globalCodes, ['prefer_target_absent'])
    assert.equal(d.proposedRef, null)
  })

  it('an absent Pin target waits with no alternative', () => {
    const d = run([candidate('b')], (i) => (i.policy.scopes = [scope('pin', 'a')]))
    assert.deepEqual([d.outcome, d.globalCodes, d.proposedRef], ['waiting', ['pin_target_absent'], null])
  })

  it('a busy Pin waits; a prohibited Pin is denied; another candidate is never selected', () => {
    const waits = run([candidate('a', busy), candidate('b')], (i) => (i.policy.scopes = [scope('pin', 'a')]))
    assert.deepEqual([waits.outcome, waits.globalCodes, waits.proposedRef], ['waiting', ['pin_unavailable'], null])
    assert.deepEqual(codes(waits, 'b'), ['outside_pin'])
    const denied = run(
      [candidate('a', (c) => (c.sourceDisclosure = 'denied')), candidate('b')],
      (i) => (i.policy.scopes = [scope('pin', 'a')]),
    )
    assert.deepEqual([denied.outcome, denied.globalCodes], ['denied', ['pin_cannot_be_honored']])
  })

  it('a prohibited Prefer target denies fallback rather than retrying under another identity', () => {
    const d = run(
      [
        candidate('a', (c) => (c.authority = { basis: 'contribution_grant', grant: null })),
        candidate('b', (c) => (c.payerScopeRef = 'payer-a')),
      ],
      (i) => (i.policy.scopes = [scope('prefer', 'a')]),
    )
    assert.deepEqual([d.outcome, d.globalCodes], ['denied', ['preferred_prohibited']])
  })

  it('an unavailable Prefer target falls back within its payer only', () => {
    const d = run([candidate('a', busy), candidate('b', (c) => (c.payerScopeRef = 'payer-a')), candidate('c')], (i) => {
      i.policy.scopes = [scope('prefer', 'a')]
    })
    assert.equal(d.proposedRef, 'b')
    assert.deepEqual(d.fallback, { targetRef: 'a', crossPayer: false })
    assert.deepEqual(codes(d, 'c'), ['fallback_payer_not_authorized'])
  })

  it('with no authorization a different payer is not a fallback', () => {
    const d = run([candidate('a', busy), candidate('c')], (i) => (i.policy.scopes = [scope('prefer', 'a')]))
    assert.deepEqual([d.outcome, d.globalCodes], ['waiting', ['prefer_fallback_unavailable']])
  })

  it('a cross-payer authorization never competes with an eligible preferred target', () => {
    const c = candidate('c', tier(0))
    const auth = proof('cross_payer_fallback', c, {
      scope: { ...proof('cross_payer_fallback', c).scope, fromPayerScopeRef: 'payer-a' },
    })
    const d = run(
      [candidate('a', tier(5)), c],
      (i) => (i.policy.scopes = [scope('prefer', 'a', { crossPayer: [auth] })]),
    )
    assert.deepEqual([d.proposedRef, d.fallback], ['a', null])
    assert.deepEqual(codes(d, 'c'), ['fallback_payer_not_authorized'])
  })

  it('a better-fitting same-payer alternative to an eligible target is not reported as a fallback payer change', () => {
    const d = run(
      [
        candidate('a', tier(5)),
        candidate('b', (c) => {
          tier(0)(c)
          c.payerScopeRef = 'payer-a'
        }),
      ],
      (i) => (i.policy.scopes = [scope('prefer', 'a')]),
    )
    assert.deepEqual([d.proposedRef, d.fallback], ['b', { targetRef: 'a', crossPayer: false }])
  })

  it('an explicit current cross-payer authorization permits only its listed payer', () => {
    const c = candidate('c')
    const auth = proof('cross_payer_fallback', c, {
      scope: { ...proof('cross_payer_fallback', c).scope, fromPayerScopeRef: 'payer-a' },
    })
    const d = run(
      [candidate('a', busy), c, candidate('d')],
      (i) => (i.policy.scopes = [scope('prefer', 'a', { crossPayer: [auth] })]),
    )
    assert.equal(d.proposedRef, 'c')
    assert.deepEqual(d.fallback, { targetRef: 'a', crossPayer: true })
    assert.deepEqual(codes(d, 'd'), ['fallback_payer_not_authorized'])
  })

  it('a cross-payer authorization never replaces the fallback candidate own grant', () => {
    const c = grantCandidate(
      'c',
      (x) =>
        x.authority.basis === 'contribution_grant' &&
        x.authority.grant &&
        (x.authority.grant.unusable = ['grant_expired']),
    )
    const base = proof('cross_payer_fallback', c)
    const auth = {
      ...base,
      scope: {
        ...base.scope,
        fromPayerScopeRef: 'payer-a',
        family: 'explore' as const,
        operationRef: 'op-explore',
        roles: ['explorer' as const],
      },
    }
    const target = grantCandidate('a', busy)
    const d = run([target, c], (i) => {
      explore(i)
      i.policy.scopes = [scope('prefer', 'a', { crossPayer: [auth] })]
    })
    assert.equal(d.proposedRef, null)
  })

  it('in Auto, no eligible and every candidate prohibited is denied; otherwise it waits', () => {
    const denied = run([candidate('a', (c) => (c.sourceDisclosure = 'denied'))])
    assert.deepEqual([denied.outcome, denied.globalCodes], ['denied', ['no_permitted_candidate']])
    const waits = run([candidate('a', (c) => (c.sourceDisclosure = 'denied')), candidate('b', busy)])
    assert.deepEqual(
      [waits.outcome, waits.nextSteps],
      ['waiting', ['permitted_alternative_required', 'refresh_or_wait']],
    )
  })
})

const strict = (value: string, instance = 'codex') => ({
  providerInstanceRef: instance,
  model: 'm1',
  options: [{ id: 'effort', value }],
})

describe('C05: strict and soft settings', () => {
  it('scope precedence is action, then role, then the family default', () => {
    const d = run([candidate('a', busy), candidate('b')], (i) => {
      i.policy.scopes = [scope('prefer', 'b', { level: 'role' }), scope('pin', 'a', { level: 'action' })]
    })
    assert.deepEqual([d.resolvedPolicy?.level, d.outcome], ['action', 'waiting'])
    const role = run([candidate('a', busy), candidate('b')], (i) => {
      i.policy.scopes = [scope('pin', 'a', { level: 'family_default' }), scope('prefer', 'b', { level: 'role' })]
    })
    assert.deepEqual([role.resolvedPolicy?.level, role.proposedRef], ['role', 'b'])
  })

  it('a manual strict request conflicting with the winning Pin settings is invalid', () => {
    const d = run([candidate('a')], (i) => {
      i.request.strictSettings = strict('high')
      i.policy.scopes = [scope('pin', 'a', { settings: strict('low') })]
    })
    assert.equal(d.outcome, 'invalid_input')
    assert.ok(d.errors.some((e) => e.code === 'strict_settings_conflict'))
  })

  it('Pin settings are strict: an undeclared value denies the pin', () => {
    const d = run([candidate('a')], (i) => (i.policy.scopes = [scope('pin', 'a', { settings: strict('max') })]))
    assert.deepEqual([d.outcome, codes(d, 'a')], ['denied', ['settings_not_declared']])
  })

  it('strict settings for another provider instance are never equated, even with the same label', () => {
    const d = run([candidate('a')], (i) => (i.request.strictSettings = strict('high', 'claude')))
    assert.deepEqual(codes(d, 'a'), ['settings_not_declared'])
  })

  it('strict settings cannot be verified against an unknown declaration', () => {
    const d = run(
      [candidate('a', (c) => (c.settings.declared = 'unknown'))],
      (i) => (i.request.strictSettings = strict('high')),
    )
    assert.deepEqual(codes(d, 'a'), ['settings_unverifiable'])
  })

  it('a soft Prefer seed never excludes and is proposed only when declared and granted', () => {
    const prefer = (value: string) => (i: SelectionInput) =>
      (i.policy.scopes = [scope('prefer', 'a', { settings: strict(value) })])
    const declared = run([candidate('a')], prefer('low'))
    assert.deepEqual(row(declared, 'a').seed, strict('low'))
    const undeclared = run([candidate('a')], prefer('max'))
    assert.equal(undeclared.outcome, 'selected')
    assert.equal(row(undeclared, 'a').seed, 'unspecified')
  })

  it('a default seed outside the grant is never proposed', () => {
    const c = grantCandidate('a', (x) => {
      x.settings.defaultSeed = strict('high')
      if (x.authority.basis === 'contribution_grant' && x.authority.grant) {
        x.authority.grant.allowedSettings = [
          { providerInstanceRef: 'codex', models: [{ model: 'm1', options: [{ id: 'effort', values: ['low'] }] }] },
        ]
      }
    })
    assert.equal(row(run([c], explore), 'a').seed, 'unspecified')
  })

  it('conflicting declared models are a fact conflict, whatever their order', () => {
    const decl = (first: string, second: string) =>
      candidate('a', (c) => {
        c.settings.declared = {
          providerInstanceRef: 'codex',
          models: [
            { model: 'm1', options: [{ id: 'effort', values: [first] }] },
            { model: 'm1', options: [{ id: 'effort', values: [second] }] },
          ],
        }
      })
    assert.deepEqual(codes(run([decl('high', 'low')]), 'a'), ['fact_conflict'])
    assert.deepEqual(codes(run([decl('low', 'high')]), 'a'), ['fact_conflict'])
  })

  it('accepted and observed settings are always unknown', () => {
    const d = run([candidate('a')], (i) => (i.request.strictSettings = strict('high')))
    assert.deepEqual(d.settings, { strict: strict('high'), accepted: 'unknown', observed: 'unknown' })
  })
})

describe('capacity observations, commitments and aliases', () => {
  it('a window fresh until exactly now is stale, never ranked last as eligible', () => {
    const d = run([candidate('a', window({ freshUntil: AT }))])
    assert.deepEqual([d.outcome, codes(d, 'a')], ['waiting', ['capacity_unproven']])
  })

  it('an observation from the future or of unknown applicability proves nothing', () => {
    assert.deepEqual(codes(run([candidate('a', window({ observedAt: '2026-11-13T08:00:01Z' }))]), 'a'), [
      'capacity_unproven',
    ])
    assert.deepEqual(codes(run([candidate('a', window({ applicability: 'partial' }))]), 'a'), ['capacity_unproven'])
  })

  it('every limiting window counts: one exhausted window excludes', () => {
    const d = run([
      candidate('a', (c) => {
        c.capacity.limits = { witness: 'covered', requiredWindowRefs: ['w1', 'w2'] }
        const w1 = c.capacity.windows[0]
        if (w1) c.capacity.windows = [w1, { ...w1, windowRef: 'w2', unit: 'credits_remaining', verdict: 'exhausted' }]
      }),
    ])
    assert.deepEqual(codes(d, 'a'), ['capacity_exhausted'])
  })

  it('a passed reset asks for a refresh and never replenishes', () => {
    const d = run([candidate('a', window({ verdict: 'exhausted', resetAt: '2026-11-13T07:00:00Z' }))])
    assert.deepEqual(codes(d, 'a'), ['reset_passed_refresh_required'])
  })

  it('windows in different native units admit together with no combined quantity', () => {
    const d = run([
      candidate('a', (c) => {
        c.capacity.limits = { witness: 'covered', requiredWindowRefs: ['w1', 'w2'] }
        const w1 = c.capacity.windows[0]
        if (w1) c.capacity.windows = [w1, { ...w1, windowRef: 'w2', unit: 'credits_remaining' }]
      }),
    ])
    assert.equal(d.outcome, 'selected')
    assert.ok(!JSON.stringify(projectSelection(d, ACTOR)).includes('credits_remaining'))
  })

  it('an observation basis of none or a duplicated window is unproven or conflicting', () => {
    assert.deepEqual(codes(run([candidate('a', (c) => (c.capacity.basis = 'none'))]), 'a'), ['capacity_unproven'])
    const dup = candidate('a', (c) => {
      const w = c.capacity.windows[0]
      if (w) c.capacity.windows = [w, { ...w, verdict: 'exhausted' }]
    })
    assert.deepEqual(codes(run([dup]), 'a'), ['fact_conflict'])
  })

  it('an uncertain alias has no independent allowance without a conservative policy', () => {
    assert.deepEqual(codes(run([candidate('a', (c) => (c.accountGroup.identity = 'uncertain'))]), 'a'), [
      'alias_identity_uncertain',
    ])
    const conservative = conservativeCandidate('a')
    conservative.accountGroup.identity = 'uncertain'
    assert.equal(run([conservative]).outcome, 'selected')
  })

  it('an unsettled or unknown effect on the account excludes it', () => {
    assert.deepEqual(codes(run([candidate('a', (c) => (c.commitments.unsettledEffects = 'present'))]), 'a'), [
      'uncertain_effect',
    ])
    assert.deepEqual(codes(run([candidate('a', (c) => (c.commitments.accountGroupBusy = 'unknown'))]), 'a'), [
      'commitment_unknown',
    ])
  })
})

describe('independence by actual author history', () => {
  it('unknown authorship blocks review', () => {
    const d = run([candidate('a')], (i) => {
      review([])(i)
      if (i.independence) i.independence.authorship = 'unknown'
    })
    assert.deepEqual([d.outcome, d.globalCodes], ['blocked', ['independence_proof_missing']])
  })

  it('the authoring session or attempt is excluded', () => {
    assert.deepEqual(codes(run([candidate('a', existing('s-author'))], review(['s-author'])), 'a'), ['author_session'])
    assert.deepEqual(codes(run([candidate('a', existing('s-2', ['att-1']))], review([], ['att-1'])), 'a'), [
      'author_session',
    ])
  })

  it('the same vendor and account as the author is not disqualifying', () => {
    assert.equal(run([candidate('a')], review(['s-author'])).outcome, 'selected')
  })

  it('one non-author session may serve review and then test as separate decisions', () => {
    const reviewer = run([candidate('a', existing('s-indep'))], review(['s-author']))
    const tester = run([candidate('a', existing('s-indep'))], (i) => {
      review(['s-author'])(i)
      i.request.role = 'tester'
      i.request.family = 'test'
    })
    assert.deepEqual([reviewer.proposedRef, tester.proposedRef], ['a', 'a'])
  })

  it('independence facts are required exactly for review and test', () => {
    assert.equal(run([candidate('a')], (i) => (i.request.role = 'reviewer')).outcome, 'invalid_input')
    const extra = run([candidate('a')], (i) => {
      i.independence = {
        authorship: 'known',
        subjectRevisionRef: 'cand-1',
        authorSessionRefs: [],
        authorAttemptRefs: [],
      }
    })
    assert.equal(extra.outcome, 'invalid_input')
  })
})

describe('ranking: capability first, then preference, capacity, availability, reliability, cost, identity', () => {
  it('capability suitability outranks explicit preference', () => {
    const d = run(
      [
        candidate('a', tier(0)),
        candidate('b', (c) => {
          tier(1)(c)
          c.payerScopeRef = 'payer-a'
        }),
      ],
      (i) => (i.policy.scopes = [scope('prefer', 'b')]),
    )
    assert.deepEqual([d.proposedRef, row(d, 'a').rankStep], ['a', 1])
  })

  it('with equal fit the preferred candidate is first', () => {
    const d = run(
      [candidate('a'), candidate('b', (c) => (c.payerScopeRef = 'payer-a'))],
      (i) => (i.policy.scopes = [scope('prefer', 'b')]),
    )
    assert.deepEqual([d.proposedRef, row(d, 'b').rankStep], ['b', 2])
  })

  it('observed capacity outranks a conservative policy', () => {
    const d = run([conservativeCandidate('a'), candidate('b')])
    assert.deepEqual([d.proposedRef, row(d, 'b').rankStep], ['b', 3])
  })

  it('a known availability, reliability or cost outranks an unknown one', () => {
    const avail = run([candidate('a'), candidate('b', (c) => (c.ranking.availableAt = { status: 'known', value: AT }))])
    assert.deepEqual([avail.proposedRef, row(avail, 'b').rankStep], ['b', 4])
    const reliable = run([
      candidate('a'),
      candidate('b', (c) => (c.ranking.reliability = { status: 'known', value: 1 })),
    ])
    assert.deepEqual([reliable.proposedRef, row(reliable, 'b').rankStep], ['b', 5])
    const cost = run([
      candidate('a'),
      candidate('b', (c) => (c.ranking.costLatencyTier = { status: 'known', value: 1000 })),
    ])
    assert.deepEqual([cost.proposedRef, row(cost, 'b').rankStep], ['b', 6])
  })

  it('identical candidates tie-break by reference', () => {
    const d = run([candidate('b'), candidate('a')])
    assert.deepEqual([d.proposedRef, d.alternatives, row(d, 'a').rankStep, row(d, 'b').rankStep], ['a', ['b'], 7, 0])
  })
})

describe('determinism and correlation', () => {
  function shuffled(i: SelectionInput): SelectionInput {
    const j = clone(i)
    j.candidates = j.candidates.toReversed()
    for (const c of j.candidates) {
      c.qualification.operations = [...c.qualification.operations, 'extra'].toReversed()
      c.share = c.share.toReversed().map((x) => ({ ...x, fields: x.fields.toReversed() }))
      c.capacity.windows = c.capacity.windows.toReversed()
    }
    if (j.request.strictSettings) j.request.strictSettings.options = j.request.strictSettings.options.toReversed()
    j.summaryViewerRefs = j.summaryViewerRefs.toReversed()
    return j
  }

  it('any permutation of candidates and sets gives the same data decision and correlation', () => {
    const base = input(
      [
        candidate('a', (c) => (c.qualification.operations = ['create', 'extra'])),
        candidate('b', (c) => (c.qualification.operations = ['create', 'extra'])),
      ],
      (i) => (i.summaryViewerRefs = [ACTOR, OTHER]),
    )
    for (const c of base.candidates) {
      c.share = [
        { viewerRef: ACTOR, fields: ['route_kind', 'payer_scope'] },
        { viewerRef: OTHER, fields: ['settings'] },
      ]
      c.settings.declared = {
        providerInstanceRef: 'codex',
        models: [
          {
            model: 'm1',
            options: [
              { id: 'effort', values: ['high'] },
              { id: 'fast', values: [true] },
            ],
          },
        ],
      }
      const w = c.capacity.windows[0]
      if (w) c.capacity.windows = [w, { ...w, windowRef: 'w2' }]
    }
    base.request.strictSettings = {
      providerInstanceRef: 'codex',
      model: 'm1',
      options: [
        { id: 'fast', value: true },
        { id: 'effort', value: 'high' },
      ],
    }
    const decision = evaluateSelection(base)
    assert.equal(decision.outcome, 'selected')
    assert.deepEqual(plain(evaluateSelection(shuffled(base))), plain(decision))
    assert.deepEqual(
      decision.settings.strict?.options.map((o) => o.id),
      ['effort', 'fast'],
    )
  })

  it('a reordered invalid input reports the same sorted errors', () => {
    const bad = input([
      candidate('a', (c) => (c.factsRevisionRef = 'bad ref')),
      candidate('b', (c) => (c.providerRef = ' ')),
    ])
    assert.deepEqual(evaluateSelection(shuffled(bad)).errors, evaluateSelection(bad).errors)
    assert.deepEqual(evaluateSelection(bad).errors, [
      { code: 'malformed_ref', path: '/candidates/a/factsRevisionRef' },
      { code: 'malformed_ref', path: '/candidates/b/providerRef' },
    ])
  })

  it('a deep-frozen input is accepted and unchanged', () => {
    const i = input([candidate('a'), candidate('b')])
    const before = clone(i)
    frozen(i)
    assert.equal(evaluateSelection(i).outcome, 'selected')
    assert.deepEqual(i, before)
  })

  it('correlation carries the normalized instant, so a later evaluation is never the same identity', () => {
    const early = run([candidate('a')])
    const late = run([candidate('a')], (i) => (i.evaluatedAt = '2026-11-13T09:00:00+00:00'))
    assert.equal(early.correlation?.evaluatedAt, '2026-11-13T08:00:00.000000Z')
    assert.notDeepEqual(early.correlation, late.correlation)
    assert.equal(late.outcome, 'waiting')
  })

  it('a reused revision ref does not hide a changed decision: correlation is not decision identity', () => {
    const a = run([candidate('a')])
    const b = run([candidate('a', busy)])
    assert.deepEqual(a.correlation, b.correlation)
    assert.notEqual(a.outcome, b.outcome)
  })

  it('reported codes are a sorted bounded subset; status comes from every failure', () => {
    const d = run([
      candidate('a', (c) => {
        c.sourceDisclosure = 'denied'
        c.commitments.accountGroupBusy = 'busy'
        c.qualification.host = 'offline'
      }),
    ])
    assert.deepEqual(row(d, 'a').reportedCodes, ['source_disclosure_denied', 'account_busy', 'host_offline'])
    assert.equal(d.outcome, 'denied')
  })
})

describe('keyed fact conflicts', () => {
  it('one viewer shared two different field sets is a conflict; an identical repeat is not', () => {
    const conflicting = run([
      candidate('a', (c) => {
        c.share = [
          { viewerRef: OTHER, fields: ['route_kind'] },
          { viewerRef: OTHER, fields: ['payer_scope'] },
        ]
      }),
    ])
    assert.deepEqual(codes(conflicting, 'a'), ['fact_conflict'])
    const repeated = run([
      candidate('a', (c) => {
        c.share = [
          { viewerRef: OTHER, fields: ['route_kind', 'route_kind'] },
          { viewerRef: OTHER, fields: ['route_kind'] },
        ]
      }),
    ])
    assert.equal(repeated.outcome, 'selected')
  })

  it('a grant declaring one option twice with different values fails closed for strict settings', () => {
    const c = grantCandidate('a', (x) => {
      if (x.authority.basis === 'contribution_grant' && x.authority.grant) {
        x.authority.grant.allowedSettings = [
          {
            providerInstanceRef: 'codex',
            models: [
              {
                model: 'm1',
                options: [
                  { id: 'effort', values: ['high'] },
                  { id: 'effort', values: ['low'] },
                ],
              },
            ],
          },
        ]
      }
    })
    const d = run([c], (i) => {
      explore(i)
      i.request.strictSettings = strict('high')
    })
    assert.deepEqual(codes(d, 'a'), ['fact_conflict'])
  })
})

describe('C06: one viewer-safe projection', () => {
  const sharedWith = (fields: readonly ('route_kind' | 'settings' | 'payer_scope')[]) => (c: Candidate) =>
    (c.share = [{ viewerRef: ACTOR, fields }])

  it('a viewer not permitted to see the request gets one uniform restricted shape', () => {
    const selected = projectSelection(run([candidate('a')]), OTHER)
    const blocked = projectSelection(
      run([candidate('a')], (i) => (i.control.goalStatus = 'held')),
      OTHER,
    )
    const empty = projectSelection(run([]), OTHER)
    assert.deepEqual(selected, {
      contract: SELECTION_INPUT_CONTRACT,
      policyVersion: SELECTION_POLICY_VERSION,
      disclosure: 'restricted',
    })
    assert.deepEqual(blocked, selected)
    assert.deepEqual(empty, selected)
  })

  it('a non-owner requester sees a shared resource only as a coarse limitation and its shared fields', () => {
    const d = run(
      [
        grantCandidate('a', (c) => {
          sharedWith(['route_kind'])(c)
          if (c.authority.basis === 'contribution_grant' && c.authority.grant)
            c.authority.grant.unusable = ['grant_revoked']
        }),
      ],
      explore,
    )
    const view = projectSelection(d, ACTOR)
    assert.equal(view.disclosure, 'shared')
    if (view.disclosure !== 'shared') return
    assert.deepEqual(view.candidates, [
      { candidateRef: 'a', relation: 'shared', limitation: 'not_permitted_for_this_work', routeKind: 'api' },
    ])
    assert.ok(!JSON.stringify(view).includes('grant_revoked'))
  })

  it('a selected resource without settings or payer sharing withholds them from the proposal too', () => {
    const d = run(
      [
        grantCandidate('a', (c) => {
          sharedWith(['route_kind'])(c)
          c.settings.defaultSeed = strict('high')
        }),
      ],
      explore,
    )
    const view = projectSelection(d, ACTOR)
    assert.ok(view.disclosure === 'shared')
    assert.deepEqual(view.proposal, {
      candidateRef: 'a',
      relation: 'shared',
      limitation: 'eligible',
      routeKind: 'api',
      accepted: 'unknown',
      observed: 'unknown',
    })
    assert.ok(!JSON.stringify(view).includes('payer-a'))
    assert.ok(!JSON.stringify(view).includes('"high"'))
  })

  it('a hidden selected resource is withheld everywhere, with no counts', () => {
    const d = run([grantCandidate('a')], explore)
    const view = projectSelection(d, ACTOR)
    assert.ok(view.disclosure === 'shared')
    assert.deepEqual(
      [view.candidates, view.proposal, view.alternatives, view.fallback],
      [[], { withheld: true }, [], null],
    )
    assert.ok(!JSON.stringify(view).includes('grant-a'))
  })

  it('a hidden preferred target leaks no payer change through the fallback', () => {
    const target = grantCandidate('a', busy)
    const c = grantCandidate('c', sharedWith(['route_kind', 'payer_scope']))
    c.payerScopeRef = target.payerScopeRef
    const d = run([target, c], (i) => {
      explore(i)
      i.policy.scopes = [scope('prefer', 'a')]
    })
    assert.equal(d.proposedRef, 'c')
    const view = projectSelection(d, ACTOR)
    assert.ok(view.disclosure === 'shared')
    assert.equal(view.fallback, null)
    assert.ok(!JSON.stringify(view).includes('"a"'))
  })

  it('the owner sees their own resource with its full codes', () => {
    const d = run([candidate('a', busy)])
    const view = projectSelection(d, ACTOR)
    assert.ok(view.disclosure === 'shared')
    assert.deepEqual(view.candidates[0]?.codes, ['account_busy'])
  })

  it('the view never carries account groups, fact revisions, proofs or windows', () => {
    const d = run([conservativeCandidate('a')], (i) => (i.summaryViewerRefs = [ACTOR]))
    const text = JSON.stringify(projectSelection(d, ACTOR))
    for (const secret of ['group-a', 'rev-a', 'bound-1', 'proof-rev-1', 'obs-1'])
      assert.ok(!text.includes(secret), secret)
  })

  it('an internal decision does not serialize by accident', () => {
    assert.throws(() => JSON.stringify(run([candidate('a')])), /selection_decision_not_serializable/)
  })
})

describe('no effects', () => {
  it('the kernel imports nothing and reads no clock, randomness, process, network or storage', () => {
    const source = readFileSync(new URL('./allocation-selection.ts', import.meta.url), 'utf8')
    for (const banned of [
      /^import /m,
      /\bDate\b/,
      /Math\.random/,
      /\bprocess\b/,
      /\bfetch\b/,
      /\brequire\(/,
      /\bsetTimeout\b/,
    ]) {
      assert.doesNotMatch(source, banned)
    }
  })
})
