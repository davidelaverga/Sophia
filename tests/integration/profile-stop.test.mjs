/**
 * B-NATIVE-PRINT-BOUNDS-01. A caller's bound around the runtime host (a launcher's spawnSync timeout sends SIGTERM to
 * the host alone) must not leave a profile upgrade half done. Before, the host was blocked in a synchronous install
 * and died at once: its lease stayed behind, the unqualified install held the profile's name with both earlier
 * profiles moved aside, and the install's own processes (dsh forwards to pnpm, which keeps dsh's descriptors and
 * group) went on writing into the profile after the caller had stopped.
 *
 * Each case runs the host's real lease and reconciliation (tests/support/profile-stop-host.mjs) under that caller's
 * shape, against a fake dsh whose "pnpm" writes into the profile until it is stopped. The recorded bundle archive is
 * needed (`pnpm artifacts`); the recorded runtime is not.
 */

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { after, test } from 'node:test'
import { PROFILE_FILES, profileLockPath } from '../../scripts/lib/artifacts.mjs'
import { DSH_ENTRY, PROFILE_SOURCE_DIR, REPO_ROOT, bundleArchivePath, loadRuntimeUnit } from '../../scripts/lib/common.mjs'
import { homeLayout, profileDrift, tarballFiles } from '../../scripts/lib/profile.mjs'

const unit = loadRuntimeUnit()
const scratch = mkdtempSync(join(realpathSync(tmpdir()), 'sophia-profile-stop-'))
const HOST = join(REPO_ROOT, 'tests', 'support', 'profile-stop-host.mjs')

/**
 * A runtime directory whose dsh stands in for `dsh plugin install`: like dsh-plugin-manager's CLI run, it starts a
 * "pnpm" with its own descriptors, in its own group, that writes into the profile every 50 ms for 30 s. The root's
 * `fake-pnpm.json` says whether that pnpm ignores SIGTERM; it records its pid there as `<root>/fake-pnpm.pid`.
 */
const fakeRuntime = join(scratch, 'fake-runtime')
mkdirSync(join(fakeRuntime, ...DSH_ENTRY.split('/').slice(0, -1)), { recursive: true })
writeFileSync(
  join(fakeRuntime, DSH_ENTRY),
  `import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const root = join(process.env.DSH_HOME, '..')
const dir = join(process.env.DSH_HOME, 'profiles', process.argv[process.argv.indexOf('--profile') + 1])
const { ignoreTerm } = JSON.parse(readFileSync(join(root, 'fake-pnpm.json'), 'utf8'))
const pnpm = spawn(process.execPath, ['-e', \`
  const fs = require('node:fs')
  if (\${ignoreTerm}) process.on('SIGTERM', () => {})
  fs.writeFileSync(\${JSON.stringify(join(root, 'fake-pnpm.pid'))}, String(process.pid))
  let n = 0
  setInterval(() => { try { fs.writeFileSync(\${JSON.stringify(dir)} + '/pnpm-wrote-' + ++n, '') } catch {} }, 50)
  setTimeout(() => process.exit(0), 30000)\`], { stdio: 'inherit' })
pnpm.on('exit', (code) => process.exit(code ?? 1))
`,
)

const pids = []
after(() => {
  // A fake pnpm a failed case left behind is stopped here, never left running.
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }
  rmSync(scratch, { recursive: true, force: true })
})

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/** Every entry under `dir`, never following a link: type and bytes, as one digest. */
function snapshot(dir) {
  const lines = []
  const walk = (at) => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name)
      const stat = lstatSync(path)
      if (stat.isDirectory()) {
        lines.push(`d ${relative(dir, path)}`)
        walk(path)
      } else lines.push(`f ${relative(dir, path)} ${createHash('sha256').update(readFileSync(path)).digest('hex')}`)
    }
  }
  walk(dir)
  return createHash('sha256').update(lines.join('\n')).digest('hex')
}

let counter = 0
const profileName = unit.dsh.profile
const PREVIOUS = `.${profileName}.previous`
const KEPT = `${PREVIOUS}.stopped`

/** A root an earlier upgrade left with a stale current profile and a distinct `.previous`. */
function upgradedRoot(ignoreTerm) {
  const root = join(scratch, `root-${counter++}`)
  const profiles = join(root, 'dsh-home', 'profiles')
  for (const [name, text] of [[profileName, 'the stale current profile'], [PREVIOUS, 'the profile an earlier upgrade replaced']]) {
    mkdirSync(join(profiles, name), { recursive: true })
    writeFileSync(join(profiles, name, 'package.json'), `${JSON.stringify({ marker: text })}\n`)
  }
  writeFileSync(join(root, 'fake-pnpm.json'), JSON.stringify({ ignoreTerm }))
  return { root, profiles, current: snapshot(join(profiles, profileName)), previous: snapshot(join(profiles, PREVIOUS)) }
}

/** A root whose profile already runs the recorded bundle (built from the committed inputs and the archive's files). */
function currentRoot() {
  const root = join(scratch, `root-${counter++}`)
  const layout = homeLayout(root)
  const dir = join(layout.dshHome, 'profiles', profileName)
  mkdirSync(dir, { recursive: true })
  for (const file of PROFILE_FILES) copyFileSync(join(PROFILE_SOURCE_DIR, file), join(dir, file))
  copyFileSync(profileLockPath(), join(dir, 'pnpm-lock.yaml'))
  copyFileSync(bundleArchivePath(unit), join(dir, unit.sophia_bundle.archive))
  for (const [path, bytes] of tarballFiles(bundleArchivePath(unit))) {
    const target = join(dir, 'node_modules', ...unit.sophia_bundle.name.split('/'), path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }
  assert.deepEqual(profileDrift({ unit, layout }), [], 'the fixture runs the recorded bundle')
  return { root, profiles: join(layout.dshHome, 'profiles') }
}

/**
 * The frozen launcher's shape around the host: spawnSync with a bound, piped output, SIGTERM at the bound. At its
 * bound spawnSync stops reading (it closes its pipes) and waits for the host's exit: the status is all it learns.
 */
function callHostSync(root, boundMs, ...extra) {
  const result = spawnSync(process.execPath, [HOST, root, fakeRuntime, 'stopped', ...extra], {
    encoding: 'utf8',
    timeout: boundMs,
    maxBuffer: 16384,
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { ...result, output: `${result.stdout}\n${result.stderr}` }
}

/** The same caller, but one that keeps reading after its bound: SIGTERM to the host alone, then the host's own account. */
async function callHost(root, boundMs, ...extra) {
  const began = performance.now()
  const child = spawn(process.execPath, [HOST, root, fakeRuntime, 'stopped', ...extra], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (text) => (stdout += text))
  child.stderr.setEncoding('utf8').on('data', (text) => (stderr += text))
  const bound = setTimeout(() => child.kill('SIGTERM'), boundMs)
  const [status, signal] = await new Promise((resolve) => child.once('close', (code, sig) => resolve([code, sig])))
  clearTimeout(bound)
  return { status, signal, stdout, stderr, ms: performance.now() - began, output: `${stdout}\n${stderr}` }
}

const fakePnpm = (root) => {
  const pid = Number(readFileSync(join(root, 'fake-pnpm.pid'), 'utf8'))
  pids.push(pid)
  return pid
}

/** The caller's bound expires during the install; the stop is confirmed gone: everything is as it was before. */
async function confirmedGone(ignoreTerm) {
  const { root, profiles } = upgradedRoot(ignoreTerm)
  const before = snapshot(profiles)
  const host = await callHost(root, 1500)
  const pnpm = fakePnpm(root)
  assert.equal(host.signal, null, `the host was not ended by the signal; it exited: ${host.output}`)
  assert.equal(host.status, 143, host.output)
  assert.match(host.stderr, /dsh plugin install was stopped \(SIGTERM received\); its process group is gone; both earlier profiles are back where they were/)
  assert.doesNotMatch(host.stderr, /stays leased/)
  assert.equal(alive(pnpm), false, 'the install tree is gone when the host exits')
  assert.equal(existsSync(join(root, 'supervisor.lease')), false, 'the lease is released')
  assert.equal(existsSync(join(root, 'supervisor.lease.takeover')), false)
  assert.equal(snapshot(profiles), before, 'current and .previous are back, byte for byte; no kept copy or partial install is left')
  await sleep(300)
  assert.equal(snapshot(profiles), before, 'nothing writes into the profiles afterwards')
  return host
}

test("cancellation confirmed gone: a caller's bound stops the whole install and puts current and .previous back", async () => {
  const host = await confirmedGone(false)
  assert.ok(host.ms < 1500 + 5000, `ended within the stop's first grace (${Math.round(host.ms)} ms)`)
})

test('cancellation confirmed gone after SIGKILL: an install that ignores SIGTERM is killed, only then are the profiles put back', async () => {
  const host = await confirmedGone(true)
  assert.ok(host.ms >= 1500 + 5000 && host.ms < 1500 + 10000 + 2000, `SIGKILL after the 5 s grace (${Math.round(host.ms)} ms)`)
})

test('cancellation with closure unknown: nothing is moved back, the root stays excluded, and a later start is refused', async () => {
  // A zero grace checks the group at once after each signal, before it can be shown gone: the unknown outcome.
  const { root, profiles, current, previous } = upgradedRoot(true)
  const host = await callHost(root, 1500, '0')
  const pnpm = fakePnpm(root)
  assert.equal(host.signal, null, host.output)
  assert.equal(host.status, 143, host.output)
  assert.match(host.stderr, /its process group was NOT shown gone after SIGKILL, so its members may still run; nothing was moved back: the unqualified install is at \S+, the replaced profile at \S+\.previous, the one before it at \S+\.previous\.stopped; the root stays leased/)
  assert.doesNotMatch(host.stderr, /back where they were/)
  // No success and no release: the lease still names the host, and its takeover is blocked with the reason.
  assert.equal(readFileSync(join(root, 'supervisor.lease'), 'utf8').trim(), JSON.parse(host.stdout.split('\n')[0]).pid.toString())
  assert.match(readFileSync(join(root, 'supervisor.lease.takeover', 'retained-by-runtime-host'), 'utf8'), /NOT shown gone/)
  // History is kept under names, never deleted: the replaced current at .previous, the earlier .previous at .previous.stopped.
  assert.deepEqual(readdirSync(profiles).sort(), [PREVIOUS, KEPT, profileName].sort())
  assert.equal(snapshot(join(profiles, PREVIOUS)), current)
  assert.equal(snapshot(join(profiles, KEPT)), previous)
  await sleep(300)
  assert.equal(alive(pnpm), false, 'this fixture\'s install did end; the host could not show it within its grace')
  const frozen = snapshot(profiles)
  const next = await callHost(root, 60000)
  assert.equal(next.status, 2, next.output)
  assert.match(next.stderr, /is leased by another runtime; nothing is reconciled under it/)
  assert.equal(snapshot(profiles), frozen, 'the refused start changes nothing')
  assert.equal(existsSync(join(root, 'supervisor.lease.takeover', 'retained-by-runtime-host')), true)
})

test('a late signal, during the reconciliation\'s synchronous part, still stops: no success is reported', async () => {
  const { root, profiles } = currentRoot()
  const before = snapshot(profiles)
  const host = await callHost(root, 60000, '', 'late')
  assert.equal(host.signal, null, host.output)
  assert.equal(host.status, 143, host.output)
  assert.match(host.stderr, /SIGTERM received after the profile was reconciled \(current\)/)
  assert.doesNotMatch(host.stdout, /"event":"profile"/)
  assert.equal(existsSync(join(root, 'supervisor.lease')), false, 'nothing runs: the lease is released')
  assert.equal(snapshot(profiles), before)
})

test('without a signal, a failing install still rolls back as before', async () => {
  const { root, profiles } = upgradedRoot(false)
  const before = snapshot(profiles)
  rmSync(join(root, 'fake-pnpm.json'))
  const host = await callHost(root, 60000)
  assert.equal(host.signal, null, host.output)
  assert.notEqual(host.status, 0)
  assert.doesNotMatch(host.stderr, /was stopped/)
  assert.equal(existsSync(join(root, 'supervisor.lease')), false)
  assert.equal(snapshot(profiles), before)
})

test("under the frozen launcher's own shape (spawnSync's bound), the host still stops, restores and releases", async () => {
  const { root, profiles } = upgradedRoot(false)
  const before = snapshot(profiles)
  const host = callHostSync(root, 1500)
  const pnpm = fakePnpm(root)
  assert.equal(host.error?.code, 'ETIMEDOUT', host.output)
  assert.equal(host.signal, null, 'the host exited; it was not ended by the signal')
  assert.equal(host.status, 143, host.output)
  assert.equal(alive(pnpm), false)
  assert.equal(existsSync(join(root, 'supervisor.lease')), false)
  assert.equal(snapshot(profiles), before)
  await sleep(300)
  assert.equal(snapshot(profiles), before)
})
