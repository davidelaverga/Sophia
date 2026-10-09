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
    const id = `resp_mock_${n}`
    active += 1
    let closed = false
    res.on('close', () => { closed = true })
    // Every answer starts with an opaque reasoning item, as a reasoning model's does, so the next request replays it.
    const reasoning = { id: `rs_mock_${n}`, type: 'reasoning', summary: [], encrypted_content: `mock-encrypted-${n}` }
    const args = typeof step.toolCall?.arguments === 'function' ? step.toolCall.arguments(body) : step.toolCall?.arguments
    const answer = step.toolCall
      ? { id: `fc_mock_${n}`, type: 'function_call', status: 'completed', call_id: `call_mock_${n}`, name: step.toolCall.name, arguments: JSON.stringify(args ?? {}) }
      : { id: `msg_mock_${n}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: step.text, annotations: [] }] }
    const response = (status, output) => ({ id, object: 'response', created_at: 0, model: body.model, status, output, usage: status === 'completed' ? { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 }, ...step.usage } : null })
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    let sequence = 0
    const send = (type, payload) => { if (!closed) res.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...payload })}\n\n`) }
    send('response.created', { response: response('in_progress', []) })
    send('response.output_item.added', { output_index: 0, item: { ...reasoning } })
    send('response.output_item.done', { output_index: 0, item: reasoning })
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
    send('response.completed', { response: response('completed', [reasoning, answer]) })
    if (!closed) res.end()
    active -= 1
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    requests,
    /**
     * Queue answers; each request consumes one (default: a short "ok"). `{ toolCall: { name, arguments } }` calls a tool;
     * `arguments` may be a function of the request body, for an argument only what the model received can give.
     * `usage` replaces fields of the reported usage.
     */
    script: (...steps) => { queue.push(...steps) },
    get active() { return active },
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

/** The same overlay for the source-review route's provider alias (WBC-02). */
export function reviewRouteOverlay(bundlePatchText, baseURL) {
  return providerOverlay(bundlePatchText, baseURL, 'openai-review')
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
