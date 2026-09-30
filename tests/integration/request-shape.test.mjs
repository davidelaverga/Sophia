/**
 * SMC-M02 R1: request-shape parity of the recorded model route.
 *
 * The unit's real openai route (the bundle's own `llm-pi-ai` config, only
 * pointed at a local Responses stub with a dummy key; `agent-default-model`
 * untouched, so openai / gpt-6-luna / high) runs one fixed episode: a
 * research-role turn that calls a tool while a steer arrives, then a second
 * turn. Every request must have exactly the route shape the previous unit
 * (sophia-runtime-s1-03-dev, dsh 0.1.7-rc.1, pi-ai 0.85.1) sent for the same
 * episode, recorded in tests/support/request-shape.expected.json. Model-facing
 * text that dsh authors is masked here and reported in
 * docs/evidence/SMC-M02/request-shape/; see tests/support/request-shape.mjs.
 *
 * SOPHIA_REQUEST_SHAPE_OUT=<file> also writes the episode's shapes and text
 * digests, which is how the expectation and the evidence were produced.
 */

import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'
import { suite, unit } from '../support/harness.mjs'
import { recordedRouteOverlay, startMockResponses } from '../support/mock-responses.mjs'
import { requestShape, requestTexts } from '../support/request-shape.mjs'

const DUMMY_KEY = 'sk-sophia-request-shape-dummy'
const bundlePatch = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8')
const model = { start: startMockResponses, overlay: (baseURL) => recordedRouteOverlay(bundlePatch, baseURL), env: { OPENAI_API_KEY: DUMMY_KEY } }
const expected = JSON.parse(readFileSync(new URL('../support/request-shape.expected.json', import.meta.url), 'utf8'))

const { world, cleanup } = suite('sophia-request-shape', { model })
after(cleanup)

test('R1: the recorded openai route sends the previous unit\'s request shape for a tool call, a steer and a second turn', async (t) => {
  const w = await world(t)
  await w.start()
  w.llm.script({ toolCall: { name: 'glob', arguments: { pattern: '*.md' } }, delayMs: 1500 }, { text: 'No notes yet.' }, { text: 'You are welcome.' })
  w.send(w.cmd('create', { text: 'Look for notes in the workspace.', role: 'sophia-research-v1' }))
  await w.service.waitFor(() => w.llm.requests.length >= 1, 60000, 'the first request')
  w.send(w.cmd('steer', { text: 'Also mention the count.' }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the first turn')
  w.send(w.cmd('input', { text: 'Thanks.' }))
  await w.service.waitFor(() => w.turnEnds().length >= 2, 60000, 'the second turn')
  assert.deepEqual(w.turnEnds().map((e) => e.data.reason.kind), ['completed', 'completed'])

  const sessionId = `sophia-${w.attemptId}`
  const shapes = w.llm.requests.map((request) => requestShape(request, { sessionId, dummyKey: DUMMY_KEY }))
  if (process.env.SOPHIA_REQUEST_SHAPE_OUT) {
    writeFileSync(process.env.SOPHIA_REQUEST_SHAPE_OUT, `${JSON.stringify({ unit: unit.id, dsh: unit.dsh.package_version, shapes, texts: w.llm.requests.map(requestTexts) }, null, 2)}\n`)
  }

  // The episode reached the stub over the recorded route: model, effort, credential reference.
  for (const request of w.llm.requests) {
    assert.equal(request.url, '/v1/responses')
    assert.equal(request.body.model, unit.model_route.model)
    assert.equal(request.body.reasoning?.effort, unit.model_route.reasoningEffort)
    assert.equal(request.headers['user-agent'], `deepseek-harness/${unit.dsh.package_version} (+https://github.com/deepseek-ai/deepseek-harness)`)
  }
  assert.equal(shapes.length, expected.shapes.length, 'the same number of model requests')
  shapes.forEach((shape, index) => assert.deepEqual(shape, expected.shapes[index], `request ${index} has the previous unit's route shape`))
})
