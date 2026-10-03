import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pace } from './pace.ts'
import {
  capacity,
  liveSession,
  reportsLive,
  tileCapacity,
  type QuotaObservation,
  type QuotaWindow,
  type Resource,
} from './resource.ts'
import { roomElsewhere, short, shortTileWords, shortWords } from './room.ts'

const now = new Date('2026-10-02T12:00:00Z')
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString()
const five = (value: number, resetsIn: number): QuotaWindow => ({
  window_id: 'five_hour',
  unit: 'percent_used',
  value,
  resets_at: at(resetsIn),
  scope: 'account',
  applicability: 'known',
  state: 'observed',
})
const reading = (entitlement: string, windows: QuotaWindow[]): QuotaObservation => ({
  observation_id: `o-${entitlement}`,
  owner_id: 'o',
  entitlement_id: entitlement,
  resource_ids: [],
  provider: 'p',
  source_channel: 'claude-code-statusline',
  observed_at: at(0),
  valid_until: null,
  coverage: 'complete_for_route',
  windows,
  missing_capabilities: [],
})
const resource = (id: string, owner: string, over: Partial<Resource> = {}): Resource => ({
  id,
  owner: { id: owner, name: owner === 'davide' ? 'Davide' : 'Luis' },
  tool: 'codex',
  entitlementId: `ent-${id}`,
  host: { state: 'online', observedAt: at(-1) },
  sessions: [],
  controls: { steer: 'unqualified', hold: 'unqualified', stop: 'supported', permissions: 'unqualified' },
  reservePercent: null,
  ...over,
})

describe('when an account runs out', () => {
  it('says how long from now, beside how long before its reset', () => {
    // 81 % used halfway through a 5-hour window: 100 % in ~35 min, ~2 h before the reset.
    const p = pace(five(81, 150), { observed_at: at(0), source_channel: 'claude-code-statusline' }, now)
    assert.equal(p?.runsOut, '~35 min')
    assert.equal(p?.early, 'At this pace, used up ~2 h before it resets')
    // On pace, nothing is said.
    assert.equal(
      pace(five(40, 150), { observed_at: at(0), source_channel: 'claude-code-statusline' }, now)?.runsOut,
      null,
    )
  })

  it('says "now" once a reading says it should have run out', () => {
    // Read 40 min ago at 81 % with 150 min to go: it ran out ~5 min ago.
    const p = pace(five(81, 110), { observed_at: at(-40), source_channel: 'claude-code-statusline' }, now)
    assert.equal(p?.runsOut, 'now')
  })
})

describe('the window that limits first', () => {
  it('is the one that runs out first at its pace, even when another is fuller', () => {
    // 7-day at 70 % with a day left: on pace. 5-hour at 60 % a tenth of the way in: out in ~20 min.
    const week = { ...five(70, 1440), window_id: 'seven_day' }
    const held = capacity(reading('e', [week, five(60, 270)]), now)
    assert.equal(held.limiting?.id, 'five_hour')
    assert.equal(held.line, '5-hour window: 60% used, resets in 5 h')
    assert.deepEqual(tileCapacity(held), { head: '5-hour · 60%', next: 'out in ~20 min', out: true })
    assert.equal(short(held), true)
    // Neither runs out: the fullest heads it, as before.
    assert.equal(capacity(reading('e', [week, five(10, 270)]), now).limiting?.id, 'seven_day')
  })
})

describe('a tile’s capacity', () => {
  it('is the window and how full, then its reset, or when it runs out first', () => {
    assert.deepEqual(tileCapacity(capacity(reading('e', [five(63, 55)]), now)), {
      head: '5-hour · 63%',
      next: 'resets in 55 min',
      out: false,
    })
    assert.deepEqual(tileCapacity(capacity(reading('e', [five(81, 150)]), now)), {
      head: '5-hour · 81%',
      next: 'out in ~35 min',
      out: true,
    })
  })

  it('is a balance’s count and its reset, and otherwise said as it is', () => {
    const credits = { ...five(820, 540), window_id: 'daily_requests', unit: 'credits_remaining' as const }
    assert.deepEqual(tileCapacity(capacity(reading('e', [credits]), now)), {
      head: '820 credits left',
      next: 'resets in 9 h',
      out: false,
    })
    assert.equal(tileCapacity(capacity(undefined, now)), null)
  })
})

describe('a tile’s live line', () => {
  it('speaks for the first session at work with a report, never for an idle one', () => {
    const said = { said: 'Reading ReportPane.tsx', observedAt: at(0) }
    const idle = { id: 'a', role: 'r', model: null, effort: null, assignment: null, activity: said }
    const working = {
      id: 'b',
      role: 'r',
      model: null,
      effort: null,
      assignment: { workId: 'w', title: 'T', state: 'running' as const },
      activity: said,
    }
    assert.equal(liveSession(resource('x', 'davide', { sessions: [idle, working] }))?.id, 'b')
    assert.equal(liveSession(resource('x', 'davide', { sessions: [idle] })), null)
  })

  it('is live while its host is online and its report younger than two minutes', () => {
    const report = (seconds: number) => ({
      said: 'Reading',
      observedAt: new Date(now.getTime() - seconds * 1000).toISOString(),
    })
    const s = (seconds: number) => ({
      id: 's',
      role: 'r',
      model: null,
      effort: null,
      assignment: { workId: 'w', title: 'T', state: 'running' as const },
      activity: report(seconds),
    })
    const online = resource('x', 'davide')
    assert.equal(reportsLive(online, s(30), now), true)
    assert.equal(reportsLive(online, s(130), now), false) // older than its ring
    assert.equal(reportsLive({ ...online, host: { state: 'offline', observedAt: null } }, s(5), now), false)
    assert.equal(reportsLive(online, null, now), false)
  })
})

describe('room elsewhere', () => {
  const claude = resource('davide-claude', 'davide', { tool: 'claude-code' })
  const codex = resource('davide-codex', 'davide')
  const luis = resource('luis-codex', 'luis')
  const tight = reading('ent-davide-claude', [five(81, 150)])
  const roomy = reading('ent-davide-codex', [five(42, 120)])
  const readings = [tight, roomy, reading('ent-luis-codex', [five(10, 120)])]

  it('is short when it runs out first, or is past the full line', () => {
    assert.equal(short(capacity(tight, now)), true)
    assert.equal(short(capacity(roomy, now)), false)
    assert.equal(short(capacity(reading('e', [five(92, 10)]), now)), true)
  })

  it('names the owner’s own first, then the emptiest', () => {
    const room = roomElsewhere(claude, [claude, codex, luis], readings, now, 'luis')
    assert.equal(room?.resource.id, 'davide-codex')
    assert.equal(room?.line, 'Davide’s Codex has room: 5-hour at 42%')
    // Without the owner's own, the emptiest; the viewer's own is "Your".
    assert.equal(
      roomElsewhere(claude, [claude, luis], readings, now, 'luis')?.line,
      'Your Codex has room: 5-hour at 10%',
    )
  })

  it('says nothing while the account isn’t short', () => {
    const fine = [reading('ent-davide-claude', [five(40, 150)]), roomy]
    assert.equal(roomElsewhere(claude, [claude, codex], fine, now, 'luis'), null)
  })

  it('never names one offline, on the same account, near full, short itself, or unknown', () => {
    const away = { ...codex, host: { state: 'offline' as const, observedAt: at(-60) } }
    const same = { ...codex, entitlementId: claude.entitlementId }
    const full = [tight, reading('ent-davide-codex', [five(80, 120)])]
    const runs = [tight, reading('ent-davide-codex', [five(70, 150)])]
    assert.equal(roomElsewhere(claude, [claude, away], readings, now, 'luis'), null)
    assert.equal(roomElsewhere(claude, [claude, same], readings, now, 'luis'), null)
    assert.equal(roomElsewhere(claude, [claude, codex], full, now, 'luis'), null)
    assert.equal(roomElsewhere(claude, [claude, codex], runs, now, 'luis'), null)
    assert.equal(roomElsewhere(claude, [claude, codex], [tight], now, 'luis'), null)
  })
})

describe('a short account in a few words', () => {
  it('says when it runs out, or how full it is past the full line, and nothing otherwise', () => {
    const runs = capacity(reading('e', [five(81, 150)]), now)
    assert.equal(shortWords(runs), 'runs out in ~35 min')
    assert.equal(shortTileWords(runs), 'out in ~35 min')
    // 92 % with 10 min to go: past the full line, but not out before its reset.
    const full = capacity(reading('e', [five(92, 10)]), now)
    assert.equal(shortWords(full), 'is at 92% of its 5-hour window')
    assert.equal(shortTileWords(full), 'at 92%')
    const fine = capacity(reading('e', [five(40, 150)]), now)
    assert.equal(shortWords(fine), null)
    assert.equal(shortTileWords(fine), null)
  })

  it('says "now" once a reading says it should have run out', () => {
    const gone = capacity({ ...reading('e', [five(81, 110)]), observed_at: at(-40) }, now)
    assert.equal(shortWords(gone), 'runs out now')
    assert.equal(shortTileWords(gone), 'out now')
  })
})
