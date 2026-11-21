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
 * - REPAIR-001 F03: the answer must also name the executor resource of the attempt's authenticated commands, for all
 *   three wrappers; that resource is journaled with each command and restored across a restart, a conflicting one is
 *   ambiguous for good, and a refusal happens before any provider request with the original key kept. The fixture's
 *   resources and the forged command resource below are LABELLED SYNTHETIC; nothing is an actual server context.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { REPO_ROOT, RUNTIME_DIR, platformKey } from '../../scripts/lib/common.mjs'
import { parseCordisYaml } from '../../scripts/lib/patch-lint.mjs'
import { assertRecordedArtifacts, homeLayout, installProfile } from '../../scripts/lib/profile.mjs'
import { launchRuntime } from '../../scripts/lib/runtime.mjs'
import { treeDigest } from '../../scripts/lib/tree-digest.mjs'
import { C1P_API, C1P_ROUTES, C1P_RUNTIMES, BUNDLE_PROVIDER_APIS, effectiveProviderApis, evidenceQualifications } from '../../packages/dsh-bundle/dist/index.js'
import { classifyResponseId } from '../../packages/dsh-bundle/dist/control-bridge.js'
import { FIXTURE_RESOURCE, command, startFixtureService } from '../support/fixture-service.mjs'
import { suite, unit } from '../support/harness.mjs'
import { providerOverlayJson, recordedRouteOverlay, researchRouteOverlay, startMockResponses } from '../support/mock-responses.mjs'

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
// C2B: the recorded default `openai` route (unpriced, openai-responses) pointed at the double, for the unpriced branch.
const unpriced = suite('sophia-call-evidence-unpriced', {
  model: { start: startMockResponses, overlay: (baseURL) => recordedRouteOverlay(bundlePatch, baseURL), env: { OPENAI_API_KEY: 'sk-sophia-call-evidence-unpriced-dummy' } },
})
after(() => {
  unpriced.cleanup()
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
    assert.equal(reserve.facts, 'observed_v1', 'C2B: the qualified producer opts in')
    assert.deepEqual(reserve.declared, { routeId: 'research-sol-medium-v1', model: RESEARCH.model, reasoningEffort: RESEARCH.reasoningEffort, prices: RESEARCH.prices })
    assert.equal(settle.outcome, 'settled')
    assert.deepEqual(settle.evidence, {
      contract: 'c1p_complete_report',
      report: 'complete_report',
      counts: { nonCachedInput: known(3), cacheRead: known(2), cacheWrite: { class: 'no_separate_reported_class' }, output: known(3) },
      ending: 'stream_completed',
      responseId: { status: 'supported', value: 'resp_mock_1' },
      // C2B: what the patched producer's frames actually delivered, beside (never instead of) the C1P facts.
      observed: {
        sent: 'observable_transport_response', httpStatus: 200, n1: { id: { status: 'supported', value: 'resp_mock_1' }, sources: ['created', 'completed'] },
        providerTerminal: 'completed', rawCounts: { inputTotal: 5, cacheRead: 2, output: 3 }, deliveryUnknownReason: 'none',
      },
    })
    assert.match(w.stderr(), /call_observation route=research-sol-medium-v1 observed=on reason=qualified/)
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
      responseId: { status: 'supported', value: 'resp_mock_1' },
      observed: { sent: 'observable_transport_response', httpStatus: 200, n1: { id: { status: 'supported', value: 'resp_mock_1' }, sources: ['created', 'completed'] },
        providerTerminal: 'completed', deliveryUnknownReason: 'none' } })
    const failed = await researchCall(await research.world(t), { text: 'partial', terminal: 'failed', usage: { input_tokens: 7, output_tokens: 3 } })
    assert.equal(failed.settle.outcome, 'settled')
    assert.equal(failed.settle.evidence.report, 'complete_report')
    assert.deepEqual(failed.settle.evidence.counts.output, known(3))
    assert.deepEqual(failed.settle.evidence.responseId, { status: 'unknown' }, 'the error finish carries no id: unknown, never invented')
    // C2B: the failed response's OWN id reaches the private observation (source failed); the A57 replay field stays as it was.
    assert.deepEqual(failed.settle.evidence.observed.n1, { id: { status: 'supported', value: 'resp_mock_1' }, sources: ['created', 'failed'] })
    // The double reports cached_tokens 0 by default beside the step's own counts: a known zero, kept as one.
    assert.deepEqual([failed.settle.evidence.observed.providerTerminal, failed.settle.evidence.observed.rawCounts], ['failed', { inputTotal: 7, cacheRead: 0, output: 3 }])
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
    let service
    let llm
    let runtime
    t.after(async () => {
      await runtime?.stop()
      await service?.close()
      await llm?.close()
      rmSync(scratch, { recursive: true, force: true })
    })
    const pre = preC1pRuntime(scratch)
    assert.notEqual(pre.unit.dsh.artifacts_by_platform[platformKey()].digest, C1P_RUNTIMES[platformKey()], 'other runtime bytes under the same label')
    const layout = homeLayout(join(scratch, 'home'))
    installProfile({ unit: pre.unit, runtimeDir: pre.dir, layout })
    service = await startFixtureService({ runtimeUnitId: unit.id })
    llm = await startMockResponses()
    runtime = launchRuntime({ unit: pre.unit, runtimeDir: pre.dir, layout, bridge: service, overlays: [providerOverlayJson(bundlePatch, llm.baseURL, 'openai-research')], extraEnv: RESEARCH_KEY })
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
    // C2B: an unqualified runtime opts in to nothing and provides no capability: v1 exactly, no observation.
    assert.match(runtime.stderr(), /call_observation route=research-sol-medium-v1 observed=off reason=runtime_not_c2b/)
    assert.equal('facts' in reserve, false)
    assert.equal('observed' in settle.evidence, false)
  })

  test('an API drift of the route provider in the effective overlay: provider_api_unqualified', async (t) => {
    const w = await drift.world(t)
    await w.start()
    w.send(create(w))
    await w.service.waitFor(() => modelReserves(w.service.research).length >= 1, 90_000, 'the first model reservation')
    assert.deepEqual(contractLine(w, 'research-sol-medium-v1'), ['legacy_report', 'provider_api_unqualified'])
    assert.match(w.stderr(), /call_observation route=research-sol-medium-v1 observed=off reason=provider_api_unqualified/)
    assert.equal('facts' in modelReserves(w.service.research)[0].body, false)
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
        nativeSessionId: body.nativeSessionId, projectId: 'proj-fixture', runtimeUnitId: unit.id, resourceId: FIXTURE_RESOURCE,
        // C2B: the service's own echo of an opted-in request, so each tamper below changes only its own field.
        ...(body.facts === undefined ? {} : { facts: body.facts }) } }
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
    // C2B (A58 SI01): an old or partial service that does not echo the opt-in never silently falls back to v1.
    ['no facts echo for an opted-in call (an old or partial service)', (a) => { delete a.binding.facts; return a }, 'facts'],
    // Another version is not even a valid reply: the closed wire refuses it before the binding is compared.
    ['another facts version', (a) => ({ ...a, binding: { ...a.binding, facts: 'observed_v2' } }), 'facts', '/binding/facts must be equal to one of the allowed values'],
    ['an already ended reservation', (a) => ({ ...a, state: 'settled' }), 'reservation'],
    ['another amount', (a) => ({ ...a, amountUsd: a.amountUsd + 1 }), 'reservation'],
  ]
  for (const [what, tamper, problem, refusal = `its answer is not this call's reservation: ${problem}`] of cases) {
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
      assert.ok(refused.some((r) => r.data.reason.includes(refusal)), JSON.stringify(refused))
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

describe('REPAIR-001 F03: the answer names the attempt\'s authenticated executor resource, for all three wrappers', () => {
  /** The service's own answer for `body` with its binding's resource dropped (`undefined`) or replaced. */
  const withResource = (resourceId) => (body) => {
    const answer = { reservationId: '00000000-0000-4000-8000-000000007779', state: 'reserved', kind: body.kind, purpose: body.purpose ?? 'call', amountUsd: body.amountUsd, target: null }
    if (body.kind !== 'model') return answer
    const binding = { mode: body.mode, contract: body.contract, evidenceId: '00000000-0000-4000-8000-000000007780', callId: body.callId, attemptId: body.attemptId,
      nativeSessionId: body.nativeSessionId, projectId: 'proj-fixture', runtimeUnitId: unit.id, ...(body.facts === undefined ? {} : { facts: body.facts }) }
    return { ...answer, binding: resourceId === undefined ? binding : { ...binding, resourceId } }
  }
  const wrappers = [
    { name: 'research', suite: () => research, role: 'sophia-research-md-v1', route: 'research-sol-medium-v1', text: QUESTION,
      answer: (w, h) => w.service.onResearch('reserve', h), reserves: (w) => modelReserves(w.service.research), settles: (w) => settles(w.service.research) },
    { name: 'design', suite: () => research, role: 'sophia-html-designer-v1', route: 'research-sol-medium-v1', text: 'Design the HTML report.',
      answer: (w, h) => w.service.onDesign('design/reserve', h), reserves: (w) => w.service.design.filter((o) => o.op === 'design/reserve'), settles: (w) => w.service.design.filter((o) => o.op === 'design/settle') },
    { name: 'source review', suite: () => review, role: 'sophia-source-review-v1', route: 'source-review-luna-high-v1', text: 'Source review task. Review the sources below.',
      answer: (w, h) => w.service.onReview('reserve', h), reserves: (w) => w.service.review.filter((o) => o.op === 'reserve'), settles: (w) => w.service.review.filter((o) => o.op === 'settle') },
  ]
  const cases = [
    // A VALID old-shape answer (no resource): before F03 its call reached the provider.
    ['an old-shape answer without the resource', undefined, null],
    ['an answer naming another resource', 'dsh-other', "its answer is not this call's reservation: resource"],
  ]
  for (const wr of wrappers) {
    for (const [what, resourceId, reason] of cases) {
      test(`${wr.name}: ${what} is refused before any provider request; one reservation, its key kept, nothing settled`, async (t) => {
        const w = await wr.suite().world(t)
        await w.start()
        wr.answer(w, withResource(resourceId))
        w.llm.script({ text: 'ok' })
        w.send(w.cmd('create', { text: wr.text, role: wr.role, route: wr.route }))
        // Ends on the refusal OR on a provider request, so a call that leaves fails on the provider assertion below.
        await w.service.waitFor(() => w.journal().some((r) => r.type === 'sophia/spend-refused') || w.llm.requests.length > 0, 90_000, 'the refused call')
        assert.equal(w.llm.requests.length, 0, 'nothing reached the provider')
        await w.service.waitFor(() => w.turnEnds().length >= 1, 30_000, 'the refused turn')
        // Design and review re-send an answer that breaks the contract as an unknown outcome, under the SAME callId (a
        // safe resend); research does not. Either way: one reservation key, never a new one.
        const keys = new Set(wr.reserves(w).map((o) => o.body.callId))
        assert.equal(keys.size, 1, `one reservation under its original key, no new key: ${JSON.stringify([...keys])}`)
        assert.ok(wr.reserves(w).length >= 1)
        assert.equal(wr.settles(w).length, 0, 'nothing settled, released or zeroed')
        const refused = w.journal().filter((r) => r.type === 'sophia/spend-refused').map((r) => r.data.reason)
        if (reason) assert.ok(refused.some((r) => r.includes(reason)), JSON.stringify(refused))
      })
    }
  }

  test('the correct resource is journaled with each command and answered back; the call leaves (positive)', async (t) => {
    const w = await research.world(t)
    const { reserve, settle } = await researchCall(w, { text: 'ok' })
    assert.equal(settle.outcome, 'settled')
    assert.ok(reserve.callId)
    const commands = w.journal().filter((r) => r.type === 'sophia/command')
    assert.ok(commands.length >= 1 && commands.every((r) => r.data.resourceId === FIXTURE_RESOURCE), JSON.stringify(commands.map((r) => r.data.resourceId)))
    assert.equal(w.llm.requests.length, 1)
  })

  /** A research attempt whose first call settled, then a restart with the service still binding it (active). */
  async function restarted(w, rewrite = null) {
    await w.start()
    w.llm.script({ text: 'ok' }, { text: 'second' })
    w.send(create(w))
    await w.service.waitFor(() => settles(w.service.research).length >= 1, 90_000, 'the first model settlement')
    await w.service.waitFor(() => w.turnEnds().length >= 1, 30_000, 'the first turn')
    await w.stop()
    if (rewrite) rewrite()
    w.service.setBindings([{ attemptId: w.attemptId, nativeSessionId: `sophia-${w.attemptId}`, authorityEpoch: 1, state: 'active' }])
    await w.start()
    return { requests: w.llm.requests.length, reserves: modelReserves(w.service.research).length }
  }

  test('restart: the restored resource is not replaced by a command naming another; the call is refused as ambiguous, and Stop still works', async (t) => {
    const w = await research.world(t)
    const before = await restarted(w)
    // LABELLED SYNTHETIC: a command for the same attempt naming another resource (a stale or forged context).
    w.send(w.cmd('input', { text: 'Also compare the costs.', resourceId: 'dsh-other' }))
    await w.service.waitFor(() => w.journal().some((r) => r.type === 'sophia/spend-refused') || w.llm.requests.length > before.requests, 60_000, 'the refused call after the restart')
    assert.equal(w.llm.requests.length, before.requests, 'nothing reached the provider')
    const refused = w.journal().filter((r) => r.type === 'sophia/spend-refused').map((r) => r.data.reason)
    assert.ok(refused.some((r) => r.includes('its attempt has no authenticated executor resource: ambiguous')), JSON.stringify(refused))
    assert.equal(w.llm.requests.length, before.requests, 'nothing reached the provider')
    assert.equal(modelReserves(w.service.research).length, before.reserves, 'refused before reserving: no new reservation or key')
    const stop = w.send(w.cmd('stop'))
    const receipt = await w.service.waitForReceipt(stop.commandId, null, 30_000)
    assert.notEqual(receipt.stage, 'rejected', 'resource ambiguity never blocks a qualified Stop')
  })

  test('restart over a LABELLED SYNTHETIC legacy journal (no resource): unknown until a legitimate command names it, then the call leaves', async (t) => {
    const w = await research.world(t)
    const file = () => join(w.layout.dshHome, 'sophia-bridge', `sophia-${w.attemptId}.jsonl`)
    const before = await restarted(w, () => {
      const legacy = readFileSync(file(), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
        .map((r) => (r.type === 'sophia/command' ? { ...r, data: Object.fromEntries(Object.entries(r.data).filter(([k]) => k !== 'resourceId')) } : r))
      writeFileSync(file(), `${legacy.map((r) => JSON.stringify(r)).join('\n')}\n`)
    })
    assert.equal(w.journal().filter((r) => r.type === 'sophia/command' && 'resourceId' in r.data).length, 0, 'the restarted journal is legacy')
    w.send(w.cmd('input', { text: 'Also compare the costs.' }))
    await w.service.waitFor(() => settles(w.service.research).length >= 2, 90_000, 'the second settlement')
    assert.equal(w.llm.requests.length, before.requests + 1)
    assert.equal(modelReserves(w.service.research).at(-1).body.mode, 'tracked_v1')
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

// --- C2B-DURABLE-001 (A58, 0110): the closed observed facts through the three maintained authenticated wrappers ----------
//
// The real API app and its authenticated runtime routes over a disposable PostgreSQL: research (2 MiB), design (1 MiB) and
// source review (256 KiB, the tightest). A FULL worst-escaped settlement: every populated A57 field with its supported
// responseId at the 8192-byte maximum, plus the observation's two new supported 8192-byte ids (n1 the same namespace as
// responseId, n2 its own), each \u0001 / \u0002 escaped to 6 bytes per byte, every observed member populated. The reserve
// / ACK checks prove the SERVER's negotiation only: no SDK producer emits an observation here, so the producer's refusal
// before effect and its activation stay a later composition proof. LABELLED SYNTHETIC: project, runtime, token, ids and
// the design / review attempts (inserted by the migration owner, as the persistence DB tests do); no provider or account.
const dbEnabled = Boolean(process.env.SOPHIA_DISPOSABLE_DATABASE_URL)
describe('C2B: the closed observed facts at the three maintained wrappers, full worst-escaped envelope, real API and PostgreSQL', { skip: dbEnabled ? false : 'needs SOPHIA_DISPOSABLE_DATABASE_URL (a disposable PostgreSQL)' }, () => {
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
  const owner = async (sql, params) => (await ownerPool.query(sql, params)).rows

  /** A project-funded research attempt delivered to a runtime that speaks only through the authenticated HTTP routes. */
  async function attempt() {
    const { projectId } = await m.testSupport.seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [] })
    await owner(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [projectId])
    const rt = await m.testSupport.registerRuntime(db.ownerUrl, { projectId, admin: A })
    const headers = { authorization: `Bearer ${rt.token}`, 'x-sophia-runtime-unit': rt.runtimeUnitId, 'x-sophia-bridge-instance': `b-${crypto.randomUUID().slice(0, 8)}`, 'x-sophia-bridge-protocol': '1' }
    const call = async (path, body) => {
      const res = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
      const text = await res.text()
      return { status: res.status, text, json: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null }
    }
    assert.equal((await call('/v1/runtime/hello', { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] })).status, 200)
    assert.equal((await call('/v1/runtime/ready', { state: 'ready', reason: null, unrecovered: [] })).status, 204)
    const admitted = await m.persistence.withActor(pool, E, 'write', (c) => m.persistence.admitResearchTask(c, projectId, {
      key: crypto.randomUUID(), exchangeId: crypto.randomUUID(),
      request: { question: QUESTION, outputs: ['markdown'] }, specialist: { role: MD.id, route: MD.route },
    }))
    assert.ok('admitted' in admitted, JSON.stringify(admitted))
    for (const row of await m.persistence.claimRuntimeOutbox(workerPool, 'c2b-http', 50, 30)) await m.persistence.dispatchRuntimeOutbox(workerPool, row.project_id, row.id, row.lease_token)
    const create = (await call('/v1/runtime/commands?after=0&waitMs=0')).json.commands.map((q) => q.command).find((c) => c.binding.attemptId === admitted.admitted.attemptId)
    assert.ok(create, 'the create reached the runtime over HTTP')
    const at = { attemptId: create.binding.attemptId, nativeSessionId: `sophia-${create.binding.attemptId}` }
    const receipt = { commandId: create.commandId, attemptId: at.attemptId, stage: 'delivered', nativeSessionId: at.nativeSessionId, nativeSequence: 1, evidenceRefs: [], observedAt: new Date().toISOString(), reason: null }
    assert.equal((await call('/v1/runtime/receipts', { receipts: [receipt] })).status, 204)
    return { projectId, call, at, taskId: admitted.admitted.taskId }
  }
  /**
   * LABELLED SYNTHETIC: a design (or source review) attempt on the same runtime as the research attempt `w`, inserted by the
   * migration owner with triggers off (design shares the research allowance; review gets its own project allowance).
   */
  async function synthetic(w, kind, seqOffset) {
    const c = await ownerPool.connect()
    const att = crypto.randomUUID()
    try {
      await c.query('BEGIN')
      await c.query('SET LOCAL session_replication_role = replica')
      const [row] = (await c.query(
        `SELECT wa.goal_id, to_jsonb(b) AS binding, to_jsonb(wa) AS attempt, to_jsonb(j) AS job, to_jsonb(rc) AS command, t.allowance_id
          FROM sophia.jobs j JOIN sophia.work_attempts wa ON wa.project_id=j.project_id AND wa.id=j.attempt_id
          JOIN sophia.execution_bindings b ON b.project_id=j.project_id AND b.attempt_id=j.attempt_id
          JOIN sophia.research_tasks t ON t.project_id=j.project_id AND t.job_id=j.id
          JOIN sophia.runtime_commands rc ON rc.project_id=j.project_id AND rc.binding_id=b.id
          WHERE j.id=$1 ORDER BY rc.seq DESC LIMIT 1`, [w.taskId])).rows
      const job = crypto.randomUUID()
      const binding = crypto.randomUUID()
      await c.query(`INSERT INTO sophia.work_attempts SELECT (jsonb_populate_record(NULL::sophia.work_attempts, $1::jsonb)).*`, [{ ...row.attempt, id: att }])
      await c.query(`INSERT INTO sophia.execution_bindings SELECT (jsonb_populate_record(NULL::sophia.execution_bindings, $1::jsonb)).*`, [{ ...row.binding, id: binding, attempt_id: att, native_session_id: `sophia-${att}` }])
      await c.query(`INSERT INTO sophia.jobs SELECT (jsonb_populate_record(NULL::sophia.jobs, $1::jsonb)).*`, [{ ...row.job, id: job, kind, attempt_id: att }])
      await c.query(`INSERT INTO sophia.runtime_commands SELECT (jsonb_populate_record(NULL::sophia.runtime_commands, $1::jsonb)).*`, [{ ...row.command, id: crypto.randomUUID(), outbox_id: crypto.randomUUID(), binding_id: binding, attempt_id: att, seq: Number(row.command.seq) + seqOffset }])
      if (kind === 'design') {
        await c.query(`INSERT INTO sophia.design_tasks(project_id,job_id,research_job_id,root_job_id,allowance_id,actor_id,artifact_id,base_version_id,markdown_sha256,
          language,targets,role,route) VALUES($1,$2,$3,$3,$4,$5,gen_random_uuid(),gen_random_uuid(),$6,'en','{w390-light}','sophia-html-designer-v1','research-sol-medium-v1')`,
          [w.projectId, job, w.taskId, row.allowance_id, E, 'a'.repeat(64)])
      } else {
        const manifest = crypto.randomUUID()
        await c.query(`INSERT INTO sophia.source_texts(project_id,source_id,body) VALUES($1,$2,$3)`, [w.projectId, manifest, JSON.stringify({ route: { id: 'source-review-luna-high-v1' } })])
        await c.query(`UPDATE sophia.jobs SET input_source_id=$2 WHERE project_id=$1 AND id=$3`, [w.projectId, manifest, job])
        const [allowance] = (await c.query(`INSERT INTO sophia.research_allowances(project_id,cap_usd,headroom_usd,source_policy,max_searches,max_reads)
          VALUES($1,0.5,0,'web-pilot-v1',0,0) RETURNING id`, [w.projectId])).rows
        await c.query(`INSERT INTO sophia.work_items(project_id,id,plan_id,plan_revision,execution_goal_id,allowance_id,accepted_by)
          VALUES($1,gen_random_uuid(),gen_random_uuid(),1,$2,$3,$4)`, [w.projectId, row.goal_id, allowance.id, E])
      }
      await c.query('COMMIT')
    } catch (err) {
      await c.query('ROLLBACK')
      throw err
    } finally {
      c.release()
    }
    return { attemptId: att, nativeSessionId: `sophia-${att}` }
  }
  /** Rows of every sophia table whose text holds `needle`. */
  async function tablesHolding(needle) {
    const tables = (await owner(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema='sophia' AND table_type='BASE TABLE'`)).map((r) => r.t)
    const hits = []
    for (const t of tables) {
      const [{ n }] = await owner(`SELECT count(*)::int AS n FROM sophia.${t} x WHERE strpos(x::text, $1)>0`, [needle])
      if (n > 0) hits.push(t)
    }
    return hits.sort()
  }

  const WRAPPERS = [
    { kind: 'research', reserve: '/v1/runtime/research/reserve', settle: '/v1/runtime/research/settle', provider: 'openai-research', limit: 2 * 1024 * 1024 },
    { kind: 'design', reserve: '/v1/runtime/design/reserve', settle: '/v1/runtime/design/settle', provider: 'openai-research', limit: 1024 * 1024 },
    { kind: 'source_review', reserve: '/v1/runtime/source-review/reserve', settle: '/v1/runtime/source-review/settle', provider: 'openai-review', limit: 256 * 1024 },
  ]
  const tracked = { mode: 'tracked_v1', contract: 'c1p_complete_report', declared: { routeId: 'research-sol-medium-v1', model: RESEARCH.model, reasoningEffort: RESEARCH.reasoningEffort, prices: RESEARCH.prices } }
  const DIMENSIONS = ['n1', 'n2', 'http_status', 'provider_terminal', 'input_total', 'cache_read', 'output', 'cross_c1p']
  /** An 8192-byte id: a printable sentinel, then \u0001 (or \u0002) filler escaped to 6 bytes per byte on the wire. */
  const worst = (sentinel, fill) => `${sentinel}${fill.repeat(8192 - sentinel.length)}`
  const fullSettle = (at, reservationId, n1, n2, conflicts) => ({
    ...at, reservationId, outcome: 'settled', costUsd: 0.0001, usage: { inputTokens: 1000, outputTokens: 50 },
    evidence: {
      contract: 'c1p_complete_report', report: 'complete_report',
      counts: { nonCachedInput: known(800), cacheRead: known(200), cacheWrite: { class: 'no_separate_reported_class' }, output: known(50) },
      ending: 'stream_completed', responseId: { status: 'supported', value: n1 },
      observed: {
        sent: 'observable_transport_response', httpStatus: 200,
        n1: { id: { status: 'supported', value: n1 }, sources: ['created', 'completed', 'incomplete', 'failed'] },
        n2: { id: { status: 'supported', value: n2 }, sources: ['response_header', 'typed_error'] },
        providerTerminal: 'completed', rawCounts: { inputTotal: 1000, cacheRead: 200, output: 50 },
        ...(conflicts ? { conflicts: DIMENSIONS.map((dimension) => ({ dimension, witness: 'a'.repeat(64) })) } : {}),
        deliveryUnknownReason: 'none',
      },
    },
  })

  test('every wrapper negotiates observed_v1 and takes the FULL worst-escaped envelope under its limit; ids stay private', async () => {
    const w = await attempt()
    const ats = { research: w.at, design: await synthetic(w, 'design', 1000), source_review: await synthetic(w, 'source_review', 2000) }
    // Every reserve first: a contradiction below restricts its (shared research / own review) allowance at once.
    const reserved = {}
    for (const r of WRAPPERS) {
      const at = ats[r.kind]
      const ask = { ...at, callId: `llm-${r.kind}`, kind: 'model', provider: r.provider, amountUsd: 0.1, purpose: 'call', ...tracked }
      const plain = await w.call(r.reserve, { ...ask, callId: `llm-${r.kind}-plain` })
      assert.equal(plain.status, 200, plain.text)
      assert.equal('facts' in plain.json.binding, false, `${r.kind}: an old client's binding is unchanged`)
      const opted = await w.call(r.reserve, { ...ask, facts: 'observed_v1' })
      assert.equal(opted.status, 200, opted.text)
      assert.deepEqual(opted.json.binding, { ...plain.json.binding, callId: ask.callId, evidenceId: opted.json.binding.evidenceId, facts: 'observed_v1' }, `${r.kind}: the full original binding plus facts`)
      reserved[r.kind] = opted
    }
    for (const r of WRAPPERS) {
      const at = ats[r.kind]
      const opted = reserved[r.kind]
      // The FULL worst-case envelope, with all eight reported witnesses (a contradiction: retained, no money).
      const S1 = `C2BN1${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
      const S2 = `C2BN2${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
      const body = JSON.stringify(fullSettle(at, opted.json.reservationId, worst(S1, '\u0001'), worst(S2, '\u0002'), true))
      const bytes = Buffer.byteLength(body, 'utf8')
      assert.ok(bytes > 3 * 6 * (8192 - 17) && bytes < 256 * 1024 && bytes < r.limit, `${r.kind}: ${bytes} bytes`)
      const settled = await w.call(r.settle, body)
      assert.equal(settled.status, 200, settled.text.slice(0, 300))
      assert.deepEqual([settled.json.evidence.disposition, settled.json.state], ['conflict', 'reserved'], `${r.kind}: reported witnesses are a contradiction, classified before money`)
      const [truth] = await owner(`SELECT octet_length(n1) AS a, octet_length(header_id) AS b, response_id=n1 AS same, w_n1 FROM sophia.research_call_truth WHERE reservation_id=$1`, [opted.json.reservationId])
      assert.deepEqual([truth.a, truth.b, truth.same, truth.w_n1], [8192, 8192, true, 'a'.repeat(64)], `${r.kind}: both ids kept whole, privately`)
      for (const s of [S1, S2]) {
        assert.deepEqual(await tablesHolding(s), ['research_call_truth'], `${r.kind}: ${s.slice(0, 5)} nowhere else`)
        assert.equal(logged.some((l) => l.includes(s)), false, `${r.kind}: not in the API log`)
        assert.equal([opted.text, settled.text].some((t) => t.includes(s)), false, `${r.kind}: not in any returned body`)
      }
    }
  })

  test('without reported witnesses the same full envelope settles its C1P money once on every wrapper', async () => {
    const w = await attempt()
    const ats = { research: w.at, design: await synthetic(w, 'design', 1000), source_review: await synthetic(w, 'source_review', 2000) }
    for (const r of WRAPPERS) {
      const at = ats[r.kind]
      const opted = await w.call(r.reserve, { ...at, callId: `llm-${r.kind}-ok`, kind: 'model', provider: r.provider, amountUsd: 0.1, purpose: 'call', ...tracked, facts: 'observed_v1' })
      assert.equal(opted.status, 200, opted.text)
      const body = JSON.stringify(fullSettle(at, opted.json.reservationId, worst(`C2BOK1${r.kind}`, '\u0001'), worst(`C2BOK2${r.kind}`, '\u0002'), false))
      const settled = await w.call(r.settle, body)
      assert.equal(settled.status, 200, settled.text.slice(0, 300))
      assert.deepEqual([settled.json.evidence.disposition, settled.json.state, settled.json.settledUsd], ['accepted', 'settled', 0.0001], r.kind)
      const again = await w.call(r.settle, body)
      assert.deepEqual([again.json.evidence.replay, again.json.state, again.json.settledUsd], [true, 'settled', 0.0001], `${r.kind}: once`)
    }
  })

  test('adverse: an oversize body, a malformed observation and an observation on a v1 reservation are refused without echo', async () => {
    const w = await attempt()
    const at = await synthetic(w, 'source_review', 1000)
    const ask = { ...at, kind: 'model', provider: 'openai-review', amountUsd: 0.1, purpose: 'call', ...tracked }
    const opted = await w.call('/v1/runtime/source-review/reserve', { ...ask, callId: 'llm-adv', facts: 'observed_v1' })
    const plain = await w.call('/v1/runtime/source-review/reserve', { ...ask, callId: 'llm-adv-v1' })
    assert.equal(opted.status + plain.status, 400)
    const CANARY = `C2BADV${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
    // Over 256 KiB at the review route: refused by its limit, not widened.
    const huge = fullSettle(at, opted.json.reservationId, worst(CANARY, '\u0001'), worst(`${CANARY}b`, '\u0002'), true)
    huge.usage = { ...huge.usage, pad: 'x'.repeat(256 * 1024) }
    const over = await w.call('/v1/runtime/source-review/settle', huge)
    assert.equal(over.status, 400, over.text.slice(0, 200))
    assert.equal(over.json.message, 'Request body is too large')
    assert.equal(over.text.includes(CANARY), false)
    // Malformed members: the route's closed schema refuses them; nothing is echoed.
    const good = fullSettle(at, opted.json.reservationId, 'resp_ok', 'req_ok', false)
    for (const [what, observed] of [
      ['null', null],
      ['an unknown key', { ...good.evidence.observed, c2b: CANARY }],
      ['an unsafe count', { ...good.evidence.observed, rawCounts: { inputTotal: 9007199254740992 } }],
      ['an 8193-byte id', { ...good.evidence.observed, n2: { id: { status: 'supported', value: worst(CANARY, 'x') + 'x' }, sources: ['response_header'] } }],
      ['no delivery stage', { sent: 'unknown' }],
    ]) {
      const res = await w.call('/v1/runtime/source-review/settle', { ...good, evidence: { ...good.evidence, observed } })
      assert.deepEqual([res.status, res.json.code], [422, 'invalid_request'], `${what}: ${res.text.slice(0, 200)}`)
      assert.equal(res.text.includes(CANARY), false, `${what}: no echo`)
    }
    // A duplicate source passes the wire schema and is refused by the service's closed check (one fixed message).
    const dup = await w.call('/v1/runtime/source-review/settle', { ...good, evidence: { ...good.evidence, observed: { ...good.evidence.observed, n2: { id: { status: 'supported', value: CANARY }, sources: ['typed_error', 'typed_error'] } } } })
    assert.deepEqual([dup.status, dup.json.code, dup.json.message], [422, 'invalid_request', 'Invalid observed facts'], dup.text.slice(0, 200))
    assert.equal(dup.text.includes(CANARY), false)
    // A v1 (not opted-in) reservation takes no observation.
    const v1 = await w.call('/v1/runtime/source-review/settle', { ...fullSettle(at, plain.json.reservationId, 'resp_v1', 'req_v1', false) })
    assert.deepEqual([v1.status, v1.json.code, v1.json.message], [422, 'invalid_request', 'Invalid settlement evidence'], v1.text.slice(0, 200))
    assert.deepEqual(await tablesHolding(CANARY), [], 'nothing refused was kept')
    assert.equal(logged.some((l) => l.includes(CANARY)), false, 'not in the API log')
  })

  /**
   * INC04-R07-C2B-PRODUCER-001: the producer's own serialization end to end. The real pinned runtime (patched SDK,
   * real bridge) talks to this real API through a recording pass-through, answers its research call from the double
   * with a worst-escaped 8192-byte N1 (control characters, 6 bytes each on the wire) and a worst-escaped 8192-byte N2
   * header (backslashes, 2 bytes each), and settles on the ORIGINAL ledger row. The settlement the bridge actually sent
   * is then replayed byte for byte (an idempotent replay, and again across an API restart), and the same serializer
   * output, rebound only to their own reservations, crosses the design and source-review wrappers under their real
   * body limits.
   */
  test('C2B producer: the real runtime\'s observed facts reach the original ledger; replay and API restart keep them', async (t) => {
    const { createServer } = await import('node:http')
    const settlesSent = []
    const reservesSent = []
    const proxy = createServer(async (req, res) => {
      const chunks = []
      for await (const c of req) chunks.push(c)
      const raw = Buffer.concat(chunks)
      const record = req.method === 'POST' && (req.url.endsWith('/settle') || req.url.endsWith('/reserve')) ? { path: req.url, raw: raw.toString('utf8'), instance: req.headers['x-sophia-bridge-instance'] } : null
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'content-length', 'connection'].includes(k)))
      try {
        const answer = await fetch(`${base}${req.url}`, { method: req.method, headers, ...(raw.length > 0 ? { body: raw } : {}) })
        const body = Buffer.from(await answer.arrayBuffer())
        if (record) (record.path.endsWith('/reserve') ? reservesSent : settlesSent).push({ ...record, status: answer.status, answer: body.toString('utf8') })
        res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/json' })
        res.end(body)
      } catch {
        res.writeHead(502)
        res.end()
      }
    })
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    const scratch = mkdtempSync(join(tmpdir(), 'sophia-c2b-producer-crossing-'))
    const llm = await startMockResponses()
    let runtime = null
    t.after(async () => {
      await runtime?.stop()
      await llm.close()
      await new Promise((resolve) => proxy.close(resolve))
      rmSync(scratch, { recursive: true, force: true })
    })
    const { projectId } = await m.testSupport.seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [] })
    await owner(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [projectId])
    const rt = await m.testSupport.registerRuntime(db.ownerUrl, { projectId, admin: A, runtimeUnitId: unit.id })
    const layout = homeLayout(join(scratch, 'home'))
    installProfile({ unit, runtimeDir: RUNTIME_DIR, layout })
    const S1 = `C2BPN1${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
    const S2 = `C2BPN2${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
    const n1 = worst(S1, '\u0001')
    const n2 = worst(S2, '\\')
    llm.script({ text: 'ok', responseId: n1, requestId: n2, usage: { input_tokens: 1000, output_tokens: 50, input_tokens_details: { cached_tokens: 200 } } })
    runtime = launchRuntime({ unit, runtimeDir: RUNTIME_DIR, layout, bridge: { url: `http://127.0.0.1:${proxy.address().port}`, token: rt.token },
      overlays: [providerOverlayJson(bundlePatch, llm.baseURL, 'openai-research')], extraEnv: RESEARCH_KEY })
    const until = async (predicate, what, ms = 120_000) => {
      const end = Date.now() + ms
      for (;;) {
        const value = await predicate()
        if (value) return value
        if (Date.now() > end) throw new Error(`timed out waiting for ${what}\n${runtime.stderr().slice(-2000)}`)
        await new Promise((r) => setTimeout(r, 200))
      }
    }
    await until(() => /readiness=ready/.test(runtime.stderr()), 'bridge readiness')
    assert.match(runtime.stderr(), /call_observation capability=provided version=sophia-c2b-observation-v1/)
    const admitted = await m.persistence.withActor(pool, E, 'write', (c) => m.persistence.admitResearchTask(c, projectId, {
      key: crypto.randomUUID(), exchangeId: crypto.randomUUID(), request: { question: QUESTION, outputs: ['markdown'] }, specialist: { role: MD.id, route: MD.route },
    }))
    assert.ok('admitted' in admitted, JSON.stringify(admitted))
    await until(async () => {
      for (const row of await m.persistence.claimRuntimeOutbox(workerPool, 'c2b-producer', 50, 30)) await m.persistence.dispatchRuntimeOutbox(workerPool, row.project_id, row.id, row.lease_token)
      return settlesSent.some((s) => s.path.endsWith('/research/settle'))
    }, 'the bridge\'s research settlement')
    const sent = settlesSent.find((s) => s.path.endsWith('/research/settle'))
    assert.equal(sent.status, 200, `the API took the bridge's settlement: ${sent.answer.slice(0, 300)}\n${runtime.stderr().slice(-4000)}`)
    const body = JSON.parse(sent.raw)
    // The bridge's own reservation over the same real HTTP: opted in, and the real API's ACK echoed the full binding.
    const reserves = reservesSent.filter((r) => r.path.endsWith('/research/reserve'))
    assert.equal(reserves.length, 1, 'one reservation for the one call (no retry, no second reserve)')
    const [reserved] = reserves
    const ask = JSON.parse(reserved.raw)
    const ack = JSON.parse(reserved.answer)
    assert.deepEqual([reserved.status, ask.facts, ack.binding.facts, ack.reservationId], [200, 'observed_v1', 'observed_v1', body.reservationId])
    assert.deepEqual([body.attemptId, body.nativeSessionId], [ask.attemptId, ask.nativeSessionId], 'the settlement is for the reserved call')
    // The original ledger row binds the same call, resource, scope and payer the ACK carried; a project payer has no
    // account, grant, connection or qualification (a contributed account stays the backend's refusal, unchanged here).
    const [identity] = await owner(`SELECT evidence_id, call_id, attempt_id, native_session_id, project_id, runtime_unit_id, resource_id, operation, provider, payer,
      account_id, grant_id, connection_id, qualification_id FROM sophia.research_call_identities WHERE project_id=$1 AND reservation_id=$2`, [projectId, body.reservationId])
    assert.deepEqual(identity, { evidence_id: ack.binding.evidenceId, call_id: ask.callId, attempt_id: ack.binding.attemptId, native_session_id: ack.binding.nativeSessionId,
      project_id: projectId, runtime_unit_id: ack.binding.runtimeUnitId, resource_id: ack.binding.resourceId, operation: 'research', provider: 'openai-research', payer: 'project',
      account_id: null, grant_id: null, connection_id: null, qualification_id: null })
    assert.deepEqual([ack.binding.callId, ack.binding.projectId, ack.binding.runtimeUnitId], [ask.callId, projectId, unit.id])
    // What the producer's serializer actually sent: the full A57 facts and the observation, worst-escaped.
    assert.equal(body.evidence.report, 'complete_report')
    assert.equal(body.outcome, 'settled')
    assert.deepEqual(body.evidence.observed.n1, { id: { status: 'supported', value: n1 }, sources: ['created', 'completed'] })
    assert.deepEqual(body.evidence.observed.n2, { id: { status: 'supported', value: n2 }, sources: ['response_header'] })
    assert.deepEqual(body.evidence.observed.rawCounts, { inputTotal: 1000, cacheRead: 200, output: 50 })
    assert.ok(sent.raw.split('\\u0001').length - 1 >= 2 * (8192 - S1.length), 'both N1 copies (A57 responseId and observed n1) at 6 bytes per byte')
    assert.ok(Buffer.byteLength(sent.raw) > 2 * 6 * (8192 - S1.length) + 2 * (8192 - S2.length) && Buffer.byteLength(sent.raw) < 256 * 1024, `${Buffer.byteLength(sent.raw)} bytes`)
    // On the ORIGINAL ledger row of that very reservation, opted in at reserve (facts_version 2).
    const [truth] = await owner(`SELECT i.facts_version, t.delivery, t.sent, t.http_status, t.n1_status, t.n1=$2 AS n1_kept, t.n1_sources, t.header_id_status,
      t.header_id=$3 AS n2_kept, t.header_id_sources, t.provider_terminal, t.raw_input_total, t.raw_cache_read, t.raw_output, t.outcome, t.cost_usd::text AS cost,
      t.noncached_input, t.cache_read, t.output, t.first_conflict_digest FROM sophia.research_call_truth t
      JOIN sophia.research_call_identities i ON i.project_id=t.project_id AND i.reservation_id=t.reservation_id WHERE t.project_id=$1 AND t.reservation_id=$4`,
      [projectId, n1, n2, body.reservationId])
    assert.deepEqual(truth, { facts_version: 2, delivery: 'none', sent: 'observable_transport_response', http_status: 200, n1_status: 'supported', n1_kept: true,
      n1_sources: ['created', 'completed'], header_id_status: 'supported', n2_kept: true, header_id_sources: ['response_header'], provider_terminal: 'completed',
      raw_input_total: '1000', raw_cache_read: '200', raw_output: '50', outcome: 'settled', cost: String(body.costUsd.toFixed(6)), noncached_input: '800', cache_read: '200', output: '50',
      first_conflict_digest: null })
    // Replay: the same bytes again, as the same bridge instance (a fresh instance would supersede the live lease), then
    // across an API restart: the recorded disposition replays, nothing changes.
    const runtimeHeaders = { authorization: `Bearer ${rt.token}`, 'x-sophia-runtime-unit': unit.id, 'x-sophia-bridge-protocol': '1', 'x-sophia-bridge-instance': sent.instance }
    const replay = async () => {
      const res = await fetch(`${base}${sent.path}`, { method: 'POST', headers: { ...runtimeHeaders, 'content-type': 'application/json' }, body: sent.raw })
      return { status: res.status, json: await res.json() }
    }
    const before = await owner(`SELECT digest, history_count FROM sophia.research_call_truth WHERE project_id=$1 AND reservation_id=$2`, [projectId, body.reservationId])
    // Money: the one reservation settled once at the settlement's cost; replay and restart must leave it and the
    // project's whole spend exactly so (no double charge).
    const money = () => owner(`SELECT r.state, r.settled_usd::text AS settled, r.ended_at, (SELECT count(*)::int FROM sophia.research_reservations x WHERE x.project_id=$1) AS reservations,
      (SELECT sum(x.settled_usd)::text FROM sophia.research_reservations x WHERE x.project_id=$1) AS spent FROM sophia.research_reservations r WHERE r.project_id=$1 AND r.id=$2`, [projectId, body.reservationId])
    const charged = await money()
    assert.deepEqual([charged[0].state, Number(charged[0].settled), charged[0].settled], ['settled', body.costUsd, charged[0].spent], 'settled once, the only charge')
    const again = await replay()
    assert.equal(again.status, 200, JSON.stringify(again.json))
    assert.equal(again.json.evidence.replay, true)
    await app.close()
    app = m.buildApp({ pool, verifyActor: async () => { throw new Error('no member route is used here') }, logger: { stream: { write: (line) => logged.push(line) } } })
    await app.listen({ host: '127.0.0.1', port: 0 })
    base = `http://127.0.0.1:${app.server.address().port}`
    const restarted = await replay()
    assert.deepEqual([restarted.status, restarted.json.evidence.replay, restarted.json.evidence.digest], [200, true, again.json.evidence.digest])
    assert.deepEqual(await owner(`SELECT digest, history_count FROM sophia.research_call_truth WHERE project_id=$1 AND reservation_id=$2`, [projectId, body.reservationId]), before)
    assert.deepEqual(await money(), charged, 'no double charge across replay and API restart')
    assert.deepEqual([again.json.settledUsd, restarted.json.settledUsd], [body.costUsd, body.costUsd])
    // Private: the ids live only on the call ledger's private truth; never in the journal, the log or another table.
    assert.deepEqual(await tablesHolding(S1), ['research_call_truth'])
    assert.deepEqual(await tablesHolding(S2), ['research_call_truth'])
    const journal = readdirSync(join(layout.dshHome, 'sophia-bridge')).map((f) => readFileSync(join(layout.dshHome, 'sophia-bridge', f), 'utf8')).join('\n')
    for (const [where, text] of [['bridge journal', journal], ['runtime log', runtime.stderr()], ['API log', logged.join('\n')]]) {
      assert.equal(text.includes(S1) || text.includes(S2), false, `no private id in the ${where}`)
    }
    // The same serializer output, rebound only to each wrapper's own opted-in reservation, under its real body limit.
    const w2 = await attempt()
    const ats = { research: w2.at, design: await synthetic(w2, 'design', 1000), source_review: await synthetic(w2, 'source_review', 2000) }
    for (const r of WRAPPERS) {
      const at = ats[r.kind]
      const opted = await w2.call(r.reserve, { ...at, callId: `llm-producer-${r.kind}`, kind: 'model', provider: r.provider, amountUsd: 0.1, purpose: 'call', ...tracked, facts: 'observed_v1' })
      assert.equal(opted.status, 200, opted.text)
      const rebound = JSON.stringify({ ...body, ...at, reservationId: opted.json.reservationId })
      assert.ok(Buffer.byteLength(rebound) < r.limit)
      const res = await w2.call(r.settle, rebound)
      assert.equal(res.status, 200, `${r.kind}: ${res.text.slice(0, 300)}`)
      const [row] = await owner(`SELECT delivery, n1_status, header_id_status, provider_terminal FROM sophia.research_call_truth WHERE project_id=$1 AND reservation_id=$2`,
        [w2.projectId, opted.json.reservationId])
      assert.deepEqual(row, { delivery: 'none', n1_status: 'supported', header_id_status: 'supported', provider_terminal: 'completed' }, r.kind)
    }
  })
})

/**
 * INC04-R07-C2B-PRODUCER-001: the patched producer's private frames through the REAL runtime and bridge, against the
 * double and the LABELLED fixture service. Each case reads what the bridge actually sent, and checks that the private
 * values (the canary request ids) reach only the settlement: never the journal, the observations or the log.
 */
describe('C2B: delivered observations from the real producer, removed before every generic consumer', () => {
  const nowhereElse = (w, settle, needle) => {
    for (const [where, text] of [['journal', JSON.stringify(w.journal())], ['observations', JSON.stringify(w.service.observations)], ['log', w.stderr()],
      ['legacy usage', JSON.stringify(settle?.usage ?? null)]]) assert.equal(text.includes(needle), false, `no ${needle} in the ${where}`)
  }

  test('a completed call with a request id: N2 from the header, C1P money unchanged, the capability provided after the listener', async (t) => {
    const w = await research.world(t)
    const { reserve, settle } = await researchCall(w, { text: 'ok', requestId: 'req-c2b-canary-1', usage: { input_tokens: 5, output_tokens: 3, input_tokens_details: { cached_tokens: 2 } } })
    assert.equal(reserve.facts, 'observed_v1')
    assert.deepEqual(settle.evidence.observed.n2, { id: { status: 'supported', value: 'req-c2b-canary-1' }, sources: ['response_header'] })
    assert.equal(settle.costUsd, Number(((3 * RESEARCH.prices.input + 2 * RESEARCH.prices.cacheRead + 3 * RESEARCH.prices.output) / 1_000_000).toFixed(6)), 'C1P money exactly as before')
    assert.match(w.stderr(), /call_observation capability=provided version=sophia-c2b-observation-v1 after=llm\/stream/)
    nowhereElse(w, settle, 'req-c2b-canary-1')
    // The agent loop completed its turn on the stripped stream (a frame reaching its snapshot would have failed it).
    await w.service.waitFor(() => w.sessionEvents('assistant/message').length >= 1, 60_000, 'the assistant message')
    assert.equal(JSON.stringify(w.service.observations).includes('x-sophia-c2b-observation'), false)
  })

  // Stop is a caller ABORT, not a consumer return: the agent loop reads on until its next chunk, so the adapter's abort
  // terminal frame (F3, with no provider terminal) does cross. A pure consumer return (no F3) is the SDK-level control in
  // tests/unit/c2b-sdk-patches.test.mjs, where the consumer's own return is exact.
  test('Stop (an abort) right after the headers, before created: F1 and the abort F3 crossed; no provider terminal, no N1, no counts', async (t) => {
    const w = await research.world(t)
    await w.start()
    w.llm.script({ text: 'ok', requestId: 'req-c2b-canary-f1', delayBeforeCreatedMs: 8000 })
    w.send(create(w))
    await w.service.waitFor(() => w.llm.requests.length >= 1, 90_000, 'the provider request')
    await new Promise((r) => setTimeout(r, 1500))
    w.send(w.cmd('stop'))
    await w.service.waitFor(() => settles(w.service.research).length >= 1, 60_000, 'the settlement after Stop')
    const settle = settles(w.service.research)[0].body
    assert.equal(settle.outcome, 'uncertain')
    assert.equal(settle.evidence.ending, 'consumer_closed')
    assert.deepEqual(settle.evidence.observed, { sent: 'observable_transport_response', httpStatus: 200, n2: { id: { status: 'supported', value: 'req-c2b-canary-f1' }, sources: ['response_header'] },
      deliveryUnknownReason: 'none' }, 'what crossed and nothing else: no provider terminal, no N1 (created never came), no counts')
    await w.service.waitFor(() => w.llm.abandoned >= 1, 30_000, 'the provider stream closed by the client (no drain)')
    // C2B69-F02 (R1): read the double's WRITTEN-terminal counter only after its delayed handler really finished.
    await w.llm.whenSettled()
    assert.equal(w.llm.terminalSent, 0, 'no terminal written to the closed stream')
    nowhereElse(w, settle, 'req-c2b-canary-f1')
  })

  test('Stop (an abort) after created and its first event: the created N1 crossed; no provider terminal, no counts', async (t) => {
    const w = await research.world(t)
    await w.start()
    w.llm.script({ text: 'ok', requestId: 'req-c2b-canary-f2', responseId: 'resp-c2b-f2', delayMs: 8000 })
    w.send(create(w))
    await w.service.waitFor(() => w.llm.requests.length >= 1, 90_000, 'the provider request')
    await new Promise((r) => setTimeout(r, 1500))
    w.send(w.cmd('stop'))
    await w.service.waitFor(() => settles(w.service.research).length >= 1, 60_000, 'the settlement after Stop')
    const { observed } = settles(w.service.research)[0].body.evidence
    assert.deepEqual(observed.n1, { id: { status: 'supported', value: 'resp-c2b-f2' }, sources: ['created'] })
    assert.equal(observed.providerTerminal, undefined)
    assert.equal(observed.rawCounts, undefined)
    assert.equal(observed.deliveryUnknownReason, 'none', 'the abort terminal frame crossed')
    await w.service.waitFor(() => w.llm.abandoned >= 1, 30_000, 'the provider stream closed by the client (no drain)')
    // C2B69-F02 (R1): read the double's WRITTEN-terminal counter only after its delayed handler really finished.
    await w.llm.whenSettled()
    assert.equal(w.llm.terminalSent, 0, 'no terminal written to the closed stream')
  })

  test('an HTTP 500 with a request id, then an authorized retry: each call its own reservation and its own facts', async (t) => {
    const w = await research.world(t)
    await w.start()
    w.llm.script({ status: 500, requestId: 'req-c2b-500' }, { text: 'ok', requestId: 'req-c2b-retry' })
    w.send(create(w))
    await w.service.waitFor(() => settles(w.service.research).length >= 2, 120_000, 'both settlements')
    const [first, second] = settles(w.service.research).map((s) => s.body)
    assert.deepEqual(first.evidence.observed, { sent: 'observable_transport_response', httpStatus: 500,
      n2: { id: { status: 'supported', value: 'req-c2b-500' }, sources: ['typed_error'] }, deliveryUnknownReason: 'none' })
    assert.equal(first.outcome, 'uncertain', 'a status is never money')
    assert.deepEqual(second.evidence.observed.n2.id.value, 'req-c2b-retry')
    assert.notEqual(first.reservationId, second.reservationId)
  })

  test('an in-stream error event: the error_event terminal, no counts; the call settles uncertain as before', async (t) => {
    const w = await research.world(t)
    const { settle } = await researchCall(w, { text: 'ok', errorEvent: { code: 'server_error' } })
    assert.equal(settle.evidence.observed.providerTerminal, 'error_event')
    assert.equal(settle.evidence.observed.rawCounts, undefined)
    assert.equal(settle.outcome, 'uncertain')
  })

  test('a designer and a source reviewer opt in and settle their delivered observation through their own operations', async (t) => {
    for (const [s, role, route, ops] of [[research, 'sophia-html-designer-v1', 'research-sol-medium-v1', 'design'], [review, 'sophia-source-review-v1', 'source-review-luna-high-v1', 'review']]) {
      const w = await s.world(t)
      await w.start()
      w.llm.script({ text: 'ok', requestId: `req-c2b-${ops}` })
      w.send(w.cmd('create', { text: ops === 'design' ? 'Design the HTML report.' : 'Source review task. Review the sources below.', role, route }))
      const reserveOp = ops === 'design' ? 'design/reserve' : 'reserve'
      const settleOp = ops === 'design' ? 'design/settle' : 'settle'
      await w.service.waitFor(() => w.service[ops].some((o) => o.op === settleOp), 90_000, `the ${ops} settlement`)
      assert.equal(w.service[ops].find((o) => o.op === reserveOp).body.facts, 'observed_v1')
      const settle = w.service[ops].find((o) => o.op === settleOp).body
      assert.deepEqual([settle.evidence.observed.n2.id.value, settle.evidence.observed.deliveryUnknownReason], [`req-c2b-${ops}`, 'none'])
      nowhereElse(w, settle, `req-c2b-${ops}`)
    }
  })

  test('an unpriced bound call on the default route: frames removed, nothing reserved or settled, no private value anywhere', async (t) => {
    const w = await unpriced.world(t)
    await w.start()
    w.llm.script({ text: 'plain answer', requestId: 'req-c2b-unpriced' })
    w.send(w.cmd('create', { text: 'Say hi.' }))
    await w.service.waitFor(() => w.sessionEvents('assistant/message').length >= 1, 90_000, 'the assistant message')
    assert.equal(w.llm.requests.length, 1)
    assert.equal(modelReserves(w.service.research).length, 0, 'unpriced: not metered')
    assert.equal(JSON.stringify(w.service.observations).includes('x-sophia-c2b-observation'), false)
    nowhereElse(w, null, 'req-c2b-unpriced')
  })
})
