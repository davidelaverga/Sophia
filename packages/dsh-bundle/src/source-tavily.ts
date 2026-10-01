/**
 * Tavily Search for research specialists (SMC-M03 S3, plan §2.6). It has the shape of dsh's `WebSearchProvider`
 * (`id`, `available()`, `search()`), so S4 registers it on `ctx.web` and pins `searchProvider: tavily`, and it adds
 * `searchWithReceipt()`, which keeps what the native seam drops: the request id, the credits charged and each
 * result's score. Sophia's research facade calls that one.
 *
 * It never goes keyless (both vendor SDKs switch to keyless mode when the key is missing): without a key it is
 * unavailable and refuses before any network I/O. Every request pins the cost-bearing options: no generated answer,
 * no raw content, no images, basic depth, at most five results, and usage reported.
 * @module @sophia/dsh-bundle/source-tavily
 */

import { SourceError, codeForStatus, isRecord, jsonBody, requestWithDeadline } from './source-errors.js'

export const TAVILY_ENDPOINT = 'https://api.tavily.com/search'
/** The most results one search may ask for (plan §2.6). */
export const TAVILY_MAX_RESULTS = 5
const QUERY_LIMIT = 400
const SNIPPET_LIMIT = 1000

export interface TavilyOptions {
  /** Reads the key at call time; the key is never stored or logged. */
  readonly apiKey: () => string | undefined
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
  readonly endpoint?: string
}

/** dsh's search request (`@deepseek-ai/dsh-web`). */
export interface SearchRequest {
  readonly query: string
  readonly maxResults?: number
}

/** One result as Sophia keeps it: the seam's fields plus the provider's score and rank. */
export interface SearchHit {
  readonly rank: number
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  readonly publishedAt?: string
  readonly score: number | null
}

/** What one search cost and returned, as the provider reported it. */
export interface SearchReceipt {
  readonly provider: 'tavily'
  readonly query: string
  readonly requestId: string | null
  readonly credits: number | null
  readonly responseTimeSeconds: number | null
  readonly providerHttpStatus: number
  readonly results: readonly SearchHit[]
}

/** dsh's normalized search result (`WebSearchResult`). */
export interface SeamSearchResult {
  readonly sources: ReadonlyArray<{ url: string; title?: string; snippet?: string; publishedAt?: string }>
  readonly truncated: boolean
}

export interface TavilySearch {
  readonly id: 'tavily'
  available(): boolean
  search(request: SearchRequest, signal?: AbortSignal): Promise<SeamSearchResult>
  searchWithReceipt(request: SearchRequest, signal?: AbortSignal): Promise<SearchReceipt>
}

const isHttpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

const text = (value: unknown, limit: number): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value.slice(0, limit) : undefined

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

function hits(results: unknown): SearchHit[] {
  if (!Array.isArray(results)) throw new SourceError('malformed_response', 'the search answer has no result list', 200)
  const out: SearchHit[] = []
  for (const result of results) {
    // A result without a usable URL cannot be cited or read later; it is dropped, never repaired.
    if (!isRecord(result) || !isHttpUrl(result.url)) continue
    const title = text(result.title, 300)
    const snippet = text(result.content, SNIPPET_LIMIT)
    const publishedAt = text(result.published_date, 64)
    out.push({
      rank: out.length + 1,
      url: result.url,
      ...(title === undefined ? {} : { title }),
      ...(snippet === undefined ? {} : { snippet }),
      ...(publishedAt === undefined ? {} : { publishedAt }),
      score: finite(result.score),
    })
  }
  return out
}

export function createTavilySearch(options: TavilyOptions): TavilySearch {
  const doFetch = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 30_000
  const endpoint = options.endpoint ?? TAVILY_ENDPOINT
  const key = (): string | null => {
    const value = options.apiKey()
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
  }

  async function searchWithReceipt(request: SearchRequest, signal?: AbortSignal): Promise<SearchReceipt> {
    const apiKey = key()
    if (apiKey === null) throw new SourceError('missing_key', 'no Tavily key is configured; Sophia never searches keyless')
    const query = request.query.trim()
    if (query.length === 0 || query.length > QUERY_LIMIT) throw new SourceError('bad_request', `a query is 1 to ${QUERY_LIMIT} characters`)
    const maxResults = Math.max(1, Math.min(TAVILY_MAX_RESULTS, Math.floor(request.maxResults ?? TAVILY_MAX_RESULTS)))
    const response = await requestWithDeadline(
      doFetch,
      endpoint,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          query,
          search_depth: 'basic',
          topic: 'general',
          max_results: maxResults,
          include_answer: false,
          include_raw_content: false,
          include_images: false,
          include_usage: true,
        }),
      },
      timeoutMs,
      signal,
    )
    if (!response.ok) {
      // The status decides; the body is the provider's and is not repeated to the model.
      await response.body?.cancel()
      throw new SourceError(codeForStatus(response.status), `Tavily refused the search (HTTP ${response.status})`, response.status)
    }
    const body = await jsonBody(response)
    if (!isRecord(body)) throw new SourceError('malformed_response', 'the search answer is not an object', response.status)
    const usage = isRecord(body.usage) ? finite(body.usage.credits) : null
    return {
      provider: 'tavily',
      query,
      requestId: text(body.request_id, 200) ?? null,
      credits: usage,
      responseTimeSeconds: finite(body.response_time),
      providerHttpStatus: response.status,
      results: hits(body.results).slice(0, maxResults),
    }
  }

  return {
    id: 'tavily',
    available: () => key() !== null,
    searchWithReceipt,
    async search(request, signal) {
      const receipt = await searchWithReceipt(request, signal)
      return {
        sources: receipt.results.map(({ url, title, snippet, publishedAt }) => ({
          url,
          ...(title === undefined ? {} : { title }),
          ...(snippet === undefined ? {} : { snippet }),
          ...(publishedAt === undefined ? {} : { publishedAt }),
        })),
        truncated: false,
      }
    },
  }
}
