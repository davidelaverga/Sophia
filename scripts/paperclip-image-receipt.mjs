#!/usr/bin/env node
// WBC-02 (WBC-02-CC-0013, CX-0032): assembles the credential-free receipt of the Paperclip image qualification from
// what the workflow recorded in one directory, whatever point the run reached:
//   node scripts/paperclip-image-receipt.mjs <dir> <receipt.json> <summary.md>
// Inputs (each optional; a missing one is reported as not reached, never filled in): context.json, disk.jsonl,
// identity.json, timings.jsonl, cgroup.jsonl (scripts/paperclip-image-cgroup.mjs), probe-first.json and
// probe-restarted.json (the service probe's --url phases), home-compare.json (scripts/paperclip-image-home.mjs).
// The verdict is `qualified` only when every check passed and every memory measurement was read; `failed` when a check
// failed; otherwise `incomplete`. What it qualifies: the image built from the pin and a clean Sophia commit, on a
// GitHub-hosted linux/amd64 runner, under a 2 GiB memory cgroup with no swap, with the installed plugin's flow. Not
// Render's platform, not a registry digest (the image ID is the local config digest), not a real Sophia.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dir, out, summary] = process.argv.slice(2)
const LIMIT = 2 * 1024 ** 3
const PHASES = ['first:healthy', 'first:after-flow', 'first:idle', 'restart:healthy', 'recreated:healthy', 'recreated:after-flow', 'recreated:idle']

const json = (name) => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), 'utf8')) : null)
const lines = (name) =>
  existsSync(join(dir, name))
    ? readFileSync(join(dir, name), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : []

const checks = []
const check = (name, value, detail) => checks.push({ name, result: value === undefined ? 'not reached' : value ? 'passed' : 'failed', detail })

const identity = json('identity.json')
check(
  'image built from the pin and a clean Sophia commit',
  identity ? identity.pinMatches && identity.sophiaTreeDirty === false && identity.sophiaCommitMatches : undefined,
  identity && { pin: identity.pin, sophiaCommit: identity.sophiaCommit },
)
check(
  'image is linux/amd64',
  identity?.image ? identity.image.os === 'linux' && identity.image.architecture === 'amd64' : undefined,
  identity?.image && `${identity.image.os}/${identity.image.architecture}`,
)
check(
  'packaged files match MANIFEST.json',
  identity ? identity.manifestMatches && identity.verifyManifestInImage : undefined,
  identity && { manifestSha256: identity.manifestSha256 },
)

const timings = lines('timings.jsonl')
for (const label of ['first', 'restart', 'recreated'])
  check(`${label}: healthy within its deadline`, timings.find((t) => t.label === label)?.ok, timings.find((t) => t.label === label))

const samples = lines('cgroup.jsonl')
for (const phase of PHASES) {
  const s = samples.find((r) => r.label === phase)
  const read = s && s.unavailable.length === 0
  const ok = read && s.running && s.max === LIMIT && s.swapMax === 0 && s.events?.oom_kill === 0 && s.oomKilled === false
  check(`memory, ${phase}`, s ? (read ? ok : undefined) : undefined, s && {
    maxBytes: s.max,
    swapMax: s.swapMax,
    peakBytes: s.peak,
    currentBytes: s.current,
    oom: s.events?.oom,
    oomKill: s.events?.oom_kill,
    oomKilled: s.oomKilled,
    cgroupSource: s.cgroup?.source,
    unavailable: s.unavailable,
  })
}

for (const phase of ['first', 'restarted']) {
  const probe = json(`probe-${phase}.json`)
  check(`installed plugin flow, ${phase}`, probe ? probe.outcome === 'passed' : undefined, probe?.steps.map((s) => ({ step: s.step, ok: s.ok, ...(s.detail ? { detail: s.detail } : {}), ...(s.error ? { error: s.error } : {}) })))
}

const home = json('home-compare.json')
check('home persisted across recreation', home ? home.persisted : undefined, home)

const results = checks.map((c) => c.result)
const verdict = results.includes('failed') ? 'failed' : results.includes('not reached') ? 'incomplete' : 'qualified'
const receipt = {
  schema: 'sophia.paperclip-image-receipt.v1',
  verdict,
  scope:
    'The two-step image from the Paperclip pin and a clean Sophia commit, built and run on a GitHub-hosted linux/amd64 runner under a 2 GiB memory cgroup without swap, with a disposable database and home and synthetic credentials; the installed plugin flow through the service probe --url. Not Render platform fit, not a registry digest, not a real Sophia (its address is closed in the container).',
  context: json('context.json'),
  disk: lines('disk.jsonl'),
  images: identity && { build: identity.buildImage, image: identity.image },
  checks,
}
writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`)

const mib = (n) => (typeof n === 'number' ? `${Math.round(n / 1048576)} MiB` : '—')
const md = [
  `## Paperclip image qualification: ${verdict}`,
  '',
  receipt.scope,
  '',
  '| Check | Result |',
  '|---|---|',
  ...checks.map((c) => `| ${c.name} | ${c.result} |`),
  '',
  '| Memory phase | max | swap.max | peak | current | oom_kill | OOMKilled |',
  '|---|---|---|---|---|---|---|',
  ...PHASES.map((p) => {
    const s = samples.find((r) => r.label === p)
    return s
      ? `| ${p} | ${mib(s.max)} | ${s.swapMax ?? '—'} | ${mib(s.peak)} | ${mib(s.current)} | ${s.events?.oom_kill ?? '—'} | ${s.oomKilled} |`
      : `| ${p} | not reached | | | | | |`
  }),
  '',
  identity?.image
    ? `Image ${identity.image.id} (${identity.image.os}/${identity.image.architecture}, ${mib(identity.image.size)}); build stage ${identity.buildImage?.id} (${mib(identity.buildImage?.size)}). The image ID is the local config digest; nothing was pushed.`
    : 'The image was not built.',
]
writeFileSync(summary, `${md.join('\n')}\n`)
console.log(`[receipt] ${verdict}: ${checks.filter((c) => c.result === 'passed').length}/${checks.length} checks passed`)
