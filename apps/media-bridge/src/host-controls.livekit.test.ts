// The API's host controls (A24, docs/plans/host-controls.md) against a REAL LiveKit server (the pinned image; `pnpm
// test:livekit`), with real rtc-node participants. It lives beside the bridge's LiveKit test, which already joins
// people this way and imports the API's LiveKit module. Skipped unless SOPHIA_TEST_LIVEKIT_URL names the server.
import {
  AudioSource,
  dispose,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node'
import { RoomServiceClient, TrackSource as ServerSource } from 'livekit-server-sdk'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, describe, it } from 'node:test'
import {
  issueRoomToken,
  memberInRoom,
  muteMicrophone,
  removeFromCall,
  type RoomStanding,
} from '../../api/src/livekit.ts'

const URL = process.env.SOPHIA_TEST_LIVEKIT_URL
const server = {
  url: URL ?? '',
  apiKey: process.env.SOPHIA_TEST_LIVEKIT_KEY ?? 'devkey',
  apiSecret: process.env.SOPHIA_TEST_LIVEKIT_SECRET ?? 'dev-only-livekit-secret-for-this-machine',
}

/** Someone in the call as the API lets them in, publishing a microphone. */
async function joins(room: string, identity: string, standing: RoomStanding) {
  const { token } = await issueRoomToken(server, { roomId: room, identity, name: null, canPublish: true, standing })
  const r = new Room()
  const left = new Promise<void>((resolve) => r.once(RoomEvent.Disconnected, () => resolve()))
  await r.connect(server.url, token, { autoSubscribe: false, dynacast: false })
  await r.localParticipant?.publishTrack(
    LocalAudioTrack.createAudioTrack('mic', new AudioSource(48_000, 1)),
    new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
  )
  return { room: r, left }
}

const within = (what: string, done: Promise<unknown>, ms = 10_000) =>
  Promise.race([done, new Promise((_, reject) => setTimeout(() => reject(new Error(what)), ms))])

describe(
  'host controls against a real LiveKit server',
  { skip: URL ? false : 'SOPHIA_TEST_LIVEKIT_URL not set' },
  () => {
    after(async () => {
      await dispose()
    })

    it('mutes a member’s microphone, takes a member out, and knows a guest or someone absent is no member here', async () => {
      const roomId = randomUUID()
      const member = randomUUID()
      const guest = randomUUID()
      const them = await joins(roomId, member, { role: 'editor' })
      const visitor = await joins(roomId, guest, { guest: true })
      try {
        assert.equal(await memberInRoom(server, roomId, member), true)
        assert.equal(await memberInRoom(server, roomId, guest), false, 'a guest leaves by the door')
        assert.equal(await memberInRoom(server, roomId, randomUUID()), false, 'nobody of that name is in the call')
        assert.equal(await muteMicrophone(server, roomId, member), true)
        const rooms = new RoomServiceClient(server.url.replace(/^ws/, 'http'), server.apiKey, server.apiSecret)
        const mic = (await rooms.getParticipant(roomId, member)).tracks.find(
          (t) => t.source === ServerSource.MICROPHONE,
        )
        assert.equal(mic?.muted, true)
        assert.equal(await muteMicrophone(server, roomId, member), true, 'muted again, nothing changes')
        await removeFromCall(server, roomId, member)
        await within('the member was not disconnected', them.left)
        assert.equal(await memberInRoom(server, roomId, member), false)
      } finally {
        await them.room.disconnect().catch(() => undefined)
        await visitor.room.disconnect().catch(() => undefined)
      }
    })
  },
)
