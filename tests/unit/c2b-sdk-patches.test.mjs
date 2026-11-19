/**
 * INC04-R07-C2B-PRODUCER-001: the two revised SDK patches as DEPLOYED, i.e. the patched pi-ai and dsh-llm-pi-ai inside
 * the locally built `.artifacts/runtime` (never the workspace node_modules), driven through the adapter's own `apply`
 * and `stream` against the local Responses test double with a dummy key. The host context is minimal and LABELLED: it
 * hands the adapter its registration, a credential and (or not) the observation capability, nothing else.
 *
 * What is shown: frames exist only with the exact capability on openai-responses; F1/F2/F3 cross at most once, in order,
 * before usage and finish, with a non-enumerable frozen payload; the C1P usage and finish chunks are byte-for-byte those
 * of a call without the capability; and each ending (consumer return, consumer throw, caller abort, transport cut, HTTP
 * error, in-stream error, failed or completed response) yields only what was actually delivered.
 * Nothing here calls a real provider; the double says nothing about the live service.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { cpSync, mkdtempSync, realpathSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { after, before, describe, test as nodeTest } from 'node:test'
import { parse } from 'yaml'
import { REPO_ROOT, RUNTIME_DIR } from '../../scripts/lib/common.mjs'
import { CallObservation, payloadOf } from '../../packages/dsh-bundle/dist/c2b-observation.js'
import { startMockResponses } from '../support/mock-responses.mjs'
import { treeDigest } from '../../scripts/lib/tree-digest.mjs'
import { BoundCalls, BoundDispatch } from '../../packages/dsh-bundle/dist/control-bridge.js'
import { TransportError } from '../../packages/dsh-bundle/dist/transport.js'

const FRAME = 'x-sophia-c2b-observation'
const KEY = 'sophiaC2bObservation'
const SERVICE = Object.freeze({ version: 'sophia-c2b-observation-v1' })
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const PATCHES = {
  pi: { name: '@earendil-works/pi-ai@0.87.1', file: 'patches/@earendil-works__pi-ai@0.87.1.patch', dir: '@earendil-works+pi-ai@0.87.1_patch_hash=', files: ['dist/api/openai-responses-shared.js', 'dist/api/openai-responses.js', 'dist/types.d.ts'] },
  da: { name: '@deepseek-ai/dsh-llm-pi-ai@0.2.0-rc.2', file: 'patches/@deepseek-ai__dsh-llm-pi-ai@0.2.0-rc.2.patch', dir: '@deepseek-ai+dsh-llm-pi-ai@0.2.0-rc.2_patch_hash=', files: ['lib/index.js'] },
}
const store = join(RUNTIME_DIR, 'node_modules', '.pnpm')
const deployed = (p) => readdirSync(store).filter((d) => d.startsWith(p.dir.split('_patch_hash=')[0].replace(/@[^@]+$/, '')) && d.includes(p.name.split('@').at(-1)))

let DA
let PI
let OpenAI
let mock
let identityBefore
const unit = JSON.parse(readFileSync(join(REPO_ROOT, 'config/runtime-unit.json'), 'utf8'))
const report = (value) => console.log('SDK_DIRECT_V1 ' + JSON.stringify(value))
function test(name, fn) {
  return nodeTest(name, async (t) => {
    const requests = mock?.requests.length ?? 0
    report({ case: name, phase: 'started', platform: process.platform, arch: process.arch })
    try {
      await fn(t)
      report({ case: name, phase: 'completed', status: 'passed', requests: (mock?.requests.length ?? 0) - requests })
    } catch (error) {
      report({ case: name, phase: 'completed', status: 'failed', errorClass: error?.constructor?.name })
      throw error
    }
  })
}
function modulePaths(root) {
  const store = join(root, 'node_modules/.pnpm')
  const one = (patch, suffix) => {
    const copies = readdirSync(store).filter((d) => d.startsWith(patch.dir))
    assert.equal(copies.length, 1)
    return join(store, copies[0], 'node_modules', suffix)
  }
  return { pi: one(PATCHES.pi, '@earendil-works/pi-ai'), da: one(PATCHES.da, '@deepseek-ai/dsh-llm-pi-ai') }
}
function provenance() {
  const command = (args) => {
    const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
    assert.equal(result.status, 0)
    return result.stdout
  }
  const pnpm = spawnSync('pnpm', ['--version'], { cwd: REPO_ROOT, encoding: 'utf8' })
  assert.equal(pnpm.status, 0)
  assert.equal(pnpm.stdout.trim(), '11.7.0')
  assert.equal(process.versions.node, '24.21.0')
  const runtime = treeDigest(RUNTIME_DIR)
  assert.deepEqual({ digest: runtime.digest, entries: runtime.entries.length }, unit.dsh.artifacts_by_platform[`${process.platform}-${process.arch}`])
  const paths = modulePaths(RUNTIME_DIR), modules = []
  for (const [key, patch] of Object.entries(PATCHES)) {
    const base = paths[key]
    const manifest = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'))
    const root = realpathSync(RUNTIME_DIR)
    for (const file of patch.files) {
      const actual = realpathSync(join(base, file)), rel = relative(root, actual)
      assert.ok(rel && !rel.startsWith('..') && !rel.startsWith('/'))
      modules.push({ package: manifest.name, version: manifest.version, path: rel, sha256: sha(readFileSync(actual)) })
    }
  }
  const openai = realpathSync(join(paths.pi, '..', '..', 'openai'))
  const openaiRel = relative(realpathSync(RUNTIME_DIR), openai)
  assert.ok(openaiRel && !openaiRel.startsWith('..') && !openaiRel.startsWith('/'))
  modules.push({ package: 'openai', version: JSON.parse(readFileSync(join(openai, 'package.json'), 'utf8')).version, path: join(openaiRel, 'index.mjs'), sha256: sha(readFileSync(join(openai, 'index.mjs'))) })
  const source = Object.fromEntries(['config/runtime-unit.json', 'config/dsh/profile/pnpm-lock.yaml', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tests/unit/c2b-sdk-patches.test.mjs', 'config/dsh/profile/package.json', 'config/dsh/profile/cordis.patch.yml', 'packages/dsh-bundle/src/index.ts', 'packages/dsh-bundle/src/control-bridge.ts', 'packages/dsh-bundle/dist/control-bridge.js', 'packages/dsh-bundle/dist/c2b-observation.js', ...Object.values(PATCHES).map((p) => p.file)].map((file) => [file, sha(readFileSync(join(REPO_ROOT, file)))]))
  return { platform: process.platform, arch: process.arch, node: process.versions.node, pnpm: pnpm.stdout.trim(), head: command(['rev-parse', 'HEAD']).trim(), headTree: command(['rev-parse', 'HEAD^{tree}']).trim(), indexMetadataSha256: sha(command(['ls-files', '--stage', '-z'])), runtime: { digest: runtime.digest, entries: runtime.entries.length }, modules, source,
    qualification: process.platform === 'linux' ? 'Linux direct SDK measurement only; production maps remain old10edf' : 'Darwin probe development only; not Linux qualification',
    scope: 'Actual deployed SDK; labelled minimal host/local protocol/rights doubles; not installed profile, three wrappers, real API/DB/native/account/billing proof' }
}
before(async () => {
  const [dir] = readdirSync(store).filter((d) => d.startsWith(PATCHES.da.dir))
  DA = await import(join(store, dir, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js'))
  // R1: the deployed patched pi-ai's PUBLIC stream, and the OpenAI SDK it resolves itself (the same module instance, so
  // its APIError is the real carrier class).
  const [piDir] = readdirSync(store).filter((d) => d.startsWith(PATCHES.pi.dir))
  const piModules = join(store, piDir, 'node_modules')
  PI = await import(join(piModules, '@earendil-works', 'pi-ai', 'dist', 'api', 'openai-responses.js'))
  OpenAI = (await import(join(piModules, 'openai', 'index.mjs'))).default
  mock = await startMockResponses()
  identityBefore = provenance()
  report({ phase: 'identity-before', ...identityBefore })
})
after(async () => {
  await mock?.close()
  const identityAfter = provenance()
  assert.deepEqual(identityAfter, identityBefore, 'canonical installed runtime/source/config/index provenance is unchanged')
  report({ phase: 'identity-after', ...identityAfter })
  report({ phase: 'downstream', status: 'NOT_RUN_DOWNSTREAM', groups: ['installed-profile closure/qualifier maps', 'three maintained wrappers', 'real API/PG/current-rights/Hold/Stop/revoke', 'Linux argv/files/DB privacy', 'owner-native/accounts/deployed-app', 'map/common/profile coherent RECORD'], researchAndDesignShareSDKRoute: true })
})

/** The deployed adapter registered by its own `apply` on a LABELLED minimal host, with `service` provided or not. */
function adapterWith(service, api = 'openai-responses', { module = DA, peer = mock, bound, routeId = 'research-sol-medium-v1', compat = {} } = {}) {
  const route = unit.model_routes[routeId]
  let adapter
  const services = { credentials: { resolve: async () => ({ value: 'sk-c2b-sdk-test-dummy-0000000000' }), listRecords: async () => [] }, ...(service ? { sophiaC2bObservation: service } : {}), ...(bound ? { sophiaC2Bound: bound } : {}) }
  const ctx = {
    inject() {}, fiber: { entry: undefined }, on: () => () => {}, get: (name) => services[name],
    llm: { registerConfigurableProviders: () => ({ replace() {} }), registerModelDiscovery() {}, registerAdapter: (_routes, a) => { adapter = a; return { replace() {} } } },
    logger: { warn() {}, error() {}, info() {} },
  }
  module.apply(ctx, module.Config({ providers: { [route.provider]: { apiKeyEnv: 'OPENAI_RESEARCH_API_KEY', api, baseURL: peer.baseURL, defaultMaxTokens: 1000,
    models: [{ id: route.model, name: 'SDK fixture', contextWindow: 272000, maxTokens: 1000, input: ['text'], compat, reasoningEfforts: { [route.reasoningEffort]: route.reasoningEffort } }] } } }))
  return adapter
}
const REQUEST = { provider: 'openai-research', model: 'gpt-6.1-sol', messages: [{ role: 'user', content: [{ type: 'text', text: 'question' }] }] }

/** One call's chunks; `stopAt(chunk, i)` true returns from the consumer after that chunk (or throws when 'throw'). */
async function run(adapter, step, { stopAt, signal, peer = mock, routeId = 'research-sol-medium-v1', sessionId } = {}) {
  // A request the double never answers from its queue (another API's path) gets no step, so none is left queued.
  if (step !== null) peer.script(step)
  const route = unit.model_routes[routeId]
  const call = await adapter.prepareCall(route.provider, route.model)
  const chunks = []
  try {
    for await (const chunk of call.stream({ ...REQUEST, provider: route.provider, model: route.model, reasoningEffort: route.reasoningEffort, ...(signal ? { signal } : {}), ...(sessionId === undefined ? {} : { sessionId }) })) {
      chunks.push(chunk)
      const stop = stopAt?.(chunk, chunks.length - 1)
      if (stop === 'throw') throw new Error('consumer stops by throwing')
      if (stop) break
    }
  } catch (error) {
    if (error.message !== 'consumer stops by throwing') throw error
  }
  report({ phase: 'stream', routeId, chunks: chunks.map((c) => isFrame(c) ? { type: c.type, frame: payload(c).frame, ...(payload(c).providerTerminal ? { terminal: payload(c).providerTerminal } : {}) } : { type: c.type }),
    requestCensus: peer.requests.length, lastAllowedBody: peer.requests.length ? Object.fromEntries(['model', 'max_output_tokens', 'stream', 'store'].filter((k) => k in peer.requests.at(-1).body).map((k) => [k, peer.requests.at(-1).body[k]])) : null })
  return chunks
}
const isFrame = (c) => c.type === FRAME
const payload = (c) => Object.getOwnPropertyDescriptor(c, KEY).value
const frames = (chunks) => chunks.filter(isFrame).map(payload)
const kinds = (chunks) => chunks.filter(isFrame).map((c) => payload(c).frame)
const observed = (chunks) => {
  const o = new CallObservation()
  for (const c of chunks.filter(isFrame)) o.accept(payloadOf(payload(c)))
  return o.observed()
}
const until = async (predicate, what, ms = 10_000) => {
  const end = Date.now() + ms
  while (!predicate()) {
    if (Date.now() > end) throw new Error(`timed out: ${what}`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

describe('the two revised patches, as committed, locked and deployed', () => {
  test('each patch touches only its scoped upstream files, and its sha256 is the lock patch_hash', () => {
    const lock = parse(readFileSync(join(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8'))
    for (const p of Object.values(PATCHES)) {
      const bytes = readFileSync(join(REPO_ROOT, p.file))
      assert.equal(lock.patchedDependencies[p.name], sha(bytes), `${p.name}: lock patch_hash`)
      assert.deepEqual([...bytes.toString('utf8').matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]), p.files)
    }
  })

  test('the deployed runtime holds exactly one copy of each package, the patched one, and it carries the producer', () => {
    for (const p of Object.values(PATCHES)) {
      const hash = sha(readFileSync(join(REPO_ROOT, p.file))).slice(0, 32)
      const copies = readdirSync(store).filter((d) => d.startsWith(p.dir.split('_patch_hash=')[0]))
      assert.equal(copies.length, 1, `${p.name}: one deployed copy (${copies})`)
      assert.ok(copies[0].includes(`patch_hash=${hash}`), `${p.name}: the deployed copy is this patch's`)
    }
    assert.equal(typeof deployed, 'function')
  })
})

describe('activation: frames only with the exact capability on openai-responses, and C1P chunks unchanged', () => {
  test('producer without the capability, or a wrong version: zero frames; the same chunks as with the capability minus its frames', async () => {
    const step = { text: 'ok', requestId: 'req-plain' }
    const plain = await run(adapterWith(null), step)
    const wrong = await run(adapterWith(Object.freeze({ version: 'sophia-c2b-observation-v0' })), step)
    const active = await run(adapterWith(SERVICE), step)
    assert.equal(plain.filter(isFrame).length + wrong.filter(isFrame).length, 0)
    // Each call of the double numbers its own ids (resp_/rs_/msg_mock_<n>, mock-encrypted-<n>); everything else must be byte-identical.
    const strip = (chunks) => JSON.stringify(chunks.filter((c) => !isFrame(c))).replace(/_mock_\d+|mock-encrypted-\d+/g, 'mock-N')
    assert.equal(strip(active), strip(plain), 'every non-frame chunk, usage and finish included, is unchanged')
    assert.equal(strip(wrong), strip(plain))
    assert.deepEqual(kinds(active), ['transport', 'created', 'terminal'])
  })

  test('a provider on another API never emits, even with the capability (its request fails at the double, no frame)', async () => {
    const requests = mock.requests.length
    const chunks = await run(adapterWith(SERVICE, 'openai-completions'), null)
    assert.equal(mock.requests.length, requests, 'the double served nothing for it (404)')
    assert.equal(chunks.filter(isFrame).length, 0)
    assert.equal(chunks.at(-1).type, 'finish')
  })
})

describe('the frame grammar on a completed call', () => {
  test('F1, F2, F3 in order, each once, all before usage and finish; payload private, frozen and closed', async () => {
    const chunks = await run(adapterWith(SERVICE), { text: 'ok', requestId: 'req-A' })
    const types = chunks.map((c) => (isFrame(c) ? payload(c).frame : c.type))
    assert.deepEqual(types.filter((t) => ['transport', 'created', 'terminal', 'usage', 'finish'].includes(t)), ['transport', 'created', 'terminal', 'usage', 'finish'])
    for (const c of chunks.filter(isFrame)) {
      const d = Object.getOwnPropertyDescriptor(c, KEY)
      assert.deepEqual([d.enumerable, d.writable, d.configurable], [false, false, false])
      assert.ok(Object.isFrozen(d.value))
      assert.equal(JSON.stringify(c), `{"type":"${FRAME}"}`, 'nothing of the payload serializes')
      assert.deepEqual({ ...c }, { type: FRAME }, 'nothing of the payload spreads')
      assert.ok(payloadOf(d.value), 'the consumer accepts it as closed')
    }
    const [f1, f2, f3] = frames(chunks)
    assert.deepEqual(f1, { v: 1, frame: 'transport', sent: 'observable_transport_response', httpStatus: 200, n2: [{ id: { status: 'supported', value: 'req-A' }, source: 'response_header' }] })
    assert.deepEqual(f2.n1, [{ id: { status: 'supported', value: f3.n1[0].id.value }, source: 'created' }])
    assert.deepEqual(f3.n1.map((e) => e.source), ['created', 'completed'])
    assert.deepEqual([f3.providerTerminal, f3.rawCounts], ['completed', { inputTotal: 1, cacheRead: 0, output: 1 }])
    const finish = chunks.at(-1)
    assert.equal(finish.replayState.response.responseId, f3.n1[0].id.value, 'the baseline successful N1 stays in replay, unchanged')
  })

  test('F02 (R1): an ordinary completed call writes exactly one terminal, counted after the handler really finished', async () => {
    await mock.whenSettled()
    const before = mock.terminalSent
    const chunks = await run(adapterWith(SERVICE), { text: 'ok', requestId: 'req-count' })
    assert.equal(frames(chunks).at(-1).providerTerminal, 'completed')
    await mock.whenSettled()
    assert.equal(mock.terminalSent, before + 1)
  })

  test('known zeros stay zeros; a missing cached_tokens is no cacheRead (never 0) and C1P emits no usage', async () => {
    const zeros = await run(adapterWith(SERVICE), { text: 'ok', usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, input_tokens_details: { cached_tokens: 0 } } })
    assert.deepEqual(frames(zeros).at(-1).rawCounts, { inputTotal: 0, cacheRead: 0, output: 0 })
    const partial = await run(adapterWith(SERVICE), { text: 'ok', usage: { input_tokens: 1000, input_tokens_details: {} } })
    assert.deepEqual(frames(partial).at(-1).rawCounts, { inputTotal: 1000, output: 1 })
    assert.equal(partial.some((c) => c.type === 'usage'), false, 'C1P: partial usage is unknown, unchanged')
  })

  test('a failed response: its own N1 (source failed) and counts; an unsupported id is a fixed reason, counts kept', async () => {
    const failed = await run(adapterWith(SERVICE), { text: 'ok', terminal: 'failed', responseId: 'resp-failed-1' })
    const f3 = frames(failed).at(-1)
    assert.deepEqual(f3.n1, [{ id: { status: 'supported', value: 'resp-failed-1' }, source: 'created' }, { id: { status: 'supported', value: 'resp-failed-1' }, source: 'failed' }])
    assert.equal(f3.providerTerminal, 'failed')
    assert.ok(failed.some((c) => c.type === 'usage'), 'C1P keeps the complete usage of a failed response')
    const odd = await run(adapterWith(SERVICE), { text: 'ok', responseId: 12345 })
    assert.deepEqual(kinds(odd), ['transport', 'terminal'], 'no F2 for an unsupported created id')
    assert.deepEqual(frames(odd).at(-1).n1.map((e) => e.id), [{ status: 'identity_unsupported', reason: 'not_string' }, { status: 'identity_unsupported', reason: 'not_string' }])
    assert.ok(frames(odd).at(-1).rawCounts, 'counts retained beside the unsupported id')
    const long = await run(adapterWith(SERVICE), { text: 'ok', requestId: 'r'.repeat(8193) })
    assert.deepEqual(frames(long)[0].n2, [{ id: { status: 'identity_unsupported', reason: 'over_bound' }, source: 'response_header' }])
    assert.ok(!JSON.stringify(observed(long)).includes('r'.repeat(100)), 'the oversize value is never carried')
  })
})

describe('endings: only what was delivered, and nothing read after the consumer leaves', () => {
  test('an in-stream error event: the error_event terminal with its created N1, no counts, an error finish', async () => {
    const chunks = await run(adapterWith(SERVICE), { text: 'ok', errorEvent: { code: 'server_error' }, requestId: 'req-E' })
    const f3 = frames(chunks).at(-1)
    assert.equal(f3.providerTerminal, 'error_event')
    assert.equal(f3.rawCounts, undefined)
    assert.deepEqual(f3.n1.map((e) => e.source), ['created'])
    assert.equal(chunks.at(-1).reason.kind, 'error')
  })

  test('an HTTP 500 with x-request-id: no F1 (no stream), F3 with the typed status and N2 from the typed error', async () => {
    const chunks = await run(adapterWith(SERVICE), { status: 500, requestId: 'req-500' })
    assert.deepEqual(kinds(chunks), ['terminal'])
    assert.deepEqual(frames(chunks)[0], { v: 1, frame: 'terminal', sent: 'observable_transport_response', httpStatus: 500, n2: [{ id: { status: 'supported', value: 'req-500' }, source: 'typed_error' }] })
    assert.equal(chunks.at(-1).reason.kind, 'error')
  })

  test('a server transport cut right after the headers (not a consumer return): F1 crossed, then F3 without any provider terminal', async () => {
    const chunks = await run(adapterWith(SERVICE), { text: 'ok', cutAfterHeaders: true, requestId: 'req-cut' })
    assert.deepEqual(kinds(chunks), ['transport', 'terminal'])
    assert.equal(frames(chunks)[1].providerTerminal, undefined, 'a cut is no provider terminal event')
    assert.equal(observed(chunks).deliveryUnknownReason, 'none')
    assert.equal(chunks.at(-1).reason.kind, 'error')
  })

  test('a consumer return right after F1 (the provider holds before created): only the transport facts, then no further read', async () => {
    await mock.whenSettled()
    const abandoned = mock.abandoned
    const terminals = mock.terminalSent
    const chunks = await run(adapterWith(SERVICE), { text: 'ok', requestId: 'req-ret1', delayBeforeCreatedMs: 2000 }, { stopAt: (c) => isFrame(c) && payload(c).frame === 'transport' })
    assert.deepEqual(chunks.map((c) => (isFrame(c) ? payload(c).frame : c.type)), ['transport'])
    assert.deepEqual(observed(chunks), { sent: 'observable_transport_response', httpStatus: 200, n2: { id: { status: 'supported', value: 'req-ret1' }, sources: ['response_header'] }, deliveryUnknownReason: 'closed_before_terminal_frame' })
    await until(() => mock.abandoned === abandoned + 1, 'the provider stream closed by the adapter (no drain)')
    // F02 (R1): the delayed handler then really completes; its suppressed terminal is not counted as written.
    await mock.whenSettled()
    assert.equal(mock.terminalSent, terminals, 'no terminal written to the closed stream')
  })

  test('a consumer return, or a consumer throw, right after F2: the created N1 kept, no terminal, no counts, no drain', async () => {
    for (const how of [true, 'throw']) {
      await mock.whenSettled()
      const abandoned = mock.abandoned
      const terminals = mock.terminalSent
      const chunks = await run(adapterWith(SERVICE), { text: 'ok', requestId: 'req-ret2', delayMs: 2000 }, { stopAt: (c) => (isFrame(c) && payload(c).frame === 'created' ? how : false) })
      const o = observed(chunks)
      assert.deepEqual(o.n1.sources, ['created'])
      assert.equal(o.providerTerminal, undefined)
      assert.equal(o.deliveryUnknownReason, 'closed_before_terminal_frame')
      await until(() => mock.abandoned === abandoned + 1, `the provider stream closed (${how})`)
      // F02 (R1): after the delayMs handler really completes, nothing was written to the closed stream.
      await mock.whenSettled()
      assert.equal(mock.terminalSent, terminals, `no terminal written (${how})`)
    }
  })

  test('a caller abort while the consumer keeps reading: the terminal frame with what was seen and an aborted finish', async () => {
    await mock.whenSettled()
    const terminals = mock.terminalSent
    const controller = new AbortController()
    const chunks = await run(adapterWith(SERVICE), { text: 'ok', requestId: 'req-abort', delayMs: 2000 }, {
      signal: controller.signal,
      stopAt: (c) => { if (isFrame(c) && payload(c).frame === 'created') controller.abort(); return false },
    })
    assert.deepEqual(kinds(chunks), ['transport', 'created', 'terminal'])
    assert.equal(frames(chunks)[2].providerTerminal, undefined, 'an abort is not a provider terminal')
    assert.equal(chunks.at(-1).reason.kind, 'aborted')
    await mock.whenSettled()
    assert.equal(mock.terminalSent, terminals, 'F02 (R1): no terminal written after the abort closed the stream')
  })

  test('two calls (an agent retry is a new call) keep their own facts', async () => {
    const adapter = adapterWith(SERVICE)
    const first = await run(adapter, { status: 500, requestId: 'req-try-1' })
    const second = await run(adapter, { text: 'ok', requestId: 'req-try-2', responseId: 'resp-try-2' })
    assert.deepEqual(observed(first).n2.id.value, 'req-try-1')
    assert.deepEqual([observed(second).n2.id.value, observed(second).n1.id.value], ['req-try-2', 'resp-try-2'])
    assert.equal(observed(first).n1, undefined)
  })
})

/**
 * C2B69-F01 (R1): typed HTTP facts come only from the SDK's own rejection of the request. These drive the deployed patched
 * pi-ai PUBLIC `stream` (its documented onPayload/onResponse options) against the double with a dummy key; Sophia's
 * adapter forwards neither callback, and nothing here adds forwarding. What is read is the producer's private record, the
 * only source of the adapter's `sent`, `httpStatus` and N2 (its terminal payload derives them from `transport` and
 * `typedError` alone).
 */
describe('F01 (R1): typed HTTP facts only from the request\'s own rejection, on the public patched pi SDK', () => {
  const MODEL = { id: 'gpt-6.1-sol', name: 'Sol', api: 'openai-responses', provider: 'openai-research', reasoning: true, input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 272000, maxTokens: 1000 }
  const piRun = async (options) => {
    const events = []
    for await (const e of PI.stream({ ...MODEL, baseUrl: mock.baseURL }, { messages: [{ role: 'user', content: 'question', timestamp: 0 }] },
      { apiKey: 'sk-c2b-sdk-test-dummy-0000000000', callObservation: true, ...options })) events.push(e)
    const last = events.at(-1)
    const message = last.type === 'done' ? last.message : last.error
    const d = Object.getOwnPropertyDescriptor(message, KEY)
    return { last, record: d && 'value' in d ? d.value : undefined }
  }
  const forged = (status, id) => new OpenAI.APIError(status, { message: 'local' }, 'local', new Headers({ 'x-request-id': id }))

  for (const [what, make] of [
    ['a generic Error with a numeric status and a requestID', () => Object.assign(new Error('local before the request'), { status: 503, requestID: 'req-local-generic' })],
    ['a real OpenAI.APIError (the SDK carrier class itself)', () => forged(503, 'req-local-apierror')],
  ]) {
    test(`a local onPayload error BEFORE any HTTP, ${what}: zero requests, no transport, no typed status or N2`, async () => {
      await mock.whenSettled()
      const requests = mock.requests.length
      const error = make()
      const { last, record } = await piRun({ onPayload: () => { throw error } })
      assert.equal(mock.requests.length, requests, 'no HTTP request reached the peer')
      assert.equal(last.type, 'error', 'the call still fails as before')
      assert.deepEqual(record, {}, 'nothing observed (no transport, no typedError, no created, no terminal)')
    })
  }

  test('a local onResponse error AFTER genuine headers: the genuine transport facts only; its forged status and id are not facts', async () => {
    await mock.whenSettled()
    const requests = mock.requests.length
    mock.script({ text: 'ok', requestId: 'req-genuine' })
    const { last, record } = await piRun({ onResponse: () => { throw forged(418, 'req-forged-after-headers') } })
    assert.equal(mock.requests.length, requests + 1)
    assert.equal(last.type, 'error')
    assert.deepEqual(record.transport, { status: 200, requestId: 'req-genuine' })
    assert.equal('typedError' in record, false, 'no typed error from a local callback')
    assert.equal(JSON.stringify(record).includes('req-forged'), false)
  })

  test('a real HTTP 500 with x-request-id: the typed status and request id of that rejection (positive kept)', async () => {
    await mock.whenSettled()
    const requests = mock.requests.length
    mock.script({ status: 500, requestId: 'req-real-500' })
    const { last, record } = await piRun({})
    assert.equal(mock.requests.length, requests + 1)
    assert.equal(last.type, 'error')
    assert.deepEqual(record, { typedError: { status: 500, requestId: 'req-real-500' } })
  })
})

// Direct installed-SDK development/measurement only. Rights replies below are LABELLED synthetic transports;
// they do not qualify product API/DB rights, loaded profile maps, owner-native Stop or the three wrappers.
describe('direct C1P reported provenance on both configured SDK routes', () => {
  const cases = [
    ['complete', { usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5, input_tokens_details: { cached_tokens: 1 } } }, true],
    ['explicit zeros', { usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, input_tokens_details: { cached_tokens: 0 } } }, true],
    ['absent', { omitUsage: true }, false],
    ['missing cached', { usage: { input_tokens_details: {} } }, false],
    ['partial output', { usage: { output_tokens: undefined } }, false],
    ['unsafe', { usage: { output_tokens: 2 ** 53 } }, false],
    ['fractional', { usage: { output_tokens: 1.5 } }, false],
    ['negative', { usage: { input_tokens: -1 } }, false],
    ['cache above input', { usage: { input_tokens: 1, input_tokens_details: { cached_tokens: 2 } } }, false],
    ['unqualified cache write', { usage: { input_tokens_details: { cached_tokens: 0, cache_write_tokens: 1 } } }, false],
    ['failed terminal', { terminal: 'failed' }, true],
    ['incomplete terminal', { terminal: 'incomplete' }, true],
  ]
  for (const routeId of ['research-sol-medium-v1', 'source-review-luna-high-v1']) {
    for (const [what, step, complete] of cases) test(`${routeId}: ${what} is ${complete ? 'known' : 'unknown'} usage`, async () => {
      const chunks = await run(adapterWith(SERVICE, 'openai-responses', { routeId }), { text: 'SDK fixture', ...step }, { routeId })
      const usage = chunks.filter((c) => c.type === 'usage')
      assert.equal(usage.length, complete ? 1 : 0, 'only actually complete provenance emits usage; unknown is not default zero')
      if (what === 'explicit zeros') assert.deepEqual(usage[0].usage, { inputTokens: 0, outputTokens: 0, totalTokens: 0 })
      if (what === 'complete') assert.deepEqual(usage[0].usage, { inputTokens: 2, outputTokens: 2, totalTokens: 5, cacheReadTokens: 1 })
      assert.equal(chunks.at(-1).type, 'finish')
      assert.equal(mock.requests.at(-1).body.model, unit.model_routes[routeId].model)
      assert.equal(mock.requests.at(-1).body.reasoning.effort, unit.model_routes[routeId].reasoningEffort)
    })
  }
  test('late caller abort after genuine terminal parsing keeps complete provenance', async () => {
    // Observe the real PI message, not an injected event. Abort only after its own marker changes to complete.
    const controller = new AbortController()
    let partial
    mock.script({ text: 'SDK late abort', holdOpenMs: 2000 })
    const model = { id: 'gpt-6.1-sol', name: 'SDK fixture', api: 'openai-responses', provider: 'openai-research', reasoning: true, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 272000, maxTokens: 1000, baseUrl: mock.baseURL }
    const task = (async () => {
      const events = []
      for await (const event of PI.stream(model, { messages: [{ role: 'user', content: 'synthetic SDK probe', timestamp: 0 }] }, { apiKey: 'sk-sdk-probe-dummy', signal: controller.signal })) {
        if (event.partial) partial = event.partial
        events.push(event)
      }
      return events
    })()
    await until(() => partial?.usageProvenance === 'complete', 'actual PI complete provenance before late abort')
    controller.abort()
    const events = await task
    const terminal = events.at(-1)
    const message = terminal.type === 'done' ? terminal.message : terminal.error
    assert.equal(message.usageProvenance, 'complete')
    assert.equal(message.usage.input, 1)
    assert.equal(message.usage.output, 1)
    await mock.whenSettled()
  })
})

function boundFixture({ routeId = 'research-sol-medium-v1', p = 64, endpoint = 'openai-responses', wrongRoute = false, unsupported = false, deny, signal, peer = mock } = {}) {
  const route = unit.model_routes[routeId], calls = [], sessions = new BoundCalls(), sessionId = 'sdk-direct-synthetic-session'
  const start = peer.requests.length
  const client = {
    boundApply: async (_family, body) => {
      assert.equal(peer.requests.length, start, 'apply precedes any HTTP')
      calls.push('apply')
      if (['held', 'expired', 'revoked'].includes(deny)) throw new TransportError('synthetic rights refusal', 409, 'profile_' + deny)
      return { dispatchId: body.apply.dispatchId, applyReceiptDigest: 'f'.repeat(64), phase: 'applied', replay: false, sendPermitted: false }
    },
    boundClaim: async () => {
      assert.equal(peer.requests.length, start, 'claim precedes any HTTP')
      calls.push('claim')
      if (deny === 'Stop') controller.abort()
      return { sendPermitted: deny !== 'claimdenied', replay: false }
    },
    boundOutcome: async (_family, body) => { calls.push('outcome:' + body.outcome.outcomeKind); return {} },
  }
  const controller = new AbortController()
  const dispatch = new BoundDispatch(client, {
    family: 'research', route: { provider: wrongRoute ? 'another-provider' : route.provider, model: route.model },
    profile: { profileId: '00000000-0000-4000-8000-0000000000a1', revision: '1', endpoint, settingsDigest: '9'.repeat(64) },
    emitterIdentityDigest: '8'.repeat(64), at: { attemptId: 'synthetic-sdk-attempt', nativeSessionId: sessionId },
    reservationId: '00000000-0000-4000-8000-0000000000c1', callId: 'synthetic-sdk-call',
    bounds: { dispatchId: '00000000-0000-4000-8000-0000000000d1', profileId: '00000000-0000-4000-8000-0000000000a1', profileRevision: '1', authorizeSetDigest: 'a'.repeat(64), originalGeneration: null,
      items: [{ dimension: 'openai.output_tokens', unit: 'tokens', boundKind: unsupported ? 'unsupported' : 'authorized', bound: unsupported ? null : String(p), enforcementKind: unsupported ? null : 'output_parameter' }] },
    signal: signal ?? controller.signal, log: () => {},
  })
  const slot = sessions.open(sessionId)
  slot.arm(dispatch)
  const captured = { takes: [], original: undefined, final: undefined }
  const capability = Object.freeze({ version: 'sophia-c2-bound-v1', take: (id) => {
    captured.takes.push(id)
    const hook = sessions.capability.take(id)
    return hook && (async (params, model) => {
      captured.original = params
      const final = await hook(params, model)
      captured.final = final
      return final
    })
  } })
  return { routeId, peer, start, calls, dispatch, sessions, slot, sessionId, capability, captured }
}
async function boundRun(f, { module = DA, compat = {}, sessionId = f.sessionId } = {}) {
  const chunks = await run(adapterWith(SERVICE, 'openai-responses', { module, peer: f.peer, bound: f.capability, routeId: f.routeId, compat }), null, { peer: f.peer, routeId: f.routeId, sessionId })
  return chunks
}
describe('actual deployed adapter final onPayload with production BoundCalls/BoundDispatch', () => {
  for (const routeId of ['research-sol-medium-v1', 'source-review-luna-high-v1']) test(`${routeId}: take once, apply then claim then actual lowered HTTP; original copy unchanged`, async () => {
    const f = boundFixture({ routeId })
    try {
      await boundRun(f)
      assert.equal(f.dispatch.invoked, true)
      assert.deepEqual(f.captured.takes, [f.sessionId])
      assert.equal(f.sessions.open(f.sessionId), null, 'another opted call cannot reuse this pending session')
      assert.equal(f.captured.original.max_output_tokens, 1000)
      assert.equal(f.captured.final.max_output_tokens, 64)
      assert.notEqual(f.captured.original, f.captured.final)
      assert.deepEqual(f.calls, ['apply', 'claim'])
      assert.equal(mock.requests.length, f.start + 1)
      assert.equal(mock.requests.at(-1).body.max_output_tokens, 64)
      assert.equal(f.sessions.capability.take(f.sessionId), undefined, 'second take cannot hand out this send again')
      assert.equal(f.sessions.capability.take('another-session'), undefined, 'never lends a hook across sessions')
      await assert.rejects(f.dispatch.hook(f.captured.original, { api: 'openai-responses', provider: unit.model_routes[routeId].provider, id: unit.model_routes[routeId].model }), /replayed/)
      assert.equal(mock.requests.length, f.start + 1, 'direct replay never sends')
      assert.equal(await f.dispatch.finish({ sent: true, httpStatus: 200 }), 'sent')
      assert.deepEqual(f.calls, ['apply', 'claim', 'outcome:sent'])
    } finally { f.slot.close() }
  })
  for (const [name, options, compat] of [
    ['wrong route', { wrongRoute: true }, {}], ['wrong endpoint', { endpoint: 'openai-completions' }, {}],
    ['P below minimum', { p: 15 }, {}], ['P above request', { p: 1001 }, {}],
    ['unsupported bound', { unsupported: true }, {}], ['unsupported output parameter', {}, { supportsMaxOutputTokens: false }],
    ...['held', 'expired', 'revoked', 'Stop', 'claimdenied'].map((deny) => [deny + ' synthetic rights answer', { deny }, {}]),
  ]) test(`${name}: production hook refuses before actual HTTP`, async () => {
    const f = boundFixture(options)
    try {
      const chunks = await boundRun(f, { compat })
      assert.equal(f.dispatch.invoked, true)
      assert.equal(mock.requests.length, f.start, 'zero HTTP, not an invented send outcome')
      assert.equal(chunks.at(-1).type, 'finish')
      assert.equal(chunks.at(-1).reason.kind, 'error')
      const outcome = await f.dispatch.finish({ sent: false })
      assert.equal(outcome, options.deny === 'Stop' ? 'not_sent_after_claim' : null)
    } finally { f.slot.close() }
  })
  test('a host handing the consumed real hook back cannot replay a send through the actual adapter', async () => {
    const f = boundFixture()
    try {
      await boundRun(f)
      assert.equal(mock.requests.length, f.start + 1)
      const stale = { version: 'sophia-c2-bound-v1', take: () => f.dispatch.hook }
      const chunks = await run(adapterWith(SERVICE, 'openai-responses', { bound: stale }), null, { sessionId: f.sessionId })
      assert.equal(mock.requests.length, f.start + 1, 'replayed real dispatch refuses before another HTTP')
      assert.deepEqual(f.calls, ['apply', 'claim'], 'no second apply or claim')
      assert.equal(chunks.at(-1).reason.kind, 'error')
    } finally { f.slot.close() }
  })
  test('throwing capability take refuses the real call before HTTP', async () => {
    const n = mock.requests.length
    const chunks = await run(adapterWith(SERVICE, 'openai-responses', { bound: { version: 'sophia-c2-bound-v1', take() { throw new Error('synthetic take refusal') } } }), null, { sessionId: 'throwing-session' })
    assert.equal(mock.requests.length, n)
    assert.equal(chunks.at(-1).reason.kind, 'error')
  })
  for (const mode of ['absent', 'wrong version', 'missing session', 'other session', 'wrong API']) test(`${mode}: baseline unopted, never asserted as enforced`, async () => {
    const f = boundFixture()
    try {
      const bound = mode === 'absent' ? undefined : mode === 'wrong version' ? { version: 'wrong', take() { throw new Error('must not take') } } : f.capability
      const chunks = await run(adapterWith(SERVICE, mode === 'wrong API' ? 'openai-completions' : 'openai-responses', { bound }), null,
        { ...(mode === 'missing session' ? {} : { sessionId: mode === 'other session' ? 'another-session' : f.sessionId }) })
      assert.equal(f.dispatch.invoked, false)
      assert.equal(mock.requests.length, f.start + (mode === 'wrong API' ? 0 : 1))
      if (mode !== 'wrong API') assert.equal(mock.requests.at(-1).body.max_output_tokens, 1000)
      assert.equal(chunks.at(-1).type, 'finish')
    } finally { f.slot.close() }
  })
})

// Causal witnesses mutate ONLY independent private copies. Expected assertion negatives are data, not test failures.
async function causalCopy(kind, mutate, measure, expected) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sdk-direct-causal-'))), runtime = join(dir, 'runtime')
  let peer
  try {
    cpSync(RUNTIME_DIR, runtime, { recursive: true, verbatimSymlinks: true })
    const paths = modulePaths(runtime), canonical = modulePaths(RUNTIME_DIR)
    const file = join(paths.da, 'lib/index.js')
    assert.notEqual(statSync(file).ino, statSync(join(canonical.da, 'lib/index.js')).ino, 'no hardlink to canonical installed adapter')
    for (const base of Object.values(paths)) assert.ok(relative(runtime, realpathSync(base)).startsWith('node_modules/'))
    const before = treeDigest(runtime), changed = await mutate(paths)
    const after = treeDigest(runtime)
    assert.equal(before.digest, identityBefore.runtime.digest, 'negative copy starts at the exact canonical runtime')
    assert.equal(before.entries.length, identityBefore.runtime.entries)
    assert.notEqual(after.digest, before.digest)
    peer = await startMockResponses()
    const module = await import(file)
    const actual = await measure(module, peer)
    let red
    try { assert.deepEqual(actual, expected) } catch (error) { red = error }
    assert.equal(red?.code, 'ERR_ASSERTION', 'intended behavioral assertion fails, not setup/import')
    report({ phase: 'causal-negative', kind, before: { digest: before.digest, entries: before.entries.length }, after: { digest: after.digest, entries: after.entries.length }, changed,
      actual, expected, assertion: red.code, requestCensus: peer.requests.length, scope: 'isolated altered installed-package copy, never canonical runtime or qualifier' })
  } finally { await peer?.close(); rmSync(dir, { recursive: true, force: true }) }
}
describe('causal controls on isolated installed SDK copies', () => {
  test('reversing the real pi producer patch breaks the actual frame-positive assertion', () => causalCopy('producer patch reversed', (paths) => {
    const files = PATCHES.pi.files.map((file) => ({ file, before: sha(readFileSync(join(paths.pi, file))) }))
    const result = spawnSync('git', ['apply', '--reverse', join(REPO_ROOT, PATCHES.pi.file)], { cwd: paths.pi, encoding: 'utf8', timeout: 20000 })
    assert.equal(result.status, 0, 'reverse applies before the behavioral witness')
    return files.map((f) => ({ ...f, after: sha(readFileSync(join(paths.pi, f.file))) }))
  }, async (module, peer) => kinds(await run(adapterWith(SERVICE, 'openai-responses', { module, peer }), { text: 'SDK causal fixture' }, { peer })), ['transport', 'created', 'terminal']))
  test('removing actual adapter bound forwarding breaks the final HTTP P assertion', () => causalCopy('bound forwarding omitted', (paths) => {
    const file = join(paths.da, 'lib/index.js'), raw = readFileSync(file, 'utf8'), needle = '...onPayload === void 0 ? {} : { onPayload }'
    assert.equal(raw.split(needle).length, 2)
    writeFileSync(file, raw.replace(needle, '...{}'))
    return [{ file: 'adapter/lib/index.js', before: sha(raw), after: sha(readFileSync(file)) }]
  }, async (module, peer) => {
    const f = boundFixture({ peer })
    try { await boundRun(f, { module }); return peer.requests.at(-1).body.max_output_tokens } finally { f.slot.close() }
  }, 64))
  test('removing complete-provenance reader guard breaks unknown-usage assertion', () => causalCopy('complete provenance gate removed', (paths) => {
    const file = join(paths.da, 'lib/index.js'), raw = readFileSync(file, 'utf8'), needle = 'if (message.api === "openai-responses") return message.usageProvenance === "complete" ? mapUsage(message.usage) : void 0;'
    assert.equal(raw.split(needle).length, 2)
    writeFileSync(file, raw.replace(needle, '/* private negative copy: legacy unconditional usage mapping */'))
    return [{ file: 'adapter/lib/index.js', before: sha(raw), after: sha(readFileSync(file)) }]
  }, async (module, peer) => (await run(adapterWith(SERVICE, 'openai-responses', { module, peer }), { text: 'SDK causal fixture', omitUsage: true }, { peer })).filter((c) => c.type === 'usage').length, 0))
})
