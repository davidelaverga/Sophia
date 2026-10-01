import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CHECK_WORDS, checked, type CheckError } from './unlock-check.ts'

const ME = 'a1b2'
const answer = (user: string | null, error: CheckError | null = null) => ({ user, error })
const failed = (failure: string) => ({ failed: failure })

describe('what a check of the padlock comes to', () => {
  it('opens only for the signed-in person; anyone else is another account', () => {
    assert.equal(checked('passkey', answer(ME), ME), 'confirmed')
    assert.equal(checked('code', answer(ME), ME), 'confirmed')
    assert.equal(checked('passkey', answer('c3d4'), ME), 'other_account')
    assert.equal(checked('code', answer('c3d4'), ME), 'other_account')
  })

  it('never says another account when nobody came back, or when the person can’t be read', () => {
    assert.deepEqual(checked('code', answer(null), ME), failed(CHECK_WORDS.notConfirmed))
    assert.deepEqual(checked('passkey', answer(ME), null), failed(CHECK_WORDS.notConfirmed))
  })

  it('waits when the passkey prompt was closed, by the person or by the sheet', () => {
    assert.equal(checked('passkey', answer(null, { name: 'NotAllowedError' }), ME), 'dismissed')
    assert.equal(
      checked('passkey', answer(null, { name: 'AbortError', code: 'ERROR_CEREMONY_ABORTED' }), ME),
      'dismissed',
    )
  })

  it('tells a lost or slow connection from a refusal', () => {
    const lost = { name: 'AuthRetryableFetchError', status: 0 }
    assert.deepEqual(checked('passkey', answer(null, lost), ME), failed(CHECK_WORDS.network))
    assert.deepEqual(checked('code', answer(null, lost), ME), failed(CHECK_WORDS.network))
    const down = { name: 'AuthRetryableFetchError', status: 503 }
    assert.deepEqual(checked('code', answer(null, down), ME), failed(CHECK_WORDS.network))
  })

  it('says what was refused: the code, too many tries, a passkey prompt left too long, the passkey', () => {
    const wrong = { name: 'AuthApiError', code: 'otp_expired', status: 403 }
    assert.deepEqual(checked('code', answer(null, wrong), ME), failed(CHECK_WORDS.code))
    const tooMany = { name: 'AuthApiError', code: 'over_request_rate_limit', status: 429 }
    assert.deepEqual(checked('code', answer(null, tooMany), ME), failed(CHECK_WORDS.tooMany))
    const late = { name: 'AuthApiError', code: 'webauthn_challenge_expired', status: 400 }
    assert.deepEqual(checked('passkey', answer(null, late), ME), failed(CHECK_WORDS.expired))
    assert.deepEqual(
      checked('passkey', answer(null, { name: 'AuthApiError', status: 400 }), ME),
      failed(CHECK_WORDS.passkey),
    )
    const elsewhere = { name: 'SecurityError', code: 'ERROR_INVALID_RP_ID' }
    assert.deepEqual(checked('passkey', answer(null, elsewhere), ME), failed(CHECK_WORDS.passkey))
  })
})
