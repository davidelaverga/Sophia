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
  w.llm.script({ text: 'Here is what I have so far.' }, { text: 'That is all I can write up.' })
  w.send(create(w))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the finalizing turn')
  // The call went out on the headroom; the finalize notice (a steer) then runs one more step, also on the headroom.
  assert.equal(w.llm.requests.length, 2)
  assert.deepEqual(
    w.service.research.filter((o) => o.op === 'reserve').map((o) => o.body.purpose),
    ['call', 'partial_result', 'partial_result'],
  )
  for (const settle of w.service.research.filter((o) => o.op === 'settle')) {
    assert.equal(settle.body.reservationId, '00000000-0000-4000-8000-000000009999')
  }
})


test('a spent allowance enters the finalize step: ordinary research is refused and the model is told to write up (M03-RF-0011)', async (t) => {
  const w = await world(t)
  await w.start()
  w.service.onResearch('reserve', (body) =>
    body.purpose === 'partial_result'
      ? { reservationId: '00000000-0000-4000-8000-000000009999', state: 'reserved', kind: 'model', purpose: 'partial_result', amountUsd: body.amountUsd, target: null }
      : { status: 409, body: { code: 'research_limit_reached', message: 'Research allowance exhausted', requestId: '00000000-0000-4000-8000-000000000000', retry: 'never' } })
  // Codex's probe: the first call on the headroom asks for more research; the step must not carry on as before.
  w.llm.script(
    { toolCall: { name: 'research_search', arguments: { query: 'sandboxed PDF rendering hosts' } } },
    { toolCall: { name: 'research_write_draft', arguments: { text: '# Partial\nTwo hosts so far.', expectedSha256: null } } },
    {
      toolCall: {
        name: 'research_submit_result',
        arguments: {
          draftSha256: 'b'.repeat(64), title: 'Sandboxed PDF hosts', summary: 'A partial answer.', resultSummary: 'Two hosts so far.',
          limitations: ['The allowance ran out before a full survey.'], citations: ['00000000-0000-4000-8000-000000000001'],
        },
      },
    },
    { text: 'Submitted the partial result.' },
  )
  w.send(create(w))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the finalizing turn')
  const reserves = w.service.research.filter((o) => o.op === 'reserve')
  assert.deepEqual(
    reserves.map((o) => [o.body.kind, o.body.purpose]),
    [['model', 'call'], ['model', 'partial_result'], ['model', 'partial_result'], ['model', 'partial_result'], ['model', 'partial_result']],
    'one ordinary call refused, then only partial-result calls: no ordinary retry, no search reserved',
  )
  assert.equal(w.journal().filter((e) => e.type === 'sophia/finalize').length, 1, 'the step is entered once')
  const [, second] = w.llm.requests
  const sent = JSON.stringify(second.body.input)
  assert.match(sent, /spent its allowance: only research_read_context, research_write_draft, research_submit_result, research_report_blocker may run now/, 'the search was refused by the guard')
  assert.match(sent, /this research has spent its allowance\. Write up what you have now/, 'the model was told to write up')
  assert.deepEqual(
    w.service.research.filter((o) => ['draft', 'submit'].includes(o.op)).map((o) => o.op),
    ['draft', 'submit'],
    'the finalize tools still run',
  )
})

test('a PDF attempt renders its draft, waits for the render, and publishes with its PDF (S5b)', async (t) => {
  const w = await world(t)
  await w.start()
  w.service.onResearch('render', (body) => ({ renderJobId: '00000000-0000-4000-8000-000000005002', state: 'queued', repair: 'none', layout: 'standard', draftSha256: body.draftSha256 }))
  let looks = 0
  w.service.onResearch('render-result', (body) => {
    looks += 1
    return looks === 1
      ? { renderJobId: body.renderJobId, state: 'rendering', repair: 'none', layout: 'standard', draftSha256: 'b'.repeat(64) }
      : { renderJobId: body.renderJobId, state: 'succeeded', repair: 'none', layout: 'standard', draftSha256: 'b'.repeat(64),
          pdf: { sourceId: '00000000-0000-4000-8000-000000005999', sha256: 'c'.repeat(64), bytes: 2048, pages: 2 } }
  })
  w.service.onResearch('submit', (body) => ({ taskId: '00000000-0000-4000-8000-000000000001', outcome: 'published', artifactId: '00000000-0000-4000-8000-000000004000',
    versionId: '00000000-0000-4000-8000-000000004001', versionNumber: 1, sourceId: '00000000-0000-4000-8000-000000004002', sha256: body.result.draftSha256,
    resultSourceId: '00000000-0000-4000-8000-000000004003', pdf: { state: 'produced', sourceId: '00000000-0000-4000-8000-000000005999', renderJobId: '00000000-0000-4000-8000-000000005002' } }))
  w.llm.script(
    { toolCall: { name: 'research_write_draft', arguments: { text: '# Hosts\n\n## Summary\n\nTwo hosts.', expectedSha256: null } } },
    { toolCall: { name: 'research_render_pdf', arguments: { draftSha256: 'b'.repeat(64), language: 'en' } } },
    {
      toolCall: {
        name: 'research_submit_result',
        arguments: {
          draftSha256: 'b'.repeat(64), title: 'Sandboxed PDF hosts', summary: 'Which hosts render PDFs in a sandbox.',
          resultSummary: 'Two hosts.', limitations: [], citations: ['00000000-0000-4000-8000-000000000001'],
        },
      },
    },
    { text: 'Submitted with its PDF.' },
  )
  w.send(w.cmd('create', { text: 'Which hosts render PDFs in a sandbox? As a PDF.', role: 'sophia-research-pdf-v1', route: 'research-sol-medium-v1' }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the PDF research turn')
  assert.deepEqual(w.turnEnds().map((e) => e.data.reason.kind), ['completed'])
  const ops = w.service.research.filter((o) => o.op !== 'reserve' && o.op !== 'settle')
  assert.deepEqual(ops.map((o) => o.op), ['draft', 'render', 'render-result', 'render-result', 'submit'], 'it waited for the render, then submitted')
  const render = ops[1].body
  assert.deepEqual(Object.keys(render).toSorted(), ['attemptId', 'callId', 'draftSha256', 'language', 'nativeSessionId'], 'no markup, only the draft it names')
  assert.equal(ops[2].body.renderJobId, '00000000-0000-4000-8000-000000005002', 'it looks at its own render')
  const [first, , third, fourth] = w.llm.requests
  assert.match(JSON.stringify(first.body), /## PDF report/, 'the PDF section is in a PDF specialist\'s prompt')
  assert.match(JSON.stringify(third.body.input), /The PDF is ready/, 'the model read the outcome')
  assert.match(JSON.stringify(fourth.body.input), /Its PDF is published with it/)
})

test('a Markdown attempt is offered no PDF tools and no PDF section', async (t) => {
  const w = await world(t)
  await w.start()
  w.llm.script({ toolCall: { name: 'research_render_pdf', arguments: { draftSha256: 'b'.repeat(64) } } }, { text: 'Done.' })
  w.send(create(w))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the Markdown research turn')
  const [first, second] = w.llm.requests
  assert.doesNotMatch(JSON.stringify(first.body), /## PDF report|"research_render_pdf"/, 'neither the section nor the tool')
  assert.match(JSON.stringify(second.body.input), /research_render_pdf/, 'the call was answered as an unknown tool')
  assert.equal(w.service.research.some((o) => o.op === 'render'), false, 'nothing reached the service')
})
