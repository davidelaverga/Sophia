import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../../api/client.ts'
import { noteRole } from './call-end.ts'
import { joinMessage, partGone, refusalOf, STALE_PART } from './part-gone.ts'

// A part of the call gone after a deploy (docs/plans/stale-part-call.md, costuras.md seam #4): the browser rejects the
// import with its own TypeError right after Vite said a part is gone (`vite:preloadError`, so `heard`). That, and only
// that, is said as an older version with Reload; every other failure keeps its words.

/** As Chromium words it for a chunk the host no longer has (observed on a production build). */
const gone = () => new TypeError('Failed to fetch dynamically imported module: http://127.0.0.1/assets/livekit-room.js')

describe('a part of the call gone after a deploy', () => {
  it('is a TypeError of the browser’s while a new version has been heard; nothing else is', () => {
    assert.equal(partGone(gone(), true), true)
    assert.equal(partGone(gone(), false), false, 'no word of a new version: a TypeError of its own')
    assert.equal(partGone(new DOMException('Permission denied', 'NotAllowedError'), true), false, 'a refusal')
    assert.equal(partGone(new Error('could not establish signal connection'), true), false, 'LiveKit’s own')
    assert.equal(partGone(new ApiError(503, 'unavailable', 'Down', 'safe_read'), true), false, 'the API’s')
  })

  it('a join whose part is gone says the tab is on an older version, never the connection words', () => {
    assert.equal(joinMessage(gone(), true), STALE_PART)
    assert.equal(STALE_PART, 'This tab is on an older version of Sophia, so the call couldn’t load.')
  })

  it('any other failed join keeps its words, heard or not', () => {
    for (const heard of [true, false]) {
      assert.equal(
        joinMessage(new ApiError(403, 'forbidden', 'You aren’t in this project.', 'never'), heard),
        'You aren’t in this project.',
      )
      assert.equal(
        joinMessage(new ApiError(503, 'unavailable', 'Down', 'safe_read'), heard),
        'The room isn’t available right now. Try again in a moment.',
      )
      assert.equal(
        joinMessage(new Error('could not establish signal connection'), heard),
        'Couldn’t connect to the room. Check your connection and try again.',
      )
    }
    assert.equal(
      joinMessage(gone(), false),
      'Couldn’t connect to the room. Check your connection and try again.',
      'no word of a new version',
    )
  })

  it('a device list refused because its part is gone reads stale; a browser’s refusal still reads refused', () => {
    assert.equal(refusalOf(gone(), true), 'stale')
    assert.equal(refusalOf(new DOMException('Permission denied', 'NotAllowedError'), true), 'refused')
    assert.equal(refusalOf(gone(), false), 'refused')
  })

  it('is said politely: the notice at the top already said it once', () => {
    assert.equal(noteRole(STALE_PART), 'status')
  })
})
