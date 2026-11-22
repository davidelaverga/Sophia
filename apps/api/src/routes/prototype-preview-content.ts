import {
  hasOnlyLocalPrototypeResources,
  isPrototypeSha256,
  prototypeEntrySha256,
  PROTOTYPE_ENTRY_MAX_BYTES,
} from '@sophia/design'

export const PREVIEW_PERMIT_MAX_AGE_MS = 10 * 60 * 1000
const PREVIEW_PATH = /^\/v1\/previews\/([a-zA-Z0-9_-]{32,128})\/index\.html$/u

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

function policy(studio: string): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${studio}`,
    'sandbox allow-scripts',
  ].join('; ')
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
    'content-security-policy': policy(studio.origin),
  }
  const unavailable = () => new Response('Preview unavailable', { status: 404, headers })
  const now = config.now ?? Date.now

  return async (request) => {
    const url = new URL(request.url)
    const permit = PREVIEW_PATH.exec(url.pathname)?.[1]
    if (!permit || url.origin !== preview.origin || url.search || request.method !== 'GET') return unavailable()
    let entry: RetainedPreviewEntry | null
    try {
      entry = await config.readPermit(permit)
    } catch {
      return unavailable()
    }
    if (!entry || !hasValidPermitEntry(entry, now())) return unavailable()

    // Copy before hashing and sending, so a shared buffer cannot change after it was checked.
    const bytes = Uint8Array.from(entry.bytes)
    if (prototypeEntrySha256(bytes) !== entry.entrySha256 || !hasOnlyLocalPrototypeResources(bytes))
      return unavailable()
    return new Response(bytes, {
      headers: {
        ...headers,
        'content-type': 'text/html; charset=utf-8',
        'content-length': String(bytes.byteLength),
      },
    })
  }
}
