/**
 * TEST DOUBLE — a local stand-in for the OpenAI Responses endpoint
 * (`POST /v1/responses`), so the runtime's real openai route (pi-ai's
 * `openai-responses` protocol, the recorded gpt-6-luna entry and effort) can
 * run keylessly against it. It records every request body and header exactly
 * as received and answers each from a scripted queue: a streamed reasoning
 * item, then a text message or one function call. It says
 * nothing about the live provider's behavior; it exists to see what the
 * runtime would send (SMC-M02 R1, the request-shape parity test).
 */

import { createServer } from 'node:http'
import { stringify } from 'yaml'
import { parseCordisYaml } from '../../scripts/lib/patch-lint.mjs'

export async function startMockResponses() {
  const requests = []
  const queue = []
  let active = 0
  let abandoned = 0
  let terminalSent = 0
  // INC04-R07-C2B-PRODUCER-001 R1: completion of every streamed handler, observed deterministically (no sleep).
  let settledWaiters = []
  const finished = () => {
    active -= 1
    if (active === 0) for (const resolve of settledWaiters.splice(0)) resolve()
  }
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    if (req.method !== 'POST' || !req.url.endsWith('/responses')) {
      res.writeHead(404, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: { message: `not served by the test double: ${req.method} ${req.url}` } }))
    }
    const body = JSON.parse(raw)
    requests.push({ method: req.method, url: req.url, headers: { ...req.headers }, body })
    const step = queue.shift() ?? { text: 'ok' }
    const n = requests.length
    // A controlled provider refusal (429, 5xx): a plain JSON error and no stream, as the API answers one.
    // INC04-R07-C2B-PRODUCER-001: `requestId` adds an `x-request-id` response header, on a refusal or on the stream.
    const requestHeader = typeof step.requestId === 'string' ? { 'x-request-id': step.requestId } : {}
    if (step.status) {
      res.writeHead(step.status, { 'content-type': 'application/json', ...(step.status === 429 ? { 'retry-after': '0' } : {}), ...requestHeader })
      return res.end(JSON.stringify({ error: { message: `test double answered ${step.status}`, type: 'test_double', code: null } }))
    }
    // INC04-S03A-R07-C2A: `responseId` replaces the provider response id (any JSON value, e.g. an unsupported one).
    const id = 'responseId' in step ? step.responseId : `resp_mock_${n}`
    active += 1
    let closed = false
    res.on('close', () => {
      closed = true
      if (!res.writableEnded) abandoned += 1
    })
    // Every answer starts with an opaque reasoning item, as a reasoning model's does, so the next request replays it.
    const reasoning = { id: `rs_mock_${n}`, type: 'reasoning', summary: [], encrypted_content: `mock-encrypted-${n}` }
    const args = typeof step.toolCall?.arguments === 'function' ? step.toolCall.arguments(body) : step.toolCall?.arguments
    const answer = step.toolCall
      ? { id: `fc_mock_${n}`, type: 'function_call', status: 'completed', call_id: `call_mock_${n}`, name: step.toolCall.name, arguments: JSON.stringify(args ?? {}) }
      : { id: `msg_mock_${n}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: step.text, annotations: [] }] }
    // INC04-S03A-R07-C1P: `terminal` ('incomplete' or 'failed') ends with that event instead of response.completed, and
    // `omitUsage` sends the terminal response with no `usage` field at all. Without them every answer is as before.
    const reported = { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 }, ...step.usage }
    const response = (status, output) => {
      const answer = { id, object: 'response', created_at: 0, model: body.model, status, output, usage: status === 'in_progress' ? null : reported }
      if (status === 'incomplete') answer.incomplete_details = { reason: step.incompleteReason ?? 'content_filter' }
      if (status === 'failed') answer.error = { code: 'server_error', message: 'the test double failed this response' }
      if (step.omitUsage && status !== 'in_progress') delete answer.usage
      return answer
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', ...requestHeader })
    // INC04-R07-C2B-PRODUCER-001: `cutAfterHeaders` sends the headers, then cuts the connection before response.created (a
    // server transport cut, not a consumer return); `delayBeforeCreatedMs` sends the headers and waits that long first.
    if (step.cutAfterHeaders || step.delayBeforeCreatedMs) res.flushHeaders()
    if (step.cutAfterHeaders) {
      res.destroy()
      finished()
      return
    }
    if (step.delayBeforeCreatedMs) await new Promise((resolve) => setTimeout(resolve, step.delayBeforeCreatedMs))
    let sequence = 0
    // R1: true only when the event was actually written; a stream the client already closed writes nothing.
    const send = (type, payload) => {
      if (closed) return false
      res.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...payload })}\n\n`)
      return true
    }
    send('response.created', { response: response('in_progress', []) })
    send('response.output_item.added', { output_index: 0, item: { ...reasoning } })
    send('response.output_item.done', { output_index: 0, item: reasoning })
    // `cutAfterCreated`: the connection is cut before any terminal event (no response.completed, failed or incomplete).
    if (step.cutAfterCreated) {
      res.destroy()
      finished()
      return
    }
    if (step.delayMs) await new Promise((resolve) => setTimeout(resolve, step.delayMs))
    if (step.toolCall) {
      send('response.output_item.added', { output_index: 1, item: { ...answer, status: 'in_progress', arguments: '' } })
      send('response.function_call_arguments.delta', { output_index: 1, item_id: answer.id, delta: answer.arguments })
      send('response.function_call_arguments.done', { output_index: 1, item_id: answer.id, arguments: answer.arguments })
    } else {
      send('response.output_item.added', { output_index: 1, item: { ...answer, status: 'in_progress', content: [] } })
      send('response.output_text.delta', { output_index: 1, item_id: answer.id, content_index: 0, delta: step.text })
    }
    send('response.output_item.done', { output_index: 1, item: answer })
    // INC04-R07-C2B-PRODUCER-001: `errorEvent` ends the stream with an in-stream `error` event (code and message) and no
    // terminal response event at all.
    if (step.errorEvent) {
      send('error', { code: step.errorEvent.code ?? 'server_error', message: step.errorEvent.message ?? 'the test double sent an error event', param: null })
      if (!closed) res.end()
      finished()
      return
    }
    const terminal = step.terminal ?? 'completed'
    // R1: counted only when actually written (a client that closed during a delay gets no terminal, and none is counted).
    if (send(`response.${terminal}`, { response: response(terminal, [reasoning, answer]) })) terminalSent += 1
    // `holdOpenMs`: the terminal event is sent but the stream stays open that long (a late abort can arrive after it).
    if (step.holdOpenMs) await new Promise((resolve) => setTimeout(resolve, step.holdOpenMs))
    if (!closed) res.end()
    finished()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    requests,
    /**
     * Queue answers; each request consumes one (default: a short "ok"). `{ toolCall: { name, arguments } }` calls a tool;
     * `arguments` may be a function of the request body, for an argument only what the model received can give.
     * `usage` replaces fields of the reported usage. `{ status }` answers that HTTP error (429, 5xx) with no stream.
     * INC04-S03A-R07-C1P: `omitUsage` sends the terminal response without a `usage` field; `terminal: 'incomplete' |
     * 'failed'` ends with that event (with `incompleteReason`, default content_filter); `cutAfterCreated` cuts the
     * connection after response.created; `holdOpenMs` keeps the stream open that long after its terminal event.
     * INC04-R07-C2B-PRODUCER-001: `requestId` sends an `x-request-id` header (stream or refusal); `cutAfterHeaders` cuts
     * the connection right after the headers; `delayBeforeCreatedMs` holds the stream that long after its headers;
     * `errorEvent: { code?, message? }` ends with an in-stream error event instead of a terminal response.
     */
    script: (...steps) => { queue.push(...steps) },
    get active() { return active },
    /** Streamed answers the client closed before they finished (an aborted call). */
    get abandoned() { return abandoned },
    /**
     * Terminal events (response.completed, .incomplete or .failed) the double actually WROTE. A terminal suppressed
     * because the client had already closed its stream is not counted. A write is not proof that a client consumed it.
     */
    get terminalSent() { return terminalSent },
    /**
     * R1: resolves once every streamed answer's handler has finished (every exit path), so a counter is read after the
     * handler's real completion, not after an arbitrary sleep; rejects with a fixed error after `ms`.
     */
    whenSettled: (ms = 30_000) => active === 0 ? Promise.resolve() : new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        settledWaiters = settledWaiters.filter((w) => w !== done)
        reject(new Error('mock-responses: streamed handlers did not finish within the bound'))
      }, ms)
      const done = () => { clearTimeout(timer); resolve() }
      settledWaiters.push(done)
    }),
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve) }),
  }
}

/**
 * A `--patch` overlay (tests only; never installed) that keeps the Sophia
 * bundle's recorded `openai` route byte for byte, adds only a `baseURL` to the
 * stub, and leaves `agent-default-model` untouched, so every Agent still
 * selects openai / gpt-6-luna / high exactly as the unit records it.
 * @param {string} bundlePatchText - the Sophia bundle's cordis.patch.yml.
 * @param {string} baseURL - the stub's base URL.
 */
export function recordedRouteOverlay(bundlePatchText, baseURL) {
  const rows = parseCordisYaml(bundlePatchText)
  const route = rows.find((row) => row.id === 'llm-pi-ai')?.config
  if (!route?.providers?.openai) throw new Error('the bundle patch declares no openai route')
  if ('baseURL' in route.providers.openai) throw new Error('the production openai route must not carry a baseURL')
  const config = { ...route, providers: { ...route.providers, openai: { ...route.providers.openai, baseURL } } }
  return `# Test overlay: the recorded openai route, pointed at a local stub. Never part of a profile.\n${stringify([{ id: 'llm-pi-ai', config }])}`
}

/**
 * A `--patch` overlay (tests only; never installed) that keeps the Sophia bundle's recorded `openai-research` route
 * byte for byte except its `baseURL`, which points at the stub (SMC-M03). The default route is untouched.
 * @param {string} bundlePatchText - the Sophia bundle's cordis.patch.yml.
 * @param {string} baseURL - the stub's base URL.
 */
export function researchRouteOverlay(bundlePatchText, baseURL) {
  return providerOverlay(bundlePatchText, baseURL, 'openai-research')
}

/** The same overlay for the conversation service route's provider alias (CON-01 B2). */
export function conversationRouteOverlay(bundlePatchText, baseURL) {
  return providerOverlay(bundlePatchText, baseURL, 'openai-conversation')
}

/** The same overlay for the source-review route's provider alias (WBC-02). */
export function reviewRouteOverlay(bundlePatchText, baseURL) {
  return providerOverlay(bundlePatchText, baseURL, 'openai-review')
}

/**
 * INC04-S03A-R07-C2A: the same provider overlay as a STRICT JSON patch list (a service composition's overlay shape,
 * executor-identity.ts), so the loaded closure stays verifiable. `api` replaces the provider's API (a drift case).
 * @param {string} bundlePatchText - the Sophia bundle's cordis.patch.yml.
 * @param {string} baseURL - the stub's base URL.
 * @param {string} provider - the provider alias (openai-research, openai-review).
 * @param {{ api?: string }} [options]
 */
export function providerOverlayJson(bundlePatchText, baseURL, provider, { api } = {}) {
  const rows = parseCordisYaml(bundlePatchText)
  const route = rows.find((row) => row.id === 'llm-pi-ai')?.config
  const declared = route?.providers?.[provider]
  if (!declared) throw new Error(`the bundle patch declares no ${provider} route`)
  const config = { ...route, providers: { ...route.providers, [provider]: { ...declared, baseURL, ...(api ? { api } : {}) } } }
  return JSON.stringify([{ id: 'llm-pi-ai', config }])
}

function providerOverlay(bundlePatchText, baseURL, provider) {
  const rows = parseCordisYaml(bundlePatchText)
  const route = rows.find((row) => row.id === 'llm-pi-ai')?.config
  const declared = route?.providers?.[provider]
  if (!declared) throw new Error(`the bundle patch declares no ${provider} route`)
  if (declared.baseURL !== 'https://api.openai.com/v1') throw new Error(`the production ${provider} route must send to https://api.openai.com/v1`)
  const config = { ...route, providers: { ...route.providers, [provider]: { ...declared, baseURL } } }
  return `# Test overlay: the recorded ${provider} route, pointed at a local stub. Never part of a profile.\n${stringify([{ id: 'llm-pi-ai', config }])}`
}
