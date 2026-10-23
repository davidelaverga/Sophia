import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { incomingCameras } from './incoming-cameras.ts'

// «Show others’ cameras» (docs/plans/incoming-video.md, livekit-room-follow-ups.md): the switch's latest choice is what
// LiveKit is asked for, whatever has or hasn't arrived yet.

/**
 * A publication as LiveKit's (RemoteTrackPublication, livekit-client 2.22.3): what was asked changes the moment
 * setSubscribed is called (auto-subscribe asks for a new one on its own); its track comes or goes later, when the server
 * answers. isSubscribed is «asked and here», isDesired «asked».
 */
const publication = (source: 'camera' | 'screen_share' = 'camera', here = true) => {
  const pub = {
    source,
    subscribed: true,
    here,
    asked: [] as boolean[],
    get isSubscribed() {
      return pub.subscribed && pub.here
    },
    get isDesired() {
      return pub.subscribed
    },
    setSubscribed: (on: boolean) => {
      pub.asked.push(on)
      pub.subscribed = on
    },
    /** The server's answer: the track arrives or leaves. */
    settle: () => {
      pub.here = pub.subscribed
    },
  }
  return pub
}

const cameras = (...pubs: ReturnType<typeof publication>[]) => {
  let changes = 0
  const switched = incomingCameras(
    () => pubs,
    () => {
      changes += 1
    },
  )
  return { switched, changes: () => changes }
}

describe('others’ cameras', () => {
  it('Off lets each camera go and On takes them back; a shared screen always comes', () => {
    const camera = publication()
    const screen = publication('screen_share')
    const { switched, changes } = cameras(camera, screen)
    switched.set(false)
    camera.settle()
    switched.set(true)
    assert.deepEqual(camera.asked, [false, true])
    assert.deepEqual(screen.asked, [])
    assert.equal(changes(), 2)
  })

  it('On before the cameras have gone takes them back (Codex’s order on #424)', () => {
    const camera = publication()
    const { switched } = cameras(camera)
    switched.set(false)
    // Still here: LiveKit hasn't answered Off yet.
    switched.set(true)
    assert.deepEqual(camera.asked, [false, true])
  })

  it('Off before the cameras have come back lets them go (the inverse order, Codex P2 on #424)', () => {
    const camera = publication()
    const { switched } = cameras(camera)
    switched.set(false)
    camera.settle()
    switched.set(true)
    // Asked for, not here yet: Off must still ask LiveKit to let it go.
    switched.set(false)
    assert.deepEqual(camera.asked, [false, true, false])
  })

  it('a camera published while Off isn’t taken, though LiveKit asked for it; one published while On is LiveKit’s', () => {
    const { switched } = cameras()
    switched.set(false)
    // LiveKit's auto-subscribe has asked for it; its track hasn't come.
    const late = publication('camera', false)
    switched.published(late)
    assert.deepEqual(late.asked, [false])
    switched.set(true)
    const onTime = publication('camera', false)
    switched.published(onTime)
    assert.deepEqual(onTime.asked, [])
  })
})
