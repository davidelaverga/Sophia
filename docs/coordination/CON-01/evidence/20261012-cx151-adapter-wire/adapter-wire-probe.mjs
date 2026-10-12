// Independent L0 serialization capture. No credentials, provider, dsh or socket calls.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'

const root = process.argv[2]
assert.ok(root, 'Pass the read-only candidate checkout containing .artifacts/runtime')
const dist = `${root}/.artifacts/runtime/node_modules/.pnpm/@earendil-works+pi-ai@0.87.1_ws@8.21.3_zod@4.6.5/node_modules/@earendil-works/pi-ai/dist`
const sha = (b) => createHash('sha256').update(b).digest('hex')
const files = ['api/openai-codex-responses.js', 'api/openai-responses.js', 'utils/transcript.js']
const hashes = Object.fromEntries(await Promise.all(files.map(async (f) => [f, sha(await readFile(`${dist}/${f}`))])))
let unexpectedFetch = 0
globalThis.fetch = async () => { unexpectedFetch++; throw new Error('Uninjected fetch forbidden') }
const codex = await import(pathToFileURL(`${dist}/api/openai-codex-responses.js`))
const publicResponses = await import(pathToFileURL(`${dist}/api/openai-responses.js`))
const { normalizeContext } = await import(pathToFileURL(`${dist}/utils/transcript.js`))
const context = normalizeContext({
  systemPrompt: 'Synthetic offline CON-01 serialization check only.',
  tools: [],
  messages: [{ role: 'user', content: 'Synthetic question.', timestamp: 1 }],
})
// Structurally decoded by pi only. Intentionally unsigned and unusable; never sent anywhere.
const fakeToken = ['eyJhbGciOiJub25lIn0', Buffer.from(JSON.stringify({
  'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-offline-account' },
})).toString('base64'), 'not-a-signature'].join('.')
const base = {
  id: 'con01-offline-shape-only', name: 'Synthetic offline model, not a selected route',
  reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 2048,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
}
const cases = []
for (const spec of [
  { name: 'codex_16', kind: 'codex', maxTokens: 16 },
  { name: 'codex_512', kind: 'codex', maxTokens: 512 },
  { name: 'public_512', kind: 'public', maxTokens: 512 },
  { name: 'public_compat_off_512', kind: 'public', maxTokens: 512, compat: { supportsMaxOutputTokens: false } },
  { name: 'public_below_minimum_1', kind: 'public', maxTokens: 1 },
]) {
  const isCodex = spec.kind === 'codex'
  const model = { ...base, provider: isCodex ? 'openai-codex' : 'openai',
    api: isCodex ? 'openai-codex-responses' : 'openai-responses',
    baseUrl: isCodex ? 'https://chatgpt.com/backend-api' : 'https://api.openai.com/v1',
    ...(spec.compat ? { compat: spec.compat } : {}),
  }
  let calls = 0
  let capture
  let payload
  const stubFetch = async (url, init) => {
    calls++
    assert.equal(calls, 1, 'Capture must not be retried')
    const headers = new Headers(init.headers)
    let bytes = Buffer.from(init.body)
    const encoding = headers.get('content-encoding')
    if (encoding === 'zstd') bytes = zstdDecompressSync(bytes)
    else assert.ok(encoding === null || encoding === 'identity')
    const body = JSON.parse(bytes.toString('utf8'))
    capture = { url: String(url), method: init.method, encoding, body }
    // Local 400 is a test sentinel, never an observed provider refusal.
    return new Response(JSON.stringify({ error: { message: 'offline-capture-sentinel', type: 'invalid_request_error' } }),
      { status: 400, headers: { 'content-type': 'application/json' } })
  }
  const stream = (isCodex ? codex : publicResponses).stream(model, context, {
    apiKey: isCodex ? fakeToken : 'synthetic-offline-not-a-key',
    env: {}, fetch: stubFetch, transport: 'sse', cacheRetention: 'none',
    maxTokens: spec.maxTokens, maxRetries: 0, timeoutMs: 1000,
    signal: AbortSignal.timeout(3000),
    onPayload: (p) => { payload = JSON.parse(JSON.stringify(p)) },
  })
  const events = []
  for await (const event of stream) events.push(event.type)
  const result = await stream.result()
  assert.equal(result.stopReason, 'error')
  assert.equal(calls, 1)
  assert.deepEqual(capture.body, payload)
  assert.equal(capture.body.store, false)
  assert.equal(capture.body.stream, true)
  assert.ok(Array.isArray(capture.body.input))
  assert.equal(capture.body.tools, undefined)
  const sentCap = capture.body.max_output_tokens ?? null
  const expected = isCodex || spec.compat ? null : Math.max(16, spec.maxTokens)
  assert.equal(sentCap, expected)
  cases.push({ name: spec.name, requestedMaxTokens: spec.maxTokens,
    capturedUrl: capture.url, captures: calls, contentEncoding: capture.encoding,
    sentMaxOutputTokens: sentCap, store: false, stream: true,
    inputItems: capture.body.input.length, toolsAbsent: true,
    payloadMatchesSerializedBody: true, terminal: 'local sentinel error', events,
    bodyKeys: Object.keys(capture.body).sort(),
  })
}
assert.equal(unexpectedFetch, 0)
const receipt = {
  scope: 'L0 actual installed adapter serialized-body capture, not provider or subscription qualification',
  runtime: process.version, platform: process.platform, installedPiAi: '0.87.1',
  sourceHashes: hashes, cases, cleanup: { ownedServer: false, ownedChild: false,
    runtimeStarted: false, credentialsRead: false, providerCalls: 0,
    realNetworkCalls: 0, unexpectedGlobalFetchCalls: unexpectedFetch },
  limits: ['Synthetic model does not select a route.', '400 response is injected locally, not a real provider refusal.',
    'No OAuth/sign-in, credential lifecycle, account topology, quota telemetry or hard execution bound is qualified.',
    'No claim that all possible supported routes or bounds are impossible.'],
}
await writeFile(new URL('./adapter-wire-receipt.safe.json', import.meta.url), JSON.stringify(receipt, null, 2) + '\n')
console.log(JSON.stringify(receipt, null, 2))
