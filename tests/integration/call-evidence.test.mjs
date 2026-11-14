/**
 * INC04-S03A-R07-C2A: tracked model-call evidence on the real pinned runtime (the locally deployed .artifacts/runtime with
 * its C1P-patched pi-ai and dsh-llm-pi-ai), the real control bridge and the real openai-responses protocol, against the
 * Responses test double with a dummy key and the LABELLED fixture service. Nothing here calls a real provider, account or
 * native session, and nothing here is a live qualification of a provider, route or bill.
 * - K04: a complete report is claimed only when the LOADED decoder qualifies: the closure is verifiable (a strict JSON
 *   overlay), its runtime component is the qualified C1P runtime, and the effective llm-pi-ai API of the route's provider
 *   is openai-responses. A pre-C1P runtime under the same unit label, an API drift, or an unverifiable (YAML) overlay is
 *   an honest legacy_report: the call is still tracked and its known usage still kept.
 * - C01: a reservation answer whose closed binding is not this exact call's refuses the call BEFORE any provider request,
 *   with no new key and no settlement; distinct authorized retries keep their own reservations.
 * - K03: a response id is kept whole only when supported; otherwise it is omitted with a fixed reason, the known usage is
 *   kept, and no raw id reaches the journal, the observations or the log.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { REPO_ROOT, RUNTIME_DIR, platformKey } from '../../scripts/lib/common.mjs'
import { parseCordisYaml } from '../../scripts/lib/patch-lint.mjs'
import { assertRecordedArtifacts, homeLayout, installProfile } from '../../scripts/lib/profile.mjs'
import { launchRuntime } from '../../scripts/lib/runtime.mjs'
import { treeDigest } from '../../scripts/lib/tree-digest.mjs'
import { C1P_API, C1P_ROUTES, C1P_RUNTIMES, BUNDLE_PROVIDER_APIS, effectiveProviderApis, evidenceQualifications } from '../../packages/dsh-bundle/dist/index.js'
import { classifyResponseId } from '../../packages/dsh-bundle/dist/control-bridge.js'
import { command, startFixtureService } from '../support/fixture-service.mjs'
import { suite, unit } from '../support/harness.mjs'
import { providerOverlayJson, researchRouteOverlay, startMockResponses } from '../support/mock-responses.mjs'

const bundlePatch = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8')
const RESEARCH = unit.model_routes['research-sol-medium-v1']
const RESEARCH_KEY = { OPENAI_RESEARCH_API_KEY: 'sk-sophia-call-evidence-dummy' }
const REVIEW_KEY = { OPENAI_API_KEY: 'sk-sophia-call-evidence-review-dummy' }

const research = suite('sophia-call-evidence', {
  model: { start: startMockResponses, overlay: (baseURL) => providerOverlayJson(bundlePatch, baseURL, 'openai-research'), env: RESEARCH_KEY },
})
const review = suite('sophia-call-evidence-review', {
  model: { start: startMockResponses, overlay: (baseURL) => providerOverlayJson(bundlePatch, baseURL, 'openai-review'), env: REVIEW_KEY },
})
const yaml = suite('sophia-call-evidence-yaml', {
  model: { start: startMockResponses, overlay: (baseURL) => researchRouteOverlay(bundlePatch, baseURL), env: RESEARCH_KEY },
})
const drift = suite('sophia-call-evidence-drift', {
  model: { start: startMockResponses, overlay: (baseURL) => providerOverlayJson(bundlePatch, baseURL, 'openai-research', { api: 'openai-completions' }), env: RESEARCH_KEY },
})
after(() => {
  research.cleanup()
  review.cleanup()
  yaml.cleanup()
  drift.cleanup()
})

const QUESTION = 'Which hosts render PDFs in a sandbox?'
const create = (w) => w.cmd('create', { text: QUESTION, role: 'sophia-research-md-v1', route: 'research-sol-medium-v1' })
const modelReserves = (ops) => ops.filter((o) => o.op === 'reserve' && o.body.kind === 'model')
const settles = (ops) => ops.filter((o) => o.op === 'settle')
const known = (value) => ({ class: 'known', value })
const UNKNOWN = { class: 'unknown' }

/** The first model settlement of a research attempt whose first model call answers `step`. */
async function researchCall(w, step) {
  await w.start()
  w.llm.script(step)
  w.send(create(w))
  await w.service.waitFor(() => settles(w.service.research).length >= 1, 90_000, 'the first model settlement')
  return { reserve: modelReserves(w.service.research)[0].body, settle: settles(w.service.research)[0].body }
}

/** The bridge's startup line for one route's evidence contract. */
const contractLine = (w, route) => new RegExp(`call_evidence route=${route} contract=(\\w+) reason=(\\w+)`).exec(w.stderr())?.slice(1)

describe('K04: the loaded decoder qualifies a complete report (deployed C1P runtime, JSON overlay)', () => {
  test('a completed call on research-sol-medium-v1: tracked, complete_report, the known counts and the response id kept whole', async (t) => {
    const w = await research.world(t)
    const { reserve, settle } = await researchCall(w, { text: 'ok', usage: { input_tokens: 5, output_tokens: 3, input_tokens_details: { cached_tokens: 2 } } })
    assert.deepEqual(contractLine(w, 'research-sol-medium-v1'), ['c1p_complete_report', 'qualified'])
    assert.equal(reserve.mode, 'tracked_v1')
    assert.equal(reserve.contract, 'c1p_complete_report')
    assert.deepEqual(reserve.declared, { routeId: 'research-sol-medium-v1', model: RESEARCH.model, reasoningEffort: RESEARCH.reasoningEffort, prices: RESEARCH.prices })
    assert.equal(settle.outcome, 'settled')
    assert.deepEqual(settle.evidence, {
      contract: 'c1p_complete_report',
      report: 'complete_report',
      counts: { nonCachedInput: known(3), cacheRead: known(2), cacheWrite: { class: 'no_separate_reported_class' }, output: known(3) },
      ending: 'stream_completed',
      responseId: { status: 'supported', value: 'resp_mock_1' },
    })
    assert.equal('providerRequestId' in settle, false, 'the legacy truncated id field is never used')
    assert.equal(JSON.stringify(settle.usage).includes('resp_mock_1'), false, 'no raw id in the legacy usage')
  })

  test('explicit provider zeros are known zeros, an omitted usage is not_complete with its id, a failure with usage is known', async (t) => {
    const zeros = await researchCall(await research.world(t), { text: 'ok', usage: { input_tokens: 0, output_tokens: 0, input_tokens_details: { cached_tokens: 0 } } })
    assert.deepEqual([zeros.settle.outcome, zeros.settle.costUsd], ['settled', 0])
    assert.deepEqual(zeros.settle.evidence.counts, { nonCachedInput: known(0), cacheRead: known(0), cacheWrite: { class: 'no_separate_reported_class' }, output: known(0) })
    const none = await researchCall(await research.world(t), { text: 'ok', omitUsage: true })
    assert.equal(none.settle.outcome, 'uncertain')
    assert.equal('costUsd' in none.settle, false)
    assert.deepEqual(none.settle.evidence, { contract: 'c1p_complete_report', report: 'not_complete',
      counts: { nonCachedInput: UNKNOWN, cacheRead: UNKNOWN, cacheWrite: UNKNOWN, output: UNKNOWN }, ending: 'stream_completed',
      responseId: { status: 'supported', value: 'resp_mock_1' } })
    const failed = await researchCall(await research.world(t), { text: 'partial', terminal: 'failed', usage: { input_tokens: 7, output_tokens: 3 } })
    assert.equal(failed.settle.outcome, 'settled')
    assert.equal(failed.settle.evidence.report, 'complete_report')
    assert.deepEqual(failed.settle.evidence.counts.output, known(3))
    assert.deepEqual(failed.settle.evidence.responseId, { status: 'unknown' }, 'the error finish carries no id: unknown, never invented')
  })

  test('a source review call on source-review-luna-high-v1 is qualified the same way', async (t) => {
    const w = await review.world(t)
    await w.start()
    w.llm.script({ text: 'ok' })
    w.send(w.cmd('create', { text: 'Source review task. Review the sources below.', role: 'sophia-source-review-v1', route: 'source-review-luna-high-v1' }))
    await w.service.waitFor(() => w.service.review.some((o) => o.op === 'settle'), 90_000, 'the first review settlement')
    assert.deepEqual(contractLine(w, 'source-review-luna-high-v1'), ['c1p_complete_report', 'qualified'])
    const reserve = w.service.review.find((o) => o.op === 'reserve').body
    const settle = w.service.review.find((o) => o.op === 'settle').body
    assert.deepEqual([reserve.mode, reserve.contract], ['tracked_v1', 'c1p_complete_report'])
    assert.equal(settle.evidence.report, 'complete_report')
  })

  test('a designer call (design roles run on the research route) is tracked and qualified through the design operations', async (t) => {
    const w = await research.world(t)
    await w.start()
    w.llm.script({ text: 'ok' })
    w.send(w.cmd('create', { text: 'Design the HTML report.', role: 'sophia-html-designer-v1', route: 'research-sol-medium-v1' }))
    await w.service.waitFor(() => w.service.design.some((o) => o.op === 'design/settle'), 90_000, 'the first design settlement')
    const reserve = w.service.design.find((o) => o.op === 'design/reserve').body
    const settle = w.service.design.find((o) => o.op === 'design/settle').body
    assert.deepEqual([reserve.mode, reserve.contract], ['tracked_v1', 'c1p_complete_report'])
    assert.equal(settle.evidence.report, 'complete_report')
  })
})

/**
 * A private copy of the recorded runtime with BOTH committed C1P patches reversed (the upstream pre-C1P pi-ai and
 * dsh-llm-pi-ai bytes), under the same unit label, with its own locally correct runtime record.
 */
function preC1pRuntime(scratch) {
  const dir = join(scratch, 'runtime')
  cpSync(RUNTIME_DIR, dir, { recursive: true, verbatimSymlinks: true })
  const store = join(dir, 'node_modules', '.pnpm')
  for (const [prefix, scope, name, patch] of [
    ['@earendil-works+pi-ai@0.87.1', '@earendil-works', 'pi-ai', '@earendil-works__pi-ai@0.87.1.patch'],
    ['@deepseek-ai+dsh-llm-pi-ai@0.2.0-rc.2', '@deepseek-ai', 'dsh-llm-pi-ai', '@deepseek-ai__dsh-llm-pi-ai@0.2.0-rc.2.patch'],
  ]) {
    const copies = readdirSync(store).filter((entry) => entry.startsWith(prefix))
    assert.equal(copies.length, 1, `one ${name} in the runtime closure`)
    const reversed = spawnSync('git', ['apply', '-R', join(REPO_ROOT, 'patches', patch)], { cwd: join(store, copies[0], 'node_modules', scope, name), encoding: 'utf8' })
    assert.equal(reversed.status, 0, reversed.stderr)
  }
  const local = structuredClone(unit)
  local.dsh.artifacts_by_platform[platformKey()].digest = treeDigest(dir).digest
  assertRecordedArtifacts(local, dir)
  return { dir, unit: local }
}

describe('K04: an unqualified loaded decoder is an honest legacy_report (tracked, known usage kept)', () => {
  test('the pre-C1P SDK runtime under the same unit label: runtime_not_c1p', async (t) => {
    const scratch = mkdtempSync(join(tmpdir(), 'sophia-call-evidence-pre-c1p-'))
    t.after(() => rmSync(scratch, { recursive: true, force: true }))
    const pre = preC1pRuntime(scratch)
    assert.notEqual(pre.unit.dsh.artifacts_by_platform[platformKey()].digest, C1P_RUNTIMES[platformKey()], 'other runtime bytes under the same label')
    const layout = homeLayout(join(scratch, 'home'))
    installProfile({ unit: pre.unit, runtimeDir: pre.dir, layout })
    const service = await startFixtureService({ runtimeUnitId: unit.id })
    const llm = await startMockResponses()
    const runtime = launchRuntime({ unit: pre.unit, runtimeDir: pre.dir, layout, bridge: service, overlays: [providerOverlayJson(bundlePatch, llm.baseURL, 'openai-research')], extraEnv: RESEARCH_KEY })
    t.after(async () => {
      await runtime.stop()
      await service.close()
      await llm.close()
    })
    await service.waitFor(() => service.readiness.some((r) => r.state === 'ready'), 30_000, 'bridge readiness')
    llm.script({ text: 'ok' })
    service.enqueue(command('create', { attemptId: 'att-pre', runtimeUnitId: unit.id, text: QUESTION, role: 'sophia-research-md-v1', route: 'research-sol-medium-v1' }))
    await service.waitFor(() => settles(service.research).length >= 1, 90_000, 'the first model settlement')
    assert.deepEqual(/call_evidence route=research-sol-medium-v1 contract=(\w+) reason=(\w+)/.exec(runtime.stderr())?.slice(1), ['legacy_report', 'runtime_not_c1p'])
    const reserve = modelReserves(service.research)[0].body
    const settle = settles(service.research)[0].body
    assert.deepEqual([reserve.mode, reserve.contract], ['tracked_v1', 'legacy_report'])
    assert.equal(settle.evidence.contract, 'legacy_report')
    assert.notEqual(settle.evidence.report, 'complete_report', 'never claimed complete')
  })

  test('an API drift of the route provider in the effective overlay: provider_api_unqualified', async (t) => {
    const w = await drift.world(t)
    await w.start()
    w.send(create(w))
    await w.service.waitFor(() => modelReserves(w.service.research).length >= 1, 90_000, 'the first model reservation')
    assert.deepEqual(contractLine(w, 'research-sol-medium-v1'), ['legacy_report', 'provider_api_unqualified'])
    assert.deepEqual([modelReserves(w.service.research)[0].body.mode, modelReserves(w.service.research)[0].body.contract], ['tracked_v1', 'legacy_report'])
  })

  test('an unverifiable launch (a YAML overlay outside the service composition): closure_unverifiable, usage still known', async (t) => {
    const w = await yaml.world(t)
    const { reserve, settle } = await researchCall(w, { text: 'ok', usage: { input_tokens: 4, output_tokens: 2 } })
    assert.deepEqual(contractLine(w, 'research-sol-medium-v1'), ['legacy_report', 'closure_unverifiable'])
    assert.deepEqual([reserve.mode, reserve.contract], ['tracked_v1', 'legacy_report'])
    assert.equal(settle.outcome, 'settled')
    assert.equal(settle.evidence.report, 'legacy_usage')
    assert.deepEqual([settle.evidence.counts.nonCachedInput, settle.evidence.counts.output], [known(4), known(2)])
  })
})

describe('C01: a reservation answer that is not this exact call refuses the call before any provider request', () => {
  /** The service's own answer for `body`, then `tamper` applied to it. */
  const tampered = (tamper) => (body) => {
    const base = { reservationId: '00000000-0000-4000-8000-000000007777', state: 'reserved', kind: body.kind, purpose: body.purpose ?? 'call', amountUsd: body.amountUsd, target: null,
      binding: { mode: body.mode, contract: body.contract, evidenceId: '00000000-0000-4000-8000-000000007778', callId: body.callId, attemptId: body.attemptId,
        nativeSessionId: body.nativeSessionId, projectId: 'proj-fixture', runtimeUnitId: unit.id } }
    return body.kind === 'model' ? tamper(base) : base
  }
  const cases = [
    ['no binding (an old service)', (a) => { delete a.binding; return a }, 'missing'],
    ['another call', (a) => ({ ...a, binding: { ...a.binding, callId: 'llm-another' } }), 'call'],
    ['another attempt', (a) => ({ ...a, binding: { ...a.binding, attemptId: 'att-another' } }), 'call'],
    ['another native session', (a) => ({ ...a, binding: { ...a.binding, nativeSessionId: 'sophia-another' } }), 'call'],
    ['another project', (a) => ({ ...a, binding: { ...a.binding, projectId: 'proj-another' } }), 'scope'],
    ['another runtime unit', (a) => ({ ...a, binding: { ...a.binding, runtimeUnitId: 'another-unit' } }), 'scope'],
    ['another contract', (a) => ({ ...a, binding: { ...a.binding, contract: 'legacy_report' } }), 'mode'],
    ['an already ended reservation', (a) => ({ ...a, state: 'settled' }), 'reservation'],
    ['another amount', (a) => ({ ...a, amountUsd: a.amountUsd + 1 }), 'reservation'],
  ]
  for (const [what, tamper, problem] of cases) {
    test(`${what}: refused (${problem}), no provider request, no new key, nothing settled or released`, async (t) => {
      const w = await research.world(t)
      await w.start()
      w.service.onResearch('reserve', tampered(tamper))
      w.llm.script({ text: 'ok' })
      w.send(create(w))
      await w.service.waitFor(() => w.turnEnds().length >= 1, 90_000, 'the refused turn')
      assert.equal(w.llm.requests.length, 0, 'nothing reached the provider')
      assert.equal(modelReserves(w.service.research).length, 1, 'one reservation, under its original key: no retry made a new one')
      assert.equal(settles(w.service.research).length, 0, 'nothing settled, released or zeroed')
      const refused = w.journal().filter((r) => r.type === 'sophia/spend-refused')
      assert.ok(refused.some((r) => r.data.reason.includes(`its answer is not this call's reservation: ${problem}`)), JSON.stringify(refused))
    })
  }

  test('distinct authorized retries keep their own reservations: a 500 then a success is two tracked, bound calls (P01)', async (t) => {
    const w = await research.world(t)
    await w.start()
    w.llm.script({ status: 500 }, { text: 'ok' })
    w.send(create(w))
    await w.service.waitFor(() => settles(w.service.research).length >= 2, 120_000, 'both settlements')
    const reserves = modelReserves(w.service.research)
    assert.equal(w.llm.requests.length, 2)
    assert.equal(reserves.length, 2)
    assert.notEqual(reserves[0].body.callId, reserves[1].body.callId, 'a new key only for a genuinely new provider request')
    const [first, second] = settles(w.service.research).map((s) => s.body)
    assert.equal(first.outcome, 'uncertain', 'the failed attempt keeps its own uncertainty')
    assert.equal(first.evidence.report, 'not_complete')
    assert.equal(second.outcome, 'settled')
    assert.equal(second.evidence.report, 'complete_report')
  })
})

describe('K03: a response id is kept whole only when supported, and never anywhere else', () => {
  const unsupported = [
    ['an id over 8192 UTF-8 bytes', 'é'.repeat(4097), 'over_bound'],
    ['an empty id', '', 'empty'],
    ['an id with NUL', 'resp_\u0000x', 'nul'],
    ['an id with an unpaired surrogate', 'resp_\uD800x', 'unpaired_surrogate'],
    ['a non-string id', 42, 'not_string'],
  ]
  for (const [what, id, reason] of unsupported) {
    test(`${what}: omitted with ${reason}, the known usage kept`, async (t) => {
      const w = await research.world(t)
      const { settle } = await researchCall(w, { text: 'ok', responseId: id, usage: { input_tokens: 2, output_tokens: 1 } })
      assert.deepEqual(settle.evidence.responseId, { status: 'identity_unsupported', reason })
      assert.equal(settle.outcome, 'settled')
      assert.deepEqual(settle.evidence.counts.output, known(1))
    })
  }

  test('a supported id of exactly 8192 UTF-8 bytes of escape-heavy text is kept whole, and only in the settlement', async (t) => {
    const id = '\u0001'.repeat(8192)
    assert.deepEqual(classifyResponseId(id), { status: 'supported', value: id })
    const w = await research.world(t)
    const { settle } = await researchCall(w, { text: 'ok', responseId: id })
    assert.deepEqual(settle.evidence.responseId, { status: 'supported', value: id })
    assert.ok(JSON.stringify(settle).length < 256 * 1024, 'the whole settlement body fits the tightest route (source review, 256 KiB)')
    const journalFile = join(w.layout.dshHome, 'sophia-bridge', `sophia-${w.attemptId}.jsonl`)
    const journal = existsSync(journalFile) ? readFileSync(journalFile, 'utf8') : ''
    for (const [where, text] of [['journal', journal], ['observations', JSON.stringify(w.service.observations)], ['log', w.stderr()], ['legacy usage', JSON.stringify(settle.usage)]]) {
      assert.equal(text.includes('\\u0001'.repeat(16)) || text.includes('\u0001'.repeat(16)), false, `no raw id in the ${where}`)
    }
  })
})

describe('K04: the qualifier itself, on closed inputs (no constant-only check: each input is a real layer shape)', () => {
  const routes = Object.fromEntries(Object.entries(unit.model_routes).map(([id, r]) => [id, { provider: r.provider, model: r.model, reasoningEffort: r.reasoningEffort, maxTokens: r.maxTokens, prices: r.prices }]))
  const qualified = { runtime: C1P_RUNTIMES[platformKey()], platform: platformKey(), layers: [Buffer.from('[]')] }

  test('the bundle layer the qualifier assumes is the committed cordis.patch.yml, provider by provider', () => {
    const bundle = parseCordisYaml(bundlePatch).find((row) => row.id === 'llm-pi-ai').config.providers
    for (const [provider, api] of Object.entries(BUNDLE_PROVIDER_APIS)) assert.equal(bundle[provider].api, api)
    for (const [id, route] of Object.entries(C1P_ROUTES)) {
      assert.deepEqual({ provider: routes[id].provider, model: routes[id].model, reasoningEffort: routes[id].reasoningEffort }, route, `${id} is the recorded route`)
    }
    assert.equal(C1P_RUNTIMES[platformKey()], unit.dsh.artifacts_by_platform[platformKey()].digest, 'the recorded runtime is the qualified C1P runtime')
  })

  test('the last layer naming llm-pi-ai decides; an unreadable provider map or a closure that cannot be read is legacy', () => {
    const layer = (api) => Buffer.from(JSON.stringify([{ id: 'llm-pi-ai', config: { providers: { 'openai-research': { api } } } }]))
    assert.equal(effectiveProviderApis([Buffer.from('[]')])['openai-research'], C1P_API)
    assert.equal(effectiveProviderApis([layer('openai-completions'), layer(C1P_API)])['openai-research'], C1P_API)
    assert.equal(effectiveProviderApis([layer(C1P_API), layer('openai-completions')])['openai-research'], 'openai-completions')
    assert.equal(effectiveProviderApis([Buffer.from(JSON.stringify([{ id: 'llm-pi-ai', config: { providers: 'none' } }]))]), null)
    const out = evidenceQualifications(routes, () => qualified)
    assert.deepEqual(out['research-sol-medium-v1'], { contract: 'c1p_complete_report', why: 'qualified' })
    assert.deepEqual(out['conversation-service-luna-high-v1'], { contract: 'legacy_report', why: 'route_unqualified' })
    assert.deepEqual(evidenceQualifications(routes, () => { throw new Error('unreadable') })['research-sol-medium-v1'], { contract: 'legacy_report', why: 'closure_unverifiable' })
    assert.deepEqual(evidenceQualifications({ ...routes, 'research-sol-medium-v1': { ...routes['research-sol-medium-v1'], reasoningEffort: 'high' } }, () => qualified)['research-sol-medium-v1'],
      { contract: 'legacy_report', why: 'route_unqualified' })
  })
})
