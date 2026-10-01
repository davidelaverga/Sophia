/**
 * The Sophia composition gate for an installed `sophia-runtime` profile.
 *
 * At the pin, `dsh --dump-config` exits 0 when the Sophia bundle is missing,
 * incompatible or comments-only (the bundle is skipped with one stderr line)
 * and when a patch targets a row that does not exist (one warning). A dump
 * exit code is therefore not a verdict. This gate reads the installed files
 * and the dump itself and fails every case the S1-01 adverse checks name.
 */

import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { DSH_ENTRY, REPO_ROOT, readJson, runChecked, runDsh, sanitizedEnv } from './common.mjs'
import { insertedIds, lintComposition, parseCordisYaml, parsePatch } from './patch-lint.mjs'
import { fileIntegrity, treeDigest } from './tree-digest.mjs'

const BASE = '@deepseek-ai/dsh-base'
const BUNDLE = '@sophia/dsh-bundle'
const BRIDGE_ROW = 'sophia-control-bridge'

/**
 * Rows the Sophia bundle must disable (02_DSH_BOOTSTRAP §6, plus the per-session title model call since S1-03).
 * SMC-M02 adds the OTel host (`otel`, dsh-base since 0.2.0-rc.1) as defense in depth, and the DeepSeek
 * account login and model route (`llm-deepseek-account`, since 0.1.7-rc.2), which Sophia does not use.
 */
export const REQUIRED_DISABLED = ['session-log-deepseek', 'plugin-package-inventory-deepseek', 'session-telemetry-otel', 'hmr', 'session-title-llm', 'otel', 'llm-deepseek-account']

/** The dsh-base rows a reviewer has read, with the package each loads (SMC-M02). */
export const REVIEWED_BASE_ROWS_PATH = join(REPO_ROOT, 'config', 'dsh', 'base-rows.reviewed.json')

/** @returns {{ dsh_base: string, rows: { id: string, name: string }[] }} the committed reviewed inventory. */
export function loadReviewedBaseRows(file = REVIEWED_BASE_ROWS_PATH) {
  return readJson(file)
}

/**
 * Compare the rows an installed dsh-base inserts with the reviewed inventory.
 * The composition check accepts whatever the base inserts, so without this a
 * new or renamed upstream row (a telemetry export, an account login) would
 * compose silently at the next upgrade. Every difference is a finding until a
 * reviewed commit updates the inventory.
 * @param {any[]} baseRows - parsed rows of the installed dsh-base patch.
 * @param {{ dsh_base: string, rows: { id: string, name: string }[] }} reviewed - the committed inventory.
 * @param {string} [baseVersion] - the installed dsh-base version.
 * @returns {{ code: string, layer: string, message: string }[]} findings.
 */
export function checkReviewedBaseRows(baseRows, reviewed, baseVersion) {
  const layer = BASE
  const findings = []
  if (baseVersion !== undefined && baseVersion !== reviewed.dsh_base) {
    findings.push({ code: 'base_rows_unreviewed_version', layer, message: `installed ${BASE}@${baseVersion}; the reviewed inventory is for ${reviewed.dsh_base}` })
  }
  const installed = new Map()
  for (const row of baseRows) {
    if (!Array.isArray(row?.insert)) continue
    for (const entry of row.insert) if (typeof entry?.id === 'string') installed.set(entry.id, entry.name ?? null)
  }
  const expected = new Map(reviewed.rows.map((row) => [row.id, row.name ?? null]))
  for (const [id, name] of installed) {
    if (!expected.has(id)) findings.push({ code: 'base_row_unreviewed', layer, message: `${BASE} inserts "${id}" (${name}), which no reviewer has read; review it and add it to config/dsh/base-rows.reviewed.json, disabling it in the bundle if Sophia must not load it` })
    else if (expected.get(id) !== name) findings.push({ code: 'base_row_package_changed', layer, message: `${BASE} row "${id}" now loads ${name}; the reviewed inventory records ${expected.get(id)}` })
  }
  for (const id of expected.keys()) {
    if (!installed.has(id)) findings.push({ code: 'base_row_missing', layer, message: `reviewed row "${id}" is no longer inserted by ${BASE} (removed or renamed)` })
  }
  return findings
}

/** @returns {string} the version of the dsh-base the launcher resolves. */
export function baseBundleVersion(runtimeDir) {
  return readJson(join(baseBundleDir(runtimeDir), 'package.json')).version
}

/** App-surface rows that bring their own root loop or endpoint; none belong in sophia-runtime. */
export const FOREIGN_ROOT_ROWS = ['webserver', 'modules', 'connection', 'headless-runner', 'acp', 'sdk-jsonrpc-server']

/** @returns {string} the installed dsh package directory inside a runtime artifact. */
export function dshPackageDir(runtimeDir) {
  return dirname(dirname(realpathSync(join(runtimeDir, DSH_ENTRY))))
}

/** @returns {string} the dsh-base directory the launcher itself resolves. */
export function baseBundleDir(runtimeDir) {
  const require = createRequire(join(dshPackageDir(runtimeDir), 'package.json'))
  return dirname(realpathSync(require.resolve(`${BASE}/package.json`)))
}

/**
 * Split a dump into top-level rows with the source label printed above them.
 * @param {string} text - `--dump-config` stdout.
 * @returns {{ id: string, name?: string, disabled?: unknown, config?: any, origin: string, patchedBy: string[] }[]}
 */
export function parseDump(text) {
  const rows = parseCordisYaml(text)
  if (!Array.isArray(rows)) throw new Error('dump is not a YAML array')
  const labels = []
  let current = null
  for (const line of text.split('\n')) {
    if (line.startsWith('# == ')) current = line.slice(5).trim()
    else if (line.startsWith('- id: ')) labels.push(current)
  }
  if (labels.length !== rows.length) throw new Error(`dump has ${rows.length} rows but ${labels.length} row headers`)
  return rows.map((row, index) => {
    const [origin, ...patchers] = (labels[index] ?? '').split(', patched by ')
    return { ...row, origin, patchedBy: patchers.flatMap((p) => p.split(', ')) }
  })
}

/**
 * Classify dump stderr. Every non-empty line is a finding: a clean
 * composition prints nothing there.
 */
export function classifyDumpStderr(stderr) {
  return stderr.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const skipped = /skipping profile bundle "([^"]+)": (.*)$/.exec(line)
    if (skipped) {
      const cause = skipped[2]
      const code = /cannot resolve profile bundle/.test(cause) ? 'bundle_missing'
        : /is incompatible with dsh/.test(cause) ? 'bundle_incompatible'
        : /top-level YAML array/.test(cause) ? 'patch_comments_only'
        : 'bundle_skipped'
      return { code, layer: skipped[1], message: line }
    }
    const unmatched = /\[([^\]]+)\] patch: entry "([^"]+)" not found/.exec(line)
    if (unmatched) return { code: 'patch_unmatched_row', layer: unmatched[1], message: line }
    return { code: 'dump_diagnostic', layer: 'dsh', message: line }
  })
}

/**
 * Compare an installed package with a clean extraction of its archive. The
 * dump validates composition only, so this is what ties the executable
 * bridge code to the recorded bytes.
 * @returns {string[]} paths that are missing, extra or different.
 */
export function diffAgainstArchive(archive, installedDir) {
  const scratch = mkdtempSync(join(tmpdir(), 'sophia-bundle-extract-'))
  try {
    runChecked('tar', ['-xzf', archive, '-C', scratch])
    const expected = treeDigest(join(scratch, 'package')).entries
    const actual = treeDigest(installedDir).entries
    const pathOf = (entry) => entry.split(' ')[1]
    const expectedSet = new Set(expected)
    const actualSet = new Set(actual)
    const differing = new Set([
      ...expected.filter((e) => !actualSet.has(e)).map(pathOf),
      ...actual.filter((e) => !expectedSet.has(e)).map(pathOf),
    ])
    return [...differing].sort()
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/**
 * The model route is part of the runtime unit. At the pin, pi-ai keeps an
 * unserviceable route as a silent editable diagnostic, and the boot prints
 * nothing, so the composed rows are checked against the recorded route: the
 * default model selects it, the Sophia bundle set both rows, the credential is
 * a reference, and the chosen effort is one the model offers.
 * @param {ReturnType<typeof parseDump>} rows - composed dump rows.
 * @param {{ provider: string, model: string, reasoningEffort: string, credential_ref: string, compat?: Record<string, unknown> }} route - the recorded route.
 * @returns {{ code: string, message: string }[]} findings.
 */
export function checkModelRoute(rows, route) {
  const findings = []
  const fail = (message) => findings.push({ code: 'model_route_invalid', message })
  const row = (id) => rows.find((r) => r.id === id)
  const selection = row('agent-default-model')
  if (!selection || !selection.patchedBy.includes(BUNDLE)) {
    fail(`agent-default-model must be set by ${BUNDLE}`)
  } else {
    const { provider, model, reasoningEffort } = selection.config ?? {}
    if (provider !== route.provider || model !== route.model || reasoningEffort !== route.reasoningEffort) {
      fail(`agent-default-model selects ${JSON.stringify({ provider, model, reasoningEffort })}, the unit records ${JSON.stringify({ provider: route.provider, model: route.model, reasoningEffort: route.reasoningEffort })}`)
    }
  }
  const adapter = row('llm-pi-ai')
  const profile = adapter?.config?.providers?.[route.provider]
  if (!adapter || !adapter.patchedBy.includes(BUNDLE) || !profile) {
    fail(`llm-pi-ai must declare the "${route.provider}" route in ${BUNDLE}`)
    return findings
  }
  if (profile.apiKeyEnv !== route.credential_ref) {
    fail(`route "${route.provider}" must reference ${route.credential_ref} through apiKeyEnv, found ${JSON.stringify(profile.apiKeyEnv)}`)
  }
  const literal = JSON.stringify(adapter.config).match(/"(apiKey|key|token|secret)"\s*:/i)
  if (literal) fail(`llm-pi-ai config carries a literal credential field "${literal[1]}"; only apiKeyEnv references are allowed`)
  const entry = (profile.models ?? []).find((m) => m.id === route.model)
  if (!entry) {
    fail(`route "${route.provider}" does not list model "${route.model}"`)
  } else if (!entry.reasoningEfforts || !(route.reasoningEffort in entry.reasoningEfforts)) {
    fail(`model "${route.model}" does not offer reasoning effort "${route.reasoningEffort}"`)
  }
  // SMC-M02 R1: compat values the unit records pin the request shape; the catalog must not decide them.
  for (const [field, value] of Object.entries(route.compat ?? {})) {
    if (entry?.compat?.[field] !== value) fail(`model "${route.model}" must set compat.${field} ${JSON.stringify(value)} as the unit records, found ${JSON.stringify(entry?.compat?.[field])}`)
  }
  return findings
}

/**
 * The native preset roster is part of the runtime unit (SMC-M02 G3): exactly
 * the recorded presets, each inserted by the Sophia bundle and composing no
 * plugin, under a registry whose default is the recorded one. An unknown,
 * missing or broadened preset would let an attempt run under a composition no
 * reviewer read, so each is a finding.
 * @param {ReturnType<typeof parseDump>} rows - composed dump rows.
 * @param {{ registry: string, registry_default: string, ids: string[] }} presets - the recorded roster.
 * @returns {{ code: string, message: string }[]} findings.
 */
export function checkPresetRoster(rows, presets) {
  const findings = []
  const fail = (message) => findings.push({ code: 'preset_roster_invalid', message })
  const registry = rows.filter((row) => row.name === presets.registry)
  if (registry.length !== 1) {
    fail(`expected one ${presets.registry} row, found ${registry.length}`)
  } else {
    const [row] = registry
    if (row.origin !== BUNDLE || row.disabled === true) fail(`${row.id} must be an enabled row inserted by ${BUNDLE}`)
    if (row.config?.default !== presets.registry_default) fail(`${row.id} default is ${JSON.stringify(row.config?.default)}, the unit records ${JSON.stringify(presets.registry_default)}`)
  }
  const defined = rows.filter((row) => row.name === '@deepseek-ai/dsh-agent-preset')
  const seen = new Set()
  for (const row of defined) {
    const id = row.config?.id
    seen.add(id)
    if (!presets.ids.includes(id)) fail(`preset "${id}" (row ${row.id}) is not in the unit's roster`)
    if (row.origin !== BUNDLE || row.patchedBy.length > 0) fail(`preset "${id}" must be inserted by ${BUNDLE} and patched by no layer, found origin ${row.origin}${row.patchedBy.length ? `, patched by ${row.patchedBy.join(', ')}` : ''}`)
    if (row.disabled === true) fail(`preset "${id}" is disabled`)
    if (!Array.isArray(row.config?.plugins) || row.config.plugins.length > 0) fail(`preset "${id}" composes ${JSON.stringify(row.config?.plugins)}; the unit records presets that compose no plugin`)
  }
  for (const id of presets.ids) if (!seen.has(id)) fail(`recorded preset "${id}" is not composed`)
  return findings
}

/** A route as the bridge row allows it: provider, model and effort. */
const allowed = (route) => ({ provider: route.provider, model: route.model, reasoningEffort: route.reasoningEffort ?? null })

/**
 * Every route the unit allows beyond the default (SMC-M03), and which role runs on which. The bridge row must allow
 * exactly the recorded routes and map exactly the recorded roles to them. Each route's provider is declared by the
 * Sophia bundle on `llm-pi-ai` with a credential reference, its endpoint, no long cache retention, and the model
 * listed at the recorded effort, output cap, window and compat; a hand-declared model must refuse long retention,
 * which would send a field these models reject. Roles map to recorded routes only, are in the preset roster, and the
 * research specializations share one route.
 * @param {ReturnType<typeof parseDump>} rows - composed dump rows.
 * @param {{ model_routes?: Record<string, any>, role_routes?: Record<string, string>, presets?: { ids: string[] } }} unit - the recorded unit.
 * @returns {{ code: string, message: string }[]} findings.
 */
export function checkModelRoutes(rows, unit) {
  const findings = []
  const fail = (message) => findings.push({ code: 'model_routes_invalid', message })
  const routes = unit.model_routes ?? {}
  const roleRoutes = unit.role_routes ?? {}
  const bridge = rows.find((row) => row.id === BRIDGE_ROW)?.config ?? {}
  const expectedRoutes = Object.fromEntries(Object.entries(routes).map(([id, route]) => [id, allowed(route)]))
  const composedRoutes = Object.fromEntries(Object.entries(bridge.routes ?? {}).map(([id, route]) => [id, allowed(route)]))
  if (!isDeepStrictEqual(composedRoutes, expectedRoutes)) {
    fail(`${BRIDGE_ROW} allows routes ${JSON.stringify(composedRoutes)}, the unit records ${JSON.stringify(expectedRoutes)}`)
  }
  if (!isDeepStrictEqual(bridge.roleRoutes ?? {}, roleRoutes)) {
    fail(`${BRIDGE_ROW} maps roles ${JSON.stringify(bridge.roleRoutes ?? {})}, the unit records ${JSON.stringify(roleRoutes)}`)
  }
  const adapter = rows.find((row) => row.id === 'llm-pi-ai')
  for (const [id, route] of Object.entries(routes)) {
    const profile = adapter?.config?.providers?.[route.provider]
    if (!adapter || !adapter.patchedBy.includes(BUNDLE) || !profile) {
      fail(`route ${id}: llm-pi-ai must declare the "${route.provider}" provider in ${BUNDLE}`)
      continue
    }
    if (profile.apiKeyEnv !== route.credential_ref) fail(`route ${id} must reference ${route.credential_ref} through apiKeyEnv, found ${JSON.stringify(profile.apiKeyEnv)}`)
    if ((profile.baseURL ?? null) !== (route.baseURL ?? null)) fail(`route ${id} must send to ${route.baseURL}, found ${JSON.stringify(profile.baseURL)}`)
    if ((profile.cacheRetention ?? null) !== (route.cacheRetention ?? null)) fail(`route ${id} sets cacheRetention ${JSON.stringify(profile.cacheRetention)}, the unit records ${JSON.stringify(route.cacheRetention)}`)
    if (profile.cacheRetention === 'long') fail(`route ${id} must not set cacheRetention "long": these models refuse prompt_cache_retention`)
    const entry = (profile.models ?? []).find((m) => m.id === route.model)
    if (!entry) {
      fail(`route ${id}: provider "${route.provider}" does not list model "${route.model}"`)
      continue
    }
    if (!entry.reasoningEfforts || !(route.reasoningEffort in entry.reasoningEfforts)) fail(`route ${id}: model "${route.model}" does not offer reasoning effort "${route.reasoningEffort}"`)
    if (!Number.isInteger(route.maxTokens) || entry.maxTokens !== route.maxTokens) fail(`route ${id}: model "${route.model}" must cap output at the recorded maxTokens ${route.maxTokens}, found ${JSON.stringify(entry.maxTokens)}`)
    if (entry.contextWindow !== route.contextWindow) fail(`route ${id}: model "${route.model}" contextWindow is ${JSON.stringify(entry.contextWindow)}, the unit records ${route.contextWindow}`)
    if (entry.compat?.supportsLongCacheRetention !== false) fail(`route ${id}: model "${route.model}" must set compat.supportsLongCacheRetention false`)
    for (const [field, value] of Object.entries(route.compat ?? {})) {
      if (entry.compat?.[field] !== value) fail(`route ${id}: model "${route.model}" must set compat.${field} ${JSON.stringify(value)} as the unit records, found ${JSON.stringify(entry.compat?.[field])}`)
    }
  }
  const roster = new Set(unit.presets?.ids ?? [])
  for (const [role, route] of Object.entries(roleRoutes)) {
    if (!roster.has(role)) fail(`role ${role} has a route but is not in the preset roster`)
    if (route !== 'default' && !Object.hasOwn(routes, route)) fail(`role ${role} runs on ${route}, which the unit does not record`)
  }
  const research = new Set(Object.entries(roleRoutes).filter(([role]) => role.startsWith('sophia-research-')).map(([, route]) => route))
  if (research.size > 1) fail(`the research specializations must share one route, found ${[...research].join(', ')}`)
  return findings
}

/**
 * Compaction policy (SMC-M03): exactly the recorded per-route policies, set by the Sophia bundle on dsh-base's
 * `compaction-basic` row, each for a recorded route.
 * @param {ReturnType<typeof parseDump>} rows - composed dump rows.
 * @param {{ compaction?: { modelPolicies: any[] }, model_routes?: Record<string, any> }} unit - the recorded unit.
 * @returns {{ code: string, message: string }[]} findings.
 */
export function checkCompaction(rows, unit) {
  const findings = []
  const fail = (message) => findings.push({ code: 'compaction_invalid', message })
  const row = rows.find((r) => r.id === 'compaction-basic')
  if (!row || !row.patchedBy.includes(BUNDLE)) {
    fail(`compaction-basic must be configured by ${BUNDLE}`)
    return findings
  }
  if (!isDeepStrictEqual(row.config ?? {}, unit.compaction)) fail(`compaction-basic config is ${JSON.stringify(row.config)}, the unit records ${JSON.stringify(unit.compaction)}`)
  // Compaction summarizes on the route of the session it compacts; a separate summarization model is refused by the
  // bridge's route guard at run time, so the gate refuses it at install.
  if (row.config?.summarizationProvider || row.config?.summarizationModel) fail('compaction-basic names a summarization model; compaction must run on the route of the session it compacts')
  const routes = Object.values(unit.model_routes ?? {})
  for (const policy of unit.compaction.modelPolicies ?? []) {
    if (!routes.some((r) => r.provider === policy.provider && r.model === policy.model)) fail(`compaction policy for ${policy.provider}/${policy.model} is for no recorded route`)
  }
  return findings
}

/** Directories from `start` to the filesystem root. */
function ancestors(start) {
  const out = []
  for (let dir = start; ; dir = dirname(dir)) {
    out.push(dir)
    if (dirname(dir) === dir) return out
  }
}

/**
 * Verify an installed profile.
 * @param {{ unit: any, runtimeDir: string, dshHome: string, home: string, cwd: string }} input - runtime unit and locations.
 * @returns {{ ok: boolean, healthy: boolean, checks: { id: string, ok: boolean, findings: any[] }[], dump: { status: number|null, stdout: string, stderr: string } | null }}
 */
export function verifyProfile({ unit, runtimeDir, dshHome, home, cwd }) {
  const profileName = unit.dsh.profile
  const profileDir = join(dshHome, 'profiles', profileName)
  const checks = []
  const check = (id, findings) => { checks.push({ id, ok: findings.length === 0, findings }) }
  const fail = (code, message) => [{ code, message }]

  // 1. The manifest names exactly dsh-base then the Sophia bundle.
  const manifestPath = join(profileDir, 'package.json')
  if (!existsSync(manifestPath)) {
    check('profile_manifest', fail('profile_missing', `no profile manifest at ${manifestPath}`))
  } else {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const bundles = manifest.dsh?.profile?.bundles
    const findings = []
    if (JSON.stringify(bundles) !== JSON.stringify(unit.dsh.profile_bundles)) {
      findings.push({ code: 'profile_bundles_mismatch', message: `dsh.profile.bundles is ${JSON.stringify(bundles)}, expected ${JSON.stringify(unit.dsh.profile_bundles)}` })
    }
    const deps = Object.keys(manifest.dependencies ?? {})
    if (JSON.stringify(deps) !== JSON.stringify([BUNDLE])) {
      findings.push({ code: 'profile_dependencies_mismatch', message: `profile dependencies are ${JSON.stringify(deps)}, expected ["${BUNDLE}"]` })
    }
    check('profile_manifest', findings)
  }

  // 2. The installed bundle is the recorded identity and declares the pinned dsh peer.
  const bundleDir = join(profileDir, 'node_modules', BUNDLE)
  const bundleManifestPath = join(bundleDir, 'package.json')
  if (!existsSync(bundleManifestPath)) {
    check('bundle_installed', fail('bundle_missing', `${BUNDLE} is not installed in ${profileDir}`))
  } else {
    const pkg = JSON.parse(readFileSync(bundleManifestPath, 'utf8'))
    const findings = []
    if (pkg.name !== unit.sophia_bundle.name || pkg.version !== unit.sophia_bundle.version) {
      findings.push({ code: 'bundle_identity_mismatch', message: `installed ${pkg.name}@${pkg.version}, expected ${unit.sophia_bundle.name}@${unit.sophia_bundle.version}` })
    }
    const peer = pkg.peerDependencies?.['@deepseek-ai/dsh']
    if (peer !== unit.dsh.package_version) {
      findings.push({ code: 'bundle_incompatible', message: `peerDependencies["@deepseek-ai/dsh"] is ${JSON.stringify(peer)}, runtime is ${unit.dsh.package_version}` })
    }
    if (typeof pkg.dsh?.bundle?.patch !== 'string') {
      findings.push({ code: 'bundle_manifest_invalid', message: 'installed package declares no dsh.bundle.patch' })
    }
    const lockPath = join(profileDir, 'pnpm-lock.yaml')
    const lock = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : ''
    if (!lock.includes(unit.sophia_bundle.archive_integrity)) {
      findings.push({ code: 'bundle_archive_mismatch', message: `profile lock does not pin the recorded archive integrity ${unit.sophia_bundle.archive_integrity}` })
    }
    const archive = join(profileDir, unit.sophia_bundle.archive)
    if (!existsSync(archive)) {
      findings.push({ code: 'bundle_archive_missing', message: `${unit.sophia_bundle.archive} is not in the profile, so the installed files cannot be checked against the recorded bytes` })
    } else if (fileIntegrity(archive) !== unit.sophia_bundle.archive_integrity) {
      findings.push({ code: 'bundle_archive_mismatch', message: `${unit.sophia_bundle.archive} in the profile differs from the recorded archive` })
    } else {
      for (const path of diffAgainstArchive(archive, bundleDir)) {
        findings.push({ code: 'bundle_files_mismatch', message: `installed ${BUNDLE}/${path} differs from the recorded archive` })
      }
    }
    check('bundle_installed', findings)
  }

  // 3. Layers lint clean: no comments-only file, no unmatched or duplicate row; profile patch is literally [].
  const baseDir = baseBundleDir(runtimeDir)
  const bundlePatch = join(bundleDir, 'cordis.patch.yml')
  const profilePatch = join(profileDir, 'cordis.patch.yml')
  if (existsSync(bundlePatch)) {
    const findings = lintComposition({
      basePatch: join(baseDir, 'cordis.patch.yml'),
      bundlePatch,
      profilePatch: existsSync(profilePatch) ? profilePatch : undefined,
    })
    if (existsSync(profilePatch)) {
      const profile = parsePatch(readFileSync(profilePatch, 'utf8'), 'profile cordis.patch.yml')
      if (profile.rows !== null && profile.rows.length > 0) {
        findings.push({ code: 'profile_patch_not_empty', layer: 'profile cordis.patch.yml', message: 'S1-01 installs a literal [] profile patch; configuration belongs in the bundle' })
      }
    }
    const base = parsePatch(readFileSync(join(baseDir, 'cordis.patch.yml'), 'utf8'), BASE)
    if (base.rows !== null) findings.push(...checkReviewedBaseRows(base.rows, loadReviewedBaseRows(), baseBundleVersion(runtimeDir)))
    if (existsSync(join(dshHome, 'cordis.patch.yml'))) {
      findings.push({ code: 'home_patch_present', layer: '$DSH_HOME/cordis.patch.yml', message: 'an unmanaged home-level patch would outrank the profile' })
    }
    check('patch_layers', findings)
  } else {
    check('patch_layers', fail('bundle_missing', `no bundle patch at ${bundlePatch}`))
  }

  // 4. No copy of the bundle is reachable from the runtime installation, where it would mask the profile's install.
  const shadows = ancestors(dshPackageDir(runtimeDir))
    .map((dir) => join(dir, 'node_modules', BUNDLE))
    .filter((candidate) => existsSync(candidate))
  check('no_bundle_shadowing', shadows.map((path) => ({ code: 'bundle_shadowed', message: `${BUNDLE} resolvable from the dsh installation at ${path}` })))

  // 5. The trusted dump composes exactly base + Sophia rows, cleanly.
  const dump = runDsh(runtimeDir, ['--profile', profileName, '--dump-config'], { env: sanitizedEnv({ dshHome, home }), cwd })
  const dumpFindings = []
  if (dump.status !== 0) dumpFindings.push({ code: 'dump_failed', message: `dsh --dump-config exited ${dump.status ?? dump.signal}` })
  dumpFindings.push(...classifyDumpStderr(dump.stderr))
  check('dump_config', dumpFindings)

  if (dump.status === 0) {
    const findings = []
    let rows = []
    try { rows = parseDump(dump.stdout) } catch (error) { findings.push({ code: 'dump_unparsable', message: String(error.message) }) }
    const byId = new Map()
    for (const row of rows) byId.set(row.id, [...(byId.get(row.id) ?? []), row])

    const bridge = byId.get(BRIDGE_ROW) ?? []
    if (bridge.length !== 1) {
      findings.push({ code: 'bridge_row_missing', message: `expected one ${BRIDGE_ROW} row, found ${bridge.length}` })
    } else {
      const [row] = bridge
      if (row.name !== BUNDLE || row.origin !== BUNDLE || row.disabled === true || row.config?.protocolVersion !== 1) {
        findings.push({ code: 'bridge_row_invalid', message: `${BRIDGE_ROW} is ${JSON.stringify({ name: row.name, origin: row.origin, disabled: row.disabled, config: row.config })}` })
      }
    }
    for (const id of REQUIRED_DISABLED) {
      const [row] = byId.get(id) ?? []
      if (!row || row.disabled !== true || !row.patchedBy.includes(BUNDLE)) {
        findings.push({ code: 'required_disable_missing', message: `${id} must be disabled by ${BUNDLE}` })
      }
    }
    if (unit.model_route) findings.push(...checkModelRoute(rows, unit.model_route))
    if (unit.presets) findings.push(...checkPresetRoster(rows, unit.presets))
    if (unit.model_routes || unit.role_routes) findings.push(...checkModelRoutes(rows, unit))
    if (unit.compaction) findings.push(...checkCompaction(rows, unit))
    const loops = byId.get('agent-loop') ?? []
    if (loops.length !== 1 || loops[0].origin !== BASE) {
      findings.push({ code: 'agent_loop_not_single', message: `expected exactly one agent-loop row from ${BASE}, found ${loops.length}` })
    }
    for (const id of FOREIGN_ROOT_ROWS) {
      if (byId.has(id)) findings.push({ code: 'foreign_root_loop', message: `app-surface row "${id}" is composed (${byId.get(id)[0].origin})` })
    }
    for (const row of rows) {
      for (const source of [row.origin, ...row.patchedBy]) {
        if (source !== BASE && source !== BUNDLE) findings.push({ code: 'foreign_layer', message: `row "${row.id}" comes from or is patched by "${source}"` })
      }
    }
    // Rows present must be exactly base inserts + Sophia inserts.
    if (existsSync(bundlePatch)) {
      const base = parsePatch(readFileSync(join(baseDir, 'cordis.patch.yml'), 'utf8'), BASE)
      const bundle = parsePatch(readFileSync(bundlePatch, 'utf8'), BUNDLE)
      const expected = new Set([...insertedIds(base.rows ?? []), ...insertedIds(bundle.rows ?? [])])
      const actual = new Set(rows.map((row) => row.id))
      for (const id of expected) if (!actual.has(id)) findings.push({ code: 'composition_mismatch', message: `expected row "${id}" is not composed` })
      for (const id of actual) if (!expected.has(id)) findings.push({ code: 'composition_mismatch', message: `unexpected row "${id}" is composed` })
    }
    check('composition', findings)
  }

  const ok = checks.every((c) => c.ok)
  return { ok, health: healthOf(checks), checks, dump }
}

/**
 * Health needs a verified composition AND a running bridge that reported
 * `ready` to the Sophia service. This gate checks composition statically, so
 * its verdict is never `healthy`: readiness is observed at runtime by the
 * service (and the execution-host supervisor), never inferred from files.
 * Composition failures keep their own reasons so the two causes stay distinct.
 */
export function healthOf(checks) {
  const reasons = checks.filter((c) => !c.ok).map((c) => `composition:${c.id}`)
  reasons.push('bridge_readiness_unobserved: readiness is reported by the running bridge, not by files')
  return { healthy: false, reasons }
}
