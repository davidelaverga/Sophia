/**
 * SDD-01: the native designer and the separate visual reviewer, end to end through the real runtime.
 *
 * The unit's research route (pointed at a local Responses stub with a dummy key) runs each design role; the labelled
 * fixture service answers the runtime design and review operations with a real PNG capture. What is checked: the
 * hello advertises both roles on the image-input route; each agent is offered exactly its role's tools (the reviewer
 * no design_* tool, neither any research, workspace or host tool) and has its prompt sections and skills, in order, in
 * its system prompt; every model call is reserved and settled through the design operations; and a capture the
 * designer or the reviewer inspects reaches the model provider as an image, with the renderer's pixels and the
 * inspection's receipt in the same request. Only a submit naming that receipt acknowledges the delivery, sent again
 * unchanged when its answer is lost (SDD-01-CX-0033, CX-0035, CX-0036).
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'
import { suite } from '../support/harness.mjs'
import { researchRouteOverlay, startMockResponses } from '../support/mock-responses.mjs'

const bundlePatch = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8')
const model = { start: startMockResponses, overlay: (baseURL) => researchRouteOverlay(bundlePatch, baseURL), env: { OPENAI_RESEARCH_API_KEY: 'sk-sophia-design-tools-dummy' } }
const skills = JSON.parse(readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'skills', 'manifest.json'), 'utf8'))
const specialists = JSON.parse(readFileSync(join(REPO_ROOT, 'config', 'specialists.json'), 'utf8'))
const CAPTURE = 'w390-light.overview.1.png'
const REVISION = '00000000-0000-4000-8000-000000006300'
const RENDER = '00000000-0000-4000-8000-000000006100'
const RECEIPT = /Receipt of this inspection: (seen-[A-Za-z0-9_-]{22})\./
/** The receipt the model received in this request, as only an inspection's result carries it. */
const receiptIn = (body) => RECEIPT.exec(JSON.stringify(body.input))?.[1] ?? 'no-receipt-received'

const { world, cleanup } = suite('sophia-design-tools', { model })
after(cleanup)

const roleOf = (id) => specialists.specialists.find((s) => s.id === id)
const toolsOffered = (request) => (request.body.tools ?? []).map((t) => t.name).toSorted()
const system = (request) => JSON.stringify(request.body.input.find((item) => item.role === 'developer')?.content ?? '')

/** The first line of a bundled prompt or skill text that is a heading, to find it in the system prompt. */
function headingOf(id) {
  const file = [...skills.promptSections, ...skills.skills].find((f) => f.id === id)
  const text = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'skills', file.path), 'utf8')
  return text.split('\n').find((line) => /^#{1,2} \S/.test(line)).trim()
}

/** Every image a request carries, as the bytes the provider would receive. */
function imagesIn(request) {
  const found = []
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (!value || typeof value !== 'object') return
    if (value.type === 'input_image' && typeof value.image_url === 'string') {
      const [, mime, data] = /^data:([^;]+);base64,(.*)$/.exec(value.image_url) ?? []
      if (data) found.push({ mime, bytes: Buffer.from(data, 'base64') })
    }
    Object.values(value).forEach(walk)
  }
  walk(request.body.input)
  return found
}

const pngSize = (bytes) => [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]

test('the designer is offered its tools and skills, pays through the design meter and sees its capture', async (t) => {
  const w = await world(t)
  await w.start()
  const [hello] = w.service.hellos
  const advertised = Object.fromEntries(hello.roles.map((r) => [r.id, r.route]))
  assert.deepEqual([advertised['sophia-html-designer-v1'], advertised['sophia-visual-review-v1']], ['research-sol-medium-v1', 'research-sol-medium-v1'])

  // The first acknowledgement is recorded and its answer lost (a gateway error); the same one is answered next.
  const requestsAt = []
  w.service.onDesign('design/delivered', () => {
    w.service.onDesign('design/delivered')
    requestsAt.push(w.llm.requests.length)
    return { status: 502, body: { error: 'bad gateway' } }
  })
  w.service.onDesign('design/submit', () => {
    requestsAt.push(w.llm.requests.length)
    return { outcome: 'reviewing' }
  })
  w.llm.script(
    { toolCall: { name: 'design_record_work', arguments: { expectedEntries: 0, entries: [{ kind: 'contract', body: 'Reader: the team. Medium: one HTML page.' }] } } },
    { toolCall: { name: 'design_inspect_render', arguments: { names: [CAPTURE] } } },
    { toolCall: { name: 'design_submit_candidate', arguments: (body) => ({ revisionId: REVISION, renderJobId: RENDER, seen: [receiptIn(body)] }) } },
    { text: 'Submitted.' },
  )
  w.send(w.cmd('create', { text: 'Design the HTML report.', role: 'sophia-html-designer-v1', route: 'research-sol-medium-v1' }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the design turn')
  assert.deepEqual(w.turnEnds().map((e) => e.data.reason.kind), ['completed'])

  const session = `sophia-${w.attemptId}`
  for (const { body } of w.service.design) assert.deepEqual([body.attemptId, body.nativeSessionId], [w.attemptId, session], 'every operation names its own session')
  assert.deepEqual(w.service.design.filter((o) => !/reserve|settle/.test(o.op)).map((o) => o.op), ['design/record', 'design/capture', 'design/delivered', 'design/delivered', 'design/submit'])
  // SDD-01-CX-0019 F1: seen only once dsh's own attachment store kept the capture unchanged, named by its bytes' hash.
  const capture = w.service.design.find((o) => o.op === 'design/capture')
  const [delivered, again] = w.service.design.filter((o) => o.op === 'design/delivered').map((o) => o.body)
  const sha = createHash('sha256').update(Buffer.from(w.service.capturePng, 'base64')).digest('hex')
  assert.deepEqual(delivered.attachments, [{ name: CAPTURE, attachmentId: `sha256:${sha}` }])
  assert.ok(delivered.deliveryId && capture, 'the delivery the capture call was issued')
  // SDD-01-CX-0035: the receipt reached the provider with the image, in the request after the inspection and not before;
  // the submit that named it came after, and only then was the delivery acknowledged, the same body twice.
  assert.equal(receiptIn(w.llm.requests[1].body), 'no-receipt-received')
  assert.match(receiptIn(w.llm.requests[2].body), /^seen-/)
  assert.deepEqual(again, delivered, 'the same acknowledgement')
  assert.deepEqual(requestsAt, [3, 3], 'acknowledged and submitted only after the request that carried the image')
  assert.equal(w.service.research.length, 0, 'nothing went through the research operations')

  const designer = roleOf('sophia-html-designer-v1')
  assert.equal(w.llm.requests.length, 4)
  for (const request of w.llm.requests) {
    assert.deepEqual(toolsOffered(request), designer.native_tools.toSorted(), 'exactly the designer\'s tools')
    const prompt = system(request)
    const positions = [...designer.prompt_sections, ...designer.skills].map((id) => prompt.indexOf(JSON.stringify(headingOf(id)).slice(1, -1)))
    assert.ok(positions.every((p) => p >= 0), 'every section and skill is in the system prompt')
    assert.deepEqual(positions, positions.toSorted((a, b) => a - b), 'in the registry\'s order')
    assert.doesNotMatch(prompt, /# Research worker/, 'not the research section')
  }

  const meter = w.service.design.filter((o) => o.op === 'design/reserve' || o.op === 'design/settle')
  assert.deepEqual(meter.map((o) => o.op), Array(4).fill(['design/reserve', 'design/settle']).flat())
  for (const { body } of meter.filter((o) => o.op === 'design/reserve')) assert.deepEqual([body.kind, body.purpose], ['model', 'call'])

  // The capture's pixels reach the provider as an image in the call after the inspection, and not before.
  assert.equal(imagesIn(w.llm.requests[1]).length, 0)
  const [image] = imagesIn(w.llm.requests[2])
  assert.ok(image, 'the inspected capture is in the next request')
  assert.equal(image.mime, 'image/png')
  assert.deepEqual(pngSize(image.bytes), [3, 2])
  assert.equal(image.bytes.toString('base64'), w.service.capturePng, 'the renderer\'s pixels, byte for byte')
})

test('the reviewer is offered no design tool, inspects through the review operation and reads a precedent', async (t) => {
  const w = await world(t)
  await w.start()
  w.llm.script(
    { toolCall: { name: 'design_write_source', arguments: { expectedSha256: null, html: '<main>x</main>' } } },
    { toolCall: { name: 'review_inspect_render', arguments: { names: [CAPTURE] } } },
    // SDD-01-RF-0002: the precedent its procedure names is in its scope and reaches the model as an image.
    { toolCall: { name: 'review_read_reference', arguments: { id: 'web/precedents/page-04' } } },
    { toolCall: { name: 'review_submit_result', arguments: (body) => ({ verdict: 'pass', summary: 'Nothing blocking remains.', seen: [receiptIn(body)] }) } },
    { text: 'Reviewed.' },
  )
  w.send(w.cmd('create', { text: 'Review the candidate.', role: 'sophia-visual-review-v1', route: 'research-sol-medium-v1' }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the review turn')
  const reviewer = roleOf('sophia-visual-review-v1')
  for (const request of w.llm.requests) assert.deepEqual(toolsOffered(request), reviewer.native_tools.toSorted(), 'exactly the reviewer\'s tools')
  assert.match(JSON.stringify(w.llm.requests[1].body.input), /not permitted for role sophia-visual-review-v1|unknown tool|not available/i, 'the design tool was refused')
  const ops = w.service.design.filter((o) => !/reserve|settle/.test(o.op)).map((o) => o.op)
  assert.deepEqual(ops, ['review/capture', 'review/delivered', 'review/submit'], 'no design operation, no source written')
  const seen = imagesIn(w.llm.requests[2])
  assert.deepEqual(seen.map((i) => i.bytes.toString('base64')), [w.service.capturePng], 'the reviewer saw the capture')
  const precedent = imagesIn(w.llm.requests[3]).at(-1)
  assert.equal(imagesIn(w.llm.requests[3]).length, 2, 'the capture, then the precedent')
  assert.match(precedent.mime, /^image\//)
  assert.doesNotMatch(JSON.stringify(w.llm.requests[3].body.input), /No reference web\/precedents\/page-04/)
  // Its system prompt carries none of the maker's tools or ledger (RF-0002).
  assert.doesNotMatch(system(w.llm.requests[0]), /\bdesign_[a-z_]+|risk ledger/)
  assert.match(system(w.llm.requests[0]), /Visual critique against AI patterns: the independent reviewer/)
  const submitted = w.service.design.find((o) => o.op === 'review/submit').body
  assert.deepEqual([submitted.result.verdict, submitted.result.findings], ['pass', []])
  // The pass named the receipt its model received with the capture; that, and only that, acknowledged the delivery.
  assert.match(receiptIn(w.llm.requests[2].body), /^seen-/)
  const sha = createHash('sha256').update(Buffer.from(w.service.capturePng, 'base64')).digest('hex')
  const acked = w.service.design.filter((o) => o.op === 'review/delivered').map((o) => o.body.attachments)
  assert.deepEqual(acked, [[{ name: CAPTURE, attachmentId: `sha256:${sha}` }]])
})
