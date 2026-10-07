/**
 * WBC-02 G3: the source reviewer through the real runtime.
 *
 * The unit's source-review route (its provider alias pointed at a local Responses stub with a dummy key) runs
 * sophia-source-review-v1, whose scripted model calls the three review tools. The labelled fixture service answers the
 * runtime review operations. What is checked: the hello advertises the reviewer with its route and preset digest; the
 * agent is offered exactly the three review tools and the reviewer's instruction, never the research ones; every tool
 * call reaches the service for the attempt's own session; every model call is reserved through the review operations
 * before it leaves and settled from its usage; and a refused reservation refuses the call with no finalize step.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'
import { REVIEW_RECEIPT } from '../support/fixture-service.mjs'
import { suite, unit } from '../support/harness.mjs'
import { reviewRouteOverlay, startMockResponses } from '../support/mock-responses.mjs'

const bundlePatch = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8')
const route = unit.model_routes['source-review-luna-high-v1']
const model = { start: startMockResponses, overlay: (baseURL) => reviewRouteOverlay(bundlePatch, baseURL), env: { OPENAI_API_KEY: 'sk-sophia-review-tools-dummy' } }

const { world, cleanup } = suite('sophia-review-tools', { model })
after(cleanup)

const SOURCE = '00000000-0000-4000-8000-000000007002'
const create = (w) => w.cmd('create', { text: 'Source review task. Review the sources below.', role: 'sophia-source-review-v1', route: 'source-review-luna-high-v1' })
const REPORT = '## Goal\nx\n## Evidence inspected\nS1\n## Findings\n- dates\n## What remains unknown\nnone\n## Suggested next action\nnone'

test('a review attempt reads its task and source, publishes, and pays for each model call from its allowance', async (t) => {
  const w = await world(t)
  await w.start()
  const [hello] = w.service.hellos
  const reviewer = hello.roles.find((r) => r.id === 'sophia-source-review-v1')
  assert.deepEqual([reviewer?.route], ['source-review-luna-high-v1'], 'the hello advertises the reviewer and its route')
  assert.match(reviewer.presetDigest, /^sha256:[0-9a-f]{64}$/)
  assert.deepEqual(
    hello.roles.filter((r) => r.id.startsWith('sophia-research-')).map((r) => r.route),
    ['research-sol-medium-v1', 'research-sol-medium-v1'],
    'the research roles are still advertised, on their own route',
  )

  w.llm.script(
    { toolCall: { name: 'read_review_source', arguments: {} } },
    { toolCall: { name: 'read_review_source', arguments: { sourceId: SOURCE } } },
    {
      toolCall: {
        name: 'submit_source_review',
        arguments: {
          verdict: 'supported',
          report: REPORT,
          findings: [{ status: 'supported', statement: 'The date is stated.', sourceIds: [SOURCE], criterionId: 'c1' }],
          receipts: [REVIEW_RECEIPT],
        },
      },
    },
    { text: 'Published.' },
  )
  w.send(create(w))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the review turn')
  assert.deepEqual(w.turnEnds().map((e) => e.data.reason.kind), ['completed'])

  const session = `sophia-${w.attemptId}`
  const ops = w.service.review
  for (const { body } of ops) assert.deepEqual([body.attemptId, body.nativeSessionId], [w.attemptId, session], 'every operation names its own session')
  assert.deepEqual(ops.filter((o) => ['context', 'submit'].includes(o.op)).map((o) => o.op), ['context', 'context', 'submit'])
  assert.equal(ops[0].body.sourceId, undefined)
  const submitted = ops.find((o) => o.op === 'submit').body
  assert.deepEqual([submitted.result.verdict, submitted.result.findings[0].sourceIds], ['supported', [SOURCE]])
  assert.deepEqual(submitted.result.receipts, [REVIEW_RECEIPT], 'the receipt the page carried went back with the submission')
  assert.equal(w.service.research.length, 0, 'nothing went through the research operations')

  const [first] = w.llm.requests
  const offered = (first.body.tools ?? []).map((tool) => tool.name).toSorted()
  assert.deepEqual(offered, ['read_review_source', 'report_review_blocker', 'submit_source_review'], 'exactly the three review tools')
  const system = (request) => request.body.input.find((item) => item.role === 'developer')?.content ?? ''
  for (const request of w.llm.requests) {
    assert.match(system(request), /# Sophia source reviewer/)
    assert.doesNotMatch(system(request), /# Research worker/)
  }
  assert.equal(new Set(w.llm.requests.map(system)).size, 1, 'a stable cached prefix')
  assert.match(JSON.stringify(w.llm.requests[2].body.input), /trust=\\"untrusted\\"/, 'the source reached the model inside its envelope')
  assert.ok(JSON.stringify(w.llm.requests[2].body.input).includes(`receipt=\\"${REVIEW_RECEIPT}\\"`), 'and its receipt with it')

  const meter = ops.filter((o) => o.op === 'reserve' || o.op === 'settle')
  assert.deepEqual(meter.map((o) => o.op), ['reserve', 'settle', 'reserve', 'settle', 'reserve', 'settle', 'reserve', 'settle'])
  assert.equal(w.llm.requests.length, 4)
  for (const { body } of meter.filter((o) => o.op === 'reserve')) {
    assert.deepEqual([body.kind, body.provider, body.purpose], ['model', route.provider, 'call'])
    assert.ok(body.amountUsd >= (route.maxTokens * route.prices.output) / 1e6, 'the whole output ceiling is reserved')
  }
  for (const { body } of meter.filter((o) => o.op === 'settle')) {
    assert.equal(body.outcome, 'settled')
    assert.deepEqual([body.usage.provider, body.usage.model], [route.provider, route.model])
  }
  for (const request of w.llm.requests) assert.equal(request.body.max_output_tokens <= route.maxTokens, true, 'every request is under the route ceiling')
})

test('a reservation the review cannot make refuses the call, with no finalize step', async (t) => {
  const w = await world(t)
  await w.start()
  w.service.onReview('reserve', () => ({ status: 409, body: { code: 'research_limit_reached', message: 'Review model request limit reached: 8 calls', requestId: '00000000-0000-4000-8000-000000000000', retry: 'never' } }))
  w.send(create(w))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the refused turn')
  assert.equal(w.llm.requests.length, 0, 'nothing reached the model provider')
  const reserves = w.service.review.filter((o) => o.op === 'reserve')
  assert.deepEqual(reserves.map((o) => o.body.purpose), ['call'], 'no partial-result call: a review has no finalize step')
  assert.equal(w.journal().filter((e) => e.type === 'sophia/finalize').length, 0)
  const refused = w.journal().filter((e) => e.type === 'sophia/spend-refused')
  assert.match(refused[0]?.data.reason ?? '', /this review's allowance could not reserve the model call \(research_limit_reached\)/)
})
