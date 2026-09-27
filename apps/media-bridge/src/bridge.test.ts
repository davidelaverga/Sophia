// The assignment loop against LABELLED FAKES (no LiveKit, no Google): one session per live exchange.
import type { MediaAssignment } from '@sophia/contracts'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MediaBridge } from './bridge.ts'
import type { LiveLink } from './live-session.ts'
import type { RoomEvents, RoomLink } from './rtc.ts'
import type { MediaService } from './service.ts'

const assignment = (exchangeId: string, over: Partial<MediaAssignment> = {}): MediaAssignment => ({
  exchangeId,
  projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  roomId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  state: 'open',
  pauseReason: null,
  inputEpoch: 1,
  inputActorId: null,
  playbackEpoch: 1,
  observationEpoch: 1,
  allowVision: false,
  looking: null,
  roomRevision: 1,
  quiesceRequestId: null,
  roomToken: { serverUrl: 'ws://fake', token: 't', expiresAt: '2026-09-25T00:10:00Z' },
  results: [],
  ...over,
})

const E1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const E2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function harness() {
  const log: string[] = []
  const roomEvents: RoomEvents[] = []
  const service: MediaService = {
    assignments: () => Promise.reject(new Error('unused')),
    presence: () => Promise.resolve(),
    ackQuiesce: () => Promise.resolve(),
    holder: () => Promise.resolve(),
    announced: () => Promise.resolve(),
    toolCall: () => Promise.reject(new Error('unused')),
  }
  const bridge = new MediaBridge({
    service,
    joinRoom: async (_access, events) => {
      await Promise.resolve()
      roomEvents.push(events)
      log.push('join')
      const room: RoomLink = {
        people: () => [],
        play: () => Promise.resolve(),
        clearPlayback: () => undefined,
        watch: () => undefined,
        setState: () => Promise.resolve(),
        close: async () => {
          await Promise.resolve()
          log.push('leave')
        },
      }
      return room
    },
    connectLive: async () => {
      await Promise.resolve()
      const live: LiveLink = {
        sendAudio: () => undefined,
        sendAudioStreamEnd: () => undefined,
        sendFrame: () => undefined,
        sendToolResponses: () => undefined,
        sendNotice: () => undefined,
        close: () => undefined,
      }
      return live
    },
    apiKey: 'fake',
    model: 'fake',
    bridgeInstanceId: 'bridge-test',
    now: Date.now,
    log: (event) => log.push(event),
    every: () => () => undefined,
  })
  return { bridge, log, roomEvents }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

describe('media bridge assignment loop', () => {
  it('keeps one session per live exchange, updates it, and closes an ended one before the room’s next joins', async () => {
    const { bridge, log } = harness()
    await bridge.apply([assignment(E1)])
    await settle()
    assert.ok(bridge.session(E1))
    await bridge.apply([assignment(E1, { playbackEpoch: 2 })])
    assert.equal(log.filter((l) => l === 'join').length, 1, 'an update does not rejoin')
    await bridge.apply([assignment(E2)])
    await settle()
    assert.equal(bridge.session(E1), undefined)
    assert.ok(bridge.session(E2))
    assert.deepEqual(
      log.filter((l) => l === 'join' || l === 'leave'),
      ['join', 'leave', 'join'],
    )
    await bridge.stop()
  })

  it('replaces a session whose room LiveKit gave up on', async () => {
    const { bridge, roomEvents, log } = harness()
    await bridge.apply([assignment(E1)])
    await settle()
    roomEvents[0]?.connection('disconnected', 'livekit: 1')
    await settle()
    assert.ok(log.includes('session.lost'))
    await bridge.apply([assignment(E1)])
    await settle()
    assert.equal(log.filter((l) => l === 'join').length, 2)
    await bridge.stop()
  })
})
