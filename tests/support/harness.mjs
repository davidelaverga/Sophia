/**
 * Shared harness for runtime integration suites: one pristine profile install
 * per suite, and per test a fresh copy plus a LABELLED fixture Sophia service
 * and a keyless mock model. `start()` boots (or reboots) the real dsh runtime.
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RUNTIME_DIR, loadRuntimeUnit } from '../../scripts/lib/common.mjs'
import { assertRecordedArtifacts, homeLayout, installProfile } from '../../scripts/lib/profile.mjs'
import { launchRuntime } from '../../scripts/lib/runtime.mjs'
import { command, startFixtureService } from './fixture-service.mjs'
import { mockRouteOverlay, startMockLlm } from './mock-llm.mjs'

export const unit = loadRuntimeUnit()

/** The keyless mock Chat Completions model every suite uses unless it names another. */
export const MOCK_MODEL = { start: startMockLlm, overlay: mockRouteOverlay, env: { MOCK_LLM_KEY: 'mock' } }

/**
 * Install once; returns `world(t)` for per-test environments and a `cleanup()`.
 * By default Agents run on the keyless mock model. `model` swaps the test
 * double and the `--patch` overlay that routes to it (SMC-M02: the request-shape
 * test keeps the recorded openai route and only points it at a local stub).
 * @param {string} prefix - scratch directory prefix.
 * @param {{ model?: { start: () => Promise<any>, overlay: (baseURL: string) => string, env: Record<string, string> } }} [options]
 */
export function suite(prefix, { model = MOCK_MODEL } = {}) {
  const scratch = mkdtempSync(join(tmpdir(), `${prefix}-`))
  const pristine = homeLayout(join(scratch, 'pristine'))
  let counter = 0
  let installed = false
  const install = () => {
    if (installed) return
    assertRecordedArtifacts(unit, RUNTIME_DIR)
    installProfile({ unit, runtimeDir: RUNTIME_DIR, layout: pristine })
    installed = true
  }
  /** A fresh install, fixture service and mock model; `start()` boots (or reboots) the runtime. */
  async function world(t) {
    install()
    const layout = homeLayout(join(scratch, `case-${counter++}`))
    cpSync(pristine.root, layout.root, { recursive: true, verbatimSymlinks: true })
    const service = await startFixtureService({ runtimeUnitId: unit.id })
    const llm = await model.start()
    let runtime = null
    let boots = 0
    const w = {
      service,
      llm,
      layout,
      attemptId: `att-${counter}`,
      /** Boot the runtime; unless `waitReady` is false, resolve once the service has the bridge's ready report. */
      async start({ waitReady = true } = {}) {
        runtime = launchRuntime({ unit, runtimeDir: RUNTIME_DIR, layout, bridge: service, overlays: [model.overlay(llm.baseURL)], extraEnv: model.env })
        boots += 1
        if (waitReady) await service.waitFor(() => service.readiness.filter((r) => r.state === 'ready').length >= boots, 30000, 'bridge readiness')
      },
      async stop() {
        const exit = await runtime.stop()
        return exit
      },
      stderr: () => runtime?.stderr() ?? '',
      cmd: (kind, options = {}) => command(kind, { attemptId: w.attemptId, runtimeUnitId: unit.id, ...(kind === 'create' ? { role: 'sophia-research-v1' } : {}), ...options }),
      send(cmd) {
        service.enqueue(cmd)
        return cmd
      },
      turnEnds: () => service.observations.filter((o) => o.type === 'turn/end' && o.attemptId === w.attemptId),
      journal() {
        const file = join(layout.dshHome, 'sophia-bridge', `sophia-${w.attemptId}.jsonl`)
        return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []
      },
      sessionEvents: (type) => service.observations.filter((o) => o.type === type && o.attemptId === w.attemptId),
    }
    t.after(async () => {
      if (runtime) await runtime.stop()
      await service.close()
      await llm.close()
    })
    return w
  }
  
  
  return { world, cleanup: () => rmSync(scratch, { recursive: true, force: true }) }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const userTexts = (request) => request.messages.filter((m) => m.role === 'user').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
