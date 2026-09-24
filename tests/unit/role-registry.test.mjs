import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'
import { ROLE_PRESETS, roleOf } from '../../packages/dsh-bundle/dist/role-registry.js'

const roles = JSON.parse(readFileSync(join(REPO_ROOT, 'config', 'roles.json'), 'utf8')).roles

test('bundle role presets mirror config/roles.json ids and flags', () => {
  assert.deepEqual(Object.keys(ROLE_PRESETS).sort(), roles.map((r) => r.id).sort())
  for (const role of roles) {
    const preset = roleOf(role.id)
    assert.equal(preset.goalContinuation, role.goal_continuation, `${role.id} goal_continuation`)
    assert.equal(role.raw_host_shell, false)
    assert.equal(preset.rawHostShell, false)
  }
})

test('no role may run host execution, host file mutation, web, spawning or plugin tools', () => {
  const forbidden = ['bash', 'write', 'edit', 'job_output', 'job_list', 'job_kill', 'web_search', 'web_fetch', 'subagent', 'subagent_fork', 'send_message', 'interrupt_agent', 'list_agents', 'exit_plan_mode']
  for (const preset of Object.values(ROLE_PRESETS)) {
    for (const name of forbidden) assert.equal(preset.nativeTools.has(name), false, `${preset.id} allows ${name}`)
  }
  for (const preset of Object.values(ROLE_PRESETS)) {
    const hasGoals = ['get_goal', 'create_goal', 'update_goal'].some((name) => preset.nativeTools.has(name))
    assert.equal(hasGoals, preset.goalContinuation, `${preset.id}: goal tools follow goal_continuation`)
  }
  assert.equal(roleOf('sophia-lead-v0'), undefined)
  assert.equal(roleOf('__proto__'), undefined)
})
