#!/usr/bin/env node
/**
 * Execution host (S1-05A): run one project's dsh runtime under the S1-03 supervisor, bound to the REAL Sophia
 * service (the API's /v1/runtime/*) with a registered runtime capability.
 *
 *   SOPHIA_SERVICE_URL=https://api.example SOPHIA_RUNTIME_TOKEN=... OPENAI_API_KEY=... \
 *     node scripts/runtime-host.mjs --root /srv/sophia/<project>
 *   node scripts/runtime-host.mjs --root <dir> --rehearse   # keyless mock model; never live evidence
 *
 * Service replies (CON-C2, the normal dsh service route) stay OFF unless the operator opts in with one service overlay:
 *   node scripts/runtime-host.mjs --root <dir> --service-overlay <overlay.json> --print-executor-digest
 *   <DIGEST_VAR>=<that digest> SOPHIA_SERVICE_URL=... SOPHIA_RUNTIME_TOKEN=... <credential>=... \
 *     node scripts/runtime-host.mjs --root <dir> --service-overlay <overlay.json>
 * The overlay is a strict JSON patch list of config-only rows (executor-identity.ts) whose sophia-control-bridge row
 * sets `replies: { mode: 'service', routeId, executorDigestEnv }`. The host passes it as dsh's --patch and passes
 * exactly the variable that `executorDigestEnv` names (the EXPECTED executor closure, 64 hex) into the runtime's
 * environment; nothing else of the parent's is inherited. A missing, malformed or mismatched digest leaves the mode
 * unavailable in the bridge (no fallback); an overlay that is not config-only, sets no replies, or a digest variable
 * that is unset or not 64 hex is refused here, before anything starts. --print-executor-digest derives the closure the
 * runtime would advertise for this root and overlay, prints it and exits (no service, no credential).
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

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { RuntimeSupervisor } from '../apps/execution-host/dist/runtime-supervisor.js'
import { RUNTIME_DIR, DSH_ENTRY, loadRuntimeUnit } from './lib/common.mjs'
import { assertRecordedArtifacts, executorClosureDigest, homeLayout, reconcileProfile } from './lib/profile.mjs'
import { assertToolchain } from './lib/toolchain.mjs'
import { mockRouteOverlay, startMockLlm } from '../tests/support/mock-llm.mjs'

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    rehearse: { type: 'boolean', default: false },
    'service-overlay': { type: 'string' },
    'print-executor-digest': { type: 'boolean', default: false },
  },
})
const url = process.env.SOPHIA_SERVICE_URL
const token = process.env.SOPHIA_RUNTIME_TOKEN
const printDigest = values['print-executor-digest']
if (!values.root || (!printDigest && (!url || !token)) || (printDigest && !values['service-overlay'])) {
  console.error(
    'usage: SOPHIA_SERVICE_URL=... SOPHIA_RUNTIME_TOKEN=... node scripts/runtime-host.mjs --root <dir> [--rehearse | --service-overlay <file>]\n' +
      '       node scripts/runtime-host.mjs --root <dir> --service-overlay <file> --print-executor-digest',
  )
  process.exit(2)
}
if (values.rehearse && values['service-overlay']) {
  console.error('runtime-host: --service-overlay is a live launch with an operator-pinned executor; it is never combined with --rehearse')
  process.exit(2)
}
assertToolchain()
const unit = loadRuntimeUnit()

/**
 * The operator's service overlay, checked before anything starts: config-only (executor-identity.ts), its control
 * bridge row setting service replies, and, unless only the digest is printed, the named variable holding 64 hex.
 */
async function serviceLaunch(file, env, needDigest, reserved) {
  const { assertConfigOnlyPatch } = await import('../packages/dsh-bundle/dist/executor-identity.js')
  const bytes = readFileSync(file)
  try {
    assertConfigOnlyPatch(bytes)
  } catch {
    throw new Error('the service overlay is not a config-only JSON patch list')
  }
  const bridge = JSON.parse(bytes.toString('utf8')).find((row) => row?.id === 'sophia-control-bridge')
  const replies = bridge?.config?.replies
  if (!replies || replies.mode !== 'service') throw new Error('the service overlay sets no service replies on sophia-control-bridge')
  const name = replies.executorDigestEnv
  if (typeof name !== 'string' || !/^[A-Z_][A-Z0-9_]*$/.test(name) || name.startsWith('SOPHIA_REPLY_')) {
    throw new Error('replies.executorDigestEnv must name an environment variable outside SOPHIA_REPLY_*')
  }
  // The supervisor applies this variable last (FND-B108): a name it already sets, or a configured credential, is refused.
  if (reserved.has(name)) throw new Error(`replies.executorDigestEnv: ${name} is already set for the runtime`)
  const value = env[name]
  if (needDigest && (value === undefined || !/^[0-9a-f]{64}$/.test(value))) {
    throw new Error(`${name} must hold the expected executor closure (64 hex; see --print-executor-digest)`)
  }
  return { file, bytes, name, value }
}

const credential = unit.model_route.credential_ref
const credentials = [
  ...new Set([
    credential,
    ...Object.values(unit.model_routes ?? {}).map((route) => route.credential_ref),
    ...Object.values(unit.research_sources ?? {}).flatMap((source) => (source?.credential_ref ? [source.credential_ref] : [])),
  ]),
]
// What RuntimeSupervisor.environment() sets for the runtime itself, besides the credentials above.
const SUPERVISOR_ENV = ['HOME', 'TMPDIR', 'DSH_HOME', 'DSH_TELEMETRY_DISABLED', 'LANG', 'PATH', 'SOPHIA_RUNTIME_UNIT', 'SOPHIA_WORKSPACE', 'SOPHIA_BRIDGE_URL', 'SOPHIA_BRIDGE_TOKEN']

let service = null
if (values['service-overlay']) {
  try {
    service = await serviceLaunch(resolve(values['service-overlay']), process.env, !printDigest, new Set([...SUPERVISOR_ENV, ...credentials]))
  } catch (error) {
    console.error(`runtime-host: ${error.message}`)
    process.exit(2)
  }
}
if (!values.rehearse && !printDigest && !process.env[credential]) {
  console.error(`runtime-host needs ${credential} in the environment (reference only; the value is never printed), or --rehearse`)
  process.exit(2)
}
const absent = values.rehearse || printDigest ? [] : credentials.filter((name) => !process.env[name])
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

if (printDigest) {
  const { digest } = await executorClosureDigest({ unit, runtimeDir: RUNTIME_DIR, layout, overlays: [service.bytes] })
  console.log(JSON.stringify({ at: new Date().toISOString(), event: 'executor_digest', variable: service.name, digest }))
  process.exit(0)
}

const mock = values.rehearse ? await startMockLlm() : null
const extraArgs = []
if (mock) {
  const overlay = join(root, 'rehearsal-overlay.yml')
  writeFileSync(overlay, mockRouteOverlay(mock.baseURL))
  extraArgs.push('--patch', overlay)
}
if (service) {
  extraArgs.push('--patch', service.file)
  // Names only: the overlay's file and the digest variable, never a value.
  console.log(JSON.stringify({ at: new Date().toISOString(), event: 'service_replies', overlay: service.file, variable: service.name }))
}
const supervisor = new RuntimeSupervisor({
  unit: { id: unit.id, profile: unit.dsh.profile, runtimeDir: RUNTIME_DIR, launcherEntry: DSH_ENTRY },
  projectRoot: root,
  bridge: { url, token },
  credentials: mock ? [] : credentials.filter((name) => process.env[name]),
  extraArgs,
  extraEnv: mock ? { MOCK_LLM_KEY: 'mock' } : service ? { [service.name]: service.value } : {},
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
