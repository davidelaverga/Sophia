import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { secondsToWait, sendFailure } from './auth-words.ts'

const EMAIL = 'ana@sophia.test'

describe('why a sign-in email was not sent', () => {
  it('says that new accounts are closed, by code or by the older sentence', () => {
    const closed = 'New accounts are closed on this server, so ana@sophia.test can’t sign up yet.'
    assert.equal(sendFailure({ code: 'signup_disabled', message: 'Signups not allowed', status: 422 }, EMAIL), closed)
    assert.equal(sendFailure({ code: 'otp_disabled', message: 'x', status: 422 }, EMAIL), closed)
    assert.equal(sendFailure({ message: 'Signups not allowed for this instance', status: 403 }, EMAIL), closed)
  })

  it('says how long to wait when an email was just sent', () => {
    const tooSoon = {
      code: 'over_email_send_rate_limit',
      message: 'For security purposes, you can only request this after 41 seconds.',
      status: 429,
    }
    assert.equal(sendFailure(tooSoon, EMAIL), 'An email was just sent. You can ask for another in 41 seconds.')
  })

  it('says the last email still works when the hour’s emails are used up', () => {
    const usedUp = { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded', status: 429 }
    assert.match(sendFailure(usedUp, EMAIL), /^Too many emails were sent in the last hour\. The newest one still works/)
  })

  it('tells a lost connection from a refusal', () => {
    assert.match(sendFailure({ message: 'Failed to fetch', status: 0 }, EMAIL), /^Couldn’t reach the sign-in service/)
    assert.match(sendFailure({ message: 'Failed to fetch' }, EMAIL), /^Couldn’t reach the sign-in service/)
    assert.equal(
      sendFailure({ code: 'over_request_rate_limit', message: 'x', status: 429 }, EMAIL).slice(0, 14),
      'Too many tries',
    )
  })

  it('keeps the Auth service’s own sentence for anything else', () => {
    const other = { code: 'email_address_invalid', message: 'Email address "x" is invalid', status: 400 }
    assert.equal(sendFailure(other, EMAIL), 'Email address "x" is invalid')
  })
})

describe('how long to wait, from the page’s own words', () => {
  it('reads the seconds a refusal gives, and nothing from another sentence', () => {
    assert.equal(secondsToWait('An email was just sent. You can ask for another in 41 seconds.'), 41)
    assert.equal(secondsToWait('An email was just sent. You can ask for another in 1 second.'), 1)
    assert.equal(secondsToWait('Couldn’t reach the sign-in service.'), null)
  })
})
