import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LEVELS, levelWords, levelsHere, peopleVolume, volumeSettable } from './people-volume.ts'

// Each person's volume, for you alone (docs/plans/people-volume.md): a level is kept by person and put on each of
// their sounds, those playing and those to come; Off stops their sound coming, and silences it until it stops.
const sound = () => ({ volume: 1, muted: false })
const track = (kind: 'audio' | 'video') => {
  const t = {
    kind,
    isSubscribed: true,
    asked: [] as boolean[],
    setSubscribed: (on: boolean) => {
      t.asked.push(on)
      t.isSubscribed = on
    },
  }
  return t
}

describe('people volume', () => {
  it('puts a level on that person’s sounds only, those playing and those to come', () => {
    const volume = peopleVolume()
    const marco = sound()
    const lucia = sound()
    volume.add(marco, 'marco')
    volume.add(lucia, 'lucia')
    volume.set('marco', 0.5, [])
    assert.deepEqual(marco, { volume: 0.5, muted: false })
    assert.deepEqual(lucia, { volume: 1, muted: false })
    // His shared screen's sound, or his voice once he joins again: the level he was given.
    const later = sound()
    volume.add(later, 'marco')
    assert.deepEqual(later, { volume: 0.5, muted: false })
  })

  it('stops an Off person’s sound coming, leaves their video, and takes it again for a level after Off', () => {
    const volume = peopleVolume()
    const voice = track('audio')
    const camera = track('video')
    const playing = sound()
    volume.add(playing, 'marco')
    volume.set('marco', 0, [voice, camera])
    assert.deepEqual(voice.asked, [false])
    assert.deepEqual(camera.asked, [])
    // Until it stops, what still plays is silent.
    assert.deepEqual(playing, { volume: 0, muted: true })
    volume.set('marco', 0.25, [voice, camera])
    assert.deepEqual(voice.asked, [false, true])
    assert.deepEqual(camera.asked, [])
  })

  it('lets go of a track an Off person publishes, and leaves anyone else’s new track to LiveKit', () => {
    const volume = peopleVolume()
    volume.set('marco', 0, [])
    const screenSound = track('audio')
    volume.published(screenSound, 'marco')
    assert.deepEqual(screenSound.asked, [false])
    // Lucía is heard: her new voice, not taken yet, is LiveKit's to take, so nothing is asked of it here.
    const hers = { ...track('audio'), isSubscribed: false }
    volume.published(hers, 'lucia')
    assert.deepEqual(hers.asked, [])
    const camera = track('video')
    volume.published(camera, 'marco')
    assert.deepEqual(camera.asked, [])
  })

  it('lets a sound that ended go: a level set later doesn’t reach it', () => {
    const volume = peopleVolume()
    const marco = sound()
    volume.add(marco, 'marco')
    volume.remove(marco)
    volume.set('marco', 0.25, [])
    assert.deepEqual(marco, { volume: 1, muted: false })
  })

  it('offers every level where a sound’s volume can be set, and only full and Off where it can’t', () => {
    assert.deepEqual(levelsHere(true), LEVELS)
    assert.deepEqual(levelsHere(false), [1, 0])
    assert.equal(volumeSettable({ volume: 1 }), true)
    // iPhone's and iPad's sounds read 1 whatever was set.
    const fixed = {
      get volume() {
        return 1
      },
      set volume(_: number) {
        // fixed: the device's own volume rules
      },
    }
    assert.equal(volumeSettable(fixed), false)
  })

  it('says each level', () => {
    assert.deepEqual(LEVELS.map(levelWords), ['100%', '75%', '50%', '25%', 'Off'])
  })
})
