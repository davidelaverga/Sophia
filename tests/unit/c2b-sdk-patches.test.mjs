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
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { parse } from 'yaml'
import { REPO_ROOT, RUNTIME_DIR } from '../../scripts/lib/common.mjs'
import { CallObservation, payloadOf } from '../../packages/dsh-bundle/dist/c2b-observation.js'
import { startMockResponses } from '../support/mock-responses.mjs'

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
})
after(() => mock?.close())

/** The deployed adapter registered by its own `apply` on a LABELLED minimal host, with `service` provided or not. */
function adapterWith(service, api = 'openai-responses') {
  let adapter
  const services = { credentials: { resolve: async () => ({ value: 'sk-c2b-sdk-test-dummy-0000000000' }), listRecords: async () => [] }, ...(service ? { sophiaC2bObservation: service } : {}) }
  const ctx = {
    inject() {}, fiber: { entry: undefined }, on: () => () => {}, get: (name) => services[name],
    llm: { registerConfigurableProviders: () => ({ replace() {} }), registerModelDiscovery() {}, registerAdapter: (_routes, a) => { adapter = a; return { replace() {} } } },
    logger: { warn() {}, error() {}, info() {} },
  }
  DA.apply(ctx, DA.Config({ providers: { 'openai-research': { apiKeyEnv: 'OPENAI_RESEARCH_API_KEY', api, baseURL: mock.baseURL, defaultMaxTokens: 1000,
    models: [{ id: 'gpt-6.1-sol', name: 'Sol', contextWindow: 272000, maxTokens: 1000, input: ['text'], reasoningEfforts: { medium: 'medium' } }] } } }))
  return adapter
}
const REQUEST = { provider: 'openai-research', model: 'gpt-6.1-sol', messages: [{ role: 'user', content: [{ type: 'text', text: 'question' }] }] }

/** One call's chunks; `stopAt(chunk, i)` true returns from the consumer after that chunk (or throws when 'throw'). */
async function run(adapter, step, { stopAt, signal } = {}) {
  // A request the double never answers from its queue (another API's path) gets no step, so none is left queued.
  if (step !== null) mock.script(step)
  const call = await adapter.prepareCall('openai-research', 'gpt-6.1-sol')
  const chunks = []
  try {
    for await (const chunk of call.stream({ ...REQUEST, ...(signal ? { signal } : {}) })) {
      chunks.push(chunk)
      const stop = stopAt?.(chunk, chunks.length - 1)
      if (stop === 'throw') throw new Error('consumer stops by throwing')
      if (stop) break
    }
  } catch (error) {
    if (error.message !== 'consumer stops by throwing') throw error
  }
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
