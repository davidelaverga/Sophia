import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { offlineWords, OFFLINE_UNSENT, OFFLINE_WAITS } from './online.ts'

describe('what a work-side field says offline (costuras seam #8)', () => {
  it('an empty field says, as Personal does, that words wait: nothing is called unsent', () => {
    assert.equal(offlineWords({ going: false, held: null, written: false }), 'You’re offline. Your words wait here.')
    assert.equal(OFFLINE_WAITS, 'You’re offline. Your words wait here.')
  })

  it('words written say they weren’t sent, and wait', () => {
    assert.equal(
      offlineWords({ going: false, held: null, written: true }),
      'You’re offline, so this wasn’t sent. It waits here; send it once you’re back.',
    )
    assert.equal(OFFLINE_UNSENT, 'You’re offline, so this wasn’t sent. It waits here; send it once you’re back.')
  })

  it('a message held with no reply may have landed: not confirmed, never unsent, and never written twice', () => {
    const said = offlineWords({ going: false, held: 'Ship it Friday', written: true })
    assert.equal(
      said,
      'You’re offline, so “Ship it Friday” isn’t confirmed. Send it again once you’re back; it won’t be written twice.',
    )
    assert.doesNotMatch(said ?? '', /wasn’t sent/)
  })

  it('says nothing of its own while a message is on its way: how it ends is said when it does', () => {
    assert.equal(offlineWords({ going: true, held: null, written: true }), null)
  })
})
