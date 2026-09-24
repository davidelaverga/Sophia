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

test('health is never true at S1-01 and names composition failures separately', () => {
  assert.deepEqual(healthOf([{ id: 'composition', ok: true, findings: [] }]), {
    healthy: false, reasons: ['bridge_not_ready: control bridge not implemented (S1-03)'],
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
  const unpatched = rows()
  unpatched[0].patchedBy = []
  assert.match(checkModelRoute(unpatched, route)[0].message, /must be set by/)
})
