#!/usr/bin/env node
// WBC-02 (WBC-02-CC-0013, CX-0032, CX-0036): assembles the credential-free receipt of the Paperclip image qualification
// from what the workflow recorded in one directory, whatever point the run reached:
//   node scripts/paperclip-image-receipt.mjs <dir> <receipt.json> <summary.md>
// Inputs (each optional; a missing one is `not reached`, never filled in): context.json, disk.jsonl, identity.json,
// timings.jsonl, cgroup.jsonl (scripts/paperclip-image-cgroup.mjs), probe-first.json and probe-restarted.json (the
// service probe's --url phases), home-before.json and home-after.json (scripts/paperclip-image-home.mjs snapshots),
// manifest.json and image-manifest.json (the build's MANIFEST and the image's copy, as bytes) and image-files.json (a
// scan of /opt/sophia inside the image).
// Every check validates the recorded values themselves, never a producer's own pass flag: the identity against the
// run's context, and the packaged files recomputed from the manifests and the image's own files (review of 896a92d);
// each start's recorded health answer 200 and ok within HEALTH_LIMIT_S (review of 4c63217); each memory phase read
// exactly once, every figure a number, the limit 2 GiB without swap, peak and current within it, and no OOM event of
// any kind; each probe phase's required steps all present and passed, and what each observed (statuses, outcomes, the same plugin, issue and configuration
// across both phases) recorded and as required; the home's persistence recomputed from the two snapshots, every size
// and digest it compares one that was read, and every file under the home covered (CX-0039).
// A check is passed, failed, unavailable (recorded but incomplete) or not reached. The verdict is `qualified` only when
// every check passed, `failed` when any failed, and `incomplete` otherwise. What it qualifies: the image built from the
// pin and a clean Sophia commit, on a GitHub-hosted linux/amd64 runner, under a 2 GiB memory cgroup without swap, with
// the installed plugin's flow. Not Render's platform, not a registry digest (the image ID is the local config digest),
// not a real Sophia.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareSnapshots, coverageOf } from './paperclip-image-home.mjs'

export const LIMIT_BYTES = 2 * 1024 ** 3
export const HEALTH_LIMIT_S = 300
export const PHASES = ['first:healthy', 'first:after-flow', 'first:idle', 'restart:healthy', 'recreated:healthy', 'recreated:after-flow', 'recreated:idle']
export const STARTS = ['first', 'restart', 'recreated']
export const PROBE_STEPS = {
  first: [
    'health',
    'host-name guard',
    'first admin and board key',
    'plugin installed and configured',
    'signed commission and its resend',
    'signed Stop and its resend',
    'scheduled settle job',
    'lookup',
    'config digest',
  ],
  restarted: [
    'health',
    'plugin ready again',
    'config unchanged',
    'same issue found, still cancelled',
    'commission resend answered by the same issue',
    'sign-up refused',
    'host-name guard',
  ],
}
const OOM_EVENTS = ['oom', 'oom_kill', 'oom_group_kill']

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const DIGEST = /^sha256:[0-9a-f]{64}$/
const SHA256 = /^[0-9a-f]{64}$/

/**
 * What the image packages, recomputed from the bytes rather than the identity step's flags (review of 896a92d): the
 * build's MANIFEST, the image's copy of it (byte for byte the same), and a scan of /opt/sophia inside the image (every
 * file read once, complete). Every file the manifest records but the Dockerfile (recorded for reference, not copied) is
 * there with its digest, and nothing else is but the MANIFEST itself.
 */
function packagedFacts(identity, context, { manifest, imageManifest, imageFiles } = {}) {
  if (!Buffer.isBuffer(manifest)) return null
  let recorded = null
  try {
    recorded = JSON.parse(manifest.toString('utf8'))
  } catch {
    // An unreadable manifest packages nothing.
  }
  const files = recorded?.files && typeof recorded.files === 'object' ? Object.entries(recorded.files) : []
  const digest = createHash('sha256').update(manifest).digest('hex')
  const scanned = Array.isArray(imageFiles?.files) ? imageFiles.files : []
  const inImage = new Map(scanned.map((f) => [f.path, f]))
  const expected = new Map([...files.filter(([path]) => path !== 'Dockerfile'), ['MANIFEST.json', digest]])
  const missing = [...expected].filter(([path, sha]) => inImage.get(path)?.sha256 !== sha || !isNumber(inImage.get(path)?.size)).map(([path]) => path)
  const unrecorded = scanned.filter((f) => !expected.has(f.path)).map((f) => f.path)
  return {
    facts: {
      pin: recorded?.paperclipPin === context.pin,
      sophiaCommit: recorded?.sophiaCommit === context.candidate,
      cleanTree: recorded?.sophiaTreeDirty === false,
      manifestDigest: digest === identity.manifestSha256,
      imageManifest: Buffer.isBuffer(imageManifest) && imageManifest.equals(manifest),
      manifestFiles: files.length > 0 && files.every(([path, sha]) => path.length > 0 && SHA256.test(sha)),
      imageScanned: coverageOf(imageFiles).complete && inImage.size === scanned.length,
      packaged: expected.size > 1 && missing.length === 0 && unrecorded.length === 0,
    },
    detail: { manifestSha256: digest, files: files.length, missing, unrecorded },
  }
}

function identityCheck(identity, context, packaged) {
  if (!identity || !context) return { result: 'not reached' }
  const image = identity.image ?? {}
  const build = identity.buildImage ?? {}
  const recomputed = packagedFacts(identity, context, packaged)
  if (!recomputed) return { result: 'unavailable', detail: { reason: 'the manifests and the image scan were not recorded' } }
  const facts = {
    ...recomputed.facts,
    image: DIGEST.test(image.id ?? '') && isNumber(image.size) && image.size > 0,
    buildStage: DIGEST.test(build.id ?? '') && isNumber(build.size) && build.size > 0,
    platform: image.os === 'linux' && image.architecture === 'amd64',
  }
  return {
    result: Object.values(facts).every(Boolean) ? 'passed' : 'failed',
    detail: { ...facts, ...recomputed.detail, imageId: image.id, buildImageId: build.id },
  }
}

function startCheck(timings, label) {
  const records = timings.filter((t) => t.label === label)
  if (records.length === 0) return { result: 'not reached' }
  if (records.length > 1) return { result: 'failed', detail: { reason: `${records.length} records for one start` } }
  const [t] = records
  if (!isNumber(t.seconds)) return { result: 'unavailable', detail: t }
  // Healthy is the answer the server gave, as recorded: 200 with the status `ok`, never the producer's own flag (review
  // of 4c63217). A start said ok with no answer recorded is incomplete; one said not ok has failed whatever it holds.
  const healthy = t.health?.status === 200 && t.health?.reported === 'ok'
  if (!healthy && t.health == null && t.ok === true) return { result: 'unavailable', detail: t }
  // Within the bound and not negative: a negative duration is an impossible record, never a fast start (review of 9130676).
  return { result: healthy && t.seconds >= 0 && t.seconds <= HEALTH_LIMIT_S ? 'passed' : 'failed', detail: t }
}

/**
 * What Docker configured for each start (scripts/paperclip-image-container.mjs, runtime.jsonl), against the stated
 * scope: not privileged, Docker's default capability set exactly (none added or dropped, review of 3c29dd1), not the
 * host's network, published on 127.0.0.1 only. One record per start (review of 9130676).
 */
function runtimeCheck(records) {
  if (records.length === 0) return { result: 'not reached' }
  const counts = STARTS.map((label) => records.filter((r) => r.label === label).length)
  if (counts.some((n) => n > 1)) return { result: 'failed', detail: { reason: 'more than one record for a start', records } }
  if (counts.some((n) => n === 0)) return { result: 'unavailable', detail: { reason: 'a start without its record', records } }
  const holds = (r) =>
    r.privileged === false &&
    Array.isArray(r.capAdd) &&
    r.capAdd.length === 0 &&
    // Docker's default set exactly: nothing dropped either, so a stricter runtime never qualifies (review of 3c29dd1).
    Array.isArray(r.capDrop) &&
    r.capDrop.length === 0 &&
    typeof r.networkMode === 'string' &&
    r.networkMode !== 'host' &&
    !r.networkMode.startsWith('container:') &&
    Array.isArray(r.ports) &&
    r.ports.length > 0 &&
    r.ports.every((p) => p.hostIp === '127.0.0.1')
  const failing = records.filter((r) => !holds(r)).map((r) => r.label)
  return { result: failing.length === 0 ? 'passed' : 'failed', detail: { failing, records } }
}

function memoryCheck(samples, phase) {
  const records = samples.filter((s) => s.label === phase)
  if (records.length === 0) return { result: 'not reached' }
  if (records.length > 1) return { result: 'failed', detail: { reason: `${records.length} samples for one phase` } }
  const [s] = records
  const events = s.events ?? {}
  const detail = {
    maxBytes: s.max,
    swapMax: s.swapMax,
    peakBytes: s.peak,
    currentBytes: s.current,
    events,
    oomKilled: s.oomKilled,
    running: s.running,
    cgroupSource: s.cgroup?.source,
    unavailable: s.unavailable,
  }
  const read =
    Array.isArray(s.unavailable) &&
    s.unavailable.length === 0 &&
    [s.max, s.swapMax, s.peak, s.current, ...OOM_EVENTS.map((name) => events[name])].every(isNumber) &&
    typeof s.oomKilled === 'boolean' &&
    typeof s.running === 'boolean'
  if (!read) return { result: 'unavailable', detail }
  const within =
    s.running &&
    !s.oomKilled &&
    s.max === LIMIT_BYTES &&
    s.swapMax === 0 &&
    s.peak > 0 &&
    s.peak <= LIMIT_BYTES &&
    s.current > 0 &&
    s.current <= LIMIT_BYTES &&
    OOM_EVENTS.every((name) => events[name] === 0)
  return { result: within ? 'passed' : 'failed', detail }
}

const is2xx = (v) => isNumber(v) && v >= 200 && v < 300
const id = (v) => typeof v === 'string' && v.length > 0

/**
 * What each required step must have observed (its recorded facts, never its ok flag); `first` is the first phase's
 * facts by step, for the restarted phase's identity checks: the same plugin, issue and configuration.
 */
const FACTS = {
  first: {
    health: (f) => f.status === 'ok',
    'host-name guard': (f) => f.privateName === 200 && f.otherName === 403,
    'first admin and board key': (f) => f.signUp === 200 && is2xx(f.claim) && is2xx(f.boardKey) && f.boardKeyMinted === true,
    'plugin installed and configured': (f) => id(f.pluginId) && f.install === 200 && f.status === 'ready' && is2xx(f.config),
    'signed commission and its resend': (f) =>
      id(f.issueId) && f.first === 'created' && f.resend === 'existing' && f.resendIssueId === f.issueId,
    'signed Stop and its resend': (f, all) =>
      f.issueId === all['signed commission and its resend']?.issueId &&
      f.first === 'applied' &&
      f.firstStatus === 'cancelled' &&
      f.resend === 'already' &&
      f.status === 'cancelled',
    'scheduled settle job': (f) => f.status === 'succeeded',
    lookup: (f, all) =>
      f.outcome === 'found' && f.issueId === all['signed commission and its resend']?.issueId && f.status === 'cancelled',
    'config digest': (f) => SHA256.test(f.sha256 ?? ''),
  },
  restarted: {
    health: (f) => f.status === 'ok',
    'plugin ready again': (f, _all, first) => f.status === 'ready' && f.pluginId === first['plugin installed and configured']?.pluginId,
    'config unchanged': (f, _all, first) =>
      SHA256.test(f.after ?? '') && f.before === f.after && f.after === first['config digest']?.sha256,
    'same issue found, still cancelled': (f, _all, first) =>
      f.outcome === 'found' && f.issueId === first['signed commission and its resend']?.issueId && f.status === 'cancelled',
    'commission resend answered by the same issue': (f, _all, first) =>
      f.outcome === 'existing' && f.issueId === first['signed commission and its resend']?.issueId,
    // As the pin's auth refuses it, not any client error (review of 08c2915).
    'sign-up refused': (f) => f.status === 400 && f.code === 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
    'host-name guard': (f) => f.privateName === 200 && f.otherName === 403,
  },
}

const factsOf = (probe) => Object.fromEntries((probe?.steps ?? []).map((s) => [s.step, s.detail ?? {}]))

function probeCheck(probe, phase, firstProbe) {
  if (!probe) return { result: 'not reached' }
  const steps = Array.isArray(probe.steps) ? probe.steps : []
  const missing = PROBE_STEPS[phase].filter((name) => steps.filter((s) => s.step === name).length !== 1)
  const failing = steps.filter((s) => s.ok !== true).map((s) => s.step)
  const all = factsOf(probe)
  const first = factsOf(firstProbe)
  const unsupported = PROBE_STEPS[phase].filter((name) => !missing.includes(name) && !FACTS[phase][name](all[name], all, first))
  const passed = probe.phase === phase && probe.outcome === 'passed' && missing.length === 0 && failing.length === 0 && unsupported.length === 0
  return {
    result: passed ? 'passed' : 'failed',
    detail: {
      outcome: probe.outcome,
      missing,
      failing,
      unsupported,
      steps: steps.map((s) => ({ step: s.step, ok: s.ok, ...(s.detail ? { detail: s.detail } : {}), ...(s.error ? { error: s.error } : {}) })),
    },
  }
}

/**
 * The home across the recreation, recomputed from the two snapshots. Failed on a definite difference between measured
 * files (a stable file changed, a growing record rewritten; with complete coverage, a file or the registry gone);
 * unavailable when an entry was recorded without its size or digest, or a snapshot did not list and hash every file
 * (WBC-02-CX-0039): what was not read is reported, never counted as equal.
 */
function homeCheck(before, after) {
  if (!before || !after) return { result: 'not reached' }
  if (!Array.isArray(before.files) || !Array.isArray(after.files)) return { result: 'unavailable' }
  const comparison = compareSnapshots(before.files, after.files, after.prefixes ?? {})
  const coverage = { before: coverageOf(before), after: coverageOf(after) }
  const complete = coverage.before.complete && coverage.after.complete
  const detail = { ...comparison, coverage }
  const definite =
    comparison.changedStable.length > 0 ||
    comparison.rewrittenGrowing.length > 0 ||
    (complete && (comparison.missing.length > 0 || comparison.requiredAbsent.length > 0))
  if (definite) return { result: 'failed', detail }
  if (!complete || comparison.unverified.length > 0) return { result: 'unavailable', detail }
  return { result: comparison.persisted ? 'passed' : 'failed', detail }
}

/** The receipt of one run's recorded inputs. */
export function assess({
  context = null,
  disk = [],
  identity = null,
  packaged = {},
  timings = [],
  runtime = [],
  samples = [],
  probes = {},
  home = {},
}) {
  const checks = [
    { name: 'image built from the pin and a clean Sophia commit, linux/amd64, packaged files as recorded', ...identityCheck(identity, context, packaged) },
    ...STARTS.map((label) => ({ name: `${label}: healthy within ${HEALTH_LIMIT_S} s`, ...startCheck(timings, label) })),
    { name: 'runtime: not privileged, Docker’s default capabilities (none added or dropped), not the host network, loopback only', ...runtimeCheck(runtime) },
    ...PHASES.map((phase) => ({ name: `memory, ${phase}`, ...memoryCheck(samples, phase) })),
    ...['first', 'restarted'].map((phase) => ({ name: `installed plugin flow, ${phase}`, ...probeCheck(probes[phase], phase, probes.first) })),
    { name: 'home persisted across recreation', ...homeCheck(home.before, home.after) },
  ]
  const results = checks.map((c) => c.result)
  const verdict = results.includes('failed') ? 'failed' : results.every((r) => r === 'passed') ? 'qualified' : 'incomplete'
  return {
    schema: 'sophia.paperclip-image-receipt.v2',
    verdict,
    scope:
      'The two-step image from the Paperclip pin and a clean Sophia commit, built and run on a GitHub-hosted linux/amd64 runner under a 2 GiB memory cgroup without swap, with Docker’s default capability set (none added or dropped; not privileged, not the host network, published on loopback only), with a disposable database and home and synthetic credentials; the installed plugin flow through the service probe --url. Not Render platform fit, not a registry digest, not a real Sophia (its address is closed in the container).',
    context,
    disk,
    images: identity && { build: identity.buildImage, image: identity.image },
    checks,
  }
}

function homeLine(check) {
  const d = check?.detail
  if (!d) return `Home: ${check?.result ?? 'not reached'}.`
  const cover = (c) =>
    `${c.listed ?? '?'} of ${c.total ?? '?'} files listed` +
    `${c.oversize?.length ? `, ${c.oversize.length} too large to hash` : ''}` +
    `${c.errors?.length ? `, ${c.errors.length} directories unread` : ''}${c.complete ? '' : ' (incomplete)'}`
  const list = (name, paths) => (paths.length ? `; ${name}: ${paths.join(', ')}` : '')
  return (
    `Home: ${check.result}. Before ${cover(d.coverage.before)}; after ${cover(d.coverage.after)}` +
    list('missing', d.missing) +
    list('changed stable', d.changedStable) +
    list('growing, rewritten', d.rewrittenGrowing) +
    list('growing, appended', d.changedGrowing.filter((p) => !d.rewrittenGrowing.includes(p))) +
    list('required absent', d.requiredAbsent) +
    list('unverified', d.unverified) +
    '.'
  )
}

function summaryOf(receipt, samples) {
  const mib = (n) => (isNumber(n) ? `${Math.round(n / 1048576)} MiB` : '—')
  const image = receipt.images?.image
  return [
    `## Paperclip image qualification: ${receipt.verdict}`,
    '',
    receipt.scope,
    '',
    '| Check | Result |',
    '|---|---|',
    ...receipt.checks.map((c) => `| ${c.name} | ${c.result} |`),
    '',
    '| Memory phase | max | swap.max | peak | current | oom / oom_kill / oom_group_kill | OOMKilled |',
    '|---|---|---|---|---|---|---|',
    ...PHASES.map((p) => {
      const s = samples.find((r) => r.label === p)
      return s
        ? `| ${p} | ${mib(s.max)} | ${s.swapMax ?? '—'} | ${mib(s.peak)} | ${mib(s.current)} | ${s.events?.oom ?? '—'} / ${s.events?.oom_kill ?? '—'} / ${s.events?.oom_group_kill ?? '—'} | ${s.oomKilled} |`
        : `| ${p} | not reached | | | | | |`
    }),
    '',
    homeLine(receipt.checks.find((c) => c.name === 'home persisted across recreation')),
    '',
    image
      ? `Image ${image.id} (${image.os}/${image.architecture}, ${mib(image.size)}); build stage ${receipt.images.build?.id} (${mib(receipt.images.build?.size)}). The image ID is the local config digest; nothing was pushed.`
      : 'The image was not built.',
    '',
  ].join('\n')
}

const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  const [dir, out, summary] = process.argv.slice(2)
  const json = (name) => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), 'utf8')) : null)
  const bytes = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name)) : null)
  const lines = (name) =>
    existsSync(join(dir, name))
      ? readFileSync(join(dir, name), 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l))
      : []
  const samples = lines('cgroup.jsonl')
  const receipt = assess({
    context: json('context.json'),
    disk: lines('disk.jsonl'),
    identity: json('identity.json'),
    packaged: { manifest: bytes('manifest.json'), imageManifest: bytes('image-manifest.json'), imageFiles: json('image-files.json') },
    timings: lines('timings.jsonl'),
    runtime: lines('runtime.jsonl'),
    samples,
    probes: { first: json('probe-first.json'), restarted: json('probe-restarted.json') },
    home: { before: json('home-before.json'), after: json('home-after.json') },
  })
  writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`)
  writeFileSync(summary, summaryOf(receipt, samples))
  console.log(`[receipt] ${receipt.verdict}: ${receipt.checks.filter((c) => c.result === 'passed').length}/${receipt.checks.length} checks passed`)
}
