/**
 * S1-03 execution-host supervisor against the real pinned dsh: readiness only
 * from the bridge, crash recovery with bridge reconciliation, a single-writer
 * project lease, and a bounded restart budget. The Sophia side is the LABELLED
 * fixture service; the model is the keyless mock.
 */

import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { LeaseHeldError, RuntimeSupervisor } from '../../apps/execution-host/dist/runtime-supervisor.js'
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
  await assert.rejects(s.supervisor.start(), /did not report ready/)
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
