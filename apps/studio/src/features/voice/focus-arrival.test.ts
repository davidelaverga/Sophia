import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { forgetShownHere, markShownHere, SHOWN_HERE_MS, takeShownHere } from './focus-arrival.ts'

describe('the show’s focus marker', () => {
  it('is for the version shown from here only, and is taken once', () => {
    markShownHere('v2')
    assert.equal(takeShownHere('v1'), false) // another report arriving first doesn't take it
    assert.equal(takeShownHere('v2'), true)
    assert.equal(takeShownHere('v2'), false)
  })

  it('is forgotten on its own refusal only, and a later show replaces it', () => {
    markShownHere('v1')
    forgetShownHere('v1')
    assert.equal(takeShownHere('v1'), false)
    markShownHere('v3')
    forgetShownHere('v1') // an earlier show's refusal leaves the newer one
    assert.equal(takeShownHere('v3'), true)
  })

  it('expires: a show with no reply that never reached the stage takes nothing a minute on', () => {
    markShownHere('v2', 0)
    assert.equal(takeShownHere('v2', SHOWN_HERE_MS + 1), false)
    markShownHere('v2', 0)
    assert.equal(takeShownHere('v2', SHOWN_HERE_MS), true)
  })
})
