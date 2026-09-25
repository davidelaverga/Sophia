// Invitation links (S1-04A). A link's token is HMAC-SHA256(secret, "<invitation id>.<version>") in base64url:
// the API can show a link again without storing it, and reissuing (the next version) retires the old one.
// The database keeps only SHA-256(token), so a database read alone never yields a working link.
import { createHash, createHmac } from 'node:crypto'

export interface InviteConfig {
  /** At least 32 random bytes, from the environment; never in the repository. */
  secret: string
  /** The Studio origin people open (https://…). A link is `<studioUrl>/join#<token>`. */
  studioUrl: string
}

export const deriveToken = (secret: string, invitationId: string, version: number): string =>
  createHmac('sha256', secret).update(`${invitationId}.${version}`).digest('base64url')

export const tokenHash = (token: string): Buffer => createHash('sha256').update(token).digest()

/** The token rides in the URL fragment: browsers never send a fragment to a server, so no log or referrer holds it. */
export const joinUrl = (cfg: InviteConfig, token: string): string =>
  `${cfg.studioUrl.replace(/\/+$/, '')}/join#${token}`

/** The link and its hash for one version of an invitation. */
export function linkFor(cfg: InviteConfig, invitationId: string, version: number): { url: string; hash: Buffer } {
  const token = deriveToken(cfg.secret, invitationId, version)
  return { url: joinUrl(cfg, token), hash: tokenHash(token) }
}
