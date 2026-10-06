// WBC-02 (WBC-02-CX-0036 and the review of its correction): the image qualification's verdicts, on recorded inputs. A
// complete, legitimate run is the positive control; each fault below is one Codex executed against the helpers
// (missing peak and current, an OOM event without a kill, a start past its health deadline, a changed adapter
// registry, a growing record truncated, a missing group-OOM counter, a step whose recorded facts do not hold, home
// digests never read) or one of the same kind, and none of them may read as qualified.
import assert from 'node:assert/strict'
import { execFile, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, promisify } from 'node:util'
import { parse } from 'yaml'
import { compareSnapshots, coverageOf, EMPTY_SHA256, scan } from '../../scripts/paperclip-image-home.mjs'
import { assess, LIMIT_BYTES, PHASES, PROBE_STEPS, receiptOf, STARTS } from '../../scripts/paperclip-image-receipt.mjs'
import { redact, scrubDir, secretValues } from '../../scripts/paperclip-image-redact.mjs'
import { minimumDeadlineMs } from '../../scripts/paperclip-probe-url.mjs'

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
/** Every regular file under the home listed and hashed: none too large, the file bound not reached. */
const covered = (list) => ({ total: list.length, oversize: [], errors: [], maxFiles: 500, maxFileBytes: 10 * 1024 * 1024 })
/** The log grew to 5000 bytes, its first 4000 the ones it had: the prefix the later snapshot read. */
const grownFiles = files.map((f) => (f.path === LOG ? { ...f, size: 5000, sha256: '9'.repeat(64) } : f))
const grown = { coverage: covered(grownFiles), files: grownFiles, prefixes: { [LOG]: { size: 4000, sha256: '3'.repeat(64) } }, writer: 'paused' }
/** The home immediately before the restart, of the stopped container: the log at 3000 bytes, before the restart and its probe grew it. */
const firstFiles = files.map((f) => (f.path === LOG ? { ...f, size: 3000, sha256: '5'.repeat(64) } : f))
const first = { coverage: covered(firstFiles), files: firstFiles, writer: 'stopped' }
/** The home at the recreation boundary, of the stopped container: the log at 4000, its first 3000 the ones it had. */
const boundary = { coverage: covered(files), files, prefixes: { [LOG]: { size: 3000, sha256: '5'.repeat(64) } }, writer: 'stopped' }

/** The build's MANIFEST, as bytes; the Dockerfile is recorded for reference and not copied into the image. */
const manifestOf = (change = {}) =>
  Buffer.from(
    `${JSON.stringify(
      {
        paperclipPin: PIN,
        sophiaCommit: CANDIDATE,
        sophiaTreeDirty: false,
        files: { Dockerfile: '4'.repeat(64), 'sophia-dsh-adapter/dist/index.js': '5'.repeat(64), 'start.sh': '6'.repeat(64) },
        ...change,
      },
      null,
      2,
    )}\n`,
  )
const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex')
/** What the image holds under /opt/sophia, as the scan inside it records it: each recorded file and the MANIFEST. */
const imageFilesOf = (manifest) => {
  const list = [
    ...Object.entries(JSON.parse(manifest.toString('utf8')).files)
      .filter(([path]) => path !== 'Dockerfile')
      .map(([path, sha]) => ({ path, size: 10, sha256: sha })),
    { path: 'MANIFEST.json', size: manifest.length, sha256: sha256Of(manifest) },
  ]
  return { coverage: covered(list), files: list, prefixes: {} }
}
const packagedOf = (manifest) => ({ manifest, imageManifest: Buffer.from(manifest), imageFiles: imageFilesOf(manifest) })

/** What each step observed in a legitimate run, as the probe records it. */
const FACTS = {
  first: {
    health: { httpStatus: 200, status: 'ok' },
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
    health: { httpStatus: 200, status: 'ok' },
    'plugin ready again': { pluginId: PLUGIN, status: 'ready' },
    'config unchanged': { before: CONFIG, after: CONFIG },
    'same issue found, still cancelled': { outcome: 'found', issueId: ISSUE, status: 'cancelled' },
    'commission resend answered by the same issue': { outcome: 'existing', issueId: ISSUE },
    'sign-up refused': { status: 400, code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' },
    'host-name guard': { privateName: 200, otherName: 403 },
  },
}
// After the restart, sign-up is still open: the recreation's facts but the refusal.
FACTS.restart = Object.fromEntries(Object.entries(FACTS.restarted).filter(([step]) => step !== 'sign-up refused'))
const probe = (phase) => ({
  phase,
  outcome: 'passed',
  steps: PROBE_STEPS[phase].map((step) => ({ step, ok: true, ms: 10, detail: { ...FACTS[phase][step] } })),
})
/** The container each start's samples are read from: the first start and its restart one, the recreation another. */
const containerFor = (label) => (label.startsWith('recreated:') ? 'b' : 'a').repeat(64)
const sample = (label) => ({
  label,
  containerId: containerFor(label),
  running: true,
  oomKilled: false,
  unavailable: [],
  max: LIMIT_BYTES,
  swapMax: 0,
  peak: 1_100_000_000,
  current: 1_000_000_000,
  events: { low: 0, high: 0, max: 0, oom: 0, oom_kill: 0, oom_group_kill: 0 },
  cgroup: { path: `/system.slice/docker-${containerFor(label)}.scope`, source: 'process' },
})

/** A complete, legitimate run's records: the positive control every fault below changes in one place. */
function complete() {
  return {
    context: { candidate: CANDIDATE, pin: PIN },
    identity: {
      pin: PIN,
      sophiaCommit: CANDIDATE,
      sophiaTreeDirty: false,
      manifestSha256: sha256Of(manifestOf()),
      manifestMatches: true,
      verifyManifestInImage: true,
      buildImage: { id: digest('c'), size: 6e9, os: 'linux', architecture: 'amd64' },
      image: { id: digest('d'), size: 3e9, os: 'linux', architecture: 'amd64' },
    },
    packaged: packagedOf(manifestOf()),
    timings: ['first', 'restart', 'recreated'].map((label) => ({ label, ok: true, seconds: 45, health: { status: 200, reported: 'ok' } })),
    runtime: STARTS.map((label) => ({
      label,
      privileged: false,
      capAdd: [],
      capDrop: [],
      networkMode: 'pcnet',
      securityOpt: [],
      ports: [{ port: '3100/tcp', hostIp: '127.0.0.1', hostPort: '3100' }],
    })),
    samples: PHASES.map(sample),
    probes: { first: probe('first'), restart: probe('restart'), restarted: probe('restarted') },
    // Copies, never the shared lists: a test that changes one run must not change the next (review of ebdbaa9).
    home: { first: structuredClone(first), before: structuredClone(boundary), after: structuredClone(grown) },
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
    assert.equal(receipt.checks.length, 1 + 3 + 1 + PHASES.length + 3 + 2)
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
    run.timings[1] = { label: 'restart', ok: true, seconds: 420, health: { status: 200, reported: 'ok' } }
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
    // Review of 08c2915: a client error that is not the auth's refusal is not sign-up closed.
    for (const refusal of [
      { status: 404, code: null },
      { status: 429, code: null },
      { status: 400, code: 'VALIDATION_ERROR' },
      { status: 403, code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' },
      { status: 400 },
    ])
      assert.equal(verdictOf(withFacts('restarted', 'sign-up refused', () => refusal)), 'failed', JSON.stringify(refusal))
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
    // The pin, the commit and the clean tree are read from the manifest's own bytes (review of 896a92d).
    const built = (change) => {
      const run = complete()
      const manifest = manifestOf(change)
      run.packaged = packagedOf(manifest)
      run.identity.manifestSha256 = sha256Of(manifest)
      return run
    }
    assert.equal(verdictOf(built({ sophiaCommit: 'e'.repeat(40) })), 'failed')
    assert.equal(verdictOf(built({ paperclipPin: 'f'.repeat(40) })), 'failed')
    assert.equal(verdictOf(built({ sophiaTreeDirty: true })), 'failed')
    const arm = complete()
    arm.identity.image.architecture = 'arm64'
    assert.equal(verdictOf(arm), 'failed')
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
    const truncated = files.map((f) => (f.path === LOG ? { ...f, size: 0, sha256: EMPTY_SHA256 } : f))
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

describe('the home snapshots’ own measurements and coverage (WBC-02-CX-0039)', () => {
  const homeOf = (run) => assess(run).checks.find((c) => c.name === 'home persisted across recreation')

  it('positive control: complete coverage, every size and digest read, reads as passed', () => {
    const check = homeOf(complete())
    assert.equal(check.result, 'passed')
    assert.deepEqual(check.detail.unverified, [])
    assert.equal(check.detail.coverage.before.complete && check.detail.coverage.after.complete, true)
  })

  it('CX-0039: sha256 removed from both snapshots, the adapter registry included, is never equal: not qualified', () => {
    const run = complete()
    for (const side of [run.home.before, run.home.after]) side.files = side.files.map(({ sha256: _gone, ...f }) => f)
    assert.equal(compareSnapshots(run.home.before.files, run.home.after.files, run.home.after.prefixes).persisted, false)
    const check = homeOf(run)
    assert.equal(check.result, 'unavailable')
    assert.deepEqual(check.detail.unverified.sort(), files.map((f) => f.path).sort())
    assert.equal(verdictOf(run), 'incomplete')
  })

  it('a size not read, a digest not of sha256 form, or a path listed twice is unverified', () => {
    const variants = [
      (f) => (f.path === 'adapter-plugins.json' ? { ...f, size: undefined } : f),
      (f) => (f.path === 'adapter-plugins.json' ? { ...f, size: -1 } : f),
      (f) => (f.path === 'adapter-plugins.json' ? { ...f, size: '120' } : f),
      (f) => (f.path === 'adapter-plugins.json' ? { ...f, sha256: '' } : f),
      (f) => (f.path === 'adapter-plugins.json' ? { ...f, sha256: 'Z'.repeat(64) } : f),
    ]
    for (const change of variants) {
      const run = complete()
      run.home.after.files = run.home.after.files.map(change)
      const check = homeOf(run)
      assert.equal(check.result, 'unavailable', JSON.stringify(run.home.after.files[0]))
      assert.deepEqual(check.detail.unverified, ['adapter-plugins.json'])
      assert.equal(compareSnapshots(run.home.before.files, run.home.after.files, run.home.after.prefixes).persisted, false)
      assert.equal(verdictOf(run), 'incomplete')
    }
    const twice = complete()
    twice.home.after.files = [...twice.home.after.files, { ...files[0], sha256: 'f'.repeat(64) }]
    twice.home.after.coverage.total += 1
    assert.deepEqual(homeOf(twice).detail.unverified, ['adapter-plugins.json'])
    assert.notEqual(verdictOf(twice), 'qualified')
  })

  it('CX-0039: a snapshot that did not cover the home (bound reached, a file too large, coverage not recorded) is reported, never passed', () => {
    const capped = complete()
    capped.home.after.coverage.total = 900
    const cappedCheck = homeOf(capped)
    assert.equal(cappedCheck.result, 'unavailable')
    assert.deepEqual(cappedCheck.detail.coverage.after, { total: 900, listed: 3, oversize: [], errors: [], complete: false })
    const large = complete()
    large.home.before.coverage = { ...large.home.before.coverage, total: 4, oversize: [{ path: 'instances/default/data.bin', size: 20 * 1024 * 1024 }] }
    assert.equal(homeOf(large).result, 'unavailable')
    assert.deepEqual(homeOf(large).detail.coverage.before.oversize, [{ path: 'instances/default/data.bin', size: 20 * 1024 * 1024 }])
    // A record naming a file too large to hash is never covered, even if its counts were made to agree.
    const inconsistent = complete()
    inconsistent.home.before.coverage.oversize = [{ path: 'instances/default/data.bin', size: 20 * 1024 * 1024 }]
    assert.equal(homeOf(inconsistent).result, 'unavailable')
    const unreadDirectory = complete()
    unreadDirectory.home.after.coverage.errors = [{ path: 'instances', error: 'EACCES' }]
    assert.equal(homeOf(unreadDirectory).result, 'unavailable')
    const unrecorded = complete()
    delete unrecorded.home.before.coverage
    assert.equal(coverageOf(unrecorded.home.before).complete, false)
    assert.equal(homeOf(unrecorded).result, 'unavailable')
    for (const run of [capped, large, inconsistent, unreadDirectory, unrecorded]) assert.equal(verdictOf(run), 'incomplete')
  })

  it('CX-0040: a size and digest that disagree about being empty are unverified, never equal', () => {
    // The CX-0040 record: the size read before a truncation, the digest of the empty read after it.
    const before = files.map((f) => (f.path === LOG ? { ...f, size: 100, sha256: EMPTY_SHA256 } : f))
    const after = files.map((f) => (f.path === LOG ? { ...f, size: 0, sha256: EMPTY_SHA256 } : f))
    const result = compareSnapshots(before, after, {})
    assert.equal(result.persisted, false)
    assert.deepEqual(result.unverified, [LOG])
    const run = complete()
    run.home.before.files = before
    run.home.after.files = after
    assert.equal(homeOf(run).result, 'unavailable')
    assert.equal(verdictOf(run), 'incomplete')
    // And the other way: no bytes, with the digest of some.
    assert.deepEqual(compareSnapshots(files, files.map((f) => (f.path === LOG ? { ...f, size: 0 } : f))).unverified, [LOG])
  })

  it('CX-0040: sizes are compared as well as digests, and a growing record may not shrink even with the same digest', () => {
    const smallerRegistry = files.map((f) => (f.path === 'adapter-plugins.json' ? { ...f, size: 60 } : f))
    assert.deepEqual(compareSnapshots(files, smallerRegistry).changedStable, ['adapter-plugins.json'])
    const run = complete()
    run.home.after.files = smallerRegistry
    assert.equal(homeOf(run).result, 'failed')
    const smallerLog = files.map((f) => (f.path === LOG ? { ...f, size: 10 } : f))
    const shrunk = compareSnapshots(files, smallerLog, { [LOG]: { size: 4000, sha256: '3'.repeat(64) } })
    assert.deepEqual(shrunk.rewrittenGrowing, [LOG])
    assert.equal(shrunk.persisted, false)
  })

  it('incomplete coverage does not hide a definite difference between measured files', () => {
    const run = complete()
    run.home.after.coverage.total = 900
    run.home.after.files = run.home.after.files.map((f) => (f.path === 'adapter-plugins.json' ? { ...f, sha256: 'f'.repeat(64) } : f))
    assert.equal(homeOf(run).result, 'failed')
    // A file absent from a capped listing may lie past the bound: unavailable, not failed.
    const capped = complete()
    capped.home.after.coverage.total = 900
    capped.home.after.files = capped.home.after.files.slice(1)
    assert.equal(homeOf(capped).result, 'unavailable')
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

describe('the evidence is uploaded only once scrubbed (review of 34bdf76)', () => {
  const REDACT = fileURLToPath(new URL('../../scripts/paperclip-image-redact.mjs', import.meta.url))
  const WORKFLOW = fileURLToPath(new URL('../../.github/workflows/paperclip-image.yml', import.meta.url))
  const SECRET = 'f00dfeed'.repeat(4)
  const dirs = []
  after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))
  const evidence = () => {
    const dir = mkdtempSync(join(tmpdir(), 'pc-evidence-'))
    dirs.push(dir)
    mkdirSync(join(dir, 'diagnostics'))
    writeFileSync(join(dir, 'receipt.json'), '{"verdict":"qualified"}\n')
    writeFileSync(join(dir, 'diagnostics', 'pc-logs.txt'), `boot\nDATABASE_URL=postgres://paperclip:${SECRET}@pcdb:5432/paperclip\ntoken ${SECRET}\n`)
    return dir
  }

  it('positive control: every value scrubbed, every file read again, and a second pass finds nothing', () => {
    const dir = evidence()
    assert.deepEqual(scrubDir(dir, [SECRET]), [join('diagnostics', 'pc-logs.txt')])
    assert.ok(!readFileSync(join(dir, 'diagnostics', 'pc-logs.txt'), 'utf8').includes(SECRET))
    assert.deepEqual(scrubDir(dir, [SECRET]), [])
    const run = spawnSync(process.execPath, [REDACT, '--scrub-dir', dir], { encoding: 'utf8', env: { ...process.env, REDACT_VARS: 'PC_SECRET', PC_SECRET: SECRET } })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(readFileSync(join(dir, 'scrubbed.txt'), 'utf8'), 'none\n')
  })

  it('a value still there after rewriting fails the scrub, not the upload', () => {
    // Rewriting the shorter value leaves the longer one, already passed over, in its place: the second reading finds it.
    const dir = evidence()
    writeFileSync(join(dir, 'odd.txt'), '[redacted]abcdefgh\n')
    assert.throws(() => scrubDir(dir, ['abcdefgh', '[redacted][redacted]']), /still holding values after scrubbing: odd\.txt/)
  })

  it('an entry that is not a regular file or a directory fails the scrub, and the command exits non-zero', () => {
    const dir = evidence()
    symlinkSync('/etc/hostname', join(dir, 'link'))
    assert.throws(() => scrubDir(dir, [SECRET]), /neither a regular file nor a directory/)
    const run = spawnSync(process.execPath, [REDACT, '--scrub-dir', dir], { encoding: 'utf8', env: { ...process.env, REDACT_VARS: '' } })
    assert.notEqual(run.status, 0)
  })

  it('the workflow uploads only when the scrub step said so, and says so only after the redactor exited 0', () => {
    const steps = parse(readFileSync(WORKFLOW, 'utf8')).jobs.image.steps
    const scrub = steps.find((step) => step.name === 'Scrub the evidence')
    const upload = steps.find((step) => step.name === 'Upload the evidence')
    assert.equal(scrub.id, 'scrub')
    assert.equal(scrub.if, 'always()')
    assert.equal(scrub.shell, undefined, 'the default shell, bash -e: a failed redactor ends the step')
    const lines = scrub.run.trim().split('\n').map((line) => line.trim())
    assert.equal(lines.at(-1), 'echo "scrubbed=true" >> "$GITHUB_OUTPUT"')
    assert.equal(lines.at(-2), 'node sophia/scripts/paperclip-image-redact.mjs --scrub-dir "$EVIDENCE"')
    assert.equal(upload.if, "always() && steps.scrub.outputs.scrubbed == 'true'")
    assert.match(upload.uses, /^actions\/upload-artifact@[0-9a-f]{40}$/)
    assert.ok(steps.indexOf(scrub) < steps.indexOf(upload))
  })
})

describe('the probe’s own credentials and credential-named fields are scrubbed too (review of 215b276)', () => {
  const REDACT = fileURLToPath(new URL('../../scripts/paperclip-image-redact.mjs', import.meta.url))
  const WORKFLOW = fileURLToPath(new URL('../../.github/workflows/paperclip-image.yml', import.meta.url))
  const PASSWORD = '0123456789abcdef0123456789abcdef'
  const dirs = []
  after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))
  const temp = () => {
    const dir = mkdtempSync(join(tmpdir(), 'pc-probe-secrets-'))
    dirs.push(dir)
    return dir
  }

  it('a logged request body: the password field, a session cookie and a credential variable are redacted; a receipt is not changed', () => {
    const logged = redact(
      `{"level":40,"req":{"body":{"email":"operator@example.invalid","password":"${PASSWORD}"}}}\ncookie: better-auth.session_token=abc.def; Path=/\nBETTER_AUTH_SECRET=zzzzzzzzzzzz`,
    )
    assert.ok(!logged.includes(PASSWORD) && !logged.includes('abc.def') && !logged.includes('zzzzzzzzzzzz'))
    assert.match(logged, /"password":"\[redacted\]"/)
    assert.equal(redact(logged), logged, 'redacting again changes nothing')
    const receipt = JSON.stringify(assess(complete()), null, 2)
    assert.equal(redact(receipt), receipt, 'the receipt holds no credential and is not rewritten')
  })

  it('every line of the probe’s secrets file is a value to redact, wherever it appears; a file named but missing is an error', () => {
    const dir = temp()
    const secrets = join(dir, 'probe-secrets.txt')
    writeFileSync(secrets, `${PASSWORD}\npcp_board-key-0123456789\n`)
    assert.deepEqual(secretValues({ REDACT_FILES: secrets }), [PASSWORD, 'pcp_board-key-0123456789'])
    assert.throws(() => secretValues({ REDACT_FILES: join(dir, 'missing.txt') }), /ENOENT/)
    const evidence = join(dir, 'evidence')
    mkdirSync(join(evidence, 'diagnostics'), { recursive: true })
    // Not in a credential-named field: only the probe's own list can catch it.
    writeFileSync(join(evidence, 'diagnostics', 'server.log'), `sign-up refused for a body ending ${PASSWORD}; key pcp_board-key-0123456789\n`)
    const run = spawnSync(process.execPath, [REDACT, '--scrub-dir', evidence], {
      encoding: 'utf8',
      env: { ...process.env, REDACT_VARS: '', REDACT_FILES: secrets },
    })
    assert.equal(run.status, 0, run.stderr)
    const log = readFileSync(join(evidence, 'diagnostics', 'server.log'), 'utf8')
    assert.ok(!log.includes(PASSWORD) && !log.includes('pcp_board-key-0123456789'), log)
  })

  it('the workflow keeps the probe’s secrets file from the first step, hands it to every phase and to the scrub', () => {
    const steps = parse(readFileSync(WORKFLOW, 'utf8')).jobs.image.steps
    assert.match(steps.find((s) => s.run?.includes('EVIDENCE=$E')).run, /install -m 600 \/dev\/null "\$RUNNER_TEMP\/probe-secrets\.txt"/)
    const probes = steps.filter((s) => s.run?.includes('paperclip-service-probe.mjs --url'))
    assert.equal(probes.length, 3)
    for (const s of probes) assert.match(s.run, /--secrets "\$RUNNER_TEMP\/probe-secrets\.txt"/)
    assert.equal(steps.find((s) => s.name === 'Scrub the evidence').env.REDACT_FILES, '${{ runner.temp }}/probe-secrets.txt')
  })
})

describe('review of 9130676: a start’s duration and its runtime configuration are facts the receipt checks', () => {
  const runtimeOf = (run) => assess(run).checks.find((c) => c.name.startsWith('runtime:'))

  it('positive control: every start recorded, not privileged, nothing added, the job network, loopback only', () => {
    assert.equal(runtimeOf(complete()).result, 'passed')
    assert.equal(verdictOf(complete()), 'qualified')
  })

  it('a negative or impossible duration is not a fast start', () => {
    for (const seconds of [-0.1, -45]) {
      const run = complete()
      run.timings[1] = { ...run.timings[1], seconds }
      assert.equal(resultOf(run, 'restart:'), 'failed', String(seconds))
      assert.equal(verdictOf(run), 'failed')
    }
    const zero = complete()
    zero.timings[1] = { ...zero.timings[1], seconds: 0 }
    assert.equal(resultOf(zero, 'restart:'), 'passed', 'zero is a measured duration')
  })

  it('privileged, an added or dropped capability, the host network or a port beyond loopback fails the run', () => {
    const faults = [
      (r) => ({ ...r, privileged: true }),
      (r) => ({ ...r, privileged: undefined }),
      (r) => ({ ...r, capAdd: ['SYS_ADMIN'] }),
      (r) => ({ ...r, capAdd: undefined }),
      // Review of 3c29dd1: a narrower set is not Docker's default either.
      (r) => ({ ...r, capDrop: ['ALL'] }),
      (r) => ({ ...r, capDrop: ['NET_RAW'] }),
      (r) => ({ ...r, capDrop: undefined }),
      (r) => ({ ...r, networkMode: 'host' }),
      (r) => ({ ...r, networkMode: 'container:other' }),
      (r) => ({ ...r, ports: [{ port: '3100/tcp', hostIp: '0.0.0.0', hostPort: '3100' }] }),
      (r) => ({ ...r, ports: [] }),
    ]
    for (const fault of faults) {
      const run = complete()
      run.runtime[2] = fault(run.runtime[2])
      assert.equal(runtimeOf(run).result, 'failed', JSON.stringify(run.runtime[2]))
      assert.equal(verdictOf(run), 'failed')
    }
  })

  it('a start without its record, a doubled record, or none at all is not passed', () => {
    const missing = complete()
    missing.runtime = missing.runtime.filter((r) => r.label !== 'restart')
    assert.equal(runtimeOf(missing).result, 'unavailable')
    const doubled = complete()
    doubled.runtime.push({ ...doubled.runtime[0] })
    assert.equal(runtimeOf(doubled).result, 'failed')
    const none = complete()
    none.runtime = []
    assert.equal(runtimeOf(none).result, 'not reached')
    for (const run of [missing, none]) assert.equal(verdictOf(run), 'incomplete')
  })
})


describe('review of 5446719: the job’s limit outlasts every step’s own budget', () => {
  const WORKFLOW = fileURLToPath(new URL('../../.github/workflows/paperclip-image.yml', import.meta.url))

  it('every step has a budget of its own, and the job outlasts their sum, so receipt, scrub, upload and clean-up run', () => {
    const job = parse(readFileSync(WORKFLOW, 'utf8')).jobs.image
    for (const step of job.steps) {
      const budget = step['timeout-minutes']
      assert.ok(Number.isInteger(budget) && budget > 0, `${step.name ?? step.uses} has no budget of its own`)
    }
    const sum = job.steps.reduce((total, step) => total + step['timeout-minutes'], 0)
    // Room for what no step budget covers: the job's set-up (the database service) and the actions' post steps.
    assert.ok(job['timeout-minutes'] >= sum + 15, `the job's ${job['timeout-minutes']} minutes; the steps' budgets ${sum}`)
    assert.ok(job['timeout-minutes'] <= 360, 'a GitHub-hosted runner ends any job at 360 minutes')
  })
})

describe('review of 37bae0e: a start’s time ends when health answers, not after its logs are read', () => {
  const CONTAINER = fileURLToPath(new URL('../../scripts/paperclip-image-container.mjs', import.meta.url))
  const dirs = []
  after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

  it('a log that takes two seconds to read adds nothing to the recorded start', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pc-timing-'))
    dirs.push(dir)
    // A stand-in docker: the restart and the configuration answer at once, the log only after two seconds.
    const host = { Privileged: false, CapAdd: null, CapDrop: null, NetworkMode: 'pcnet', SecurityOpt: null, PortBindings: { '3100/tcp': [{ HostIp: '127.0.0.1', HostPort: '3100' }] } }
    writeFileSync(
      join(dir, 'docker'),
      [
        '#!/bin/sh',
        'case "$1" in',
        '  restart) exit 0 ;;',
        "  logs) sleep 2; echo 'sophia_dsh registered' ;;",
        '  inspect) case "$3" in',
        `    '{{json .HostConfig}}') echo '${JSON.stringify(host)}' ;;`,
        "    '{{.State.Running}}') echo true ;;",
        '    *) echo healthy ;;',
        '  esac ;;',
        '  *) exit 1 ;;',
        'esac',
        '',
      ].join('\n'),
    )
    chmodSync(join(dir, 'docker'), 0o755)
    // The health the helper reads, on the port the image publishes: healthy from the first read.
    const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}'))
    await new Promise((listening) => server.listen(3100, '127.0.0.1', listening))
    try {
      const began = performance.now()
      await promisify(execFile)(process.execPath, [CONTAINER, 'restart', 'restart'], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, EVIDENCE: dir },
      })
      const wall = (performance.now() - began) / 1000
      const [timing] = readFileSync(join(dir, 'timings.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
      assert.ok(wall >= 2, `the log read took its two seconds (${wall} s in all)`)
      assert.equal(timing.ok, true)
      assert.deepEqual(timing.health, { status: 200, reported: 'ok' }, 'the answer health gave is recorded')
      assert.equal(timing.adapterLogLines, 1)
      assert.ok(timing.seconds < 1, `the start was healthy at once, yet recorded ${timing.seconds} s`)
    } finally {
      await new Promise((closed) => server.close(closed))
    }
  })
})

describe('review of 3f92959: every input of the image build starts its qualification', () => {
  const ROOT = fileURLToPath(new URL('../../', import.meta.url))
  const WORKFLOW = join(ROOT, '.github/workflows/paperclip-image.yml')
  const manifestOf = (dir) => JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8'))

  it('the trigger names the toolchain and lock, and every workspace package the bundled plugin and adapter use', () => {
    const paths = parse(readFileSync(WORKFLOW, 'utf8')).on.pull_request.paths
    // What the job installs and builds with: setup-node's version file, pnpm's packageManager, the frozen lock, the
    // workspace (its packages and install rules), and the repository's own TypeScript from that lock.
    for (const file of ['.node-version', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
      assert.ok(paths.includes(file), `${file} is not in the trigger`)
    }
    const byName = new Map(
      readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => [manifestOf(`packages/${entry.name}`).name, `packages/${entry.name}`]),
    )
    const used = new Set()
    const queue = ['packages/paperclip-plugin', 'packages/paperclip-adapters']
    while (queue.length > 0) {
      const dir = queue.shift()
      if (used.has(dir)) continue
      used.add(dir)
      for (const [name, spec] of Object.entries(manifestOf(dir).dependencies ?? {})) {
        if (!spec.startsWith('workspace:')) continue
        assert.ok(byName.has(name), `${dir} depends on ${name}, which is not under packages/`)
        queue.push(byName.get(name))
      }
    }
    assert.ok(used.has('packages/contracts'), 'the walk reaches the contracts the adapter and coordination import')
    for (const dir of used) assert.ok(paths.includes(`${dir}/**`), `${dir} is not in the trigger`)
  })
})

describe('review of 896a92d: the packaged files are recomputed from the manifests and the image, not from flags', () => {
  const IDENTITY = 'image built from'
  const WORKFLOW = fileURLToPath(new URL('../../.github/workflows/paperclip-image.yml', import.meta.url))
  const withPackaged = (change) => {
    const run = complete()
    change(run.packaged, run)
    return run
  }
  const dirs = []
  after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

  it('positive control: the manifest, its copy in the image and the image’s files agree, without either flag', () => {
    const run = complete()
    delete run.identity.manifestMatches
    delete run.identity.verifyManifestInImage
    assert.equal(resultOf(run, IDENTITY), 'passed')
    assert.equal(verdictOf(run), 'qualified')
  })

  it('flags without the manifests and the scan are not evidence: unavailable, never qualified', () => {
    const run = complete()
    delete run.packaged
    assert.equal(resultOf(run, IDENTITY), 'unavailable')
    assert.equal(verdictOf(run), 'incomplete')
  })

  it('a manifest that is not the one recorded, or whose copy in the image differs by a byte, fails', () => {
    for (const run of [
      withPackaged((p, r) => (r.identity.manifestSha256 = '0'.repeat(64))),
      withPackaged((p) => (p.imageManifest = Buffer.concat([p.imageManifest, Buffer.from(' ')]))),
      withPackaged((p) => (p.imageManifest = null)),
      withPackaged((p, r) => {
        p.manifest = Buffer.from('{ not json')
        p.imageManifest = Buffer.from(p.manifest)
        r.identity.manifestSha256 = sha256Of(p.manifest)
      }),
    ])
      assert.equal(resultOf(run, IDENTITY), 'failed')
  })

  it('a file packaged with another digest, missing, or not in the manifest fails', () => {
    const changed = withPackaged((p) => (p.imageFiles.files.find((f) => f.path === 'start.sh').sha256 = '7'.repeat(64)))
    const missing = withPackaged((p) => {
      p.imageFiles.files = p.imageFiles.files.filter((f) => f.path !== 'sophia-dsh-adapter/dist/index.js')
      p.imageFiles.coverage = covered(p.imageFiles.files)
    })
    const extra = withPackaged((p) => {
      p.imageFiles.files.push({ path: 'sophia-dsh-adapter/dist/extra.js', size: 3, sha256: '8'.repeat(64) })
      p.imageFiles.coverage = covered(p.imageFiles.files)
    })
    const unread = withPackaged((p) => {
      p.imageFiles.files.find((f) => f.path === 'start.sh').size = null
    })
    for (const run of [changed, missing, extra, unread]) assert.equal(resultOf(run, IDENTITY), 'failed')
    assert.deepEqual(assess(extra).checks[0].detail.unrecorded, ['sophia-dsh-adapter/dist/extra.js'])
  })

  it('an image scan that did not cover every file fails', () => {
    const errored = withPackaged((p) => (p.imageFiles.coverage.errors = [{ path: 'x', error: 'EACCES' }]))
    const oversize = withPackaged((p) => (p.imageFiles.coverage.oversize = [{ path: 'big', size: 11e6 }]))
    const short = withPackaged((p) => (p.imageFiles.coverage.total += 1))
    const twice = withPackaged((p) => {
      p.imageFiles.files.push({ ...p.imageFiles.files[0] })
      p.imageFiles.coverage = covered(p.imageFiles.files)
    })
    for (const run of [errored, oversize, short, twice]) assert.equal(resultOf(run, IDENTITY), 'failed')
  })

  it('the scan the image runs, on a real tree laid out as /opt/sophia, is what the receipt accepts', { skip: process.platform !== 'linux' && 'the scan reads /proc' }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'pc-packaged-'))
    dirs.push(dir)
    mkdirSync(join(dir, 'sophia-dsh-adapter', 'dist'), { recursive: true })
    const adapter = Buffer.from('export const createServerAdapter = () => ({})\n')
    const start = Buffer.from('#!/bin/sh\nexec node server\n')
    writeFileSync(join(dir, 'sophia-dsh-adapter', 'dist', 'index.js'), adapter)
    writeFileSync(join(dir, 'start.sh'), start)
    const manifest = manifestOf({
      files: { Dockerfile: '4'.repeat(64), 'sophia-dsh-adapter/dist/index.js': sha256Of(adapter), 'start.sh': sha256Of(start) },
    })
    writeFileSync(join(dir, 'MANIFEST.json'), manifest)
    const run = complete()
    run.identity.manifestSha256 = sha256Of(manifest)
    run.packaged = { manifest, imageManifest: readFileSync(join(dir, 'MANIFEST.json')), imageFiles: scan(dir) }
    assert.equal(resultOf(run, IDENTITY), 'passed')
    writeFileSync(join(dir, 'start.sh'), Buffer.from('#!/bin/sh\nexec node other\n'))
    run.packaged.imageFiles = scan(dir)
    assert.equal(resultOf(run, IDENTITY), 'failed')
  })

  it('the workflow keeps both manifests and scans the image’s files inside it, confined, for the receipt', () => {
    const steps = parse(readFileSync(WORKFLOW, 'utf8')).jobs.image.steps
    const identity = steps.find((s) => s.name === 'The image’s identity and packaged files' || s.name === "The image's identity and packaged files").run
    assert.match(identity, /cp "\$M" "\$EVIDENCE\/manifest\.json"/)
    assert.match(identity, /\/opt\/sophia\/MANIFEST\.json > "\$EVIDENCE\/image-manifest\.json"/)
    const scanLine = identity.split('\n').filter((l) => /--network none|paperclip-image-home|image-files/.test(l)).join(' ')
    for (const flag of ['--network none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges'])
      assert.ok(scanLine.includes(flag), `the image scan runs with ${flag}`)
    assert.match(scanLine, /paperclip-image-home\.mjs:\/opt\/check\/scan\.mjs:ro/)
    assert.match(scanLine, /scan \/opt\/sophia > "\$EVIDENCE\/image-files\.json"/)
  })
})

describe('review of 4c63217: a start is judged by the health answer recorded, and every runtime step outlasts its commands', () => {
  const WORKFLOW = fileURLToPath(new URL('../../.github/workflows/paperclip-image.yml', import.meta.url))
  const withStart = (change) => {
    const run = complete()
    run.timings[1] = change({ ...run.timings[1] })
    return run
  }

  it('an ok flag with no answer recorded is incomplete, never qualified', () => {
    const run = withStart(({ health, ...t }) => t)
    assert.equal(resultOf(run, 'restart:'), 'unavailable')
    assert.equal(verdictOf(run), 'incomplete')
  })

  it('an answer other than 200 with the status ok fails the start, whatever its flag says', () => {
    for (const health of [{ status: 503, reported: 'ok' }, { status: 200, reported: 'starting' }, { status: 200, reported: null }])
      assert.equal(resultOf(withStart((t) => ({ ...t, health })), 'restart:'), 'failed', JSON.stringify(health))
  })

  it('a start said not ok fails, with or without an answer recorded', () => {
    assert.equal(resultOf(withStart(({ health, ...t }) => ({ ...t, ok: false, reason: 'deadline' })), 'restart:'), 'failed')
    // Review of a42fe05: a 200 and ok beside a recorded failure is a record contradicting itself, never a pass.
    const contradicted = withStart((t) => ({ ...t, ok: false, reason: 'deadline' }))
    assert.deepEqual(contradicted.timings[1].health, { status: 200, reported: 'ok' })
    assert.equal(resultOf(contradicted, 'restart:'), 'failed')
    assert.equal(verdictOf(contradicted), 'failed')
  })

  it('every runtime command runs under an explicit bound, and each step’s budget outlasts their sum by a minute', () => {
    const steps = parse(readFileSync(WORKFLOW, 'utf8')).jobs.image.steps
    const runtime = steps.filter((s) => /paperclip-image-container\.mjs (start|restart)/.test(s.run ?? ''))
    assert.deepEqual(
      runtime.map((s) => s.name),
      ["First start, the installed plugin's flow, idle", 'Restart', 'Recreate on the same volume and database, sign-up closed'],
    )
    for (const step of runtime) {
      // One command a line, a continued line joined to its command.
      const commands = step.run.replace(/\\\n\s*/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean)
      let sum = 0
      for (const command of commands) {
        const bound = /^(?:timeout|sleep) (\d+)(?: |$)/.exec(command)
        assert.ok(bound, `${step.name}: "${command.slice(0, 60)}" runs without an explicit bound`)
        sum += Number(bound[1])
      }
      assert.ok(step['timeout-minutes'] * 60 >= sum + 60, `${step.name}: ${step['timeout-minutes']} min for ${sum} s of commands`)
    }
  })
})

describe('review of 9ee7754: what persists is probed after the restart too, not only after the recreation', () => {
  const RESTART = 'installed plugin flow, restart'
  const WORKFLOW = fileURLToPath(new URL('../../.github/workflows/paperclip-image.yml', import.meta.url))

  it('positive control: the restart phase passes with the first phase’s plugin, configuration and issue', () => {
    assert.equal(resultOf(complete(), RESTART), 'passed')
    assert.deepEqual(PROBE_STEPS.restart, PROBE_STEPS.restarted.filter((step) => step !== 'sign-up refused'))
  })

  it('no restart probe is not reached, never qualified', () => {
    const run = complete()
    delete run.probes.restart
    assert.equal(resultOf(run, RESTART), 'not reached')
    assert.equal(verdictOf(run), 'incomplete')
  })

  it('a plugin, configuration or issue that did not survive the restart fails, though the recreation’s did', () => {
    for (const [step, change] of [
      ['plugin ready again', (f) => ({ ...f, status: 'error' })],
      ['plugin ready again', (f) => ({ ...f, pluginId: 'another' })],
      ['config unchanged', () => ({ before: CONFIG, after: 'd'.repeat(64) })],
      ['same issue found, still cancelled', (f) => ({ ...f, outcome: 'missing' })],
      ['commission resend answered by the same issue', (f) => ({ ...f, issueId: 'another' })],
      ['host-name guard', (f) => ({ ...f, otherName: 200 })],
    ])
      assert.equal(verdictOf(withFacts('restart', step, change)), 'failed', step)
    const failedStep = complete()
    failedStep.probes.restart.steps[1].ok = false
    failedStep.probes.restart.outcome = 'failed'
    assert.equal(resultOf(failedStep, RESTART), 'failed')
  })

  it('the restart step probes before the recreation, with its own bound inside the step’s budget', () => {
    const steps = parse(readFileSync(WORKFLOW, 'utf8')).jobs.image.steps
    const restart = steps.find((s) => s.name === 'Restart')
    assert.match(restart.run, /timeout 660 node sophia\/scripts\/paperclip-service-probe\.mjs --url http:\/\/127\.0\.0\.1:3100 --phase restart /)
    assert.match(restart.run, /--out "\$EVIDENCE\/probe-restart\.json"/)
    const recreate = steps.findIndex((s) => s.name?.startsWith('Recreate'))
    assert.ok(steps.indexOf(restart) < recreate)
  })
})

describe('the receipt command reads every input the workflow writes, by its own name', () => {
  const RECEIPT = fileURLToPath(new URL('../../scripts/paperclip-image-receipt.mjs', import.meta.url))
  const dirs = []
  after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

  /** The evidence directory of a complete, legitimate run, as the workflow's steps write it. */
  const evidenceOf = (run) => {
    const dir = mkdtempSync(join(tmpdir(), 'pc-receipt-'))
    dirs.push(dir)
    const lines = (list) => list.map((item) => `${JSON.stringify(item)}\n`).join('')
    const files = {
      'context.json': JSON.stringify(run.context),
      'identity.json': JSON.stringify(run.identity),
      'timings.jsonl': lines(run.timings),
      'runtime.jsonl': lines(run.runtime),
      'cgroup.jsonl': lines(run.samples),
      'probe-first.json': JSON.stringify(run.probes.first),
      'probe-restart.json': JSON.stringify(run.probes.restart),
      'probe-restarted.json': JSON.stringify(run.probes.restarted),
      'home-first.json': JSON.stringify(run.home.first),
      'home-before.json': JSON.stringify(run.home.before),
      'home-after.json': JSON.stringify(run.home.after),
      'manifest.json': run.packaged.manifest,
      'image-manifest.json': run.packaged.imageManifest,
      'image-files.json': JSON.stringify(run.packaged.imageFiles),
    }
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
    return { dir, names: Object.keys(files) }
  }
  const verdictIn = (dir) => {
    const run = spawnSync(process.execPath, [RECEIPT, dir, join(dir, 'receipt.json'), join(dir, 'summary.md')], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    return JSON.parse(readFileSync(join(dir, 'receipt.json'), 'utf8')).verdict
  }

  it('positive control: the files of a complete run are qualified', () => {
    assert.equal(verdictIn(evidenceOf(complete()).dir), 'qualified')
  })

  it('review of af5ab20: an empty or cut-short file still gets a receipt, never qualified, the file named', () => {
    for (const [name, content] of [
      ['image-files.json', ''],
      ['probe-first.json', '{"phase":"first","steps":['],
      ['identity.json', '{'],
    ]) {
      const { dir } = evidenceOf(complete())
      writeFileSync(join(dir, name), content)
      assert.notEqual(verdictIn(dir), 'qualified', name)
      assert.deepEqual(JSON.parse(readFileSync(join(dir, 'receipt.json'), 'utf8')).malformed, [name])
      assert.match(readFileSync(join(dir, 'summary.md'), 'utf8'), new RegExp(`could not be read: ${name.replace('.', '\\.')}`))
    }
  })

  it('review of af5ab20: a cut-short line beside every complete one is named, and the run is not qualified', () => {
    const run = complete()
    const { dir } = evidenceOf(run)
    writeFileSync(join(dir, 'cgroup.jsonl'), `${run.samples.map((s) => JSON.stringify(s)).join('\n')}\n{"label":"first:idle","peak":`)
    assert.equal(verdictIn(dir), 'incomplete')
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'receipt.json'), 'utf8')).malformed, [`cgroup.jsonl:${run.samples.length + 1}`])
  })

  it('review of 705c2b8: valid JSON of the wrong shape still gets a receipt and summary, never qualified', () => {
    // The two of the review, and a home snapshot's, which the home check already reads as a file unread.
    for (const [name, content, check, guarded] of [
      ['probe-first.json', '{"phase":"first","steps":[null]}', 'installed plugin flow, first', true],
      ['image-files.json', '{"files":[null]}', 'image built from the pin', true],
      ['home-after.json', '{"files":[null]}', 'home persisted across recreation', false],
      ['runtime.jsonl', (run) => run.runtime.map((r, i) => JSON.stringify(i === 0 ? { ...r, ports: [null] } : r)).join('\n'), 'runtime:', true],
      ['cgroup.jsonl', (run) => run.samples.map((r, i) => JSON.stringify(i === 0 ? { ...r, events: [null] } : r)).join('\n'), 'memory, first:healthy', false],
    ]) {
      const run = complete()
      const { dir } = evidenceOf(run)
      writeFileSync(join(dir, name), typeof content === 'function' ? `${content(run)}\n` : content)
      assert.notEqual(verdictIn(dir), 'qualified', name)
      const receipt = JSON.parse(readFileSync(join(dir, 'receipt.json'), 'utf8'))
      const unavailable = receipt.checks.find((c) => c.name.startsWith(check))
      assert.equal(unavailable.result, 'unavailable', name)
      const summary = readFileSync(join(dir, 'summary.md'), 'utf8')
      if (guarded) {
        assert.equal(unavailable.detail.reason, 'its evidence is not in the shape it is read in')
        assert.ok(receipt.unreadable.includes(unavailable.name), name)
        assert.match(summary, /Checks whose evidence is not in the shape it is read in: /)
      }
    }
  })

  it('review of 705c2b8: a file or line that is valid JSON but not a record is named as malformed', () => {
    for (const [name, content, named] of [
      ['probe-first.json', '[]', 'probe-first.json'],
      ['identity.json', 'null', 'identity.json'],
      ['context.json', '"context"', 'context.json'],
      ['cgroup.jsonl', null, 'cgroup.jsonl:1'],
      ['timings.jsonl', 5, 'timings.jsonl:1'],
    ]) {
      const run = complete()
      const { dir } = evidenceOf(run)
      if (name.endsWith('.jsonl')) {
        const list = name === 'cgroup.jsonl' ? run.samples : run.timings
        writeFileSync(join(dir, name), [JSON.stringify(content), ...list.map((r) => JSON.stringify(r))].join('\n') + '\n')
      } else writeFileSync(join(dir, name), content)
      assert.notEqual(verdictIn(dir), 'qualified', name)
      assert.deepEqual(JSON.parse(readFileSync(join(dir, 'receipt.json'), 'utf8')).malformed, [named])
    }
  })

  it('without any one of them, the run is not qualified', () => {
    const { names } = evidenceOf(complete())
    for (const name of names) {
      const { dir } = evidenceOf(complete())
      rmSync(join(dir, name))
      assert.notEqual(verdictIn(dir), 'qualified', `${name} missing`)
    }
  })
})

describe('CX-0045: memory is read after the restart probe as after the others, every phase sampled once', () => {
  const WORKFLOW = fileURLToPath(new URL('../../.github/workflows/paperclip-image.yml', import.meta.url))

  it('the workflow samples exactly the memory phases the receipt requires, each once, the restart’s after its probe', () => {
    const steps = parse(readFileSync(WORKFLOW, 'utf8')).jobs.image.steps
    const sampled = steps.flatMap((s) => [...(s.run ?? '').matchAll(/paperclip-image-cgroup\.mjs pc (\S+) /g)].map((m) => m[1]))
    assert.deepEqual(sampled, PHASES)
    const restart = steps.find((s) => s.name === 'Restart').run
    assert.ok(restart.indexOf('--phase restart ') < restart.indexOf('pc restart:after-flow'))
  })

  it('a run without the sample after the restart probe is not qualified', () => {
    const run = complete()
    run.samples = run.samples.filter((s) => s.label !== 'restart:after-flow')
    assert.equal(resultOf(run, 'memory, restart:after-flow'), 'not reached')
    assert.equal(verdictOf(run), 'incomplete')
  })
})

describe('review of fe59572: a packaged size a read cannot give, or a settle run not named, is refused', () => {
  const IDENTITY = 'image built from'
  const withScanned = (path, change) => {
    const run = complete()
    const entry = run.packaged.imageFiles.files.find((f) => f.path === path)
    Object.assign(entry, change(entry))
    return run
  }

  it('a negative, fractional or missing size, or a zero size beside a digest of bytes, fails the identity', () => {
    for (const size of [-1, 1.5, null, 0])
      assert.equal(resultOf(withScanned('start.sh', () => ({ size })), IDENTITY), 'failed', String(size))
  })

  it('the MANIFEST’s size is its own bytes’', () => {
    assert.equal(resultOf(withScanned('MANIFEST.json', (f) => ({ size: f.size + 1 })), IDENTITY), 'failed')
  })

  it('positive control: a packaged file that is truly empty has size 0 and the empty digest', () => {
    const run = complete()
    const manifest = manifestOf({ files: { ...JSON.parse(run.packaged.manifest.toString('utf8')).files, 'empty.txt': EMPTY_SHA256 } })
    run.packaged = packagedOf(manifest)
    run.packaged.imageFiles.files.find((f) => f.path === 'empty.txt').size = 0
    run.identity.manifestSha256 = sha256Of(manifest)
    assert.equal(resultOf(run, IDENTITY), 'passed')
  })

  it('a settle job recorded succeeded without the run it names fails the first phase', () => {
    for (const change of [({ runId, ...f }) => f, (f) => ({ ...f, runId: '' })])
      assert.equal(verdictOf(withFacts('first', 'scheduled settle job', change)), 'failed')
  })
})

describe('review of 98d114d: a memory figure a cgroup counter cannot hold is no reading', () => {
  it('a fractional, negative or unsafe byte or event count does not pass the phase, and the run is not qualified', () => {
    for (const change of [
      (s) => ({ ...s, peak: 0.5 }),
      (s) => ({ ...s, current: 1_000_000_000.5 }),
      (s) => ({ ...s, peak: -1 }),
      (s) => ({ ...s, max: LIMIT_BYTES + 0.25 }),
      (s) => ({ ...s, swapMax: 0.5 }),
      (s) => ({ ...s, current: Number.MAX_SAFE_INTEGER + 1 }),
      (s) => ({ ...s, events: { ...s.events, oom: 0.5 } }),
      (s) => ({ ...s, events: { ...s.events, oom_group_kill: -0.5 } }),
    ]) {
      const run = withSample('first:after-flow', change)
      assert.notEqual(resultOf(run, 'memory, first:after-flow'), 'passed', JSON.stringify(change(sample('x'))))
      assert.notEqual(verdictOf(run), 'qualified')
    }
  })
})

describe('review of 98d114d: image sizes are whole bytes, and an HTTP status a whole number', () => {
  it('a fractional image or build-stage size fails the identity', () => {
    for (const key of ['image', 'buildImage']) {
      const run = complete()
      run.identity[key].size = 3e9 + 0.5
      assert.equal(resultOf(run, 'image built from'), 'failed', key)
    }
  })

  it('a fractional 2xx status fails the step that records it', () => {
    assert.equal(verdictOf(withFacts('first', 'first admin and board key', (f) => ({ ...f, claim: 200.5 }))), 'failed')
    assert.equal(verdictOf(withFacts('first', 'plugin installed and configured', (f) => ({ ...f, config: 204.5 }))), 'failed')
  })
})

describe('review of 98d114d: each probe phase records the HTTP status health answered with, and the body’s', () => {
  it('a health step without the HTTP status, or with one other than 200, fails its phase', () => {
    for (const phase of ['first', 'restart', 'restarted'])
      for (const change of [({ httpStatus, ...f }) => f, (f) => ({ ...f, httpStatus: 503 }), (f) => ({ ...f, httpStatus: '200' })])
        assert.equal(resultOf(withFacts(phase, 'health', change), `installed plugin flow, ${phase}`), 'failed', phase)
  })

  it('a 200 whose body reports another status fails too', () => {
    assert.equal(verdictOf(withFacts('restarted', 'health', (f) => ({ ...f, status: 'starting' }))), 'failed')
  })
})

describe('review of 63a929a: each probe phase’s deadline covers every limit the phase permits', () => {
  const WORKFLOW = fileURLToPath(new URL('../../.github/workflows/paperclip-image.yml', import.meta.url))

  it('each probe command runs under a deadline of at least its phase’s limits, and a bound above that deadline', () => {
    const steps = parse(readFileSync(WORKFLOW, 'utf8')).jobs.image.steps
    const commands = steps
      .flatMap((s) => (s.run ?? '').replace(/\\\n\s*/g, ' ').split('\n'))
      .map((l) => l.trim())
      .filter((l) => l.includes('paperclip-service-probe.mjs'))
    const flag = (command, name) => Number(new RegExp(`--${name} (\\d+)(?: |$)`).exec(command)?.[1])
    const phases = []
    for (const command of commands) {
      const phase = /--phase (\w+)/.exec(command)?.[1]
      phases.push(phase)
      const deadline = flag(command, 'deadline-ms')
      const minimum = minimumDeadlineMs(phase, flag(command, 'wait-ms'))
      assert.ok(deadline >= minimum, `${phase}: a deadline of ${deadline} ms, below the ${minimum} ms its limits permit`)
      const bound = Number(/^timeout (\d+) /.exec(command)?.[1])
      // Node's start and the result's write, outside the probe's own deadline.
      assert.ok(bound * 1000 >= deadline + 60_000, `${phase}: a bound of ${bound} s for a deadline of ${deadline} ms`)
    }
    assert.deepEqual(phases, ['first', 'restart', 'restarted'])
  })

  it('the first phase permits more than 600 s: the health wait, the plugin ready, a settle run, sixteen requests', () => {
    assert.equal(minimumDeadlineMs('first', 300_000), 860_000)
    assert.equal(minimumDeadlineMs('restart', 300_000), 490_000)
    assert.equal(minimumDeadlineMs('restarted', 300_000), 510_000)
  })
})

describe('review of 705c2b8: whatever shape a record has, at any depth, the receipt and its summary are written', () => {
  const SHAPES = [null, 'x', -1, 0.5, true, [], [null], {}, { files: [null] }]
  /** Every path inside a value, a Buffer's bytes aside. */
  function* pathsIn(value, path = []) {
    if (path.length > 0) yield path
    if (value === null || typeof value !== 'object' || Buffer.isBuffer(value)) return
    for (const key of Object.keys(value)) yield* pathsIn(value[key], [...path, key])
  }
  const setAt = (root, path, value) => {
    let at = root
    for (const key of path.slice(0, -1)) at = at[key]
    at[path.at(-1)] = value
  }
  /** Each record as the receipt command reads one: a JSON file, or a line of a JSONL file (always a record, or null). */
  const RECORDS = (run) => [
    ['context'],
    ['identity'],
    ['packaged', 'imageFiles'],
    ...['first', 'restart', 'restarted'].map((p) => ['probes', p]),
    ['home', 'first'],
    ['home', 'before'],
    ['home', 'after'],
    ...['timings', 'runtime', 'samples'].flatMap((list) => run[list].map((_, i) => [list, i])),
  ]

  /**
   * What the receipt does not judge, by design: the producer's own flags (the identity is recomputed instead), the
   * build stage's platform (the image's is judged), the scans' informational settings, each step's duration, and whether
   * the after snapshot paused its writer (the two a transition starts from must have been stopped).
   */
  const UNJUDGED =
    /^(identity\.(pin|sophiaCommit|sophiaTreeDirty|manifestMatches|verifyManifestInImage)|identity\.buildImage\.(os|architecture)|(home\.\w+|packaged\.imageFiles)\.coverage\.(maxFiles|maxFileBytes)|home\.after\.writer|packaged\.imageFiles\.prefixes|probes\.\w+\.steps\.\d+\.ms)$/

  it('positive control: the complete run is qualified, nothing unreadable', () => {
    const { receipt } = receiptOf(complete())
    assert.equal(receipt.verdict, 'qualified')
    assert.equal(receipt.unreadable, undefined)
  })

  it('every path inside every record, given each wrong shape: never thrown, and never qualified unless still valid', () => {
    let cases = 0
    for (const record of RECORDS(complete())) {
      const base = complete()
      const inside = [...pathsIn(record.reduce((at, key) => at[key], base))]
      for (const path of inside)
        for (const shape of SHAPES) {
          const run = complete()
          const where = [...record, ...path].join('.')
          const original = [...record, ...path].reduce((at, key) => at[key], base)
          setAt(run, [...record, ...path], structuredClone(shape))
          const { receipt, summary } = receiptOf(run)
          assert.ok(['qualified', 'failed', 'incomplete'].includes(receipt.verdict))
          assert.equal(typeof summary, 'string')
          for (const name of receipt.unreadable ?? []) assert.equal(receipt.checks.find((c) => c.name === name).result, 'unavailable', where)
          // No silent acceptance: a judged value replaced by a wrong shape is never qualified, unless the replacement is
          // itself what was recorded (`true` for `true`, `[]` for `[]`) or a valid value of its own (a run or a network
          // named "x", a start of half a second).
          const stillValid =
            isDeepStrictEqual(shape, original) ||
            (path.at(-1) === 'runId' && shape === 'x') ||
            (path.at(-1) === 'networkMode' && shape === 'x') ||
            (path.at(-1) === 'seconds' && shape === 0.5)
          if (receipt.verdict === 'qualified') assert.ok(UNJUDGED.test(where) || stillValid, `${where} <- ${JSON.stringify(shape)}`)
          // And the list is exact: a field on it is one the receipt reads nothing from, so no shape of it changes the verdict.
          if (UNJUDGED.test(where)) assert.equal(receipt.verdict, 'qualified', `${where} is listed as unjudged, yet <- ${JSON.stringify(shape)} gives ${receipt.verdict}`)
          cases += 1
        }
      // Each case changed its own run only: a complete run is still qualified, so no later case passes vacuously.
      assert.equal(receiptOf(complete()).receipt.verdict, 'qualified', `after ${record.join('.')}`)
    }
    assert.ok(cases > 1000, `${cases} cases`)
  })

  it('a check whose evidence throws however it is read is unavailable, and the summary is still written', () => {
    // No JSON makes these throw (the walk above finds none for the home); a record that throws on any read stands in
    // for a shape no check foresaw.
    const throwing = new Proxy({}, { get: () => { throw new Error('a shape no check foresaw') } })
    for (const [record, check] of [
      [['home', 'after'], 'home persisted across recreation'],
      [['home', 'before'], 'home persisted across recreation'],
      [['home', 'first'], 'home persisted across restart'],
      [['probes', 'first'], 'installed plugin flow, first'],
      [['probes', 'restarted'], 'installed plugin flow, restarted'],
      [['packaged', 'imageFiles'], 'image built from the pin'],
      [['timings', 0], 'first: healthy'],
      [['runtime', 0], 'runtime:'],
    ]) {
      const run = complete()
      setAt(run, record, throwing)
      const { receipt, summary } = receiptOf(run)
      const unavailable = receipt.checks.find((c) => c.name.startsWith(check))
      assert.equal(unavailable.result, 'unavailable', record.join('.'))
      assert.equal(unavailable.detail.error, 'a shape no check foresaw')
      assert.notEqual(receipt.verdict, 'qualified')
      assert.match(summary, new RegExp(`\\| ${check.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^|]* \\| unavailable \\|`), record.join('.'))
    }
  })

  it('a record missing altogether is not reached, never thrown', () => {
    for (const record of RECORDS(complete())) {
      const run = complete()
      if (typeof record.at(-1) === 'number') run[record[0]].splice(record[1], 1)
      else setAt(run, record, null)
      const { receipt } = receiptOf(run)
      assert.notEqual(receipt.verdict, 'qualified', record.join('.'))
    }
  })
})

describe('review of ebdbaa9: the runtime’s security options and ports are judged, and memory is the container’s own', () => {
  const RUNTIME = 'runtime:'
  const memoryOf = (run, phase) => assess(run).checks.find((c) => c.name === `memory, ${phase}`)
  const withSample = (phase, change) => {
    const run = complete()
    run.samples = run.samples.map((s) => (s.label === phase ? change(s) : s))
    return run
  }

  it('positive control: Docker’s default security options, well-formed ports, every sample from its start’s container', () => {
    const run = complete()
    assert.equal(resultOf(run, RUNTIME), 'passed')
    for (const phase of PHASES) assert.equal(memoryOf(run, phase).result, 'passed', phase)
    assert.equal(memoryOf(run, 'restart:healthy').detail.container, 'a'.repeat(64))
    assert.equal(memoryOf(run, 'recreated:idle').detail.container, 'b'.repeat(64))
  })

  it('a security option given, looser or stricter, or not a list, fails the runtime', () => {
    for (const securityOpt of [['seccomp=unconfined'], ['apparmor=unconfined'], ['no-new-privileges'], null, 'x', {}]) {
      const run = complete()
      run.runtime[1].securityOpt = securityOpt
      assert.equal(resultOf(run, RUNTIME), 'failed', JSON.stringify(securityOpt))
    }
  })

  it('a published port not a port and protocol, or a host port not a number, fails the runtime', () => {
    for (const change of [
      (p) => ({ ...p, port: null }),
      (p) => ({ ...p, port: ['3100/tcp'] }),
      (p) => ({ ...p, port: '3100' }),
      (p) => ({ ...p, hostPort: 3100 }),
      (p) => ({ ...p, hostPort: 'x' }),
    ]) {
      const run = complete()
      run.runtime[0].ports = run.runtime[0].ports.map(change)
      assert.equal(resultOf(run, RUNTIME), 'failed')
    }
  })

  it('every counter memory.events lists is a whole number, not only the OOM ones', () => {
    for (const value of [0.5, -1, '0', null])
      for (const name of ['low', 'high', 'max'])
        assert.equal(memoryOf(withSample('first:after-flow', (s) => ({ ...s, events: { ...s.events, [name]: value } })), 'first:after-flow').result, 'unavailable', `${name} ${value}`)
  })

  it('a sample without its provenance, from a guessed path, or from a path not naming its container, is no reading', () => {
    for (const change of [
      ({ cgroup, ...s }) => s,
      ({ containerId, ...s }) => s,
      (s) => ({ ...s, cgroup: { ...s.cgroup, source: 'scope-guess' } }),
      (s) => ({ ...s, cgroup: { ...s.cgroup, source: 'unrelated' } }),
      (s) => ({ ...s, cgroup: { ...s.cgroup, path: '/unrelated' } }),
      (s) => ({ ...s, cgroup: { source: 'unrelated', path: '/unrelated' } }),
      (s) => ({ ...s, cgroup: { ...s.cgroup, path: '/system.slice/docker-x.scope' } }),
      (s) => ({ ...s, cgroup: { ...s.cgroup, path: `/system.slice/docker-${'c'.repeat(64)}.scope` } }),
      (s) => ({ ...s, cgroup: { ...s.cgroup, path: `/system.slice/docker-${s.containerId}.scope/child` } }),
      (s) => ({ ...s, containerId: 'a'.repeat(63) }),
      // A path naming what the record calls the container is not enough: the id must be one Docker gives (64 hex).
      (s) => ({ ...s, containerId: 'abc', cgroup: { ...s.cgroup, path: '/system.slice/docker-abc.scope' } }),
    ]) {
      const run = withSample('restart:healthy', change)
      assert.equal(memoryOf(run, 'restart:healthy').result, 'unavailable')
      assert.notEqual(verdictOf(run), 'qualified')
    }
    // The cgroupfs form names the container too.
    const cgroupfs = withSample('first:healthy', (s) => ({ ...s, cgroup: { ...s.cgroup, path: `/docker/${s.containerId}` } }))
    assert.equal(memoryOf(cgroupfs, 'first:healthy').result, 'passed')
  })

  it('review of ebdbaa9 (the cases of the review): every sample without its cgroup, or with an unrelated source or path, and the run is not qualified', () => {
    for (const change of [
      ({ cgroup, ...s }) => s,
      (s) => ({ ...s, cgroup: { ...s.cgroup, source: 'unrelated' } }),
      (s) => ({ ...s, cgroup: { ...s.cgroup, path: '/unrelated' } }),
      (s) => ({ ...s, cgroup: { source: 'unrelated', path: '/unrelated' } }),
    ]) {
      const run = complete()
      run.samples = run.samples.map(change)
      assert.equal(verdictOf(run), 'incomplete')
      for (const phase of PHASES) assert.equal(memoryOf(run, phase).result, 'unavailable', phase)
    }
  })

  it('a restart’s sample from another container, or a recreation’s from the first one, fails', () => {
    const other = (s) => ({ ...s, containerId: 'c'.repeat(64), cgroup: { ...s.cgroup, path: `/system.slice/docker-${'c'.repeat(64)}.scope` } })
    const first = (s) => ({ ...s, containerId: 'a'.repeat(64), cgroup: { ...s.cgroup, path: `/system.slice/docker-${'a'.repeat(64)}.scope` } })
    assert.equal(memoryOf(withSample('restart:after-flow', other), 'restart:after-flow').result, 'failed')
    assert.equal(memoryOf(withSample('first:idle', other), 'first:idle').result, 'failed')
    assert.equal(memoryOf(withSample('recreated:healthy', first), 'recreated:healthy').result, 'failed')
    assert.equal(verdictOf(withSample('recreated:healthy', first)), 'failed')
    // A recreation that was no recreation: every sample after it still from the first container.
    const notRecreated = complete()
    notRecreated.samples = notRecreated.samples.map((s) => (s.label.startsWith('recreated:') ? first(s) : s))
    for (const phase of PHASES.filter((p) => p.startsWith('recreated:'))) assert.equal(memoryOf(notRecreated, phase).result, 'failed', phase)
    assert.equal(verdictOf(notRecreated), 'failed')
  })

  it('the sampler records the container it read beside the cgroup it resolved from that container’s process', { skip: process.platform !== 'linux' && 'the sampler reads /proc' }, async () => {
    const SAMPLER = fileURLToPath(new URL('../../scripts/paperclip-image-cgroup.mjs', import.meta.url))
    const dir = mkdtempSync(join(tmpdir(), 'pc-sampler-'))
    try {
      const id = 'e'.repeat(64)
      // A stand-in docker naming this test's own process as the container's, so its cgroup is resolved from /proc.
      writeFileSync(
        join(dir, 'docker'),
        [
          '#!/bin/sh',
          'case "$3" in',
          `  '{{json .State}}') echo '{"Running":true,"OOMKilled":false,"Pid":${process.pid}}' ;;`,
          `  '{{.Id}}') echo ${id} ;;`,
          '  *) echo "{}" ;;',
          'esac',
          '',
        ].join('\n'),
      )
      chmodSync(join(dir, 'docker'), 0o755)
      await promisify(execFile)(process.execPath, [SAMPLER, 'pc', 'first:healthy', join(dir, 'cgroup.jsonl')], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
      })
      const [record] = readFileSync(join(dir, 'cgroup.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
      assert.equal(record.containerId, id)
      assert.equal(record.cgroup.source, 'process')
      assert.equal(record.cgroup.path, readFileSync(`/proc/${process.pid}/cgroup`, 'utf8').split('\n').find((l) => l.startsWith('0::')).slice(3))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('review of 2bad104: the home is snapshotted at the recreation boundary, and judged across the restart too', () => {
  const WORKFLOW = fileURLToPath(new URL('../../.github/workflows/paperclip-image.yml', import.meta.url))
  const restartOf = (run) => assess(run).checks.find((c) => c.name === 'home persisted across restart')
  const recreationOf = (run) => assess(run).checks.find((c) => c.name === 'home persisted across recreation')
  const WRITTEN = { path: 'instances/default/state.json', size: 50, sha256: 'a'.repeat(64) }

  it('positive control: three snapshots, the log grown twice with its earlier bytes kept, both transitions passed', () => {
    const run = complete()
    assert.equal(restartOf(run).result, 'passed')
    assert.equal(recreationOf(run).result, 'passed')
    assert.equal(verdictOf(run), 'qualified')
  })

  it('the case of the review: a file written after the first phase and lost at the recreation fails, where the first snapshot alone saw nothing', () => {
    const run = complete()
    run.home.before.files = [...run.home.before.files, WRITTEN]
    run.home.before.coverage.total += 1
    assert.equal(restartOf(run).result, 'passed', 'written during the idle period, the restart or its probe: no loss across the restart')
    const recreation = recreationOf(run)
    assert.equal(recreation.result, 'failed')
    assert.deepEqual(recreation.detail.missing, [WRITTEN.path])
    assert.equal(verdictOf(run), 'failed')
    // Judged from the first phase's snapshot, as before this review, the loss was invisible: the file was never listed.
    assert.deepEqual(compareSnapshots(run.home.first.files, run.home.after.files, run.home.after.prefixes).missing, [])
  })

  it('a file present after the first phase and gone at the boundary, or a log rewritten by then, fails the restart transition', () => {
    const lost = complete()
    lost.home.before.files = lost.home.before.files.filter((f) => f.path !== 'instances/default/config.json')
    lost.home.before.coverage.total -= 1
    assert.equal(restartOf(lost).result, 'failed')
    assert.deepEqual(restartOf(lost).detail.missing, ['instances/default/config.json'])
    assert.equal(verdictOf(lost), 'failed')
    const rewritten = complete()
    rewritten.home.before.prefixes[LOG] = { size: 3000, sha256: 'e'.repeat(64) }
    assert.equal(restartOf(rewritten).result, 'failed')
    assert.deepEqual(restartOf(rewritten).detail.rewrittenGrowing, [LOG])
    assert.equal(recreationOf(rewritten).result, 'passed', 'the recreation kept what the boundary held')
  })

  it('a file lost at the recreation is a definite failure, however much else the snapshot left unread', () => {
    const run = complete()
    run.home.before.files = [...run.home.before.files, WRITTEN]
    run.home.before.coverage.total += 1
    // An unread entry beside the loss: unverified on its own, never a reason to soften a definite loss to unavailable.
    run.home.after.files = [...run.home.after.files, { path: 'instances/default/other.json', size: null, sha256: null, error: 'EACCES' }]
    run.home.after.coverage.total += 1
    const recreation = recreationOf(run)
    assert.equal(recreation.result, 'failed')
    assert.deepEqual(recreation.detail.missing, [WRITTEN.path])
    assert.deepEqual(recreation.detail.unverified, ['instances/default/other.json'])
  })

  it('each transition’s earlier snapshot must be of the stopped container: of a paused or unrecorded writer, that transition is unavailable', () => {
    for (const writer of ['paused', null, 'x', 7]) {
      const run = complete()
      run.home.before.writer = writer
      const recreation = recreationOf(run)
      assert.equal(recreation.result, 'unavailable', String(writer))
      assert.equal(recreation.detail.reason, 'the earlier snapshot is not of a stopped writer')
      assert.equal(restartOf(run).result, 'passed', 'the restart transition ends at that snapshot and does not need it stopped')
      assert.equal(verdictOf(run), 'incomplete')
      const beforeRestart = complete()
      beforeRestart.home.first.writer = writer
      assert.equal(restartOf(beforeRestart).result, 'unavailable', `before the restart: ${String(writer)}`)
      assert.equal(recreationOf(beforeRestart).result, 'passed')
      assert.equal(verdictOf(beforeRestart), 'incomplete')
    }
    const unrecorded = complete()
    delete unrecorded.home.before.writer
    assert.equal(recreationOf(unrecorded).result, 'unavailable')
    // The after snapshot pauses a running container, which keeps running for the idle sample: recorded, not required.
    const paused = complete()
    paused.home.after.writer = undefined
    assert.equal(verdictOf(paused), 'qualified')
  })

  it('without the first snapshot the restart transition is not reached, and the run is not qualified', () => {
    const run = complete()
    run.home.first = null
    assert.equal(restartOf(run).result, 'not reached')
    assert.equal(recreationOf(run).result, 'passed')
    assert.equal(verdictOf(run), 'incomplete')
  })

  it('the workflow: the first phase writes home-first.json; the boundary snapshot, from it, is the Restart step’s last command, and the next is the removal', () => {
    const steps = parse(readFileSync(WORKFLOW, 'utf8')).jobs.image.steps
    const commandsOf = (step) => step.run.replace(/\\\n\s*/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean)
    const firstStep = commandsOf(steps.find((s) => s.name === "First start, the installed plugin's flow, idle"))
    const restart = commandsOf(steps.find((s) => s.name === 'Restart'))
    const recreate = commandsOf(steps.find((s) => s.name?.startsWith('Recreate')))
    const snapshot = 'node sophia/scripts/paperclip-image-home.mjs snapshot pc'
    assert.equal(firstStep.at(-1), `timeout 240 ${snapshot} "$EVIDENCE/home-first.json"`, 'the first phase’s snapshot, from nothing earlier, is its last command: after the idle period')
    assert.equal(firstStep.at(-2), 'timeout 150 node sophia/scripts/paperclip-image-container.mjs stop', 'of the stopped container')
    assert.match(restart[0], /paperclip-image-container\.mjs restart restart$/, 'the restart starts it again')
    assert.equal(restart.at(-1), `timeout 240 ${snapshot} "$EVIDENCE/home-before.json" "$EVIDENCE/home-first.json"`, 'the boundary snapshot is the last thing before the removal')
    assert.equal(restart.at(-2), 'timeout 150 node sophia/scripts/paperclip-image-container.mjs stop', 'the writer is stopped before that snapshot, and nothing starts it again')
    assert.ok(!restart.slice(0, -2).some((c) => c.includes('container.mjs stop')), 'stopped once, last')
    assert.match(recreate[0], /paperclip-image-container\.mjs remove$/)
    assert.ok(recreate.includes(`timeout 240 ${snapshot} "$EVIDENCE/home-after.json" "$EVIDENCE/home-before.json"`))
    const compare = 'node sophia/scripts/paperclip-image-home.mjs compare'
    assert.ok(recreate.includes(`timeout 60 ${compare} "$EVIDENCE/home-before.json" "$EVIDENCE/home-after.json" "$EVIDENCE/home-compare.json"`))
    assert.ok(recreate.includes(`timeout 60 ${compare} "$EVIDENCE/home-first.json" "$EVIDENCE/home-before.json" "$EVIDENCE/home-restart-compare.json"`))
    // home-before.json is written once, at the boundary, and nowhere earlier.
    const writers = steps.flatMap((s) => commandsOf({ run: s.run ?? '' })).filter((c) => c.includes('snapshot pc "$EVIDENCE/home-before.json"'))
    assert.equal(writers.length, 1)
  })
})

describe('review of cc0ffbb: the snapshot before the restart is taken after the idle period, of the stopped container', () => {
  const restartOf = (run) => assess(run).checks.find((c) => c.name === 'home persisted across restart')
  const WRITTEN = { path: 'instances/default/idle.json', size: 50, sha256: 'b'.repeat(64) }

  it('the case of the review: a file written during the idle period and lost at the restart fails, where a snapshot before the idle period saw nothing', () => {
    const run = complete()
    run.home.first.files = [...run.home.first.files, WRITTEN]
    run.home.first.coverage.total += 1
    const restart = restartOf(run)
    assert.equal(restart.result, 'failed')
    assert.deepEqual(restart.detail.missing, [WRITTEN.path])
    assert.equal(verdictOf(run), 'failed')
    // Judged from a snapshot taken before the idle period, as before this review, the file was in neither snapshot.
    const early = complete()
    assert.deepEqual(compareSnapshots(early.home.first.files, early.home.before.files, early.home.before.prefixes).missing, [])
    assert.equal(restartOf(early).result, 'passed')
  })
})
