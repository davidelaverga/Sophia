// INC-COORD-1119-SUPABASE-ISOLATION-MAIN-001: only the existing 8e323 auth isolation on exact b81e61c8, retaining its Personal CI invocation.
// The lifecycle assertions below are reused from 8e323. No PR519 runner or runtime/bootstrap import.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { parse } from 'yaml'

const source = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
const BASE_AUTH_BLOCK =
  '  supabase-live:\n    name: Live auth on local Supabase\n    runs-on: ubuntu-24.04\n    timeout-minutes: 20\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0 (reads packageManager)\n      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0\n        with:\n          node-version-file: .node-version\n      - run: pnpm install --frozen-lockfile\n      # Supabase in Docker: ES256 signing key, db/migrations through the ledger runner, the API login.\n      - run: pnpm supabase:local\n      # Real GoTrue tokens verified through JWKS; tampered, legacy HS256 and publishable-key tokens rejected.\n      - run: pnpm test:supabase\n\n'
const BASE_WORKFLOW_SHA256 = '563dee616e8a31875fd359aee16ed50c9e060f7cd5f5b4c43339749d8d902468'
const baseJob = parse(BASE_AUTH_BLOCK)['supabase-live']

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

/** supabase-live as b81e61c8 had it: only the verified start's id and the verified stop are taken out. */
function withoutSupabaseIsolation(job) {
  const { env, ...rest } = job
  if (!isDeepStrictEqualTo(env, ISOLATION_ENV)) return job
  const { start, stop } = isolationAt(rest.steps)
  const steps = rest.steps.filter((_, i) => i !== stop).map((step, i) => (i === start ? { run: step.run } : step))
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

function assertIsolationJob(job) {
  assert.deepEqual(job.env, ISOLATION_ENV)
  isolationAt(job.steps)
  assert.deepEqual(withoutSupabaseIsolation(job), baseJob, 'only the reviewed isolation changes the main auth job')
}

function assertSource(text) {
  const ci = parse(text)
  assertIsolationJob(ci.jobs['supabase-live'])
  const block = /^  supabase-live:\n[\s\S]*?(?=^  [a-z][a-z0-9-]*:\n)/m.exec(text)
  assert.ok(block, 'one bounded auth job')
  const restored = text.slice(0, block.index) + BASE_AUTH_BLOCK + text.slice(block.index + block[0].length)
  assert.equal(
    createHash('sha256').update(restored).digest('hex'),
    BASE_WORKFLOW_SHA256,
    'every unrelated b81 workflow byte stays unchanged',
  )
}

describe('main Supabase attempt isolation: existing lifecycle and exact b81 baseline scope', () => {
  it('keeps the reviewed isolation and every unrelated b81 workflow byte', () => assertSource(source))
  it('rejects the original main job before isolation', () => assert.throws(() => assertIsolationJob(baseJob)))
  const cases = [
    [
      'missing environment',
      (j) => {
        delete j.env
      },
    ],
    [
      'wrong attempt identity',
      (j) => {
        j.env.SOPHIA_SUPABASE_ISOLATION = 'shared'
      },
    ],
    [
      'extra environment policy',
      (j) => {
        j.env.EXTRA = '1'
      },
    ],
    [
      'missing start id',
      (j) => {
        delete j.steps.find((s) => s.id === 'supabase').id
      },
    ],
    [
      'duplicate start',
      (j) => {
        j.steps.unshift(structuredClone(ISOLATED_START))
      },
    ],
    [
      'duplicate auth test',
      (j) => {
        j.steps.push({ run: 'pnpm test:supabase' })
      },
    ],
    [
      'missing cleanup',
      (j) => {
        j.steps.pop()
      },
    ],
    [
      'duplicate cleanup before auth',
      (j) => {
        j.steps.unshift(structuredClone(ISOLATED_STOP))
      },
    ],
    [
      'moved cleanup before auth',
      (j) => {
        const stop = j.steps.pop()
        j.steps.splice(j.steps.length - 1, 0, stop)
      },
    ],
    [
      'duplicate cleanup last',
      (j) => {
        j.steps.push(structuredClone(ISOLATED_STOP))
      },
    ],
    [
      'unreviewed stop command',
      (j) => {
        j.steps.unshift({ run: 'supabase stop --all' })
      },
    ],
    [
      'conditional cleanup weakened',
      (j) => {
        j.steps.at(-1).if = 'success()'
      },
    ],
    [
      'cleanup timeout changed',
      (j) => {
        j.steps.at(-1)['timeout-minutes'] = 4
      },
    ],
    [
      'cleanup continues on error',
      (j) => {
        j.steps.at(-1)['continue-on-error'] = true
      },
    ],
    [
      'auth command bypass',
      (j) => {
        j.steps.find((s) => s.run === 'pnpm test:supabase').run = 'true'
      },
    ],
    [
      'job timeout changed',
      (j) => {
        j['timeout-minutes'] = 21
      },
    ],
    [
      'extra runtime bootstrap',
      (j) => {
        j.steps.unshift({ run: 'pnpm artifacts' })
      },
    ],
    [
      'action pin changed',
      (j) => {
        j.steps[0].uses = 'actions/checkout@main'
      },
    ],
  ]
  for (const [name, change] of cases)
    it('rejects ' + name, () => {
      const job = structuredClone(parse(source).jobs['supabase-live'])
      change(job)
      assert.throws(() => assertIsolationJob(job))
    })
  it('rejects a changed trigger outside the auth job', () =>
    assert.throws(() => assertSource(source.replace('  push:', '  workflow_dispatch:'))))
  it('rejects an unrelated workflow comment edit', () => assert.throws(() => assertSource('// drift\n' + source)))
})
