/**
 * SMC-M03 plan §2.2: config/specialists.json is the one registry of specialist roles. The bundle's presets are
 * generated from it, and the runtime unit and the bridge row must route each specialist exactly as it says. The
 * registry's schema refuses a specialist that could reach the host, run workflows or peers, or drop the Markdown source.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { REPO_ROOT, loadRuntimeUnit } from '../../scripts/lib/common.mjs'
import { parseCordisYaml } from '../../scripts/lib/patch-lint.mjs'
import { ROLE_PRESETS } from '../../packages/dsh-bundle/dist/role-registry.js'

const registry = JSON.parse(readFileSync(join(REPO_ROOT, 'config', 'specialists.json'), 'utf8'))
const roles = JSON.parse(readFileSync(join(REPO_ROOT, 'config', 'roles.json'), 'utf8')).roles
const unit = loadRuntimeUnit()
const bridge = parseCordisYaml(readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8'))
  .flatMap((row) => row.insert ?? [])
  .find((row) => row.id === 'sophia-control-bridge').config

test('each specialist preset is the registry entry: its native tools, no goal continuation, no host shell', () => {
  for (const s of registry.specialists) {
    const preset = ROLE_PRESETS[s.id]
    assert.ok(preset, `${s.id} has a bundle preset`)
    assert.deepEqual([...preset.nativeTools].sort(), [...s.native_tools].sort(), `${s.id} native tools`)
    assert.equal(preset.goalContinuation, false)
    assert.equal(preset.rawHostShell, false)
    for (const tool of ['workflow', 'skill', 'subagent', 'send_message', 'bash', 'write', 'edit', 'web_search', 'web_fetch']) {
      assert.equal(preset.nativeTools.has(tool), false, `${s.id} may not run ${tool}`)
    }
  }
  assert.deepEqual(roles.filter((r) => registry.specialists.some((s) => s.id === r.id)), [], 'roles.json keeps only the roles before M03')
})

test('the runtime unit and the bridge row route each specialist as the registry does, and compose its preset', () => {
  const routes = Object.fromEntries(registry.specialists.map((s) => [s.id, s.route]))
  assert.deepEqual(unit.role_routes, routes)
  assert.deepEqual(bridge.roleRoutes, routes)
  for (const s of registry.specialists) {
    assert.ok(unit.model_routes[s.route], `${s.id}: route ${s.route} is recorded by the unit`)
    assert.ok(unit.presets.ids.includes(s.id), `${s.id}: its preset is in the unit's roster`)
  }
})

test('the registry schema refuses a specialist that widens what it may do', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sophia-specialists-'))
  const check = (mutate) => {
    const copy = structuredClone(registry)
    mutate(copy.specialists[1])
    const file = join(dir, 'registry.json')
    writeFileSync(file, JSON.stringify(copy))
    const run = spawnSync(process.execPath, [join(REPO_ROOT, 'packages', 'contracts', 'scripts', 'generate-specialists.ts'), '--registry', file], { encoding: 'utf8' })
    return { status: run.status, stderr: run.stderr }
  }
  try {
    assert.equal(check(() => {}).status, 0, 'the registry as committed is valid')
    for (const [what, mutate] of [
      ['a host shell', (s) => { s.raw_host_shell = true }],
      ['workflows', (s) => { s.workflow = true }],
      ['peers', (s) => { s.peer = true }],
      ['no Markdown source', (s) => { s.outputs = ['pdf'] }],
      ['the default route', (s) => { s.route = 'default' }],
      ['an unknown field', (s) => { s.model = 'gpt-6.1-sol' }],
      ['a PDF output without its renderer', (s) => { s.native_tools = s.native_tools.filter((t) => t !== 'research_render_pdf') }],
      ['a duplicate id', (s) => { s.id = registry.specialists[0].id }],
    ]) {
      const result = check(mutate)
      assert.equal(result.status, 1, `refuses ${what}`)
      assert.match(result.stderr, /does not match its schema|go together|registered twice/, what)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
