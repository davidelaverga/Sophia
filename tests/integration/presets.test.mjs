/**
 * SMC-M02 G3 (M02-T08, M02-T02): native presets and the attempt's execution
 * identity, against the real pinned dsh loop (keyless mock model, LABELLED
 * fixture service).
 *
 * The bridge mounts each role's preset through the public `agentPresets`
 * registry on create and resume, records the attempt's identity (runtime
 * unit, preset and definition digest, provider/model/effort) before the
 * native create, and restores exactly that identity. A changed preset
 * definition, a missing preset or a route the session never ran on becomes an
 * explicit unrecovered (held) attempt; nothing falls back to a default.
 *
 * Each case boots the unit with a route overlay it can change between boots:
 * the mock provider offers `mock-model` and `mock-model-2`, and
 * `agent-default-model` selects one of them. `presetOverlay` replaces the
 * review role's preset definition, with the strict synthetic preset from
 * tests/support/inert-preset (test composition only).
 */

import assert from 'node:assert/strict'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { command } from '../support/fixture-service.mjs'
import { startMockLlm } from '../support/mock-llm.mjs'
import { sleep, suite, unit } from '../support/harness.mjs'

const REVIEW = 'sophia-review-v1'
const route = { defaultModel: 'mock-model', presetOverlay: '' }
const overlay = (baseURL) => `# Test overlay: two keyless mock models; the default is chosen per boot. Never part of a profile.
- id: llm-pi-ai
  config:
    providers:
      mock:
        apiKeyEnv: MOCK_LLM_KEY
        api: openai-completions
        baseURL: ${baseURL}
        models:
          - id: mock-model
            contextWindow: 32768
            maxTokens: 4096
            reasoningEfforts: false
          - id: mock-model-2
            contextWindow: 32768
            maxTokens: 4096
            reasoningEfforts: false
- id: agent-default-model
  config:
    provider: mock
    model: ${route.defaultModel}
${route.presetOverlay}`
const SYNTHETIC = `- id: preset-${REVIEW}
  config:
    id: ${REVIEW}
    plugins:
      - id: sophia-test-inert-preset
        name: '@sophia-test/inert-preset'
        config:
          label: synthetic-review
`
const DROPPED = `- id: preset-${REVIEW}
  disabled: true
`

const { world, cleanup } = suite('sophia-presets', { model: { start: startMockLlm, overlay, env: { MOCK_LLM_KEY: 'mock' } } })
after(cleanup)

/** A fresh case on the production presets and the first mock model. */
async function presetWorld(t) {
  route.defaultModel = 'mock-model'
  route.presetOverlay = ''
  const w = await world(t)
  cpSync(new URL('../support/inert-preset', import.meta.url), join(w.layout.dshHome, 'profiles', unit.dsh.profile, 'node_modules', '@sophia-test', 'inert-preset'), { recursive: true })
  return w
}
const inspect = async (w) => JSON.parse((await w.service.waitForReceipt(w.send(w.cmd('inspect')).commandId)).reason)
const held = (w) => w.service.setBindings([{ attemptId: w.attemptId, nativeSessionId: `sophia-${w.attemptId}`, authorityEpoch: 1, state: 'active' }])
async function createReview(w, text = 'First.') {
  w.send(w.cmd('create', { text, role: REVIEW }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 20000, 'the first turn')
}
async function restart(w) {
  await w.stop()
  held(w)
  await w.start()
  return w.service.readiness.filter((r) => r.state === 'ready').at(-1)
}
const journalFile = (w) => join(w.layout.dshHome, 'sophia-bridge', `sophia-${w.attemptId}.jsonl`)

test('G3: create records the attempt\'s identity before the native create and joins the role\'s preset', async (t) => {
  const w = await presetWorld(t)
  await w.start()
  await createReview(w)
  const state = await inspect(w)
  assert.equal(state.composedPreset, REVIEW, 'the live Agent joined the role preset through the registry')
  assert.equal(state.identity.runtimeUnitId, unit.id)
  assert.equal(state.identity.preset.id, REVIEW)
  assert.match(state.identity.preset.digest, /^sha256:[0-9a-f]{64}$/)
  assert.deepEqual(state.identity.route, { provider: 'mock', model: 'mock-model', reasoningEffort: null })
  const journal = w.journal()
  const identityAt = journal.findIndex((r) => r.type === 'sophia/identity')
  assert.equal(journal[identityAt].data.source, 'create')
  assert.ok(identityAt < journal.findIndex((r) => r.type === 'sophia/command'), 'the identity is journaled before the command acts')
})

test('M02-T08: a resume restores the recorded route and preset although the default model changed', async (t) => {
  const w = await presetWorld(t)
  await w.start()
  await createReview(w)
  const before = await inspect(w)
  route.defaultModel = 'mock-model-2'
  const report = await restart(w)
  assert.deepEqual(report.unrecovered, [])
  const input = w.send(w.cmd('input', { text: 'AFTER-RESTART' }))
  await w.service.waitForReceipt(input.commandId, 'incorporation_observed')
  await w.service.waitFor(() => w.turnEnds().length >= 2, 20000, 'the resumed turn')
  assert.equal(w.llm.requests.at(-1).model, 'mock-model', 'the attempt stays on the model it was created on')
  const after = await inspect(w)
  assert.deepEqual(after.identity, before.identity)
  assert.equal(after.composedPreset, REVIEW, 'the resumed Agent joined the same preset')
  // A new attempt takes the new default: only creation reads it.
  w.send(command('create', { attemptId: `${w.attemptId}-b`, runtimeUnitId: unit.id, role: REVIEW, text: 'Second attempt.' }))
  await w.service.waitFor(() => w.llm.requests.some((r) => r.model === 'mock-model-2'), 20000, 'the new attempt on the new default')
})

test('M02-T08: a preset whose definition changed is held after restart, never resumed under the new composition', async (t) => {
  const w = await presetWorld(t)
  await w.start()
  await createReview(w)
  const calls = w.llm.requests.length
  route.presetOverlay = SYNTHETIC
  const report = await restart(w)
  assert.deepEqual(report.unrecovered.map((u) => u.attemptId), [w.attemptId])
  assert.match(report.unrecovered[0].reason, /native preset sophia-review-v1 \(sha256:[0-9a-f]+\).*never resumes under a different composition/)
  const input = w.send(w.cmd('input', { text: 'UNDER-CHANGED-PRESET' }))
  assert.match((await w.service.waitForReceipt(input.commandId)).reason, /not recovered after restart/)
  await sleep(500)
  assert.equal(w.llm.requests.length, calls, 'no model call under the changed composition')
  // Held, not lost: the recorded definition back, the attempt resumes.
  route.presetOverlay = ''
  const again = await restart(w)
  assert.deepEqual(again.unrecovered, [])
  assert.equal((await inspect(w)).composedPreset, REVIEW)
})

test('M02-T08: a preset this unit no longer defines is held; no default preset is substituted', async (t) => {
  const w = await presetWorld(t)
  await w.start()
  await createReview(w)
  route.presetOverlay = DROPPED
  const report = await restart(w)
  assert.deepEqual(report.unrecovered.map((u) => u.attemptId), [w.attemptId])
  assert.match(report.unrecovered[0].reason, /native preset sophia-review-v1 is not defined in this runtime unit/)
  // A new attempt under the dropped role is refused before anything is created.
  const create = w.send(command('create', { attemptId: `${w.attemptId}-b`, runtimeUnitId: unit.id, role: REVIEW, text: 'x' }))
  const refused = await w.service.waitForReceipt(create.commandId)
  assert.equal(refused.stage, 'rejected')
  assert.match(refused.reason, /native preset sophia-review-v1 is not defined/)
  await sleep(500)
  assert.equal(w.llm.requests.length, 1, 'only the first attempt\'s turn reached the model')
})

test('G3: the strict synthetic preset is mounted by the registry and joined on create and resume (test composition only)', async (t) => {
  const w = await presetWorld(t)
  route.presetOverlay = SYNTHETIC
  await w.start()
  assert.match(w.stderr(), /\[sophia-test-inert-preset\] mounted synthetic-review/)
  await createReview(w)
  const created = await inspect(w)
  assert.equal(created.composedPreset, REVIEW)
  const report = await restart(w)
  assert.deepEqual(report.unrecovered, [])
  const resumed = await inspect(w)
  assert.equal(resumed.composedPreset, REVIEW)
  assert.deepEqual(resumed.identity, created.identity)
})

test('M02-T08: an attempt from a unit before identities resumes only on the route its own log records, and is marked migrated', async (t) => {
  const w = await presetWorld(t)
  await w.start()
  await createReview(w)
  await w.stop()
  const strip = () => writeFileSync(journalFile(w), `${readFileSync(journalFile(w), 'utf8').trim().split('\n').filter((line) => JSON.parse(line).type !== 'sophia/identity').join('\n')}\n`)
  // As sophia-runtime-s1-03-dev leaves it: no identity record.
  strip()
  held(w)
  // The default moved: the session's recorded route disagrees, so it is held.
  route.defaultModel = 'mock-model-2'
  await w.start()
  const moved = w.service.readiness.filter((r) => r.state === 'ready').at(-1)
  assert.match(moved.unrecovered.find((u) => u.attemptId === w.attemptId)?.reason ?? '', /last ran on mock\/mock-model\/default, not the attempt's mock\/mock-model-2\/default/)
  assert.ok(!w.journal().some((r) => r.type === 'sophia/identity'), 'nothing is recorded for a refused migration')
  // The default agrees with the recorded route: resumed, and the identity is recorded as migrated with its evidence.
  route.defaultModel = 'mock-model'
  const report = await restart(w)
  assert.deepEqual(report.unrecovered, [])
  const migrated = w.journal().find((r) => r.type === 'sophia/identity')
  assert.equal(migrated.data.source, 'migrated')
  assert.equal(migrated.data.evidence, 'native request/header mock/mock-model/default')
  assert.deepEqual(migrated.data.route, { provider: 'mock', model: 'mock-model', reasoningEffort: null })
})
