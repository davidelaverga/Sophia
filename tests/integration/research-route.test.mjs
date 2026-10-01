/**
 * SMC-M03 S2: the research route, end to end through the real runtime.
 *
 * The unit's real `openai-research` route (the bundle's own `llm-pi-ai` entry for gpt-6.1-sol, only pointed at a local
 * Responses stub with a dummy key) runs a research role's create and a second turn. Every request must carry the
 * route the unit records and the cache shape decided for it, and its usage must reach the service with the cache counters: medium reasoning, `prompt_cache_key` equal to the native
 * session id and nothing else about caching, the 16000-token output cap, `strict: false` on every tool, and only the
 * role's tools. The attempt records the route in its identity, and a create that names another route is refused.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'
import { suite, unit } from '../support/harness.mjs'
import { researchRouteOverlay, startMockResponses } from '../support/mock-responses.mjs'

const DUMMY_KEY = 'sk-sophia-research-route-dummy'
const bundlePatch = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8')
const route = unit.model_routes['research-sol-medium-v1']
const model = { start: startMockResponses, overlay: (baseURL) => researchRouteOverlay(bundlePatch, baseURL), env: { OPENAI_RESEARCH_API_KEY: DUMMY_KEY } }

const { world, cleanup } = suite('sophia-research-route', { model })
after(cleanup)

test('a research role runs on the recorded research route with the decided cache shape', async (t) => {
  const w = await world(t)
  await w.start()
  // The second answer reports a cache hit and a cache write, as the live route is expected to from turn 2 (live checklist).
  const cachedTurn = { input_tokens: 1500, output_tokens: 20, total_tokens: 1520, input_tokens_details: { cached_tokens: 1200, cache_write_tokens: 100 } }
  w.llm.script({ text: 'Here is what I found.' }, { text: 'You are welcome.', usage: cachedTurn })
  w.send(w.cmd('create', { text: 'Which hosts can render PDFs with the sandbox on?', role: 'sophia-research-md-v1', route: 'research-sol-medium-v1' }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the first turn')
  w.send(w.cmd('input', { text: 'Thanks.' }))
  await w.service.waitFor(() => w.turnEnds().length >= 2, 60000, 'the second turn')
  assert.deepEqual(w.turnEnds().map((e) => e.data.reason.kind), ['completed', 'completed'])

  const sessionId = `sophia-${w.attemptId}`
  assert.equal(w.llm.requests.length, 2)
  for (const request of w.llm.requests) {
    const { body } = request
    assert.equal(request.url, '/v1/responses')
    assert.equal(request.headers.authorization, `Bearer ${DUMMY_KEY}`, 'the research key, by reference')
    assert.equal(body.model, route.model)
    assert.deepEqual(body.reasoning, { effort: route.reasoningEffort, summary: 'auto' })
    assert.deepEqual(body.include, ['reasoning.encrypted_content'])
    assert.equal(body.prompt_cache_key, sessionId, 'the cache key is the native session id')
    assert.equal('prompt_cache_retention' in body, false, 'never a retention field: these models refuse it')
    assert.equal('prompt_cache_options' in body, false)
    assert.equal(body.max_output_tokens, route.maxTokens)
    assert.equal(body.store, false)
    // The role's tools that exist (S4 part 2 registers the research tools in the research agent's own scope).
    assert.deepEqual(body.tools.map((tool) => tool.name).toSorted(), ['research_read_context', 'research_read_source', 'research_search', 'research_write_draft', 'todo_write'], 'only the role\'s tools are offered')
    for (const tool of body.tools) assert.equal(tool.strict, false, `${tool.name} carries strict: false`)
  }
  const [first, second] = w.llm.requests
  assert.deepEqual(second.body.instructions ?? null, first.body.instructions ?? null, 'the instructions prefix is stable across turns')
  assert.deepEqual(second.body.tools, first.body.tools, 'the tool prefix is stable across turns')

  // Usage reaches the service with the cache counters, input counted without them (dsh's disjoint counts). The adapter
  // omits a zero counter, so the first turn carries none.
  const usage = w.sessionEvents('assistant/message').map(({ data }) => [data.provider, data.model, data.inputTokens, data.outputTokens, data.cacheReadTokens, data.cacheWriteTokens])
  assert.deepEqual(usage, [
    ['openai-research', route.model, 1, 1, undefined, undefined],
    ['openai-research', route.model, 200, 20, 1200, 100],
  ])

  const identity = w.journal().find((entry) => entry.type === 'sophia/identity')
  assert.deepEqual(identity?.data?.route, { provider: route.provider, model: route.model, reasoningEffort: route.reasoningEffort })
})

test('a create that names another route than the role\'s is refused before any session exists', async (t) => {
  const w = await world(t)
  await w.start()
  const create = w.send(w.cmd('create', { text: 'Research it.', role: 'sophia-research-md-v1', route: 'default' }))
  const receipt = await w.service.waitForReceipt(create.commandId, 'rejected', 30000)
  assert.match(receipt.reason, /runs on route research-sol-medium-v1 in this runtime unit; the command names default/)
  assert.equal(w.llm.requests.length, 0)
  assert.deepEqual(w.journal(), [])
})
