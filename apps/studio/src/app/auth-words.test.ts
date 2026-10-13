import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { secondsToWait, SENT_HOW, SENT_TO, sendFailure, SIGN_IN_LEDE, waitAfter } from './auth-words.ts'

const EMAIL = 'ana@sophia.test'

describe('what was sent, said in a line and a note (docs/plans/signin-hierarchy.md)', () => {
  it('names what went where, then how to use it: the link in this browser, or the code here', () => {
    assert.equal(SENT_TO, 'We sent a link and a code to')
    assert.equal(SENT_HOW, 'Open the link in this browser, or type the code here.')
    // One short line each: the note fits the narrowest column at the label size.
    assert.ok(SENT_HOW.length <= 56, SENT_HOW)
  })
})

describe('what opens, said at the door', () => {
  it('is the guest door’s sentence, of Sophia and your team: one line, a full stop, no project named', () => {
    assert.equal(SIGN_IN_LEDE, 'Where your team and Sophia think together.')
    assert.match(SIGN_IN_LEDE, /^Where your team and Sophia think together\.$/)
    assert.ok(!SIGN_IN_LEDE.includes('“'), 'no project is quoted before one exists')
  })
})

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

describe('how long to wait after a refusal', () => {
  // The sentences are sendFailure's own, so a change in its words can't silently stop the wait.
  const said = (code: string, message: string, status = 429) => sendFailure({ code, message, status }, EMAIL)
  it('takes the wait it gives; Auth’s window when it says too many and gives none; nothing for anything else', () => {
    const soon = said(
      'over_email_send_rate_limit',
      'For security purposes, you can only request this after 17 seconds.',
    )
    assert.equal(waitAfter(soon, 60), 17)
    assert.equal(waitAfter(said('over_email_send_rate_limit', 'email rate limit exceeded'), 60), 60)
    assert.equal(waitAfter(said('over_request_rate_limit', 'x'), 60), 60)
    assert.equal(waitAfter(sendFailure({ message: 'Failed to fetch', status: 0 }, EMAIL), 60), 0)
  })
})
