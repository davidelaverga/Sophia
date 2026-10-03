import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { QuotaObservation, Resource } from '../../resources/resource.ts'
import { accountOf } from './account.ts'
import { planRows, type PlanItem, type WorkPlan } from './plan.ts'

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
const item = (over: Partial<PlanItem> = {}): PlanItem => ({
  id: 'build',
  purpose: 'Build it',
  parent_id: null,
  blocked_by: [],
  assignee_kind: 'assignment',
  assignee_id: 'assignment-build',
  activation: { kind: 'immediate', producer_work_id: null },
  ...over,
})
const plan = (items: PlanItem[]): WorkPlan => ({
  plan_id: 'p',
  revision: 1,
  mission_revision: 1,
  state: 'accepted',
  items,
  goal_id: 'g',
  next_checkpoint: null,
  assumptions: [],
  decisions: [],
})
const rowOf = (i: PlanItem) => {
  const row = planRows(plan([i]), [claude], {})[0]
  if (!row) throw new Error('no row')
  return row
}

describe('a task’s account', () => {
  it('says what it is short of while its session is at it', () => {
    const account = accountOf(rowOf(item()), { observations: readings, resources: [claude], now })
    assert.equal(account.short, 'runs out in ~35 min')
    assert.equal(account.tile, 'out in ~35 min')
  })

  it('says nothing once it is finished, or without readings', () => {
    const finished = rowOf(item({ outcome: { state: 'finished', at: at(-5) } }))
    assert.equal(finished.doer.resource?.id, 'davide-claude') // its session still holds it
    assert.deepEqual(accountOf(finished, { observations: readings, resources: [claude], now }), {
      short: null,
      tile: null,
      room: null,
    })
    assert.equal(accountOf(rowOf(item()), { resources: [claude], now }).short, null)
    const checked = rowOf(item({ outcome: { state: 'checked', at: at(-5) } }))
    assert.equal(accountOf(checked, { observations: readings, resources: [claude], now }).short, null)
  })
})
