import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { canonicalJson } from './canonical.ts'
import { bodyDigest, EnvelopeError, signEnvelope, verifyEnvelope, type EnvelopeClaims } from './envelope.ts'

const sophia = generateKeyPairSync('ed25519')
const forger = generateKeyPairSync('ed25519')
const NOW = 1_800_000_000
const body = {
  commission: { key: 'sophia-wbc02-00000000-0000-4000-8000-000000000001', title: 'Source review: x', wake: true },
}

const claims = (over: Partial<Omit<EnvelopeClaims, 'v' | 'aud' | 'iss' | 'digest'>> = {}) => ({
  op: 'commission' as const,
  companyId: 'company-a',
  paperclipProjectId: 'project-a',
  sophiaProjectId: '00000000-0000-4000-8000-0000000000aa',
  workId: '00000000-0000-4000-8000-000000000001',
  commissionKey: 'sophia-wbc02-00000000-0000-4000-8000-000000000001',
  deliveryKey: 'commission-00000000-0000-4000-8000-000000000001',
  initiator: { kind: 'member' as const, id: '00000000-0000-4000-8000-0000000000bb' },
  nonce: 'n-1',
  iat: NOW,
  exp: NOW + 120,
  ...over,
})

const options = {
  publicKey: sophia.publicKey,
  companyId: 'company-a',
  ops: new Set(['commission' as const]),
  now: NOW + 10,
}

function refusal(run: () => unknown): string {
  try {
    run()
  } catch (error: unknown) {
    if (error instanceof EnvelopeError) return error.code
    throw error
  }
  return 'accepted'
}

describe('canonical JSON', () => {
  it('orders keys at every depth and drops undefined members', () => {
    assert.equal(
      canonicalJson({ b: 1, a: { d: [2, { z: 1, y: undefined }], c: null } }),
      '{"a":{"c":null,"d":[2,{"z":1}]},"b":1}',
    )
  })
  it('refuses what JSON cannot carry', () => {
    assert.throws(() => canonicalJson({ n: Number.NaN }), TypeError)
    assert.throws(() => canonicalJson({ f: () => 1 }), TypeError)
  })
})

describe('signed envelopes', () => {
  it('verifies what Sophia signed, for the exact body, and returns its claims', () => {
    const signed = signEnvelope(claims(), body, sophia.privateKey)
    const verified = verifyEnvelope(signed, body, options)
    assert.equal(verified.workId, claims().workId)
    assert.equal(verified.digest, bodyDigest(body))
  })

  it('binds the body by value, not by its key order', () => {
    const signed = signEnvelope(claims(), { b: 2, a: 1 }, sophia.privateKey)
    assert.equal(verifyEnvelope(signed, { a: 1, b: 2 }, options).op, 'commission')
  })

  it('refuses a forged signature, changed claims and a changed body', () => {
    const forged = signEnvelope(claims(), body, forger.privateKey)
    assert.equal(
      refusal(() => verifyEnvelope(forged, body, options)),
      'bad_signature',
    )
    const signed = signEnvelope(claims(), body, sophia.privateKey)
    const tampered = Buffer.from(
      Buffer.from(signed.claims, 'base64url').toString().replace('company-a', 'company-b'),
    ).toString('base64url')
    assert.equal(
      refusal(() => verifyEnvelope({ ...signed, claims: tampered }, body, options)),
      'bad_signature',
    )
    assert.equal(
      refusal(() => verifyEnvelope(signed, { ...body, extra: 1 }, options)),
      'digest_mismatch',
    )
  })

  it('refuses another company, another operation, an expired and a future envelope', () => {
    const signed = signEnvelope(claims(), body, sophia.privateKey)
    assert.equal(
      refusal(() => verifyEnvelope(signed, body, { ...options, companyId: 'company-b' })),
      'wrong_company',
    )
    assert.equal(
      refusal(() => verifyEnvelope(signed, body, { ...options, ops: new Set(['stop' as const]) })),
      'wrong_operation',
    )
    assert.equal(
      refusal(() => verifyEnvelope(signed, body, { ...options, now: NOW + 121 + 31 })),
      'expired',
    )
    assert.equal(
      refusal(() => verifyEnvelope(signed, body, { ...options, now: NOW - 31 })),
      'not_yet_valid',
    )
  })

  it('never signs an envelope that lives longer than five minutes', () => {
    assert.equal(
      refusal(() => signEnvelope(claims({ exp: NOW + 301 }), body, sophia.privateKey)),
      'expired',
    )
    assert.equal(
      refusal(() => signEnvelope(claims({ exp: NOW }), body, sophia.privateKey)),
      'expired',
    )
  })
})
