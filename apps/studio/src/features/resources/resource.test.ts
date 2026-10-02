import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  actionLine,
  ago,
  capacityLine,
  expiry,
  windowView,
  type QuotaObservation,
  type QuotaWindow,
  type RequiredAction,
  type Resource,
} from './resource.ts'

const now = new Date('2026-10-02T12:00:00Z')
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString()
const window = (over: Partial<QuotaWindow>): QuotaWindow => ({
  window_id: 'five_hour',
  unit: 'percent_used',
  value: 40,
  resets_at: at(120),
  scope: 'account',
  applicability: 'known',
  state: 'observed',
  ...over,
})
const observation = (windows: QuotaWindow[], coverage: QuotaObservation['coverage'] = 'complete_for_route') => ({
  observation_id: 'o',
  owner_id: 'davide',
  entitlement_id: 'e',
  resource_ids: ['davide-claude'],
  provider: 'anthropic',
  source_channel: 'claude-code-statusline',
  observed_at: at(-3),
  valid_until: null,
  coverage,
  windows,
  missing_capabilities: [],
})

describe('a resource’s capacity', () => {
  it('says how long ago something was observed, and never invents a time', () => {
    assert.equal(ago(at(-0.2), now), 'just now')
    assert.equal(ago(at(-4), now), '4 min ago')
    assert.equal(ago(at(-180), now), '3 h ago')
    assert.equal(ago(at(-3 * 24 * 60), now), '3 d ago')
    assert.equal(ago(null, now), 'never observed')
  })

  it('keeps an unknown window unknown, and a reset already due pending, never fresh', () => {
    assert.deepEqual(windowView(window({}), now), {
      name: '5-hour',
      state: 'observed',
      value: '40% used',
      reset: 'resets in 2 h',
      percent: 40,
      applies: 'known',
    })
    const unknown = windowView(window({ value: null, state: 'unknown' }), now)
    assert.equal(unknown.value, 'Unknown')
    assert.equal(unknown.percent, null, 'unknown is not 0 % or 100 %')
    const due = windowView(window({ window_id: 'seven_day', value: 90, resets_at: at(-60) }), now)
    assert.equal(due.state, 'refresh_pending')
    assert.equal(due.value, 'Refresh pending')
    assert.equal(due.reset, 'reset was due 1 h ago')
  })

  it('names the most used observed window, or says the capacity is unknown', () => {
    const two = observation([
      window({ value: 40 }),
      window({ window_id: 'seven_day', value: 72, resets_at: at(4 * 1440) }),
    ])
    assert.equal(capacityLine(two, now), '7-day window: 72% used, resets in 4 d')
    assert.equal(capacityLine(undefined, now), 'Capacity unknown')
    assert.equal(capacityLine(observation([], 'unavailable'), now), 'Capacity unknown')
    assert.equal(capacityLine(observation([window({ resets_at: at(-5) })]), now), 'Refresh pending')
  })

  it('lets only a window known to apply limit the resource, and says when one may not apply', () => {
    const uncertain = window({ window_id: 'seven_day_opus', value: 88, scope: 'model', applicability: 'unknown' })
    assert.equal(windowView(uncertain, now).value, '88% used · may not apply here')
    assert.equal(
      capacityLine(observation([window({ value: 40 }), uncertain]), now),
      '5-hour window: 40% used, resets in 2 h',
    )
    assert.equal(capacityLine(observation([uncertain]), now), 'Capacity unknown: no window is known to apply here')
  })

  it('treats a reading past its valid_until as expired, with its age, never as current capacity', () => {
    const old = { ...observation([window({ value: 40 })]), valid_until: at(-10) }
    assert.equal(capacityLine(old, now), 'Capacity unknown: the last reading expired 10 min ago')
    assert.equal(windowView(window({ value: 40 }), now, true).value, 'Expired')
    assert.equal(windowView(window({ value: 40 }), now, true).percent, null)
    assert.equal(capacityLine({ ...old, valid_until: at(30) }, now), '5-hour window: 40% used, resets in 2 h')
  })
})

describe('a required action', () => {
  const resource = { tool: 'claude-code', owner: { id: 'davide', name: 'Davide' } } as Resource
  const action: RequiredAction = {
    id: 'a',
    workId: 'w',
    resourceId: 'davide-claude',
    sessionId: 's-worker',
    ownerId: 'davide',
    operation: 'Run a shell command',
    deadline: null,
    state: 'open',
    openTarget: null,
  }

  it('tells only its owner how to answer it, in the native tool', () => {
    assert.equal(actionLine(action, 'davide', resource), 'Answer it in Claude Code, session s-worker.')
    assert.equal(actionLine(action, 'luis', resource), 'Only Davide can answer this, in Claude Code.')
    assert.equal(
      actionLine({ ...action, state: 'unknown' }, 'davide', resource),
      'Checked in Claude Code before anything else is asked.',
    )
    assert.equal(actionLine({ ...action, state: 'resolved' }, 'davide', resource), '')
  })

  it('says when it stops waiting, or that it already has', () => {
    assert.equal(expiry(at(40), now), 'expires in 40 min')
    assert.equal(expiry(at(-5), now), 'expired 5 min ago')
  })
})
