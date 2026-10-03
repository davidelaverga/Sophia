import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { asSeen, glance, whileAway, type Seen } from './away.ts'
import type { QuotaObservation, RequiredAction, Resource } from './resource.ts'

const now = new Date('2026-10-02T12:00:00Z')
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString()

type WorkState = 'recorded' | 'queued' | 'running' | 'waiting'
const resource = (id: string, owner: 'davide' | 'luis', over: Partial<Resource> = {}): Resource => ({
  id,
  owner: { id: owner, name: owner === 'davide' ? 'Davide' : 'Luis' },
  tool: 'claude-code',
  entitlementId: `ent-${id}`,
  host: { state: 'online', observedAt: at(-1) },
  sessions: [],
  controls: { steer: 'unqualified', hold: 'unqualified', stop: 'unqualified', permissions: 'unqualified' },
  reservePercent: null,
  ...over,
})
const session = (id: string, state: WorkState, workId = 'w', title = 'Build it') => ({
  id,
  role: 'worker',
  model: null,
  effort: null,
  assignment: { workId, title, state },
})
const working = (state: WorkState, workId = 'w', title = 'Build it') => [session('s', state, workId, title)]
const request = (resourceId: string): RequiredAction => ({
  id: `a-${resourceId}`,
  workId: 'w',
  resourceId,
  sessionId: 's',
  ownerId: 'davide',
  operation: 'Run a command',
  deadline: null,
  state: 'open',
  openTarget: null,
})
const readingAt = (entitlement: string, value: number, validUntil: string | null = null): QuotaObservation => ({
  observation_id: 'o',
  owner_id: 'davide',
  entitlement_id: entitlement,
  resource_ids: [],
  provider: 'anthropic',
  source_channel: 'claude-code-statusline',
  observed_at: at(0),
  valid_until: validUntil,
  coverage: 'complete_for_route',
  windows: [
    {
      window_id: 'five_hour',
      unit: 'percent_used',
      value,
      resets_at: at(150),
      scope: 'account',
      applicability: 'known',
      state: 'observed',
    },
  ],
  missing_capabilities: [],
})

interface Moment {
  was?: RequiredAction[]
  is?: RequiredAction[]
  /** The readings then, and now. */
  earlier?: QuotaObservation[]
  read?: QuotaObservation[]
}

/** Resources as they were, then as they are; the line between, as Luis reads it. */
function away(before: Resource[], after: Resource[], o: Moment = {}) {
  const readings = o.read ?? [readingAt('ent-claude', 40)]
  const seen: Seen = glance(before, o.was ?? [], o.earlier ?? readings, now)
  const current = glance(after, o.is ?? [], readings, now)
  return whileAway({ resources: after, observations: readings, now: current, seen, at: now, viewerId: 'luis' })
}
const marked = (line: ReturnType<typeof away>) => [...line.ids].toSorted()

describe('while the viewer was away', () => {
  it('says nothing on a first visit, or when nothing moved', () => {
    const r = [resource('claude', 'davide', { sessions: working('running') })]
    const first = glance(r, [], [], now)
    const line = whileAway({ resources: r, observations: [], now: first, seen: null, at: now, viewerId: 'luis' })
    assert.deepEqual([line.phrases, line.more, line.ids.size], [[], 0, 0])
    assert.deepEqual(away(r, r).phrases, [])
  })

  it('says what moved, the most pressing first, and marks only what it says', () => {
    const before = [
      resource('claude', 'davide', { sessions: working('running') }),
      resource('codex', 'davide', { tool: 'codex', sessions: working('queued', 'r', 'Review the pane') }),
      resource('grok', 'davide', { tool: 'grok' }),
    ]
    const after = [
      // Waiting on its owner, with a request: said on top while it waits, not here; its tile isn't marked.
      resource('claude', 'davide', { sessions: working('waiting') }),
      resource('codex', 'davide', { tool: 'codex', sessions: working('running', 'r', 'Review the pane') }),
      resource('grok', 'davide', { tool: 'grok', host: { state: 'offline', observedAt: at(-30) } }),
    ]
    const line = away(before, after, { is: [request('claude')] })
    assert.deepEqual(line.phrases, ['Davide’s Grok went offline', 'Davide’s Codex started Review the pane'])
    assert.deepEqual(marked(line), ['codex', 'grok'])
  })

  it('says running short first, then offline, then the rest, counted past three', () => {
    const before = [
      resource('claude', 'davide', { entitlementId: 'ent-claude' }),
      resource('grok', 'davide', { tool: 'grok' }),
      resource('mine', 'luis', { host: { state: 'offline', observedAt: at(-60) } }),
      resource('codex', 'davide', { tool: 'codex', sessions: working('recorded', 'r', 'Review the pane') }),
    ]
    const after = [
      resource('claude', 'davide', { entitlementId: 'ent-claude' }),
      resource('grok', 'davide', { tool: 'grok', host: { state: 'offline', observedAt: at(-1) } }),
      resource('mine', 'luis'),
      resource('codex', 'davide', { tool: 'codex', sessions: working('queued', 'r', 'Review the pane') }),
    ]
    const line = away(before, after, { earlier: [readingAt('ent-claude', 40)], read: [readingAt('ent-claude', 81)] })
    assert.deepEqual(line.phrases, [
      'Davide’s Claude Code runs out in ~35 min',
      'Davide’s Grok went offline',
      'Davide’s Codex queued Review the pane',
    ])
    assert.equal(line.more, 1) // and Luis's own back online
  })

  it('says the viewer’s own as theirs, new work started, work let go, and new resources', () => {
    const before = [
      resource('mine', 'luis', { sessions: working('running') }),
      resource('claude', 'davide', { sessions: working('queued', 'w', 'Build it') }),
    ]
    const after = [
      resource('mine', 'luis'),
      resource('claude', 'davide', { sessions: working('running', 'x', 'Ship it') }),
      resource('fresh', 'davide', { tool: 'codex' }),
    ]
    const line = away(before, after)
    assert.deepEqual(line.phrases, [
      'Davide’s Claude Code started Ship it',
      'Your Claude Code is no longer on Build it',
      'Davide’s Codex is new here',
    ])
    assert.deepEqual(marked(line), ['claude', 'fresh', 'mine'])
  })

  it('says an answered request, and a host back online, in their words', () => {
    const r = [resource('claude', 'davide')]
    assert.deepEqual(away(r, r, { was: [request('claude')] }).phrases, [
      'A request on Davide’s Claude Code was answered',
    ])
    const was = [resource('claude', 'davide', { host: { state: 'offline', observedAt: at(-60) } })]
    assert.deepEqual(away(was, r).phrases, ['Davide’s Claude Code is back online'])
    // Back from waiting on its owner, it resumes.
    const waited = [resource('claude', 'davide', { sessions: working('waiting') })]
    const resumed = [resource('claude', 'davide', { sessions: working('running') })]
    assert.deepEqual(away(waited, resumed).phrases, ['Davide’s Claude Code is back on Build it'])
  })

  it('marks nothing it doesn’t say: a request, a host gone unknown, a title, the order, a reading expired', () => {
    const was = [resource('c', 'davide', { sessions: [session('a', 'running'), session('b', 'queued', 'v', 'Check')] })]
    const unknown = resource('c', 'davide', {
      sessions: [session('a', 'running'), session('b', 'queued', 'v', 'Check')],
      host: { state: 'unknown', observedAt: null },
    })
    const reordered = resource('c', 'davide', {
      sessions: [session('b', 'queued', 'v', 'Check it'), session('a', 'running')],
    })
    const quiet = [away(was, was, { is: [request('c')] }), away(was, [unknown]), away(was, [reordered])]
    for (const line of quiet) assert.deepEqual([line.phrases, line.ids.size], [[], 0])
    // An account no longer short (its reading expired, or its window reset) says nothing either.
    const r = [resource('claude', 'davide', { entitlementId: 'ent-claude' })]
    const expired = away(r, r, { earlier: [readingAt('ent-claude', 81)], read: [readingAt('ent-claude', 81, at(-1))] })
    assert.deepEqual([expired.phrases, expired.ids.size], [[], 0])
  })
})

describe('a stored glance', () => {
  it('reads back whole, or not at all', () => {
    const seen = glance([resource('c', 'davide', { sessions: working('running') })], [], [], now)
    assert.deepEqual(asSeen(JSON.parse(JSON.stringify(seen))), seen)
    assert.equal(asSeen({ c: { host: 'online', waiting: 0, short: false } }), null) // no work
    assert.equal(asSeen({ c: { host: 'away', waiting: 0, short: false, work: {} } }), null)
    assert.equal(asSeen('broken'), null)
    assert.equal(asSeen(null), null)
  })
})
