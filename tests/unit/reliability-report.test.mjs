import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  distinctJobs,
  familyOf,
  flakeRates,
  isRoomGate,
  jobMinutes,
  jobTable,
  mainHealth,
  outcomeOf,
  parseRunSummary,
  percentile,
  rate,
  roomDurations,
  shardOf,
  specOf,
  summarizeM1,
  summarizeM2,
  summarizeM6,
  summarizeM7,
  timeoutMinutes,
} from '../../scripts/lib/reliability.mjs'

// The arithmetic behind scripts/reliability-report.mjs (docs/plans/reliability-measure.md): percentiles, rates, how a
// CI job's end is read, flakes, the room job's minutes and margin, main's red hours, and the fixture metrics.

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual}`)
const at = (hours) => new Date(Date.UTC(2026, 9, 19, 0, 0, 0) + hours * 3_600_000).toISOString()

test('percentile interpolates between the closest ranks, and says nothing of no values', () => {
  assert.equal(percentile([], 50), null)
  assert.equal(percentile([5], 95), 5)
  assert.equal(percentile([1, 2, 3, 4], 50), 2.5)
  near(percentile([10, 20, 30, 40, 50], 90), 46, 'p90 of five')
  near(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 9.55, 'p95 of ten')
  assert.equal(percentile([10, 20, 30], 0), 10)
  assert.equal(percentile([10, 20, 30], 100), 30)
  const values = [3, 1, 2]
  assert.equal(percentile(values, 50), 2)
  assert.deepEqual(values, [3, 1, 2], 'the input is not sorted in place')
})

test('a rate of nothing is no rate, not zero', () => {
  assert.equal(rate(0, 0), null)
  assert.equal(rate(1, 4), 0.25)
  assert.equal(rate(0, 3), 0)
})

test('a shard is read from both namings, and the room is one family whatever its parts', () => {
  assert.deepEqual(shardOf('The room in Chromium, on its fixture page (1/2)'), {
    base: 'The room in Chromium, on its fixture page',
    shard: '1/2',
  })
  assert.deepEqual(shardOf('The room in Chromium, part 3 of 3'), { base: 'The room in Chromium', shard: '3/3' })
  assert.deepEqual(shardOf('runtime-unit'), { base: 'runtime-unit', shard: null })
  assert.equal(familyOf('The room in Chromium, on its fixture page (2/2)'), 'The room in Chromium')
  assert.equal(familyOf('The room in Chromium, part 1 of 3'), 'The room in Chromium')
  assert.equal(familyOf('The room in Chromium, on its fixture page'), 'The room in Chromium')
  assert.equal(familyOf('SQL, persistence and API on PostgreSQL 16'), 'SQL, persistence and API on PostgreSQL 16')
})

test('a cancelled job that ran to its limit is a timeout; one cut short is superseded', () => {
  const ran = (startedAt, completedAt, conclusion = 'cancelled') => ({
    status: 'completed',
    conclusion,
    startedAt,
    completedAt,
  })
  const cut = ran('2026-10-19T12:21:13Z', '2026-10-19T13:51:30Z')
  near(jobMinutes(cut), 90.28333333333333, 'minutes')
  assert.equal(outcomeOf(cut, 90), 'timeout')
  assert.equal(outcomeOf(ran('2026-10-19T14:30:21Z', '2026-10-19T14:33:38Z'), 90), 'superseded')
  assert.equal(outcomeOf(ran('2026-10-19T12:00:00Z', '2026-10-19T13:30:00Z'), 90), 'timeout', 'exactly the limit')
  assert.equal(outcomeOf(ran('2026-10-19T12:00:00Z', '2026-10-19T13:29:00Z'), 90), 'superseded')
  assert.equal(outcomeOf(ran('2026-10-19T12:00:00Z', '2026-10-19T12:08:00Z', 'success'), 30), 'success')
  assert.equal(outcomeOf(ran('2026-10-19T12:00:00Z', '2026-10-19T12:08:00Z', 'failure'), 30), 'failure')
  assert.equal(outcomeOf(ran('2026-10-19T12:00:00Z', '2026-10-19T12:08:00Z', 'timed_out'), 30), 'timeout')
  assert.equal(outcomeOf(ran('2026-10-19T12:00:00Z', '2026-10-19T12:08:00Z', 'skipped'), 30), 'skipped')
  assert.equal(outcomeOf({ status: 'in_progress', conclusion: '', startedAt: '2026-10-19T12:00:00Z' }, 30), 'pending')
})

test('a room job that only gathers its parts is a gate, not a run of the room', () => {
  const step = (name) => ({ name, conclusion: 'success' })
  const gate = {
    name: 'The room in Chromium, on its fixture page',
    steps: [step('Run echo "The room’s three parts: $PARTS"')],
  }
  const whole = {
    name: 'The room in Chromium, on its fixture page',
    steps: [step('Run pnpm --filter @sophia/studio test:browser')],
  }
  const part = {
    name: 'The room in Chromium, on its fixture page (1/2)',
    steps: [step('Run pnpm --filter @sophia/studio exec playwright test --shard=1/2')],
  }
  const install = {
    name: 'The room in Chromium, part 1 of 3',
    steps: [step('Run pnpm --filter @sophia/studio exec playwright install --with-deps chromium')],
  }
  assert.equal(isRoomGate(gate), true)
  assert.equal(isRoomGate(whole), false)
  assert.equal(isRoomGate(part), false)
  assert.equal(isRoomGate(install), true, 'installing the browser is not running the suite')
  assert.equal(isRoomGate({ name: 'runtime-unit', steps: [step('Run pnpm check')] }), false, 'only the room has gates')
})

test('a rerun of failed jobs carries the others over: each job is counted once', () => {
  const carried = { name: 'runtime-unit', startedAt: '2026-10-19T12:21:12Z', completedAt: '2026-10-19T12:28:02Z' }
  const jobs = distinctJobs([
    { ...carried, databaseId: 1, conclusion: 'success' },
    { name: 'room', startedAt: '2026-10-19T12:21:13Z', completedAt: '2026-10-19T13:51:30Z', databaseId: 2 },
    { ...carried, databaseId: 3, conclusion: 'success' },
    { name: 'room', startedAt: '2026-10-19T14:30:21Z', completedAt: '2026-10-19T14:33:38Z', databaseId: 4 },
  ])
  assert.deepEqual(
    jobs.map((j) => j.databaseId),
    [1, 2, 4],
  )
})

test('a flake is a commit whose same job both failed and passed; timeouts are not flakes', () => {
  const entries = [
    { sha: 'a', name: 'The room in Chromium, on its fixture page (1/2)', outcome: 'failure' },
    { sha: 'a', name: 'The room in Chromium, on its fixture page (1/2)', outcome: 'success' },
    { sha: 'a', name: 'The room in Chromium, on its fixture page (2/2)', outcome: 'success' },
    { sha: 'b', name: 'The room in Chromium, on its fixture page (1/2)', outcome: 'success' },
    { sha: 'c', name: 'The room in Chromium, on its fixture page (2/2)', outcome: 'failure' },
    { sha: 'd', name: 'The room in Chromium, on its fixture page', outcome: 'timeout' },
    { sha: 'd', name: 'The room in Chromium, on its fixture page', outcome: 'success' },
    { sha: 'e', name: 'The room in Chromium, on its fixture page', outcome: 'superseded' },
    { sha: 'd', name: 'runtime-unit', outcome: 'success' },
  ]
  const rates = flakeRates(entries)
  assert.deepEqual(rates['The room in Chromium'], { decided: 5, flaky: 1, rate: 0.2, shas: ['a'] })
  assert.deepEqual(rates['runtime-unit'], { decided: 1, flaky: 0, rate: 0, shas: [] })
})

test('the job table counts each end, and the failure share is of the decided ones', () => {
  const table = jobTable([
    { name: 'room (1/2)', outcome: 'success', minutes: 30 },
    { name: 'room (2/2)', outcome: 'failure', minutes: 40 },
    { name: 'room (1/2)', outcome: 'timeout', minutes: 90.3 },
    { name: 'room (1/2)', outcome: 'superseded', minutes: 3 },
    { name: 'room (2/2)', outcome: 'success', minutes: 34 },
    { name: 'room (2/2)', outcome: 'success', minutes: 32 },
    { name: 'room (2/2)', outcome: 'pending', minutes: null },
  ])
  assert.deepEqual(table.room, {
    total: 6,
    success: 3,
    failure: 1,
    timeout: 1,
    superseded: 1,
    failureShare: 0.25,
    redShare: 0.4,
    successMinutes: { n: 3, p50: 32, p90: 33.6, max: 34 },
  })
})

test('the Playwright run summary gives the failed and flaky tests, and a spec is its file and line', () => {
  const message = [
    '  1 failed',
    '    [desktop] › e2e/voice-meters.spec.ts:78:1 › people · a re-render mid-speech restarts nothing',
    '  2 flaky',
    '    [desktop] › e2e/next-up.spec.ts:29:1 › next up · one',
    '    [phone] › e2e/personal.spec.ts:382:1 › personal · contrast @phone',
    '  3 skipped',
    '  2010 passed (50.1m)',
  ].join('\n')
  assert.deepEqual(parseRunSummary(message), {
    failed: 1,
    flaky: 2,
    passed: 2010,
    failedTests: ['[desktop] › e2e/voice-meters.spec.ts:78:1 › people · a re-render mid-speech restarts nothing'],
    flakyTests: [
      '[desktop] › e2e/next-up.spec.ts:29:1 › next up · one',
      '[phone] › e2e/personal.spec.ts:382:1 › personal · contrast @phone',
    ],
  })
  assert.equal(specOf('[desktop] › e2e/voice-meters.spec.ts:78:1 › people · x'), 'e2e/voice-meters.spec.ts:78')
  assert.deepEqual(parseRunSummary('Process completed with exit code 1.'), {
    failed: 0,
    flaky: 0,
    passed: 0,
    failedTests: [],
    flakyTests: [],
  })
})

test('the room job minutes are read per day and per part, with the margin of p90 to the limit', () => {
  const job = (startedAt, minutes, name = 'The room in Chromium, on its fixture page', outcome = 'success') => ({
    name,
    startedAt,
    minutes,
    outcome,
  })
  const rows = roomDurations(
    [
      job('2026-10-18T01:00:00Z', 70),
      job('2026-10-18T05:00:00Z', 80),
      job('2026-10-18T09:00:00Z', 90.3, undefined, 'timeout'),
      job('2026-10-18T10:00:00Z', 3, undefined, 'superseded'),
      job('2026-10-19T01:00:00Z', 30, 'The room in Chromium, on its fixture page (1/2)'),
      job('2026-10-19T02:00:00Z', 40, 'The room in Chromium, on its fixture page (1/2)'),
      job('2026-10-19T02:00:00Z', 35, 'The room in Chromium, on its fixture page (2/2)'),
      job('2026-10-19T03:00:00Z', 50, 'The room in Chromium, on its fixture page (2/2)', 'failure'),
    ],
    90,
  )
  assert.deepEqual(rows, [
    {
      day: '2026-10-18',
      part: 'whole',
      n: 2,
      p50: 75,
      p90: 79,
      max: 80,
      timeouts: 1,
      margin: 11,
      marginShare: 11 / 90,
    },
    { day: '2026-10-19', part: '1/2', n: 2, p50: 35, p90: 39, max: 40, timeouts: 0, margin: 51, marginShare: 51 / 90 },
    { day: '2026-10-19', part: '2/2', n: 1, p50: 35, p90: 35, max: 35, timeouts: 0, margin: 55, marginShare: 55 / 90 },
  ])
})

test('the room job limit is read from the workflow, shards and all; no limit is GitHub’s 360', () => {
  const sharded = [
    'jobs:',
    '  runtime-unit:',
    '    timeout-minutes: 30',
    '  studio-browser:',
    '    name: The room in Chromium, on its fixture page (${{ matrix.shard }}/2)',
    '    strategy:',
    '      matrix:',
    '        shard: [1, 2]',
    '    timeout-minutes: 90',
    '    steps:',
    '      - run: echo',
    '        timeout-minutes: 6',
  ].join('\n')
  assert.equal(timeoutMinutes(sharded, 'The room in Chromium'), 90)
  assert.equal(timeoutMinutes(sharded, 'runtime-unit'), 30)
  const bare = ['jobs:', '  studio-browser:', '    name: The room in Chromium, part 1 of 3', '    steps: []'].join('\n')
  assert.equal(timeoutMinutes(bare, 'The room in Chromium'), 360)
  assert.equal(timeoutMinutes(bare, 'No such job'), null)
})

test('main is red from a red commit’s end until a newer commit ends green; reruns and late ends count', () => {
  const run = (sha, attempt, conclusion, createdAt, completedAt) => ({
    sha,
    attempt,
    conclusion,
    createdAt,
    completedAt,
  })
  const health = mainHealth(
    [
      run('s1', 1, 'success', at(0), at(1)),
      run('s2', 1, 'failure', at(1.1), at(2)),
      run('s3', 1, 'cancelled', at(2.1), at(11 / 3)),
      run('s4', 1, 'success', at(3.8), at(5)),
      run('s5', 1, 'failure', at(5.1), at(6)),
      run('s6', 1, null, at(6.5), null),
    ],
    at(7.5),
  )
  assert.equal(health.commits, 6)
  assert.equal(health.green, 2)
  assert.equal(health.red, 3)
  assert.equal(health.pending, 1)
  near(health.greenShare, 0.4, 'green share')
  near(health.redHours, 4.5, 'red hours')
  assert.deepEqual(
    health.spans.map((s) => ({ from: s.from, to: s.to, open: s.open })),
    [
      { from: at(2), to: at(5), open: false },
      { from: at(6), to: at(7.5), open: true },
    ],
  )
  assert.equal(health.redSince, at(6))

  // A rerun that passes ends the red; a newer commit already green is not turned red by an older one ending later.
  const later = mainHealth(
    [
      run('a', 1, 'success', at(0), at(1)),
      run('b', 1, 'failure', at(1.5), at(2)),
      run('b', 2, 'success', at(1.5), at(2.5)),
      run('c', 1, 'failure', at(3), at(5)),
      run('d', 1, 'success', at(4), at(4.5)),
    ],
    at(6),
  )
  near(later.redHours, 0.5, 'red hours with a rerun')
  assert.equal(later.green, 3)
  assert.equal(later.red, 1)
  assert.equal(later.redSince, null)
})

test('M1: press to a definitive answer, its overhead past the held reply, and the share within 5 s', () => {
  const summary = summarizeM1([
    { kind: 'room-message', delayMs: 0, totalMs: 40, definitive: true },
    { kind: 'room-message', delayMs: 1000, totalMs: 1060, definitive: true },
    { kind: 'room-message', delayMs: 2500, totalMs: 2580, definitive: true },
    { kind: 'conversation-message', delayMs: 6000, totalMs: 6100, definitive: true },
    { kind: 'conversation-message', delayMs: 0, totalMs: null, definitive: false },
  ])
  assert.equal(summary.n, 5)
  assert.equal(summary.definitive, 4)
  assert.equal(summary.withinFiveSeconds, 0.6)
  near(summary.total.p50, 1820, 'total p50')
  near(summary.total.p95, 5572, 'total p95')
  near(summary.overhead.p50, 70, 'overhead p50')
  near(summary.overhead.p95, 97, 'overhead p95')
})

test('M2: unknown outcomes resolved by sending again under the same key, and any written twice', () => {
  const summary = summarizeM2([
    { kind: 'room-message', resolved: true, writes: 1, resendMs: 30 },
    { kind: 'conversation-message', resolved: true, writes: 1, resendMs: 50 },
    { kind: 'conversation-start', resolved: false, writes: 2, resendMs: null },
  ])
  assert.deepEqual(summary, { n: 3, resolved: 2, share: 2 / 3, duplicates: 1, resend: { p50: 40, p95: 49 } })
})

test('M6: per view, failed reads that show versus fall silent; a view with no failed read is not counted', () => {
  const summary = summarizeM6([
    { view: 'Goals · owner picker', failedReads: 2, visible: false },
    { view: 'Conversations', failedReads: 1, visible: true },
    { view: 'Knowledge', failedReads: 0, visible: null },
  ])
  assert.deepEqual(summary, {
    views: 3,
    reached: 2,
    visible: 1,
    silent: 1,
    notReached: ['Knowledge'],
    silentViews: ['Goals · owner picker'],
  })
})

test('M7: of the reads answered 502/503 in HTML, the share that recover without a press, and when', () => {
  const summary = summarizeM7([
    { read: 'conversations', failures: 1, recovered: true, ms: 1100 },
    { read: 'conversations', failures: 2, recovered: true, ms: 3200 },
    { read: 'tasks', failures: 1, recovered: false, ms: null },
    { read: 'tasks', failures: 2, recovered: false, ms: null },
  ])
  assert.deepEqual(summary, { n: 4, recovered: 2, share: 0.5, time: { p50: 2150, p95: 3095 } })
})
