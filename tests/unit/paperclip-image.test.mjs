// WBC-02 (WBC-02-CX-0036 and the review of its correction): the image qualification's verdicts, on recorded inputs. A
// complete, legitimate run is the positive control; each fault below is one Codex executed against the helpers
// (missing peak and current, an OOM event without a kill, a start past its health deadline, a changed adapter
// registry, a growing record truncated, a missing group-OOM counter, a step whose recorded facts do not hold) or one of
// the same kind, and none of them may read as qualified.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compareSnapshots } from '../../scripts/paperclip-image-home.mjs'
import { assess, LIMIT_BYTES, PHASES, PROBE_STEPS } from '../../scripts/paperclip-image-receipt.mjs'
import { redact } from '../../scripts/paperclip-image-redact.mjs'

const CANDIDATE = 'a'.repeat(40)
const PIN = '5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb'
const digest = (c) => `sha256:${c.repeat(64)}`
const PLUGIN = '11111111-1111-4111-8111-111111111111'
const ISSUE = '22222222-2222-4222-8222-222222222222'
const CONFIG = 'c'.repeat(64)

const LOG = 'instances/default/logs/server.log'
const files = [
  { path: 'adapter-plugins.json', size: 120, sha256: '1'.repeat(64) },
  { path: 'instances/default/config.json', size: 900, sha256: '2'.repeat(64) },
  { path: LOG, size: 4000, sha256: '3'.repeat(64) },
]
/** The log grew to 5000 bytes, its first 4000 the ones it had: the prefix the later snapshot read. */
const grown = { files: files.map((f) => (f.path === LOG ? { ...f, size: 5000, sha256: '9'.repeat(64) } : f)), prefixes: { [LOG]: { size: 4000, sha256: '3'.repeat(64) } } }

/** What each step observed in a legitimate run, as the probe records it. */
const FACTS = {
  first: {
    health: { status: 'ok' },
    'host-name guard': { privateName: 200, otherName: 403 },
    'first admin and board key': { signUp: 200, claim: 200, boardKey: 201, boardKeyMinted: true },
    'plugin installed and configured': { pluginId: PLUGIN, install: 200, status: 'ready', config: 200 },
    'signed commission and its resend': { issueId: ISSUE, first: 'created', resend: 'existing', resendIssueId: ISSUE },
    'signed Stop and its resend': { issueId: ISSUE, first: 'applied', firstStatus: 'cancelled', resend: 'already', status: 'cancelled' },
    'scheduled settle job': { runId: 'run-1', status: 'succeeded' },
    lookup: { outcome: 'found', issueId: ISSUE, status: 'cancelled' },
    'config digest': { sha256: CONFIG },
  },
  restarted: {
    health: { status: 'ok' },
    'plugin ready again': { pluginId: PLUGIN, status: 'ready' },
    'config unchanged': { before: CONFIG, after: CONFIG },
    'same issue found, still cancelled': { outcome: 'found', issueId: ISSUE, status: 'cancelled' },
    'commission resend answered by the same issue': { outcome: 'existing', issueId: ISSUE },
    'sign-up refused': { status: 400 },
    'host-name guard': { privateName: 200, otherName: 403 },
  },
}
const probe = (phase) => ({
  phase,
  outcome: 'passed',
  steps: PROBE_STEPS[phase].map((step) => ({ step, ok: true, ms: 10, detail: { ...FACTS[phase][step] } })),
})
const sample = (label) => ({
  label,
  running: true,
  oomKilled: false,
  unavailable: [],
  max: LIMIT_BYTES,
  swapMax: 0,
  peak: 1_100_000_000,
  current: 1_000_000_000,
  events: { low: 0, high: 0, max: 0, oom: 0, oom_kill: 0, oom_group_kill: 0 },
  cgroup: { path: '/system.slice/docker-x.scope', source: 'process' },
})

/** A complete, legitimate run's records: the positive control every fault below changes in one place. */
function complete() {
  return {
    context: { candidate: CANDIDATE, pin: PIN },
    identity: {
      pin: PIN,
      sophiaCommit: CANDIDATE,
      sophiaTreeDirty: false,
      manifestSha256: 'b'.repeat(64),
      manifestMatches: true,
      verifyManifestInImage: true,
      buildImage: { id: digest('c'), size: 6e9, os: 'linux', architecture: 'amd64' },
      image: { id: digest('d'), size: 3e9, os: 'linux', architecture: 'amd64' },
    },
    timings: ['first', 'restart', 'recreated'].map((label) => ({ label, ok: true, seconds: 45 })),
    samples: PHASES.map(sample),
    probes: { first: probe('first'), restarted: probe('restarted') },
    home: { before: { files }, after: grown },
  }
}

const verdictOf = (inputs) => assess(inputs).verdict
const resultOf = (inputs, name) => assess(inputs).checks.find((c) => c.name.startsWith(name))?.result
const withFacts = (phase, step, change) => {
  const run = complete()
  const target = run.probes[phase].steps.find((s) => s.step === step)
  target.detail = change(target.detail)
  return run
}
const withSample = (phase, change) => {
  const run = complete()
  run.samples = run.samples.map((s) => (s.label === phase ? change({ ...s, events: { ...s.events } }) : s))
  return run
}

describe('the image qualification receipt (WBC-02-CX-0036)', () => {
  it('positive control: a complete run is qualified, every check passed', () => {
    const receipt = assess(complete())
    assert.equal(receipt.verdict, 'qualified')
    assert.ok(receipt.checks.every((c) => c.result === 'passed'))
    assert.equal(receipt.checks.length, 1 + 3 + PHASES.length + 2 + 1)
  })

  it('CX-0036: a memory sample without peak and current is not qualified, even with nothing listed unavailable', () => {
    const run = complete()
    run.samples = run.samples.map(({ peak: _peak, current: _current, ...s }) => s)
    assert.equal(verdictOf(run), 'incomplete')
    assert.equal(resultOf(run, 'memory, first:after-flow'), 'unavailable')
  })

  it('CX-0036: an OOM event fails the phase, killed or not', () => {
    assert.equal(verdictOf(withSample('recreated:after-flow', (s) => ({ ...s, events: { ...s.events, oom: 1 } }))), 'failed')
    assert.equal(verdictOf(withSample('first:after-flow', (s) => ({ ...s, events: { ...s.events, oom_kill: 1 } }))), 'failed')
    assert.equal(verdictOf(withSample('first:idle', (s) => ({ ...s, events: { ...s.events, oom_group_kill: 1 } }))), 'failed')
    assert.equal(verdictOf(withSample('restart:healthy', (s) => ({ ...s, oomKilled: true }))), 'failed')
  })

  it('CX-0036: a start reported ok past the health deadline fails', () => {
    const run = complete()
    run.timings[1] = { label: 'restart', ok: true, seconds: 420 }
    assert.equal(verdictOf(run), 'failed')
    assert.equal(resultOf(run, 'restart: healthy'), 'failed')
  })

  it('the limit is 2 GiB without swap, and peak and current stay within it', () => {
    assert.equal(verdictOf(withSample('first:healthy', (s) => ({ ...s, max: 4 * 1024 ** 3 }))), 'failed')
    assert.equal(verdictOf(withSample('first:healthy', (s) => ({ ...s, max: 'max' }))), 'incomplete')
    assert.equal(verdictOf(withSample('first:healthy', (s) => ({ ...s, swapMax: 1024 }))), 'failed')
    assert.equal(verdictOf(withSample('first:after-flow', (s) => ({ ...s, peak: LIMIT_BYTES + 1 }))), 'failed')
    assert.equal(verdictOf(withSample('first:idle', (s) => ({ ...s, running: false }))), 'failed')
  })

  it('every phase is read exactly once: a missing phase is not reached, a doubled one fails', () => {
    const missing = complete()
    missing.samples = missing.samples.filter((s) => s.label !== 'recreated:idle')
    assert.equal(verdictOf(missing), 'incomplete')
    const doubled = complete()
    doubled.samples.push(sample('first:healthy'))
    assert.equal(verdictOf(doubled), 'failed')
    const unread = withSample('first:idle', (s) => ({ ...s, unavailable: ['memory.peak'] }))
    assert.equal(verdictOf(unread), 'incomplete')
  })

  it('a probe phase passes only with every required step passed and its outcomes', () => {
    const dropped = complete()
    dropped.probes.first.steps = dropped.probes.first.steps.filter((s) => s.step !== 'signed Stop and its resend')
    assert.equal(verdictOf(dropped), 'failed')
    // A step whose absence no outcome reveals: only the required-step list catches it.
    for (const [phase, step] of [
      ['first', 'lookup'],
      ['restarted', 'host-name guard'],
    ]) {
      const quiet = complete()
      quiet.probes[phase].steps = quiet.probes[phase].steps.filter((s) => s.step !== step)
      assert.equal(verdictOf(quiet), 'failed', `${phase} without ${step}`)
    }
    const stepFailed = complete()
    stepFailed.probes.restarted.steps[3] = { ...stepFailed.probes.restarted.steps[3], ok: false }
    assert.equal(verdictOf(stepFailed), 'failed')
    assert.equal(verdictOf(withFacts('first', 'signed commission and its resend', (f) => ({ ...f, resend: 'created' }))), 'failed')
    assert.equal(verdictOf(withFacts('restarted', 'sign-up refused', () => ({ status: 200 }))), 'failed')
  })

  it('review of the correction: the group-OOM counter must be recorded, and zero', () => {
    const missing = withSample('first:after-flow', (s) => {
      const { oom_group_kill: _gone, ...events } = s.events
      return { ...s, events }
    })
    assert.equal(verdictOf(missing), 'incomplete')
    assert.equal(resultOf(missing, 'memory, first:after-flow'), 'unavailable')
  })

  it('review of the correction: each step’s recorded facts are validated, not its ok flag', () => {
    for (const [phase, step, change] of [
      ['first', 'host-name guard', (f) => ({ ...f, otherName: 200 })],
      ['first', 'first admin and board key', (f) => ({ ...f, boardKeyMinted: false })],
      ['first', 'plugin installed and configured', (f) => ({ ...f, status: 'error' })],
      ['first', 'signed Stop and its resend', (f) => ({ ...f, issueId: 'another' })],
      ['first', 'lookup', () => ({})],
      ['first', 'config digest', () => ({ sha256: 'short' })],
      ['restarted', 'host-name guard', () => ({})],
    ])
      assert.equal(verdictOf(withFacts(phase, step, change)), 'failed', `${phase}: ${step}`)
  })

  it('review of the correction: the restarted phase must find the first phase’s plugin, issue and configuration', () => {
    for (const [step, change] of [
      ['plugin ready again', (f) => ({ ...f, pluginId: 'another' })],
      ['same issue found, still cancelled', (f) => ({ ...f, issueId: 'another' })],
      ['commission resend answered by the same issue', (f) => ({ ...f, issueId: 'another' })],
      ['config unchanged', () => ({ before: 'd'.repeat(64), after: 'd'.repeat(64) })],
    ])
      assert.equal(verdictOf(withFacts('restarted', step, change)), 'failed', step)
  })

  it('the identity is checked against the run itself, not the producer’s flags', () => {
    const otherCommit = complete()
    otherCommit.identity.sophiaCommit = 'e'.repeat(40)
    assert.equal(verdictOf(otherCommit), 'failed')
    const arm = complete()
    arm.identity.image.architecture = 'arm64'
    assert.equal(verdictOf(arm), 'failed')
    const dirty = complete()
    dirty.identity.sophiaTreeDirty = true
    assert.equal(verdictOf(dirty), 'failed')
  })

  it('nothing recorded reads as not reached, never as passed', () => {
    const receipt = assess({})
    assert.equal(receipt.verdict, 'incomplete')
    assert.ok(receipt.checks.every((c) => c.result === 'not reached'))
  })
})

describe('the home across a recreation (WBC-02-CX-0036)', () => {
  it('positive control: the same files, a log grown with its earlier bytes kept, is persisted', () => {
    assert.equal(compareSnapshots(files, grown.files, grown.prefixes).persisted, true)
  })

  it('review of the correction: a growing record truncated, replaced or unverified is not persisted', () => {
    const truncated = files.map((f) => (f.path === LOG ? { ...f, size: 0, sha256: 'e'.repeat(64) } : f))
    assert.deepEqual(compareSnapshots(files, truncated, {}).rewrittenGrowing, [LOG])
    const replaced = files.map((f) => (f.path === LOG ? { ...f, sha256: 'e'.repeat(64) } : f))
    assert.equal(compareSnapshots(files, replaced, { [LOG]: { size: 4000, sha256: 'e'.repeat(64) } }).persisted, false)
    assert.equal(compareSnapshots(files, grown.files, {}).persisted, false, 'grown, but no prefix was read')
    const run = complete()
    run.home.after = { files: truncated, prefixes: {} }
    assert.equal(verdictOf(run), 'failed')
  })

  it('CX-0036: a changed adapter registry is not persisted', () => {
    const after = files.map((f) => (f.path === 'adapter-plugins.json' ? { ...f, sha256: 'f'.repeat(64) } : f))
    const result = compareSnapshots(files, after)
    assert.equal(result.persisted, false)
    assert.deepEqual(result.changedStable, ['adapter-plugins.json'])
    const run = complete()
    run.home.after.files = after
    assert.equal(verdictOf(run), 'failed')
  })

  it('a changed instance configuration, a lost file or an absent registry is not persisted', () => {
    const config = files.map((f) => (f.path.endsWith('config.json') ? { ...f, sha256: 'f'.repeat(64) } : f))
    assert.equal(compareSnapshots(files, config).persisted, false)
    assert.equal(compareSnapshots(files, files.slice(0, 2)).persisted, false)
    const noRegistry = files.slice(1)
    assert.deepEqual(compareSnapshots(noRegistry, noRegistry).requiredAbsent, ['adapter-plugins.json'])
    assert.equal(compareSnapshots(noRegistry, noRegistry).persisted, false, 'no registry, though nothing changed')
    assert.equal(compareSnapshots([], []).persisted, false)
  })
})

describe('evidence redaction (WBC-02-CX-0032 §3)', () => {
  it('replaces the job’s generated values and credential-shaped strings', () => {
    const secret = 'f00dfeed'.repeat(4)
    const text = [
      `token ${secret} in a line`,
      'postgres://paperclip:pw123456@pcdb:5432/paperclip',
      'Authorization: Bearer pcp_abcdef.123',
      '-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----',
    ].join('\n')
    const out = redact(text, [secret])
    assert.ok(!out.includes(secret) && !out.includes('pw123456') && !out.includes('pcp_abcdef') && !out.includes('MIIabc'))
    assert.match(out, /token \[redacted\] in a line/)
  })
})
