#!/usr/bin/env node
/**
 * Reliability, measured (docs/plans/reliability-measure.md; the baseline's §4): the same numbers before and after
 * each reliability change.
 *
 *   node scripts/reliability-report.mjs --ci [--since <ISO>] [--repo <owner/name>] [--out <dir>]
 *   node scripts/reliability-report.mjs --fixture [--run] [--out <dir>]
 *
 * `--ci` reads GitHub Actions through `gh` (M10 flakes, M11 the room job's minutes, M12 main green). `--fixture`
 * collects what the `@reliability` Playwright suite wrote (M1, M2, M6, M7); `--run` runs the suite first. Each mode
 * writes its section of `<out>/reliability.json` (default `reliability-report/`), keeping the other's, and the short
 * table `<out>/reliability.md`, which it also prints.
 */

import { execFile, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, promisify } from 'node:util'
import {
  ROOM,
  distinctJobs,
  familyOf,
  isRoomGate,
  flakeRates,
  jobMinutes,
  jobTable,
  mainHealth,
  outcomeOf,
  parseRunSummary,
  roomDurations,
  shardOf,
  specOf,
  summarizeM1,
  summarizeM2,
  summarizeM6,
  summarizeM7,
  timeoutMinutes,
} from './lib/reliability.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STUDIO = join(ROOT, 'apps', 'studio')
const RESULTS = join(STUDIO, 'reliability-results')
const CACHE = join(ROOT, '.reliability-cache')
const WORKFLOW = join(ROOT, '.github', 'workflows', 'ci.yml')
const DAY = 86_400_000
const run = promisify(execFile)

/** The suite's command, as the script runs it with `--run` (on Luis's machine, through the guard instead). */
export const SUITE = 'pnpm exec playwright test -c playwright.reliability.config.ts --workers=2'

/** What the fixture can't measure yet, and why. */
const NOT_YET = [
  { metric: 'M3', what: 'feed recovery', why: 'needs the stream levers reliability/feed-reconnect adds' },
  { metric: 'M4', what: 'gaps and resyncs', why: 'needs the gap lever reliability/feed-reconnect adds' },
  { metric: 'M5', what: 'call re-join', why: 'not in this suite yet (linkLost/drop levers exist)' },
  { metric: 'M8', what: 'session through sleep', why: 'needs an expired-token lever (R1 gap 3)' },
  { metric: 'M9', what: 'tabs on an old version', why: 'needs a version probe' },
]

// ——— gh ———

/**
 * Runs `gh` with JSON output. GitHub's API answers a 5xx now and then: asked again up to 3 times, 2, 4 and 8 s on. A
 * rate limit (too many requests at once) waits a minute each time, as GitHub asks.
 */
async function gh(args, tries = 3) {
  try {
    const { stdout } = await run('gh', args, { maxBuffer: 256 * 1024 * 1024, windowsHide: true })
    return JSON.parse(stdout)
  } catch (error) {
    const said = String(error?.stderr ?? error)
    const limited = /rate limit/i.test(said)
    if (!(limited || /HTTP 5\d\d|timeout|ECONNRESET|EOF/i.test(said)) || tries === 0) throw error
    await new Promise((resolve) => setTimeout(resolve, limited ? 60_000 : 2000 * 2 ** (3 - tries)))
    return gh(args, tries - 1)
  }
}

/** A completed answer kept on disk under `name`, so a second report asks only for what is new. */
async function cached(name, fetch) {
  const file = join(CACHE, `${name}.json`)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const value = await fetch()
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(file, JSON.stringify(value))
  return value
}

/** Maps `items` through `task`, at most `width` at a time. */
async function pool(items, width, task) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await task(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker))
  return results
}

// ——— CI ———

/** The workflow's limits per job, read by name (and GitHub's default where a job is not found). */
function limitsFrom(workflowText) {
  const limits = new Map()
  return (name) => {
    const key = familyOf(name) === ROOM ? ROOM : shardOf(name).base
    if (!limits.has(key)) limits.set(key, timeoutMinutes(workflowText, key) ?? 360)
    return limits.get(key)
  }
}

/**
 * The `ci` runs created from `since` to `until`, a day at a time: GitHub answers a filtered list with at most 1,000
 * runs, and a busy week has more.
 */
async function listRuns(repo, since, until) {
  const fields = 'databaseId,headSha,headBranch,event,status,conclusion,attempt,createdAt,updatedAt'
  const days = []
  for (let from = Date.parse(since); from < Date.parse(until); from += DAY) {
    const to = new Date(Math.min(from + DAY, Date.parse(until))).toISOString()
    days.push(`${new Date(from).toISOString().slice(0, 19)}Z..${to.slice(0, 19)}Z`)
  }
  const lists = await pool(days, 4, (range) =>
    gh(['run', 'list', '-R', repo, '--workflow', 'ci', '--created', range, '--limit', '1000', '--json', fields]),
  )
  const seen = new Set()
  return lists.flat().filter((r) => !seen.has(r.databaseId) && seen.add(r.databaseId))
}

/** The `ci` runs of the window, every attempt's jobs for the completed ones. */
async function readRuns(repo, since, until) {
  const runs = await listRuns(repo, since, until)
  const attempts = runs
    .filter((r) => r.status === 'completed')
    .flatMap((r) => Array.from({ length: r.attempt }, (_, i) => ({ run: r, attempt: i + 1 })))
  process.stderr.write(`${runs.length} runs, ${attempts.length} completed attempts to read\n`)
  const jobs = await pool(attempts, 4, ({ run: r, attempt }) =>
    cached(`run-${r.databaseId}-${attempt}`, async () => {
      const view = ['run', 'view', String(r.databaseId), '-R', repo, '--attempt', String(attempt), '--json', 'jobs']
      return (await gh(view)).jobs
    }),
  )
  return { runs, attempts: attempts.map((a, i) => ({ ...a, jobs: jobs[i] })) }
}

/** One entry per job, each counted once across a run's attempts, with how it ended; the room's gate jobs left out. */
function jobEntries(attempts, limitOf) {
  const byRun = new Map()
  for (const { run: r, attempt, jobs } of attempts) {
    const kept = byRun.get(r.databaseId) ?? []
    kept.push(...jobs.map((job) => ({ ...job, run: r, attempt })))
    byRun.set(r.databaseId, kept)
  }
  return [...byRun.values()].flatMap((jobs) =>
    distinctJobs(jobs)
      .filter((job) => !isRoomGate(job))
      .map((job) => ({
        id: job.databaseId,
        sha: job.run.headSha,
        branch: job.run.headBranch,
        attempt: job.attempt,
        name: job.name,
        startedAt: job.startedAt,
        minutes: jobMinutes(job),
        outcome: outcomeOf(job, limitOf(job.name)),
      })),
  )
}

/** The Playwright summary of each failed room job (the `github` reporter's notice). */
async function roomFailures(repo, entries) {
  const failed = entries.filter((e) => familyOf(e.name) === ROOM && e.outcome === 'failure')
  const summaries = await pool(failed, 4, (e) =>
    cached(`annotations-${e.id}`, () => gh(['api', `repos/${repo}/check-runs/${e.id}/annotations?per_page=100`])),
  )
  const read = failed.map((e, i) => {
    const notice = summaries[i].find((a) => /Playwright Run Summary/.test(a.title ?? ''))
    return { ...e, summary: notice ? parseRunSummary(notice.message) : null }
  })
  const withSummary = read.filter((e) => e.summary)
  const specs = new Map()
  for (const test of withSummary.flatMap((e) => e.summary.failedTests)) {
    specs.set(specOf(test), (specs.get(specOf(test)) ?? 0) + 1)
  }
  return {
    failedJobs: failed.length,
    withSummary: withSummary.length,
    oneTest: withSummary.filter((e) => e.summary.failed === 1).length,
    twoOrFewer: withSummary.filter((e) => e.summary.failed <= 2).length,
    noSummary: read.filter((e) => !e.summary).map((e) => ({ id: e.id, branch: e.branch, minutes: e.minutes })),
    topSpecs: [...specs].sort((a, b) => b[1] - a[1]).slice(0, 10),
  }
}

/** Main's attempts as M12 reads them: the listed latest attempt, and earlier ones from their jobs. */
function mainAttempts(runs, attempts) {
  const main = (r) => r.headBranch === 'main' && r.event === 'push'
  const latest = runs.filter(main).map((r) => ({
    sha: r.headSha,
    attempt: r.attempt,
    createdAt: r.createdAt,
    conclusion: r.status === 'completed' ? r.conclusion : null,
    completedAt: r.status === 'completed' ? r.updatedAt : null,
  }))
  const earlier = attempts
    .filter((a) => main(a.run) && a.attempt < a.run.attempt && a.jobs.length > 0)
    .map(({ run: r, attempt, jobs }) => ({
      sha: r.headSha,
      attempt,
      createdAt: r.createdAt,
      conclusion: jobs.some((j) => j.conclusion === 'failure')
        ? 'failure'
        : jobs.some((j) => j.conclusion === 'cancelled')
          ? 'cancelled'
          : 'success',
      completedAt: jobs
        .map((j) => j.completedAt)
        .sort()
        .at(-1),
    }))
  return [...latest, ...earlier]
}

async function measureCi({ repo, since }) {
  const until = new Date().toISOString()
  const workflowText = readFileSync(WORKFLOW, 'utf8')
  const limitOf = limitsFrom(workflowText)
  const { runs, attempts } = await readRuns(repo, since, until)
  const entries = jobEntries(attempts, limitOf)
  return {
    repo,
    window: { since, until, runs: runs.length, completedAttempts: attempts.length, jobs: entries.length },
    roomLimit: limitOf(ROOM),
    m10: { flakes: flakeRates(entries), jobs: jobTable(entries), roomFailures: await roomFailures(repo, entries) },
    m11: roomDurations(entries, limitOf(ROOM)),
    m12: mainHealth(mainAttempts(runs, attempts), until),
  }
}

// ——— fixture ———

/** What the suite wrote: its run (`run.json`, from its global setup) and each spec's samples. */
function readResults() {
  if (!existsSync(RESULTS)) return null
  const files = readdirSync(RESULTS).filter((f) => f.endsWith('.json'))
  const runFile = files.includes('run.json') ? JSON.parse(readFileSync(join(RESULTS, 'run.json'), 'utf8')) : null
  const records = files.filter((f) => f !== 'run.json').map((f) => JSON.parse(readFileSync(join(RESULTS, f), 'utf8')))
  return { run: runFile, records }
}

function measureFixture({ runSuite }) {
  if (runSuite) {
    const ran = spawnSync(SUITE, { cwd: STUDIO, stdio: 'inherit', shell: true })
    if (ran.status !== 0) process.stderr.write(`The suite exited ${ran.status}; collecting what it wrote.\n`)
  }
  const results = readResults()
  if (!results || results.records.length === 0) {
    process.stderr.write(`No results in ${RESULTS}. Run the suite first, from apps/studio:\n  ${SUITE}\n`)
    process.stderr.write('or run this script with --fixture --run.\n')
    process.exit(1)
  }
  const samples = (metric) => results.records.filter((r) => r.metric === metric).flatMap((r) => r.samples)
  return {
    command: `cd apps/studio && ${SUITE}`,
    run: results.run,
    tests: results.records.map((r) => ({ metric: r.metric, test: r.test, samples: r.samples.length })),
    m1: { ...summarizeM1(samples('M1')), samples: samples('M1') },
    m2: { ...summarizeM2(samples('M2')), samples: samples('M2') },
    m6: { ...summarizeM6(samples('M6')), samples: samples('M6') },
    m7: { ...summarizeM7(samples('M7').filter((s) => s.reached !== false)), samples: samples('M7') },
  }
}

// ——— output ———

const pct = (x) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(1)} %`)
const num = (x, digits = 1) => (x === null || x === undefined ? '—' : x.toFixed(digits))
const ms = (x) => (x === null || x === undefined ? '—' : `${Math.round(x)} ms`)

function ciMarkdown(ci) {
  const room = ci.m10.flakes[ROOM] ?? { decided: 0, flaky: 0, rate: null }
  const rf = ci.m10.roomFailures
  const lines = [
    `## CI · ${ci.repo} · ${ci.window.since} → ${ci.window.until}`,
    '',
    `${ci.window.runs} runs of \`ci\`, ${ci.window.completedAttempts} completed attempts, ${ci.window.jobs} jobs.`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| M10 · room flake rate | ${pct(room.rate)} (${room.flaky} flaky of ${room.decided} decided commit·part pairs) |`,
    `| M10 · room failures of 1 test | ${rf.oneTest} of ${rf.withSummary} failed jobs with a summary (≤ 2 tests: ${rf.twoOrFewer}; no summary: ${rf.noSummary.length}) |`,
    `| M11 · room limit | ${ci.roomLimit} min (\`.github/workflows/ci.yml\`) |`,
    `| M12 · main commits green | ${pct(ci.m12.greenShare)} (${ci.m12.green} of ${ci.m12.green + ci.m12.red}; ${ci.m12.pending} pending) |`,
    `| M12 · hours main stayed red | ${num(ci.m12.redHours)} h in ${ci.m12.spans.length} spans${ci.m12.redSince ? `; red since ${ci.m12.redSince}` : ''} |`,
    '',
    '| Job | Ended | Success | Failure | Timeout | Superseded | Failure / decided | Flaky / decided | Success p50 / p90 (min) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...Object.entries(ci.m10.jobs).map(([job, t]) => {
      const f = ci.m10.flakes[job]
      const flake = f ? `${f.flaky} / ${f.decided}` : '—'
      return `| ${job} | ${t.total} | ${t.success} | ${t.failure} | ${t.timeout} | ${t.superseded} | ${pct(t.failureShare)} | ${flake} | ${num(t.successMinutes.p50)} / ${num(t.successMinutes.p90)} |`
    }),
    '',
    '| Day | Part | n | p50 | p90 | max | Margin of p90 | Timeouts |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...ci.m11.map(
      (r) =>
        `| ${r.day} | ${r.part} | ${r.n} | ${num(r.p50)} | ${num(r.p90)} | ${num(r.max)} | ${num(r.margin)} min (${pct(r.marginShare)}) | ${r.timeouts} |`,
    ),
  ]
  if (rf.topSpecs.length > 0) {
    lines.push('', `Specs that failed most in room jobs: ${rf.topSpecs.map(([s, n]) => `\`${s}\` ×${n}`).join(', ')}.`)
  }
  return lines
}

function fixtureMarkdown(fx) {
  const lines = [
    `## Fixture · ${fx.run?.commit ?? 'unknown commit'} · ${fx.run?.startedAt ?? ''}`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| M1 · keyed write, press → answer | p50 ${ms(fx.m1.total.p50)} · p95 ${ms(fx.m1.total.p95)} (${fx.m1.definitive}/${fx.m1.n} definitive; ${pct(fx.m1.withinFiveSeconds)} within 5 s) |`,
    `| M1 · overhead past the held reply | p50 ${ms(fx.m1.overhead.p50)} · p95 ${ms(fx.m1.overhead.p95)} |`,
    `| M2 · unknown outcome resolved by resend, same key | ${pct(fx.m2.share)} (${fx.m2.resolved}/${fx.m2.n}; written twice: ${fx.m2.duplicates}; resend → answer p50 ${ms(fx.m2.resend.p50)}) |`,
    `| M6 · failed reads shown / silent | ${fx.m6.visible} visible · ${fx.m6.silent} silent of ${fx.m6.reached} reached (${fx.m6.notReached.length} not reached) |`,
    `| M7 · 502/503 in HTML cured without a press | ${pct(fx.m7.share)} (${fx.m7.recovered}/${fx.m7.n}; time p50 ${ms(fx.m7.time.p50)} · p95 ${ms(fx.m7.time.p95)}) |`,
    '',
    '| M6 view | Failed reads | Shown |',
    '| --- | --- | --- |',
    ...fx.m6.samples.map(
      (s) =>
        `| ${s.view} | ${s.failedReads} | ${s.failedReads === 0 ? 'not reached' : s.visible ? 'visible' : 'silent'} |`,
    ),
  ]
  return lines
}

function markdown(report) {
  const lines = ['# Reliability report', '', `Generated ${report.generatedAt}.`, '']
  if (report.ci) lines.push(...ciMarkdown(report.ci), '')
  if (report.fixture) lines.push(...fixtureMarkdown(report.fixture), '')
  lines.push('## Not measurable yet', '', ...NOT_YET.map((n) => `- ${n.metric} (${n.what}): ${n.why}.`), '')
  return lines.join('\n')
}

function write(outDir, section, value) {
  mkdirSync(outDir, { recursive: true })
  const file = join(outDir, 'reliability.json')
  const kept = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const report = { ...kept, generatedAt: new Date().toISOString(), [section]: value, notMeasurable: NOT_YET }
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
  const text = markdown(report)
  writeFileSync(join(outDir, 'reliability.md'), text)
  process.stdout.write(`${text}\nWrote ${file} and reliability.md beside it.\n`)
}

async function main() {
  const { values } = parseArgs({
    options: {
      ci: { type: 'boolean' },
      fixture: { type: 'boolean' },
      run: { type: 'boolean' },
      since: { type: 'string' },
      repo: { type: 'string', default: 'davidelaverga/Sophia' },
      out: { type: 'string', default: join(ROOT, 'reliability-report') },
    },
  })
  if (!values.ci && !values.fixture) {
    process.stderr.write('Usage: reliability-report.mjs --ci [--since <ISO>] | --fixture [--run]  [--out <dir>]\n')
    process.exit(2)
  }
  if (values.ci) {
    const since = values.since ?? new Date(Date.now() - 7 * DAY).toISOString()
    write(values.out, 'ci', await measureCi({ repo: values.repo, since }))
  }
  if (values.fixture) write(values.out, 'fixture', measureFixture({ runSuite: values.run }))
}

await main()
