// Live Supabase Auth crossing: real GoTrue users and ES256 access tokens, verified by the API
// through the project's JWKS. Runs against the local stack (`pnpm test:supabase`, env from
// scripts/supabase-local.ts) or a hosted project (same variables). Synthetic @sophia.test users
// and the projects they create are deleted afterwards, so a hosted database stays clean.
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT, decodeProtectedHeader, decodeJwt } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createPool } from '@sophia/persistence'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const env = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`${k} missing: run node scripts/supabase-local.ts, then pnpm test:supabase`)
  return v
}
const SUPABASE_URL = env('SUPABASE_URL')
const PUBLISHABLE = env('SUPABASE_PUBLISHABLE_KEY')
const SECRET = env('SUPABASE_TEST_ADMIN_KEY')

let pool: pg.Pool
let app: FastifyInstance
let base: string
const users: Array<{ id: string; email: string; token: string }> = []
const projects: string[] = []

async function authAdmin(
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    ...init,
    headers: { apikey: SECRET, 'content-type': 'application/json', ...init.headers },
  })
  if (!res.ok) throw new Error(`admin ${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}
async function signUpAndIn(label: string) {
  const email = `${label}+${randomUUID().slice(0, 8)}@sophia.test`
  const password = randomUUID()
  const created = (await authAdmin('users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  })) as { id: string }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const session = (await res.json()) as { access_token: string }
  const user = { id: created.id, email, token: session.access_token }
  users.push(user)
  return user
}
async function call(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

before(async () => {
  pool = createPool(env('SOPHIA_API_DATABASE_URL'), 4)
  app = buildApp({
    pool,
    verifyActor: createActorVerifier({
      issuer: env('SUPABASE_JWT_ISSUER'),
      audience: 'authenticated',
      jwksUrl: env('SUPABASE_JWKS_URL'),
    }),
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
})
after(async () => {
  if (projects.length) {
    const owner = new pg.Client({ connectionString: env('SOPHIA_MIGRATION_DATABASE_URL') })
    await owner.connect()
    for (const table of ['project_creations', 'project_members', 'project_revisions', 'projects']) {
      await owner.query(
        `DELETE FROM sophia.${table} WHERE ${table === 'projects' ? 'id' : 'project_id'} = ANY($1::uuid[])`,
        [projects],
      )
    }
    await owner.end()
  }
  for (const u of users) await authAdmin(`users/${u.id}`, { method: 'DELETE' }).catch(() => undefined)
  await app?.close()
  await pool?.end()
})

describe('Supabase Auth (local GoTrue) → Sophia API', () => {
  it('issues ES256 tokens from the JWKS key, with the configured issuer and audience', async () => {
    const luis = await signUpAndIn('luis')
    const header = decodeProtectedHeader(luis.token)
    const claims = decodeJwt(luis.token)
    const jwks = (await (await fetch(env('SUPABASE_JWKS_URL'))).json()) as { keys: Array<{ kid: string }> }
    assert.equal(header.alg, 'ES256')
    assert.ok(jwks.keys.some((k) => k.kid === header.kid))
    assert.deepEqual(
      [claims.iss, claims.aud, claims.role, claims.sub],
      [env('SUPABASE_JWT_ISSUER'), 'authenticated', 'authenticated', luis.id],
    )
  })

  it('lets two real accounts share a project and keeps a third out', async () => {
    const luis = await signUpAndIn('luis')
    const davide = await signUpAndIn('davide')
    const outsider = await signUpAndIn('outsider')

    const created = await call(
      luis.token,
      'POST',
      '/api/v1/projects',
      { title: 'Founders (live auth)' },
      { 'idempotency-key': randomUUID() },
    )
    assert.equal(created.status, 201)
    projects.push(created.json.projectId)
    const path = `/api/v1/projects/${created.json.projectId}/snapshot`
    assert.equal((await call(davide.token, 'GET', path)).status, 403)

    // No invitation handler exists yet (named product work): add the member as the migration owner.
    const owner = new pg.Client({ connectionString: env('SOPHIA_MIGRATION_DATABASE_URL') })
    await owner.connect()
    await owner.query(`INSERT INTO sophia.project_members(project_id, actor_id, role) VALUES ($1, $2, 'editor')`, [
      created.json.projectId,
      davide.id,
    ])
    await owner.end()

    const a = await call(luis.token, 'GET', path)
    const b = await call(davide.token, 'GET', path)
    assert.equal(a.status, 200)
    assert.deepEqual(b.json, a.json)
    assert.equal((await call(outsider.token, 'GET', path)).status, 403)
  })

  it('rejects a tampered token, a legacy HS256 token and the bare publishable key', async () => {
    const luis = await signUpAndIn('luis')
    const created = await call(
      luis.token,
      'POST',
      '/api/v1/projects',
      { title: 'Tamper check' },
      { 'idempotency-key': randomUUID() },
    )
    projects.push(created.json.projectId)
    const path = `/api/v1/projects/${created.json.projectId}/snapshot`

    const [h, p, s] = luis.token.split('.')
    const tampered = `${h}.${p}.${s!.slice(0, -4)}${s!.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`
    // Signed with the public local default HS256 secret, same sub/iss/aud: must not pass a JWKS-only verifier.
    const legacy = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(luis.id)
      .setIssuer(env('SUPABASE_JWT_ISSUER'))
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('super-secret-jwt-token-with-at-least-32-characters-long'))

    assert.equal((await call(luis.token, 'GET', path)).status, 200)
    for (const bad of [tampered, legacy, PUBLISHABLE]) {
      const res = await call(bad, 'GET', path)
      assert.deepEqual([res.status, res.json.code], [401, 'actor_context_required'])
    }
  })
})
