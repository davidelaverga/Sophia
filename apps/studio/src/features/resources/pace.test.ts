import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ordered, placed } from './order.ts'
import { pace } from './pace.ts'
import type { QuotaWindow, RequiredAction, Resource } from './resource.ts'

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

/** A reading from Claude Code's status line, made `minutes` from now. */
const read = (minutes: number, source = 'claude-code-statusline') => ({
  observed_at: at(minutes),
  source_channel: source,
})

describe('a window’s pace', () => {
  it('says how much of the window had passed when it was read', () => {
    // A 5-hour window resetting in 2 h, read now: 3 of its 5 hours have passed.
    assert.equal(pace(window({}), read(0), now)?.passed, 0.6)
    // Read 30 min ago, 2.5 of its hours had passed then.
    assert.equal(pace(window({}), read(-30), now)?.passed, 0.5)
  })

  it('says how long before the reset the account runs out at this pace, only when it does', () => {
    // 92 % used with 260 of 300 min passed: 100 % about 23 min later, 17 min before the reset.
    assert.equal(
      pace(window({ value: 92, resets_at: at(40) }), read(0), now)?.early,
      'At this pace, used up ~17 min before it resets',
    )
    assert.equal(pace(window({ value: 40 }), read(0), now)?.early, null) // 40 % at 60 %: on pace
    assert.equal(pace(window({ value: 100, resets_at: at(40) }), read(0), now)?.early, null) // already full: its colour says
    // Too early in the window to project from: the first 5 %.
    assert.equal(pace(window({ value: 10, resets_at: at(295) }), read(0), now)?.early, null)
  })

  it('is made up for no window: an unknown length, a balance, a window that may not apply, or a reset due', () => {
    assert.equal(pace(window({ window_id: 'spend_limit' }), read(0), now), null)
    // Codex reports each window's own duration, which the observation can't carry yet: its five_hour is not assumed.
    assert.equal(pace(window({}), read(0, 'codex-app-server'), now), null)
    assert.equal(pace(window({ unit: 'credits_remaining', window_id: 'daily_requests' }), read(0), now), null)
    assert.equal(pace(window({ applicability: 'unknown' }), read(0), now), null)
    assert.equal(pace(window({ resets_at: at(-5) }), read(0), now), null)
    assert.equal(pace(window({ resets_at: null }), read(0), now), null)
    assert.equal(pace(window({ value: null, state: 'unknown' }), read(0), now), null)
  })

  // r3 repair 5 (UI85C4-F09): a time that isn't an instant gives no pace, never NaN; every valid pace stays as it was.
  it('is made up from no time that isn’t one: a reset or a reading time that isn’t an instant gives none', () => {
    const MALFORMED = ['not-an-instant', '', 'NaN', '2026-13-45T99:99:99Z']
    for (const bad of MALFORMED) {
      assert.equal(pace(window({ resets_at: bad }), read(0), now), null, `reset ${JSON.stringify(bad)}`)
      assert.equal(pace(window({ value: 92, resets_at: bad }), read(0), now), null, `reset ${JSON.stringify(bad)}`)
      const reading = { observed_at: bad, source_channel: 'claude-code-statusline' }
      assert.equal(pace(window({}), reading, now), null, `reading time ${JSON.stringify(bad)}`)
      assert.equal(pace(window({ value: 92, resets_at: at(40) }), reading, now), null, `reading ${JSON.stringify(bad)}`)
      // The siblings that never had a pace still have none.
      assert.equal(pace(window({ resets_at: bad }), read(0, 'codex-app-server'), now), null)
      assert.equal(pace(window({ resets_at: bad, unit: 'credits_remaining' }), read(0), now), null)
      assert.equal(pace(window({ resets_at: bad, applicability: 'partial' }), read(0), now), null)
    }
    assert.equal(pace(window({}), read(0), new Date(Number.NaN)), null) // a clock that isn't one
    assert.equal(pace(window({ value: Number.NaN }), read(0), now), null)
    // Valid, null and due are as before: a pace, none, none.
    assert.equal(pace(window({}), read(0), now)?.passed, 0.6)
    assert.equal(pace(window({ value: 92, resets_at: at(40) }), read(0), now)?.runsOut, '~23 min')
    assert.equal(pace(window({ resets_at: null }), read(0), now), null)
    assert.equal(pace(window({ resets_at: at(-5) }), read(0), now), null)
  })
})

const resource = (id: string, owner: string, tool: Resource['tool'], host: Resource['host']['state']) =>
  ({
    id,
    owner: { id: owner, name: owner },
    tool,
    entitlementId: `ent-${id}`,
    host: { state: host, observedAt: null },
    sessions: [],
    controls: {},
    reservePercent: null,
  }) as unknown as Resource
const ids = (rs: Resource[]) => rs.map((r) => r.id)

describe('the tiles’ order', () => {
  const list = [
    resource('off', 'Ana', 'grok', 'offline'),
    resource('ben', 'Ben', 'codex', 'online'),
    resource('cy', 'Cy', 'cursor', 'online'),
    resource('unk', 'Ada', 'claude-code', 'unknown'),
    resource('wait', 'Dee', 'gemini-cli', 'offline'),
  ]
  const actions = [{ resourceId: 'wait', state: 'open' } as RequiredAction]

  it('by attention: what waits, then online, unknown and offline, each by owner; never by how used', () => {
    // Accounts' percentages come from different providers and windows: none is weighed against another (LFE-06.2).
    assert.deepEqual(ids(ordered(list, 'attention', actions)), ['wait', 'ben', 'cy', 'unk', 'off'])
  })

  it('by owner, or by tool, as a list is read', () => {
    assert.deepEqual(ids(ordered(list, 'owner', actions)), ['unk', 'off', 'ben', 'cy', 'wait'])
    assert.deepEqual(ids(ordered(list, 'tool', actions)), ['unk', 'ben', 'cy', 'wait', 'off'])
  })
})

describe('the viewer’s own order', () => {
  it('takes the place of the tile it was dropped on: before it moving back, after it moving on', () => {
    assert.deepEqual(placed(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c'])
    assert.deepEqual(placed(['a', 'b', 'c', 'd'], 'a', 'c'), ['b', 'c', 'a', 'd'])
    assert.deepEqual(placed(['a', 'b'], 'a', 'z'), ['a', 'b']) // nowhere to go
  })

  it('orders by hand; what wasn’t placed yet comes after, by attention', () => {
    const list = [
      resource('off', 'Ana', 'grok', 'offline'),
      resource('ben', 'Ben', 'codex', 'online'),
      resource('cy', 'Cy', 'cursor', 'online'),
      resource('unk', 'Ada', 'claude-code', 'unknown'),
    ]
    assert.deepEqual(ids(ordered(list, 'custom', [], ['off', 'cy'])), ['off', 'cy', 'ben', 'unk'])
  })
})
