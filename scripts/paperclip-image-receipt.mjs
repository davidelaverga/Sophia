#!/usr/bin/env node
// WBC-02 (WBC-02-CC-0013, CX-0032, CX-0036): assembles the credential-free receipt of the Paperclip image qualification
// from what the workflow recorded in one directory, whatever point the run reached:
//   node scripts/paperclip-image-receipt.mjs <dir> <receipt.json> <summary.md>
// Inputs (each optional; a missing one is `not reached`, never filled in): context.json, disk.jsonl, identity.json,
// timings.jsonl, cgroup.jsonl (scripts/paperclip-image-cgroup.mjs), probe-first.json and probe-restarted.json (the
// service probe's --url phases), home-before.json and home-after.json (scripts/paperclip-image-home.mjs snapshots).
// Every check validates the recorded values themselves, never a producer's own pass flag: the identity against the
// run's context; each start healthy within HEALTH_LIMIT_S; each memory phase read exactly once, every figure a number,
// the limit 2 GiB without swap, peak and current within it, and no OOM event of any kind; each probe phase's required
// steps all present and passed, with their outcomes; the home's persistence recomputed from the two snapshots.
// A check is passed, failed, unavailable (recorded but incomplete) or not reached. The verdict is `qualified` only when
// every check passed, `failed` when any failed, and `incomplete` otherwise. What it qualifies: the image built from the
// pin and a clean Sophia commit, on a GitHub-hosted linux/amd64 runner, under a 2 GiB memory cgroup without swap, with
// the installed plugin's flow. Not Render's platform, not a registry digest (the image ID is the local config digest),
// not a real Sophia.
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareSnapshots } from './paperclip-image-home.mjs'

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

function identityCheck(identity, context) {
  if (!identity || !context) return { result: 'not reached' }
  const image = identity.image ?? {}
  const build = identity.buildImage ?? {}
  const facts = {
    pin: identity.pin === context.pin,
    sophiaCommit: identity.sophiaCommit === context.candidate,
    cleanTree: identity.sophiaTreeDirty === false,
    manifest: identity.manifestMatches === true && identity.verifyManifestInImage === true && /^[0-9a-f]{64}$/.test(identity.manifestSha256 ?? ''),
    image: DIGEST.test(image.id ?? '') && isNumber(image.size) && image.size > 0,
    buildStage: DIGEST.test(build.id ?? '') && isNumber(build.size) && build.size > 0,
    platform: image.os === 'linux' && image.architecture === 'amd64',
  }
  return { result: Object.values(facts).every(Boolean) ? 'passed' : 'failed', detail: { ...facts, imageId: image.id, buildImageId: build.id } }
}

function startCheck(timings, label) {
  const records = timings.filter((t) => t.label === label)
  if (records.length === 0) return { result: 'not reached' }
  if (records.length > 1) return { result: 'failed', detail: { reason: `${records.length} records for one start` } }
  const [t] = records
  if (!isNumber(t.seconds)) return { result: 'unavailable', detail: t }
  return { result: t.ok === true && t.seconds <= HEALTH_LIMIT_S ? 'passed' : 'failed', detail: t }
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
    [s.max, s.swapMax, s.peak, s.current, events.oom, events.oom_kill].every(isNumber) &&
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
    OOM_EVENTS.every((name) => events[name] === undefined || events[name] === 0)
  return { result: within ? 'passed' : 'failed', detail }
}

function probeCheck(probe, phase) {
  if (!probe) return { result: 'not reached' }
  const steps = Array.isArray(probe.steps) ? probe.steps : []
  const byName = (name) => steps.filter((s) => s.step === name)
  const missing = PROBE_STEPS[phase].filter((name) => byName(name).length !== 1)
  const failing = steps.filter((s) => s.ok !== true).map((s) => s.step)
  const detail = (name) => byName(name)[0]?.detail ?? {}
  const outcomes =
    phase === 'first'
      ? detail('signed commission and its resend').first === 'created' &&
        detail('signed commission and its resend').resend === 'existing' &&
        detail('signed Stop and its resend').first === 'applied' &&
        detail('signed Stop and its resend').resend === 'already' &&
        detail('signed Stop and its resend').status === 'cancelled' &&
        detail('scheduled settle job').status === 'succeeded'
      : isNumber(detail('sign-up refused').status) && detail('sign-up refused').status >= 400
  const passed = probe.phase === phase && probe.outcome === 'passed' && missing.length === 0 && failing.length === 0 && outcomes
  return {
    result: passed ? 'passed' : 'failed',
    detail: { outcome: probe.outcome, missing, failing, steps: steps.map((s) => ({ step: s.step, ok: s.ok, ...(s.detail ? { detail: s.detail } : {}), ...(s.error ? { error: s.error } : {}) })) },
  }
}

function homeCheck(before, after) {
  if (!before || !after) return { result: 'not reached' }
  if (!Array.isArray(before.files) || !Array.isArray(after.files)) return { result: 'unavailable' }
  const comparison = compareSnapshots(before.files, after.files)
  return { result: comparison.persisted ? 'passed' : 'failed', detail: comparison }
}

/** The receipt of one run's recorded inputs. */
export function assess({ context = null, disk = [], identity = null, timings = [], samples = [], probes = {}, home = {} }) {
  const checks = [
    { name: 'image built from the pin and a clean Sophia commit, linux/amd64, packaged files as recorded', ...identityCheck(identity, context) },
    ...STARTS.map((label) => ({ name: `${label}: healthy within ${HEALTH_LIMIT_S} s`, ...startCheck(timings, label) })),
    ...PHASES.map((phase) => ({ name: `memory, ${phase}`, ...memoryCheck(samples, phase) })),
    ...['first', 'restarted'].map((phase) => ({ name: `installed plugin flow, ${phase}`, ...probeCheck(probes[phase], phase) })),
    { name: 'home persisted across recreation', ...homeCheck(home.before, home.after) },
  ]
  const results = checks.map((c) => c.result)
  const verdict = results.includes('failed') ? 'failed' : results.every((r) => r === 'passed') ? 'qualified' : 'incomplete'
  return {
    schema: 'sophia.paperclip-image-receipt.v2',
    verdict,
    scope:
      'The two-step image from the Paperclip pin and a clean Sophia commit, built and run on a GitHub-hosted linux/amd64 runner under a 2 GiB memory cgroup without swap, with a disposable database and home and synthetic credentials; the installed plugin flow through the service probe --url. Not Render platform fit, not a registry digest, not a real Sophia (its address is closed in the container).',
    context,
    disk,
    images: identity && { build: identity.buildImage, image: identity.image },
    checks,
  }
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
    '| Memory phase | max | swap.max | peak | current | oom / oom_kill | OOMKilled |',
    '|---|---|---|---|---|---|---|',
    ...PHASES.map((p) => {
      const s = samples.find((r) => r.label === p)
      return s
        ? `| ${p} | ${mib(s.max)} | ${s.swapMax ?? '—'} | ${mib(s.peak)} | ${mib(s.current)} | ${s.events?.oom ?? '—'} / ${s.events?.oom_kill ?? '—'} | ${s.oomKilled} |`
        : `| ${p} | not reached | | | | | |`
    }),
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
    timings: lines('timings.jsonl'),
    samples,
    probes: { first: json('probe-first.json'), restarted: json('probe-restarted.json') },
    home: { before: json('home-before.json'), after: json('home-after.json') },
  })
  writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`)
  writeFileSync(summary, summaryOf(receipt, samples))
  console.log(`[receipt] ${receipt.verdict}: ${receipt.checks.filter((c) => c.result === 'passed').length}/${receipt.checks.length} checks passed`)
}
