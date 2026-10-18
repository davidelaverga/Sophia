import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { audioElements } from './audio-elements.ts'

// The room's audio elements leave the page with their track (docs/plans/livekit-room-follow-ups.md), in LiveKit's own
// order: the track lets go of its elements first, then the room hears it is gone.

interface Audio {
  volume: number
  muted: boolean
  remove: () => void
}

/**
 * A page and LiveKit's tracks on it (Track.attach and detach, livekit-client 2.22.3). A detached audio element goes to
 * a pool, unless one already waits there off the page; attach hands back the first off the page before making one. A
 * reused element keeps its volume: attach sets muted only.
 */
const world = () => {
  const page = new Set<Audio>()
  const pool: Audio[] = []
  const recycle = (el: Audio) => {
    if (!pool.some((e) => !page.has(e))) pool.push(el)
  }
  const make = (): Audio => {
    const el: Audio = { volume: 1, muted: false, remove: () => page.delete(el) }
    return el
  }
  const track = () => {
    let attached: Audio[] = []
    const attach = () => {
      const free = pool.findIndex((e) => !page.has(e))
      const el = free < 0 ? make() : (pool.splice(free, 1)[0] ?? make())
      el.muted = false
      attached.push(el)
      return el
    }
    function detach(): Audio[]
    function detach(el: Audio): Audio
    function detach(el?: Audio): Audio | Audio[] {
      if (el) {
        if (attached.includes(el)) recycle(el)
        attached = attached.filter((e) => e !== el)
        return el
      }
      const all = attached
      all.forEach(recycle)
      attached = []
      return all
    }
    /** The server took it away: LiveKit's publication detaches it (setTrack) before it emits TrackUnsubscribed. */
    const unsubscribe = () => detach()
    return { attach, detach, unsubscribe, attached: () => attached }
  }
  const elements = audioElements<ReturnType<typeof track>, Audio>((el) => page.add(el))
  return { page, track, elements }
}

describe('the room’s audio elements', () => {
  it('Sophia’s element leaves the page with her track, though LiveKit let it go first', () => {
    const { page, track, elements } = world()
    const voice = track()
    const el = elements.play(voice, 'sophia')
    assert.deepEqual([...page], [el])
    voice.unsubscribe()
    // Returned, so people-volume forgets it too.
    assert.deepEqual(elements.stop(voice), [el])
    assert.equal(page.size, 0)
  })

  it('a member’s element leaves with their track, and no one else’s does', () => {
    const { page, track, elements } = world()
    const sophia = track()
    const marco = track()
    const hers = elements.play(sophia, 'sophia')
    elements.play(marco, 'member')
    marco.unsubscribe()
    elements.stop(marco)
    assert.deepEqual([...page], [hers])
  })

  it('taken out for text mode, the element leaves the page and LiveKit lets it go', () => {
    const { page, track, elements } = world()
    const voice = track()
    elements.play(voice, 'sophia')
    elements.stop(voice)
    assert.equal(page.size, 0)
    assert.deepEqual(voice.attached(), [])
  })

  it('an element LiveKit hands back plays at full, whatever level its last voice had', () => {
    const { track, elements } = world()
    const marco = track()
    const his = elements.play(marco, 'member')
    // Off, as people-volume puts it, then let go at once.
    his.volume = 0
    his.muted = true
    elements.drop(his)
    const hers = elements.play(track(), 'sophia')
    assert.equal(hers, his, 'LiveKit reuses the element')
    assert.deepEqual({ volume: hers.volume, muted: hers.muted }, { volume: 1, muted: false })
  })

  it('the call’s end removes every element this room put on the page', () => {
    const { page, track, elements } = world()
    elements.play(track(), 'sophia')
    elements.play(track(), 'member')
    elements.clear()
    assert.equal(page.size, 0)
  })
})
