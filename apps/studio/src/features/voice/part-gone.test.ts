import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../../api/client.ts'
import { noteRole } from './call-end.ts'
import { joinMessage, partGone, refusalOf, STALE_PART, type Heard } from './part-gone.ts'

// A part of the call gone after a deploy (docs/plans/stale-part-call.md, costuras.md seam #4): Vite says a part is gone
// (`vite:preloadError`, its error as the payload) and rethrows that same error. That error, and only that, is said as
// an older version with Reload; every other failure keeps its words, even once the version probe told of a deploy.

/** As Chromium words it for a chunk the host no longer has (observed on a production build). */
const gone = () => new TypeError('Failed to fetch dynamically imported module: http://127.0.0.1/assets/livekit-room.js')

/** What the page heard: nothing, Vite's word with its payload, or only the probe's (no payload). */
const nothing: Heard = { heard: () => false, payload: () => null }
const vite = (payload: unknown): Heard => ({ heard: () => true, payload: () => payload })
const probeOnly: Heard = { heard: () => true, payload: () => null }

describe('a part of the call gone after a deploy', () => {
  it('is the very error Vite said was gone', () => {
    const err = gone()
    assert.equal(partGone(err, vite(err)), true)
    assert.equal(partGone(gone(), nothing), false, 'no word of a new version')
  })

  it('a module the browser couldn’t fetch, in its words, counts once a new version was heard (the browsers’ wording)', () => {
    assert.equal(partGone(gone(), probeOnly), true)
    assert.equal(partGone(new TypeError('error loading dynamically imported module: …/a.js'), probeOnly), true)
    assert.equal(partGone(new TypeError('Importing a module script failed.'), probeOnly), true)
  })

  // Review P3 (2026-10-22): the probe tells of every deploy, so a TypeError of another kind must keep its words.
  it('a plain TypeError after the probe told of a deploy is no gone part', () => {
    assert.equal(partGone(new TypeError('Failed to fetch'), probeOnly), false)
    assert.equal(
      joinMessage(new TypeError('Failed to fetch'), probeOnly),
      'Couldn’t connect to the room. Check your connection and try again.',
    )
    assert.equal(refusalOf(new TypeError('Failed to fetch'), probeOnly), 'refused')
  })

  it('a refusal, LiveKit’s own failure or the API’s answer is none, whatever was heard', () => {
    for (const heard of [nothing, probeOnly, vite(gone())]) {
      assert.equal(partGone(new DOMException('Permission denied', 'NotAllowedError'), heard), false)
      assert.equal(partGone(new Error('could not establish signal connection'), heard), false)
      assert.equal(partGone(new ApiError(503, 'unavailable', 'Down', 'safe_read'), heard), false)
    }
  })

  it('a join whose part is gone says the tab is on an older version, never the connection words', () => {
    const err = gone()
    assert.equal(joinMessage(err, vite(err)), STALE_PART)
    assert.equal(STALE_PART, 'This tab is on an older version of Sophia, so the call couldn’t load.')
  })

  it('any other failed join keeps its words, heard or not', () => {
    for (const heard of [nothing, probeOnly]) {
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
      joinMessage(gone(), nothing),
      'Couldn’t connect to the room. Check your connection and try again.',
      'no word of a new version',
    )
  })

  it('a device list refused because its part is gone reads stale; a browser’s refusal still reads refused', () => {
    const err = gone()
    assert.equal(refusalOf(err, vite(err)), 'stale')
    assert.equal(refusalOf(new DOMException('Permission denied', 'NotAllowedError'), vite(err)), 'refused')
    assert.equal(refusalOf(gone(), nothing), 'refused')
  })

  it('is said politely: the notice at the top already said it once', () => {
    assert.equal(noteRole(STALE_PART), 'status')
  })
})
