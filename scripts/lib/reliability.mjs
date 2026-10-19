/**
 * The arithmetic behind scripts/reliability-report.mjs (docs/plans/reliability-measure.md, the baseline's §4):
 * percentiles and rates, how a CI job's end is read, flakes, the room job's minutes and margin, main's red hours, and
 * the fixture suite's four metrics. Pure functions over plain data; the script does the reading and the writing.
 */

import { parse } from 'yaml'

/** The room's browser job, whatever its parts are called (`… (1/2)` since #468, `…, part 1 of 3` on some branches). */
export const ROOM = 'The room in Chromium'

/** GitHub's own limit for a job that sets no `timeout-minutes`. */
const GITHUB_DEFAULT_LIMIT = 360

/**
 * The `p`th percentile (0–100), interpolated between the closest ranks (R's type 7, numpy's default); null with no
 * values. The input is not sorted in place.
 * @param {readonly number[]} values
 * @param {number} p
 */
export function percentile(values, p) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const h = ((sorted.length - 1) * p) / 100
  const lo = Math.floor(h)
  const hi = Math.min(lo + 1, sorted.length - 1)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}

/** `part / whole`, or null when there is no whole: a rate of nothing is not zero. */
export function rate(part, whole) {
  return whole === 0 ? null : part / whole
}

/** A job's name without its shard, and the shard as `n/m` (both namings), or null. */
export function shardOf(name) {
  const paren = /^(.*?)\s*\((\d+)\/(\d+)\)$/.exec(name)
  if (paren) return { base: paren[1], shard: `${paren[2]}/${paren[3]}` }
  const part = /^(.*?),?\s+part (\d+) of (\d+)$/.exec(name)
  if (part) return { base: part[1], shard: `${part[2]}/${part[3]}` }
  return { base: name, shard: null }
}

/** The family a job belongs to: the room is one family whatever its parts are called; others drop their shard. */
export function familyOf(name) {
  return name.startsWith(ROOM) ? ROOM : shardOf(name).base
}

/**
 * A room job that runs no Playwright suite: on branches that split the room in parts, a job with the room's name only
 * gathers them (`echo "The room's three parts"`) and fails in seconds when one does. Not a run of the room.
 */
export function isRoomGate(job) {
  if (familyOf(job.name) !== ROOM) return false
  return !(job.steps ?? []).some((step) => /playwright test|test:browser/.test(step.name))
}

/** How long a job ran, in minutes; null if it has not ended. */
export function jobMinutes(job) {
  if (!job.startedAt || !job.completedAt) return null
  return (Date.parse(job.completedAt) - Date.parse(job.startedAt)) / 60_000
}

/**
 * How a job ended. GitHub marks a job that reached its `timeout-minutes` as cancelled, like one superseded by a newer
 * push: a cancelled job that ran for at least its limit is a timeout, a shorter one superseded.
 */
export function outcomeOf(job, limitMinutes) {
  if (job.status !== 'completed') return 'pending'
  if (job.conclusion === 'timed_out') return 'timeout'
  if (job.conclusion !== 'cancelled') return job.conclusion || 'pending'
  const minutes = jobMinutes(job)
  return minutes !== null && minutes >= limitMinutes ? 'timeout' : 'superseded'
}

/** A rerun of failed jobs lists the carried-over ones again under new ids, same times: each job once. */
export function distinctJobs(jobs) {
  const seen = new Set()
  return jobs.filter((job) => {
    const key = `${job.name}|${job.startedAt}|${job.completedAt}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Groups items by a key into a Map of arrays, in first-seen order. */
function groupBy(items, keyOf) {
  const groups = new Map()
  for (const item of items) {
    const key = keyOf(item)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return groups
}

/**
 * M10. Per family: a (SHA, job) pair is decided once it has a success or a failure, and flaky when it has both.
 * Timeouts are the suite's length (M11), not flakes.
 * @param {{ sha: string, name: string, outcome: string }[]} entries
 */
export function flakeRates(entries) {
  const result = {}
  for (const [key, pair] of groupBy(entries, (e) => `${e.sha}\n${e.name}`)) {
    const family = familyOf(pair[0].name)
    const row = (result[family] ??= { decided: 0, flaky: 0, rate: null, shas: [] })
    const passed = pair.some((e) => e.outcome === 'success')
    const failed = pair.some((e) => e.outcome === 'failure')
    if (!passed && !failed) continue
    row.decided += 1
    if (passed && failed) {
      row.flaky += 1
      row.shas.push(key.split('\n')[0])
    }
  }
  for (const row of Object.values(result)) row.rate = rate(row.flaky, row.decided)
  return result
}

/** Median, p90 and maximum of some minutes. */
function minutesSummary(minutes) {
  return {
    n: minutes.length,
    p50: percentile(minutes, 50),
    p90: percentile(minutes, 90),
    max: percentile(minutes, 100),
  }
}

/**
 * Per family: how many jobs ended each way (pending ones left out), the failure share of the decided ones (success
 * or failure, as the baseline's table), the red share with timeouts counted as red, and the successful jobs' minutes.
 * @param {{ name: string, outcome: string, minutes: number | null }[]} entries
 */
export function jobTable(entries) {
  const result = {}
  for (const [family, jobs] of groupBy(entries, (e) => familyOf(e.name))) {
    const ended = jobs.filter((j) => j.outcome !== 'pending')
    const count = (outcome) => ended.filter((j) => j.outcome === outcome).length
    const [success, failure, timeout] = [count('success'), count('failure'), count('timeout')]
    result[family] = {
      total: ended.length,
      success,
      failure,
      timeout,
      superseded: count('superseded'),
      failureShare: rate(failure, success + failure),
      redShare: rate(failure + timeout, success + failure + timeout),
      successMinutes: minutesSummary(ended.filter((j) => j.outcome === 'success').map((j) => j.minutes)),
    }
  }
  return result
}

/**
 * The Playwright run summary the `github` reporter leaves as a notice: `  N failed` (or flaky, passed, …) and, under
 * failed and flaky, one line per test.
 */
export function parseRunSummary(message) {
  const summary = { failed: 0, flaky: 0, passed: 0, failedTests: [], flakyTests: [] }
  let section = null
  for (const line of message.split(/\r?\n/)) {
    const count = /^\s*(\d+) (failed|flaky|passed|skipped|did not run|interrupted)\b/.exec(line)
    if (count) {
      section = count[2]
      if (section in summary) summary[section] = Number(count[1])
      continue
    }
    const listed = section === 'failed' ? summary.failedTests : section === 'flaky' ? summary.flakyTests : null
    if (listed && /^\s+\[[^\]]+\] › /.test(line)) listed.push(line.trim())
  }
  return summary
}

/** A summary line's spec: its file and line (`e2e/voice-meters.spec.ts:78`). */
export function specOf(line) {
  return /(\S+\.spec\.ts):(\d+)/.exec(line)?.slice(1).join(':') ?? line
}

/**
 * M11. The room's successful jobs per UTC day and part (`whole` or the shard), with the margin of p90 to the limit;
 * timeouts that day and part counted beside them.
 * @param {{ name: string, startedAt: string, minutes: number | null, outcome: string }[]} jobs
 */
export function roomDurations(jobs, limit) {
  const room = jobs.filter((j) => j.name.startsWith(ROOM) && (j.outcome === 'success' || j.outcome === 'timeout'))
  const rows = []
  for (const [key, group] of groupBy(room, (j) => `${j.startedAt.slice(0, 10)} ${shardOf(j.name).shard ?? 'whole'}`)) {
    const [day, part] = key.split(' ')
    const done = minutesSummary(group.filter((j) => j.outcome === 'success').map((j) => j.minutes))
    const margin = done.p90 === null ? null : limit - done.p90
    const timeouts = group.filter((j) => j.outcome === 'timeout').length
    rows.push({ day, part, ...done, timeouts, margin, marginShare: margin === null ? null : margin / limit })
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day) || a.part.localeCompare(b.part))
}

/**
 * A job's `timeout-minutes` in a workflow, the job found by the start of its name without its `${{ … }}` parts (or
 * by its id); GitHub's 360 when it sets none; null when no job matches.
 */
export function timeoutMinutes(workflowText, jobName) {
  const jobs = parse(workflowText)?.jobs ?? {}
  for (const [id, job] of Object.entries(jobs)) {
    const name = String(job?.name ?? id)
      .replace(/\$\{\{[^}]*\}\}/g, '')
      .trim()
    if (name.startsWith(jobName) || id === jobName) return Number(job['timeout-minutes'] ?? GITHUB_DEFAULT_LIMIT)
  }
  return null
}

const GREEN = new Set(['success', 'skipped', 'neutral'])

/** Each commit's final state (its latest attempt), and its place in commit order. */
function commitStates(runs) {
  const commits = new Map()
  for (const run of runs) {
    const commit = commits.get(run.sha) ?? { sha: run.sha, createdAt: run.createdAt, latest: run }
    if (run.createdAt < commit.createdAt) commit.createdAt = run.createdAt
    if (run.attempt > commit.latest.attempt) commit.latest = run
    commits.set(run.sha, commit)
  }
  const ordered = [...commits.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  ordered.forEach((commit, i) => {
    commit.order = i
    const { conclusion, completedAt } = commit.latest
    commit.state = !completedAt || !conclusion ? 'pending' : GREEN.has(conclusion) ? 'green' : 'red'
  })
  return ordered
}

/** The red spans of main: walking each attempt's end in time, main's state is its newest ended commit's. */
function redSpans(runs, commits, now) {
  const order = new Map(commits.map((c) => [c.sha, c.order]))
  const ends = runs
    .filter((r) => r.completedAt && r.conclusion)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
  const state = new Map()
  const spans = []
  let open = null
  for (const end of ends) {
    state.set(end.sha, GREEN.has(end.conclusion) ? 'green' : 'red')
    const head = [...state.keys()].reduce((a, b) => (order.get(b) > order.get(a) ? b : a))
    if (state.get(head) === 'red' && !open) open = { from: end.completedAt, shas: [] }
    if (open && state.get(head) === 'red' && !open.shas.includes(head)) open.shas.push(head)
    if (state.get(head) === 'green' && open) {
      spans.push({ ...open, to: end.completedAt, open: false })
      open = null
    }
  }
  if (open) spans.push({ ...open, to: now, open: true })
  return spans
}

/**
 * M12. `runs`: one entry per attempt of main's `ci` runs ({ sha, attempt, conclusion, createdAt, completedAt }).
 * The share of commits whose latest attempt is green, and the hours main stayed red: from a red commit's end until a
 * newer commit (or a rerun of it) ends green; a window that ends red counts until `now`.
 */
export function mainHealth(runs, now) {
  const commits = commitStates(runs)
  const count = (state) => commits.filter((c) => c.state === state).length
  const [green, red] = [count('green'), count('red')]
  const spans = redSpans(runs, commits, now)
  const hours = (span) => (Date.parse(span.to) - Date.parse(span.from)) / 3_600_000
  const last = spans.at(-1)
  return {
    commits: commits.length,
    green,
    red,
    pending: count('pending'),
    greenShare: rate(green, green + red),
    redHours: spans.reduce((sum, span) => sum + hours(span), 0),
    spans: spans.map((span) => ({ ...span, hours: hours(span) })),
    redSince: last?.open ? last.from : null,
  }
}

/** p50 and p95 of some values. */
const spread = (values) => ({ p50: percentile(values, 50), p95: percentile(values, 95) })

/**
 * M1. Samples of a keyed write: the reply held `delayMs`, `totalMs` from the press to a definitive answer on screen
 * (null if none came). The total, the overhead past the hold, and the share of all samples answered within 5 s.
 */
export function summarizeM1(samples) {
  const answered = samples.filter((s) => s.definitive && s.totalMs !== null)
  return {
    n: samples.length,
    definitive: answered.length,
    withinFiveSeconds: rate(answered.filter((s) => s.totalMs <= 5000).length, samples.length),
    total: spread(answered.map((s) => s.totalMs)),
    overhead: spread(answered.map((s) => s.totalMs - s.delayMs)),
  }
}

/**
 * M2. Samples of a write whose reply was lost, sent again under its key: resolved or not, how many times it was
 * written, and the time from the second press to the answer.
 */
export function summarizeM2(samples) {
  const resolved = samples.filter((s) => s.resolved)
  return {
    n: samples.length,
    resolved: resolved.length,
    share: rate(resolved.length, samples.length),
    duplicates: samples.filter((s) => s.writes > 1).length,
    resend: spread(resolved.map((s) => s.resendMs)),
  }
}

/** M6. Per view: its read failed (`failedReads` > 0) and it showed so, or fell silent; no failed read, not reached. */
export function summarizeM6(samples) {
  const reached = samples.filter((s) => s.failedReads > 0)
  return {
    views: samples.length,
    reached: reached.length,
    visible: reached.filter((s) => s.visible).length,
    silent: reached.filter((s) => !s.visible).length,
    notReached: samples.filter((s) => s.failedReads === 0).map((s) => s.view),
    silentViews: reached.filter((s) => !s.visible).map((s) => s.view),
  }
}

/** M7. Reads answered 502/503 in HTML some times, then 200: recovered without a press, and how long after. */
export function summarizeM7(samples) {
  const recovered = samples.filter((s) => s.recovered)
  return {
    n: samples.length,
    recovered: recovered.length,
    share: rate(recovered.length, samples.length),
    time: spread(recovered.map((s) => s.ms)),
  }
}
