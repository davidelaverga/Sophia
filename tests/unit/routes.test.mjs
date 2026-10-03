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
  routes: { 'research-sol-medium-v1': { provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium', maxTokens: 16000 } },
  roleRoutes: { 'sophia-research-md-v1': 'research-sol-medium-v1', 'sophia-research-pdf-v1': 'research-sol-medium-v1' },
}

test('the bridge row allows named routes and maps roles to them, strictly', () => {
  const config = parseConfig(row)
  assert.deepEqual(config.routes, { 'research-sol-medium-v1': { provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium', maxTokens: 16000 } })
  assert.equal(config.roleRoutes['sophia-research-md-v1'], 'research-sol-medium-v1')
  assert.deepEqual(parseConfig({ protocolVersion: 1 }).routes, {}, 'an M02 row has no routes and every role runs on default')
  assert.deepEqual(parseConfig({ ...row, roleRoutes: { 'sophia-brief-v1': 'default' } }).roleRoutes, { 'sophia-brief-v1': 'default' })
  const refused = [
    [{ ...row, routes: { default: row.routes['research-sol-medium-v1'] } }, /not a route id/],
    [{ ...row, routes: { 'Research!': row.routes['research-sol-medium-v1'] } }, /not a route id/],
    [{ ...row, routes: { r1: { provider: 'openai-research' } } }, /needs a model/],
    [{ ...row, routes: { r1: { ...row.routes['research-sol-medium-v1'], cacheRetention: 'long' } } }, /unknown fields cacheRetention/],
    [{ ...row, routes: { r1: { provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium' } } }, /needs maxTokens/],
    [{ ...row, routes: { r1: { ...row.routes['research-sol-medium-v1'], maxTokens: 0 } } }, /needs maxTokens/],
    [{ ...row, routes: { r1: { ...row.routes['research-sol-medium-v1'], maxTokens: 16000.5 } } }, /needs maxTokens/],
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

test('a model call asking for more output than the route\'s ceiling is refused; the default and compaction caps run (M03-RF-0003)', () => {
  const route = { provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium' }
  const call = (maxTokens) => ({ provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium', ...(maxTokens === undefined ? {} : { maxTokens }) })
  assert.equal(offRoute(call(undefined), route, 16000), null, 'no cap named: the model entry\'s default, which equals the ceiling')
  assert.equal(offRoute(call(16000), route, 16000), null, 'exactly the ceiling')
  assert.equal(offRoute({ provider: 'openai-research', model: 'gpt-6.1-sol', maxTokens: 8000 }, route, 16000), null, 'a compaction call')
  assert.match(offRoute(call(16001), route, 16000), /allows at most 16000 output tokens; a model call asking for 16001 is refused/)
  assert.match(offRoute(call(128000), route, 16000), /asking for 128000 is refused/)
  for (const odd of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.match(offRoute(call(odd), route, 16000), /refused/, String(odd))
  assert.equal(offRoute(call(128000), route, null), null, 'the default route keeps the default model\'s own cap')
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
