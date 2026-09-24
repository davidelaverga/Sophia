// Entry point: `node src/server.ts` (Node 24 strips types; no build step).
import { checkRoleSafety, createPool } from '@sophia/persistence'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

// Trimmed: a trailing CR from a CRLF env file would silently break the exact issuer check.
const optional = (name: string): string | undefined => process.env[name]?.trim() || undefined
function required(name: string): string {
  const v = optional(name)
  if (!v) throw new Error(`${name} is required (see .env.example)`)
  return v
}

const pool = createPool(required('SOPHIA_API_DATABASE_URL'))
await checkRoleSafety(pool) // refuse to start as an owner, superuser or BYPASSRLS login

const app = buildApp({
  pool,
  logger: true,
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
