/**
 * The signed envelope Sophia puts on every delivery to the Paperclip plugin (WBC-02 G1). Paperclip sees the
 * integration board principal honestly; the envelope carries what Sophia decided: which project, company and work,
 * who initiated it, for how long, and a digest binding it to the exact body. The worker signs with an Ed25519
 * private key; the plugin verifies with the matching public key and keeps each nonce, so a replay, a forged or
 * expired envelope, another audience, another company or a changed body is refused before any effect.
 *
 * It does not authorize anything by itself: the plugin still checks its own project mapping, and the adapter still
 * asks Sophia for an effect permit before any native work. Nothing here reads a clock or a key store: callers pass
 * both.
 * @module @sophia/coordination/envelope
 */
import { createHash, sign, verify, type KeyObject } from 'node:crypto'
import { canonicalJson } from './canonical.ts'

export const ENVELOPE_AUDIENCE = 'sophia.coordination'
export const ENVELOPE_ISSUER = 'sophia'
/** The longest an envelope may live: a delivery is signed when it is claimed, and sent at once. */
export const ENVELOPE_MAX_SECONDS = 300

export type EnvelopeOp = 'commission' | 'lookup' | 'hold' | 'resume' | 'stop' | 'complete' | 'fail'

/** Who asked for the effect Sophia is delivering: a member, or Sophia itself (the integration, the source guard). */
export interface EnvelopeInitiator {
  readonly kind: 'member' | 'sophia'
  readonly id: string
}

export interface EnvelopeClaims {
  readonly v: 1
  readonly aud: typeof ENVELOPE_AUDIENCE
  readonly iss: typeof ENVELOPE_ISSUER
  readonly op: EnvelopeOp
  readonly companyId: string
  readonly paperclipProjectId: string
  readonly sophiaProjectId: string
  readonly workId: string
  readonly commissionKey: string
  readonly deliveryKey: string
  readonly initiator: EnvelopeInitiator
  readonly nonce: string
  /** Seconds since the epoch. */
  readonly iat: number
  readonly exp: number
  /** sha256 (hex) of the canonical JSON of the body the envelope travels with. */
  readonly digest: string
}

/** What travels: the claims (base64url JSON) and their Ed25519 signature (base64url). */
export interface SignedEnvelope {
  readonly claims: string
  readonly signature: string
}

export type EnvelopeRefusal =
  | 'malformed'
  | 'bad_signature'
  | 'wrong_audience'
  | 'wrong_company'
  | 'wrong_operation'
  | 'expired'
  | 'not_yet_valid'
  | 'digest_mismatch'

export class EnvelopeError extends Error {
  readonly code: EnvelopeRefusal
  constructor(code: EnvelopeRefusal, message: string) {
    super(message)
    this.code = code
  }
}

/** The digest an envelope binds: sha256 of the body's canonical JSON. */
export const bodyDigest = (body: unknown): string => createHash('sha256').update(canonicalJson(body)).digest('hex')

const b64 = (bytes: Buffer): string => bytes.toString('base64url')

/** Sign claims for a body; the digest is computed here, never taken from the caller. */
export function signEnvelope(
  claims: Omit<EnvelopeClaims, 'v' | 'aud' | 'iss' | 'digest'>,
  body: unknown,
  privateKey: KeyObject,
): SignedEnvelope {
  if (claims.exp - claims.iat > ENVELOPE_MAX_SECONDS || claims.exp <= claims.iat) {
    throw new EnvelopeError('expired', `An envelope lives at most ${ENVELOPE_MAX_SECONDS} seconds`)
  }
  const full: EnvelopeClaims = {
    v: 1,
    aud: ENVELOPE_AUDIENCE,
    iss: ENVELOPE_ISSUER,
    ...claims,
    digest: bodyDigest(body),
  }
  const encoded = b64(Buffer.from(canonicalJson(full), 'utf8'))
  return { claims: encoded, signature: b64(sign(null, Buffer.from(encoded, 'utf8'), privateKey)) }
}

const STRING_CLAIMS = [
  'op',
  'companyId',
  'paperclipProjectId',
  'sophiaProjectId',
  'workId',
  'commissionKey',
  'deliveryKey',
  'nonce',
  'digest',
] as const

function parseClaims(encoded: string): EnvelopeClaims {
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    throw new EnvelopeError('malformed', 'The envelope is not JSON')
  }
  const fields: Readonly<Record<string, unknown>> = typeof value === 'object' && value !== null ? { ...value } : {}
  if (fields.aud !== ENVELOPE_AUDIENCE || fields.iss !== ENVELOPE_ISSUER) {
    throw new EnvelopeError('wrong_audience', 'The envelope is for another audience')
  }
  if (!isClaims(value)) throw new EnvelopeError('malformed', 'The envelope lacks a required claim')
  return value
}

function isInitiator(value: unknown): value is EnvelopeInitiator {
  if (typeof value !== 'object' || value === null) return false
  const record: Record<string, unknown> = { ...value }
  return (record.kind === 'member' || record.kind === 'sophia') && typeof record.id === 'string'
}

function isClaims(value: unknown): value is EnvelopeClaims {
  if (typeof value !== 'object' || value === null) return false
  const record: Record<string, unknown> = { ...value }
  return (
    record.v === 1 &&
    record.aud === ENVELOPE_AUDIENCE &&
    record.iss === ENVELOPE_ISSUER &&
    STRING_CLAIMS.every((key) => typeof record[key] === 'string' && record[key] !== '') &&
    Number.isSafeInteger(record.iat) &&
    Number.isSafeInteger(record.exp) &&
    isInitiator(record.initiator)
  )
}

export interface VerifyOptions {
  readonly publicKey: KeyObject
  /** The company the host resolved for the request; the envelope must name the same one. */
  readonly companyId: string
  readonly ops: ReadonlySet<EnvelopeOp>
  /** Seconds since the epoch. */
  readonly now: number
  /** Clock skew allowed on iat and exp, in seconds. */
  readonly skewSeconds?: number
}

/**
 * Verify a signed envelope for a body. Returns its claims, or throws EnvelopeError naming the first refusal. The
 * nonce is the caller's to keep: verification alone never proves a delivery is not a replay.
 */
export function verifyEnvelope(envelope: SignedEnvelope, body: unknown, options: VerifyOptions): EnvelopeClaims {
  const signature = Buffer.from(envelope.signature, 'base64url')
  if (!verify(null, Buffer.from(envelope.claims, 'utf8'), options.publicKey, signature)) {
    throw new EnvelopeError('bad_signature', 'The envelope signature does not verify')
  }
  const claims = parseClaims(envelope.claims)
  const skew = options.skewSeconds ?? 30
  if (claims.companyId !== options.companyId)
    throw new EnvelopeError('wrong_company', 'The envelope names another company')
  if (!options.ops.has(claims.op)) throw new EnvelopeError('wrong_operation', `The envelope is for ${claims.op}`)
  if (claims.iat > options.now + skew) throw new EnvelopeError('not_yet_valid', 'The envelope was issued in the future')
  if (claims.exp < options.now - skew || claims.exp - claims.iat > ENVELOPE_MAX_SECONDS) {
    throw new EnvelopeError('expired', 'The envelope has expired')
  }
  if (claims.digest !== bodyDigest(body))
    throw new EnvelopeError('digest_mismatch', 'The body is not the one the envelope signed')
  return claims
}
