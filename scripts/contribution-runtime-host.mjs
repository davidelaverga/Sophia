#!/usr/bin/env node
/**
 * INC01-CC-004 S5c: host ONE member API contribution runtime with an explicit custodian (docs/plans/api-contributions.md
 * "S5c"). Not the general runtime host: it takes no default, search or read key and inherits none. The contributed
 * route's key comes from the custody file named for this registration, and only that value is passed, under the
 * route's reference name, through the supervisor's explicit credential map. Without Tavily or Jina keys the research
 * tools that would call them refuse: a contribution Explore here reads project sources only.
 *
 *   node scripts/contribution-runtime-host.mjs --root <dir> --binding <file> --custody-dir <dir>
 *
 * Before anything under the root changes: the binding record (scripts/register-contribution-runtime.ts
 * --binding-dir) and the custody file are read from their private directories and checked against each other and
 * against the recorded unit and route (lib/contribution-custody.mjs); any refusal exits 2 with a fixed code. Then, as
 * the general host does: the root's lease, the profile reconciled under it, the recorded artifacts, one
 * RuntimeSupervisor (readiness from the bridge, bounded restarts, graceful stop). The key is read once per launch:
 * replacing the file never rebinds a running runtime; a restart reuses the value it started with.
 *
 * Registering, placing a real key and running this against a real deployment are owner/operator acts held by the
 * release-trust amendment. Every model call is real and billable when the route is real.
 */

import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { RuntimeSupervisor } from '../apps/execution-host/dist/runtime-supervisor.js'
import { DSH_ENTRY, RUNTIME_DIR, loadRuntimeUnit } from './lib/common.mjs'
import { CUSTODY_ROUTE, CustodyError, readBinding, readCustodyKey } from './lib/contribution-custody.mjs'
import { assertRecordedArtifacts, homeLayout } from './lib/profile.mjs'
import { holdHostRoot, reconcileHostProfile } from './lib/root-lease.mjs'
import { assertToolchain } from './lib/toolchain.mjs'

const RESEARCH_ROLE = 'sophia-research-md-v1'

/**
 * The contributed route's fixed execution, credential and billing policy, as registration authorized it (0094 and
 * register-contribution-runtime.ts: route research-sol-medium-v1, gpt-6.1-sol at medium, through the research key at
 * OpenAI). It is written here, not read from the unit: a coherent unit and profile carrying another policy under the
 * same unit id must not receive this registration's key. A new policy is a new route, migration and qualification.
 */
const CONTRIBUTED_POLICY = Object.freeze({
  adapter: '@deepseek-ai/dsh-llm-pi-ai',
  provider: 'openai-research',
  model: 'gpt-6.1-sol',
  reasoningEffort: 'medium',
  maxTokens: 16000,
  prices: Object.freeze({ input: 2, cacheRead: 0.1, cacheWrite: 2.5, output: 10 }),
  contextWindow: 272000,
  baseURL: 'https://api.openai.com/v1',
  cacheRetention: null,
  compat: Object.freeze({ supportsStrictMode: true, supportsLongCacheRetention: false }),
  credential_ref: CUSTODY_ROUTE.credentialRef,
})
/** Notes a route may carry that are not execution authority: text or a flag, nothing else. */
const DOCUMENTARY = new Set(['status', 'decided', 'model_entry_source', 'live_verified', 'live_checklist'])
/** The one compaction the contributed route runs under: exactly this, nothing missing, changed or added. */
const CONTRIBUTED_COMPACTION = Object.freeze({
  modelPolicies: Object.freeze([
    Object.freeze({ provider: 'openai-research', model: 'gpt-6.1-sol', thresholdRatio: 0.45, headroomTokens: 16000, maxTokens: 8000 }),
  ]),
})
const plainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The recorded unit must carry exactly the registered policy for the contributed route, its role binding and its sole
 * compaction, before any custody is read. Anything missing, malformed, changed or added refuses route_unrecorded;
 * only documentary notes may differ.
 */
export function assertContributedRoute(unit) {
  const route = unit?.model_routes?.[CUSTODY_ROUTE.routeId]
  if (!plainObject(route)) throw new CustodyError('route_unrecorded')
  for (const [field, value] of Object.entries(CONTRIBUTED_POLICY))
    if (!Object.hasOwn(route, field) || !isDeepStrictEqual(route[field], value)) throw new CustodyError('route_unrecorded')
  for (const [field, value] of Object.entries(route)) {
    if (Object.hasOwn(CONTRIBUTED_POLICY, field)) continue
    if (!DOCUMENTARY.has(field) || !['string', 'boolean'].includes(typeof value)) throw new CustodyError('route_unrecorded')
  }
  if (unit.role_routes?.[RESEARCH_ROLE] !== CUSTODY_ROUTE.routeId) throw new CustodyError('route_unrecorded')
  if (!isDeepStrictEqual(unit.compaction, CONTRIBUTED_COMPACTION)) throw new CustodyError('route_unrecorded')
  return route
}

/**
 * Everything checked before the root is touched: the binding, the unit it names, the route, and the custodian's key
 * for exactly that registration. Returns the bridge binding and the explicit credential map; never logs a value.
 */
export function prepareContributionLaunch({ binding: bindingPath, custodyDir, unit, uid }) {
  const binding = readBinding(bindingPath, uid)
  if (binding.runtimeUnitId !== unit.id) throw new CustodyError('binding_mismatch')
  assertContributedRoute(unit)
  const key = readCustodyKey({ custodyDir, binding, uid })
  return {
    binding,
    bridge: { url: binding.serviceOrigin, token: binding.capability },
    credentialValues: { [CUSTODY_ROUTE.credentialRef]: key },
    /** What may be logged: the registration's identities, never the capability or the key. */
    safe: {
      projectId: binding.projectId,
      runtimeId: binding.runtimeId,
      resourceId: binding.resourceId,
      connectionId: binding.connectionId,
      credentialRevision: binding.credentialRevision,
      route: binding.routeId,
      serviceOrigin: binding.serviceOrigin,
    },
  }
}

const log = (event) => console.log(JSON.stringify({ at: new Date().toISOString(), ...event }))

/**
 * Prepare, lease the root, reconcile its profile, and start one supervisor with the explicit credential map. A refusal
 * before the root is touched exits 2 (as the general host's do). `overlays` are dsh `--patch` files for tests only
 * (pointing the recorded route at a local stub); the CLI never passes one.
 */
export async function launchContributionRuntime({ root, binding, custodyDir, overlays = [], uid, readyTimeoutMs }) {
  const unit = loadRuntimeUnit()
  let prepared
  try {
    prepared = prepareContributionLaunch({ binding, custodyDir, unit, uid })
  } catch (error) {
    console.error(error instanceof CustodyError ? error.message : 'contribution custody refused: unexpected')
    process.exit(2)
  }
  log({ event: 'binding', ...prepared.safe })
  assertRecordedArtifacts(unit, RUNTIME_DIR)
  const projectRoot = resolve(root)
  const layout = homeLayout(projectRoot)
  // The root's lease before anything under it changes (FND-B115), exactly as the general host takes it.
  const hold = holdHostRoot(projectRoot)
  const profile = await reconcileHostProfile(hold, { unit, runtimeDir: RUNTIME_DIR, layout })
  log({ event: 'profile', state: profile.state, bundle: unit.sophia_bundle.archive_sha256, changed: profile.drift })
  const supervisor = new RuntimeSupervisor({
    unit: { id: unit.id, profile: unit.dsh.profile, runtimeDir: RUNTIME_DIR, launcherEntry: DSH_ENTRY },
    projectRoot,
    bridge: prepared.bridge,
    credentialValues: prepared.credentialValues,
    extraArgs: overlays.flatMap((file) => ['--patch', file]),
    onEvent: (event) => log({ live: true, ...event }),
    lease: hold.lease,
    ...(readyTimeoutMs ? { readyTimeoutMs } : {}),
  })
  await supervisor.start()
  log({ event: 'ready', runtimeUnit: unit.id, serviceOrigin: prepared.safe.serviceOrigin, route: prepared.safe.route })
  return supervisor
}

async function main() {
  const { values } = parseArgs({
    options: { root: { type: 'string' }, binding: { type: 'string' }, 'custody-dir': { type: 'string' } },
  })
  if (!values.root || !values.binding || !values['custody-dir']) {
    console.error('usage: node scripts/contribution-runtime-host.mjs --root <dir> --binding <file> --custody-dir <dir>')
    process.exit(2)
  }
  assertToolchain()
  const supervisor = await launchContributionRuntime({
    root: values.root,
    binding: resolve(values.binding),
    custodyDir: resolve(values['custody-dir']),
  })
  const shutdown = async () => {
    await supervisor.stop()
    process.exit(0)
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void shutdown())
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main()
