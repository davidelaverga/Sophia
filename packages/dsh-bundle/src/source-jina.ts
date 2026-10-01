/**
 * Jina Reader for research specialists (SMC-M03 S3, plan §2.6): a Sophia `SourceReadResult` adapter, not a dsh
 * `WebFetchProvider`. A hosted extractor cannot report what a direct fetch would, so this adapter claims only what
 * it knows:
 * - `providerHttpStatus` is Jina's own status. The origin's status reaches Jina's answer only as a warning string,
 *   and only for an origin error (an origin 404 can come back as JSON `code: 200`, jina-ai/reader#1103), so
 *   `originHttpStatus` is null unless that warning names one.
 * - `data.url` is the requested URL, so the final URL after redirects is unknown (`reportedFinalUrl: null`).
 * - Every read records that redirects are unverifiable and that the extractor resolves the host itself.
 *
 * It refuses without network I/O when the key is missing, and always sends `Authorization`. It sends a fixed set of
 * headers and never `X-Max-Tokens` (it trims silently), `X-Set-Cookie` or `X-Proxy-Url`. The provider's deadline is
 * shorter than the local one. Errors come from the status, never from body text.
 *
 * PDF and other binary sources are unsupported in the pilot (T14): a URL that names one is answered `unsupported`
 * with no read, and a read that turns out to be a PDF is `partial`, with the limitation stated.
 * @module @sophia/dsh-bundle/source-jina
 */

import { SourceError, codeForStatus, isRecord, jsonBody, requestWithDeadline } from './source-errors.js'

export const JINA_ENDPOINT = 'https://r.jina.ai/'
/** The local deadline for one read, and the provider's own (always shorter, so it answers before the local abort). */
export const JINA_LOCAL_TIMEOUT_MS = 30_000
export const JINA_PROVIDER_TIMEOUT_SECONDS = 25
/** The most characters kept from one read; anything beyond is declared, never silently dropped. */
export const READ_CHAR_LIMIT = 200_000

/** Exactly the headers a read sends, besides `Authorization` and `Content-Type`. */
export const JINA_HEADERS: Readonly<Record<string, string>> = {
  accept: 'application/json',
  'x-respond-with': 'markdown',
  'x-no-cache': 'true',
  dnt: '1',
  'x-timeout': String(JINA_PROVIDER_TIMEOUT_SECONDS),
}

export const LIMITATION_REDIRECTS = 'redirects: unverifiable (hosted extractor reports the requested URL only)'
export const LIMITATION_REBINDING = 'dns: the extractor resolves the host itself; Sophia checked it only before the read'

export type Coverage = 'complete' | 'partial' | 'unsupported'
export type BinaryKind = 'pdf' | 'office' | 'archive' | 'image' | 'media' | 'executable'

export interface SourceReadResult {
  readonly provider: 'jina'
  readonly requestedUrl: string
  /** Jina's own HTTP status. */
  readonly providerHttpStatus: number | null
  /** The origin's status, only when the extractor's warning names an error status; otherwise unknown. */
  readonly originHttpStatus: number | null
  /** Always unknown through this extractor. */
  readonly reportedFinalUrl: null
  readonly title: string | null
  readonly publishedAt: string | null
  readonly content: string
  readonly coverage: Coverage
  readonly truncated: boolean
  readonly tokens: number | null
  readonly binaryKind: BinaryKind | null
  readonly limitations: readonly string[]
}

export interface JinaOptions {
  readonly apiKey: () => string | undefined
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
  readonly endpoint?: string
}

export interface JinaReader {
  readonly id: 'jina'
  available(): boolean
  read(url: string, signal?: AbortSignal): Promise<SourceReadResult>
}

const EXTENSIONS: ReadonlyArray<[BinaryKind, RegExp]> = [
  ['pdf', /\.pdf$/i],
  ['office', /\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf|key|numbers|pages)$/i],
  ['archive', /\.(zip|gz|tgz|bz2|xz|7z|rar|tar|dmg|iso)$/i],
  ['image', /\.(png|jpe?g|gif|webp|bmp|tiff?|svg|heic|avif|ico)$/i],
  ['media', /\.(mp3|mp4|m4a|wav|ogg|webm|mov|avi|mkv|flac)$/i],
  ['executable', /\.(exe|msi|apk|bin|so|dll|deb|rpm)$/i],
]

/** The binary kind a URL's path names, or null. */
export function binaryKindOf(url: string): BinaryKind | null {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    return null
  }
  for (const [kind, pattern] of EXTENSIONS) if (pattern.test(path)) return kind
  return null
}

/** The origin status in the extractor's warning ("Target URL returned error 404: …"), or null. */
export function originStatusOf(warning: string | null): number | null {
  const match = warning ? /Target URL returned error (\d{3})\b/.exec(warning) : null
  const status = match ? Number(match[1]) : null
  return status !== null && (status < 200 || status >= 400) ? status : null
}

const BLOCKED_PAGE = /captcha|are you a robot|access denied|verify you are human|enable javascript/i

export function createJinaReader(options: JinaOptions): JinaReader {
  const doFetch = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? JINA_LOCAL_TIMEOUT_MS
  const endpoint = options.endpoint ?? JINA_ENDPOINT
  const key = (): string | null => {
    const value = options.apiKey()
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
  }

  async function read(url: string, signal?: AbortSignal): Promise<SourceReadResult> {
    const apiKey = key()
    if (apiKey === null) throw new SourceError('missing_key', 'no Jina key is configured; Sophia never reads keyless')
    const binaryKind = binaryKindOf(url)
    if (binaryKind !== null) {
      return {
        provider: 'jina',
        requestedUrl: url,
        providerHttpStatus: null,
        originHttpStatus: null,
        reportedFinalUrl: null,
        title: null,
        publishedAt: null,
        content: '',
        coverage: 'unsupported',
        truncated: false,
        tokens: null,
        binaryKind,
        limitations: [`${binaryKind}: not read in the pilot; the report may cite it only as unread`],
      }
    }
    const response = await requestWithDeadline(
      doFetch,
      endpoint,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...JINA_HEADERS },
        body: JSON.stringify({ url }),
      },
      timeoutMs,
      signal,
    )
    if (!response.ok) {
      await response.body?.cancel()
      throw new SourceError(codeForStatus(response.status), `the extractor refused the read (HTTP ${response.status})`, response.status)
    }
    const body = await jsonBody(response)
    const data = isRecord(body) && isRecord(body.data) ? body.data : null
    if (data === null || typeof data.content !== 'string') {
      throw new SourceError('malformed_response', 'the extractor answered without page content', response.status)
    }
    const warning = typeof data.warning === 'string' && data.warning.length > 0 ? data.warning.slice(0, 500) : null
    const originHttpStatus = originStatusOf(warning)
    const pages = typeof data.numPages === 'number' && Number.isFinite(data.numPages) ? data.numPages : null
    const tokens = isRecord(data.usage) && typeof data.usage.tokens === 'number' ? data.usage.tokens : null
    const content = data.content.slice(0, READ_CHAR_LIMIT)
    const truncated = data.content.length > READ_CHAR_LIMIT
    const limitations = [LIMITATION_REDIRECTS, LIMITATION_REBINDING]
    if (truncated) limitations.push(`truncated: kept the first ${READ_CHAR_LIMIT} characters of ${data.content.length}`)
    if (pages !== null) limitations.push(`pdf: ${pages} page(s) extracted as text; layout, tables and scans are not verified`)
    if (warning !== null) limitations.push(`extractor warning: ${warning}`)
    const empty = content.trim().length === 0
    if (empty) limitations.push('empty: the extractor returned no text')
    const blocked = !empty && content.length < 2000 && BLOCKED_PAGE.test(content)
    if (blocked) limitations.push('blocked: the page looks like a bot check, not the source')
    const partial = truncated || pages !== null || warning !== null || empty || blocked
    return {
      provider: 'jina',
      requestedUrl: url,
      providerHttpStatus: response.status,
      originHttpStatus,
      reportedFinalUrl: null,
      title: typeof data.title === 'string' && data.title.length > 0 ? data.title.slice(0, 300) : null,
      publishedAt: typeof data.publishedTime === 'string' ? data.publishedTime.slice(0, 64) : null,
      content,
      coverage: partial ? 'partial' : 'complete',
      truncated,
      tokens,
      binaryKind: pages === null ? null : 'pdf',
      limitations,
    }
  }

  return { id: 'jina', available: () => key() !== null, read }
}
