/**
 * Whether a URL may be handed to the extractor (SMC-M03 S3, plan §2.6, T07). Read targets are provenance-bound in S4
 * (a tool names a search result, an extracted link or an admitted input, never a free URL, and cross-project refs
 * never resolve); this module is the check every such URL still passes before any read:
 * - parsed by the WHATWG parser (so `http://0x7f.1/` is seen as 127.0.0.1, and an IPv6 zone id is refused);
 * - http or https on its default port, no credentials, no credential or signature query parameters;
 * - not a special-use or single-label name, a wildcard or rebinding DNS service, or a fetcher, proxy or shortener
 *   (the extractor itself included), any of which could reach a host this check never saw;
 * - every A and AAAA address public, with IPv4 embedded in IPv6 (mapped, NAT64, 6to4) checked as IPv4.
 *
 * It resolves names but never fetches: nothing is pre-fetched from Sophia's infrastructure. The extractor resolves
 * the host again, so a rebinding name can still differ at read time; every read records that limitation.
 * @module @sophia/dsh-bundle/source-eligibility
 */

import { isIP } from 'node:net'

export type IneligibleReason =
  | 'not_a_url'
  | 'too_long'
  | 'scheme'
  | 'credentials'
  | 'port'
  | 'signed_url'
  | 'special_name'
  | 'wildcard_dns'
  | 'fetcher_host'
  | 'private_address'
  | 'unresolved'

export type Eligibility =
  | { readonly ok: true; readonly url: string; readonly host: string; readonly addresses: readonly string[] }
  | { readonly ok: false; readonly reason: IneligibleReason }

/** Resolves a name to its A and AAAA addresses; an empty list or a throw means unresolved. */
export type Resolver = (host: string) => Promise<readonly string[]>

const URL_LIMIT = 2048
const SPECIAL_SUFFIXES = ['localhost', 'local', 'internal', 'home.arpa', 'onion', 'test', 'invalid', 'example']
/** Wildcard DNS services that map a name to any address, and DNS-rebinding services. */
const WILDCARD_DNS = ['nip.io', 'sslip.io', 'xip.io', 'traefik.me', 'localtest.me', 'lvh.me', 'vcap.me', 'lacolhost.com', 'localho.st', 'fuf.me', '1u.ms', 'rbndr.us']
/** Fetchers, proxies, caches and shorteners: each can reach a URL this check never saw. */
const FETCHER_HOSTS = [
  'r.jina.ai', 's.jina.ai', 'webcache.googleusercontent.com', 'translate.goog', 'translate.google.com',
  'translate.googleusercontent.com', '12ft.io', 'archive.ph', 'archive.today', 'archive.is', 'archive.li',
  'bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'v.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly',
  'shorturl.at', 'tiny.cc', 'rb.gy', 'lnkd.in', 'dlvr.it', 't.ly', 's.id', 'bl.ink',
]
const CREDENTIAL_PARAMS = new Set(['access_token', 'api_key', 'apikey', 'password', 'passwd', 'secret', 'client_secret', 'private_token'])
const SIGNATURE_PARAMS = new Set([
  'x-amz-signature', 'x-amz-credential', 'x-amz-security-token', 'x-goog-signature', 'x-goog-credential',
  'googleaccessid', 'signature', 'key-pair-id', 'x-oss-signature', 'ossaccesskeyid',
])

const underSuffix = (host: string, suffix: string) => host === suffix || host.endsWith(`.${suffix}`)

// --- addresses -----------------------------------------------------------------------------------------------

const v4 = (a: number, b: number, c: number, d: number) => ((a << 24) >>> 0) + (b << 16) + (c << 8) + d
const V4_DENY: ReadonlyArray<[number, number]> = [
  [v4(0, 0, 0, 0), 8], [v4(10, 0, 0, 0), 8], [v4(100, 64, 0, 0), 10], [v4(127, 0, 0, 0), 8],
  [v4(169, 254, 0, 0), 16], [v4(172, 16, 0, 0), 12], [v4(192, 0, 0, 0), 24], [v4(192, 0, 2, 0), 24],
  [v4(192, 88, 99, 0), 24], [v4(192, 168, 0, 0), 16], [v4(198, 18, 0, 0), 15], [v4(198, 51, 100, 0), 24],
  [v4(203, 0, 113, 0), 24], [v4(224, 0, 0, 0), 4], [v4(240, 0, 0, 0), 4],
]

function parseV4(address: string): number | null {
  const parts = address.split('.')
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null
  const [a, b, c, d] = parts.map(Number) as [number, number, number, number]
  return v4(a, b, c, d)
}

function publicV4(value: number): boolean {
  return !V4_DENY.some(([base, bits]) => (bits === 0 ? true : value >>> (32 - bits) === base >>> (32 - bits)))
}

/** An IPv6 address as a 128-bit integer, accepting an embedded dotted IPv4 tail; null if malformed. */
function parseV6(address: string): bigint | null {
  if (address.includes('%')) return null
  let text = address
  const tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (tail) {
    const embedded = parseV4(tail[2] ?? '')
    if (embedded === null) return null
    text = `${tail[1]}${(embedded >>> 16).toString(16)}:${(embedded & 0xffff).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : []
  const missing = 8 - head.length - rest.length
  if ((halves.length === 2 && missing < 1) || (halves.length === 1 && head.length !== 8)) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest]
  let value = 0n
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null
    value = (value << 16n) | BigInt(Number.parseInt(group, 16))
  }
  return value
}

const prefix = (value: bigint, base: bigint, bits: number) => value >> BigInt(128 - bits) === base >> BigInt(128 - bits)
const low32 = (value: bigint) => Number(value & 0xffffffffn)

function publicV6(value: bigint): boolean {
  if (value === 0n || value === 1n) return false // unspecified, loopback
  if (prefix(value, 0xffffn << 32n, 96)) return publicV4(low32(value)) // IPv4-mapped
  if (prefix(value, 0n, 96)) return false // IPv4-compatible (deprecated)
  if (prefix(value, 0x64ff9bn << 96n, 96)) return publicV4(low32(value)) // NAT64 well-known prefix
  if (prefix(value, 0x64ff9b0001n << 80n, 48)) return false // local-use NAT64
  if (prefix(value, 0x2002n << 112n, 16)) return publicV4(Number((value >> 80n) & 0xffffffffn)) // 6to4
  const denied: ReadonlyArray<[bigint, number]> = [
    [0x0100n << 112n, 64], // discard-only
    [0x20010000n << 96n, 32], // Teredo
    [0x20010db8n << 96n, 32], // documentation
    [0x20010010n << 96n, 28], // ORCHID
    [0x20010020n << 96n, 28], // ORCHIDv2
    [0xfc00n << 112n, 7], // unique local
    [0xfe80n << 112n, 10], // link-local
    [0xfec0n << 112n, 10], // site-local (deprecated)
    [0xff00n << 112n, 8], // multicast
  ]
  return !denied.some(([base, bits]) => prefix(value, base, bits))
}

/** Whether an address literal is a public unicast address. Anything unparsable is not. */
export function isPublicAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '')
  const family = isIP(bare)
  if (family === 4) {
    const value = parseV4(bare)
    return value !== null && publicV4(value)
  }
  if (family === 6) {
    const value = parseV6(bare)
    return value !== null && publicV6(value)
  }
  return false
}

// --- names and URLs ------------------------------------------------------------------------------------------

/** The URL-level checks, before any resolution: null when the URL may be resolved. */
export function urlProblem(raw: string): { reason: IneligibleReason } | { url: URL; host: string } {
  if (raw.length > URL_LIMIT) return { reason: 'too_long' }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { reason: 'not_a_url' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { reason: 'scheme' }
  if (url.username !== '' || url.password !== '') return { reason: 'credentials' }
  if (url.port !== '') return { reason: 'port' }
  const names = [...url.searchParams.keys()].map((k) => k.toLowerCase())
  if (names.some((k) => CREDENTIAL_PARAMS.has(k))) return { reason: 'credentials' }
  if (names.some((k) => SIGNATURE_PARAMS.has(k)) || (names.includes('sig') && (names.includes('sv') || names.includes('se')))) {
    return { reason: 'signed_url' }
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (host.startsWith('[') || isIP(host) !== 0) return { url, host }
  if (!host.includes('.') || SPECIAL_SUFFIXES.some((s) => underSuffix(host, s))) return { reason: 'special_name' }
  if (WILDCARD_DNS.some((s) => underSuffix(host, s))) return { reason: 'wildcard_dns' }
  if (FETCHER_HOSTS.some((s) => underSuffix(host, s))) return { reason: 'fetcher_host' }
  if (host === 'web.archive.org' && url.pathname.startsWith('/save')) return { reason: 'fetcher_host' }
  return { url, host }
}

/**
 * Check one read target. An address literal is judged as is; a name is resolved, and every address must be public
 * (one private address among public ones is enough to refuse).
 */
export async function checkReadTarget(raw: string, resolve: Resolver): Promise<Eligibility> {
  const parsed = urlProblem(raw)
  if ('reason' in parsed) return { ok: false, reason: parsed.reason }
  const { url, host } = parsed
  const literal = host.replace(/^\[|\]$/g, '')
  if (isIP(literal) !== 0) {
    return isPublicAddress(literal) ? { ok: true, url: url.href, host, addresses: [literal] } : { ok: false, reason: 'private_address' }
  }
  let addresses: readonly string[]
  try {
    addresses = await resolve(host)
  } catch {
    return { ok: false, reason: 'unresolved' }
  }
  if (addresses.length === 0) return { ok: false, reason: 'unresolved' }
  if (!addresses.every(isPublicAddress)) return { ok: false, reason: 'private_address' }
  return { ok: true, url: url.href, host, addresses }
}
