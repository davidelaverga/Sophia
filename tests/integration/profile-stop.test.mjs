/**
 * B-NATIVE-PRINT-BOUNDS-01. A caller's bound around the runtime host (a launcher's spawnSync timeout sends SIGTERM to
 * the host alone) must not leave a profile upgrade half done. Before, the host was blocked in a synchronous install
 * and died at once: its lease stayed behind, the unqualified install held the profile's name with both earlier
 * profiles moved aside, and the install's own processes (dsh forwards to pnpm, which keeps dsh's descriptors and
 * group) went on writing into the profile after the caller had stopped.
 *
 * Every way the install ends must establish that its process group is gone before anything is verified, moved back or
 * released; when that is not shown, the root stays leased and excluded and nothing is reported as reconciled. Each
 * case runs the host's root preparation (lib/root-lease.mjs holdHostRoot and reconcileHostProfile, the calls
 * scripts/runtime-host.mjs makes) through tests/support/profile-stop-host.mjs, against a fake dsh. The shipped entry
 * itself, with the recorded runtime, is crossed in conversation-service.test.mjs. The recorded bundle archive is
 * needed (`pnpm artifacts`); the recorded runtime is not.
 */

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
 * A runtime directory whose dsh stands in for `dsh plugin install`. The root's `fake-dsh.json` picks what it does:
 * - `wait`: like dsh-plugin-manager's CLI run, it starts a "pnpm" with dsh's own descriptors, in dsh's group, that
 *   writes into the profile every 50 ms for 30 s, and waits for it (`ignoreTerm`: that pnpm ignores SIGTERM);
 * - `natural`: it starts that writer with its output closed (stdio ignored, same group) and exits `code` by itself;
 * - `noisy`: it prints without end;
 * - `marker`: its pnpm puts a file into the root's exclusion marker, then both exit 0.
 * The writer records its pid as `<root>/fake-pnpm.pid`.
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
const { mode = 'wait', ignoreTerm = false, code = 0 } = JSON.parse(readFileSync(join(root, 'fake-dsh.json'), 'utf8'))
const writer = (body) => spawn(process.execPath, ['-e', \`
  const fs = require('node:fs')
  if (\${ignoreTerm}) process.on('SIGTERM', () => {})
  fs.writeFileSync(\${JSON.stringify(join(root, 'fake-pnpm.pid'))}, String(process.pid))
  \${body}\`], { stdio: mode === 'natural' ? 'ignore' : 'inherit' })
const writes = \`let n = 0
  setInterval(() => { try { fs.writeFileSync(\${JSON.stringify(dir)} + '/pnpm-wrote-' + ++n, '') } catch {} }, 50)
  setTimeout(() => process.exit(0), 30000)\`
if (mode === 'wait') writer(writes).on('exit', (c) => process.exit(c ?? 1))
else if (mode === 'natural') {
  writer(writes)
  setTimeout(() => process.exit(code), 300)
} else if (mode === 'noisy') setInterval(() => process.stdout.write('x'.repeat(4096) + '\\\\n'), 1)
else if (mode === 'marker') writer(\`fs.writeFileSync(\${JSON.stringify(join(root, 'supervisor.lease.takeover', 'pnpm-was-here'))}, '')\`).on('exit', (c) => process.exit(c ?? 1))
`,
)

const pids = []
after(() => {
  // A writer a failed case left behind is stopped here, never left running.
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
    return error.code !== 'ESRCH'
  }
}

/** Every entry under `dir`, never following a link: type and bytes (or link text), as one digest. */
function snapshot(dir) {
  const lines = []
  const walk = (at) => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) lines.push(`l ${relative(dir, path)} ${readlinkSync(path)}`)
      else if (stat.isDirectory()) {
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

/** A root an earlier upgrade left with a stale current profile and a distinct `.previous`; `dsh` configures the fake. */
function upgradedRoot(dsh = {}) {
  const root = join(scratch, `root-${counter++}`)
  const profiles = join(root, 'dsh-home', 'profiles')
  for (const [name, text] of [[profileName, 'the stale current profile'], [PREVIOUS, 'the profile an earlier upgrade replaced']]) {
    mkdirSync(join(profiles, name), { recursive: true })
    writeFileSync(join(profiles, name, 'package.json'), `${JSON.stringify({ marker: text })}\n`)
  }
  writeFileSync(join(root, 'fake-dsh.json'), JSON.stringify(dsh))
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

const hostArgs = (root, { grace = '', output = '', late = '' } = {}) => [HOST, root, fakeRuntime, 'stopped', grace, output, late]
const env = { PATH: process.env.PATH, HOME: process.env.HOME }

/**
 * The frozen launcher's shape around the host: spawnSync with a bound, piped output, SIGTERM at the bound. At its
 * bound spawnSync stops reading (it closes its pipes) and waits for the host's exit: the status is all it learns.
 */
function callHostSync(root, boundMs, options) {
  const result = spawnSync(process.execPath, hostArgs(root, options), { encoding: 'utf8', timeout: boundMs, maxBuffer: 16384, env, stdio: ['ignore', 'pipe', 'pipe'] })
  return { ...result, output: `${result.stdout}\n${result.stderr}` }
}

/** The same caller, but one that keeps reading after its bound (if any): SIGTERM to the host alone, then its account. */
async function callHost(root, boundMs, options) {
  const began = performance.now()
  const child = spawn(process.execPath, hostArgs(root, options), { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (text) => (stdout += text))
  child.stderr.setEncoding('utf8').on('data', (text) => (stderr += text))
  const bound = boundMs === undefined ? undefined : setTimeout(() => child.kill('SIGTERM'), boundMs)
  const [status, signal] = await new Promise((resolve) => child.once('close', (code, sig) => resolve([code, sig])))
  clearTimeout(bound)
  return { status, signal, stdout, stderr, ms: performance.now() - began, output: `${stdout}\n${stderr}`, pid: JSON.parse(stdout.split('\n')[0] || '{}').pid }
}

const writer = (root) => {
  const pid = Number(readFileSync(join(root, 'fake-pnpm.pid'), 'utf8'))
  pids.push(pid)
  return pid
}
const lease = (root) => join(root, 'supervisor.lease')
const marker = (root) => join(root, 'supervisor.lease.takeover')

/** Closure confirmed: everything is as it was, the root is released, and nothing writes afterwards. */
async function assertRestored({ root, profiles }, before, pid) {
  assert.equal(alive(pid), false, 'the install tree is gone when the host exits')
  assert.equal(existsSync(lease(root)), false, 'the lease is released')
  assert.equal(existsSync(marker(root)), false, 'no exclusion is left')
  assert.equal(snapshot(profiles), before, 'current and .previous are back, byte for byte; no kept copy or partial install is left')
  await sleep(300)
  assert.equal(snapshot(profiles), before, 'nothing writes into the profiles afterwards')
}

/** Closure unknown or exclusion kept: the root stays leased and excluded, and a next start is refused, changing nothing. */
async function assertExcluded({ root, profiles }, host) {
  assert.match(host.stderr, /the root stays leased and excluded/, host.output)
  assert.doesNotMatch(host.stdout, /"event":"profile"/, 'nothing is reported as reconciled')
  assert.equal(readFileSync(lease(root), 'utf8').trim(), String(host.pid), 'the lease is not released')
  assert.ok(lstatSync(marker(root)).isDirectory(), 'the exclusion marker stays')
  const frozen = snapshot(root)
  const next = await callHost(root)
  assert.equal(next.status, 2, next.output)
  assert.match(next.stderr, /is leased by another runtime; nothing is reconciled under it/, 'the stale lease is not taken over')
  assert.equal(snapshot(root), frozen, 'the refused start changes nothing')
  // Even with the lease file gone, the marker alone refuses: no next writer is admitted while that work is unknown.
  rmSync(lease(root))
  const without = snapshot(root)
  const again = await callHost(root)
  assert.equal(again.status, 2, again.output)
  assert.match(again.stderr, /supervisor\.lease\.takeover exists: work an earlier run started .* may still be running/)
  assert.equal(snapshot(root), without, 'refused before anything is reconciled')
  assert.equal(existsSync(lease(root)), false, 'and it takes no lease with it')
}

test("cancellation confirmed gone: a caller's bound stops the whole install and puts current and .previous back", async () => {
  const fixture = upgradedRoot()
  const before = snapshot(fixture.profiles)
  const host = await callHost(fixture.root, 1500)
  assert.equal(host.signal, null, host.output)
  assert.equal(host.status, 143, host.output)
  assert.match(host.stderr, /dsh plugin install was stopped \(SIGTERM received\); its process group is gone; the install is not qualified; both earlier profiles are back where they were/)
  assert.ok(host.ms < 1500 + 5000, `ended within the stop's first grace (${Math.round(host.ms)} ms)`)
  await assertRestored(fixture, before, writer(fixture.root))
})

test('cancellation confirmed gone after SIGKILL: an install that ignores SIGTERM is killed, only then are the profiles put back', async () => {
  const fixture = upgradedRoot({ ignoreTerm: true })
  const before = snapshot(fixture.profiles)
  const host = await callHost(fixture.root, 1500)
  assert.equal(host.status, 143, host.output)
  assert.ok(host.ms >= 1500 + 5000 && host.ms < 1500 + 10000 + 2000, `SIGKILL after the 5 s grace (${Math.round(host.ms)} ms)`)
  await assertRestored(fixture, before, writer(fixture.root))
})

test("under the frozen launcher's own shape (spawnSync's bound), the host still stops, restores and releases", async () => {
  const fixture = upgradedRoot()
  const before = snapshot(fixture.profiles)
  const host = callHostSync(fixture.root, 1500)
  assert.equal(host.error?.code, 'ETIMEDOUT', host.output)
  assert.equal(host.signal, null, 'the host exited; it was not ended by the signal')
  assert.equal(host.status, 143, host.output)
  await assertRestored(fixture, before, writer(fixture.root))
})

for (const code of [0, 7]) {
  test(`a dsh that exits ${code} by itself while a writer of its group runs on, output closed: the writer is stopped first, then the rollback`, async () => {
    const fixture = upgradedRoot({ mode: 'natural', code })
    const before = snapshot(fixture.profiles)
    const host = await callHost(fixture.root)
    assert.notEqual(host.status, 0, host.output)
    assert.match(host.stderr, new RegExp(`dsh plugin install exited ${code} while members of its process group still ran, and they were stopped; its process group is gone; the install is not qualified; both earlier profiles are back where they were`))
    assert.doesNotMatch(host.stdout, /"event":"profile"/)
    await assertRestored(fixture, before, writer(fixture.root))
  })
}

test('cancellation with closure unknown: nothing is verified or moved back, the root stays leased and excluded', async () => {
  // A zero grace probes the group at once after each signal, before it can be shown gone: the unknown outcome.
  const fixture = upgradedRoot({ ignoreTerm: true })
  const host = await callHost(fixture.root, 1500, { grace: '0' })
  writer(fixture.root)
  assert.equal(host.status, 143, host.output)
  assert.match(host.stderr, /was stopped \(SIGTERM received\), and its process group was NOT shown gone after SIGKILL: its members may still run; nothing was verified or moved back: the unqualified install is at \S+, the replaced profile at \S+\.previous, the one before it at \S+\.previous\.stopped/)
  // History is kept under names, never deleted: the replaced current at .previous, the earlier .previous at .previous.stopped.
  assert.deepEqual(readdirSync(fixture.profiles).sort(), [PREVIOUS, KEPT, profileName].sort())
  assert.equal(snapshot(join(fixture.profiles, PREVIOUS)), fixture.current)
  assert.equal(snapshot(join(fixture.profiles, KEPT)), fixture.previous)
  assert.match(readFileSync(join(marker(fixture.root), 'reason'), 'utf8'), /NOT shown gone/)
  await assertExcluded(fixture, host)
})

test('a natural exit whose surviving writer is not shown gone is excluded the same way, with no rollback beneath it', async () => {
  const fixture = upgradedRoot({ mode: 'natural', code: 0, ignoreTerm: true })
  const host = await callHost(fixture.root, undefined, { grace: '0' })
  writer(fixture.root)
  assert.equal(host.status, 1, host.output)
  assert.match(host.stderr, /exited 0 while members of its process group still ran, and they were stopped, and its process group was NOT shown gone after SIGKILL/)
  assert.deepEqual(readdirSync(fixture.profiles).sort(), [PREVIOUS, KEPT, profileName].sort())
  await assertExcluded(fixture, host)
})

test('an install printing past its output bound is stopped and rolled back; its output is not kept whole or reported raw', async () => {
  const fixture = upgradedRoot({ mode: 'noisy' })
  const before = snapshot(fixture.profiles)
  const host = await callHost(fixture.root, undefined, { output: '65536' })
  assert.notEqual(host.status, 0, host.output)
  assert.match(host.stderr, /printed more than its output bound \(65536 bytes\) and was stopped; its process group is gone; the install is not qualified; both earlier profiles are back where they were/)
  assert.ok(host.stderr.length < 20000, `the diagnostic is finite (${host.stderr.length} characters)`)
  assert.equal(existsSync(lease(fixture.root)), false)
  assert.equal(existsSync(marker(fixture.root)), false)
  assert.equal(snapshot(fixture.profiles), before)
})

test('an exclusion that cannot be released after the rollback keeps the root leased and excluded; no success is inferred', async () => {
  const fixture = upgradedRoot({ mode: 'marker' })
  const before = snapshot(fixture.profiles)
  const host = await callHost(fixture.root)
  assert.equal(host.status, 1, host.output)
  assert.match(host.stderr, /both earlier profiles are back where they were; the root's exclusion could not be released \(.*\), so it stays excluded/)
  assert.equal(snapshot(fixture.profiles), before, 'the profiles were put back before the release was tried')
  assert.equal(existsSync(join(marker(fixture.root), 'pnpm-was-here')), true, 'the marker is not emptied or followed')
  await assertExcluded(fixture, host)
})

test('a root with an exclusion marker of any kind is refused before anything changes, with or without its lease file', async () => {
  const kinds = {
    'a directory': (path) => mkdirSync(path),
    'a file': (path) => writeFileSync(path, 'not a directory'),
    'a link to a directory': (path) => symlinkSync(scratch, path),
    'a dangling link': (path) => symlinkSync(join(scratch, 'nowhere'), path),
  }
  for (const [label, make] of Object.entries(kinds)) {
    for (const withLease of [false, true]) {
      const fixture = upgradedRoot()
      make(marker(fixture.root))
      // A lease whose holder is gone: this test process's child, already exited.
      if (withLease) writeFileSync(lease(fixture.root), `${spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).stdout.trim()}\n`)
      const before = snapshot(fixture.root)
      const host = await callHost(fixture.root)
      assert.equal(host.status, 2, `${label}, lease ${withLease}: ${host.output}`)
      assert.match(host.stderr, withLease ? /is leased by another runtime; nothing is reconciled under it/ : /supervisor\.lease\.takeover exists/, label)
      assert.equal(snapshot(fixture.root), before, `${label}, lease ${withLease}: nothing changes, the marker included`)
    }
  }
})

test("a late signal, during the reconciliation's synchronous part, still stops: no success is reported", async () => {
  const { root, profiles } = currentRoot()
  const before = snapshot(profiles)
  const host = await callHost(root, undefined, { late: 'late' })
  assert.equal(host.signal, null, host.output)
  assert.equal(host.status, 143, host.output)
  assert.match(host.stderr, /SIGTERM received after the profile was reconciled \(current\)/)
  assert.doesNotMatch(host.stdout, /"event":"profile"/)
  assert.equal(existsSync(lease(root)), false, 'nothing runs: the lease is released')
  assert.equal(existsSync(marker(root)), false)
  assert.equal(snapshot(profiles), before)
})

test('without a signal, a failing install still rolls back as before', async () => {
  const fixture = upgradedRoot()
  const before = snapshot(fixture.profiles)
  rmSync(join(fixture.root, 'fake-dsh.json'))
  const host = await callHost(fixture.root)
  assert.equal(host.signal, null, host.output)
  assert.notEqual(host.status, 0)
  assert.doesNotMatch(host.stderr, /was stopped|stays leased/)
  assert.equal(existsSync(lease(fixture.root)), false)
  assert.equal(existsSync(marker(fixture.root)), false)
  assert.equal(snapshot(fixture.profiles), before)
})
