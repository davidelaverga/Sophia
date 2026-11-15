/**
 * INC04-S03A-R07-C1P: a model call's usage is reported only when the provider reported it, completely, for this call.
 *
 * The real pinned runtime (the locally built .artifacts/runtime, with its patched pi-ai and dsh-llm-pi-ai), the real
 * openai-responses protocol and the real control-bridge meters, against the Responses test double on each route's own
 * provider alias with a dummy key. What a call settles to is read from what the runtime sent the service:
 * - usage the provider reported completely (explicit zeros included) settles at its computed cost;
 * - a terminal response with no usage, or with a missing, impossible, unsafe or unqualified costing field, settles
 *   uncertain with no cost and no usage: its exposure stays committed, never a synthetic zero;
 * - usage the provider reported in a failed or incomplete terminal response, or before a late abort, is kept;
 * - a call cut, refused or aborted before any terminal response settles uncertain.
 * Missing versus explicit zeros is also crossed on the source review, the designer and (with a disposable PostgreSQL)
 * the conversation reply route. The test double says nothing about the live provider; this is evidence for the
 * producer boundary, not for real billing (live route behavior stays an owner qualification, Q5).
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { REPO_ROOT, RUNTIME_DIR, platformKey } from '../../scripts/lib/common.mjs'
import { parseCordisYaml } from '../../scripts/lib/patch-lint.mjs'
import { assertRecordedArtifacts, executorClosureDigest, homeLayout, installProfile } from '../../scripts/lib/profile.mjs'
import { launchRuntime } from '../../scripts/lib/runtime.mjs'
import { treeDigest } from '../../scripts/lib/tree-digest.mjs'
import { ControlBridge, evidenceOf } from '../../packages/dsh-bundle/dist/control-bridge.js'
import { command, startFixtureService } from '../support/fixture-service.mjs'
import { sleep, suite, unit } from '../support/harness.mjs'
import { conversationRouteOverlay, researchRouteOverlay, reviewRouteOverlay, startMockResponses } from '../support/mock-responses.mjs'

const bundlePatch = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8')
const RESEARCH = unit.model_routes['research-sol-medium-v1']
const REVIEW = unit.model_routes['source-review-luna-high-v1']

/** The bridge's own price of reported usage (control-bridge costOfUsage), for one route's prices. */
const priced = (prices, { input = 0, cached = 0, output = 0 }) =>
  Math.min(Number((((input - cached) * prices.input + cached * prices.cacheRead + output * prices.output) / 1_000_000).toFixed(6)), 1000)

/** What a settlement says, without its ids: the outcome, and the cost and usage only when it has them. */
const outcomeOf = (body) => ({
  outcome: body.outcome,
  ...('costUsd' in body ? { costUsd: body.costUsd } : {}),
  ...('usage' in body ? { usage: body.usage } : {}),
})
const settledAt = (prices, tokens, model) => ({
  outcome: 'settled',
  costUsd: priced(prices, tokens),
  usage: {
    inputTokens: (tokens.input ?? 0) - (tokens.cached ?? 0),
    outputTokens: tokens.output ?? 0,
    ...(tokens.cached ? { cacheReadTokens: tokens.cached } : {}),
    provider: model.provider,
    model: model.model,
  },
})
const UNCERTAIN = { outcome: 'uncertain' }

const research = suite('sophia-usage-provenance', {
  model: { start: startMockResponses, overlay: (baseURL) => researchRouteOverlay(bundlePatch, baseURL), env: { OPENAI_RESEARCH_API_KEY: 'sk-sophia-usage-provenance-dummy' } },
})
after(research.cleanup)

/** The first model settlement of a research attempt whose first model call answers `step`; `during(w)` runs once it left. */
async function researchSettle(t, step, during) {
  const w = await research.world(t)
  await w.start()
  w.llm.script(step)
  w.send(w.cmd('create', { text: 'Which hosts render PDFs in a sandbox?', role: 'sophia-research-md-v1', route: 'research-sol-medium-v1' }))
  if (during) await during(w)
  await w.service.waitFor(() => w.service.research.some((o) => o.op === 'settle'), 90_000, 'the first model settlement')
  const reserve = w.service.research.find((o) => o.op === 'reserve' && o.body.kind === 'model')
  const settle = w.service.research.find((o) => o.op === 'settle')
  assert.ok(reserve, 'the call was reserved before it left')
  assert.equal(w.service.research.indexOf(reserve) < w.service.research.indexOf(settle), true, 'reserved before settled')
  return { w, body: settle.body }
}

const COMPLETE = { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } }

describe('research meter: reported usage versus no usage, on the real adapter', () => {
  test('fully reported usage settles at its cost', async (t) => {
    const { body } = await researchSettle(t, { text: 'ok' })
    assert.deepEqual(outcomeOf(body), settledAt(RESEARCH.prices, { input: 1, output: 1 }, RESEARCH))
  })

  test('explicit provider zeros are known usage: settled at 0, and the observation carries the zeros', async (t) => {
    const zeros = { input_tokens: 0, output_tokens: 0, total_tokens: 0, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } }
    const { w, body } = await researchSettle(t, { text: 'ok', usage: zeros })
    assert.deepEqual(outcomeOf(body), settledAt(RESEARCH.prices, { input: 0, output: 0 }, RESEARCH))
    const message = await w.service.waitFor(() => w.sessionEvents('assistant/message')[0], 60_000, 'the assistant message observation')
    assert.deepEqual([message.data.inputTokens, message.data.outputTokens], [0, 0])
  })

  test('a completed response without usage is no usage: uncertain, no cost, and the observation counts are null', async (t) => {
    const { w, body } = await researchSettle(t, { text: 'ok', omitUsage: true })
    assert.deepEqual(outcomeOf(body), UNCERTAIN)
    const message = await w.service.waitFor(() => w.sessionEvents('assistant/message')[0], 60_000, 'the assistant message observation')
    assert.deepEqual([message.data.inputTokens, message.data.outputTokens], [null, null])
  })

  const partial = [
    ['a missing cached_tokens', { input_tokens_details: {} }],
    ['cached_tokens above input_tokens', { input_tokens: 2, input_tokens_details: { cached_tokens: 5 } }],
    ['an unsafe integer', { output_tokens: 2 ** 53 }],
    ['a fractional count', { output_tokens: 1.5 }],
    ['a negative count', { input_tokens: -1 }],
    ['a missing output_tokens', { output_tokens: undefined }],
    ['an unqualified positive cache_write_tokens', { input_tokens_details: { cached_tokens: 0, cache_write_tokens: 3 } }],
  ]
  for (const [what, usage] of partial) {
    test(`a usage object with ${what} is not complete: uncertain, never zero-filled`, async (t) => {
      const { body } = await researchSettle(t, { text: 'ok', usage })
      assert.deepEqual(outcomeOf(body), UNCERTAIN)
    })
  }

  test('a cache_write_tokens of 0 adds no class: complete, settled at the base fields', async (t) => {
    const { body } = await researchSettle(t, { text: 'ok', usage: { input_tokens: 3, output_tokens: 2, input_tokens_details: { cached_tokens: 1, cache_write_tokens: 0 } } })
    assert.deepEqual(outcomeOf(body), settledAt(RESEARCH.prices, { input: 3, cached: 1, output: 2 }, RESEARCH))
  })

  test('a failed response that reports usage keeps it: settled at the reported usage', async (t) => {
    const { body } = await researchSettle(t, { text: 'partial', terminal: 'failed', usage: { input_tokens: 7, output_tokens: 3 } })
    assert.deepEqual(outcomeOf(body), settledAt(RESEARCH.prices, { input: 7, output: 3 }, RESEARCH))
  })

  test('a failed response without usage: uncertain', async (t) => {
    const { body } = await researchSettle(t, { text: 'partial', terminal: 'failed', omitUsage: true })
    assert.deepEqual(outcomeOf(body), UNCERTAIN)
  })

  test('an incomplete response that reports usage keeps it: settled at the reported usage', async (t) => {
    const { body } = await researchSettle(t, { text: 'partial', terminal: 'incomplete', usage: { input_tokens: 4, output_tokens: 2 } })
    assert.deepEqual(outcomeOf(body), settledAt(RESEARCH.prices, { input: 4, output: 2 }, RESEARCH))
  })

  test('a stream cut after response.created, before any terminal response: uncertain', async (t) => {
    const { body } = await researchSettle(t, { cutAfterCreated: true })
    assert.deepEqual(outcomeOf(body), UNCERTAIN)
  })

  test('a provider 500 with no stream: uncertain', async (t) => {
    const { body } = await researchSettle(t, { status: 500 })
    assert.deepEqual(outcomeOf(body), UNCERTAIN)
  })

  test('a Stop while the response streams, before its terminal event: uncertain', async (t) => {
    const { body } = await researchSettle(t, { text: 'slow', delayMs: 8000 }, async (w) => {
      await w.service.waitFor(() => w.llm.requests.length >= 1, 60_000, 'the request')
      await sleep(500)
      assert.equal(w.llm.terminalSent, 0, 'no terminal event was sent yet')
      w.send(w.cmd('stop'))
    })
    assert.deepEqual(outcomeOf(body), UNCERTAIN)
  })

  test('a Stop after the terminal response reported usage keeps that usage: settled at it', async (t) => {
    const { body } = await researchSettle(t, { text: 'done', usage: { input_tokens: 5, output_tokens: 6 }, holdOpenMs: 8000 }, async (w) => {
      await w.service.waitFor(() => w.llm.terminalSent >= 1, 60_000, 'the terminal event')
      await sleep(300)
      w.send(w.cmd('stop'))
    })
    assert.deepEqual(outcomeOf(body), settledAt(RESEARCH.prices, { input: 5, output: 6 }, RESEARCH))
  })
})

describe('design meter: missing usage versus explicit zeros, on the real adapter', () => {
  for (const [what, step, expected] of [
    ['explicit zeros', { text: 'ok', usage: { input_tokens: 0, output_tokens: 0, input_tokens_details: { cached_tokens: 0 } } }, settledAt(RESEARCH.prices, {}, RESEARCH)],
    ['no usage', { text: 'ok', omitUsage: true }, UNCERTAIN],
  ]) {
    test(`a designer call with ${what}`, async (t) => {
      const w = await research.world(t)
      await w.start()
      w.llm.script(step)
      w.send(w.cmd('create', { text: 'Design the HTML report.', role: 'sophia-html-designer-v1', route: 'research-sol-medium-v1' }))
      await w.service.waitFor(() => w.service.design.some((o) => o.op === 'design/settle'), 90_000, 'the first design settlement')
      assert.deepEqual(outcomeOf(w.service.design.find((o) => o.op === 'design/settle').body), expected)
    })
  }
})

const review = suite('sophia-usage-provenance-review', {
  model: { start: startMockResponses, overlay: (baseURL) => reviewRouteOverlay(bundlePatch, baseURL), env: { OPENAI_API_KEY: 'sk-sophia-usage-provenance-review-dummy' } },
})
after(review.cleanup)

describe('source review meter: missing usage versus explicit zeros, on the real adapter', () => {
  for (const [what, step, expected] of [
    ['explicit zeros', { text: 'ok', usage: { input_tokens: 0, output_tokens: 0, input_tokens_details: { cached_tokens: 0 } } }, settledAt(REVIEW.prices, {}, REVIEW)],
    ['no usage', { text: 'ok', omitUsage: true }, UNCERTAIN],
  ]) {
    test(`a source review call with ${what}`, async (t) => {
      const w = await review.world(t)
      await w.start()
      w.llm.script(step)
      w.send(w.cmd('create', { text: 'Source review task. Review the sources below.', role: 'sophia-source-review-v1', route: 'source-review-luna-high-v1' }))
      await w.service.waitFor(() => w.service.review.some((o) => o.op === 'settle'), 90_000, 'the first review settlement')
      assert.deepEqual(outcomeOf(w.service.review.find((o) => o.op === 'settle').body), expected)
    })
  }
})

describe('the meter keeps known usage when its consumer stops after it, and nothing before it (wrapper contract)', () => {
  /** The bridge's own metered(), fed the chunks the patched adapter emits for one complete call, consumed by `consume`. */
  async function meteredWith(consume) {
    const settles = []
    const bridge = Object.create(ControlBridge.prototype)
    // INC04-S03A-R07-C2A (C01): the reservation is tracked, and the stub answers it with the closed binding of that exact
    // request in this bridge's own project, runtime unit and attempt resource, as the service does; nothing else about the
    // meter changes.
    Object.assign(bridge, {
      transport: {
        researchReserve: async (body) => ({ reservationId: 'r-1', state: 'reserved', kind: body.kind, purpose: body.purpose, amountUsd: body.amountUsd, target: null,
          binding: { mode: body.mode, contract: body.contract, evidenceId: '00000000-0000-4000-8000-000000000001', callId: body.callId,
            attemptId: body.attemptId, nativeSessionId: body.nativeSessionId, projectId: 'proj-w', runtimeUnitId: 'unit-w', resourceId: 'res-w' } }),
        researchSettle: async (body) => { settles.push(body) },
      },
      settings: { log: () => {}, routes: {}, runtimeUnitId: 'unit-w' },
      projectId: 'proj-w',
      journal: { append: () => {} },
    })
    const next = () => (async function* () {
      yield { type: 'text-delta', index: 0, text: 'ok' }
      yield { type: 'usage', usage: { inputTokens: 2, outputTokens: 3 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
    // REPAIR-001 (F03): a SYNTHETIC attempt whose authenticated commands named resource res-w, as its answer echoes.
    const attempt = { attemptId: 'att-w', sessionId: 'sophia-att-w', finalizing: false, resource: { state: 'known', resourceId: 'res-w' } }
    const stream = bridge.metered(attempt, { sessionId: 'sophia-att-w', messages: [] }, { provider: 'p', model: 'm', maxTokens: 100 }, RESEARCH.prices, next)
    await consume(stream).catch(() => {})
    return settles
  }
  const until = (type, then) => async (stream) => { for await (const chunk of stream) if (chunk.type === type) return then() }
  test('a consumer that returns after the usage chunk does not unconsume it: settled', async () => {
    assert.deepEqual((await meteredWith(until('usage', () => {}))).map((s) => s.outcome), ['settled'])
  })
  test('a consumer that throws after the usage chunk: still settled', async () => {
    assert.deepEqual((await meteredWith(until('usage', () => { throw new Error('consumer failed') }))).map((s) => s.outcome), ['settled'])
  })
  test('a consumer that returns before the usage chunk cannot release it: uncertain', async () => {
    assert.deepEqual((await meteredWith(until('text-delta', () => {}))).map((s) => s.outcome), ['uncertain'])
  })
  test('a consumer that throws before the usage chunk: uncertain', async () => {
    assert.deepEqual((await meteredWith(until('text-delta', () => { throw new Error('consumer failed') }))).map((s) => s.outcome), ['uncertain'])
  })
})

describe('a partial installation: the adapter without the producer marker', () => {
  // A private copy of the recorded runtime whose pi-ai sets no usage provenance (the committed pi-ai patch reversed when
  // present), with its own locally correct runtime record. On openai-responses the adapter must then report no usage,
  // even for usage the provider reported completely: an absent marker is unknown, never the legacy default.
  test('complete provider usage without the marker stays unknown on openai-responses: uncertain, never a legacy usage', async (t) => {
    const scratch = mkdtempSync(join(tmpdir(), 'sophia-usage-provenance-partial-'))
    t.after(() => rmSync(scratch, { recursive: true, force: true }))
    const dir = join(scratch, 'runtime')
    cpSync(RUNTIME_DIR, dir, { recursive: true, verbatimSymlinks: true })
    const store = join(dir, 'node_modules', '.pnpm')
    const copies = readdirSync(store).filter((name) => name.startsWith('@earendil-works+pi-ai@0.87.1'))
    assert.equal(copies.length, 1, 'one pi-ai in the runtime closure')
    const pkg = join(store, copies[0], 'node_modules', '@earendil-works', 'pi-ai')
    const shared = join(pkg, 'dist', 'api', 'openai-responses-shared.js')
    if (readFileSync(shared, 'utf8').includes('responsesUsageProvenance')) {
      const reversed = spawnSync('git', ['apply', '-R', join(REPO_ROOT, 'patches', '@earendil-works__pi-ai@0.87.1.patch')], { cwd: pkg, encoding: 'utf8' })
      assert.equal(reversed.status, 0, reversed.stderr)
    }
    assert.equal(readFileSync(shared, 'utf8').includes('usageProvenance'), false, 'this pi-ai sets no provenance marker')
    const local = structuredClone(unit)
    local.dsh.artifacts_by_platform[platformKey()].digest = treeDigest(dir).digest
    assertRecordedArtifacts(local, dir)
    const layout = homeLayout(join(scratch, 'home'))
    installProfile({ unit: local, runtimeDir: dir, layout })
    const service = await startFixtureService({ runtimeUnitId: unit.id })
    const llm = await startMockResponses()
    const runtime = launchRuntime({
      unit: local, runtimeDir: dir, layout, bridge: service, overlays: [researchRouteOverlay(bundlePatch, llm.baseURL)],
      extraEnv: { OPENAI_RESEARCH_API_KEY: 'sk-sophia-usage-provenance-partial-dummy' },
    })
    t.after(async () => {
      await runtime.stop()
      await service.close()
      await llm.close()
    })
    await service.waitFor(() => service.readiness.some((r) => r.state === 'ready'), 30_000, 'bridge readiness')
    llm.script({ text: 'ok' })
    service.enqueue(command('create', { attemptId: 'att-partial', runtimeUnitId: unit.id, text: 'Which hosts render PDFs in a sandbox?', role: 'sophia-research-md-v1', route: 'research-sol-medium-v1' }))
    await service.waitFor(() => service.research.some((o) => o.op === 'settle'), 90_000, 'the first model settlement')
    assert.equal(llm.terminalSent >= 1, true, 'the provider reported complete usage in a completed response')
    assert.deepEqual(outcomeOf(service.research.find((o) => o.op === 'settle').body), UNCERTAIN)
  })
})

// --- the conversation reply route (needs a disposable PostgreSQL; the real API, worker and service executor) ----------

const enabled = Boolean(process.env.SOPHIA_DISPOSABLE_DATABASE_URL)
const ROUTE = 'conversation-service-luna-high-v1'
const DUMMY_KEY = 'sk-sophia-usage-provenance-conversation-dummy'

/** The conversation alias pointed at the double, and the bridge row restated whole with service mode on (as CON-01 B2). */
function serviceOverlay(baseURL) {
  const rows = parseCordisYaml(bundlePatch)
  const bridge = rows.flatMap((row) => row.insert ?? []).find((row) => row.id === 'sophia-control-bridge')?.config
  assert.ok(bridge && !('replies' in bridge), 'the committed bridge row enables no reply mode')
  const replies = { mode: 'service', routeId: ROUTE, executorDigestEnv: 'SOPHIA_EXECUTOR_DIGEST' }
  return JSON.stringify([...parseCordisYaml(conversationRouteOverlay(bundlePatch, baseURL)), { id: 'sophia-control-bridge', config: { ...bridge, replies } }])
}

describe('conversation reply meter: missing usage versus explicit zeros, on the real adapter', { skip: enabled ? false : 'needs SOPHIA_DISPOSABLE_DATABASE_URL (a disposable PostgreSQL)' }, () => {
  let m, db, pool, workerPool, ownerPool, app, base, dispatcher, scratch, pristine
  let counter = 0
  const A = crypto.randomUUID()
  const E = crypto.randomUUID()

  before(async () => {
    const [{ buildApp }, persistence, testSupport, worker] = await Promise.all([
      import('../../apps/api/src/app.ts'),
      import('../../packages/persistence/src/index.ts'),
      import('../../packages/test-support/src/index.ts'),
      import('../../apps/worker/src/index.ts'),
    ])
    m = { buildApp, persistence, testSupport, worker }
    db = await m.testSupport.createTestDatabase()
    pool = m.persistence.createPool(db.apiUrl, { max: 8 })
    workerPool = m.persistence.createPool(db.workerUrl, { max: 3 })
    ownerPool = m.persistence.createPool(db.ownerUrl, { max: 3 })
    const verifyActor = async (authorization) => {
      const id = /^Bearer test-actor:([0-9a-f-]{36})$/.exec(authorization ?? '')?.[1]
      if (!id) throw new Error('no test actor')
      return { id, name: null, anonymous: false }
    }
    app = m.buildApp({ pool, verifyActor, conversations: true })
    await app.listen({ host: '127.0.0.1', port: 0 })
    base = `http://127.0.0.1:${app.server.address().port}`
    dispatcher = new m.worker.RuntimeDispatcher(workerPool, { workerId: 'usage-provenance', idleMs: 200, assemblerUrl: db.assemblerUrl })
    dispatcher.start()
    scratch = mkdtempSync(join(tmpdir(), 'sophia-usage-provenance-con-'))
    pristine = homeLayout(join(scratch, 'pristine'))
    assertRecordedArtifacts(unit, RUNTIME_DIR)
    installProfile({ unit, runtimeDir: RUNTIME_DIR, layout: pristine })
  })

  after(async () => {
    await dispatcher?.stop()
    await app?.close()
    await pool?.end()
    await workerPool?.end()
    await ownerPool?.end()
    await db?.drop()
    if (scratch) rmSync(scratch, { recursive: true, force: true })
  })

  async function api(actor, method, path, body) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer test-actor:${actor}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(method === 'POST' ? { 'idempotency-key': crypto.randomUUID() } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await res.text()
    return { status: res.status, json: text ? JSON.parse(text) : null }
  }
  const owner = async (sql, params) => (await ownerPool.query(sql, params)).rows

  /** One project with conversations on, a runtime, a pinned service lineage, a fresh home, the double and the runtime. */
  async function reply(t, step) {
    const layout = homeLayout(join(scratch, `case-${counter++}`))
    cpSync(pristine.root, layout.root, { recursive: true, verbatimSymlinks: true })
    const llm = await startMockResponses()
    const overlay = serviceOverlay(llm.baseURL)
    const closure = (await executorClosureDigest({ unit, runtimeDir: RUNTIME_DIR, layout, overlays: [overlay] })).digest
    const project = await m.testSupport.seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const projectId = project.projectId
    await owner("SELECT sophia.set_conversation_settings($1,'enabled','c1p-usage-provenance')", [projectId])
    const rt = await m.testSupport.registerRuntime(db.ownerUrl, { projectId, admin: A, runtimeUnitId: unit.id })
    await owner('SELECT sophia.conversation_new_lineage($1,$2::jsonb) AS v', [projectId, {
      unit: 'calls_tokens', routeId: ROUTE, credentialRef: 'openai-api-key', ownerResourceRef: 'c1p-usage-provenance-owner',
      approvalRef: `c1p-${crypto.randomUUID()}`, expiresAt: new Date(Date.now() + 900_000).toISOString(),
      maxCallsPerReply: 1, totalCallCap: 10, replyTokenCap: 200_000, totalTokenCap: 2_000_000, subjects: [E],
    }])
    const lineageId = (await owner('SELECT lineage_id FROM sophia.conversation_grants WHERE project_id=$1 AND current', [projectId]))[0].lineage_id
    await owner('SELECT sophia.conversation_pin_execution($1,$2::jsonb)', [projectId, {
      lineageId, execution: 'service', routeId: ROUTE, executorArtifactDigest: closure, approvalRef: `c1p-pin-${crypto.randomUUID()}`,
    }])
    llm.script(step)
    const runtime = launchRuntime({
      unit, runtimeDir: RUNTIME_DIR, layout, bridge: { url: base, token: rt.token }, overlays: [overlay],
      extraEnv: { OPENAI_API_KEY: DUMMY_KEY, SOPHIA_EXECUTOR_DIGEST: closure },
    })
    t.after(async () => {
      await runtime.stop()
      await llm.close()
    })
    const until = async (predicate, what, timeoutMs = 60_000) => {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        const value = await predicate()
        if (value) return value
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}\n${runtime.stderr().slice(-3000)}`)
        await sleep(150)
      }
    }
    await until(() => /readiness=ready/.test(runtime.stderr()), 'bridge readiness')
    const started = await api(E, 'POST', `/api/v1/projects/${projectId}/conversations`, { title: 'Usage provenance', text: 'Opening note.', askSophia: false })
    assert.equal(started.status, 202, JSON.stringify(started.json))
    const sent = await api(E, 'POST', `/api/v1/conversations/${started.json.conversation.id}/messages`, { text: 'Please summarize.', askSophia: true })
    assert.equal(sent.status, 202, JSON.stringify(sent.json))
    const replyId = sent.json.reply.id
    const reservations = () => owner('SELECT state,used_calls,used_tokens FROM sophia.conversation_reservations WHERE reply_id=$1 ORDER BY call_ordinal', [replyId])
    await until(async () => (await reservations()).some((v) => v.state !== 'reserved'), 'the reply call to end')
    assert.equal(llm.requests.length, 1, 'one request on the pinned route')
    return reservations()
  }

  test('explicit provider zeros settle the reply call at 0 tokens', async (t) => {
    const rows = await reply(t, { text: 'The summary.', usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, input_tokens_details: { cached_tokens: 0 } } })
    assert.deepEqual(rows.map((v) => [v.state, v.used_calls, v.used_tokens]), [['settled', '1', '0']])
  })

  test('a completed response without usage leaves the reply call uncertain, counted at its reservation', async (t) => {
    const rows = await reply(t, { text: 'The summary.', omitUsage: true })
    assert.deepEqual(rows.map((v) => v.state), ['uncertain'])
  })
})

// --- REPAIR-001 C2A-K03-HTTP: the maintained authenticated runtime research route, real API, real PostgreSQL ----------
//
// A targeted loopback crossing of the private settlement envelope at the route's actual body limit (2 MiB, routes/
// runtime.ts RESEARCH_BODY_LIMIT): the real API app and its authenticated runtime routes over a disposable PostgreSQL,
// the settlement facts built by the SHIPPED bridge classifier (evidenceOf). LABELLED SYNTHETIC: the project, runtime,
// token and ids; no provider, account or native session is involved. This is not a claim about every provider id.

describe('REPAIR-001 C2A-K03-HTTP: a response id at the private research settle route, real API and PostgreSQL', { skip: enabled ? false : 'needs SOPHIA_DISPOSABLE_DATABASE_URL (a disposable PostgreSQL)' }, () => {
  let m, db, pool, workerPool, ownerPool, app, base
  const logged = []
  const A = crypto.randomUUID()
  const E = crypto.randomUUID()
  const MD = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }

  before(async () => {
    const [{ buildApp }, persistence, testSupport] = await Promise.all([
      import('../../apps/api/src/app.ts'),
      import('../../packages/persistence/src/index.ts'),
      import('../../packages/test-support/src/index.ts'),
    ])
    m = { buildApp, persistence, testSupport }
    db = await m.testSupport.createTestDatabase()
    pool = m.persistence.createPool(db.apiUrl, { max: 6 })
    workerPool = m.persistence.createPool(db.workerUrl, { max: 2 })
    ownerPool = m.persistence.createPool(db.ownerUrl, { max: 2 })
    const verifyActor = async () => { throw new Error('no member route is used here') }
    app = m.buildApp({ pool, verifyActor, logger: { stream: { write: (line) => logged.push(line) } } })
    await app.listen({ host: '127.0.0.1', port: 0 })
    base = `http://127.0.0.1:${app.server.address().port}`
  })
  after(async () => {
    await app?.close()
    await pool?.end()
    await workerPool?.end()
    await ownerPool?.end()
    await db?.drop()
  })

  /** One project-funded research attempt delivered to a runtime that speaks only through the authenticated HTTP routes. */
  async function attempt() {
    const { projectId } = await m.testSupport.seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [] })
    await ownerPool.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [projectId])
    const rt = await m.testSupport.registerRuntime(db.ownerUrl, { projectId, admin: A })
    const headers = { authorization: `Bearer ${rt.token}`, 'x-sophia-runtime-unit': rt.runtimeUnitId, 'x-sophia-bridge-instance': `b-${crypto.randomUUID().slice(0, 8)}`, 'x-sophia-bridge-protocol': '1' }
    const call = async (method, path, body) => {
      const res = await fetch(`${base}${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
      const text = await res.text()
      return { status: res.status, text, json: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null }
    }
    assert.equal((await call('POST', '/v1/runtime/hello', { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] })).status, 200)
    assert.equal((await call('POST', '/v1/runtime/ready', { state: 'ready', reason: null, unrecovered: [] })).status, 204)
    const admitted = await m.persistence.withActor(pool, E, 'write', (c) => m.persistence.admitResearchTask(c, projectId, {
      key: crypto.randomUUID(), exchangeId: crypto.randomUUID(),
      request: { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] }, specialist: { role: MD.id, route: MD.route },
    }))
    assert.ok('admitted' in admitted, JSON.stringify(admitted))
    for (const row of await m.persistence.claimRuntimeOutbox(workerPool, 'k03-http', 50, 30)) await m.persistence.dispatchRuntimeOutbox(workerPool, row.project_id, row.id, row.lease_token)
    const polled = await call('GET', '/v1/runtime/commands?after=0&waitMs=0')
    const create = polled.json.commands.map((q) => q.command).find((c) => c.binding.attemptId === admitted.admitted.attemptId)
    assert.ok(create, 'the create reached the runtime over HTTP')
    const at = { attemptId: create.binding.attemptId, nativeSessionId: `sophia-${create.binding.attemptId}` }
    const receipt = { commandId: create.commandId, attemptId: at.attemptId, stage: 'delivered', nativeSessionId: at.nativeSessionId, nativeSequence: 1, evidenceRefs: [], observedAt: new Date().toISOString(), reason: null }
    assert.equal((await call('POST', '/v1/runtime/receipts', { receipts: [receipt] })).status, 204)
    return { projectId, call, at, resourceId: create.binding.resourceId }
  }
  const tracked = { mode: 'tracked_v1', contract: 'c1p_complete_report', declared: { routeId: 'research-sol-medium-v1', model: RESEARCH.model, reasoningEffort: RESEARCH.reasoningEffort, prices: RESEARCH.prices } }
  const usage = { inputTokens: 3, outputTokens: 4 }
  /** The settle body the bridge sends: its facts classified by the shipped evidenceOf BEFORE serialization. */
  const settleBody = (at, reservationId, rawId) => ({ ...at, reservationId, outcome: 'settled', costUsd: 0.0001, usage, evidence: evidenceOf('c1p_complete_report', usage, 'stream_completed', rawId) })
  const owner = async (sql, params) => (await ownerPool.query(sql, params)).rows
  /** Rows of every sophia table whose text holds `needle` (the private evidence table aside unless named). */
  async function tablesHolding(needle) {
    const tables = (await owner(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema='sophia' AND table_type='BASE TABLE'`)).map((r) => r.t)
    const hits = []
    for (const t of tables) {
      const [{ n }] = await owner(`SELECT count(*)::int AS n FROM sophia.${t} x WHERE strpos(x::text, $1)>0`, [needle])
      if (n > 0) hits.push(t)
    }
    return hits.sort()
  }

  test('a supported escape-heavy 8192-byte id crosses the real route whole, below the actual limit, and is kept only in private evidence', async () => {
    const w = await attempt()
    const reserved = await w.call('POST', '/v1/runtime/research/reserve', { ...w.at, callId: 'llm-k03-ok', kind: 'model', provider: 'openai-research', amountUsd: 0.1, ...tracked })
    assert.equal(reserved.status, 200, reserved.text)
    assert.equal(reserved.json.binding.resourceId, w.resourceId, 'F03 through the real API: the resource of the authenticated command')
    // R1 (V01): a unique PRINTABLE sentinel inside the escape-heavy id, the filler sized to exactly 8192 UTF-8 bytes. A
    // printable token reads the same in a text column and in a JSONB value's text, so one scan sees both representations.
    const SENTINEL = `K03SUP${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
    const id = `${SENTINEL}${'\u0001'.repeat(8192 - SENTINEL.length)}`
    assert.equal(Buffer.byteLength(id, 'utf8'), 8192)
    const body = JSON.stringify(settleBody(w.at, reserved.json.reservationId, id))
    assert.equal(Buffer.byteLength(JSON.stringify(id), 'utf8'), SENTINEL.length + (8192 - SENTINEL.length) * 6 + 2, 'escape-heavy on the wire')
    assert.ok(Buffer.byteLength(body, 'utf8') < 2 * 1024 * 1024, 'below RESEARCH_BODY_LIMIT')
    const settled = await w.call('POST', '/v1/runtime/research/settle', body)
    assert.equal(settled.status, 200, settled.text.slice(0, 300))
    assert.deepEqual([settled.json.state, settled.json.evidence.disposition], ['settled', 'accepted'])
    const [truth] = await owner(`SELECT response_id_status AS s, octet_length(response_id) AS n, response_id=$2 AS whole FROM sophia.research_call_truth WHERE reservation_id=$1`, [reserved.json.reservationId, id])
    assert.deepEqual([truth.s, truth.n, truth.whole], ['supported', 8192, true])
    assert.deepEqual(await tablesHolding(SENTINEL), ['research_call_truth'], 'nowhere else: no usage, provider_request_id, history or readout')
    assert.equal(logged.some((l) => l.includes(SENTINEL)), false, 'not in the API log')
    assert.equal([reserved.text, settled.text].some((t) => t.includes(SENTINEL)), false, 'not in any returned body')
    // Scanner sensitivity (LABELLED SYNTHETIC probe in this disposable database): a deliberate JSONB copy of the id IS
    // found by the sentinel scan, while the old raw control-character scan misses it (the JSONB text holds escapes).
    await owner(`CREATE TABLE sophia.k03_scan_probe (copy jsonb NOT NULL)`)
    try {
      await owner(`INSERT INTO sophia.k03_scan_probe(copy) VALUES (jsonb_build_object('responseId', $1::text))`, [id])
      assert.deepEqual(await tablesHolding(SENTINEL), ['k03_scan_probe', 'research_call_truth'].sort(), 'the sentinel scan sees a JSONB copy')
      assert.equal((await tablesHolding('\u0001'.repeat(64))).includes('k03_scan_probe'), false, 'the old raw scan was blind to it (V01)')
    } finally {
      await owner(`DROP TABLE sophia.k03_scan_probe`)
    }
  })

  test('a multibyte id one byte over is classified before the wire: known usage settles, the raw id never leaves', async () => {
    const w = await attempt()
    const reserved = await w.call('POST', '/v1/runtime/research/reserve', { ...w.at, callId: 'llm-k03-over', kind: 'model', provider: 'openai-research', amountUsd: 0.1, ...tracked })
    assert.equal(reserved.status, 200, reserved.text)
    const id = `${'é'.repeat(4091)}K03TAIL7` // 8190 UTF-8 bytes; padded to exactly 8193 below
    const over = `${id}${'x'.repeat(8193 - Buffer.byteLength(id, 'utf8'))}`
    assert.equal(Buffer.byteLength(over, 'utf8'), 8193, 'one byte over the private bound')
    const body = settleBody(w.at, reserved.json.reservationId, over)
    assert.deepEqual(body.evidence.responseId, { status: 'identity_unsupported', reason: 'over_bound' })
    assert.equal(JSON.stringify(body).includes('K03TAIL7'), false, 'classified BEFORE serialization')
    const settled = await w.call('POST', '/v1/runtime/research/settle', body)
    assert.equal(settled.status, 200, settled.text)
    assert.equal(settled.json.state, 'settled', 'the known usage and money are kept')
    const [truth] = await owner(`SELECT response_id_status AS s, response_id_reason AS r, output FROM sophia.research_call_truth WHERE reservation_id=$1`, [reserved.json.reservationId])
    assert.deepEqual([truth.s, truth.r, String(truth.output)], ['identity_unsupported', 'over_bound', '4'])
    assert.deepEqual(await tablesHolding('K03TAIL7'), [])
    assert.equal(logged.some((l) => l.includes('K03TAIL7')), false)
  })

  test('adverse (LABELLED: not the bridge): a raw over-bound id sent as supported, and a body over the limit, are refused without echo', async () => {
    const w = await attempt()
    const reserved = await w.call('POST', '/v1/runtime/research/reserve', { ...w.at, callId: 'llm-k03-raw', kind: 'model', provider: 'openai-research', amountUsd: 0.1, ...tracked })
    const raw = `${'é'.repeat(4092)}K03RAWTAIL` // 4102 characters (within the schema's character maxLength), 8194 bytes
    assert.ok(raw.length <= 8192 && Buffer.byteLength(raw, 'utf8') > 8192)
    const forged = { ...settleBody(w.at, reserved.json.reservationId, undefined) }
    forged.evidence = { ...forged.evidence, responseId: { status: 'supported', value: raw } }
    const refused = await w.call('POST', '/v1/runtime/research/settle', forged)
    assert.equal(refused.status, 422, refused.text)
    assert.deepEqual([refused.json.code, refused.json.message], ['invalid_request', 'Invalid settlement evidence'], 'a fixed bad-input error')
    assert.equal(refused.text.includes('K03RAWTAIL'), false, 'no raw id echoed')
    const huge = { ...forged, evidence: { ...forged.evidence, responseId: { status: 'supported', value: `${'y'.repeat(2 * 1024 * 1024)}K03HUGETAIL` } } }
    const tooLarge = await w.call('POST', '/v1/runtime/research/settle', huge)
    // Fastify refuses a body over the route's bodyLimit (FST_ERR_CTP_BODY_TOO_LARGE, 413), which app.ts's error handler
    // answers as its fixed 400 `malformed`, before any parsing, validation or SQL.
    assert.equal(tooLarge.status, 400, `over the actual limit: ${String(tooLarge.status)}`)
    assert.equal(tooLarge.json.code, 'malformed')
    assert.match(tooLarge.json.message, /too large/i)
    assert.equal(tooLarge.text.includes('K03HUGETAIL'), false, 'no raw id echoed')
    const [r] = await owner(`SELECT state FROM sophia.research_reservations WHERE id=$1`, [reserved.json.reservationId])
    assert.equal(r.state, 'reserved', 'the original commitment stays; nothing was released or zeroed')
    assert.deepEqual(await tablesHolding('K03RAWTAIL'), [])
    assert.equal(logged.some((l) => l.includes('K03RAWTAIL') || l.includes('K03HUGETAIL')), false, 'not in the API log')
  })
})
