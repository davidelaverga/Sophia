import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { endedAtLoad, endedNotice, endedWhileIn, ENDED_WORDS } from './ended-notice.ts'

const ELSEWHERE = 'You were signed out in another tab or on another device, so this tab signed out too.'
const AWAY = 'Your sign-in on this device ended while you were away.'
const CLEARED = 'Unsent words here were cleared.'

describe('the line a sign-out this tab did not start leaves (signed-out-elsewhere.md)', () => {
  it('says each cause, and the cleared words only when some went here', () => {
    assert.equal(endedNotice('elsewhere', false), ELSEWHERE)
    assert.equal(endedNotice('elsewhere', true), `${ELSEWHERE} ${CLEARED}`)
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
  it('came from elsewhere when an account was in and this tab was not signing out', () => {
    assert.equal(endedWhileIn(true, false), 'elsewhere')
  })

  it('is this tab’s own Sign out while it is under way: nothing to say', () => {
    assert.equal(endedWhileIn(true, true), null)
  })

  it('ends no account when none was in: a guest’s session, the page still finding out, already signed out', () => {
    assert.equal(endedWhileIn(false, false), null)
    assert.equal(endedWhileIn(false, true), null)
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
