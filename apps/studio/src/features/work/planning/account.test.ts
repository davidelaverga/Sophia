import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { QuotaObservation, Resource } from '../../resources/resource.ts'
import { accountOf } from './account.ts'
import { assignment, goal, item, plan, view } from './board-samples.ts'
import type { ItemView } from './board-view.ts'
import { boardOf } from './plan.ts'

const now = new Date('2026-10-02T12:00:00Z')
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString()

/** Davide's Claude Code, its worker on `build`, its account at 81 % halfway through its 5-hour window. */
const claude: Resource = {
  id: 'davide-claude',
  owner: { id: 'davide', name: 'Davide' },
  tool: 'claude-code',
  entitlementId: 'ent-claude',
  host: { state: 'online', observedAt: at(-1) },
  sessions: [
    {
      id: 's',
      role: 'worker',
      model: null,
      effort: null,
      assignment: { workId: 'build', title: 'x', state: 'running' },
    },
  ],
  controls: { steer: 'unqualified', hold: 'unqualified', stop: 'unqualified', permissions: 'unqualified' },
  reservePercent: null,
}
const readings: QuotaObservation[] = [
  {
    observation_id: 'o',
    owner_id: 'davide',
    entitlement_id: 'ent-claude',
    resource_ids: ['davide-claude'],
    provider: 'anthropic',
    source_channel: 'claude-code-statusline',
    observed_at: at(0),
    valid_until: null,
    coverage: 'complete_for_route',
    windows: [
      {
        window_id: 'five_hour',
        unit: 'percent_used',
        value: 81,
        resets_at: at(150),
        scope: 'account',
        applicability: 'known',
        state: 'observed',
      },
    ],
    missing_capabilities: [],
  },
]
/** Its row, observed as `over` says, run by Davide's Claude Code at its current generation. */
const rowOf = (over: Partial<ItemView> = {}) => {
  const running = view('build', {
    lifecycle: 'running',
    assignment: assignment('build', {
      native_session_id: 's',
      executor: {
        kind: 'owner_native',
        display_name: 'Davide’s Claude Code',
        role: 'worker',
        owner_id: 'davide',
        resource_id: 'davide-claude',
      },
    }),
    ...over,
  })
  const row = boardOf(goal(plan([item('build', { purpose: 'Build it' })]), [running]), {
    resources: [claude],
    people: {},
    viewerId: 'davide',
  })?.rows[0]
  if (!row) throw new Error('no row')
  return row
}

describe('a task’s account', () => {
  it('says what it is short of while its session is at it', () => {
    const account = accountOf(rowOf(), { observations: readings, resources: [claude], now })
    assert.equal(account.short, 'runs out in ~35 min')
    assert.equal(account.tile, 'out in ~35 min')
  })

  it('says nothing once it is ready for review, complete or closed, or without readings', () => {
    const ready = rowOf({ lifecycle: 'ready_for_review' })
    assert.equal(ready.doer.resource?.id, 'davide-claude') // its assignment still names it
    assert.deepEqual(accountOf(ready, { observations: readings, resources: [claude], now }), {
      short: null,
      tile: null,
      room: null,
    })
    assert.equal(accountOf(rowOf(), { resources: [claude], now }).short, null)
    const satisfied = { policy_ref: 'p', status: 'satisfied' as const, evidence_refs: ['e'] }
    assert.equal(
      accountOf(rowOf({ lifecycle: 'complete', completion: satisfied }), {
        observations: readings,
        resources: [claude],
        now,
      }).short,
      null,
    )
    assert.equal(
      accountOf(rowOf({ lifecycle: 'stopped' }), { observations: readings, resources: [claude], now }).short,
      null,
    )
  })
})
