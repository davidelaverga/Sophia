// SMC-M03 execution policy: the bridge row's route allowlist and role routes, the model-call route guard, and the
// runtime command that may name a route.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openapi } from '../../packages/contracts/src/index.ts'
import { RUNTIME_ROUTES } from '../../apps/api/src/routes/runtime.ts'
import { wire } from '../../packages/dsh-bundle/dist/runtime-wire.generated.js'
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

const conRequest = {
  attemptId: '00000000-0000-0000-0000-000000000001',
  commandId: '00000000-0000-0000-0000-000000000002', authorityEpoch: 1, leaseId: 'synthetic-bridge',
}
const conKeys = { observations: [], usage: [], ordinals: [], hasTurnEnd: false }
const conCall = { routeId: 'synthetic-route', credentialRef: 'synthetic-ref', ownerResourceRef: 'synthetic-owner', unit: 'calls_tokens', tokens: 100, priceMicros: 0 }
const conShapes = [
  ['claim', 'ClaimRequest', 'ClaimReply', conRequest],
  ['go', 'GoRequest', 'GoReply', conRequest],
  ['reserve', 'ReserveRequest', 'Reservation', { ...conRequest, ordinal: 1, call: conCall }],
  ['settle', 'SettleRequest', 'Settlement', { ...conRequest, ordinal: 1, used: { calls: 1, tokens: 10, priceMicros: 0 } }],
  ['acknowledged', 'AcknowledgedRequest', 'Acknowledgement', { ...conRequest, keys: conKeys }],
]

test('the five CON service paths bind the exact generated request and response shapes, never a member identity', () => {
  for (const [path, request, response, body] of conShapes) {
    const route = `/v1/runtime/conversation/${path}`
    assert.ok(RUNTIME_ROUTES.has(route), route)
    const operation = openapi.paths[route].post
    assert.deepEqual(operation.security, [{ runtimeCapability: [] }])
    assert.deepEqual(operation.parameters.map(p => p.name), ['x-sophia-runtime-unit', 'x-sophia-bridge-instance', 'x-sophia-bridge-protocol'])
    assert.equal(operation.requestBody.content['application/json'].schema.$ref, `#/components/schemas/RuntimeConversation${request}`)
    assert.equal(operation.responses['200'].content['application/json'].schema.$ref, `#/components/schemas/RuntimeConversation${response}`)
    const validate = wire[`RuntimeConversation${request}`]
    assert.equal(validate(body), true, JSON.stringify(validate.errors))
    for (const key of ['actorId', 'projectId', 'resourceId']) assert.equal(validate({ ...body, [key]: conRequest.attemptId }), false)
    assert.equal(validate({ ...body, attemptId: 'not-an-id' }), false)
    assert.equal(validate({ ...body, authorityEpoch: 0 }), false)
    assert.equal(validate({ ...body, commandId: undefined }), false)
    assert.equal(typeof wire[`RuntimeConversation${response}`], 'function')
  }
})

test('CON wire keeps two ordinals and safe integer accounting without silently truncating journal proof', () => {
  const reserve = wire.RuntimeConversationReserveRequest
  const settle = wire.RuntimeConversationSettleRequest
  for (const ordinal of [0, 3, 1.5]) {
    assert.equal(reserve({ ...conRequest, ordinal, call: conCall }), false)
    assert.equal(settle({ ...conRequest, ordinal, used: { calls: 1, tokens: 10, priceMicros: 0 } }), false)
  }
  for (const tokens of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(reserve({ ...conRequest, ordinal: 1, call: { ...conCall, tokens } }), false)
  assert.equal(settle({ ...conRequest, ordinal: 1, used: { calls: 2, tokens: 10, priceMicros: 0 } }), false)
  assert.equal(wire.RuntimeConversationAcknowledgedRequest({ ...conRequest, keys: { ...conKeys, observations: Array.from({ length: 502 }, (_, i) => `synthetic-session#${i}`) } }), true)
})

test('CON wire retains all eight ACK predicates and each durable terminal-writer kind', () => {
  const id = conRequest.attemptId
  const capture = { kind: 'capture', turnEndId: id, turnEndSeq: 2, resultRef: id, outcome: 'published' }
  const predicates = {
    observations: { met: true, keys: [] }, usage: { met: true, keys: [] }, reservations: { met: true, states: [] },
    terminalState: { met: true, replyId: id, state: 'answered' },
    terminalWriter: { met: true, key: capture }, createAnswered: { met: true, commandId: id, stage: 'delivered' },
    capture: { met: true, outcome: 'published', key: capture }, payloadScrubbed: { met: true, commandId: id },
  }
  const validate = wire.RuntimeConversationAcknowledgement
  for (const key of [capture, { kind: 'receipt', commandId: id, stage: 'failed' },
    { kind: 'hello', attemptId: id, leaseId: 'synthetic-bridge', leaseEpoch: 2 },
    { kind: 'cancellation', replyId: id, caller: 'capture_native_result', causeKind: 'capture_privacy', reason: 'audience_changed', cancelledAt: '2026-10-13T10:00:00.123456+00:00' }, null]) {
    assert.equal(validate({ predicates: { ...predicates, terminalWriter: { met: key !== null, key } } }), true, JSON.stringify(validate.errors))
  }
  for (const name of Object.keys(predicates)) {
    const incomplete = { ...predicates }; delete incomplete[name]
    assert.equal(validate({ predicates: incomplete }), false, name)
  }
})
