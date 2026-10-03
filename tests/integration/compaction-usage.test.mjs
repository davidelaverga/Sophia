/**
 * SMC-M03 S2: compaction on a bound attempt. Its model call stays on the attempt's route (the route guard lets it
 * through: it names the session's route and no effort), and its usage reaches the service as a `compaction/summary`
 * observation, so the attempt's spend counts it. A test-only policy gives the mock's 32768-token window a 16384-token
 * threshold. Compaction prices the latest request, so two long inputs make it run before the third turn's first step.
 */

import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { stringify } from 'yaml'
import { MOCK_MODEL, suite, unit } from '../support/harness.mjs'

/** The usual mock overlay, plus a compaction policy small enough for the mock's 32768-token window (tests only). */
const model = {
  ...MOCK_MODEL,
  overlay: (baseURL) => {
    const policy = { provider: 'mock', model: 'mock-model', thresholdRatio: 0.5, headroomTokens: 1000, maxTokens: 1000 }
    const compaction = { ...unit.compaction, modelPolicies: [...unit.compaction.modelPolicies, policy] }
    return `${MOCK_MODEL.overlay(baseURL)}${stringify([{ id: 'compaction-basic', config: compaction }])}`
  },
}

const { world, cleanup } = suite('sophia-compaction-usage', { model })
after(cleanup)

test('a compaction call passes the route guard and reports its usage to the service', async (t) => {
  const w = await world(t)
  w.llm.script({ text: 'first answer' }, { text: 'second answer' }, { text: 'summary of the work' }, { text: 'third answer' })
  await w.start()
  const long = (tag) => Array.from({ length: 600 }, (_, i) => `${tag} line ${i}: the sandbox renders this page with its fonts embedded.`).join('\n')
  w.send(w.cmd('create', { role: 'sophia-research-v1', text: long('First') }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the first turn')
  w.send(w.cmd('input', { text: long('Second') }))
  await w.service.waitFor(() => w.turnEnds().length >= 2, 60000, 'the second turn')
  w.send(w.cmd('input', { text: 'Where are we?' }))
  await w.service.waitFor(() => w.turnEnds().length >= 3, 60000, 'the third turn')
  assert.deepEqual(w.turnEnds().map((e) => e.data.reason.kind), ['completed', 'completed', 'completed'])
  assert.equal(w.llm.requests.length, 4, 'three turns and one compaction call')
  assert.deepEqual(w.llm.requests.map((r) => r.model), ['mock-model', 'mock-model', 'mock-model', 'mock-model'])
  assert.deepEqual(w.journal().filter((e) => e.type === 'sophia/route-refused'), [], 'the compaction call was not refused')
  const summaries = w.sessionEvents('compaction/summary')
  assert.equal(summaries.length, 1)
  const [{ data }] = summaries
  assert.equal(typeof data.compactionId, 'string')
  assert.deepEqual({ ...data, compactionId: null }, { compactionId: null, provider: 'mock', model: 'mock-model', inputTokens: 1, outputTokens: 1 }, 'who made the call and what it cost, never the summary text')
})
