import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyDumpStderr, healthOf, parseDump } from '../../scripts/lib/gate.mjs'

// Shapes copied from `dsh --dump-config` output at the pin (0.1.7-rc.1).
const DUMP = `# == @deepseek-ai/dsh-base
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
# == @deepseek-ai/dsh-base, patched by @sophia/dsh-bundle
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  disabled: true
  config:
    root: []
# == @deepseek-ai/dsh-base
- id: plugin-manager
  name: '@deepseek-ai/dsh-plugin-manager'
  disabled: !!js '!ctx.get(''profileContext'')'
# == @sophia/dsh-bundle
- id: sophia-control-bridge
  name: '@sophia/dsh-bundle'
  config:
    protocolVersion: 1
`

test('dump rows carry the source layer printed above them', () => {
  const rows = parseDump(DUMP)
  assert.deepEqual(rows.map((r) => [r.id, r.origin, r.patchedBy]), [
    ['timer', '@deepseek-ai/dsh-base', []],
    ['hmr', '@deepseek-ai/dsh-base', ['@sophia/dsh-bundle']],
    ['plugin-manager', '@deepseek-ai/dsh-base', []],
    ['sophia-control-bridge', '@sophia/dsh-bundle', []],
  ])
  assert.equal(rows[1].disabled, true)
  assert.deepEqual(rows[2].disabled, { $js: "!ctx.get('profileContext')" })
})

test('each upstream skip/warning line is classified', () => {
  const stderr = [
    'dsh: skipping profile bundle "@sophia/dsh-bundle": Error: dsh: cannot resolve profile bundle "@sophia/dsh-bundle" from the dsh installation or /x; run ...',
    'dsh: skipping profile bundle "@sophia/dsh-bundle": Error: Plugin @sophia/dsh-bundle@0.1.0 is incompatible with dsh 0.1.7-rc.1: peerDependencies {"@deepseek-ai/dsh":"0.2.0"}.',
    'dsh: skipping profile bundle "@sophia/dsh-bundle": Error: dsh: overlay /x/cordis.patch.yml must be a top-level YAML array of loader patch entries',
    'dsh: [@sophia/dsh-bundle] patch: entry "session-log-deepseek-typo" not found',
    'something else entirely',
    '',
  ].join('\n')
  assert.deepEqual(classifyDumpStderr(stderr).map((f) => f.code), [
    'bundle_missing', 'bundle_incompatible', 'patch_comments_only', 'patch_unmatched_row', 'dump_diagnostic',
  ])
  assert.deepEqual(classifyDumpStderr(''), [])
})

test('the static gate never claims health and names composition failures separately', () => {
  assert.deepEqual(healthOf([{ id: 'composition', ok: true, findings: [] }]), {
    healthy: false, reasons: ['bridge_readiness_unobserved: readiness is reported by the running bridge, not by files'],
  })
  assert.equal(healthOf([{ id: 'bundle_installed', ok: false, findings: [{}] }]).reasons[0], 'composition:bundle_installed')
})

test('the model route check accepts the recorded route and names each way it can be wrong', async () => {
  const { checkModelRoute } = await import('../../scripts/lib/gate.mjs')
  const route = { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'high', credential_ref: 'OPENAI_API_KEY' }
  const rows = (overrides = {}) => [
    { id: 'agent-default-model', origin: '@deepseek-ai/dsh-base', patchedBy: ['@sophia/dsh-bundle'], config: { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'high', ...overrides.selection } },
    { id: 'llm-pi-ai', origin: '@deepseek-ai/dsh-base', patchedBy: ['@sophia/dsh-bundle'], config: { providers: { openai: { apiKeyEnv: 'OPENAI_API_KEY', models: [{ id: 'gpt-6-luna', reasoningEfforts: { low: 'low', high: 'high' } }], ...overrides.profile } } } },
  ]
  assert.deepEqual(checkModelRoute(rows(), route), [])
  const messages = (r) => checkModelRoute(r, route).map((f) => f.message)
  assert.match(messages(rows({ selection: { provider: 'deepseek-official' } }))[0], /selects/)
  assert.match(messages(rows({ selection: { reasoningEffort: 'max' } }))[0], /selects/)
  assert.match(messages(rows({ profile: { apiKeyEnv: undefined } }))[0], /apiKeyEnv/)
  assert.match(messages(rows({ profile: { apiKey: 'sk-literal' } })).join(' '), /literal credential/)
  assert.match(messages(rows({ profile: { models: [{ id: 'gpt-6-astra' }] } }))[0], /does not list model/)
  assert.match(messages(rows({ profile: { models: [{ id: 'gpt-6-luna' }] } }))[0], /does not offer reasoning effort/)
  const pinned = { ...route, compat: { supportsStrictMode: false } }
  assert.match(checkModelRoute(rows(), pinned)[0].message, /compat\.supportsStrictMode false/)
  assert.deepEqual(checkModelRoute(rows({ profile: { models: [{ id: 'gpt-6-luna', reasoningEfforts: { high: 'high' }, compat: { supportsStrictMode: false } }] } }), pinned), [])
  const unpatched = rows()
  unpatched[0].patchedBy = []
  assert.match(checkModelRoute(unpatched, route)[0].message, /must be set by/)
})

test('the reviewed base-row inventory names every added, removed or repackaged dsh-base row (SMC-M02)', async () => {
  const { checkReviewedBaseRows } = await import('../../scripts/lib/gate.mjs')
  const reviewed = { dsh_base: '0.2.0-rc.2', rows: [{ id: 'timer', name: '@deepseek-ai/cordis-plugin-timer' }, { id: 'otel', name: '@deepseek-ai/dsh-otel' }] }
  const base = (...entries) => [{ insert: entries.map(([id, name]) => ({ id, name })) }]
  assert.deepEqual(checkReviewedBaseRows(base(['timer', '@deepseek-ai/cordis-plugin-timer'], ['otel', '@deepseek-ai/dsh-otel']), reviewed, '0.2.0-rc.2'), [])
  const codes = (rows, version = '0.2.0-rc.2') => checkReviewedBaseRows(rows, reviewed, version).map((f) => f.code)
  assert.deepEqual(codes(base(['timer', '@deepseek-ai/cordis-plugin-timer'], ['otel', '@deepseek-ai/dsh-otel'], ['otel-export', '@deepseek-ai/dsh-otel'])), ['base_row_unreviewed'])
  assert.deepEqual(codes(base(['timer', '@deepseek-ai/cordis-plugin-timer'])), ['base_row_missing'])
  assert.deepEqual(codes(base(['timer', '@deepseek-ai/cordis-plugin-timer'], ['otel', '@deepseek-ai/dsh-otel-next'])), ['base_row_package_changed'])
  assert.deepEqual(codes(base(['timer', '@deepseek-ai/cordis-plugin-timer'], ['otel-renamed', '@deepseek-ai/dsh-otel'])), ['base_row_unreviewed', 'base_row_missing'])
  assert.deepEqual(codes(base(['timer', '@deepseek-ai/cordis-plugin-timer'], ['otel', '@deepseek-ai/dsh-otel']), '0.2.0-rc.3'), ['base_rows_unreviewed_version'])
})

test('every required disable is a reviewed base row and a disabled row of the Sophia bundle patch (SMC-M02)', async () => {
  const { readFileSync } = await import('node:fs')
  const { REQUIRED_DISABLED, loadReviewedBaseRows } = await import('../../scripts/lib/gate.mjs')
  const { parseCordisYaml } = await import('../../scripts/lib/patch-lint.mjs')
  const reviewed = new Set(loadReviewedBaseRows().rows.map((r) => r.id))
  const patch = parseCordisYaml(readFileSync(new URL('../../packages/dsh-bundle/cordis.patch.yml', import.meta.url), 'utf8'))
  const disabled = new Set(patch.filter((r) => r.disabled === true).map((r) => r.id))
  for (const id of ['otel', 'llm-deepseek-account']) assert.ok(REQUIRED_DISABLED.includes(id), `${id} is required disabled`)
  for (const id of REQUIRED_DISABLED) {
    assert.ok(reviewed.has(id), `${id} is a reviewed base row`)
    assert.ok(disabled.has(id), `${id} is disabled by the bundle patch`)
  }
})

test('the preset roster must be exactly the recorded one, each preset inserted by the bundle and composing nothing (SMC-M02 G3)', async () => {
  const { checkPresetRoster } = await import('../../scripts/lib/gate.mjs')
  const presets = { registry: '@deepseek-ai/dsh-agent-preset-registry', registry_default: 'sophia-brief-v1', ids: ['sophia-review-v1', 'sophia-brief-v1'] }
  const registry = (config = { default: 'sophia-brief-v1' }) => ({ id: 'agent-preset-registry', name: presets.registry, origin: '@sophia/dsh-bundle', patchedBy: [], config })
  const preset = (id, plugins = [], extra = {}) => ({ id: `preset-${id}`, name: '@deepseek-ai/dsh-agent-preset', origin: '@sophia/dsh-bundle', patchedBy: [], config: { id, plugins }, ...extra })
  const rows = (...extra) => [registry(), preset('sophia-review-v1'), preset('sophia-brief-v1'), ...extra]
  assert.deepEqual(checkPresetRoster(rows(), presets), [])
  const messages = (r) => checkPresetRoster(r, presets).map((f) => f.message).join('\n')
  assert.match(messages(rows(preset('sophia-test-inert-v1'))), /"sophia-test-inert-v1" .* not in the unit's roster/)
  assert.match(messages([registry(), preset('sophia-review-v1', [{ id: 'web', name: '@deepseek-ai/dsh-tool-web' }]), preset('sophia-brief-v1')]), /composes .*dsh-tool-web/)
  assert.match(messages([registry(), preset('sophia-review-v1')]), /recorded preset "sophia-brief-v1" is not composed/)
  assert.match(messages([registry({ default: 'sophia-research-v1' }), preset('sophia-review-v1'), preset('sophia-brief-v1')]), /default is "sophia-research-v1"/)
  assert.match(messages([registry(), preset('sophia-review-v1', [], { patchedBy: ['profile'] }), preset('sophia-brief-v1')]), /patched by no layer/)
  assert.match(messages([preset('sophia-review-v1'), preset('sophia-brief-v1')]), /expected one @deepseek-ai\/dsh-agent-preset-registry row/)
})

test('the research routes, role routes and compaction must be exactly the recorded ones (SMC-M03)', async () => {
  const { checkCompaction, checkModelRoutes } = await import('../../scripts/lib/gate.mjs')
  const route = {
    provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium', maxTokens: 16000, contextWindow: 272000,
    baseURL: 'https://api.openai.com/v1', cacheRetention: null, compat: { supportsStrictMode: true, supportsLongCacheRetention: false },
    credential_ref: 'OPENAI_RESEARCH_API_KEY',
  }
  const unit = {
    model_routes: { 'research-sol-medium-v1': route },
    role_routes: { 'sophia-research-md-v1': 'research-sol-medium-v1', 'sophia-research-pdf-v1': 'research-sol-medium-v1' },
    presets: { ids: ['sophia-brief-v1', 'sophia-research-md-v1', 'sophia-research-pdf-v1'] },
    compaction: { modelPolicies: [{ provider: 'openai-research', model: 'gpt-6.1-sol', thresholdRatio: 0.45, headroomTokens: 16000, maxTokens: 8000 }] },
  }
  const entry = { id: 'gpt-6.1-sol', contextWindow: 272000, maxTokens: 16000, reasoningEfforts: { low: 'low', medium: 'medium' }, compat: { supportsStrictMode: true, supportsLongCacheRetention: false } }
  const rows = (o = {}) => [
    { id: 'llm-pi-ai', origin: '@deepseek-ai/dsh-base', patchedBy: ['@sophia/dsh-bundle'], config: { providers: { 'openai-research': { apiKeyEnv: 'OPENAI_RESEARCH_API_KEY', baseURL: 'https://api.openai.com/v1', models: [{ ...entry, ...o.entry }], ...o.profile } } } },
    { id: 'sophia-control-bridge', origin: '@sophia/dsh-bundle', patchedBy: [], config: { protocolVersion: 1, routes: { 'research-sol-medium-v1': { provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium', maxTokens: 16000 } }, roleRoutes: unit.role_routes, ...o.bridge } },
    { id: 'compaction-basic', origin: '@deepseek-ai/dsh-base', patchedBy: ['@sophia/dsh-bundle'], config: o.compaction ?? unit.compaction },
  ]
  assert.deepEqual(checkModelRoutes(rows(), unit), [])
  assert.deepEqual(checkCompaction(rows(), unit), [])
  const messages = (r, u = unit) => checkModelRoutes(r, u).map((f) => f.message).join(' | ')
  assert.match(messages(rows({ bridge: { routes: { 'research-sol-medium-v1': { provider: 'openai', model: 'gpt-6.1-sol', reasoningEffort: 'medium', maxTokens: 16000 } } } })), /allows routes/)
  assert.match(messages(rows({ bridge: { routes: { 'research-sol-medium-v1': { provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium', maxTokens: 128000 } } } })), /allows routes/, 'a raised bridge ceiling (M03-RF-0003)')
  assert.match(messages(rows({ bridge: { roleRoutes: { 'sophia-research-md-v1': 'research-sol-medium-v1' } } })), /maps roles/)
  assert.match(messages(rows({ profile: { apiKeyEnv: 'OPENAI_API_KEY' } })), /OPENAI_RESEARCH_API_KEY through apiKeyEnv/)
  assert.match(messages(rows({ profile: { cacheRetention: 'long' } })), /must not set cacheRetention "long"/)
  assert.match(messages(rows({ entry: { maxTokens: 128000 } })), /recorded maxTokens 16000/)
  assert.match(messages(rows({ entry: { maxTokens: undefined } })), /recorded maxTokens 16000/)
  assert.match(messages(rows({ entry: { contextWindow: 1050000 } })), /contextWindow/)
  assert.match(messages(rows({ entry: { compat: { supportsStrictMode: true } } })), /supportsLongCacheRetention false/)
  assert.match(messages(rows({ entry: { reasoningEfforts: { low: 'low' } } })), /does not offer reasoning effort "medium"/)
  assert.match(messages(rows(), { ...unit, role_routes: { ...unit.role_routes, 'sophia-research-pdf-v1': 'default' } }), /share one route/)
  assert.match(messages(rows(), { ...unit, presets: { ids: ['sophia-research-md-v1'] } }), /not in the preset roster/)
  assert.match(checkCompaction(rows({ compaction: {} }), unit)[0].message, /compaction-basic config/)
  assert.match(checkCompaction(rows(), { ...unit, model_routes: {} })[0].message, /for no recorded route/)
  const summarizing = { ...unit.compaction, summarizationProvider: 'openai-research', summarizationModel: 'gpt-6.1-sol' }
  assert.match(checkCompaction(rows({ compaction: summarizing }), { ...unit, compaction: summarizing }).map((f) => f.message).join(' | '), /names a summarization model/)
})
