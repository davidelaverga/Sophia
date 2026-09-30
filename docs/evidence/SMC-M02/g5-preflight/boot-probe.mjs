// SMC-M02 G5 S3 probe: reconcile an s1-03-dev root to THIS unit and boot it with no binding (LABELLED fixture service,
// keyless mock model), then stop. Run with REPO=<candidate checkout> HOME_ROOT=<a disposable copy of an old-unit root>.
import { join } from 'node:path'
const ROOT = process.env.REPO, HOME = process.env.HOME_ROOT
const { RUNTIME_DIR, loadRuntimeUnit } = await import(join(ROOT, 'scripts/lib/common.mjs'))
const profile = await import(join(ROOT, 'scripts/lib/profile.mjs'))
const { launchRuntime } = await import(join(ROOT, 'scripts/lib/runtime.mjs'))
const { startFixtureService } = await import(join(ROOT, 'tests/support/fixture-service.mjs'))
const { startMockLlm, mockRouteOverlay } = await import(join(ROOT, 'tests/support/mock-llm.mjs'))
const unit = loadRuntimeUnit()
const layout = profile.homeLayout(HOME)
const r = profile.reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout })
const service = await startFixtureService({ runtimeUnitId: unit.id, bindings: [] })
const llm = await startMockLlm()
const rt = launchRuntime({ unit, runtimeDir: RUNTIME_DIR, layout, bridge: service, overlays: [mockRouteOverlay(llm.baseURL)], extraEnv: { MOCK_LLM_KEY: 'mock' } })
const ready = await service.waitFor(() => service.readiness.find((x) => x.state === 'ready'), 60000, 'ready')
await new Promise((res) => setTimeout(res, 5000))
await rt.stop(); await service.close?.(); await llm.close()
console.log(JSON.stringify({ unit: unit.id, reconcile: r.state, drift: r.drift.length, unrecovered: ready.unrecovered }))
