/**
 * INC04-R07-C2 bound output (Root81 A59 / migration 0115; coherent-010 Root123): the bound-output crossing on the REAL
 * deployed runtime (.artifacts/runtime: dsh waterfall, the plugin entry's config, the ControlBridge meter and its per-call
 * capability, the patched dsh-llm-pi-ai adapter, pi-ai's own awaited onPayload) against the controlled Responses double
 * (tests/support/runtime-bound-output-provider.mjs records each request's exact body and arrival), the MAINTAINED API app
 * (`buildApp`, the same factories, capability hook, error handler and persistence wrappers as server.ts, built with the
 * server-side `boundOutput: true`; and its default-OFF twin) and real PostgreSQL. LABELLED SYNTHETIC: project, runtime,
 * token, authority, profile, settings and emitter references, and the design and source-review attempts (inserted by the
 * migration owner, as the persistence DB tests do); nothing here is a provider, an account, a live qualification or an
 * activation. One HTTP request is not one model request: `openai.model_requests` stays unsupported.
 *
 * Coherent-010 repairs: C2W-F01 (the configured profile endpoint must be the API that actually sends, and only that API is
 * hashed) and C2W-F02 (every fixture acquisition owned at once, every cleanup attempted, primary and cleanup errors kept,
 * a scratch kept while its runtime's exit is unconfirmed).
 */

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { REPO_ROOT, RUNTIME_DIR } from '../../scripts/lib/common.mjs'
import { executorClosureDigest, homeLayout, installProfile } from '../../scripts/lib/profile.mjs'
import { launchRuntime } from '../../scripts/lib/runtime.mjs'
import { unit } from '../support/harness.mjs'
import {
  boundOverlayJson,
  ownedScope,
  RetainedScratch,
  startBoundProvider,
  startRecordingProxy,
  withOwned,
} from '../support/runtime-bound-output-provider.mjs'
import {
  BOUND_MIN_OUTPUT,
  BOUND_PARAMS,
  BoundCalls,
  BoundDispatch,
  BoundRefused,
  boundOutboundDigest,
  boundSettingsDigest,
  c2Frame,
  bindingProblem,
} from '../../packages/dsh-bundle/dist/control-bridge.js'
import { outboundDigest as domainOutbound, frame as domainFrame } from '../../packages/domain/src/research-dimension-bounds.ts'

const bundlePatch = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8')
const ROUTE = 'research-sol-medium-v1'
const RESEARCH = unit.model_routes[ROUTE]
const KEY = { OPENAI_RESEARCH_API_KEY: 'sk-sophia-bound-output-dummy', OPENAI_API_KEY: 'sk-sophia-bound-output-review-dummy' }
const REVIEW_ROUTE = 'source-review-luna-high-v1'
const REVIEW = unit.model_routes[REVIEW_ROUTE]
const DESIGNER = 'sophia-html-designer-v1'
const REVIEWER = 'sophia-source-review-v1'
const MD = { id: 'sophia-research-md-v1', route: ROUTE }
const ENDPOINT = 'openai-responses'
const QUESTION = 'Which hosts render PDFs in a sandbox?'

// --- 1. The bridge's own production functions, no runtime (contract coverage beside, never instead of, the crossing) ---

describe('bridge units: the bound hook, the session slot and the digests (production functions)', () => {
  const route = { provider: 'openai-research', model: RESEARCH.model }
  const bounds = (bound, kind = 'authorized') => ({
    dispatchId: '00000000-0000-4000-8000-0000000000d1', profileId: '00000000-0000-4000-8000-0000000000a1', profileRevision: '1',
    authorizeSetDigest: 'a'.repeat(64), originalGeneration: null,
    items: [
      { dimension: 'openai.input_cached_tokens', unit: 'tokens', boundKind: 'unsupported', bound: null, enforcementKind: null, policySetDigest: null, unsupportedReason: 'no_enforcing_mechanism', authorizeDigest: 'b'.repeat(64) },
      { dimension: 'openai.input_tokens', unit: 'tokens', boundKind: 'unsupported', bound: null, enforcementKind: null, policySetDigest: null, unsupportedReason: 'input_estimate_only', authorizeDigest: 'c'.repeat(64) },
      { dimension: 'openai.model_requests', unit: 'requests', boundKind: 'unsupported', bound: null, enforcementKind: null, policySetDigest: null, unsupportedReason: 'route_not_qualified', authorizeDigest: 'd'.repeat(64) },
      { dimension: 'openai.output_tokens', unit: 'tokens', boundKind: kind, bound: kind === 'authorized' ? String(bound) : null, enforcementKind: kind === 'authorized' ? 'output_parameter' : null, policySetDigest: null, unsupportedReason: kind === 'authorized' ? null : 'route_not_qualified', authorizeDigest: 'e'.repeat(64) },
    ],
  })
  const recorder = (claim = { sendPermitted: true, replay: false }) => {
    const calls = []
    return {
      calls,
      boundApply: async (family, body) => {
        calls.push(['apply', family, body])
        return { dispatchId: body.apply.dispatchId, applyReceiptDigest: 'f'.repeat(64), phase: 'applied', replay: false, sendPermitted: false }
      },
      boundClaim: async (family, body) => {
        calls.push(['claim', family, body])
        return { dispatchId: body.claim.dispatchId, history: 'claimed', claimSeq: '1', applyReceiptDigest: body.claim.applyReceiptDigest, claimedAt: 'x', ...claim }
      },
      boundOutcome: async (family, body) => {
        calls.push(['outcome', family, body])
        return { dispatchId: body.outcome.dispatchId, outcomeDigest: '0'.repeat(64), replay: false }
      },
    }
  }
  const spec = (b, extra = {}) => ({ family: 'research', route, profile: { profileId: b.profileId, revision: '1', endpoint: ENDPOINT, settingsDigest: '9'.repeat(64) },
    emitterIdentityDigest: '8'.repeat(64), at: { attemptId: 'att', nativeSessionId: 'sess' }, reservationId: '00000000-0000-4000-8000-0000000000c1', callId: 'llm-x', bounds: b, log: () => {}, ...extra })
  const model = { api: 'openai-responses', provider: 'openai-research', id: RESEARCH.model }
  const params = (extra = {}) => ({ model: RESEARCH.model, input: [{ role: 'user', content: 'q' }], stream: true, prompt_cache_key: 'k', store: false, max_output_tokens: 16000,
    reasoning: { effort: 'medium', summary: 'auto' }, include: ['reasoning.encrypted_content'], ...extra })

  test('the framing and outbound digest equal the frozen domain module byte for byte', () => {
    const items = [['openai.output_tokens', 'max_output_tokens', '777']]
    const p = { provider: 'openai-research', endpoint: ENDPOINT, model: RESEARCH.model, settingsDigest: '9'.repeat(64), emitterIdentityDigest: '8'.repeat(64), items }
    assert.equal(c2Frame('d', ['a', null, 'é']), domainFrame('d', ['a', null, 'é']))
    assert.equal(boundOutboundDigest(p), domainOutbound(p))
  })

  test('the hook lowers max_output_tokens to the server P on a FRESH copy, applies then claims, and returns only on permission', async () => {
    const client = recorder()
    const d = new BoundDispatch(client, spec(bounds(777)))
    const original = params()
    const final = await d.hook(original, model)
    assert.equal(final.max_output_tokens, 777)
    assert.equal(original.max_output_tokens, 16000, 'the request pi-ai built is not mutated')
    assert.notEqual(final, original)
    assert.deepEqual(client.calls.map((c) => c[0]), ['apply', 'claim'])
    const sent = client.calls[0][2].apply
    assert.equal(sent.outboundParamsDigest, boundOutboundDigest({ provider: 'openai-research', endpoint: ENDPOINT, model: RESEARCH.model, settingsDigest: boundSettingsDigest(final),
      emitterIdentityDigest: '8'.repeat(64), items: [['openai.output_tokens', 'max_output_tokens', '777']] }))
    assert.equal('projectId' in sent || 'runtimeId' in sent, false, 'never a caller-named project or runtime')
    await assert.rejects(d.hook(params(), model), BoundRefused, 'a second invocation is never a second send')
    assert.equal(await d.finish({ sent: true, httpStatus: 200 }), 'sent')
    assert.equal(client.calls.at(-1)[2].outcome.outcomeKind, 'sent')
  })

  test('refusals before any apply: extra key, P<16, P>request, no output parameter, unsupported bound, wrong route or api', async () => {
    const cases = [
      [bounds(777), params({ top_p: 0.5 }), model, 'param_extra'],
      [bounds(BOUND_MIN_OUTPUT - 1), params(), model, 'output_bound_below_minimum'],
      [bounds(20000), params(), model, 'output_bound_above_request'],
      [bounds(777), (({ max_output_tokens: _m, ...rest }) => rest)(params()), model, 'output_parameter_unsupported'],
      [bounds(777, 'unsupported'), params(), model, 'output_bound_missing'],
      [bounds(777), params(), { ...model, provider: 'openai' }, 'route'],
      [bounds(777), params(), { ...model, api: 'openai-completions' }, 'endpoint'],
      [bounds(777), params({ store: true }), model, 'params'],
      [bounds(777), params({ stream: false }), model, 'params'],
    ]
    for (const [b, p, m, reason] of cases) {
      const client = recorder()
      const d = new BoundDispatch(client, spec(b))
      await assert.rejects(d.hook(p, m), (e) => e instanceof BoundRefused && e.reason === reason, reason)
      assert.deepEqual(client.calls, [], `${reason}: nothing reached the service`)
      assert.equal(await d.finish({ sent: false }), null, `${reason}: no outcome`)
    }
    assert.equal(BOUND_PARAMS.has('top_p'), false)
  })

  test('C2W-F01: a configured endpoint that is not the API that will send refuses before apply; the digest names the actual API', async () => {
    const client = recorder()
    const base = spec(bounds(777))
    const d = new BoundDispatch(client, { ...base, profile: { ...base.profile, endpoint: 'openai-completions' } })
    const original = params()
    const copy = structuredClone(original)
    await assert.rejects(d.hook(original, model), (e) => e instanceof BoundRefused && e.reason === 'endpoint', 'endpoint mismatch')
    assert.deepEqual(client.calls, [], 'nothing reached the service: no apply, no claim')
    assert.deepEqual(original, copy, 'the request pi-ai built is unchanged')
    assert.equal(await d.finish({ sent: false }), null, 'no outcome')
    // The matching configuration still sends, and its preimage is hashed with the ACTUAL api.
    const ok = recorder()
    const final = await new BoundDispatch(ok, spec(bounds(777))).hook(params(), model)
    assert.equal(ok.calls[0][2].apply.outboundParamsDigest, boundOutboundDigest({ provider: 'openai-research', endpoint: model.api, model: RESEARCH.model,
      settingsDigest: boundSettingsDigest(final), emitterIdentityDigest: '8'.repeat(64), items: [['openai.output_tokens', 'max_output_tokens', '777']] }))
  })

  test('a claim without permission (a replay) refuses; a lost claim answer is never a send, and its owner says not_sent_after_claim', async () => {
    const replay = recorder({ sendPermitted: false, replay: true })
    await assert.rejects(new BoundDispatch(replay, spec(bounds(777))).hook(params(), model), (e) => e.reason === 'claim_not_permitted')
    const lost = recorder()
    lost.boundClaim = async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }) }
    const d = new BoundDispatch(lost, spec(bounds(777)))
    await assert.rejects(d.hook(params(), model), (e) => e.reason === 'claim_unknown')
    assert.equal(await d.finish({ sent: false }), 'not_sent_after_claim')
    const quiet = recorder()
    const q = new BoundDispatch(quiet, spec(bounds(777)))
    await q.hook(params(), model)
    assert.equal(await q.finish({ sent: false }), null, 'claimed and unobserved: may have sent, nothing invented')
    assert.equal(quiet.calls.some((c) => c[0] === 'outcome'), false)
  })

  test('the capability: one slot per session, each hook handed out once, nothing for an unarmed or other session', () => {
    const calls = new BoundCalls()
    const slot = calls.open('s1')
    assert.equal(calls.open('s1'), null, 'a second opted call on the session is refused before its reserve')
    assert.equal(calls.capability.take('s1'), undefined, 'reserved but not armed: nothing')
    const d = new BoundDispatch(recorder(), spec(bounds(777)))
    slot.arm(d)
    assert.equal(calls.capability.take('s2'), undefined, 'never another session')
    assert.equal(calls.capability.take('s1'), d.hook)
    assert.equal(calls.capability.take('s1'), undefined, 'once')
    slot.close()
    assert.ok(calls.open('s1'), 'free again after its finish')
    assert.equal(calls.capability.version, 'sophia-c2-bound-v1')
    assert.ok(Object.isFrozen(calls.capability))
  })

  test('the ACK check: bounds echoed exactly when opted, naming the opted reference', () => {
    const sent = { attemptId: 'a', nativeSessionId: 's', callId: 'c', kind: 'model', provider: 'p', amountUsd: 1, purpose: 'call', mode: 'tracked_v1', contract: 'legacy_report' }
    const reply = (b) => ({ reservationId: 'r', state: 'reserved', kind: 'model', purpose: 'call', amountUsd: 1, target: null,
      binding: { mode: 'tracked_v1', contract: 'legacy_report', evidenceId: 'e', callId: 'c', attemptId: 'a', nativeSessionId: 's', projectId: 'p1', runtimeUnitId: 'u', resourceId: 'res', ...(b ? { bounds: b } : {}) } })
    const ctx = { projectId: 'p1', runtimeUnitId: 'u', resource: { state: 'known', resourceId: 'res' } }
    const ref = { profileId: bounds(1).profileId, revision: '1' }
    assert.equal(bindingProblem(reply(), sent, ctx), null)
    assert.equal(bindingProblem(reply(bounds(777)), sent, ctx), 'bounds', 'unopted, answered with bounds')
    assert.equal(bindingProblem(reply(), { ...sent, boundProfile: ref }, ctx), 'bounds', 'opted, answered without')
    assert.equal(bindingProblem(reply(bounds(777)), { ...sent, boundProfile: { ...ref, revision: '2' } }, ctx), 'bounds', 'another revision')
    assert.equal(bindingProblem(reply(bounds(777)), { ...sent, boundProfile: ref }, ctx), null)
  })
})

// --- 2. C2W-F02: the new fixtures own every acquisition and attempt every cleanup (real servers, no runtime body) ------

describe('C2W-F02: fixture ownership, every cleanup attempted, primary and cleanup errors kept, a scratch kept under a reader', () => {
  const refused = async (url) => {
    try {
      await fetch(url, { method: 'POST', body: '{}', signal: AbortSignal.timeout(3000) })
      return false
    } catch {
      return true
    }
  }

  test('a failure after the real provider and proxy were acquired, before any runtime: each is closed, the failure stays visible, nothing sent', async () => {
    const seen = {}
    const error = await withOwned(async (scope) => {
      const sc = scope.scratch(mkdtempSync(join(tmpdir(), 'sophia-r123-f02-')))
      seen.dir = sc.dir
      const provider = await startBoundProvider()
      scope.own('provider', () => provider.close())
      seen.provider = provider
      const proxy = await startRecordingProxy(() => provider.baseURL.replace(/\/v1$/, ''))
      scope.own('proxy', () => proxy.close())
      seen.proxy = proxy
      throw new Error('injected: failed before the runtime completed')
    }).then(() => null, (e) => e)
    assert.equal(error?.message, 'injected: failed before the runtime completed', 'the primary error alone, unchanged')
    assert.equal(await refused(`${seen.provider.baseURL}/responses`), true, 'the provider front is closed')
    assert.equal(await refused(`${seen.proxy.url}/x`), true, 'the proxy is closed')
    assert.equal(existsSync(seen.dir), false, 'the scratch (no reader) is removed')
    assert.equal(seen.provider.requests.length, 0, 'no request reached the provider: nothing is credited')
  })

  test('one cleanup failing after its real close: the remaining cleanups still run; the primary and the cleanup error are both kept', async () => {
    const seen = {}
    const primary = new Error('injected: the test body failed')
    const error = await withOwned(async (scope) => {
      const sc = scope.scratch(mkdtempSync(join(tmpdir(), 'sophia-r123-f02-')))
      seen.dir = sc.dir
      const proxy = await startRecordingProxy(() => 'http://127.0.0.1:9')
      scope.own('proxy', () => proxy.close())
      seen.proxy = proxy
      const provider = await startBoundProvider()
      scope.own('provider', async () => {
        await provider.close()
        throw new Error('injected: after the real close')
      })
      seen.provider = provider
      throw primary
    }).then(() => null, (e) => e)
    assert.ok(error instanceof AggregateError, String(error))
    assert.equal(error.errors[0], primary, 'the primary error first')
    assert.equal(error.errors.length, 2, error.errors.map((e) => e.message).join(' | '))
    assert.equal(error.errors[1].message, 'cleanup provider failed')
    assert.equal(error.errors[1].cause?.message, 'injected: after the real close')
    assert.equal(await refused(`${seen.provider.baseURL}/responses`), true, 'the failing cleanup had really closed the provider')
    assert.equal(await refused(`${seen.proxy.url}/x`), true, 'the later proxy cleanup still ran')
    assert.equal(existsSync(seen.dir), false, 'the later scratch cleanup still ran')
  })

  test('a runtime whose stop rejects, or whose exit is not confirmed, keeps its scratch (HOLD); its other cleanups still run', async () => {
    for (const [what, run, ms] of [
      ['stop rejected', { stop: async () => { throw new Error('injected: stop failed') } }, 20_000],
      ['exit unconfirmed', { stop: () => new Promise(() => {}) }, 200],
    ]) {
      const scope = ownedScope()
      const sc = scope.scratch(mkdtempSync(join(tmpdir(), 'sophia-r123-f02-')))
      let after = false
      scope.own('after the runtime', () => {
        after = true
      })
      scope.runtime('stub runtime', run, sc, ms)
      const error = await scope.close().then(() => null, (e) => e)
      assert.ok(error instanceof AggregateError, `${what}: ${String(error)}`)
      assert.match(error.errors[0].message, /cleanup stub runtime failed/, what)
      assert.ok(error.errors[1] instanceof RetainedScratch && error.errors[1].dir === sc.dir, `${what}: the scratch is reported retained`)
      assert.equal(existsSync(sc.dir), true, `${what}: the scratch is NOT removed beneath a possible reader`)
      assert.equal(after, true, `${what}: an independent cleanup still ran`)
      // The stub had no process at all: its empty scratch is this test's own to remove now.
      rmSync(sc.dir, { recursive: true, force: true })
    }
  })
})

// --- 3. The real runtime crossing through the MAINTAINED app (needs a disposable PostgreSQL) ------------------------------

const dbEnabled = Boolean(process.env.SOPHIA_DISPOSABLE_DATABASE_URL)
describe('the real runtime crossing through the maintained app: dsh -> ControlBridge -> capability -> patched adapter -> pi-ai -> HTTP double, buildApp and PostgreSQL', { skip: dbEnabled ? false : 'needs SOPHIA_DISPOSABLE_DATABASE_URL (a disposable PostgreSQL)' }, () => {
  let m, db, pool, workerPool, ownerPool, app, appUrl, offApp, offUrl
  const fixture = ownedScope()
  const logged = []
  const A = crypto.randomUUID()
  const E = crypto.randomUUID()
  let legacyBody = null
  let legacyReviewBody = null
  before(async () => {
    const [{ buildApp }, persistence, testSupport, bounds] = await Promise.all([
      import('../../apps/api/src/app.ts'),
      import('../../packages/persistence/src/index.ts'),
      import('../../packages/test-support/src/index.ts'),
      import('../../packages/persistence/src/research-dimension-bounds.ts'),
    ])
    m = { buildApp, persistence, testSupport, bounds }
    // C2W-F02: each acquisition owned the moment it exists; after() attempts every close and keeps every error.
    db = await m.testSupport.createTestDatabase()
    fixture.own('database', () => db.drop())
    pool = m.persistence.createPool(db.apiUrl, { max: 8 })
    fixture.own('api pool', () => pool.end())
    workerPool = m.persistence.createPool(db.workerUrl, { max: 2 })
    fixture.own('worker pool', () => workerPool.end())
    ownerPool = m.persistence.createPool(db.ownerUrl, { max: 4 })
    fixture.own('owner pool', () => ownerPool.end())
    const verifyActor = async () => { throw new Error('no member route is used here') }
    // The MAINTAINED app with the server-side switch ON (what server.ts builds with SOPHIA_BOUND_OUTPUT=on) ...
    app = m.buildApp({ pool, verifyActor, boundOutput: true, logger: { stream: { write: (line) => logged.push(line) } } })
    fixture.own('app ON', () => app.close())
    await app.listen({ host: '127.0.0.1', port: 0 })
    appUrl = `http://127.0.0.1:${app.server.address().port}`
    // ... and its default-OFF twin (what server.ts builds by default).
    offApp = m.buildApp({ pool, verifyActor })
    fixture.own('app OFF', () => offApp.close())
    await offApp.listen({ host: '127.0.0.1', port: 0 })
    offUrl = `http://127.0.0.1:${offApp.server.address().port}`
  })
  after(() => fixture.close())
  const owner = async (sql, params) => (await ownerPool.query(sql, params)).rows
  const sha = async (v) => (await import('node:crypto')).createHash('sha256').update(v, 'utf8').digest('hex')

  /** A project-funded research world on a registered runtime of this unit. */
  async function world() {
    const { projectId } = await m.testSupport.seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [] })
    await owner(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [projectId])
    const rt = await m.testSupport.registerRuntime(db.ownerUrl, { projectId, admin: A, runtimeUnitId: unit.id })
    return { projectId, rt }
  }
  /** Register (and by default activate) an output_tokens profile under `profileId` (project scope), SYNTHETIC custody. */
  async function profileAt(w, profileId, { ceiling, settingsDigest, emitter, activate = true, route = ROUTE, provider = 'openai-research', model = RESEARCH.model, endpoint = ENDPOINT }) {
    const authorityId = (await m.bounds.recordBoundAuthority(ownerPool, { version: 'research-bound-authority-v1', authorityKey: `r123-${crypto.randomUUID()}`, kind: 'bound_profile_qualification',
      scope: { kind: 'project', ref: w.projectId }, dimension: 'openai.output_tokens', approverRef: 'synthetic: owner approval fixture', verifierRef: 'synthetic: independent verifier fixture' })).authorityId
    const ref = { approval_ref_digest: await sha('synthetic approval'), evidence_digest: await sha('synthetic evidence') }
    await m.bounds.registerBoundProfile(ownerPool, { profile_id: profileId, revision: '1', dimension: 'openai.output_tokens', unit: 'tokens', enforcement_kind: 'output_parameter',
      param_name: 'max_output_tokens', max_ceiling: String(ceiling), provider, route_id: route, endpoint, model,
      settings_digest: settingsDigest, emitter_identity_digest: emitter, semantics_evidence_digest: await sha('synthetic semantics'), isolation_evidence_digest: await sha('synthetic isolation'),
      scope_kind: 'project', scope_ref: w.projectId, authority_id: authorityId, ...ref })
    const event = (kind) => m.bounds.recordBoundProfileEvent(ownerPool, { profile_id: profileId, revision: '1', dimension: 'openai.output_tokens', event_key: `${kind}-${crypto.randomUUID()}`,
      event_kind: kind, target_event_digest: null, reason_code: 'synthetic_operator', authority_id: authorityId, cause_ref_digest: null, ...ref })
    if (activate) await event('activate')
    return { profileId, revision: '1', event }
  }

  /**
   * Launch the real runtime behind a recording proxy to the maintained app ('on', the default) or its OFF twin. The
   * scratch, proxy and runtime are owned by `scope` as each is acquired; `before` runs between steps (see the proxy).
   */
  async function launch(scope, w, { overlay, api = 'on', env = {}, before }) {
    const sc = scope.scratch(mkdtempSync(join(tmpdir(), 'sophia-r123-bound-')))
    const layout = homeLayout(join(sc.dir, 'home'))
    installProfile({ unit, runtimeDir: RUNTIME_DIR, layout })
    const target = api === 'off' ? offUrl : appUrl
    const proxy = await startRecordingProxy(() => target, { before })
    scope.own('proxy', () => proxy.close())
    const runtime = launchRuntime({ unit, runtimeDir: RUNTIME_DIR, layout, bridge: { url: proxy.url, token: w.rt.token }, overlays: [overlay], extraEnv: { ...KEY, ...env } })
    scope.runtime('runtime', runtime, sc)
    const until = async (predicate, what, ms = 120_000) => {
      const end = Date.now() + ms
      for (;;) {
        const value = await predicate()
        if (value) return value
        if (Date.now() > end) {
          const steps = proxy.sent.map((x) => `${x.path.replace(/\?.*$/, '')} ${x.status ?? x.beforeError}${x.status >= 400 ? ` ${String(x.answer).slice(0, 160)}` : ''}`)
          throw new Error(`timed out waiting for ${what}\nproxy: ${[...new Set(steps)].join(', ')}\n${runtime.stderr().slice(0, 2500)}\n...\n${runtime.stderr().slice(-1500)}`)
        }
        await new Promise((r) => setTimeout(r, 200))
      }
    }
    await until(() => /readiness=ready/.test(runtime.stderr()), 'bridge readiness')
    return { layout, proxy, runtime, until }
  }
  /** Admit one research task and drive the outbox until `done()`. */
  async function research(w, run, done, what) {
    const admitted = await m.persistence.withActor(pool, E, 'write', (c) => m.persistence.admitResearchTask(c, w.projectId, {
      key: crypto.randomUUID(), exchangeId: crypto.randomUUID(), request: { question: QUESTION, outputs: ['markdown'] }, specialist: { role: MD.id, route: MD.route },
    }))
    assert.ok('admitted' in admitted, JSON.stringify(admitted))
    await run.until(async () => {
      for (const row of await m.persistence.claimRuntimeOutbox(workerPool, 'r123-bound', 50, 30)) await m.persistence.dispatchRuntimeOutbox(workerPool, row.project_id, row.id, row.lease_token)
      return done()
    }, what)
    return admitted.admitted
  }

  /**
   * LABELLED SYNTHETIC (as the persistence DB and C2B HTTP tests): a design or source-review attempt whose real create
   * command (naming the designer or the source reviewer) the REAL runtime then receives from the maintained app. The
   * seed is a maintained research admission delivered to a placeholder bridge lease through the app; its create is
   * answered, so the real runtime's lease starts after it and receives only the synthetic create. The rows are inserted
   * by the migration owner with triggers off; design shares the research allowance, review gets its own project
   * allowance through a work item of the goal (with its route manifest). It stands for a lineage maintained creation
   * would reach only through a published artifact or the work board; it is never a qualification.
   */
  async function syntheticAttempt(w, kind) {
    const headers = { authorization: `Bearer ${w.rt.token}`, 'x-sophia-runtime-unit': unit.id, 'x-sophia-bridge-instance': `r123-seed-${crypto.randomUUID().slice(0, 8)}`, 'x-sophia-bridge-protocol': '1' }
    const call = async (path, body) => {
      const res = await fetch(`${appUrl}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const text = await res.text()
      return { status: res.status, json: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null, text }
    }
    assert.equal((await call('/v1/runtime/hello', { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [{ ...MD, presetDigest: 'sha256:md' }] })).status, 200)
    assert.equal((await call('/v1/runtime/ready', { state: 'ready', reason: null, unrecovered: [] })).status, 204)
    const admitted = await m.persistence.withActor(pool, E, 'write', (c) => m.persistence.admitResearchTask(c, w.projectId, {
      key: crypto.randomUUID(), exchangeId: crypto.randomUUID(), request: { question: QUESTION, outputs: ['markdown'] }, specialist: { role: MD.id, route: MD.route },
    }))
    assert.ok('admitted' in admitted, JSON.stringify(admitted))
    for (const row of await m.persistence.claimRuntimeOutbox(workerPool, 'r123-seed', 50, 30)) await m.persistence.dispatchRuntimeOutbox(workerPool, row.project_id, row.id, row.lease_token)
    const polled = await call('/v1/runtime/commands?after=0&waitMs=0')
    const create = polled.json.commands.map((q) => q.command).find((c) => c.binding.attemptId === admitted.admitted.attemptId)
    assert.ok(create, `the seed create reached the placeholder lease: ${polled.text.slice(0, 300)}`)
    const receipt = { commandId: create.commandId, attemptId: create.binding.attemptId, stage: 'delivered', nativeSessionId: `sophia-${create.binding.attemptId}`, nativeSequence: 1, evidenceRefs: [], observedAt: new Date().toISOString(), reason: null }
    assert.equal((await call('/v1/runtime/receipts', { receipts: [receipt] })).status, 204)
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
          WHERE j.id=$1 ORDER BY rc.seq DESC LIMIT 1`, [admitted.admitted.taskId])).rows
      const job = crypto.randomUUID()
      const binding = crypto.randomUUID()
      const rcId = crypto.randomUUID()
      await c.query(`INSERT INTO sophia.work_attempts SELECT (jsonb_populate_record(NULL::sophia.work_attempts, $1::jsonb)).*`, [{ ...row.attempt, id: att }])
      await c.query(`INSERT INTO sophia.execution_bindings SELECT (jsonb_populate_record(NULL::sophia.execution_bindings, $1::jsonb)).*`,
        [{ ...row.binding, id: binding, attempt_id: att, native_session_id: `sophia-${att}`, state: 'created' }])
      await c.query(`INSERT INTO sophia.jobs SELECT (jsonb_populate_record(NULL::sophia.jobs, $1::jsonb)).*`, [{ ...row.job, id: job, kind, attempt_id: att }])
      let contextPacketId = row.command.body.contextPacketId
      if (kind === 'design') {
        await c.query(`INSERT INTO sophia.design_tasks(project_id,job_id,research_job_id,root_job_id,allowance_id,actor_id,artifact_id,base_version_id,markdown_sha256,
          language,targets,role,route) VALUES($1,$2,$3,$3,$4,$5,gen_random_uuid(),gen_random_uuid(),$6,'en','{w390-light}',$7,$8)`,
          [w.projectId, job, admitted.admitted.taskId, row.allowance_id, E, 'a'.repeat(64), DESIGNER, ROUTE])
      } else {
        const manifest = crypto.randomUUID()
        await c.query(`INSERT INTO sophia.source_texts(project_id,source_id,body) VALUES($1,$2,$3)`, [w.projectId, manifest, JSON.stringify({ route: { id: REVIEW_ROUTE } })])
        await c.query(`UPDATE sophia.jobs SET input_source_id=$2 WHERE project_id=$1 AND id=$3`, [w.projectId, manifest, job])
        const [allowance] = (await c.query(`INSERT INTO sophia.research_allowances(project_id,cap_usd,headroom_usd,source_policy,max_searches,max_reads)
          VALUES($1,0.5,0,'web-pilot-v1',0,0) RETURNING id`, [w.projectId])).rows
        await c.query(`INSERT INTO sophia.work_items(project_id,id,plan_id,plan_revision,execution_goal_id,allowance_id,accepted_by)
          VALUES($1,gen_random_uuid(),gen_random_uuid(),1,$2,$3,$4)`, [w.projectId, row.goal_id, allowance.id, E])
        contextPacketId = manifest
      }
      const [{ seq }] = (await c.query(`UPDATE sophia.runtime_instances SET command_sequence=command_sequence+1 WHERE id=$1 RETURNING command_sequence::text AS seq`, [row.command.runtime_id])).rows
      const payload = kind === 'design' ? { role: DESIGNER, route: ROUTE, text: 'Design the HTML report.' } : { role: REVIEWER, route: REVIEW_ROUTE, text: 'Source review task. Review the sources below.' }
      const body = { ...row.command.body, commandId: rcId, binding: { ...row.command.body.binding, attemptId: att }, kind: 'create', expectedNativeSessionId: null, contextPacketId, payload }
      await c.query(`INSERT INTO sophia.runtime_commands SELECT (jsonb_populate_record(NULL::sophia.runtime_commands, $1::jsonb)).*`,
        [{ ...row.command, id: rcId, outbox_id: crypto.randomUUID(), binding_id: binding, attempt_id: att, seq: Number(seq), kind: 'create', answered_stage: null, body }])
      await c.query('COMMIT')
    } catch (err) {
      await c.query('ROLLBACK')
      throw err
    } finally {
      c.release()
    }
    return { attemptId: att, nativeSessionId: `sophia-${att}` }
  }

  const dispatchRows = async (projectId) => owner(`SELECT d.reservation_id, d.phase,
    (SELECT count(*)::int FROM sophia.research_bound_applications a WHERE a.project_id=d.project_id AND a.reservation_id=d.reservation_id) AS applies,
    (SELECT count(*)::int FROM sophia.research_bound_claims c WHERE c.project_id=d.project_id AND c.reservation_id=d.reservation_id) AS claims,
    (SELECT c.claimed_at FROM sophia.research_bound_claims c WHERE c.project_id=d.project_id AND c.reservation_id=d.reservation_id) AS claimed_at,
    (SELECT o.payload->>'outcome_kind' FROM sophia.research_bound_outcomes o WHERE o.project_id=d.project_id AND o.reservation_id=d.reservation_id) AS outcome,
    (SELECT i.operation FROM sophia.research_call_identities i WHERE i.project_id=d.project_id AND i.reservation_id=d.reservation_id) AS operation
    FROM sophia.research_bound_dispatches d WHERE d.project_id=$1`, [projectId])
  const repliesFor = (routeId) => ({ mode: 'service', routeId, executorDigestEnv: 'SOPHIA_EXECUTOR_DIGEST' })
  /** The route a family's model call runs on (design roles run on the research route) and its overlay provider. */
  const ROUTES = {
    research: { route: ROUTE, provider: 'openai-research', model: RESEARCH.model, ceiling: RESEARCH.maxTokens },
    design: { route: ROUTE, provider: 'openai-research', model: RESEARCH.model, ceiling: RESEARCH.maxTokens },
    'source-review': { route: REVIEW_ROUTE, provider: 'openai-review', model: REVIEW.model, ceiling: REVIEW.maxTokens },
  }

  /**
   * An OPTED real runtime: the profile reference and service mode in the overlay; the profile registered with the actual
   * runtime's verified emitter (computed from the exact overlay first) and the controlled settings reference. `prepare`
   * runs before the launch (a synthetic attempt), `before` between the bridge's steps (the proxy).
   */
  async function optedRun(scope, w, { family = 'research', ceiling = 777, api = 'on', compat, register = true, activate = true, endpoint = ENDPOINT, prepare, before, ref = {} } = {}) {
    const r = ROUTES[family]
    const reference = family === 'source-review' ? legacyReviewBody : legacyBody
    assert.ok(reference, `needs the legacy ${family === 'source-review' ? 'review' : 'research'} body for the controlled settings reference`)
    const settingsDigest = boundSettingsDigest(reference)
    const profileId = crypto.randomUUID()
    const provider = await startBoundProvider()
    scope.own('provider', () => provider.close())
    const overlay = boundOverlayJson(bundlePatch, provider.baseURL, r.provider, { compat,
      bridge: { replies: repliesFor(r.route), boundProfiles: { [r.route]: { profileId, revision: '1', endpoint, settingsDigest } } } })
    const probeDir = scope.scratch(mkdtempSync(join(tmpdir(), 'sophia-r123-emitter-')))
    const probe = homeLayout(join(probeDir.dir, 'home'))
    installProfile({ unit, runtimeDir: RUNTIME_DIR, layout: probe })
    const emitter = (await executorClosureDigest({ unit, runtimeDir: RUNTIME_DIR, layout: probe, overlays: [overlay] })).digest
    const p = register ? await profileAt(w, profileId, { ceiling, settingsDigest, emitter, activate, route: r.route, provider: r.provider, model: r.model, endpoint }) : { profileId, revision: '1' }
    ref.p = p
    const at = prepare ? await prepare() : null
    const run = await launch(scope, w, { overlay, api, before, env: { SOPHIA_EXECUTOR_DIGEST: emitter } })
    assert.match(run.runtime.stderr(), new RegExp(`bound_output route=${r.route} opted=on reason=qualified_reference`))
    assert.match(run.runtime.stderr(), /bound_output capability=provided version=sophia-c2-bound-v1/)
    return { provider, run, emitter, p, settingsDigest, at }
  }
  /** Hold until `refused()` holds, then a quiet period: the double saw NO request at all. */
  async function zeroHttpAfter(o, refused, what) {
    await o.run.until(refused, what)
    await new Promise((r) => setTimeout(r, 2000))
    assert.equal(o.provider.requests.length, 0, `zero HTTP: ${o.run.runtime.stderr().slice(-1500)}`)
  }
  async function refusedBeforeSend(w, o, refused, what) {
    await research(w, o.run, refused, what)
    await new Promise((r) => setTimeout(r, 1500))
    assert.equal(o.provider.requests.length, 0, `zero HTTP: ${o.run.runtime.stderr().slice(-1500)}`)
  }
  const stderrHas = (o, pattern) => () => pattern.test(o.run.runtime.stderr())
  const reserveRefused = (o) => () => o.run.proxy.of('/research/reserve').some((r) => r.status !== 200)
  const runtimeHeaders = (w, instance) => ({ authorization: `Bearer ${w.rt.token}`, 'content-type': 'application/json', 'x-sophia-runtime-unit': unit.id, 'x-sophia-bridge-instance': instance, 'x-sophia-bridge-protocol': '1' })

  /** The bounded positive of one family, through the maintained app ON, after its settlement. */
  async function boundPositive(w, o, family) {
    const r = ROUTES[family]
    const [reserve] = o.run.proxy.of(`/${family}/reserve`)
    const ask = JSON.parse(reserve.raw)
    const ack = JSON.parse(reserve.answer)
    assert.equal(reserve.status, 200, reserve.answer)
    assert.deepEqual(ask.boundProfile, { profileId: o.p.profileId, revision: '1' })
    assert.equal('maxTokens' in ask || 'bound' in ask, false, 'never a caller number')
    const out = ack.binding.bounds.items.find((i) => i.dimension === 'openai.output_tokens')
    assert.deepEqual([out.boundKind, out.bound, out.enforcementKind], ['authorized', '777', 'output_parameter'])
    assert.equal(ack.binding.bounds.items.find((i) => i.dimension === 'openai.model_requests').boundKind, 'unsupported', 'model_requests stays unsupported')
    assert.equal(o.provider.requests.length, 1)
    const body = o.provider.requests[0].body
    assert.equal(body.max_output_tokens, 777, 'the dynamic server P in the ACTUAL HTTP body')
    assert.ok(777 < r.ceiling, 'below the route ceiling')
    assert.equal(body.model, r.model)
    assert.equal(boundSettingsDigest(body), o.settingsDigest)
    const claims = o.run.proxy.of(`/${family}/bound/claim`)
    assert.equal(claims.length, 1, 'exactly one claim crossed before the send')
    const [claim] = claims
    assert.equal(claim.status, 200, claim.answer)
    assert.equal(JSON.parse(claim.answer).sendPermitted, true)
    assert.ok(claim.answeredAt <= o.provider.requests[0].arrivedAt, `claim answered ${claim.answeredAt} <= arrival ${o.provider.requests[0].arrivedAt}`)
    const [row] = await dispatchRows(w.projectId)
    assert.deepEqual([row.phase, row.applies, row.claims, row.reservation_id], ['claimed', 1, 1, ack.reservationId], 'the same reservation lineage')
    assert.equal(row.operation, family === 'source-review' ? 'source_review' : family)
    assert.ok(new Date(row.claimed_at).getTime() <= o.provider.requests[0].arrivedAt)
    await o.run.until(async () => (await dispatchRows(w.projectId))[0].outcome === 'sent', 'the sent outcome')
    const again = await fetch(`${appUrl}${claim.path}`, { method: 'POST', headers: runtimeHeaders(w, claim.instance), body: claim.raw })
    const replay = await again.json()
    assert.deepEqual([again.status, replay.sendPermitted, replay.replay], [200, false, true], 'an exact replay is history, never permission')
    assert.equal(o.provider.requests.length, 1, 'no resend')
    const [settle] = o.run.proxy.of(`/${family}/settle`)
    assert.equal(settle.status, 200, settle.answer)
    assert.equal(JSON.parse(settle.raw).reservationId, ack.reservationId, 'settled on the same reservation')
  }

  /**
   * An emitter Hold, Stop or revocation between the reserve and the claim: the test's own proxy runs `action` when the
   * first bound apply arrives, BEFORE forwarding it. The apply or claim then refuses, the hook throws, pi-ai never calls
   * `create`: zero HTTP, no claim.
   */
  const between = (action) => {
    let fired = false
    return {
      fired: () => fired,
      before: async (path, raw) => {
        if (fired || !/\/bound\/apply$/.test(path)) return
        fired = true
        await action(JSON.parse(raw))
      },
    }
  }
  /** The ACTUAL Hold / Stop writer (admit_goal_command) by an editor, on the attempt the apply names. */
  async function goalCommand(w, attemptId, kind) {
    const [g] = await owner(`SELECT g.id AS goal, g.revision::text AS revision, g.authority_epoch::text AS epoch FROM sophia.work_attempts a
      JOIN sophia.goals g ON g.project_id=a.project_id AND g.id=a.goal_id WHERE a.project_id=$1 AND a.id=$2`, [w.projectId, attemptId])
    await m.persistence.withActor(pool, E, 'write', (c) => c.query(`SELECT sophia.admit_goal_command($1,$2,$3,$4,$5,$6)`,
      [w.projectId, g.goal, kind, `r123-${kind}-${crypto.randomUUID()}`, g.revision, g.epoch]))
  }
  const noClaimZeroHttp = async (w, o, family) => {
    const rows = await dispatchRows(w.projectId)
    assert.ok(rows.length >= 1, 'the reserve authorized a dispatch first')
    assert.deepEqual(rows.map((r) => r.claims), rows.map(() => 0), `no claim: ${JSON.stringify(rows)}`)
    assert.equal(o.run.proxy.of(`/${family}/bound/claim`).filter((c) => c.status === 200 && JSON.parse(c.answer).sendPermitted === true).length, 0)
    assert.equal(o.provider.requests.length, 0)
  }

  test('the maintained app: OFF (the default) serves none of the nine bound paths and refuses an opted reserve 422 before any effect; ON serves all nine and is ready', async () => {
    assert.equal(m.persistence.BOUND_OUTPUT_V1, m.bounds.BOUND_OUTPUT_V1, 'the persistence index exports the production object')
    const w = await world()
    const headers = runtimeHeaders(w, 'r123-plain')
    for (const family of ['research', 'design', 'source-review'])
      for (const step of ['apply', 'claim', 'outcome']) {
        const url = `/v1/runtime/${family}/bound/${step}`
        assert.equal(offApp.hasRoute({ method: 'POST', url }), false, `OFF: ${family} ${step} registered`)
        assert.equal(app.hasRoute({ method: 'POST', url }), true, `ON: ${family} ${step} not registered`)
        const res = await fetch(`${offUrl}${url}`, { method: 'POST', headers, body: '{}' })
        assert.notEqual(res.status, 200, `OFF ${family} ${step}`)
      }
    for (const family of ['research', 'design', 'source-review']) {
      const res = await fetch(`${offUrl}/v1/runtime/${family}/reserve`, { method: 'POST', headers, body: JSON.stringify({ attemptId: 'a1', nativeSessionId: 's1', callId: 'c1', kind: 'model',
        provider: 'openai-research', amountUsd: 0.1, mode: 'tracked_v1', contract: 'legacy_report', boundProfile: { profileId: crypto.randomUUID(), revision: '1' } }) })
      const body = await res.json()
      assert.deepEqual([res.status, body.code, body.message], [422, 'invalid_request', 'Bound output is not enabled on this service'], family)
    }
    assert.equal((await owner(`SELECT count(*)::int AS n FROM sophia.research_reservations WHERE project_id=$1`, [w.projectId]))[0].n, 0)
    for (const api of [app, offApp]) assert.deepEqual([(await api.inject({ method: 'GET', url: '/ready' })).statusCode], [200], 'ready on the full schema')
  })

  test('app ON, unopted research (the committed row: no boundProfiles): legacy unchanged, no capability, ordinary HTTP with the route ceiling', () => withOwned(async (scope) => {
    const w = await world()
    const provider = await startBoundProvider()
    scope.own('provider', () => provider.close())
    const run = await launch(scope, w, { overlay: boundOverlayJson(bundlePatch, provider.baseURL, 'openai-research') })
    await research(w, run, () => run.proxy.of('/research/settle').length >= 1, 'the legacy settlement')
    assert.doesNotMatch(run.runtime.stderr(), /bound_output capability=provided/)
    const [reserve] = run.proxy.of('/research/reserve')
    assert.equal('boundProfile' in JSON.parse(reserve.raw), false)
    assert.equal(reserve.status, 200)
    assert.equal(JSON.parse(reserve.answer).binding.bounds, undefined)
    assert.equal(provider.requests.length, 1, 'a legacy unopted call may send, as before')
    assert.equal(provider.requests[0].body.max_output_tokens, RESEARCH.maxTokens, 'the route ceiling, exactly as before')
    assert.deepEqual(await dispatchRows(w.projectId), [])
    legacyBody = provider.requests[0].body
  }))

  test('app ON, unopted source review (synthetic attempt, real runtime): legacy unchanged, ordinary HTTP with the review ceiling', () => withOwned(async (scope) => {
    const w = await world()
    const provider = await startBoundProvider()
    scope.own('provider', () => provider.close())
    await syntheticAttempt(w, 'source_review')
    const run = await launch(scope, w, { overlay: boundOverlayJson(bundlePatch, provider.baseURL, 'openai-review') })
    await run.until(() => run.proxy.of('/source-review/settle').length >= 1, 'the legacy review settlement')
    const [reserve] = run.proxy.of('/source-review/reserve')
    assert.equal(reserve.status, 200, reserve.answer)
    assert.equal('boundProfile' in JSON.parse(reserve.raw), false)
    assert.equal(provider.requests.length, 1)
    assert.equal(provider.requests[0].body.max_output_tokens, REVIEW.maxTokens, 'the review route ceiling, exactly as before')
    assert.equal(provider.requests[0].body.model, REVIEW.model)
    assert.deepEqual(await dispatchRows(w.projectId), [])
    legacyReviewBody = provider.requests[0].body
  }))

  test('research positive: dynamic server P (777) below the route ceiling in the ACTUAL HTTP body, claim before arrival, outcome sent, no resend on replay', () => withOwned(async (scope) => {
    const w = await world()
    const o = await optedRun(scope, w)
    o.provider.script({ text: 'ok', usage: { input_tokens: 100, output_tokens: 50, input_tokens_details: { cached_tokens: 0 } } })
    await research(w, o.run, () => o.run.proxy.of('/research/settle').length >= 1, 'the bounded settlement')
    await boundPositive(w, o, 'research')
  }))

  test('design positive (synthetic designer attempt on the research route): P 777 in the ACTUAL HTTP body, claim before arrival, same lineage, no resend on replay', () => withOwned(async (scope) => {
    const w = await world()
    const o = await optedRun(scope, w, { family: 'design', prepare: () => syntheticAttempt(w, 'design') })
    await o.run.until(() => o.run.proxy.of('/design/settle').length >= 1, 'the bounded design settlement')
    await boundPositive(w, o, 'design')
  }))

  test('source-review positive (synthetic reviewer attempt on its own route): P 777 in the ACTUAL HTTP body, claim before arrival, same lineage, no resend on replay', () => withOwned(async (scope) => {
    const w = await world()
    const o = await optedRun(scope, w, { family: 'source-review', prepare: () => syntheticAttempt(w, 'source_review') })
    await o.run.until(() => o.run.proxy.of('/source-review/settle').length >= 1, 'the bounded review settlement')
    await boundPositive(w, o, 'source-review')
  }))

  test('C2W-F01 real: a configured and registered endpoint other than the actual Responses API refuses in the hook before apply; zero HTTP', () => withOwned(async (scope) => {
    const w = await world()
    const o = await optedRun(scope, w, { endpoint: 'openai-completions' })
    await refusedBeforeSend(w, o, stderrHas(o, /bound_call refused reason=endpoint/), 'the endpoint refusal')
    assert.equal(JSON.parse(o.run.proxy.of('/research/reserve')[0].answer).binding.bounds.items.length, 4, 'the reserve itself was authorized')
    assert.deepEqual((await dispatchRows(w.projectId)).map((r) => [r.applies, r.claims]), [[0, 0]], 'no apply, no claim')
    assert.equal(o.run.proxy.of('/research/bound/apply').length, 0)
  }))

  for (const [what, act] of [
    ['the member\'s goal Hold', (w) => (b) => goalCommand(w, b.attemptId, 'hold')],
    ['the member\'s goal Stop', (w) => (b) => goalCommand(w, b.attemptId, 'stop')],
    ['the owner\'s profile revocation', (w, ref) => () => ref.p.event('revoke')],
  ]) {
    test(`research: ${what} between the reserve and the claim: no claim, zero HTTP`, () => withOwned(async (scope) => {
      const w = await world()
      const ref = {}
      const gate = between((b) => act(w, ref)(b))
      const o = await optedRun(scope, w, { before: gate.before, ref })
      await refusedBeforeSend(w, o, stderrHas(o, /bound_call refused reason=(apply|claim)_/), `${what}: the refused step`)
      assert.equal(gate.fired(), true, 'the action ran between the reserve and the claim')
      await noClaimZeroHttp(w, o, 'research')
    }))
  }

  test('design: the owner\'s profile revocation between the reserve and the claim: no claim, zero HTTP', () => withOwned(async (scope) => {
    const w = await world()
    const ref = {}
    const gate = between(() => ref.p.event('revoke'))
    const o = await optedRun(scope, w, { family: 'design', prepare: () => syntheticAttempt(w, 'design'), before: gate.before, ref })
    await zeroHttpAfter(o, stderrHas(o, /bound_call refused reason=(apply|claim)_/), 'the refused design step')
    assert.equal(gate.fired(), true)
    await noClaimZeroHttp(w, o, 'design')
  }))

  test('source review: the member\'s goal Stop between the reserve and the claim: no claim, zero HTTP', () => withOwned(async (scope) => {
    const w = await world()
    const gate = between((b) => goalCommand(w, b.attemptId, 'stop'))
    const o = await optedRun(scope, w, { family: 'source-review', prepare: () => syntheticAttempt(w, 'source_review'), before: gate.before })
    await zeroHttpAfter(o, stderrHas(o, /bound_call refused reason=(apply|claim)_/), 'the refused review step')
    assert.equal(gate.fired(), true)
    await noClaimZeroHttp(w, o, 'source-review')
  }))

  test('opted while the API option is OFF (the maintained default app): refused at reserve before any effect, never downgraded, zero HTTP', () => withOwned(async (scope) => {
    const w = await world()
    const o = await optedRun(scope, w, { api: 'off' })
    await refusedBeforeSend(w, o, reserveRefused(o), 'the refused reserve')
    const reserves = o.run.proxy.of('/research/reserve')
    assert.ok(reserves.length >= 1)
    for (const r of reserves) {
      assert.equal(r.status, 422, r.answer)
      assert.ok('boundProfile' in JSON.parse(r.raw), 'no legacy fallback request')
    }
    assert.deepEqual(await dispatchRows(w.projectId), [])
    assert.equal((await owner(`SELECT count(*)::int AS n FROM sophia.research_reservations WHERE project_id=$1 AND kind='model'`, [w.projectId]))[0].n, 0)
  }))

  test('P below 16 (server ceiling 8): refused in the hook before apply, zero HTTP', () => withOwned(async (scope) => {
    const w = await world()
    const o = await optedRun(scope, w, { ceiling: 8 })
    await refusedBeforeSend(w, o, stderrHas(o, /bound_call refused reason=output_bound_below_minimum/), 'P<16 refusal')
    assert.deepEqual((await dispatchRows(w.projectId)).map((r) => [r.applies, r.claims]), [[0, 0]])
  }))

  test('P above the request (server ceiling 20000 > the route\'s 16000): refused before apply, never enlarged, zero HTTP', () => withOwned(async (scope) => {
    const w = await world()
    const o = await optedRun(scope, w, { ceiling: 20000 })
    await refusedBeforeSend(w, o, stderrHas(o, /bound_call refused reason=output_bound_above_request/), 'P>request refusal')
    assert.deepEqual((await dispatchRows(w.projectId)).map((r) => [r.applies, r.claims]), [[0, 0]])
  }))

  test('compat without max_output_tokens: no output parameter to bound, refused before apply, zero HTTP', () => withOwned(async (scope) => {
    const w = await world()
    const o = await optedRun(scope, w, { compat: { supportsMaxOutputTokens: false } })
    await refusedBeforeSend(w, o, stderrHas(o, /bound_call refused reason=output_parameter_unsupported/), 'unsupported refusal')
  }))

  test('profile revoked before the call: the reserve refuses (no dispatch), zero HTTP', () => withOwned(async (scope) => {
    const w = await world()
    const o = await optedRun(scope, w)
    await o.p.event('revoke')
    await refusedBeforeSend(w, o, reserveRefused(o), 'the refused reserve')
    for (const r of o.run.proxy.of('/research/reserve')) assert.notEqual(r.status, 200, r.answer)
    assert.deepEqual(await dispatchRows(w.projectId), [])
  }))

  test('send failure after the claim (connection dropped before any header): claimed, may have sent, no outcome invented, no resend', () => withOwned(async (scope) => {
    const w = await world()
    const o = await optedRun(scope, w)
    o.provider.dropNext()
    await research(w, o.run, () => o.run.proxy.of('/research/settle').length >= 1, 'the settlement after the dropped send')
    assert.equal(o.provider.requests.length, 1)
    assert.equal(o.provider.requests[0].dropped, true)
    assert.equal(o.provider.requests[0].body.max_output_tokens, 777)
    assert.match(o.run.runtime.stderr(), /bound_call outcome=unknown may_have_sent=true/)
    // Quiet period, then per-dispatch accounting. dsh's own retry layer may re-issue the MODEL CALL after the dropped
    // connection; that is a NEW call: a new reservation, dispatch, apply and claim of its own (never this claim again).
    await new Promise((r) => setTimeout(r, 4000))
    const rows = await dispatchRows(w.projectId)
    const requests = o.provider.requests
    assert.equal(rows.every((r) => r.claims === 1 && r.phase === 'claimed'), true, JSON.stringify(rows))
    assert.equal(requests.length, rows.length, 'one request per claimed dispatch: no claim sent twice')
    assert.equal(new Set(o.run.proxy.of('/research/bound/claim').filter((c) => c.status === 200 && JSON.parse(c.answer).sendPermitted).map((c) => JSON.parse(c.raw).claim.dispatchId)).size, rows.length,
      'each permission is a distinct dispatch')
    assert.equal(rows.filter((r) => r.outcome === null).length, requests.filter((q) => q.dropped).length, 'a dropped send leaves no outcome (may have sent)')
    assert.equal(rows.filter((r) => r.outcome === 'sent').length, requests.filter((q) => !q.dropped).length, 'an observed answer is sent')
    for (const q of requests) assert.equal(q.body.max_output_tokens, 777)
  }))

  test('a 5xx answer after the claim: an observed HTTP response is `sent`; one request, no resend', () => withOwned(async (scope) => {
    const w = await world()
    const o = await optedRun(scope, w)
    o.provider.script({ status: 500 })
    await research(w, o.run, () => o.run.proxy.of('/research/settle').length >= 1, 'the settlement after the 5xx')
    assert.equal(o.provider.requests.length, 1)
    await o.run.until(async () => (await dispatchRows(w.projectId))[0]?.outcome === 'sent', 'the sent outcome')
  }))

  test('output above P: the settle records the contradiction and the profile auto-holds (K4)', () => withOwned(async (scope) => {
    const w = await world()
    const o = await optedRun(scope, w)
    o.provider.script({ text: 'ok', usage: { input_tokens: 100, output_tokens: 900, input_tokens_details: { cached_tokens: 0 } } })
    await research(w, o.run, () => o.run.proxy.of('/research/settle').length >= 1, 'the contradicted settlement')
    const [settle] = o.run.proxy.of('/research/settle')
    assert.equal(settle.status, 200, settle.answer)
    const state = (await owner(`SELECT sophia.research_bound_profile_state($1, 1, 'openai.output_tokens') AS s`, [o.p.profileId]))[0].s
    assert.equal(state, 'auto_hold')
    const [row] = await dispatchRows(w.projectId)
    const status = (await owner(`SELECT sophia.research_bound_status($1, $2) AS s`, [w.projectId, row.reservation_id]))[0].s
    assert.equal(status.dimensions.find((d) => d.dimension === 'openai.output_tokens').status, 'contradicted')
  }))
})
