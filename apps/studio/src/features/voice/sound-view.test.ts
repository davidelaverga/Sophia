// The call's sound, blocked by the browser (docs/plans/sound-blocked-others.md): the dock says it once the call is live
// with someone else in it, whoever speaks, and holds the one Allow audio while it does.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RoomParticipant } from './room-view.ts'
import { SOUND_BLOCKED, soundView, type SoundRoom } from './sound-view.ts'

const person = (name: string, local = false): RoomParticipant => ({
  identity: `id-${name}`,
  name,
  speaking: false,
  micOn: true,
  cameraOn: false,
  screenOn: false,
  local,
  standing: 'editor',
})

const ME = person('Luis', true)
const MARCO = person('Marco')

const room = (over: Partial<SoundRoom> = {}): SoundRoom => ({
  status: 'live',
  audioBlocked: true,
  participants: [ME, MARCO],
  soundNoticeAway: false,
  ...over,
})

const quiet = { needsAudio: false }
const sheSpeaks = { needsAudio: true }

describe('the call’s sound', () => {
  it('blocked, live, with someone else in the call: the dock says it, whoever speaks', () => {
    assert.deepEqual(soundView(room(), quiet), { notice: true, sophiaAllow: false })
    const speaking = { ...MARCO, speaking: true }
    assert.equal(soundView(room({ participants: [ME, speaking] }), quiet).notice, true)
    assert.equal(SOUND_BLOCKED, 'This browser blocked the call’s sound.')
  })

  it('one Allow audio, never two: while the dock says it, Sophia speaking into the block has no pill of her own', () => {
    assert.deepEqual(soundView(room(), sheSpeaks), { notice: true, sophiaAllow: false })
  })

  it('alone in the call there is nothing to hear: no line, and her own pill while she speaks into the block', () => {
    assert.deepEqual(soundView(room({ participants: [ME] }), quiet), { notice: false, sophiaAllow: false })
    assert.deepEqual(soundView(room({ participants: [ME] }), sheSpeaks), { notice: false, sophiaAllow: true })
  })

  it('the sound allowed: nothing to say', () => {
    assert.deepEqual(soundView(room({ audioBlocked: false }), quiet), { notice: false, sophiaAllow: false })
  })

  it('put away in this call, it stays away, whoever speaks; her own pill comes back for her case alone', () => {
    const away = room({ soundNoticeAway: true, participants: [ME, { ...MARCO, speaking: true }] })
    assert.deepEqual(soundView(away, quiet), { notice: false, sophiaAllow: false })
    assert.deepEqual(soundView(away, sheSpeaks), { notice: false, sophiaAllow: true })
  })

  it('the link coming back: the block is this browser’s own, so the line stays', () => {
    assert.equal(soundView(room({ status: 'reconnecting' }), quiet).notice, true)
  })

  it('out of the call it says nothing: before joining, joining, or after a failed join', () => {
    for (const status of ['idle', 'joining', 'failed'] as const) {
      assert.deepEqual(soundView(room({ status }), quiet), { notice: false, sophiaAllow: false }, status)
    }
  })
})
