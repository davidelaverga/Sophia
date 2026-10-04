#!/usr/bin/env node
/**
 * Execution host (S1-05A): run one project's dsh runtime under the S1-03 supervisor, bound to the REAL Sophia
 * service (the API's /v1/runtime/*) with a registered runtime capability.
 *
 *   SOPHIA_SERVICE_URL=https://api.example SOPHIA_RUNTIME_TOKEN=... OPENAI_API_KEY=... \
 *     node scripts/runtime-host.mjs --root /srv/sophia/<project>
 *   node scripts/runtime-host.mjs --root <dir> --rehearse   # keyless mock model; never live evidence
 *
 * Every model route's credential (config/runtime-unit.json: model_route and model_routes, by credential_ref) is
 * passed to dsh by name only and never printed. The default route's is required; a research route whose credential
 * is absent stays unusable (its requests fail with MISSING_CREDENTIAL, never another route), and the host says so. The
 * research providers' keys (research_sources) pass the same way; without them the research tools refuse before any
 * network call (the adapters never go keyless). Without --rehearse, every model call is real and billable: run it only with
 * the owner's recorded allowance. The profile is installed into <root> on first use, and on every later start it is
 * reconciled with the recorded bundle: a stale one (a deploy that changed the bundle) is reinstalled in place, and the
 * rest of the project home is kept, so the bridge journal, native sessions and workspace survive restarts and
 * upgrades. The `profile` log line says which bundle the runtime loads.
 */

import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { RuntimeSupervisor } from '../apps/execution-host/dist/runtime-supervisor.js'
import { RUNTIME_DIR, DSH_ENTRY, loadRuntimeUnit } from './lib/common.mjs'
import { assertRecordedArtifacts, homeLayout, reconcileProfile } from './lib/profile.mjs'
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
const credentials = [
  ...new Set([
    credential,
    ...Object.values(unit.model_routes ?? {}).map((route) => route.credential_ref),
    ...Object.values(unit.research_sources ?? {}).flatMap((source) => (source?.credential_ref ? [source.credential_ref] : [])),
  ]),
]
if (!values.rehearse && !process.env[credential]) {
  console.error(`runtime-host needs ${credential} in the environment (reference only; the value is never printed), or --rehearse`)
  process.exit(2)
}
const absent = values.rehearse ? [] : credentials.filter((name) => !process.env[name])
if (absent.length > 0) console.log(JSON.stringify({ at: new Date().toISOString(), event: 'credentials', absent }))
assertRecordedArtifacts(unit, RUNTIME_DIR)
const root = resolve(values.root)
const layout = homeLayout(root)
const profile = reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout })
console.log(
  JSON.stringify({
    at: new Date().toISOString(),
    event: 'profile',
    state: profile.state,
    bundle: unit.sophia_bundle.archive_sha256,
    changed: profile.drift,
  }),
)

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
  credentials: mock ? [] : credentials.filter((name) => process.env[name]),
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
