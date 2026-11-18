// PR519-CI-PAIRING-REPAIR-001: the `ci` workflow's scheduling, read from the maintained file itself.
//
// A branch push and the pull request it updates used to share one concurrency group with cancel-in-progress, so the
// pull request's run (always a few seconds later) cancelled the push's run, and the push run's aggregate check, which
// runs under always(), then failed on its cancelled parts. These checks parse .github/workflows/ci.yml and evaluate its
// concurrency expressions for bounded GitHub contexts. The evaluator is a LOCAL MODEL of the few expression forms the
// two fields use (GitHub's documented `||`, `&&`, `==`, `!=` on strings), not GitHub's scheduler: it shows which runs
// share a group, and it refuses any other syntax rather than guess.
//
// PR519-CI-F2-OBSERVABILITY-001 adds the optional TAP record of `test:integration`: the runtime-unit job's diagnostics
// steps, and the runner (scripts/test-integration.mjs) itself, run for real on small fixture suites. A fixture is not
// F2: it shows what the record holds when a run fails, hangs and is ended, not why CI's run did.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'
import { parse } from 'yaml'
import { FLAGS, GLOB, REPORT_ENV, integrationArgs, reportFlags, runNode } from '../../scripts/test-integration.mjs'

const WORKFLOW = new URL('../../.github/workflows/ci.yml', import.meta.url)
const ci = parse(readFileSync(WORKFLOW, 'utf8'))

/** The group key d3e5ba9c shipped, under which a push and its pull request shared one lane. */
const D3E_GROUP = "ci-${{ github.head_ref || (github.ref_name == 'main' && github.sha) || github.ref_name }}"

const TOKEN = /\s*(\|\||&&|==|!=|\(|\)|'(?:[^']|'')*'|[A-Za-z_][\w.-]*)/y
function expression(source, ctx) {
  const tokens = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < source.trimEnd().length) {
    const m = TOKEN.exec(source)
    if (!m) throw new Error(`unsupported expression syntax at ${String(TOKEN.lastIndex)}: ${source}`)
    tokens.push(m[1])
  }
  let at = 0
  const next = () => tokens[at++]
  const truthy = (v) => v !== '' && v !== false && v !== null && v !== undefined
  function primary() {
    const t = next()
    if (t === '(') {
      const v = or()
      assert.equal(next(), ')', `unbalanced parentheses: ${source}`)
      return v
    }
    if (t?.startsWith("'")) return t.slice(1, -1).replaceAll("''", "'")
    if ((t?.startsWith('github.') || t?.startsWith('runner.')) && Object.hasOwn(ctx, t)) return ctx[t]
    throw new Error(`unsupported operand ${String(t)} in: ${source}`)
  }
  function comparison() {
    const left = primary()
    if (tokens[at] !== '==' && tokens[at] !== '!=') return left
    const op = next()
    // GitHub compares strings case-insensitively.
    const same = String(left).toLowerCase() === String(primary()).toLowerCase()
    return op === '==' ? same : !same
  }
  function and() {
    let v = comparison()
    while (tokens[at] === '&&') {
      next()
      const r = comparison()
      v = truthy(v) ? r : v
    }
    return v
  }
  function or() {
    let v = and()
    while (tokens[at] === '||') {
      next()
      const r = and()
      v = truthy(v) ? v : r
    }
    return v
  }
  const value = or()
  assert.equal(at, tokens.length, `trailing tokens in: ${source}`)
  return value
}
/** A `${{ }}` template, as GitHub interpolates it; a field that is one whole expression keeps the expression's value. */
function evaluate(template, ctx) {
  // A literal YAML value (`cancel-in-progress: false`) is its own value: there is nothing to interpolate.
  if (typeof template !== 'string') return template
  const whole = /^\$\{\{(.*)\}\}$/s.exec(template)
  if (whole && !whole[1].includes('}}')) return expression(whole[1], ctx)
  return template.replace(/\$\{\{(.*?)\}\}/g, (_, e) => String(expression(e, ctx)))
}

// The values GitHub documents for each event: head_ref is set only on pull_request, whose ref_name is `<n>/merge` and
// whose sha is the merge commit's.
const push = (branch, sha) => ({ 'github.event_name': 'push', 'github.head_ref': '', 'github.ref_name': branch, 'github.sha': sha })
const pullRequest = (branch, n, mergeSha) => ({ 'github.event_name': 'pull_request', 'github.head_ref': branch, 'github.ref_name': `${String(n)}/merge`, 'github.sha': mergeSha })
const lane = (ctx, group = ci.concurrency.group) => ({ group: evaluate(group, ctx), cancel: evaluate(ci.concurrency['cancel-in-progress'], ctx) })

const BRANCH = 'inc04-s01b-coherent-001'

describe('ci concurrency: a push and its pull request are separate lanes (PR519-CI-PAIRING-REPAIR-001)', () => {
  it('fail-before: under d3e5ba9c’s group, the pull request for the same head joins the push’s group with cancel-in-progress', () => {
    const p = lane(push(BRANCH, 'd3e5ba9c'), D3E_GROUP)
    const r = lane(pullRequest(BRANCH, 519, 'cab9abe0'), D3E_GROUP)
    assert.equal(p.group, `ci-${BRANCH}`)
    assert.equal(r.group, p.group, 'one group: the later pull request run cancels the push run (8 of 8 heads on PR519)')
    assert.equal(r.cancel, true)
  })

  it('the push and the pull request for the same head are in different groups, so neither cancels the other', () => {
    const p = lane(push(BRANCH, 'd3e5ba9c'))
    const r = lane(pullRequest(BRANCH, 519, 'cab9abe0'))
    assert.equal(p.group, `ci-push-${BRANCH}`)
    assert.equal(r.group, `ci-pull_request-${BRANCH}`)
    assert.notEqual(p.group, r.group)
  })

  it('a newer push on a branch still cancels the older push', () => {
    const older = lane(push(BRANCH, 'e62c4ad5'))
    const newer = lane(push(BRANCH, 'd3e5ba9c'))
    assert.equal(newer.group, older.group)
    assert.equal(newer.cancel, true)
  })

  it('a newer pull request event still cancels the older pull request run', () => {
    const older = lane(pullRequest(BRANCH, 519, 'aaaa0001'))
    const newer = lane(pullRequest(BRANCH, 519, 'aaaa0002'))
    assert.equal(newer.group, older.group)
    assert.equal(newer.cancel, true)
  })

  it('the trade-off, as it is: a newer push does not cancel an older pull request run; the next pull request event does', () => {
    const olderPr = lane(pullRequest(BRANCH, 519, 'aaaa0001'))
    assert.notEqual(lane(push(BRANCH, 'd3e5ba9c')).group, olderPr.group)
    assert.equal(lane(pullRequest(BRANCH, 519, 'aaaa0002')).group, olderPr.group)
  })

  it('different branches stay in different groups, for pushes and for pull requests', () => {
    assert.notEqual(lane(push('a-branch', 's1')).group, lane(push('b-branch', 's1')).group)
    assert.notEqual(lane(pullRequest('a-branch', 1, 'm1')).group, lane(pullRequest('b-branch', 2, 'm1')).group)
  })

  it('main keeps every commit: each is its own group, and nothing on main is cancelled', () => {
    const c1 = lane(push('main', 'c1c1c1c1'))
    const c2 = lane(push('main', 'c2c2c2c2'))
    assert.equal(c1.group, 'ci-push-c1c1c1c1')
    assert.notEqual(c1.group, c2.group)
    assert.equal(c1.cancel, false)
    assert.equal(c2.cancel, false)
    assert.equal(lane(push(BRANCH, 's')).cancel, true, 'a branch push is still cancellable by a newer one')
  })

  it('the model refuses syntax it does not know instead of guessing', () => {
    assert.throws(() => evaluate("ci-${{ format('{0}', github.ref) }}", push(BRANCH, 's')), /unsupported/)
    assert.throws(() => evaluate('ci-${{ github.run_id }}', push(BRANCH, 's')), /unsupported operand/)
  })
})

describe('ci: everything else in the workflow is unchanged from d3e5ba9c', () => {
  it('triggers, permissions, jobs, check names and action pins are the ones d3e5ba9c carried', () => {
    assert.deepEqual(Object.keys(ci.on), ['push', 'pull_request'])
    assert.equal(ci.on.push, null, 'every branch push runs')
    assert.equal(ci.on.pull_request, null, 'every pull request event runs')
    assert.deepEqual(ci.permissions, { contents: 'read' })
    assert.deepEqual(
      Object.entries(ci.jobs).map(([id, job]) => [id, job.name ?? id]),
      [
        ['runtime-unit', 'runtime-unit'],
        ['renderer', 'Confined PDF renderer on a real Chromium'],
        ['database', 'SQL, persistence and API on PostgreSQL 16'],
        ['room-media', 'Media bridge against a real LiveKit server'],
        ['supabase-live', 'Live auth on local Supabase'],
        ['studio-browser-part', 'The room in Chromium, part ${{ matrix.part }} of 3'],
        ['studio-browser', 'The room in Chromium, on its fixture page'],
      ],
    )
    const pins = new Set(Object.values(ci.jobs).flatMap((job) => (job.steps ?? []).map((s) => s.uses).filter(Boolean)))
    assert.deepEqual([...pins].toSorted(), [
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
      // The diagnostics upload (PR519-CI-F2-OBSERVABILITY-001): the repository's existing v7.0.1 pin.
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      'pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413',
    ])
    assert.equal(ci.jobs['studio-browser-part'].strategy['fail-fast'], false)
    assert.deepEqual(ci.jobs['studio-browser-part'].strategy.matrix.part, [1, 2, 3])
  })

  it('the whole parsed workflow, apart from the concurrency group, the diagnostics and the Supabase isolation, is the structure d3e5ba9c parsed to', () => {
    // A digest of the parsed workflow with concurrency.group set back to d3e5ba9c's value, runtime-unit's steps set
    // back to its four (install, `pnpm check`, the dsh source; the diagnostics are checked below) and supabase-live
    // without exactly the reviewed attempt isolation. Any other change to a trigger, job, step, timeout, service, pin,
    // permission, matrix or the aggregate changes it; update it only with a reviewed reason.
    assert.deepEqual(ci.jobs['supabase-live'].env, ISOLATION_ENV)
    isolationAt(ci.jobs['supabase-live'].steps)
    const rest = structuredClone(ci)
    rest.concurrency.group = D3E_GROUP
    rest.jobs['runtime-unit'].steps = withoutDiagnostics(withoutLinuxRecord(rest.jobs['runtime-unit'].steps))
    rest.jobs['supabase-live'] = withoutSupabaseIsolation(rest.jobs['supabase-live'])
    const digest = createHash('sha256').update(JSON.stringify(rest)).digest('hex')
    assert.equal(digest, 'fc501764446a618da3ad44170b8cbf0fe266943c13e31903986c04e37110448f')
  })
})

describe('ci: the room’s aggregate check still passes only when every part ran and passed', () => {
  const aggregate = ci.jobs['studio-browser']

  it('runs even after a cancellation, so it is never absent, and reads the parts’ combined result', () => {
    assert.equal(aggregate.needs, 'studio-browser-part')
    assert.equal(aggregate.if, 'always()')
    assert.equal(aggregate.steps.length, 1)
    assert.equal(aggregate.steps[0].env.PARTS, '${{ needs.studio-browser-part.result }}')
  })

  // The step's own shell text, run as GitHub runs it (bash -e), for each result `needs` can report. A part that timed
  // out reports `failure` or `cancelled` there, never success.
  for (const [parts, ok] of [
    ['success', true],
    ['failure', false],
    ['cancelled', false],
    ['skipped', false],
  ]) {
    it(`parts ${parts}: the aggregate ${ok ? 'passes' : 'fails'}`, () => {
      const run = spawnSync('bash', ['-e', '-c', aggregate.steps[0].run], { env: { PATH: process.env.PATH, PARTS: parts }, encoding: 'utf8' })
      assert.equal(run.stdout.trim(), `The room's three parts: ${parts}`)
      assert.equal(run.status === 0, ok, `exit ${String(run.status)}`)
    })
  }
})

// ---- PR519-CI-F2-OBSERVABILITY-001: the optional TAP record of `test:integration` ----

const DIAGNOSTICS_DIR = '$RUNNER_TEMP/sophia-ci-diagnostics'
const TAP_PATH = '${{ runner.temp }}/sophia-ci-diagnostics/integration.tap'
const PREPARE = { name: 'Prepare the diagnostics directory', run: `mkdir -p "${DIAGNOSTICS_DIR}"` }
const UPLOAD = {
  name: 'Upload the integration TAP report',
  if: 'always()',
  'timeout-minutes': 3,
  uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  with: {
    name: 'integration-tap-${{ github.run_id }}-${{ github.run_attempt }}',
    path: TAP_PATH,
    'if-no-files-found': 'warn',
    'retention-days': 7,
  },
}

// INC-COORD-1118-LINUX-RECORD-PRODUCER-001: only these exact additions are normalized for the old fingerprint.
const RECORD_IF = "failure() && github.event_name == 'push' && steps.canonical.outcome == 'failure'"
const RECORD_SHELL = 'node scripts/ci/linux-runtime-record.mjs capture {0}'
const RECORD = {
  name: 'Retain a guarded Linux runtime record after the failed check',
  id: 'linux_record',
  if: RECORD_IF + " && steps.canonical.outputs.capture_ready == 'true'",
  'timeout-minutes': 1,
  env: {
    SOPHIA_CANONICAL_OUTCOME: '${{ steps.canonical.outcome }}',
    SOPHIA_CAPTURE_READY: '${{ steps.canonical.outputs.capture_ready }}',
    SOPHIA_CAPTURE_ID: '${{ steps.canonical.outputs.capture_id }}',
    SOPHIA_CAPTURE_SHA256: '${{ steps.canonical.outputs.capture_sha256 }}',
  },
  run: 'node scripts/ci/linux-runtime-record.mjs produce',
}
const RECORD_UPLOAD = {
  name: 'Upload the unaccepted Linux runtime record',
  if: RECORD_IF + " && steps.linux_record.outputs.packet_ready == 'true'",
  'timeout-minutes': 1,
  uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  with: {
    name: 'linux-runtime-record-${{ github.run_id }}-${{ github.run_attempt }}-${{ steps.canonical.outputs.capture_id }}',
    path: '${{ steps.linux_record.outputs.packet_path }}',
    'if-no-files-found': 'warn',
    'retention-days': 7,
  },
}
function withoutLinuxRecord(steps) {
  const canonical = steps.filter((step) => step.run === 'pnpm check')
  assert.equal(canonical.length, 1)
  assert.deepEqual(canonical[0], { id: 'canonical', 'timeout-minutes': 25, shell: RECORD_SHELL, env: { [REPORT_ENV]: TAP_PATH }, run: 'pnpm check' })
  const record = steps.filter((step) => step.name === RECORD.name)
  const upload = steps.filter((step) => step.name === RECORD_UPLOAD.name)
  assert.deepEqual(record, [RECORD])
  assert.deepEqual(upload, [RECORD_UPLOAD])
  const order = [canonical[0], steps.find((step) => step.name === UPLOAD.name), record[0], upload[0], steps.find((step) => step.name === 'Pinned dsh source and release provenance')].map((step) => steps.indexOf(step))
  assert.ok(order.every((index, at) => index >= 0 && (at === 0 || order[at - 1] < index)))
  return steps.filter((step) => step !== record[0] && step !== upload[0]).map((step) => {
    if (step !== canonical[0]) return step
    const { id, shell, ...original } = step
    return original
  })
}

/** runtime-unit's steps without the diagnostics, as 805523a1 had them; anything else that changed is left in place. */
function withoutDiagnostics(steps) {
  return steps
    .filter((step) => !(isDeepStrictEqualTo(step, PREPARE) || isDeepStrictEqualTo(step, UPLOAD)))
    .map((step) => {
      if (step.run !== 'pnpm check') return step
      const { 'timeout-minutes': limit, env, ...rest } = step
      const diagnostic = limit === 25 && isDeepStrictEqualTo(env, { [REPORT_ENV]: TAP_PATH })
      return diagnostic ? rest : step
    })
}
// CI-3A1E-SUPABASE-ISOLATION-REPAIR-001: the Supabase job's own project, ports and cleanup (scripts/supabase-local.ts).
const ISOLATION_ENV = { SOPHIA_SUPABASE_ISOLATION: '${{ github.run_id }}-${{ github.run_attempt }}' }
const ISOLATED_START = { id: 'supabase', run: 'pnpm supabase:local' }
const ISOLATED_STOP = {
  name: "Stop this attempt's Supabase project",
  if: "always() && steps.supabase.outcome != 'skipped'",
  'timeout-minutes': 3,
  run: 'node scripts/supabase-local.ts --stop',
}

/**
 * Where the reviewed start and stop are, asserted: exactly one start, immediately before the one auth test, and exactly
 * one stop, immediately after it and last. Any other step that stops Supabase (a duplicate, or one moved before the
 * auth test, even with another name or condition) fails here, before any normalization.
 */
function isolationAt(steps) {
  const where = (predicate) => steps.flatMap((step, i) => (predicate(step) ? [i] : []))
  const auth = where((step) => step.run === 'pnpm test:supabase')
  const starts = where((step) => isDeepStrictEqualTo(step, ISOLATED_START))
  const stops = where((step) => isDeepStrictEqualTo(step, ISOLATED_STOP))
  const stopping = where((step) => /supabase-local\.ts --stop|supabase stop/.test(step.run ?? ''))
  assert.equal(auth.length, 1, 'one auth test step')
  assert.deepEqual(stops, [auth[0] + 1], 'exactly one reviewed stop, immediately after the auth test')
  assert.deepEqual(stopping, stops, 'no other step stops Supabase')
  assert.equal(stops[0], steps.length - 1, 'the owned cleanup is the last step')
  assert.deepEqual(starts, [auth[0] - 1], 'exactly one reviewed start, immediately before the auth test')
  return { start: starts[0], stop: stops[0] }
}

/** supabase-live as d3e5ba9c had it: only the verified start's id and the verified stop are taken out. */
function withoutSupabaseIsolation(job) {
  const { env, ...rest } = job
  if (!isDeepStrictEqualTo(env, ISOLATION_ENV)) return job
  const { start, stop } = isolationAt(rest.steps)
  const steps = rest.steps
    .filter((_, i) => i !== stop)
    .map((step, i) => (i === start ? { run: step.run } : step))
  return { ...rest, steps }
}
function isDeepStrictEqualTo(a, b) {
  try {
    assert.deepStrictEqual(a, b)
    return true
  } catch {
    return false
  }
}

describe('ci: runtime-unit records the integration suite as TAP, and the record never decides the job', () => {
  const job = ci.jobs['runtime-unit']
  const at = (predicate) => job.steps.findIndex(predicate)
  const check = job.steps[at((s) => s.run === 'pnpm check')]
  const upload = job.steps[at((s) => s.uses?.startsWith('actions/upload-artifact@'))]

  it('the check still runs `pnpm check`, under a step limit below the job’s, which is unchanged; nothing continues on error', () => {
    assert.equal(job['timeout-minutes'], 30)
    assert.equal(check.run, 'pnpm check')
    assert.equal(check['timeout-minutes'], 25)
    assert.ok(check['timeout-minutes'] + upload['timeout-minutes'] < job['timeout-minutes'], 'the upload still fits after a cut-off check')
    for (const [id, j] of Object.entries(ci.jobs)) {
      assert.equal('continue-on-error' in j, false, `${id} does not continue on error`)
      for (const step of j.steps ?? []) assert.equal('continue-on-error' in step, false, `${id}: ${step.name ?? step.run ?? step.uses}`)
    }
  })

  it('the prepared directory is the only thing created, and the check’s report path lies in it and is accepted by the runner', () => {
    const runnerTemp = mkdtempSync(join(tmpdir(), 'ci-runner-temp-'))
    try {
      const prepare = job.steps[at((s) => s.name === PREPARE.name)]
      assert.deepEqual(prepare, PREPARE)
      const run = spawnSync('bash', ['-e', '-c', prepare.run], { env: { PATH: process.env.PATH, RUNNER_TEMP: runnerTemp }, encoding: 'utf8' })
      assert.equal(run.status, 0, run.stderr)
      assert.deepEqual(readdirSync(runnerTemp), ['sophia-ci-diagnostics'])
      assert.deepEqual(Object.keys(check.env), [REPORT_ENV], 'the workflow sets exactly the variable the runner reads')
      const path = evaluate(check.env[REPORT_ENV], { 'runner.temp': runnerTemp })
      assert.equal(path, join(runnerTemp, 'sophia-ci-diagnostics', 'integration.tap'))
      assert.deepEqual(reportFlags(path), ['--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=tap', `--test-reporter-destination=${path}`])
    } finally {
      rmSync(runnerTemp, { recursive: true, force: true })
    }
  })

  it('the upload is attempted after the check whatever its result, holds only that file, and runs before the steps it must not block', () => {
    assert.deepEqual(upload, UPLOAD)
    assert.equal(evaluate(upload.with.path, { 'runner.temp': '/rt' }), evaluate(check.env[REPORT_ENV], { 'runner.temp': '/rt' }))
    const order = [at((s) => s.name === PREPARE.name), at((s) => s.run === 'pnpm check'), at((s) => s === upload), at((s) => s.name === 'Pinned dsh source and release provenance')]
    assert.deepEqual(order, [...order].toSorted((a, b) => a - b))
    assert.ok(order.every((i) => i >= 0))
    assert.equal(job.steps.at(-1).if, undefined, 'the dsh source step still runs only after everything before it succeeded')
  })

  it('package.json: only `test:integration` changed, to the runner, and the check prepares the runtime before the unit tests', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    assert.equal(pkg.scripts['test:integration'], 'node scripts/test-integration.mjs')
    // CI-3A1E-SUPABASE-ISOLATION-REPAIR-001: the SDK unit tests read the deployed runtime, so `artifacts` builds and
    // verifies it before `test`; every phase is kept, in one `&&` chain.
    assert.equal(pkg.scripts.check, 'pnpm toolchain:check && pnpm format:check && pnpm lint && pnpm build && pnpm typecheck && pnpm contracts:check && pnpm artifacts && pnpm test && pnpm test:integration')
    assert.deepEqual(pkg.scripts.check.split(' && ').toSorted(), OLD_CHECK.split(' && ').toSorted())
    pkg.scripts.check = OLD_CHECK
    pkg.scripts['test:integration'] = OLD_INTEGRATION_SCRIPT
    assert.equal(createHash('sha256').update(JSON.stringify(pkg)).digest('hex'), '8772bc1b090356ae795da35c821e5825c9b8df9b92eddb51bf8ae83e4bce4f16')
  })
})

/** 805523a1's `test:integration`, whose flags and glob the runner keeps. */
const OLD_INTEGRATION_SCRIPT = 'node --test --test-concurrency=1 --test-timeout=180000 "tests/integration/**/*.test.mjs"'
/** 805523a1's check chain, which ran the unit tests before the artifacts. */
const OLD_CHECK = 'pnpm toolchain:check && pnpm format:check && pnpm lint && pnpm build && pnpm typecheck && pnpm contracts:check && pnpm test && pnpm artifacts && pnpm test:integration'
const RUNNER = fileURLToPath(new URL('../../scripts/test-integration.mjs', import.meta.url))

describe('scripts/test-integration.mjs: the same suite, one run, and an optional TAP file', () => {
  const dirs = []
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  })
  /** A throwaway project: `files` maps relative paths to their source. */
  function fixture(files) {
    const dir = mkdtempSync(join(tmpdir(), 'f2-fixture-'))
    dirs.push(dir)
    for (const [rel, src] of Object.entries(files)) {
      mkdirSync(join(dir, rel, '..'), { recursive: true })
      writeFileSync(join(dir, rel), src)
    }
    return dir
  }
  // The fixture run is a top-level run of its own: this file's runner context (NODE_TEST_CONTEXT, which makes a nested
  // `node --test` act as a child reporting to its parent) and any report path from outside are not passed on.
  const envWithout = (extra = {}) => {
    const env = { ...process.env, ...extra }
    delete env.NODE_TEST_CONTEXT
    if (!(REPORT_ENV in extra)) delete env[REPORT_ENV]
    return env
  }
  const cli = (cwd, args = [], extra = {}) => spawnSync(process.execPath, [RUNNER, ...args], { cwd, env: envWithout(extra), encoding: 'utf8', timeout: 120_000 })
  // Each file marks its start and end; a file that finds another started but not ended fails: one file at a time.
  const oneAtATime = (name) => `
import { test } from 'node:test'
import { appendFileSync, existsSync, readdirSync } from 'node:fs'
test('${name} runs alone', async () => {
  appendFileSync('runs.log', '${name}\\n')
  appendFileSync('${name}.start', '')
  await new Promise((r) => setTimeout(r, 300))
  const open = readdirSync('.').filter((f) => f.endsWith('.start') && f !== '${name}.start' && !existsSync(f.replace('.start', '.done')))
  if (open.length) throw new Error('overlapping files: ' + open.join(' '))
  appendFileSync('${name}.done', '')
})
`
  const suite = () =>
    fixture({
      'tests/integration/a.test.mjs': oneAtATime('a'),
      'tests/integration/nested/b.test.mjs': oneAtATime('b'),
      'tests/other/outside.test.mjs': oneAtATime('outside'),
    })
  const ran = (dir) => (existsSync(join(dir, 'runs.log')) ? readFileSync(join(dir, 'runs.log'), 'utf8').trim().split('\n').toSorted() : [])
  const taps = (dir) => readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.tap'))

  it('passes exactly 805523a1’s flags and glob, the report flags only when asked, and the caller’s arguments after the glob', () => {
    assert.deepEqual(['node', ...integrationArgs()].join(' '), OLD_INTEGRATION_SCRIPT.replaceAll('"', ''))
    assert.deepEqual(FLAGS, ['--test', '--test-concurrency=1', '--test-timeout=180000'])
    assert.equal(GLOB, 'tests/integration/**/*.test.mjs')
    assert.deepEqual(integrationArgs(['x.test.mjs', '--test-name-pattern=y']), [...FLAGS, GLOB, 'x.test.mjs', '--test-name-pattern=y'])
    const dir = fixture({})
    const tap = join(dir, 'r.tap')
    assert.deepEqual(integrationArgs([], tap), [...FLAGS, '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=tap', `--test-reporter-destination=${tap}`, GLOB])
  })

  it('refuses a report path that is relative, not .tap, or in a directory that does not exist', () => {
    const dir = fixture({})
    assert.throws(() => reportFlags('reports/r.tap'), /absolute/)
    assert.throws(() => reportFlags(join(dir, 'r.txt')), /\.tap/)
    assert.throws(() => reportFlags(join(dir, 'missing', 'r.tap')), /does not exist/)
    assert.deepEqual(reportFlags(undefined), [])
    assert.deepEqual(reportFlags(''), [])
  })

  it('normal mode: every file under tests/integration, once each and one at a time, spec on stdout, no report written', () => {
    const dir = suite()
    const run = cli(dir)
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.deepEqual(ran(dir), ['a', 'b'], 'both files ran once; nothing outside the glob')
    assert.match(run.stdout, /✔ a runs alone/)
    assert.doesNotMatch(run.stdout, /TAP version/)
    assert.deepEqual(taps(dir), [])
  })

  it('the caller’s arguments still reach node: an extra file is run as well', () => {
    const dir = suite()
    const run = cli(dir, ['tests/other/outside.test.mjs'])
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.deepEqual(ran(dir), ['a', 'b', 'outside'])
  })

  it('report mode: the same run, spec on stdout and TAP in the file', () => {
    const dir = suite()
    mkdirSync(join(dir, 'diag'))
    const tap = join(dir, 'diag', 'integration.tap')
    const run = cli(dir, [], { [REPORT_ENV]: tap })
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.deepEqual(ran(dir), ['a', 'b'])
    assert.match(run.stdout, /✔ a runs alone/)
    assert.doesNotMatch(run.stdout, /TAP version/)
    const report = readFileSync(tap, 'utf8')
    assert.match(report, /^TAP version 13\n/)
    assert.match(report, /^ok \d+ - a runs alone$/m)
    assert.match(report, /^ok \d+ - b runs alone$/m)
    assert.match(report, /^1\.\.2$/m)
  })

  it('a refused report path runs nothing and exits 2', () => {
    const dir = suite()
    const run = cli(dir, [], { [REPORT_ENV]: 'relative.tap' })
    assert.equal(run.status, 2)
    assert.match(run.stderr, /absolute/)
    assert.deepEqual(ran(dir), [])
  })

  const failing = () =>
    fixture({
      'tests/integration/fails.test.mjs': `
import { test } from 'node:test'
test('canary passes', () => {})
test('canary fails with its own error', () => { throw new Error('F2-FIXTURE-CANARY-ERROR') })
`,
    })

  it('a failing test fails the command, with or without the report, and the report names the failure', () => {
    const plain = cli(failing())
    assert.equal(plain.status, 1, 'the failure is not masked')
    const dir = failing()
    const tap = join(dir, 'r.tap')
    const reported = cli(dir, [], { [REPORT_ENV]: tap })
    assert.equal(reported.status, 1, 'the failure is not masked by the report')
    const report = readFileSync(tap, 'utf8')
    assert.match(report, /^not ok \d+ - canary fails with its own error$/m)
    assert.match(report, /F2-FIXTURE-CANARY-ERROR/)
  })

  it('a run that fails, then hangs, then is ended: the file already held the failure, and the end is not a pass', async () => {
    const dir = fixture({
      'tests/integration/hangs.test.mjs': `
import { test } from 'node:test'
test('canary passes', () => {})
test('canary fails with its own error', () => { throw new Error('F2-FIXTURE-CANARY-ERROR') })
test('then never ends', () => new Promise(() => { setInterval(() => {}, 1000) }))
`,
    })
    const tap = join(dir, 'r.tap')
    // Its own process group, so everything it started can be ended and checked as one.
    const child = spawn(process.execPath, [RUNNER], { cwd: dir, env: envWithout({ [REPORT_ENV]: tap }), detached: true, stdio: 'ignore' })
    const exited = new Promise((done) => child.once('exit', (code, signal) => done({ code, signal })))
    const groupGone = () => {
      try {
        process.kill(-child.pid, 0)
        return false
      } catch (error) {
        return error.code === 'ESRCH'
      }
    }
    try {
      let seen = ''
      for (let i = 0; i < 600 && !/F2-FIXTURE-CANARY-ERROR/.test(seen); i += 1) {
        await new Promise((r) => setTimeout(r, 100))
        seen = existsSync(tap) ? readFileSync(tap, 'utf8') : ''
      }
      assert.match(seen, /^not ok \d+ - canary fails with its own error$/m, 'the failure is in the file')
      assert.match(seen, /F2-FIXTURE-CANARY-ERROR/)
      assert.equal(child.exitCode, null, 'while the run is still going')
      assert.equal(child.signalCode, null)
      child.kill('SIGTERM') // the runner alone; it forwards the signal to its node --test
      const outcome = await within(30_000, exited, 'the runner after SIGTERM')
      assert.ok(outcome.code !== 0 || outcome.signal !== null, `ended, not passed: ${JSON.stringify(outcome)}`)
      // Forwarded, node --test ends its own file processes: the group empties by itself, before any kill of ours.
      for (let i = 0; i < 100 && !groupGone(); i += 1) await new Promise((r) => setTimeout(r, 100))
      assert.ok(groupGone(), 'the forwarded signal ended the whole run, not only the runner')
      const report = readFileSync(tap, 'utf8')
      assert.match(report, /F2-FIXTURE-CANARY-ERROR/, 'the failure is still there after the end')
      assert.match(report, /^# Interrupted while running: /m, 'the interruption itself is recorded')
      assert.doesNotMatch(report, /^ok \d+ - then never ends$/m, 'the hanging test is never reported as passing')
    } finally {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
      for (let i = 0; i < 50 && !groupGone(); i += 1) await new Promise((r) => setTimeout(r, 100))
      assert.ok(groupGone(), 'nothing of the owned process group is left')
    }
  })

  it('runNode passes on the child’s own exit code and terminating signal, and fails when it cannot start', async () => {
    assert.deepEqual(await runNode(['-e', 'process.exit(7)'], { stdio: 'ignore' }), { code: 7, signal: null })
    assert.deepEqual(await runNode(['-e', "process.kill(process.pid, 'SIGTERM')"], { stdio: 'ignore' }), { code: null, signal: 'SIGTERM' })
    await assert.rejects(runNode(['-e', '0'], { execPath: join(tmpdir(), 'no-such-node-f2'), stdio: 'ignore' }), { code: 'ENOENT' })
  })
})

/** Settle `p` within `ms`, or fail. */
function within(ms, p, what) {
  return Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what}: not within ${String(ms)} ms`)), ms).unref())])
}
