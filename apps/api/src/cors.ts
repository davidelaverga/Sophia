// CORS for a deployed Studio on another origin (Vercel → Render). Only listed origins get the
// headers; everything else is left to the browser to refuse. Preflights are answered here, before
// authentication, because a browser sends them without the Authorization header.
import type { FastifyInstance } from 'fastify'

const ALLOWED_HEADERS = 'authorization, content-type, idempotency-key'
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
      .header('access-control-allow-methods', 'GET, POST, DELETE')
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
