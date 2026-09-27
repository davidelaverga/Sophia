#!/usr/bin/env node
/**
 * Execution host (S1-05A): run one project's dsh runtime under the S1-03 supervisor, bound to the REAL Sophia
 * service (the API's /v1/runtime/*) with a registered runtime capability.
 *
 *   SOPHIA_SERVICE_URL=https://api.example SOPHIA_RUNTIME_TOKEN=... OPENAI_API_KEY=... \
 *     node scripts/runtime-host.mjs --root /srv/sophia/<project>
 *   node scripts/runtime-host.mjs --root <dir> --rehearse   # keyless mock model; never live evidence
 *
 * The model route's credential (config/runtime-unit.json#model_route.credential_ref) is passed to dsh by
 * name only and never printed. Without --rehearse, every model call is real and billable: run it only with
 * the owner's recorded allowance. The profile is installed into <root> on first use; the project home is
 * kept between runs so the bridge journal and native sessions survive restarts.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { RuntimeSupervisor } from '../apps/execution-host/dist/runtime-supervisor.js'
import { RUNTIME_DIR, DSH_ENTRY, loadRuntimeUnit } from './lib/common.mjs'
import { assertRecordedArtifacts, homeLayout, installProfile } from './lib/profile.mjs'
import { assertToolchain } from './lib/toolchain.mjs'
import { mockRouteOverlay, startMockLlm } from '../tests/support/mock-llm.mjs'

const { values } = parseArgs({ options: { root: { type: 'string' }, rehearse: { type: 'boolean', default: false } } })
const url = process.env.SOPHIA_SERVICE_URL
const token = process.env.SOPHIA_RUNTIME_TOKEN
if (!values.root || !url || !token) {
  console.error('usage: SOPHIA_SERVICE_URL=... SOPHIA_RUNTIME_TOKEN=... node scripts/runtime-host.mjs --root <dir> [--rehearse]')
  process.exit(2)
}
assertToolchain()
const unit = loadRuntimeUnit()
const credential = unit.model_route.credential_ref
if (!values.rehearse && !process.env[credential]) {
  console.error(`runtime-host needs ${credential} in the environment (reference only; the value is never printed), or --rehearse`)
  process.exit(2)
}
assertRecordedArtifacts(unit, RUNTIME_DIR)
const root = resolve(values.root)
const layout = homeLayout(root)
if (!existsSync(join(layout.dshHome, 'profiles', unit.dsh.profile))) installProfile({ unit, runtimeDir: RUNTIME_DIR, layout })

const mock = values.rehearse ? await startMockLlm() : null
const extraArgs = []
if (mock) {
  const overlay = join(root, 'rehearsal-overlay.yml')
  writeFileSync(overlay, mockRouteOverlay(mock.baseURL))
  extraArgs.push('--patch', overlay)
}
const supervisor = new RuntimeSupervisor({
  unit: { id: unit.id, profile: unit.dsh.profile, runtimeDir: RUNTIME_DIR, launcherEntry: DSH_ENTRY },
  projectRoot: root,
  bridge: { url, token },
  credentials: mock ? [] : [credential],
  extraArgs,
  extraEnv: mock ? { MOCK_LLM_KEY: 'mock' } : {},
  onEvent: (event) => console.log(JSON.stringify({ at: new Date().toISOString(), live: !mock, ...event })),
})
await supervisor.start()
console.log(`runtime ${unit.id} ready against ${new URL(url).origin}${mock ? ' (REHEARSAL: mock model, not live evidence)' : ''}`)
const shutdown = async () => {
  await supervisor.stop()
  await mock?.close()
  process.exit(0)
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void shutdown())
