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
        nativeSessionId: body.nativeSessionId, projectId: 'proj-fixture', runtimeUnitId: unit.id, resourceId: FIXTURE_RESOURCE } }
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

describe('REPAIR-001 F03: the answer names the attempt\'s authenticated executor resource, for all three wrappers', () => {
  /** The service's own answer for `body` with its binding's resource dropped (`undefined`) or replaced. */
  const withResource = (resourceId) => (body) => {
    const answer = { reservationId: '00000000-0000-4000-8000-000000007779', state: 'reserved', kind: body.kind, purpose: body.purpose ?? 'call', amountUsd: body.amountUsd, target: null }
    if (body.kind !== 'model') return answer
    const binding = { mode: body.mode, contract: body.contract, evidenceId: '00000000-0000-4000-8000-000000007780', callId: body.callId, attemptId: body.attemptId,
      nativeSessionId: body.nativeSessionId, projectId: 'proj-fixture', runtimeUnitId: unit.id }
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
})
