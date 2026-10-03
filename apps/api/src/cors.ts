// CORS for a deployed Studio on another origin (Vercel → Render). Only listed origins get the
// headers; everything else is left to the browser to refuse. Preflights are answered here, before
// authentication, because a browser sends them without the Authorization header.
import type { FastifyInstance } from 'fastify'

/** Every header the Studio sends: the personal space's writes name its epoch (A10). */
const ALLOWED_HEADERS = 'authorization, content-type, idempotency-key, x-sophia-personal-epoch'
/**
 * Every method the Studio sends: PUT sets the mission's note capture and a member's consent (A08), PATCH a report's
 * description (A11).
 */
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE'
const PREFLIGHT_MAX_AGE_SECONDS = 600

export function registerCors(app: FastifyInstance, origins: readonly string[]): void {
  if (origins.length === 0) return
  const allowed = new Set(origins)
  app.addHook('onRequest', (req, reply, done) => {
    const origin = req.headers.origin
    if (!req.url.startsWith('/api/') || !origin || !allowed.has(origin)) return done()
    void reply.header('access-control-allow-origin', origin).header('vary', 'Origin')
    if (req.method !== 'OPTIONS') return done()
    // Answering here ends the request: later hooks (authentication) do not run for a preflight.
    void reply
      .header('access-control-allow-methods', ALLOWED_METHODS)
      .header('access-control-allow-headers', ALLOWED_HEADERS)
      .header('access-control-max-age', String(PREFLIGHT_MAX_AGE_SECONDS))
      .status(204)
      .send()
  })
}

/** "https://a.example, https://b.example" → exact origins; blanks and trailing slashes dropped. */
export const parseOrigins = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
