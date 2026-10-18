// Supabase Auth JWT verification (architecture 03/12). The actor is the token's `sub`; it is never
// read from a request body.
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose'
import { DomainError } from '@sophia/domain'

export interface AuthConfig {
  issuer: string
  audience: string
  /** Asymmetric signing keys (Supabase JWT signing keys). */
  jwksUrl?: string | undefined
  /** Legacy shared HS256 secret. Use only when the project has no asymmetric keys. */
  secret?: string | undefined
}

/** The verified token subject, and what the verified token says about them (never the client). */
export interface Actor {
  id: string
  /**
   * The account provider's name for them (Google's full name, GitHub's user name), to seed a display name they haven't
   * chosen (0062). Never an address, so never their email. Shown to others only through their profile.
   */
  name: string | null
  /** The verified email: the contact an invitation is matched by (A16), never shown to others as a name. */
  contact: string | null
  /**
   * A Supabase anonymous sign-in (`is_anonymous`): someone who came in by a guest link without an account.
   * They may only knock, wait and join a room they were admitted to (app.ts GUEST_ROUTES).
   */
  anonymous: boolean
}

export type VerifyActor = (authorization: string | undefined) => Promise<Actor>

type VerifyToken = (token: string) => Promise<JWTPayload>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bearerToken = (authorization: string | undefined) => /^Bearer (.+)$/.exec(authorization ?? '')?.[1]

/** Chosen once: asymmetric JWKS when configured (ES256/RS256), otherwise the legacy HS256 secret. */
function tokenVerifier(cfg: AuthConfig): VerifyToken {
  // Trimmed so a stray CR/space from an env file cannot fail the exact issuer comparison.
  // A token without an expiry or a subject is refused by the verifier itself.
  const claims = { issuer: cfg.issuer.trim(), audience: cfg.audience.trim(), requiredClaims: ['exp', 'sub'] }
  if (cfg.jwksUrl) {
    const jwks = createRemoteJWKSet(new URL(cfg.jwksUrl))
    // Supabase signs user tokens with its ES256 key (local and hosted alike).
    return async (token) => (await jwtVerify(token, jwks, { ...claims, algorithms: ['ES256'] })).payload
  }
  if (cfg.secret) {
    const secret = new TextEncoder().encode(cfg.secret)
    return async (token) => (await jwtVerify(token, secret, { ...claims, algorithms: ['HS256'] })).payload
  }
  throw new Error('Auth needs SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET')
}

export function createActorVerifier(cfg: AuthConfig): VerifyActor {
  const verifyToken = tokenVerifier(cfg)
  return async (authorization) => {
    const token = bearerToken(authorization)
    if (!token) throw new DomainError('actor_context_required', 'Bearer token required')
    try {
      const payload = await verifyToken(token)
      // Supabase anon tokens have role "anon" and no user; only signed-in users act.
      if (payload.role !== 'authenticated' || typeof payload.sub !== 'string' || !UUID.test(payload.sub)) {
        throw new Error('not an authenticated user token')
      }
      const contact = typeof payload.email === 'string' && payload.email ? payload.email : null
      return {
        id: payload.sub.toLowerCase(),
        name: providerName(payload.user_metadata, contact),
        contact,
        anonymous: payload.is_anonymous === true,
      }
    } catch (err: unknown) {
      throw new DomainError('actor_context_required', 'Invalid or expired token', { cause: err })
    }
  }
}

/** The provider metadata keys that carry a person's name, in the Studio's order (apps/studio/src/app/profile.ts). */
const NAME_KEYS = ['full_name', 'name', 'user_name', 'preferred_username'] as const

/** At most what a display name may hold (0062), in code points; a longer provider name seeds nothing, not a cut one. */
const FITS = /^.{1,60}$/su

/**
 * The account provider's name for a person, from the verified token's user_metadata: the first of NAME_KEYS that is a
 * non-blank string, trimmed, at most 60 characters, and not an address. A claim that can't be one is skipped for the
 * next (an address as full_name, a usable user_name after it); none usable, no name. The database checks it again.
 */
export function providerName(metadata: unknown, contact: string | null): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null
  const m = new Map<string, unknown>(Object.entries(metadata))
  for (const key of NAME_KEYS) {
    const value = m.get(key)
    if (typeof value !== 'string') continue
    const name = value.trim()
    if (!name) continue
    if (name.includes('@') || !FITS.test(name) || name.toLowerCase() === contact?.toLowerCase()) continue
    return name
  }
  return null
}

/** The verification failure behind a DomainError (jose error or our own). */
function failureFacts(err: unknown): Record<string, unknown> {
  const cause: unknown = err instanceof Error && err.cause !== undefined ? err.cause : err
  const e = (cause ?? {}) as { code?: string; claim?: string; reason?: string; message?: string }
  return { code: e.code ?? 'invalid', claim: e.claim, reason: e.reason ?? e.message }
}

/** Non-secret token metadata; unverified, for diagnosis only. */
function tokenFacts(token: string): Record<string, unknown> {
  try {
    const header = decodeProtectedHeader(token)
    const payload = decodeJwt(token)
    const expired = typeof payload.exp === 'number' ? payload.exp * 1000 < Date.now() : undefined
    return { alg: header.alg, kid: header.kid, iss: payload.iss, aud: payload.aud, role: payload.role, expired }
  } catch {
    return { token: 'not_a_jwt' }
  }
}

/**
 * Why a token was rejected, for server logs only: the jose error code and the token's
 * alg/kid/iss/aud/role. Never the token, its signature or the subject.
 */
export function describeAuthRejection(authorization: string | undefined, err: unknown): Record<string, unknown> {
  const token = bearerToken(authorization)
  return { ...failureFacts(err), ...(token ? tokenFacts(token) : { token: 'missing' }) }
}
