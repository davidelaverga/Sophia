/**
 * TEST DOUBLE — an OpenAI-compatible Chat Completions endpoint for keyless,
 * deterministic runtime tests. It serves the real pi-ai adapter path
 * (`api: openai-completions`) from a scripted reply queue, streams slowly on
 * request so a test can steer, hold or stop mid-work, and records every
 * request body so a test can see what actually reached the model.
 * It says nothing about a live provider's behavior.
 */

import { createServer } from 'node:http'

export async function startMockLlm() {
  const requests = []
  const queue = []
  let active = 0
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    if (req.method === 'GET' && req.url.endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-model', object: 'model' }] }))
    }
    if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
      res.writeHead(404)
      return res.end()
    }
    const body = JSON.parse(raw)
    requests.push(body)
    const step = queue.shift() ?? { text: 'ok' }
    active += 1
    let closed = false
    res.on('close', () => { closed = true })
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    const send = (payload) => { if (!closed) res.write(`data: ${JSON.stringify(payload)}\n\n`) }
    const base = { id: `chatcmpl-${requests.length}`, object: 'chat.completion.chunk', created: 0, model: body.model }
    send({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })
    let finish = 'stop'
    if (step.toolCall) {
      send({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call_${requests.length}`, type: 'function', function: { name: step.toolCall.name, arguments: JSON.stringify(step.toolCall.arguments ?? {}) } }] }, finish_reason: null }] })
      finish = 'tool_calls'
    } else {
      const parts = step.chunks ?? 1
      for (let i = 0; i < parts && !closed; i += 1) {
        if (step.delayMs) await new Promise((resolve) => setTimeout(resolve, step.delayMs))
        send({ ...base, choices: [{ index: 0, delta: { content: parts === 1 ? step.text : `${step.text}[${i}] ` }, finish_reason: null }] })
      }
    }
    send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finish }] })
    if (body.stream_options?.include_usage) send({ ...base, choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
    if (!closed) res.end('data: [DONE]\n\n')
    active -= 1
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    requests,
    /** Queue replies; each request consumes one (default: a short "ok"). */
    script: (...steps) => { queue.push(...steps) },
    /** All user-visible text the model has been sent so far. */
    sentText: () => JSON.stringify(requests.map((r) => r.messages)),
    get active() { return active },
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve) }),
  }
}

/** A `--patch` overlay routing the runtime's default model to the mock (tests only; never installed). */
export function mockRouteOverlay(baseURL) {
  return `# Test overlay: route Agents to the keyless mock model. Never part of a profile.
- id: llm-pi-ai
  config:
    providers:
      mock:
        apiKeyEnv: MOCK_LLM_KEY
        api: openai-completions
        baseURL: ${baseURL}
        models:
          - id: mock-model
            contextWindow: 32768
            maxTokens: 4096
            reasoningEfforts: false
- id: agent-default-model
  config:
    provider: mock
    model: mock-model
`
}
