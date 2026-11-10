import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { OperationReadiness, QuotaObservation, Readiness, Resource } from './resource.ts'
import { controlGroups, controlsNote, hostShort, hostState, readinessRows, readinessSummary } from './status-words.ts'

const resource = (controls: Partial<Resource['controls']> = {}): Resource => ({
  id: 'davide-codex',
  owner: { id: 'davide', name: 'Davide' },
  tool: 'codex',
  entitlementId: 'ent-davide-openai',
  host: { state: 'online', observedAt: '2026-10-02T11:58:00Z' },
  sessions: [],
  controls: { stop: 'supported', hold: 'supported', steer: 'unqualified', permissions: 'unqualified', ...controls },
  reservePercent: null,
})

describe('a resource’s host, as observed', () => {
  it('says the host’s state, never that its tool is ready', () => {
    assert.equal(hostState({ state: 'online', observedAt: null }), 'Host online')
    assert.equal(hostState({ state: 'offline', observedAt: null }), 'Host offline')
    assert.equal(hostState({ state: 'unknown', observedAt: null }), 'Host state unknown')
    assert.equal(hostShort({ state: 'unknown', observedAt: null }), 'Host unknown') // a tile's room
    assert.equal(hostShort({ state: 'online', observedAt: null }), 'Host online')
  })
})

describe('a resource’s readiness, fact by fact', () => {
  const now = new Date('2026-10-02T12:00:00Z')
  it('keeps the host, the tool’s sign-in and its operations apart, and says what isn’t reported as such', () => {
    assert.deepEqual(readinessRows(resource(), now), [
      { label: 'Host', value: 'Online · observed 2 min ago', observed: true },
      { label: 'Codex sign-in', value: 'Not reported', observed: false },
      { label: 'Operations for this connection', value: 'Not reported', observed: false },
    ])
  })

  it('never makes an online host a signed-in tool, nor an unseen host a known one', () => {
    const offline = { ...resource(), host: { state: 'offline' as const, observedAt: '2026-10-01T10:00:00Z' } }
    assert.equal(readinessRows(offline, now)[0]?.value, 'Offline · observed 1 day ago')
    const unseen = { ...resource(), host: { state: 'unknown' as const, observedAt: null } }
    assert.deepEqual(readinessRows(unseen, now)[0], { label: 'Host', value: 'Never observed', observed: false })
    for (const r of [resource(), offline, unseen]) {
      assert.deepEqual(
        readinessRows(r, now)
          .slice(1)
          .map((row) => row.value),
        ['Not reported', 'Not reported'],
      )
    }
  })
})

describe('a resource’s controls', () => {
  it('are grouped by their route’s support, Stop first, and an empty group isn’t listed', () => {
    assert.deepEqual(
      controlGroups(resource().controls).map((g) => [g.label, g.names]),
      [
        ['Verified for this connection', ['stop', 'hold']],
        ['Not verified for this connection yet', ['steer', 'permissions']],
      ],
    )
    const none = resource({ stop: 'unqualified', hold: 'unqualified', permissions: 'unsupported' })
    assert.deepEqual(
      controlGroups(none.controls).map((g) => g.label),
      ['Not verified for this connection yet', 'Not supported by this connection'],
    )
  })

  it('tell the owner that one sent is a request until its runtime confirms it, and where it is sent from', () => {
    assert.equal(
      controlsNote({ resource: resource(), mine: true, offered: true }),
      'Each is a request until its runtime confirms it. Sent from a session’s Act.',
    )
    // No way to send in this view (a read-only preview): nothing is promised from here.
    assert.equal(
      controlsNote({ resource: resource(), mine: true, offered: false }),
      'Each is a request until its runtime confirms it. None can be sent from here now.',
    )
  })

  it('tell a teammate that only the owner sends them, and say nothing to send when none is qualified', () => {
    assert.equal(
      controlsNote({ resource: resource(), mine: false, offered: false }),
      'Each is a request until its runtime confirms it. Only Davide can send them.',
    )
    const unqualified = resource({ stop: 'unqualified', hold: 'unqualified' })
    assert.equal(controlsNote({ resource: unqualified, mine: false, offered: false }), '')
    assert.equal(controlsNote({ resource: unqualified, mine: true, offered: true }), 'None can be sent from here yet.')
  })

  it('never let a qualified answer to requests read as answered from here', () => {
    const answering = resource({ stop: 'unqualified', hold: 'unqualified', permissions: 'supported' })
    assert.equal(
      controlsNote({ resource: answering, mine: true, offered: true }),
      'None can be sent from here yet. Permission requests are answered in Codex.',
    )
  })
})

const fresh = (over: Partial<Readiness> = {}): Readiness => ({
  signIn: 'signed_in',
  operations: [
    { id: 'repository_analysis', name: 'Repository analysis', state: 'qualified' },
    { id: 'code_changes', name: 'Code changes', state: 'unqualified' },
  ],
  observedAt: '2026-10-02T11:59:00Z',
  validUntil: '2026-10-02T12:14:00Z',
  source: 'simulated fixture',
  ...over,
})
const withReadiness = (
  readiness: Readiness | null,
  host: Resource['host'] = { state: 'online', observedAt: '2026-10-02T11:58:00Z' },
) => ({
  ...resource(),
  host,
  readiness,
})
const full = (percent: number): QuotaObservation => ({
  observation_id: 'o',
  owner_id: 'davide',
  entitlement_id: 'ent-davide-openai',
  resource_ids: ['davide-codex'],
  provider: 'openai',
  source_channel: 'fixture',
  observed_at: '2026-10-02T11:59:00Z',
  valid_until: null,
  coverage: 'complete_for_route',
  windows: [
    {
      window_id: 'five_hour',
      unit: 'percent_used',
      value: percent,
      resets_at: '2026-10-02T13:00:00Z',
      scope: 'account',
      applicability: 'known',
      state: 'observed',
    },
  ],
  missing_capabilities: [],
})

describe('a resource’s readiness summary, from the facts given (r3 repair, P1)', () => {
  const now = new Date('2026-10-02T12:00:00Z')
  it('is ready only with every fact current, for the operations its profile verifies, the rest said not verified', () => {
    assert.deepEqual(readinessSummary(withReadiness(fresh()), undefined, now), {
      tone: 'ready',
      line: 'Ready for repository analysis',
      more: 'Code changes: not verified for this connection yet',
    })
  })

  it('never makes a host online alone ready: no projection, unknown sign-in, none verified', () => {
    assert.equal(readinessSummary(withReadiness(null), undefined, now).line, 'Sign-in and readiness not reported')
    assert.equal(
      readinessSummary(withReadiness(fresh({ signIn: 'unknown' })), undefined, now).line,
      'Codex sign-in not reported',
    )
    const none = fresh({ operations: [{ id: 'x', name: 'Repository analysis', state: 'unknown' }] })
    assert.deepEqual(readinessSummary(withReadiness(none), undefined, now), {
      tone: 'unknown',
      line: 'Operations not reported', // F06 (r3 repair 2): unknown is not reported, not 'not verified yet'
      more: null,
    })
  })

  it('says what it waits on first: its host, a sign-in, a used-up window; a stale reading is only last observed', () => {
    const offline = withReadiness(fresh(), { state: 'offline', observedAt: '2026-10-01T10:00:00Z' })
    assert.equal(readinessSummary(offline, undefined, now).line, 'Waits for its host to reconnect')
    assert.equal(
      readinessSummary(withReadiness(fresh(), { state: 'unknown', observedAt: null }), undefined, now).line,
      'Sign-in and readiness not reported', // never repeating the host's own line
    )
    assert.deepEqual(readinessSummary(withReadiness(fresh({ signIn: 'signed_out' })), undefined, now), {
      tone: 'wait',
      line: 'Codex sign-in needed',
      more: 'Its owner signs in on its host.',
    })
    const waiting = readinessSummary(withReadiness(fresh()), full(100), now)
    assert.equal(waiting.line, 'Waiting for capacity: 5-hour window')
    assert.equal(readinessSummary(withReadiness(fresh()), full(99), now).tone, 'ready')
    const stale = fresh({ observedAt: '2026-10-02T11:20:00Z', validUntil: '2026-10-02T11:35:00Z' })
    assert.deepEqual(readinessSummary(withReadiness(stale), undefined, now), {
      tone: 'unknown',
      line: 'Readiness last observed 40 min ago',
      more: null,
    })
  })

  it('lists each fact apart with its provenance; a reading past its time is said so, none of it current', () => {
    assert.deepEqual(readinessRows(withReadiness(fresh()), now), [
      { label: 'Host', value: 'Online · observed 2 min ago', observed: true },
      { label: 'Codex sign-in', value: 'Signed in', observed: true },
      { label: 'Repository analysis', value: 'Verified for this connection', observed: true },
      { label: 'Code changes', value: 'Not verified for this connection yet', observed: true },
      { label: 'Observed', value: '1 min ago · simulated fixture', observed: true },
    ])
    const stale = fresh({ validUntil: '2026-10-02T11:59:30Z' })
    const rows = readinessRows(withReadiness(stale), now)
    assert.equal(rows.at(-1)?.value, '1 min ago · simulated fixture · past its time')
    assert.deepEqual(
      rows.slice(1).map((r) => r.observed),
      [false, false, false, false],
    )
  })
})

describe('a readiness summary keeps every operation state, and a bad or future time is never current (r3 repair 2)', () => {
  const now = new Date('2026-10-02T12:00:00Z')
  const ops = (...states: OperationReadiness['state'][]) =>
    fresh({
      operations: states.map((state, i) => ({
        id: `op-${i}`,
        name: ['Repository analysis', 'Code changes', 'Reviews'][i] ?? 'Other',
        state,
      })),
    })
  const summary = (r: Readiness) => readinessSummary(withReadiness(r), undefined, now)

  it('F06 · says an unsupported operation unsupported and an unknown one not reported, beside one verified', () => {
    assert.equal(summary(ops('qualified', 'unsupported')).more, 'Code changes: not supported by this connection')
    assert.equal(summary(ops('qualified', 'unknown')).more, 'Code changes: not reported')
    assert.equal(summary(ops('qualified', 'unqualified')).more, 'Code changes: not verified for this connection yet')
    assert.equal(
      summary(ops('qualified', 'unqualified', 'unsupported')).more,
      'Code changes: not verified for this connection yet; Reviews: not supported by this connection',
    )
  })

  it('F06 · with none verified, names what holds them: not verified yet, not supported, or not reported', () => {
    assert.deepEqual(summary(ops('unsupported')), {
      tone: 'unknown',
      line: 'No operation supported by this connection',
      more: null,
    })
    assert.equal(summary(ops('unknown', 'unknown')).line, 'Operations not reported')
    assert.equal(summary(ops('unqualified')).line, 'No operation verified for this connection yet')
    assert.deepEqual(summary(ops('unqualified', 'unsupported')), {
      tone: 'unknown',
      line: 'No operation verified for this connection yet',
      more: 'Code changes: not supported by this connection',
    })
  })

  it('F07 · a time that is not an instant, in the future, or a limit before its observation is never current', () => {
    const cases: [Partial<Readiness>, string, string][] = [
      [
        { observedAt: 'not-an-instant' },
        'Readiness not current: its observation time is not valid',
        'Observation time not valid',
      ],
      [
        { observedAt: 'not-an-instant', validUntil: null },
        'Readiness not current: its observation time is not valid',
        'Observation time not valid',
      ],
      [
        { observedAt: '2026-10-03T12:00:00Z', validUntil: '2026-10-03T12:15:00Z' },
        'Readiness not current: observed after now',
        'Observed in the future',
      ],
      [
        { observedAt: '2026-10-02T11:59:00Z', validUntil: '2026-10-02T11:50:00Z' },
        'Readiness not current: its time limit is before its observation',
        '1 min ago',
      ],
      [{ validUntil: 'soon' }, 'Readiness not current: its time limit is not valid', '1 min ago'],
    ]
    for (const [over, line, observed] of cases) {
      const r = fresh(over)
      assert.equal(summary(r).line, line, JSON.stringify(over))
      assert.equal(summary(r).tone, 'unknown')
      const rows = readinessRows(withReadiness(r), now)
      assert.equal(
        rows.slice(1).some((row) => row.observed),
        false,
        JSON.stringify(over),
      )
      assert.match(rows.at(-1)?.value ?? '', new RegExp(`^${observed}`))
      assert.doesNotMatch(rows.map((row) => row.value).join(' '), /NaN|just now/)
    }
  })

  it('F07 · keeps a valid observation current with no stated limit, and an expired one only last observed', () => {
    assert.equal(summary(fresh({ validUntil: null })).tone, 'ready')
    assert.equal(
      summary(fresh({ observedAt: '2026-10-02T11:20:00Z', validUntil: '2026-10-02T11:35:00Z' })).line,
      'Readiness last observed 40 min ago',
    )
  })
})

type Window = QuotaObservation['windows'][number]
const percentAt = (value: number, over: Partial<Window> = {}): Window => ({
  window_id: 'five_hour',
  unit: 'percent_used',
  value,
  resets_at: '2026-10-02T14:00:00Z',
  scope: 'account',
  applicability: 'known',
  state: 'observed',
  ...over,
})
const credits = (value: number | null, over: Partial<Window> = {}) =>
  percentAt(0, {
    window_id: 'daily_requests',
    unit: 'credits_remaining',
    value,
    resets_at: '2026-10-02T21:00:00Z',
    ...over,
  })
const tokens = (value: number | null, over: Partial<Window> = {}) =>
  percentAt(0, { window_id: 'daily_tokens', unit: 'tokens_remaining', value, resets_at: null, ...over })
const reading = (windows: Window[], over: Partial<QuotaObservation> = {}): QuotaObservation => ({
  ...full(0),
  windows,
  ...over,
})

describe('a used-up count waits like a used-up window, whatever window is beside it (r3 repair 3, UI1164-F08)', () => {
  const now = new Date('2026-10-02T12:00:00Z')
  const summary = (windows: Window[], over: Partial<QuotaObservation> = {}) =>
    readinessSummary(withReadiness(fresh()), reading(windows, over), now)
  const READY = {
    tone: 'ready',
    line: 'Ready for repository analysis',
    more: 'Code changes: not verified for this connection yet',
  }
  const CREDITS_OUT = { tone: 'wait', line: 'Waiting for capacity: Daily requests window', more: 'resets in 9 h' }
  const TOKENS_OUT = { tone: 'wait', line: 'Waiting for capacity: daily tokens window', more: null }

  it('waits for credits or tokens at zero, alone, with the window’s own name and reset', () => {
    assert.deepEqual(summary([credits(0)]), CREDITS_OUT)
    assert.deepEqual(summary([tokens(0)]), TOKENS_OUT) // no reset reported: none said
    assert.deepEqual(summary([credits(-5)]), CREDITS_OUT) // past zero is used up too
  })

  it('never lets a percentage with room or a count left hide a used-up count, in either order', () => {
    assert.deepEqual(summary([percentAt(25), credits(0)]), CREDITS_OUT)
    assert.deepEqual(summary([credits(0), percentAt(25)]), CREDITS_OUT)
    assert.deepEqual(summary([percentAt(25), tokens(0)]), TOKENS_OUT)
    assert.deepEqual(summary([tokens(0), percentAt(25)]), TOKENS_OUT)
    assert.deepEqual(summary([tokens(5000), credits(0)]), CREDITS_OUT)
    assert.deepEqual(summary([credits(0), tokens(5000)]), CREDITS_OUT)
    assert.deepEqual(summary([credits(820), tokens(0)]), TOKENS_OUT)
    assert.deepEqual(summary([tokens(0), credits(820)]), TOKENS_OUT)
  })

  it('keeps a used-up percentage waiting, even beside a window that runs out first at its pace', () => {
    assert.deepEqual(summary([percentAt(100)]), {
      tone: 'wait',
      line: 'Waiting for capacity: 5-hour window',
      more: 'resets in 2 h',
    })
    const spend = percentAt(120, { window_id: 'spend_limit', unit: 'spend_percent_used', scope: 'spend' })
    assert.equal(summary([percentAt(40), spend]).line, 'Waiting for capacity: Spend limit window')
    // Claude Code's 5-hour window, 81 % used halfway through, runs out first at its pace; its 7-day one is used up.
    const paced = { source_channel: 'claude-code-statusline', observed_at: '2026-10-02T12:00:00Z' }
    const fiveHour = percentAt(81, { resets_at: '2026-10-02T14:30:00Z' })
    const sevenDay = percentAt(100, { window_id: 'seven_day', resets_at: '2026-10-05T12:00:00Z' })
    assert.equal(summary([fiveHour, sevenDay], paced).line, 'Waiting for capacity: 7-day window')
  })

  it('names the used-up window that holds it longest: no reset known first, else the latest reset', () => {
    assert.deepEqual(summary([percentAt(100), credits(0)]), CREDITS_OUT) // credits reset after the 5-hour window
    assert.deepEqual(summary([credits(0), tokens(0)]), TOKENS_OUT) // the tokens report no reset
    assert.equal(summary([credits(0), percentAt(100, { resets_at: '2026-10-03T12:00:00Z' })]).more, 'resets in 24 h')
  })

  it('makes nothing used up that the reading doesn’t say is: positive, partial, unknown, expired, due or unseen', () => {
    assert.deepEqual(summary([credits(820)]), READY)
    assert.deepEqual(summary([tokens(1)]), READY)
    assert.deepEqual(summary([percentAt(25), credits(820)]), READY)
    assert.deepEqual(summary([credits(0, { applicability: 'partial' })]), READY)
    assert.deepEqual(summary([tokens(0, { applicability: 'unknown' })]), READY)
    assert.deepEqual(summary([credits(null, { state: 'unknown' })]), READY) // unknown is never zero
    assert.deepEqual(summary([credits(0, { state: 'unknown' })]), READY)
    assert.deepEqual(summary([credits(0, { state: 'refresh_pending' })]), READY)
    assert.deepEqual(summary([credits(0, { resets_at: '2026-10-02T11:00:00Z' })]), READY) // its reset already due
    assert.deepEqual(summary([credits(0)], { valid_until: '2026-10-02T11:30:00Z' }), READY) // the reading expired
    assert.deepEqual(summary([credits(0)], { valid_until: '2026-10-02T12:30:00Z' }), CREDITS_OUT) // still holds
    assert.deepEqual(summary([credits(0)], { coverage: 'unavailable' }), READY)
    assert.deepEqual(summary([credits(0)], { coverage: 'partial' }), CREDITS_OUT) // the window itself applies
    assert.deepEqual(summary([]), READY)
  })

  it('says its host, a stale readiness and a sign-in first, as before', () => {
    const out = reading([credits(0)])
    const offline = withReadiness(fresh(), { state: 'offline', observedAt: '2026-10-01T10:00:00Z' })
    assert.equal(readinessSummary(offline, out, now).line, 'Waits for its host to reconnect')
    assert.equal(readinessSummary(withReadiness(fresh({ signIn: 'expired' })), out, now).line, 'Codex sign-in expired')
    const stale = fresh({ observedAt: '2026-10-02T11:20:00Z', validUntil: '2026-10-02T11:35:00Z' })
    assert.equal(readinessSummary(withReadiness(stale), out, now).line, 'Readiness last observed 40 min ago')
    assert.equal(readinessSummary(withReadiness(null), out, now).line, 'Sign-in and readiness not reported')
  })
})
