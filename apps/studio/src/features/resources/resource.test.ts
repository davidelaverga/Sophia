import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  actionLine,
  ago,
  capacity,
  capacityLine,
  summary,
  matches,
  inFilter,
  activity,
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

  it('heads with an observed balance as reported, and keeps unknown apart from no window (M03-RF-0024)', () => {
    const tokens = window({ window_id: 'daily', unit: 'tokens_remaining', value: 100000, resets_at: null })
    const credits = window({ window_id: 'credits', unit: 'credits_remaining', value: 42, resets_at: null })
    assert.equal(capacityLine(observation([tokens]), now), 'daily: 100000 tokens left')
    assert.equal(capacityLine(observation([credits]), now), 'credits: 42 credits left')
    assert.equal(
      capacityLine(observation([window({ value: 40 }), tokens]), now),
      '5-hour window: 40% used, resets in 2 h',
    )
    assert.equal(capacityLine(observation([window({ value: null, state: 'unknown' })]), now), 'Capacity unknown')
    assert.equal(capacityLine(observation([]), now), 'No window observed')
  })

  it('lets no balance head while another window known to apply is unresolved', () => {
    const tokens = window({ window_id: 'daily', unit: 'tokens_remaining', value: 100000, resets_at: null })
    const unknown = window({ value: null, state: 'unknown' })
    assert.equal(capacityLine(observation([tokens, unknown]), now), 'Capacity unknown')
    assert.equal(capacityLine(observation([tokens, window({ resets_at: at(-5) })]), now), 'Refresh pending')
  })

  it('lets a window that may not apply shape nothing, not even a pending reset', () => {
    const due = window({ resets_at: at(-5), applicability: 'unknown' })
    assert.equal(capacityLine(observation([due]), now), 'Capacity unknown: no window is known to apply here')
    const partial = window({ value: 30, applicability: 'partial' })
    assert.equal(
      capacityLine(observation([partial, window({ value: null, state: 'unknown' })]), now),
      'Capacity unknown',
    )
  })

  it('treats a reading past its valid_until as expired, with its age, never as current capacity', () => {
    const old = { ...observation([window({ value: 40 })]), valid_until: at(-10) }
    assert.equal(capacityLine(old, now), 'Capacity unknown: the last reading expired 10 min ago')
    assert.equal(windowView(window({ value: 40 }), now, true).value, 'Expired')
    assert.equal(windowView(window({ value: 40 }), now, true).percent, null)
    assert.equal(capacityLine({ ...old, valid_until: at(30) }, now), '5-hour window: 40% used, resets in 2 h')
  })
})

const r = (state: Resource['host']['state']) => ({ host: { state, observedAt: null } }) as Resource

describe('the panel’s summary and meter', () => {
  it('counts hosts online and requests waiting, and never capacity', () => {
    const open = { state: 'open' } as RequiredAction
    assert.equal(summary([r('online'), r('online'), r('unknown')], [open]), '2 hosts online · 1 request waiting')
    assert.equal(summary([r('offline')], []), '0 hosts online · nothing waiting')
  })

  it('gives a meter only for a percentage known to apply', () => {
    assert.equal(capacity(observation([window({ value: 40 })]), now).limiting?.percent, 40)
    const tokens = window({ window_id: 'daily', unit: 'tokens_remaining', value: 100000, resets_at: null })
    assert.equal(capacity(observation([tokens]), now).limiting, null)
    assert.equal(capacity(observation([window({ value: 88, applicability: 'unknown' })]), now).limiting, null)
    assert.equal(capacity(undefined, now).limiting, null)
    assert.equal(capacity(observation([tokens]), now).known, true, 'a balance is observed, not unknown')
    assert.equal(capacity(undefined, now).known, false)
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

describe('finding a resource among many', () => {
  const claude = {
    id: 'davide-claude',
    owner: { id: 'davide', name: 'Davide' },
    tool: 'claude-code',
    host: { state: 'online', observedAt: null },
    sessions: [
      {
        id: 'a',
        role: 'worker',
        model: 'claude-opus-5-5',
        effort: null,
        assignment: { workId: 'w', title: 'Implement the PDF retry', state: 'waiting' },
      },
      { id: 'b', role: 'reviewer', model: null, effort: null, assignment: null },
    ],
  } as unknown as Resource
  const open = { resourceId: 'davide-claude', state: 'open' } as RequiredAction

  it('finds by tool, maker, owner, model or work, every word, whatever the case or accents', () => {
    for (const q of ['', 'claude', 'ANTHROPIC', 'davide pdf', 'opus', 'reviewer', 'Davidé'])
      assert.equal(matches(claude, q), true, q)
    for (const q of ['codex', 'luis', 'davide codex']) assert.equal(matches(claude, q), false, q)
  })

  it('filters by what waits, what is online and whose it is', () => {
    assert.equal(inFilter('all', claude, [], 'luis'), true)
    assert.equal(inFilter('waiting', claude, [open], 'luis'), true)
    assert.equal(inFilter('waiting', claude, [{ ...open, state: 'resolved' }], 'luis'), false)
    assert.equal(inFilter('online', claude, [], 'luis'), true)
    assert.equal(inFilter('mine', claude, [], 'luis'), false)
    assert.equal(inFilter('mine', claude, [], 'davide'), true)
  })

  it('says what a resource does in one line', () => {
    assert.equal(activity(claude), 'Implement the PDF retry · 2 sessions')
    assert.equal(activity({ ...claude, sessions: claude.sessions.slice(0, 1) }), 'Implement the PDF retry')
    const idle = { ...claude, sessions: claude.sessions.map((s) => ({ ...s, assignment: null })) } as Resource
    assert.equal(activity(idle), '2 sessions, none assigned')
  })
})
