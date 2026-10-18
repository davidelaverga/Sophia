import { randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createActorVerifier, describeAuthRejection, providerName } from './auth.ts'

const SECRET = 'unit-test-secret-at-least-32-characters!!'
const ISSUER = 'https://example.supabase.co/auth/v1'
const token = (
  claims: {
    iss?: string
    role?: string
    sub?: string
    email?: unknown
    is_anonymous?: unknown
    user_metadata?: unknown
  } = {},
) =>
  new SignJWT({
    role: claims.role ?? 'authenticated',
    ...(claims.email === undefined ? {} : { email: claims.email }),
    ...(claims.user_metadata === undefined ? {} : { user_metadata: claims.user_metadata }),
    ...(claims.is_anonymous === undefined ? {} : { is_anonymous: claims.is_anonymous }),
  })
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
    assert.deepEqual(await verify(`Bearer ${await token({ sub })}`), {
      id: sub,
      name: null,
      contact: null,
      anonymous: false,
    })
  })

  it('keeps the verified email as the contact, never as the name (#365 section 6), and only from a string', async () => {
    const verify = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
    const sub = randomUUID()
    assert.deepEqual(await verify(`Bearer ${await token({ sub, email: 'luis@sophia.test' })}`), {
      id: sub,
      name: null,
      contact: 'luis@sophia.test',
      anonymous: false,
    })
    assert.equal((await verify(`Bearer ${await token({ email: { admin: true } })}`)).contact, null)
  })

  it('names the actor from the provider’s name in the verified metadata, never from an address', async () => {
    const verify = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
    const named = async (user_metadata: unknown, email = 'luis@sophia.test') =>
      (await verify(`Bearer ${await token({ email, user_metadata })}`)).name
    assert.equal(await named({ full_name: '  Luis Pérez ', name: 'luisp' }), 'Luis Pérez')
    assert.equal(await named({ name: 42, user_name: 'luisp' }), 'luisp')
    assert.equal(await named({ full_name: 'luis@sophia.test' }), null)
    assert.equal(await named({ full_name: 'LUIS@SOPHIA.TEST' }), null)
    assert.equal(await named({ full_name: 'Luis', email: 'x' }, 'Luis'), null)
    assert.equal(await named({ full_name: 'x'.repeat(61) }), null)
    assert.equal(await named({ full_name: '   ' }), null)
    assert.equal(await named('Luis'), null)
    assert.equal(await named(null), null)
  })

  it('marks an anonymous sign-in as a guest only when the verified claim says so', async () => {
    const verify = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
    assert.equal((await verify(`Bearer ${await token({ is_anonymous: true, email: '' })}`)).anonymous, true)
    assert.equal((await verify(`Bearer ${await token({ is_anonymous: true, email: '' })}`)).contact, null)
    assert.equal((await verify(`Bearer ${await token({ is_anonymous: 'true' })}`)).anonymous, false)
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

// Codex 4300538474: an unusable early name claim (an address, too long, the contact itself) is skipped, and a later
// usable one in NAME_KEYS seeds the name; only when none is usable is there no name ("A member").
describe('the provider’s name', () => {
  it('skips an unusable early claim for a usable later one, in NAME_KEYS order', () => {
    const contact = 'luis@example.com'
    assert.equal(providerName({ full_name: 'user@example.com', user_name: 'luis' }, contact), 'luis')
    assert.equal(providerName({ full_name: 'x'.repeat(61), name: 'Luis Prieto' }, contact), 'Luis Prieto')
    assert.equal(providerName({ name: 'LUIS@example.com', preferred_username: 'lprieto' }, contact), 'lprieto')
    assert.equal(providerName({ full_name: '  ', name: 7, user_name: ' Luis ' }, contact), 'Luis')
    // The first usable one wins; a later one never overrides it.
    assert.equal(providerName({ full_name: 'Ana', user_name: 'ana99' }, contact), 'Ana')
  })

  it('gives no name when no claim is usable, and never an address', () => {
    const contact = 'luis@example.com'
    assert.equal(providerName({ full_name: 'user@example.com', user_name: 'x'.repeat(61) }, contact), null)
    assert.equal(providerName({ name: contact }, contact), null)
    assert.equal(providerName({}, contact), null)
    assert.equal(providerName(null, contact), null)
  })
})
