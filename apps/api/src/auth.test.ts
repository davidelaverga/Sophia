import { randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createActorVerifier, describeAuthRejection } from './auth.ts'

const SECRET = 'unit-test-secret-at-least-32-characters!!'
const ISSUER = 'https://example.supabase.co/auth/v1'
const token = (claims: { iss?: string; role?: string; sub?: string } = {}) =>
  new SignJWT({ role: claims.role ?? 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub ?? randomUUID())
    .setIssuer(claims.iss ?? ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

describe('actor verification', () => {
  it('accepts a valid token even when the configured issuer carries a CRLF from an env file', async () => {
    // Regression: ~/.sophia env written on Windows left "\r" on the issuer; every real token got 401.
    const verify = createActorVerifier({ issuer: `${ISSUER}\r`, audience: 'authenticated\r\n', secret: SECRET })
    const sub = randomUUID()
    assert.equal(await verify(`Bearer ${await token({ sub })}`), sub)
  })

  it('rejects another issuer and non-user roles', async () => {
    const verify = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
    await assert.rejects(verify(`Bearer ${await token({ iss: 'https://other.supabase.co/auth/v1' })}`), {
      code: 'actor_context_required',
    })
    await assert.rejects(verify(`Bearer ${await token({ role: 'anon' })}`), {
      code: 'actor_context_required',
    })
  })

  it('explains a rejection with non-secret metadata only', async () => {
    const verify = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
    const sub = randomUUID()
    const t = await token({ iss: 'https://other.supabase.co/auth/v1', sub })
    const err = await verify(`Bearer ${t}`).catch((e: unknown) => e)
    const info = describeAuthRejection(`Bearer ${t}`, err)
    assert.partialDeepStrictEqual(info, {
      code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
      claim: 'iss',
      alg: 'HS256',
      iss: 'https://other.supabase.co/auth/v1',
      role: 'authenticated',
      expired: false,
    })
    const logged = JSON.stringify(info)
    assert.ok(!logged.includes(t.split('.')[2]!)) // no signature
    assert.ok(!logged.includes(sub)) // no subject
    assert.partialDeepStrictEqual(describeAuthRejection(undefined, err), { token: 'missing' })
  })
})
