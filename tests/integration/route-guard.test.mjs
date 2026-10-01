/**
 * SMC-M03 S2c: a bound attempt's model calls stay on the route its identity recorded, including the calls made by
 * child agents a `workflow` program spawns. The mock provider here offers a second model, so a child that names it
 * would reach the mock if nothing stopped it: the bridge's `llm/stream` guard must refuse that call before any request
 * leaves and journal it on the attempt, while a child that keeps the parent's route runs normally.
 */

import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { MOCK_MODEL, sleep, suite } from '../support/harness.mjs'

/** The usual mock overlay, with a second model the mock would answer for. */
const WIDE = 'mock-model-wide'
const model = {
  ...MOCK_MODEL,
  overlay: (baseURL) => {
    const overlay = MOCK_MODEL.overlay(baseURL)
    const entry = '          - id: mock-model\n            contextWindow: 32768\n            maxTokens: 4096\n            reasoningEfforts: false\n'
    if (!overlay.includes(entry)) throw new Error('the mock overlay no longer declares mock-model as expected')
    return overlay.replace(entry, entry + entry.replace('mock-model', WIDE))
  },
}

const { world, cleanup } = suite('sophia-route-guard', { model })
after(cleanup)

const toolResults = (w) => w.llm.requests.flatMap((r) => r.messages.filter((m) => m.role === 'tool').map((m) => String(m.content))).join('\n')

test('adverse: a workflow child that names another model is refused before any request; one on the route runs', async (t) => {
  const w = await world(t)
  const script = [
    "const kept = await agent('Answer briefly.')",
    'let widened',
    `try { widened = await agent('Answer on the wider model.', { provider: 'mock', model: '${WIDE}' }) } catch (err) { widened = String(err) }`,
    'return { kept, widened }',
  ].join('\n')
  w.llm.script(
    // 1. the research agent starts a workflow program with two children
    { toolCall: { name: 'workflow', arguments: { meta: { name: 'routes', description: 'Two children, two routes.' }, script } } },
    // 2. the child on the parent's route answers; the other child never reaches the model
    { text: 'kept child done' },
    // 3. the parent finishes after the workflow result
    { text: 'parent done' },
  )
  await w.start()
  const create = w.send(w.cmd('create', { role: 'sophia-research-v1', text: 'Use a workflow.' }))
  await w.service.waitForReceipt(create.commandId, 'incorporation_observed')
  await w.service.waitFor(() => w.llm.requests.length >= 3, 30000, 'the workflow round trip')
  await w.service.waitFor(() => w.turnEnds().length >= 1, 30000, 'the parent turn end')
  await sleep(500)
  assert.deepEqual(w.llm.requests.map((r) => r.model), ['mock-model', 'mock-model', 'mock-model'], 'no request named the wider model')
  assert.match(toolResults(w), /"kept": "kept child done"/)
  assert.match(toolResults(w), /"widened": null/, 'the refused child returns no answer')
  const refused = w.journal().filter((entry) => entry.type === 'sophia/route-refused')
  assert.equal(refused.length, 1, 'one refusal, journaled on the parent attempt')
  const [{ data }] = refused
  assert.equal(data.attemptId, w.attemptId)
  assert.notEqual(data.sessionId, `sophia-${w.attemptId}`, 'the refused call was the child\'s, not the parent\'s')
  assert.deepEqual(data.requested, { provider: 'mock', model: WIDE, reasoningEffort: null })
  assert.match(data.reason, /runs on mock\/mock-model\/default; a model call for mock\/mock-model-wide\/default is refused/)
})
