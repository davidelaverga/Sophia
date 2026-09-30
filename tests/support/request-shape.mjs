/**
 * SMC-M02 R1: reduce a captured Responses request to its route shape.
 *
 * Kept verbatim: every request field and value the route decides (model,
 * stream, store, reasoning, include, max_output_tokens, tool types, names,
 * `strict`, parameter structure and required lists), the order and kind of
 * every input item, the replayed reasoning and tool-call ids, and the headers
 * the client sets on purpose. Masked: model-facing text, which the dsh
 * release itself authors (the system prompt, tool and parameter
 * descriptions, the runtime-context snapshot with its temporary paths), and
 * host- or process-specific values. Text is compared separately and
 * reported, not pinned, because it changes with every release.
 */

import { createHash } from 'node:crypto'

const TEXT = '<text>'
const sha = (value) => createHash('sha256').update(value).digest('hex')

/** Headers that are the route's choice; the rest describe the host or the transport. */
const HEADERS = ['accept', 'content-type', 'authorization', 'session_id', 'x-client-request-id', 'x-stainless-lang', 'x-stainless-package-version', 'x-stainless-runtime', 'x-stainless-runtime-version', 'x-stainless-retry-count', 'user-agent']

function maskSchema(schema) {
  if (Array.isArray(schema)) return schema.map(maskSchema)
  if (!schema || typeof schema !== 'object') return schema
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, key === 'description' && typeof value === 'string' ? TEXT : maskSchema(value)]))
}

function maskContent(content) {
  if (typeof content === 'string') return TEXT
  if (!Array.isArray(content)) return content
  return content.map((part) => ('text' in part ? { ...part, text: TEXT } : part))
}

function maskItem(item) {
  const out = { ...item }
  if ('content' in out) out.content = maskContent(out.content)
  if (typeof out.output === 'string') out.output = TEXT
  return out
}

/**
 * @param {{ headers: Record<string, string>, body: any }} request - one captured request.
 * @param {{ sessionId: string, dummyKey: string }} expect - values the route must carry.
 * @returns {{ body: any, headers: Record<string, string> }} the route shape.
 */
export function requestShape(request, { sessionId, dummyKey }) {
  const body = { ...request.body }
  body.input = body.input.map(maskItem)
  if (Array.isArray(body.tools)) body.tools = body.tools.map((tool) => ({ ...tool, description: TEXT, parameters: maskSchema(tool.parameters) }))
  if (body.prompt_cache_key === sessionId) body.prompt_cache_key = '<native session id>'
  const headers = {}
  for (const name of HEADERS) {
    let value = request.headers[name]
    if (value === undefined) continue
    if (name === 'authorization' && value === `Bearer ${dummyKey}`) value = 'Bearer <test key>'
    if ((name === 'session_id' || name === 'x-client-request-id') && value === sessionId) value = '<native session id>'
    if (name === 'user-agent') value = value.replace(/^deepseek-harness\/[^ ]+ /, 'deepseek-harness/<dsh version> ')
    headers[name] = value
  }
  return { body, headers }
}

/**
 * Every model-facing text of a request, by path, as a digest and a length,
 * so a release's text changes can be listed without committing the text.
 * @returns {Record<string, { sha256: string, length: number }>}
 */
export function requestTexts(request) {
  const out = {}
  const walk = (value, path) => {
    if (typeof value === 'string') {
      if (/(\.content|\.text|\.description|\.output)$/.test(path)) out[path] = { sha256: sha(value), length: value.length }
      return
    }
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`)
  }
  walk(request.body.input, 'input')
  walk(request.body.tools ?? [], 'tools')
  return out
}
