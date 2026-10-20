/**
 * S1-03 execution-host supervisor against the real pinned dsh: readiness only
 * from the bridge, crash recovery with bridge reconciliation, a single-writer
 * project lease, and a bounded restart budget. The Sophia side is the LABELLED
 * fixture service; the model is the keyless mock.
 */

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { LeaseHeldError, ProjectLease, RuntimeSupervisor } from '../../apps/execution-host/dist/runtime-supervisor.js'
import { DSH_ENTRY, RUNTIME_DIR, loadRuntimeUnit } from '../../scripts/lib/common.mjs'
import { assertRecordedArtifacts, homeLayout, installProfile } from '../../scripts/lib/profile.mjs'
import { command, startFixtureService } from '../support/fixture-service.mjs'
import { mockRouteOverlay, startMockLlm } from '../support/mock-llm.mjs'
import { writeFileSync } from 'node:fs'

const unit = loadRuntimeUnit()
const scratch = mkdtempSync(join(tmpdir(), 'sophia-supervisor-'))
const pristine = homeLayout(join(scratch, 'pristine'))
let counter = 0

before(() => {
  assertRecordedArtifacts(unit, RUNTIME_DIR)
  installProfile({ unit, runtimeDir: RUNTIME_DIR, layout: pristine })
})
after(() => rmSync(scratch, { recursive: true, force: true }))

async function setup(t, options = {}) {
  const root = join(scratch, `project-${counter++}`)
  cpSync(pristine.root, root, { recursive: true, verbatimSymlinks: true })
  const service = await startFixtureService({ runtimeUnitId: unit.id })
  const llm = await startMockLlm()
  const overlay = join(root, 'mock-overlay.yml')
  writeFileSync(overlay, mockRouteOverlay(llm.baseURL))
  const events = []
  const make = (extra = {}) => new RuntimeSupervisor({
    unit: { id: unit.id, profile: unit.dsh.profile, runtimeDir: RUNTIME_DIR, launcherEntry: DSH_ENTRY },
    projectRoot: root,
    bridge: { url: service.url, token: service.token },
    extraArgs: ['--patch', overlay],
    extraEnv: { MOCK_LLM_KEY: 'mock' },
    readyTimeoutMs: 30_000,
    onEvent: (event) => events.push(event),
    ...options,
    ...extra,
  })
  const supervisor = make()
  t.after(async () => {
    await supervisor.stop().catch(() => {})
    await service.close()
    await llm.close()
  })
  const cmd = (kind, opts = {}) => command(kind, { attemptId: `sup-${counter}`, runtimeUnitId: unit.id, ...(kind === 'create' ? { role: 'sophia-research-v1' } : {}), ...opts })
  return { root, service, llm, supervisor, make, events, cmd }
}

test('supervisor: ready comes from the bridge, and a graceful stop exits 0 and releases the lease', async (t) => {
  const s = await setup(t)
  await s.supervisor.start()
  assert.equal(s.supervisor.state, 'ready')
  assert.ok(s.service.readiness.some((r) => r.state === 'ready'), 'the bridge reported ready to the service')
  assert.ok(existsSync(join(s.root, 'supervisor.lease')))
  const create = s.service.enqueue(s.cmd('create', { text: 'Hello.' }))
  assert.ok(create)
  const exit = await s.supervisor.stop()
  assert.deepEqual(exit, { code: 0, signal: null })
  assert.equal(s.supervisor.state, 'stopped')
  assert.equal(existsSync(join(s.root, 'supervisor.lease')), false)
})

test('supervisor: the launch environment is explicit and carries only named credentials', async (t) => {
  const s = await setup(t, { credentials: ['SOPHIA_TEST_ROUTE_KEY', 'SOPHIA_TEST_UNSET_KEY'] })
  process.env.SOPHIA_TEST_ROUTE_KEY = 'route-key-for-test'
  process.env.SOPHIA_TEST_NOT_NAMED = 'must-not-pass'
  try {
    const env = s.supervisor.environment()
    assert.equal(env.SOPHIA_TEST_ROUTE_KEY, 'route-key-for-test')
    assert.equal('SOPHIA_TEST_UNSET_KEY' in env, false)
    assert.equal('SOPHIA_TEST_NOT_NAMED' in env, false)
    assert.equal(env.DSH_HOME, join(s.root, 'dsh-home'))
    assert.equal(env.TMPDIR, join(s.root, 'home', 'tmp'))
    assert.equal(env.DSH_TELEMETRY_DISABLED, '1')
    assert.equal(env.SOPHIA_RUNTIME_UNIT, unit.id)
  } finally {
    delete process.env.SOPHIA_TEST_ROUTE_KEY
    delete process.env.SOPHIA_TEST_NOT_NAMED
  }
})

test('supervisor: a second supervisor on the same project home is refused, in or across processes', async (t) => {
  const s = await setup(t)
  await s.supervisor.start()
  const second = s.make()
  t.after(() => second.stop().catch(() => {}))
  await assert.rejects(second.start(), LeaseHeldError)
  assert.equal(second.pid, undefined, 'the refused supervisor launched nothing')
  assert.equal(s.supervisor.state, 'ready', 'the holder is unaffected')
  assert.ok(existsSync(join(s.root, 'supervisor.lease')), 'the refusal did not remove the holder lease')
})

test('supervisor: a lease taken before preparation is adopted as it is, never removed or recreated (FND-B116)', async (t) => {
  const s = await setup(t)
  const path = join(s.root, 'supervisor.lease')
  const lease = ProjectLease.acquire(s.root)
  const before = statSync(path).ino
  // Another process cannot take the prepared home while the caller holds it.
  const dist = new URL('../../apps/execution-host/dist/runtime-supervisor.js', import.meta.url).href
  const other = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { ProjectLease } from ${JSON.stringify(dist)}; try { ProjectLease.acquire(${JSON.stringify(s.root)}); process.exit(0) } catch (e) { console.log(e.constructor.name, e.pid); process.exit(3) }`], { encoding: 'utf8' })
  assert.equal(other.status, 3, other.stdout + other.stderr)
  assert.equal(other.stdout.trim(), `LeaseHeldError ${process.pid}`)
  let atStarting = null
  const adopted = s.make({ lease, onEvent: (event) => { if (event.type === 'state' && event.state === 'starting' && atStarting === null) atStarting = statSync(path).ino } })
  t.after(() => adopted.stop().catch(() => {}))
  await adopted.start()
  assert.equal(atStarting, before, 'the same lease file at the supervisor start: never unlinked')
  assert.equal(statSync(path).ino, before)
  await assert.rejects(s.make({ lease }).start(), LeaseHeldError, 'one lease is adopted by one supervisor')
  await assert.rejects(s.make().start(), LeaseHeldError, 'a second supervisor in this process is refused')
  await adopted.stop()
  assert.equal(existsSync(path), false, 'the adopting supervisor released it')
  assert.equal(lease.active, false)
})

// FND-B117 (4326835670): one contender in its own process, through the public ProjectLease.acquire. With `gate` set
// and `at` = 'read', its first read of the lease file returns and then waits for `<gate>.go` (the read-then-replace
// interval of a stale takeover); with `at` = 'create', the call that creates the lease path (an exclusive open, or a
// link onto it) returns and then waits (the interval between creating the lease and recording its pid). It prints its
// outcome and keeps what it took until `done` exists.
const CONTENDER = `
  import fs, { existsSync, writeFileSync } from 'node:fs'
  import { syncBuiltinESMExports } from 'node:module'
  const [dist, root, gate, done, at] = process.argv.slice(1)
  const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  const hold = () => {
    writeFileSync(gate + '.held', '')
    while (!existsSync(gate + '.go')) pause()
  }
  if (gate && at === 'create') {
    const open = fs.openSync
    const link = fs.linkSync
    fs.openSync = (...args) => {
      const fd = open(...args)
      if (String(args[0]).endsWith('supervisor.lease')) hold()
      return fd
    }
    fs.linkSync = (...args) => {
      link(...args)
      if (String(args[1]).endsWith('supervisor.lease')) hold()
    }
    syncBuiltinESMExports()
  } else if (gate) {
    const read = fs.readFileSync
    let held = false
    fs.readFileSync = (...args) => {
      const out = read(...args)
      if (!held && String(args[0]).endsWith('supervisor.lease')) {
        held = true
        hold()
      }
      return out
    }
    syncBuiltinESMExports()
  }
  const { ProjectLease } = await import(dist)
  let lease = null
  try {
    lease = ProjectLease.acquire(root)
    console.log(JSON.stringify({ owned: true, pid: process.pid }))
  } catch (error) {
    console.log(JSON.stringify({ owned: false, pid: process.pid, error: error.constructor.name, holder: error.pid ?? null }))
  }
  while (!existsSync(done)) pause()
  lease?.release()
`

test('supervisor: two contenders for one stale lease: a new holder that appears after the other\'s stale read keeps it (FND-B117)', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sophia-b117-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const root = join(dir, 'root')
  const path = join(root, 'supervisor.lease')
  const dist = new URL('../../apps/execution-host/dist/runtime-supervisor.js', import.meta.url).href
  const done = join(dir, 'done')
  const dead = spawnSync(process.execPath, ['-e', '']).pid
  const stale = () => { cpSync(join(dir, 'stale'), path) }
  mkdirSync(root, { recursive: true })
  writeFileSync(join(dir, 'stale'), `${dead}\n`)
  stale()
  const run = (gate, at = 'read', until = done) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', CONTENDER, dist, root, gate, until, at], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { out += chunk })
    const exited = new Promise((resolve) => child.on('exit', resolve))
    t.after(() => { if (child.exitCode === null) child.kill('SIGKILL') })
    return { child, out: () => out, exited, line: () => out.split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } }).find(Boolean) }
  }
  const until = async (predicate, what) => {
    const deadline = Date.now() + 15_000
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`timed out: ${what}`)
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  // B reads the dead holder's lease and is held there; A then takes the stale lease over and owns it, alive.
  const gate = join(dir, 'gate')
  const b = run(gate)
  await until(() => existsSync(`${gate}.held`), 'B read the stale lease')
  const a = run('')
  await until(() => a.line(), `A's outcome: ${a.out()}`)
  assert.deepEqual(a.line(), { owned: true, pid: a.child.pid }, a.out())
  const taken = statSync(path).ino
  assert.equal(readFileSync(path, 'utf8'), `${a.child.pid}\n`)
  // B continues from its stale read: it must neither remove A's lease nor take the root.
  writeFileSync(`${gate}.go`, '')
  await until(() => b.line(), `B's outcome: ${b.out()}`)
  assert.deepEqual(b.line(), { owned: false, pid: b.child.pid, error: 'LeaseHeldError', holder: a.child.pid }, b.out())
  assert.equal(readFileSync(path, 'utf8'), `${a.child.pid}\n`, "A's lease survives")
  assert.equal(statSync(path).ino, taken, 'the same file, never replaced')
  writeFileSync(done, '')
  await Promise.all([a.exited, b.exited])
  assert.equal(existsSync(path), false, 'A released its own lease')
  // C creates the lease (taking the stale one over) and is held before anything else; D, ordinary and unpaused, must
  // find C's live pid already in it, not an empty lease to take over.
  stale()
  const gate2 = join(dir, 'gate2')
  const done2 = join(dir, 'done2')
  const c = run(gate2, 'create', done2)
  await until(() => existsSync(`${gate2}.held`), 'C created the lease')
  const d = run('', 'read', done2)
  await until(() => d.line(), `D's outcome: ${d.out()}`)
  assert.deepEqual(d.line(), { owned: false, pid: d.child.pid, error: 'LeaseHeldError', holder: c.child.pid }, d.out())
  writeFileSync(`${gate2}.go`, '')
  await until(() => c.line(), `C's outcome: ${c.out()}`)
  assert.deepEqual(c.line(), { owned: true, pid: c.child.pid }, c.out())
  assert.equal(readFileSync(path, 'utf8'), `${c.child.pid}\n`, "C's lease")
  writeFileSync(done2, '')
  await Promise.all([c.exited, d.exited])
  assert.equal(existsSync(path), false, 'C released its own lease')
  // Supported stale recovery afterwards: a dead holder's lease is taken over, held, and released.
  stale()
  const lease = ProjectLease.acquire(root)
  assert.equal(readFileSync(path, 'utf8'), `${process.pid}\n`)
  lease.release()
  assert.equal(existsSync(path), false)
})

test('acceptance: after a crash the supervisor restarts the runtime and the bridge recovers the outstanding work', async (t) => {
  const s = await setup(t)
  s.llm.script({ text: 'working', chunks: 60, delayMs: 100 })
  await s.supervisor.start()
  const attemptId = `sup-${counter}`
  const create = s.cmd('create', { text: 'Long task.' })
  s.service.enqueue(create)
  await s.service.waitForReceipt(create.commandId, 'incorporation_observed')
  await s.service.waitFor(() => s.llm.active > 0, 20000, 'streaming')
  s.service.setBindings([{ attemptId, nativeSessionId: `sophia-${attemptId}`, authorityEpoch: 1, state: 'active' }])
  const pid = s.supervisor.pid
  process.kill(pid, 'SIGKILL')
  await s.service.waitFor(() => s.events.some((e) => e.type === 'exit' && e.signal === 'SIGKILL'), 20000, 'the crash')
  await s.service.waitFor(() => s.events.filter((e) => e.type === 'state' && e.state === 'ready').length >= 2, 60000, 'restart to ready')
  assert.notEqual(s.supervisor.pid, pid)
  assert.ok(s.events.some((e) => e.type === 'state' && e.state === 'restarting'))
  assert.match(s.supervisor.log, new RegExp(`reconciled ${attemptId}: fence=active commands=1`))
  // Redelivery of the original create after restart repeats nothing.
  await s.service.waitFor(() => s.service.receiptsFor(create.commandId).filter((r) => r.stage === 'delivered').length >= 2, 20000, 'redelivered create answered')
  const steer = s.cmd('steer', { text: 'AFTER-CRASH' })
  s.service.enqueue(steer)
  await s.service.waitForReceipt(steer.commandId, 'incorporation_observed', 30000)
  const request = await s.service.waitFor(() => s.llm.requests.find((r) => JSON.stringify(r.messages).includes('AFTER-CRASH')), 20000, 'post-crash model call')
  assert.ok(JSON.stringify(request.messages).includes('Long task.'), 'the recovered session keeps its history')
})

test('adverse: an exhausted restart budget is a terminal failure, not a restart loop', async (t) => {
  const s = await setup(t, { maxRestarts: 1, restartWindowMs: 60_000 })
  await s.supervisor.start()
  process.kill(s.supervisor.pid, 'SIGKILL')
  await s.service.waitFor(() => s.supervisor.state === 'ready' && s.events.filter((e) => e.type === 'state' && e.state === 'ready').length >= 2, 60000, 'first restart')
  process.kill(s.supervisor.pid, 'SIGKILL')
  await s.service.waitFor(() => s.supervisor.state === 'failed', 20000, 'terminal failure')
  assert.match(s.events.findLast((e) => e.type === 'state').reason, /restart budget exhausted/)
  assert.equal(existsSync(join(s.root, 'supervisor.lease')), false, 'a failed supervisor releases the project')
})

test('adverse: a failed first start is terminal, restarts nothing and releases the project', async (t) => {
  const s = await setup(t, { bridge: { url: 'http://127.0.0.1:9', token: 'unreachable' }, readyTimeoutMs: 4000 })
  const starting = s.supervisor.start()
  const pid = s.supervisor.pid
  await assert.rejects(starting, /did not report ready/)
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'the abandoned dsh is gone before the lease is released')
  assert.equal(s.supervisor.state, 'failed')
  assert.equal(existsSync(join(s.root, 'supervisor.lease')), false, 'the lease is released')
  await new Promise((resolve) => setTimeout(resolve, 1500))
  assert.equal(s.events.filter((e) => e.type === 'state' && e.state === 'restarting').length, 0, 'the killed child is not restarted')
  assert.equal(s.events.filter((e) => e.type === 'exit').length, 1)
  const next = s.make({ bridge: { url: s.service.url, token: s.service.token }, readyTimeoutMs: 30_000 })
  t.after(() => next.stop().catch(() => {}))
  await next.start()
  assert.equal(next.state, 'ready', 'a replacement supervisor can take the project')
})
