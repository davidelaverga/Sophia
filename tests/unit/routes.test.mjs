// SMC-M03 execution policy: the bridge row's route allowlist and role routes, the model-call route guard, and the
// runtime command that may name a route.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { offRoute } from '../../packages/dsh-bundle/dist/control-bridge.js'
import { parseConfig } from '../../packages/dsh-bundle/dist/index.js'
import { parseCommand, ProtocolError } from '../../packages/dsh-bundle/dist/protocol.js'

const row = {
  protocolVersion: 1,
  serviceUrlEnv: 'SOPHIA_BRIDGE_URL',
  tokenEnv: 'SOPHIA_BRIDGE_TOKEN',
  runtimeUnitEnv: 'SOPHIA_RUNTIME_UNIT',
  workspaceEnv: 'SOPHIA_WORKSPACE',
  routes: { 'research-sol-medium-v1': { provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium' } },
  roleRoutes: { 'sophia-research-md-v1': 'research-sol-medium-v1', 'sophia-research-pdf-v1': 'research-sol-medium-v1' },
}

test('the bridge row allows named routes and maps roles to them, strictly', () => {
  const config = parseConfig(row)
  assert.deepEqual(config.routes, { 'research-sol-medium-v1': { provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium' } })
  assert.equal(config.roleRoutes['sophia-research-md-v1'], 'research-sol-medium-v1')
  assert.deepEqual(parseConfig({ protocolVersion: 1 }).routes, {}, 'an M02 row has no routes and every role runs on default')
  assert.deepEqual(parseConfig({ ...row, roleRoutes: { 'sophia-brief-v1': 'default' } }).roleRoutes, { 'sophia-brief-v1': 'default' })
  const refused = [
    [{ ...row, routes: { default: row.routes['research-sol-medium-v1'] } }, /not a route id/],
    [{ ...row, routes: { 'Research!': row.routes['research-sol-medium-v1'] } }, /not a route id/],
    [{ ...row, routes: { r1: { provider: 'openai-research' } } }, /needs a model/],
    [{ ...row, routes: { r1: { ...row.routes['research-sol-medium-v1'], maxTokens: 9 } } }, /unknown fields maxTokens/],
    [{ ...row, roleRoutes: { 'sophia-research-xl-v1': 'research-sol-medium-v1' } }, /not one of this bundle's roles/],
    [{ ...row, roleRoutes: { 'sophia-research-md-v1': 'research-sol-high-v1' } }, /neither default nor an allowed route/],
    [{ ...row, fallbackRoute: 'default' }, /unknown config fields fallbackRoute/],
  ]
  for (const [config, message] of refused) assert.throws(() => parseConfig(config), message)
})

test('a model call off the attempt\'s route is refused; one that names no effort runs at the route\'s model default', () => {
  const route = { provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium' }
  assert.equal(offRoute({ provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium' }, route), null)
  assert.equal(offRoute({ provider: 'openai-research', model: 'gpt-6.1-sol' }, route), null, 'a compaction call names no effort')
  assert.match(offRoute({ provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'max' }, route), /refused/)
  assert.match(offRoute({ provider: 'openai', model: 'gpt-6.1-sol', reasoningEffort: 'medium' }, route), /openai\/gpt-6\.1-sol\/medium is refused/)
  assert.match(offRoute({ provider: 'openai-research', model: 'gpt-6-sol' }, route), /refused/)
  const unset = { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: null }
  assert.match(offRoute({ provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'high' }, unset), /refused/, 'a route with no effort allows only the default')
})

test('a command may name a specialization role and, on create, the route admission chose', () => {
  const command = {
    schema: 'sophia.runtime-command.v1',
    commandId: 'cmd-1',
    binding: { projectId: 'p', goalId: 'g', goalRevision: 1, attemptId: 'a1', resourceId: 'r', authorityEpoch: 1, runtimeUnitId: 'u' },
    kind: 'create',
    expectedNativeSessionId: null,
    contextPacketId: null,
    payload: { text: 'Research it.', role: 'sophia-research-md-v1', route: 'research-sol-medium-v1' },
  }
  assert.equal(parseCommand(command).payload.route, 'research-sol-medium-v1')
  assert.equal(parseCommand({ ...command, payload: { ...command.payload, role: 'sophia-brief-v1', route: undefined } }).payload.role, 'sophia-brief-v1')
  for (const bad of [{ route: 'Research' }, { route: '-x' }, { role: 'sophia-research-md' }, { role: 'research-md-v1' }]) {
    assert.throws(() => parseCommand({ ...command, payload: { ...command.payload, ...bad } }), ProtocolError)
  }
})
