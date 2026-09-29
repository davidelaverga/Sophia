import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { buildApp } from './app.ts'
import { parseOrigins } from './cors.ts'

const STUDIO = 'https://sophia-studio.vercel.app'

// No route here reaches the database: every request is refused before or at authentication.
const app = buildApp({
  pool: {} as pg.Pool,
  corsOrigins: [STUDIO],
  verifyActor: () => Promise.reject(new DomainError('actor_context_required', 'Bearer token required')),
})
after(() => app.close())

const preflight = (origin: string) =>
  app.inject({
    method: 'OPTIONS',
    url: '/api/v1/projects',
    headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' },
  })

describe('CORS for a deployed Studio', () => {
  it('answers the preflight of an allowed origin before authentication', async () => {
    const res = await preflight(STUDIO)
    assert.equal(res.statusCode, 204)
    assert.equal(res.headers['access-control-allow-origin'], STUDIO)
    assert.match(String(res.headers['access-control-allow-headers']), /idempotency-key/)
  })

  it('allows every method the Studio sends, including PUT for note capture and consent (A08)', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: `/api/v1/projects/${crypto.randomUUID()}/mission/note-consent`,
      headers: {
        origin: STUDIO,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'authorization, content-type',
      },
    })
    assert.equal(res.statusCode, 204)
    const methods = String(res.headers['access-control-allow-methods']).split(/,\s*/)
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.ok(methods.includes(method), method)
  })

  it('gives any other origin nothing, so the browser refuses the call', async () => {
    const res = await preflight('https://evil.example')
    assert.equal(res.headers['access-control-allow-origin'], undefined)
    assert.notEqual(res.statusCode, 204)
  })

  it('keeps authentication on real requests, with the CORS header so the browser can read the 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${crypto.randomUUID()}/snapshot`,
      headers: { origin: STUDIO },
    })
    assert.equal(res.statusCode, 401)
    assert.equal(res.headers['access-control-allow-origin'], STUDIO)
  })

  it('reads the configured origins exactly', () => {
    assert.deepEqual(parseOrigins(` ${STUDIO}/ , http://localhost:5173,,`), [STUDIO, 'http://localhost:5173'])
    assert.deepEqual(parseOrigins(undefined), [])
  })
})
