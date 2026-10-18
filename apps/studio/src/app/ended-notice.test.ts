import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { endedAtLoad, endedNotice, endedWhileIn, ENDED_WORDS } from './ended-notice.ts'

const ELSEWHERE = 'You were signed out in another tab or on another device, so this tab signed out too.'
const REFUSED = 'Your sign-in on this device ended, so this tab signed out.'
const AWAY = 'Your sign-in on this device ended while you were away.'
const CLEARED = 'Unsent words here were cleared.'

describe('the line a sign-out this tab did not start leaves (signed-out-elsewhere.md)', () => {
  it('says each cause, and the cleared words only when some went here', () => {
    assert.equal(endedNotice('elsewhere', false), ELSEWHERE)
    assert.equal(endedNotice('elsewhere', true), `${ELSEWHERE} ${CLEARED}`)
    assert.equal(endedNotice('refused', false), REFUSED)
    assert.equal(endedNotice('refused', true), `${REFUSED} ${CLEARED}`)
    assert.equal(endedNotice('away', false), AWAY)
    assert.equal(endedNotice('away', true), `${AWAY} ${CLEARED}`)
  })

  it('waits for the clearing to answer, and says nothing without a cause, words cleared or not', () => {
    assert.equal(endedNotice('elsewhere', undefined), null)
    assert.equal(endedNotice('away', undefined), null)
    assert.equal(endedNotice(undefined, true), null)
    assert.equal(endedNotice(undefined, false), null)
  })

  it('never names an account: the device may be shared', () => {
    for (const line of Object.values(ENDED_WORDS)) assert.doesNotMatch(line, /@|account/)
  })
})

describe('a sign-out heard while the tab was open', () => {
  it('came from another tab when an account was in, this tab was not signing out and no refusal came before it', () => {
    assert.equal(endedWhileIn(true, false, null), 'elsewhere')
  })

  it('after this tab’s refresh was refused, was signed out elsewhere only when the session is gone from Auth', () => {
    // «Sign out of all devices» (or of the others) elsewhere: the Auth service no longer has the session.
    assert.equal(endedWhileIn(true, false, 'refresh_token_not_found'), 'elsewhere')
    assert.equal(endedWhileIn(true, false, 'session_not_found'), 'elsewhere')
  })

  it('after any other refusal ended here, and blames no one elsewhere (review round)', () => {
    // A refresh token used twice (an answer lost on the way), an expired session, a rate limit, a barred account, none.
    for (const code of ['refresh_token_already_used', 'session_expired', 'over_request_rate_limit', 'user_banned', ''])
      assert.equal(endedWhileIn(true, false, code), 'refused', code)
  })

  it('is this tab’s own Sign out while it is under way: nothing to say, refused or not', () => {
    assert.equal(endedWhileIn(true, true, null), null)
    assert.equal(endedWhileIn(true, true, 'refresh_token_already_used'), null)
  })

  it('ends no account when none was in: a guest’s session, the page still finding out, already signed out', () => {
    assert.equal(endedWhileIn(false, false, null), null)
    assert.equal(endedWhileIn(false, true, null), null)
    assert.equal(endedWhileIn(false, false, 'refresh_token_already_used'), null)
  })
})

describe('a sign-in that ended while the page was closed', () => {
  it('is a session this device kept for an account, gone once the client checked it, with nobody in', () => {
    assert.equal(endedAtLoad({ before: true, after: false }, false), 'away')
  })

  it('is not one still kept: a refresh that failed on the network ended nothing', () => {
    assert.equal(endedAtLoad({ before: true, after: true }, false), null)
  })

  it('is not a first visit, nor a load that signed in', () => {
    assert.equal(endedAtLoad({ before: false, after: false }, false), null)
    assert.equal(endedAtLoad({ before: true, after: false }, true), null)
    assert.equal(endedAtLoad({ before: true, after: true }, true), null)
  })
})
