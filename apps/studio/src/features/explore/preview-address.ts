const permitPath = /^\/v1\/previews\/[A-Za-z0-9_-]+\/index\.html$/u
const lifetime = 10 * 60 * 1000
const loopback = new Set(['127.0.0.1', 'localhost', '[::1]'])

export interface PreviewPermit {
  url: string
  expiresAt: string
  entrySha256: string
  manifestSha256: string
}

interface Boundary {
  contentOrigin: string
  studioOrigin: string
  apiOrigin: string
  now: number
}

function separatedOrigin({ contentOrigin, studioOrigin, apiOrigin }: Boundary): URL | null {
  const content = URL.parse(contentOrigin)
  const studio = URL.parse(studioOrigin)
  const api = URL.parse(apiOrigin)
  if (!content || !studio || !api || content.href !== `${content.origin}/`) return null
  if (content.hostname === studio.hostname || content.hostname === api.hostname) return null
  const local = loopback.has(content.hostname) && loopback.has(studio.hostname)
  return content.protocol === 'https:' || (local && content.protocol === 'http:') ? content : null
}

/** The host never embeds a provider URL or a permit for a different version. */
export function previewAddress(
  permit: PreviewPermit,
  version: Pick<PreviewPermit, 'entrySha256' | 'manifestSha256'>,
  boundary: Boundary,
): URL | null {
  const expires = Date.parse(permit.expiresAt)
  if (!Number.isFinite(expires) || expires <= boundary.now || expires > boundary.now + lifetime) return null
  if (permit.entrySha256 !== version.entrySha256 || permit.manifestSha256 !== version.manifestSha256) return null
  const configured = separatedOrigin(boundary)
  const url = URL.parse(permit.url)
  if (!configured || !url || !permitPath.test(url.pathname)) return null
  return permit.url === `${configured.origin}${url.pathname}` ? url : null
}
