// Entry point: `node src/server.ts` (Node 24 strips types; no build step).
import { checkRoleSafety, createPool } from '@sophia/persistence'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { parseOrigins } from './cors.ts'
import type { InviteConfig } from './invite-token.ts'
import { folderMailer, resendMailer, type Mailer } from './mail.ts'

// Trimmed: a trailing CR from a CRLF env file would silently break the exact issuer check.
const optional = (name: string): string | undefined => process.env[name]?.trim() || undefined
function required(name: string): string {
  const v = optional(name)
  if (!v) throw new Error(`${name} is required (see .env.example)`)
  return v
}

const pool = createPool(required('SOPHIA_API_DATABASE_URL'))
await checkRoleSafety(pool) // refuse to start as an owner, superuser or BYPASSRLS login

/** Invitation links need a secret (≥ 32 characters) and the Studio address people open. */
function inviteConfig(origins: readonly string[]): InviteConfig | undefined {
  const secret = optional('INVITE_TOKEN_SECRET')
  const studioUrl = optional('STUDIO_URL') ?? origins[0]
  if (!secret || !studioUrl) return undefined
  if (secret.length < 32) throw new Error('INVITE_TOKEN_SECRET must be at least 32 characters')
  return { secret, studioUrl }
}

/**
 * Resend in production (RESEND_API_KEY, INVITE_FROM); a folder of files in development (SOPHIA_MAIL_DIR).
 * Email is optional: without a sender the API still starts, and invitations carry their link and QR.
 */
function inviteMailer(): Mailer | null {
  const resendKey = optional('RESEND_API_KEY')
  const from = optional('INVITE_FROM')
  if (resendKey && from) return resendMailer(resendKey, from)
  if (resendKey) console.warn('RESEND_API_KEY is set without INVITE_FROM: invitation emails are off')
  const dir = optional('SOPHIA_MAIL_DIR')
  return dir ? folderMailer(dir) : null
}

const corsOrigins = parseOrigins(optional('STUDIO_ORIGINS'))
const invites = inviteConfig(corsOrigins)
const livekitUrl = optional('LIVEKIT_URL')
const app = buildApp({
  pool,
  logger: true,
  corsOrigins,
  ...(invites ? { invites } : {}),
  mailer: inviteMailer(),
  ...(livekitUrl
    ? { livekit: { url: livekitUrl, apiKey: required('LIVEKIT_API_KEY'), apiSecret: required('LIVEKIT_API_SECRET') } }
    : {}),
  verifyActor: createActorVerifier({
    issuer: required('SUPABASE_JWT_ISSUER'),
    audience: optional('SUPABASE_JWT_AUDIENCE') ?? 'authenticated',
    jwksUrl: optional('SUPABASE_JWKS_URL'),
    secret: optional('SUPABASE_JWT_SECRET'),
  }),
})

const shutdown = async () => {
  await app.close()
  await pool.end()
  process.exit(0)
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown())

await app.listen({ host: optional('HOST') ?? '127.0.0.1', port: Number(optional('PORT') ?? 8787) })
