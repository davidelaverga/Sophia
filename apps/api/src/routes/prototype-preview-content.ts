import {
  hasOnlyLocalPrototypeResources,
  isPrototypeSha256,
  prototypeEntrySha256,
  PROTOTYPE_ENTRY_MAX_BYTES,
} from '@sophia/design'
import { previewContentPolicy, previewDocument, previewShell } from './prototype-preview-presentation.ts'

export const PREVIEW_PERMIT_MAX_AGE_MS = 10 * 60 * 1000
const PREVIEW_ENTRY_DIGEST = 'X-Sophia-Preview-Entry-SHA256'
const PREVIEW_PATH = /^\/v1\/previews\/([a-zA-Z0-9_-]{32,128})\/(index|shell|document)\.html$/u

/** Check the raw request target before a WHATWG URL can normalize path segments. */
export function isPrototypePreviewPath(path: string | undefined): path is string {
  return path !== undefined && PREVIEW_PATH.test(path)
}

const PREVIEW_REQUEST_HEADERS = ['origin', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site'] as const

export function previewRequestHeaders(incoming: Record<string, string | string[] | undefined>): Headers {
  const headers = new Headers()
  for (const name of PREVIEW_REQUEST_HEADERS) {
    const value = incoming[name]
    if (typeof value === 'string') headers.set(name, value)
  }
  return headers
}

/** Recognize the two browser hops without trusting client-supplied headers as authorization. */
export function isPreviewFrameRequest(headers: Headers, inner: boolean): boolean {
  if (headers.get('sec-fetch-dest') !== 'iframe' || headers.get('sec-fetch-mode') !== 'navigate') return false
  const site = headers.get('sec-fetch-site')
  return inner ? site === 'same-origin' : site === 'same-site' || site === 'cross-site'
}

export interface RetainedPreviewEntry {
  readonly expiresAt: string
  readonly entrySha256: string
  readonly byteLength: number
  readonly bytes: Uint8Array
}

interface PreviewHost {
  previewOrigin: string
  studioOrigin: string
  /** The resolver rechecks the permit's exact version, manifest, actor, project, membership and source eligibility. */
  readPermit: (permit: string) => Promise<RetainedPreviewEntry | null>
  /** Records a guarded document GET under current exact scope after verifying bytes and policy. */
  recordServed: (permit: string) => Promise<boolean>
  now?: () => number
}

function origin(value: string): URL {
  const parsed = new URL(value)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (value !== parsed.origin || (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))) {
    throw new TypeError('A canonical HTTPS origin is required')
  }
  return parsed
}

function hasValidPermitEntry(entry: RetainedPreviewEntry, now: number): boolean {
  const remaining = Date.parse(entry.expiresAt) - now
  return (
    Number.isFinite(remaining) &&
    remaining > 0 &&
    remaining <= PREVIEW_PERMIT_MAX_AGE_MS &&
    isPrototypeSha256(entry.entrySha256) &&
    entry.byteLength > 0 &&
    entry.byteLength <= PROTOTYPE_ENTRY_MAX_BYTES &&
    entry.byteLength === entry.bytes.byteLength
  )
}

function contentPermit(request: Request, preview: URL, studio: URL) {
  const url = new URL(request.url)
  if (url.origin !== preview.origin || request.url !== `${preview.origin}${url.pathname}`) return null
  const [, permit, presentation] = PREVIEW_PATH.exec(url.pathname) ?? []
  if (!permit || !presentation) return null
  if (request.method === 'GET') {
    if (presentation !== 'index' && !isPreviewFrameRequest(request.headers, presentation === 'document')) return null
    return { permit, presentation, checkOnly: false }
  }
  if (presentation === 'index' && request.method === 'HEAD' && request.headers.get('origin') === studio.origin) {
    return { permit, presentation, checkOnly: true }
  }
  return null
}

async function checkedContent(config: PreviewHost, permit: string, now: () => number) {
  const entry = await config.readPermit(permit)
  if (!entry || !hasValidPermitEntry(entry, now())) return null
  // Copy before hashing and sending, so a shared buffer cannot change after it was checked.
  const bytes = Uint8Array.from(entry.bytes)
  if (prototypeEntrySha256(bytes) !== entry.entrySha256 || !hasOnlyLocalPrototypeResources(bytes)) return null
  return { bytes, digest: entry.entrySha256 }
}

async function render(
  config: PreviewHost,
  headers: Record<string, string>,
  { permit, presentation }: { permit: string; presentation: string },
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Response | null> {
  const { previewOrigin: preview, studioOrigin: studio } = config
  const documentUrl = `${preview}/v1/previews/${permit}/document.html`
  if (presentation === 'shell') {
    return new Response(previewShell(documentUrl, studio), {
      headers: {
        ...headers,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': previewContentPolicy(studio, documentUrl, false),
      },
    })
  }
  if (presentation === 'document') {
    const document = previewDocument(new TextDecoder().decode(bytes), preview)
    if (!(await config.recordServed(permit))) return null
    return new Response(document, {
      headers: {
        ...headers,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': previewContentPolicy(`${studio} ${preview}`),
      },
    })
  }
  return new Response(bytes, {
    headers: {
      ...headers,
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="index.html"',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'; sandbox",
      'content-length': String(bytes.byteLength),
    },
  })
}

/** Run only behind the distinct preview virtual host. No permit is logged or returned by this handler. */
export function createPrototypePreviewContentHandler(config: PreviewHost): (request: Request) => Promise<Response> {
  const preview = origin(config.previewOrigin)
  const studio = origin(config.studioOrigin)
  if (preview.origin === studio.origin || (preview.protocol === 'https:' && preview.hostname === studio.hostname)) {
    throw new TypeError('Preview and Studio must use separate hosts')
  }
  const headers = {
    'cache-control': 'no-store, private',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'permissions-policy': 'camera=(), microphone=(), display-capture=(), geolocation=(), fullscreen=()',
    'content-security-policy': previewContentPolicy(studio.origin),
  }
  const unavailable = () => new Response('Preview unavailable', { status: 404, headers })
  const now = config.now ?? Date.now

  return async (request) => {
    const binding = contentPermit(request, preview, studio)
    if (!binding) return unavailable()
    try {
      const content = await checkedContent(config, binding.permit, now)
      if (!content) return unavailable()
      if (binding.checkOnly) {
        return new Response(null, {
          headers: {
            ...headers,
            vary: 'Origin',
            'access-control-allow-origin': studio.origin,
            'access-control-expose-headers': PREVIEW_ENTRY_DIGEST,
            [PREVIEW_ENTRY_DIGEST]: content.digest,
          },
        })
      }
      return (await render(config, headers, binding, content.bytes)) ?? unavailable()
    } catch {
      return unavailable()
    }
  }
}
