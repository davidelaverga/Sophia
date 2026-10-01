/**
 * SMC-M03 S4 part 2: the research tools and the model-call meter, end to end through the real runtime.
 *
 * The unit's research route (pointed at a local Responses stub with a dummy key) runs a research role whose scripted
 * model calls the research tools. The labelled fixture service answers the runtime research operations. What is
 * checked: the hello advertises the research roles with their route and preset digest; the tools exist in the
 * research agent and reach the service for the attempt's own session; every model call is reserved before it leaves
 * and settled from its usage; and a call the allowance refuses never reaches the model provider and is journaled.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'
import { suite, unit } from '../support/harness.mjs'
import { researchRouteOverlay, startMockResponses } from '../support/mock-responses.mjs'

const bundlePatch = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8')
const route = unit.model_routes['research-sol-medium-v1']
const model = { start: startMockResponses, overlay: (baseURL) => researchRouteOverlay(bundlePatch, baseURL), env: { OPENAI_RESEARCH_API_KEY: 'sk-sophia-research-tools-dummy' } }

const { world, cleanup } = suite('sophia-research-tools', { model })
after(cleanup)

const create = (w) => w.cmd('create', { text: 'Which hosts render PDFs in a sandbox?', role: 'sophia-research-md-v1', route: 'research-sol-medium-v1' })

test('a research attempt reads its task, writes a draft and pays for each model call from its allowance', async (t) => {
  const w = await world(t)
  await w.start()
  const [hello] = w.service.hellos
  assert.deepEqual(
    hello.roles.map((r) => [r.id, r.route]),
    [['sophia-research-md-v1', 'research-sol-medium-v1'], ['sophia-research-pdf-v1', 'research-sol-medium-v1']],
    'the hello advertises the research roles and their route',
  )
  for (const role of hello.roles) assert.match(role.presetDigest, /^sha256:[0-9a-f]{64}$/)

  w.llm.script(
    { toolCall: { name: 'research_read_context', arguments: {} } },
    { toolCall: { name: 'research_write_draft', arguments: { text: '# Draft\nNothing found yet.', expectedSha256: null } } },
    {
      toolCall: {
        name: 'research_submit_result',
        arguments: {
          draftSha256: 'b'.repeat(64), title: 'Sandboxed PDF hosts', summary: 'Which hosts render PDFs in a sandbox.',
          resultSummary: 'None found yet.', limitations: ['No source read.'], citations: ['00000000-0000-4000-8000-000000000001'],
        },
      },
    },
    { text: 'Submitted.' },
  )
  w.send(create(w))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the research turn')
  assert.deepEqual(w.turnEnds().map((e) => e.data.reason.kind), ['completed'])

  const session = `sophia-${w.attemptId}`
  const ops = w.service.research
  for (const { body } of ops) assert.deepEqual([body.attemptId, body.nativeSessionId], [w.attemptId, session], 'every operation names its own session')
  assert.deepEqual(
    ops.filter((o) => ['context', 'draft', 'submit'].includes(o.op)).map((o) => o.op),
    ['context', 'draft', 'submit'],
  )
  assert.equal(ops.find((o) => o.op === 'draft').body.text, '# Draft\nNothing found yet.')
  const submitted = ops.find((o) => o.op === 'submit').body
  assert.deepEqual([submitted.result.draftSha256, submitted.result.citations, 'blocker' in submitted], ['b'.repeat(64), ['00000000-0000-4000-8000-000000000001'], false])

  // The research section is in the system prompt (the Responses API's developer message) of every request, the same
  // each time: a stable cached prefix.
  const system = (request) => request.body.input.find((item) => item.role === 'developer')?.content ?? ''
  for (const request of w.llm.requests) assert.match(system(request), /# Research worker[\s\S]*## Markdown report/)
  assert.equal(new Set(w.llm.requests.map(system)).size, 1)

  // Four model calls, each reserved before it left and settled from its usage, in order.
  const meter = ops.filter((o) => (o.op === 'reserve' && o.body.kind === 'model') || o.op === 'settle')
  assert.deepEqual(meter.map((o) => o.op), ['reserve', 'settle', 'reserve', 'settle', 'reserve', 'settle', 'reserve', 'settle'])
  assert.equal(w.llm.requests.length, 4)
  for (const { body } of meter.filter((o) => o.op === 'reserve')) {
    assert.deepEqual([body.provider, body.purpose], [route.provider, 'call'])
    assert.ok(body.amountUsd >= (route.maxTokens * route.prices.output) / 1e6, 'the whole output ceiling is reserved')
  }
  for (const { body } of meter.filter((o) => o.op === 'settle')) {
    assert.equal(body.outcome, 'settled')
    assert.equal(body.costUsd, (1 * route.prices.input + 1 * route.prices.output) / 1e6, 'priced from the reported usage')
  }
})

test('a model call the allowance refuses never reaches the provider, and the refusal is journaled', async (t) => {
  const w = await world(t)
  await w.start()
  w.service.onResearch('reserve', () => ({ status: 409, body: { code: 'research_limit_reached', message: 'Research allowance exhausted', requestId: '00000000-0000-4000-8000-000000000000', retry: 'never' } }))
  w.send(create(w))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the refused turn')
  assert.equal(w.llm.requests.length, 0, 'nothing reached the model provider')
  const refused = w.journal().filter((e) => e.type === 'sophia/spend-refused')
  assert.equal(refused.length >= 1, true)
  assert.match(refused[0].data.reason, /research_limit_reached/)
  assert.equal(w.service.research.some((o) => o.op === 'settle'), false, 'nothing was reserved, so nothing settles')
})

test('when ordinary calls no longer fit, the call that writes the partial result draws on the headroom', async (t) => {
  const w = await world(t)
  await w.start()
  w.service.onResearch('reserve', (body) =>
    body.purpose === 'partial_result'
      ? { reservationId: '00000000-0000-4000-8000-000000009999', state: 'reserved', kind: 'model', purpose: 'partial_result', amountUsd: body.amountUsd, target: null }
      : { status: 409, body: { code: 'research_limit_reached', message: 'Research allowance exhausted', requestId: '00000000-0000-4000-8000-000000000000', retry: 'never' } })
  w.llm.script({ text: 'Here is what I have so far.' })
  w.send(create(w))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the finalizing turn')
  assert.equal(w.llm.requests.length, 1, 'the call went out on the headroom')
  assert.deepEqual(
    w.service.research.filter((o) => o.op === 'reserve').map((o) => o.body.purpose),
    ['call', 'partial_result'],
  )
  assert.equal(w.service.research.find((o) => o.op === 'settle').body.reservationId, '00000000-0000-4000-8000-000000009999')
})

