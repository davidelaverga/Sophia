/**
 * SMC-M03 S2: the research route, end to end through the real runtime.
 *
 * The unit's real `openai-research` route (the bundle's own `llm-pi-ai` entry for gpt-6.1-sol, only pointed at a local
 * Responses stub with a dummy key) runs a research role's create and a second turn. Every request must carry the
 * route the unit records and the cache shape decided for it, and its usage must reach the service with the cache counters: medium reasoning, `prompt_cache_key` equal to the native
 * session id and nothing else about caching, the 16000-token output cap, `strict: false` on every tool, and only the
 * role's tools. The attempt records the route in its identity, and a create that names another route is refused.
 *
 * Usage is synthetic: the stub reports what each test scripts, and nothing here is a live provider claim. A complete
 * report (input, output and cached input, INC04-S03A-R07-C1P D-C1P-1) reaches the service and settles at its price,
 * cache hit included. A positive `cache_write_tokens` is an extension the pinned Responses contract does not qualify,
 * so that call's usage is reported nowhere and its settlement is uncertain, paired with a complete turn in the same
 * session so that refusing every usage cannot pass. The service here is the labelled fixture: these tests see the
 * settle request the runtime sends, not a database reservation. The PostgreSQL consequence of an uncertain settlement
 * is crossed in tests/integration/usage-provenance.test.mjs.
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

// The research meter's calls in order (each model call reserves, then settles), and a call's price as the runtime
// computes it: per million tokens, rounded to the micro-dollar.
const meterOf = (w) => {
  const ops = w.service.research.filter((o) => (o.op === 'reserve' && o.body.kind === 'model') || o.op === 'settle')
  assert.deepEqual(ops.map((o) => o.op), ops.flatMap((_, i) => (i % 2 === 0 ? ['reserve'] : ['settle'])), 'every call is reserved before it is settled')
  return ops.filter((o) => o.op === 'settle')
}
const priced = (input, cacheRead, output) => Number(((input * route.prices.input + cacheRead * route.prices.cacheRead + output * route.prices.output) / 1e6).toFixed(6))

test('a research role runs on the recorded research route with the decided cache shape', async (t) => {
  const w = await world(t)
  await w.start()
  // The second answer reports a cache hit: 1200 of its 1500 input tokens were read from the prompt cache, with no
  // cache-write extension. Synthetic values; no live provider behaviour is claimed.
  const cachedTurn = { input_tokens: 1500, output_tokens: 20, total_tokens: 1520, input_tokens_details: { cached_tokens: 1200 } }
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
    assert.deepEqual(body.tools.map((tool) => tool.name).toSorted(), ['research_read_context', 'research_read_source', 'research_report_blocker', 'research_search', 'research_submit_result', 'research_write_draft', 'todo_write'], 'only the role\'s tools are offered')
    for (const tool of body.tools) assert.equal(tool.strict, false, `${tool.name} carries strict: false`)
  }
  const [first, second] = w.llm.requests
  assert.deepEqual(second.body.instructions ?? null, first.body.instructions ?? null, 'the instructions prefix is stable across turns')
  assert.deepEqual(second.body.tools, first.body.tools, 'the tool prefix is stable across turns')

  // Usage reaches the service with the cache counters, input counted without them (dsh's disjoint counts). The adapter
  // omits a zero counter, so the first turn carries none, and no turn carries a cache write.
  const usage = w.sessionEvents('assistant/message').map(({ data }) => [data.provider, data.model, data.inputTokens, data.outputTokens, data.cacheReadTokens, data.cacheWriteTokens])
  assert.deepEqual(usage, [
    ['openai-research', route.model, 1, 1, undefined, undefined],
    ['openai-research', route.model, 300, 20, 1200, undefined],
  ])

  // Both calls were reserved before they left and settled at the price of what they reported, cache read included.
  const settles = meterOf(w)
  assert.deepEqual(settles.map(({ body }) => [body.outcome, body.usage]), [
    ['settled', { inputTokens: 1, outputTokens: 1, provider: route.provider, model: route.model }],
    ['settled', { inputTokens: 300, outputTokens: 20, cacheReadTokens: 1200, provider: route.provider, model: route.model }],
  ])
  assert.deepEqual(settles.map(({ body }) => body.costUsd), [priced(1, 0, 1), priced(300, 1200, 20)])

  const identity = w.journal().find((entry) => entry.type === 'sophia/identity')
  assert.deepEqual(identity?.data?.route, { provider: route.provider, model: route.model, reasoningEffort: route.reasoningEffort })
})

test('an unqualified cache-write extension is reported nowhere and its call settles uncertain, beside a complete turn', async (t) => {
  const w = await world(t)
  await w.start()
  // Turn 1 reports complete usage (the stub's default 1/1). Turn 2 carries a synthetic positive cache_write_tokens on
  // top of the same counts as the cache hit above: an extension the pinned contract does not qualify, so its usage is
  // unknown. It is neither priced, nor zero-filled, nor reported without the write.
  const extendedTurn = { input_tokens: 1500, output_tokens: 20, total_tokens: 1520, input_tokens_details: { cached_tokens: 1200, cache_write_tokens: 100 } }
  w.llm.script({ text: 'Here is what I found.' }, { text: 'You are welcome.', usage: extendedTurn })
  w.send(w.cmd('create', { text: 'Which hosts can render PDFs with the sandbox on?', role: 'sophia-research-md-v1', route: 'research-sol-medium-v1' }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the first turn')
  w.send(w.cmd('input', { text: 'Thanks.' }))
  await w.service.waitFor(() => w.turnEnds().length >= 2, 60000, 'the second turn')
  assert.deepEqual(w.turnEnds().map((e) => e.data.reason.kind), ['completed', 'completed'])
  assert.equal(w.llm.requests.length, 2)
  for (const { body } of w.llm.requests) assert.equal(body.model, route.model)

  const usage = w.sessionEvents('assistant/message').map(({ data }) => [data.provider, data.model, data.inputTokens, data.outputTokens, data.cacheReadTokens, data.cacheWriteTokens])
  assert.deepEqual(usage, [
    ['openai-research', route.model, 1, 1, undefined, undefined],
    ['openai-research', route.model, null, null, undefined, undefined],
  ], 'the extended call reports no counts at all')

  // The extended call was reserved before it left, like the first, and its settle request says uncertain with no cost
  // and no usage (what the labelled fixture service receives; no database reservation exists in this suite).
  const settles = meterOf(w)
  assert.deepEqual(settles.map(({ body }) => body.outcome), ['settled', 'uncertain'])
  assert.equal(settles[0].body.costUsd, priced(1, 0, 1))
  assert.equal('costUsd' in settles[1].body, false, 'no cost, not even zero')
  assert.equal('usage' in settles[1].body, false, 'no usage, not even zeros')
  const ids = settles.map(({ body }) => body.reservationId)
  assert.equal(new Set(ids).size, 2, 'each settle closes its own reservation')
  for (const id of ids) assert.match(id, /^[0-9a-f-]{36}$/)
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
