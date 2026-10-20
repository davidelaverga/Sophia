import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
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
  rankFailedTests,
  rate,
  roomDurations,
  shardOf,
  specOf,
  summarizeFeed,
  summarizeM1,
  summarizeM2,
  summarizeM2Reload,
  summarizeM5,
  summarizeM6,
  summarizeM7,
  summarizeM8,
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

test('a job cancelled before a runner took it is superseded, however long it waited', () => {
  const queued = {
    status: 'completed',
    conclusion: 'cancelled',
    startedAt: '2026-10-12T01:11:46Z',
    completedAt: '2026-10-12T02:35:41Z',
    steps: [],
  }
  assert.equal(outcomeOf(queued, 15), 'superseded')
  const ran = { ...queued, steps: [{ name: 'Set up job', conclusion: 'success' }] }
  assert.equal(outcomeOf(ran, 15), 'timeout')
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

test('failed tests are ranked by their full title, recent failures first, with when each last failed', () => {
  // One test( line can stand for many pages: the same file and line, different titles, are different tests.
  const work = '[desktop] › e2e/press-answers.spec.ts:128:3 › press answers › on the work space'
  const room = '[desktop] › e2e/press-answers.spec.ts:128:3 › press answers › on the room'
  const feed = '[desktop] › e2e/feed.spec.ts:40:1 › feed · reconnects'
  const week = at(-24 * 7)
  const ranked = rankFailedTests(
    [
      { test: work, at: week },
      { test: work, at: at(-24 * 6) },
      { test: work, at: week },
      { test: room, at: at(-10) },
      { test: feed, at: at(-60) },
      { test: feed, at: at(-30) },
    ],
    at(0),
  )
  assert.deepEqual(ranked, [
    { test: feed, spec: 'e2e/feed.spec.ts:40', failures: 2, recent: 1, lastFailed: at(-30) },
    { test: room, spec: 'e2e/press-answers.spec.ts:128', failures: 1, recent: 1, lastFailed: at(-10) },
    { test: work, spec: 'e2e/press-answers.spec.ts:128', failures: 3, recent: 0, lastFailed: at(-24 * 6) },
  ])
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

test('main already red when the window opens counts from its start; a run begun before it and ended inside counts', () => {
  const run = (sha, attempt, conclusion, createdAt, completedAt) => ({
    sha,
    attempt,
    conclusion,
    createdAt,
    completedAt,
  })
  // The window is hours 0 to 10. Main went red at -2 (a run before the window) and green at 5: half the window.
  const seeded = mainHealth(
    [
      run('old', 1, 'success', at(-6), at(-5)),
      run('red', 1, 'failure', at(-3), at(-2)),
      run('fix', 1, 'success', at(1), at(5)),
    ],
    at(10),
    at(0),
  )
  near(seeded.redHours, 5, 'red hours from the window’s start')
  assert.deepEqual(
    seeded.spans.map((s) => ({ from: s.from, to: s.to, open: s.open })),
    [{ from: at(0), to: at(5), open: false }],
  )
  assert.equal(seeded.commits, 1, 'only the commits created in the window are counted')
  assert.equal(seeded.green, 1)
  assert.equal(seeded.red, 0)

  // A run created before the window that ends red inside it turns main red from its end; still red at the end, main
  // says since when, the window's hours only.
  const crossing = mainHealth(
    [
      run('old', 1, 'success', at(-6), at(-5)),
      run('slow', 1, 'failure', at(-1), at(2)),
      run('next', 1, 'failure', at(3), at(4)),
    ],
    at(10),
    at(0),
  )
  near(crossing.redHours, 8, 'red hours from the crossing run’s end')
  assert.equal(crossing.redSince, at(2))

  // Red since before the window and never green in it: the whole window, and the true start.
  const allRed = mainHealth([run('red', 1, 'failure', at(-3), at(-2))], at(10), at(0))
  near(allRed.redHours, 10, 'red the whole window')
  assert.equal(allRed.redSince, at(-2))
  assert.equal(allRed.commits, 0)
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

test('M2r kept across a reload: offered again, resent once under the same key, written twice; timed only when so', () => {
  const reloaded = { offered: true, tries: 2, keys: 1, writes: 1, resolved: true }
  const summary = summarizeM2Reload([
    { kind: 'room-message', ...reloaded, resendMs: 60 },
    // Sent again under a new key: three tries, two keys, recorded twice. Resolved, but not a resend under its key, so
    // its time is not the resend's.
    { kind: 'conversation-message', ...reloaded, tries: 3, keys: 2, writes: 2, resendMs: 80 },
    // Not offered after the reload: nothing pressed, nothing resent.
    { kind: 'room-message', ...reloaded, offered: false, tries: 1, resolved: false, resendMs: null },
  ])
  assert.deepEqual(summary, {
    n: 3,
    offered: 2,
    sameKey: 1,
    duplicates: 1,
    resolved: 2,
    resend: { p50: 60, p95: 60 },
  })
})

/** The requests each kind measures, as the app fixture lists those it refused (`METHOD /path`). */
const READ = 'GET /api/v1/projects/p1/conversations/c2/messages'
const WRITE = 'POST /api/v1/conversations/c1/messages'
const STREAM = 'GET /api/v1/projects/p1/events'

test('M8: per kind, the measured request renewed without «signed out», sent again, one refresh, and the time', () => {
  const renewed = { definitive: true, signedOut: false, resent: true, refreshes: 1 }
  const summary = summarizeM8([
    { kind: 'read', ...renewed, refused: [READ], ms: 300 },
    { kind: 'read', ...renewed, refused: ['GET /api/v1/projects/p1/conversations', READ], ms: 500 },
    // Signed out: no answer, not renewed, whatever was asked.
    { kind: 'read', ...renewed, refused: [READ], definitive: false, ms: null, signedOut: true, resent: false },
    // An answer on screen, and «signed out» too: not renewed.
    { kind: 'read', ...renewed, refused: [READ], ms: 350, signedOut: true },
    // The expired token met another request, never the one measured: not reached, whatever the screen shows.
    { kind: 'read', ...renewed, refused: ['GET /api/v1/projects/p1/mission'], ms: 200 },
    // No refresh asked: nothing renewed it.
    { kind: 'read', ...renewed, refused: [READ], refreshes: 0, ms: 250 },
    // The feed's own requests are its stream and its snapshot (useProjectFeed): the snapshot met the expired token
    // first, beside the archived list, and was renewed; the stream then went on the new token.
    { kind: 'feed', ...renewed, refused: ['GET /api/v1/projects/p1/snapshot', 'GET /api/v1/projects/archived'], ms: 110 },
    { kind: 'feed', ...renewed, refused: [STREAM], ms: 120 },
    // Only the archived list, not the feed: not reached.
    { kind: 'feed', ...renewed, refused: ['GET /api/v1/projects/archived'], resent: false, ms: 900 },
    // Renewed, but refreshed twice: counted as renewed, not as one refresh. A GET of the same path is not the write.
    { kind: 'write', ...renewed, refused: [WRITE], refreshes: 2, ms: 1200 },
    { kind: 'write', ...renewed, refused: ['GET /api/v1/conversations/c1/messages'], ms: 90 },
  ])
  assert.deepEqual(summary, {
    read: { n: 6, reached: 5, renewed: 2, signedOut: 2, resent: 5, oneRefresh: 2, time: { p50: 400, p95: 490 } },
    // Which of the feed's requests met the expired token, round by round: the snapshot once, the stream once.
    feed: {
      n: 3,
      reached: 2,
      renewed: 2,
      signedOut: 0,
      resent: 2,
      oneRefresh: 2,
      time: { p50: 115, p95: 119.5 },
      met: { snapshot: 1, stream: 1 },
    },
    write: { n: 2, reached: 1, renewed: 1, signedOut: 0, resent: 2, oneRefresh: 0, time: { p50: 1200, p95: 1200 } },
  })
  assert.deepEqual(summarizeM8([]), {})
})

test('M5: a dropped call back without a press, once online, or said lost; the microphone never back on when off', () => {
  const back = { back: true, tries: 1, reconnected: 1 }
  const summary = summarizeM5([
    { case: 'online', ...back, ms: 300 },
    { case: 'online', ...back, ms: 500 },
    // Back, but after two tries, and «Reconnected.» said twice: back and timed, neither one try nor said once.
    { case: 'online', ...back, ms: 700, tries: 2, reconnected: 2 },
    // Not back in time: not timed.
    { case: 'online', ...back, back: false, ms: null, reconnected: 0 },
    // Offline: timed from the network back; one round asked for a token while still offline.
    { case: 'offline', ...back, offlineTries: 0, ms: 200 },
    { case: 'offline', ...back, offlineTries: 1, tries: 2, ms: 400 },
    // The one try failed: the dropped words with Try again; one round tried a second time on its own, one said nothing.
    { case: 'failed', dropped: true, tryAgain: true, tries: 1, ms: 90 },
    { case: 'failed', dropped: true, tryAgain: true, tries: 2, ms: 95 },
    { case: 'failed', dropped: false, tryAgain: true, tries: 1, ms: null },
    // The microphone off in the call, or by the preference: never back on. A round not back still counts a microphone
    // turned on; the control (on in the call and by the preference) shows the check can see one come back on.
    { case: 'mic', how: 'muted in the call', off: true, back: true, micOn: false },
    { case: 'mic', how: 'muted in the call', off: true, back: true, micOn: true },
    { case: 'mic', how: 'preference off since', off: true, back: false, micOn: true },
    { case: 'mic', how: 'preference off since', off: true, back: true, micOn: false },
    { case: 'mic', how: 'on, and the preference on', off: false, back: true, micOn: true },
    { case: 'mic', how: 'on, and the preference on', off: false, back: false, micOn: false },
  ])
  assert.deepEqual(summary, {
    online: { n: 4, back: 3, time: { p50: 500, p95: 680 }, oneTry: 3, saidOnce: 2 },
    offline: { n: 2, back: 2, time: { p50: 300, p95: 390 }, oneTry: 1, saidOnce: 2, triedOffline: 1 },
    failed: { n: 3, said: 2, oneTry: 2, secondTry: 1 },
    privacy: {
      n: 4,
      back: 3,
      violations: 2,
      controls: { n: 2, back: 1, on: 1 },
      cases: {
        'muted in the call': { n: 2, back: 2, violations: 1 },
        'preference off since': { n: 2, back: 1, violations: 1 },
      },
    },
  })
  const none = summarizeM5([])
  assert.deepEqual(none.online, { n: 0, back: 0, time: { p50: null, p95: null }, oneTry: 0, saidOnce: 0 })
  assert.deepEqual(none.privacy, { n: 0, back: 0, violations: 0, controls: { n: 0, back: 0, on: 0 }, cases: {} })
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

test('M3/M4: per feed case, the scenarios that ran (their lever there), came back, and in how long', () => {
  const summary = summarizeFeed([
    { case: 'drop', lever: true, ms: 1000 },
    { case: 'drop', lever: true, ms: 1200 },
    { case: 'stall', lever: true, ms: null },
    { case: 'online', lever: false, ms: null },
  ])
  assert.deepEqual(summary, {
    drop: { n: 2, ran: 2, back: 2, p50: 1100, p95: 1190 },
    stall: { n: 1, ran: 1, back: 0, p50: null, p95: null },
    online: { n: 1, ran: 0, back: 0, p50: null, p95: null },
  })
})

// The script itself, on a fake suite: it lists 2 M7 scenarios, 1 M2, `FAKE_M2R_LISTED` M2r, `FAKE_M8_LISTED` M8 and
// `FAKE_M5_LISTED` M5; `FAKE_M7` M7 records, `FAKE_M2` M2 records, `FAKE_M8` M8 records and `FAKE_M5` M5 records are
// written, and it exits `FAKE_EXIT`.
const SCRIPT = fileURLToPath(new URL('../../scripts/reliability-report.mjs', import.meta.url))
const FAKE_SUITE = `
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
if (process.argv.includes('--list')) {
  console.log('Listing tests:')
  console.log('  [desktop] › transient.spec.ts:10:3 › M7 · reads answered 502 once @reliability')
  console.log('  [desktop] › transient.spec.ts:10:3 › M7 · reads answered 503 twice @reliability')
  console.log('  [desktop] › writes.spec.ts:80:1 › M2 · a message whose reply is lost @reliability')
  const m2r = Number(process.env.FAKE_M2R_LISTED)
  for (let i = 0; i < m2r; i++) console.log('  [desktop] › writes.spec.ts:90:1 › M2r · a message kept across a reload @reliability')
  const m8 = Number(process.env.FAKE_M8_LISTED)
  for (let i = 0; i < m8; i++) console.log('  [desktop] › session.spec.ts:40:1 › M8 · a read after the token expired @reliability')
  const m5 = Number(process.env.FAKE_M5_LISTED)
  for (let i = 0; i < m5; i++) console.log('  [desktop] › rejoin.spec.ts:50:1 › M5 · a call dropped online @reliability')
  console.log('Total: ' + (3 + m2r + m8 + m5) + ' tests in 3 files')
  process.exit(0)
}
const dir = process.env.RELIABILITY_RESULTS
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'run.json'), JSON.stringify({ startedAt: '2026-10-19T12:00:00Z', commit: 'fake', branch: 'b' }))
const write = (metric, i, sample) =>
  writeFileSync(join(dir, metric + '-' + i + '.json'), JSON.stringify({ metric, test: metric + ' ' + i, samples: [sample] }))
for (let i = 0; i < Number(process.env.FAKE_M7); i++) {
  write('M7', i, { read: 'conversations', failures: 1, errors: 1, recovered: true, ms: 100 })
}
for (let i = 0; i < Number(process.env.FAKE_M2); i++) write('M2', i, { resolved: true, writes: 1, resendMs: 30 })
const refused = ['GET /api/v1/projects/p1/conversations/c2/messages']
const renewed = { kind: 'read', refused, definitive: true, ms: 420, signedOut: false, resent: true, refreshes: 1 }
// With the read, a feed round whose expired token met the snapshot, not the stream.
const feed = { ...renewed, kind: 'feed', ms: 120, refused: ['GET /api/v1/projects/p1/snapshot', 'GET /api/v1/projects/archived'] }
for (let i = 0; i < Number(process.env.FAKE_M8); i++) {
  const record = { metric: 'M8', test: 'M8 ' + i, samples: [renewed, feed] }
  writeFileSync(join(dir, 'M8-' + i + '.json'), JSON.stringify(record))
}
// A dropped call: back online and offline, its one try failed, and the microphone off in the call kept off.
const m5 = [
  { case: 'online', back: true, ms: 310, tries: 1, reconnected: 1 },
  { case: 'offline', back: true, ms: 140, tries: 1, offlineTries: 0, reconnected: 1 },
  { case: 'failed', dropped: true, tryAgain: true, tries: 1, ms: 60 },
  { case: 'mic', how: 'muted in the call', off: true, back: true, micOn: false },
  { case: 'mic', how: 'on, and the preference on', off: false, back: true, micOn: true },
]
for (let i = 0; i < Number(process.env.FAKE_M5); i++) {
  writeFileSync(join(dir, 'M5-' + i + '.json'), JSON.stringify({ metric: 'M5', test: 'M5 ' + i, samples: m5 }))
}
process.exit(Number(process.env.FAKE_EXIT))
`

function fixtureReport({ m7, m2, exit, runSuite, m8 = 0, m8Listed = 0, m2rListed = 0, m5 = 0, m5Listed = 0 }) {
  const dir = mkdtempSync(join(tmpdir(), 'reliability-'))
  const fake = join(dir, 'fake-suite.mjs')
  writeFileSync(fake, FAKE_SUITE)
  const env = {
    ...process.env,
    RELIABILITY_SUITE: `${JSON.stringify(process.execPath)} ${JSON.stringify(fake)}`,
    RELIABILITY_RESULTS: join(dir, 'results'),
    FAKE_M7: String(m7),
    FAKE_M2: String(m2),
    FAKE_M8: String(m8),
    FAKE_M8_LISTED: String(m8Listed),
    FAKE_M2R_LISTED: String(m2rListed),
    FAKE_M5: String(m5),
    FAKE_M5_LISTED: String(m5Listed),
    FAKE_EXIT: String(exit),
  }
  // Without --run the suite ran before (through the guard, on Luis's machine): the script only collects.
  if (!runSuite) spawnSync(process.execPath, [fake], { env })
  const out = join(dir, 'out')
  const args = [SCRIPT, '--fixture', ...(runSuite ? ['--run'] : []), '--out', out]
  const { status } = spawnSync(process.execPath, args, { env, encoding: 'utf8' })
  const json = JSON.parse(readFileSync(join(out, 'reliability.json'), 'utf8'))
  const md = readFileSync(join(out, 'reliability.md'), 'utf8')
  rmSync(dir, { recursive: true, force: true })
  return { status, fixture: json.fixture, md }
}

test('a suite that fails after some scenarios wrote results gives no numbers, says so, and exits non-zero', () => {
  // A failed suite can't say which scenario failed (one may fail after writing its record): every metric is partial.
  const failed = fixtureReport({ m7: 1, m2: 0, exit: 1, runSuite: true })
  assert.notEqual(failed.status, 0, 'the script exits non-zero')
  assert.equal(failed.fixture.incomplete.exit, 1)
  assert.deepEqual(failed.fixture.incomplete.metrics.M7, { ran: 1, expected: 2 })
  assert.deepEqual(failed.fixture.incomplete.metrics.M2, { ran: 0, expected: 1 })
  assert.equal(failed.fixture.m7?.share, undefined, 'no summary from a partial run')
  assert.ok(!failed.md.includes('%'), `no percentage published:\n${failed.md}`)
  assert.match(failed.md, /M7.*incomplete: 1 of 2 scenarios/)

  // Collected after a run through the guard that wrote fewer records than the suite has: those metrics are partial,
  // the whole ones are published, and the script still exits non-zero.
  const short = fixtureReport({ m7: 2, m2: 0, exit: 0, runSuite: false })
  assert.notEqual(short.status, 0)
  assert.deepEqual(short.fixture.incomplete, { exit: null, metrics: { M2: { ran: 0, expected: 1 } } })
  assert.equal(short.fixture.m7.share, 1)
  assert.equal(short.fixture.m2?.share, undefined)

  const whole = fixtureReport({ m7: 2, m2: 1, exit: 0, runSuite: true })
  assert.equal(whole.status, 0)
  assert.equal(whole.fixture.incomplete, undefined)
  assert.equal(whole.fixture.m7.share, 1)
  assert.equal(whole.fixture.m2.share, 1)
})

test('M8 is measured now: a partial run gives no M8 numbers, a whole one its rows, and it is no longer «not measurable»', () => {
  const has = (md, line) => assert.ok(md.includes(line), `«${line}» in:\n${md}`)
  const short = fixtureReport({ m7: 2, m2: 1, m8: 0, m8Listed: 1, exit: 0, runSuite: false })
  assert.notEqual(short.status, 0, 'the script exits non-zero')
  assert.deepEqual(short.fixture.incomplete, { exit: null, metrics: { M8: { ran: 0, expected: 1 } } })
  assert.equal(short.fixture.m8.read, undefined, 'no summary from a partial run')
  has(short.md, '| M8 · expired token while signed in · read | incomplete: 0 of 1 scenarios wrote results |')
  assert.ok(!short.md.includes('renewed'), `no M8 numbers:\n${short.md}`)

  const whole = fixtureReport({ m7: 2, m2: 1, m8: 1, m8Listed: 1, exit: 0, runSuite: false })
  assert.equal(whole.status, 0)
  assert.equal(whole.fixture.m8.read.renewed, 1)
  has(
    whole.md,
    '| M8 · expired token while signed in · read | 1/1 renewed without «signed out» · 1/1 sent again · 1/1 renewed with one refresh · answer p50 420 ms · p95 420 ms |',
  )
  has(whole.md, '| M8 · expired token while signed in · write | not run |')
  // The feed's row says which of its requests met the expired token: the stream's own renewal may go unexercised.
  has(
    whole.md,
    '| M8 · expired token while signed in · feed | 1/1 renewed without «signed out» · 1/1 sent again · 1/1 renewed with one refresh · answer p50 120 ms · p95 120 ms · met: snapshot 1 · stream 0 |',
  )
  has(whole.md, '| M2r · kept across a reload: offered again, resent once under its key | not run |')
  assert.ok(!whole.md.includes('M8 (session through sleep)'), `M8 is measurable:\n${whole.md}`)
})

test('a reload scenario that wrote nothing leaves M2r incomplete, and M2’s comparable first line published', () => {
  const has = (md, line) => assert.ok(md.includes(line), `«${line}» in:\n${md}`)
  const short = fixtureReport({ m7: 2, m2: 1, m2rListed: 1, exit: 0, runSuite: false })
  assert.notEqual(short.status, 0, 'the script exits non-zero')
  assert.deepEqual(short.fixture.incomplete, { exit: null, metrics: { M2r: { ran: 0, expected: 1 } } })
  assert.equal(short.fixture.m2.share, 1)
  has(
    short.md,
    '| M2r · kept across a reload: offered again, resent once under its key | incomplete: 0 of 1 scenarios wrote results |',
  )
  has(short.md, '| M2 · unknown outcome resolved by resend, same key | 100.0 % (1/1;')
})

test('M5 is measured now: a partial run gives no M5 numbers, a whole one its rows, and it is no longer «not measurable»', () => {
  const has = (md, line) => assert.ok(md.includes(line), `«${line}» in:
${md}`)
  const rows = [
    'M5 · dropped online → live without a press',
    'M5 · dropped offline → live once online',
    'M5 · its one try fails → the dropped words, Try again',
    'M5 · microphone back on when off (the call or the preference)',
  ]
  const short = fixtureReport({ m7: 2, m2: 1, m5: 0, m5Listed: 1, exit: 0, runSuite: false })
  assert.notEqual(short.status, 0, 'the script exits non-zero')
  assert.deepEqual(short.fixture.incomplete, { exit: null, metrics: { M5: { ran: 0, expected: 1 } } })
  assert.equal(short.fixture.m5.online, undefined, 'no summary from a partial run')
  for (const label of rows) has(short.md, `| ${label} | incomplete: 0 of 1 scenarios wrote results |`)
  assert.ok(!short.md.includes('M5 microphone case'), `no M5 table:
${short.md}`)

  const whole = fixtureReport({ m7: 2, m2: 1, m5: 1, m5Listed: 1, exit: 0, runSuite: false })
  assert.equal(whole.status, 0)
  assert.equal(whole.fixture.m5.privacy.violations, 0)
  has(whole.md, `| ${rows[0]} | 1/1 back · p50 310 ms · p95 310 ms · one try 1/1 · «Reconnected.» said once 1/1 |`)
  has(
    whole.md,
    `| ${rows[1]} | 1/1 back · online → live p50 140 ms · p95 140 ms · no try while offline 1/1 · one try 1/1 · «Reconnected.» said once 1/1 |`,
  )
  has(whole.md, `| ${rows[2]} | 1/1 said with Try again · one try 1/1 · a second try on its own: 0 |`)
  has(whole.md, `| ${rows[3]} | violations: 0 of 1 rounds (1 back) · control, on and on: 1/1 back on |`)
  has(whole.md, '| muted in the call | 1 | 1 | 0 |')
  assert.ok(!whole.md.includes('M5 (call re-join)'), `M5 is measurable:
${whole.md}`)
})
