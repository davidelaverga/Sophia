// Disposable in-place cutover rehearsal: one fixed project root, first on the old unit (A), then the same
// root reconciled and run by the new unit (E). Keyless mock model, LABELLED fixture service. Never hosted.
import { writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const ROOT = process.env.REPO                     // the checkout whose unit runs this phase
const HOME = process.env.HOME_ROOT                // the one fixed project root
const PHASE = process.env.PHASE                   // 'old' or 'new'
const OUT = process.env.OUT
const { RUNTIME_DIR, loadRuntimeUnit } = await import(join(ROOT, 'scripts/lib/common.mjs'))
const profile = await import(join(ROOT, 'scripts/lib/profile.mjs'))
const { launchRuntime } = await import(join(ROOT, 'scripts/lib/runtime.mjs'))
const { startFixtureService, command } = await import(join(ROOT, 'tests/support/fixture-service.mjs'))
const { startMockLlm, mockRouteOverlay } = await import(join(ROOT, 'tests/support/mock-llm.mjs'))
const unit = loadRuntimeUnit()
const layout = profile.homeLayout(HOME)
profile.assertRecordedArtifacts(unit, RUNTIME_DIR)
const out = { phase: PHASE, unit: unit.id }
if (PHASE === 'old') profile.installProfile({ unit, runtimeDir: RUNTIME_DIR, layout })
else {
  out.driftBefore = profile.profileDrift({ unit, layout })
  const r = profile.reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout })
  out.reconcile = { state: r.state, driftCount: r.drift.length }
  out.previousKept = existsSync(join(layout.dshHome, 'profiles', `.${unit.dsh.profile}.previous`))
  out.driftAfter = profile.profileDrift({ unit, layout })
}
const attemptId = 'att-cut'
const bindings = PHASE === 'old' ? [] : [{ attemptId, nativeSessionId: `sophia-${attemptId}`, authorityEpoch: 1, state: 'held' }]
const service = await startFixtureService({ runtimeUnitId: unit.id, bindings })
const llm = await startMockLlm()
const rt = launchRuntime({ unit, runtimeDir: RUNTIME_DIR, layout, bridge: service, overlays: [mockRouteOverlay(llm.baseURL)], extraEnv: { MOCK_LLM_KEY: 'mock' } })
const cmd = (kind, o = {}) => command(kind, { attemptId, runtimeUnitId: unit.id, ...o })
try {
  const ready = await service.waitFor(() => service.readiness.find((r) => r.state === 'ready'), 60000, 'ready')
  out.unrecovered = ready.unrecovered
  if (PHASE === 'old') {
    llm.script({ toolCalls: [{ id: 'c1', name: 'glob', arguments: { pattern: '*.md' } }] }, { text: 'done' })
    service.enqueue(cmd('create', { role: 'sophia-review-v1', text: 'Before the cutover.' }))
    await service.waitFor(() => service.observations.filter((o) => o.type === 'turn/end').length >= 1, 60000, 'turn')
    const hold = service.enqueue(cmd('hold'))
    await service.waitFor(() => service.receipts.find((r) => r.stage === 'checked'), 30000, 'hold')
    out.oldRequests = llm.requests.length
  } else {
    const inspect = cmd('inspect'); service.enqueue(inspect)
    out.inspect = JSON.parse((await service.waitForReceipt(inspect.commandId)).reason)
    const resume = cmd('resume'); service.enqueue(resume)
    out.resume = (await service.waitForReceipt(resume.commandId)).stage
    const input = cmd('input', { text: 'After the cutover.' }); service.enqueue(input)
    await service.waitForReceipt(input.commandId, 'incorporation_observed')
    await service.waitFor(() => service.observations.some((o) => o.type === 'turn/end'), 60000, 'turn after cutover')
    out.newRequest = llm.requests.at(-1).messages.map((m) => (m.role === 'tool' ? `result:${m.tool_call_id}` : m.tool_calls ? `calls:${m.tool_calls.map((c) => c.id)}` : m.role))
    out.journalIdentity = readFileSync(join(layout.dshHome, 'sophia-bridge', `sophia-${attemptId}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.type === 'sophia/identity').map((r) => ({ source: r.data.source, evidence: r.data.evidence, preset: r.data.preset.id, route: r.data.route }))
  }
} catch (e) { out.error = e.message; out.stderr = rt.stderr().slice(-3000) }
await rt.stop(); await service.close(); await llm.close()
out.stderrLines = rt.stderr().split('\n').filter((l) => /reconciled|unrecovered|readiness=/.test(l))
writeFileSync(OUT, JSON.stringify(out, null, 2).split(HOME).join('<root>'))
console.log(JSON.stringify(out, null, 1).split(HOME).join('<root>').slice(0, 2500))
